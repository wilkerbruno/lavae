import React, { useEffect, useRef } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { View } from "react-native";

// Par web de WebViewCompat.tsx (ver comentário lá) — no navegador não existe
// react-native-webview (zero suporte a web), então isso vira um <iframe>
// comum: `source.uri` -> atributo `src`; `source.html` -> `srcDoc`. Mensagens
// da página carregada chegam via window.postMessage normal (ver MapScreen,
// que já manda `window.parent.postMessage(...)` quando não existe
// `window.ReactNativeWebView`) — filtradas por `event.source` pra não pegar
// postMessage de nenhum outro iframe/aba.
export type WebViewCompatSource = { uri: string } | { html: string };

export interface WebViewCompatProps {
  source: WebViewCompatSource;
  style?: StyleProp<ViewStyle>;
  onMessage?: (dados: string) => void;
  // Sem equivalente direto de "startInLoadingState" num <iframe> comum —
  // ignorado no web (nenhuma das 3 telas que usam isso depende desse spinner
  // pra funcionar, só é um enfeite visual a mais no nativo).
  startInLoadingState?: boolean;
}

export function WebViewCompat({ source, style, onMessage }: WebViewCompatProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    if (!onMessage) return;
    function ouvir(evento: MessageEvent) {
      if (evento.source !== iframeRef.current?.contentWindow) return;
      const dados = typeof evento.data === "string" ? evento.data : JSON.stringify(evento.data);
      onMessage(dados);
    }
    window.addEventListener("message", ouvir);
    return () => window.removeEventListener("message", ouvir);
  }, [onMessage]);

  return (
    <View style={style}>
      {/* @ts-expect-error — elemento DOM puro (iframe), só existe nesse arquivo .web.tsx */}
      <iframe
        ref={iframeRef}
        title="conteudo"
        src={"uri" in source ? source.uri : undefined}
        srcDoc={"html" in source ? source.html : undefined}
        style={{ border: "none", width: "100%", height: "100%" }}
      />
    </View>
  );
}
