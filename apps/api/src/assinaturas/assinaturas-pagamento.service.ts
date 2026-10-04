import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import {
  MetodoPagamento,
  PeriodicidadeAssinatura,
  StatusAssinatura,
  StatusFatura,
  StatusPagamento,
  calcularPrecoAnualCentavos,
} from "@lavajato-app/shared";
import { PrismaService } from "../prisma/prisma.service";
import { MercadoPagoService } from "../pagamentos/mercadopago.service";
import { traduzirMotivoRecusaCartao } from "../agendamentos/agendamentos.service";
import { dadosParaStatusPuro } from "./assinatura-status.util";
import { PagarAssinaturaDto } from "./dto/pagar-assinatura.dto";

// Prefixo do external_reference das cobranças desse fluxo (Pix/cartão nativo
// da mensalidade/anuidade do SaaS) — "_" e não ":" pelo mesmo motivo de
// AgendamentosService.criarLote (a Orders API, usada pelo cartão, rejeita
// ":" no external_reference). É por esse prefixo que o webhook (ver
// AssinaturasService.processarEventoPagamento) reconhece que um evento
// "payment"/"order" é dessa feature e não do Preapproval legado.
const PREFIXO_EXTERNAL_REFERENCE = "assinaturapg_";

// Cobra a mensalidade/anuidade do SaaS igual ao cliente final paga um
// agendamento: Pix ou cartão tokenizado direto no app, sem sair pra nenhum
// checkout externo (ver CartaoScreen/AgendamentosService.criarLote no lado
// do cliente — mesmo mecanismo, mesma MercadoPagoService, só que com o token
// de PLATAFORMA em vez do do lava jato, porque aqui é a Divisions Tech que
// recebe). Substitui, pra assinaturas NOVAS, o fluxo antigo de Preapproval
// (AssinaturasService.criarCheckout) — ver o comentário em
// Assinatura.gatewayAssinaturaId no schema sobre como os dois convivem.
@Injectable()
export class AssinaturasPagamentoService {
  private readonly logger = new Logger(AssinaturasPagamentoService.name);

  constructor(
    private prisma: PrismaService,
    private mercadoPago: MercadoPagoService,
  ) {}

  get publicKeyPlataforma(): string | null {
    return this.mercadoPago.publicKeyPlataforma;
  }

