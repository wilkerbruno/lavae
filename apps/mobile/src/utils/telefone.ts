import { Linking, Platform } from "react-native";

// Dispara a discagem (app de telefone nativo no Android/iOS; no Expo Web o
// navegador decide o que fazer com "tel:" — normalmente abre o app de
// chamada do sistema operacional, se houver um configurado). Usado tanto
// pelo cliente ligando pro lava jato quanto pelo lava jato/funcionário
// ligando pro cliente, em caso de imprevisto com um agendamento. Modelado
// no mesmo padrão de abrirNoMapa (utils/maps.ts).
export function ligarPara(telefone?: string | null): void {
  if (!telefone) return;
  // Mantém o "+" (DDI) se houver, remove tudo que não for dígito do resto.
  const limpo = telefone.trim().replace(/(?!^\+)[^\d]/g, "");
  if (!limpo) return;

  const url = `tel:${limpo}`;
  if (Platform.OS === "web") {
    // No navegador, Linking.openURL navega a própria aba pra "tel:...". Usar
    // window.open evita perder a página atual caso o SO não tenha um
    // handler de chamada configurado.
    try {
      window.open(url, "_self");
    } catch {
      Linking.openURL(url).catch(() => {});
    }
    return;
  }
  Linking.openURL(url).catch(() => {});
}
