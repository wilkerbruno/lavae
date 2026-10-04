import React, { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { alertar } from "../../utils/alertaCompat";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { centavosParaReais, Pacote, Servico } from "@lavajato-app/shared";
import { api } from "../../api/client";
import { useAuthStore } from "../../store/authStore";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { colors, radius, spacing } from "../../theme/tokens";

const PACOTE_VAZIO = { nome: "", precoReais: "", descricao: "" };

// Pacotes agrupam vários serviços com um preço combinado (ex: lavagem + cera
// saindo mais barato do que os dois avulsos) — mesma lógica de tela do
// ServicosScreen, com a lista de serviços incluídos escolhida por checkbox.
export function PacotesScreen() {
  const lavaJatoId = useAuthStore((s) => s.usuario?.lavaJatoId);
  const [pacotes, setPacotes] = useState<Pacote[]>([]);
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [formAberto, setFormAberto] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [campos, setCampos] = useState(PACOTE_VAZIO);
  const [servicoIdsSelecionados, setServicoIdsSelecionados] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    if (!lavaJatoId) return;
    const [pacotesRes, servicosRes] = await Promise.all([
      api.get<Pacote[]>(`/lavajatos/${lavaJatoId}/pacotes`),
      api.get<Servico[]>(`/lavajatos/${lavaJatoId}/servicos`),
    ]);
    setPacotes(pacotesRes.data);
    setServicos(servicosRes.data);
  }, [lavaJatoId]);

  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [carregar]),
  );

  function abrirNovo() {
    setEditandoId(null);
    setCampos(PACOTE_VAZIO);
    setServicoIdsSelecionados([]);
    setFormAberto(true);
  }

  function abrirEdicao(pacote: Pacote) {
    setEditandoId(pacote.id);
    setCampos({
      nome: pacote.nome,
      precoReais: (pacote.precoCentavos / 100).toFixed(2),
      descricao: pacote.descricao ?? "",
    });
    setServicoIdsSelecionados(pacote.servicos.map((ps) => ps.servicoId));
    setFormAberto(true);
  }

  function alternarServico(servicoId: string) {
    setServicoIdsSelecionados((atual) =>
      atual.includes(servicoId) ? atual.filter((id) => id !== servicoId) : [...atual, servicoId],
    );
  }

  async function salvar() {
    const nome = campos.nome.trim();
    const precoCentavos = Math.round(parseFloat(campos.precoReais.replace(",", ".")) * 100);

    if (!nome) return alertar("Falta o nome", "Digite o nome do pacote.");
    if (!Number.isFinite(precoCentavos) || precoCentavos <= 0) {
      return alertar("Preço inválido", "Digite um preço maior que zero (ex: 70,00).");
    }
    if (servicoIdsSelecionados.length === 0) {
      return alertar("Selecione os serviços", "Escolha pelo menos um serviço pra incluir no pacote.");
    }

    const dto = {
      nome,
      precoCentavos,
      descricao: campos.descricao.trim() || undefined,
      servicoIds: servicoIdsSelecionados,
    };
    setSalvando(true);
    try {
      if (editandoId) {
        await api.patch(`/pacotes/${editandoId}`, dto);
      } else {
        await api.post("/pacotes", dto);
      }
      setFormAberto(false);
      carregar();
    } catch (e: any) {
      alertar("Não foi possível salvar", e?.response?.data?.message ?? "Tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  async function alternarAtivo(pacote: Pacote) {
    await api.patch(`/pacotes/${pacote.id}`, { ativo: !pacote.ativo });
    carregar();
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Pacotes</Text>
        {!formAberto && (
          <Text style={styles.addButton} onPress={abrirNovo}>
            + Novo
          </Text>
        )}
      </View>

      <FlatList
        data={pacotes}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          formAberto ? (
            <Card style={{ gap: spacing.sm, marginBottom: spacing.lg }}>
              <Text style={styles.formTitle}>{editandoId ? "Editar pacote" : "Novo pacote"}</Text>
              <TextInput
                value={campos.nome}
                onChangeText={(nome) => setCampos((c) => ({ ...c, nome }))}
                placeholder="Nome (ex: Lavagem + Cera)"
                placeholderTextColor={colors.inkMuted}
                style={styles.input}
              />
              <TextInput
                value={campos.precoReais}
                onChangeText={(precoReais) => setCampos((c) => ({ ...c, precoReais }))}
                placeholder="Preço combinado (R$) — carro hatch"
                placeholderTextColor={colors.inkMuted}
                keyboardType="decimal-pad"
                style={styles.input}
              />
              <TextInput
                value={campos.descricao}
                onChangeText={(descricao) => setCampos((c) => ({ ...c, descricao }))}
                placeholder="Descrição (opcional)"
                placeholderTextColor={colors.inkMuted}
                style={styles.input}
              />

              <Text style={styles.subLabel}>Serviços incluídos</Text>
              {servicos.length === 0 ? (
                <Text style={styles.hint}>Cadastre serviços primeiro pra poder agrupá-los num pacote.</Text>
              ) : (
                <View style={{ gap: spacing.xs }}>
                  {servicos.map((s) => {
                    const selecionado = servicoIdsSelecionados.includes(s.id);
                    return (
                      <Pressable key={s.id} onPress={() => alternarServico(s.id)} style={styles.checkboxLinha}>
                        <Ionicons
                          name={selecionado ? "checkbox" : "square-outline"}
                          size={20}
                          color={selecionado ? colors.accent : colors.inkMuted}
                        />
                        <Text style={styles.checkboxTexto}>
                          {s.nome} · {centavosParaReais(s.precoCentavos)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}

              <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs }}>
                <View style={{ flex: 1 }}>
                  <Button label="Cancelar" variant="secondary" onPress={() => setFormAberto(false)} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button label="Salvar" onPress={salvar} loading={salvando} />
                </View>
              </View>
            </Card>
          ) : null
        }
        ListEmptyComponent={
          !formAberto ? <Text style={styles.empty}>Nenhum pacote cadastrado ainda. Toque em "+ Novo".</Text> : null
        }
        renderItem={({ item }) => (
          <Card style={{ marginBottom: spacing.sm, gap: spacing.xs, opacity: item.ativo ? 1 : 0.5 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
              <View style={{ flex: 1, paddingRight: spacing.sm }}>
                <Text style={styles.name}>{item.nome}</Text>
                <Text style={styles.meta}>{centavosParaReais(item.precoCentavos)}</Text>
                <Text style={styles.meta}>{item.servicos.map((ps) => ps.servico.nome).join(", ")}</Text>
                {item.descricao ? <Text style={styles.meta}>{item.descricao}</Text> : null}
              </View>
              <Text style={styles.editButton} onPress={() => abrirEdicao(item)}>
                Editar
              </Text>
            </View>
            <Text style={styles.acaoSecundaria} onPress={() => alternarAtivo(item)}>
              {item.ativo ? "Desativar" : "Ativar"}
            </Text>
          </Card>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  title: { fontSize: 20, fontWeight: "800", color: colors.ink },
  addButton: { color: colors.accent, fontWeight: "700" },
  list: { padding: spacing.xl },
  empty: { color: colors.inkMuted, fontSize: 13, textAlign: "center", marginTop: spacing.xxl },
  formTitle: { fontSize: 14, fontWeight: "800", color: colors.ink },
  subLabel: { fontSize: 12, fontWeight: "700", color: colors.inkMuted, marginTop: spacing.xs },
  hint: { fontSize: 12, color: colors.inkMuted },
  checkboxLinha: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  checkboxTexto: { fontSize: 13, color: colors.ink },
  name: { fontWeight: "700", color: colors.ink, fontSize: 14 },
  meta: { fontSize: 12, color: colors.inkMuted, marginTop: 2 },
  editButton: { color: colors.accent, fontWeight: "700", fontSize: 12 },
  acaoSecundaria: { color: colors.inkMuted, fontWeight: "700", fontSize: 12 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 13,
    color: colors.ink,
  },
});
