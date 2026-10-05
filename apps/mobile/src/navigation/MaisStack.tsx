import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { PagamentoAssinatura, PeriodicidadeAssinatura } from "@lavajato-app/shared";
import { MaisScreen } from "../screens/lavajato/MaisScreen";
import { ServicosScreen } from "../screens/lavajato/ServicosScreen";
import { PacotesScreen } from "../screens/lavajato/PacotesScreen";
import { PacotesMensaisScreen } from "../screens/lavajato/PacotesMensaisScreen";
import { PrecoPorteScreen } from "../screens/lavajato/PrecoPorteScreen";
import { EquipeScreen } from "../screens/lavajato/EquipeScreen";
import { FuncionarioHorariosScreen } from "../screens/lavajato/FuncionarioHorariosScreen";
import { AssinaturaScreen } from "../screens/lavajato/AssinaturaScreen";
import { AssinaturaPagamentoScreen } from "../screens/lavajato/AssinaturaPagamentoScreen";
import { AssinaturaPagamentoPendenteScreen } from "../screens/lavajato/AssinaturaPagamentoPendenteScreen";
import { LocalizacaoScreen } from "../screens/lavajato/LocalizacaoScreen";
import { LogoScreen } from "../screens/lavajato/LogoScreen";
import { QrCodeScreen } from "../screens/lavajato/QrCodeScreen";
import { ConectarMercadoPagoScreen } from "../screens/lavajato/ConectarMercadoPagoScreen";
import { EditarPerfilScreen } from "../screens/lavajato/EditarPerfilScreen";

import { SuporteScreen } from "../screens/shared/SuporteScreen";
import { darkStackScreenOptions } from "./stackHeaderOptions";

export type MaisStackParamList = {
  Mais: undefined;
  Servicos: undefined;
  Pacotes: undefined;
  PacotesMensais: undefined;
  // Percentual de preço/tempo por porte do veículo (ver PrecoPorteScreen).
  PrecoPorte: undefined;
  Equipe: undefined;
  // Edição pelo dono do lava jato dos horários/folgas de um funcionário
  // específico da equipe (ver FuncionarioHorariosScreen).
  FuncionarioHorarios: { funcionarioId: string; nome: string };
  Assinatura: undefined;
  // "Cartão" na tela de Assinatura — tokeniza e cobra a mensalidade/anuidade
  // do SaaS na hora (ver AssinaturaPagamentoScreen), sem sair do app. Pix vai
  // direto pra AssinaturaPagamentoPendente.
  AssinaturaPagamento: { planoId: string; nomePlano: string; periodicidade: PeriodicidadeAssinatura; valorCentavos: number };
  AssinaturaPagamentoPendente: { pagamento: PagamentoAssinatura };
  Localizacao: undefined;
  Logo: undefined;
  // Cartaz com QR Code pra imprimir e deixar no lava jato (ver QrCodeScreen).
  QrCode: undefined;
  MercadoPago: undefined;
  EditarPerfil: undefined;

  Suporte: undefined;
};

const Stack = createNativeStackNavigator<MaisStackParamList>();

export function MaisStackNavigator() {
  return (
    <Stack.Navigator screenOptions={{ ...darkStackScreenOptions, headerShown: false }}>
      <Stack.Screen name="Mais" component={MaisScreen} />
      <Stack.Screen name="Servicos" component={ServicosScreen} options={{ headerShown: true, title: "Serviços" }} />
      <Stack.Screen name="Pacotes" component={PacotesScreen} options={{ headerShown: true, title: "Pacotes" }} />
      <Stack.Screen
        name="PacotesMensais"
        component={PacotesMensaisScreen}
        options={{ headerShown: true, title: "Pacotes mensais" }}
      />
      <Stack.Screen name="PrecoPorte" component={PrecoPorteScreen} options={{ headerShown: true, title: "Preço por porte" }} />
      <Stack.Screen name="Equipe" component={EquipeScreen} options={{ headerShown: true, title: "Equipe" }} />
      <Stack.Screen
        name="FuncionarioHorarios"
        component={FuncionarioHorariosScreen}
        options={{ headerShown: true, title: "Horários" }}
      />
      <Stack.Screen name="Assinatura" component={AssinaturaScreen} options={{ headerShown: true, title: "Assinatura" }} />
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
      <Stack.Screen name="Localizacao" component={LocalizacaoScreen} options={{ headerShown: true, title: "Localização" }} />
      <Stack.Screen name="Logo" component={LogoScreen} options={{ headerShown: true, title: "Logo do lava jato" }} />
      <Stack.Screen name="QrCode" component={QrCodeScreen} options={{ headerShown: true, title: "QR Code para imprimir" }} />
      <Stack.Screen name="MercadoPago" component={ConectarMercadoPagoScreen} options={{ headerShown: true, title: "Mercado Pago" }} />
      <Stack.Screen name="EditarPerfil" component={EditarPerfilScreen} options={{ headerShown: true, title: "Editar perfil" }} />

      <Stack.Screen name="Suporte" component={SuporteScreen} options={{ headerShown: true, title: "Suporte" }} />
    </Stack.Navigator>
  );
}
