import React, { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { ROTULO_PORTE, Veiculo } from "@lavajato-app/shared";
import { api, mensagemErroApi } from "../../api/client";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { VeiculoFormModal } from "../../components/VeiculoFormModal";
import { alertar } from "../../utils/alertaCompat";
import { colors, spacing } from "../../theme/tokens";

// Perfil > Meus veículos — o cliente cadastra o(s) carro(s)/moto(s) dele; o
// porte de cada um define o valor e o tempo dos serviços ao agendar.
export function MeusVeiculosScreen() {
  const [veiculos, setVeiculos] = useState<Veiculo[] | null>(null);
  const [editando, setEditando] = useState<Veiculo | null>(null);
  const [formAberto, setFormAberto] = useState(false);

  const carregar = useCallback(async () => {
    const { data } = await api.get<Veiculo[]>("/veiculos");
    setVeiculos(data);
  }, []);

  useFocusEffect(
    useCallback(() => {
      carregar().catch(() => setVeiculos([]));
    }, [carregar]),
  );

  function abrirNovo() {
    setEditando(null);
    setFormAberto(true);
  }

  function abrirEdicao(v: Veiculo) {
    setEditando(v);
    setFormAberto(true);
  }

  function remover(v: Veiculo) {
    alertar("Remover veículo?", `${v.modelo} · ${v.placa}`, [
      { text: "Voltar", style: "cancel" },
      {
        text: "Remover",
        style: "destructive",
        onPress: async () => {
          try {
            await api.delete(`/veiculos/${v.id}`);
            carregar();
          } catch (e: any) {
            alertar("Não foi possível remover", mensagemErroApi(e));
          }
        },
      },
    ]);
  }

  if (!veiculos) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <FlatList
        data={veiculos}
        keyExtractor={(v) => v.id}
        contentContainerStyle={styles.lista}
        ListEmptyComponent={<Text style={styles.vazio}>Você ainda não cadastrou nenhum veículo.</Text>}
        renderItem={({ item }) => (
          <Card style={styles.linha}>
            <Ionicons name={item.porte === "MOTO" ? "bicycle" : "car-sport"} size={24} color={colors.accent} />
            <View style={{ flex: 1 }}>
              <Text style={styles.nome}>{[item.marca, item.modelo, item.cor].filter(Boolean).join(" ")}</Text>
              <Text style={styles.meta}>
                {item.placa} · {ROTULO_PORTE[item.porte]}
              </Text>
            </View>
            <Pressable onPress={() => abrirEdicao(item)} hitSlop={8}>
              <Ionicons name="create-outline" size={22} color={colors.inkMuted} />
            </Pressable>
            <Pressable onPress={() => remover(item)} hitSlop={8}>
              <Ionicons name="trash-outline" size={22} color={colors.danger} />
            </Pressable>
          </Card>
        )}
        ListFooterComponent={<Button label="Cadastrar veículo" onPress={abrirNovo} />}
        ListFooterComponentStyle={{ marginTop: spacing.lg }}
      />

      <VeiculoFormModal
        visible={formAberto}
        veiculo={editando}
        onClose={() => setFormAberto(false)}
        onSalvo={() => {
          setFormAberto(false);
          carregar();
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" },
  lista: { padding: spacing.xl, gap: spacing.sm },
  vazio: { fontSize: 13, color: colors.inkMuted, textAlign: "center", marginTop: spacing.xl },
  linha: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  nome: { fontSize: 14, fontWeight: "700", color: colors.ink },
  meta: { fontSize: 12, color: colors.inkMuted, marginTop: 2 },
});
