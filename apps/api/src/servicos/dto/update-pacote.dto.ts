import { PartialType } from "@nestjs/mapped-types";
import { IsBoolean, IsOptional } from "class-validator";
import { CreatePacoteDto } from "./create-pacote.dto";

export class UpdatePacoteDto extends PartialType(CreatePacoteDto) {
  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
