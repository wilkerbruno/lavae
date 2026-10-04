import React, { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { api } from "../../api/client";
import { useAuthStore } from "../../store/authStore";
import { Card } from "../../components/Card";
import { PriceTag } from "../../components/PriceTag";
import { colors, spacing } from "../../theme/tokens";

interface ResumoLavaJato {
  atendimentos: number;
  faturamentoCentavos: number;
  comissoesCentavos: number;
  lucroCentavos: number;
  porFuncionario: Array<{ nome: string; atendimentos: number; faturamentoCentavos: number; comissaoCentavos: number }>;
}

export function LavaJatoDashboardScreen() {
  const lavaJatoId = useAuthStore((s) => s.usuario?.lavaJatoId);
  const [resumo, setResumo] = useState<ResumoLavaJato | null>(null);
  // Era um texto fixo ("LavaJato Alameda", deixado de um teste/mock) — mostrava
  // sempre o mesmo nome aqui independente de qual conta/lavajato estivesse
  // logada (inclusive depois do lava jato de teste já ter sido excluída). Os
  // números abaixo (faturamento, agendamentos etc.) sempre vieram certos da
  // lava jato logada de verdade — só esse título nunca tinha sido ligado ao
  // dado real.
  const [nomeLavaJato, setNomeLavaJato] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const { data } = await api.get<ResumoLavaJato>("/financeiro/resumo-lavaJato", { params: { periodo: "hoje" } });
    setResumo(data);
  }, []);

  const carregarLavaJato = useCallback(async () => {
    if (!lavaJatoId) return;
    try {
      const { data } = await api.get<{ nome: string }>(`/lavajatos/${lavaJatoId}`);
      setNomeLavaJato(data.nome);
    } catch {
      // Sem bloquear a tela por causa disso — o resto do painel continua útil.
    }
  }, [lavaJatoId]);

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));
  useFocusEffect(useCallback(() => { carregarLavaJato(); }, [carregarLavaJato]));

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.subtitle}>Painel do dono</Text>
        <Text style={styles.title}>{nomeLavaJato ?? "Meu lava jato"}</Text>

        {resumo && (
          <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
            <Card>
              <Text style={styles.label}>Faturamento hoje</Text>
              <PriceTag centavos={resumo.faturamentoCentavos} size={24} />
            </Card>
            <View style={{ flexDirection: "row", gap: spacing.md }}>
              <Card style={{ flex: 1 }}>
                <Text style={styles.label}>Agendamentos</Text>
                <Text style={styles.count}>{resumo.atendimentos}</Text>
              </Card>
              <Card style={{ flex: 1 }}>
                <Text style={styles.label}>Lucro líquido</Text>
                <PriceTag centavos={resumo.lucroCentavos} size={18} />
              </Card>
            </View>

            <Text style={styles.sectionTitle}>Por funcionário</Text>
            {resumo.porFuncionario.map((f) => (
              <Card key={f.nome} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <View>
                  <Text style={{ fontWeight: "700", color: colors.ink }}>{f.nome}</Text>
                  <Text style={{ fontSize: 12, color: colors.inkMuted }}>{f.atendimentos} atendimentos</Text>
                </View>
                <PriceTag centavos={f.faturamentoCentavos} />
              </Card>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl },
  subtitle: { fontSize: 12, color: colors.inkMuted },
  title: { fontSize: 20, fontWeight: "800", color: colors.ink },
  sectionTitle: { fontSize: 13, fontWeight: "700", color: colors.inkMuted, textTransform: "uppercase", marginTop: spacing.md },
  label: { fontSize: 12, color: colors.inkMuted, marginBottom: 4 },
  count: { fontSize: 20, fontWeight: "800", color: colors.ink },
});
