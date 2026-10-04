import React, { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Location from "expo-location";
import { api } from "../../api/client";
import { useAuthStore } from "../../store/authStore";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { colors, spacing } from "../../theme/tokens";

// Tela "Mais > Localização": o dono captura o GPS do próprio celular (parado
// no lava jato) e salva como a localização do estabelecimento — é o que
// alimenta a busca "Perto de você" do app do cliente.
export function LocalizacaoScreen() {
  const lavaJatoId = useAuthStore((s) => s.usuario?.lavaJatoId);
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [status, setStatus] = useState<"idle" | "buscando" | "salvando" | "salvo" | "erro">("idle");

  async function capturarESalvar() {
    if (!lavaJatoId) return;
    setStatus("buscando");
    try {
      const { status: permissao } = await Location.requestForegroundPermissionsAsync();
      if (permissao !== "granted") {
        setStatus("erro");
        return;
      }
      const posicao = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = posicao.coords;
      setCoords({ latitude, longitude });
      setStatus("salvando");
      await api.patch(`/lavajatos/${lavaJatoId}`, { latitude, longitude });
      setStatus("salvo");
    } catch {
      setStatus("erro");
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={{ padding: spacing.xl, gap: spacing.lg }}>
        <Text style={styles.texto}>
          Fique dentro do lava jato e toque no botão abaixo. Vamos usar o GPS do seu celular pra
          registrar onde ele fica — é isso que faz seu lava jato aparecer na busca "Perto de você"
          dos clientes.
        </Text>

        <Card style={{ gap: spacing.sm }}>
          {coords ? (
            <Text style={styles.coords}>
              {coords.latitude.toFixed(5)}, {coords.longitude.toFixed(5)}
            </Text>
          ) : (
            <Text style={styles.coordsVazio}>Localização ainda não capturada nesta tela.</Text>
          )}

          {status === "buscando" || status === "salvando" ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <Button label="Usar minha localização atual" onPress={capturarESalvar} />
          )}

          {status === "salvo" && <Text style={styles.sucesso}>Localização salva com sucesso.</Text>}
          {status === "erro" && (
            <Text style={styles.erro}>
              Não foi possível capturar a localização. Verifique a permissão de GPS do app e tente de novo.
            </Text>
          )}
        </Card>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  texto: { fontSize: 13, color: colors.inkMuted, lineHeight: 19 },
  coords: { fontSize: 14, fontWeight: "700", color: colors.ink },
  coordsVazio: { fontSize: 13, color: colors.inkMuted },
  sucesso: { fontSize: 13, color: colors.success, fontWeight: "600" },
  erro: { fontSize: 13, color: colors.danger },
});
