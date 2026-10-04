import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsString, Matches, Max, Min, ValidateNested } from "class-validator";

const FORMATO_HORA = /^([01]\d|2[0-3]):[0-5]\d$/; // "HH:mm", ex: "08:00", "20:00"

class HorarioTrabalhoDiaDto {
  @IsInt()
  @Min(0)
  @Max(6)
  diaSemana: number; // 0 = domingo ... 6 = sábado (igual ao Date.getDay() do JS)

  @IsString()
  @Matches(FORMATO_HORA, { message: "horaInicio deve estar no formato HH:mm" })
  horaInicio: string;

  @IsString()
  @Matches(FORMATO_HORA, { message: "horaFim deve estar no formato HH:mm" })
  horaFim: string;

  @IsOptional()
  @IsString()
  @Matches(FORMATO_HORA, { message: "inicioAlmoco deve estar no formato HH:mm" })
  inicioAlmoco?: string;

  @IsOptional()
  @IsString()
  @Matches(FORMATO_HORA, { message: "fimAlmoco deve estar no formato HH:mm" })
  fimAlmoco?: string;
}

// Substitui a semana de trabalho inteira do funcionário logado de uma vez —
// mais simples do que um CRUD dia a dia, já que é isso que a tela do app faz
// (um formulário com os 7 dias, salva tudo junto).
export class DefinirHorariosDto {
  @IsArray()
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => HorarioTrabalhoDiaDto)
  dias: HorarioTrabalhoDiaDto[];
}
