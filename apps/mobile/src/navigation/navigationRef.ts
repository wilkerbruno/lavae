import { createNavigationContainerRef } from "@react-navigation/native";

// Ref global de navegação — permite navegar de fora da árvore de telas (ex:
// o pop-up de assinatura vencendo, montado direto no RootNavigator como
// irmão das tabs, sem acesso ao `navigation` de nenhuma tela específica).
//
// `any` aqui porque o projeto não declara um RootParamList global tipado pro
// react-navigation (as tabs de cada papel são navigators separados, sem uma
// árvore de rotas única) — sem isso, `navigate()` cai em `never` e nenhuma
// chamada tipa. Mesma solução pragmática já usada em RootNavigator.tsx.
export const navigationRef = createNavigationContainerRef<any>();
