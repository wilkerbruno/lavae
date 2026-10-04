import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";
import { StatusConexaoMercadoPago } from "@lavajato-app/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { MercadoPagoService } from "../../pagamentos/mercadopago.service";

// Conexão da CONTA MERCADO PAGO DE CADA LAVAJATO (modelo marketplace — ver
// o comentário grande em MercadoPagoService). O dono autoriza uma vez (OAuth)
// e a partir daí os pagamentos dos clientes desse lava jato caem direto na
// conta dela.
@Injectable()
export class LavaJatosMercadoPagoService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private mercadoPago: MercadoPagoService,
  ) {}

  // "state" do OAuth: lavaJatoId + assinatura HMAC (não é JWT de usuário de
  // propósito — é só pra impedir que alguém monte a URL de callback chamando
  // outra lavaJatoId na mão). Formato: "<lavaJatoId>.<hmac hex>".
  private assinarState(lavaJatoId: string): string {
    const segredo = this.config.get<string>("JWT_SECRET") ?? "dev-secret";
    const hmac = crypto.createHmac("sha256", segredo).update(lavaJatoId).digest("hex");
    return `${lavaJatoId}.${hmac}`;
  }

  private validarEExtrairLavaJatoId(state: string | undefined): string {
    if (!state || !state.includes(".")) throw new BadRequestException("Link de conexão inválido ou expirado.");
    const [lavaJatoId, hmacRecebido] = state.split(".");
    const segredo = this.config.get<string>("JWT_SECRET") ?? "dev-secret";
    const hmacEsperado = crypto.createHmac("sha256", segredo).update(lavaJatoId).digest("hex");
    if (hmacRecebido !== hmacEsperado) throw new BadRequestException("Link de conexão inválido ou expirado.");
    return lavaJatoId;
  }

  gerarUrlConexao(lavaJatoId: string): { url: string } {
    return { url: this.mercadoPago.gerarUrlAutorizacao(this.assinarState(lavaJatoId)) };
  }

  async status(lavaJatoId: string): Promise<StatusConexaoMercadoPago> {
    const lavaJato = await this.prisma.lavaJato.findUnique({
      where: { id: lavaJatoId },
      select: { mercadoPagoAccessToken: true, mercadoPagoConectadoEm: true },
    });
    return {
      conectado: !!lavaJato?.mercadoPagoAccessToken,
      conectadoEm: lavaJato?.mercadoPagoConectadoEm?.toISOString() ?? null,
    };
  }

  // Dono desconecta (ex: quer trocar de conta Mercado Pago). Não cancela
  // cobranças em andamento — só impede novas cobranças até reconectar.
  async desconectar(lavaJatoId: string): Promise<void> {
    await this.prisma.lavaJato.update({
      where: { id: lavaJatoId },
      data: {
        mercadoPagoAccessToken: null,
        mercadoPagoRefreshToken: null,
        mercadoPagoUserId: null,
        mercadoPagoPublicKey: null,
        mercadoPagoTokenExpiraEm: null,
        mercadoPagoConectadoEm: null,
      },
    });
  }

  // Chamado pelo callback público (o navegador do dono é redirecionado pra
  // cá pelo próprio Mercado Pago depois de autorizar).
  async processarCallback(code: string | undefined, state: string | undefined): Promise<{ sucesso: boolean; mensagem: string }> {
    const lavaJatoId = this.validarEExtrairLavaJatoId(state);
    if (!code) return { sucesso: false, mensagem: "Autorização cancelada ou incompleta." };

    const lavaJato = await this.prisma.lavaJato.findUnique({ where: { id: lavaJatoId } });
    if (!lavaJato) throw new ForbiddenException("Lava jato não encontrada.");

    const tokens = await this.mercadoPago.trocarCodigoPorToken(code);
    await this.prisma.lavaJato.update({
      where: { id: lavaJatoId },
      data: {
        mercadoPagoAccessToken: tokens.accessToken,
        mercadoPagoRefreshToken: tokens.refreshToken,
        mercadoPagoUserId: tokens.userId,
        mercadoPagoPublicKey: tokens.publicKey,
        mercadoPagoTokenExpiraEm: tokens.expiraEm,
        mercadoPagoConectadoEm: new Date(),
      },
    });
    return { sucesso: true, mensagem: "Conta Mercado Pago conectada com sucesso!" };
  }
}
