import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post } from "@nestjs/common";
import { Papel } from "@lavajato-app/shared";
import { FuncionariosService } from "./funcionarios.service";
import { CreateFuncionarioDto } from "./dto/create-funcionario.dto";
import { UpdateFuncionarioDto } from "./dto/update-funcionario.dto";
import { DefinirHorariosDto } from "./dto/definir-horarios.dto";
import { CreateFolgaDto } from "./dto/create-folga.dto";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthUser } from "../auth/jwt.strategy";

@Controller("funcionarios")
export class FuncionariosController {
  constructor(private funcionariosService: FuncionariosService) {}

  // ---------- Gestão da equipe (o dono do lava jato) ----------

  @Roles(Papel.LAVAJATO_ADMIN)
  @Get()
  listar(@CurrentUser() user: AuthUser) {
    if (!user.lavaJatoId) throw new ForbiddenException("Usuário sem lava jato associado.");
    return this.funcionariosService.listarDaLavaJato(user.lavaJatoId);
  }

  @Roles(Papel.LAVAJATO_ADMIN)
  @Post()
  criar(@Body() dto: CreateFuncionarioDto, @CurrentUser() user: AuthUser) {
    if (!user.lavaJatoId) throw new ForbiddenException("Usuário sem lava jato associado.");
    return this.funcionariosService.criar(user.lavaJatoId, dto);
  }

  @Roles(Papel.LAVAJATO_ADMIN)
  @Patch(":id")
  atualizar(@Param("id") id: string, @Body() dto: UpdateFuncionarioDto, @CurrentUser() user: AuthUser) {
    if (!user.lavaJatoId) throw new ForbiddenException("Usuário sem lava jato associado.");
    return this.funcionariosService.atualizar(id, user.lavaJatoId, dto);
  }

  // Só o id do cadastro na equipe do funcionário logado — usado pra lançar
  // um agendamento manual na própria agenda (ver AgendamentosController).
  @Roles(Papel.FUNCIONARIO)
  @Get("meu-id")
  meuId(@CurrentUser() user: AuthUser) {
    return this.funcionariosService.buscarMeuId(user.id);
  }

  // ---------- Horário de trabalho semanal (o próprio funcionário) ----------

  @Roles(Papel.FUNCIONARIO)
  @Get("meus-horarios")
  meusHorarios(@CurrentUser() user: AuthUser) {
    return this.funcionariosService.listarMeusHorarios(user.id);
  }

  @Roles(Papel.FUNCIONARIO)
  @Post("meus-horarios")
  definirMeusHorarios(@Body() dto: DefinirHorariosDto, @CurrentUser() user: AuthUser) {
    return this.funcionariosService.definirMeusHorarios(user.id, dto);
  }

  // ---------- Folgas / bloqueios pontuais (o próprio funcionário) ----------

  @Roles(Papel.FUNCIONARIO)
  @Get("minhas-folgas")
  minhasFolgas(@CurrentUser() user: AuthUser) {
    return this.funcionariosService.listarMinhasFolgas(user.id);
  }

  @Roles(Papel.FUNCIONARIO)
  @Post("minhas-folgas")
  criarMinhaFolga(@Body() dto: CreateFolgaDto, @CurrentUser() user: AuthUser) {
    return this.funcionariosService.criarMinhaFolga(user.id, dto);
  }

  @Roles(Papel.FUNCIONARIO)
  @Delete("minhas-folgas/:id")
  removerMinhaFolga(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.funcionariosService.removerMinhaFolga(user.id, id);
  }

  // ---------- Horário de trabalho / folgas de um funcionário (o dono do lava jato) ----------

  @Roles(Papel.LAVAJATO_ADMIN)
  @Get(":id/horarios")
  horariosDoFuncionario(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    if (!user.lavaJatoId) throw new ForbiddenException("Usuário sem lava jato associado.");
    return this.funcionariosService.listarHorariosDoFuncionario(id, user.lavaJatoId);
  }

  @Roles(Papel.LAVAJATO_ADMIN)
  @Post(":id/horarios")
  definirHorariosDoFuncionario(@Param("id") id: string, @Body() dto: DefinirHorariosDto, @CurrentUser() user: AuthUser) {
    if (!user.lavaJatoId) throw new ForbiddenException("Usuário sem lava jato associado.");
    return this.funcionariosService.definirHorariosDoFuncionario(id, user.lavaJatoId, dto);
  }

  @Roles(Papel.LAVAJATO_ADMIN)
  @Get(":id/folgas")
  folgasDoFuncionario(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    if (!user.lavaJatoId) throw new ForbiddenException("Usuário sem lava jato associado.");
    return this.funcionariosService.listarFolgasDoFuncionario(id, user.lavaJatoId);
  }

  @Roles(Papel.LAVAJATO_ADMIN)
  @Post(":id/folgas")
  criarFolgaDoFuncionario(@Param("id") id: string, @Body() dto: CreateFolgaDto, @CurrentUser() user: AuthUser) {
    if (!user.lavaJatoId) throw new ForbiddenException("Usuário sem lava jato associado.");
    return this.funcionariosService.criarFolgaDoFuncionario(id, user.lavaJatoId, dto);
  }

  @Roles(Papel.LAVAJATO_ADMIN)
  @Delete(":id/folgas/:folgaId")
  removerFolgaDoFuncionario(@Param("id") id: string, @Param("folgaId") folgaId: string, @CurrentUser() user: AuthUser) {
    if (!user.lavaJatoId) throw new ForbiddenException("Usuário sem lava jato associado.");
    return this.funcionariosService.removerFolgaDoFuncionario(id, user.lavaJatoId, folgaId);
  }
}
