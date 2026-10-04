import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { Papel } from "@lavajato-app/shared";
import { PrismaService } from "../prisma/prisma.service";
import { CreateFuncionarioDto } from "./dto/create-funcionario.dto";
import { UpdateFuncionarioDto } from "./dto/update-funcionario.dto";
import { DefinirHorariosDto } from "./dto/definir-horarios.dto";
import { CreateFolgaDto } from "./dto/create-folga.dto";
import { camposEndereco } from "../common/endereco.util";

@Injectable()
export class FuncionariosService {
  constructor(private prisma: PrismaService) {}

  // ---------- Gestão da equipe (LAVAJATO_ADMIN) ----------

  listarDaLavaJato(lavaJatoId: string) {
    return this.prisma.funcionario.findMany({
      where: { lavaJatoId },
      // telefone: só o dono vê (é quem chama este método) — ver comentário em
      // FuncionarioDetalhado (packages/shared) e UsuariosService.atualizarMeuPerfil.
      include: { usuario: { select: { id: true, nome: true, email: true, telefone: true } } },
      orderBy: { usuario: { nome: "asc" } },
    });
  }

  // Cria o login do funcionário (Usuario) + o cadastro na equipe (Funcionario)
  // numa mesma transação. Respeita o limite de funcionários do plano da
  // lava jato (null = ilimitado) — é o "convite" de um novo membro da equipe.
  async criar(lavaJatoId: string, dto: CreateFuncionarioDto) {
    const existente = await this.prisma.usuario.findUnique({ where: { email: dto.email } });
    if (existente) throw new ConflictException("Já existe uma conta com este e-mail.");

    await this.garantirDentroDoLimiteDoPlano(lavaJatoId);

    const senhaHash = await bcrypt.hash(dto.senha, 10);

    return this.prisma.$transaction(async (tx) => {
      const usuario = await tx.usuario.create({
        data: {
          nome: dto.nome,
          email: dto.email,
          senhaHash,
          telefone: dto.telefone,
          // Endereço do funcionário (obrigatório no cadastro). ATENÇÃO:
          // nunca incluir `cep`/`logradouro`/`numero`/`complemento`/`bairro`/
          // `cidade`/`uf`/`endereco` nos `select`/`include` de usuario feitos
          // a partir daqui (listarDaLavaJato, o retorno deste método,
          // atualizar) — o dono do lava jato nunca pode ver o endereço do
          // funcionário, só o próprio funcionário (via "meu-perfil", que usa
          // SELECT_SEGURO em UsuariosService).
          ...camposEndereco(dto.endereco),
          papel: Papel.FUNCIONARIO,
          lavaJatoId,
        },
      });

      return tx.funcionario.create({
        data: {
          usuarioId: usuario.id,
          lavaJatoId,
          cargo: dto.cargo ?? "Lavador",
          comissaoPercentual: dto.comissaoPercentual ?? 60,
        },
        include: { usuario: { select: { id: true, nome: true, email: true, telefone: true } } },
      });
    });
  }

  async atualizar(id: string, lavaJatoId: string, dto: UpdateFuncionarioDto) {
    await this.garantirDaLavaJato(id, lavaJatoId);

    // Reativar um funcionário desativado também respeita o limite do plano
    // (senão dava pra contornar o limite desativando/reativando gente).
    if (dto.ativo) {
      const funcionario = await this.prisma.funcionario.findUnique({ where: { id } });
      if (funcionario && !funcionario.ativo) {
        await this.garantirDentroDoLimiteDoPlano(lavaJatoId);
      }
    }

    // telefone mora em Usuario, o resto (cargo/comissão/ativo/disponível) mora
    // em Funcionario — separa antes de gravar, cada um na sua tabela.
    const { telefone, ...dadosFuncionario } = dto;

    return this.prisma.$transaction(async (tx) => {
      if (telefone !== undefined) {
        const funcionario = await tx.funcionario.findUniqueOrThrow({ where: { id } });
        await tx.usuario.update({ where: { id: funcionario.usuarioId }, data: { telefone } });
      }
      return tx.funcionario.update({
        where: { id },
        data: dadosFuncionario,
        include: { usuario: { select: { id: true, nome: true, email: true, telefone: true } } },
      });
    });
  }

