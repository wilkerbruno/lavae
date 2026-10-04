import { Injectable, Logger } from "@nestjs/common";
import { StatusAgendamento, StatusAssinaturaPacote, StatusPagamento } from "@lavajato-app/shared";
import { PrismaService } from "../prisma/prisma.service";
import { MercadoPagoService, PaymentDetalhe } from "../pagamentos/mercadopago.service";
import { AssinaturasService } from "../assinaturas/assinaturas.service";
import { PacotesMensaisService } from "../pacotes-mensais/pacotes-mensais.service";

// Mapeia o status devolvido pelo Mercado Pago pro nosso StatusPagamento.
function mapearStatusPagamento(status: string | null | undefined): StatusPagamento {
  if (status === "approved") return StatusPagamento.APROVADO;
  if (status === "pending" || status === "in_process" || status === "authorized") return StatusPagamento.PENDENTE;
  return StatusPagamento.RECUSADO; // rejected, cancelled, etc.
}

// Ponto ÚNICO de entrada de todas as notificações do Mercado Pago (ver
// WebhooksController) — sua aplicação só pode configurar UMA URL de webhook
// no painel, então esse service decide pra qual fluxo cada notificação
// pertence e delega:
//
// - Evento numa conta CONECTADA (lava jato, via OAuth — reconhecida pelo
//   `user_id` do payload batendo com LavaJato.mercadoPagoUserId): pagamento
//   avulso de agendamento, pagamento avulso de um período de pacote mensal,
//   ou assinatura recorrente de pacote mensal.
// - Qualquer outro evento: assinatura SaaS do lava jato com a Divisions Tech
//   (fluxo antigo, inalterado — ver AssinaturasService.processarEventoPagamento).
@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private prisma: PrismaService,
    private mercadoPago: MercadoPagoService,
    private assinaturasService: AssinaturasService,
    private pacotesMensaisService: PacotesMensaisService,
  ) {}

  async processarEventoPagamento(payload: any, query: Record<string, any>, headers: Record<string, any>) {
    const tipo = payload?.type ?? payload?.topic ?? query?.type ?? query?.topic;
    const dataId = payload?.data?.id ?? query?.["data.id"] ?? query?.id;
    if (!tipo || !dataId) return { recebido: true };

    const assinaturaValida = this.mercadoPago.validarAssinaturaWebhook({
      xSignature: headers["x-signature"],
      xRequestId: headers["x-request-id"],
      dataId: String(dataId),
    });
    if (!assinaturaValida) {
      this.logger.warn(`Webhook do Mercado Pago com assinatura inválida (tipo=${tipo}, id=${dataId}) — ignorado.`);
      return { recebido: true };
    }

    // user_id = conta do Mercado Pago onde o evento aconteceu. Se bater com
    // um lava jato conectada, é um evento de marketplace (cliente pagando a
    // lava jato); senão, é a assinatura SaaS (conta da própria plataforma).
    const mpUserId = payload?.user_id != null ? String(payload.user_id) : null;
    const lavaJato = mpUserId
      ? await this.prisma.lavaJato.findFirst({ where: { mercadoPagoUserId: mpUserId } })
      : null;

    try {
      if (lavaJato) {
        await this.processarEventoMarketplace(tipo, String(dataId), lavaJato.id);
      } else if (tipo === "subscription_preapproval" || tipo === "preapproval") {
        await this.assinaturasService.processarEventoPagamento(payload, query, headers);
      } else if (tipo === "subscription_authorized_payment") {
        await this.assinaturasService.processarEventoPagamento(payload, query, headers);
      } else if (tipo === "payment") {
        await this.assinaturasService.processarEventoPagamento(payload, query, headers);
      }
    } catch (e) {
      // Nunca deixa estourar pro Mercado Pago ficar reenviando pra sempre por
      // causa de um formato de payload que ainda não previmos.
      this.logger.error(`Erro ao processar webhook do Mercado Pago (tipo=${tipo}, id=${dataId}): ${e}`);
    }

    return { recebido: true };
  }

  private async processarEventoMarketplace(tipo: string, dataId: string, lavaJatoId: string) {
    // "order" é o evento da Orders API (cartão — ver
    // MercadoPagoService.criarPagamentoCartao/buscarPayment, que já sabe
    // reconhecer um id de Order pelo prefixo "ORD" e traduzir sozinho);
    // "payment" continua sendo o evento do Pix (API clássica). Mesma rota
    // pros dois — tratarPagamentoMarketplace busca o Payment/Order uma única
    // vez e decide, pelo external_reference, se é de um agendamento ou de um
    // período avulso de pacote mensal.
    if (tipo === "payment" || tipo === "order") {
      await this.tratarPagamentoMarketplace(dataId, lavaJatoId);
      return;
    }
    if (tipo === "subscription_preapproval" || tipo === "preapproval") {
      await this.tratarPreapprovalPacoteMensal(dataId, lavaJatoId);
      return;
    }
    if (tipo === "subscription_authorized_payment") {
      await this.tratarPagamentoAutorizadoPacoteMensal(dataId, lavaJatoId);
      return;
    }
  }

  // Autorização (ou cancelamento/pausa) da cobrança recorrente de um pacote
  // mensal — "assinaturaPacote:<id>" no external_reference (ver
  // PacotesMensaisService.assinar) diz qual AssinaturaPacoteCliente ativar.
  private async tratarPreapprovalPacoteMensal(preapprovalId: string, lavaJatoId: string) {
    const token = await this.mercadoPago.tokenDaLavaJato(lavaJatoId);
    const preapproval = await this.mercadoPago.buscarPreapproval(preapprovalId, token);
    const [prefixo, assinaturaId] = (preapproval.externalReference ?? "").split(":");
    if (prefixo !== "assinaturaPacote" || !assinaturaId) return;

    const dados: { gatewayAssinaturaId: string; status?: StatusAssinaturaPacote; proximaCobrancaEm?: Date } = {
      gatewayAssinaturaId: preapprovalId,
    };
    if (preapproval.status === "authorized") {
      dados.status = StatusAssinaturaPacote.ATIVA;
      if (preapproval.nextPaymentDate) dados.proximaCobrancaEm = new Date(preapproval.nextPaymentDate);
    } else if (preapproval.status === "cancelled") {
      dados.status = StatusAssinaturaPacote.CANCELADA;
    } else if (preapproval.status === "paused") {
      dados.status = StatusAssinaturaPacote.INADIMPLENTE;
    }

    await this.prisma.assinaturaPacoteCliente.update({ where: { id: assinaturaId }, data: dados }).catch((e) => {
      this.logger.warn(`Assinatura de pacote mensal ${assinaturaId} (do external_reference da preapproval) não encontrada: ${e}`);
    });
  }

  // Cada cobrança recorrente aprovada também dispara esse evento — usamos só
  // como confirmação extra de que a assinatura está ativa (defensivo, caso o
  // webhook de preapproval acima tenha se perdido) e pra tirar da
  // inadimplência quando uma cobrança volta a passar.
  private async tratarPagamentoAutorizadoPacoteMensal(authorizedPaymentId: string, lavaJatoId: string) {
    const token = await this.mercadoPago.tokenDaLavaJato(lavaJatoId);
    const autorizado = await this.mercadoPago.buscarAuthorizedPayment(authorizedPaymentId, token);
    const [prefixo, assinaturaId] = (autorizado.externalReference ?? "").split(":");
    if (prefixo !== "assinaturaPacote" || !assinaturaId) return;

    await this.prisma.assinaturaPacoteCliente
      .update({ where: { id: assinaturaId }, data: { status: StatusAssinaturaPacote.ATIVA } })
      .catch((e) => {
        this.logger.warn(
          `Assinatura de pacote mensal ${assinaturaId} (do external_reference do pagamento autorizado) não encontrada: ${e}`,
        );
      });
  }

  // Busca o Payment/Order UMA vez e decide, pelo prefixo do external_reference,
  // se é a cobrança de um agendamento ("agendamento_<id>") ou de um período
  // avulso de pacote mensal ("pacotePagamento_<id>") — "_", não ":", pelo
  // mesmo motivo de sempre: a Orders API (usada pelo cartão) rejeita ":"
  // nesse campo, e os dois fluxos foram padronizados nesse mesmo formato.
  private async tratarPagamentoMarketplace(paymentId: string, lavaJatoId: string) {
    const token = await this.mercadoPago.tokenDaLavaJato(lavaJatoId);
    const pagamentoMp = await this.mercadoPago.buscarPayment(paymentId, token);
    const [prefixo, idReferenciado] = (pagamentoMp.externalReference ?? "").split("_");
    if (prefixo === "agendamento" && idReferenciado) {
      await this.tratarPagamentoAgendamento(paymentId, pagamentoMp, idReferenciado);
      return;
    }
    if (prefixo === "pacotePagamento" && idReferenciado) {
      await this.tratarPagamentoPeriodoPacoteMensal(paymentId, pagamentoMp, idReferenciado);
      return;
    }
  }

  // "agendamento_<pagamentoId>" — ver como AgendamentosService monta o
  // external_reference ao criar a cobrança Pix/Cartão. O pagamentoId é um
  // uuid (só hexadecimal e "-"), então dividir por "_" continua seguro e
  // sempre dá exatamente 2 partes. `pagamentoMp` já vem buscado por
  // tratarPagamentoMarketplace (um único buscarPayment pro webhook inteiro).
  private async tratarPagamentoAgendamento(paymentId: string, pagamentoMp: PaymentDetalhe, pagamentoId: string) {
    const pagamento = await this.prisma.pagamento.findUnique({ where: { id: pagamentoId } });
    if (!pagamento) {
      this.logger.warn(`Pagamento ${pagamentoId} (do external_reference) não encontrado — webhook ignorado.`);
      return;
    }
    // Idempotência: já processamos essa aprovação antes, nada a fazer.
    if (pagamento.status === StatusPagamento.APROVADO && pagamento.gatewayPagamentoId === paymentId) return;

    const novoStatus = mapearStatusPagamento(pagamentoMp.status);
    await this.prisma.pagamento.update({
      where: { id: pagamentoId },
      data: {
        status: novoStatus,
        gatewayPagamentoId: paymentId,
        // Só o Mercado Pago sabe a taxa real depois de processar — grava
        // sempre que vier (fica 0 enquanto ainda não aprovou). Usado pelo
        // Financeiro pra mostrar o valor líquido (ver FinanceiroService).
        taxaMercadoPagoCentavos: pagamentoMp.taxaCentavos,
      },
    });

    if (novoStatus === StatusPagamento.APROVADO && pagamento.grupoId) {
      await this.prisma.agendamento.updateMany({
        where: { grupoId: pagamento.grupoId, status: StatusAgendamento.PENDENTE },
        data: { status: StatusAgendamento.CONFIRMADO },
      });
    } else if (novoStatus === StatusPagamento.RECUSADO && pagamento.grupoId) {
      // Mesmo bug corrigido em AgendamentosService.sincronizarPagamentoComGateway
      // (o poll que o app faz) — esse webhook tem a MESMA lógica duplicada e o
      // mesmo buraco: só desfazia a reserva quando o pagamento era aprovado,
      // nunca quando era recusado. Uma recusa que o Mercado Pago só decide
      // depois da criação (webhook chega com "rejected"/"failed") deixava o
      // Agendamento preso em PENDENTE, bloqueando o horário por até
      // PENDENTE_EXPIRA_MINUTOS mesmo já sabendo que não vai ser pago.
      await this.prisma.agendamento.updateMany({
        where: { grupoId: pagamento.grupoId, status: StatusAgendamento.PENDENTE },
        data: { status: StatusAgendamento.CANCELADO },
      });
    }
  }

  // "pacotePagamento_<pagamentoId>" — ver PacotesMensaisService.assinar
  // (Pix, ou Cartão sem renovação automática: cobra um período avulso, igual
  // um agendamento, mas ligado por assinaturaPacoteClienteId em vez de
  // grupoId). Aprovado aqui marca o período como pago e empurra
  // proximaCobrancaEm pra 1 mês à frente (ver
  // PacotesMensaisService.ativarPeriodo) — pode chegar antes ou depois do
  // poll que o app já faz em GET pacotes-mensais/pagamentos/:id, então os
  // dois caminhos levam ao mesmo lugar sem duplicar efeito (ativarPeriodo só
  // seta status/proximaCobrancaEm, idempotente de repetir).
  private async tratarPagamentoPeriodoPacoteMensal(paymentId: string, pagamentoMp: PaymentDetalhe, pagamentoId: string) {
    const pagamento = await this.prisma.pagamento.findUnique({ where: { id: pagamentoId } });
    if (!pagamento) {
      this.logger.warn(`Pagamento ${pagamentoId} (do external_reference, pacote mensal) não encontrado — webhook ignorado.`);
      return;
    }
    if (pagamento.status === StatusPagamento.APROVADO && pagamento.gatewayPagamentoId === paymentId) return;

    const novoStatus = mapearStatusPagamento(pagamentoMp.status);
    await this.prisma.pagamento.update({
      where: { id: pagamentoId },
      data: {
        status: novoStatus,
        gatewayPagamentoId: paymentId,
        taxaMercadoPagoCentavos: pagamentoMp.taxaCentavos,
      },
    });

    if (novoStatus === StatusPagamento.APROVADO && pagamento.assinaturaPacoteClienteId) {
      await this.pacotesMensaisService.ativarPeriodo(pagamento.assinaturaPacoteClienteId);
    }
  }
}
