"use client";

import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";

interface ConfiguracaoPlataforma {
  diasTesteGratis: number;
  horasCarenciaAposVencimento: number;
  emailSuporte: string | null;
}

// Parâmetros globais do SaaS: quantos dias de teste grátis todo lava jato nova
// ganha no cadastro, e por quantas horas depois do vencimento (trial ou
// mensalidade) o CLIENTE final ainda enxerga/agenda no lava jato antes dela
// sumir da busca. A equipe do lava jato (funcionário/admin) é bloqueada na
// hora, sem essa carência — ver AssinaturaGuard na API.
export default function ConfiguracoesPage() {
  const [diasTesteGratis, setDiasTesteGratis] = useState("");
  const [horasCarencia, setHorasCarencia] = useState("");
  const [emailSuporte, setEmailSuporte] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  useEffect(() => {
    api.get<ConfiguracaoPlataforma>("/configuracoes").then((res) => {
      setDiasTesteGratis(String(res.data.diasTesteGratis));
      setHorasCarencia(String(res.data.horasCarenciaAposVencimento));
      setEmailSuporte(res.data.emailSuporte ?? "");
      setCarregando(false);
    });
  }, []);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setSalvo(false);

    const dias = parseInt(diasTesteGratis, 10);
    const horas = parseInt(horasCarencia, 10);
    if (Number.isNaN(dias) || dias < 0) return setErro("Informe um número de dias válido (0 ou mais).");
    if (Number.isNaN(horas) || horas < 0) return setErro("Informe um número de horas válido (0 ou mais).");
    // eslint-disable-next-line no-useless-escape
    const emailValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailSuporte.trim());
    if (!emailValido) return setErro("Informe um e-mail de suporte válido.");

    setSalvando(true);
    try {
      await api.patch("/configuracoes", {
        diasTesteGratis: dias,
        horasCarenciaAposVencimento: horas,
        emailSuporte: emailSuporte.trim(),
      });
      setSalvo(true);
    } catch (err: any) {
      setErro(err?.response?.data?.message ?? "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) return null;

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 800 }}>Configurações</h1>
      <p style={{ color: "#837A73", fontSize: 13 }}>Parâmetros globais do SaaS — valem para todas os lava jatos</p>

      <form onSubmit={salvar} style={{ ...cardStyle, marginTop: 24, maxWidth: 480, display: "flex", flexDirection: "column", gap: 18 }}>
        {erro && <div style={{ color: "#C1442E", fontSize: 13 }}>{erro}</div>}
        {salvo && <div style={{ color: "#3E7A4D", fontSize: 13 }}>Configurações salvas.</div>}

        <div>
          <label style={labelStyle}>Duração do teste grátis (dias)</label>
          <input
            type="number"
            min={0}
            value={diasTesteGratis}
            onChange={(e) => setDiasTesteGratis(e.target.value)}
            style={inputStyle}
          />
          <p style={hintStyle}>
            Todo lava jato novo entra com esse tanto de dias em teste. Ao final, se não tiver assinatura paga, a
            assinatura vira "Cancelada" automaticamente. Mudar aqui não afeta trials já em andamento.
          </p>
        </div>

        <div>
          <label style={labelStyle}>Carência para o cliente final (horas)</label>
          <input
            type="number"
            min={0}
            value={horasCarencia}
            onChange={(e) => setHorasCarencia(e.target.value)}
            style={inputStyle}
          />
          <p style={hintStyle}>
            Quando a assinatura de um lava jato vence (trial ou mensalidade), a equipe (funcionários e dono) é
            bloqueada na hora. O cliente final continua vendo e conseguindo agendar por esse tanto de horas — depois
            disso, o lava jato some da busca do cliente também.
          </p>
        </div>

        <div>
          <label style={labelStyle}>E-mail de suporte</label>
          <input
            type="email"
            placeholder="suporte@divisionstech.com.br"
            value={emailSuporte}
            onChange={(e) => setEmailSuporte(e.target.value)}
            style={{ ...inputStyle, width: "100%" }}
          />
          <p style={hintStyle}>
            Exibido na tela "Suporte" do app, pra cliente, funcionário e dono de lava jato entrarem em contato. O
            WhatsApp de atendimento prioritário (quando o plano do lava jato tiver essa opção) é configurado em
            Planos.
          </p>
        </div>

        <button type="submit" disabled={salvando} style={{ ...btnPrimary, width: 160 }}>
          {salvando ? "Salvando…" : "Salvar"}
        </button>
      </form>
    </div>
  );
}

const cardStyle: React.CSSProperties = { border: "1px solid #DEDAD4", borderRadius: 16, padding: 22, background: "white" };
const labelStyle: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 700, marginBottom: 6 };
const inputStyle: React.CSSProperties = { border: "1px solid #DEDAD4", borderRadius: 9, padding: "10px 12px", fontSize: 14, width: 140 };
const hintStyle: React.CSSProperties = { fontSize: 12, color: "#837A73", marginTop: 6, lineHeight: 1.5 };
const btnPrimary: React.CSSProperties = { border: "none", borderRadius: 9, padding: "9px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer", background: "#C1652E", color: "white" };
