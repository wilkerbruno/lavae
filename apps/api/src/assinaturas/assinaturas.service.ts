import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron, CronExpression } from "@nestjs/schedule";
import { Papel, StatusAssinatura, StatusFatura } from "@lavajato-app/shared";
import { PrismaService } from "../prisma/prisma.service";
import { MercadoPagoService } from "../pagamentos/mercadopago.service";
import { ConfiguracoesService } from "../configuracoes/configuracoes.service";
import { PushService } from "../push/push.service";
import { AssinaturasPagamentoService } from "./assinaturas-pagamento.service";
import {
  estaForaDaCarencia,
  diasRestantesVencimento,
  DIAS_AVISO_VENCIMENTO,
  dadosParaStatusPuro,
  AssinaturaStatusAtual,
} from "./assinatura-status.util";

// Casa o status devolvido pelo Mercado Pago (pagamento aprovado/pendente/
// recusado) com o enum interno de Fatura.
function mapearStatusFatura(statusPagamento: string | null | undefined): StatusFatura {
  if (statusPagamento === "approved") return StatusFatura.PAGA;
  if (statusPagamento === "pending" || statusPagamento === "in_process" || statusPagamento === "authorized") {
    return StatusFatura.PENDENTE;
  }
  return StatusFatura.ATRASADA; // rejected, cancelled, refunded, charged_back, etc.
}

// Campos da LavaJato seguros para o painel SaaS (SAAS_ADMIN). NUNCA inclua
// mercadoPagoAccessToken/mercadoPagoRefreshToken aqui nem troque isso por um
// `include: { lava jato: true }` genérico — ver o comentário no schema
// (model LavaJato) que já avisa: esses dois campos só podem sair por um
// select explícito, nunca por include genérico.
const SELECT_LAVAJATO_ADMIN = {
  id: true,
  nome: true,
  slug: true,
  endereco: true,
  telefone: true,
  logoUrl: true,
  criadoEm: true,
  mercadoPagoUserId: true,
  mercadoPagoPublicKey: true,
  mercadoPagoConectadoEm: true,
} as const;

@Injectable()
export class AssinaturasService {
  private readonly logger = new Logger(AssinaturasService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private mercadoPago: MercadoPagoService,
    private configuracoes: ConfiguracoesService,
    private push: PushService,
    private pagamentoNativo: AssinaturasPagamentoService,
  ) {}

  // Wrapper fino em cima da função pura em assinatura-status.util.ts — ver lá
  // pro comentário completo (regras de bloqueadaEm/avisoVencimentoEnviadoEm
  // em qualquer transição de status). Extraída pra lá (em vez de só
  // "não-private" aqui) porque AssinaturasPagamentoService também precisa
  // dela e uma dependência de volta pra AssinaturasService criaria um ciclo
  // (esse serviço delega pra AssinaturasPagamentoService no webhook de
  // pagamento nativo — ver processarEventoPagamento abaixo).
  private dadosParaStatus(status: StatusAssinatura, atual: AssinaturaStatusAtual) {
    return dadosParaStatusPuro(status, atual);
  }

  // Checagem "preguiçosa" (sem job agendado): se o trial passou do prazo e a
  // assinatura ainda não foi paga, vira CANCELADA na hora; se uma assinatura
  // ATIVA sem cobrança automática (ver comentário em
  // Assinatura.gatewayAssinaturaId — pagamento nativo, sem Preapproval) passou
  // da data da próxima cobrança sem um PagamentoAssinatura aprovado, vira
  // INADIMPLENTE na hora. Assinaturas ANTIGAS com gatewayAssinaturaId
  // preenchido (Preapproval ainda ativa) NUNCA passam por esse segundo check
  // — quem avisa a cobrança/falha delas é o webhook do Mercado Pago
  // (tratarWebhookPreapproval), não esse lazy check; misturar os dois faria
  // uma assinatura com cobrança automática em dia ser marcada INADIMPLENTE
  // só por o webhook ainda não ter chegado.
  //
  // Chamado sempre que alguém olha pra essa assinatura (minhaAssinatura, o
  // AssinaturaGuard, a listagem pública de lava jatos) — assim o status nunca
  // fica visivelmente vencido esperando um cron rodar.
  async expirarTrialSeVencido(lavaJatoId: string) {
    const assinatura = await this.prisma.assinatura.findUnique({ where: { lavaJatoId } });
    if (!assinatura) return null;

    const trialVenceu =
      assinatura.status === StatusAssinatura.TRIAL && assinatura.trialTerminaEm && assinatura.trialTerminaEm.getTime() <= Date.now();
    if (trialVenceu) {
      return this.prisma.assinatura.update({
        where: { lavaJatoId },
        data: this.dadosParaStatus(StatusAssinatura.CANCELADA, assinatura),
      });
    }

    const cobrancaNativaVenceu =
      assinatura.status === StatusAssinatura.ATIVA &&
      !assinatura.gatewayAssinaturaId &&
      assinatura.proximaCobrancaEm &&
      assinatura.proximaCobrancaEm.getTime() <= Date.now();
    if (cobrancaNativaVenceu) {
      return this.prisma.assinatura.update({
        where: { lavaJatoId },
        data: this.dadosParaStatus(StatusAssinatura.INADIMPLENTE, assinatura),
      });
    }

    return assinatura;
  }

