import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { alertar } from "../../utils/alertaCompat";
import { SafeAreaView } from "react-native-safe-area-context";
import { Calendar } from "react-native-calendars";
import { Ionicons } from "@expo/vector-icons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import {
  centavosParaReais,
  FuncionarioDetalhado,
  LavaJatoPublica,
  MetodoPagamento,
  Pacote,
  Papel,
  PORTES_VEICULO,
  PorteVeiculo,
  ROTULO_PORTE,
  Servico,
  normalizarPlaca,
} from "@lavajato-app/shared";
import { api } from "../../api/client";
import { useAuthStore } from "../../store/authStore";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { ajustesDoLavaJato, valoresParaPorte } from "../../utils/porte";
import { colors, radius, spacing } from "../../theme/tokens";
import { AgendaStackParamList } from "../../navigation/AgendaStack";
import { KeyboardAvoid } from "../../components/KeyboardAvoid";

type Props = NativeStackScreenProps<AgendaStackParamList, "AgendarManual">;

const HOJE = new Date();
const HOJE_ISO = formatarDataLocal(HOJE);
const LIMITE_DIAS_FUTUROS = 60;

const FORMAS_PAGAMENTO: Array<{ valor: MetodoPagamento; label: string }> = [
  { valor: MetodoPagamento.DINHEIRO, label: "Dinheiro" },
  { valor: MetodoPagamento.PIX, label: "Pix" },
  { valor: MetodoPagamento.CARTAO, label: "Cartão" },
];

function duracaoDoPacote(pacote: Pacote): number {
  return pacote.servicos.reduce((total, ps) => total + ps.servico.duracaoMinutos, 0) || 30;
}

