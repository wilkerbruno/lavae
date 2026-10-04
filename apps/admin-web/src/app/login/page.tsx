"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { api, salvarToken } from "../../lib/api";
import { PasswordInput } from "../../components/PasswordInput";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setCarregando(true);
    try {
      const { data } = await api.post("/auth/login", { email, senha });
      if (data.usuario.papel !== "SAAS_ADMIN") {
        setErro("Esta conta não tem acesso ao painel da plataforma.");
        return;
      }
      salvarToken(data.accessToken);
      router.push("/");
    } catch (err: any) {
      setErro(err?.response?.data?.message ?? "E-mail ou senha inválidos.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <form onSubmit={handleSubmit} style={{ width: 320, display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>Lava Jato OS</div>
          <div style={{ fontSize: 13, color: "#837A73" }}>Painel administrativo da plataforma</div>
        </div>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="E-mail"
          type="email"
          style={inputStyle}
        />
        <PasswordInput
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          placeholder="Senha"
          style={inputStyle}
        />
        {erro && <div style={{ color: "#C1442E", fontSize: 13 }}>{erro}</div>}
        <button type="submit" disabled={carregando} style={buttonStyle}>
          {carregando ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  border: "1px solid #DEDAD4",
  borderRadius: 10,
  padding: "12px 14px",
  fontSize: 14,
};

const buttonStyle: React.CSSProperties = {
  border: "none",
  borderRadius: 10,
  padding: "12px 0",
  background: "#C1652E",
  color: "white",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
};
