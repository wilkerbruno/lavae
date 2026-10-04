"use client";

import React from "react";
import { usePathname } from "next/navigation";
import "./globals.css";
import { Sidebar } from "../components/Sidebar";
import { AuthGuard } from "../components/AuthGuard";

// Rotas públicas ficam fora do AuthGuard/Sidebar: /login (óbvio) e
// /pagamento-confirmado (pra onde o Mercado Pago manda o dono do lava jato de
// volta depois do checkout — ele está no navegador do celular dele, não
// logado no painel do SaaS).
const ROTAS_PUBLICAS = ["/login", "/pagamento-confirmado"];

// Layout raiz: as rotas públicas ficam fora do AuthGuard/Sidebar; todo o
// resto do painel exige login de SAAS_ADMIN.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublica = ROTAS_PUBLICAS.includes(pathname ?? "");

  return (
    <html lang="pt-BR">
      <head>
        <title>lavaê — Painel SaaS</title>
      </head>
      <body>
        {isPublica ? (
          children
        ) : (
          <AuthGuard>
            <div style={{ display: "flex", minHeight: "100vh" }}>
              <Sidebar />
              <main style={{ flex: 1, padding: "36px 40px", overflowY: "auto" }}>{children}</main>
            </div>
          </AuthGuard>
        )}
      </body>
    </html>
  );
}
