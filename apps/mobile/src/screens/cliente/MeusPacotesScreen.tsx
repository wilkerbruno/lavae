import React, { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { AssinaturaPacoteCliente, centavosParaReais, StatusAssinaturaPacote } from "@lavajato-app/shared";
import { api } from "../../api/client";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { alertar } from "../../utils/alertaCompat";
import { colors, spacing } from "../../theme/tokens";
import { ProfileStackParamList } from "../../navigation/ProfileStack";

const LABEL_STATUS: Record<StatusAssinaturaPacote, string> = {
  PENDENTE: "Aguardando confirmação",
  ATIVA: "Ativa",
  INADIMPLENTE: "Pagamento pendente",
  CANCELADA: "Cancelada",
};

type Navigation = NativeStackNavigationProp<ProfileStackParamList, "MeusPacotes">;

// Assinaturas de pacote mensal do cliente (em qualquer lava jato) — mostra o
// status, quantas vezes já usou na semana e permite concluir/retomar o
// pagamento (se ficou pendente) ou cancelar. Ver PacotesMensaisService.
export function MeusPacotesScreen() {
  const navigation = useNavigation<Navigation>();
  const [assinaturas, setAssinaturas] = useState<AssinaturaPacoteCliente[] | null>(null);
  const [processandoId, setProcessandoId] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const { data } = await api.get<AssinaturaPacoteCliente[]>("/pacotes-mensais/minhas-assinaturas");
    setAssinaturas(data);
  }, []);

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  // Abre a tela de assinatura dentro do próprio app — se já tinha um
  // pagamento avulso (Pix/cartão) PENDENTE pra esse período, retoma direto
  // nele (pagamentoPendente); senão deixa o cliente escolher o método de
  // novo (ex: assinatura CANCELADA, ou renovação automática que nunca chegou
  // a ser autorizada — ver AssinarPacoteScreen).
  function autorizar(assinatura: AssinaturaPacoteCliente) {
    if (!assinatura.pacoteMensal) {
      alertar("Pacote não encontrado", "Esse pacote mensal pode ter sido removido pelo lava jato.");
      return;
    }
    navigation.navigate("AssinarPacote", {
      lavaJatoId: assinatura.lavaJatoId,
      pacoteMensalId: assinatura.pacoteMensalId,
      pacoteNome: assinatura.pacoteMensal.nome,
      precoCentavos: assinatura.pacoteMensal.precoCentavos,
      veiculoId: assinatura.veiculoId,
      pagamentoPendente: assinatura.pagamentoPendente ?? undefined,
    });
  }

  function cancelar(assinatura: AssinaturaPacoteCliente) {
    alertar("Cancelar assinatura?", "Você perde acesso à cota do pacote — pode assinar de novo quando quiser.", [
      { text: "Voltar", style: "cancel" },
      {
        text: "Cancelar assinatura",
        style: "destructive",
        onPress: async () => {
          setProcessandoId(assinatura.id);
          try {
            await api.patch(`/pacotes-mensais/assinaturas/${assinatura.id}/cancelar`);
            carregar();
          } finally {
            setProcessandoId(null);
          }
        },
      },
    ]);
  }

  if (!assinaturas) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <FlatList
        data={assinaturas}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>
            Você ainda não assinou nenhum pacote mensal — dá pra assinar direto na página do lava jato.
          </Text>
        }
        renderItem={({ item }) => {
          const pacote = item.pacoteMensal;
          const processando = processandoId === item.id;
          return (
            <Card style={{ gap: spacing.sm, marginBottom: spacing.sm }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.nome}>{pacote?.nome ?? "Pacote mensal"}</Text>
                  {item.veiculo && (
                    <Text style={styles.meta}>
                      {[item.veiculo.marca, item.veiculo.modelo].filter(Boolean).join(" ")} · {item.veiculo.placa}
                    </Text>
                  )}
                </View>
                <Text style={[styles.status, item.status === StatusAssinaturaPacote.ATIVA && { color: colors.success }]}>
                  {LABEL_STATUS[item.status]}
                </Text>
              </View>

              {item.status === StatusAssinaturaPacote.ATIVA && pacote && (
                <Text style={styles.meta}>
                  Uso essa semana: {item.usosNaSemana ?? 0} de {pacote.vezesPorSemana}
                </Text>
              )}
              {item.status === StatusAssinaturaPacote.ATIVA && (
                <Text style={styles.meta}>
                  {item.renovacaoAutomatica ? "Renovação automática no cartão" : "Renovação manual"}
                  {item.proximaCobrancaEm && ` · próxima cobrança: ${new Date(item.proximaCobrancaEm).toLocaleDateString("pt-BR")}`}
                </Text>
              )}

              {(item.status === StatusAssinaturaPacote.PENDENTE || item.status === StatusAssinaturaPacote.INADIMPLENTE) && (
                <Button
                  label={item.pagamentoPendente ? "Continuar pagamento" : item.status === StatusAssinaturaPacote.PENDENTE ? "Concluir assinatura" : "Regularizar pagamento"}
                  onPress={() => autorizar(item)}
                />
              )}
              {item.status === StatusAssinaturaPacote.CANCELADA && (
                <Button label="Assinar de novo" variant="secondary" onPress={() => autorizar(item)} />
              )}
              {item.status === StatusAssinaturaPacote.ATIVA && (
                <Text style={[styles.cancelarLink, processando && { opacity: 0.5 }]} onPress={() => !processando && cancelar(item)}>
                  Cancelar assinatura
                </Text>
              )}
            </Card>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" },
  list: { padding: spacing.xl },
  empty: { color: colors.inkMuted, fontSize: 13, textAlign: "center", marginTop: spacing.xxl },
  nome: { fontSize: 15, fontWeight: "800", color: colors.ink },
  meta: { fontSize: 12, color: colors.inkMuted },
  status: { fontSize: 12, fontWeight: "700", color: colors.inkMuted },
  cancelarLink: { color: colors.danger, fontWeight: "700", fontSize: 12, textAlign: "center", marginTop: spacing.xs },
});
