import React, { useCallback, useEffect, useState } from "react";
import { AppState, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { alertar } from "../../utils/alertaCompat";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import {
  MetodoPagamento,
  PagamentoAssinatura,
  PeriodicidadeAssinatura,
  Plano,
  StatusAssinatura,
  calcularPrecoAnualCentavos,
  centavosParaReais,
} from "@lavajato-app/shared";
import { api, mensagemErroApi } from "../../api/client";
import { useAuthStore } from "../../store/authStore";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { colors, radius, spacing } from "../../theme/tokens";
import { MaisStackParamList } from "../../navigation/MaisStack";

type Props = NativeStackScreenProps<MaisStackParamList, "Assinatura">;

interface AssinaturaDetalhada {
  status: StatusAssinatura;
  proximaCobrancaEm: string | null;
  trialTerminaEm: string | null;
  plano: Plano;
}

const STATUS_LABEL: Record<StatusAssinatura, string> = {
  [StatusAssinatura.TRIAL]: "Período de teste",
  [StatusAssinatura.ATIVA]: "Ativa",
  [StatusAssinatura.INADIMPLENTE]: "Pagamento pendente",
  [StatusAssinatura.CANCELADA]: "Cancelada",
};

function diasRestantes(dataIso: string): number {
  const diffMs = new Date(dataIso).getTime() - Date.now();
  return Math.max(0, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
}

// O lava jato gerencia a própria mensalidade do SaaS aqui: plano atual,
// próxima cobrança e pagamento. Pagar (ou trocar de plano) é feito com o
// mesmo mecanismo nativo que o cliente final usa pra pagar um agendamento —
// Pix ou cartão tokenizado direto no app (ver abrirPagamento/pagar acima) —
// sem sair pro checkout externo do Mercado Pago; a assinatura só volta a
// ficar em dia quando o pagamento é de fato confirmado (Pix cai na tela de
// pendente com polling, cartão tokeniza e cobra na hora). Essa também é a
// tela pra onde o RootNavigator manda o dono na marra quando a assinatura
// não está em dia (trial vencido ou mensalidade pendente) — ver
// authStore.assinaturaBloqueada — então ela também cumpre o papel de
// "resolver o bloqueio".
export function AssinaturaScreen({ navigation }: Props) {
  const setAssinaturaBloqueada = useAuthStore((s) => s.setAssinaturaBloqueada);
  const logout = useAuthStore((s) => s.logout);
  const [assinatura, setAssinatura] = useState<AssinaturaDetalhada | null>(null);
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [mostrarPlanos, setMostrarPlanos] = useState(false);
  const [atualizando, setAtualizando] = useState(false);

  // Plano cujo painel de pagamento (periodicidade + Pix/cartão) está aberto —
  // ver Button "Selecionar plano" dentro do map abaixo. Pagamento nativo
  // (cartão tokenizado no app, ou Pix, mesmo mecanismo que o cliente final
  // usa pra pagar um agendamento) substitui o checkout externo do Mercado
  // Pago que existia aqui antes.
  const [planoEmPagamentoId, setPlanoEmPagamentoId] = useState<string | null>(null);
  const [periodicidadeEscolhida, setPeriodicidadeEscolhida] = useState<PeriodicidadeAssinatura>(PeriodicidadeAssinatura.MENSAL);
  const [metodoEscolhido, setMetodoEscolhido] = useState<MetodoPagamento>(MetodoPagamento.PIX);
  const [pagando, setPagando] = useState(false);

  const carregar = useCallback(async () => {
    const [assinaturaRes, planosRes] = await Promise.all([
      api.get<AssinaturaDetalhada>("/assinaturas/minha"),
      api.get<Plano[]>("/planos"),
    ]);
    setAssinatura(assinaturaRes.data);
    setPlanos(planosRes.data);
    // Fecha o loop do bloqueio: assim que essa tela confirma que o status
    // voltou a ser TRIAL/ATIVA (ex: pagamento acabou de ser aprovado), o
    // RootNavigator libera as abas normais de novo.
    const emDia = assinaturaRes.data.status === StatusAssinatura.TRIAL || assinaturaRes.data.status === StatusAssinatura.ATIVA;
    setAssinaturaBloqueada(!emDia);
  }, [setAssinaturaBloqueada]);

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  // Quando bloqueada, essa tela costuma ficar parada sozinha (sem abas pra
  // navegar e voltar, o que dispararia useFocusEffect de novo) — o dono some
  // pro checkout externo do Mercado Pago e volta pro app, o que só troca o
  // estado do app (background -> active), não a navegação. Sem isso, ele
  // ficaria vendo "pagamento pendente" mesmo depois de já ter pago, até
  // fechar e abrir o app de novo.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (estado) => {
      if (estado === "active") carregar();
    });
    return () => subscription.remove();
  }, [carregar]);

  async function atualizarStatus() {
    setAtualizando(true);
    try {
      await carregar();
    } finally {
      setAtualizando(false);
    }
  }

  function abrirPagamento(planoId: string) {
    setPlanoEmPagamentoId((atual) => (atual === planoId ? null : planoId));
    setPeriodicidadeEscolhida(PeriodicidadeAssinatura.MENSAL);
    setMetodoEscolhido(MetodoPagamento.PIX);
  }

  async function pagar(plano: Plano) {
    const valorCentavos =
      periodicidadeEscolhida === PeriodicidadeAssinatura.ANUAL
        ? calcularPrecoAnualCentavos(plano.precoCentavos, plano.descontoAnualTipo, plano.descontoAnualValor)
        : plano.precoCentavos;

    // Cartão nunca cobra direto por aqui — precisa do formulário nativo
    // (tokeniza e cobra na hora, sem sair do app), igual ao cliente final
    // pagando um agendamento (ver AssinaturaPagamentoScreen/CartaoScreen).
    if (metodoEscolhido === MetodoPagamento.CARTAO) {
      navigation.navigate("AssinaturaPagamento", {
        planoId: plano.id,
        nomePlano: plano.nome,
        periodicidade: periodicidadeEscolhida,
        valorCentavos,
      });
      return;
    }

    setPagando(true);
    try {
      const { data } = await api.post<PagamentoAssinatura>("/assinaturas/minha/pagar", {
        planoId: plano.id,
        periodicidade: periodicidadeEscolhida,
        metodoPagamento: MetodoPagamento.PIX,
      });
      navigation.navigate("AssinaturaPagamentoPendente", { pagamento: data });
    } catch (e: any) {
      alertar("Não foi possível iniciar o pagamento", mensagemErroApi(e));
    } finally {
      setPagando(false);
    }
  }

  async function cancelarAssinatura() {
    alertar("Cancelar assinatura?", "Seu lava jato perde acesso ao sistema no fim do período já pago.", [
      { text: "Voltar", style: "cancel" },
      {
        text: "Cancelar assinatura",
        style: "destructive",
        onPress: async () => {
          await api.patch("/assinaturas/minha/cancelar");
          carregar();
        },
      },
    ]);
  }

  if (!assinatura) return null;

  const bloqueada = assinatura.status === StatusAssinatura.INADIMPLENTE || assinatura.status === StatusAssinatura.CANCELADA;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Assinatura</Text>

        {bloqueada && (
          <Card style={{ backgroundColor: "#F7E9E6", borderColor: colors.danger, gap: spacing.xs }}>
            <Text style={styles.bloqueadaTitulo}>Acesso da equipe bloqueado</Text>
            <Text style={styles.bloqueadaTexto}>
              {assinatura.status === StatusAssinatura.CANCELADA
                ? "Sua assinatura está cancelada. Escolha um plano abaixo para reativar o acesso de todos os funcionários."
                : "O pagamento da sua assinatura não foi confirmado. Escolha um plano abaixo para regularizar e liberar o acesso de todos os funcionários novamente."}
            </Text>
          </Card>
        )}

        {assinatura.status === StatusAssinatura.TRIAL && assinatura.trialTerminaEm && (
          <Card style={{ backgroundColor: colors.accentSoft, borderColor: colors.accent, gap: spacing.xs }}>
            <Text style={styles.bloqueadaTitulo}>Período de teste</Text>
            <Text style={styles.bloqueadaTexto}>
              {diasRestantes(assinatura.trialTerminaEm) === 0
                ? "Seu teste grátis termina hoje."
                : `Seu teste grátis termina em ${diasRestantes(assinatura.trialTerminaEm)} dia(s).`}{" "}
              Escolha um plano abaixo para continuar usando sem interrupção quando o teste acabar.
            </Text>
          </Card>
        )}

        <Card style={{ backgroundColor: colors.accentSoft, borderColor: colors.accent, gap: spacing.sm }}>
          <Text style={styles.planLabel}>PLANO ATUAL</Text>
          <Text style={styles.planName}>{assinatura.plano.nome}</Text>
          <Text style={styles.planPrice}>{(assinatura.plano.precoCentavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}/mês</Text>
          <Text style={styles.status}>Status: {STATUS_LABEL[assinatura.status] ?? assinatura.status}</Text>
          {assinatura.proximaCobrancaEm && (
            <Text style={styles.meta}>Próxima cobrança: {new Date(assinatura.proximaCobrancaEm).toLocaleDateString("pt-BR")}</Text>
          )}
        </Card>

        <Button label={mostrarPlanos ? "Ocultar planos" : bloqueada ? "Escolher plano" : "Trocar de plano"} onPress={() => setMostrarPlanos((v) => !v)} />

        {mostrarPlanos && (
          <View style={{ gap: spacing.sm }}>
            <Text style={styles.hint}>
              Escolha um plano, a periodicidade e a forma de pagamento — é o mesmo jeito que o cliente usa pra pagar um
              agendamento, direto no app, sem sair pra lugar nenhum.
            </Text>
            {planos.map((p) => {
              const painelAberto = planoEmPagamentoId === p.id;
              const precoAnualCentavos = calcularPrecoAnualCentavos(p.precoCentavos, p.descontoAnualTipo, p.descontoAnualValor);
              const valorEscolhido = periodicidadeEscolhida === PeriodicidadeAssinatura.ANUAL ? precoAnualCentavos : p.precoCentavos;
              return (
                <Card key={p.id} style={{ gap: spacing.xs }}>
                  <Text style={styles.planName}>{p.nome} — {(p.precoCentavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}/mês</Text>
                  <Text style={styles.meta}>{p.recursos.join(" · ")}</Text>
                  {p.descontoAnualValor > 0 && (
                    <Text style={styles.descontoAnual}>No plano anual: {centavosParaReais(precoAnualCentavos)}/ano</Text>
                  )}
                  <Button label={painelAberto ? "Fechar" : "Selecionar plano"} onPress={() => abrirPagamento(p.id)} variant={painelAberto ? "secondary" : "primary"} />

                  {painelAberto && (
                    <View style={{ gap: spacing.sm, marginTop: spacing.xs }}>
                      <Text style={styles.subLabel}>PERIODICIDADE</Text>
                      <View style={{ flexDirection: "row", gap: spacing.sm }}>
                        <Pressable onPress={() => setPeriodicidadeEscolhida(PeriodicidadeAssinatura.MENSAL)} style={{ flex: 1 }}>
                          <View style={[styles.chip, periodicidadeEscolhida === PeriodicidadeAssinatura.MENSAL && styles.chipSelecionado]}>
                            <Text style={[styles.chipTexto, periodicidadeEscolhida === PeriodicidadeAssinatura.MENSAL && styles.chipTextoSelecionado]}>
                              Mensal · {centavosParaReais(p.precoCentavos)}
                            </Text>
                          </View>
                        </Pressable>
                        <Pressable onPress={() => setPeriodicidadeEscolhida(PeriodicidadeAssinatura.ANUAL)} style={{ flex: 1 }}>
                          <View style={[styles.chip, periodicidadeEscolhida === PeriodicidadeAssinatura.ANUAL && styles.chipSelecionado]}>
                            <Text style={[styles.chipTexto, periodicidadeEscolhida === PeriodicidadeAssinatura.ANUAL && styles.chipTextoSelecionado]}>
                              Anual · {centavosParaReais(precoAnualCentavos)}
                            </Text>
                          </View>
                        </Pressable>
                      </View>

                      <Text style={styles.subLabel}>FORMA DE PAGAMENTO</Text>
                      <View style={{ flexDirection: "row", gap: spacing.sm }}>
                        <Pressable onPress={() => setMetodoEscolhido(MetodoPagamento.PIX)} style={{ flex: 1 }}>
                          <View style={[styles.chip, metodoEscolhido === MetodoPagamento.PIX && styles.chipSelecionado]}>
                            <Text style={[styles.chipTexto, metodoEscolhido === MetodoPagamento.PIX && styles.chipTextoSelecionado]}>Pix</Text>
                          </View>
                        </Pressable>
                        <Pressable onPress={() => setMetodoEscolhido(MetodoPagamento.CARTAO)} style={{ flex: 1 }}>
                          <View style={[styles.chip, metodoEscolhido === MetodoPagamento.CARTAO && styles.chipSelecionado]}>
                            <Text style={[styles.chipTexto, metodoEscolhido === MetodoPagamento.CARTAO && styles.chipTextoSelecionado]}>Cartão</Text>
                          </View>
                        </Pressable>
                      </View>

                      <Button
                        label={`Pagar ${centavosParaReais(valorEscolhido)}`}
                        onPress={() => pagar(p)}
                        loading={pagando}
                        disabled={pagando}
                      />
                    </View>
                  )}
                </Card>
              );
            })}
          </View>
        )}

        <Text style={styles.atualizarLink} onPress={atualizando ? undefined : atualizarStatus}>
          {atualizando ? "Atualizando…" : "Já paguei — atualizar status"}
        </Text>

        {assinatura.status !== StatusAssinatura.CANCELADA && (
          <Text style={styles.cancelarLink} onPress={cancelarAssinatura}>
            Cancelar assinatura
          </Text>
        )}

        {bloqueada && (
          <Text style={styles.cancelarLink} onPress={logout}>
            Sair
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, gap: spacing.lg },
  title: { fontSize: 20, fontWeight: "800", color: colors.ink },
  planLabel: { fontSize: 11, fontWeight: "700", color: colors.accent },
  planName: { fontSize: 16, fontWeight: "800", color: colors.ink },
  planPrice: { fontSize: 22, fontWeight: "800", color: colors.ink },
  status: { fontSize: 12, color: colors.inkMuted },
  meta: { fontSize: 12, color: colors.inkMuted },
  hint: { fontSize: 12, color: colors.inkMuted },
  bloqueadaTitulo: { fontSize: 14, fontWeight: "800", color: colors.ink },
  bloqueadaTexto: { fontSize: 12.5, color: colors.inkMuted, lineHeight: 18 },
  atualizarLink: { color: colors.accent, fontWeight: "700", fontSize: 13, textAlign: "center", marginTop: spacing.xs },
  cancelarLink: { color: colors.danger, fontWeight: "700", fontSize: 13, textAlign: "center", marginTop: spacing.sm },
  descontoAnual: { fontSize: 12, fontWeight: "700", color: colors.accent },
  subLabel: { fontSize: 11, fontWeight: "700", color: colors.inkMuted },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: "center",
  },
  chipSelecionado: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipTexto: { fontSize: 12.5, fontWeight: "700", color: colors.ink },
  chipTextoSelecionado: { color: colors.accentInk },
});
