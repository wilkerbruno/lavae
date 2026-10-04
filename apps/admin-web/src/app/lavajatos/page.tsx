"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../lib/api";

interface LavaJatoResumo {
  id: string;
  nome: string;
  criadoEm: string;
  assinatura: { status: string; plano: { nome: string } } | null;
  funcionarios: unknown[];
}

export default function LavaJatosPage() {
  const [lavaJatos, setLavaJatos] = useState<LavaJatoResumo[]>([]);

  useEffect(() => {
    api.get<LavaJatoResumo[]>("/lavajatos").then((res) => setLavaJatos(res.data));
  }, []);

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 800 }}>Lava jatos</h1>
      <p style={{ color: "#837A73", fontSize: 13 }}>Todas as contas assinantes da plataforma</p>

      <div style={{ border: "1px solid #DEDAD4", borderRadius: 14, background: "white", marginTop: 20, overflow: "hidden" }}>
        <table>
          <thead>
            <tr>
              <th>Lava jato</th>
              <th>Plano</th>
              <th>Funcionários</th>
              <th>Status</th>
              <th>Desde</th>
            </tr>
          </thead>
          <tbody>
            {lavaJatos.map((b) => (
              <tr key={b.id} style={{ cursor: "pointer" }} onClick={() => (window.location.href = `/lavajatos/${b.id}`)}>
                <td style={{ fontWeight: 700 }}>
                  <Link href={`/lavajatos/${b.id}`} onClick={(e) => e.stopPropagation()}>
                    {b.nome}
                  </Link>
                </td>
                <td>{b.assinatura?.plano.nome ?? "—"}</td>
                <td>{b.funcionarios.length}</td>
                <td>{b.assinatura?.status ?? "—"}</td>
                <td>{new Date(b.criadoEm).toLocaleDateString("pt-BR")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
