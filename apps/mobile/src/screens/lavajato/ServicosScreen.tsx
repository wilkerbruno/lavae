import React, { useCallback, useState } from "react";
import { FlatList, StyleSheet, Text, TextInput, View } from "react-native";
import { alertar } from "../../utils/alertaCompat";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { centavosParaReais, Servico } from "@lavajato-app/shared";
import { api } from "../../api/client";
import { useAuthStore } from "../../store/authStore";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { colors, radius, spacing } from "../../theme/tokens";
import { KeyboardAvoid } from "../../components/KeyboardAvoid";

const SERVICO_VAZIO = { nome: "", duracaoMinutos: "30", precoReais: "", descricao: "" };

// Onde o lava jato "coloca preço nos trabalhos" — o pedido original do produto.
// Pacotes (agrupar vários serviços com um preço próprio) já existem na API
// (POST/PATCH /pacotes), mas ainda não têm uma tela própria aqui — só serviços
// avulsos por enquanto.
export function ServicosScreen() {
  const lavaJatoId = useAuthStore((s) => s.usuario?.lavaJatoId);
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [formAberto, setFormAberto] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [campos, setCampos] = useState(SERVICO_VAZIO);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    if (!lavaJatoId) return;
    const { data } = await api.get<Servico[]>(`/lavajatos/${lavaJatoId}/servicos`);
    setServicos(data);
  }, [lavaJatoId]);

  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [carregar]),
  );

  function abrirNovo() {
    setEditandoId(null);
    setCampos(SERVICO_VAZIO);
    setFormAberto(true);
  }

  function abrirEdicao(servico: Servico) {
    setEditandoId(servico.id);
    setCampos({
      nome: servico.nome,
      duracaoMinutos: String(servico.duracaoMinutos),
      precoReais: (servico.precoCentavos / 100).toFixed(2),
      descricao: servico.descricao ?? "",
    });
    setFormAberto(true);
  }

  async function salvar() {
    const nome = campos.nome.trim();
    const duracaoMinutos = parseInt(campos.duracaoMinutos, 10);
    const precoCentavos = Math.round(parseFloat(campos.precoReais.replace(",", ".")) * 100);

    if (!nome) return alertar("Falta o nome", "Digite o nome do serviço.");
    if (!Number.isInteger(duracaoMinutos) || duracaoMinutos < 5) {
      return alertar("Duração inválida", "Digite uma duração em minutos (mínimo 5).");
    }
    if (!Number.isFinite(precoCentavos) || precoCentavos <= 0) {
      return alertar("Preço inválido", "Digite um preço maior que zero (ex: 45,00).");
    }

    const dto = { nome, duracaoMinutos, precoCentavos, descricao: campos.descricao.trim() || undefined };
    setSalvando(true);
    try {
      if (editandoId) {
        await api.patch(`/servicos/${editandoId}`, dto);
      } else {
        await api.post("/servicos", dto);
      }
      setFormAberto(false);
      carregar();
    } catch (e: any) {
      alertar("Não foi possível salvar", e?.response?.data?.message ?? "Tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  // A API não tem um "excluir de verdade" pra serviço (só desativar — ver
  // removerServico no backend, que preserva o histórico de agendamentos que já
  // usaram esse serviço). Por isso só existe Ativar/Desativar aqui, sem um
  // botão de "Excluir" separado que prometeria algo diferente do que acontece.
  async function alternarAtivo(servico: Servico) {
    await api.patch(`/servicos/${servico.id}`, { ativo: !servico.ativo });
    carregar();
  }

  return (
    <KeyboardAvoid>
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Serviços</Text>
        {!formAberto && <Text style={styles.addButton} onPress={abrirNovo}>+ Novo</Text>}
      </View>

      <FlatList keyboardShouldPersistTaps="handled"
        data={servicos}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          formAberto ? (
            <Card style={{ gap: spacing.sm, marginBottom: spacing.lg }}>
              <Text style={styles.formTitle}>{editandoId ? "Editar serviço" : "Novo serviço"}</Text>
              <TextInput
                value={campos.nome}
                onChangeText={(nome) => setCampos((c) => ({ ...c, nome }))}
                placeholder="Nome (ex: Lavagem completa)"
                placeholderTextColor={colors.inkMuted}
                style={styles.input}
              />
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <TextInput
                  value={campos.duracaoMinutos}
                  onChangeText={(duracaoMinutos) => setCampos((c) => ({ ...c, duracaoMinutos }))}
                  placeholder="Duração (min)"
                  placeholderTextColor={colors.inkMuted}
                  keyboardType="number-pad"
                  style={[styles.input, { flex: 1 }]}
                />
                <TextInput
                  value={campos.precoReais}
                  onChangeText={(precoReais) => setCampos((c) => ({ ...c, precoReais }))}
                  placeholder="Preço (R$) — carro hatch"
                  placeholderTextColor={colors.inkMuted}
                  keyboardType="decimal-pad"
                  style={[styles.input, { flex: 1 }]}
                />
              </View>
              <TextInput
                value={campos.descricao}
                onChangeText={(descricao) => setCampos((c) => ({ ...c, descricao }))}
                placeholder="Descrição (opcional)"
                placeholderTextColor={colors.inkMuted}
                style={styles.input}
              />
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
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
          !formAberto ? <Text style={styles.empty}>Nenhum serviço cadastrado ainda. Toque em "+ Novo".</Text> : null
        }
        renderItem={({ item }) => (
          <Card style={{ marginBottom: spacing.sm, gap: spacing.xs, opacity: item.ativo ? 1 : 0.5 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
              <View style={{ flex: 1, paddingRight: spacing.sm }}>
                <Text style={styles.name}>{item.nome}</Text>
                <Text style={styles.meta}>
                  {item.duracaoMinutos} min · {centavosParaReais(item.precoCentavos)}
                </Text>
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
    </KeyboardAvoid>
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
