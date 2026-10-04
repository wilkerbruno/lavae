import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsDateString, IsIn, IsOptional, IsString, ValidateIf, ValidateNested } from "class-validator";
import { MetodoPagamento } from "@lavajato-app/shared";

// Um item do "carrinho" de serviços — igual ao CreateAgendamentoDto, mas sem o
// horário/profissional (que são únicos pra todo o lote, não por item).
class ItemAgendamentoLoteDto {
  @ValidateIf((dto) => !dto.pacoteId)
  @IsString()
  servicoId?: string;

  @ValidateIf((dto) => !dto.servicoId)
  @IsString()
  pacoteId?: string;
}

// O cliente escolhe um ou mais serviços (pode repetir o mesmo, ex: 2x lavagem
// pra dois carros) e um único horário de início — o servidor encadeia cada
// item em sequência a partir daí (ver AgendamentosService.criarLote).
export class CreateAgendamentoLoteDto {
  // Veículo do cliente que será atendido — o porte dele define o preço e a
  // duração de cada serviço (ver AgendamentosService.resolverItem).
  @IsString()
  veiculoId: string;

  // Se omitido, o servidor escolhe automaticamente qualquer profissional
  // disponível para o intervalo inteiro.
  @IsOptional()
  @IsString()
  funcionarioId?: string;

  @IsDateString()
  inicio: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ItemAgendamentoLoteDto)
  itens: ItemAgendamentoLoteDto[];

  // Como pagar: Pix (padrão), Cartão via checkout do Mercado Pago, ou
  // Dinheiro na hora do atendimento (ver AgendamentosService.criarLote) — Pix
  // e Cartão exigem o lava jato ter conectado a própria conta Mercado Pago
  // (Mais > Mercado Pago); Dinheiro não, já que nunca passa pelo gateway (o
  // agendamento nasce CONFIRMADO direto e o funcionário/lavajato confirmam o
  // recebimento depois — ver AgendamentosService.confirmarPagamentoDinheiro).
  // Ignorado quando o lote é coberto pela cota de um pacote mensal (ver
  // usarAssinaturaPacoteId abaixo).
  @IsOptional()
  @IsIn([MetodoPagamento.PIX, MetodoPagamento.CARTAO, MetodoPagamento.DINHEIRO])
  metodoPagamento?: MetodoPagamento;

  // Id de uma AssinaturaPacoteCliente ATIVA do cliente pra usar a cota do
  // pacote mensal em vez de pagar avulso — o servidor ainda confere se ela
  // cobre os serviços escolhidos, o dia da semana e se sobra cota (ver
  // AgendamentosService.encontrarAssinaturaPacoteElegivel). Se omitido, o
  // servidor tenta achar uma assinatura elegível sozinho; se nenhuma cobrir,
  // cai no pagamento avulso normal.
  @IsOptional()
  @IsString()
  usarAssinaturaPacoteId?: string;

  // Só quando metodoPagamento = CARTAO: dados do cartão já tokenizado no
  // app (formulário nativo com tokenização do Mercado Pago — ver
  // CartaoScreen no mobile) — nunca o número do cartão em si. O servidor usa
  // o BIN pra identificar a bandeira (payment_method_id) e cobra na hora via
  // MercadoPagoService.criarPagamentoCartao, sempre à vista.
  @ValidateIf((dto) => dto.metodoPagamento === MetodoPagamento.CARTAO)
  @IsString()
  cartaoToken?: string;

  @ValidateIf((dto) => dto.metodoPagamento === MetodoPagamento.CARTAO)
  @IsString()
  cartaoBin?: string;

  @ValidateIf((dto) => dto.metodoPagamento === MetodoPagamento.CARTAO)
  @IsString()
  cartaoCpf?: string;

  // Identificador do aparelho gerado pelo script antifraude do Mercado Pago
  // (window.MP_DEVICE_SESSION_ID, capturado numa WebView oculta em
  // CartaoScreen) — ajuda o antifraude do MP a avaliar risco (ver histórico
  // de rejeições "high_risk" em MercadoPagoService.criarPagamentoCartao).
  // Não é obrigatório: a coleta pode falhar ou expirar sem impedir o
  // pagamento, então não pode bloquear o cliente que não conseguiu gerá-lo.
  @IsOptional()
  @IsString()
  cartaoDeviceId?: string;
}
