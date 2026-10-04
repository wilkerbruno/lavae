import React, { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { alertar } from "../../utils/alertaCompat";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { Folga, HorarioTrabalho } from "@lavajato-app/shared";
import { api } from "../../api/client";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { colors, radius, spacing } from "../../theme/tokens";

const FORMATO_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const FORMATO_DATA = /^\d{4}-\d{2}-\d{2}$/;

const DIAS_SEMANA = [
  { diaSemana: 0, label: "Domingo" },
  { diaSemana: 1, label: "Segunda-feira" },
  { diaSemana: 2, label: "Terça-feira" },
  { diaSemana: 3, label: "Quarta-feira" },
  { diaSemana: 4, label: "Quinta-feira" },
  { diaSemana: 5, label: "Sexta-feira" },
  { diaSemana: 6, label: "Sábado" },
];

interface DiaEstado {
  diaSemana: number;
  label: string;
  ativo: boolean;
  horaInicio: string;
  horaFim: string;
  temAlmoco: boolean;
  inicioAlmoco: string;
  fimAlmoco: string;
}

function diasIniciais(): DiaEstado[] {
  return DIAS_SEMANA.map((d) => ({
    ...d,
    ativo: false,
    horaInicio: "09:00",
    horaFim: "19:00",
    temAlmoco: true,
    inicioAlmoco: "12:00",
    fimAlmoco: "13:00",
  }));
}

const FOLGA_VAZIA = { dataInicio: "", horaInicio: "08:00", dataFim: "", horaFim: "18:00", motivo: "" };

// O funcionário organiza a própria agenda aqui: em que dias da semana trabalha
// (com horário de início/fim e almoço), e bloqueios pontuais extras (folga,
// consulta etc). É essa informação que o AgendamentosService usa pra calcular
// os dias/horários disponíveis mostrados ao cliente — sem isso cadastrado, a
// agenda do funcionário aparece sempre vazia pro cliente.
export function FuncionarioHorariosScreen() {
  const [dias, setDias] = useState<DiaEstado[]>(diasIniciais());
  const [salvandoHorarios, setSalvandoHorarios] = useState(false);
  const [folgas, setFolgas] = useState<Folga[]>([]);
  const [formFolgaAberto, setFormFolgaAberto] = useState(false);
  const [novaFolga, setNovaFolga] = useState(FOLGA_VAZIA);
  const [salvandoFolga, setSalvandoFolga] = useState(false);

  const carregar = useCallback(async () => {
    const [horariosRes, folgasRes] = await Promise.all([
      api.get<HorarioTrabalho[]>("/funcionarios/meus-horarios"),
      api.get<Folga[]>("/funcionarios/minhas-folgas"),
    ]);
    setDias((atual) =>
      atual.map((dia) => {
        const salvo = horariosRes.data.find((h) => h.diaSemana === dia.diaSemana);
        if (!salvo) return { ...dia, ativo: false };
        return {
          ...dia,
          ativo: true,
          horaInicio: salvo.horaInicio,
          horaFim: salvo.horaFim,
          temAlmoco: !!(salvo.inicioAlmoco && salvo.fimAlmoco),
          inicioAlmoco: salvo.inicioAlmoco ?? dia.inicioAlmoco,
          fimAlmoco: salvo.fimAlmoco ?? dia.fimAlmoco,
        };
      }),
    );
    setFolgas(folgasRes.data);
  }, []);

  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [carregar]),
  );

  function atualizarDia(diaSemana: number, patch: Partial<DiaEstado>) {
    setDias((atual) => atual.map((d) => (d.diaSemana === diaSemana ? { ...d, ...patch } : d)));
  }

  async function salvarHorarios() {
    const ativos = dias.filter((d) => d.ativo);

    for (const dia of ativos) {
      if (!FORMATO_HORA.test(dia.horaInicio) || !FORMATO_HORA.test(dia.horaFim)) {
        return alertar("Horário inválido", `Digite os horários de ${dia.label} no formato HH:mm (ex: 08:00).`);
      }
      if (dia.horaFim <= dia.horaInicio) {
        return alertar("Horário inválido", `Em ${dia.label}, o horário final precisa ser depois do inicial.`);
      }
      if (dia.temAlmoco) {
        if (!FORMATO_HORA.test(dia.inicioAlmoco) || !FORMATO_HORA.test(dia.fimAlmoco)) {
          return alertar("Horário de almoço inválido", `Digite o almoço de ${dia.label} no formato HH:mm.`);
        }
        if (dia.inicioAlmoco < dia.horaInicio || dia.fimAlmoco > dia.horaFim || dia.fimAlmoco <= dia.inicioAlmoco) {
          return alertar("Horário de almoço inválido", `O almoço de ${dia.label} precisa estar dentro do expediente.`);
        }
      }
    }

    const dto = {
      dias: ativos.map((d) => ({
        diaSemana: d.diaSemana,
        horaInicio: d.horaInicio,
        horaFim: d.horaFim,
        inicioAlmoco: d.temAlmoco ? d.inicioAlmoco : undefined,
        fimAlmoco: d.temAlmoco ? d.fimAlmoco : undefined,
      })),
    };

    setSalvandoHorarios(true);
    try {
      await api.post("/funcionarios/meus-horarios", dto);
      alertar("Horários salvos", "Sua agenda semanal foi atualizada.");
    } catch (e: any) {
      alertar("Não foi possível salvar", e?.response?.data?.message ?? "Tente de novo.");
    } finally {
      setSalvandoHorarios(false);
    }
  }

  function abrirNovaFolga() {
    const hoje = new Date().toISOString().slice(0, 10);
    setNovaFolga({ ...FOLGA_VAZIA, dataInicio: hoje, dataFim: hoje });
    setFormFolgaAberto(true);
  }

  async function salvarFolga() {
    if (!FORMATO_DATA.test(novaFolga.dataInicio) || !FORMATO_DATA.test(novaFolga.dataFim)) {
      return alertar("Data inválida", "Digite as datas no formato AAAA-MM-DD (ex: 2026-09-15).");
    }
    if (!FORMATO_HORA.test(novaFolga.horaInicio) || !FORMATO_HORA.test(novaFolga.horaFim)) {
      return alertar("Horário inválido", "Digite os horários no formato HH:mm.");
    }

    // Offset fixo do horário de Brasília: mesma abordagem do agendamento do
    // cliente, evita depender do fuso configurado no aparelho.
    const inicio = `${novaFolga.dataInicio}T${novaFolga.horaInicio}:00-03:00`;
    const fim = `${novaFolga.dataFim}T${novaFolga.horaFim}:00-03:00`;
    if (new Date(fim) <= new Date(inicio)) {
      return alertar("Período inválido", "O fim da folga precisa ser depois do início.");
    }

    setSalvandoFolga(true);
    try {
      await api.post("/funcionarios/minhas-folgas", { inicio, fim, motivo: novaFolga.motivo.trim() || undefined });
      setFormFolgaAberto(false);
      carregar();
    } catch (e: any) {
      alertar("Não foi possível salvar", e?.response?.data?.message ?? "Tente de novo.");
    } finally {
      setSalvandoFolga(false);
    }
  }

  async function removerFolga(id: string) {
    try {
      await api.delete(`/funcionarios/minhas-folgas/${id}`);
      carregar();
    } catch (e: any) {
      alertar("Não foi possível remover", e?.response?.data?.message ?? "Tente de novo.");
    }
  }

  function formatarPeriodo(folga: Folga) {
    const inicio = new Date(folga.inicio);
    const fim = new Date(folga.fim);
    const opcoes: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" };
    return `${inicio.toLocaleString("pt-BR", opcoes)} até ${fim.toLocaleString("pt-BR", opcoes)}`;
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Meus horários</Text>
        <Text style={styles.subtitle}>
          Escolha os dias em que você trabalha e seu horário. É isso que aparece pro cliente marcar um horário.
        </Text>

        <View style={{ gap: spacing.sm }}>
          {dias.map((dia) => (
            <Card key={dia.diaSemana} style={{ gap: spacing.sm }}>
              <View style={styles.diaHeader}>
                <Pressable
                  style={styles.checkboxLinha}
                  onPress={() => atualizarDia(dia.diaSemana, { ativo: !dia.ativo })}
                >
                  <Ionicons
                    name={dia.ativo ? "checkbox" : "square-outline"}
                    size={20}
                    color={dia.ativo ? colors.accent : colors.inkMuted}
                  />
                  <Text style={styles.diaLabel}>{dia.label}</Text>
                </Pressable>
              </View>

              {dia.ativo && (
                <View style={{ gap: spacing.sm }}>
                  <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "center" }}>
                    <Text style={styles.campoLabel}>Das</Text>
                    <TextInput
                      value={dia.horaInicio}
                      onChangeText={(v) => atualizarDia(dia.diaSemana, { horaInicio: v })}
                      placeholder="08:00"
                      placeholderTextColor={colors.inkMuted}
                      style={[styles.input, { flex: 1 }]}
                    />
                    <Text style={styles.campoLabel}>às</Text>
                    <TextInput
                      value={dia.horaFim}
                      onChangeText={(v) => atualizarDia(dia.diaSemana, { horaFim: v })}
                      placeholder="20:00"
                      placeholderTextColor={colors.inkMuted}
                      style={[styles.input, { flex: 1 }]}
                    />
                  </View>

                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={styles.campoLabel}>Almoço</Text>
                    <Switch
                      value={dia.temAlmoco}
                      onValueChange={(v) => atualizarDia(dia.diaSemana, { temAlmoco: v })}
                      trackColor={{ false: colors.border, true: colors.accentSoft }}
                      thumbColor={dia.temAlmoco ? colors.accent : colors.inkMuted}
                    />
                  </View>

                  {dia.temAlmoco && (
                    <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "center" }}>
                      <Text style={styles.campoLabel}>Das</Text>
                      <TextInput
                        value={dia.inicioAlmoco}
                        onChangeText={(v) => atualizarDia(dia.diaSemana, { inicioAlmoco: v })}
                        placeholder="12:00"
                        placeholderTextColor={colors.inkMuted}
                        style={[styles.input, { flex: 1 }]}
                      />
                      <Text style={styles.campoLabel}>às</Text>
                      <TextInput
                        value={dia.fimAlmoco}
                        onChangeText={(v) => atualizarDia(dia.diaSemana, { fimAlmoco: v })}
                        placeholder="13:00"
                        placeholderTextColor={colors.inkMuted}
                        style={[styles.input, { flex: 1 }]}
                      />
                    </View>
                  )}
                </View>
              )}
            </Card>
          ))}
        </View>

        <Button label="Salvar horários" onPress={salvarHorarios} loading={salvandoHorarios} />

        <View style={styles.secaoFolgas}>
          <View style={styles.header}>
            <Text style={styles.title}>Folgas e bloqueios</Text>
            {!formFolgaAberto && <Text style={styles.addButton} onPress={abrirNovaFolga}>+ Nova</Text>}
          </View>
          <Text style={styles.subtitle}>
            Use aqui pra bloquear um período específico além do seu expediente normal (folga, consulta, férias etc).
          </Text>

          {formFolgaAberto && (
            <Card style={{ gap: spacing.sm, marginTop: spacing.sm }}>
              <Text style={styles.campoLabel}>Início</Text>
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <TextInput
                  value={novaFolga.dataInicio}
                  onChangeText={(v) => setNovaFolga((f) => ({ ...f, dataInicio: v }))}
                  placeholder="AAAA-MM-DD"
                  placeholderTextColor={colors.inkMuted}
                  style={[styles.input, { flex: 1 }]}
                />
                <TextInput
                  value={novaFolga.horaInicio}
                  onChangeText={(v) => setNovaFolga((f) => ({ ...f, horaInicio: v }))}
                  placeholder="HH:mm"
                  placeholderTextColor={colors.inkMuted}
                  style={[styles.input, { width: 80 }]}
                />
              </View>
              <Text style={styles.campoLabel}>Fim</Text>
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <TextInput
                  value={novaFolga.dataFim}
                  onChangeText={(v) => setNovaFolga((f) => ({ ...f, dataFim: v }))}
                  placeholder="AAAA-MM-DD"
                  placeholderTextColor={colors.inkMuted}
                  style={[styles.input, { flex: 1 }]}
                />
                <TextInput
                  value={novaFolga.horaFim}
                  onChangeText={(v) => setNovaFolga((f) => ({ ...f, horaFim: v }))}
                  placeholder="HH:mm"
                  placeholderTextColor={colors.inkMuted}
                  style={[styles.input, { width: 80 }]}
                />
              </View>
              <TextInput
                value={novaFolga.motivo}
                onChangeText={(v) => setNovaFolga((f) => ({ ...f, motivo: v }))}
                placeholder="Motivo (opcional)"
                placeholderTextColor={colors.inkMuted}
                style={styles.input}
              />
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <Button label="Cancelar" variant="secondary" onPress={() => setFormFolgaAberto(false)} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button label="Salvar" onPress={salvarFolga} loading={salvandoFolga} />
                </View>
              </View>
            </Card>
          )}

          {folgas.length === 0 && !formFolgaAberto ? (
            <Text style={styles.empty}>Nenhuma folga cadastrada.</Text>
          ) : (
            <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
              {folgas.map((folga) => (
                <Card key={folga.id} style={{ gap: spacing.xs }}>
                  <Text style={styles.name}>{formatarPeriodo(folga)}</Text>
                  {folga.motivo ? <Text style={styles.meta}>{folga.motivo}</Text> : null}
                  <Text style={styles.acaoSecundaria} onPress={() => removerFolga(folga.id)}>
                    Remover
                  </Text>
                </Card>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, gap: spacing.lg },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 20, fontWeight: "800", color: colors.ink },
  subtitle: { fontSize: 12, color: colors.inkMuted, marginTop: -spacing.sm },
  addButton: { color: colors.accent, fontWeight: "700" },
  secaoFolgas: { gap: spacing.sm, marginTop: spacing.md },
  diaHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  checkboxLinha: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  diaLabel: { fontSize: 14, fontWeight: "700", color: colors.ink },
  campoLabel: { fontSize: 12, color: colors.inkMuted, fontWeight: "700" },
  name: { fontWeight: "700", color: colors.ink, fontSize: 14 },
  meta: { fontSize: 12, color: colors.inkMuted, marginTop: 2 },
  acaoSecundaria: { color: colors.danger, fontWeight: "700", fontSize: 12, marginTop: 2 },
  empty: { color: colors.inkMuted, fontSize: 13, textAlign: "center", marginTop: spacing.lg },
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
