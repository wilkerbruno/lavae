import { Body, Controller, ForbiddenException, Get, Param, Patch, Post } from "@nestjs/common";
import { Papel } from "@lavajato-app/shared";
import { AssinaturasService } from "./assinaturas.service";
import { AssinaturasPagamentoService } from "./assinaturas-pagamento.service";
import { CriarCheckoutDto } from "./dto/criar-checkout.dto";
import { MudarPlanoDto } from "./dto/mudar-plano.dto";
import { DefinirStatusAssinaturaDto } from "./dto/definir-status-assinatura.dto";
import { PagarAssinaturaDto } from "./dto/pagar-assinatura.dto";
import { Roles } from "../common/decorators/roles.decorator";
import { PermitirAssinaturaBloqueada } from "../common/decorators/permitir-assinatura-bloqueada.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthUser } from "../auth/jwt.strategy";

@Controller()
export class AssinaturasController {
  constructor(
    private assinaturasService: AssinaturasService,
    private pagamentoNativo: AssinaturasPagamentoService,
  ) {}

  // @PermitirAssinaturaBloqueada nas três rotas "minha/*": é exatamente o que
  // o dono precisa acessar quando o lava jato está bloqueada (ver a tela de
  // Assinatura no mobile) — sem isso o AssinaturaGuard barraria o próprio
  // acesso à tela que resolve o bloqueio.
  @Roles(Papel.LAVAJATO_ADMIN)
  @PermitirAssinaturaBloqueada()
  @Get("assinaturas/minha")
  minha(@CurrentUser() user: AuthUser) {
    if (!user.lavaJatoId) throw new ForbiddenException("Usuário sem lava jato associado.");
    return this.assinaturasService.minhaAssinatura(user.lavaJatoId);
  }

  // Gera o link de checkout do Mercado Pago pro dono autorizar a cobrança
  // recorrente do plano escolhido — a troca de plano só é efetivada quando o
  // pagamento é confirmado (ver o webhook em AssinaturasService).
  @Roles(Papel.LAVAJATO_ADMIN)
  @PermitirAssinaturaBloqueada()
  @Post("assinaturas/minha/checkout")
  criarCheckout(@Body() dto: CriarCheckoutDto, @CurrentUser() user: AuthUser) {
    if (!user.lavaJatoId) throw new ForbiddenException("Usuário sem lava jato associado.");
    return this.assinaturasService.criarCheckout(user.lavaJatoId, user.id, dto.planoId);
  }

  @Roles(Papel.LAVAJATO_ADMIN)
  @PermitirAssinaturaBloqueada()
  @Patch("assinaturas/minha/cancelar")
  cancelar(@CurrentUser() user: AuthUser) {
    if (!user.lavaJatoId) throw new ForbiddenException("Usuário sem lava jato associado.");
    return this.assinaturasService.cancelar(user.lavaJatoId);
  }

  // ==================== Pagamento nativo (Pix/cartão, sem sair do app) ====================
  // Substitui, pra quem está pagando agora, o checkout externo acima — ver
  // AssinaturasPagamentoService. Mesmas rotas "minha/*", mesmo motivo de
  // @PermitirAssinaturaBloqueada.

  @Roles(Papel.LAVAJATO_ADMIN)
  @PermitirAssinaturaBloqueada()
  @Get("assinaturas/minha/mercadopago-public-key")
  mercadoPagoPublicKey() {
    return { publicKey: this.pagamentoNativo.publicKeyPlataforma };
  }

  @Roles(Papel.LAVAJATO_ADMIN)
  @PermitirAssinaturaBloqueada()
  @Post("assinaturas/minha/pagar")
  pagar(@Body() dto: PagarAssinaturaDto, @CurrentUser() user: AuthUser) {
    if (!user.lavaJatoId) throw new ForbiddenException("Usuário sem lava jato associado.");
    return this.pagamentoNativo.pagar(user.lavaJatoId, user.id, dto);
  }

  @Roles(Papel.LAVAJATO_ADMIN)
  @PermitirAssinaturaBloqueada()
  @Get("assinaturas/minha/pagamentos/:id")
  buscarPagamento(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    if (!user.lavaJatoId) throw new ForbiddenException("Usuário sem lava jato associado.");
    return this.pagamentoNativo.buscarPagamento(id, user.lavaJatoId);
  }

  @Roles(Papel.LAVAJATO_ADMIN)
  @PermitirAssinaturaBloqueada()
  @Patch("assinaturas/minha/pagamentos/:id/cancelar")
  cancelarPagamentoPendente(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    if (!user.lavaJatoId) throw new ForbiddenException("Usuário sem lava jato associado.");
    return this.pagamentoNativo.cancelarPendente(id, user.lavaJatoId);
  }

  // Versão enxuta pro pop-up de "assinatura vencendo" no app — acessível
  // também pro FUNCIONARIO (que não pode ver /assinaturas/minha inteira:
  // faturas, preço do plano etc). Isento do AssinaturaGuard pelo mesmo motivo
  // das rotas acima: mesmo bloqueado, ainda faz sentido saber o status.
  @Roles(Papel.LAVAJATO_ADMIN, Papel.FUNCIONARIO)
  @PermitirAssinaturaBloqueada()
  @Get("assinaturas/minha/resumo")
  resumoVencimento(@CurrentUser() user: AuthUser) {
    if (!user.lavaJatoId) throw new ForbiddenException("Usuário sem lava jato associado.");
    return this.assinaturasService.resumoVencimento(user.lavaJatoId);
  }

  @Roles(Papel.SAAS_ADMIN)
  @Get("assinaturas")
  listarTodas() {
    return this.assinaturasService.listarTodas();
  }

  // Ajuste manual do SAAS_ADMIN (cortesia, migração, downgrade sem passar
  // pelo checkout de pagamento).
  @Roles(Papel.SAAS_ADMIN)
  @Patch("assinaturas/:lavaJatoId/plano")
  mudarPlanoAdmin(@Param("lavaJatoId") lavaJatoId: string, @Body() dto: MudarPlanoDto) {
    return this.assinaturasService.mudarPlanoAdmin(lavaJatoId, dto.planoId);
  }

  // Suspender/reativar manualmente a assinatura de um lava jato específica
  // (painel administrativo — ver apps/admin-web).
  @Roles(Papel.SAAS_ADMIN)
  @Patch("assinaturas/:lavaJatoId/status")
  definirStatus(@Param("lavaJatoId") lavaJatoId: string, @Body() dto: DefinirStatusAssinaturaDto) {
    return this.assinaturasService.definirStatusAdmin(lavaJatoId, dto.status);
  }

  @Roles(Papel.SAAS_ADMIN)
  @Get("faturas")
  listarFaturas() {
    return this.assinaturasService.listarFaturas();
  }
}
