import { IsEnum, IsOptional, IsString, Length, MaxLength } from "class-validator";
import { PorteVeiculo } from "@lavajato-app/shared";

// Corpo de POST /veiculos e PATCH /veiculos/:id (no PATCH, todos os campos
// são opcionais — ver AtualizarVeiculoDto).
export class SalvarVeiculoDto {
  // Placa em qualquer formato (ABC-1234 ou ABC1D23) — o servidor remove a
  // máscara e guarda em maiúsculas (ver VeiculosService/normalizarPlaca).
  @IsString()
  @Length(5, 10)
  placa: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  marca?: string;

  @IsString()
  @Length(1, 60)
  modelo: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  cor?: string;

  @IsEnum(PorteVeiculo)
  porte: PorteVeiculo;
}
