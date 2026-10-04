import { IsEmail, IsInt, IsOptional, IsString, Max, Min, MinLength, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { EnderecoDto } from "../../common/dto/endereco.dto";

// O dono do lava jato cadastra a conta do funcionário (nome/e-mail/senha) —
// não existe autocadastro de funcionário, é sempre um convite feito pelo dono.
export class CreateFuncionarioDto {
  @IsString()
  nome: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  senha: string;

  // Opcional (diferente do telefone de cliente/dono, que é obrigatório no
  // próprio autocadastro) — quem está preenchendo aqui é o dono, cadastrando
  // em nome de outra pessoa, então não trava a criação se ele não tiver a
  // mão o número do funcionário ainda. Só o dono tem acesso a esse campo (ver
  // FuncionariosService.listarDaLavaJato e UsuariosService.atualizarMeuPerfil,
  // que recusa o próprio funcionário tentando editar o telefone dele).
  @IsOptional()
  @IsString()
  @MinLength(8)
  telefone?: string;

  // Endereço completo do funcionário (CEP + campos separados) — obrigatório,
  // mas NUNCA é devolvido pro lava jato depois de cadastrado (nem em
  // listarDaLavaJato, nem no retorno deste próprio cadastro): o dono digita
  // aqui uma vez, só o próprio funcionário consegue ver/editar depois, em
  // "Perfil" (GET/PATCH /usuarios/meu-perfil). Ver comentário em
  // Usuario.endereco no schema.
  @ValidateNested()
  @Type(() => EnderecoDto)
  endereco: EnderecoDto;

  @IsOptional()
  @IsString()
  cargo?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  comissaoPercentual?: number;
}
