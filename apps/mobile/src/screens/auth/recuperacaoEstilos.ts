import { StyleSheet } from "react-native";
import { colors, radius, spacing } from "../../theme/tokens";

export const estilosRecuperacao = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, padding: spacing.xl, justifyContent: "center", gap: spacing.md },
  title: { fontSize: 24, fontWeight: "800", color: colors.ink },
  subtitle: { fontSize: 13, color: colors.inkMuted, marginBottom: spacing.lg, lineHeight: 19 },
  field: { gap: spacing.xs },
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
  codigo: { textAlign: "center", fontSize: 28, fontWeight: "800", letterSpacing: 10 },
  erro: { color: colors.danger, fontSize: 13 },
  info: { color: colors.inkMuted, fontSize: 13, textAlign: "center" },
  link: { textAlign: "center", fontSize: 13, color: colors.accent, fontWeight: "600", marginTop: spacing.sm },
});
