"use client";

import React, { useEffect, useState } from "react";
import { Plano, TipoDesconto, calcularPrecoAnualCentavos, centavosParaReais } from "@lavajato-app/shared";
import { api } from "../../lib/api";

const PLANO_FORM_VAZIO = {
  nome: "",
  precoReais: "",
  limiteFuncionarios: "",
  recursos: "",
  descontoAnualTipo: TipoDesconto.PERCENTUAL as TipoDesconto,
  descontoAnualValor: "",
  atendimentoPrioritario: false,
  whatsappSuporte: "",
};

type PlanoForm = typeof PLANO_FORM_VAZIO;

function planoParaForm(plano: Plano): PlanoForm {
  return {
    nome: plano.nome,
    precoReais: (plano.precoCentavos / 100).toFixed(2),
    limiteFuncionarios: plano.limiteFuncionarios != null ? String(plano.limiteFuncionarios) : "",
    recursos: plano.recursos.join("\n"),
    descontoAnualTipo: plano.descontoAnualTipo,
    descontoAnualValor:
      plano.descontoAnualTipo === TipoDesconto.PERCENTUAL
        ? String(plano.descontoAnualValor)
        : (plano.descontoAnualValor / 100).toFixed(2),
    atendimentoPrioritario: plano.atendimentoPrioritario,
    whatsappSuporte: plano.whatsappSuporte ?? "",
  };
}

// Valida e converte um PlanoForm pro formato que a API espera (POST /planos
// ou PATCH /planos/:id aceitam o mesmo corpo — ver CreatePlanoDto/UpdatePlanoDto).
// Retorna a mensagem de erro (pra mostrar na tela) ou o corpo pronto pra mandar.
function validarEConverter(form: PlanoForm): { erro: string } | { corpo: Record<string, unknown> } {
  const precoCentavos = Math.round(parseFloat(form.precoReais.replace(",", ".")) * 100);
  if (!form.nome.trim()) return { erro: "Digite o nome do plano." };
  if (Number.isNaN(precoCentavos) || precoCentavos <= 0) return { erro: "Digite um preço válido (ex: 79,00)." };
  const descontoBruto = form.descontoAnualValor.trim() ? parseFloat(form.descontoAnualValor.replace(",", ".")) : 0;
  if (Number.isNaN(descontoBruto) || descontoBruto < 0) {
    return { erro: "Digite um desconto anual válido (ou deixe em branco)." };
  }
  if (form.atendimentoPrioritario && form.whatsappSuporte.replace(/\D/g, "").length < 8) {
    return { erro: "Informe um WhatsApp válido com DDI e DDD (ex: 5531999999999) para o atendimento prioritário." };
  }

  return {
    corpo: {
      nome: form.nome.trim(),
      precoCentavos,
      // null (não undefined) de propósito: é o único jeito de "limpar" o
      // limite num PATCH e voltar o plano pra ilimitado (ver PlanosService.
      // atualizar — Prisma só apaga um campo opcional se vier null; se vier
      // undefined, o Prisma entende "não mexe nesse campo").
      limiteFuncionarios: form.limiteFuncionarios.trim() ? parseInt(form.limiteFuncionarios, 10) : null,
      recursos: form.recursos.split("\n").map((r) => r.trim()).filter(Boolean),
      descontoAnualTipo: form.descontoAnualTipo,
      descontoAnualValor:
        form.descontoAnualTipo === TipoDesconto.PERCENTUAL ? Math.round(descontoBruto) : Math.round(descontoBruto * 100),
      atendimentoPrioritario: form.atendimentoPrioritario,
      whatsappSuporte: form.atendimentoPrioritario ? form.whatsappSuporte.trim() : undefined,
    },
  };
}

