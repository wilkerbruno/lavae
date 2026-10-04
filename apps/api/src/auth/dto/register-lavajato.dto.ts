import { IsEmail, IsString, MinLength, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { EnderecoDto } from "../../common/dto/endereco.dto";

// Onboarding de uma novo lava jato no SaaS: cria o tenant (LavaJato) +
// o usuário dono (papel LAVAJATO_ADMIN) + assinatura em TRIAL no plano informado.
export class RegisterLavaJatoDto {
  @IsString()
  nomeLavaJato: string;

  @IsString()
  nomeDono: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  senha: string;

  // Vira tanto o telefone pessoal do dono (Usuario.telefone) quanto o
  // telefone de contato do lava jato (LavaJato.telefone, mostrado pro
  // cliente no botão "Ligar para o lava jato" — ver AuthService.registerLavaJato).
  @IsString()
  @MinLength(8)
  telefone: string;

  // Endereço completo do ESTABELECIMENTO (CEP + campos separados — LavaJato
  // .endereco/.cep/.logradouro/...) — diferente da localização por GPS
  // (latitude/longitude, capturada depois em "Mais > Localização"). Visível
  // pro cliente (é o endereço que ele usa pra achar o lava jato), ver
  // SELECT_PUBLICO em LavaJatosService.
  @ValidateNested()
  @Type(() => EnderecoDto)
  endereco: EnderecoDto;

  @IsString()
  planoId: string;
}
