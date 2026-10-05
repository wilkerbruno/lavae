import React, { useState } from "react";
import { Platform, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { api } from "../../api/client";
import { Button } from "../../components/Button";
import { PasswordInput } from "../../components/PasswordInput";
import { KeyboardAvoid } from "../../components/KeyboardAvoid";
import { AuthStackParamList } from "../../navigation/AuthNavigator";
import { estilosRecuperacao as styles } from "./recuperacaoEstilos";

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <KeyboardAvoid style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 24}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      </KeyboardAvoid>
    </SafeAreaView>
  );
}

const msg = (e: any, padrao: string) => {
  const m = e?.response?.data?.message;
  return Array.isArray(m) ? m[0] : m ?? padrao;
};

type Props = NativeStackScreenProps<AuthStackParamList, "NovaSenha">;

export function NovaSenhaScreen({ navigation, route }: Props) {
  const { token } = route.params;
  const [senha, setSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function salvar() {
    if (senha.length < 8) return setErro("A nova senha deve ter no mínimo 8 caracteres.");
    if (senha !== confirmar) return setErro("As senhas não conferem.");
    setErro(null);
    setCarregando(true);
    try {
      await api.post("/auth/redefinir-senha", { token, novaSenha: senha, confirmarSenha: confirmar });
      navigation.reset({ index: 0, routes: [{ name: "Login", params: { senhaRedefinida: true } }] });
    } catch (err: any) {
      setErro(msg(err, "Não foi possível redefinir a senha."));
    } finally {
      setCarregando(false);
    }
  }

  return (
    <Moldura>
      <Text style={styles.title}>Nova senha</Text>
      <Text style={styles.subtitle}>Crie uma senha com no mínimo 8 caracteres e repita para confirmar.</Text>
      <View style={styles.field}>
        <Text style={styles.label}>Nova senha</Text>
        <PasswordInput value={senha} onChangeText={setSenha} style={styles.input} placeholder="Mínimo 8 caracteres" />
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>Repita a nova senha</Text>
        <PasswordInput value={confirmar} onChangeText={setConfirmar} style={styles.input} placeholder="Repita a senha" />
      </View>
      {erro && <Text style={styles.erro}>{erro}</Text>}
      <Button label="Salvar nova senha" onPress={salvar} loading={carregando} />
    </Moldura>
  );
}
