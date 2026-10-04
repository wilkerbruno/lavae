import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { Papel } from "@lavajato-app/shared";
import { PacotesMensaisService } from "./pacotes-mensais.service";
import { CreatePacoteMensalDto } from "./dto/create-pacote-mensal.dto";
import { UpdatePacoteMensalDto } from "./dto/update-pacote-mensal.dto";
import { AssinarPacoteMensalDto } from "./dto/assinar-pacote-mensal.dto";
import { Roles } from "../common/decorators/roles.decorator";
import { Public } from "../common/decorators/public.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthUser } from "../auth/jwt.strategy";

@Controller()
export class PacotesMensaisController {
  constructor(private pacotesMensaisService: PacotesMensaisService) {}

  // ---------- Catálogo público: o app do cliente navega pelo id do lava jato ----------

  @Public()
  @Get("lavajatos/:lavaJatoId/pacotes-mensais")
  listarPublico(@Param("lavaJatoId") lavaJatoId: string) {
    return this.pacotesMensaisService.listarPublico(lavaJatoId);
  }

  // ---------- Gestão: só o dono do lava jato mexe no próprio catálogo ----------

  @Roles(Papel.LAVAJATO_ADMIN)
  @Get("pacotes-mensais")
  listar(@CurrentUser() user: AuthUser) {
    return this.pacotesMensaisService.listarDaLavaJato(user.lavaJatoId!);
  }

  @Roles(Papel.LAVAJATO_ADMIN)
  @Post("pacotes-mensais")
  criar(@Body() dto: CreatePacoteMensalDto, @CurrentUser() user: AuthUser) {
    return this.pacotesMensaisService.criar(user.lavaJatoId!, dto);
  }

  @Roles(Papel.LAVAJATO_ADMIN)
  @Patch("pacotes-mensais/:id")
  atualizar(@Param("id") id: string, @Body() dto: UpdatePacoteMensalDto, @CurrentUser() user: AuthUser) {
    return this.pacotesMensaisService.atualizar(id, user.lavaJatoId!, dto);
  }

  // ---------- Assinatura (o cliente) ----------

  // Tudo dentro do app, sem redirecionar pro site do Mercado Pago — ver
  // PacotesMensaisService.assinar pros detalhes de cada método de pagamento.
  @Roles(Papel.CLIENTE)
  @Post("pacotes-mensais/:id/assinar")
  assinar(@Param("id") id: string, @Body() dto: AssinarPacoteMensalDto, @CurrentUser() user: AuthUser) {
    return this.pacotesMensaisService.assinar(user.id, id, dto);
  }

  // O app faz polling nisso enquanto aguarda a confirmação do Pix/cartão
  // avulso de um período (ver AssinarPacoteScreen) — mesmo padrão de
  // GET /agendamentos/pagamentos/:id.
  @Roles(Papel.CLIENTE)
  @Get("pacotes-mensais/pagamentos/:id")
  buscarPagamento(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.pacotesMensaisService.buscarPagamento(id, user.id);
  }

  @Roles(Papel.CLIENTE)
  @Get("pacotes-mensais/minhas-assinaturas")
  minhasAssinaturas(@CurrentUser() user: AuthUser) {
    return this.pacotesMensaisService.minhasAssinaturas(user.id);
  }

  @Roles(Papel.CLIENTE)
  @Patch("pacotes-mensais/assinaturas/:id/cancelar")
  cancelarAssinatura(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.pacotesMensaisService.cancelarAssinatura(user.id, id);
  }
}
