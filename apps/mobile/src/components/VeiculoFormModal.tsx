import React, { useEffect, useState } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { PORTES_VEICULO, PorteVeiculo, ROTULO_PORTE, Veiculo, VeiculoInput, normalizarPlaca } from "@lavajato-app/shared";
import { api, mensagemErroApi } from "../api/client";
import { Button } from "./Button";
import { colors, radius, spacing } from "../theme/tokens";
import { KeyboardAvoid } from "./KeyboardAvoid";

interface Props {
  visible: boolean;
  // Presente = editando esse veículo; ausente = cadastrando um novo.
  veiculo?: Veiculo | null;
  onClose: () => void;
  onSalvo: (veiculo: Veiculo) => void;
}

// Formulário (em modal) de cadastro/edição de veículo do cliente — usado na
// tela "Meus veículos" e também direto nos fluxos de agendamento/assinatura,
// pra o cliente cadastrar o carro sem sair da tela em que estava.
export function VeiculoFormModal({ visible, veiculo, onClose, onSalvo }: Props) {
  const [placa, setPlaca] = useState("");
  const [marca, setMarca] = useState("");
  const [modelo, setModelo] = useState("");
  const [cor, setCor] = useState("");
  const [porte, setPorte] = useState<PorteVeiculo>(PorteVeiculo.HATCH);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  // Reinicia os campos toda vez que o modal abre (novo ou editando outro).
  useEffect(() => {
    if (!visible) return;
    setPlaca(veiculo?.placa ?? "");
    setMarca(veiculo?.marca ?? "");
    setModelo(veiculo?.modelo ?? "");
    setCor(veiculo?.cor ?? "");
    setPorte(veiculo?.porte ?? PorteVeiculo.HATCH);
    setErro(null);
  }, [visible, veiculo]);

  async function salvar() {
    setErro(null);
    const placaLimpa = normalizarPlaca(placa);
    if (placaLimpa.length !== 7) return setErro("Digite a placa completa (ex: ABC1D23).");
    if (!modelo.trim()) return setErro("Digite o modelo do veículo.");

    const corpo: VeiculoInput = {
      placa: placaLimpa,
      marca: marca.trim() || undefined,
      modelo: modelo.trim(),
      cor: cor.trim() || undefined,
      porte,
    };

    setSalvando(true);
    try {
      const { data } = veiculo
        ? await api.patch<Veiculo>(`/veiculos/${veiculo.id}`, corpo)
        : await api.post<Veiculo>("/veiculos", corpo);
      onSalvo(data);
    } catch (e: any) {
      setErro(mensagemErroApi(e, "Não foi possível salvar o veículo."));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.fundo}>
        <KeyboardAvoid behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ width: "100%" }}>
          <View style={styles.folha}>
            <ScrollView contentContainerStyle={styles.conteudo} keyboardShouldPersistTaps="handled">
              <Text style={styles.titulo}>{veiculo ? "Editar veículo" : "Novo veículo"}</Text>

              <View style={styles.campo}>
                <Text style={styles.label}>Placa</Text>
                <TextInput
                  value={placa}
                  onChangeText={(t) => setPlaca(normalizarPlaca(t).slice(0, 7))}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={8}
                  placeholder="ABC1D23"
                  placeholderTextColor={colors.inkMuted}
                  style={styles.input}
                />
              </View>
              <View style={styles.campo}>
                <Text style={styles.label}>Marca (opcional)</Text>
                <TextInput value={marca} onChangeText={setMarca} placeholder="Ex: Volkswagen" placeholderTextColor={colors.inkMuted} style={styles.input} />
              </View>
              <View style={styles.campo}>
                <Text style={styles.label}>Modelo</Text>
                <TextInput value={modelo} onChangeText={setModelo} placeholder="Ex: Gol" placeholderTextColor={colors.inkMuted} style={styles.input} />
              </View>
              <View style={styles.campo}>
                <Text style={styles.label}>Cor (opcional)</Text>
                <TextInput value={cor} onChangeText={setCor} placeholder="Ex: Branco" placeholderTextColor={colors.inkMuted} style={styles.input} />
              </View>

              <View style={styles.campo}>
                <Text style={styles.label}>Porte (define o valor do serviço)</Text>
                <View style={styles.portes}>
                  {PORTES_VEICULO.map((p) => {
                    const selecionado = p === porte;
                    return (
                      <Pressable key={p} onPress={() => setPorte(p)}>
                        <View style={[styles.chip, selecionado && styles.chipSelecionado]}>
                          <Text style={[styles.chipTexto, selecionado && styles.chipTextoSelecionado]}>{ROTULO_PORTE[p]}</Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {erro && <Text style={styles.erro}>{erro}</Text>}

              <Button label="Salvar veículo" onPress={salvar} loading={salvando} />
              <Button label="Cancelar" variant="secondary" onPress={onClose} disabled={salvando} />
            </ScrollView>
          </View>
        </KeyboardAvoid>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  folha: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: "92%",
    borderWidth: 1,
    borderColor: colors.border,
  },
  conteudo: { padding: spacing.xl, gap: spacing.md },
  titulo: { fontSize: 18, fontWeight: "800", color: colors.ink },
  campo: { gap: spacing.xs },
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
  portes: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  chipSelecionado: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipTexto: { fontSize: 13, fontWeight: "700", color: colors.ink },
  chipTextoSelecionado: { color: colors.accentInk },
  erro: { color: colors.danger, fontSize: 13 },
});
