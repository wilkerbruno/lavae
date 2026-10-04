import React, { useCallback, useState } from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { Agendamento, FuncionarioDetalhado, MetodoPagamento, StatusAgendamento, StatusPagamento } from "@lavajato-app/shared";
import { api } from "../../api/client";
import { Card } from "../../components/Card";
import { PriceTag } from "../../components/PriceTag";
import { StatusBadge } from "../../components/StatusBadge";
import { colors, radius, spacing } from "../../theme/tokens";
import { AgendaStackParamList } from "../../navigation/AgendaStack";
import { ligarPara } from "../../utils/telefone";
import { textoVeiculo } from "../../utils/porte";

type Props = NativeStackScreenProps<AgendaStackParamList, "Agenda">;

function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function somarDias(dataIso: string, dias: number): string {
  const data = new Date(`${dataIso}T00:00:00`);
  data.setDate(data.getDate() + dias);
  return data.toISOString().slice(0, 10);
}

function formatarDataExibicao(dataIso: string): string {
  if (dataIso === hojeIso()) return "Hoje";
  const [ano, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}/${ano}`;
}

// Agenda consolidada do lava jato — o dono pode navegar entre dias e filtrar
// por um funcionário específico (ambos aceitos pelo endpoint desde sempre,
// ver AgendamentosController.agendaLavaJato; só faltava esta tela usá-los).
export function LavaJatoAgendaScreen({ navigation }: Props) {
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [funcionarios, setFuncionarios] = useState<FuncionarioDetalhado[]>([]);
  const [data, setData] = useState(hojeIso());
  const [funcionarioId, setFuncionarioId] = useState<string | undefined>(undefined);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [agendaRes, funcionariosRes] = await Promise.all([
        api.get<Agendamento[]>("/agendamentos/agenda-lavaJato", { params: { data, funcionarioId } }),
        api.get<FuncionarioDetalhado[]>("/funcionarios"),
      ]);
      setAgendamentos(agendaRes.data);
      setFuncionarios(funcionariosRes.data);
    } finally {
      setCarregando(false);
    }
  }, [data, funcionarioId]);

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  async function marcarNaoCompareceu(id: string) {
    await api.patch(`/agendamentos/${id}/nao-compareceu`);
    carregar();
  }

  async function marcarComoPago(id: string) {
    await api.patch(`/agendamentos/${id}/confirmar-pagamento-dinheiro`);
    carregar();
  }

  // Faltava essa ação aqui (só existia na agenda do funcionário) — sem ela,
  // um agendamento visto só por aqui nunca virava CONCLUIDO, e por isso nunca
  // contava no financeiro do lava jato (ver FinanceiroService), mesmo tendo
  // sido atendido de verdade.
  async function concluir(id: string) {
    await api.patch(`/agendamentos/${id}/concluir`);
    carregar();
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Agenda da equipe</Text>
        <Text style={styles.addButton} onPress={() => navigation.navigate("AgendarManual")}>
          + Novo
        </Text>
      </View>

      <View style={styles.navData}>
        <Pressable onPress={() => setData((d) => somarDias(d, -1))} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.dataLabel}>{formatarDataExibicao(data)}</Text>
        <Pressable onPress={() => setData((d) => somarDias(d, 1))} hitSlop={8}>
          <Ionicons name="chevron-forward" size={22} color={colors.ink} />
        </Pressable>
        {data !== hojeIso() && (
          <Text style={styles.hojeButton} onPress={() => setData(hojeIso())}>
            Hoje
          </Text>
        )}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll} contentContainerStyle={styles.chips}>
        <Pressable style={[styles.chip, !funcionarioId && styles.chipAtivo]} onPress={() => setFuncionarioId(undefined)}>
          <Text style={[styles.chipLabel, !funcionarioId && styles.chipLabelAtivo]}>Todos</Text>
        </Pressable>
        {funcionarios.map((f) => (
          <Pressable
            key={f.id}
            style={[styles.chip, funcionarioId === f.id && styles.chipAtivo]}
            onPress={() => setFuncionarioId(f.id)}
          >
            <Text style={[styles.chipLabel, funcionarioId === f.id && styles.chipLabelAtivo]}>{f.usuario.nome}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <FlatList
        data={agendamentos}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshing={carregando}
        onRefresh={carregar}
        ListEmptyComponent={!carregando ? <Text style={styles.empty}>Nenhum agendamento neste dia.</Text> : null}
        renderItem={({ item }) => (
          <Card style={{ marginBottom: spacing.sm, gap: spacing.xs }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={styles.time}>{new Date(item.inicio).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</Text>
              <StatusBadge status={item.status} />
            </View>
            <Text style={styles.meta}>{item.servico?.nome ?? item.pacote?.nome ?? "Serviço"}</Text>
            {textoVeiculo(item) ? <Text style={styles.meta}>{textoVeiculo(item)}</Text> : null}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={styles.meta}>
                {item.cliente?.nome ?? item.clienteAvulsoNome ?? "Cliente"} · {item.funcionario?.usuario?.nome}
              </Text>
              {(item.cliente?.telefone ?? item.clienteAvulsoTelefone) && (
                <Pressable
                  style={styles.ligarCliente}
                  onPress={() => ligarPara(item.cliente?.telefone ?? item.clienteAvulsoTelefone)}
                >
                  <Ionicons name="call" size={13} color={colors.accent} />
                  <Text style={styles.ligarClienteTexto}>Ligar</Text>
                </Pressable>
              )}
            </View>
            {item.assinaturaPacoteId ? <Text style={styles.pacoteMensal}>Pacote mensal</Text> : null}
            {item.pagamento?.metodo === MetodoPagamento.DINHEIRO && item.pagamento.status === StatusPagamento.PENDENTE ? (
              <Text style={styles.dinheiroPendente}>Dinheiro — aguardando pagamento no local</Text>
            ) : null}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <PriceTag centavos={item.precoCentavos} />
              {item.status === StatusAgendamento.CONFIRMADO && (
                <View style={{ flexDirection: "row", gap: spacing.md }}>
                  <Text style={styles.naoCompareceu} onPress={() => marcarNaoCompareceu(item.id)}>
                    Não compareceu
                  </Text>
                  {item.pagamento?.metodo === MetodoPagamento.DINHEIRO && item.pagamento.status === StatusPagamento.PENDENTE ? (
                    <Text style={styles.marcarPago} onPress={() => marcarComoPago(item.id)}>
                      Marcar como pago
                    </Text>
                  ) : (
                    <Text style={styles.concluir} onPress={() => concluir(item.id)}>
                      Marcar concluído
                    </Text>
                  )}
                </View>
              )}
            </View>
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
  navData: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  dataLabel: { fontSize: 14, fontWeight: "700", color: colors.ink, minWidth: 72, textAlign: "center" },
  hojeButton: { color: colors.accent, fontWeight: "700", fontSize: 12, marginLeft: spacing.sm },
  chipsScroll: { flexGrow: 0, paddingLeft: spacing.xl },
  chips: { gap: spacing.sm, paddingRight: spacing.xl, paddingBottom: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  chipAtivo: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipLabel: { fontSize: 12, fontWeight: "700", color: colors.inkMuted },
  chipLabelAtivo: { color: colors.accentInk },
  list: { padding: spacing.xl },
  empty: { color: colors.inkMuted, fontSize: 13, textAlign: "center", marginTop: spacing.xxl },
  time: { fontWeight: "800", color: colors.ink },
  meta: { fontSize: 12, color: colors.inkMuted },
  naoCompareceu: { color: colors.danger, fontWeight: "700", fontSize: 12 },
  concluir: { color: colors.accent, fontWeight: "700", fontSize: 12 },
  pacoteMensal: { fontSize: 11, fontWeight: "700", color: colors.accent },
  dinheiroPendente: { fontSize: 11, fontWeight: "700", color: colors.danger },
  marcarPago: { color: colors.accent, fontWeight: "700", fontSize: 12 },
  ligarCliente: { flexDirection: "row", alignItems: "center", gap: 4 },
  ligarClienteTexto: { fontSize: 12, fontWeight: "700", color: colors.accent },
});
