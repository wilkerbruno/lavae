import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../../api/client";
import { useAuthStore } from "../../store/authStore";
import { Button } from "../../components/Button";
import { PasswordInput } from "../../components/PasswordInput";
import { ENDERECO_VAZIO, EnderecoForm, enderecoParaApi, enderecoValido } from "../../components/EnderecoForm";
import { colors, radius, spacing } from "../../theme/tokens";

export function RegistrarClienteScreen() {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [telefone, setTelefone] = useState("");
  const [endereco, setEndereco] = useState(ENDERECO_VAZIO);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const entrar = useAuthStore((s) => s.entrar);

  async function handleRegistrar() {
    setErro(null);
    if (telefone.replace(/\D/g, "").length < 8) {
      setErro("Informe um telefone válido com DDD.");
      return;
    }
    if (!enderecoValido(endereco)) {
      setErro("Informe seu endereço completo (CEP, rua, número, bairro e cidade).");
      return;
    }
    setCarregando(true);
    try {
      const { data } = await api.post("/auth/registrar-cliente", {
        nome,
        email,
        senha,
        telefone,
        endereco: enderecoParaApi(endereco),
      });
      await entrar(data.accessToken, data.usuario);
    } catch (e: any) {
      setErro(e?.response?.data?.message ?? "Não foi possível criar a conta.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 24}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>Criar conta</Text>
          <Text style={styles.subtitle}>Para agendar horários nos lava jatos parceiras</Text>

          <View style={styles.field}>
            <Text style={styles.label}>Nome</Text>
            <TextInput value={nome} onChangeText={setNome} style={styles.input} placeholder="Seu nome" />
          </View>
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
            <PasswordInput value={senha} onChangeText={setSenha} style={styles.input} placeholder="Mínimo 6 caracteres" />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Telefone</Text>
            <TextInput
              value={telefone}
              onChangeText={setTelefone}
              keyboardType="phone-pad"
              style={styles.input}
              placeholder="(11) 91234-5678"
            />
          </View>
          <EnderecoForm valores={endereco} onChange={setEndereco} />

          {erro && <Text style={styles.erro}>{erro}</Text>}

          <Button label="Criar conta" onPress={handleRegistrar} loading={carregando} />
        </ScrollView>
      </KeyboardAvoidingView>
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
  erro: { color: colors.danger, fontSize: 13 },
});
