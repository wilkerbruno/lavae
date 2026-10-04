import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";
import { identificarBandeiraLocal } from "@lavajato-app/shared";
import { PrismaService } from "../prisma/prisma.service";

const MP_API_URL = "https://api.mercadopago.com";
const MP_AUTH_URL = "https://auth.mercadopago.com";

export interface PreapprovalCriado {
  id: string;
  // null quando criado via criarPreapprovalComCartao (sem checkout hospedado
  // — não há link nenhum pro cliente abrir, a autorização já é direta).
  initPoint: string | null;
  status: string;
}

export interface PreapprovalDetalhe {
  id: string;
  status: string;
  externalReference: string | null;
  nextPaymentDate: string | null;
}

export interface AuthorizedPaymentDetalhe {
  id: string;
  preapprovalId: string | null;
  externalReference: string | null;
  paymentId: string | null;
}

export interface PaymentDetalhe {
  id: string;
  status: string;
  externalReference: string | null;
  transactionAmountCentavos: number;
  metodoPagamento: string | null;
  dataAprovacao: string | null;
  dataCriacao: string;
  // URL do desafio 3DS (ver criarPagamentoCartao) — só vem preenchida
  // enquanto a Order está "action_required"/"pending_challenge"; some de
  // novo (null) assim que o comprador conclui ou o desafio expira.
  desafio3dsUrl?: string | null;
  // Taxa que o Mercado Pago descontou dessa cobrança (soma de fee_details) —
  // só vem diferente de zero depois que o pagamento processa de verdade;
  // antes disso o próprio Mercado Pago ainda não calculou. Ver
  // extrairTaxaCentavos abaixo.
  taxaCentavos: number;
}

export interface PixCriado {
  id: string;
  status: string;
  qrCodeBase64: string | null;
  qrCode: string | null;
}

export interface CheckoutPreferenceCriada {
  id: string;
  initPoint: string;
}

export interface CartaoPagamentoCriado {
  id: string;
  status: string;
  // Motivo detalhado quando recusado (ex: "cc_rejected_insufficient_amount")
  // — ver traduzirMotivoRecusaCartao em AgendamentosService.
  statusDetail: string | null;
  // Preenchida quando o Mercado Pago exige autenticação 3DS do titular antes
  // de aprovar (ver criarPagamentoCartao) — o app precisa abrir essa URL
  // numa WebView pro cliente confirmar com o próprio banco.
  desafio3dsUrl: string | null;
}

export interface TokensOAuth {
  accessToken: string;
  refreshToken: string | null;
  publicKey: string | null;
  userId: string;
  expiraEm: Date;
}

// Integração com o Mercado Pago. Serve DOIS fluxos de dinheiro bem diferentes
// — não confundir:
//
// 1) Cobrar a MENSALIDADE DO SAAS dos lava jatos assinantes, pra conta da
//    própria Divisions Tech (ver AssinaturasService) — usa o access token
//    "de plataforma" (MERCADOPAGO_ACCESS_TOKEN), API de Preapproval.
//
// 2) Cobrar o CLIENTE FINAL em nome do lava jato (modelo marketplace/Connect
//    — ver AgendamentosService, PacotesMensaisService, LavaJatosMercadoPagoService):
//    cada lava jato autoriza a própria conta via OAuth (gerarUrlAutorizacao/
//    trocarCodigoPorToken), e as chamadas de pagamento usam o access token
//    DAQUELA lava jato (accessTokenOverride) — o dinheiro cai direto lá, não
//    passa pela conta da Divisions Tech.
//
// Documentação oficial: https://www.mercadopago.com.br/developers/pt/docs/subscriptions
// e https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/overview
// e https://www.mercadopago.com.br/developers/pt/docs/security/oauth/introduction
@Injectable()
export class MercadoPagoService {
  private readonly logger = new Logger(MercadoPagoService.name);

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {}

  get configurado(): boolean {
    return !!this.config.get<string>("MERCADOPAGO_ACCESS_TOKEN");
  }

  get oauthConfigurado(): boolean {
    return !!this.config.get<string>("MERCADOPAGO_CLIENT_ID") && !!this.config.get<string>("MERCADOPAGO_CLIENT_SECRET");
  }

  // Chave pública usada pra TOKENIZAR o cartão no aparelho do cliente (ver
  // CartaoScreen) — é a chave da própria APLICAÇÃO (marketplace), não da
  // conta conectada de cada lava jato. Tokenização não é específica de quem
  // vai receber o dinheiro (isso só é decidido depois, na hora de criar o
  // pagamento com o access token DAQUELA lava jato — ver criarPagamentoCartao)
  // — e, na prática, o Mercado Pago nem sempre devolve um public_key no OAuth
  // de contas conectadas novas/sem credenciais geradas (ver trocarCodigoPorToken),
  // então usar a chave da aplicação evita depender disso.
  get publicKeyPlataforma(): string | null {
    return this.config.get<string>("MERCADOPAGO_PUBLIC_KEY") ?? null;
  }

  private get accessToken(): string {
    const token = this.config.get<string>("MERCADOPAGO_ACCESS_TOKEN");
    if (!token) throw new Error("MERCADOPAGO_ACCESS_TOKEN não configurado.");
    return token;
  }

