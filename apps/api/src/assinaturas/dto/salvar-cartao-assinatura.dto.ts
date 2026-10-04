import { IsNotEmpty, IsString, Matches } from "class-validator";

// Igual a SalvarCartaoDto (ver apps/api/src/cartoes/dto/salvar-cartao.dto.ts),
// sem lavaJatoId — aqui é sempre o lava jato do usuário logado (LAVAJATO_ADMIN
// pagando a própria mensalidade do SaaS), nunca escolhida pelo corpo da requisição.
export class SalvarCartaoAssinaturaDto {
  // Token de uso único gerado pelo app direto com o Mercado Pago (POST
  // /v1/card_tokens) — o número completo do cartão nunca chega aqui.
  @IsString()
  @IsNotEmpty()
  cartaoToken: string;

  // 6 primeiros dígitos do cartão — guardado pra identificar a bandeira de
  // novo quando esse cartão salvo for reusado (ver CartaoSalvoAssinatura.bin).
  @Matches(/^\d{6}$/, { message: "bin deve ter exatamente 6 dígitos." })
  bin: string;
}
