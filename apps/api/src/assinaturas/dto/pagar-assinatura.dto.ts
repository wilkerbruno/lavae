import { IsIn, IsOptional, IsString, ValidateIf } from "class-validator";
import { MetodoPagamento, PeriodicidadeAssinatura } from "@lavajato-app/shared";

// Corpo de POST /assinaturas/minha/pagar — mesmo espírito de
// CreateAgendamentoLoteDto (pagamento nativo, cartão já tokenizado no app ou
// Pix), só que pra mensalidade/anuidade do SaaS em vez de um agendamento.
export class PagarAssinaturaDto {
  @IsString()
  planoId: string;

  @IsIn([PeriodicidadeAssinatura.MENSAL, PeriodicidadeAssinatura.ANUAL])
  periodicidade: PeriodicidadeAssinatura;

  @IsIn([MetodoPagamento.PIX, MetodoPagamento.CARTAO])
  metodoPagamento: MetodoPagamento;

  // Só quando metodoPagamento = CARTAO — cartão já tokenizado no app (novo ou
  // salvo, ver CartaoScreen/hook compartilhado no mobile). Nunca o número do
  // cartão em si.
  @ValidateIf((dto) => dto.metodoPagamento === MetodoPagamento.CARTAO)
  @IsString()
  cartaoToken?: string;

  @ValidateIf((dto) => dto.metodoPagamento === MetodoPagamento.CARTAO)
  @IsString()
  cartaoBin?: string;

  @ValidateIf((dto) => dto.metodoPagamento === MetodoPagamento.CARTAO)
  @IsString()
  cartaoCpf?: string;

  @IsOptional()
  @IsString()
  cartaoDeviceId?: string;
}
