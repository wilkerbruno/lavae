import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { Request } from "express";
import { Papel } from "@lavajato-app/shared";

export interface JwtPayload {
  sub: string; // id do usuário
  papel: Papel;
  lavaJatoId: string | null;
}

export interface AuthUser {
  id: string;
  papel: Papel;
  lavaJatoId: string | null;
}

// Nome do cookie httpOnly que carrega o mesmo JWT devolvido no corpo da
// resposta de login (ver auth.controller.ts). Compartilhado aqui porque é
// tanto quem LÊ (extractor abaixo) quanto quem ESCREVE (controller) o
// cookie — evita o nome duplicado/divergente nos dois lugares.
export const COOKIE_TOKEN = "lavajato_token";

// Extrai o JWT do cookie httpOnly — usado pelo app mobile rodando como
// site (Expo Web, ver secureStorage.web.ts): lá o token não fica em
// localStorage nenhum, só nesse cookie que o JS da página nem consegue ler.
function extrairDoCookie(req: Request): string | null {
  return req?.cookies?.[COOKIE_TOKEN] ?? null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      // Tenta o header Authorization primeiro (app nativo, Postman, etc.) e
      // só depois cai pro cookie — assim nada muda pra quem já manda Bearer.
      jwtFromRequest: ExtractJwt.fromExtractors([ExtractJwt.fromAuthHeaderAsBearerToken(), extrairDoCookie]),
      ignoreExpiration: false,
      secretOrKey: config.get<string>("JWT_SECRET") ?? "dev-secret",
    });
  }

  // O retorno aqui vira `request.user` (lido pelo @CurrentUser()).
  async validate(payload: JwtPayload): Promise<AuthUser> {
    return { id: payload.sub, papel: payload.papel, lavaJatoId: payload.lavaJatoId };
  }
}
