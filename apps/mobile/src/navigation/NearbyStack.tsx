import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { NearbyScreen } from "../screens/cliente/NearbyScreen";
import { LavaJatoDetailScreen } from "../screens/cliente/LavaJatoDetailScreen";
import { darkStackScreenOptions } from "./stackHeaderOptions";

export type NearbyStackParamList = {
  Nearby: undefined;
  LavaJatoDetail: { lavaJatoId: string; nome: string };
};

const Stack = createNativeStackNavigator<NearbyStackParamList>();

// Pilha da aba "Perto de você": lista de lava jatos próximas (por GPS) que
// empilha o detalhe/avaliação de um lava jato por cima.
export function NearbyStackNavigator() {
  return (
    <Stack.Navigator screenOptions={darkStackScreenOptions}>
      <Stack.Screen name="Nearby" component={NearbyScreen} options={{ title: "Perto de você" }} />
      <Stack.Screen
        name="LavaJatoDetail"
        component={LavaJatoDetailScreen}
        options={({ route }) => ({ title: route.params.nome })}
      />
    </Stack.Navigator>
  );
}
