import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Button } from "../../components/Button";
import { colors, spacing } from "../../theme/tokens";

// Tela de guarda: aparece quando a conta logada tem um papel sem suporte no
// lugar em que o app está rodando. Dois casos usam isso hoje:
// 1) SAAS_ADMIN no app mobile (nativo OU web) — essa conta só funciona no
//    painel administrativo (apps/admin-web), nunca aqui.
// 2) Dono/funcionário abrindo a versão WEB (ver RootNavigator) — a versão
//    web só foi adaptada pro fluxo do CLIENTE (agendar/pagar); equipe/dono
//    continuam usando o app Android normalmente, então aqui só evita mostrar
//    telas do painel do lava jato sem terem sido testadas/ajustadas pro
//    navegador (WebView de assinatura, seletor de foto do logo etc).
// Sem essa tela de guarda, o RootNavigator não bateria em nenhum caso pro
// papel e a tela ficaria em branco/travada, sem nenhum jeito de sair a não
// ser reinstalando o app (o token continuava salvo no dispositivo).
export function AcessoNaoSuportadoScreen({
  onSair,
  titulo = "Esta conta não pode ser acessada por aqui",
  mensagem = "Esta é uma conta de administrador da plataforma. Ela só funciona no painel administrativo (web) — não no aplicativo do celular. Saia e entre com uma conta de cliente, funcionário ou dono de lava jato.",
}: {
  onSair: () => void;
  titulo?: string;
  mensagem?: string;
}) {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Ionicons name="lock-closed-outline" size={48} color={colors.accent} />
        <Text style={styles.title}>{titulo}</Text>
        <Text style={styles.subtitle}>{mensagem}</Text>
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
