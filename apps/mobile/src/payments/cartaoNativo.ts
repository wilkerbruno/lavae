// Pedaços REUTILIZÁVEIS do formulário nativo de cartão (tokenização direto
// com o Mercado Pago, sem sair do app) — extraídos de CartaoScreen (cliente
// pagando um agendamento) pra serem usados também por AssinaturaPagamentoScreen
// (dono pagando a mensalidade/anuidade do SaaS, ver essa tela). Só o que é
// puro/sem estado de UI mora aqui; cada tela mantém seu próprio useState (o
// formulário em si é pequeno o suficiente pra não valer a pena um hook
// genérico por cima disso, e cada tela tem sutilezas próprias no que faz com
// o token gerado — ver comentário em cada uma).

// Página mínima carregada numa WebView OCULTA (nunca aparece na tela) só pra
// rodar o script antifraude do próprio Mercado Pago (security.js) — ver
// comentário original em CartaoScreen pro histórico completo (ticket
// WCS-50070). Assim que o script preenche `window.MP_DEVICE_SESSION_ID`,
// manda esse valor de volta pro app via `postMessage`.
export const HTML_DEVICE_ID = `
<!DOCTYPE html>
<html>
  <head><meta charset="utf-8" /></head>
  <body>
    <script src="https://www.mercadopago.com/v2/security.js" view="checkout"></script>
    <script>
      var tentativas = 0;
      var intervalo = setInterval(function () {
        tentativas++;
        if (window.MP_DEVICE_SESSION_ID) {
          clearInterval(intervalo);
          window.ReactNativeWebView.postMessage(window.MP_DEVICE_SESSION_ID);
        } else if (tentativas > 25) {
          clearInterval(intervalo);
          window.ReactNativeWebView.postMessage("");
        }
      }, 200);
    </script>
  </body>
</html>
`;

// Tokeniza direto com o Mercado Pago (chave pública) — usado tanto pro cartão
// novo (com os dados completos) quanto pro cartão salvo (com
// card_id+customer_id no lugar do número). Devolve só o token de uso único;
// o número do cartão em si nunca passa pelo nosso servidor.
export async function tokenizarCartao(publicKey: string, corpo: Record<string, unknown>): Promise<string> {
  const resposta = await fetch(`https://api.mercadopago.com/v1/card_tokens?public_key=${publicKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  const corpoResposta: any = await resposta.json().catch(() => null);
  if (!resposta.ok || !corpoResposta?.id) {
    throw new Error(corpoResposta?.message ?? corpoResposta?.cause?.[0]?.description ?? "Confira os dados digitados e tente novamente.");
  }
  return corpoResposta.id as string;
}

// Cor de referência de cada bandeira só pro selo visual (não são os logos
// oficiais — evitamos embutir marca registrada de terceiros).
export function corBandeira(paymentMethodId: string): string {
  switch (paymentMethodId) {
    case "visa":
      return "#1A1F71";
    case "master":
      return "#EB5D24";
    case "elo":
      return "#000000";
    case "amex":
      return "#2E77BB";
    case "hipercard":
      return "#B10000";
    case "diners":
      return "#0079BE";
    default:
      // Mesmo valor de colors.inkMuted (ver theme/tokens.ts) — hardcoded aqui
      // pra esse módulo não depender do tema de nenhuma tela específica.
      return "#9C9188";
  }
}

// Nome de exibição de um cartão SALVO a partir do payment_method.id que o
// Mercado Pago devolveu ao salvar — o cartão novo já tem esse nome pronto em
// identificarBandeiraLocal (campo `nome`), mas o salvo só guarda o id.
export function nomeBandeiraExibicao(paymentMethodId: string): string {
  switch (paymentMethodId) {
    case "visa":
      return "Visa";
    case "master":
      return "Mastercard";
    case "elo":
      return "Elo";
    case "amex":
      return "Amex";
    case "hipercard":
      return "Hipercard";
    case "diners":
      return "Diners";
    default:
      return paymentMethodId;
  }
}

export function formatarNumeroCartao(valor: string): string {
  const digitos = valor.replace(/\D/g, "").slice(0, 19);
  return digitos.replace(/(\d{4})(?=\d)/g, "$1 ");
}

export function formatarValidade(valor: string): string {
  const digitos = valor.replace(/\D/g, "").slice(0, 4);
  if (digitos.length <= 2) return digitos;
  return `${digitos.slice(0, 2)}/${digitos.slice(2)}`;
}

export function formatarCpf(valor: string): string {
  const digitos = valor.replace(/\D/g, "").slice(0, 11);
  return digitos
    .replace(/(\d{3})(?=\d)/, "$1.")
    .replace(/(\d{3})\.(\d{3})(?=\d)/, "$1.$2.")
    .replace(/(\d{3})\.(\d{3})\.(\d{3})(?=\d)/, "$1.$2.$3-");
}
