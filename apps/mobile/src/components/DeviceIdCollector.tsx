import React from "react";
import { StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import { HTML_DEVICE_ID } from "../payments/cartaoNativo";

// Extraído do bloco de WebView oculta que existia inline em CartaoScreen
// (ver payments/cartaoNativo.ts pro histórico completo — ticket WCS-50070) —
// agora também reaproveitável por qualquer outra tela de pagamento com
// cartão (ex: AssinaturaPagamentoScreen). Ver DeviceIdCollector.web.tsx pro
// par que roda no Expo Web, sem WebView nenhuma.
export interface DeviceIdCollectorProps {
  // "" no HTML_DEVICE_ID vira null aqui — sem sucesso, mas a coleta terminou
  // (quem chama decide se segue o pagamento sem o Device ID ou não).
  onDeviceId: (id: string | null) => void;
}

export function DeviceIdCollector({ onDeviceId }: DeviceIdCollectorProps) {
  return (
    <View style={styles.oculta} pointerEvents="none">
      <WebView
        source={{ html: HTML_DEVICE_ID }}
        onMessage={(evento) => onDeviceId(evento.nativeEvent.data || null)}
        javaScriptEnabled
      />
    </View>
  );
}

const styles = StyleSheet.create({
  oculta: { position: "absolute", width: 1, height: 1, opacity: 0 },
});
