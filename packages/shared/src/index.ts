// Tipos e enums compartilhados entre a API (NestJS), o app mobile (React Native)
// e o painel web do SaaS (Next.js). Mantenha isso em sincronia com
// apps/api/prisma/schema.prisma sempre que o modelo de dados mudar.

// ============================= PAPÉIS (RBAC) =============================

// Não usamos `enum` (TypeScript) aqui de propósito: um `enum` é um tipo
// "nominal" — o TypeScript não aceita a string equivalente vinda de outro
// lugar (por exemplo, o enum que o Prisma gera a partir do schema.prisma)
// mesmo que o valor seja idêntico ("CLIENTE" === "CLIENTE"), o que quebra a
// build da API bem na hora do deploy. Esse padrão (objeto `as const` + tipo
// derivado) se comporta igual a um enum no dia a dia (`Papel.CLIENTE`,
// `Papel[]` etc.) mas é só uma união de strings por baixo, então é
// compatível com o tipo que o Prisma gera.
export const Papel = {
  CLIENTE: "CLIENTE",
  FUNCIONARIO: "FUNCIONARIO",
  LAVAJATO_ADMIN: "LAVAJATO_ADMIN", // dono/gestor do lava jato
  SAAS_ADMIN: "SAAS_ADMIN", // administrador da plataforma (dono do SaaS)
} as const;
export type Papel = (typeof Papel)[keyof typeof Papel];

// ============================= VEÍCULOS (PORTE) =============================

// Porte do veículo — é o que define o preço e o tempo de cada serviço no lava
// jato (uma lavagem de moto custa/leva menos que a de uma picape). O mesmo
// padrão `as const` do Papel (compatível com o enum que o Prisma gera).
export const PorteVeiculo = {
  MOTO: "MOTO",
  HATCH: "HATCH",
  SEDAN: "SEDAN",
  SUV: "SUV",
  PICKUP: "PICKUP",
} as const;
export type PorteVeiculo = (typeof PorteVeiculo)[keyof typeof PorteVeiculo];

export const PORTES_VEICULO: PorteVeiculo[] = [
  PorteVeiculo.MOTO,
  PorteVeiculo.HATCH,
  PorteVeiculo.SEDAN,
  PorteVeiculo.SUV,
  PorteVeiculo.PICKUP,
];

export const ROTULO_PORTE: Record<PorteVeiculo, string> = {
  MOTO: "Moto",
  HATCH: "Hatch / compacto",
  SEDAN: "Sedan",
  SUV: "SUV",
  PICKUP: "Picape / Van",
};

// Porte de referência: o preço e a duração cadastrados em cada serviço/pacote
// são os de um veículo HATCH; os demais portes são calculados em cima disso
// pelos percentuais abaixo (ajustáveis por lava jato em Mais > Preço por porte).
export const PORTE_BASE: PorteVeiculo = PorteVeiculo.HATCH;

// Percentual aplicado ao valor base (100 = mesmo valor do HATCH).
export type AjustePorte = Record<PorteVeiculo, number>;

export const AJUSTE_PRECO_PORTE_PADRAO: AjustePorte = { MOTO: 70, HATCH: 100, SEDAN: 115, SUV: 135, PICKUP: 160 };
export const AJUSTE_DURACAO_PORTE_PADRAO: AjustePorte = { MOTO: 80, HATCH: 100, SEDAN: 110, SUV: 125, PICKUP: 140 };

// Valores vindos do banco (JSON) podem estar ausentes ou incompletos — completa
// o que faltar com o padrão e descarta o que não for número positivo.
export function normalizarAjustePorte(valor: unknown, padrao: AjustePorte): AjustePorte {
  const origem = valor && typeof valor === "object" ? (valor as Record<string, unknown>) : {};
  const resultado = { ...padrao };
  for (const porte of PORTES_VEICULO) {
    const v = Number(origem[porte]);
    if (Number.isFinite(v) && v > 0 && v <= 1000) resultado[porte] = Math.round(v);
  }
  return resultado;
}

// Preço (em centavos) de um serviço/pacote para o porte informado.
export function precoParaPorte(precoBaseCentavos: number, porte: PorteVeiculo, ajuste: AjustePorte): number {
  return Math.round((precoBaseCentavos * ajuste[porte]) / 100);
}

// Duração (em minutos, arredondada para múltiplos de 5) para o porte informado.
export function duracaoParaPorte(minutosBase: number, porte: PorteVeiculo, ajuste: AjustePorte): number {
  const bruto = (minutosBase * ajuste[porte]) / 100;
  return Math.max(5, Math.round(bruto / 5) * 5);
}

// Veículo cadastrado pelo cliente (GET/POST/PATCH/DELETE /veiculos). A placa é
// guardada sem máscara, em maiúsculas (ex: "ABC1D23").
export interface Veiculo {
  id: string;
  clienteId: string;
  placa: string;
  marca?: string | null;
  modelo: string;
  cor?: string | null;
  porte: PorteVeiculo;
  criadoEm: string;
}

// Entrada de POST /veiculos e PATCH /veiculos/:id.
export interface VeiculoInput {
  placa: string;
  marca?: string;
  modelo: string;
  cor?: string;
  porte: PorteVeiculo;
}

