import { randomUUID } from "crypto";
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron, CronExpression } from "@nestjs/schedule";
import { Funcionario, Folga, HorarioTrabalho } from "@prisma/client";
import {
  AJUSTE_DURACAO_PORTE_PADRAO,
  AJUSTE_PRECO_PORTE_PADRAO,
  AVISO_NAO_COMPARECIMENTO,
  MetodoPagamento,
  OrigemAgendamento,
  Papel,
  PorteVeiculo,
  StatusAgendamento,
  StatusAssinaturaPacote,
  StatusPagamento,
  descricaoVeiculo,
  duracaoParaPorte,
  normalizarAjustePorte,
  normalizarPlaca,
  precoParaPorte,
} from "@lavajato-app/shared";
import { PrismaService } from "../prisma/prisma.service";
import { MercadoPagoService } from "../pagamentos/mercadopago.service";
import { ConfiguracoesService } from "../configuracoes/configuracoes.service";
import { PushService } from "../push/push.service";
import { VeiculosService } from "../veiculos/veiculos.service";
import { estaForaDaCarencia } from "../assinaturas/assinatura-status.util";
import { CreateAgendamentoDto } from "./dto/create-agendamento.dto";
import { CreateAgendamentoLoteDto } from "./dto/create-agendamento-lote.dto";
import { CreateAgendamentoManualDto } from "./dto/create-agendamento-manual.dto";
import { AuthUser } from "../auth/jwt.strategy";

// De quanto em quanto tempo um novo horário pode começar (ex: 09:00, 09:30,
// 10:00...). O expediente em si (dias, hora de início/fim, almoço) agora vem
// do HorarioTrabalho de cada funcionário, cadastrado por ele mesmo no app.
const INTERVALO_ENTRE_INICIOS_MINUTOS = 30;

// Um agendamento PENDENTE (pagamento ainda não confirmado) bloqueia o horário
// como se fosse CONFIRMADO — mas só por um tempo: se o cliente abandona o
// pagamento (fecha o app sem pagar o Pix, não conclui o checkout do cartão),
// o horário não pode ficar preso pra sempre. Depois desse prazo, o servidor
// simplesmente ignora esse PENDENTE ao calcular disponibilidade/conflito —
// não precisa de um job em background pra "limpar" nada.
const PENDENTE_EXPIRA_MINUTOS = 20;

// Fração retida como multa quando o cliente não comparece (ver
// marcarNaoCompareceu) — o resto é estornado. Mesmo valor usado no aviso
// exibido na hora de pagar (AVISO_NAO_COMPARECIMENTO, em @lavajato-app/shared).
const FRACAO_MULTA_NAO_COMPARECIMENTO = 0.5;

type FuncionarioComAgenda = Funcionario & { horarios: HorarioTrabalho[]; folgas: Folga[] };

// Campos do Veiculo usados pra preencher o Agendamento.
interface VeiculoParaAgendamento {
  id: string;
  porte: PorteVeiculo;
  placa: string;
  marca: string | null;
  modelo: string;
  cor: string | null;
}

interface ItemResolvido {
  servicoId?: string;
  pacoteId?: string;
  duracaoMinutos: number;
  precoCentavos: number;
  lavaJatoId: string;
}

@Injectable()
export class AgendamentosService {
  private readonly logger = new Logger(AgendamentosService.name);