// Campos de um plano (nome, preço, limite, recursos, desconto anual, suporte
// prioritário) — usado tanto no formulário de criação quanto no de edição
// completa, pra não duplicar o JSX dos dois.
function CamposPlano({ form, onChange }: { form: PlanoForm; onChange: (form: PlanoForm) => void }) {
  return (
    <>
      <div style={{ display: "flex", gap: 10 }}>
        <input
          placeholder="Nome (ex: Avançado)"
          value={form.nome}
          onChange={(e) => onChange({ ...form, nome: e.target.value })}
          style={{ ...inputStyle, flex: 2 }}
        />
        <input
          placeholder="Preço mensal (R$)"
          value={form.precoReais}
          onChange={(e) => onChange({ ...form, precoReais: e.target.value })}
          style={{ ...inputStyle, flex: 1 }}
        />
        <input
          placeholder="Limite funcionários (vazio = ilimitado)"
          value={form.limiteFuncionarios}
          onChange={(e) => onChange({ ...form, limiteFuncionarios: e.target.value })}
          style={{ ...inputStyle, flex: 1 }}
        />
      </div>
      <textarea
        placeholder={"Recursos exibidos (um por linha)\nEx: Agenda e financeiro\nRelatórios avançados"}
        value={form.recursos}
        onChange={(e) => onChange({ ...form, recursos: e.target.value })}
        rows={3}
        style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
      />
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <span style={{ fontSize: 12.5, color: "#837A73", flex: 1 }}>Desconto no plano anual (opcional)</span>
        <select
          value={form.descontoAnualTipo}
          onChange={(e) => onChange({ ...form, descontoAnualTipo: e.target.value as TipoDesconto })}
          style={{ ...inputStyle, flex: 1 }}
        >
          <option value={TipoDesconto.PERCENTUAL}>% de desconto</option>
          <option value={TipoDesconto.VALOR_FIXO}>R$ de desconto</option>
        </select>
        <input
          placeholder={form.descontoAnualTipo === TipoDesconto.PERCENTUAL ? "Ex: 15" : "Ex: 100,00"}
          value={form.descontoAnualValor}
          onChange={(e) => onChange({ ...form, descontoAnualValor: e.target.value })}
          style={{ ...inputStyle, flex: 1 }}
        />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 4, borderTop: "1px solid #F1EEE9" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={form.atendimentoPrioritario}
            onChange={(e) => onChange({ ...form, atendimentoPrioritario: e.target.checked })}
          />
          Atendimento prioritário (libera WhatsApp de suporte pra esse plano)
        </label>
        {form.atendimentoPrioritario && (
          <input
            placeholder="WhatsApp com DDI e DDD (ex: 5531999999999)"
            value={form.whatsappSuporte}
            onChange={(e) => onChange({ ...form, whatsappSuporte: e.target.value })}
            style={inputStyle}
          />
        )}
      </div>
      {form.precoReais && !Number.isNaN(parseFloat(form.precoReais.replace(",", "."))) && (
        <div style={{ fontSize: 12, color: "#837A73" }}>
          Preço anual resultante:{" "}
          <strong style={{ color: "#3A3530" }}>
            {centavosParaReais(
              calcularPrecoAnualCentavos(
                Math.round(parseFloat(form.precoReais.replace(",", ".")) * 100),
                form.descontoAnualTipo,
                (() => {
                  const bruto = parseFloat((form.descontoAnualValor || "0").replace(",", "."));
                  const seguro = Number.isNaN(bruto) ? 0 : bruto;
                  return form.descontoAnualTipo === TipoDesconto.PERCENTUAL ? seguro : Math.round(seguro * 100);
                })(),
              ),
            )}
          </strong>
        </div>
      )}
    </>
  );
}

