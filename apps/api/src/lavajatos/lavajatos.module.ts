import { Module } from "@nestjs/common";
import { LavaJatosController } from "./lavajatos.controller";
import { LavaJatosService } from "./lavajatos.service";
import { AgendamentosModule } from "../agendamentos/agendamentos.module";
import { PagamentosModule } from "../pagamentos/pagamentos.module";
import { ConfiguracoesModule } from "../configuracoes/configuracoes.module";
import { LavaJatosMercadoPagoController } from "./mercadopago/lavajatos-mercadopago.controller";
import { LavaJatosMercadoPagoService } from "./mercadopago/lavajatos-mercadopago.service";

@Module({
  // Precisa do AgendamentosService pra expor dias/horários disponíveis sob
  // /lavajatos/:id/... (fica mais natural pro app do que sob /agendamentos/...).
  // PagamentosModule pelo MercadoPagoService, usado na conexão OAuth da conta
  // Mercado Pago de cada lava jato (ver ./mercadopago). ConfiguracoesModule
  // pra saber a carência configurada (listarProximas esconde lava jato
  // vencida há mais que isso — ver assinatura-status.util).
  imports: [AgendamentosModule, PagamentosModule, ConfiguracoesModule],
  controllers: [LavaJatosController, LavaJatosMercadoPagoController],
  providers: [LavaJatosService, LavaJatosMercadoPagoService],
})
export class LavaJatosModule {}
