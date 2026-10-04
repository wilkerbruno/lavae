import { NativeStackNavigationOptions } from "@react-navigation/native-stack";
import { colors } from "../theme/tokens";

// screenOptions compartilhado por toda pilha (Stack.Navigator) do app — cabeçalho
// e fundo escuros, coerentes com o tema "lava jato" (por padrão o header nativo
// do React Navigation vem branco, o que destoava do resto do app escuro).
export const darkStackScreenOptions: NativeStackNavigationOptions = {
  headerStyle: { backgroundColor: colors.surface },
  headerTintColor: colors.ink,
  headerShadowVisible: false,
  contentStyle: { backgroundColor: colors.background },
};
