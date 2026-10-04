import { PartialType } from "@nestjs/mapped-types";
import { IsBoolean, IsOptional } from "class-validator";
import { CreatePacoteMensalDto } from "./create-pacote-mensal.dto";

export class UpdatePacoteMensalDto extends PartialType(CreatePacoteMensalDto) {
  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
