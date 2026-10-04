import { Module } from "@nestjs/common";
import { AssinaturasController } from "./assinaturas.controller";
import { AssinaturasCartoesController } from "./assinaturas-cartoes.controller";
import { AssinaturasService } from "./assinaturas.service";
import { AssinaturasPagamentoService } from "./assinaturas-pagamento.service";
import { AssinaturasCartoesService } from "./assinaturas-cartoes.service";
import { PagamentosModule } from "../pagamentos/pagamentos.module";
import { ConfiguracoesModule } from "../configuracoes/configuracoes.module";
import { PushModule } from "../push/push.module";

@Module({
  imports: [PagamentosModule, ConfiguracoesModule, PushModule],
  controllers: [AssinaturasController, AssinaturasCartoesController],
  providers: [AssinaturasService, AssinaturasPagamentoService, AssinaturasCartoesService],
  // Exportado pro WebhooksModule poder delegar os eventos que não são de
  // nenhuma lava jato conectada (ver WebhooksService).
  exports: [AssinaturasService],
})
export class AssinaturasModule {}
