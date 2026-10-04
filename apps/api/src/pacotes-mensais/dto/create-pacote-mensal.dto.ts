import { ArrayMinSize, IsArray, IsInt, IsOptional, IsPositive, IsString, Max, Min } from "class-validator";

// Cadastro de um pacote mensal pelo lava jato — mesmo padrão de
// CreatePacoteDto (servicos/dto), com os dois campos extras que definem a
// "cota": quantas vezes por semana e em quais dias dá pra usar.
export class CreatePacoteMensalDto {
  @IsString()
  nome: string;

  @IsOptional()
  @IsString()
  descricao?: string;

  @IsInt()
  @IsPositive()
  precoCentavos: number;

  // Quantas vezes por semana o cliente pode usar os serviços incluídos.
  @IsInt()
  @Min(1)
  @Max(30)
  vezesPorSemana: number;

  // Dias da semana em que dá pra agendar usando o pacote — 0=domingo ...
  // 6=sábado (igual Date.getDay()).
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  diasSemanaPermitidos: number[];

  // Ids dos serviços cobertos pela cota do pacote.
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  servicoIds: string[];
}
