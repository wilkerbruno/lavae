import { PartialType } from "@nestjs/mapped-types";
import { IsBoolean, IsOptional } from "class-validator";
import { CreatePlanoDto } from "./create-plano.dto";

export class UpdatePlanoDto extends PartialType(CreatePlanoDto) {
  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
