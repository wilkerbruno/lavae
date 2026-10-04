import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Modal, StyleSheet, Text, View } from "react-native";
import { StatusAssinatura } from "@lavajato-app/shared";
import { api } from "../api/client";
import { navigationRef } from "../navigation/navigationRef";
import { Button } from "./Button";
import { Card } from "./Card";
import { colors, spacing } from "../theme/tokens";

interface ResumoVencimento {
  status: StatusAssinatura | null;
  diasRestantes: number | null;
  vencendo: boolean;
}

// Pop-up de "sua assinatura está vencendo" — aparece toda vez que a pessoa
// entra no app (ou volta pro primeiro plano), enquanto a assinatura da
// lava jato estiver a poucos dias do vencimento (ver DIAS_AVISO_VENCIMENTO na
// API), mesmo padrão de checagem do PopupAvaliacaoPendente. Diferente
// daquele, esse NÃO tem "não mostrar de novo" — é intencional: o pedido foi
// "sempre que entrarem" aparecer, já que é um aviso que precisa de ação (pagar)
// antes que a equipe seja bloqueada.
//
// O botão "Renovar agora" só aparece pro LAVAJATO_ADMIN (só ele pode
// trocar/pagar o plano) e leva direto pra tela de Assinatura; o FUNCIONARIO
// só vê o aviso, sem ação possível por aqui.
export function PopupVencimentoAssinatura({ podeRenovar }: { podeRenovar: boolean }) {
  const [resumo, setResumo] = useState<ResumoVencimento | null>(null);
  const [aberto, setAberto] = useState(false);
  const verificando = useRef(false);

  const verificar = useCallback(async () => {
    if (verificando.current) return;
    verificando.current = true;
    try {
      const { data } = await api.get<ResumoVencimento>("/assinaturas/minha/resumo");
      setResumo(data);
      setAberto(data.vencendo);
    } catch {
      // Silencioso — se essa checagem falhar (ex: sem internet), o
      // AssinaturaGuard/tela de bloqueio ainda cobrem o caso real de bloqueio.
    } finally {
      verificando.current = false;
    }
  }, []);

  useEffect(() => {
    verificar();
    const assinatura = AppState.addEventListener("change", (proximoEstado) => {
      if (proximoEstado === "active") verificar();
    });
    return () => assinatura.remove();
  }, [verificar]);

  function renovarAgora() {
    setAberto(false);
    if (navigationRef.isReady()) {
      navigationRef.navigate("Mais", { screen: "Assinatura" });
    }
  }

  if (!resumo) return null;

  const dias = resumo.diasRestantes ?? 0;
  const textoDias = dias <= 0 ? "vence hoje" : dias === 1 ? "vence em 1 dia" : `vence em ${dias} dias`;

  return (
    <Modal visible={aberto} transparent animationType="fade" onRequestClose={() => setAberto(false)}>
      <View style={styles.overlay}>
        <Card style={styles.card}>
          <Text style={styles.titulo}>Sua assinatura está vencendo</Text>
          <Text style={styles.subtitulo}>
            {resumo.status === StatusAssinatura.TRIAL ? "Seu período de teste" : "Sua assinatura"} {textoDias}. Depois disso, o acesso
            de todos os funcionários é bloqueado até renovar.
          </Text>
          {podeRenovar && <Button label="Renovar agora" onPress={renovarAgora} />}
          <Button label="Fechar" onPress={() => setAberto(false)} variant="secondary" />
        </Card>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  card: { width: "100%", maxWidth: 360, gap: spacing.md, alignItems: "center" },
  titulo: { fontSize: 17, fontWeight: "800", color: colors.ink, textAlign: "center" },
  subtitulo: { fontSize: 13, color: colors.inkMuted, textAlign: "center", lineHeight: 19 },
});
