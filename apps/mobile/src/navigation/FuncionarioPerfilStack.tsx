import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { FuncionarioPerfilScreen } from "../screens/funcionario/PerfilScreen";
import { EditarPerfilScreen } from "../screens/funcionario/EditarPerfilScreen";
import { SuporteScreen } from "../screens/shared/SuporteScreen";
import { darkStackScreenOptions } from "./stackHeaderOptions";

// Antes a aba "Perfil" do funcionário era a tela direto, sem stack — precisou
// virar stack só pra abrigar "Suporte" (ver FuncionarioTabs, que agora usa
// esse navigator em vez de FuncionarioPerfilScreen).
export type FuncionarioPerfilStackParamList = {
  Perfil: undefined;
  EditarPerfil: undefined;
  Suporte: undefined;
};

const Stack = createNativeStackNavigator<FuncionarioPerfilStackParamList>();

export function FuncionarioPerfilStackNavigator() {
  return (
    <Stack.Navigator screenOptions={{ ...darkStackScreenOptions, headerShown: false }}>
      <Stack.Screen name="Perfil" component={FuncionarioPerfilScreen} />
      <Stack.Screen name="EditarPerfil" component={EditarPerfilScreen} options={{ headerShown: true, title: "Editar perfil" }} />
      <Stack.Screen name="Suporte" component={SuporteScreen} options={{ headerShown: true, title: "Suporte" }} />
    </Stack.Navigator>
  );
}
