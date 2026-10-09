import React, { useEffect, useRef, useState } from "react";
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
  const [buscandoPlaca, setBuscandoPlaca] = useState(false);
  const [avisoPlaca, setAvisoPlaca] = useState<string | null>(null);
  // Campos que o usuário mexeu à mão — a busca automática nunca sobrescreve.
  const editados = useRef({ marca: false, modelo: false, cor: false, porte: false });
  const ultimaBusca = useRef("");

  // Reinicia os campos toda vez que o modal abre (novo ou editando outro).
  useEffect(() => {
    if (!visible) return;
    setPlaca(veiculo?.placa ?? "");
    setMarca(veiculo?.marca ?? "");
    setModelo(veiculo?.modelo ?? "");
    setCor(veiculo?.cor ?? "");
    setPorte(veiculo?.porte ?? PorteVeiculo.HATCH);
    setErro(null);
    setAvisoPlaca(null);
    setBuscandoPlaca(false);
    editados.current = { marca: !!veiculo, modelo: !!veiculo, cor: !!veiculo, porte: !!veiculo };
    ultimaBusca.current = "";
  }, [visible, veiculo]);

  // Ao completar a placa (só cadastro novo), tenta preencher os dados sozinho.
  // É um extra: qualquer falha (sem provedor, sem internet, placa não achada)
  // é silenciosa e o formulário segue 100% preenchível à mão.
  useEffect(() => {
    if (!visible || veiculo) return;
    const p = normalizarPlaca(placa);
    if (p.length !== 7) {
      ultimaBusca.current = "";
      return;
    }
    if (ultimaBusca.current === p) return;
    ultimaBusca.current = p;
    let cancelado = false;
    setBuscandoPlaca(true);
    setAvisoPlaca(null);
    api
      .get<{ encontrado: boolean; marca?: string; modelo?: string; cor?: string; porte?: PorteVeiculo }>(`/veiculos/consultar-placa/${p}`, { timeout: 9000 })
      .then(({ data }) => {
        if (cancelado || !data?.encontrado) return;
        if (data.marca && !editados.current.marca) setMarca(data.marca);
        if (data.modelo && !editados.current.modelo) setModelo(data.modelo);
        if (data.cor && !editados.current.cor) setCor(data.cor);
        if (data.porte && !editados.current.porte) setPorte(data.porte);
        setAvisoPlaca("Dados preenchidos pela placa. Confira e ajuste se precisar.");
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelado) setBuscandoPlaca(false);
      });
    return () => {
      cancelado = true;
      setBuscandoPlaca(false);
    };
  }, [placa, visible, veiculo]);

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
                {buscandoPlaca && <Text style={styles.dica}>Buscando dados da placa…</Text>}
                {!buscandoPlaca && avisoPlaca && <Text style={styles.dica}>{avisoPlaca}</Text>}
              </View>
              <View style={styles.campo}>
                <Text style={styles.label}>Marca (opcional)</Text>
                <TextInput value={marca} onChangeText={(t) => { editados.current.marca = true; setMarca(t); }} placeholder="Ex: Volkswagen" placeholderTextColor={colors.inkMuted} style={styles.input} />
              </View>
              <View style={styles.campo}>
                <Text style={styles.label}>Modelo</Text>
                <TextInput value={modelo} onChangeText={(t) => { editados.current.modelo = true; setModelo(t); }} placeholder="Ex: Gol" placeholderTextColor={colors.inkMuted} style={styles.input} />
              </View>
              <View style={styles.campo}>
                <Text style={styles.label}>Cor (opcional)</Text>
                <TextInput value={cor} onChangeText={(t) => { editados.current.cor = true; setCor(t); }} placeholder="Ex: Branco" placeholderTextColor={colors.inkMuted} style={styles.input} />
              </View>

              <View style={styles.campo}>
                <Text style={styles.label}>Porte (define o valor do serviço)</Text>
                <View style={styles.portes}>
                  {PORTES_VEICULO.map((p) => {
                    const selecionado = p === porte;
                    return (
                      <Pressable key={p} onPress={() => { editados.current.porte = true; setPorte(p); }}>
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
  dica: { color: colors.accent, fontSize: 12 },
});
