import { IsDateString, IsIn, IsOptional, IsString, ValidateIf } from "class-validator";
import { MetodoPagamento } from "@lavajato-app/shared";

// O cliente escolhe OU um serviço avulso OU um pacote — nunca os dois. Por
// baixo, isso vira uma chamada a criarLote com um item só (ver
// AgendamentosService.criar) — mesmo fluxo de pagamento do lote.
export class CreateAgendamentoDto {
  @IsString()
  veiculoId: string;

  @IsString()
  funcionarioId: string;

  @ValidateIf((dto) => !dto.pacoteId)
  @IsString()
  servicoId?: string;

  @ValidateIf((dto) => !dto.servicoId)
  @IsString()
  pacoteId?: string;

  @IsDateString()
  inicio: string;

  @IsOptional()
  @IsIn([MetodoPagamento.PIX, MetodoPagamento.CARTAO, MetodoPagamento.DINHEIRO])
  metodoPagamento?: MetodoPagamento;
}
