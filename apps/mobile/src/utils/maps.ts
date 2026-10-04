import { Linking, Platform } from "react-native";

// Abre o app de navegação do celular na localização do lava jato. No Android,
// o esquema "geo:" deixa o próprio sistema abrir o seletor entre todos os
// apps de mapa instalados (Google Maps, Waze etc.) quando há mais de um. No
// iOS não existe um seletor do sistema; abre no Mapas da Apple (ou no app
// padrão de navegação, se o cliente tiver configurado um a partir do iOS
// 17.4). Extraído de MapScreen (tela de mapa da Home) pra ser reaproveitado
// em qualquer lugar que mostre um lava jato com endereço (detalhe da
// lava jato, "meus agendamentos" etc).
export function abrirNoMapa(lavaJato: { nome: string; latitude?: number | null; longitude?: number | null }): void {
  if (lavaJato.latitude == null || lavaJato.longitude == null) return;
  const label = encodeURIComponent(lavaJato.nome);
  const urlGoogleMapsWeb = `https://www.google.com/maps/search/?api=1&query=${lavaJato.latitude},${lavaJato.longitude}`;

  // No navegador (Expo Web) não existem os esquemas "geo:"/"maps:" — vai
  // direto pro Google Maps, numa aba nova (mesmo comportamento do fallback
  // abaixo, só que sem depender de uma Promise rejeitada pra chegar lá, que
  // no react-native-web pode nem rejeitar do jeito esperado).
  if (Platform.OS === "web") {
    Linking.openURL(urlGoogleMapsWeb);
    return;
  }

  const url =
    Platform.OS === "ios"
      ? `maps:0,0?q=${label}@${lavaJato.latitude},${lavaJato.longitude}`
      : `geo:${lavaJato.latitude},${lavaJato.longitude}?q=${lavaJato.latitude},${lavaJato.longitude}(${label})`;
  Linking.openURL(url).catch(() => {
    Linking.openURL(urlGoogleMapsWeb);
  });
}
