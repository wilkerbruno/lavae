import { Body, Controller, Get, Patch } from "@nestjs/common";
import { UsuariosService } from "./usuarios.service";
import { SalvarPushTokenDto } from "./dto/salvar-push-token.dto";
import { UpdateMeuPerfilDto } from "./dto/update-meu-perfil.dto";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthUser } from "../auth/jwt.strategy";

@Controller("usuarios")
export class UsuariosController {
  constructor(private usuariosService: UsuariosService) {}

  // Usado pela versão web do app ao abrir (ver authStore.ts "restaurarSessao"
  // web): autentica só pelo cookie httpOnly, sem precisar de token nenhum
  // salvo em localStorage.
  @Get("meu-perfil")
  buscarMeuPerfil(@CurrentUser() user: AuthUser) {
    return this.usuariosService.buscarMeuPerfil(user.id);
  }

  // Qualquer papel logado pode salvar o próprio token — hoje só é usado pro
  // aviso de assinatura vencendo (equipe do lava jato), mas é um dado inócuo
  // por usuário, sem motivo pra restringir por papel.
  @Patch("meu-push-token")
  salvarPushToken(@Body() dto: SalvarPushTokenDto, @CurrentUser() user: AuthUser) {
    return this.usuariosService.salvarPushToken(user.id, dto.pushToken);
  }

  // Tela "Perfil" — sem @Roles: qualquer papel logado (cliente, funcionário,
  // dono) edita os próprios dados básicos. Regras de quem pode mexer em quê
  // (ex: telefone de FUNCIONARIO) ficam no service.
  @Patch("meu-perfil")
  atualizarMeuPerfil(@Body() dto: UpdateMeuPerfilDto, @CurrentUser() user: AuthUser) {
    return this.usuariosService.atualizarMeuPerfil(user.id, user.papel, dto);
  }
}
