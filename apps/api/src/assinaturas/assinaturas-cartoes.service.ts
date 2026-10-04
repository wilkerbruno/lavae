import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { MercadoPagoService } from "../pagamentos/mercadopago.service";

// Cartões salvos pelo DONO do lava jato pra pagar a PRÓPRIA mensalidade do
// SaaS — equivalente a CartoesService (cliente final pagando o lava jato),
// mas escopado só por lavaJatoId (não por clienteId) e usando o token de
// PLATAFORMA do Mercado Pago (o dinheiro é da Divisions Tech, não da
// lava jato — ver cabeçalho de MercadoPagoService). Nunca passa
// accessTokenOverride pra nenhuma chamada aqui, de propósito.
const SELECAO_CARTAO = {
  id: true,
  bandeira: true,
  ultimosDigitos: true,
  nomeTitular: true,
  banco: true,
  bin: true,
  mercadoPagoCustomerId: true,
  mercadoPagoCardId: true,
  criadoEm: true,
} as const;

@Injectable()
export class AssinaturasCartoesService {
  private readonly logger = new Logger(AssinaturasCartoesService.name);

  constructor(
    private prisma: PrismaService,
    private mercadoPago: MercadoPagoService,
  ) {}

  async listar(lavaJatoId: string) {
    return this.prisma.cartaoSalvoAssinatura.findMany({
      where: { lavaJatoId },
      select: SELECAO_CARTAO,
      orderBy: { criadoEm: "desc" },
    });
  }

  async salvar(lavaJatoId: string, usuarioId: string, cartaoToken: string, bin: string) {
    const usuario = await this.prisma.usuario.findUnique({ where: { id: usuarioId }, select: { email: true, nome: true } });
    if (!usuario) throw new NotFoundException("Usuário não encontrado.");

    const customerId = await this.mercadoPago.obterOuCriarCustomerLavaJato({ lavaJatoId, email: usuario.email, nome: usuario.nome });
    const cartao = await this.mercadoPago.salvarCartaoNoCustomer(customerId, cartaoToken);

    return this.prisma.cartaoSalvoAssinatura.create({
      data: {
        lavaJatoId,
        mercadoPagoCustomerId: customerId,
        mercadoPagoCardId: cartao.mercadoPagoCardId,
        bandeira: cartao.bandeira,
        ultimosDigitos: cartao.ultimosDigitos,
        nomeTitular: cartao.nomeTitular,
        banco: cartao.banco,
        bin,
      },
      select: SELECAO_CARTAO,
    });
  }

  // Mesmo comportamento de CartoesService.remover: se a remoção no Mercado
  // Pago falhar, remove localmente do mesmo jeito — o que importa é parar de
  // oferecer esse cartão, e um cartão órfão lá sem registro local aqui não
  // pode mais ser usado (só geramos token novo a partir do que está salvo).
  async remover(lavaJatoId: string, cartaoId: string): Promise<{ ok: true }> {
    const cartao = await this.prisma.cartaoSalvoAssinatura.findUnique({ where: { id: cartaoId } });
    if (!cartao || cartao.lavaJatoId !== lavaJatoId) {
      throw new NotFoundException("Cartão não encontrado.");
    }

    try {
      await this.mercadoPago.removerCartaoDoCustomer(cartao.mercadoPagoCustomerId, cartao.mercadoPagoCardId);
    } catch (e) {
      this.logger.warn(`Falha ao remover cartão de assinatura ${cartao.mercadoPagoCardId} no Mercado Pago (removendo localmente mesmo assim): ${e}`);
    }

    await this.prisma.cartaoSalvoAssinatura.delete({ where: { id: cartaoId } });
    return { ok: true };
  }
}
