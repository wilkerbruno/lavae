import { AlertButton } from "react-native";

// Par web de alertaCompat.ts (ver comentário lá). O react-native-web NÃO
// implementa Alert.alert de verdade — o pacote (node_modules/react-native-web/
// dist/exports/Alert/index.js) define só `static alert() {}`, um no-op
// completo: nenhum diálogo aparece, e nenhum `onPress` dos botões é chamado,
// nunca.
//
// Isso quebrava (silenciosamente, sem nenhum erro no console) TODA
// confirmação/aviso da versão web que usa Alert.alert — o caso mais grave era
// o "Sair sem pagar?" do PagamentoScreen: a tela bloqueia a navegação de
// volta (`e.preventDefault()`) enquanto o Pix está pendente, esperando o
// cliente confirmar num Alert.alert com os botões "Continuar pagando"/"Sair e
// cancelar" — como esse Alert nunca aparecia no navegador, o botão de voltar
// ficava travado pra sempre (a navegação já tinha sido bloqueada, e não
// existia nenhuma forma do cliente confirmar a saída). O mesmo problema
// afetava, em silêncio, os outros Alert.alert com botões de confirmar (ex:
// cancelar agendamento, cancelar assinatura, remover cartão) e até os avisos
// simples de sucesso/erro (ex: "Agendamento confirmado!") — nenhum deles
// aparecia pro cliente na versão web.
//
// window.alert/window.confirm do navegador não suportam texto customizado nos
// botões nem mais de 2 opções — por isso essa função só cobre exatamente os
// dois formatos que o app já usa em todo lugar: um aviso com 0-1 botão
// (window.alert) ou uma confirmação com 2 botões, sendo o primeiro
// "cancel"/neutro e o segundo a ação de verdade (window.confirm).
export function alertar(titulo: string, mensagem?: string, botoes?: AlertButton[]) {
  const texto = mensagem ? `${titulo}\n\n${mensagem}` : titulo;

  if (!botoes || botoes.length <= 1) {
    window.alert(texto);
    botoes?.[0]?.onPress?.();
    return;
  }

  const cancelar = botoes.find((botao) => botao.style === "cancel") ?? botoes[0];
  const confirmar = botoes.find((botao) => botao !== cancelar) ?? botoes[botoes.length - 1];

  if (window.confirm(texto)) {
    confirmar.onPress?.();
  } else {
    cancelar.onPress?.();
  }
}
