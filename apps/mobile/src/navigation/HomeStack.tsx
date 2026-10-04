import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { LavaJatoProxima, ItemAgendamentoLote, Pagamento } from "@lavajato-app/shared";
import { HomeScreen } from "../screens/cliente/HomeScreen";
import { MapScreen } from "../screens/cliente/MapScreen";
import { LavaJatoDetailScreen } from "../screens/cliente/LavaJatoDetailScreen";
import { BookingScreen } from "../screens/cliente/BookingScreen";
import { CartaoScreen } from "../screens/cliente/CartaoScreen";
import { PagamentoScreen } from "../screens/cliente/PagamentoScreen";
import { AssinarPacoteScreen, AssinarPacoteParams } from "../screens/cliente/AssinarPacoteScreen";
import { darkStackScreenOptions } from "./stackHeaderOptions";

// Um item pré-selecionado na tela do lava jato (serviço OU pacote) que chega
// pronto pra tela de Agendar, pulando direto pra escolha de dia/horário.
export type ItemPreSelecionado = { servicoId?: string } | { pacoteId?: string };

export type HomeStackParamList = {
  // Lista de lava jatos perto do cliente (com busca por nome) — tela inicial.
  Home: undefined;
  // Mesmas lava jatos da Home, num mapa — recebe a lista já carregada lá pra
  // não precisar pedir localização/buscar de novo.
  Map: { lavaJatos: LavaJatoProxima[]; minhaLat: number; minhaLng: number };
  // Detalhe de um lava jato: serviços/pacotes pra agendar + avaliações.
  LavaJatoDetail: { lavaJatoId: string; nome: string };
  Agendar: { lavaJatoId: string; nome: string; itensPreSelecionados?: ItemPreSelecionado[] };
  // Formulário nativo de cartão — só entra aqui quando o cliente escolhe
  // "Cartão" em Agendar; tokeniza e cobra na hora (ver CartaoScreen), sem
  // sair do app. Pix e "usar pacote mensal" vão direto pra Pagamento.
  Cartao: { lavaJatoId: string; veiculoId: string; inicio: string; itens: ItemAgendamentoLote[]; valorCentavos: number };
  // Cobrança (Pix/Cartão) gerada ao confirmar o agendamento — ver
  // AgendamentosService.criarLote/AgendamentoLoteCriado.
  Pagamento: { pagamento: Pagamento; aviso: string };
  // Assinar um pacote mensal — entra aqui a partir de LavaJatoDetailScreen
  // (também registrada em ProfileStack, a partir de MeusPacotesScreen, ver
  // comentário em AssinarPacoteScreen).
  AssinarPacote: AssinarPacoteParams;
};

const Stack = createNativeStackNavigator<HomeStackParamList>();

// Pilha da aba "Início": lista (ou mapa) de lava jatos → detalhe (serviços +
// avaliações) → agendamento, mantendo a barra de abas escondida durante o fluxo.
export function HomeStackNavigator() {
  return (
    <Stack.Navigator screenOptions={{ ...darkStackScreenOptions, headerShown: false }}>
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen name="Map" component={MapScreen} options={{ headerShown: true, title: "Mapa" }} />
      <Stack.Screen
        name="LavaJatoDetail"
        component={LavaJatoDetailScreen}
        options={({ route }) => ({ headerShown: true, title: route.params.nome })}
      />
      <Stack.Screen name="Agendar" component={BookingScreen} options={{ headerShown: true, title: "Agendar horário" }} />
      <Stack.Screen
        name="Cartao"
        component={CartaoScreen}
        options={{ headerShown: true, title: "Pagar com cartão", gestureEnabled: false }}
      />
      <Stack.Screen
        name="Pagamento"
        component={PagamentoScreen}
        options={{ headerShown: true, title: "Pagamento", gestureEnabled: false }}
      />
      <Stack.Screen
        name="AssinarPacote"
        component={AssinarPacoteScreen as any}
        options={{ headerShown: true, title: "Assinar pacote", gestureEnabled: false }}
      />
    </Stack.Navigator>
  );
}
