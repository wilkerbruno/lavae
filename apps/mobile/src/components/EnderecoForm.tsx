import React, { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from "react-native";
import { colors, radius, spacing } from "../theme/tokens";

export interface EnderecoValores {
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
}

export const ENDERECO_VAZIO: EnderecoValores = {
  cep: "",
  logradouro: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  uf: "",
};

// Mesmas regras do EnderecoDto na API (apps/api/src/common/dto/endereco.dto.ts)
// — valida antes de mandar, pra mostrar um erro amigável em vez do 400 da API.
export function enderecoValido(v: EnderecoValores): boolean {
  return (
    v.cep.replace(/\D/g, "").length === 8 &&
    v.logradouro.trim().length >= 2 &&
    v.numero.trim().length >= 1 &&
    v.bairro.trim().length >= 2 &&
    v.cidade.trim().length >= 2 &&
    v.uf.trim().length === 2
  );
}

// Formato que a API espera (EnderecoDto) — usar no corpo do POST/PATCH.
export function enderecoParaApi(v: EnderecoValores) {
  return {
    cep: v.cep.trim(),
    logradouro: v.logradouro.trim(),
    numero: v.numero.trim(),
    complemento: v.complemento.trim() || undefined,
    bairro: v.bairro.trim(),
    cidade: v.cidade.trim(),
    uf: v.uf.trim().toUpperCase(),
  };
}

function formatarCep(cep: string): string {
  const digitos = cep.replace(/\D/g, "").slice(0, 8);
  return digitos.length > 5 ? `${digitos.slice(0, 5)}-${digitos.slice(5)}` : digitos;
}

interface Props {
  valores: EnderecoValores;
  onChange: (valores: EnderecoValores) => void;
  // Cada tela usa um aviso diferente (ex: "só você vê este dado").
  hint?: string;
}

// CEP com busca automática (ViaCEP) + campos separados — usado em todo
// cadastro/edição que exige endereço completo (cliente, funcionário, dono/
// lava jato). Ao completar os 8 dígitos do CEP, busca e pré-preenche
// logradouro/bairro/cidade/UF — a pessoa ainda pode corrigir à mão (a
// consulta pode vir imprecisa ou sem numeração na rua). Número e
// complemento são sempre digitados manualmente, já que o CEP não sabe
// esses dados.
export function EnderecoForm({ valores, onChange, hint }: Props) {
  const [buscando, setBuscando] = useState(false);
  const [erroCep, setErroCep] = useState<string | null>(null);

  function campo<K extends keyof EnderecoValores>(chave: K, valor: EnderecoValores[K]) {
    onChange({ ...valores, [chave]: valor });
  }

  async function aoMudarCep(texto: string) {
    const formatado = formatarCep(texto);
    onChange({ ...valores, cep: formatado });
    setErroCep(null);

    const digitos = formatado.replace(/\D/g, "");
    if (digitos.length !== 8) return;

    setBuscando(true);
    try {
      const resposta = await fetch(`https://viacep.com.br/ws/${digitos}/json/`);
      const dados = await resposta.json();
      if (dados.erro) {
        setErroCep("CEP não encontrado. Confira o número ou preencha o endereço manualmente.");
        return;
      }
      onChange({
        ...valores,
        cep: formatado,
        logradouro: dados.logradouro || valores.logradouro,
        bairro: dados.bairro || valores.bairro,
        cidade: dados.localidade || valores.cidade,
        uf: dados.uf || valores.uf,
      });
    } catch {
      setErroCep("Não foi possível buscar o CEP agora. Preencha o endereço manualmente.");
    } finally {
      setBuscando(false);
    }
  }

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={styles.field}>
        <Text style={styles.label}>CEP</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <TextInput
            value={valores.cep}
            onChangeText={aoMudarCep}
            keyboardType="number-pad"
            maxLength={9}
            placeholder="00000-000"
            placeholderTextColor={colors.inkMuted}
            style={[styles.input, { flex: 1 }]}
          />
          {buscando && <ActivityIndicator color={colors.accent} />}
        </View>
        {erroCep && <Text style={styles.erro}>{erroCep}</Text>}
      </View>

      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <View style={[styles.field, { flex: 2 }]}>
          <Text style={styles.label}>Rua / logradouro</Text>
          <TextInput
            value={valores.logradouro}
            onChangeText={(v) => campo("logradouro", v)}
            placeholder="Rua, avenida..."
            placeholderTextColor={colors.inkMuted}
            style={styles.input}
          />
        </View>
        <View style={[styles.field, { flex: 1 }]}>
          <Text style={styles.label}>Número</Text>
          <TextInput
            value={valores.numero}
            onChangeText={(v) => campo("numero", v)}
            placeholder="123"
            placeholderTextColor={colors.inkMuted}
            keyboardType="number-pad"
            style={styles.input}
          />
        </View>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Complemento (opcional)</Text>
        <TextInput
          value={valores.complemento}
          onChangeText={(v) => campo("complemento", v)}
          placeholder="Apto, bloco, casa..."
          placeholderTextColor={colors.inkMuted}
          style={styles.input}
        />
      </View>

      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <View style={[styles.field, { flex: 2 }]}>
          <Text style={styles.label}>Bairro</Text>
          <TextInput
            value={valores.bairro}
            onChangeText={(v) => campo("bairro", v)}
            placeholder="Bairro"
            placeholderTextColor={colors.inkMuted}
            style={styles.input}
          />
        </View>
        <View style={[styles.field, { flex: 1 }]}>
          <Text style={styles.label}>UF</Text>
          <TextInput
            value={valores.uf}
            onChangeText={(v) => campo("uf", v.toUpperCase().slice(0, 2))}
            placeholder="MG"
            placeholderTextColor={colors.inkMuted}
            autoCapitalize="characters"
            maxLength={2}
            style={styles.input}
          />
        </View>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Cidade</Text>
        <TextInput
          value={valores.cidade}
          onChangeText={(v) => campo("cidade", v)}
          placeholder="Cidade"
          placeholderTextColor={colors.inkMuted}
          style={styles.input}
        />
      </View>

      {hint && <Text style={styles.hint}>{hint}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
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
  erro: { color: colors.danger, fontSize: 12 },
  hint: { fontSize: 12, color: colors.inkMuted, lineHeight: 17 },
});
