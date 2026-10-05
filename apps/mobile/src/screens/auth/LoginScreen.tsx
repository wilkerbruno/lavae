import React, { useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { api } from "../../api/client";
import { useAuthStore } from "../../store/authStore";
import { Button } from "../../components/Button";
import { PasswordInput } from "../../components/PasswordInput";
import { colors, radius, spacing } from "../../theme/tokens";
import { AuthStackParamList } from "../../navigation/AuthNavigator";
import { KeyboardAvoid } from "../../components/KeyboardAvoid";

type Props = NativeStackScreenProps<AuthStackParamList, "Login">;

export function LoginScreen({ navigation, route }: Props) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const entrar = useAuthStore((s) => s.entrar);

  async function handleLogin() {
    setErro(null);
    setCarregando(true);
    try {
      const { data } = await api.post("/auth/login", { email, senha });
      await entrar(data.accessToken, data.usuario);
      // Não precisa navegar manualmente: o RootNavigator troca de stack
      // sozinho assim que `usuario` muda no authStore.
    } catch (e: any) {
      setErro(e?.response?.data?.message ?? "Não foi possível entrar. Confira seus dados.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoid
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 24}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>Entrar</Text>
          <Text style={styles.subtitle}>Acesse sua conta de cliente, funcionário ou lava jato</Text>

          <View style={styles.field}>
            <Text style={styles.label}>E-mail</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              style={styles.input}
              placeholder="voce@email.com"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Senha</Text>
            <PasswordInput
              value={senha}
              onChangeText={setSenha}
              style={styles.input}
              placeholder="••••••••"
            />
          </View>

          <Text style={styles.esqueci} onPress={() => navigation.navigate("EsqueciSenha")}>
            Esqueci minha senha
          </Text>

          {route.params?.senhaRedefinida && <Text style={styles.sucesso}>Senha alterada! Entre com a nova senha.</Text>}
          {erro && <Text style={styles.erro}>{erro}</Text>}

          <Button label="Entrar" onPress={handleLogin} loading={carregando} />

          <Button
            label="Criar conta de cliente"
            variant="secondary"
            onPress={() => navigation.navigate("RegistrarCliente")}
          />
          <Text style={styles.linkLavaJato} onPress={() => navigation.navigate("RegistrarLavaJato")}>
            É dono de lava jato? Cadastre seu lava jato
          </Text>
        </ScrollView>
      </KeyboardAvoid>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, padding: spacing.xl, justifyContent: "center", gap: spacing.md },
  title: { fontSize: 26, fontWeight: "800", color: colors.ink },
  subtitle: { fontSize: 13, color: colors.inkMuted, marginBottom: spacing.lg },
  field: { gap: spacing.xs },
  label: { fontSize: 12, fontWeight: "600", color: colors.inkMuted },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 14,
    color: colors.ink,
  },
  esqueci: { alignSelf: "flex-end", fontSize: 13, color: colors.accent, fontWeight: "600" },
  sucesso: { color: colors.accent, fontSize: 13, fontWeight: "600" },
  erro: { color: colors.danger, fontSize: 13 },
  linkLavaJato: { textAlign: "center", fontSize: 13, color: colors.accent, fontWeight: "600", marginTop: spacing.sm },
});
