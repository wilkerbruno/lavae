import React, { useCallback, useState } from "react";
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { LavaJato } from "@lavajato-app/shared";
import { api } from "../../api/client";
import { useAuthStore } from "../../store/authStore";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { ENDERECO_VAZIO, EnderecoForm, enderecoParaApi, enderecoValido } from "../../components/EnderecoForm";
import { colors, radius, spacing } from "../../theme/tokens";
import { KeyboardAvoid } from "../../components/KeyboardAvoid";

// Tela "Mais > Editar perfil" do dono — edita tanto os próprios dados
// pessoais (nome, e-mail, telefone — PATCH /usuarios/me) quanto os dados da
// lava jato exibidos pro cliente (nome, endereço, telefone de contato —
// PATCH /lavajatos/:id, mesmo endpoint que "Mais > Logo"/"Localização" já
// usam). Endereço aqui é só o texto mostrado no app do cliente — a
// localização por GPS usada na busca "Perto de você" continua em
// "Mais > Localização" (LocalizacaoScreen), são coisas diferentes.
export function EditarPerfilScreen() {
  const usuario = useAuthStore((s) => s.usuario);
  const atualizarUsuario = useAuthStore((s) => s.atualizarUsuario);
  const lavaJatoId = usuario?.lavaJatoId;

  const [carregando, setCarregando] = useState(true);
  const [nome, setNome] = useState(usuario?.nome ?? "");
  const [email, setEmail] = useState(usuario?.email ?? "");
  const [telefone, setTelefone] = useState(usuario?.telefone ?? "");
  const [nomeLavaJato, setNomeLavaJato] = useState("");
  const [enderecoLavaJato, setEnderecoLavaJato] = useState(ENDERECO_VAZIO);
  const [telefoneLavaJato, setTelefoneLavaJato] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    if (!lavaJatoId) return;
    setCarregando(true);
    try {
      const { data } = await api.get<LavaJato>(`/lavajatos/${lavaJatoId}`);
      setNomeLavaJato(data.nome ?? "");
      setEnderecoLavaJato({
        cep: data.cep ?? "",
        logradouro: data.logradouro ?? "",
        numero: data.numero ?? "",
        complemento: data.complemento ?? "",
        bairro: data.bairro ?? "",
        cidade: data.cidade ?? "",
        uf: data.uf ?? "",
      });
      setTelefoneLavaJato(data.telefone ?? "");
    } finally {
      setCarregando(false);
    }
  }, [lavaJatoId]);

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  async function salvar() {
    setErro(null);
    setSucesso(false);
    if (!nome.trim()) return setErro("Digite seu nome.");
    if (!email.includes("@")) return setErro("Digite um e-mail válido.");
    if (telefone.replace(/\D/g, "").length < 8) return setErro("Digite um telefone pessoal válido com DDD.");
    if (!nomeLavaJato.trim()) return setErro("Digite o nome do lava jato.");
    if (!enderecoValido(enderecoLavaJato)) return setErro("Digite o endereço completo do lava jato (CEP, rua, número, bairro e cidade).");
    if (telefoneLavaJato.replace(/\D/g, "").length < 8) return setErro("Digite um telefone do lava jato válido com DDD.");

    setSalvando(true);
    try {
      const [{ data: usuarioAtualizado }] = await Promise.all([
        api.patch("/usuarios/meu-perfil", {
          nome: nome.trim(),
          email: email.trim().toLowerCase(),
          telefone: telefone.trim(),
        }),
        api.patch(`/lavajatos/${lavaJatoId}`, {
          nome: nomeLavaJato.trim(),
          endereco: enderecoParaApi(enderecoLavaJato),
          telefone: telefoneLavaJato.trim(),
        }),
      ]);
      await atualizarUsuario(usuarioAtualizado);
      setSucesso(true);
    } catch (e: any) {
      setErro(e?.response?.data?.message ?? "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.accent} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <KeyboardAvoid style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.secaoTitulo}>Seus dados</Text>
          <Card style={{ gap: spacing.md }}>
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
              <Text style={styles.label}>Telefone pessoal</Text>
              <TextInput
                value={telefone}
                onChangeText={setTelefone}
                keyboardType="phone-pad"
                style={styles.input}
                placeholder="(11) 91234-5678"
              />
            </View>
          </Card>

          <Text style={styles.secaoTitulo}>Dados do lava jato</Text>
          <Card style={{ gap: spacing.md }}>
            <View style={styles.field}>
              <Text style={styles.label}>Nome do lava jato</Text>
              <TextInput value={nomeLavaJato} onChangeText={setNomeLavaJato} style={styles.input} placeholder="Nome do lava jato" />
            </View>
            <EnderecoForm valores={enderecoLavaJato} onChange={setEnderecoLavaJato} />
            <View style={styles.field}>
              <Text style={styles.label}>Telefone do lava jato</Text>
              <TextInput
                value={telefoneLavaJato}
                onChangeText={setTelefoneLavaJato}
                keyboardType="phone-pad"
                style={styles.input}
                placeholder="(11) 91234-5678"
              />
            </View>
            <Text style={styles.hint}>
              É esse telefone que o cliente usa pra te ligar em "Meus agendamentos". A localização por GPS usada na
              busca "Perto de você" continua em Mais {">"} Localização.
            </Text>
          </Card>

          {erro && <Text style={styles.erro}>{erro}</Text>}
          {sucesso && <Text style={styles.sucesso}>Dados atualizados com sucesso.</Text>}

          <Button label="Salvar alterações" onPress={salvar} loading={salvando} />
        </ScrollView>
      </KeyboardAvoid>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, gap: spacing.md },
  secaoTitulo: { fontSize: 13, fontWeight: "700", color: colors.inkMuted, marginTop: spacing.sm },
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
  hint: { fontSize: 11, color: colors.inkMuted, lineHeight: 16 },
  erro: { color: colors.danger, fontSize: 13 },
  sucesso: { color: colors.success, fontSize: 13 },
});
