import { Controller, ForbiddenException, Get, Patch, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { Papel } from "@lavajato-app/shared";
import { Roles } from "../../common/decorators/roles.decorator";
import { Public } from "../../common/decorators/public.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { AuthUser } from "../../auth/jwt.strategy";
import { LavaJatosMercadoPagoService } from "./lavajatos-mercadopago.service";

// Esquema do app (ver apps/mobile/app.json "scheme") — pra onde a página de
// callback abaixo devolve o navegador depois do OAuth (ver comentário em
// processarCallback e na tela mobile ConectarMercadoPagoScreen).
const APP_SCHEME_REDIRECT = "lavajatoapp://mercadopago-conectado";

@Controller("lavajatos/mercadopago")
export class LavaJatosMercadoPagoController {
  constructor(private service: LavaJatosMercadoPagoService) {}

  @Roles(Papel.LAVAJATO_ADMIN)
  @Get("conectar")
  conectar(@CurrentUser() user: AuthUser) {
    if (!user.lavaJatoId) throw new ForbiddenException("Usuário sem lava jato associado.");
    return this.service.gerarUrlConexao(user.lavaJatoId);
  }

  @Roles(Papel.LAVAJATO_ADMIN)
  @Get("status")
  status(@CurrentUser() user: AuthUser) {
    if (!user.lavaJatoId) throw new ForbiddenException("Usuário sem lava jato associado.");
    return this.service.status(user.lavaJatoId);
  }

  @Roles(Papel.LAVAJATO_ADMIN)
  @Patch("desconectar")
  desconectar(@CurrentUser() user: AuthUser) {
    if (!user.lavaJatoId) throw new ForbiddenException("Usuário sem lava jato associado.");
    return this.service.desconectar(user.lavaJatoId);
  }

  // O Mercado Pago redireciona o NAVEGADOR do dono pra cá depois do OAuth
  // (não é chamado pelo app diretamente) — por isso é público e devolve HTML,
  // não JSON. Depois de trocar o code pelo token, redireciona de volta pro
  // app via deep link (lavajatoapp://) — ver ConectarMercadoPagoScreen, que
  // abriu o navegador com expo-web-browser (openAuthSessionAsync) esperando
  // por esse redirect de volta.
  @Public()
  @Get("callback")
  async callback(@Query("code") code: string | undefined, @Query("state") state: string | undefined, @Res() res: Response) {
    let resultado: { sucesso: boolean; mensagem: string };
    try {
      resultado = await this.service.processarCallback(code, state);
    } catch (e: any) {
      resultado = { sucesso: false, mensagem: e?.message ?? "Não foi possível concluir a conexão." };
    }

    const redirectUrl = `${APP_SCHEME_REDIRECT}?sucesso=${resultado.sucesso ? "1" : "0"}`;
    res
      .status(200)
      .type("html")
      .send(`<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Mercado Pago</title>
<style>
  body { font-family: -apple-system, Roboto, sans-serif; background:#141110; color:#f2ede8; text-align:center; padding-top:72px; }
  h2 { color: ${resultado.sucesso ? "#4ade80" : "#f87171"}; }
  a { color:#b8862f; }
</style>
</head>
<body>
  <h2>${resultado.sucesso ? "Conta conectada!" : "Não foi possível conectar"}</h2>
  <p>${resultado.mensagem}</p>
  <p>Voltando para o app…</p>
  <p><a href="${redirectUrl}">Toque aqui se não voltar automaticamente</a></p>
  <script>window.location.replace(${JSON.stringify(redirectUrl)});</script>
</body>
</html>`);
  }
}
