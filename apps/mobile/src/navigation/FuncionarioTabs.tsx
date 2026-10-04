import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { FuncionarioAgendaStackNavigator } from "./AgendaStack";
import { FuncionarioFinanceiroScreen } from "../screens/funcionario/FinanceiroScreen";
import { FuncionarioHorariosScreen } from "../screens/funcionario/HorariosScreen";
import { FuncionarioPerfilStackNavigator } from "./FuncionarioPerfilStack";
import { tabBarScreenOptions } from "./tabBarOptions";

const Tab = createBottomTabNavigator();

// Navegação do papel FUNCIONARIO: Agenda, Horários, Financeiro e Perfil.
export function FuncionarioTabs() {
  return (
    <Tab.Navigator screenOptions={tabBarScreenOptions}>
      <Tab.Screen
        name="Agenda"
        component={FuncionarioAgendaStackNavigator}
        options={{ tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? "calendar" : "calendar-outline"} size={size} color={color} /> }}
      />
      <Tab.Screen
        name="Horários"
        component={FuncionarioHorariosScreen}
        options={{ tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? "time" : "time-outline"} size={size} color={color} /> }}
      />
      <Tab.Screen
        name="Financeiro"
        component={FuncionarioFinanceiroScreen}
        options={{ tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? "cash" : "cash-outline"} size={size} color={color} /> }}
      />
      <Tab.Screen
        name="Perfil"
        component={FuncionarioPerfilStackNavigator}
        options={{ tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? "person" : "person-outline"} size={size} color={color} /> }}
      />
    </Tab.Navigator>
  );
}
