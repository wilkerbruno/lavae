import { IsBoolean, IsInt, IsOptional, IsString, Max, Min, MinLength } from "class-validator";

export class UpdateFuncionarioDto {
  @IsOptional()
  @IsString()
  cargo?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  comissaoPercentual?: number;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;

  @IsOptional()
  @IsBoolean()
  disponivel?: boolean;

  // Mora em Usuario, não em Funcionario — ver FuncionariosService.atualizar,
  // que separa esse campo do resto antes de gravar. Só o dono edita (é quem
  // chama este endpoint); o próprio funcionário não tem como mudar o seu.
  @IsOptional()
  @IsString()
  @MinLength(8)
  telefone?: string;
}
