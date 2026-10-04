import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsPositive, IsString, Min, MinLength, ValidateIf } from "class-validator";
import { TipoDesconto } from "@lavajato-app/shared";

export class CreatePlanoDto {
  @IsString()
  nome: string;

  // Preço da mensalidade em centavos. Ex: R$ 129,00 = 12900.
  @IsInt()
  @IsPositive()
  precoCentavos: number;

  @IsOptional()
  @IsInt()
  limiteFuncionarios?: number; // omitido = ilimitado

  @IsArray()
  @IsString({ each: true })
  recursos: string[];

  // Desconto do plano ANUAL (12x o mensal) — ver calcularPrecoAnualCentavos
  // (pacote compartilhado). PERCENTUAL: descontoAnualValor em pontos
  // percentuais (0-100). VALOR_FIXO: descontoAnualValor em CENTAVOS abatidos
  // do total anual. Ambos opcionais na criação (default: 0% de desconto).
  @IsOptional()
  @IsIn([TipoDesconto.PERCENTUAL, TipoDesconto.VALOR_FIXO])
  descontoAnualTipo?: TipoDesconto;

  @IsOptional()
  @IsInt()
  @Min(0)
  descontoAnualValor?: number;

  // Atendimento prioritário: libera o WhatsApp abaixo na tela "Suporte" do
  // app (cliente, funcionário e dono) pra quem está num lava jato nesse
  // plano. Quando marcado, o WhatsApp é obrigatório (ver ValidateIf abaixo) —
  // não faz sentido oferecer o recurso sem o número pra chamar.
  @IsOptional()
  @IsBoolean()
  atendimentoPrioritario?: boolean;

  @ValidateIf((o) => o.atendimentoPrioritario === true)
  @IsString()
  @MinLength(8)
  whatsappSuporte?: string;
}
