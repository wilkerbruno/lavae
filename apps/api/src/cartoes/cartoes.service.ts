import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { MercadoPagoService } from "../pagamentos/mercadopago.service";

// Seleção usada em toda resposta de cartão salvo — nunca inclui
// mercadoPagoCustomerId/mercadoPagoCardId à toa (o mobile precisa dos dois
// pra gerar um token de cobrança novo a cada pagamento, ver CartaoScreen),
// e nunca inclui nada além do que o Mercado Pago já devolve mascarado.
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
export class CartoesService {
  private readonly logger = new Logger(CartoesService.name);

  constructor(
    private prisma: PrismaService,
    private mercadoPago: MercadoPagoService,
  ) {}

  async listar(clienteId: string, lavaJatoId: string) {
    return this.prisma.cartaoSalvo.findMany({
      where: { clienteId, lavaJatoId },
      select: SELECAO_CARTAO,
      orderBy: { criadoEm: "desc" },
    });
  }

  // Salva um cartão já tokenizado (ver SalvarCartaoDto) pro cliente reusar
  // nesse lava jato. Cria o customer do Mercado Pago na primeira vez (ver
  // MercadoPagoService.obterOuCriarCustomer) e reusa nas próximas.
  async salvar(clienteId: string, lavaJatoId: string, cartaoToken: string, bin: string) {
    const cliente = await this.prisma.usuario.findUnique({
      where: { id: clienteId },
      select: { email: true, nome: true },
    });
    if (!cliente) throw new NotFoundException("Usuário não encontrado.");

    const accessToken = await this.mercadoPago.tokenDaLavaJato(lavaJatoId);
    const customerId = await this.mercadoPago.obterOuCriarCustomer(
      { clienteId, lavaJatoId, email: cliente.email, nome: cliente.nome },
      accessToken,
    );
    const cartao = await this.mercadoPago.salvarCartaoNoCustomer(customerId, cartaoToken, accessToken);

    return this.prisma.cartaoSalvo.create({
      data: {
        clienteId,
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

  // Remove o cartão salvo — tanto no Mercado Pago quanto localmente. Se a
  // remoção lá no Mercado Pago falhar (ex: cartão já tinha sido removido por
  // outro canal), ainda assim remove localmente: o que importa pro cliente é
  // parar de ver esse cartão na lista, e um cartão órfão na conta do
  // Mercado Pago sem registro local aqui não pode mais ser cobrado (só
  // conseguimos gerar um token de cobrança novo a partir do que está em
  // CartaoSalvo — ver CartaoScreen).
  async remover(clienteId: string, cartaoId: string): Promise<{ ok: true }> {
    const cartao = await this.prisma.cartaoSalvo.findUnique({ where: { id: cartaoId } });
    if (!cartao || cartao.clienteId !== clienteId) {
      throw new NotFoundException("Cartão não encontrado.");
    }

    try {
      const accessToken = await this.mercadoPago.tokenDaLavaJato(cartao.lavaJatoId);
      await this.mercadoPago.removerCartaoDoCustomer(cartao.mercadoPagoCustomerId, cartao.mercadoPagoCardId, accessToken);
    } catch (e) {
      this.logger.warn(`Falha ao remover cartão ${cartao.mercadoPagoCardId} no Mercado Pago (removendo localmente mesmo assim): ${e}`);
    }

    await this.prisma.cartaoSalvo.delete({ where: { id: cartaoId } });
    return { ok: true };
  }
}