  // Marca até onde já checamos agendamentos pra avisar sobre dinheiro
  // pendente (ver avisarPagamentosDinheiroNoHorario) — só em memória mesmo:
  // se o servidor reiniciar, a próxima rodada volta 5 min pra não perder
  // nenhum, e na pior hipótese algum agendamento recebe o aviso de novo
  // (reenviar um lembrete não causa problema nenhum).
  private ultimaChecagemLembreteDinheiro: Date | null = null;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private mercadoPago: MercadoPagoService,
    private configuracoes: ConfiguracoesService,
    private push: PushService,
    private veiculos: VeiculosService,
  ) {}

  // Cliente não consegue criar um agendamento novo num lava jato cuja
  // assinatura do SaaS já passou da carência (mesmo critério que a esconde da
  // busca — ver LavaJatosService.listarProximas). A equipe desse lava jato
  // já está bloqueada bem antes disso (na hora, sem carência — ver
  // AssinaturaGuard), então essa checagem aqui é só a metade "cliente" da
  // regra. Sem assinatura cadastrada não bloqueia (não é essa checagem que
  // decide esse caso).
  private async garantirLavaJatoDisponivelParaAgendamento(lavaJatoId: string) {
    const assinatura = await this.prisma.assinatura.findUnique({
      where: { lavaJatoId },
      select: { status: true, bloqueadaEm: true, trialTerminaEm: true },
    });
    if (!assinatura) return;
    const { horasCarenciaAposVencimento } = await this.configuracoes.obter();
    if (estaForaDaCarencia(assinatura, horasCarenciaAposVencimento)) {
      throw new BadRequestException("Este lava jato está temporariamente indisponível para novos agendamentos.");
    }
  }

  // Mantido por compatibilidade (agendamento de um serviço/pacote só) — por
  // baixo é a mesma coisa que criarLote com um item, mesmo fluxo de pagamento.
  criar(clienteId: string, dto: CreateAgendamentoDto) {
    return this.criarLote(clienteId, {
      funcionarioId: dto.funcionarioId,
      inicio: dto.inicio,
      veiculoId: dto.veiculoId,
      itens: [{ servicoId: dto.servicoId, pacoteId: dto.pacoteId }],
      metodoPagamento: dto.metodoPagamento,
    });
  }

  // O cliente marca vários serviços de uma vez (pode repetir o mesmo, ex: 2x
  // corte pra dois carros) num único horário — cada item vira um Agendamento
  // próprio (status PENDENTE até o pagamento confirmar), encadeado em
  // sequência a partir de "inicio" e com o mesmo profissional, todos com o
  // mesmo grupoId pra serem exibidos/cancelados/pagos juntos. Devolve os
  // agendamentos criados + a cobrança (Pix/Cartão) que o cliente precisa
  // pagar pra confirmar — ver AVISO_NAO_COMPARECIMENTO pro texto exibido
  // nessa hora (o lava jato retém 50% se o cliente não comparecer).
  async criarLote(clienteId: string, dto: CreateAgendamentoLoteDto) {
    // O veículo escolhido (sempre do próprio cliente) define o porte — e com
    // ele o preço e a duração de cada item (ver resolverItem).
    const veiculo = await this.veiculos.buscarDoCliente(clienteId, dto.veiculoId);
    const resolvidos = await Promise.all(dto.itens.map((item) => this.resolverItem(item, veiculo.porte)));

    const lavaJatoId = resolvidos[0].lavaJatoId;
    if (resolvidos.some((r) => r.lavaJatoId !== lavaJatoId)) {
      throw new BadRequestException("Todos os serviços do agendamento precisam ser do mesmo lava jato.");
    }
    await this.garantirLavaJatoDisponivelParaAgendamento(lavaJatoId);

    const duracaoTotalMinutos = resolvidos.reduce((total, r) => total + r.duracaoMinutos, 0);
    const inicio = new Date(dto.inicio);
    const fim = new Date(inicio.getTime() + duracaoTotalMinutos * 60_000);

    const funcionarioId = dto.funcionarioId
      ? await this.garantirFuncionarioLivre(dto.funcionarioId, inicio, fim, lavaJatoId)
      : await this.escolherFuncionarioDisponivel(lavaJatoId, inicio, fim);

    // Antes de exigir pagamento avulso, confere se uma assinatura de pacote
    // mensal ATIVA do cliente já cobre esse lote inteiro (mesmos serviços,
    // dia da semana permitido, cota da semana não esgotada) — nesse caso o
    // agendamento nasce CONFIRMADO direto, sem Pagamento nenhum (ver
    // encontrarAssinaturaPacoteElegivel).
    const assinaturaPacote = await this.encontrarAssinaturaPacoteElegivel(
      clienteId,
      lavaJatoId,
      veiculo.id,
      resolvidos,
      inicio,
      dto.usarAssinaturaPacoteId,
    );
    if (assinaturaPacote) {
      return this.criarComAssinaturaPacote(clienteId, lavaJatoId, funcionarioId, veiculo, resolvidos, inicio, assinaturaPacote.id);
    }

    const metodoPagamento = dto.metodoPagamento ?? MetodoPagamento.PIX;
    const valorTotalCentavos = resolvidos.reduce((total, r) => total + r.precoCentavos, 0);

    // Confere ANTES de criar qualquer coisa que o lava jato tem como receber
    // — evita reservar o horário só pra descobrir depois que não dá pra
    // cobrar. Dinheiro nunca passa pelo Mercado Pago, então pula essa
    // exigência de propósito: o lava jato pode aceitar pagamento em dinheiro
    // mesmo sem ter conectado uma conta Mercado Pago ainda.
    const tokenLavaJato =
      metodoPagamento === MetodoPagamento.DINHEIRO ? null : await this.mercadoPago.tokenDaLavaJato(lavaJatoId);

    const [cliente, lavaJato, ultimoPagamentoAprovado] = await Promise.all([
      this.prisma.usuario.findUnique({ where: { id: clienteId } }),
      this.prisma.lavaJato.findUnique({ where: { id: lavaJatoId } }),
      // Só pra montar additional_info.payer da cobrança com cartão abaixo
      // (ver MercadoPagoService.criarPagamentoCartao) — busca em paralelo com
      // o resto pra não atrasar o fluxo de Pix, que não usa esse dado.
      // atualizadoEm é usado como proxy de "quando foi aprovado" porque
      // Pagamento não guarda uma data de aprovação separada — é atualizado
      // exatamente quando o status muda pra APROVADO (ver mais abaixo).
      this.prisma.pagamento.findFirst({
        where: { clienteId, status: StatusPagamento.APROVADO },
        orderBy: { atualizadoEm: "desc" },
      }),
    ]);
    if (!cliente) throw new NotFoundException("Cliente não encontrado.");

    const grupoId = randomUUID();
    let cursor = inicio;
    const dadosParaCriar = resolvidos.map((item) => {
      const inicioItem = cursor;
      const fimItem = new Date(inicioItem.getTime() + item.duracaoMinutos * 60_000);
      cursor = fimItem;
      return {
        lavaJatoId,
        clienteId,
        funcionarioId,
        ...this.dadosDoVeiculo(veiculo),
        servicoId: item.servicoId,
        pacoteId: item.pacoteId,
        inicio: inicioItem,
        fim: fimItem,
        precoCentavos: item.precoCentavos,
        // Pix/Cartão nascem PENDENTE até o gateway confirmar (ver mais
        // abaixo) — mas Dinheiro nasce CONFIRMADO direto: diferente de um
        // checkout abandonado, aqui o cliente já se comprometeu com o
        // horário, e um PENDENTE expira sozinho depois de
        // PENDENTE_EXPIRA_MINUTOS (ver filtroStatusAtivo), o que liberaria a
        // vaga de baixo do cliente que ainda vai aparecer pra pagar em
        // dinheiro. O controle de "ainda não pagou" fica só no Pagamento
        // (criado abaixo como PENDENTE) até o funcionário/lavajato
        // confirmarem o recebimento — ver confirmarPagamentoDinheiro.
        status:
          metodoPagamento === MetodoPagamento.DINHEIRO ? StatusAgendamento.CONFIRMADO : StatusAgendamento.PENDENTE,
        origem: OrigemAgendamento.CLIENTE_APP,
        grupoId,
      };
    });

    await this.prisma.$transaction(dadosParaCriar.map((data) => this.prisma.agendamento.create({ data })));
    const pagamento = await this.prisma.pagamento.create({
      data: { grupoId, clienteId, lavaJatoId, metodo: metodoPagamento, valorCentavos: valorTotalCentavos },
    });

    let motivoRecusaCartao: string | null = null;
    try {
      if (metodoPagamento === MetodoPagamento.PIX) {
        const pix = await this.mercadoPago.criarPagamentoPix(
          {
            valorCentavos: valorTotalCentavos,
            descricao: `Agendamento - ${lavaJato?.nome ?? "LavaJato"}`,
            // "_" (não ":") — a Orders API (usada pelo cartão, ver
            // MercadoPagoService.criarPagamentoCartao) valida external_reference
            // com um padrão mais restrito que a API clássica e rejeita ":"
            // ("does not match pattern", constatado em produção). Pix também
            // foi trocado pro mesmo formato só por consistência (não precisa,
            // mas evita ter dois padrões diferentes pro mesmo campo).
            externalReference: `agendamento_${pagamento.id}`,
            payerEmail: cliente.email,
          },
          tokenLavaJato as string,
        );
        const aprovadoNaHora = pix.status === "approved";
        await this.prisma.pagamento.update({
          where: { id: pagamento.id },
          data: {
            gatewayPagamentoId: pix.id,
            pixQrCodeBase64: pix.qrCodeBase64,
            pixCopiaECola: pix.qrCode,
            status: aprovadoNaHora ? StatusPagamento.APROVADO : StatusPagamento.PENDENTE,
          },
        });
        if (aprovadoNaHora) {
          await this.prisma.agendamento.updateMany({ where: { grupoId }, data: { status: StatusAgendamento.CONFIRMADO } });
        }
      } else if (metodoPagamento === MetodoPagamento.CARTAO) {
        // Cartão: formulário nativo no app tokenizou o cartão (dto.cartaoToken)
        // e o cliente nunca sai do app — cobra na hora, sem checkout hospedado.
        if (!dto.cartaoToken || !dto.cartaoBin || !dto.cartaoCpf) {
          throw new BadRequestException("Dados do cartão incompletos.");
        }
        const { paymentMethodId } = await this.mercadoPago.identificarBandeiraCartao(dto.cartaoBin);
        const cobranca = await this.mercadoPago.criarPagamentoCartao(
          {
            valorCentavos: valorTotalCentavos,
            descricao: `Agendamento - ${lavaJato?.nome ?? "LavaJato"}`,
            // "_" (não ":") — a Orders API (usada pelo cartão, ver
            // MercadoPagoService.criarPagamentoCartao) valida external_reference
            // com um padrão mais restrito que a API clássica e rejeita ":"
            // ("does not match pattern", constatado em produção). Pix também
            // foi trocado pro mesmo formato só por consistência (não precisa,
            // mas evita ter dois padrões diferentes pro mesmo campo).
            externalReference: `agendamento_${pagamento.id}`,
            token: dto.cartaoToken,
            paymentMethodId,
            payerEmail: cliente.email,
            payerCpf: dto.cartaoCpf,
            payerNome: cliente.nome,
            payerTelefone: cliente.telefone,
            deviceId: dto.cartaoDeviceId,
            payerCadastradoEm: cliente.criadoEm,
            payerPrimeiraCompra: !ultimoPagamentoAprovado,
            payerUltimaCompraEm: ultimoPagamentoAprovado?.atualizadoEm ?? null,
            dataAgendamento: inicio,
          },
          tokenLavaJato as string,
        );
        const aprovadoNaHora = cobranca.status === "approved";
        const recusado = cobranca.status === "rejected";
        await this.prisma.pagamento.update({
          where: { id: pagamento.id },
          data: {
            gatewayPagamentoId: cobranca.id,
            status: aprovadoNaHora ? StatusPagamento.APROVADO : recusado ? StatusPagamento.RECUSADO : StatusPagamento.PENDENTE,
            // Preenchido só quando o Mercado Pago exigiu desafio 3DS (ver
            // MercadoPagoService.criarPagamentoCartao) — o app usa isso pra
            // decidir se mostra a WebView de confirmação com o banco.
            desafio3dsUrl: cobranca.desafio3dsUrl,
          },
        });
        if (aprovadoNaHora) {
          await this.prisma.agendamento.updateMany({ where: { grupoId }, data: { status: StatusAgendamento.CONFIRMADO } });
        } else if (recusado) {
          // Recusa da operadora não é uma falha técnica (não deve virar o
          // erro genérico do catch abaixo) — libera o horário e devolve pro
          // cliente um motivo específico pra ele tentar outro cartão.
          await this.prisma.agendamento.updateMany({ where: { grupoId }, data: { status: StatusAgendamento.CANCELADO } });
          motivoRecusaCartao = traduzirMotivoRecusaCartao(cobranca.statusDetail);
        }
      }
      // DINHEIRO: nada a fazer aqui — o Agendamento já nasceu CONFIRMADO e o
      // Pagamento já foi criado acima como PENDENTE, sem gatewayPagamentoId.
      // Fica assim até o funcionário/lavajato confirmarem o recebimento
      // presencialmente (ver confirmarPagamentoDinheiro), o que também é o
      // que libera `concluir()` pra esse agendamento (exige Pagamento
      // APROVADO pra agendamentos vindos do app).
    } catch (e) {
      // Não deixa a reserva/pagamento órfãos travando o horário pra sempre —
      // desfaz os dois e devolve um erro claro pro cliente tentar de novo.
      this.logger.error(`Falha ao gerar cobrança pro agendamento (grupo ${grupoId}): ${e}`);
      await this.prisma.agendamento.updateMany({ where: { grupoId }, data: { status: StatusAgendamento.CANCELADO } });
      await this.prisma.pagamento.update({ where: { id: pagamento.id }, data: { status: StatusPagamento.RECUSADO } });
      // Erros com mensagem própria (ex: motivo específico do Mercado Pago, ou
      // "bandeira não identificada") já são claros o suficiente pro cliente —
      // só cai na mensagem genérica quando o erro é algo inesperado (ex: falha
      // de rede) sem nada útil pra mostrar.
      if (e instanceof BadRequestException) throw e;
      throw new BadRequestException("Não foi possível gerar a cobrança agora. Tente novamente em instantes.");
    }

    if (motivoRecusaCartao) {
      throw new BadRequestException(motivoRecusaCartao);
    }

    const [agendamentos, pagamentoFinal] = await Promise.all([
      this.prisma.agendamento.findMany({
        where: { grupoId },
        // select em vez de include: true — mesmo motivo das outras consultas
        // de agenda: evita devolver o Usuario inteiro (hash de senha) do
        // funcionário pro app do cliente que acabou de agendar.
        include: { servico: true, pacote: true, funcionario: { include: { usuario: { select: { id: true, nome: true } } } } },
        orderBy: { inicio: "asc" },
      }),
      this.prisma.pagamento.findUniqueOrThrow({ where: { id: pagamento.id } }),
    ]);

    return { agendamentos, pagamento: this.mapearPagamento(pagamentoFinal), aviso: AVISO_NAO_COMPARECIMENTO };
  }

  // Procura uma AssinaturaPacoteCliente ATIVA do cliente (nesse lava jato)
  // que cubra o lote inteiro: só serviços avulsos (nada de Pacote — combo já
  // tem preço/composição própria), todos incluídos no mesmo pacote mensal, no
  // dia da semana permitido e com cota sobrando pra todos os itens do lote.
  // Se `usarAssinaturaPacoteId` foi informado (o cliente escolheu usar o
  // pacote de propósito), qualquer motivo de não cobrir vira erro claro em
  // vez de cair silenciosamente pro pagamento avulso.
  private async encontrarAssinaturaPacoteElegivel(
    clienteId: string,
    lavaJatoId: string,
    veiculoId: string,
    resolvidos: ItemResolvido[],
    inicio: Date,
    usarAssinaturaPacoteId?: string,
  ) {
    if (resolvidos.some((r) => !r.servicoId)) {
      if (usarAssinaturaPacoteId) {
        throw new BadRequestException("Pacotes de serviço avulso não podem ser pagos com a cota de um pacote mensal.");
      }
      return null;
    }

    const candidatas = await this.prisma.assinaturaPacoteCliente.findMany({
      where: {
        ...(usarAssinaturaPacoteId ? { id: usarAssinaturaPacoteId } : {}),
        clienteId,
        lavaJatoId,
        // A cota do pacote mensal só vale pro veículo que foi assinado.
        veiculoId,
        status: StatusAssinaturaPacote.ATIVA,
      },
      include: { pacoteMensal: { include: { servicos: true } } },
    });
    if (usarAssinaturaPacoteId && candidatas.length === 0) {
      throw new BadRequestException("Assinatura de pacote mensal não encontrada ou não está ativa.");
    }

    const diaSemana = inicio.getDay();
    const servicoIds = resolvidos.map((r) => r.servicoId!);

    for (const candidata of candidatas) {
      const idsIncluidos = new Set(candidata.pacoteMensal.servicos.map((s) => s.servicoId));
      if (!servicoIds.every((id) => idsIncluidos.has(id))) {
        if (usarAssinaturaPacoteId) throw new BadRequestException("Essa assinatura não cobre um ou mais dos serviços escolhidos.");
        continue;
      }

      const diasPermitidos = (candidata.pacoteMensal.diasSemanaPermitidos as number[]) ?? [];
      if (!diasPermitidos.includes(diaSemana)) {
        if (usarAssinaturaPacoteId) throw new BadRequestException("Seu pacote mensal não permite agendar nesse dia da semana.");
        continue;
      }

      const usos = await this.usosDaAssinaturaNaSemana(candidata.id, inicio);
      if (usos + resolvidos.length > candidata.pacoteMensal.vezesPorSemana) {
        if (usarAssinaturaPacoteId) throw new BadRequestException("Cota semanal do seu pacote mensal esgotada.");
        continue;
      }

      return candidata;
    }
    return null;
  }

  // Mesma definição de semana (segunda 00:00 até o próximo domingo) usada em
  // PacotesMensaisService.usosNaSemana — duplicado de propósito pra não criar
  // um ciclo entre os dois módulos por causa de um helper de 6 linhas.
  private usosDaAssinaturaNaSemana(assinaturaId: string, dataReferencia: Date) {
    const diaSemana = dataReferencia.getDay();
    const diasDesdeSegunda = (diaSemana + 6) % 7;
    const inicioSemana = new Date(dataReferencia);
    inicioSemana.setHours(0, 0, 0, 0);
    inicioSemana.setDate(inicioSemana.getDate() - diasDesdeSegunda);
    const fimSemana = new Date(inicioSemana);
    fimSemana.setDate(fimSemana.getDate() + 7);

    return this.prisma.agendamento.count({
      where: {
        assinaturaPacoteId: assinaturaId,
        status: { in: [StatusAgendamento.CONFIRMADO, StatusAgendamento.CONCLUIDO, StatusAgendamento.NAO_COMPARECEU] },
        inicio: { gte: inicioSemana, lt: fimSemana },
      },
    });
  }

  // Cria o lote inteiro já CONFIRMADO, usando a cota da assinatura — sem
  // Pagamento nenhum (o cliente já paga a mensalidade à parte, ver
  // PacotesMensaisService.assinar).
  private async criarComAssinaturaPacote(
    clienteId: string,
    lavaJatoId: string,
    funcionarioId: string,
    veiculo: VeiculoParaAgendamento,
    resolvidos: ItemResolvido[],
    inicio: Date,
    assinaturaPacoteId: string,
  ) {
    const grupoId = randomUUID();
    let cursor = inicio;
    const dadosParaCriar = resolvidos.map((item) => {
      const inicioItem = cursor;
      const fimItem = new Date(inicioItem.getTime() + item.duracaoMinutos * 60_000);
      cursor = fimItem;
      return {
        lavaJatoId,
        clienteId,
        funcionarioId,
        ...this.dadosDoVeiculo(veiculo),
        servicoId: item.servicoId,
        inicio: inicioItem,
        fim: fimItem,
        precoCentavos: item.precoCentavos,
        status: StatusAgendamento.CONFIRMADO,
        origem: OrigemAgendamento.CLIENTE_APP,
        assinaturaPacoteId,
        grupoId,
      };
    });

    await this.prisma.$transaction(dadosParaCriar.map((data) => this.prisma.agendamento.create({ data })));
    const agendamentos = await this.prisma.agendamento.findMany({
      where: { grupoId },
      // select em vez de include: true — mesmo motivo das demais consultas.
      include: { servico: true, pacote: true, funcionario: { include: { usuario: { select: { id: true, nome: true } } } } },
      orderBy: { inicio: "asc" },
    });

    return { agendamentos, pagamento: null, aviso: AVISO_NAO_COMPARECIMENTO };
  }

  // A próprio lava jato lança um agendamento na agenda — cliente avulso (sem
  // conta, só nome/telefone) ou um cliente já cadastrado no app. Cai direto
  // como CONFIRMADO, sem PENDENTE/pagamento pelo app (quem cobra, se cobrar,
  // é o próprio lava jato por fora — ex: dinheiro/maquininha na hora).
  // Funcionário só pode lançar na PRÓPRIA agenda; o dono do lava jato pode
  // lançar na de qualquer funcionário da casa.
  async criarManual(user: AuthUser, dto: CreateAgendamentoManualDto) {
    if (!dto.clienteId && !dto.clienteAvulsoNome) {
      throw new BadRequestException("Informe o cliente cadastrado ou ao menos o nome do cliente avulso.");
    }

    let lavaJatoId: string;
    if (user.papel === Papel.LAVAJATO_ADMIN) {
      if (!user.lavaJatoId) throw new ForbiddenException("Usuário sem lava jato associado.");
      lavaJatoId = user.lavaJatoId;
    } else if (user.papel === Papel.FUNCIONARIO) {
      const funcionario = await this.prisma.funcionario.findUnique({ where: { usuarioId: user.id } });
      if (!funcionario) throw new NotFoundException("Cadastro de funcionário não encontrado para este usuário.");
      if (funcionario.id !== dto.funcionarioId) {
        throw new ForbiddenException("Você só pode lançar agendamentos na sua própria agenda.");
      }
      lavaJatoId = funcionario.lavaJatoId;
    } else {
      throw new ForbiddenException("Sem permissão para lançar agendamentos manualmente.");
    }

    const resolvidos = await Promise.all(dto.itens.map((item) => this.resolverItem(item, dto.porte)));
    if (resolvidos.some((r) => r.lavaJatoId !== lavaJatoId)) {
      throw new BadRequestException("Todos os serviços do agendamento precisam ser do mesmo lava jato.");
    }

    const duracaoTotalMinutos = resolvidos.reduce((total, r) => total + r.duracaoMinutos, 0);
    const inicio = new Date(dto.inicio);
    const fim = new Date(inicio.getTime() + duracaoTotalMinutos * 60_000);
    await this.garantirFuncionarioLivre(dto.funcionarioId, inicio, fim, lavaJatoId);

    if (dto.clienteId) {
      const cliente = await this.prisma.usuario.findUnique({ where: { id: dto.clienteId } });
      if (!cliente) throw new NotFoundException("Cliente não encontrado.");
    }

    // Só usa grupoId quando há mais de um serviço (agrupa pra
    // cancelar/concluir juntos) — um item só nem precisa.
    const grupoId = resolvidos.length > 1 ? randomUUID() : undefined;
    // Como o lava jato recebeu por fora (sem Pagamento, não passa pelo
    // Mercado Pago) — ver Agendamento.metodoPagamentoManual no schema e
    // FinanceiroService, que usa isso pros cards de Pix/Cartão/Dinheiro.
    // Default Dinheiro: é o caso mais comum de lançamento manual (cliente que
    // pagou na hora, na mão).
    const metodoPagamentoManual = dto.metodoPagamento ?? MetodoPagamento.DINHEIRO;
    let cursor = inicio;
    const dadosParaCriar = resolvidos.map((item) => {
      const inicioItem = cursor;
      const fimItem = new Date(inicioItem.getTime() + item.duracaoMinutos * 60_000);
      cursor = fimItem;
      return {
        lavaJatoId,
        funcionarioId: dto.funcionarioId,
        clienteId: dto.clienteId,
        clienteAvulsoNome: dto.clienteId ? undefined : dto.clienteAvulsoNome,
        clienteAvulsoTelefone: dto.clienteId ? undefined : dto.clienteAvulsoTelefone,
        porte: dto.porte,
        veiculoPlaca: dto.veiculoPlaca ? normalizarPlaca(dto.veiculoPlaca) : undefined,
        veiculoDescricao: dto.veiculoDescricao?.trim() || undefined,
        servicoId: item.servicoId,
        pacoteId: item.pacoteId,
        inicio: inicioItem,
        fim: fimItem,
        precoCentavos: item.precoCentavos,
        status: StatusAgendamento.CONFIRMADO,
        origem: OrigemAgendamento.LAVAJATO_MANUAL,
        metodoPagamentoManual,
        grupoId,
      };
    });

    const criados = await this.prisma.$transaction(dadosParaCriar.map((data) => this.prisma.agendamento.create({ data })));
    return this.prisma.agendamento.findMany({
      where: { id: { in: criados.map((c) => c.id) } },
      // select em vez de include: true — mesmo motivo das demais consultas
      // de agenda (evita devolver hash de senha/e-mail desnecessariamente).
      include: {
        servico: true,
        pacote: true,
        funcionario: { include: { usuario: { select: { id: true, nome: true } } } },
        cliente: { select: { id: true, nome: true, telefone: true } },
      },
      orderBy: { inicio: "asc" },
    });
  }

  // O app chama isso pra saber se o Pix/checkout já foi pago — enquanto
  // PENDENTE, também confere ao vivo com o Mercado Pago (não depende só do
  // webhook, que pode demorar ou estar mal configurado num ambiente novo).
  async buscarPagamento(pagamentoId: string, clienteId: string) {
    const pagamento = await this.prisma.pagamento.findUnique({ where: { id: pagamentoId } });
    if (!pagamento || pagamento.clienteId !== clienteId) throw new NotFoundException("Pagamento não encontrado.");

    if (pagamento.status === StatusPagamento.PENDENTE && pagamento.gatewayPagamentoId) {
      try {
        const token = await this.mercadoPago.tokenDaLavaJato(pagamento.lavaJatoId);
        const atualizado = await this.sincronizarPagamentoComGateway(pagamento.id, pagamento.gatewayPagamentoId, token);
        return this.mapearPagamento(atualizado);
      } catch (e) {
        this.logger.warn(`Falha ao sincronizar pagamento ${pagamentoId} ao vivo, devolvendo estado salvo: ${e}`);
      }
    }
    return this.mapearPagamento(pagamento);
  }

  // Cliente desistiu de pagar (ex: voltou da tela de pagamento sem concluir)
  // — libera o horário e o grupo inteiro na hora, em vez de deixar preso até
  // PENDENTE_EXPIRA_MINUTOS vencer sozinho (ver filtroStatusAtivo). Só mexe
  // em algo se AINDA estiver PENDENTE: se o pagamento já aprovou (ex: o
  // webhook chegou um instante antes de o cliente tocar "cancelar") ou já foi
  // recusado, não desfaz nada — evita cancelar um agendamento que na verdade
  // já foi pago.
  async cancelarPagamentoPendente(pagamentoId: string, clienteId: string) {
    const pagamento = await this.prisma.pagamento.findUnique({ where: { id: pagamentoId } });
    if (!pagamento || pagamento.clienteId !== clienteId) throw new NotFoundException("Pagamento não encontrado.");

    if (pagamento.status === StatusPagamento.PENDENTE && pagamento.grupoId) {
      // Dinheiro nasce CONFIRMADO (não PENDENTE, ver criarLote) — se o
      // cliente ainda assim desistir antes de confirmar em dinheiro, precisa
      // soltar o CONFIRMADO também, senão o horário ficava preso com um
      // Pagamento RECUSADO órfão (nunca mais confirmável nem concluível).
      const statusParaLiberar =
        pagamento.metodo === MetodoPagamento.DINHEIRO
          ? [StatusAgendamento.PENDENTE, StatusAgendamento.CONFIRMADO]
          : [StatusAgendamento.PENDENTE];
      await this.prisma.$transaction([
        this.prisma.agendamento.updateMany({
          where: { grupoId: pagamento.grupoId, status: { in: statusParaLiberar } },
          data: { status: StatusAgendamento.CANCELADO },
        }),
        this.prisma.pagamento.update({ where: { id: pagamentoId }, data: { status: StatusPagamento.RECUSADO } }),
      ]);
    }

    return this.mapearPagamento(await this.prisma.pagamento.findUniqueOrThrow({ where: { id: pagamentoId } }));
  }

  // Usado tanto pelo poll acima quanto pelo webhook (ver WebhooksService) —
  // busca o status atual no Mercado Pago e atualiza Pagamento/Agendamentos.
  private async sincronizarPagamentoComGateway(pagamentoId: string, gatewayPagamentoId: string, token: string) {
    const pagamentoMp = await this.mercadoPago.buscarPayment(gatewayPagamentoId, token);
    const novoStatus =
      pagamentoMp.status === "approved"
        ? StatusPagamento.APROVADO
        : pagamentoMp.status === "pending" || pagamentoMp.status === "in_process" || pagamentoMp.status === "authorized"
          ? StatusPagamento.PENDENTE
          : StatusPagamento.RECUSADO;

    const atualizado = await this.prisma.pagamento.update({
      where: { id: pagamentoId },
      // `?? null`: PaymentDetalhe.desafio3dsUrl vem undefined pro Pix (não
      // existe conceito de 3DS lá) — sem isso o Prisma reclamaria do tipo.
      data: {
        status: novoStatus,
        desafio3dsUrl: pagamentoMp.desafio3dsUrl ?? null,
        // Mesma taxa do Mercado Pago gravada no webhook (ver
        // WebhooksService.tratarPagamentoAgendamento) — esse poll é só o
        // outro caminho que pode ser o primeiro a ver a aprovação.
        taxaMercadoPagoCentavos: pagamentoMp.taxaCentavos,
      },
    });
    if (novoStatus === StatusPagamento.APROVADO && atualizado.grupoId) {
      await this.prisma.agendamento.updateMany({
        where: { grupoId: atualizado.grupoId, status: StatusAgendamento.PENDENTE },
        data: { status: StatusAgendamento.CONFIRMADO },
      });
    } else if (novoStatus === StatusPagamento.RECUSADO && atualizado.grupoId) {
      // BUG (set/2026): quando a recusa é descoberta só DEPOIS da criação —
      // ex: Order que nasce "pending"/"pending_review_manual" e vira "failed"
      // (high_risk) alguns segundos depois, achado aqui pelo poll/webhook, não
      // na criação (ver criarPagamentoCartao/criarLote, que JÁ cancelava
      // nesse outro caminho) — faltava esse `else if`: o Agendamento ficava
      // PENDENTE, e `filtroStatusAtivo()` trata PENDENTE recente como
      // ocupando o horário por até PENDENTE_EXPIRA_MINUTOS. Resultado: o
      // cliente tentava agendar de novo no mesmo horário na hora e recebia
      // "esse horário acabou de ser reservado" — mesmo o pagamento já tendo
      // sido definitivamente recusado. Libera o horário na hora, igual já
      // acontece nos outros dois caminhos de recusa (criarLote e
      // cancelarPagamentoPendente).
      await this.prisma.agendamento.updateMany({
        where: { grupoId: atualizado.grupoId, status: StatusAgendamento.PENDENTE },
        data: { status: StatusAgendamento.CANCELADO },
      });
    }
    return atualizado;
  }

  private mapearPagamento(pagamento: {
    id: string;
    grupoId: string | null;
    clienteId: string;
    lavaJatoId: string;
    metodo: string;
    status: string;
    valorCentavos: number;
    valorEstornadoCentavos: number;
    pixQrCodeBase64: string | null;
    pixCopiaECola: string | null;
    desafio3dsUrl: string | null;
    criadoEm: Date;
  }, checkoutUrl?: string | null) {
    return {
      id: pagamento.id,
      grupoId: pagamento.grupoId,
      clienteId: pagamento.clienteId,
      lavaJatoId: pagamento.lavaJatoId,
      metodo: pagamento.metodo,
      status: pagamento.status,
      valorCentavos: pagamento.valorCentavos,
      valorEstornadoCentavos: pagamento.valorEstornadoCentavos,
      pixQrCodeBase64: pagamento.pixQrCodeBase64,
      pixCopiaECola: pagamento.pixCopiaECola,
      desafio3dsUrl: pagamento.desafio3dsUrl,
      checkoutUrl: checkoutUrl ?? null,
      criadoEm: pagamento.criadoEm.toISOString(),
    };
  }

  // Dias (dentro do mês informado) que têm pelo menos um horário livre para a
  // duração total dos serviços escolhidos — alimenta o calendário do app.
  async listarDiasDisponiveis(lavaJatoId: string, ano: number, mes: number, duracaoMinutos: number) {
    const inicioMes = new Date(ano, mes - 1, 1, 0, 0, 0, 0);
    const inicioProximoMes = new Date(ano, mes, 1, 0, 0, 0, 0);

    const funcionarios = await this.funcionariosComAgenda(lavaJatoId, inicioMes, inicioProximoMes);
    if (funcionarios.length === 0) return [];

    const agendamentos = await this.buscarAgendamentosNoIntervalo(
      funcionarios.map((f) => f.id),
      inicioMes,
      inicioProximoMes,
    );
    const agora = new Date();

    const dias: string[] = [];
    for (let dia = new Date(inicioMes); dia < inicioProximoMes; dia.setDate(dia.getDate() + 1)) {
      const temHorarioLivre = funcionarios.some((funcionario) =>
        slotsDoFuncionarioNoDia(funcionario, dia, duracaoMinutos).some(
          (slot) =>
            slot.inicio > agora &&
            slotLivre(agendamentos, funcionario.id, slot.inicio, slot.fim) &&
            folgaLivre(funcionario.folgas, slot.inicio, slot.fim),
        ),
      );
      if (temHorarioLivre) dias.push(formatarData(dia));
    }
    return dias;
  }

  // Horários livres (formato "HH:mm") num dia específico, para a duração total
  // dos serviços escolhidos — alimenta a lista de horários do app depois que o
  // cliente escolhe o dia no calendário.
  async listarHorariosDisponiveis(lavaJatoId: string, data: string, duracaoMinutos: number, funcionarioId?: string) {
    const dia = new Date(`${data}T00:00:00`);
    const proximoDia = new Date(dia);
    proximoDia.setDate(proximoDia.getDate() + 1);

    const todosFuncionarios = await this.funcionariosComAgenda(lavaJatoId, dia, proximoDia);
    const funcionarios = funcionarioId ? todosFuncionarios.filter((f) => f.id === funcionarioId) : todosFuncionarios;
    if (funcionarios.length === 0) return [];

    const agendamentos = await this.buscarAgendamentosNoIntervalo(
      funcionarios.map((f) => f.id),
      dia,
      proximoDia,
    );
    const agora = new Date();

    const horariosUnicos = new Set<string>();
    for (const funcionario of funcionarios) {
      for (const slot of slotsDoFuncionarioNoDia(funcionario, dia, duracaoMinutos)) {
        if (slot.inicio <= agora) continue;
        if (!slotLivre(agendamentos, funcionario.id, slot.inicio, slot.fim)) continue;
        if (!folgaLivre(funcionario.folgas, slot.inicio, slot.fim)) continue;
        horariosUnicos.add(formatarHorario(slot.inicio));
      }
    }
    return Array.from(horariosUnicos).sort();
  }

  listarMeusComoCliente(clienteId: string) {
    return this.prisma.agendamento.findMany({
      where: { clienteId },
      include: {
        servico: true,
        pacote: true,
        // `select` em vez de `include: true` — isso devolvia o Usuario inteiro
        // do funcionário (hash de senha incluído) pro app do cliente, sem
        // necessidade nenhuma de expor isso.
        funcionario: { include: { usuario: { select: { id: true, nome: true } } } },
        // O cliente pode ter agendamentos em várias lava jatos diferentes —
        // sem isso, "Meus agendamentos" não tinha como mostrar em qual
        // lava jato foi cada um nem oferecer o botão "Como chegar". telefone:
        // é o que alimenta o botão "Ligar para o lava jato".
        lavaJato: { select: { id: true, nome: true, endereco: true, telefone: true, latitude: true, longitude: true } },
      },
      orderBy: { inicio: "desc" },
    });
  }

  // Agenda de um funcionário específico, a partir do id do USUÁRIO logado
  // (usada pelo próprio app do funcionário — o token só carrega o id de Usuario).
  async listarAgendaFuncionario(usuarioId: string, dataInicio?: Date, dataFim?: Date) {
    const funcionario = await this.prisma.funcionario.findUnique({ where: { usuarioId } });
    if (!funcionario) throw new NotFoundException("Cadastro de funcionário não encontrado para este usuário.");

    const agendamentos = await this.prisma.agendamento.findMany({
      where: {
        funcionarioId: funcionario.id,
        status: { not: StatusAgendamento.CANCELADO },
        ...(dataInicio && dataFim ? { inicio: { gte: dataInicio, lt: dataFim } } : {}),
      },
      // `select` em vez de `include: true` — evita devolver o Usuario inteiro
      // do cliente (hash de senha incluído) pra agenda do funcionário.
      // telefone: alimenta o botão "Ligar para o cliente".
      include: { servico: true, pacote: true, cliente: { select: { id: true, nome: true, telefone: true } } },
      orderBy: { inicio: "asc" },
    });
    return this.anexarPagamento(agendamentos);
  }

  // Agenda de toda o lava jato (usada pelo app do dono), com filtro opcional por funcionário.
  async listarAgendaLavaJato(lavaJatoId: string, dataInicio?: Date, dataFim?: Date, funcionarioId?: string) {
    const agendamentos = await this.prisma.agendamento.findMany({
      where: {
        lavaJatoId,
        status: { not: StatusAgendamento.CANCELADO },
        ...(funcionarioId ? { funcionarioId } : {}),
        ...(dataInicio && dataFim ? { inicio: { gte: dataInicio, lt: dataFim } } : {}),
      },
      // Mesma correção acima (select em vez de include: true) pros dois
      // relacionamentos de Usuario — nenhum precisa do registro inteiro
      // (hash de senha, e-mail) só pra mostrar nome/telefone na agenda.
      include: {
        servico: true,
        pacote: true,
        cliente: { select: { id: true, nome: true, telefone: true } },
        funcionario: { include: { usuario: { select: { id: true, nome: true } } } },
      },
      orderBy: { inicio: "asc" },
    });
    return this.anexarPagamento(agendamentos);
  }

  // Junta o metodo/status do Pagamento de cada agendamento vindo do app
  // (ligado pelo grupoId, já que não é uma relação do Prisma — ver comentário
  // no schema) — hoje só usado pra agenda do funcionário/lavajato saberem
  // quando um agendamento está com Dinheiro ainda PENDENTE de confirmação
  // (ver EquipeScreen/LavaJatoAgendaScreen, botão "Marcar como pago").
  // Lançamento manual (sem grupoId) e agendamento coberto por pacote mensal
  // (grupoId sem Pagamento nenhum) simplesmente não têm `pagamento` nenhum.
  private async anexarPagamento<T extends { grupoId: string | null; origem: string }>(
    agendamentos: T[],
  ): Promise<(T & { pagamento: { metodo: string; status: string } | null })[]> {
    const grupoIds = [
      ...new Set(
        agendamentos
          .filter((a) => a.origem === OrigemAgendamento.CLIENTE_APP && a.grupoId)
          .map((a) => a.grupoId as string),
      ),
    ];
    if (grupoIds.length === 0) return agendamentos.map((a) => ({ ...a, pagamento: null }));

    const pagamentos = await this.prisma.pagamento.findMany({
      where: { grupoId: { in: grupoIds } },
      select: { grupoId: true, metodo: true, status: true },
    });
    const porGrupo = new Map(pagamentos.map((p) => [p.grupoId as string, p]));
    return agendamentos.map((a) => {
      const pagamento = a.grupoId ? porGrupo.get(a.grupoId) : undefined;
      return { ...a, pagamento: pagamento ? { metodo: pagamento.metodo, status: pagamento.status } : null };
    });
  }

  async cancelar(id: string, user: AuthUser) {
    const agendamento = await this.prisma.agendamento.findUnique({ where: { id }, include: { funcionario: true } });
    if (!agendamento) throw new NotFoundException("Agendamento não encontrado.");

    const podeCancelar =
      (user.papel === Papel.CLIENTE && agendamento.clienteId === user.id) ||
      (user.papel === Papel.FUNCIONARIO && agendamento.funcionario.usuarioId === user.id) ||
      (user.papel === Papel.LAVAJATO_ADMIN && agendamento.lavaJatoId === user.lavaJatoId);
    if (!podeCancelar) throw new ForbiddenException("Você não pode cancelar este agendamento.");

    // Se faz parte de um lote (vários serviços marcados juntos), cancela o
    // grupo inteiro — pro cliente, é "um" agendamento só.
    if (agendamento.grupoId) {
      await this.prisma.$transaction([
        this.prisma.agendamento.updateMany({
          where: { grupoId: agendamento.grupoId, status: { not: StatusAgendamento.CANCELADO } },
          data: { status: StatusAgendamento.CANCELADO },
        }),
        // Nunca chegou a ser pago (cliente cancelou antes de pagar) — não tem
        // o que estornar, só marca a cobrança como não vai mais acontecer.
        // Se JÁ estava aprovado, não mexe aqui: hoje não há estorno automático
        // por cancelamento (só por não comparecimento — ver marcarNaoCompareceu).
        this.prisma.pagamento.updateMany({
          where: { grupoId: agendamento.grupoId, status: StatusPagamento.PENDENTE },
          data: { status: StatusPagamento.RECUSADO },
        }),
      ]);
      return this.prisma.agendamento.findMany({ where: { grupoId: agendamento.grupoId } });
    }

    return this.prisma.agendamento.update({ where: { id }, data: { status: StatusAgendamento.CANCELADO } });
  }

  // Funcionário/dono confirma que recebeu o pagamento em dinheiro na mão do
  // cliente, presencialmente — o agendamento já nasceu CONFIRMADO (ver
  // criarLote), então isso só libera o Pagamento (PENDENTE -> APROVADO), que
  // por sua vez é o que `concluir()` exige pra permitir marcar o atendimento
  // como concluído/entrar no faturamento (ver FinanceiroService). Idempotente:
  // chamar de novo num pagamento já confirmado não dá erro.
  async confirmarPagamentoDinheiro(id: string, user: AuthUser) {
    const agendamento = await this.prisma.agendamento.findUnique({ where: { id }, include: { funcionario: true } });
    if (!agendamento) throw new NotFoundException("Agendamento não encontrado.");

    const podeConfirmar =
      (user.papel === Papel.FUNCIONARIO && agendamento.funcionario.usuarioId === user.id) ||
      (user.papel === Papel.LAVAJATO_ADMIN && agendamento.lavaJatoId === user.lavaJatoId);
    if (!podeConfirmar) throw new ForbiddenException("Você não pode confirmar o pagamento deste agendamento.");

    if (agendamento.origem !== OrigemAgendamento.CLIENTE_APP || !agendamento.grupoId) {
      throw new BadRequestException("Esse agendamento não tem uma cobrança em dinheiro pra confirmar.");
    }
    const pagamento = await this.prisma.pagamento.findFirst({ where: { grupoId: agendamento.grupoId } });
    if (!pagamento || pagamento.metodo !== MetodoPagamento.DINHEIRO) {
      throw new BadRequestException("Esse agendamento não está com pagamento em dinheiro.");
    }
    if (pagamento.status === StatusPagamento.RECUSADO || pagamento.status === StatusPagamento.ESTORNADO) {
      throw new BadRequestException("Esse pagamento foi cancelado e não pode ser confirmado.");
    }

    if (pagamento.status !== StatusPagamento.APROVADO) {
      await this.prisma.pagamento.update({ where: { id: pagamento.id }, data: { status: StatusPagamento.APROVADO } });
    }

    return this.prisma.agendamento.findMany({ where: { grupoId: agendamento.grupoId } });
  }

  // Cron a cada minuto: avisa por push o funcionário responsável assim que
  // chega o horário de um agendamento com Dinheiro ainda PENDENTE de
  // confirmação — é a rede de segurança pedida pra evitar o cliente sair sem
  // pagar (o funcionário recebe o lembrete bem na hora de atender, não só
  // quando olhar a agenda). Um aviso só por grupo (mesmo quando o cliente
  // marcou vários serviços juntos no mesmo horário).
  @Cron(CronExpression.EVERY_MINUTE)
  async avisarPagamentosDinheiroNoHorario() {
    const agora = new Date();
    // Janela curta: só o que passou a ser "hora de atender" desde a última
    // checagem (ou os últimos 5 min, na primeira rodada depois de o servidor
    // subir) — evita tanto perder agendamento quanto avisar o mesmo de novo
    // a cada minuto.
    const desde = this.ultimaChecagemLembreteDinheiro ?? new Date(agora.getTime() - 5 * 60_000);
    this.ultimaChecagemLembreteDinheiro = agora;

    const agendamentos = await this.prisma.agendamento.findMany({
      where: {
        origem: OrigemAgendamento.CLIENTE_APP,
        status: StatusAgendamento.CONFIRMADO,
        grupoId: { not: null },
        inicio: { gt: desde, lte: agora },
      },
      include: {
        funcionario: { include: { usuario: { select: { pushToken: true } } } },
        cliente: { select: { nome: true } },
      },
    });
    if (agendamentos.length === 0) return;

    const grupoIds = [...new Set(agendamentos.map((a) => a.grupoId as string))];
    const pagamentosDinheiroPendentes = await this.prisma.pagamento.findMany({
      where: { grupoId: { in: grupoIds }, metodo: MetodoPagamento.DINHEIRO, status: StatusPagamento.PENDENTE },
      select: { grupoId: true },
    });
    const gruposComDinheiroPendente = new Set(pagamentosDinheiroPendentes.map((p) => p.grupoId));

    const jaAvisados = new Set<string>();
    for (const a of agendamentos) {
      const grupoId = a.grupoId as string;
      if (!gruposComDinheiroPendente.has(grupoId) || jaAvisados.has(grupoId)) continue;
      jaAvisados.add(grupoId);

      const nomeCliente = a.cliente?.nome ?? a.clienteAvulsoNome ?? "O cliente";
      await this.push.enviarParaTokens(
        [a.funcionario.usuario.pushToken],
        "Pagamento em dinheiro",
        `${nomeCliente} vai pagar em dinheiro por este atendimento — confirme o recebimento no app assim que ele pagar, pra não esquecer.`,
        { tipo: "PAGAMENTO_DINHEIRO_PENDENTE", agendamentoId: a.id },
      );
    }
  }

  // O funcionário marca o atendimento como concluído (entra no financeiro
  // dele/do lava jato). Se veio do app do cliente, exige que o pagamento já
  // esteja aprovado — evita marcar como concluído (e contar no faturamento)
  // um horário que na verdade não foi pago ainda.
  async concluir(id: string, user: AuthUser) {
    const agendamento = await this.prisma.agendamento.findUnique({ where: { id }, include: { funcionario: true } });
    if (!agendamento) throw new NotFoundException("Agendamento não encontrado.");

    const podeConcluir =
      (user.papel === Papel.FUNCIONARIO && agendamento.funcionario.usuarioId === user.id) ||
      (user.papel === Papel.LAVAJATO_ADMIN && agendamento.lavaJatoId === user.lavaJatoId);
    if (!podeConcluir) throw new ForbiddenException("Você não pode concluir este agendamento.");

    if (agendamento.origem === OrigemAgendamento.CLIENTE_APP && agendamento.grupoId) {
      const pagamento = await this.prisma.pagamento.findFirst({ where: { grupoId: agendamento.grupoId } });
      if (pagamento && pagamento.status !== StatusPagamento.APROVADO) {
        throw new BadRequestException("O pagamento desse agendamento ainda não foi confirmado.");
      }
    }

    return this.prisma.agendamento.update({ where: { id }, data: { status: StatusAgendamento.CONCLUIDO } });
  }

  // Funcionário/lavajato marca que o cliente não apareceu no horário — retém
  // 50% do valor pago como multa (estornando o resto) e libera o profissional
  // pro resto da agenda. Aplica ao GRUPO inteiro (todos os serviços marcados
  // juntos nesse horário), já que "não comparecimento" é sobre o horário, não
  // sobre um serviço específico dentro dele.
  async marcarNaoCompareceu(id: string, user: AuthUser) {
    const agendamento = await this.prisma.agendamento.findUnique({ where: { id }, include: { funcionario: true } });
    if (!agendamento) throw new NotFoundException("Agendamento não encontrado.");

    const podeMarcar =
      (user.papel === Papel.FUNCIONARIO && agendamento.funcionario.usuarioId === user.id) ||
      (user.papel === Papel.LAVAJATO_ADMIN && agendamento.lavaJatoId === user.lavaJatoId);
    if (!podeMarcar) throw new ForbiddenException("Você não pode marcar isso nesse agendamento.");
    if (agendamento.status !== StatusAgendamento.CONFIRMADO) {
      throw new BadRequestException("Só é possível marcar não comparecimento em um agendamento confirmado.");
    }

    const grupoId = agendamento.grupoId ?? agendamento.id;
    const grupo = agendamento.grupoId
      ? await this.prisma.agendamento.findMany({ where: { grupoId: agendamento.grupoId } })
      : [agendamento];

    const pagamento = await this.prisma.pagamento.findFirst({ where: { grupoId } });

    await this.prisma.$transaction(
      grupo.map((a) =>
        this.prisma.agendamento.update({
          where: { id: a.id },
          data: {
            status: StatusAgendamento.NAO_COMPARECEU,
            // Sem multa em dinheiro quando o horário veio da cota de um
            // pacote mensal — não existe Pagamento avulso pra reter/estornar
            // aqui, o cliente já paga a mensalidade à parte. A vaga da
            // semana ainda é contada como usada (ver usosDaAssinaturaNaSemana).
            valorMultaCentavos: a.assinaturaPacoteId ? null : Math.round(a.precoCentavos * FRACAO_MULTA_NAO_COMPARECIMENTO),
          },
        }),
      ),
    );

    // Estorna 50% ao cliente (o resto fica retido com o lava jato como
    // multa) — só se realmente foi pago pelo app. Agendamento lançado
    // manualmente pelo lava jato (sem Pagamento) não tem o que estornar.
    if (pagamento && pagamento.status === StatusPagamento.APROVADO && pagamento.gatewayPagamentoId) {
      const valorEstornoCentavos = pagamento.valorCentavos - Math.round(pagamento.valorCentavos * FRACAO_MULTA_NAO_COMPARECIMENTO);
      try {
        const token = await this.mercadoPago.tokenDaLavaJato(agendamento.lavaJatoId);
        await this.mercadoPago.estornarPagamento(pagamento.gatewayPagamentoId, token, valorEstornoCentavos);
        await this.prisma.pagamento.update({
          where: { id: pagamento.id },
          data: { status: StatusPagamento.PARCIALMENTE_ESTORNADO, valorEstornadoCentavos: valorEstornoCentavos },
        });
      } catch (e) {
        // O agendamento já foi marcado como não comparecido de qualquer
        // forma (o lava jato não deve ficar travada esperando o Mercado
        // Pago) — mas registra bem alto, porque isso precisa de atenção
        // manual: o cliente não foi estornado.
        this.logger.error(
          `FALHA AO ESTORNAR multa de não comparecimento — pagamento ${pagamento.id}, agendamento ${id}: ${e}. Requer estorno manual.`,
        );
      }
    }

    return this.prisma.agendamento.findMany({ where: { grupoId } });
  }

  // ---------- helpers privados ----------

  // Campos do Agendamento que guardam o "retrato" do veículo no momento da
  // reserva (a agenda do lava jato mostra isso sem acessar o cadastro do cliente).
  private dadosDoVeiculo(veiculo: VeiculoParaAgendamento) {
    return {
      porte: veiculo.porte,
      veiculoId: veiculo.id,
      veiculoPlaca: veiculo.placa,
      veiculoDescricao: descricaoVeiculo({ marca: veiculo.marca, modelo: veiculo.modelo, cor: veiculo.cor }),
    };
  }

  // Percentuais por porte configurados pelo dono (ou o padrão, se ainda não
  // configurou) — aplicados sobre preço e duração base (HATCH) de cada item.
  private async ajustesDaLavaJato(lavaJatoId: string) {
    const lavaJato = await this.prisma.lavaJato.findUnique({
      where: { id: lavaJatoId },
      select: { ajustePrecoPorte: true, ajusteDuracaoPorte: true },
    });
    return {
      preco: normalizarAjustePorte(lavaJato?.ajustePrecoPorte, AJUSTE_PRECO_PORTE_PADRAO),
      duracao: normalizarAjustePorte(lavaJato?.ajusteDuracaoPorte, AJUSTE_DURACAO_PORTE_PADRAO),
    };
  }

  private async resolverItem(item: { servicoId?: string; pacoteId?: string }, porte: PorteVeiculo): Promise<ItemResolvido> {
    if (item.servicoId) {
      const servico = await this.prisma.servico.findUnique({ where: { id: item.servicoId } });
      if (!servico || !servico.ativo) throw new BadRequestException("Serviço inválido.");
      const ajustes = await this.ajustesDaLavaJato(servico.lavaJatoId);
      return {
        servicoId: servico.id,
        duracaoMinutos: duracaoParaPorte(servico.duracaoMinutos, porte, ajustes.duracao),
        precoCentavos: precoParaPorte(servico.precoCentavos, porte, ajustes.preco),
        lavaJatoId: servico.lavaJatoId,
      };
    }
    if (item.pacoteId) {
      const pacote = await this.prisma.pacote.findUnique({
        where: { id: item.pacoteId },
        include: { servicos: { include: { servico: true } } },
      });
      if (!pacote || !pacote.ativo) throw new BadRequestException("Pacote inválido.");
      const duracaoBaseMinutos = pacote.servicos.reduce((total, ps) => total + ps.servico.duracaoMinutos, 0) || 30;
      const ajustes = await this.ajustesDaLavaJato(pacote.lavaJatoId);
      return {
        pacoteId: pacote.id,
        duracaoMinutos: duracaoParaPorte(duracaoBaseMinutos, porte, ajustes.duracao),
        precoCentavos: precoParaPorte(pacote.precoCentavos, porte, ajustes.preco),
        lavaJatoId: pacote.lavaJatoId,
      };
    }
    throw new BadRequestException("Informe um serviço ou um pacote para cada item do agendamento.");
  }

  // Busca os funcionários ativos/disponíveis do lava jato junto com o
  // expediente semanal e as folgas que caem dentro do intervalo pedido —
  // tudo que é preciso pra calcular disponibilidade sem novas queries por dia.
  private funcionariosComAgenda(lavaJatoId: string, inicioIntervalo: Date, fimIntervalo: Date) {
    return this.prisma.funcionario.findMany({
      where: { lavaJatoId, ativo: true, disponivel: true },
      include: {
        horarios: true,
        folgas: { where: { inicio: { lt: fimIntervalo }, fim: { gt: inicioIntervalo } } },
      },
    });
  }

  private async garantirFuncionarioLivre(funcionarioId: string, inicio: Date, fim: Date, lavaJatoId?: string) {
    const funcionario = await this.prisma.funcionario.findUnique({
      where: { id: funcionarioId },
      include: {
        horarios: true,
        folgas: { where: { inicio: { lt: fim }, fim: { gt: inicio } } },
      },
    });
    if (!funcionario || !funcionario.ativo || !funcionario.disponivel) {
      throw new BadRequestException("Profissional indisponível para agendamento.");
    }
    if (lavaJatoId && funcionario.lavaJatoId !== lavaJatoId) {
      throw new BadRequestException("Este profissional não atende esse lava jato.");
    }

    if (funcionario.folgas.some((f) => f.inicio < fim && f.fim > inicio)) {
      throw new BadRequestException("Profissional de folga nesse horário. Escolha outro horário ou profissional.");
    }
    if (!dentroDoExpediente(funcionario, inicio, fim)) {
      throw new BadRequestException(
        "Horário fora do expediente do profissional (ou durante o horário de almoço). Escolha outro horário.",
      );
    }

    const conflito = await this.prisma.agendamento.findFirst({
      where: { funcionarioId, ...filtroStatusAtivo(), inicio: { lt: fim }, fim: { gt: inicio } },
    });
    if (conflito) throw new BadRequestException("Esse horário acabou de ser reservado. Escolha outro.");
    return funcionarioId;
  }

  private async escolherFuncionarioDisponivel(lavaJatoId: string, inicio: Date, fim: Date) {
    const funcionarios = await this.prisma.funcionario.findMany({
      where: { lavaJatoId, ativo: true, disponivel: true },
      include: {
        horarios: true,
        folgas: { where: { inicio: { lt: fim }, fim: { gt: inicio } } },
      },
    });

    for (const funcionario of funcionarios) {
      if (funcionario.folgas.some((f) => f.inicio < fim && f.fim > inicio)) continue;
      if (!dentroDoExpediente(funcionario, inicio, fim)) continue;

      const conflito = await this.prisma.agendamento.findFirst({
        where: { funcionarioId: funcionario.id, ...filtroStatusAtivo(), inicio: { lt: fim }, fim: { gt: inicio } },
      });
      if (!conflito) return funcionario.id;
    }
    throw new BadRequestException(
      "Nenhum profissional trabalha nesse horário. Escolha outro dia/horário — ou verifique se algum funcionário já cadastrou sua agenda.",
    );
  }

  private buscarAgendamentosNoIntervalo(funcionarioIds: string[], inicio: Date, fim: Date) {
    return this.prisma.agendamento.findMany({
      where: { funcionarioId: { in: funcionarioIds }, ...filtroStatusAtivo(), inicio: { lt: fim }, fim: { gt: inicio } },
      select: { funcionarioId: true, inicio: true, fim: true },
    });
  }
}

