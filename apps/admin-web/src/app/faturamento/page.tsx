"use client";

import React, { useEffect, useMemo, useState } from "react";
import { centavosParaReais } from "@lavajato-app/shared";
import { api } from "../../lib/api";

interface FaturaResumo {
  id: string;
  valorCentavos: number;
  vencimentoEm: string;
  status: string;
  metodoPagamento: string | null;
  assinatura: { lavaJato: { nome: string } };
}

const FILTROS = ["TODAS", "PAGA", "PENDENTE", "ATRASADA"] as const;

// Faturamento real dos lava jatos assinantes — alimentado pelas notificações
// do Mercado Pago (ver AssinaturasService.processarEventoPagamento). Antes de
// configurar o gateway, essa lista fica vazia (não existe cobrança pra registrar).
export default function FaturamentoPage() {
  const [faturas, setFaturas] = useState<FaturaResumo[]>([]);
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]>("TODAS");

  useEffect(() => {
    api.get<FaturaResumo[]>("/faturas").then((res) => setFaturas(res.data));
  }, []);

  const visiveis = useMemo(() => (filtro === "TODAS" ? faturas : faturas.filter((f) => f.status === filtro)), [faturas, filtro]);

  const totais = useMemo(
    () => ({
      paga: faturas.filter((f) => f.status === "PAGA").reduce((s, f) => s + f.valorCentavos, 0),
      pendente: faturas.filter((f) => f.status === "PENDENTE").reduce((s, f) => s + f.valorCentavos, 0),
      atrasada: faturas.filter((f) => f.status === "ATRASADA").reduce((s, f) => s + f.valorCentavos, 0),
    }),
    [faturas],
  );

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 800 }}>Faturamento</h1>
      <p style={{ color: "#837A73", fontSize: 13 }}>Cobranças recorrentes dos lava jatos assinantes, via Mercado Pago</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginTop: 20 }}>
        <StatCard label="Recebido" value={centavosParaReais(totais.paga)} />
        <StatCard label="Pendente" value={centavosParaReais(totais.pendente)} />
        <StatCard label="Em atraso" value={centavosParaReais(totais.atrasada)} destaque={totais.atrasada > 0} />
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
        {FILTROS.map((f) => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            style={{
              border: "1px solid #DEDAD4",
              borderRadius: 999,
              padding: "6px 14px",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              background: filtro === f ? "#C1652E" : "white",
              color: filtro === f ? "white" : "#2A2420",
            }}
          >
            {f === "TODAS" ? "Todas" : f.charAt(0) + f.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      <div style={{ border: "1px solid #DEDAD4", borderRadius: 14, background: "white", marginTop: 16, overflow: "hidden" }}>
        <table>
          <thead>
            <tr>
              <th>Lava jato</th>
              <th>Valor</th>
              <th>Vencimento</th>
              <th>Status</th>
              <th>Método</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.length === 0 && (
              <tr>
                <td colSpan={5} style={{ color: "#837A73", textAlign: "center" }}>
                  Nenhuma fatura ainda.
                </td>
              </tr>
            )}
            {visiveis.map((f) => (
              <tr key={f.id}>
                <td style={{ fontWeight: 700 }}>{f.assinatura.lavaJato.nome}</td>
                <td>{centavosParaReais(f.valorCentavos)}</td>
                <td>{new Date(f.vencimentoEm).toLocaleDateString("pt-BR")}</td>
                <td>{f.status}</td>
                <td>{f.metodoPagamento ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatCard({ label, value, destaque }: { label: string; value: string; destaque?: boolean }) {
  return (
    <div
      style={{
        border: `1px solid ${destaque ? "#E3B6A8" : "#DEDAD4"}`,
        borderRadius: 14,
        padding: 18,
        background: destaque ? "#FBF1EE" : "white",
      }}
    >
      <div style={{ fontSize: 12, color: "#837A73" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6, color: destaque ? "#C1442E" : "#2A2420" }}>{value}</div>
    </div>
  );
}
