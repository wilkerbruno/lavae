import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { centavosParaReais, MetodoPagamento, PagamentoAssinatura, StatusPagamento } from "@lavajato-app/shared";
import { api } from "../../api/client";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { WebViewCompat } from "../../components/WebViewCompat";
import { colors, radius, spacing } from "../../theme/tokens";
import { MaisStackParamList } from "../../navigation/MaisStack";

type Props = NativeStackScreenProps<MaisStackParamList, "AssinaturaPagamentoPendente">;

// Mesmo intervalo de PagamentoScreen (pagamento do cliente final) — ver
// comentário lá.
const INTERVALO_POLL_MS = 4000;

// Espelha PagamentoScreen (cliente final pagando um agendamento): Pix mostra
// QR + copia-e-cola, cartão com desafio 3DS mostra a WebView do banco, e
// enquanto isso um poll fica de olho no status (GET /assinaturas/minha/
// pagamentos/:id) até aprovar/recusar. Diferente daquela tela, sair antes de
// concluir não "perde" nada (não existe horário reservado por trás) — só
// cancela a tentativa, sem confirmação nenhuma.
export function AssinaturaPagamentoPendenteScreen({ route, navigation }: Props) {
  const [pagamento, setPagamento] = useState<PagamentoAssinatura>(route.params.pagamento);
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
      const { data } = await api.get<PagamentoAssinatura>(`/assinaturas/minha/pagamentos/${pagamento.id}`);
      if (pollAtivo.current) setPagamento(data);
      return data;
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagamento.id]);

  useEffect(() => {
    if (pagamento.status !== StatusPagamento.PENDENTE) return;
    const id = setInterval(consultar, INTERVALO_POLL_MS);
    return () => clearInterval(id);
  }, [pagamento.status, consultar]);

  // Ao contrário de PagamentoScreen, não bloqueia a saída (nada fica "preso"
  // aqui) — só avisa o servidor pra não continuar tentando confirmar essa
  // tentativa específica, em segundo plano.
  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", () => {
      if (pagamento.status !== StatusPagamento.PENDENTE) return;
      api.patch(`/assinaturas/minha/pagamentos/${pagamento.id}/cancelar`).catch(() => {});
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
        <Text style={styles.hint}>Sua assinatura está em dia.</Text>
        <Button label="Voltar para Assinatura" onPress={() => navigation.navigate("Assinatura")} />
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
        <Text style={styles.hint}>Você pode tentar de novo com outro cartão ou Pix.</Text>
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
                <Image source={{ uri: `data:image/png;base64,${pagamento.pixQrCodeBase64}` }} style={styles.qrCode} resizeMode="contain" />
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
  iconeCircle: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
  tituloSucesso: { fontSize: 18, fontWeight: "800", color: colors.ink, textAlign: "center" },
});
