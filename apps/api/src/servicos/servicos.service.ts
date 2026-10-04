import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateServicoDto } from "./dto/create-servico.dto";
import { UpdateServicoDto } from "./dto/update-servico.dto";
import { CreatePacoteDto } from "./dto/create-pacote.dto";
import { UpdatePacoteDto } from "./dto/update-pacote.dto";

@Injectable()
export class ServicosService {
  constructor(private prisma: PrismaService) {}

  // ---------- Catálogo público (usado pelo app do cliente) ----------

  listarServicosDaLavaJato(lavaJatoId: string) {
    return this.prisma.servico.findMany({
      where: { lavaJatoId, ativo: true },
      orderBy: { nome: "asc" },
    });
  }

  listarPacotesDaLavaJato(lavaJatoId: string) {
    return this.prisma.pacote.findMany({
      where: { lavaJatoId, ativo: true },
      include: { servicos: { include: { servico: true } } },
      orderBy: { nome: "asc" },
    });
  }

  // ---------- Gestão (LAVAJATO_ADMIN) ----------

  criarServico(lavaJatoId: string, dto: CreateServicoDto) {
    return this.prisma.servico.create({ data: { ...dto, lavaJatoId } });
  }

  async atualizarServico(id: string, lavaJatoId: string, dto: UpdateServicoDto) {
    await this.garantirServicoDaLavaJato(id, lavaJatoId);
    return this.prisma.servico.update({ where: { id }, data: dto });
  }

  async removerServico(id: string, lavaJatoId: string) {
    await this.garantirServicoDaLavaJato(id, lavaJatoId);
    // Soft delete: mantém histórico de agendamentos que referenciam este serviço.
    return this.prisma.servico.update({ where: { id }, data: { ativo: false } });
  }

  async criarPacote(lavaJatoId: string, dto: CreatePacoteDto) {
    const { servicoIds, ...dados } = dto;
    return this.prisma.pacote.create({
      data: {
        ...dados,
        lavaJatoId,
        servicos: { create: servicoIds.map((servicoId) => ({ servicoId })) },
      },
      include: { servicos: { include: { servico: true } } },
    });
  }

  async atualizarPacote(id: string, lavaJatoId: string, dto: UpdatePacoteDto) {
    await this.garantirPacoteDaLavaJato(id, lavaJatoId);
    const { servicoIds, ...dados } = dto;

    return this.prisma.$transaction(async (tx) => {
      if (servicoIds) {
        await tx.pacoteServico.deleteMany({ where: { pacoteId: id } });
        await tx.pacoteServico.createMany({
          data: servicoIds.map((servicoId) => ({ pacoteId: id, servicoId })),
        });
      }
      return tx.pacote.update({
        where: { id },
        data: dados,
        include: { servicos: { include: { servico: true } } },
      });
    });
  }

  async removerPacote(id: string, lavaJatoId: string) {
    await this.garantirPacoteDaLavaJato(id, lavaJatoId);
    return this.prisma.pacote.update({ where: { id }, data: { ativo: false } });
  }

  private async garantirServicoDaLavaJato(id: string, lavaJatoId: string) {
    const servico = await this.prisma.servico.findUnique({ where: { id } });
    if (!servico) throw new NotFoundException("Serviço não encontrado.");
    if (servico.lavaJatoId !== lavaJatoId) throw new ForbiddenException("Serviço não pertence ao seu lava jato.");
  }

  private async garantirPacoteDaLavaJato(id: string, lavaJatoId: string) {
    const pacote = await this.prisma.pacote.findUnique({ where: { id } });
    if (!pacote) throw new NotFoundException("Pacote não encontrado.");
    if (pacote.lavaJatoId !== lavaJatoId) throw new ForbiddenException("Pacote não pertence ao seu lava jato.");
  }
}