// CONFIRMADO sempre bloqueia o horário; PENDENTE (pagamento em andamento) só
// bloqueia enquanto ainda está "fresco" — depois de PENDENTE_EXPIRA_MINUTOS,
// trata como se o cliente tivesse desistido do pagamento (ver comentário na
// constante). Evita precisar de um job em background só pra liberar slots
// de pagamentos abandonados.
function filtroStatusAtivo() {
  return {
    OR: [
      { status: StatusAgendamento.CONFIRMADO },
      { status: StatusAgendamento.PENDENTE, criadoEm: { gte: new Date(Date.now() - PENDENTE_EXPIRA_MINUTOS * 60_000) } },
    ],
  };
}

// Quebra o expediente de um dia em uma ou duas janelas (antes/depois do
// almoço, se houver). Sem almoço cadastrado, é uma janela só.
function gerarJanelasDoDia(horario: HorarioTrabalho, dia: Date): { inicio: Date; fim: Date }[] {
  const inicio = combinarDataHora(dia, horario.horaInicio);
  const fim = combinarDataHora(dia, horario.horaFim);

  if (horario.inicioAlmoco && horario.fimAlmoco) {
    const inicioAlmoco = combinarDataHora(dia, horario.inicioAlmoco);
    const fimAlmoco = combinarDataHora(dia, horario.fimAlmoco);
    return [
      { inicio, fim: inicioAlmoco },
      { inicio: fimAlmoco, fim },
    ];
  }
  return [{ inicio, fim }];
}

