import React, { useState } from "react";
import { Platform, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { api } from "../../api/client";
import { Button } from "../../components/Button";
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

type Props = NativeStackScreenProps<AuthStackParamList, "EsqueciSenha">;

export function EsqueciSenhaScreen({ navigation }: Props) {
  const [email, setEmail] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function enviar() {
    const e = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(e)) return setErro("Digite um e-mail válido.");
    setErro(null);
    setCarregando(true);
    try {
      await api.post("/auth/esqueci-senha", { email: e });
      navigation.navigate("CodigoSenha", { email: e });
    } catch (err: any) {
      setErro(msg(err, "Não foi possível enviar o código. Tente novamente."));
    } finally {
      setCarregando(false);
    }
  }

  return (
    <Moldura>
      <Text style={styles.title}>Esqueci minha senha</Text>
      <Text style={styles.subtitle}>Digite o e-mail da sua conta. Vamos enviar um código de 6 dígitos para você criar uma nova senha.</Text>
      <View style={styles.field}>
        <Text style={styles.label}>E-mail cadastrado</Text>
        <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" style={styles.input} placeholder="voce@email.com" />
      </View>
      {erro && <Text style={styles.erro}>{erro}</Text>}
      <Button label="Enviar código" onPress={enviar} loading={carregando} />
    </Moldura>
  );
}
