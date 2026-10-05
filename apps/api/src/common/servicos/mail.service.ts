import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as net from "net";
import * as tls from "tls";

// Envio de e-mail por SMTP (SMTP nativo, sem dependências). Configure no ambiente da API:
//   SMTP_HOST, SMTP_PORT (465 = SSL), SMTP_USER, SMTP_PASS, SMTP_FROM
// Ex. Gmail: smtp.gmail.com / 465 / seu@gmail.com / "senha de app" de 16
// caracteres (não a senha normal). Sem isso, nenhum e-mail sai — o erro vai
// pro log da API, nunca pro usuário (o "esqueci minha senha" não revela se o
// e-mail existe).
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  get configurado(): boolean {
    return !!this.config.get<string>("SMTP_HOST") && !!this.config.get<string>("SMTP_USER") && !!this.config.get<string>("SMTP_PASS");
  }

  // Cliente SMTP mínimo: 465 = SSL direto; outras portas = STARTTLS. AUTH LOGIN.
  private smtp(host: string, porta: number, user: string, pass: string, de: string, para: string, mensagem: string): Promise<void> {
    return new Promise((resolve, reject) => {
      let socket: net.Socket | tls.TLSSocket;
      let buffer = "";
      let fila: Array<(linha: string) => void> = [];
      const timer = setTimeout(() => { socket.destroy(); reject(new Error("timeout SMTP")); }, 20000);
      const fim = (e?: Error) => { clearTimeout(timer); try { socket.destroy(); } catch {} e ? reject(e) : resolve(); };

      const ligar = (s: net.Socket | tls.TLSSocket) => {
        socket = s;
        s.setEncoding("utf8");
        s.on("data", (d: string) => {
          buffer += d;
          // resposta completa = última linha "NNN espaço"
          const linhas = buffer.split("\r\n");
          if (linhas.length < 2) return;
          const ultima = linhas[linhas.length - 2];
          if (/^\d{3} /.test(ultima)) {
            const resp = buffer; buffer = "";
            const cb = fila.shift();
            if (cb) cb(resp);
          }
        });
        s.on("error", (e) => fim(e));
      };
      const espera = () => new Promise<string>((res) => fila.push(res));
      const cmd = async (c: string, ok: string[]) => {
        const p = espera();
        socket.write(c + "\r\n");
        const r = await p;
        if (!ok.some((k) => r.startsWith(k))) throw new Error(`SMTP: ${r.trim()}`);
        return r;
      };
      const fluxo = async () => {
        const ehlo = "lavae.store";
        await cmd("EHLO " + ehlo, ["250"]);
        const b64 = (t: string) => Buffer.from(t, "utf8").toString("base64");
        await cmd("AUTH LOGIN", ["334"]);
        await cmd(b64(user), ["334"]);
        await cmd(b64(pass), ["235"]);
        await cmd(`MAIL FROM:<${user}>`, ["250"]);
        await cmd(`RCPT TO:<${para}>`, ["250", "251"]);
        await cmd("DATA", ["354"]);
        const corpo = mensagem.replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");
        await cmd(corpo + "\r\n.", ["250"]);
        socket.write("QUIT\r\n");
      };
      const iniciar = (s: net.Socket | tls.TLSSocket) => {
        ligar(s);
        const saudacao = espera();
        saudacao.then(async (r) => {
          if (!r.startsWith("220")) throw new Error("SMTP: " + r.trim());
          if (porta !== 465) {
            await cmd("EHLO lavae.store", ["250"]);
            await cmd("STARTTLS", ["220"]);
            const antigo = socket as net.Socket;
            antigo.removeAllListeners("data");
            const seguro = tls.connect({ socket: antigo, servername: host });
            await new Promise<void>((ok, ko) => { seguro.once("secureConnect", () => ok()); seguro.once("error", ko); });
            fila = []; buffer = "";
            ligar(seguro);
          }
          await fluxo();
        }).then(() => fim(), (e) => fim(e));
      };
      if (porta === 465) {
        const s = tls.connect({ host, port: porta, servername: host });
        s.once("secureConnect", () => iniciar(s));
        s.once("error", (e) => fim(e));
        socket = s;
      } else {
        const s = net.connect({ host, port: porta });
        s.once("connect", () => iniciar(s));
        s.once("error", (e) => fim(e));
        socket = s;
      }
    });
  }

  private montar(de: string, para: string, assunto: string, html: string, texto: string): string {
    const limite = "lavae_" + Date.now().toString(36);
    const b64 = (t: string) => Buffer.from(t, "utf8").toString("base64").replace(/(.{76})/g, "$1\r\n");
    return [
      `From: ${de}`,
      `To: ${para}`,
      `Subject: =?UTF-8?B?${Buffer.from(assunto, "utf8").toString("base64")}?=`,
      "MIME-Version: 1.0",
      `Date: ${new Date().toUTCString()}`,
      `Content-Type: multipart/alternative; boundary="${limite}"`,
      "",
      `--${limite}`,
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      b64(texto),
      `--${limite}`,
      'Content-Type: text/html; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      b64(html),
      `--${limite}--`,
    ].join("\r\n");
  }

  async enviar(para: string, assunto: string, html: string, texto: string): Promise<boolean> {
    if (!this.configurado) {
      this.logger.error("SMTP não configurado (SMTP_HOST/SMTP_USER/SMTP_PASS): e-mail não enviado.");
      return false;
    }
    try {
      const remetente = this.config.get<string>("SMTP_FROM") ?? `lavaê <${this.config.get<string>("SMTP_USER")}>`;
      const user = this.config.get<string>("SMTP_USER")!;
      const porta = Number(this.config.get<string>("SMTP_PORT") ?? 465);
      await this.smtp(this.config.get<string>("SMTP_HOST")!, porta, user, this.config.get<string>("SMTP_PASS")!, remetente, para, this.montar(remetente, para, assunto, html, texto));
      return true;
    } catch (e: any) {
      this.logger.error(`Falha ao enviar e-mail: ${e?.message ?? e}`);
      return false;
    }
  }

  async enviarCodigoRedefinicao(para: string, nome: string, codigo: string, minutosValidade: number) {
    const primeiroNome = (nome ?? "").split(" ")[0] || "tudo bem";
    const html = `<!doctype html><html><body style="margin:0;background:#0A1620;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0A1620;padding:32px 12px;"><tr><td align="center">
<table width="460" cellpadding="0" cellspacing="0" style="max-width:460px;background:#101F2C;border:1px solid #223A4D;border-radius:16px;padding:32px;">
<tr><td style="color:#2FB8E6;font-size:22px;font-weight:700;letter-spacing:.3px;">lavaê</td></tr>
<tr><td style="color:#EAF4FB;font-size:20px;font-weight:700;padding-top:18px;">Redefinir sua senha</td></tr>
<tr><td style="color:#8AA1B3;font-size:14px;line-height:22px;padding-top:10px;">Olá, ${escapar(primeiroNome)}. Use o código abaixo no app para criar uma nova senha. Ele vale por ${minutosValidade} minutos.</td></tr>
<tr><td align="center" style="padding:24px 0;"><div style="display:inline-block;background:#0A1620;border:1px solid #2FB8E6;border-radius:12px;padding:14px 28px;color:#EAF4FB;font-size:34px;font-weight:700;letter-spacing:10px;">${codigo}</div></td></tr>
<tr><td style="color:#8AA1B3;font-size:12px;line-height:18px;">Se você não pediu para redefinir a senha, ignore este e-mail: sua senha continua a mesma. Nunca compartilhe esse código com ninguém.</td></tr>
</table></td></tr></table></body></html>`;
    const texto = `lavaê - Redefinir senha\n\nSeu código: ${codigo}\nValido por ${minutosValidade} minutos. Se não foi você, ignore este e-mail.`;
    return this.enviar(para, `${codigo} é o seu código do lavaê`, html, texto);
  }
}

function escapar(t: string): string {
  return t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
