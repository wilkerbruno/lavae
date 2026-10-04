import { IsEmail, IsOptional, IsString, MinLength, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { EnderecoDto } from "../../common/dto/endereco.dto";

// "Perfil" no menu de cliente/funcionário/dono — cada um edita os próprios
// dados cadastrais básicos. O telefone é aceito aqui pra CLIENTE e
// LAVAJATO_ADMIN; pra FUNCIONARIO, UsuariosService.atualizarMeuPerfil recusa
// a mudança (só o dono do lava jato edita o telefone de um funcionário, pela
// tela Equipe — ver FuncionariosService.atualizar).
export class UpdateMeuPerfilDto {
  @IsOptional()
  @IsString()
  nome?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  telefone?: string;

  // CLIENTE e FUNCIONARIO editam o próprio endereço por aqui (CEP + campos
  // separados — é obrigatório só no cadastro — ver
  // RegisterClienteDto/CreateFuncionarioDto; depois de criada a conta, dá
  // pra corrigir/completar à vontade). LAVAJATO_ADMIN não usa este campo (o
  // endereço que importa pra ele é o da LavaJato, editado em
  // PATCH /lavajatos/:id).
  @IsOptional()
  @ValidateNested()
  @Type(() => EnderecoDto)
  endereco?: EnderecoDto;
}
