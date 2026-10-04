import { Body, Controller, Get, Patch } from "@nestjs/common";
import { Papel } from "@lavajato-app/shared";
import { ConfiguracoesService } from "./configuracoes.service";
import { UpdateConfiguracaoDto } from "./dto/update-configuracao.dto";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthUser } from "../auth/jwt.strategy";

// SAAS_ADMIN-only: parâmetros globais da plataforma (admin-web -> Configurações).
@Controller("configuracoes")
export class ConfiguracoesController {
  constructor(private configuracoesService: ConfiguracoesService) {}

  @Roles(Papel.SAAS_ADMIN)
  @Get()
  obter() {
    return this.configuracoesService.obter();
  }

  @Roles(Papel.SAAS_ADMIN)
  @Patch()
  atualizar(@Body() dto: UpdateConfiguracaoDto) {
    return this.configuracoesService.atualizar(dto);
  }

  // Sem @Roles: qualquer usuário autenticado (cliente, funcionário, dono ou
  // SAAS_ADMIN) pode ver a tela "Suporte" do app.
  @Get("suporte")
  obterSuporte(@CurrentUser() user: AuthUser) {
    return this.configuracoesService.obterSuporte(user);
  }
}
