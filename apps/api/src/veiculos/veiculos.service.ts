import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { StatusAgendamento, StatusAssinaturaPacote, normalizarPlaca } from "@lavajato-app/shared";
import { PrismaService } from "../prisma/prisma.service";
import { SalvarVeiculoDto } from "./dto/salvar-veiculo.dto";
import { AtualizarVeiculoDto } from "./dto/atualizar-veiculo.dto";

// Formato antigo (Mercosul: ABC1D23) e o anterior (ABC1234) têm 7 caracteres.
const PLACA_VALIDA = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/;

// Veículos do CLIENTE — cada um define o porte (preço e duração) usado nos
// agendamentos e nos pacotes mensais. Sempre escopado ao dono: nenhum método
// aqui devolve o veículo de outro cliente.
@Injectable()
export class VeiculosService {
  constructor(private prisma: PrismaService) {}

  listar(clienteId: string) {
    return this.prisma.veiculo.findMany({ where: { clienteId }, orderBy: { criadoEm: "asc" } });
  }

  async criar(clienteId: string, dto: SalvarVeiculoDto) {
    const placa = this.validarPlaca(dto.placa);
    await this.garantirPlacaLivre(clienteId, placa);
    return this.prisma.veiculo.create({
      data: {
        clienteId,
        placa,
        marca: dto.marca?.trim() || null,
        modelo: dto.modelo.trim(),
        cor: dto.cor?.trim() || null,
        porte: dto.porte,
      },
    });
  }

  async atualizar(clienteId: string, id: string, dto: AtualizarVeiculoDto) {
    const veiculo = await this.buscarDoCliente(clienteId, id);
    const dados: Record<string, unknown> = {};
    if (dto.placa !== undefined) {
      const placa = this.validarPlaca(dto.placa);
      if (placa !== veiculo.placa) await this.garantirPlacaLivre(clienteId, placa);
      dados.placa = placa;
    }
    if (dto.marca !== undefined) dados.marca = dto.marca.trim() || null;
    if (dto.modelo !== undefined) dados.modelo = dto.modelo.trim();
    if (dto.cor !== undefined) dados.cor = dto.cor.trim() || null;
    if (dto.porte !== undefined) dados.porte = dto.porte;
    return this.prisma.veiculo.update({ where: { id }, data: dados });
  }

  async remover(clienteId: string, id: string) {
    await this.buscarDoCliente(clienteId, id);

    // Não deixa excluir um veículo que ainda tem pacote mensal vigente ou
    // atendimento por vir — o cliente precisa cancelar/concluir antes.
    const [assinaturasVigentes, agendamentosFuturos] = await Promise.all([
      this.prisma.assinaturaPacoteCliente.count({
        where: {
          veiculoId: id,
          status: { in: [StatusAssinaturaPacote.ATIVA, StatusAssinaturaPacote.PENDENTE, StatusAssinaturaPacote.INADIMPLENTE] },
        },
      }),
      this.prisma.agendamento.count({
        where: {
          veiculoId: id,
          inicio: { gte: new Date() },
          status: { in: [StatusAgendamento.PENDENTE, StatusAgendamento.CONFIRMADO] },
        },
      }),
    ]);
    if (assinaturasVigentes > 0) {
      throw new BadRequestException("Esse veículo tem um pacote mensal vigente. Cancele o pacote antes de remover o veículo.");
    }
    if (agendamentosFuturos > 0) {
      throw new BadRequestException("Esse veículo tem agendamentos por vir. Cancele-os antes de remover o veículo.");
    }

    // Assinaturas já canceladas ainda apontam pro veículo (FK com Restrict) —
    // nesse caso o cadastro fica guardado e a remoção é recusada com clareza,
    // em vez de estourar um erro de banco.
    const historico = await this.prisma.assinaturaPacoteCliente.count({ where: { veiculoId: id } });
    if (historico > 0) {
      throw new ConflictException("Esse veículo tem histórico de pacote mensal e não pode ser removido.");
    }

    await this.prisma.veiculo.delete({ where: { id } });
    return { ok: true };
  }

  // Usado por AgendamentosService/PacotesMensaisService: devolve o veículo só
  // se pertencer ao cliente (404 caso contrário — não revela se existe).
  buscarDoCliente(clienteId: string, id: string) {
    return this.prisma.veiculo.findFirst({ where: { id, clienteId } }).then((v) => {
      if (!v) throw new NotFoundException("Veículo não encontrado.");
      return v;
    });
  }

  private validarPlaca(placaDigitada: string): string {
    const placa = normalizarPlaca(placaDigitada);
    if (!PLACA_VALIDA.test(placa)) {
      throw new BadRequestException("Placa inválida. Use o formato ABC1D23 ou ABC-1234.");
    }
    return placa;
  }

  private async garantirPlacaLivre(clienteId: string, placa: string) {
    const existente = await this.prisma.veiculo.findUnique({ where: { clienteId_placa: { clienteId, placa } } });
    if (existente) throw new ConflictException("Você já cadastrou um veículo com essa placa.");
  }
}