  async pagar(lavaJatoId: string, usuarioId: string, dto: PagarAssinaturaDto) {
    if (!this.mercadoPago.configurado) {
      throw new BadRequestException(
        "Pagamentos ainda não configurados nesta instalação (falta MERCADOPAGO_ACCESS_TOKEN). Fale com o suporte.",
      );
    }

    const [plano, assinatura, usuario, ultimoAprovado] = await Promise.all([
      this.prisma.plano.findUnique({ where: { id: dto.planoId } }),
      this.prisma.assinatura.findUnique({ where: { lavaJatoId } }),
      this.prisma.usuario.findUnique({ where: { id: usuarioId } }),
      // Só pra montar os dados de antifraude da cobrança com cartão abaixo
      // (mesmo raciocínio de AgendamentosService.criarLote/ultimoPagamentoAprovado).
      this.prisma.pagamentoAssinatura.findFirst({
        where: { assinatura: { lavaJatoId }, status: StatusPagamento.APROVADO },
        orderBy: { atualizadoEm: "desc" },
      }),
    ]);
    if (!plano || !plano.ativo) throw new NotFoundException("Plano não encontrado.");
    if (!assinatura) throw new NotFoundException("Lava jato sem assinatura.");
    if (!usuario) throw new NotFoundException("Usuário não encontrado.");

    const valorCentavos =
      dto.periodicidade === PeriodicidadeAssinatura.ANUAL
        ? calcularPrecoAnualCentavos(plano.precoCentavos, plano.descontoAnualTipo, plano.descontoAnualValor)
        : plano.precoCentavos;

    const pagamento = await this.prisma.pagamentoAssinatura.create({
      data: {
        assinaturaId: assinatura.id,
        planoId: plano.id,
        periodicidade: dto.periodicidade,
        metodo: dto.metodoPagamento,
        valorCentavos,
      },
    });

    const descricao = `Assinatura Lava Jato OS — Plano ${plano.nome} (${dto.periodicidade === PeriodicidadeAssinatura.ANUAL ? "anual" : "mensal"})`;
    const externalReference = `${PREFIXO_EXTERNAL_REFERENCE}${pagamento.id}`;

    let motivoRecusaCartao: string | null = null;
    try {
      if (dto.metodoPagamento === MetodoPagamento.PIX) {
        const pix = await this.mercadoPago.criarPagamentoPix({
          valorCentavos,
          descricao,
          externalReference,
          payerEmail: usuario.email,
        });
        const aprovadoNaHora = pix.status === "approved";
        await this.prisma.pagamentoAssinatura.update({
          where: { id: pagamento.id },
          data: {
            gatewayPagamentoId: pix.id,
            pixQrCodeBase64: pix.qrCodeBase64,
            pixCopiaECola: pix.qrCode,
            status: aprovadoNaHora ? StatusPagamento.APROVADO : StatusPagamento.PENDENTE,
          },
        });
        if (aprovadoNaHora) await this.aplicarPagamentoAprovado(pagamento.id);
      } else {
        if (!dto.cartaoToken || !dto.cartaoBin || !dto.cartaoCpf) {
          throw new BadRequestException("Dados do cartão incompletos.");
        }
        const { paymentMethodId } = await this.mercadoPago.identificarBandeiraCartao(dto.cartaoBin);
        const cobranca = await this.mercadoPago.criarPagamentoCartao({
          valorCentavos,
          descricao,
          externalReference,
          token: dto.cartaoToken,
          paymentMethodId,
          payerEmail: usuario.email,
          payerCpf: dto.cartaoCpf,
          payerNome: usuario.nome,
          payerTelefone: usuario.telefone,
          deviceId: dto.cartaoDeviceId,
          payerCadastradoEm: usuario.criadoEm,
          payerPrimeiraCompra: !ultimoAprovado,
          payerUltimaCompraEm: ultimoAprovado?.atualizadoEm ?? null,
        });
        const aprovadoNaHora = cobranca.status === "approved";
        const recusado = cobranca.status === "rejected";
        await this.prisma.pagamentoAssinatura.update({
          where: { id: pagamento.id },
          data: {
            gatewayPagamentoId: cobranca.id,
            status: aprovadoNaHora ? StatusPagamento.APROVADO : recusado ? StatusPagamento.RECUSADO : StatusPagamento.PENDENTE,
            desafio3dsUrl: cobranca.desafio3dsUrl,
          },
        });
        if (aprovadoNaHora) await this.aplicarPagamentoAprovado(pagamento.id);
        else if (recusado) motivoRecusaCartao = traduzirMotivoRecusaCartao(cobranca.statusDetail);
      }
    } catch (e) {
      this.logger.error(`Falha ao gerar cobrança da assinatura (pagamento ${pagamento.id}): ${e}`);
      await this.prisma.pagamentoAssinatura.update({ where: { id: pagamento.id }, data: { status: StatusPagamento.RECUSADO } });
      if (e instanceof BadRequestException) throw e;
      throw new BadRequestException("Não foi possível gerar a cobrança agora. Tente novamente em instantes.");
    }

    if (motivoRecusaCartao) throw new BadRequestException(motivoRecusaCartao);

    return this.mapear(await this.prisma.pagamentoAssinatura.findUniqueOrThrow({ where: { id: pagamento.id } }));
  }

  async buscarPagamento(pagamentoId: string, lavaJatoId: string) {
    const pagamento = await this.prisma.pagamentoAssinatura.findUnique({
      where: { id: pagamentoId },
      include: { assinatura: true },
    });
    if (!pagamento || pagamento.assinatura.lavaJatoId !== lavaJatoId) throw new NotFoundException("Pagamento não encontrado.");

    if (pagamento.status === StatusPagamento.PENDENTE && pagamento.gatewayPagamentoId) {
      try {
        const atualizado = await this.sincronizarComGateway(pagamento.id, pagamento.gatewayPagamentoId);
        return this.mapear(atualizado);
      } catch (e) {
        this.logger.warn(`Falha ao sincronizar pagamento de assinatura ${pagamentoId} ao vivo, devolvendo estado salvo: ${e}`);
      }
    }
    return this.mapear(pagamento);
  }

  // Diferente de AgendamentosService.cancelarPagamentoPendente: não existe
  // horário reservado pra liberar aqui, então isso é só um "desiste dessa
  // tentativa" — não bloqueia nem exige confirmação pra sair da tela (ver
  // tela de pagamento no mobile).
  async cancelarPendente(pagamentoId: string, lavaJatoId: string) {
    const pagamento = await this.prisma.pagamentoAssinatura.findUnique({
      where: { id: pagamentoId },
      include: { assinatura: true },
    });
    if (!pagamento || pagamento.assinatura.lavaJatoId !== lavaJatoId) throw new NotFoundException("Pagamento não encontrado.");
    if (pagamento.status === StatusPagamento.PENDENTE) {
      await this.prisma.pagamentoAssinatura.update({ where: { id: pagamentoId }, data: { status: StatusPagamento.RECUSADO } });
    }
    return this.mapear(await this.prisma.pagamentoAssinatura.findUniqueOrThrow({ where: { id: pagamentoId } }));
  }

