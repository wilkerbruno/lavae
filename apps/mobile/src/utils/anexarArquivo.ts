import { Platform } from "react-native";

type Arquivo = { uri: string; fileName?: string | null; mimeType?: string | null };

// Anexa um arquivo escolhido (expo-image-picker) num FormData.
// No celular o React Native aceita o objeto { uri, name, type }; no navegador
// (react-native-web) o FormData exige um Blob de verdade, então baixamos o
// conteúdo da URI local (blob:/data:) e anexamos como arquivo.
export async function anexarArquivo(form: FormData, campo: string, arquivo: Arquivo) {
  const nome = arquivo.fileName ?? "logo.jpg";
  const tipo = arquivo.mimeType ?? "image/jpeg";
  if (Platform.OS === "web") {
    const blob = await (await fetch(arquivo.uri)).blob();
    form.append(campo, blob, nome);
    return;
  }
  form.append(campo, { uri: arquivo.uri, name: nome, type: tipo } as unknown as Blob);
}
