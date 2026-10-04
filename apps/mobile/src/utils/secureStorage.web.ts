// Par web de secureStorage.ts (ver comentário lá) — expo-secure-store usa o
// Keychain/Keystore nativos, que não existem no navegador, e o pacote não
// oferece nenhum substituto web. `window.localStorage` já resolve bem o
// mesmo caso de uso (sessão persistindo entre aberturas da aba/navegador);
// não é tão seguro quanto o Keychain nativo (um XSS na página conseguiria
// ler o token), mas é a opção padrão de qualquer app web comum, e essa
// versão web é só um paliativo pro cliente final até o app entrar na App
// Store (ver comentário em RootNavigator) — não guarda nada além do próprio
// token/usuário que a versão nativa também guarda.
export async function getItem(chave: string): Promise<string | null> {
  try {
    return window.localStorage.getItem(chave);
  } catch {
    return null;
  }
}

export async function setItem(chave: string, valor: string): Promise<void> {
  try {
    window.localStorage.setItem(chave, valor);
  } catch {
    // Modo privado/storage bloqueado: a sessão simplesmente não persiste
    // entre aberturas — não é motivo pra travar o login.
  }
}

export async function deleteItem(chave: string): Promise<void> {
  try {
    window.localStorage.removeItem(chave);
  } catch {
    // Idem acima.
  }
}