// Gera os horários de início possíveis (de INTERVALO_ENTRE_INICIOS_MINUTOS em
// INTERVALO_ENTRE_INICIOS_MINUTOS) pro funcionário num dia, considerando seu
// expediente cadastrado (HorarioTrabalho) — se ele não trabalha nesse dia da
// semana, retorna lista vazia.
function slotsDoFuncionarioNoDia(
  funcionario: FuncionarioComAgenda,
  dia: Date,
  duracaoMinutos: number,
): { inicio: Date; fim: Date }[] {
  const diaSemana = dia.getDay();
  const horario = funcionario.horarios.find((h) => h.diaSemana === diaSemana);
  if (!horario) return [];

  const slots: { inicio: Date; fim: Date }[] = [];
  for (const janela of gerarJanelasDoDia(horario, dia)) {
    for (
      let inicio = new Date(janela.inicio);
      addMinutos(inicio, duracaoMinutos) <= janela.fim;
      inicio = addMinutos(inicio, INTERVALO_ENTRE_INICIOS_MINUTOS)
    ) {
      slots.push({ inicio: new Date(inicio), fim: addMinutos(inicio, duracaoMinutos) });
    }
  }
  return slots;
}

// Confere se [inicio, fim) cabe inteiro dentro de alguma janela do expediente
// do funicionário no dia de "inicio" — usado na hora de CRIAR o agendamento
// (fora do fluxo de "listar slots"), pra bloquear tentativas de marcar direto
// na API fora do horário de trabalho ou durante o almoço.
function dentroDoExpediente(funcionario: FuncionarioComAgenda, inicio: Date, fim: Date): boolean {
  const diaSemana = inicio.getDay();
  const horario = funcionario.horarios.find((h) => h.diaSemana === diaSemana);
  if (!horario) return false;
  return gerarJanelasDoDia(horario, inicio).some((janela) => inicio >= janela.inicio && fim <= janela.fim);
}

