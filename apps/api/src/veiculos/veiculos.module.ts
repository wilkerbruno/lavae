import { Module } from "@nestjs/common";
import { VeiculosController } from "./veiculos.controller";
import { VeiculosService } from "./veiculos.service";
import { PlacaService } from "./placa.service";

@Module({
  controllers: [VeiculosController],
  providers: [VeiculosService, PlacaService],
  exports: [VeiculosService],
})
export class VeiculosModule {}
