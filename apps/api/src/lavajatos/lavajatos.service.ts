import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import sharp from "sharp";
import { StatusAgendamento } from "@lavajato-app/shared";
import { PrismaService } from "../prisma/prisma.service";
import { MercadoPagoService } from "../pagamentos/mercadopago.service";
import { ConfiguracoesService } from "../configuracoes/configuracoes.service";
import { estaForaDaCarencia } from "../assinaturas/assinatura-status.util";
import { UpdateLavaJatoDto } from "./dto/update-lavajato.dto";
import { CreateAvaliacaoDto } from "./dto/create-avaliacao.dto";
import { camposEndereco } from "../common/endereco.util";

// Campos seguros para expor sem autenticação (busca de proximidade, tela
// pública "sobre o lava jato" etc). Nunca inclua e-mail/telefone de usuários
// nem dados de assinatura/faturamento aqui. mercadoPagoPublicKey é a chave
// PÚBLICA usada pra tokenizar cartão direto no aparelho do cliente (ver
// CartaoScreen) — ao contrário do access token, é seguro expor. Vem do banco
// só por compatibilidade; na prática quase sempre é substituída pela chave
// da própria aplicação (ver comChavePublicaResolvida abaixo).
const SELECT_PUBLICO = {
  id: true,
  nome: true,
  endereco: true,
  telefone: true,
  latitude: true,
  longitude: true,
  logoUrl: true,
  // Percentuais por porte de veículo — o app do cliente precisa pra mostrar
  // preço e calcular a duração antes de agendar (ver precoParaPorte/shared).
  ajustePrecoPorte: true,
  ajusteDuracaoPorte: true,
  notaMedia: true,
  totalAvaliacoes: true,
  mercadoPagoPublicKey: true,
} as const;

// Pra quem já tem acesso ao lava jato (dono, funcionário dela, ou SAAS_ADMIN —
// ver LavaJatosController.garantirAcesso): em cima do que já é público,
// inclui os campos separados do endereço (pra reabrir o formulário de edição
// já preenchido — ver EditarPerfilScreen) e o status (não o segredo) da
// conexão com o Mercado Pago. NUNCA inclua mercadoPagoAccessToken/
// mercadoPagoRefreshToken aqui nem troque isso por um `include` genérico.
const SELECT_DETALHE = {
  ...SELECT_PUBLICO,
  cep: true,
  logradouro: true,
  numero: true,
  complemento: true,
  bairro: true,
  cidade: true,
  uf: true,
  mercadoPagoUserId: true,
  mercadoPagoConectadoEm: true,
  criadoEm: true,
} as const;

// Tamanho máximo aceito pro arquivo de logo enviado (antes de comprimir).
const TAMANHO_MAXIMO_LOGO_BYTES = 5 * 1024 * 1024; // 5MB

@Injectable()
export class LavaJatosService {
  constructor(
    private prisma: PrismaService,
    private mercadoPago: MercadoPagoService,
    private configuracoes: ConfiguracoesService,
  ) {}

  // O Mercado Pago nem sempre devolve a public_key da conta conectada no
  // OAuth (ver MercadoPagoService.trocarCodigoPorToken) — como a tokenização
  // de cartão não depende de quem vai receber o dinheiro, cai pra chave da
  // própria aplicação (MERCADOPAGO_PUBLIC_KEY) sempre que a do lava jato não
  // veio, em vez de deixar o cliente sem poder pagar com cartão.
  private comChavePublicaResolvida<T extends { mercadoPagoPublicKey: string | null }>(lavaJato: T): T {
    return { ...lavaJato, mercadoPagoPublicKey: lavaJato.mercadoPagoPublicKey ?? this.mercadoPago.publicKeyPlataforma };
  }

  // Usado pelo painel SaaS (SAAS_ADMIN) para listar todas os lava jatos assinantes.
  listarTodas() {
    return this.prisma.lavaJato.findMany({
      include: { assinatura: { include: { plano: true } }, funcionarios: true },
      orderBy: { criadoEm: "desc" },
    });
  }

