import { IsNotEmpty, IsString } from "class-validator";

export class SalvarPushTokenDto {
  @IsString()
  @IsNotEmpty()
  pushToken: string;
}
