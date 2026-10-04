import { useEffect } from "react";

// Par web de DeviceIdCollector.tsx (ver comentário lá e o histórico completo
// em payments/cartaoNativo.ts, ticket WCS-50070). No nativo, o script
// antifraude do Mercado Pago (security.js) precisa de uma WebView oculta
// porque o React Native não tem DOM/<script> próprio — no navegador isso é
// desnecessário: injeta o mesmo script direto na página de verdade e espera
// ele preencher `window.MP_DEVICE_SESSION_ID`, sem WebView nem iframe.
export interface DeviceIdCollectorProps {
  onDeviceId: (id: string | null) => void;
}

const SECURITY_JS_SRC = "https://www.mercadopago.com/v2/security.js";
const INTERVALO_MS = 200;
const MAX_TENTATIVAS = 25; // mesmo limite do HTML_DEVICE_ID nativo (~5s)

export function DeviceIdCollector({ onDeviceId }: DeviceIdCollectorProps) {
  useEffect(() => {
    let cancelado = false;
    let tentativas = 0;

    function terminar(id: string | null) {
      if (!cancelado) onDeviceId(id);
    }

    // Não injeta de novo se essa página já carregou o script antes (ex:
    // cliente voltou pra tela de cartão dentro da mesma sessão do navegador).
    let script = document.querySelector<HTMLScriptElement>(`script[src="${SECURITY_JS_SRC}"]`);
    if (!script) {
      script = document.createElement("script");
      script.src = SECURITY_JS_SRC;
      script.setAttribute("view", "checkout");
      document.body.appendChild(script);
    }

    const intervalo = window.setInterval(() => {
      tentativas++;
      const id = (window as any).MP_DEVICE_SESSION_ID;
      if (id) {
        window.clearInterval(intervalo);
        terminar(id);
      } else if (tentativas > MAX_TENTATIVAS) {
        window.clearInterval(intervalo);
        terminar(null);
      }
    }, INTERVALO_MS);

    return () => {
      cancelado = true;
      window.clearInterval(intervalo);
    };
  }, [onDeviceId]);

  return null;
}
