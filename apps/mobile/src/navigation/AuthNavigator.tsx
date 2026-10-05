import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { LoginScreen } from "../screens/auth/LoginScreen";
import { RegistrarClienteScreen } from "../screens/auth/RegistrarClienteScreen";
import { RegistrarLavaJatoScreen } from "../screens/auth/RegistrarLavaJatoScreen";
import { EsqueciSenhaScreen } from "../screens/auth/EsqueciSenhaScreen";
import { CodigoSenhaScreen } from "../screens/auth/CodigoSenhaScreen";
import { NovaSenhaScreen } from "../screens/auth/NovaSenhaScreen";
import { darkStackScreenOptions } from "./stackHeaderOptions";

export type AuthStackParamList = {
  Login: { senhaRedefinida?: boolean } | undefined;
  EsqueciSenha: undefined;
  CodigoSenha: { email: string };
  NovaSenha: { token: string };
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
      <Stack.Screen name="EsqueciSenha" component={EsqueciSenhaScreen} options={{ headerShown: true, title: "Recuperar senha" }} />
      <Stack.Screen name="CodigoSenha" component={CodigoSenhaScreen} options={{ headerShown: true, title: "Código" }} />
      <Stack.Screen name="NovaSenha" component={NovaSenhaScreen} options={{ headerShown: true, title: "Nova senha", headerBackVisible: false }} />
    </Stack.Navigator>
  );
}
