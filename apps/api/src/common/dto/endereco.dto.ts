import { IsOptional, IsString, Length, Matches, MinLength } from "class-validator";

// Endereço completo, em campos separados (CEP + logradouro/número/bairro/
// cidade/UF) — usado em qualquer cadastro que exige endereço (cliente,
// funcionário, lava jato). O app preenche logradouro/bairro/cidade/UF
// automaticamente a partir do CEP (consulta ViaCEP no próprio app, antes de
// enviar pra API) — número e complemento continuam digitados à mão, já que
// o CEP sozinho não sabe esses dados. Ver EnderecoUtil.montarEnderecoCompleto
// (usado pelos services pra gravar também a versão em texto único, que é o
// formato que o resto do código já espera ao LER um endereço).
export class EnderecoDto {
  @IsString()
  @Matches(/^\d{5}-?\d{3}$/, { message: "CEP inválido. Use o formato 00000-000." })
  cep: string;

  @IsString()
  @MinLength(2)
  logradouro: string;

  @IsString()
  @MinLength(1)
  numero: string;

  @IsOptional()
  @IsString()
  complemento?: string;

  @IsString()
  @MinLength(2)
  bairro: string;

  @IsString()
  @MinLength(2)
  cidade: string;

  @IsString()
  @Length(2, 2, { message: "UF deve ter 2 letras (ex: MG)." })
  uf: string;
}