  async buscarPorId(id: string) {
    // Select explícito (não `include` genérico) — ver comentário em
    // SELECT_DETALHE: esse endpoint é alcançável por qualquer funcionário da
    // próprio lava jato, não só o dono, então nunca pode vazar os segredos
    // do Mercado Pago.
    const lavaJato = await this.prisma.lavaJato.findUnique({
      where: { id },
      select: {
        ...SELECT_DETALHE,
        assinatura: { include: { plano: true, faturas: { orderBy: { vencimentoEm: "desc" }, take: 12 } } },
        funcionarios: { include: { usuario: { select: { id: true, nome: true, email: true } } } },
      },
    });
    if (!lavaJato) throw new NotFoundException("Lava jato não encontrada.");
    return lavaJato;
  }

  // Público: dados mínimos para a Home do app do cliente (nome, endereço, estrelas).
  async buscarInfoPublica(id: string) {
    const lavaJato = await this.prisma.lavaJato.findUnique({ where: { id }, select: SELECT_PUBLICO });
    if (!lavaJato) throw new NotFoundException("Lava jato não encontrada.");
    return this.comChavePublicaResolvida(lavaJato);
  }

  atualizar(id: string, dto: UpdateLavaJatoDto) {
    const { endereco, ajustePrecoPorte, ajusteDuracaoPorte, ...resto } = dto;
    return this.prisma.lavaJato.update({
      where: { id },
      data: {
        ...resto,
        ...(endereco ? camposEndereco(endereco) : {}),
        // Json do Prisma não aceita a classe do DTO direto — copia pra objeto simples.
        ...(ajustePrecoPorte ? { ajustePrecoPorte: { ...ajustePrecoPorte } } : {}),
        ...(ajusteDuracaoPorte ? { ajusteDuracaoPorte: { ...ajusteDuracaoPorte } } : {}),
      },
    });
  }

  // Recebe o arquivo de logo enviado pelo dono (registro do lava jato ou
  // Mais > Logo), redimensiona/comprime com sharp e guarda como data URL
  // (base64) direto no banco — ver comentário do campo logoUrl no schema.
  async atualizarLogo(id: string, file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Envie um arquivo de imagem no campo "logo".');
    if (!file.mimetype.startsWith("image/")) {
      throw new BadRequestException("O arquivo enviado precisa ser uma imagem.");
    }
    if (file.size > TAMANHO_MAXIMO_LOGO_BYTES) {
      throw new BadRequestException("A imagem enviada é muito grande (máximo 5MB).");
    }

    let comprimida: Buffer;
    try {
      comprimida = await sharp(file.buffer)
        .rotate() // aplica a orientação EXIF (fotos tiradas na vertical no celular) antes de cortar
        .resize(512, 512, { fit: "cover" })
        .jpeg({ quality: 82 })
        .toBuffer();
    } catch {
      throw new BadRequestException("Não foi possível processar essa imagem. Tente outro arquivo.");
    }

    const logoUrl = `data:image/jpeg;base64,${comprimida.toString("base64")}`;
    return this.prisma.lavaJato.update({
      where: { id },
      data: { logoUrl },
      select: { id: true, logoUrl: true },
    });
  }

  // Público: o app do cliente usa isso para montar a lista de profissionais
  // no passo "Escolher profissional" do agendamento.
  listarFuncionariosPublico(lavaJatoId: string) {
    return this.prisma.funcionario.findMany({
      where: { lavaJatoId, ativo: true, disponivel: true },
      include: { usuario: { select: { id: true, nome: true } } },
    });
  }

  // Home do app do cliente. Busca os lava jatos com localização cadastrada
  // dentro do raio (fórmula de Haversine, em memória — sem depender de
  // extensão geoespacial do MySQL, suficiente pro volume de um SaaS ainda
  // pequeno), com filtro opcional por nome, e ordena colocando à frente:
  // 1) lava jatos onde o cliente já teve algum agendamento; 2) as com melhor
  // nota média; 3) desempate por distância.
  async listarProximas(latitude: number, longitude: number, raioKm = 15, nome?: string, clienteId?: string) {
    if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
      throw new BadRequestException("Informe latitude e longitude válidas.");
    }

