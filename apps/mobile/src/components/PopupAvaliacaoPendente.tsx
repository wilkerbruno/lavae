import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Modal, StyleSheet, Text, TextInput, View } from "react-native";
import * as secureStorage from "../utils/secureStorage";
import { AvaliacaoPendente } from "@lavajato-app/shared";
import { api } from "../api/client";
import { Button } from "./Button";
import { Card } from "./Card";
import { StarRating } from "./StarRating";
import { colors, radius, spacing } from "../theme/tokens";
import { KeyboardAvoid } from "./KeyboardAvoid";

const CHAVE_DISPENSADAS = "lavajato_app_avaliacoes_dispensadas";

// Popup de avaliação pós-atendimento: aparece sozinho — sem o cliente
// precisar lembrar de ir na tela do lava jato — assim que o horário de algum
// agendamento dele já tiver passado e ele ainda não avaliou aquela lava jato
// (ver GET /lavajatos/avaliacao-pendente, que já filtra isso no servidor
// usando o horário de FIM do agendamento). Ex.: agendou 17:30 com serviço de
// 30min → a partir das 18:00 esse popup já pode aparecer.
//
// Como o app não fica sempre aberto no exato minuto em que o horário termina,
// a checagem roda: (1) assim que esse componente monta (login/abrir o app) e
// (2) toda vez que o app volta pro primeiro plano (AppState "active") — ou
// seja, se o cliente não estava no app quando o horário passou, o popup
// aparece assim que ele abrir o app de novo, exatamente como pedido.
//
// "Fechar"/"Agora não" guarda o id do lava jato numa lista local (SecureStore,
// só nesse aparelho) pra não insistir de novo — o cliente já viu e decidiu não
// avaliar agora. Isso não afeta o botão "Agendar horário" nem a avaliação
// continuar disponível manualmente na tela do lava jato (LavaJatoDetailScreen) —
// só evita repetir o popup indefinidamente depois de um "fechar" explícito.
export function PopupAvaliacaoPendente() {
  const [pendente, setPendente] = useState<AvaliacaoPendente | null>(null);
  const [nota, setNota] = useState(0);
  const [comentario, setComentario] = useState("");
  const [enviando, setEnviando] = useState(false);
  const verificando = useRef(false);

  const verificar = useCallback(async () => {
    if (verificando.current) return;
    verificando.current = true;
    try {
      const { data } = await api.get<AvaliacaoPendente | null>("/lavajatos/avaliacao-pendente");
      if (!data) return;
      const dispensadasJson = await secureStorage.getItem(CHAVE_DISPENSADAS);
      const dispensadas: string[] = dispensadasJson ? JSON.parse(dispensadasJson) : [];
      if (dispensadas.includes(data.lavaJatoId)) return;
      setNota(0);
      setComentario("");
      setPendente(data);
    } catch {
      // Silencioso de propósito — isso é só um lembrete a mais; se falhar
      // (ex: sem internet no momento), o cliente ainda consegue avaliar
      // manualmente na tela do lava jato, e a checagem tenta de novo na
      // próxima vez que o app voltar ao primeiro plano.
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

  async function fechar() {
    if (pendente) {
      const dispensadasJson = await secureStorage.getItem(CHAVE_DISPENSADAS);
      const dispensadas: string[] = dispensadasJson ? JSON.parse(dispensadasJson) : [];
      if (!dispensadas.includes(pendente.lavaJatoId)) {
        await secureStorage.setItem(CHAVE_DISPENSADAS, JSON.stringify([...dispensadas, pendente.lavaJatoId]));
      }
    }
    setPendente(null);
  }

  async function enviar() {
    if (!pendente || nota === 0) return;
    setEnviando(true);
    try {
      await api.post(`/lavajatos/${pendente.lavaJatoId}/avaliacoes`, {
        nota,
        comentario: comentario || undefined,
      });
      setPendente(null);
    } catch {
      // Se falhar o envio, deixa o popup aberto pra tentar de novo — não
      // marca como dispensado (diferente de "fechar", que é uma decisão
      // explícita do cliente).
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal visible={!!pendente} transparent animationType="fade" onRequestClose={fechar}>
      <KeyboardAvoid style={styles.overlay}>
        <Card style={styles.card}>
          <Text style={styles.titulo}>Como foi seu atendimento?</Text>
          {pendente && <Text style={styles.subtitulo}>{pendente.nome}</Text>}
          <StarRating value={nota} onChange={setNota} size={32} />
          <TextInput
            value={comentario}
            onChangeText={setComentario}
            placeholder="Conte como foi (opcional)"
            placeholderTextColor={colors.inkMuted}
            style={styles.input}
            multiline
          />
          <Button label="Enviar avaliação" onPress={enviar} loading={enviando} disabled={nota === 0} />
          <Button label="Agora não" onPress={fechar} variant="secondary" />
        </Card>
      </KeyboardAvoid>
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
  subtitulo: { fontSize: 13, color: colors.inkMuted, textAlign: "center", marginTop: -spacing.sm },
  input: {
    width: "100%",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 13,
    color: colors.ink,
    minHeight: 60,
    textAlignVertical: "top",
  },
});
