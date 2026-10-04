import React, { useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { isAxiosError } from "axios";
import { api } from "../../api/client";
import { useAuthStore } from "../../store/authStore";
import { Button } from "../../components/Button";
import { colors, radius, spacing } from "../../theme/tokens";
import { anexarArquivo } from "../../utils/anexarArquivo";

// Traduz o erro da chamada numa frase curta e específica, em vez do genérico
// "tente de novo" — isso é o que permite identificar de cara se é a API fora
// do ar, a rota ainda não publicada, arquivo grande demais etc.
function descreverErro(erro: unknown): string {
  if (isAxiosError(erro)) {
    if (!erro.response) {
      return "Não foi possível conectar ao servidor. Verifique sua internet e tente de novo.";
    }
    const { status, data } = erro.response;
    const mensagemApi = Array.isArray(data?.message) ? data.message.join(" ") : data?.message;
    if (status === 404) {
      return "Essa função ainda não está disponível no servidor (rota não encontrada). Avise o suporte.";
    }
    if (status === 403) {
      return "Sua conta não tem permissão para alterar a logo deste lava jato.";
    }
    if (status === 413) {
      return "A imagem é muito grande. Escolha uma imagem menor.";
    }
    if (mensagemApi) return mensagemApi;
    return `Erro do servidor (${status}). Tente de novo.`;
  }
  return "Não foi possível salvar a logo. Tente de novo.";
}

// Tela "Mais > Logo": troca a logo do lava jato a qualquer momento (a mesma
// usada no cadastro, em RegistrarLavaJatoScreen — ver ali o mesmo padrão de
// escolher/enviar imagem).
export function LogoScreen() {
  const lavaJatoId = useAuthStore((s) => s.usuario?.lavaJatoId);
  const [logoAtual, setLogoAtual] = useState<string | null>(null);
  const [novaLogo, setNovaLogo] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [status, setStatus] = useState<"carregando" | "pronto" | "enviando" | "salvo" | "erro">("carregando");
  const [erroDetalhe, setErroDetalhe] = useState<string | null>(null);

  useEffect(() => {
    if (!lavaJatoId) return;
    api
      .get(`/lavajatos/${lavaJatoId}`)
      .then(({ data }) => {
        setLogoAtual(data.logoUrl ?? null);
        setStatus("pronto");
      })
      .catch(() => setStatus("erro"));
  }, [lavaJatoId]);

  async function escolher() {
    const permissao = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissao.granted) return;

    const resultado = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!resultado.canceled && resultado.assets[0]) {
      setNovaLogo(resultado.assets[0]);
    }
  }

  async function enviar() {
    if (!lavaJatoId || !novaLogo) return;
    setStatus("enviando");
    const formData = new FormData();
    try {
      await anexarArquivo(formData, "logo", novaLogo);
      const { data } = await api.post(`/lavajatos/${lavaJatoId}/logo`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setLogoAtual(data.logoUrl);
      setNovaLogo(null);
      setStatus("salvo");
      setErroDetalhe(null);
    } catch (erro) {
      setStatus("erro");
      setErroDetalhe(descreverErro(erro));
    }
  }

  const preview = novaLogo?.uri ?? logoAtual;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={{ padding: spacing.xl, gap: spacing.lg, alignItems: "center" }}>
        <Text style={styles.texto}>
          Essa logo aparece para os clientes na busca de lava jatos e na tela de agendamento.
        </Text>

        <Pressable onPress={escolher} style={styles.logoPicker}>
          {status === "carregando" ? (
            <ActivityIndicator color={colors.accent} />
          ) : preview ? (
            <Image source={{ uri: preview }} style={styles.logoPreview} />
          ) : (
            <View style={styles.logoPlaceholder}>
              <Ionicons name="camera-outline" size={28} color={colors.inkMuted} />
            </View>
          )}
        </Pressable>
        <Text style={styles.trocar} onPress={escolher}>
          {preview ? "Escolher outra imagem" : "Escolher imagem"}
        </Text>

        {novaLogo && (
          <Button label="Salvar logo" onPress={enviar} loading={status === "enviando"} />
        )}
        {status === "salvo" && <Text style={styles.sucesso}>Logo atualizada com sucesso.</Text>}
        {status === "erro" && (
          <Text style={styles.erro}>{erroDetalhe ?? "Não foi possível salvar a logo. Tente de novo."}</Text>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  texto: { fontSize: 13, color: colors.inkMuted, lineHeight: 19, textAlign: "center" },
  logoPicker: { marginTop: spacing.md },
  logoPreview: { width: 140, height: 140, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  logoPlaceholder: {
    width: 140,
    height: 140,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  trocar: { fontSize: 13, fontWeight: "600", color: colors.accent },
  sucesso: { fontSize: 13, color: colors.success, fontWeight: "600" },
  erro: { fontSize: 13, color: colors.danger },
});
