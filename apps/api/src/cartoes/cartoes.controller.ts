import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Query } from "@nestjs/common";
import { Papel } from "@lavajato-app/shared";
import { CartoesService } from "./cartoes.service";
import { SalvarCartaoDto } from "./dto/salvar-cartao.dto";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthUser } from "../auth/jwt.strategy";

// Cartões salvos pelo CLIENTE pra pagar mais rápido da próxima vez — sempre
// escopados por lava jato (ver comentário em MercadoPagoService, seção
// CARTÕES SALVOS): o mesmo cliente pode ter cartões salvos diferentes em
// lava jatos diferentes.
@Controller("cartoes")
export class CartoesController {
  constructor(private cartoesService: CartoesService) {}

  @Roles(Papel.CLIENTE)
  @Get()
  listar(@CurrentUser() user: AuthUser, @Query("lavaJatoId") lavaJatoId?: string) {
    if (!lavaJatoId) throw new BadRequestException("Informe lavaJatoId.");
    return this.cartoesService.listar(user.id, lavaJatoId);
  }

  @Roles(Papel.CLIENTE)
  @Post()
  salvar(@Body() dto: SalvarCartaoDto, @CurrentUser() user: AuthUser) {
    return this.cartoesService.salvar(user.id, dto.lavaJatoId, dto.cartaoToken, dto.bin);
  }

  @Roles(Papel.CLIENTE)
  @Delete(":id")
  remover(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.cartoesService.remover(user.id, id);
  }
}
