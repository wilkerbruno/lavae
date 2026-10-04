import { IsInt, IsLatitude, IsLongitude, IsOptional, IsString, Max, Min, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { EnderecoDto } from "../../common/dto/endereco.dto";

// Percentual (100 = valor do HATCH) por porte de veículo — todos os cinco
// portes são obrigatórios quando o objeto é enviado (ver AjustePorte no pacote
// shared). Limites generosos: de 10% a 500%.
export class AjustePorteDto {
  @IsInt() @Min(10) @Max(500) MOTO: number;
  @IsInt() @Min(10) @Max(500) HATCH: number;
  @IsInt() @Min(10) @Max(500) SEDAN: number;
  @IsInt() @Min(10) @Max(500) SUV: number;
  @IsInt() @Min(10) @Max(500) PICKUP: number;
}

export class UpdateLavaJatoDto {
  // Preço e duração por porte de veículo (Mais > Preço por porte no app).
  @IsOptional()
  @ValidateNested()
  @Type(() => AjustePorteDto)
  ajustePrecoPorte?: AjustePorteDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => AjustePorteDto)
  ajusteDuracaoPorte?: AjustePorteDto;

  @IsOptional()
  @IsString()
  nome?: string;

  // Endereço do estabelecimento (CEP + campos separados) — ver
  // EnderecoDto/EnderecoUtil. Opcional aqui (edição posterior); obrigatório
  // no cadastro inicial (RegisterLavaJatoDto).
  @IsOptional()
  @ValidateNested()
  @Type(() => EnderecoDto)
  endereco?: EnderecoDto;

  @IsOptional()
  @IsString()
  telefone?: string;

  // Preenchidos pela tela "Mais > Localização" do app (captura o GPS do
  // celular de quem está logado como dono do lava jato).
  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @IsLongitude()
  longitude?: number;
}
