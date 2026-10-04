import { EnderecoDto } from "./dto/endereco.dto";

// "00000000" ou "00000-000" -> sempre "00000-000" (normaliza antes de gravar).
export function formatarCep(cep: string): string {
  const digitos = cep.replace(/\D/g, "");
  return digitos.replace(/^(\d{5})(\d{3})$/, "$1-$2");
}

// Monta a string de exibição (igual ao formato que o resto do app já lê como
// texto único — tela do cliente, painel SaaS etc) a partir dos campos
// estruturados do EnderecoDto.
export function montarEnderecoCompleto(e: EnderecoDto): string {
  const complemento = e.complemento?.trim() ? ` - ${e.complemento.trim()}` : "";
  return `${e.logradouro}, ${e.numero}${complemento} - ${e.bairro}, ${e.cidade} - ${e.uf.toUpperCase()}, ${formatarCep(e.cep)}`;
}

// Campos estruturados prontos pro `data` do Prisma (Usuario ou LavaJato
// compartilham exatamente essas colunas) — sempre inclui `endereco` (o texto
// já formatado) junto, pra nunca ficar dessincronizado dos campos separados.
export function camposEndereco(e: EnderecoDto) {
  return {
    cep: formatarCep(e.cep),
    logradouro: e.logradouro.trim(),
    numero: e.numero.trim(),
    complemento: e.complemento?.trim() || null,
    bairro: e.bairro.trim(),
    cidade: e.cidade.trim(),
    uf: e.uf.trim().toUpperCase(),
    endereco: montarEnderecoCompleto(e),
  };
}
