import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { Papel } from "@lavajato-app/shared";
import { PlanosService } from "./planos.service";
import { CreatePlanoDto } from "./dto/create-plano.dto";
import { UpdatePlanoDto } from "./dto/update-plano.dto";
import { Roles } from "../common/decorators/roles.decorator";
import { Public } from "../common/decorators/public.decorator";

@Controller("planos")
export class PlanosController {
  constructor(private planosService: PlanosService) {}

  @Public()
  @Get()
  listarAtivos() {
    return this.planosService.listarAtivos();
  }

  @Roles(Papel.SAAS_ADMIN)
  @Get("todos")
  listarTodos() {
    return this.planosService.listarTodos();
  }

  @Roles(Papel.SAAS_ADMIN)
  @Post()
  criar(@Body() dto: CreatePlanoDto) {
    return this.planosService.criar(dto);
  }

  @Roles(Papel.SAAS_ADMIN)
  @Patch(":id")
  atualizar(@Param("id") id: string, @Body() dto: UpdatePlanoDto) {
    return this.planosService.atualizar(id, dto);
  }

  @Roles(Papel.SAAS_ADMIN)
  @Delete(":id")
  excluir(@Param("id") id: string) {
    return this.planosService.excluir(id);
  }
}