// Onde o SaaS "faz os valores": cria planos novos, edita QUALQUER campo de um
// plano existente (nome, preço, limite de funcionários, recursos, desconto
// anual, suporte prioritário) e ativa/desativa ou exclui planos. Um plano
// desativado some da tela de onboarding mas continua valendo pra quem já
// está nele; excluir é definitivo e só é permitido pra um plano que nunca
// foi usado por nenhuma lava jato (ver PlanosService.excluir).
export default function PlanosPage() {
  const [planos, setPlanos] = useState<Plano[]>([]);

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [edicao, setEdicao] = useState<PlanoForm>(PLANO_FORM_VAZIO);
  const [erroEdicao, setErroEdicao] = useState<string | null>(null);
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);

  const [excluindoId, setExcluindoId] = useState<string | null>(null);
  const [erroExclusao, setErroExclusao] = useState<{ id: string; mensagem: string } | null>(null);

  const [formAberto, setFormAberto] = useState(false);
  const [novoPlano, setNovoPlano] = useState<PlanoForm>(PLANO_FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function carregar() {
    api.get<Plano[]>("/planos/todos").then((res) => setPlanos(res.data));
  }

  useEffect(() => {
    carregar();
  }, []);

  function iniciarEdicao(plano: Plano) {
    setEditandoId(plano.id);
    setErroEdicao(null);
    setEdicao(planoParaForm(plano));
  }

  async function salvarEdicao(id: string) {
    const resultado = validarEConverter(edicao);
    if ("erro" in resultado) return setErroEdicao(resultado.erro);

    setErroEdicao(null);
    setSalvandoEdicao(true);
    try {
      await api.patch(`/planos/${id}`, resultado.corpo);
      setEditandoId(null);
      carregar();
    } catch (err: any) {
      setErroEdicao(err?.response?.data?.message ?? "Não foi possível salvar as alterações.");
    } finally {
      setSalvandoEdicao(false);
    }
  }

  async function alternarAtivo(plano: Plano) {
    await api.patch(`/planos/${plano.id}`, { ativo: !plano.ativo });
    carregar();
  }

  async function excluir(plano: Plano) {
    const confirmado = window.confirm(
      `Excluir o plano "${plano.nome}" permanentemente?\n\nIsso só funciona se nenhumo lava jato (atual ou do histórico) já tiver usado esse plano. Essa ação não pode ser desfeita.`,
    );
    if (!confirmado) return;

    setErroExclusao(null);
    setExcluindoId(plano.id);
    try {
      await api.delete(`/planos/${plano.id}`);
      carregar();
    } catch (err: any) {
      setErroExclusao({ id: plano.id, mensagem: err?.response?.data?.message ?? "Não foi possível excluir o plano." });
    } finally {
      setExcluindoId(null);
    }
  }

  async function criarPlano(e: React.FormEvent) {
    e.preventDefault();
    const resultado = validarEConverter(novoPlano);
    if ("erro" in resultado) return setErro(resultado.erro);

    setErro(null);
    setSalvando(true);
    try {
      await api.post("/planos", resultado.corpo);
      setNovoPlano(PLANO_FORM_VAZIO);
      setFormAberto(false);
      carregar();
    } catch (err: any) {
      setErro(err?.response?.data?.message ?? "Não foi possível criar o plano.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800 }}>Planos e preços</h1>
          <p style={{ color: "#837A73", fontSize: 13 }}>Defina os valores cobrados de cada lava jato assinante</p>
        </div>
        <button onClick={() => setFormAberto((v) => !v)} style={btnPrimary}>
          {formAberto ? "Cancelar" : "+ Novo plano"}
        </button>
      </div>

      {formAberto && (
        <form onSubmit={criarPlano} style={{ ...cardStyle, marginTop: 20, display: "flex", flexDirection: "column", gap: 10 }}>
          {erro && <div style={{ color: "#C1442E", fontSize: 13 }}>{erro}</div>}
          <CamposPlano form={novoPlano} onChange={setNovoPlano} />
          <button type="submit" disabled={salvando} style={{ ...btnPrimary, width: 160 }}>
            {salvando ? "Criando…" : "Criar plano"}
          </button>
        </form>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginTop: 24 }}>
        {planos.map((plano) => (
          <div key={plano.id} style={{ ...cardStyle, opacity: plano.ativo ? 1 : 0.55 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ fontSize: 15, fontWeight: 800 }}>{plano.nome}</div>
              {!plano.ativo && <span style={badgeStyle}>Desativado</span>}
            </div>

            {editandoId === plano.id ? (
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
                {erroEdicao && <div style={{ color: "#C1442E", fontSize: 12 }}>{erroEdicao}</div>}
                <CamposPlano form={edicao} onChange={setEdicao} />
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => salvarEdicao(plano.id)} disabled={salvandoEdicao} style={{ ...btnPrimary, flex: 1 }}>
                    {salvandoEdicao ? "Salvando…" : "Salvar alterações"}
                  </button>
                  <button onClick={() => setEditandoId(null)} style={{ ...btnSecondary, flex: 1 }}>
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 28, fontWeight: 800, marginTop: 6 }}>
                  {centavosParaReais(plano.precoCentavos)}
                  <span style={{ fontSize: 13, color: "#837A73", fontWeight: 600 }}>/mês</span>
                </div>
                <div style={{ fontSize: 12, color: "#837A73", marginTop: 2 }}>
                  {plano.limiteFuncionarios == null ? "Funcionários ilimitados" : `Até ${plano.limiteFuncionarios} funcionário(s)`}
                </div>

                <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid #F1EEE9" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#837A73", textTransform: "uppercase" }}>Plano anual</div>
                  <div style={{ fontSize: 15, fontWeight: 800, marginTop: 4 }}>
                    {centavosParaReais(calcularPrecoAnualCentavos(plano.precoCentavos, plano.descontoAnualTipo, plano.descontoAnualValor))}
                    <span style={{ fontSize: 12, color: "#837A73", fontWeight: 600 }}>
                      {" "}
                      (
                      {plano.descontoAnualTipo === TipoDesconto.PERCENTUAL
                        ? `${plano.descontoAnualValor}% off`
                        : `${centavosParaReais(plano.descontoAnualValor)} off`}
                      )
                    </span>
                  </div>
                </div>

                <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid #F1EEE9" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#837A73", textTransform: "uppercase" }}>
                    Suporte prioritário
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, marginTop: 4 }}>
                    {plano.atendimentoPrioritario ? `WhatsApp: ${plano.whatsappSuporte}` : "Somente e-mail (padrão)"}
                  </div>
                </div>

                <ul style={{ marginTop: 14, paddingLeft: 18, fontSize: 12.5, color: "#837A73" }}>
                  {plano.recursos.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>

                <button onClick={() => iniciarEdicao(plano)} style={{ ...btnSecondary, width: "100%", marginTop: 14 }}>
                  Editar plano
                </button>

                <div style={{ display: "flex", gap: 14, marginTop: 10 }}>
                  <button onClick={() => alternarAtivo(plano)} style={btnLink}>
                    {plano.ativo ? "Desativar" : "Reativar"}
                  </button>
                  <button
                    onClick={() => excluir(plano)}
                    disabled={excluindoId === plano.id}
                    style={{ ...btnLink, color: "#C1442E" }}
                  >
                    {excluindoId === plano.id ? "Excluindo…" : "Excluir"}
                  </button>
                </div>
                {erroExclusao?.id === plano.id && (
                  <div style={{ color: "#C1442E", fontSize: 12, marginTop: 6 }}>{erroExclusao.mensagem}</div>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const cardStyle: React.CSSProperties = { border: "1px solid #DEDAD4", borderRadius: 16, padding: 22, background: "white" };
const btnBase: React.CSSProperties = { border: "none", borderRadius: 9, padding: "9px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer" };
const btnPrimary: React.CSSProperties = { ...btnBase, background: "#C1652E", color: "white" };
const btnSecondary: React.CSSProperties = { ...btnBase, border: "1px solid #DEDAD4", background: "white" };
const btnLink: React.CSSProperties = { ...btnBase, background: "none", color: "#837A73", padding: "4px 0", textAlign: "left" };
const inputStyle: React.CSSProperties = { border: "1px solid #DEDAD4", borderRadius: 9, padding: "10px 12px", fontSize: 13 };
const badgeStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: "#837A73", background: "#F1EEE9", padding: "3px 8px", borderRadius: 999 };
