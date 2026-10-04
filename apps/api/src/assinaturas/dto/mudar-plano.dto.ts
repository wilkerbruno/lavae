import { IsString } from "class-validator";

export class MudarPlanoDto {
  @IsString()
  planoId: string;
}
