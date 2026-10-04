import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { HomeStackNavigator } from "./HomeStack";
import { BookingsScreen } from "../screens/cliente/BookingsScreen";
import { ProfileStackNavigator } from "./ProfileStack";
import { PopupAvaliacaoPendente } from "../components/PopupAvaliacaoPendente";
import { colors } from "../theme/tokens";
import { tabBarScreenOptions } from "./tabBarOptions";

const Tab = createBottomTabNavigator();

// Navegação do papel CLIENTE: Início (lista de lava jatos perto dele, com
// busca, já entrando no fluxo de agendamento), Agendamentos e Perfil.
// PopupAvaliacaoPendente fica aqui (fora do Tab.Navigator, por cima de
// qualquer aba) porque precisa poder aparecer em qualquer lugar do app do
// cliente, não só numa tela específica — ver o componente pra detalhes de
// quando ele decide se mostrar.
export function ClienteTabs() {
  return (
    <>
      <Tab.Navigator screenOptions={tabBarScreenOptions}>
        <Tab.Screen
          name="Início"
          component={HomeStackNavigator}
          options={{ tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? "home" : "home-outline"} size={size} color={color} /> }}
        />
        <Tab.Screen
          name="Agendamentos"
          component={BookingsScreen}
          options={{ tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? "calendar" : "calendar-outline"} size={size} color={color} /> }}
        />
        <Tab.Screen
          name="Perfil"
          component={ProfileStackNavigator}
          options={{ tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? "person" : "person-outline"} size={size} color={color} /> }}
        />
      </Tab.Navigator>
      <PopupAvaliacaoPendente />
    </>
  );
}
