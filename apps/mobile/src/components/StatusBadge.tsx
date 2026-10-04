import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { StatusAgendamento } from "@lavajato-app/shared";
import { colors, radius } from "../theme/tokens";

const CONFIG: Record<StatusAgendamento, { label: string; bg: string; fg: string }> = {
  [StatusAgendamento.PENDENTE]: { label: "Pendente", bg: colors.accentSoft, fg: colors.accent },
  [StatusAgendamento.CONFIRMADO]: { label: "Confirmado", bg: colors.accentSoft, fg: colors.accent },
  [StatusAgendamento.CONCLUIDO]: { label: "Concluído", bg: colors.surfaceAlt, fg: colors.inkMuted },
  [StatusAgendamento.CANCELADO]: { label: "Cancelado", bg: colors.dangerSoft, fg: colors.danger },
  [StatusAgendamento.NAO_COMPARECEU]: { label: "Não compareceu", bg: colors.dangerSoft, fg: colors.danger },
};

export function StatusBadge({ status }: { status: StatusAgendamento }) {
  const config = CONFIG[status];
  return (
    <View style={[styles.badge, { backgroundColor: config.bg }]}>
      <Text style={[styles.label, { color: config.fg }]}>{config.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    alignSelf: "flex-start",
  },
  label: {
    fontSize: 11,
    fontWeight: "700",
  },
});
