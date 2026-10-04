import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Papel } from "@lavajato-app/shared";
import { ROLES_KEY } from "../decorators/roles.decorator";

// Guard global. Só entra em ação em rotas que usam @Roles(...);
// sem o decorator, qualquer usuário autenticado passa.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const papeisPermitidos = this.reflector.getAllAndOverride<Papel[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!papeisPermitidos || papeisPermitidos.length === 0) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user || !papeisPermitidos.includes(user.papel)) {
      throw new ForbiddenException("Você não tem permissão para acessar este recurso.");
    }
    return true;
  }
}
