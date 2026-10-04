import { IsBoolean, IsIn, IsOptional, IsString, ValidateIf } from "class-validator";
import { MetodoPagamento } from "@lavajato-app/shared";

// Como o cliente quer pagar essa assinatura de pacote mensal — tudo
// resolvido dentro do próprio app, sem redirecionar pro site do Mercado
// Pago (ver PacotesMensaisService.assinar). Pix e Cartão continuam os dois
// disponíveis; só Cartão pode pedir renovação automática.
export class AssinarPacoteMensalDto {
  // Veículo do cliente coberto pelo pacote — o preço mensal depende do porte.
  @IsString()
  veiculoId: string;

  @IsIn([MetodoPagamento.PIX, MetodoPagamento.CARTAO])
  metodoPagamento: MetodoPagamento;

  // Só considerado quando metodoPagamento=CARTAO: true assina com cobrança
  // recorrente automática (Mercado Pago cobra o cartão sozinho todo mês, via
  // MercadoPagoService.criarPreapprovalComCartao, sem checkout hospedado);
  // omitido/false cobra só esse período agora (igual um pagamento avulso de
  // agendamento) e o cliente volta no app pra pagar de novo quando vencer.
  @IsOptional()
  @IsBoolean()
  automatico?: boolean;

  // Dados do cartão já tokenizado no app (formulário nativo ou re-tokenização
  // de um cartão salvo — ver CartaoScreen) — nunca o número do cartão em si.
  // Mesmo formato de CreateAgendamentoLoteDto.
  @ValidateIf((dto) => dto.metodoPagamento === MetodoPagamento.CARTAO)
  @IsString()
  cartaoToken?: string;

  @ValidateIf((dto) => dto.metodoPagamento === MetodoPagamento.CARTAO)
  @IsString()
  cartaoBin?: string;

  @ValidateIf((dto) => dto.metodoPagamento === MetodoPagamento.CARTAO)
  @IsString()
  cartaoCpf?: string;

  // Device ID antifraude do Mercado Pago (ver CreateAgendamentoLoteDto) —
  // opcional pelo mesmo motivo: a coleta pode falhar/expirar sem impedir o
  // pagamento.
  @IsOptional()
  @IsString()
  cartaoDeviceId?: string;
}
