import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { Papel } from "@lavajato-app/shared";
import { AgendamentosService } from "./agendamentos.service";
import { CreateAgendamentoDto } from "./dto/create-agendamento.dto";
import { CreateAgendamentoLoteDto } from "./dto/create-agendamento-lote.dto";
import { CreateAgendamentoManualDto } from "./dto/create-agendamento-manual.dto";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthUser } from "../auth/jwt.strategy";

@Controller("agendamentos")
export class AgendamentosController {
  constructor(private agendamentosService: AgendamentosService) {}

  @Roles(Papel.CLIENTE)
  @Post()
  criar(@Body() dto: CreateAgendamentoDto, @CurrentUser() user: AuthUser) {
    return this.agendamentosService.criar(user.id, dto);
  }

  // Vários serviços (podem se repetir, ex: 2x lavagem, dois carros da família) num único
  // horário — é o que a tela de agendamento do app do cliente usa.
  @Roles(Papel.CLIENTE)
  @Post("lote")
  criarLote(@Body() dto: CreateAgendamentoLoteDto, @CurrentUser() user: AuthUser) {
    return this.agendamentosService.criarLote(user.id, dto);
  }

  @Roles(Papel.CLIENTE)
  @Get("meus")
  listarMeus(@CurrentUser() user: AuthUser) {
    return this.agendamentosService.listarMeusComoCliente(user.id);
  }

  // Lançamento manual pelo próprio lava jato/funcionário (cliente avulso ou
  // já cadastrado) — sem cobrança pelo app. Ver AgendamentosService.criarManual.
  @Roles(Papel.FUNCIONARIO, Papel.LAVAJATO_ADMIN)
  @Post("manual")
  criarManual(@Body() dto: CreateAgendamentoManualDto, @CurrentUser() user: AuthUser) {
    return this.agendamentosService.criarManual(user, dto);
  }

  // Status do pagamento (Pix/Cartão) de um agendamento recém-criado — a tela
  // de pagamento faz polling nisso enquanto espera confirmar. Precisa vir
  // ANTES de ":id/..." pra "pagamentos" não ser confundido com um id.
  @Roles(Papel.CLIENTE)
  @Get("pagamentos/:id")
  buscarPagamento(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.agendamentosService.buscarPagamento(id, user.id);
  }

  // Cliente desiste de pagar (ex: voltou da tela de pagamento sem concluir) —
  // libera o horário na hora em vez de deixar preso até PENDENTE_EXPIRA_MINUTOS
  // vencer sozinho. Só tem efeito enquanto ainda está PENDENTE; se já
  // aprovou/recusou nesse meio tempo, não desfaz nada (ver
  // AgendamentosService.cancelarPagamentoPendente).
  @Roles(Papel.CLIENTE)
  @Patch("pagamentos/:id/cancelar")
  cancelarPagamento(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.agendamentosService.cancelarPagamentoPendente(id, user.id);
  }

  // Agenda do próprio funcionário logado. ?data=2026-08-31 filtra o dia inteiro.
  @Roles(Papel.FUNCIONARIO)
  @Get("minha-agenda")
  minhaAgenda(@CurrentUser() user: AuthUser, @Query("data") data?: string) {
    const { inicio, fim } = this.parseIntervaloDia(data);
    return this.agendamentosService.listarAgendaFuncionario(user.id, inicio, fim);
  }

  // Agenda geral do lava jato (dono). ?funcionarioId filtra por profissional.
  @Roles(Papel.LAVAJATO_ADMIN)
  @Get("agenda-lavaJato")
  agendaLavaJato(@CurrentUser() user: AuthUser, @Query("data") data?: string, @Query("funcionarioId") funcionarioId?: string) {
    if (!user.lavaJatoId) throw new ForbiddenException("Usuário sem lava jato associado.");
    const { inicio, fim } = this.parseIntervaloDia(data);
    return this.agendamentosService.listarAgendaLavaJato(user.lavaJatoId, inicio, fim, funcionarioId);
  }

  @Patch(":id/cancelar")
  cancelar(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.agendamentosService.cancelar(id, user);
  }

  @Patch(":id/concluir")
  concluir(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.agendamentosService.concluir(id, user);
  }

  // Funcionário/dono marca que o cliente não apareceu — retém 50% do valor
  // pago (estorna o resto). Ver AgendamentosService.marcarNaoCompareceu.
  @Roles(Papel.FUNCIONARIO, Papel.LAVAJATO_ADMIN)
  @Patch(":id/nao-compareceu")
  marcarNaoCompareceu(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.agendamentosService.marcarNaoCompareceu(id, user);
  }

  // Funcionário/dono confirma que recebeu o pagamento em dinheiro na mão do
  // cliente, presencialmente. Ver AgendamentosService.confirmarPagamentoDinheiro.
  @Roles(Papel.FUNCIONARIO, Papel.LAVAJATO_ADMIN)
  @Patch(":id/confirmar-pagamento-dinheiro")
  confirmarPagamentoDinheiro(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.agendamentosService.confirmarPagamentoDinheiro(id, user);
  }

  private parseIntervaloDia(data?: string): { inicio?: Date; fim?: Date } {
    if (!data) return {};
    const inicio = new Date(`${data}T00:00:00`);
    const fim = new Date(`${data}T23:59:59.999`);
    return { inicio, fim };
  }
}
