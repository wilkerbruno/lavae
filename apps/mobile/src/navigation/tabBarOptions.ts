import { BottomTabNavigationOptions } from "@react-navigation/bottom-tabs";
import { colors } from "../theme/tokens";

// screenOptions compartilhado pelas 3 barras de abas (cliente, funcionário,
// dono) — visual escuro "lava jato" com o dourado de destaque na aba ativa.
export const tabBarScreenOptions: BottomTabNavigationOptions = {
  headerShown: false,
  tabBarActiveTintColor: colors.accent,
  tabBarInactiveTintColor: colors.inkMuted,
  tabBarStyle: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: 1,
  },
  tabBarLabelStyle: { fontSize: 11, fontWeight: "700" },
};