    const [candidatas, agendamentosDoCliente, { horasCarenciaAposVencimento }] = await Promise.all([
      this.prisma.lavaJato.findMany({
        where: {
          latitude: { not: null },
          longitude: { not: null },
          ...(nome ? { nome: { contains: nome } } : {}),
        },
        select: { ...SELECT_PUBLICO, assinatura: { select: { status: true, bloqueadaEm: true, trialTerminaEm: true } } },
      }),
      clienteId
        ? this.prisma.agendamento.findMany({
            where: { clienteId },
            select: { lavaJatoId: true },
            distinct: ["lavaJatoId"],
          })
        : Promise.resolve([]),
      this.configuracoes.obter(),
    ]);

    const idsJaAgendados = new Set(agendamentosDoCliente.map((a) => a.lavaJatoId));

    return candidatas
      // Assinatura vencida há mais de `horasCarenciaAposVencimento`: some da
      // busca do cliente (a equipe já foi bloqueada bem antes disso — ver
      // AssinaturaGuard). Sem assinatura cadastrada (não deveria acontecer no
      // fluxo normal) não é filtrada, pra não esconder por engano.
      .filter((lavaJato) => !lavaJato.assinatura || !estaForaDaCarencia(lavaJato.assinatura, horasCarenciaAposVencimento))
      .map((candidata) => {
        const { assinatura, ...lavaJato } = candidata;
        return {
          ...this.comChavePublicaResolvida(lavaJato),
          distanciaKm: distanciaHaversineKm(latitude, longitude, lavaJato.latitude!, lavaJato.longitude!),
          jaAgendou: idsJaAgendados.has(lavaJato.id),
        };
      })
      .filter((lavaJato) => lavaJato.distanciaKm <= raioKm)
      .sort((a, b) => {
        if (a.jaAgendou !== b.jaAgendou) return a.jaAgendou ? -1 : 1;
        if (b.notaMedia !== a.notaMedia) return b.notaMedia - a.notaMedia;
        return a.distanciaKm - b.distanciaKm;
      });
  }

  // Cliente avalia (ou atualiza a própria avaliação) um lava jato. Depois de
  // gravar, recalcula a média/contagem cacheadas em LavaJato.notaMedia e
  // LavaJato.totalAvaliacoes, usadas em toda listagem (evita agregar a tabela
  // Avaliacao inteira toda vez que alguém abre a lista de lava jatos).
  async avaliar(lavaJatoId: string, clienteId: string, dto: CreateAvaliacaoDto) {
    const lavaJato = await this.prisma.lavaJato.findUnique({ where: { id: lavaJatoId } });
    if (!lavaJato) throw new NotFoundException("Lava jato não encontrada.");

    if (!(await this.clienteJaFoiAtendido(lavaJatoId, clienteId))) {
      throw new ForbiddenException(
        "Você só pode avaliar depois que o horário do seu atendimento nesse lava jato passar.",
      );
    }

    await this.prisma.avaliacao.upsert({
      where: { lavaJatoId_clienteId: { lavaJatoId, clienteId } },
      update: { nota: dto.nota, comentario: dto.comentario },
      create: { lavaJatoId, clienteId, nota: dto.nota, comentario: dto.comentario },
    });

    const agregado = await this.prisma.avaliacao.aggregate({
      where: { lavaJatoId },
      _avg: { nota: true },
      _count: { nota: true },
    });

    const atualizada = await this.prisma.lavaJato.update({
      where: { id: lavaJatoId },
      data: {
        notaMedia: agregado._avg.nota ?? 0,
        totalAvaliacoes: agregado._count.nota,
      },
      select: SELECT_PUBLICO,
    });
    return this.comChavePublicaResolvida(atualizada);
  }

  // Lista as avaliações (com comentário) de um lava jato, mais recentes primeiro.
  listarAvaliacoes(lavaJatoId: string) {
    return this.prisma.avaliacao.findMany({
      where: { lavaJatoId },
      orderBy: { criadoEm: "desc" },
      include: { cliente: { select: { id: true, nome: true } } },
    });
  }

  // Avaliação que o próprio cliente logado já fez (se houver), mais se ele já
  // pode avaliar — usado pra pré-preencher as estrelas e pra decidir se o
  // formulário de avaliação aparece (só depois de um atendimento concluído).
  async buscarMinhaAvaliacao(lavaJatoId: string, clienteId: string) {
    const [avaliacao, podeAvaliar] = await Promise.all([
      this.prisma.avaliacao.findUnique({ where: { lavaJatoId_clienteId: { lavaJatoId, clienteId } } }),
      this.clienteJaFoiAtendido(lavaJatoId, clienteId),
    ]);
    return { avaliacao, podeAvaliar };
  }

  // Um cliente só pode avaliar um lava jato depois que o horário de algum
  // agendamento dele lá já tiver passado (não vale cancelado, nem um horário
  // ainda futuro) — é isso que "libera" o formulário de avaliação no app.
  private async clienteJaFoiAtendido(lavaJatoId: string, clienteId: string): Promise<boolean> {
    const total = await this.prisma.agendamento.count({
      where: {
        lavaJatoId,
        clienteId,
        fim: { lt: new Date() },
        status: { not: StatusAgendamento.CANCELADO },
      },
    });
    return total > 0;
  }

  // Alimenta o popup de avaliação pós-atendimento do app (ver
  // PopupAvaliacaoPendente) — olha TODAS os lava jatos (não só uma) onde esse
  // cliente já foi atendido (mesma regra de clienteJaFoiAtendido acima:
  // horário já passou, não foi cancelado) e devolve a mais antiga que ele
  // ainda não avaliou. Assim o popup aparece sozinho assim que o cliente
  // reabre o app depois do horário passar, em vez de depender dele lembrar de
  // ir na tela do lava jato avaliar manualmente. `null` quando não há nenhuma
  // pendente (nunca foi atendido em lugar nenhum, ou já avaliou tudo).
  async buscarAvaliacaoPendente(clienteId: string): Promise<{ lavaJatoId: string; nome: string; atendidoEm: Date } | null> {
    const atendimentos = await this.prisma.agendamento.findMany({
      where: { clienteId, fim: { lt: new Date() }, status: { not: StatusAgendamento.CANCELADO } },
      distinct: ["lavaJatoId"],
      orderBy: { fim: "asc" }, // o lava jato esperando avaliação há mais tempo aparece primeiro
      select: { lavaJatoId: true, fim: true, lavaJato: { select: { nome: true } } },
    });
    if (atendimentos.length === 0) return null;

    const jaAvaliadas = await this.prisma.avaliacao.findMany({
      where: { clienteId, lavaJatoId: { in: atendimentos.map((a) => a.lavaJatoId) } },
      select: { lavaJatoId: true },
    });
    const avaliadasSet = new Set(jaAvaliadas.map((a) => a.lavaJatoId));

    const pendente = atendimentos.find((a) => !avaliadasSet.has(a.lavaJatoId));
    if (!pendente) return null;

    return { lavaJatoId: pendente.lavaJatoId, nome: pendente.lavaJato.nome, atendidoEm: pendente.fim };
  }
}

// Distância em linha reta entre duas coordenadas (km). Precisão de sobra pra
// filtrar lava jatos "perto de você" num raio de alguns km.
function distanciaHaversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = grausParaRad(lat2 - lat1);
  const dLon = grausParaRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(grausParaRad(lat1)) * Math.cos(grausParaRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function grausParaRad(graus: number): number {
  return (graus * Math.PI) / 180;
}
