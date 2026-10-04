import { IsNotEmpty, IsString, IsUUID, Matches } from "class-validator";

export class SalvarCartaoDto {
  @IsUUID()
  lavaJatoId: string;

  // Token de uso único gerado pelo próprio app direto com o Mercado Pago
  // (POST /v1/card_tokens) — o número completo do cartão nunca chega aqui
  // (ver CartaoScreen no mobile e MercadoPagoService.salvarCartaoNoCustomer).
  // Sempre um token NOVO e diferente do usado pra cobrar o agendamento —
  // um token do Mercado Pago só serve pra uma operação (ver CartaoScreen).
  @IsString()
  @IsNotEmpty()
  cartaoToken: string;

  // 6 primeiros dígitos do cartão — mesmo dado que já ia em `cartaoBin` no
  // pagamento avulso (ver create-agendamento-lote.dto.ts), guardado aqui pra
  // reconhecer a bandeira de novo quando esse cartão salvo for usado num
  // pagamento futuro (ver CartaoSalvo.bin no schema).
  @Matches(/^\d{6}$/, { message: "bin deve ter exatamente 6 dígitos." })
  bin: string;
}
