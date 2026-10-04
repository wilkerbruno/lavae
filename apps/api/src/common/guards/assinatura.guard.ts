import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Papel } from "@lavajato-app/shared";
import { AssinaturasService } from "../../assinaturas/assinaturas.service";
import { PERMITIR_ASSINATURA_BLOQUEADA_KEY } from "../decorators/permitir-assinatura-bloqueada.decorator";

// Guard global (registrado em app.module.ts, depois do RolesGuard). Bloqueia
// FUNCIONARIO e LAVAJATO_ADMIN na hora em que a assinatura do lava jato sai
// de TRIAL/ATIVA (trial vencido sem pagar, cobrança recorrente recusada ou
// cancelada) — sem carência, diferente do cliente final (ver
// AssinaturasService.estaForaDaCarencia, usado só na listagem/agendamento do
// cliente). É o que força o dono a cair na tela de Assinatura pra regularizar
// e impede a equipe de continuar usando o sistema enquanto isso.
//
// CLIENTE e SAAS_ADMIN nunca são afetados por essa checagem: o cliente segue
// a regra de carência à parte, e o SAAS_ADMIN precisa continuar enxergando
// (e reativando) qualquer lava jato pelo admin-web mesmo bloqueada.
@Injectable()
export class AssinaturaGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private assinaturasService: AssinaturasService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isento = this.reflector.getAllAndOverride<boolean>(PERMITIR_ASSINATURA_BLOQUEADA_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isento) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user || (user.papel !== Papel.FUNCIONARIO && user.papel !== Papel.LAVAJATO_ADMIN)) return true;
    if (!user.lavaJatoId) return true;

    const { bloqueada } = await this.assinaturasService.verificarBloqueioEquipe(user.lavaJatoId);
    if (bloqueada) {
      throw new ForbiddenException({
        statusCode: 403,
        error: "Forbidden",
        code: "ASSINATURA_BLOQUEADA",
        message: "A assinatura deste lava jato está pendente. Regularize o pagamento para continuar.",
      });
    }
    return true;
  }
}
