import { ArrayMinSize, IsArray, IsInt, IsOptional, IsPositive, IsString } from "class-validator";

export class CreatePacoteDto {
  @IsString()
  nome: string;

  @IsOptional()
  @IsString()
  descricao?: string;

  @IsInt()
  @IsPositive()
  precoCentavos: number;

  // Ids dos serviços incluídos no pacote (ex: lavagem + cera).
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  servicoIds: string[];
}
