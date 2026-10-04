import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";

// Mostra a notificação mesmo com o app aberto em primeiro plano (padrão do
// Expo é NÃO mostrar nesse caso) — configurado uma vez, no boot do app (ver
// App.tsx).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Pede permissão (se ainda não deu/negou) e devolve o token de push do Expo
// pra esse aparelho, ou null se não deu pra conseguir um (simulador, permissão
// negada, ou falta configurar o projeto no EAS — ver comentário abaixo).
// Quem chama decide o que fazer com o token (hoje: mandar pro backend salvar
// em Usuario.pushToken — ver RootNavigator).
export async function registrarPushToken(): Promise<string | null> {
  // Emuladores/simuladores não recebem push de verdade.
  if (!Device.isDevice) return null;

  const { status: statusAtual } = await Notifications.getPermissionsAsync();
  let status = statusAtual;
  if (status !== "granted") {
    const resposta = await Notifications.requestPermissionsAsync();
    status = resposta.status;
  }
  if (status !== "granted") return null;

  // getExpoPushTokenAsync precisa do id do projeto no EAS (criado com
  // `eas init`, que preenche extra.eas.projectId no app.json sozinho). Sem
  // isso ainda configurado, não tem como pedir o token — loga um aviso em vez
  // de quebrar o app.
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) {
    console.warn(
      "Push notifications: falta configurar extra.eas.projectId no app.json (rode `eas init`). Aviso de assinatura vencendo via push não vai funcionar até isso ser feito.",
    );
    return null;
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    return token;
  } catch (e) {
    console.warn("Não foi possível obter o token de push do Expo:", e);
    return null;
  }
}
