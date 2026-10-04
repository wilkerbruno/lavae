import { PartialType } from "@nestjs/mapped-types";
import { IsBoolean, IsOptional } from "class-validator";
import { CreateServicoDto } from "./create-servico.dto";

export class UpdateServicoDto extends PartialType(CreateServicoDto) {
  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
