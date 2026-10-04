import React, { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { ResumoFinanceiro } from "@lavajato-app/shared";
import { api } from "../../api/client";
import { Card } from "../../components/Card";
import { PriceTag } from "../../components/PriceTag";
import { colors, spacing } from "../../theme/tokens";

const PERIODOS: Array<{ key: ResumoFinanceiro["periodo"]; label: string }> = [
  { key: "hoje", label: "Hoje" },
  { key: "semana", label: "Semana" },
  { key: "mes", label: "Mês" },
];

export function FuncionarioFinanceiroScreen() {
  const [periodo, setPeriodo] = useState<ResumoFinanceiro["periodo"]>("semana");
  const [resumo, setResumo] = useState<ResumoFinanceiro | null>(null);

  const carregar = useCallback(async (p: ResumoFinanceiro["periodo"]) => {
    const { data } = await api.get<ResumoFinanceiro>("/financeiro/meu-resumo", { params: { periodo: p } });
    setResumo(data);
  }, []);

  useFocusEffect(useCallback(() => { carregar(periodo); }, [carregar, periodo]));

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Meu financeiro</Text>

        <View style={styles.periodRow}>
          {PERIODOS.map((p) => (
            <Text
              key={p.key}
              onPress={() => setPeriodo(p.key)}
              style={[styles.periodItem, p.key === periodo && styles.periodItemActive]}
            >
              {p.label}
            </Text>
          ))}
        </View>

        {resumo && (
          <View style={{ gap: spacing.md }}>
            <Card>
              <Text style={styles.label}>Faturamento gerado</Text>
              <PriceTag centavos={resumo.faturamentoCentavos} size={24} />
            </Card>
            <Card>
              <Text style={styles.label}>Minha comissão</Text>
              <PriceTag centavos={resumo.comissaoCentavos} size={18} />
            </Card>
            <Card>
              <Text style={styles.label}>Atendimentos</Text>
              <Text style={styles.count}>{resumo.atendimentos}</Text>
            </Card>
            {!!resumo.multasCentavos && (
              <Card style={{ backgroundColor: colors.dangerSoft }}>
                <Text style={[styles.label, { color: colors.danger }]}>Multas de não comparecimento (incluídas no faturamento)</Text>
                <PriceTag centavos={resumo.multasCentavos} size={16} />
              </Card>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, gap: spacing.lg },
  title: { fontSize: 20, fontWeight: "800", color: colors.ink },
  periodRow: { flexDirection: "row", gap: spacing.sm },
  periodItem: { fontSize: 13, fontWeight: "700", color: colors.inkMuted, padding: spacing.sm },
  periodItemActive: { color: colors.accent },
  label: { fontSize: 12, color: colors.inkMuted, marginBottom: 4 },
  count: { fontSize: 20, fontWeight: "800", color: colors.ink },
});
