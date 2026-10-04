import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  AJUSTE_DURACAO_PORTE_PADRAO,
  AJUSTE_PRECO_PORTE_PADRAO,
  AjustePorte,
  LavaJatoPublica,
  PORTES_VEICULO,
  PORTE_BASE,
  PorteVeiculo,
  ROTULO_PORTE,
  centavosParaReais,
} from "@lavajato-app/shared";
import { api, mensagemErroApi } from "../../api/client";
import { useAuthStore } from "../../store/authStore";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { alertar } from "../../utils/alertaCompat";
import { ajustesDoLavaJato, valoresParaPorte } from "../../utils/porte";
import { colors, radius, spacing } from "../../theme/tokens";
import { KeyboardAvoid } from "../../components/KeyboardAvoid";

// Valores de exemplo só pra o dono enxergar o efeito dos percentuais.
const EXEMPLO_PRECO_CENTAVOS = 5000;
const EXEMPLO_DURACAO_MINUTOS = 60;

type CamposPorte = Record<PorteVeiculo, string>;

function paraCampos(ajuste: AjustePorte): CamposPorte {
  return Object.fromEntries(PORTES_VEICULO.map((p) => [p, String(ajuste[p])])) as CamposPorte;
}

// Mais > Preço por porte — os preços e tempos cadastrados em Serviços/Pacotes
// valem para um carro HATCH (porte base); aqui o dono define quanto a mais (ou
// a menos) cobra e demora para moto, sedan, SUV e picape, em percentual.
export function PrecoPorteScreen() {
  const lavaJatoId = useAuthStore((s) => s.usuario?.lavaJatoId);
  const [carregando, setCarregando] = useState(true);
  const [preco, setPreco] = useState<CamposPorte>(paraCampos(AJUSTE_PRECO_PORTE_PADRAO));
  const [duracao, setDuracao] = useState<CamposPorte>(paraCampos(AJUSTE_DURACAO_PORTE_PADRAO));
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!lavaJatoId) return;
    api
      .get<LavaJatoPublica>(`/lavajatos/${lavaJatoId}/publico`)
      .then(({ data }) => {
        const ajustes = ajustesDoLavaJato(data);
        setPreco(paraCampos(ajustes.preco));
        setDuracao(paraCampos(ajustes.duracao));
      })
      .finally(() => setCarregando(false));
  }, [lavaJatoId]);

  // Converte os textos digitados em percentuais; null se algum valor é inválido.
  function lerAjuste(campos: CamposPorte): AjustePorte | null {
    const resultado = {} as AjustePorte;
    for (const p of PORTES_VEICULO) {
      const n = parseInt(campos[p], 10);
      if (!Number.isFinite(n) || n < 10 || n > 500) return null;
      resultado[p] = n;
    }
    // O porte base sempre vale 100% (é a referência dos preços cadastrados).
    resultado[PORTE_BASE] = 100;
    return resultado;
  }

  const previa = useMemo(() => {
    const ajustePreco = lerAjuste(preco);
    const ajusteDuracao = lerAjuste(duracao);
    if (!ajustePreco || !ajusteDuracao) return null;
    return { preco: ajustePreco, duracao: ajusteDuracao };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preco, duracao]);

  async function salvar() {
    if (!lavaJatoId) return;
    const ajustePreco = lerAjuste(preco);
    const ajusteDuracao = lerAjuste(duracao);
    if (!ajustePreco || !ajusteDuracao) {
      alertar("Confira os percentuais", "Use números inteiros entre 10 e 500 em todos os campos.");
      return;
    }
    setSalvando(true);
    try {
      await api.patch(`/lavajatos/${lavaJatoId}`, { ajustePrecoPorte: ajustePreco, ajusteDuracaoPorte: ajusteDuracao });
      alertar("Salvo!", "Os novos valores já valem para os próximos agendamentos.");
    } catch (e: any) {
      alertar("Não foi possível salvar", mensagemErroApi(e));
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <KeyboardAvoid style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.explicacao}>
            Os preços e tempos que você cadastra em Serviços, Pacotes e Pacotes mensais são os de um carro{" "}
            {ROTULO_PORTE[PORTE_BASE]}. Para os outros portes, o app aplica o percentual abaixo (100% = mesmo valor). Exemplo: com
            SUV em 135%, uma lavagem de R$ 50,00 sai por R$ 67,50 e demora 35% a mais.
          </Text>

          <Card style={{ gap: spacing.md }}>
            <View style={styles.linha}>
              <Text style={[styles.cabecalho, { flex: 1 }]}>Porte</Text>
              <Text style={[styles.cabecalho, styles.colunaNumero]}>Preço %</Text>
              <Text style={[styles.cabecalho, styles.colunaNumero]}>Tempo %</Text>
            </View>

            {PORTES_VEICULO.map((p) => {
              const base = p === PORTE_BASE;
              return (
                <View key={p} style={styles.linha}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.porte}>{ROTULO_PORTE[p]}</Text>
                    {previa && (
                      <Text style={styles.previa}>
                        {(() => {
                          const v = valoresParaPorte(EXEMPLO_PRECO_CENTAVOS, EXEMPLO_DURACAO_MINUTOS, p, {
                            preco: { ...previa.preco, [PORTE_BASE]: 100 },
                            duracao: { ...previa.duracao, [PORTE_BASE]: 100 },
                          });
                          return `${centavosParaReais(v.precoCentavos)} · ${v.duracaoMinutos} min`;
                        })()}
                      </Text>
                    )}
                  </View>
                  <TextInput
                    value={base ? "100" : preco[p]}
                    editable={!base}
                    onChangeText={(t) => setPreco((atual) => ({ ...atual, [p]: t.replace(/\D/g, "").slice(0, 3) }))}
                    keyboardType="number-pad"
                    style={[styles.input, styles.colunaNumero, base && styles.inputBloqueado]}
                  />
                  <TextInput
                    value={base ? "100" : duracao[p]}
                    editable={!base}
                    onChangeText={(t) => setDuracao((atual) => ({ ...atual, [p]: t.replace(/\D/g, "").slice(0, 3) }))}
                    keyboardType="number-pad"
                    style={[styles.input, styles.colunaNumero, base && styles.inputBloqueado]}
                  />
                </View>
              );
            })}
            <Text style={styles.rodape}>A prévia usa um serviço de exemplo de R$ 50,00 e 60 minutos.</Text>
          </Card>

          <Button label="Salvar" onPress={salvar} loading={salvando} />
        </ScrollView>
      </KeyboardAvoid>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" },
  content: { padding: spacing.xl, gap: spacing.lg },
  explicacao: { fontSize: 13, color: colors.inkMuted, lineHeight: 19 },
  linha: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  cabecalho: { fontSize: 11, fontWeight: "700", color: colors.inkMuted, textTransform: "uppercase" },
  colunaNumero: { width: 72, textAlign: "center" },
  porte: { fontSize: 14, fontWeight: "700", color: colors.ink },
  previa: { fontSize: 11, color: colors.inkMuted, marginTop: 2 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
    color: colors.ink,
  },
  inputBloqueado: { opacity: 0.5 },
  rodape: { fontSize: 11, color: colors.inkMuted },
});