  private async chamar<T>(path: string, init?: RequestInit, accessTokenOverride?: string): Promise<T> {
    const resposta = await fetch(`${MP_API_URL}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessTokenOverride ?? this.accessToken}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    const corpo: any = await resposta.json().catch(() => null);
    if (!resposta.ok) {
      // X-Request-Id (ticket WCS-50070, set/2026): o suporte do Mercado Pago
      // pede esse header pra rastrear a chamada do lado deles — sem logar
      // aqui, uma recusa só é reproduzível enquanto o log do corpo ainda
      // ajuda, e algumas respostas (ex: "422 genérico" sem detalhe no corpo)
      // só dão pra investigar de verdade com esse id. `Headers.get` já é
      // case-insensitive, não precisa tentar variações de capitalização.
      const requestId = resposta.headers.get("x-request-id");
      this.logger.error(
        `Mercado Pago ${init?.method ?? "GET"} ${path} -> ${resposta.status} (X-Request-Id: ${requestId ?? "ausente"}): ${JSON.stringify(corpo)}`,
      );
      // O Mercado Pago manda o motivo certo em `cause[0].description` (ex:
      // "cpf invalid", "Invalid parameter identification.number") ou, às
      // vezes, só em `message` — sobe esse texto pra quem chamou em vez de um
      // erro genérico, senão o cliente final nunca sabe o que corrigir (ver
      // AgendamentosService.criarLote, que repassa BadRequestException como
      // veio em vez de mascarar tudo com uma mensagem só).
      const detalhe = corpo?.cause?.[0]?.description || corpo?.message || null;
      throw new BadRequestException(
        detalhe
          ? `O Mercado Pago recusou a operação: ${detalhe}`
          : `Falha ao comunicar com o Mercado Pago (HTTP ${resposta.status}).`,
      );
    }
    return corpo as T;
  }

  // ============================= OAUTH (conta do lava jato) =============================

  // URL pra abrir no navegador do dono do lava jato — ele loga na PRÓPRIA
  // conta Mercado Pago e autoriza. `state` deve conter algo que identifique
  // o lava jato de volta no callback (ver LavaJatosMercadoPagoService, que
  // usa um token assinado em vez do id cru, pra ninguém conseguir conectar a
  // conta de outro lava jato adivinhando o id).
  gerarUrlAutorizacao(state: string): string {
    const clientId = this.config.get<string>("MERCADOPAGO_CLIENT_ID")?.trim();
    const redirectUri = this.config.get<string>("MERCADOPAGO_OAUTH_REDIRECT_URI")?.trim();
    if (!clientId || !redirectUri) {
      throw new BadRequestException("Conexão com Mercado Pago ainda não configurada nesta instalação. Fale com o suporte.");
    }
    // Diagnóstico: o erro "aplicativo não está pronto para se conectar" do MP
    // quase sempre é redirect_uri não cadastrada igual na aplicação.
    this.logger.log(`OAuth MP: client_id=${clientId} redirect_uri=${redirectUri}`);
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      platform_id: "mp",
      redirect_uri: redirectUri,
      state,
    });
    return `${MP_AUTH_URL}/authorization?${params.toString()}`;
  }

  // Troca o "code" que o Mercado Pago devolveu no redirect por um access
  // token de verdade da conta do lava jato. Chamada uma vez, no callback.
  async trocarCodigoPorToken(code: string): Promise<TokensOAuth> {
    const clientId = this.config.get<string>("MERCADOPAGO_CLIENT_ID");
    const clientSecret = this.config.get<string>("MERCADOPAGO_CLIENT_SECRET");
    const redirectUri = this.config.get<string>("MERCADOPAGO_OAUTH_REDIRECT_URI");
    const resposta = await fetch(`${MP_API_URL}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });
    const corpo: any = await resposta.json().catch(() => null);
    if (!resposta.ok) {
      this.logger.error(`Falha ao trocar code por token no Mercado Pago: ${resposta.status} ${JSON.stringify(corpo)}`);
      throw new BadRequestException("Não foi possível concluir a conexão com o Mercado Pago. Tente novamente.");
    }
    if (!corpo.public_key) {
      // Não é um erro — só registra, porque é comum o Mercado Pago não
      // devolver public_key pra contas conectadas novas (ver
      // publicKeyPlataforma acima, que é o que realmente é usado pra
      // tokenizar cartão).
      this.logger.warn(`OAuth do Mercado Pago não devolveu public_key para a conta ${corpo.user_id} (usando a chave da aplicação como fallback).`);
    }
    return {
      accessToken: corpo.access_token,
      refreshToken: corpo.refresh_token ?? null,
      publicKey: corpo.public_key ?? null,
      userId: String(corpo.user_id),
      expiraEm: new Date(Date.now() + (corpo.expires_in ?? 15552000) * 1000), // padrão MP: 180 dias
    };
  }

  private async renovarToken(refreshToken: string): Promise<TokensOAuth> {
    const clientId = this.config.get<string>("MERCADOPAGO_CLIENT_ID");
    const clientSecret = this.config.get<string>("MERCADOPAGO_CLIENT_SECRET");
    const resposta = await fetch(`${MP_API_URL}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });
    const corpo: any = await resposta.json().catch(() => null);
    if (!resposta.ok) {
      this.logger.error(`Falha ao renovar token do Mercado Pago: ${resposta.status} ${JSON.stringify(corpo)}`);
      throw new BadRequestException(
        "A conexão desse lava jato com o Mercado Pago expirou. Peça pro dono reconectar em Mais > Mercado Pago.",
      );
    }
    return {
      accessToken: corpo.access_token,
      refreshToken: corpo.refresh_token ?? refreshToken,
      publicKey: corpo.public_key ?? null,
      userId: String(corpo.user_id),
      expiraEm: new Date(Date.now() + (corpo.expires_in ?? 15552000) * 1000),
    };
  }

  // Devolve um access token válido do lava jato, renovando (e persistindo)
  // automaticamente se estiver perto de expirar. É o que AgendamentosService/
  // PacotesMensaisService devem chamar antes de qualquer operação de
  // pagamento — nunca leem mercadoPagoAccessToken direto do banco.
  async tokenDaLavaJato(lavaJatoId: string): Promise<string> {
    const lavaJato = await this.prisma.lavaJato.findUnique({
      where: { id: lavaJatoId },
      select: { mercadoPagoAccessToken: true, mercadoPagoRefreshToken: true, mercadoPagoTokenExpiraEm: true },
    });
    if (!lavaJato?.mercadoPagoAccessToken) {
      throw new BadRequestException(
        "Esse lava jato ainda não conectou uma conta Mercado Pago — peça pro dono conectar em Mais > Mercado Pago antes de agendar com pagamento.",
      );
    }
    const prestesAExpirar =
      !lavaJato.mercadoPagoTokenExpiraEm || lavaJato.mercadoPagoTokenExpiraEm.getTime() - Date.now() < 24 * 60 * 60 * 1000;
    if (!prestesAExpirar) return lavaJato.mercadoPagoAccessToken;

    if (!lavaJato.mercadoPagoRefreshToken) return lavaJato.mercadoPagoAccessToken; // nada a fazer, tenta com o que tem

    const tokens = await this.renovarToken(lavaJato.mercadoPagoRefreshToken);
    await this.prisma.lavaJato.update({
      where: { id: lavaJatoId },
      data: {
        mercadoPagoAccessToken: tokens.accessToken,
        mercadoPagoRefreshToken: tokens.refreshToken,
        mercadoPagoTokenExpiraEm: tokens.expiraEm,
      },
    });
    return tokens.accessToken;
  }

  // ============================= ASSINATURA RECORRENTE (Preapproval) =============================

  // Cria a assinatura (cobrança recorrente mensal) no Mercado Pago. O pagador
  // precisa abrir `initPoint` e autorizar com o cartão dele — a cobrança de
  // verdade só começa depois disso (ver o webhook "subscription_preapproval").
  // `accessTokenOverride`: passar o token do lava jato quando for uma
  // assinatura de pacote mensal (cliente pagando o lava jato); omitir usa o
  // token de plataforma (assinatura SaaS do lava jato com a Divisions Tech).
  async criarPreapproval(
    params: { reason: string; externalReference: string; payerEmail: string; precoCentavos: number; backUrl: string },
    accessTokenOverride?: string,
  ): Promise<PreapprovalCriado> {
    const corpo: any = await this.chamar(
      "/preapproval",
      {
        method: "POST",
        body: JSON.stringify({
          reason: params.reason,
          external_reference: params.externalReference,
          payer_email: params.payerEmail,
          back_url: params.backUrl,
          status: "pending",
          auto_recurring: {
            frequency: 1,
            frequency_type: "months",
            transaction_amount: Math.round(params.precoCentavos) / 100,
            currency_id: "BRL",
          },
        }),
      },
      accessTokenOverride,
    );
    return { id: String(corpo.id), initPoint: corpo.init_point, status: corpo.status };
  }

  // Variante SEM redirecionamento: autoriza a assinatura recorrente direto
  // com um cartão já tokenizado no app (mesmo mecanismo de
  // criarPagamentoCartao/CartaoScreen — o cliente nunca vê nem digita nada
  // fora do app, e o número do cartão nunca passa por este servidor). O
  // Mercado Pago aceita `card_token_id` direto no corpo de /preapproval pra
  // isso (documentado como "assinatura sem plano associado") — sem isso, só
  // dá pra criar a assinatura com o fluxo de checkout hospedado (ver
  // criarPreapproval acima), que é o que gerava o redirecionamento.
  // `status: "authorized"` pede pro Mercado Pago já tentar autorizar com o
  // cartão na hora; mesmo assim pode voltar "pending" se precisar de mais
  // alguma verificação — nesse caso só confirma de fato quando o webhook de
  // "subscription_preapproval" chegar (ver WebhooksService), igual ao
  // tratamento que já existe pro preapproval com checkout hospedado.
  async criarPreapprovalComCartao(
    params: {
      reason: string;
      externalReference: string;
      payerEmail: string;
      precoCentavos: number;
      cardTokenId: string;
      backUrl: string;
    },
    accessTokenOverride?: string,
  ): Promise<PreapprovalCriado> {
    const corpo: any = await this.chamar(
      "/preapproval",
      {
        method: "POST",
        body: JSON.stringify({
          reason: params.reason,
          external_reference: params.externalReference,
          payer_email: params.payerEmail,
          back_url: params.backUrl,
          card_token_id: params.cardTokenId,
          status: "authorized",
          auto_recurring: {
            frequency: 1,
            frequency_type: "months",
            transaction_amount: Math.round(params.precoCentavos) / 100,
            currency_id: "BRL",
          },
        }),
      },
      accessTokenOverride,
    );
    return { id: String(corpo.id), initPoint: corpo.init_point ?? null, status: corpo.status };
  }

  async buscarPreapproval(id: string, accessTokenOverride?: string): Promise<PreapprovalDetalhe> {
    const corpo: any = await this.chamar(`/preapproval/${id}`, undefined, accessTokenOverride);
    return {
      id: String(corpo.id),
      status: corpo.status,
      externalReference: corpo.external_reference != null ? String(corpo.external_reference) : null,
      nextPaymentDate: corpo.auto_recurring?.next_payment_date ?? corpo.next_payment_date ?? null,
    };
  }

  // Usado quando o dono cancela a assinatura pelo app — cancela também do
  // lado do Mercado Pago pra parar a cobrança recorrente de verdade.
  async cancelarPreapproval(id: string, accessTokenOverride?: string): Promise<void> {
    await this.chamar(`/preapproval/${id}`, { method: "PUT", body: JSON.stringify({ status: "cancelled" }) }, accessTokenOverride);
  }

  async buscarAuthorizedPayment(id: string, accessTokenOverride?: string): Promise<AuthorizedPaymentDetalhe> {
    const corpo: any = await this.chamar(`/authorized_payments/${id}`, undefined, accessTokenOverride);
    return {
      id: String(corpo.id),
      preapprovalId: corpo.preapproval_id != null ? String(corpo.preapproval_id) : null,
      externalReference: corpo.external_reference != null ? String(corpo.external_reference) : null,
      paymentId: corpo.payment?.id != null ? String(corpo.payment.id) : null,
    };
  }

  // ============================= PAGAMENTO AVULSO (Pix / Cartão) =============================

  // Cria uma cobrança Pix avulsa (não recorrente) — usada pra pagar UM
  // agendamento. Devolve o QR code pronto pra exibir; a confirmação de
  // verdade chega pelo webhook "payment" (ver AgendamentosService).
  // `accessTokenOverride` opcional (ao contrário do que a assinatura sugeria
  // antes): omitir usa o token de PLATAFORMA (ver `chamar()`) — necessário
  // pra cobrar a própria mensalidade do SaaS (AssinaturasPagamentoService),
  // que não tem um "token do lava jato" (o dinheiro fica com a Divisions
  // Tech, não com o lava jato). Chamadas existentes (pagamento do cliente
  // final) continuam passando o token do lava jato normalmente.
  async criarPagamentoPix(params: {
    valorCentavos: number;
    descricao: string;
    externalReference: string;
    payerEmail: string;
  }, accessTokenOverride?: string): Promise<PixCriado> {
    const corpo: any = await this.chamar(
      "/v1/payments",
      {
        method: "POST",
        headers: { "X-Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          transaction_amount: Math.round(params.valorCentavos) / 100,
          description: params.descricao,
          payment_method_id: "pix",
          external_reference: params.externalReference,
          payer: { email: params.payerEmail },
        }),
      },
      accessTokenOverride,
    );
    const dadosPix = corpo.point_of_interaction?.transaction_data;
    return {
      id: String(corpo.id),
      status: corpo.status,
      qrCodeBase64: dadosPix?.qr_code_base64 ?? null,
      qrCode: dadosPix?.qr_code ?? null,
    };
  }

  // Identifica a bandeira do cartão (payment_method_id, ex: "visa",
  // "master") a partir do BIN (6 primeiros dígitos) — o Mercado Pago exige
  // esse id explícito na hora de criar o pagamento (ver criarPagamentoCartao).
  //
  // HISTÓRICO (bug de produção "bandeira sempre master", investigado set/2026):
  // essa função chamava GET /v1/payment_methods/search?bin=...&public_key=...
  // pra descobrir a bandeira pelo BIN. O Mercado Pago, porém, descontinuou o
  // filtro por BIN nesse endpoint ("Changes to the Payment Methods API
  // search", anunciado 26/07/2024, rollout escalonado por país até nov/2024 —
  // https://www.mercadopago.com.br/developers/pt/news/2024/07/26/Changes-to-the-Payment-Methods-API-search--effective-09-09-2024).
  // Confirmamos isso testando o endpoint em sandbox com 3 BINs diferentes
  // (inclusive um BIN de cartão de teste OFICIAL do próprio Mercado Pago,
  // 423564 = Visa, e sem nenhum header de Authorization, pra descartar
  // qualquer influência dele): a chamada sempre devolveu a MESMA lista com
  // os ~80 meios de pagamento habilitados na conta inteira (Mastercard,
  // Visa, Amex, Elo, Pix, boleto, repetidos por vários emissores),
  // ignorando completamente o `bin` enviado. Como o código pegava o
  // primeiro resultado de crédito dessa lista genérica — que por coincidência
  // é sempre um Mastercard —, o resultado era sempre "master", não importa o
  // cartão real do cliente.
  //
  // A correção é não depender mais dessa chamada: identificarBandeiraLocal
  // (pacote compartilhado) reconhece a bandeira pelos próprios dígitos do
  // BIN (mesma técnica usada por qualquer gateway de pagamento, sem chamada
  // de rede nenhuma) — funciona tanto aqui quanto no app (ver CartaoScreen,
  // que agora mostra a bandeira ao cliente assim que ele digita o número).
  async identificarBandeiraCartao(bin: string): Promise<{ paymentMethodId: string }> {
    const bandeira = identificarBandeiraLocal(bin);
    if (!bandeira) {
      throw new BadRequestException("Não foi possível identificar a bandeira desse cartão. Confira o número digitado.");
    }
    return { paymentMethodId: bandeira.paymentMethodId };
  }

  // Cria a cobrança com o cartão TOKENIZADO direto no app do cliente (ver
  // CartaoScreen) — nem o app nem esse servidor chegam a ver o número do
  // cartão em si, só o token de uso único que o próprio Mercado Pago gerou a
  // partir dele. Sempre à vista (installments fixo em 1 — o produto não
  // oferece parcelamento). O `payer.identification` (CPF) é exigido pelo
  // Mercado Pago em pagamentos com cartão no Brasil.
  async criarPagamentoCartao(
    params: {
      valorCentavos: number;
      descricao: string;
      externalReference: string;
      token: string;
      paymentMethodId: string;
      payerEmail: string;
      payerCpf: string;
      payerNome: string;
      // Telefone do cliente (Usuario.telefone) — opcional porque nem todo
      // cadastro antigo tem telefone preenchido. Enviado em payer.phone (ver
      // corpo da Order abaixo) por recomendação oficial do próprio Mercado
      // Pago pra melhorar a avaliação de risco/aprovação (doc "Checkout
      // Transparente via Orders > Payment management > Improve payment
      // approval > Recommendations": manda o máximo de dado do comprador
      // possível) — investigação de recusas "high_risk" (ver HISTÓRICO no
      // corpo da Order logo abaixo) apontou esse campo como ausente.
      payerTelefone?: string | null;
      // Device ID gerado pelo script antifraude do próprio Mercado Pago
      // (window.MP_DEVICE_SESSION_ID, capturado numa WebView oculta em
      // CartaoScreen) — mandado no header X-Meli-Session-Id abaixo quando
      // presente. Ajuda o antifraude a avaliar melhor o risco da transação
      // (ver histórico de "high_risk" logo abaixo); opcional porque a coleta
      // no app pode falhar/expirar sem impedir o pagamento.
      deviceId?: string;
      // Bloco `additional_info` (ver corpo da Order abaixo) — pedido
      // explícito do suporte do Mercado Pago (ticket WCS-50070, set/2026)
      // depois de analisar Orders recusadas com "high_risk": além do que já
      // ia no `payer`, eles pedem dado real de cadastro/histórico de compra
      // do comprador pro antifraude ter mais sinal pra decidir (em vez de
      // recusar direto por falta de informação). Vem calculado por quem
      // chama (AgendamentosService), que tem acesso ao histórico de
      // pagamentos do cliente — este service não deveria consultar o Prisma
      // diretamente por conta própria pra montar isso.
      payerCadastradoEm: Date;
      payerPrimeiraCompra: boolean;
      payerUltimaCompraEm?: Date | null;
      // Data/hora do agendamento sendo pago — vai em items[0].event_date
      // (também pedido no mesmo ticket, "quando disponível").
      dataAgendamento?: Date;
    },
    // Opcional pelo mesmo motivo do comentário em criarPagamentoPix acima —
    // omitir usa o token de plataforma (cobrança da mensalidade do SaaS).
    accessTokenOverride?: string,
  ): Promise<CartaoPagamentoCriado> {
    // HISTÓRICO DE INVESTIGAÇÃO (cartão recusado com "Invalid
    // payment_method_id", código 3028, mesmo com bandeira certa e habilitada
    // na conta — ver logs de produção) — essa função chamava a API CLÁSSICA
    // de Payments (POST /v1/payments), mas a aplicação do Mercado Pago dessa
    // conta foi provisionada especificamente pra "API Orders" (confirmado em
    // Suas integrações > [aplicação] > Detalhes > "API integrada: API
    // Orders"). Chamar a API clássica numa aplicação assim é o que causava
    // esse erro — e, ao tentar contornar com `application_fee` (outra
    // hipótese testada), veio "application_fee attribute must be positive"
    // e depois "You cannot use application_fee with this payment" (a
    // aplicação não está habilitada pra marketplace/split, então nem esse
    // caminho serve). A correção é usar a Orders API mesmo (POST
    // /v1/orders), que é o que essa aplicação realmente espera — ver
    // interpretarOrder/buscarOrderComoPayment abaixo pra como o retorno dela
    // é traduzido pro mesmo vocabulário ("approved"/"pending"/"rejected")
    // que o resto do código (ex: AgendamentosService) já usa.
    const valorFormatado = (Math.round(params.valorCentavos) / 100).toFixed(2);
    // "HTTP 422 Unprocessable Entity" genérico (sem detalhe nenhum no corpo)
    // veio depois de corrigir o external_reference — a estrutura da
    // requisição já bate com o exemplo oficial do SDK Node.js do próprio
    // Mercado Pago (mercadopago/sdk-nodejs), mas esse exemplo SEMPRE inclui
    // nome do pagador (first_name/last_name) e statement_descriptor, que
    // aqui não iam. Adiciona os dois — a Orders API parece validar o payer
    // de forma mais rígida que a API clássica (que aceitava só e-mail+CPF).
    const [primeiroNome, ...restoNome] = params.payerNome.trim().split(/\s+/);
    // Registra só SE o Device ID chegou até aqui (nunca o valor em si, que é
    // um identificador de sessão) — fecha a dúvida se a WebView oculta do app
    // (ver CartaoScreen) está de fato conseguindo capturar o
    // window.MP_DEVICE_SESSION_ID antes do cliente confirmar o pagamento, ou
    // se está sempre expirando/falhando e o antifraude nunca recebe esse sinal.
    this.logger.log(`Cobrança com cartão: Device ID ${params.deviceId ? "presente" : "AUSENTE"} (paymentMethodId=${params.paymentMethodId})`);
    // Idem, pro telefone (ver comentário no payer.phone abaixo) — cadastros
    // antigos podem não ter telefone preenchido.
    this.logger.log(`Cobrança com cartão: telefone do pagador ${params.payerTelefone ? "presente" : "AUSENTE"}`);
    // Log temporário (histórico "Produto sem nome", set/2026): confirma no
    // próprio log o título do item que está de fato indo pro Mercado Pago —
    // fecha a dúvida se o campo `items` (abaixo) está sendo mandado ou se, por
    // algum motivo (deploy antigo, cache, etc.), a versão rodando ainda é a
    // de antes dessa correção.
    this.logger.log(`Cobrança com cartão: enviando items[0].title="${params.descricao.slice(0, 256)}"`);
    const corpo: any = await this.chamar(
      "/v1/orders",
      {
        method: "POST",
        headers: {
          "X-Idempotency-Key": crypto.randomUUID(),
          // Device ID (ver comentário no parâmetro `deviceId` acima) — só
          // manda o header quando a coleta no app deu certo; omitir é
          // melhor do que mandar vazio/inválido.
          ...(params.deviceId ? { "X-Meli-Session-Id": params.deviceId } : {}),
        },
        body: JSON.stringify({
          type: "online",
          processing_mode: "automatic",
          total_amount: valorFormatado,
          external_reference: params.externalReference,
          // HISTÓRICO (set/2026): sem isso, o Mercado Pago mostra "Produto sem
          // nome" pro cliente nos e-mails/telas de confirmação/recusa. Adicionar
          // só `items[].title` (tentativa anterior) NÃO resolveu — confirmado
          // em log que o título estava sendo mandado certinho mesmo assim o
          // e-mail continuou "sem nome". A Orders API tem TAMBÉM um campo
          // `description` separado, no nível principal da Order (fora de
          // `items` — visto no exemplo oficial da API Reference, valor
          // "Smartphone"), que é provavelmente o campo que esse e-mail
          // específico usa. Manda os dois: não custa nada e cobre qualquer um
          // dos dois templates que o Mercado Pago possa estar usando.
          description: params.descricao.slice(0, 256),
          items: [
            {
              title: params.descricao.slice(0, 256),
              quantity: 1,
              unit_price: valorFormatado,
              // external_code/description/event_date (ticket WCS-50070): o
              // Mercado Pago pediu pra "detalhar o serviço nos itens, com
              // código externo, descrição e, quando disponível, a data do
              // agendamento" — usa o mesmo external_reference da Order como
              // código externo do item (não temos um id de produto separado,
              // já que cada Order cobre exatamente 1 "produto": o
              // agendamento em si).
              //
              // HISTÓRICO (pagamento com cartão 100% recusado em produção,
              // set/2026): o Mercado Pago rejeitava a Order com HTTP 400
              // "'$.items[0].external_code' - length must be <= 30, but got
              // 48" — o external_reference completo (formato
              // "agendamento_<uuid>") tem 48 caracteres, acima do limite de
              // 30 desse campo específico. Trunca aqui; não afeta o
              // external_reference de verdade da Order (esse não tem limite
              // de 30 e continua completo logo acima).
              external_code: params.externalReference.slice(0, 30),
              description: params.descricao.slice(0, 256),
              // "services" é o category_id documentado pelo próprio Mercado
              // Pago pra negócio de serviço (usado nas páginas de "dados de
              // indústria" de Aplicativos/Plataformas Online e de Serviços
              // Governamentais e Públicos) — não existe categoria dedicada a
              // beleza/serviços pessoais, então "services" é o mais correto
              // pra um agendamento de lava jato (não é produto físico, não
              // se encaixa em "fashion"/"phones"/"home" etc.).
              category_id: "services",
              ...(params.dataAgendamento ? { event_date: params.dataAgendamento.toISOString() } : {}),
            },
          ],
          // additional_info.payer — DESATIVADO (pagamento com cartão 100%
          // recusado em produção, set/2026, logo depois de ligar isso): o
          // Mercado Pago devolveu HTTP 400 "'$.additional_info' -
          // additionalProperties 'payer' not allowed". Ou seja: o formato
          // aninhado additional_info.payer.{...} que o suporte deles pediu
          // (ticket WCS-50070) e que a doc da API clássica de Payments usa
          // NÃO é aceito pela Orders API (POST /v1/orders, usada aqui) — o
          // schema de `additional_info` dela não tem essa chave "payer". Os
          // parâmetros abaixo continuam sendo calculados/recebidos (dado real
          // do comprador, nada fictício, exatamente como pedido) e é só
          // religar este bloco assim que o suporte confirmar o formato
          // correto pra Orders API — mas até lá isso tem que ficar fora do
          // body, porque um objeto rejeitado quebra a Order inteira (não é
          // ignorado silenciosamente).
          //
          // additional_info: {
          //   payer: {
          //     registration_date: params.payerCadastradoEm.toISOString(),
          //     authentication_type: "MOBILE",
          //     is_first_purchase_online: params.payerPrimeiraCompra,
          //     ...(params.payerUltimaCompraEm ? { last_purchase: params.payerUltimaCompraEm.toISOString() } : {}),
          //   },
          // },
          payer: {
            email: params.payerEmail,
            first_name: primeiroNome || params.payerNome,
            last_name: restoNome.join(" ") || primeiroNome || params.payerNome,
            identification: { type: "CPF", number: params.payerCpf.replace(/\D/g, "") },
            // phone (ver comentário no parâmetro payerTelefone acima) — só
            // manda quando o cadastro tem telefone; a Orders API aceita o
            // payer sem esse campo, mas quanto mais dado do comprador, melhor
            // pro antifraude deles avaliar o risco real da transação em vez
            // de recusar direto por falta de sinal (nosso caso: cc marketplace
            // nova, sem histórico). DDD é sempre os 2 primeiros dígitos no
            // Brasil, independente do número local ter 8 ou 9 dígitos — não
            // dá pra usar um slice fixo a partir do fim pros dois casos.
            ...((params.payerTelefone?.replace(/\D/g, "").length ?? 0) >= 10
              ? (() => {
                  const digitos = params.payerTelefone!.replace(/\D/g, "");
                  return { phone: { area_code: digitos.slice(0, 2), number: digitos.slice(2) } };
                })()
              : {}),
          },
          // HISTÓRICO (pagamento recusado de cara com status_detail
          // "high_risk", mesmo em tentativas legítimas com cartão/CPF/valor
          // diferentes — ver logs de produção set/2026): sem esse bloco, o
          // Mercado Pago cria a Order com `transaction_security.validation:
          // "never"` por padrão, ou seja, NUNCA aciona o desafio 3DS — pra
          // qualquer transação que o antifraude deles considere arriscada
          // (comum em conta de marketplace nova, sem histórico), a única
          // saída que sobra pro motor de risco é recusar direto, sem dar
          // chance de o titular se autenticar. "on_fraud_risk" pede pro
          // Mercado Pago acionar o desafio 3DS SÓ quando o risco exigir (não
          // em toda compra) — e `liability_shift: "required"` é obrigatório
          // junto (transfere a responsabilidade por chargeback pro emissor
          // do cartão quando o desafio é concluído). Doc oficial: Checkout
          // Transparente via Orders > Payment management > Integrar 3DS 2.0.
          // Quando a Order volta com status "action_required"/status_detail
          // "pending_challenge", a URL do desafio vem em
          // transactions.payments[0].payment_method.transaction_security.url
          // (ver interpretarOrder abaixo) — o app abre isso numa WebView
          // (ver CartaoScreen/PagamentoScreen) pro cliente confirmar com o
          // próprio banco antes de aprovar.
          config: {
            online: {
              transaction_security: {
                validation: "on_fraud_risk",
                liability_shift: "required",
              },
            },
          },
          transactions: {
            payments: [
              {
                amount: valorFormatado,
                payment_method: {
                  id: params.paymentMethodId,
                  type: "credit_card",
                  token: params.token,
                  installments: 1,
                  statement_descriptor: params.descricao.slice(0, 22),
                },
              },
            ],
          },
        }),
      },
      accessTokenOverride,
    );
    const { status, statusDetail, desafio3dsUrl } = this.interpretarOrder(corpo);
    // HISTÓRICO (investigação "high_risk", set/2026): quando o Mercado Pago
    // recusa a Order já na criação (HTTP não-2xx), o `chamar()` acima loga um
    // ERROR sozinho. Mas quando a criação responde OK (2xx) e a Order já vem
    // com o pagamento "failed"/"rejected" dentro do corpo — sem nenhum erro
    // de transporte —, esse caminho passava batido, sem nenhum log, dando a
    // falsa impressão de que a tentativa "sumiu" (foi o que aconteceu num
    // teste de R$40 que não apareceu em log nenhum). Registra aqui sempre que
    // o resultado não for aprovação na hora, pra nenhuma tentativa ficar
    // invisível independente do valor ou do motivo.
    if (status !== "approved") {
      this.logger.warn(
        `Order ${corpo.id} criada sem recusa de transporte, mas resultado não aprovado: status=${status} statusDetail=${statusDetail} valor=${valorFormatado} paymentMethodId=${params.paymentMethodId}`,
      );
    }
    // Guarda o id da ORDER (prefixo "ORD...", não o id do pagamento aninhado
    // dentro dela) — é esse id que fica salvo em Pagamento.gatewayPagamentoId
    // e usado depois em buscarPayment/estornarPagamento, que reconhecem esse
    // prefixo pra saber que devem usar a Orders API em vez da API clássica.
    return { id: String(corpo.id), status, statusDetail, desafio3dsUrl };
  }

  // Traduz o status de uma Order (API nova, usada pelo cartão — ver
  // criarPagamentoCartao) pro vocabulário clássico "approved"/"pending"/
  // "rejected" que o resto do código já espera (CartaoPagamentoCriado,
  // PaymentDetalhe). Lê o status da PRIMEIRA transação da Order — a única
  // que essa integração cria por Order — porque é lá que vem o motivo
  // específico de recusa (ex: "cc_rejected_insufficient_amount", igual à API
  // clássica) que traduzirMotivoRecusaCartao usa; o status da Order em si é
  // mais genérico. Tabela oficial: Checkout Transparente via Orders >
  // Payment management > Status > Transaction status.
  private interpretarOrder(corpo: any): {
    status: "approved" | "pending" | "rejected";
    statusDetail: string | null;
    transacao: any;
    desafio3dsUrl: string | null;
  } {
    const transacao = corpo?.transactions?.payments?.[0];
    const statusBruto = transacao?.status ?? corpo?.status;
    const statusDetail = transacao?.status_detail ?? corpo?.status_detail ?? null;
    const status: "approved" | "pending" | "rejected" =
      statusBruto === "processed" && (statusDetail === "accredited" || statusDetail === "partially_refunded")
        ? "approved"
        : ["created", "processing", "action_required", "in_review"].includes(statusBruto)
          ? "pending"
          : "rejected"; // failed, charged_back, refunded, expired, canceled
    // Só vem preenchida quando o Mercado Pago decidiu acionar o desafio 3DS
    // pra essa transação (status_detail "pending_challenge", ver
    // criarPagamentoCartao) — nos demais casos é undefined, por isso o `??
    // null` (facilita quem só quer checar "tem desafio pendente ou não").
    const desafio3dsUrl = transacao?.payment_method?.transaction_security?.url ?? null;
    return { status, statusDetail, transacao, desafio3dsUrl };
  }

  // Cria uma preference do Checkout Pro (página de pagamento hospedada pelo
  // próprio Mercado Pago) — mantido só pra referência/uso futuro (ex: outro
  // método de pagamento que precise de página hospedada); o pagamento com
  // cartão do cliente final agora usa criarPagamentoCartao acima, direto no
  // app, sem sair pro navegador.
  async criarPreferenceCheckout(params: {
    valorCentavos: number;
    descricao: string;
    externalReference: string;
    backUrls: { success: string; pending: string; failure: string };
  }, accessTokenOverride: string): Promise<CheckoutPreferenceCriada> {
    const corpo: any = await this.chamar(
      "/checkout/preferences",
      {
        method: "POST",
        body: JSON.stringify({
          items: [
            {
              title: params.descricao,
              quantity: 1,
              currency_id: "BRL",
              unit_price: Math.round(params.valorCentavos) / 100,
            },
          ],
          external_reference: params.externalReference,
          back_urls: params.backUrls,
          auto_return: "approved",
          payment_methods: { excluded_payment_types: [{ id: "ticket" }] },
        }),
      },
      accessTokenOverride,
    );
    return { id: String(corpo.id), initPoint: corpo.init_point };
  }

  // Ids de Order (cartão — ver criarPagamentoCartao) sempre vêm com o
  // prefixo "ORD" do próprio Mercado Pago, o que basta pra distinguir de um
  // id de payment clássico (Pix) sem precisar guardar mais nada no banco.
  private ehIdDeOrder(id: string): boolean {
    return id.startsWith("ORD");
  }

  // Soma o campo "amount" de cada entrada de um array fee_details do Mercado
  // Pago (ex: [{ type: "mercadopago_fee", amount: 1.5, fee_payer: "collector" }])
  // e devolve em centavos — é a taxa que a própria plataforma do Mercado Pago
  // descontou da cobrança, antes de repassar o resto pra conta do lava jato.
  // Blindado contra formato inesperado/ausente (devolve 0) pra nunca derrubar
  // o polling nem o webhook por causa disso.
  private extrairTaxaCentavos(feeDetails: any): number {
    if (!Array.isArray(feeDetails)) return 0;
    const totalReais = feeDetails.reduce((soma: number, item: any) => soma + (Number(item?.amount) || 0), 0);
    return Math.round(totalReais * 100);
  }

  async buscarPayment(id: string, accessTokenOverride?: string): Promise<PaymentDetalhe> {
    if (this.ehIdDeOrder(id)) return this.buscarOrderComoPayment(id, accessTokenOverride);
    const corpo: any = await this.chamar(`/v1/payments/${id}`, undefined, accessTokenOverride);
    return {
      id: String(corpo.id),
      status: corpo.status,
      externalReference: corpo.external_reference != null ? String(corpo.external_reference) : null,
      transactionAmountCentavos: Math.round((corpo.transaction_amount ?? 0) * 100),
      metodoPagamento: corpo.payment_method_id ?? null,
      dataAprovacao: corpo.date_approved ?? null,
      dataCriacao: corpo.date_created,
      taxaCentavos: this.extrairTaxaCentavos(corpo.fee_details),
    };
  }

  // Consulta uma Order (GET /v1/orders/:id) e devolve no mesmo formato
  // PaymentDetalhe que o resto do código (poll em AgendamentosService,
  // webhook em WebhooksService) já sabe interpretar — nenhum dos dois
  // precisou mudar por causa da Orders API graças a essa tradução ficar
  // isolada aqui.
  private async buscarOrderComoPayment(id: string, accessTokenOverride?: string): Promise<PaymentDetalhe> {
    const corpo: any = await this.chamar(`/v1/orders/${id}`, undefined, accessTokenOverride);
    const { status, statusDetail, transacao, desafio3dsUrl } = this.interpretarOrder(corpo);
    // Mesmo histórico do comentário em criarPagamentoCartao: uma recusa
    // descoberta só AQUI (Order criada normalmente, mas que virou
    // "failed"/"rejected" depois, entre a criação e esse polling) nunca
    // passava pelo log de ERROR do `chamar()` — essa consulta em si é um 200
    // OK. Registra pra essas recusas assíncronas também ficarem visíveis.
    if (status === "rejected") {
      this.logger.warn(`Order ${id} consultada via polling/webhook veio recusada: statusDetail=${statusDetail}`);
    }
    return {
      id: String(corpo.id),
      status,
      externalReference: corpo.external_reference != null ? String(corpo.external_reference) : null,
      transactionAmountCentavos: Math.round(Number(corpo.total_amount ?? 0) * 100),
      metodoPagamento: transacao?.payment_method?.id ?? null,
      dataAprovacao: status === "approved" ? (corpo.last_updated_date ?? null) : null,
      dataCriacao: corpo.created_date,
      desafio3dsUrl,
      // A Orders API (cartão) não documenta fee_details no mesmo lugar da API
      // clássica de payments — tenta no mesmo formato dentro da transação (se
      // o Mercado Pago vier a espelhar lá) e cai pra 0 se não existir, em vez
      // de quebrar. Pix (o grosso dos pagamentos) usa buscarPayment acima,
      // que lê fee_details de verdade; vale conferir com uma cobrança real no
      // cartão se esse valor aparece diferente de zero depois de aprovar.
      taxaCentavos: this.extrairTaxaCentavos(transacao?.fee_details ?? corpo.fee_details),
    };
  }

  // Estorno total (sem `valorCentavos`) ou parcial (com) de um pagamento já
  // aprovado — usado pela multa de não comparecimento (estorna 50%, mantém
  // 50% com o lava jato). Estorno parcial só funciona dentro da janela que o
  // Mercado Pago permite (normalmente até a liberação do valor) — se falhar,
  // quem chamou deve tratar como "precisa resolver manualmente".
  async estornarPagamento(paymentId: string, accessTokenOverride: string, valorCentavos?: number): Promise<void> {
    if (this.ehIdDeOrder(paymentId)) {
      // Orders API: /v1/orders/:id/refund. Estorno parcial exige o
      // `transaction_id` do pagamento aninhado dentro da Order (prefixo
      // "PAY...") — precisa buscar a Order primeiro pra pegar esse id;
      // estorno total é só um corpo vazio.
      let transactionId: string | undefined;
      if (valorCentavos != null) {
        const order: any = await this.chamar(`/v1/orders/${paymentId}`, undefined, accessTokenOverride);
        transactionId = order?.transactions?.payments?.[0]?.id;
      }
      await this.chamar(
        `/v1/orders/${paymentId}/refund`,
        {
          method: "POST",
          body: JSON.stringify(
            valorCentavos != null ? { amount: Math.round(valorCentavos) / 100, transaction_id: transactionId } : {},
          ),
        },
        accessTokenOverride,
      );
      return;
    }
    await this.chamar(
      `/v1/payments/${paymentId}/refunds`,
      {
        method: "POST",
        body: valorCentavos != null ? JSON.stringify({ amount: Math.round(valorCentavos) / 100 }) : undefined,
      },
      accessTokenOverride,
    );
  }

  // ============================= CARTÕES SALVOS (cliente) =============================
  //
  // Guarda um cartão do CLIENTE pra ele reusar em compras futuras nessa
  // lava jato — igual ao pagamento avulso (criarPagamentoCartao acima), o
  // número completo do cartão nunca passa por aqui: o app tokeniza direto
  // com o Mercado Pago (POST /v1/card_tokens) e só manda esse token pra cá.
  //
  // Cada lava jato tem sua própria conta MP (marketplace), então um
  // "customer" do Mercado Pago só existe dentro de UMA conta — por isso
  // criamos/reusamos um customer por (cliente, lava jato), não um customer
  // global do cliente (ver ClienteMercadoPagoCustomer no schema).

  // Devolve o customer_id do Mercado Pago pra esse cliente NESSA lava jato,
  // criando um novo (e persistindo) se ainda não existir. Chamado só na hora
  // de salvar o primeiro cartão do cliente num lava jato.
  async obterOuCriarCustomer(
    params: { clienteId: string; lavaJatoId: string; email: string; nome: string },
    accessTokenOverride: string,
  ): Promise<string> {
    const existente = await this.prisma.clienteMercadoPagoCustomer.findUnique({
      where: { clienteId_lavaJatoId: { clienteId: params.clienteId, lavaJatoId: params.lavaJatoId } },
    });
    if (existente) return existente.mercadoPagoCustomerId;

    let customerId: string;
    try {
      const corpo: any = await this.chamar(
        "/v1/customers",
        { method: "POST", body: JSON.stringify({ email: params.email, first_name: params.nome }) },
        accessTokenOverride,
      );
      customerId = corpo.id;
    } catch (e) {
      // O Mercado Pago recusa criar um customer novo com um email que já
      // existe NESSA conta (ex: o registro local de
      // ClienteMercadoPagoCustomer foi perdido por algum motivo, mas o
      // customer lá continua existindo) — nesse caso busca o customer
      // existente por email em vez de propagar o erro.
      const corpo: any = await this.chamar(
        `/v1/customers/search?email=${encodeURIComponent(params.email)}`,
        undefined,
        accessTokenOverride,
      );
      const encontrado = corpo?.results?.[0]?.id;
      if (!encontrado) throw e;
      customerId = encontrado;
    }

    await this.prisma.clienteMercadoPagoCustomer.create({
      data: { clienteId: params.clienteId, lavaJatoId: params.lavaJatoId, mercadoPagoCustomerId: customerId },
    });
    return customerId;
  }

  // Equivalente a obterOuCriarCustomer acima, mas pro OUTRO fluxo de dinheiro
  // (ver cabeçalho da classe): o customer aqui vive na conta da PLATAFORMA,
  // um por lava jato (ver LavaJatoMercadoPagoCustomer) — usado só pra ela
  // salvar um cartão e pagar a própria mensalidade do SaaS. Sem
  // accessTokenOverride: sempre token de plataforma (nunca faria sentido usar
  // o token do próprio lava jato aqui).
  async obterOuCriarCustomerLavaJato(params: { lavaJatoId: string; email: string; nome: string }): Promise<string> {
    const existente = await this.prisma.lavaJatoMercadoPagoCustomer.findUnique({
      where: { lavaJatoId: params.lavaJatoId },
    });
    if (existente) return existente.mercadoPagoCustomerId;

    let customerId: string;
    try {
      const corpo: any = await this.chamar("/v1/customers", {
        method: "POST",
        body: JSON.stringify({ email: params.email, first_name: params.nome }),
      });
      customerId = corpo.id;
    } catch (e) {
      // Mesmo caso de obterOuCriarCustomer acima: a conta pode já ter um
      // customer com esse email (registro local perdido) — busca em vez de
      // propagar o erro.
      const corpo: any = await this.chamar(`/v1/customers/search?email=${encodeURIComponent(params.email)}`);
      const encontrado = corpo?.results?.[0]?.id;
      if (!encontrado) throw e;
      customerId = encontrado;
    }

    await this.prisma.lavaJatoMercadoPagoCustomer.create({
      data: { lavaJatoId: params.lavaJatoId, mercadoPagoCustomerId: customerId },
    });
    return customerId;
  }

  // Anexa um cartão TOKENIZADO (ver comentário da seção acima) ao customer,
  // devolvendo os dados não sensíveis que o Mercado Pago manda de volta —
  // quem chama (CartoesService) é quem persiste isso em CartaoSalvo.
  async salvarCartaoNoCustomer(
    customerId: string,
    cardToken: string,
    // Opcional pelo mesmo motivo de criarPagamentoPix/criarPagamentoCartao
    // acima — omitir usa o token de plataforma (cartão salvo pra pagar a
    // própria mensalidade do SaaS, ver AssinaturasCartoesService).
    accessTokenOverride?: string,
  ): Promise<{ mercadoPagoCardId: string; bandeira: string; ultimosDigitos: string; nomeTitular: string; banco: string | null }> {
    const corpo: any = await this.chamar(
      `/v1/customers/${customerId}/cards`,
      { method: "POST", body: JSON.stringify({ token: cardToken }) },
      accessTokenOverride,
    );
    return {
      mercadoPagoCardId: corpo.id,
      bandeira: corpo.payment_method?.id ?? "desconhecida",
      ultimosDigitos: corpo.last_four_digits ?? "????",
      nomeTitular: corpo.cardholder?.name ?? "",
      banco: corpo.issuer?.name ?? null,
    };
  }

  // Remove o cartão do cliente lá no Mercado Pago — quem chama também apaga a
  // linha local de CartaoSalvo depois que isso não der erro.
  async removerCartaoDoCustomer(customerId: string, cardId: string, accessTokenOverride?: string): Promise<void> {
    await this.chamar(`/v1/customers/${customerId}/cards/${cardId}`, { method: "DELETE" }, accessTokenOverride);
  }

  // Confere a assinatura HMAC da notificação (header x-signature), usando o
  // "webhook secret" configurado no painel do Mercado Pago (Suas integrações
  // > sua aplicação > Webhooks > Configurar notificações > mostrar chave
  // secreta — não é o Access Token). Fórmula documentada pelo próprio MP:
  // manifesto = "id:{data.id};request-id:{x-request-id};ts:{ts};" (omitindo
  // qualquer parte cujo dado não veio), HMAC-SHA256 desse manifesto com o
  // secret deve bater com o "v1" do header.
  //
  // Sem MERCADOPAGO_WEBHOOK_SECRET configurado não dá pra validar — aceitamos
  // mesmo assim (útil em desenvolvimento/sandbox), mas registramos um alerta;
  // configure o secret antes de ir pra produção.
  validarAssinaturaWebhook(params: { xSignature?: string; xRequestId?: string; dataId?: string }): boolean {
    const secret = this.config.get<string>("MERCADOPAGO_WEBHOOK_SECRET");
    if (!secret) {
      this.logger.warn("MERCADOPAGO_WEBHOOK_SECRET não configurado — pulando validação da assinatura do webhook.");
      return true;
    }
    if (!params.xSignature) return false;

    const partes: Record<string, string> = {};
    for (const par of params.xSignature.split(",")) {
      const [chave, ...resto] = par.split("=");
      if (chave) partes[chave.trim()] = resto.join("=").trim();
    }
    const ts = partes.ts;
    const v1 = partes.v1;
    if (!ts || !v1) return false;

    let manifesto = "";
    if (params.dataId) manifesto += `id:${params.dataId.toLowerCase()};`;
    if (params.xRequestId) manifesto += `request-id:${params.xRequestId};`;
    manifesto += `ts:${ts};`;

    const hmac = crypto.createHmac("sha256", secret).update(manifesto).digest("hex");
    return hmac === v1;
  }
}
