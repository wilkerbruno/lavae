import { IsIn } from "class-validator";
import { StatusAssinatura } from "@lavajato-app/shared";

// Usado pelo SAAS_ADMIN pra suspender/reativar manualmente a assinatura de
// um lava jato (ex: inadimplência tratada fora do gateway, cortesia, etc).
export class DefinirStatusAssinaturaDto {
  @IsIn(Object.values(StatusAssinatura))
  status: StatusAssinatura;
}
