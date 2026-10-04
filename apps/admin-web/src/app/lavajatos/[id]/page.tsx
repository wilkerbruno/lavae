"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { centavosParaReais, Plano } from "@lavajato-app/shared";
import { api } from "../../../lib/api";

interface FuncionarioResumo {
  id: string;
  cargo: string;
  ativo: boolean;
  usuario: { nome: string; email: string };
}

interface FaturaResumo {
  id: string;
  valorCentavos: number;
  vencimentoEm: string;
  status: string;
  metodoPagamento: string | null;
}

interface LavaJatoDetalhe {
  id: string;
  nome: string;
  endereco: string | null;
  telefone: string | null;
  criadoEm: string;
  notaMedia: number;
  totalAvaliacoes: number;
  funcionarios: FuncionarioResumo[];
  assinatura: {
    status: string;
    proximaCobrancaEm: string | null;
    trialTerminaEm: string | null;
    bloqueadaEm: string | null;
    plano: Plano;
    faturas: FaturaResumo[];
  } | null;
}

const STATUS_LABEL: Record<string, string> = {
  TRIAL: "Período de teste",
  ATIVA: "Ativa",
  INADIMPLENTE: "Inadimplente",
  CANCELADA: "Cancelada",
};

// Detalhe de um lava jato assinante: dados básicos, situação da assinatura
// (com suspender/reativar/cancelar e troca manual de plano), equipe e
// histórico de faturas — tudo que o suporte da plataforma precisa pra atender
// um chamado sem precisar mexer direto no banco.
export default function LavaJatoDetalhePage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [lavaJato, setLavaJato] = useState<LavaJatoDetalhe | null>(null);
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [planoSelecionado, setPlanoSelecionado] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const [lavaJatoRes, planosRes] = await Promise.all([
      api.get<LavaJatoDetalhe>(`/lavajatos/${id}`),
      api.get<Plano[]>("/planos/todos"),
    ]);
    setLavaJato(lavaJatoRes.data);
    setPlanos(planosRes.data);
    setPlanoSelecionado(lavaJatoRes.data.assinatura?.plano.id ?? "");
  }, [id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function definirStatus(status: string) {
    setErro(null);
    setSalvando(true);
    try {
      await api.patch(`/assinaturas/${id}/status`, { status });
      carregar();
    } catch (e: any) {
      setErro(e?.response?.data?.message ?? "Não foi possível atualizar o status.");
    } finally {
      setSalvando(false);
    }
  }

  async function aplicarPlano() {
    if (!planoSelecionado) return;
    setErro(null);
    setSalvando(true);
    try {
      await api.patch(`/assinaturas/${id}/plano`, { planoId: planoSelecionado });
      carregar();
    } catch (e: any) {
      setErro(e?.response?.data?.message ?? "Não foi possível trocar o plano.");
    } finally {
      setSalvando(false);
    }
  }

  if (!lavaJato) return null;

  return (
    <div>
      <Link href="/lavajatos" style={{ fontSize: 13, color: "#837A73" }}>
        ← Lava jatos
      </Link>
      <h1 style={{ fontSize: 24, fontWeight: 800, marginTop: 8 }}>{lavaJato.nome}</h1>
      <p style={{ color: "#837A73", fontSize: 13 }}>
        {lavaJato.endereco ?? "Sem endereço cadastrado"} {lavaJato.telefone ? `· ${lavaJato.telefone}` : ""}
      </p>
      <p style={{ color: "#837A73", fontSize: 12, marginTop: 2 }}>
        Assinante desde {new Date(lavaJato.criadoEm).toLocaleDateString("pt-BR")} · {lavaJato.notaMedia.toFixed(1)}★ (
        {lavaJato.totalAvaliacoes} avaliações)
      </p>

      {erro && (
        <div style={{ marginTop: 16, color: "#C1442E", fontSize: 13, background: "#F7E9E6", padding: 10, borderRadius: 8 }}>
          {erro}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 16, marginTop: 24 }}>
        <div style={cardStyle}>
          <div style={{ fontSize: 14, fontWeight: 800 }}>Assinatura</div>
          {lavaJato.assinatura ? (
            <>
              <div style={{ fontSize: 22, fontWeight: 800, marginTop: 10 }}>{lavaJato.assinatura.plano.nome}</div>
              <div style={{ fontSize: 13, color: "#837A73" }}>
                {centavosParaReais(lavaJato.assinatura.plano.precoCentavos)}/mês
              </div>
              <div style={{ marginTop: 10, fontSize: 13 }}>
                Status: <strong>{STATUS_LABEL[lavaJato.assinatura.status] ?? lavaJato.assinatura.status}</strong>
              </div>
              {lavaJato.assinatura.proximaCobrancaEm && (
                <div style={{ fontSize: 12, color: "#837A73", marginTop: 2 }}>
                  Próxima cobrança: {new Date(lavaJato.assinatura.proximaCobrancaEm).toLocaleDateString("pt-BR")}
                </div>
              )}
              {lavaJato.assinatura.status === "TRIAL" && lavaJato.assinatura.trialTerminaEm && (
                <div style={{ fontSize: 12, color: "#837A73", marginTop: 2 }}>
                  Teste grátis termina em: {new Date(lavaJato.assinatura.trialTerminaEm).toLocaleDateString("pt-BR")}
                </div>
              )}
              {lavaJato.assinatura.bloqueadaEm && (
                <div style={{ fontSize: 12, color: "#C1442E", marginTop: 6, fontWeight: 600 }}>
                  Equipe bloqueada desde {new Date(lavaJato.assinatura.bloqueadaEm).toLocaleString("pt-BR")} — cliente
                  final some da busca após o período de carência configurado.
                </div>
              )}

              <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
                <button disabled={salvando} onClick={() => definirStatus("ATIVA")} style={btnSecondary}>
                  Reativar
                </button>
                <button disabled={salvando} onClick={() => definirStatus("INADIMPLENTE")} style={btnSecondary}>
                  Suspender
                </button>
                <button disabled={salvando} onClick={() => definirStatus("CANCELADA")} style={btnDanger}>
                  Cancelar assinatura
                </button>
              </div>

              <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid #DEDAD4" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#837A73", marginBottom: 8 }}>
                  Trocar plano manualmente (sem cobrança — use com cuidado)
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <select value={planoSelecionado} onChange={(e) => setPlanoSelecionado(e.target.value)} style={selectStyle}>
                    {planos.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nome}
                      </option>
                    ))}
                  </select>
                  <button disabled={salvando} onClick={aplicarPlano} style={btnPrimary}>
                    Aplicar
                  </button>
                </div>
              </div>
            </>
          ) : (
            <p style={{ color: "#837A73", fontSize: 13 }}>Sem assinatura.</p>
          )}
        </div>

        <div style={cardStyle}>
          <div style={{ fontSize: 14, fontWeight: 800 }}>Equipe ({lavaJato.funcionarios.length})</div>
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
            {lavaJato.funcionarios.length === 0 && <p style={{ color: "#837A73", fontSize: 13 }}>Nenhum funcionário cadastrado.</p>}
            {lavaJato.funcionarios.map((f) => (
              <div key={f.id} style={{ fontSize: 13, opacity: f.ativo ? 1 : 0.5 }}>
                <strong>{f.usuario.nome}</strong> · {f.cargo}
                <div style={{ fontSize: 12, color: "#837A73" }}>{f.usuario.email}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ ...cardStyle, marginTop: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8 }}>Faturas</div>
        {!lavaJato.assinatura || lavaJato.assinatura.faturas.length === 0 ? (
          <p style={{ color: "#837A73", fontSize: 13 }}>Nenhuma fatura ainda.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Valor</th>
                <th>Vencimento</th>
                <th>Status</th>
                <th>Método</th>
              </tr>
            </thead>
            <tbody>
              {lavaJato.assinatura.faturas.map((f) => (
                <tr key={f.id}>
                  <td>{centavosParaReais(f.valorCentavos)}</td>
                  <td>{new Date(f.vencimentoEm).toLocaleDateString("pt-BR")}</td>
                  <td>{f.status}</td>
                  <td>{f.metodoPagamento ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  border: "1px solid #DEDAD4",
  borderRadius: 14,
  padding: 20,
  background: "white",
};

const btnBase: React.CSSProperties = {
  border: "none",
  borderRadius: 9,
  padding: "9px 14px",
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
};

const btnPrimary: React.CSSProperties = { ...btnBase, background: "#C1652E", color: "white" };
const btnSecondary: React.CSSProperties = { ...btnBase, background: "#F1EEE9", color: "#2A2420" };
const btnDanger: React.CSSProperties = { ...btnBase, background: "#F7E9E6", color: "#C1442E" };
const selectStyle: React.CSSProperties = {
  border: "1px solid #DEDAD4",
  borderRadius: 9,
  padding: "9px 10px",
  fontSize: 13,
  flex: 1,
};
