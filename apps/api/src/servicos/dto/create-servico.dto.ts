import { IsInt, IsOptional, IsPositive, IsString, Min } from "class-validator";

export class CreateServicoDto {
  @IsString()
  nome: string;

  @IsOptional()
  @IsString()
  descricao?: string;

  @IsInt()
  @Min(5)
  duracaoMinutos: number;

  // Preço em centavos (evita erro de arredondamento com float). Ex: R$ 45,00 = 4500.
  @IsInt()
  @IsPositive()
  precoCentavos: number;
}
