import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreatePlanoDto } from "./dto/create-plano.dto";
import { UpdatePlanoDto } from "./dto/update-plano.dto";

@Injectable()
export class PlanosService {
  constructor(private prisma: PrismaService) {}

  // Público: usado na tela de onboarding ("escolha seu plano") antes do login existir.
  listarAtivos() {
    return this.prisma.plano.findMany({ where: { ativo: true }, orderBy: { precoCentavos: "asc" } });
  }

  // SAAS_ADMIN: enxerga também os planos desativados (legados).
  listarTodos() {
    return this.prisma.plano.findMany({ orderBy: { precoCentavos: "asc" } });
  }

  criar(dto: CreatePlanoDto) {
    return this.prisma.plano.create({ data: dto });
  }

  // É aqui que o SaaS "faz os valores": muda o preço da mensalidade de um
  // plano, e também qualquer outro campo (nome, limite, recursos, desconto
  // anual, suporte prioritário, ativo) — ver UpdatePlanoDto, que aceita tudo
  // que CreatePlanoDto aceita, mais `ativo`.
  atualizar(id: string, dto: UpdatePlanoDto) {
    return this.prisma.plano.update({ where: { id }, data: dto });
  }

  // Exclusão de verdade (não é o "desativar" de cima, que só esconde o plano
  // do onboarding). Só é possível apagar um plano que NUNCA foi usado — se
  // alguma lava jato (atual ou do histórico) já teve uma Assinatura ou
  // PagamentoAssinatura apontando pra ele, o banco recusa (FK) e devolvemos
  // um erro amigável explicando pra desativar em vez de excluir. Isso evita
  // deixar o registro de assinatura de alguém com um planoId órfão.
  async excluir(id: string) {
    try {
      await this.prisma.plano.delete({ where: { id } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
        throw new NotFoundException("Plano não encontrado.");
      }
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
        throw new ConflictException(
          "Esse plano já foi usado por algumo lava jato (atual ou no histórico de assinaturas) e não pode ser excluído. Desative o plano em vez de excluir.",
        );
      }
      throw e;
    }
  }
}
