import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { LavaJatoDashboardScreen } from "../screens/lavajato/DashboardScreen";
import { LavaJatoAgendaStackNavigator } from "./AgendaStack";
import { LavaJatoFinanceiroScreen } from "../screens/lavajato/FinanceiroScreen";
import { MaisStackNavigator } from "./MaisStack";
import { tabBarScreenOptions } from "./tabBarOptions";

const Tab = createBottomTabNavigator();

// Navegação do papel LAVAJATO_ADMIN (dono): Início, Agenda, Financeiro e Mais
// (Mais reúne Serviços/Pacotes, Equipe, Localização e Assinatura do plano).
export function LavaJatoTabs() {
  return (
    <Tab.Navigator screenOptions={tabBarScreenOptions}>
      <Tab.Screen
        name="Início"
        component={LavaJatoDashboardScreen}
        options={{ tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? "home" : "home-outline"} size={size} color={color} /> }}
      />
      <Tab.Screen
        name="Agenda"
        component={LavaJatoAgendaStackNavigator}
        options={{ tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? "calendar" : "calendar-outline"} size={size} color={color} /> }}
      />
      <Tab.Screen
        name="Financeiro"
        component={LavaJatoFinanceiroScreen}
        options={{ tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? "cash" : "cash-outline"} size={size} color={color} /> }}
      />
      <Tab.Screen
        name="Mais"
        component={MaisStackNavigator}
        options={{ tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? "menu" : "menu-outline"} size={size} color={color} /> }}
      />
    </Tab.Navigator>
  );
}
