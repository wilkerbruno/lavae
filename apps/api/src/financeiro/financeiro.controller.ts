import { Controller, ForbiddenException, Get, Query } from "@nestjs/common";
import { Papel } from "@lavajato-app/shared";
import { FinanceiroService } from "./financeiro.service";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthUser } from "../auth/jwt.strategy";

@Controller("financeiro")
export class FinanceiroController {
  constructor(private financeiroService: FinanceiroService) {}

  @Roles(Papel.FUNCIONARIO)
  @Get("meu-resumo")
  meuResumo(@CurrentUser() user: AuthUser, @Query("periodo") periodo: "hoje" | "semana" | "mes" = "semana") {
    return this.financeiroService.resumoFuncionario(user.id, periodo);
  }

  @Roles(Papel.LAVAJATO_ADMIN)
  @Get("resumo-lavaJato")
  resumoLavaJato(@CurrentUser() user: AuthUser, @Query("periodo") periodo: "hoje" | "semana" | "mes" = "semana") {
    if (!user.lavaJatoId) throw new ForbiddenException("Usuário sem lava jato associado.");
    return this.financeiroService.resumoLavaJato(user.lavaJatoId, periodo);
  }
}