  // Só o id do cadastro na equipe (Funcionario.id, diferente do id do
  // Usuario/login) — usado pra lançar um agendamento manual na própria
  // agenda (ver AgendamentosController.criarManual, que exige esse id).
  async buscarMeuId(usuarioId: string) {
    const funcionario = await this.buscarFuncionarioPorUsuario(usuarioId);
    return { id: funcionario.id };
  }

  // ---------- Horário de trabalho (o próprio funcionário edita o seu) ----------

  async listarMeusHorarios(usuarioId: string) {
    const funcionario = await this.buscarFuncionarioPorUsuario(usuarioId);
    return this.listarHorariosPorFuncionarioId(funcionario.id);
  }

  // Substitui a semana inteira de uma vez (mais simples do que um CRUD dia a
  // dia — a tela do app manda os 7 dias juntos, só com os que ele trabalha).
  async definirMeusHorarios(usuarioId: string, dto: DefinirHorariosDto) {
    const funcionario = await this.buscarFuncionarioPorUsuario(usuarioId);
    return this.definirHorariosPorFuncionarioId(funcionario.id, dto);
  }

  // ---------- Horário de trabalho (o dono do lava jato edita o de qualquer funcionário) ----------

  async listarHorariosDoFuncionario(funcionarioId: string, lavaJatoId: string) {
    await this.garantirDaLavaJato(funcionarioId, lavaJatoId);
    return this.listarHorariosPorFuncionarioId(funcionarioId);
  }

  async definirHorariosDoFuncionario(funcionarioId: string, lavaJatoId: string, dto: DefinirHorariosDto) {
    await this.garantirDaLavaJato(funcionarioId, lavaJatoId);
    return this.definirHorariosPorFuncionarioId(funcionarioId, dto);
  }

  // ---------- Folgas (o próprio funcionário edita as suas) ----------

  async listarMinhasFolgas(usuarioId: string) {
    const funcionario = await this.buscarFuncionarioPorUsuario(usuarioId);
    return this.listarFolgasPorFuncionarioId(funcionario.id);
  }

  async criarMinhaFolga(usuarioId: string, dto: CreateFolgaDto) {
    const funcionario = await this.buscarFuncionarioPorUsuario(usuarioId);
    return this.criarFolgaPorFuncionarioId(funcionario.id, dto);
  }

  async removerMinhaFolga(usuarioId: string, folgaId: string) {
    const funcionario = await this.buscarFuncionarioPorUsuario(usuarioId);
    return this.removerFolgaPorFuncionarioId(funcionario.id, folgaId);
  }

  // ---------- Folgas (o dono do lava jato edita as de qualquer funcionário) ----------

  async listarFolgasDoFuncionario(funcionarioId: string, lavaJatoId: string) {
    await this.garantirDaLavaJato(funcionarioId, lavaJatoId);
    return this.listarFolgasPorFuncionarioId(funcionarioId);
  }

  async criarFolgaDoFuncionario(funcionarioId: string, lavaJatoId: string, dto: CreateFolgaDto) {
    await this.garantirDaLavaJato(funcionarioId, lavaJatoId);
    return this.criarFolgaPorFuncionarioId(funcionarioId, dto);
  }

  async removerFolgaDoFuncionario(funcionarioId: string, lavaJatoId: string, folgaId: string) {
    await this.garantirDaLavaJato(funcionarioId, lavaJatoId);
    return this.removerFolgaPorFuncionarioId(funcionarioId, folgaId);
  }

  // ---------- implementação comum (horários/folgas), por Funcionario.id ----------

  private async listarHorariosPorFuncionarioId(funcionarioId: string) {
    return this.prisma.horarioTrabalho.findMany({ where: { funcionarioId }, orderBy: { diaSemana: "asc" } });
  }

