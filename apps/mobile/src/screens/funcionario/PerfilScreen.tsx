import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useAuthStore } from "../../store/authStore";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { colors, spacing } from "../../theme/tokens";
import { FuncionarioPerfilStackParamList } from "../../navigation/FuncionarioPerfilStack";

type Props = NativeStackScreenProps<FuncionarioPerfilStackParamList, "Perfil">;

// Horário de trabalho e folgas ficam na aba "Horários" (ver HorariosScreen).
export function FuncionarioPerfilScreen({ navigation }: Props) {
  const usuario = useAuthStore((s) => s.usuario);
  const logout = useAuthStore((s) => s.logout);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={{ gap: spacing.lg }}>
          <View>
            <Text style={styles.title}>Perfil</Text>
            <Text style={styles.name}>{usuario?.nome}</Text>
            <Text style={styles.email}>{usuario?.email}</Text>
          </View>
          <Card style={{ padding: 0, overflow: "hidden" }}>
            <Text style={[styles.item, styles.itemComBorda]} onPress={() => navigation.navigate("EditarPerfil")}>
              Editar perfil
            </Text>
            <Text style={styles.item} onPress={() => navigation.navigate("Suporte")}>
              Suporte
            </Text>
          </Card>
        </View>
        <Button label="Sair da conta" variant="secondary" onPress={logout} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, padding: spacing.xl, justifyContent: "space-between" },
  title: { fontSize: 20, fontWeight: "800", color: colors.ink, marginBottom: spacing.lg },
  name: { fontSize: 16, fontWeight: "700", color: colors.ink },
  email: { fontSize: 13, color: colors.inkMuted, marginTop: 2 },
  item: { padding: spacing.lg, fontSize: 14, fontWeight: "600", color: colors.ink },
  itemComBorda: { borderBottomWidth: 1, borderBottomColor: colors.border },
});
