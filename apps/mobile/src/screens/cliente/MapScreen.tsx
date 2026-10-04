import React, { useMemo } from "react";
import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { LavaJatoProxima } from "@lavajato-app/shared";
import { WebViewCompat } from "../../components/WebViewCompat";
import { colors } from "../../theme/tokens";
import { abrirNoMapa } from "../../utils/maps";
import { HomeStackParamList } from "../../navigation/HomeStack";

type Props = NativeStackScreenProps<HomeStackParamList, "Map">;

// Mensagens que o mapa (JS rodando dentro da WebView, ver montarHtml) manda
// de volta pro React Native quando o cliente toca num pin.
type MensagemDoMapa = { tipo: "detalhe"; id: string; nome: string } | { tipo: "rota"; id: string };

// Mapa com OpenStreetMap (via Leaflet, carregado numa WebView) — não depende
// de conta nem chave de API do Google, ao contrário do react-native-maps no
// Android.
function montarHtml(lavaJatos: LavaJatoProxima[], minhaLat: number, minhaLng: number): string {
  const pins = lavaJatos
    .filter((b) => b.latitude != null && b.longitude != null)
    .map((b) => ({ id: b.id, nome: b.nome, lat: b.latitude, lng: b.longitude, nota: b.notaMedia }));

  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>
  html, body, #mapa { height: 100%; margin: 0; padding: 0; }
  .leaflet-popup-content { font-family: -apple-system, Roboto, sans-serif; }
  .popup-titulo { font-weight: 700; margin-bottom: 4px; }
  .popup-acoes a { color: #b8862f; font-weight: 600; text-decoration: none; }
</style>
</head>
<body>
<div id="mapa"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  var pins = ${JSON.stringify(pins)};
  var mapa = L.map('mapa').setView([${minhaLat}, ${minhaLng}], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
  }).addTo(mapa);

  var iconeCliente = L.divIcon({
    className: '',
    html: '<div style="width:16px;height:16px;border-radius:50%;background:#2563eb;border:3px solid #fff;box-shadow:0 0 4px rgba(0,0,0,0.5);"></div>',
    iconSize: [16, 16],
  });
  L.marker([${minhaLat}, ${minhaLng}], { icon: iconeCliente }).addTo(mapa).bindPopup('Você está aqui');

  function enviar(msg) {
    // No app nativo essa página roda dentro de uma WebView de verdade (tem
    // window.ReactNativeWebView); no Expo Web (ver WebViewCompat.web.tsx)
    // ela roda num <iframe> comum, então usa window.parent.postMessage — o
    // mesmo HTML serve pros dois sem nenhuma outra mudança.
    var texto = JSON.stringify(msg);
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(texto);
    } else {
      window.parent.postMessage(texto, '*');
    }
  }

  pins.forEach(function (b) {
    var marcador = L.marker([b.lat, b.lng]).addTo(mapa);
    var nota = b.nota > 0 ? ('★ ' + b.nota.toFixed(1)) : 'Ainda sem avaliações';
    var conteudo = document.createElement('div');
    conteudo.innerHTML =
      '<div class="popup-titulo">' + b.nome + '</div>' +
      '<div>' + nota + '</div>' +
      '<div class="popup-acoes" style="margin-top:6px;display:flex;gap:10px;">' +
      '<a id="detalhe-' + b.id + '">Ver detalhes</a>' +
      '<a id="rota-' + b.id + '">Como chegar</a>' +
      '</div>';
    marcador.bindPopup(conteudo);
    marcador.on('popupopen', function () {
      var elDetalhe = document.getElementById('detalhe-' + b.id);
      var elRota = document.getElementById('rota-' + b.id);
      if (elDetalhe) elDetalhe.onclick = function () { enviar({ tipo: 'detalhe', id: b.id, nome: b.nome }); };
      if (elRota) elRota.onclick = function () { enviar({ tipo: 'rota', id: b.id }); };
    });
  });
</script>
</body>
</html>`;
}

export function MapScreen({ route, navigation }: Props) {
  const { lavaJatos, minhaLat, minhaLng } = route.params;
  const html = useMemo(() => montarHtml(lavaJatos, minhaLat, minhaLng), [lavaJatos, minhaLat, minhaLng]);

  function receberMensagem(dados: string) {
    let msg: MensagemDoMapa;
    try {
      msg = JSON.parse(dados);
    } catch {
      return;
    }
    if (msg.tipo === "detalhe") {
      navigation.navigate("LavaJatoDetail", { lavaJatoId: msg.id, nome: msg.nome });
      return;
    }
    if (msg.tipo === "rota") {
      const lavaJato = lavaJatos.find((b) => b.id === msg.id);
      if (lavaJato) abrirNoMapa(lavaJato);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <WebViewCompat source={{ html }} style={styles.webview} onMessage={receberMensagem} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  webview: { flex: 1, backgroundColor: colors.background },
});