  // Usado pelo AssinaturaGuard: equipe (funcionário + admin do lava jato) é
  // bloqueada IMEDIATAMENTE quando a assinatura não está TRIAL/ATIVA — sem
  // carência (a carência de horasCarenciaAposVencimento é só pro cliente
  // final continuar vendo o lava jato por um tempo, ver estaForaDaCarencia).
  async verificarBloqueioEquipe(lavaJatoId: string): Promise<{ bloqueada: boolean; status: StatusAssinatura }> {
    const assinatura = await this.expirarTrialSeVencido(lavaJatoId);
    if (!assinatura) return { bloqueada: false, status: StatusAssinatura.TRIAL };
    const bloqueada = assinatura.status === StatusAssinatura.INADIMPLENTE || assinatura.status === StatusAssinatura.CANCELADA;
    return { bloqueada, status: assinatura.status };
  }

  // Usado pra decidir se o lava jato deve sumir da busca/agendamento do
  // cliente final: só depois que passou `horasCarenciaAposVencimento` desde
  // que `bloqueadaEm` foi setado (ver dadosParaStatus). Uma assinatura
  // TRIAL/ATIVA (bloqueadaEm null) nunca está fora da carência.
  async estaForaDaCarencia(lavaJatoId: string): Promise<boolean> {
    const assinatura = await this.expirarTrialSeVencido(lavaJatoId);
    if (!assinatura) return false;
    const { horasCarenciaAposVencimento } = await this.configuracoes.obter();
    return estaForaDaCarencia(assinatura, horasCarenciaAposVencimento);
  }

  async minhaAssinatura(lavaJatoId: string) {
    await this.expirarTrialSeVencido(lavaJatoId);
    const assinatura = await this.prisma.assinatura.findUnique({
      where: { lavaJatoId },
      include: { plano: true, faturas: { orderBy: { vencimentoEm: "desc" }, take: 12 } },
    });
    if (!assinatura) throw new NotFoundException("Lava jato sem assinatura ativa.");
    return assinatura;
  }

  // Versão enxuta de minhaAssinatura pro pop-up de "assinatura vencendo" —
  // acessível também pro FUNCIONARIO (que não pode ver faturas/preço do
  // plano, só se está vencendo e quanto falta).
  async resumoVencimento(lavaJatoId: string) {
    const assinatura = await this.expirarTrialSeVencido(lavaJatoId);
    if (!assinatura) return { status: null, diasRestantes: null, vencendo: false };
    const diasRestantes = diasRestantesVencimento(assinatura);
    const vencendo =
      (assinatura.status === StatusAssinatura.TRIAL || assinatura.status === StatusAssinatura.ATIVA) &&
      diasRestantes !== null &&
      diasRestantes <= DIAS_AVISO_VENCIMENTO;
    return { status: assinatura.status, diasRestantes, vencendo };
  }

