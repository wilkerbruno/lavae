import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { AuthUser } from "../../auth/jwt.strategy";

// Uso: @CurrentUser() user: AuthUser  — dentro de um controller.
// Preenchido pelo JwtStrategy depois que o JwtAuthGuard valida o token.
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  const request = ctx.switchToHttp().getRequest();
  return request.user;
});