  private async definirHorariosPorFuncionarioId(funcionarioId: string, dto: DefinirHorariosDto) {
    for (const dia of dto.dias) {
      if (dia.horaFim <= dia.horaInicio) {
        throw new BadRequestException(`O horário final precisa ser depois do inicial (dia ${dia.diaSemana}).`);
      }
      const temAlmoco = dia.inicioAlmoco && dia.fimAlmoco;
      if (temAlmoco && (dia.inicioAlmoco! < dia.horaInicio || dia.fimAlmoco! > dia.horaFim || dia.fimAlmoco! <= dia.inicioAlmoco!)) {
        throw new BadRequestException(`O horário de almoço precisa estar dentro do expediente (dia ${dia.diaSemana}).`);
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.horarioTrabalho.deleteMany({ where: { funcionarioId } });
      if (dto.dias.length > 0) {
        await tx.horarioTrabalho.createMany({
          data: dto.dias.map((dia) => ({
            funcionarioId,
            diaSemana: dia.diaSemana,
            horaInicio: dia.horaInicio,
            horaFim: dia.horaFim,
            inicioAlmoco: dia.inicioAlmoco,
            fimAlmoco: dia.fimAlmoco,
          })),
        });
      }
    });

    return this.listarHorariosPorFuncionarioId(funcionarioId);
  }

  private async listarFolgasPorFuncionarioId(funcionarioId: string) {
    return this.prisma.folga.findMany({
      where: { funcionarioId, fim: { gte: new Date() } },
      orderBy: { inicio: "asc" },
    });
  }

  private async criarFolgaPorFuncionarioId(funcionarioId: string, dto: CreateFolgaDto) {
    const inicio = new Date(dto.inicio);
    const fim = new Date(dto.fim);
    if (fim <= inicio) throw new BadRequestException("O fim da folga precisa ser depois do início.");

    return this.prisma.folga.create({
      data: { funcionarioId, inicio, fim, motivo: dto.motivo },
    });
  }

  private async removerFolgaPorFuncionarioId(funcionarioId: string, folgaId: string) {
    const folga = await this.prisma.folga.findUnique({ where: { id: folgaId } });
    if (!folga || folga.funcionarioId !== funcionarioId) throw new NotFoundException("Folga não encontrada.");
    await this.prisma.folga.delete({ where: { id: folgaId } });
    return { ok: true };
  }

  // ---------- helpers ----------

  private async buscarFuncionarioPorUsuario(usuarioId: string) {
    const funcionario = await this.prisma.funcionario.findUnique({ where: { usuarioId } });
    if (!funcionario) throw new NotFoundException("Cadastro de funcionário não encontrado para este usuário.");
    return funcionario;
  }

  private async garantirDaLavaJato(id: string, lavaJatoId: string) {
    const funcionario = await this.prisma.funcionario.findUnique({ where: { id } });
    if (!funcionario) throw new NotFoundException("Funcionário não encontrado.");
    if (funcionario.lavaJatoId !== lavaJatoId) throw new ForbiddenException("Funcionário não pertence ao seu lava jato.");
  }

  private async garantirDentroDoLimiteDoPlano(lavaJatoId: string) {
    const assinatura = await this.prisma.assinatura.findUnique({ where: { lavaJatoId }, include: { plano: true } });
    const limite = assinatura?.plano.limiteFuncionarios;
    if (limite == null) return; // sem assinatura encontrada ou plano ilimitado: não bloqueia

    const totalAtivos = await this.prisma.funcionario.count({ where: { lavaJatoId, ativo: true } });
    if (totalAtivos >= limite) {
      throw new BadRequestException(
        `Seu plano (${assinatura!.plano.nome}) permite até ${limite} funcionário${limite === 1 ? "" : "s"}. Desative alguém ou faça upgrade do plano pra adicionar mais.`,
      );
    }
  }
}
