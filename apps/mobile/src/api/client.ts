import axios from "axios";
import { Platform } from "react-native";
import { useAuthStore } from "../store/authStore";

// Em desenvolvimento com o Expo Go num celular físico, troque "localhost" pelo
// IP da sua máquina na rede local (ex: http://192.168.0.10:3000/api).
// No emulador Android, "localhost" não chega no host — use 10.0.2.2.
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000/api";

// `withCredentials` faz o navegador mandar/aceitar o cookie httpOnly de
// sessão (ver authStore.ts e API: auth/jwt.strategy.ts) — só existe no Web;
// no nativo o axios roda sobre outra camada de rede que não tem conceito de
// cookie de navegador, então deixar isso ligado lá não faz nada (e dá pra
// deixar de fora sem perda nenhuma).
export const api = axios.create({ baseURL: API_URL, withCredentials: Platform.OS === "web" });

// Injeta o token JWT salvo no authStore em toda requisição autenticada.
// Só no nativo: no Web a autenticação vai inteira pelo cookie httpOnly
// (automático via withCredentials acima) — o token nem fica acessível aqui
// nesse caso (ver authStore.ts "entrar"/"restaurarSessao" web), então não
// tem o que anexar.
api.interceptors.request.use((config) => {
  if (Platform.OS === "web") return config;
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Se o token expirar/for inválido, desloga automaticamente. Se a API recusar
// por assinatura bloqueada (ver AssinaturaGuard na API), marca isso no
// authStore — é o que faz o RootNavigator tirar FUNCIONARIO/LAVAJATO_ADMIN
// das telas normais na hora, sem cada tela precisar tratar esse erro.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      useAuthStore.getState().logout();
    } else if (error?.response?.data?.code === "ASSINATURA_BLOQUEADA") {
      useAuthStore.getState().setAssinaturaBloqueada(true);
    }
    return Promise.reject(error);
  },
);

// Extrai uma mensagem de erro útil de qualquer falha do axios, pra mostrar em
// Alert.alert — em vez de um fallback genérico tipo "Tente de novo." que não
// diz NADA quando o problema não é o que a tela esperava (ex: rota nova que
// ainda não subiu, timeout do proxy, sem internet). Cobre os 3 casos:
// 1) o servidor respondeu com um erro (JSON com `message`, ou texto puro tipo
//    "Cannot POST /x" quando a rota não existe) — mostra isso;
// 2) a requisição saiu mas não voltou resposta nenhuma (sem internet, timeout,
//    conexão recusada/resetada) — `error.request` existe, `error.response` não;
// 3) nem chegou a sair (erro de configuração do próprio axios) — `error.message`.
export function mensagemErroApi(error: any, fallback = "Tente novamente em instantes."): string {
  if (error?.response) {
    const dados = error.response.data;
    const mensagem = typeof dados === "string" ? dados : dados?.message;
    const texto = Array.isArray(mensagem) ? mensagem.join(" ") : mensagem;
    return texto || `O servidor respondeu com erro ${error.response.status}.`;
  }
  if (error?.request) {
    return "Sem resposta do servidor — confira sua internet e tente de novo em instantes.";
  }
  return error?.message || fallback;
}