  // Cron diário: avisa por push a equipe (LAVAJATO_ADMIN + FUNCIONARIO) de
  // todo lava jato cujo trial/mensalidade vence em até DIAS_AVISO_VENCIMENTO
  // dias — uma vez por janela de vencimento (avisoVencimentoEnviadoEm marca
  // que já mandou; dadosParaStatus zera esse campo de novo quando o status
  // volta a ser TRIAL/ATIVA, liberando um aviso novo no próximo ciclo).
  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async verificarAvisosDeVencimento() {
    const limite = new Date(Date.now() + DIAS_AVISO_VENCIMENTO * 24 * 60 * 60 * 1000);
    const candidatas = await this.prisma.assinatura.findMany({
      where: {
        avisoVencimentoEnviadoEm: null,
        OR: [
          { status: StatusAssinatura.TRIAL, trialTerminaEm: { lte: limite, gt: new Date() } },
          { status: StatusAssinatura.ATIVA, proximaCobrancaEm: { lte: limite, gt: new Date() } },
        ],
      },
    });

    for (const assinatura of candidatas) {
      const diasRestantes = diasRestantesVencimento(assinatura);
      if (diasRestantes === null) continue;

      const usuarios = await this.prisma.usuario.findMany({
        where: { lavaJatoId: assinatura.lavaJatoId, papel: { in: [Papel.LAVAJATO_ADMIN, Papel.FUNCIONARIO] } },
        select: { pushToken: true },
      });
      const titulo = "Assinatura vencendo";
      const corpo =
        diasRestantes <= 0
          ? "Sua assinatura vence hoje. Renove para não perder o acesso."
          : `Sua assinatura vence em ${diasRestantes} dia(s). Renove para não perder o acesso.`;
      await this.push.enviarParaTokens(usuarios.map((u) => u.pushToken), titulo, corpo, { tipo: "ASSINATURA_VENCENDO" });

      await this.prisma.assinatura.update({
        where: { id: assinatura.id },
        data: { avisoVencimentoEnviadoEm: new Date() },
      });
    }
  }

  // Cria a cobrança recorrente no Mercado Pago pro plano escolhido — o dono
  // precisa abrir o link (`initPoint`) devolvido e autorizar com o cartão
  // dele. A troca de plano só é efetivada de verdade quando o webhook
  // confirma a autorização (ver processarEventoPagamento), não aqui — assim
  // ninguém consegue "trocar de plano de graça" chamando esse endpoint.
  async criarCheckout(lavaJatoId: string, usuarioId: string, planoId: string) {
    if (!this.mercadoPago.configurado) {
      throw new BadRequestException(
        "Pagamentos ainda não configurados nesta instalação (falta MERCADOPAGO_ACCESS_TOKEN). Fale com o suporte.",
      );
    }

    const [plano, assinatura, usuario] = await Promise.all([
      this.prisma.plano.findUnique({ where: { id: planoId } }),
      this.minhaAssinatura(lavaJatoId),
      this.prisma.usuario.findUnique({ where: { id: usuarioId } }),
    ]);
    if (!plano || !plano.ativo) throw new NotFoundException("Plano não encontrado.");
    if (!usuario) throw new NotFoundException("Usuário não encontrado.");

    const backUrl = this.config.get<string>("MERCADOPAGO_BACK_URL") ?? "https://www.mercadopago.com.br";

    const preapproval = await this.mercadoPago.criarPreapproval({
      reason: `Assinatura Lava Jato OS — Plano ${plano.nome}`,
      // "assinaturaId::planoId": é assim que o webhook (que só recebe o id da
      // preapproval no Mercado Pago) sabe qual Assinatura/Plano atualizar.
      externalReference: `${assinatura.id}::${plano.id}`,
      payerEmail: usuario.email,
      precoCentavos: plano.precoCentavos,
      backUrl,
    });

    return { initPoint: preapproval.initPoint };
  }

  // Cancela a mensalidade (dono ou SAAS_ADMIN). Cancela também no Mercado
  // Pago pra garantir que a cobrança recorrente pare de verdade — se a
  // assinatura ainda nem tinha um gatewayAssinaturaId (nunca chegou a
  // autorizar um pagamento), só atualiza o status local.
  async cancelar(lavaJatoId: string) {
    const assinatura = await this.minhaAssinatura(lavaJatoId);
    if (assinatura.gatewayAssinaturaId && this.mercadoPago.configurado) {
      await this.mercadoPago.cancelarPreapproval(assinatura.gatewayAssinaturaId).catch((e) => {
        this.logger.error(`Falha ao cancelar preapproval ${assinatura.gatewayAssinaturaId} no Mercado Pago: ${e}`);
      });
    }
    return this.prisma.assinatura.update({
      where: { lavaJatoId },
      data: this.dadosParaStatus(StatusAssinatura.CANCELADA, assinatura),
    });
  }

