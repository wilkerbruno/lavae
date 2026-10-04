import React, { useEffect } from "react";
import { ActivityIndicator, Platform, View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { Papel, StatusAssinatura } from "@lavajato-app/shared";
import { useAuthStore } from "../store/authStore";
import { api } from "../api/client";
import { colors } from "../theme/tokens";
import { AuthNavigator } from "./AuthNavigator";
import { ClienteTabs } from "./ClienteTabs";
import { FuncionarioTabs } from "./FuncionarioTabs";
import { LavaJatoTabs } from "./LavaJatoTabs";
import { AcessoNaoSuportadoScreen } from "../screens/auth/AcessoNaoSuportadoScreen";
import { AssinaturaBloqueadaStack } from "./AssinaturaBloqueadaStack";
import { FuncionarioAssinaturaBloqueadaScreen } from "../screens/funcionario/AssinaturaBloqueadaScreen";
import { PopupVencimentoAssinatura } from "../components/PopupVencimentoAssinatura";
import { registrarPushToken } from "../utils/push";
import { navigationRef } from "./navigationRef";

// Papéis com uma stack mobile de verdade. O SAAS_ADMIN (administrador da
// plataforma) usa o painel web separado (apps/admin-web) e não entra aqui —
// ver `papelSuportado` abaixo, que cobre esse e qualquer outro papel futuro
// sem tela própria no celular.
const PAPEIS_COM_STACK_MOBILE = [Papel.CLIENTE, Papel.FUNCIONARIO, Papel.LAVAJATO_ADMIN] as const;

export function RootNavigator() {
  const { usuario, carregando, assinaturaBloqueada, restaurarSessao, logout, setAssinaturaBloqueada } = useAuthStore();

  useEffect(() => {
    restaurarSessao();
  }, [restaurarSessao]);

  // O dono (LAVAJATO_ADMIN) tem uma rota isenta do bloqueio (assinaturas/minha
  // — ver AssinaturaGuard/@PermitirAssinaturaBloqueada na API), então dá pra
  // checar o status de cara ao entrar, sem esperar alguma outra tela tomar um
  // 403 primeiro. O FUNCIONARIO não tem essa rota; pra ele, o interceptor do
  // axios (api/client.ts) é quem detecta o bloqueio, na primeira chamada que
  // fizer depois de vencer.
  useEffect(() => {
    if (usuario?.papel !== Papel.LAVAJATO_ADMIN) return;
    api
      .get<{ status: StatusAssinatura }>("/assinaturas/minha")
      .then((res) => {
        const emDia = res.data.status === StatusAssinatura.TRIAL || res.data.status === StatusAssinatura.ATIVA;
        setAssinaturaBloqueada(!emDia);
      })
      .catch(() => {});
  }, [usuario?.papel, usuario?.lavaJatoId, setAssinaturaBloqueada]);

  // Registra o token de push pra equipe (dono/funcionário) — hoje só usado
  // pelo aviso de assinatura vencendo (ver AssinaturasService.
  // verificarAvisosDeVencimento na API). Roda de novo a cada login/sessão
  // restaurada; registrarPushToken() já lida sozinho com permissão negada,
  // simulador, ou EAS ainda não configurado, devolvendo null nesses casos.
  useEffect(() => {
    if (usuario?.papel !== Papel.LAVAJATO_ADMIN && usuario?.papel !== Papel.FUNCIONARIO) return;
    // expo-notifications não dá push token nenhum na web (ver comentário em
    // registrarPushToken) — pular aqui evita pedir uma permissão de
    // notificação do navegador que não levaria a nada.
    if (Platform.OS === "web") return;
    registrarPushToken()
      .then((token) => {
        if (token) api.patch("/usuarios/meu-push-token", { pushToken: token }).catch(() => {});
      })
      .catch(() => {});
  }, [usuario?.papel, usuario?.id]);

  if (carregando) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  // Logado, mas com um papel sem tela no app mobile (ex.: SAAS_ADMIN): mostra
  // um aviso com botão de sair em vez de deixar a tela em branco/travada sem
  // nenhum jeito de voltar pro login a não ser reinstalando o app.
  const papelSemSuporteMobile = usuario && !PAPEIS_COM_STACK_MOBILE.includes(usuario.papel as any);

  // A versão WEB (Expo Web, ver package.json/app.json) atendia só o fluxo do
  // CLIENTE no começo — dono e funcionário usando o painel/agenda pelo
  // navegador (LavaJatoTabs/FuncionarioTabs) foi auditado e ajustado depois
  // (WebView, SecureStore e Alert.alert — que não existe de verdade no
  // react-native-web — todos com uma versão .web já testada, ver
  // WebViewCompat/secureStorage/alertaCompat). Uma exceção fica de fora por
  // enquanto: em ConectarMercadoPagoScreen, "Conectar com Mercado Pago" usa
  // um redirect de deep link (scheme "lavajatoapp://") que só existe no app
  // instalado — no navegador essa autorização específica ainda precisa ser
  // feita pelo Android (a tela avisa isso, ver lá).
  const mostrarPopupVencimento =
    !assinaturaBloqueada && (usuario?.papel === Papel.FUNCIONARIO || usuario?.papel === Papel.LAVAJATO_ADMIN);

  return (
    <NavigationContainer ref={navigationRef}>
      {!usuario && <AuthNavigator />}
      {papelSemSuporteMobile && <AcessoNaoSuportadoScreen onSair={logout} />}
      {usuario?.papel === Papel.CLIENTE && <ClienteTabs />}
      {usuario?.papel === Papel.FUNCIONARIO &&
        (assinaturaBloqueada ? <FuncionarioAssinaturaBloqueadaScreen onSair={logout} /> : <FuncionarioTabs />)}
      {usuario?.papel === Papel.LAVAJATO_ADMIN &&
        (assinaturaBloqueada ? <AssinaturaBloqueadaStack /> : <LavaJatoTabs />)}
      {mostrarPopupVencimento && <PopupVencimentoAssinatura podeRenovar={usuario?.papel === Papel.LAVAJATO_ADMIN} />}
    </NavigationContainer>
  );
}
