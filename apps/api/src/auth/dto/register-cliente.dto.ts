import { IsEmail, IsString, MinLength, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { EnderecoDto } from "../../common/dto/endereco.dto";

// Cadastro de um cliente final (quem agenda horário no app).
export class RegisterClienteDto {
  @IsString()
  nome: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  senha: string;

  // Obrigatório: é o número que o lava jato usa pra ligar em caso de
  // imprevisto (ver botão "Ligar para o cliente" na agenda — AgendaScreen).
  @IsString()
  @MinLength(8)
  telefone: string;

  // Endereço completo do cliente (CEP + campos separados — o app preenche
  // logradouro/bairro/cidade/UF a partir do CEP via ViaCEP) — nunca é
  // devolvido pro lava jato/funcionário (ver comentário em Usuario.endereco
  // no schema e SELECT_SEGURO em UsuariosService; os selects usados por
  // FuncionariosService/AgendamentosService pra mostrar o cliente pra
  // lava jato nunca incluem este campo).
  @ValidateNested()
  @Type(() => EnderecoDto)
  endereco: EnderecoDto;
}
