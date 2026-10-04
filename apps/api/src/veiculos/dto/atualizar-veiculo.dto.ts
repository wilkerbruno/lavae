import { PartialType } from "@nestjs/mapped-types";
import { SalvarVeiculoDto } from "./salvar-veiculo.dto";

export class AtualizarVeiculoDto extends PartialType(SalvarVeiculoDto) {}
