import { IsString } from "class-validator";

export class CriarCheckoutDto {
  @IsString()
  planoId: string;
}
