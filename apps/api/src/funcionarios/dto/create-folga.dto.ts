import { IsDateString, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateFolgaDto {
  @IsDateString()
  inicio: string;

  @IsDateString()
  fim: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  motivo?: string;
}
