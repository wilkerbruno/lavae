import { IsEmail, IsInt, IsOptional, Min } from "class-validator";

export class UpdateConfiguracaoDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  diasTesteGratis?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  horasCarenciaAposVencimento?: number;

  // E-mail exibido na tela "Suporte" do app (cliente, funcionário e dono) —
  // ver ConfiguracoesController.obterSuporte.
  @IsOptional()
  @IsEmail()
  emailSuporte?: string;
}