// Tela de lançamento manual de agendamento (dono ou o próprio funcionário) —
// pra cliente que ligou/chegou sem usar o app. Se adapta ao papel logado: o
// funcionário lança direto na própria agenda; o dono escolhe em qual
// funcionário lançar. Não passa por cobrança pelo app (ver
// AgendamentosService.criarManual) — quem cobra, se cobrar, é o lava jato
// por fora (dinheiro, maquininha etc).
export function AgendarManualScreen({ navigation }: Props) {
  const usuario = useAuthStore((s) => s.usuario);
  const lavaJatoId = usuario?.lavaJatoId ?? undefined;
  const souFuncionario = usuario?.papel === Papel.FUNCIONARIO;

  const [funcionarios, setFuncionarios] = useState<FuncionarioDetalhado[]>([]);
  const [funcionarioId, setFuncionarioId] = useState<string | undefined>();
  const [carregandoFuncionario, setCarregandoFuncionario] = useState(true);

  // Veículo atendido: o porte define preço e duração (ver precoParaPorte no
  // pacote shared); placa e descrição são opcionais e só aparecem na agenda.
  const [porte, setPorte] = useState<PorteVeiculo>(PorteVeiculo.HATCH);
  const [veiculoPlaca, setVeiculoPlaca] = useState("");
  const [veiculoDescricao, setVeiculoDescricao] = useState("");
  const [ajustes, setAjustes] = useState(() => ajustesDoLavaJato(null));

  const [servicos, setServicos] = useState<Servico[]>([]);
  const [pacotes, setPacotes] = useState<Pacote[]>([]);
  const [quantidades, setQuantidades] = useState<Record<string, number>>({});
  const [quantidadesPacotes, setQuantidadesPacotes] = useState<Record<string, number>>({});

  const [diaSelecionado, setDiaSelecionado] = useState<string | undefined>();
  const [horarios, setHorarios] = useState<string[]>([]);
  const [carregandoHorarios, setCarregandoHorarios] = useState(false);
  const [horarioSelecionado, setHorarioSelecionado] = useState<string | undefined>();

  const [clienteNome, setClienteNome] = useState("");
  const [clienteTelefone, setClienteTelefone] = useState("");
  // Como o lava jato recebeu por fora (não passa pelo Mercado Pago da
  // integração) — alimenta os cards de Pix/Cartão/Dinheiro no Financeiro (ver
  // AgendamentosService.criarManual e FinanceiroService). Dinheiro é o mais
  // comum nesse fluxo, por isso o default.
  const [metodoPagamento, setMetodoPagamento] = useState<MetodoPagamento>(MetodoPagamento.DINHEIRO);
  const [enviando, setEnviando] = useState(false);

  // Quem sou eu pra lançar: funcionário lança na própria agenda; dono escolhe
  // entre a equipe ativa/disponível.
  useEffect(() => {
    if (souFuncionario) {
      api
        .get<{ id: string }>("/funcionarios/meu-id")
        .then(({ data }) => setFuncionarioId(data.id))
        .finally(() => setCarregandoFuncionario(false));
    } else {
      api
        .get<FuncionarioDetalhado[]>("/funcionarios")
        .then(({ data }) => setFuncionarios(data.filter((f) => f.ativo && f.disponivel)))
        .finally(() => setCarregandoFuncionario(false));
    }
  }, [souFuncionario]);

  useEffect(() => {
    if (!lavaJatoId) return;
    Promise.all([
      api.get<Servico[]>(`/lavajatos/${lavaJatoId}/servicos`),
      api.get<Pacote[]>(`/lavajatos/${lavaJatoId}/pacotes`),
    ]).then(([servicosRes, pacotesRes]) => {
      setServicos(servicosRes.data.filter((s) => s.ativo));
      setPacotes(pacotesRes.data.filter((p) => p.ativo));
    });
    api
      .get<LavaJatoPublica>(`/lavajatos/${lavaJatoId}/publico`)
      .then(({ data }) => setAjustes(ajustesDoLavaJato(data)))
      .catch(() => {});
  }, [lavaJatoId]);

  function escolherPorte(p: PorteVeiculo) {
    setPorte(p);
    // A duração muda com o porte — dia/horário escolhidos antes podem não caber mais.
    setDiaSelecionado(undefined);
    setHorarioSelecionado(undefined);
  }

  const itensSelecionados = useMemo(() => {
    const doServicos = servicos
      .filter((s) => (quantidades[s.id] ?? 0) > 0)
      .map((s) => ({
        tipo: "servico" as const,
        id: s.id,
        nome: s.nome,
        ...valoresParaPorte(s.precoCentavos, s.duracaoMinutos, porte, ajustes),
        quantidade: quantidades[s.id],
      }));
    const doPacotes = pacotes
      .filter((p) => (quantidadesPacotes[p.id] ?? 0) > 0)
      .map((p) => ({
        tipo: "pacote" as const,
        id: p.id,
        nome: p.nome,
        ...valoresParaPorte(p.precoCentavos, duracaoDoPacote(p), porte, ajustes),
        quantidade: quantidadesPacotes[p.id],
      }));
    return [...doServicos, ...doPacotes];
  }, [servicos, pacotes, quantidades, quantidadesPacotes, porte, ajustes]);
  const duracaoTotalMinutos = itensSelecionados.reduce((total, item) => total + item.duracaoMinutos * item.quantidade, 0);
  const precoTotalCentavos = itensSelecionados.reduce((total, item) => total + item.precoCentavos * item.quantidade, 0);

  function alterarQuantidade(servicoId: string, delta: number) {
    setQuantidades((atual) => ({ ...atual, [servicoId]: Math.max(0, (atual[servicoId] ?? 0) + delta) }));
    setDiaSelecionado(undefined);
    setHorarioSelecionado(undefined);
  }

  function alterarQuantidadePacote(pacoteId: string, delta: number) {
    setQuantidadesPacotes((atual) => ({ ...atual, [pacoteId]: Math.max(0, (atual[pacoteId] ?? 0) + delta) }));
    setDiaSelecionado(undefined);
    setHorarioSelecionado(undefined);
  }

  // Horários livres pro funcionário escolhido nesse dia — usa o mesmo endpoint
  // do app do cliente (ver BookingScreen), só que já filtrado por
  // funcionarioId (não deixa o servidor escolher sozinho).
  useEffect(() => {
    if (!diaSelecionado || !funcionarioId || duracaoTotalMinutos === 0 || !lavaJatoId) {
      setHorarios([]);
      return;
    }
    let cancelado = false;
    setCarregandoHorarios(true);
    setHorarioSelecionado(undefined);
    api
      .get<string[]>(`/lavajatos/${lavaJatoId}/horarios-disponiveis`, {
        params: { data: diaSelecionado, duracaoMinutos: duracaoTotalMinutos, funcionarioId },
      })
      .then(({ data }) => !cancelado && setHorarios(data))
      .finally(() => !cancelado && setCarregandoHorarios(false));
    return () => {
      cancelado = true;
    };
  }, [lavaJatoId, funcionarioId, diaSelecionado, duracaoTotalMinutos]);

  const markedDates = useMemo(() => {
    const marcado: Record<string, any> = {};
    if (diaSelecionado) {
      marcado[diaSelecionado] = { selected: true, selectedColor: colors.accent, selectedTextColor: colors.accentInk };
    }
    return marcado;
  }, [diaSelecionado]);

  async function confirmar() {
    if (!funcionarioId || !diaSelecionado || !horarioSelecionado || itensSelecionados.length === 0) return;
    if (!clienteNome.trim()) {
      alertar("Falta o nome do cliente", "Digite ao menos o nome de quem vai ser atendido.");
      return;
    }
    setEnviando(true);
    try {
      const inicio = `${diaSelecionado}T${horarioSelecionado}:00-03:00`;
      const itens = itensSelecionados.flatMap((item) =>
        Array.from({ length: item.quantidade }, () =>
          item.tipo === "servico" ? { servicoId: item.id } : { pacoteId: item.id },
        ),
      );
      await api.post("/agendamentos/manual", {
        funcionarioId,
        inicio,
        itens,
        porte,
        veiculoPlaca: veiculoPlaca ? normalizarPlaca(veiculoPlaca) : undefined,
        veiculoDescricao: veiculoDescricao.trim() || undefined,
        clienteAvulsoNome: clienteNome.trim(),
        clienteAvulsoTelefone: clienteTelefone.trim() || undefined,
        metodoPagamento,
      });
      alertar("Agendamento lançado!", "Já aparece na agenda.");
      navigation.goBack();
    } catch (e: any) {
      alertar("Não foi possível lançar", e?.response?.data?.message ?? "Tente outro horário.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <KeyboardAvoid>
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        {!souFuncionario && (
          <>
            <Text style={styles.sectionTitle}>Profissional</Text>
            {carregandoFuncionario ? (
              <Text style={styles.hint}>Carregando equipe…</Text>
            ) : funcionarios.length === 0 ? (
              <Text style={styles.hint}>Nenhum funcionário ativo/disponível cadastrado.</Text>
            ) : (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
                {funcionarios.map((f) => {
                  const selecionado = f.id === funcionarioId;
                  return (
                    <Pressable
                      key={f.id}
                      onPress={() => {
                        setFuncionarioId(f.id);
                        setDiaSelecionado(undefined);
                        setHorarioSelecionado(undefined);
                      }}
                    >
                      <View style={[styles.horarioChip, selecionado && styles.horarioChipSelecionado]}>
                        <Text style={[styles.horarioTexto, selecionado && styles.horarioTextoSelecionado]}>{f.usuario.nome}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </>
        )}

        <Text style={styles.sectionTitle}>Veículo</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {PORTES_VEICULO.map((p) => {
            const selecionado = p === porte;
            return (
              <Pressable key={p} onPress={() => escolherPorte(p)}>
                <View style={[styles.horarioChip, selecionado && styles.horarioChipSelecionado]}>
                  <Text style={[styles.horarioTexto, selecionado && styles.horarioTextoSelecionado]}>{ROTULO_PORTE[p]}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
        <Card style={{ gap: spacing.sm }}>
          <TextInput
            value={veiculoPlaca}
            onChangeText={(t) => setVeiculoPlaca(normalizarPlaca(t).slice(0, 7))}
            placeholder="Placa (opcional)"
            placeholderTextColor={colors.inkMuted}
            autoCapitalize="characters"
            autoCorrect={false}
            style={styles.input}
          />
          <TextInput
            value={veiculoDescricao}
            onChangeText={setVeiculoDescricao}
            placeholder="Modelo / cor (ex: Gol branco)"
            placeholderTextColor={colors.inkMuted}
            style={styles.input}
          />
        </Card>

        <Text style={styles.sectionTitle}>Serviços</Text>
        <View style={{ gap: spacing.sm }}>
          {servicos.map((s) => {
            const valores = valoresParaPorte(s.precoCentavos, s.duracaoMinutos, porte, ajustes);
            const quantidade = quantidades[s.id] ?? 0;
            return (
              <Card key={s.id} style={styles.servicoLinha}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemNome}>{s.nome}</Text>
                  <Text style={styles.itemMeta}>
                    {valores.duracaoMinutos} min · {centavosParaReais(valores.precoCentavos)}
                  </Text>
                </View>
                <View style={styles.stepper}>
                  <Pressable onPress={() => alterarQuantidade(s.id, -1)} disabled={quantidade === 0} hitSlop={8}>
                    <Ionicons name="remove-circle" size={26} color={quantidade === 0 ? colors.border : colors.accent} />
                  </Pressable>
                  <Text style={styles.stepperValor}>{quantidade}</Text>
                  <Pressable onPress={() => alterarQuantidade(s.id, 1)} hitSlop={8}>
                    <Ionicons name="add-circle" size={26} color={colors.accent} />
                  </Pressable>
                </View>
              </Card>
            );
          })}
        </View>

        {pacotes.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Pacotes</Text>
            <View style={{ gap: spacing.sm }}>
              {pacotes.map((p) => {
                const quantidade = quantidadesPacotes[p.id] ?? 0;
                const valores = valoresParaPorte(p.precoCentavos, duracaoDoPacote(p), porte, ajustes);
                return (
                  <Card key={p.id} style={styles.servicoLinha}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemNome}>{p.nome}</Text>
                      <Text style={styles.itemMeta}>
                        {valores.duracaoMinutos} min · {centavosParaReais(valores.precoCentavos)}
                      </Text>
                    </View>
                    <View style={styles.stepper}>
                      <Pressable onPress={() => alterarQuantidadePacote(p.id, -1)} disabled={quantidade === 0} hitSlop={8}>
                        <Ionicons name="remove-circle" size={26} color={quantidade === 0 ? colors.border : colors.accent} />
                      </Pressable>
                      <Text style={styles.stepperValor}>{quantidade}</Text>
                      <Pressable onPress={() => alterarQuantidadePacote(p.id, 1)} hitSlop={8}>
                        <Ionicons name="add-circle" size={26} color={colors.accent} />
                      </Pressable>
                    </View>
                  </Card>
                );
              })}
            </View>
          </>
        )}

        {itensSelecionados.length > 0 && (
          <Card style={styles.resumoCard}>
            <Text style={styles.resumoTexto}>~{duracaoTotalMinutos} min</Text>
            <Text style={styles.resumoValor}>{centavosParaReais(precoTotalCentavos)}</Text>
          </Card>
        )}

        {itensSelecionados.length > 0 && funcionarioId && (
          <>
            <Text style={styles.sectionTitle}>Dia</Text>
            <View style={styles.calendarioWrapper}>
              <Calendar
                current={HOJE_ISO}
                minDate={HOJE_ISO}
                maxDate={formatarDataLocal(new Date(HOJE.getTime() + LIMITE_DIAS_FUTUROS * 86_400_000))}
                onDayPress={(d: { dateString: string }) => setDiaSelecionado(d.dateString)}
                markedDates={markedDates}
                theme={calendarTheme}
              />
            </View>
          </>
        )}

        {diaSelecionado && (
          <>
            <Text style={styles.sectionTitle}>Horários disponíveis</Text>
            {carregandoHorarios ? (
              <Text style={styles.hint}>Carregando horários…</Text>
            ) : horarios.length === 0 ? (
              <Text style={styles.hint}>Nenhum horário livre nesse dia. Escolha outro dia.</Text>
            ) : (
              <View style={styles.horariosGrid}>
                {horarios.map((h) => {
                  const selecionado = h === horarioSelecionado;
                  return (
                    <Pressable key={h} onPress={() => setHorarioSelecionado(h)}>
                      <View style={[styles.horarioChip, selecionado && styles.horarioChipSelecionado]}>
                        <Text style={[styles.horarioTexto, selecionado && styles.horarioTextoSelecionado]}>{h}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </>
        )}

        {horarioSelecionado && (
          <>
            <Text style={styles.sectionTitle}>Cliente</Text>
            <Card style={{ gap: spacing.sm }}>
              <TextInput
                value={clienteNome}
                onChangeText={setClienteNome}
                placeholder="Nome do cliente"
                placeholderTextColor={colors.inkMuted}
                style={styles.input}
              />
              <TextInput
                value={clienteTelefone}
                onChangeText={setClienteTelefone}
                placeholder="Telefone (opcional)"
                placeholderTextColor={colors.inkMuted}
                keyboardType="phone-pad"
                style={styles.input}
              />
            </Card>

            <Text style={styles.sectionTitle}>Forma de pagamento</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
              {FORMAS_PAGAMENTO.map((forma) => {
                const selecionado = forma.valor === metodoPagamento;
                return (
                  <Pressable key={forma.valor} onPress={() => setMetodoPagamento(forma.valor)}>
                    <View style={[styles.horarioChip, selecionado && styles.horarioChipSelecionado]}>
                      <Text style={[styles.horarioTexto, selecionado && styles.horarioTextoSelecionado]}>{forma.label}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            <Button label="Lançar agendamento" onPress={confirmar} loading={enviando} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
    </KeyboardAvoid>
  );
}

const calendarTheme = {
  backgroundColor: colors.background,
  calendarBackground: colors.surface,
  textSectionTitleColor: colors.inkMuted,
  selectedDayBackgroundColor: colors.accent,
  selectedDayTextColor: colors.accentInk,
  todayTextColor: colors.accent,
  dayTextColor: colors.ink,
  textDisabledColor: colors.border,
  arrowColor: colors.accent,
  monthTextColor: colors.ink,
  indicatorColor: colors.accent,
  textDayFontWeight: "600" as const,
  textMonthFontWeight: "800" as const,
  textDayHeaderFontWeight: "700" as const,
};

function formatarDataLocal(data: Date): string {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxl },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.inkMuted,
    textTransform: "uppercase",
    marginTop: spacing.md,
  },
  hint: { fontSize: 12, color: colors.inkMuted },
  servicoLinha: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  itemNome: { fontSize: 14, fontWeight: "700", color: colors.ink },
  itemMeta: { fontSize: 12, color: colors.inkMuted, marginTop: 2 },
  stepper: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  stepperValor: { fontSize: 15, fontWeight: "800", color: colors.ink, minWidth: 16, textAlign: "center" },
  resumoCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  resumoTexto: { fontSize: 13, fontWeight: "700", color: colors.accent },
  resumoValor: { fontSize: 16, fontWeight: "800", color: colors.accent },
  calendarioWrapper: { borderRadius: radius.lg, overflow: "hidden", borderWidth: 1, borderColor: colors.border },
  horariosGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  horarioChip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  horarioChipSelecionado: { backgroundColor: colors.accent, borderColor: colors.accent },
  horarioTexto: { fontSize: 13, fontWeight: "700", color: colors.ink },
  horarioTextoSelecionado: { color: colors.accentInk },
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
