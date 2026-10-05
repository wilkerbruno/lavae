import { IsEmail, IsString, Length, Matches, MinLength } from "class-validator";

export class EsqueciSenhaDto {
  @IsEmail()
  email: string;
}

export class VerificarCodigoDto {
  @IsEmail()
  email: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: "O código tem 6 dígitos." })
  codigo: string;
}

export class RedefinirSenhaDto {
  @IsString()
  @Length(10, 2000)
  token: string;

  @IsString()
  @MinLength(8, { message: "A nova senha deve ter no mínimo 8 caracteres." })
  novaSenha: string;

  @IsString()
  confirmarSenha: string;
}
