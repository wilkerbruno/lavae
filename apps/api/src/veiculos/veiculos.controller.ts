import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { Papel } from "@lavajato-app/shared";
import { VeiculosService } from "./veiculos.service";
import { PlacaService } from "./placa.service";
import { SalvarVeiculoDto } from "./dto/salvar-veiculo.dto";
import { AtualizarVeiculoDto } from "./dto/atualizar-veiculo.dto";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthUser } from "../auth/jwt.strategy";

// Veículos do próprio CLIENTE logado (placa, modelo, porte).
@Controller("veiculos")
export class VeiculosController {
  constructor(private veiculosService: VeiculosService, private placaService: PlacaService) {}

  @Roles(Papel.CLIENTE)
  @Get()
  listar(@CurrentUser() user: AuthUser) {
    return this.veiculosService.listar(user.id);
  }

  // Preenche marca/modelo/cor pela placa. Opcional: se não houver provedor
  // configurado ou ele falhar, devolve { encontrado: false } (sempre 200).
  @Roles(Papel.CLIENTE)
  @Get("consultar-placa/:placa")
  consultarPlaca(@Param("placa") placa: string, @CurrentUser() user: AuthUser) {
    return this.placaService.consultar(user.id, placa);
  }

  @Roles(Papel.CLIENTE)
  @Post()
  criar(@Body() dto: SalvarVeiculoDto, @CurrentUser() user: AuthUser) {
    return this.veiculosService.criar(user.id, dto);
  }

  @Roles(Papel.CLIENTE)
  @Patch(":id")
  atualizar(@Param("id") id: string, @Body() dto: AtualizarVeiculoDto, @CurrentUser() user: AuthUser) {
    return this.veiculosService.atualizar(user.id, id, dto);
  }

  @Roles(Papel.CLIENTE)
  @Delete(":id")
  remover(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.veiculosService.remover(user.id, id);
  }
}