  // Troca de plano feita diretamente (sem passar pelo checkout) — uso
  // administrativo: cortesia, ajuste manual, downgrade pra um plano grátis
  // etc. O fluxo normal do dono do lava jato é via criarCheckout.
  async mudarPlanoAdmin(lavaJatoId: string, planoId: string) {
    const assinatura = await this.minhaAssinatura(lavaJatoId);
    return this.prisma.assinatura.update({
      where: { lavaJatoId },
      data: { planoId, ...this.dadosParaStatus(StatusAssinatura.ATIVA, assinatura) },
      include: { plano: true },
    });
  }

  // SAAS_ADMIN suspende/reativa manualmente a assinatura de um lava jato
  // (ex: inadimplência tratada fora do gateway, suporte, etc).
  async definirStatusAdmin(lavaJatoId: string, status: StatusAssinatura) {
    const assinatura = await this.minhaAssinatura(lavaJatoId);
    return this.prisma.assinatura.update({
      where: { lavaJatoId },
      data: this.dadosParaStatus(status, assinatura),
      include: { plano: true },
    });
  }

  // Painel SaaS: visão geral de todas as assinaturas + faturamento recorrente.
  listarTodas() {
    return this.prisma.assinatura.findMany({
      include: { plano: true, lavaJato: { select: SELECT_LAVAJATO_ADMIN }, faturas: { orderBy: { vencimentoEm: "desc" }, take: 1 } },
      orderBy: { inicioEm: "desc" },
    });
  }

  listarFaturas() {
    return this.prisma.fatura.findMany({
      include: { assinatura: { include: { lavaJato: { select: SELECT_LAVAJATO_ADMIN }, plano: true } } },
      orderBy: { vencimentoEm: "desc" },
      take: 200,
    });
  }

  // Webhook do Mercado Pago (notificações de assinatura/cobrança). Sempre
  // responde rápido e nunca deixa uma exceção estourar pra fora — o Mercado
  // Pago reenvia (com backoff) se não receber 2xx, e um formato de payload
  // inesperado não pode derrubar o endpoint público.
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

    try {
      if (tipo === "subscription_preapproval" || tipo === "preapproval") {
        await this.tratarWebhookPreapproval(String(dataId));
      } else if (tipo === "subscription_authorized_payment") {
        await this.tratarWebhookPagamentoAutorizado(String(dataId));
      } else if (tipo === "payment" || tipo === "order") {
        // "order" cobre cartão via Orders API (ver MercadoPagoService.
        // criarPagamentoCartao) — mesmo tipo de evento que o webhook do
        // cliente final (WebhooksService) já trata pro pagamento de
        // agendamento. Tenta primeiro o pagamento NATIVO da assinatura
        // (Pix/cartão direto no app — ver AssinaturasPagamentoService); só
        // cai no fluxo legado de Preapproval se o external_reference não for
        // dessa feature (payment avulso vinculado a uma preapproval antiga).
        const detalhe = await this.mercadoPago.buscarPayment(String(dataId));
        const tratadoPeloPagamentoNativo = await this.pagamentoNativo.tratarWebhookPagamento(String(dataId), detalhe.externalReference);
        if (!tratadoPeloPagamentoNativo) {
          await this.registrarFaturaDoPagamento({
            externalReference: detalhe.externalReference,
            preapprovalId: null,
            paymentId: String(dataId),
            idFallbackParaFatura: String(dataId),
          });
        }
      }
    } catch (e) {
      // Registra e segue — não queremos que o Mercado Pago fique reenviando
      // pra sempre por causa de um formato de payload que ainda não previmos.
      this.logger.error(`Erro ao processar webhook do Mercado Pago (tipo=${tipo}, id=${dataId}): ${e}`);
    }

