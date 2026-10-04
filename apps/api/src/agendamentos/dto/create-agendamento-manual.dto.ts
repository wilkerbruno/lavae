import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsDateString, IsEnum, IsOptional, IsString, MaxLength, ValidateIf, ValidateNested } from "class-validator";
import { MetodoPagamento, PorteVeiculo } from "@lavajato-app/shared";

class ItemAgendamentoManualDto {
  @ValidateIf((dto) => !dto.pacoteId)
  @IsString()
  servicoId?: string;

  @ValidateIf((dto) => !dto.servicoId)
  @IsString()
  pacoteId?: string;
}

// Corpo de POST /agendamentos/manual — o próprio lava jato lança um horário
// na agenda (cliente que ligou/chegou sem usar o app, ex: cliente avulso sem
// conta). Não passa por pagamento pelo app (ver AgendamentosService.criarManual).
export class CreateAgendamentoManualDto {
  // Porte do veículo atendido — define preço e duração; placa e descrição
  // (ex: "Gol branco") são opcionais e só aparecem na agenda.
  @IsEnum(PorteVeiculo)
  porte: PorteVeiculo;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  veiculoPlaca?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  veiculoDescricao?: string;

  @IsString()
  funcionarioId: string;

  @IsDateString()
  inicio: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ItemAgendamentoManualDto)
  itens: ItemAgendamentoManualDto[];

  // Cliente já cadastrado no app OU nome/telefone de alguém sem conta — um
  // dos dois é obrigatório (ver validação em AgendamentosService.criarManual).
  @IsOptional()
  @IsString()
  clienteId?: string;

  @IsOptional()
  @IsString()
  clienteAvulsoNome?: string;

  @IsOptional()
  @IsString()
  clienteAvulsoTelefone?: string;

  // Como o lava jato recebeu por fora (dinheiro na mão, Pix fora do app,
  // cartão na própria maquininha) — não passa pelo Mercado Pago da
  // integração, só fica registrado pro Financeiro separar os 3 cards
  // (Pix/Cartão/Dinheiro). Omitido = Dinheiro (ver AgendamentosService.criarManual).
  @IsOptional()
  @IsEnum(MetodoPagamento)
  metodoPagamento?: MetodoPagamento;
}
