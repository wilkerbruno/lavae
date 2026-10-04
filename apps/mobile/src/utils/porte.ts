import {
  AJUSTE_DURACAO_PORTE_PADRAO,
  AJUSTE_PRECO_PORTE_PADRAO,
  AjustePorte,
  PorteVeiculo,
  ROTULO_PORTE,
  duracaoParaPorte,
  normalizarAjustePorte,
  precoParaPorte,
} from "@lavajato-app/shared";

// Percentuais por porte do lava jato (preço e duração) já completados com o
// padrão — o dono pode não ter configurado nada ainda (null no banco).
export interface AjustesLavaJato {
  preco: AjustePorte;
  duracao: AjustePorte;
}

export function ajustesDoLavaJato(
  lavaJato?: { ajustePrecoPorte?: unknown; ajusteDuracaoPorte?: unknown } | null,
): AjustesLavaJato {
  return {
    preco: normalizarAjustePorte(lavaJato?.ajustePrecoPorte, AJUSTE_PRECO_PORTE_PADRAO),
    duracao: normalizarAjustePorte(lavaJato?.ajusteDuracaoPorte, AJUSTE_DURACAO_PORTE_PADRAO),
  };
}

// Preço e duração de um serviço/pacote para o porte do veículo escolhido —
// mesma conta que o servidor faz em AgendamentosService.resolverItem (as duas
// usam as funções do pacote shared, então nunca divergem).
export function valoresParaPorte(
  precoBaseCentavos: number,
  duracaoBaseMinutos: number,
  porte: PorteVeiculo,
  ajustes: AjustesLavaJato,
) {
  return {
    precoCentavos: precoParaPorte(precoBaseCentavos, porte, ajustes.preco),
    duracaoMinutos: duracaoParaPorte(duracaoBaseMinutos, porte, ajustes.duracao),
  };
}

// Menor preço entre todos os portes — usado onde ainda não se sabe qual é o
// veículo ("a partir de R$ X").
export function menorPrecoCentavos(precoBaseCentavos: number, ajustes: AjustesLavaJato): number {
  return Math.min(...Object.values(ajustes.preco).map((percentual) => Math.round((precoBaseCentavos * percentual) / 100)));
}

// Linha de texto do veículo atendido num agendamento ("Gol branco · ABC1D23 ·
// Hatch / compacto") — vazia se o agendamento não tem nenhum dado de veículo
// (agendamentos lançados antes dessa informação existir).
export function textoVeiculo(a: { porte?: PorteVeiculo | null; veiculoPlaca?: string | null; veiculoDescricao?: string | null }): string {
  const partes = [a.veiculoDescricao, a.veiculoPlaca, a.porte ? ROTULO_PORTE[a.porte] : null].filter(Boolean);
  return partes.join(" · ");
}
