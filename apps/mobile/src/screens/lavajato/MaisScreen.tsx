import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useAuthStore } from "../../store/authStore";
import { Card } from "../../components/Card";
import { colors, spacing } from "../../theme/tokens";
import { MaisStackParamList } from "../../navigation/MaisStack";

type Props = NativeStackScreenProps<MaisStackParamList, "Mais">;

export function MaisScreen({ navigation }: Props) {
  const logout = useAuthStore((s) => s.logout);

  const itens: Array<{ label: string; onPress: () => void }> = [
    { label: "Editar perfil", onPress: () => navigation.navigate("EditarPerfil") },
    { label: "Serviços", onPress: () => navigation.navigate("Servicos") },
    { label: "Preço por porte do veículo", onPress: () => navigation.navigate("PrecoPorte") },
    { label: "Pacotes", onPress: () => navigation.navigate("Pacotes") },
    { label: "Pacotes mensais", onPress: () => navigation.navigate("PacotesMensais") },
    { label: "Equipe", onPress: () => navigation.navigate("Equipe") },
    { label: "Localização", onPress: () => navigation.navigate("Localizacao") },

    { label: "Logo do lava jato", onPress: () => navigation.navigate("Logo") },
    { label: "Mercado Pago", onPress: () => navigation.navigate("MercadoPago") },
    { label: "Assinatura do plano", onPress: () => navigation.navigate("Assinatura") },
    { label: "Suporte", onPress: () => navigation.navigate("Suporte") },
  ];

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Text style={styles.title}>Mais</Text>
      <View style={{ paddingHorizontal: spacing.xl, gap: spacing.sm }}>
        <Card style={{ padding: 0, overflow: "hidden" }}>
          {itens.map((item, i) => (
            <Text
              key={item.label}
              onPress={item.onPress}
              style={[
                styles.item,
                i < itens.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
              ]}
            >
              {item.label}
            </Text>
          ))}
        </Card>
        <Text style={styles.logout} onPress={logout}>Sair da conta</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  title: { fontSize: 20, fontWeight: "800", color: colors.ink, padding: spacing.xl },
  item: { padding: spacing.lg, fontSize: 14, fontWeight: "600", color: colors.ink },
  logout: { color: colors.danger, fontWeight: "700", padding: spacing.sm },
});
