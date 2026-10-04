import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../../api/client";
import { useAuthStore } from "../../store/authStore";
import { Button } from "../../components/Button";
import { EnderecoForm, enderecoParaApi, enderecoValido, EnderecoValores } from "../../components/EnderecoForm";
import { colors, radius, spacing } from "../../theme/tokens";

// Tela "Perfil > Editar perfil" do cliente — edita os próprios dados
// cadastrados no momento da conta (ver RegistrarClienteScreen): nome,
// e-mail e telefone. Usa o mesmo endpoint genérico PATCH /usuarios/me que
// funcionário e dono (ver UsuariosController), cada um com seus campos.
export function EditarPerfilScreen() {
  const usuario = useAuthStore((s) => s.usuario);
  const atualizarUsuario = useAuthStore((s) => s.atualizarUsuario);

  const [nome, setNome] = useState(usuario?.nome ?? "");
  const [email, setEmail] = useState(usuario?.email ?? "");
  const [telefone, setTelefone] = useState(usuario?.telefone ?? "");
  const [endereco, setEndereco] = useState<EnderecoValores>({
    cep: usuario?.cep ?? "",
    logradouro: usuario?.logradouro ?? "",
    numero: usuario?.numero ?? "",
    complemento: usuario?.complemento ?? "",
    bairro: usuario?.bairro ?? "",
    cidade: usuario?.cidade ?? "",
    uf: usuario?.uf ?? "",
  });
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setErro(null);
    setSucesso(false);
    if (!nome.trim()) return setErro("Digite seu nome.");
    if (!email.includes("@")) return setErro("Digite um e-mail válido.");
    if (telefone.replace(/\D/g, "").length < 8) return setErro("Digite um telefone válido com DDD.");
    if (!enderecoValido(endereco)) return setErro("Digite seu endereço completo (CEP, rua, número, bairro e cidade).");

    setSalvando(true);
    try {
      const { data } = await api.patch("/usuarios/meu-perfil", {
        nome: nome.trim(),
        email: email.trim().toLowerCase(),
        telefone: telefone.trim(),
        endereco: enderecoParaApi(endereco),
      });
      await atualizarUsuario(data);
      setSucesso(true);
    } catch (e: any) {
      setErro(e?.response?.data?.message ?? "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
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
          {sucesso && <Text style={styles.sucesso}>Dados atualizados com sucesso.</Text>}

          <Button label="Salvar alterações" onPress={salvar} loading={salvando} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, gap: spacing.md },
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
  sucesso: { color: colors.success, fontSize: 13 },
});