function slotLivre(
  agendamentos: { funcionarioId: string; inicio: Date; fim: Date }[],
  funcionarioId: string,
  inicio: Date,
  fim: Date,
): boolean {
  return !agendamentos.some((a) => a.funcionarioId === funcionarioId && a.inicio < fim && a.fim > inicio);
}

function folgaLivre(folgas: { inicio: Date; fim: Date }[], inicio: Date, fim: Date): boolean {
  return !folgas.some((f) => f.inicio < fim && f.fim > inicio);
}

function combinarDataHora(dia: Date, horaMinuto: string): Date {
  const [horas, minutos] = horaMinuto.split(":").map(Number);
  const data = new Date(dia);
  data.setHours(horas, minutos, 0, 0);
  return data;
}

function addMinutos(data: Date, minutos: number): Date {
  return new Date(data.getTime() + minutos * 60_000);
}

function formatarData(data: Date): string {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function formatarHorario(data: Date): string {
  const horas = String(data.getHours()).padStart(2, "0");
  const minutos = String(data.getMinutes()).padStart(2, "0");
  return `${horas}:${minutos}`;
}

// Traduz os motivos de recusa mais comuns que o Mercado Pago devolve em
// status_detail pra uma mensagem que faça sentido pro cliente final — o
// código cru (ex: "cc_rejected_insufficient_amount") não diz nada pra quem
// não é integrador. Lista não exaustiva de propósito: cobre os motivos mais
// frequentes, com uma mensagem genérica de fallback pros demais.
// Exportada (não só usada aqui) — a AssinaturasPagamentoService reusa a mesma
// tradução pra cobrança da mensalidade/anuidade do SaaS, mesmo mecanismo de
// cartão (ver comentário acima).
export function traduzirMotivoRecusaCartao(statusDetail: string | null): string {
  const mensagens: Record<string, string> = {
    cc_rejected_insufficient_amount: "Cartão sem limite suficiente para esse valor.",
    cc_rejected_bad_filled_security_code: "Código de segurança (CVV) incorreto.",
    cc_rejected_bad_filled_date: "Data de validade incorreta.",
    cc_rejected_bad_filled_card_number: "Número do cartão incorreto.",
    cc_rejected_bad_filled_other: "Dados do cartão incorretos.",
    cc_rejected_call_for_authorize: "O banco exige autorização — ligue para o emissor do cartão ou tente outro.",
    cc_rejected_card_disabled: "Cartão desabilitado. Entre em contato com o banco ou tente outro cartão.",
    cc_rejected_duplicated_payment: "Já existe um pagamento igual recente — aguarde alguns minutos ou tente outro cartão.",
    cc_rejected_high_risk: "O pagamento foi recusado por segurança. Tente outro cartão.",
    cc_rejected_max_attempts: "Número máximo de tentativas excedido. Tente outro cartão.",
    cc_rejected_invalid_installments: "Parcelamento inválido para esse cartão.",
    cc_rejected_other_reason: "O cartão recusou o pagamento.",
  };
  const mensagem = (statusDetail && mensagens[statusDetail]) || "O cartão recusou o pagamento.";
  return `Pagamento não aprovado: ${mensagem} Tente outro cartão ou pague com Pix.`;
}
