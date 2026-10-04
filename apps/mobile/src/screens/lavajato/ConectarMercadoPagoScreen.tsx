import React, { useCallback, useState } from "react";
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import * as WebBrowser from "expo-web-browser";
import { StatusConexaoMercadoPago } from "@lavajato-app/shared";
import { api } from "../../api/client";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { alertar } from "../../utils/alertaCompat";
import { colors, spacing } from "../../theme/tokens";

// Deep link de volta pro app (ver apps/mobile/app.json "scheme") — o mesmo
// que a API usa no redirect final do callback (ver
// LavaJatosMercadoPagoController). openAuthSessionAsync fecha o navegador
// sozinho assim que detecta uma navegação pra essa URL.
const REDIRECT_DE_VOLTA = "lavajatoapp://mercadopago-conectado";

// Na versão web esse fluxo não dá pra completar do jeito que está: o
// WebBrowser.openAuthSessionAsync tem uma implementação real pra web (usa
// window.open + localStorage), mas ela só fecha sozinha quando o navegador é
// redirecionado de volta pra uma URL do MESMO domínio da versão web (onde
// rodaria WebBrowser.maybeCompleteAuthSession()) — nunca pra um esquema tipo
// "lavajatoapp://", que só existe dentro do app instalado. Sem isso, o
// popup do Mercado Pago fica aberto pra sempre depois de autorizar (o
// navegador não sabe pra onde ir). Fazer isso funcionar direito na web exige
// a API aceitar um redirect_uri alternativo (uma página https do próprio
// domínio, ex.: app.seudominio.com.br/mercadopago-conectado) E cadastrar essa
// mesma URL como redirect autorizado no aplicativo Mercado Pago Developers —
// os dois lados fora do alcance só do código do app. Até isso existir, essa
// ação específica (conectar/trocar a conta Mercado Pago do lava jato) fica só
// no Android; o resto da tela (ver status conectado, desconectar) funciona
// normalmente na web.
const CONECTAR_DISPONIVEL_NA_WEB = Platform.OS !== "web";

// É aqui que o dono do lava jato conecta a PRÓPRIA conta Mercado Pago
// (modelo marketplace) — sem isso, os clientes não conseguem pagar pelo app
// (nem agendamento avulso, nem pacote mensal): o dinheiro precisa de uma
// conta pra cair.
export function ConectarMercadoPagoScreen() {
  const [status, setStatus] = useState<StatusConexaoMercadoPago | null>(null);
  const [conectando, setConectando] = useState(false);

  const carregar = useCallback(async () => {
    const { data } = await api.get<StatusConexaoMercadoPago>("/lavajatos/mercadopago/status");
    setStatus(data);
  }, []);

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  async function conectar() {
    setConectando(true);
    try {
      const { data } = await api.get<{ url: string }>("/lavajatos/mercadopago/conectar");
      const resultado = await WebBrowser.openAuthSessionAsync(data.url, REDIRECT_DE_VOLTA);
      // "success" = voltou pelo deep link (ver LavaJatosMercadoPagoController.callback).
      // Recarregamos o status de qualquer forma — é a fonte da verdade real.
      await carregar();
      if (resultado.type === "success" && resultado.url.includes("sucesso=0")) {
        alertar("Não foi possível conectar", "Tente novamente em alguns instantes.");
      }
    } catch (e: any) {
      alertar("Não foi possível iniciar a conexão", e?.response?.data?.message ?? "Tente de novo.");
    } finally {
      setConectando(false);
    }
  }

  function desconectar() {
    alertar(
      "Desconectar Mercado Pago?",
      "Clientes não vão conseguir pagar agendamentos nem pacotes mensais pelo app até você reconectar.",
      [
        { text: "Voltar", style: "cancel" },
        {
          text: "Desconectar",
          style: "destructive",
          onPress: async () => {
            await api.patch("/lavajatos/mercadopago/desconectar");
            carregar();
          },
        },
      ],
    );
  }

  if (!status) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Mercado Pago</Text>
        <Text style={styles.hint}>
          Conecte a conta Mercado Pago do seu lava jato pra receber os pagamentos dos clientes direto na sua conta —
          agendamentos avulsos (Pix/cartão) e pacotes mensais.
        </Text>

        {status.conectado ? (
          <Card style={{ backgroundColor: colors.accentSoft, borderColor: colors.accent, gap: spacing.sm }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
              <View style={styles.pontoConectado} />
              <Text style={styles.statusConectado}>Conta conectada</Text>
            </View>
            {status.conectadoEm && (
              <Text style={styles.meta}>Desde {new Date(status.conectadoEm).toLocaleDateString("pt-BR")}</Text>
            )}
          </Card>
        ) : (
          <Card style={{ gap: spacing.sm }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
              <View style={styles.pontoDesconectado} />
              <Text style={styles.statusDesconectado}>Nenhuma conta conectada</Text>
            </View>
          </Card>
        )}

        {CONECTAR_DISPONIVEL_NA_WEB ? (
          <Button
            label={status.conectado ? "Reconectar / trocar de conta" : "Conectar com Mercado Pago"}
            onPress={conectar}
            loading={conectando}
          />
        ) : (
          <Card style={{ borderColor: colors.accent, gap: spacing.xs }}>
            <Text style={styles.hint}>
              {status.conectado ? "Reconectar ou trocar de conta" : "Conectar a conta"} Mercado Pago ainda precisa ser
              feito pelo aplicativo Android — abra o app no celular e acesse Mais → Mercado Pago.
            </Text>
          </Card>
        )}

        {status.conectado && (
          <Text style={styles.desconectarLink} onPress={desconectar}>
            Desconectar
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" },
  content: { padding: spacing.xl, gap: spacing.lg },
  title: { fontSize: 20, fontWeight: "800", color: colors.ink },
  hint: { fontSize: 13, color: colors.inkMuted },
  pontoConectado: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#4ade80" },
  pontoDesconectado: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.inkMuted },
  statusConectado: { fontWeight: "800", color: colors.ink },
  statusDesconectado: { fontWeight: "700", color: colors.inkMuted },
  meta: { fontSize: 12, color: colors.inkMuted },
  desconectarLink: { color: colors.danger, fontWeight: "700", fontSize: 13, textAlign: "center", marginTop: spacing.sm },
});
