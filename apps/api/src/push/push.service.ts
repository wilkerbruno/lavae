import { Injectable, Logger } from "@nestjs/common";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

// Manda push via Expo (o app mobile usa expo-notifications — ver
// apps/mobile/src/utils/push.ts). Sem SDK novo: é só um POST simples, mesmo
// estilo do MercadoPagoService (fetch direto). Expo aceita até 100 mensagens
// por chamada; como hoje só mandamos pra equipe de UMA lava jato por vez
// (poucos usuários), não precisa paginar em lotes.
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  async enviarParaTokens(tokens: (string | null)[], titulo: string, corpo: string, data?: Record<string, unknown>) {
    // Tokens do Expo começam com "ExponentPushToken[" — filtra null/vazio e
    // qualquer lixo que não seja um token de verdade (ex: usuário nunca
    // autorizou notificações).
    const validos = tokens.filter((t): t is string => !!t && t.startsWith("ExponentPushToken"));
    if (validos.length === 0) return;

    const mensagens = validos.map((to) => ({ to, title: titulo, body: corpo, data, sound: "default" }));

    try {
      const resposta = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(mensagens),
      });
      if (!resposta.ok) {
        this.logger.error(`Falha ao enviar push pro Expo (${resposta.status}): ${await resposta.text()}`);
      }
    } catch (e) {
      // Nunca deixa uma falha de rede do serviço de push derrubar quem chamou
      // (ex: o cron de aviso de vencimento) — só loga e segue.
      this.logger.error(`Erro ao chamar a API de push do Expo: ${e}`);
    }
  }
}
