import React, { useEffect, useState } from "react";
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { Plano, centavosParaReais } from "@lavajato-app/shared";
import { api } from "../../api/client";
import { useAuthStore } from "../../store/authStore";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { PasswordInput } from "../../components/PasswordInput";
import { ENDERECO_VAZIO, EnderecoForm, enderecoParaApi, enderecoValido } from "../../components/EnderecoForm";
import { colors, radius, spacing } from "../../theme/tokens";
import { anexarArquivo } from "../../utils/anexarArquivo";

// Onboarding de uma novo lava jato assinante do SaaS, pelo próprio app:
// cria o tenant + o usuário dono (LAVAJATO_ADMIN) num plano em TRIAL, e
// deixa o dono já enviar a logo do lava jato (opcional — dá pra fazer isso
// depois também, em "Mais > Logo").
export function RegistrarLavaJatoScreen() {
  const [nomeLavaJato, setNomeLavaJato] = useState("");
  const [nomeDono, setNomeDono] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [telefone, setTelefone] = useState("");
  const [endereco, setEndereco] = useState(ENDERECO_VAZIO);
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [planoId, setPlanoId] = useState<string | null>(null);
  const [logo, setLogo] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const entrar = useAuthStore((s) => s.entrar);

  useEffect(() => {
    api
      .get<Plano[]>("/planos")
      .then(({ data }) => {
        setPlanos(data);
        if (data.length > 0) setPlanoId((atual) => atual ?? data[0].id);
      })
      .catch(() => {
        // Sem planos carregados, o botão de criar conta fica desabilitado
        // (garantirAcesso abaixo) — não trava a tela, só não deixa continuar.
      });
  }, []);

  async function escolherLogo() {
    const permissao = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissao.granted) return;

    const resultado = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!resultado.canceled && resultado.assets[0]) {
      setLogo(resultado.assets[0]);
    }
  }

  async function enviarLogoSeHouver(lavaJatoId: string) {
    if (!logo) return;
    const formData = new FormData();
    try {
      await anexarArquivo(formData, "logo", logo);
      await api.post(`/lavajatos/${lavaJatoId}/logo`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    } catch {
      // A conta já foi criada com sucesso nesse ponto — não vale a pena barrar
      // o cadastro por causa da logo. Dá pra tentar de novo em Mais > Logo.
    }
  }

  async function handleRegistrar() {
    if (!planoId) {
      setErro("Escolha um plano para continuar.");
      return;
    }
    if (telefone.replace(/\D/g, "").length < 8) {
      setErro("Informe um telefone válido com DDD.");
      return;
    }
    if (!enderecoValido(endereco)) {
      setErro("Informe o endereço completo do lava jato (CEP, rua, número, bairro e cidade).");
      return;
    }
    setErro(null);
    setCarregando(true);
    try {
      const { data } = await api.post("/auth/registrar-lavajato", {
        nomeLavaJato,
        nomeDono,
        email,
        senha,
        telefone,
        endereco: enderecoParaApi(endereco),
        planoId,
      });
      await enviarLogoSeHouver(data.lavaJato.id);
      await entrar(data.accessToken, data.usuario);
      // Não precisa navegar manualmente: o RootNavigator troca de stack
      // sozinho assim que `usuario` muda no authStore (igual no login).
    } catch (e: any) {
      setErro(e?.response?.data?.message ?? "Não foi possível criar a conta do lava jato.");
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
          <Text style={styles.title}>Cadastrar lava jato</Text>
          <Text style={styles.subtitle}>Comece grátis no período de teste do seu plano</Text>

          <Pressable style={styles.logoPicker} onPress={escolherLogo}>
            {logo ? (
              <Image source={{ uri: logo.uri }} style={styles.logoPreview} />
            ) : (
              <View style={styles.logoPlaceholder}>
                <Ionicons name="camera-outline" size={26} color={colors.inkMuted} />
              </View>
            )}
            <Text style={styles.logoLabel}>{logo ? "Trocar logo" : "Adicionar logo (opcional)"}</Text>
          </Pressable>

          <View style={styles.field}>
            <Text style={styles.label}>Nome do lava jato</Text>
            <TextInput
              value={nomeLavaJato}
              onChangeText={setNomeLavaJato}
              style={styles.input}
              placeholder="Ex: Lava jato Alameda"
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Seu nome (dono)</Text>
            <TextInput value={nomeDono} onChangeText={setNomeDono} style={styles.input} placeholder="Seu nome" />
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
            <Text style={styles.label}>Seu telefone (dono)</Text>
            <TextInput
              value={telefone}
              onChangeText={setTelefone}
              keyboardType="phone-pad"
              style={styles.input}
              placeholder="(11) 91234-5678"
            />
          </View>
          <Text style={styles.label}>Endereço do lava jato</Text>
          <EnderecoForm valores={endereco} onChange={setEndereco} />

          <Text style={styles.label}>Plano</Text>
          <View style={{ gap: spacing.sm }}>
            {planos.map((plano) => {
              const selecionado = plano.id === planoId;
              return (
                <Pressable key={plano.id} onPress={() => setPlanoId(plano.id)}>
                  <Card style={[styles.planoCard, selecionado && styles.planoCardSelecionado]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.planoNome}>{plano.nome}</Text>
                      <Text style={styles.planoPreco}>{centavosParaReais(plano.precoCentavos)}/mês</Text>
                    </View>
                    <Ionicons
                      name={selecionado ? "checkmark-circle" : "ellipse-outline"}
                      size={22}
                      color={selecionado ? colors.accent : colors.inkMuted}
                    />
                  </Card>
                </Pressable>
              );
            })}
          </View>

          {erro && <Text style={styles.erro}>{erro}</Text>}

          <Button label="Criar conta do lava jato" onPress={handleRegistrar} loading={carregando} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, padding: spacing.xl, gap: spacing.md },
  title: { fontSize: 26, fontWeight: "800", color: colors.ink },
  subtitle: { fontSize: 13, color: colors.inkMuted, marginBottom: spacing.sm },
  logoPicker: { alignItems: "center", gap: spacing.xs, marginBottom: spacing.sm },
  logoPreview: { width: 84, height: 84, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  logoPlaceholder: {
    width: 84,
    height: 84,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  logoLabel: { fontSize: 12, fontWeight: "600", color: colors.accent },
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
  planoCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  planoCardSelecionado: { borderColor: colors.accent, borderWidth: 1.5, backgroundColor: colors.accentSoft },
  planoNome: { fontSize: 14, fontWeight: "700", color: colors.ink },
  planoPreco: { fontSize: 12, color: colors.inkMuted, marginTop: 2 },
  erro: { color: colors.danger, fontSize: 13 },
});
