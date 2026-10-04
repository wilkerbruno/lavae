import { Alert, AlertButton } from "react-native";

// Par nativo de alertaCompat.web.ts (ver comentário lá) — no nativo o
// Alert.alert de verdade já funciona perfeitamente, então isso só repassa.
export function alertar(titulo: string, mensagem?: string, botoes?: AlertButton[]) {
  Alert.alert(titulo, mensagem, botoes);
}
