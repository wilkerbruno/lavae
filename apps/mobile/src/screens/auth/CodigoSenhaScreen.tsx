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

type Props = NativeStackScreenProps<AuthStackParamList, "CodigoSenha">;

export function CodigoSenhaScreen({ navigation, route }: Props) {
  const { email } = route.params;
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function confirmar() {
    if (codigo.length !== 6) return setErro("Digite os 6 dígitos do código.");
    setErro(null);
    setCarregando(true);
    try {
      const { data } = await api.post("/auth/verificar-codigo", { email, codigo });
      navigation.replace("NovaSenha", { token: data.token });
    } catch (err: any) {
      setErro(msg(err, "Código inválido ou expirado."));
    } finally {
      setCarregando(false);
    }
  }

  async function reenviar() {
    setErro(null);
    setAviso(null);
    try {
      await api.post("/auth/esqueci-senha", { email });
      setAviso("Se já tinha passado 1 minuto, enviamos um novo código.");
    } catch (err: any) {
      setErro(msg(err, "Não foi possível reenviar."));
    }
  }

  return (
    <Moldura>
      <Text style={styles.title}>Digite o código</Text>
      <Text style={styles.subtitle}>Enviamos um código de 6 dígitos para {email}. Ele vale por 15 minutos. Olhe também a caixa de spam.</Text>
      <TextInput
        value={codigo}
        onChangeText={(t) => setCodigo(t.replace(/\D/g, "").slice(0, 6))}
        keyboardType="number-pad"
        maxLength={6}
        style={[styles.input, styles.codigo]}
        placeholder="000000"
        textContentType="oneTimeCode"
      />
      {erro && <Text style={styles.erro}>{erro}</Text>}
      {aviso && <Text style={styles.info}>{aviso}</Text>}
      <Button label="Confirmar código" onPress={confirmar} loading={carregando} />
      <Text style={styles.link} onPress={reenviar}>Não recebeu? Reenviar código</Text>
    </Moldura>
  );
}