  // Chamado pelo webhook do Mercado Pago (eventos "payment"/"order" da conta
  // de PLATAFORMA — ver AssinaturasService.processarEventoPagamento) sempre
  // que o dono some do app antes do poll confirmar (comum no Pix). Devolve
  // `false` quando o external_reference não é dessa feature, pra quem chamou
  // seguir tentando o fluxo legado de Preapproval.
  async tratarWebhookPagamento(gatewayPagamentoId: string, externalReference: string | null): Promise<boolean> {
    if (!externalReference?.startsWith(PREFIXO_EXTERNAL_REFERENCE)) return false;

    const pagamentoId = externalReference.slice(PREFIXO_EXTERNAL_REFERENCE.length);
    const pagamento = await this.prisma.pagamentoAssinatura.findUnique({ where: { id: pagamentoId } });
    if (!pagamento) {
      this.logger.warn(`Webhook de pagamento de assinatura sem PagamentoAssinatura correspondente (id=${pagamentoId}).`);
      return true;
    }
    if (pagamento.status !== StatusPagamento.PENDENTE) return true; // já resolvido (poll chegou primeiro)
    await this.sincronizarComGateway(pagamento.id, gatewayPagamentoId);
    return true;
  }

  // Usado tanto pelo poll (buscarPagamento) quanto pelo webhook acima —
  // mesmo padrão de AgendamentosService.sincronizarPagamentoComGateway.
  private async sincronizarComGateway(pagamentoId: string, gatewayPagamentoId: string) {
    const detalhe = await this.mercadoPago.buscarPayment(gatewayPagamentoId);
    const novoStatus =
      detalhe.status === "approved"
        ? StatusPagamento.APROVADO
        : detalhe.status === "pending" || detalhe.status === "in_process" || detalhe.status === "authorized"
          ? StatusPagamento.PENDENTE
          : StatusPagamento.RECUSADO;

    const atualizado = await this.prisma.pagamentoAssinatura.update({
      where: { id: pagamentoId },
      data: { status: novoStatus, desafio3dsUrl: detalhe.desafio3dsUrl ?? null },
    });
    if (novoStatus === StatusPagamento.APROVADO) await this.aplicarPagamentoAprovado(pagamentoId);
    return atualizado;
  }

  // Efetiva o pagamento aprovado: assinatura vira ATIVA no plano pago,
  // proximaCobrancaEm avança pela periodicidade escolhida, e fica registrada
  // uma Fatura (mesmo ledger histórico que o Preapproval legado alimenta —
  // ver AssinaturasService.registrarFaturaDoPagamento). Idempotente: poll e
  // webhook podem chegar quase juntos pro mesmo pagamento aprovado — se já
  // existe uma Fatura com esse gatewayFaturaId, não aplica de novo (não
  // empurraria proximaCobrancaEm duas vezes).
  private async aplicarPagamentoAprovado(pagamentoId: string): Promise<void> {
    const pagamento = await this.prisma.pagamentoAssinatura.findUniqueOrThrow({
      where: { id: pagamentoId },
      include: { assinatura: true },
    });

    const faturaExistente = pagamento.gatewayPagamentoId
      ? await this.prisma.fatura.findFirst({ where: { gatewayFaturaId: pagamento.gatewayPagamentoId } })
      : null;
    if (faturaExistente) return;

    const proximaCobrancaEm = somarMeses(new Date(), pagamento.periodicidade === PeriodicidadeAssinatura.ANUAL ? 12 : 1);

    await this.prisma.$transaction([
      this.prisma.assinatura.update({
        where: { id: pagamento.assinaturaId },
        data: {
          planoId: pagamento.planoId,
          periodicidade: pagamento.periodicidade,
          proximaCobrancaEm,
          ...dadosParaStatusPuro(StatusAssinatura.ATIVA, pagamento.assinatura),
        },
      }),
      this.prisma.fatura.create({
        data: {
          assinaturaId: pagamento.assinaturaId,
          valorCentavos: pagamento.valorCentavos,
          vencimentoEm: new Date(),
          status: StatusFatura.PAGA,
          metodoPagamento: pagamento.metodo,
          gatewayFaturaId: pagamento.gatewayPagamentoId,
        },
      }),
    ]);
  }

  private mapear(pagamento: {
    id: string;
    assinaturaId: string;
    planoId: string;
    periodicidade: string;
    metodo: string;
    status: string;
    valorCentavos: number;
    pixQrCodeBase64: string | null;
    pixCopiaECola: string | null;
    desafio3dsUrl: string | null;
    criadoEm: Date;
  }) {
    return {
      id: pagamento.id,
      assinaturaId: pagamento.assinaturaId,
      planoId: pagamento.planoId,
      periodicidade: pagamento.periodicidade,
      metodo: pagamento.metodo,
      status: pagamento.status,
      valorCentavos: pagamento.valorCentavos,
      pixQrCodeBase64: pagamento.pixQrCodeBase64,
      pixCopiaECola: pagamento.pixCopiaECola,
      desafio3dsUrl: pagamento.desafio3dsUrl,
      criadoEm: pagamento.criadoEm.toISOString(),
    };
  }
}

function somarMeses(data: Date, meses: number): Date {
  const resultado = new Date(data);
  resultado.setMonth(resultado.getMonth() + meses);
  return resultado;
}
