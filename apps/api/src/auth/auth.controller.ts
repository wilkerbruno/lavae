import { Body, Controller, Post, Res } from "@nestjs/common";
import { Response } from "express";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { RegisterClienteDto } from "./dto/register-cliente.dto";
import { RegisterLavaJatoDto } from "./dto/register-lavajato.dto";
import { EsqueciSenhaDto, RedefinirSenhaDto, VerificarCodigoDto } from "./dto/redefinir-senha.dto";
import { Public } from "../common/decorators/public.decorator";
import { COOKIE_TOKEN } from "./jwt.strategy";

// Além do token no corpo da resposta (como sempre — é o que o app nativo usa,
// guardado no Keychain/Keystore via expo-secure-store), também seta o mesmo
// token num cookie httpOnly. É só a versão web do app (Expo Web, ver
// secureStorage.web.ts) que depende desse cookie: lá o token nunca fica em
// localStorage, então nem um script malicioso (XSS) consegue ler. `secure`
// fica ligado sempre — o site roda em HTTPS (ver seudominio.com.br) — e
// `sameSite: lax` já cobre o caso de app.seudominio.com.br chamando
// api.seudominio.com.br (mesmo domínio-base, subdomínios diferentes).
const UM_DIA_MS = 24 * 60 * 60 * 1000;

function setarCookieToken(res: Response, token: string) {
  res.cookie(COOKIE_TOKEN, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 7 * UM_DIA_MS, // acompanha o JWT_EXPIRES_IN padrão (7d) — ver auth.module.ts
    path: "/",
  });
}

@Controller("auth")
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post("login")
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const resultado = await this.authService.login(dto);
    setarCookieToken(res, resultado.accessToken);
    return resultado;
  }

  @Public()
  @Post("registrar-cliente")
  async registerCliente(@Body() dto: RegisterClienteDto, @Res({ passthrough: true }) res: Response) {
    const resultado = await this.authService.registerCliente(dto);
    setarCookieToken(res, resultado.accessToken);
    return resultado;
  }

  // Onboarding de uma novo lava jato assinante do SaaS.
  @Public()
  @Post("registrar-lavajato")
  async registerLavaJato(@Body() dto: RegisterLavaJatoDto, @Res({ passthrough: true }) res: Response) {
    const resultado = await this.authService.registerLavaJato(dto);
    setarCookieToken(res, resultado.accessToken);
    return resultado;
  }

  // Esqueci minha senha: 1) pede o código por e-mail, 2) confere o código
  // (devolve um token curto), 3) grava a nova senha com esse token.
  @Public()
  @Post("esqueci-senha")
  esqueciSenha(@Body() dto: EsqueciSenhaDto) {
    return this.authService.esqueciSenha(dto.email);
  }

  @Public()
  @Post("verificar-codigo")
  verificarCodigo(@Body() dto: VerificarCodigoDto) {
    return this.authService.verificarCodigo(dto.email, dto.codigo);
  }

  @Public()
  @Post("redefinir-senha")
  redefinirSenha(@Body() dto: RedefinirSenhaDto) {
    return this.authService.redefinirSenha(dto.token, dto.novaSenha, dto.confirmarSenha);
  }

  // Só a versão web usa isso (ver authStore.ts "logout" web) — o
  // JavaScript da página não consegue apagar um cookie httpOnly sozinho,
  // então precisa pedir pro backend limpar.
  @Public()
  @Post("logout")
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(COOKIE_TOKEN, { path: "/" });
    return { ok: true };
  }
}
