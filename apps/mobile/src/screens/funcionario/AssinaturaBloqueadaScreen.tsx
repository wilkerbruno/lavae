import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Button } from "../../components/Button";
import { colors, spacing } from "../../theme/tokens";

// Mostrada pro FUNCIONARIO (nunca pro dono, que tem sua própria tela de
// Assinatura pra resolver isso) quando a assinatura do lava jato não está em
// dia — ver AssinaturaGuard na API e o RootNavigator, que troca as abas
// normais por essa tela assim que uma chamada qualquer volta com
// ASSINATURA_BLOQUEADA. O funcionário não tem como pagar por aqui (quem
// resolve é o dono, na conta dele), então só resta esperar ou avisar o dono.
export function FuncionarioAssinaturaBloqueadaScreen({ onSair }: { onSair: () => void }) {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Ionicons name="lock-closed-outline" size={48} color={colors.accent} />
        <Text style={styles.title}>Acesso temporariamente bloqueado</Text>
        <Text style={styles.subtitle}>
          A assinatura deste lava jato está com o pagamento pendente. Fale com o dono do lava jato para regularizar —
          assim que a assinatura for renovada, seu acesso volta ao normal automaticamente.
        </Text>
        <Button label="Sair" onPress={onSair} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.md },
  title: { fontSize: 18, fontWeight: "800", color: colors.ink, textAlign: "center" },
  subtitle: { fontSize: 13, color: colors.inkMuted, textAlign: "center", marginBottom: spacing.md, lineHeight: 19 },
});
