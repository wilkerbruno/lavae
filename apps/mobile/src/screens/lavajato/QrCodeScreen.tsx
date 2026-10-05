import React, { useState } from "react";
import { Image, Platform, ScrollView, StyleSheet, Text, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Asset } from "expo-asset";
import * as Sharing from "expo-sharing";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { alertar } from "../../utils/alertaCompat";
import { colors, spacing } from "../../theme/tokens";

// Imagem estática (não desenhada na hora): o conteúdo é sempre o mesmo —
// aponta pra lavae.store, onde o cliente baixa o app ou agenda pelo
// navegador. Se um dia existir um link direto por lava jato, esse QR Code
// passa a ser gerado dinamicamente em vez de usar esse arquivo fixo.
const QRCODE_ASSET = require("../../../assets/qrcode-agendamento.png");
// Proporção real do arquivo (1200x1600) — usada pra calcular a altura certa a
// partir da largura disponível, em vez de confiar em `aspectRatio` + width
// 100% dentro de um Card (que mediu errado no BarberOne).
const RAZAO_ALTURA_LARGURA = 1600 / 1200;

// Cartaz com QR Code pra imprimir e deixar no lava jato (balcão, vitrine,
// etc) — "Mais" > "QR Code para imprimir" (ver MaisScreen/MaisStack).
export function QrCodeScreen() {
  const [compartilhando, setCompartilhando] = useState(false);
  const { width: larguraTela } = useWindowDimensions();

  const paddingCard = spacing.sm;
  // No navegador a tela pode ser bem larga: limita o cartaz a 480px.
  const larguraImagem = Math.min(larguraTela - spacing.xl * 2 - paddingCard * 2, 480);
  const alturaImagem = larguraImagem * RAZAO_ALTURA_LARGURA;

  async function compartilhar() {
    setCompartilhando(true);
    try {
      const asset = Asset.fromModule(QRCODE_ASSET);
      await asset.downloadAsync();
      const uri = asset.localUri ?? asset.uri;

      // Web: Sharing não existe — dispara o download do arquivo direto.
      if (Platform.OS === "web") {
        const a = document.createElement("a");
        a.href = uri;
        a.download = "qrcode-lavae.png";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return;
      }

      const disponivel = await Sharing.isAvailableAsync();
      if (!disponivel) {
        alertar("Não disponível", "Esse aparelho não consegue compartilhar ou salvar arquivos.");
        return;
      }
      await Sharing.shareAsync(uri, {
        dialogTitle: "Salvar ou imprimir QR Code",
        mimeType: "image/png",
        UTI: "public.png",
      });
    } catch {
      alertar("Não foi possível compartilhar", "Tente novamente em instantes.");
    } finally {
      setCompartilhando(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.hint}>
          Baixe ou compartilhe esse cartaz e deixe impresso no balcão — seus clientes escaneiam e caem direto no
          lavaê para agendar.
        </Text>
        <Card style={[styles.cardImagem, { padding: paddingCard }]}>
          <Image
            source={QRCODE_ASSET}
            style={{ width: larguraImagem, height: alturaImagem, borderRadius: 12 }}
            resizeMode="contain"
          />
        </Card>
        <Button label="Baixar / compartilhar" onPress={compartilhar} loading={compartilhando} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxl * 2, alignItems: "center" },
  hint: { fontSize: 13, color: colors.inkMuted, textAlign: "center", lineHeight: 18 },
  cardImagem: { alignItems: "center" },
});
