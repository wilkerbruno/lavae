import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { LavaJatoAgendaScreen } from "../screens/lavajato/AgendaScreen";
import { FuncionarioAgendaScreen } from "../screens/funcionario/AgendaScreen";
import { AgendarManualScreen } from "../screens/agendamentos/AgendarManualScreen";
import { darkStackScreenOptions } from "./stackHeaderOptions";

export type AgendaStackParamList = {
  Agenda: undefined;
  // Lançamento manual de um horário na agenda (cliente avulso ou já
  // cadastrado) — ver AgendarManualScreen/POST /agendamentos/manual.
  AgendarManual: undefined;
};

// Duas instâncias (uma por papel) porque cada uma usa a tela de Agenda certa
// como raiz, mas compartilham o mesmo tipo de rotas e a mesma tela de
// lançamento manual (que se adapta sozinha ao papel logado).
const LavaJatoStack = createNativeStackNavigator<AgendaStackParamList>();
const FuncionarioStack = createNativeStackNavigator<AgendaStackParamList>();

export function LavaJatoAgendaStackNavigator() {
  return (
    <LavaJatoStack.Navigator screenOptions={{ ...darkStackScreenOptions, headerShown: false }}>
      <LavaJatoStack.Screen name="Agenda" component={LavaJatoAgendaScreen} />
      <LavaJatoStack.Screen
        name="AgendarManual"
        component={AgendarManualScreen}
        options={{ headerShown: true, title: "Novo agendamento" }}
      />
    </LavaJatoStack.Navigator>
  );
}

export function FuncionarioAgendaStackNavigator() {
  return (
    <FuncionarioStack.Navigator screenOptions={{ ...darkStackScreenOptions, headerShown: false }}>
      <FuncionarioStack.Screen name="Agenda" component={FuncionarioAgendaScreen} />
      <FuncionarioStack.Screen
        name="AgendarManual"
        component={AgendarManualScreen}
        options={{ headerShown: true, title: "Novo agendamento" }}
      />
    </FuncionarioStack.Navigator>
  );
}
