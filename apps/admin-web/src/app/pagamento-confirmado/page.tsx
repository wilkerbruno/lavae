// Página pública (fora do AuthGuard, ver layout.tsx) pra onde o Mercado Pago
// redireciona o dono do lava jato depois de autorizar a assinatura no
// checkout (é o "back_url" configurado em AssinaturasService.criarCheckout).
// Não faz nada além de avisar — a confirmação de verdade acontece via
// webhook, processado em segundo plano pela API (às vezes com alguns
// segundos de atraso em relação ao redirecionamento).
export default function PagamentoConfirmadoPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 380 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
        <div style={{ fontSize: 20, fontWeight: 800 }}>Pagamento em processamento</div>
        <p style={{ color: "#837A73", fontSize: 14, marginTop: 10, lineHeight: 1.5 }}>
          Recebemos a autorização do Mercado Pago. Pode voltar para o aplicativo — o plano novo aparece confirmado em
          alguns instantes (puxe a tela de Assinatura para atualizar).
        </p>
      </div>
    </div>
  );
}
