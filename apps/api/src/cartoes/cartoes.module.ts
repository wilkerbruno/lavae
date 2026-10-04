import { Module } from "@nestjs/common";
import { CartoesController } from "./cartoes.controller";
import { CartoesService } from "./cartoes.service";
import { PagamentosModule } from "../pagamentos/pagamentos.module";

@Module({
  imports: [PagamentosModule],
  controllers: [CartoesController],
  providers: [CartoesService],
})
export class CartoesModule {}
