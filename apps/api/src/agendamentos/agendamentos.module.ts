import { Module } from "@nestjs/common";
import { AgendamentosController } from "./agendamentos.controller";
import { AgendamentosService } from "./agendamentos.service";
import { PagamentosModule } from "../pagamentos/pagamentos.module";
import { ConfiguracoesModule } from "../configuracoes/configuracoes.module";
import { PushModule } from "../push/push.module";
import { VeiculosModule } from "../veiculos/veiculos.module";

@Module({
  // PagamentosModule pelo MercadoPagoService, usado pra cobrar o cliente na
  // conta do lava jato (Pix/Cartão) e pra estornar a multa de não comparecimento.
  // ConfiguracoesModule pra saber a carência configurada (ver
  // garantirLavaJatoDisponivelParaAgendamento). PushModule pro lembrete de
  // dinheiro pendente (ver avisarPagamentosDinheiroNoHorario).
  imports: [PagamentosModule, ConfiguracoesModule, PushModule, VeiculosModule],
  controllers: [AgendamentosController],
  providers: [AgendamentosService],
  // LavaJatosModule usa isso para expor os endpoints de disponibilidade
  // (dias/horários livres) sob /lavajatos/:id/... .
  exports: [AgendamentosService],
})
export class AgendamentosModule {}
