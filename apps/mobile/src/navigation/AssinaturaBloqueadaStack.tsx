import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { MaisStackParamList } from "./MaisStack";
import { AssinaturaScreen } from "../screens/lavajato/AssinaturaScreen";
import { AssinaturaPagamentoScreen } from "../screens/lavajato/AssinaturaPagamentoScreen";
import { AssinaturaPagamentoPendenteScreen } from "../screens/lavajato/AssinaturaPagamentoPendenteScreen";
import { darkStackScreenOptions } from "./stackHeaderOptions";

// Espelha só o pedaço de MaisStack que AssinaturaScreen precisa pra pagar
// (Pix/cartão nativo, ver AssinaturaScreen.pagar) — usado quando o
// RootNavigator força o dono pra cá com a assinatura bloqueada (trial
// vencido, mensalidade pendente ou cancelada), fora das abas normais (onde
// mora a MaisStack de verdade, inacessível nesse estado).
//
// Antes disso, o RootNavigator renderizava <AssinaturaScreen /> solta, fora
// de qualquer Navigator — sem stack, `navigation` chegava `undefined` nela, e
// `navigation.navigate(...)` quebrava na hora de pagar (Pix: erro visível
// "Cannot read property 'navigate' of undefined"; cartão: fica sem `try/
// catch` em volta, o navigate quebra ANTES de qualquer coisa acontecer —
// dava a impressão de "não faz nada" ao tocar em pagar). Essa stack dedicada
// resolve isso dando um `navigation` de verdade pra ela, com só as 3 telas
// que esse fluxo bloqueado precisa.
const Stack = createNativeStackNavigator<MaisStackParamList>();

export function AssinaturaBloqueadaStack() {
  return (
    <Stack.Navigator screenOptions={{ ...darkStackScreenOptions, headerShown: false }}>
      <Stack.Screen name="Assinatura" component={AssinaturaScreen} />
      <Stack.Screen
        name="AssinaturaPagamento"
        component={AssinaturaPagamentoScreen}
        options={{ headerShown: true, title: "Pagamento" }}
      />
      <Stack.Screen
        name="AssinaturaPagamentoPendente"
        component={AssinaturaPagamentoPendenteScreen}
        options={{ headerShown: true, title: "Pagamento", gestureEnabled: false }}
      />
    </Stack.Navigator>
  );
}
