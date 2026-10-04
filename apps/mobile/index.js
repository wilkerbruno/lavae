// Ponto de entrada próprio, em vez de usar o "node_modules/expo/AppEntry.js"
// genérico. Aquele arquivo faz `import App from '../../App'` — um caminho
// relativo que parte de dentro do node_modules/expo. No pnpm, essa pasta é
// um link simbólico pra dentro do "armazém" central (node_modules/.pnpm/...),
// e o Node resolve o caminho relativo a partir do local FÍSICO real do
// arquivo, não do link — então ele procurava "App" dentro do .pnpm em vez de
// em apps/mobile, e sempre falhava (era a causa de tudo até aqui). Um
// index.js aqui na raiz do projeto, importando "./App" diretamente (mesma
// pasta física, sem atravessar nenhum link), não tem esse problema.
import { registerRootComponent } from "expo";
import App from "./App";

registerRootComponent(App);
