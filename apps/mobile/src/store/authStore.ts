import { create } from "zustand";
import { Platform } from "react-native";
import * as secureStorage from "../utils/secureStorage";
import { api } from "../api/client";
import { Usuario } from "@lavajato-app/shared";

const TOKEN_KEY = "lavajato_app_token";
const USER_KEY = "lavajato_app_user";

// Na Web a sessão não fica guardada em nada que o próprio navegador consiga
// mostrar em texto puro (nem token, nem os dados do usuário) — ver
// secureStorage.web.ts e o comentário em "entrar" abaixo. Esse valor é só um
// marcador em memória pra `token` continuar não-nulo enquanto há sessão (o
// RootNavigator decide as telas pelo campo `usuario`, não por esse texto).
const TOKEN_SESSAO_WEB = "sessao-web";

interface AuthState {
  token: string | null;
  usuario: Usuario | null;
  carregando: boolean; // true enquanto restaura a sessão salva no dispositivo
  // true quando a última resposta da API disse que a assinatura do lava jato
  // não está em dia (código ASSINATURA_BLOQUEADA, ver api/client.ts) — o
  // RootNavigator usa isso pra forçar FUNCIONARIO/LAVAJATO_ADMIN pra fora
  // das telas normais (ver comentário lá). Nunca afeta CLIENTE/SAAS_ADMIN.
  assinaturaBloqueada: boolean;
  entrar: (token: string, usuario: Usuario) => Promise<void>;
  restaurarSessao: () => Promise<void>;
  logout: () => void;
  setAssinaturaBloqueada: (bloqueada: boolean) => void;
  // Mescla campos novos no usuário logado (ex: depois de editar o perfil em
  // PATCH /usuarios/me) sem precisar deslogar/logar de novo — mantém o token
  // e o resto do estado como estão.
  atualizarUsuario: (dados: Partial<Usuario>) => Promise<void>;
}

// Estado global de autenticação. A tela raiz (RootNavigator) decide qual
// conjunto de telas mostrar com base em `usuario.papel`.
export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  usuario: null,
  carregando: true,
  assinaturaBloqueada: false,

  entrar: async (token, usuario) => {
    if (Platform.OS === "web") {
      // A API (ver auth.controller.ts) já setou um cookie httpOnly com esse
      // mesmo token na resposta de login — o navegador guarda e manda esse
      // cookie sozinho (api/client.ts tem `withCredentials: true`). Por isso
      // aqui NÃO salva nada em localStorage: nem o token, nem `usuario` —
      // um script malicioso (XSS) não acha nada de útil, e quem abre o
      // DevTools também não vê token/e-mail/telefone em texto puro.
      set({ token: TOKEN_SESSAO_WEB, usuario, assinaturaBloqueada: false });
      return;
    }
    await secureStorage.setItem(TOKEN_KEY, token);
    await secureStorage.setItem(USER_KEY, JSON.stringify(usuario));
    set({ token, usuario, assinaturaBloqueada: false });
  },

  restaurarSessao: async () => {
    if (Platform.OS === "web") {
      // Sem token/usuário salvos localmente pra restaurar (ver "entrar"
      // acima) — pergunta pra API quem está logado usando só o cookie
      // httpOnly. Sem cookie válido, a API responde 401 e o catch abaixo
      // trata como "ninguém logado", igual antes.
      try {
        const { data } = await api.get<Usuario>("/usuarios/meu-perfil");
        set({ token: TOKEN_SESSAO_WEB, usuario: data, carregando: false, assinaturaBloqueada: false });
      } catch {
        set({ token: null, usuario: null, carregando: false, assinaturaBloqueada: false });
      }
      return;
    }
    const [token, usuarioJson] = await Promise.all([
      secureStorage.getItem(TOKEN_KEY),
      secureStorage.getItem(USER_KEY),
    ]);
    set({
      token: token ?? null,
      usuario: usuarioJson ? JSON.parse(usuarioJson) : null,
      carregando: false,
      assinaturaBloqueada: false,
    });
  },

  logout: () => {
    if (Platform.OS === "web") {
      // O JS da página não consegue apagar um cookie httpOnly sozinho —
      // pede pro backend limpar (ver auth.controller.ts "logout"). Não
      // espera a resposta pra já tirar o usuário das telas autenticadas.
      api.post("/auth/logout").catch(() => {});
      set({ token: null, usuario: null, assinaturaBloqueada: false });
      return;
    }
    secureStorage.deleteItem(TOKEN_KEY);
    secureStorage.deleteItem(USER_KEY);
    set({ token: null, usuario: null, assinaturaBloqueada: false });
  },

  setAssinaturaBloqueada: (assinaturaBloqueada) => set({ assinaturaBloqueada }),

  atualizarUsuario: async (dados) => {
    const atual = get().usuario;
    if (!atual) return;
    const atualizado = { ...atual, ...dados };
    if (Platform.OS !== "web") {
      await secureStorage.setItem(USER_KEY, JSON.stringify(atualizado));
    }
    set({ usuario: atualizado });
  },
}));
