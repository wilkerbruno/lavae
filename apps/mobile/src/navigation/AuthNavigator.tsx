import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { LoginScreen } from "../screens/auth/LoginScreen";
import { RegistrarClienteScreen } from "../screens/auth/RegistrarClienteScreen";
import { RegistrarLavaJatoScreen } from "../screens/auth/RegistrarLavaJatoScreen";
import { darkStackScreenOptions } from "./stackHeaderOptions";

export type AuthStackParamList = {
  Login: undefined;
  RegistrarCliente: undefined;
  RegistrarLavaJato: undefined;
};

const Stack = createNativeStackNavigator<AuthStackParamList>();

// Pilha exibida enquanto ninguém está logado (ver RootNavigator).
export function AuthNavigator() {
  return (
    <Stack.Navigator screenOptions={{ ...darkStackScreenOptions, headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="RegistrarCliente" component={RegistrarClienteScreen} options={{ headerShown: true, title: "Criar conta" }} />
      <Stack.Screen
        name="RegistrarLavaJato"
        component={RegistrarLavaJatoScreen}
        options={{ headerShown: true, title: "Cadastrar lava jato" }}
      />
    </Stack.Navigator>
  );
}