    return { recebido: true };
  }

  private async tratarWebhookPreapproval(preapprovalId: string) {
    const preapproval = await this.mercadoPago.buscarPreapproval(preapprovalId);
    const { assinaturaId, planoId } = this.parseExternalReference(preapproval.externalReference);
    if (!assinaturaId) return;

    const atual = await this.prisma.assinatura.findUnique({ where: { id: assinaturaId } });
    if (!atual) {
      this.logger.error(`Assinatura ${assinaturaId} (do external_reference da preapproval) não encontrada.`);
      return;
    }

    const dados: {
      gatewayAssinaturaId: string;
      status: StatusAssinatura;
      bloqueadaEm: Date | null;
      avisoVencimentoEnviadoEm?: Date | null;
      planoId?: string;
      proximaCobrancaEm?: Date;
    } = {
      gatewayAssinaturaId: preapprovalId,
      ...this.dadosParaStatus(atual.status, atual),
    };
    if (preapproval.status === "authorized") {
      Object.assign(dados, this.dadosParaStatus(StatusAssinatura.ATIVA, atual));
      if (planoId) dados.planoId = planoId;
      if (preapproval.nextPaymentDate) dados.proximaCobrancaEm = new Date(preapproval.nextPaymentDate);
    } else if (preapproval.status === "cancelled") {
      Object.assign(dados, this.dadosParaStatus(StatusAssinatura.CANCELADA, atual));
    } else if (preapproval.status === "paused") {
      Object.assign(dados, this.dadosParaStatus(StatusAssinatura.INADIMPLENTE, atual));
    }

    await this.prisma.assinatura.update({ where: { id: assinaturaId }, data: dados }).catch((e) => {
      this.logger.error(`Falha ao atualizar assinatura ${assinaturaId} a partir do webhook de preapproval: ${e}`);
    });
  }

  private async tratarWebhookPagamentoAutorizado(authorizedPaymentId: string) {
    const autorizado = await this.mercadoPago.buscarAuthorizedPayment(authorizedPaymentId);
    await this.registrarFaturaDoPagamento({
      externalReference: autorizado.externalReference,
      preapprovalId: autorizado.preapprovalId,
      paymentId: autorizado.paymentId,
      idFallbackParaFatura: authorizedPaymentId,
    });
  }

  private async registrarFaturaDoPagamento(params: {
    externalReference: string | null;
    preapprovalId: string | null;
    paymentId: string | null;
    idFallbackParaFatura: string;
  }) {
    const { assinaturaId } = this.parseExternalReference(params.externalReference);
    let assinatura = assinaturaId ? await this.prisma.assinatura.findUnique({ where: { id: assinaturaId }, include: { plano: true } }) : null;
    if (!assinatura && params.preapprovalId) {
      assinatura = await this.prisma.assinatura.findFirst({
        where: { gatewayAssinaturaId: params.preapprovalId },
        include: { plano: true },
      });
    }
    if (!assinatura) {
      this.logger.warn(`Pagamento do Mercado Pago sem assinatura correspondente (paymentId=${params.paymentId}).`);
      return;
    }

    let valorCentavos = assinatura.plano.precoCentavos; // fallback: preço do plano atual
    let metodoPagamento: string | null = null;
    let vencimentoEm = new Date();
    let statusFatura: StatusFatura = StatusFatura.PENDENTE;

    if (params.paymentId) {
      const pagamento = await this.mercadoPago.buscarPayment(params.paymentId).catch(() => null);
      if (pagamento) {
        if (pagamento.transactionAmountCentavos > 0) valorCentavos = pagamento.transactionAmountCentavos;
        metodoPagamento = pagamento.metodoPagamento;
        vencimentoEm = new Date(pagamento.dataAprovacao ?? pagamento.dataCriacao);
        statusFatura = mapearStatusFatura(pagamento.status);
      }
    }

    const gatewayFaturaId = params.paymentId ?? params.idFallbackParaFatura;
    const faturaExistente = await this.prisma.fatura.findFirst({ where: { gatewayFaturaId } });
    if (faturaExistente) {
      await this.prisma.fatura.update({
        where: { id: faturaExistente.id },
        data: { status: statusFatura, valorCentavos, metodoPagamento },
      });
    } else {
      await this.prisma.fatura.create({
        data: {
          assinaturaId: assinatura.id,
          valorCentavos,
          vencimentoEm,
          status: statusFatura,
          metodoPagamento,
          gatewayFaturaId,
        },
      });
    }

    // Uma cobrança aprovada é a melhor confirmação de que a assinatura está
    // em dia — mesmo que o webhook de preapproval (que normalmente já cuida
    // disso) tenha se perdido por algum motivo.
    if (statusFatura === StatusFatura.PAGA && assinatura.status !== StatusAssinatura.ATIVA) {
      await this.prisma.assinatura.update({
        where: { id: assinatura.id },
        data: this.dadosParaStatus(StatusAssinatura.ATIVA, assinatura),
      });
    }
  }

  // "assinaturaId::planoId" — ver o comentário em criarCheckout.
  private parseExternalReference(ref: string | null): { assinaturaId: string | null; planoId: string | null } {
    if (!ref) return { assinaturaId: null, planoId: null };
    const [assinaturaId, planoId] = ref.split("::");
    return { assinaturaId: assinaturaId || null, planoId: planoId || null };
  }
}