// Normaliza uma placa digitada (remove tudo que não for letra/número, caixa alta).
export function normalizarPlaca(placa: string): string {
  return placa.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

// Descrição curta usada na agenda do lava jato ("Gol Branco · ABC1D23").
export function descricaoVeiculo(v: { marca?: string | null; modelo?: string | null; cor?: string | null; placa?: string | null }): string {
  const nome = [v.marca, v.modelo, v.cor].filter(Boolean).join(" ");
  return [nome, v.placa].filter(Boolean).join(" · ");
}

// ============================= ENDEREÇO =============================

// Endereço estruturado (CEP + campos separados) — formato ENVIADO pela API
// no cadastro de CLIENTE/FUNCIONARIO/LAVAJATO e nas edições depois. O app
// preenche logradouro/bairro/cidade/uf a partir do CEP (consulta ViaCEP)
// antes de enviar; numero/complemento continuam digitados à mão. Ver
// EnderecoDto/EnderecoUtil na API (mesmo formato, espelhado).
export interface Endereco {
  cep: string;
  logradouro: string;
  numero: string;
  complemento?: string;
  bairro: string;
  cidade: string;
  uf: string;
}

// Os mesmos campos como vêm GRAVADOS (opcionais/nullable) num Usuario ou
// numa LavaJato já cadastrados — `endereco` é o texto já formatado (ver
// EnderecoUtil.montarEnderecoCompleto), pronto pra exibir sem juntar os
// campos de novo.
export interface EnderecoCampos {
  cep?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  endereco?: string | null;
}

// ============================= USUÁRIO =============================

// ATENÇÃO (privacidade): este tipo é só para a visão "meu-perfil" (o próprio
// usuário vendo os próprios dados) — nunca reutilize `Usuario` para
// representar como um FUNCIONARIO aparece pra um CLIENTE, ou como um CLIENTE
// aparece pra uma LAVAJATO/FUNCIONARIO. Esses casos têm seus próprios tipos
// restritos (ver FuncionarioPublico, FuncionarioDetalhado) que não incluem e
// não devem incluir os campos de endereço (EnderecoCampos).
export interface Usuario extends EnderecoCampos {
  id: string;
  nome: string;
  email: string;
  telefone?: string | null;
  papel: Papel;
  lavaJatoId?: string | null; // null para CLIENTE (pode agendar em várias) e SAAS_ADMIN
  criadoEm: string;
}

// ============================= LAVAJATO (TENANT) =============================

export interface LavaJato extends EnderecoCampos {
  id: string;
  nome: string;
  slug: string;
  telefone?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  // Data URL (base64) da logo, já redimensionada pela API — ver
  // LavaJatosService.atualizarLogo. null/undefined = sem logo enviada ainda.
  logoUrl?: string | null;
  // Percentuais (100 = preço/tempo do HATCH) aplicados por porte do veículo —
  // ver AjustePorte/precoParaPorte. null/ausente = usa o padrão.
  ajustePrecoPorte?: Partial<AjustePorte> | null;
  ajusteDuracaoPorte?: Partial<AjustePorte> | null;
  notaMedia: number;
  totalAvaliacoes: number;
  // Chave PÚBLICA da conta Mercado Pago do lava jato (diferente do access
  // token — essa é segura de expor ao app do cliente) — usada para
  // tokenizar o cartão direto no aparelho antes de mandar pro servidor (ver
  // CartaoScreen no app e MercadoPagoService.criarPagamentoCartao na API).
  // null/undefined = lava jato ainda não conectou o Mercado Pago.
  mercadoPagoPublicKey?: string | null;
  criadoEm: string;
}

// Retorno de GET /lavajatos/proximas — LavaJato + distância calculada a
// partir da localização atual do cliente (ver LavaJatosService.listarProximas).
export interface LavaJatoProxima extends LavaJato {
  distanciaKm: number;
  jaAgendou: boolean; // o cliente logado já teve algum agendamento nesse lava jato
}

// Retorno público de GET /lavajatos/:id/publico (usado pela Home do cliente,
// que não tem permissão pra ler o lava jato inteira via GET /lavajatos/:id).
export type LavaJatoPublica = Pick<
  LavaJato,
  | "id"
  | "nome"
  | "endereco"
  | "telefone"
  | "latitude"
  | "longitude"
  | "logoUrl"
  | "ajustePrecoPorte"
  | "ajusteDuracaoPorte"
  | "notaMedia"
  | "totalAvaliacoes"
  | "mercadoPagoPublicKey"
>;

// ============================= SERVIÇOS E PACOTES =============================

export interface Servico {
  id: string;
  lavaJatoId: string;
  nome: string;
  descricao?: string | null;
  duracaoMinutos: number;
  precoCentavos: number;
  ativo: boolean;
}

// Um serviço incluído num pacote, com o serviço já populado — é assim que a
// API sempre devolve um Pacote (list/create/update), nunca como servicoIds
// soltos (esse formato flat é só o formato de ENTRADA do create/update, ver
// CreatePacoteDto na API).
export interface PacoteServicoItem {
  servicoId: string;
  servico: Servico;
}

export interface Pacote {
  id: string;
  lavaJatoId: string;
  nome: string;
  descricao?: string | null;
  precoCentavos: number;
  servicos: PacoteServicoItem[];
  ativo: boolean;
}

// Retorno público de GET /lavajatos/:id/funcionarios (passo "escolher profissional").
export interface FuncionarioPublico {
  id: string;
  cargo: string;
  usuario: { id: string; nome: string };
}

// ============================= EQUIPE (GESTÃO) =============================

// Retorno de GET /funcionarios (visão do LAVAJATO_ADMIN sobre a própria equipe).
export interface FuncionarioDetalhado {
  id: string;
  cargo: string;
  comissaoPercentual: number;
  ativo: boolean;
  disponivel: boolean;
  // telefone: só o lava jato (dono) tem acesso — ver FuncionariosService e a
  // tela Equipe, que é a única que edita/mostra esse campo. O próprio
  // funcionário não vê o telefone dele aqui (ver FuncionarioPerfilScreen).
  usuario: { id: string; nome: string; email: string; telefone?: string | null };
}

// Horário de trabalho de um dia da semana (diaSemana: 0=domingo ... 6=sábado,
// igual ao Date.getDay() do JS). Sem uma linha pra um dia = não trabalha nesse dia.
export interface HorarioTrabalho {
  id: string;
  funcionarioId: string;
  diaSemana: number;
  horaInicio: string; // "HH:mm"
  horaFim: string; // "HH:mm"
  inicioAlmoco?: string | null;
  fimAlmoco?: string | null;
}

// Corpo de PUT /funcionarios/meus-horarios — substitui a semana inteira de uma vez.
export interface DefinirHorarioTrabalho {
  diaSemana: number;
  horaInicio: string;
  horaFim: string;
  inicioAlmoco?: string;
  fimAlmoco?: string;
}

// Bloqueio pontual de agenda (folga, consulta, férias etc).
export interface Folga {
  id: string;
  funcionarioId: string;
  inicio: string; // ISO datetime
  fim: string; // ISO datetime
  motivo?: string | null;
}

// ============================= AVALIAÇÕES (ESTRELAS) =============================

export interface Avaliacao {
  id: string;
  lavaJatoId: string;
  clienteId: string;
  nota: number; // 1 a 5
  comentario?: string | null;
  criadoEm: string;
}

// Devolvida por GET /lavajatos/avaliacao-pendente (ver
// LavaJatosService.buscarAvaliacaoPendente) — o lava jato mais antiga onde o
// cliente já foi atendido (horário já passou, não cancelado) e ainda não
// avaliou. É o que alimenta o popup de avaliação pós-atendimento no app (ver
// PopupAvaliacaoPendente), que aparece sozinho ao abrir/voltar pro app em vez
// de depender do cliente lembrar de ir na tela do lava jato avaliar.
export interface AvaliacaoPendente {
  lavaJatoId: string;
  nome: string;
  atendidoEm: string; // ISO — horário (fim) do atendimento que liberou a avaliação
}

// ============================= AGENDAMENTOS =============================

// Mesmo padrão explicado acima em Papel (compatível com o enum do Prisma).
export const StatusAgendamento = {
  PENDENTE: "PENDENTE",
  CONFIRMADO: "CONFIRMADO",
  CONCLUIDO: "CONCLUIDO",
  CANCELADO: "CANCELADO",
  // Cliente não apareceu no horário marcado — gera multa de 50% (ver
  // valorMultaCentavos) e entra no faturamento junto com CONCLUIDO.
  NAO_COMPARECEU: "NAO_COMPARECEU",
} as const;
export type StatusAgendamento = (typeof StatusAgendamento)[keyof typeof StatusAgendamento];

// De onde veio o agendamento: pelo cliente no app (com pagamento) ou lançado
// manualmente pelo próprio lava jato (atendimento presencial, sem cobrança
// pelo app).
export const OrigemAgendamento = {
  CLIENTE_APP: "CLIENTE_APP",
  LAVAJATO_MANUAL: "LAVAJATO_MANUAL",
} as const;
export type OrigemAgendamento = (typeof OrigemAgendamento)[keyof typeof OrigemAgendamento];

// Texto padrão exibido no momento de confirmar/pagar um agendamento pelo
// app — ver AgendamentosService/telas de pagamento. Centralizado aqui pra
// não ficar cada tela com uma redação diferente.
export const AVISO_NAO_COMPARECIMENTO =
  "Política de cancelamento: em caso de não comparecimento ao horário agendado sem cancelamento prévio, será cobrada uma multa equivalente a 50% do valor do serviço reservado.";

export interface Agendamento {
  id: string;
  lavaJatoId: string;
  // null quando é um cliente avulso lançado manualmente pelo lava jato (ver
  // clienteAvulsoNome/clienteAvulsoTelefone e origem).
  clienteId?: string | null;
  clienteAvulsoNome?: string | null;
  clienteAvulsoTelefone?: string | null;
  // Veículo atendido: `porte` define preço/duração (ver precoParaPorte); a
  // placa e a descrição são um "retrato" do momento do agendamento (a agenda
  // do lava jato mostra isso sem precisar acessar o cadastro do cliente).
  porte: PorteVeiculo;
  veiculoId?: string | null;
  veiculoPlaca?: string | null;
  veiculoDescricao?: string | null;
  funcionarioId: string;
  servicoId?: string | null;
  pacoteId?: string | null;
  inicio: string; // ISO datetime
  fim: string; // ISO datetime
  precoCentavos: number;
  status: StatusAgendamento;
  origem: OrigemAgendamento;
  criadoEm: string;
  // Agrupa vários serviços marcados juntos no mesmo horário (ver schema.prisma).
  // Agendamentos antigos (de antes dessa funcionalidade) têm isso null.
  grupoId?: string | null;
  // Preenchido quando o horário foi usado pela cota do pacote mensal do
  // cliente em vez de pago avulso — nesse caso não existe Pagamento pra esse grupoId.
  assinaturaPacoteId?: string | null;
  // Só quando status = NAO_COMPARECEU: os 50% retidos como multa.
  valorMultaCentavos?: number | null;
  // A API sempre devolve esses relacionamentos populados via `include` (ver
  // AgendamentosService) — opcionais aqui só porque nem toda rota inclui todos
  // (ex: listarAgendaFuncionario não inclui `funcionario`, já que é o próprio).
  servico?: Pick<Servico, "id" | "nome" | "duracaoMinutos" | "precoCentavos"> | null;
  pacote?: Pick<Pacote, "id" | "nome" | "precoCentavos"> | null;
  funcionario?: { id: string; cargo: string; usuario: { id: string; nome: string } };
  cliente?: { id: string; nome: string; telefone?: string | null } | null;
  // Só vem populado em "meus agendamentos" (o cliente pode agendar em várias
  // lava jatos, diferente da agenda do funcionário/dono, que já sabe qual é
  // o próprio lava jato) — usado pra mostrar o nome e o botão "Como chegar".
  lavaJato?: { id: string; nome: string; endereco?: string | null; latitude?: number | null; longitude?: number | null; telefone?: string | null } | null;
  // Só vem populado na agenda do funcionário/lavajato (ver
  // AgendamentosService.listarAgendaFuncionario/listarAgendaLavaJato) —
  // metodo/status do Pagamento ligado pelo grupoId. É o que a tela usa pra
  // saber quando mostrar "Marcar como pago" (metodo DINHEIRO ainda PENDENTE).
  // null quando não veio do app (lançamento manual) ou foi coberto por cota
  // de pacote mensal (sem Pagamento nenhum).
  pagamento?: { metodo: MetodoPagamento; status: StatusPagamento } | null;
}

// Retorno de POST /agendamentos/lote (e POST /agendamentos, que por baixo faz
// a mesma coisa com um item só): os agendamentos criados (PENDENTE até o
// pagamento confirmar) e a cobrança gerada — a tela de pagamento usa
// `pagamento` pra mostrar o QR do Pix ou abrir o checkout do cartão.
export interface AgendamentoLoteCriado {
  agendamentos: Agendamento[];
  // null quando o lote inteiro foi coberto pela cota de uma assinatura de
  // pacote mensal (ver usarAssinaturaPacoteId/CriarAgendamentoLoteInput) — aí
  // o agendamento já nasce CONFIRMADO, sem cobrança avulsa nenhuma.
  pagamento: Pagamento | null;
  // Texto de aviso sobre a multa de não comparecimento — mesmo valor de
  // AVISO_NAO_COMPARECIMENTO, devolvido pronto pra exibir na tela de pagamento.
  aviso: string;
}

// Corpo de POST /agendamentos/lote — o cliente pode marcar vários serviços
// (inclusive repetidos, ex: 2x lavagem, dois carros da família) num único horário,
// feitos em sequência pelo mesmo profissional a partir de "inicio".
export interface ItemAgendamentoLote {
  servicoId?: string;
  pacoteId?: string;
}

export interface CriarAgendamentoLoteInput {
  veiculoId: string; // veículo do cliente que será atendido (define preço e duração)
  funcionarioId?: string; // se omitido, o servidor escolhe qualquer profissional livre
  inicio: string; // ISO datetime
  itens: ItemAgendamentoLote[];
  // Como pagar por esse lote: PIX/CARTAO gera uma cobrança avulsa (ver
  // Pagamento); se omitido e o cliente tiver uma assinatura de pacote mensal
  // ativa que cubra os itens (mesmos serviços, dia da semana permitido, cota
  // não esgotada), o servidor usa a cota do pacote em vez de cobrar — ver
  // usarAssinaturaPacoteId pra forçar/escolher qual assinatura usar.
  metodoPagamento?: MetodoPagamento;
  usarAssinaturaPacoteId?: string;
  // Só quando metodoPagamento = CARTAO: dados do cartão já tokenizado no
  // próprio app (nunca o número do cartão em si) — ver CartaoScreen e
  // MercadoPagoService.criarPagamentoCartao. O pagamento é cobrado na hora,
  // sem sair do app nem abrir navegador.
  cartaoToken?: string; // token de uso único gerado pelo SDK/API do Mercado Pago no aparelho
  cartaoBin?: string; // 6 primeiros dígitos do cartão, usados pra identificar a bandeira
  cartaoCpf?: string; // CPF do titular, exigido pelo Mercado Pago em pagamentos com cartão
  // Identificador do aparelho gerado pelo script antifraude do Mercado Pago
  // (window.MP_DEVICE_SESSION_ID via https://www.mercadopago.com/v2/security.js,
  // capturado numa WebView oculta em CartaoScreen — ver X-Meli-Session-Id em
  // MercadoPagoService.criarPagamentoCartao). Ajuda o antifraude do MP a
  // avaliar o risco da transação (histórico de rejeições "high_risk"); opcional
  // porque a coleta pode falhar/expirar sem impedir o pagamento.
  cartaoDeviceId?: string;
}

// Corpo de POST /agendamentos/manual (lançado pelo próprio lava jato — ver
// OrigemAgendamento.LAVAJATO_MANUAL). Não passa por pagamento pelo app.
export interface CriarAgendamentoManualInput {
  porte: PorteVeiculo; // porte do veículo atendido (define preço e duração)
  veiculoPlaca?: string;
  veiculoDescricao?: string; // ex: "Gol branco"
  funcionarioId: string;
  inicio: string;
  itens: ItemAgendamentoLote[];
  clienteId?: string; // cliente já cadastrado no app
  clienteAvulsoNome?: string; // OU nome/telefone de alguém sem conta
  clienteAvulsoTelefone?: string;
  // Como o lava jato recebeu por fora (dinheiro, Pix fora do app, cartão na
  // maquininha própria) — omitido = Dinheiro. Ver Agendamento.metodoPagamentoManual.
  metodoPagamento?: MetodoPagamento;
}

// ============================= PAGAMENTOS DO CLIENTE =============================

export const MetodoPagamento = {
  PIX: "PIX",
  CARTAO: "CARTAO",
  // Usado tanto em lançamento manual (CriarAgendamentoManualInput, sem
  // Pagamento nenhum) quanto em agendamento feito pelo cliente no app
  // (CriarAgendamentoLoteInput) — nesse segundo caso cria um Pagamento de
  // verdade, só que PENDENTE até o funcionário/lavajato confirmarem o
  // recebimento presencial (nunca passa pelo Mercado Pago, ver
  // AgendamentosService.confirmarPagamentoDinheiro).
  DINHEIRO: "DINHEIRO",
} as const;
export type MetodoPagamento = (typeof MetodoPagamento)[keyof typeof MetodoPagamento];

export const StatusPagamento = {
  PENDENTE: "PENDENTE",
  APROVADO: "APROVADO",
  RECUSADO: "RECUSADO",
  ESTORNADO: "ESTORNADO",
  PARCIALMENTE_ESTORNADO: "PARCIALMENTE_ESTORNADO",
} as const;
export type StatusPagamento = (typeof StatusPagamento)[keyof typeof StatusPagamento];

export interface Pagamento {
  id: string;
  // Cobre todos os agendamentos desse grupo (ver comentário no schema.prisma).
  grupoId?: string | null;
  clienteId: string;
  lavaJatoId: string;
  metodo: MetodoPagamento;
  status: StatusPagamento;
  valorCentavos: number;
  valorEstornadoCentavos: number;
  // Pix: dados pra exibir o QR/copia-e-cola (só quando metodo=PIX e ainda PENDENTE).
  pixQrCodeBase64?: string | null;
  pixCopiaECola?: string | null;
  // Legado: link do Checkout Pro do Mercado Pago. O pagamento com cartão
  // agora é feito direto no app (formulário nativo + tokenização — ver
  // CartaoScreen/MercadoPagoService.criarPagamentoCartao), então isso fica
  // sempre null em pagamentos novos; mantido só por compatibilidade de tipo.
  checkoutUrl?: string | null;
  // Preenchida só quando metodo=CARTAO, status=PENDENTE e o Mercado Pago
  // exigiu autenticação 3DS do titular (ver MercadoPagoService, histórico de
  // set/2026 sobre pagamentos recusados como "high_risk" de cara) — o app
  // (PagamentoScreen) abre essa URL numa WebView pro cliente confirmar com o
  // próprio banco; o poll de status normal (já existente) detecta sozinho
  // quando o desafio termina (aprovado/recusado) ou expira (40 min).
  desafio3dsUrl?: string | null;
  criadoEm: string;
}

// Status da conexão do lava jato com sua própria conta Mercado Pago (modelo
// marketplace — ver LavaJato.mercadoPagoAccessToken no schema). O cliente só
// consegue pagar um agendamento se o lava jato estiver conectada.
export interface StatusConexaoMercadoPago {
  conectado: boolean;
  conectadoEm?: string | null;
}

// ============================= PACOTES MENSAIS =============================

export const StatusAssinaturaPacote = {
  PENDENTE: "PENDENTE",
  ATIVA: "ATIVA",
  INADIMPLENTE: "INADIMPLENTE",
  CANCELADA: "CANCELADA",
} as const;
export type StatusAssinaturaPacote = (typeof StatusAssinaturaPacote)[keyof typeof StatusAssinaturaPacote];

export interface PacoteMensal {
  id: string;
  lavaJatoId: string;
  nome: string;
  descricao?: string | null;
  precoCentavos: number;
  vezesPorSemana: number;
  diasSemanaPermitidos: number[]; // 0=domingo ... 6=sábado
  servicos: PacoteServicoItem[];
  ativo: boolean;
}

export interface AssinaturaPacoteCliente {
  id: string;
  pacoteMensalId: string;
  clienteId: string;
  lavaJatoId: string;
  // Veículo coberto por essa assinatura — o preço mensal depende do porte dele
  // e a cota só pode ser usada em agendamentos desse mesmo veículo.
  veiculoId: string;
  veiculo?: Veiculo;
  status: StatusAssinaturaPacote;
  // Pix ou Cartão (ver PacotesMensaisService.assinar).
  metodoPagamento: MetodoPagamento;
  // true só quando metodoPagamento=CARTAO e o cliente autorizou a cobrança
  // recorrente direto no app (sem checkout hospedado) — ver
  // MercadoPagoService.criarPreapprovalComCartao. Quando false, cada período
  // é cobrado avulso e o cliente precisa voltar no app pra pagar de novo
  // (ver pagamentoPendente abaixo) quando proximaCobrancaEm vencer.
  renovacaoAutomatica: boolean;
  inicioEm: string;
  proximaCobrancaEm?: string | null;
  pacoteMensal?: PacoteMensal;
  // Quantas vezes já usou o pacote na semana corrente (ver
  // PacotesMensaisService) — usado pra mostrar "2 de 3 usos essa semana".
  usosNaSemana?: number;
  // Pagamento PENDENTE mais recente de um período avulso (Pix, ou Cartão sem
  // renovação automática) — presente quando o cliente iniciou mas não
  // concluiu o pagamento desse período (ver PacotesMensaisService.minhasAssinaturas).
  pagamentoPendente?: Pagamento | null;
}

// Corpo de POST /pacotes-mensais/:id/assinar — ver PacotesMensaisService.assinar
// e AssinarPacoteMensalResultado (a resposta) pro resto do fluxo. Mesmo
// formato de dados de cartão que CriarAgendamentoLoteInput.
export interface AssinarPacoteMensalInput {
  veiculoId: string; // veículo que será coberto pelo pacote mensal
  metodoPagamento: MetodoPagamento; // PIX ou CARTAO
  // Só considerado quando metodoPagamento=CARTAO: true assina com cobrança
  // recorrente automática (sem o cliente precisar voltar no app todo mês).
  automatico?: boolean;
  cartaoToken?: string;
  cartaoBin?: string;
  cartaoCpf?: string;
  cartaoDeviceId?: string;
}

// Retorno de POST /pacotes-mensais/:id/assinar — tudo resolvido dentro do
// app, sem redirecionar pro site do Mercado Pago (ver
// PacotesMensaisService.assinar):
// - automatico=true (Cartão com renovação automática): `status` já diz se
//   autorizou na hora ("ATIVA") ou se falta confirmação do Mercado Pago
//   ("PENDENTE", resolvido pelo webhook); `pagamento` sempre null.
// - automatico=false (Pix, ou Cartão sem renovação automática): `pagamento`
//   traz o Pagamento desse período (QR code do Pix, ou já aprovado/recusado
//   no caso do cartão) pro app mostrar/aguardar confirmação (ver GET
//   pacotes-mensais/pagamentos/:id pro polling); `status` sempre null.
export interface AssinarPacoteMensalResultado {
  assinaturaId: string;
  automatico: boolean;
  status: "ATIVA" | "PENDENTE" | null;
  pagamento: Pagamento | null;
}

// ============================= FINANCEIRO =============================

// Percentual de comissão do funcionário sobre cada atendimento concluído.
// Guardado na relação Funcionario (ver Prisma) — aqui só o resumo agregado.
// atendimentos conta só CONCLUIDO; faturamentoCentavos inclui também a multa
// retida (50%) de agendamentos NAO_COMPARECEU — ver multasCentavos.
export interface ResumoFinanceiro {
  faturamentoCentavos: number;
  comissaoCentavos: number;
  comissoesCentavos?: number; // alguns endpoints (resumo do lava jato) usam o plural — ver FinanceiroService
  multasCentavos: number; // parte do faturamentoCentavos vinda de não comparecimentos
  lucroCentavos: number; // só relevante no resumo do lava jato (faturamento - comissões)
  atendimentos: number;
  periodo: "hoje" | "semana" | "mes";
  porFuncionario?: Array<{ funcionarioId: string; nome: string; faturamentoCentavos: number; comissaoCentavos: number }>;
  porServico?: Array<{ nome: string; quantidade: number; faturamentoCentavos: number }>;
}

// ============================= PLANOS E ASSINATURA DO SAAS =============================

// Mesmo padrão explicado acima em Papel (compatível com o enum do Prisma).
export const TipoDesconto = {
  PERCENTUAL: "PERCENTUAL",
  VALOR_FIXO: "VALOR_FIXO",
} as const;
export type TipoDesconto = (typeof TipoDesconto)[keyof typeof TipoDesconto];

export const PeriodicidadeAssinatura = {
  MENSAL: "MENSAL",
  ANUAL: "ANUAL",
} as const;
export type PeriodicidadeAssinatura = (typeof PeriodicidadeAssinatura)[keyof typeof PeriodicidadeAssinatura];

export interface Plano {
  id: string;
  nome: string;
  precoCentavos: number;
  limiteFuncionarios: number | null; // null = ilimitado
  recursos: string[];
  ativo: boolean;
  // Desconto do plano ANUAL — ver calcularPrecoAnualCentavos abaixo.
  descontoAnualTipo: TipoDesconto;
  descontoAnualValor: number;
  // Atendimento prioritário — libera o WhatsApp na tela "Suporte" do app pra
  // quem está num lava jato nesse plano (ver ConfiguracoesService.obterSuporte).
  atendimentoPrioritario: boolean;
  whatsappSuporte?: string | null;
}

// Preço do plano anual (12x o mensal, com o desconto configurado pelo
// SAAS_ADMIN — ver admin-web/planos). Usado tanto lá (preview do valor
// enquanto configura) quanto no app (tela de Assinatura, ao escolher
// periodicidade). Nunca deixa o resultado ficar negativo (um VALOR_FIXO maior
// que o total anual zeraria a cobrança, não a tornaria negativa).
export function calcularPrecoAnualCentavos(precoMensalCentavos: number, tipo: TipoDesconto, valor: number): number {
  const totalSemDesconto = precoMensalCentavos * 12;
  const descontoCentavos = tipo === TipoDesconto.PERCENTUAL ? Math.round((totalSemDesconto * valor) / 100) : Math.round(valor);
  return Math.max(0, totalSemDesconto - descontoCentavos);
}

// Mesmo padrão explicado acima em Papel (compatível com o enum do Prisma).
export const StatusAssinatura = {
  TRIAL: "TRIAL",
  ATIVA: "ATIVA",
  INADIMPLENTE: "INADIMPLENTE",
  CANCELADA: "CANCELADA",
} as const;
export type StatusAssinatura = (typeof StatusAssinatura)[keyof typeof StatusAssinatura];

export interface Assinatura {
  id: string;
  lavaJatoId: string;
  planoId: string;
  status: StatusAssinatura;
  inicioEm: string;
  proximaCobrancaEm: string | null;
  periodicidade: PeriodicidadeAssinatura;
}

// Mesmo padrão explicado acima em Papel (compatível com o enum do Prisma).
export const StatusFatura = {
  PAGA: "PAGA",
  PENDENTE: "PENDENTE",
  ATRASADA: "ATRASADA",
} as const;
export type StatusFatura = (typeof StatusFatura)[keyof typeof StatusFatura];

export interface Fatura {
  id: string;
  assinaturaId: string;
  lavaJatoId: string;
  valorCentavos: number;
  vencimentoEm: string;
  status: StatusFatura;
  metodoPagamento?: string | null;
}

// Tentativa de pagamento nativo (Pix ou cartão, direto no app) da mensalidade
// ou anuidade do SaaS — mesmo formato de Pagamento (agendamento do cliente),
// só que sem grupoId/clienteId. Ver PagamentoAssinatura no schema e a tela de
// Assinatura no mobile (mesmo componente de pagamento do cliente final).
export interface PagamentoAssinatura {
  id: string;
  assinaturaId: string;
  planoId: string;
  periodicidade: PeriodicidadeAssinatura;
  metodo: MetodoPagamento;
  status: StatusPagamento;
  valorCentavos: number;
  pixQrCodeBase64?: string | null;
  pixCopiaECola?: string | null;
  desafio3dsUrl?: string | null;
  criadoEm: string;
}

// Cartão salvo pelo DONO do lava jato pra pagar a própria mensalidade do SaaS
// (conta da plataforma) — mesmo formato de CartaoSalvo (cliente final pagando
// o lava jato), ver CartaoSalvoAssinatura no schema.
export interface CartaoSalvoAssinatura {
  id: string;
  bandeira: string;
  ultimosDigitos: string;
  nomeTitular: string;
  banco: string | null;
  bin: string;
  mercadoPagoCustomerId: string;
  mercadoPagoCardId: string;
  criadoEm: string;
}

// ============================= HELPERS =============================

export function centavosParaReais(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

// ============================= BANDEIRA DO CARTÃO (detecção local) =============================

// Identifica a bandeira do cartão (no mesmo vocabulário de `payment_method_id`
// que o Mercado Pago usa: "visa", "master", "elo" etc.) a partir dos
// primeiros dígitos do número — SEM depender de nenhuma chamada de rede.
//
// Por que local e não via API do Mercado Pago: até set/2026 o backend usava
// GET /v1/payment_methods/search?bin=... (ver MercadoPagoService), mas o
// próprio Mercado Pago descontinuou o filtro por BIN nesse endpoint
// ("Changes to the Payment Methods API search", anunciado 26/07/2024, com
// rollout escalonado por país até nov/2024 —
// https://www.mercadopago.com.br/developers/pt/news/2024/07/26/Changes-to-the-Payment-Methods-API-search--effective-09-09-2024).
// Confirmamos isso na prática, testando o endpoint em sandbox com 3 BINs
// diferentes (incluindo um BIN de cartão de teste OFICIAL do próprio
// Mercado Pago, 423564 = Visa): a chamada sempre devolveu a MESMA lista com
// os ~80 meios de pagamento habilitados na conta inteira, ignorando
// completamente o `bin` enviado. Era exatamente isso que causava o bug de
// produção "bandeira sempre aparece como master": o código pegava o
// primeiro resultado de crédito dessa lista genérica (que por coincidência
// é sempre um Mastercard), não o cartão que o cliente realmente digitou.
//
// A tabela abaixo é o método padrão da indústria pra esse tipo de detecção
// (o mesmo princípio de "começa com 4 = Visa" usado por qualquer gateway de
// pagamento) — funciona 100% offline e na hora, então serve tanto pro
// backend confirmar o payment_method_id antes de cobrar (ver
// MercadoPagoService.identificarBandeiraCartao) quanto pro app mostrar a
// bandeira ao cliente assim que ele digita o número, sem precisar de log
// nenhum (ver CartaoScreen).
// Um cartão que o cliente salvou pra reusar em pagamentos futuros numa
// lava jato (ver GET/POST/DELETE /cartoes na API e CartaoScreen no mobile).
// `ultimosDigitos` traz os 4 últimos dígitos que o Mercado Pago devolve — a
// tela mostra só os 3 últimos. `mercadoPagoCustomerId`/`mercadoPagoCardId`
// não são segredo (são só referências do lado do Mercado Pago), e o app
// precisa dos dois pra gerar um token de cobrança novo a cada pagamento
// (POST https://api.mercadopago.com/v1/card_tokens com card_id+customer_id).
export interface CartaoSalvo {
  id: string;
  bandeira: string; // payment_method.id do Mercado Pago, ex: "visa", "master"
  ultimosDigitos: string;
  nomeTitular: string;
  banco: string | null;
  // BIN (6 primeiros dígitos) guardado no momento de salvar — reenviado como
  // `cartaoBin` quando esse cartão salvo é usado num pagamento (ver
  // CartaoScreen), pra manter o mesmo contrato que o pagamento com cartão
  // novo já usa (create-agendamento-lote.dto.ts).
  bin: string;
  mercadoPagoCustomerId: string;
  mercadoPagoCardId: string;
  criadoEm: string;
}

export interface BandeiraCartao {
  paymentMethodId: string; // vocabulário do Mercado Pago: "visa", "master", "elo", "amex", "hipercard", "diners"
  nome: string; // nome de exibição
}

// BINs conhecidos da Elo — ao contrário de Visa/Master/Amex, a Elo não usa
// uma faixa simples de primeiros dígitos; essa é a lista pública de
// prefixos/faixas usada por integrações de pagamento brasileiras em geral.
const ELO_PREFIXOS_EXATOS = [
  "401178", "401179", "431274", "438935", "451416", "457393", "457631", "457632",
  "504175", "627780", "636297", "636368",
];
const ELO_FAIXAS_SEIS_DIGITOS: Array<[number, number]> = [
  [506699, 506778],
  [509000, 509999],
  [650031, 650033],
  [650035, 650051],
  [650405, 650439],
  [650485, 650538],
  [650541, 650598],
  [650700, 650718],
  [650720, 650727],
  [650901, 650920],
  [651652, 651679],
  [655000, 655019],
  [655021, 655058],
];

function seisDigitosNaFaixa(digitos: string, faixas: Array<[number, number]>): boolean {
  const seis = Number(digitos.slice(0, 6));
  return faixas.some(([inicio, fim]) => seis >= inicio && seis <= fim);
}

// Os cartões de TESTE oficiais que o próprio Mercado Pago publica pro
// sandbox (ex: "5031 4332 1540 6351" pra Mastercard) usam BINs fictícios que
// não seguem as faixas reais das bandeiras (503... nunca foi emitido como
// Mastercard de verdade) — só servem pra simular uma cobrança, nunca tocam
// numa rede de cartão real. Sem esse caso especial, a tabela de faixas reais
// abaixo (correta pra qualquer cartão real de cliente, que é o que importa
// em produção) devolveria "não reconhecida" pra esses cartões de teste,
// dando a impressão de bug ao testar em sandbox.
const BINS_TESTE_MERCADOPAGO: Record<string, BandeiraCartao> = {
  "503143": { paymentMethodId: "master", nome: "Mastercard" },
  "423564": { paymentMethodId: "visa", nome: "Visa" },
};

// `numeroCartao` pode vir com espaços/máscara — só os dígitos importam, e
// bastam os 6 primeiros (BIN) pra identificar a bandeira. Devolve `null`
// enquanto não houver dígitos suficientes (ex: cliente ainda digitando) ou
// se nenhuma bandeira suportada bater — quem chamar decide o que fazer
// (no app, simplesmente não mostra nada ainda; no backend, isso vira erro
// pro cliente confirmar o número).
export function identificarBandeiraLocal(numeroCartao: string): BandeiraCartao | null {
  const digitos = numeroCartao.replace(/\D/g, "");
  if (digitos.length < 6) return null;

  const seisDigitos = digitos.slice(0, 6);
  if (BINS_TESTE_MERCADOPAGO[seisDigitos]) return BINS_TESTE_MERCADOPAGO[seisDigitos];

  const doisDigitos = digitos.slice(0, 2);
  const tresDigitos = Number(digitos.slice(0, 3));
  const quatroDigitos = digitos.slice(0, 4);
  const quatroNum = Number(quatroDigitos);
  const doisNum = Number(doisDigitos);

  // Elo primeiro: alguns prefixos dela (ex: 627780) começam com dígitos que
  // também aparecem em faixas de outras bandeiras, então precisa ser checado
  // antes das demais.
  if (ELO_PREFIXOS_EXATOS.some((p) => digitos.startsWith(p)) || seisDigitosNaFaixa(digitos, ELO_FAIXAS_SEIS_DIGITOS)) {
    return { paymentMethodId: "elo", nome: "Elo" };
  }
  // Hipercard antes de Diners/Amex porque "3841" cairia na faixa genérica de
  // Diners (38) se checado depois.
  if (digitos.slice(0, 6) === "606282" || quatroDigitos === "3841") {
    return { paymentMethodId: "hipercard", nome: "Hipercard" };
  }
  if (doisDigitos === "34" || doisDigitos === "37") {
    return { paymentMethodId: "amex", nome: "American Express" };
  }
  if (doisDigitos === "36" || doisDigitos === "38" || doisDigitos === "39" || (tresDigitos >= 300 && tresDigitos <= 305)) {
    return { paymentMethodId: "diners", nome: "Diners Club" };
  }
  if ((doisNum >= 51 && doisNum <= 55) || (quatroNum >= 2221 && quatroNum <= 2720)) {
    return { paymentMethodId: "master", nome: "Mastercard" };
  }
  if (digitos.startsWith("4")) {
    return { paymentMethodId: "visa", nome: "Visa" };
  }
  return null;
}
