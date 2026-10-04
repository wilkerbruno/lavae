import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ProfileScreen } from "../screens/cliente/ProfileScreen";
import { MeusPacotesScreen } from "../screens/cliente/MeusPacotesScreen";
import { MeusVeiculosScreen } from "../screens/cliente/MeusVeiculosScreen";
import { EditarPerfilScreen } from "../screens/cliente/EditarPerfilScreen";
import { SuporteScreen } from "../screens/shared/SuporteScreen";
import { AssinarPacoteScreen, AssinarPacoteParams } from "../screens/cliente/AssinarPacoteScreen";
import { darkStackScreenOptions } from "./stackHeaderOptions";

export type ProfileStackParamList = {
  Perfil: undefined;
  // Assinaturas de pacote mensal do cliente (ver PacotesMensaisService).
  MeusPacotes: undefined;
  // Veículos do cliente (placa, modelo, porte) — o porte define o valor dos serviços.
  MeusVeiculos: undefined;
  EditarPerfil: undefined;
  Suporte: undefined;
  // Mesma tela registrada em HomeStack (a partir de LavaJatoDetailScreen) —
  // aqui entra a partir de MeusPacotesScreen, retomando uma assinatura
  // PENDENTE pra terminar de pagar (ver comentário em AssinarPacoteScreen).
  AssinarPacote: AssinarPacoteParams;
};

const Stack = createNativeStackNavigator<ProfileStackParamList>();

export function ProfileStackNavigator() {
  return (
    <Stack.Navigator screenOptions={{ ...darkStackScreenOptions, headerShown: false }}>
      <Stack.Screen name="Perfil" component={ProfileScreen} />
      <Stack.Screen name="MeusPacotes" component={MeusPacotesScreen} options={{ headerShown: true, title: "Meus pacotes" }} />
      <Stack.Screen name="MeusVeiculos" component={MeusVeiculosScreen} options={{ headerShown: true, title: "Meus veículos" }} />
      <Stack.Screen name="EditarPerfil" component={EditarPerfilScreen} options={{ headerShown: true, title: "Editar perfil" }} />
      <Stack.Screen name="Suporte" component={SuporteScreen} options={{ headerShown: true, title: "Suporte" }} />
      <Stack.Screen
        name="AssinarPacote"
        component={AssinarPacoteScreen as any}
        options={{ headerShown: true, title: "Assinar pacote", gestureEnabled: false }}
      />
    </Stack.Navigator>
  );
}
