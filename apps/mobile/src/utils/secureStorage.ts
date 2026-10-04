import * as SecureStore from "expo-secure-store";

// Guarda token/usuário no Keychain (iOS) / Keystore (Android) via
// expo-secure-store — esse pacote não tem NENHUM suporte a navegador (nem
// suporte parcial, ver secureStorage.web.ts pro par que o Metro escolhe
// sozinho ao rodar no Expo Web). Extraído do authStore pra isolar esse único
// ponto de diferença entre nativo e web.
export async function getItem(chave: string): Promise<string | null> {
  return SecureStore.getItemAsync(chave);
}

export async function setItem(chave: string, valor: string): Promise<void> {
  await SecureStore.setItemAsync(chave, valor);
}

export async function deleteItem(chave: string): Promise<void> {
  await SecureStore.deleteItemAsync(chave);
}
