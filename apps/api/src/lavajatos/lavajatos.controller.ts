import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { Papel } from "@lavajato-app/shared";
import { LavaJatosService } from "./lavajatos.service";
import { UpdateLavaJatoDto } from "./dto/update-lavajato.dto";
import { CreateAvaliacaoDto } from "./dto/create-avaliacao.dto";
import { AgendamentosService } from "../agendamentos/agendamentos.service";
import { Roles } from "../common/decorators/roles.decorator";
import { Public } from "../common/decorators/public.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthUser } from "../auth/jwt.strategy";

@Controller("lavajatos")
export class LavaJatosController {
  constructor(
    private lavaJatosService: LavaJatosService,
    private agendamentosService: AgendamentosService,
  ) {}

  // Painel SaaS: lista todas os lava jatos assinantes da plataforma.
  @Roles(Papel.SAAS_ADMIN)
  @Get()
  listarTodas() {
    return this.lavaJatosService.listarTodas();
  }

  // Home do app do cliente: lista os lava jatos perto dele (com busca por nome
  // opcional), já ordenada pra colocar à frente as que ele já frequentou e,
  // depois, as com melhor nota. Precisa vir ANTES de ":id" pra não ser
  // interpretada como um id de lava jato.
  @Roles(Papel.CLIENTE)
  @Get("proximas")
  listarProximas(
    @Query("lat") lat: string,
    @Query("lng") lng: string,
    @Query("raioKm") raioKm: string | undefined,
    @Query("q") q: string | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    const latitude = Number(lat);
    const longitude = Number(lng);
    if (lat === undefined || lng === undefined || Number.isNaN(latitude) || Number.isNaN(longitude)) {
      throw new BadRequestException("Informe os parâmetros lat e lng.");
    }
    return this.lavaJatosService.listarProximas(latitude, longitude, raioKm ? Number(raioKm) : undefined, q, user.id);
  }

  // Popup de avaliação pós-atendimento (ver PopupAvaliacaoPendente no app) —
  // não recebe id de lava jato (é por cliente, olhando todas), então também
  // precisa vir ANTES de ":id" pelo mesmo motivo de "proximas" acima.
  @Roles(Papel.CLIENTE)
  @Get("avaliacao-pendente")
  buscarAvaliacaoPendente(@CurrentUser() user: AuthUser) {
    return this.lavaJatosService.buscarAvaliacaoPendente(user.id);
  }

  // Público: dados mínimos pra Home do app do cliente (nome, endereço, estrelas).
  @Public()
  @Get(":id/publico")
  buscarInfoPublica(@Param("id") id: string) {
    return this.lavaJatosService.buscarInfoPublica(id);
  }

  @Get(":id")
  buscarPorId(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    this.garantirAcesso(id, user);
    return this.lavaJatosService.buscarPorId(id);
  }

  // Público: usado pelo app do cliente no passo "Escolher profissional".
  @Public()
  @Get(":id/funcionarios")
  listarFuncionarios(@Param("id") id: string) {
    return this.lavaJatosService.listarFuncionariosPublico(id);
  }

  // Público: dias do mês com pelo menos um horário livre pra duração total dos
  // serviços escolhidos — alimenta o calendário da tela de agendamento.
  // mes no formato "YYYY-MM".
  @Public()
  @Get(":id/dias-disponiveis")
  diasDisponiveis(
    @Param("id") id: string,
    @Query("mes") mes: string,
    @Query("duracaoMinutos") duracaoMinutos?: string,
  ) {
    const [ano, mesNum] = (mes ?? "").split("-").map(Number);
    if (!ano || !mesNum) throw new BadRequestException("Informe o parâmetro mes no formato YYYY-MM.");
    return this.agendamentosService.listarDiasDisponiveis(id, ano, mesNum, Number(duracaoMinutos) || 30);
  }

  // Público: horários livres (formato "HH:mm") num dia específico, pra duração
  // total dos serviços escolhidos. data no formato "YYYY-MM-DD".
  @Public()
  @Get(":id/horarios-disponiveis")
  horariosDisponiveis(
    @Param("id") id: string,
    @Query("data") data: string,
    @Query("duracaoMinutos") duracaoMinutos?: string,
    @Query("funcionarioId") funcionarioId?: string,
  ) {
    if (!data) throw new BadRequestException("Informe o parâmetro data no formato YYYY-MM-DD.");
    return this.agendamentosService.listarHorariosDisponiveis(id, data, Number(duracaoMinutos) || 30, funcionarioId);
  }

  @Roles(Papel.LAVAJATO_ADMIN)
  @Patch(":id")
  atualizar(@Param("id") id: string, @Body() dto: UpdateLavaJatoDto, @CurrentUser() user: AuthUser) {
    this.garantirAcesso(id, user);
    return this.lavaJatosService.atualizar(id, dto);
  }

  // Envio da logo — usado tanto logo após o cadastro do lava jato (Criar conta
  // de lava jato, no app) quanto depois, em "Mais > Logo". Recebe multipart
  // (campo "logo"); a API redimensiona/comprime antes de guardar.
  @Roles(Papel.LAVAJATO_ADMIN)
  @Post(":id/logo")
  @UseInterceptors(
    FileInterceptor("logo", { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  enviarLogo(
    @Param("id") id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthUser,
  ) {
    this.garantirAcesso(id, user);
    return this.lavaJatosService.atualizarLogo(id, file);
  }

  // Público: estrelas + comentários de quem já avaliou (tela de detalhe do lava jato).
  @Public()
  @Get(":id/avaliacoes")
  listarAvaliacoes(@Param("id") id: string) {
    return this.lavaJatosService.listarAvaliacoes(id);
  }

  // Cliente avalia (ou atualiza a própria avaliação) um lava jato.
  @Roles(Papel.CLIENTE)
  @Post(":id/avaliacoes")
  avaliar(@Param("id") id: string, @Body() dto: CreateAvaliacaoDto, @CurrentUser() user: AuthUser) {
    return this.lavaJatosService.avaliar(id, user.id, dto);
  }

  // Cliente logado busca a própria avaliação (pra pré-preencher as estrelas).
  @Roles(Papel.CLIENTE)
  @Get(":id/avaliacoes/minha")
  buscarMinhaAvaliacao(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.lavaJatosService.buscarMinhaAvaliacao(id, user.id);
  }

  // Um LAVAJATO_ADMIN só pode ler/editar o próprio lava jato; SAAS_ADMIN pode ver qualquer uma.
  private garantirAcesso(lavaJatoId: string, user: AuthUser) {
    if (user.papel === Papel.SAAS_ADMIN) return;
    if (user.lavaJatoId !== lavaJatoId) {
      throw new ForbiddenException("Você não tem acesso a este lava jato.");
    }
  }
}
