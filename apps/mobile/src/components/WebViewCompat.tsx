import React from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { WebView, WebViewMessageEvent } from "react-native-webview";

// Ver WebViewCompat.web.tsx pro par dessa peça — o Metro escolhe automaticamente
// esse arquivo (nativo) em iOS/Android e o .web.tsx quando rodando no navegador
// (Expo Web), então quem usa <WebViewCompat> não precisa saber qual dos dois
// está ativo. Cobre só o subconjunto de props que as 3 telas que usam WebView
// (MapScreen, CartaoScreen via DeviceIdCollector, PagamentoScreen) precisam —
// não é um substituto genérico de react-native-webview.
export type WebViewCompatSource = { uri: string } | { html: string };

export interface WebViewCompatProps {
  source: WebViewCompatSource;
  style?: StyleProp<ViewStyle>;
  // Recebe só o texto da mensagem (evento.nativeEvent.data no nativo) — no
  // web isso vem de um postMessage comum, sem o envelope nativeEvent.
  onMessage?: (dados: string) => void;
  startInLoadingState?: boolean;
}

export function WebViewCompat({ source, style, onMessage, startInLoadingState }: WebViewCompatProps) {
  return (
    <WebView
      source={source}
      originWhitelist={["*"]}
      style={style}
      javaScriptEnabled
      startInLoadingState={startInLoadingState}
      onMessage={onMessage ? (evento: WebViewMessageEvent) => onMessage(evento.nativeEvent.data) : undefined}
    />
  );
}
