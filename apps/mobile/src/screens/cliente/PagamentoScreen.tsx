import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { centavosParaReais, MetodoPagamento, Pagamento, StatusPagamento } from "@lavajato-app/shared";
import { api } from "../../api/client";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { WebViewCompat } from "../../components/WebViewCompat";
import { alertar } from "../../utils/alertaCompat";
import { colors, radius, spacing } from "../../theme/tokens";
import { HomeStackParamList } from "../../navigation/HomeStack";

type Props = NativeStackScreenProps<HomeStackParamList, "Pagamento">;

// Enquanto o pagamento está PENDENTE, fica perguntando pro servidor se já
// confirmou (o servidor, por sua vez, confere ao vivo com o Mercado Pago —
// ver AgendamentosService.buscarPagamento) — cobre o caso do webhook demorar
// ou falhar num primeiro deploy.
const INTERVALO_POLL_MS = 4000;

// Tela de pagamento do agendamento: Pix mostra QR + copia-e-cola; Cartão já
// chega aqui com a cobrança decidida na hora (o formulário nativo — ver
// CartaoScreen — tokenizou e cobrou o cartão sem sair do app). "Cartão +
// PENDENTE" acontece em dois casos: a operadora simplesmente demorou a
// confirmar (raro, só mostra um aviso de aguardando), ou o Mercado Pago
// exigiu autenticação 3DS do titular (ver MercadoPagoService.
// criarPagamentoCartao, histórico sobre pagamentos recusados como
// "high_risk" de cara) — nesse caso `pagamento.desafio3dsUrl` vem
// preenchida e mostra uma WebView com a página do banco pro cliente
// confirmar. Em todos os casos, fica de olho no status até aprovar (ou
// recusar) pra já devolver o cliente pra Meus agendamentos com a
// confirmação certa — o mesmo poll de baixo cobre o desafio 3DS sem
// precisar de nenhuma lógica extra (assim que o Mercado Pago decide o
// resultado, o próximo poll já traz APROVADO/RECUSADO).
export function PagamentoScreen({ route, navigation }: Props) {
  const { aviso } = route.params;
  const [pagamento, setPagamento] = useState<Pagamento>(route.params.pagamento);
  const [copiado, setCopiado] = useState(false);
  const pollAtivo = useRef(true);

  useEffect(() => {
    pollAtivo.current = true;
    return () => {
      pollAtivo.current = false;
    };
  }, []);

  const consultar = useCallback(async () => {
    try {
      const { data } = await api.get<Pagamento>(`/agendamentos/pagamentos/${pagamento.id}`);
      if (pollAtivo.current) setPagamento(data);
      return data;
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagamento.id]);

  // Poll automático enquanto pendente.
  useEffect(() => {
    if (pagamento.status !== StatusPagamento.PENDENTE) return;
    const id = setInterval(consultar, INTERVALO_POLL_MS);
    return () => clearInterval(id);
  }, [pagamento.status, consultar]);

  // Sair dessa tela (seta de voltar, botão físico do Android etc.) enquanto o
  // pagamento ainda está PENDENTE não pode simplesmente abandonar o
  // agendamento reservado — sem isso, o horário ficava "preso" (parecendo
  // agendado) até expirar sozinho (ver PENDENTE_EXPIRA_MINUTOS no backend).
  // "beforeRemove" pega qualquer forma de sair da tela, não só o botão do
  // header, e só o pagamento ainda PENDENTE precisa dessa confirmação.
  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", (e) => {
      if (pagamento.status !== StatusPagamento.PENDENTE) return;
      e.preventDefault();
      alertar(
        "Sair sem pagar?",
        "Se você sair agora, o horário reservado será liberado e o agendamento não será confirmado.",
        [
          { text: "Continuar pagando", style: "cancel" },
          {
            text: "Sair e cancelar",
            style: "destructive",
            onPress: async () => {
              try {
                await api.patch(`/agendamentos/pagamentos/${pagamento.id}/cancelar`);
              } catch {
                // Mesmo se a chamada falhar (ex: sem internet), deixa sair —
                // o PENDENTE expira sozinho depois de um tempo de qualquer forma.
              }
              navigation.dispatch(e.data.action);
            },
          },
        ],
      );
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, pagamento.status, pagamento.id]);

  async function copiarCodigoPix() {
    if (!pagamento.pixCopiaECola) return;
    await Clipboard.setStringAsync(pagamento.pixCopiaECola);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  }

  if (pagamento.status === StatusPagamento.APROVADO) {
    return (
      <SafeAreaView style={styles.center}>
        <View style={[styles.iconeCircle, { backgroundColor: colors.accentSoft }]}>
          <Text style={{ fontSize: 32 }}>✓</Text>
        </View>
        <Text style={styles.tituloSucesso}>Pagamento confirmado!</Text>
        <Text style={styles.hint}>Seu horário está garantido. Você pode acompanhar em Meus agendamentos.</Text>
        <Button label="Ver meus agendamentos" onPress={() => navigation.navigate("Home")} />
      </SafeAreaView>
    );
  }

  if (pagamento.status === StatusPagamento.RECUSADO) {
    return (
      <SafeAreaView style={styles.center}>
        <View style={[styles.iconeCircle, { backgroundColor: colors.dangerSoft }]}>
          <Text style={{ fontSize: 32 }}>✕</Text>
        </View>
        <Text style={styles.tituloSucesso}>Pagamento não aprovado</Text>
        <Text style={styles.hint}>O horário reservado foi liberado. Você pode tentar agendar novamente.</Text>
        <Button label="Voltar" onPress={() => navigation.goBack()} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={{ alignItems: "center", gap: spacing.xs }}>
          <Text style={styles.label}>Valor a pagar</Text>
          <Text style={styles.valor}>{centavosParaReais(pagamento.valorCentavos)}</Text>
        </Card>

        {pagamento.metodo === MetodoPagamento.PIX ? (
          <>
            <Text style={styles.sectionTitle}>Pague com Pix</Text>
            {pagamento.pixQrCodeBase64 && (
              <Card style={{ alignItems: "center" }}>
                <Image
                  source={{ uri: `data:image/png;base64,${pagamento.pixQrCodeBase64}` }}
                  style={styles.qrCode}
                  resizeMode="contain"
                />
              </Card>
            )}
            {pagamento.pixCopiaECola && (
              <Card style={{ gap: spacing.sm }}>
                <Text style={styles.hint}>Ou copie o código e cole no app do seu banco:</Text>
                <Text style={styles.codigoPix} numberOfLines={3}>
                  {pagamento.pixCopiaECola}
                </Text>
                <Button label={copiado ? "Código copiado!" : "Copiar código"} onPress={copiarCodigoPix} variant="secondary" />
              </Card>
            )}
            <View style={styles.aguardando}>
              <ActivityIndicator color={colors.accent} />
              <Text style={styles.hint}>Aguardando confirmação do pagamento…</Text>
            </View>
          </>
        ) : pagamento.desafio3dsUrl ? (
          <>
            <Text style={styles.sectionTitle}>Confirme com seu banco</Text>
            <Text style={styles.hint}>
              Por segurança, o Mercado Pago pediu uma confirmação extra. Complete abaixo com seu banco (senha, app ou biometria) pra
              concluir o pagamento:
            </Text>
            <Card style={styles.webviewCard}>
              <WebViewCompat source={{ uri: pagamento.desafio3dsUrl }} style={styles.webview} startInLoadingState />
            </Card>
            <View style={styles.aguardando}>
              <ActivityIndicator color={colors.accent} size="small" />
              <Text style={styles.hint}>Aguardando você concluir a confirmação…</Text>
            </View>
          </>
        ) : (
          <>
            <Text style={styles.sectionTitle}>Pagamento com cartão</Text>
            <Text style={styles.hint}>Seu cartão já foi enviado para a operadora. Só um instante…</Text>
            <View style={styles.aguardando}>
              <ActivityIndicator color={colors.accent} />
              <Text style={styles.hint}>Confirmando com a operadora do cartão…</Text>
            </View>
          </>
        )}

        <Card style={styles.avisoCard}>
          <Text style={styles.avisoTexto}>{aviso}</Text>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.md },
  content: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxl },
  sectionTitle: { fontSize: 13, fontWeight: "700", color: colors.inkMuted, textTransform: "uppercase", marginTop: spacing.md },
  label: { fontSize: 12, color: colors.inkMuted },
  valor: { fontSize: 28, fontWeight: "800", color: colors.ink },
  hint: { fontSize: 13, color: colors.inkMuted, textAlign: "center" },
  qrCode: { width: 220, height: 220 },
  webviewCard: { padding: 0, overflow: "hidden", height: 480 },
  webview: { flex: 1 },
  codigoPix: { fontSize: 11, color: colors.ink, fontFamily: "monospace" },
  aguardando: { flexDirection: "row", alignItems: "center", gap: spacing.sm, justifyContent: "center", marginTop: spacing.md },
  avisoCard: { backgroundColor: colors.dangerSoft, marginTop: spacing.md },
  avisoTexto: { fontSize: 12, color: colors.danger, lineHeight: 18 },
  iconeCircle: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
  tituloSucesso: { fontSize: 18, fontWeight: "800", color: colors.ink, textAlign: "center" },
});
