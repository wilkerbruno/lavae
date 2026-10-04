import React, { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { centavosParaReais, ResumoFinanceiro } from "@lavajato-app/shared";
import { api } from "../../api/client";
import { Card } from "../../components/Card";
import { PriceTag } from "../../components/PriceTag";
import { colors, spacing } from "../../theme/tokens";

interface ResumoPorMetodo {
  atendimentos: number;
  brutoCentavos: number;
  taxasCentavos: number;
  liquidoCentavos: number;
}

function metodoVazio(): ResumoPorMetodo {
  return { atendimentos: 0, brutoCentavos: 0, taxasCentavos: 0, liquidoCentavos: 0 };
}

interface ResumoLavaJato {
  atendimentos: number;
  faturamentoCentavos: number;
  // Já descontada a taxa que o Mercado Pago fica (ver taxasMercadoPagoCentavos)
  // — é o valor que o lava jato de fato recebeu. Opcional só pra não quebrar
  // se a API em produção ainda estiver numa versão antiga sem esse campo.
  faturamentoLiquidoCentavos?: number;
  taxasMercadoPagoCentavos?: number;
  multasCentavos: number;
  comissoesCentavos: number;
  lucroCentavos: number;
  porFuncionario: Array<{ nome: string; atendimentos: number; faturamentoCentavos: number; comissaoCentavos: number }>;
  porServico: Array<{ nome: string; atendimentos: number; faturamentoCentavos: number }>;
  porMetodo?: { PIX: ResumoPorMetodo; CARTAO: ResumoPorMetodo; DINHEIRO: ResumoPorMetodo };
}

const LABEL_METODO: Record<"PIX" | "CARTAO" | "DINHEIRO", string> = {
  PIX: "Pix",
  CARTAO: "Cartão de crédito",
  DINHEIRO: "Dinheiro",
};

const PERIODOS: Array<{ key: ResumoFinanceiro["periodo"]; label: string }> = [
  { key: "hoje", label: "Hoje" },
  { key: "semana", label: "Semana" },
  { key: "mes", label: "Mês" },
];

export function LavaJatoFinanceiroScreen() {
  const [periodo, setPeriodo] = useState<ResumoFinanceiro["periodo"]>("semana");
  const [resumo, setResumo] = useState<ResumoLavaJato | null>(null);

  const carregar = useCallback(async (p: ResumoFinanceiro["periodo"]) => {
    try {
      const { data } = await api.get<ResumoLavaJato>("/financeiro/resumo-lavaJato", { params: { periodo: p } });
      // Defensivo: se a API em produção ainda estiver numa versão antiga (sem
      // "porFuncionario"/"porServico"/"porMetodo" na resposta), evita o crash
      // de tela branca — mostra zerado em vez de derrubar o app num lava jato nova.
      setResumo({
        atendimentos: data.atendimentos ?? 0,
        faturamentoCentavos: data.faturamentoCentavos ?? 0,
        faturamentoLiquidoCentavos: data.faturamentoLiquidoCentavos ?? data.faturamentoCentavos ?? 0,
        taxasMercadoPagoCentavos: data.taxasMercadoPagoCentavos ?? 0,
        multasCentavos: data.multasCentavos ?? 0,
        comissoesCentavos: data.comissoesCentavos ?? 0,
        lucroCentavos: data.lucroCentavos ?? 0,
        porFuncionario: data.porFuncionario ?? [],
        porServico: data.porServico ?? [],
        porMetodo: data.porMetodo ?? { PIX: metodoVazio(), CARTAO: metodoVazio(), DINHEIRO: metodoVazio() },
      });
    } catch {
      setResumo({
        atendimentos: 0,
        faturamentoCentavos: 0,
        faturamentoLiquidoCentavos: 0,
        taxasMercadoPagoCentavos: 0,
        multasCentavos: 0,
        comissoesCentavos: 0,
        lucroCentavos: 0,
        porFuncionario: [],
        porServico: [],
        porMetodo: { PIX: metodoVazio(), CARTAO: metodoVazio(), DINHEIRO: metodoVazio() },
      });
    }
  }, []);

  useFocusEffect(useCallback(() => { carregar(periodo); }, [carregar, periodo]));

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Financeiro</Text>

        <View style={styles.periodRow}>
          {PERIODOS.map((p) => (
            <Text key={p.key} onPress={() => setPeriodo(p.key)} style={[styles.periodItem, p.key === periodo && styles.periodItemActive]}>
              {p.label}
            </Text>
          ))}
        </View>

        {resumo && (
          <View style={{ gap: spacing.md }}>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <Card style={{ flex: 1 }}>
                <Text style={styles.label}>Faturamento (líquido)</Text>
                <PriceTag centavos={resumo.faturamentoLiquidoCentavos ?? resumo.faturamentoCentavos} size={16} />
              </Card>
              <Card style={{ flex: 1 }}>
                <Text style={styles.label}>Comissões</Text>
                <PriceTag centavos={resumo.comissoesCentavos} size={16} />
              </Card>
              <Card style={{ flex: 1, backgroundColor: colors.accentSoft }}>
                <Text style={[styles.label, { color: colors.accent }]}>Lucro</Text>
                <PriceTag centavos={resumo.lucroCentavos} size={16} />
              </Card>
            </View>

            {!!resumo.taxasMercadoPagoCentavos && resumo.taxasMercadoPagoCentavos > 0 && (
              <Card style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={[styles.label, { marginBottom: 0 }]}>
                  Taxa do Mercado Pago (já descontada do faturamento acima)
                </Text>
                <Text style={{ fontSize: 13, fontWeight: "700", color: colors.inkMuted }}>
                  -{centavosParaReais(resumo.taxasMercadoPagoCentavos)}
                </Text>
              </Card>
            )}

            {resumo.multasCentavos > 0 && (
              <Card style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: colors.dangerSoft }}>
                <Text style={[styles.label, { color: colors.danger, marginBottom: 0 }]}>Multas de não comparecimento (incluídas no faturamento)</Text>
                <PriceTag centavos={resumo.multasCentavos} size={14} />
              </Card>
            )}

            <Text style={styles.sectionTitle}>Por forma de pagamento</Text>
            {(["PIX", "CARTAO", "DINHEIRO"] as const).map((chave) => {
              const m = resumo.porMetodo?.[chave] ?? metodoVazio();
              return (
                <Card key={chave} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <View>
                    <Text style={{ fontWeight: "700", color: colors.ink }}>{LABEL_METODO[chave]}</Text>
                    <Text style={{ fontSize: 12, color: colors.inkMuted }}>{m.atendimentos} atendimentos</Text>
                    {m.taxasCentavos > 0 && (
                      <Text style={{ fontSize: 11, color: colors.inkMuted }}>
                        já descontada taxa MP de {centavosParaReais(m.taxasCentavos)}
                      </Text>
                    )}
                  </View>
                  <PriceTag centavos={m.liquidoCentavos} />
                </Card>
              );
            })}

            <Text style={styles.sectionTitle}>Por funcionário</Text>
            {resumo.porFuncionario.length === 0 && (
              <Text style={{ fontSize: 12, color: colors.inkMuted }}>Nenhum atendimento concluído nesse período.</Text>
            )}
            {resumo.porFuncionario.map((f) => (
              <Card key={f.nome} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <View>
                  <Text style={{ fontWeight: "700", color: colors.ink }}>{f.nome}</Text>
                  <Text style={{ fontSize: 12, color: colors.inkMuted }}>{f.atendimentos} atendimentos</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <PriceTag centavos={f.faturamentoCentavos} />
                  <Text style={{ fontSize: 11, color: colors.inkMuted }}>com. {(f.comissaoCentavos / 100).toFixed(2)}</Text>
                </View>
              </Card>
            ))}

            <Text style={styles.sectionTitle}>Por serviço</Text>
            {resumo.porServico.length === 0 && (
              <Text style={{ fontSize: 12, color: colors.inkMuted }}>Nenhum atendimento concluído nesse período.</Text>
            )}
            {resumo.porServico.map((s) => (
              <Card key={s.nome} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <View>
                  <Text style={{ fontWeight: "700", color: colors.ink }}>{s.nome}</Text>
                  <Text style={{ fontSize: 12, color: colors.inkMuted }}>{s.atendimentos} atendimentos</Text>
                </View>
                <PriceTag centavos={s.faturamentoCentavos} />
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
  content: { padding: spacing.xl, gap: spacing.lg },
  title: { fontSize: 20, fontWeight: "800", color: colors.ink },
  periodRow: { flexDirection: "row", gap: spacing.sm },
  periodItem: { fontSize: 13, fontWeight: "700", color: colors.inkMuted, padding: spacing.sm },
  periodItemActive: { color: colors.accent },
  sectionTitle: { fontSize: 13, fontWeight: "700", color: colors.inkMuted, textTransform: "uppercase" },
  label: { fontSize: 11, color: colors.inkMuted, marginBottom: 4 },
});
