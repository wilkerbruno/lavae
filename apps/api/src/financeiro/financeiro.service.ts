import { Injectable, NotFoundException } from "@nestjs/common";
import { MetodoPagamento, OrigemAgendamento, StatusAgendamento } from "@lavajato-app/shared";
import { PrismaService } from "../prisma/prisma.service";

type Periodo = "hoje" | "semana" | "mes";

export interface ResumoPorMetodo {
  atendimentos: number;
  brutoCentavos: number;
  taxasCentavos: number;
  liquidoCentavos: number;
}

function metodoVazio(): ResumoPorMetodo {
  return { atendimentos: 0, brutoCentavos: 0, taxasCentavos: 0, liquidoCentavos: 0 };
}

function intervaloPara(periodo: Periodo): { inicio: Date; fim: Date } {
  const agora = new Date();
  const fim = new Date(agora);
  const inicio = new Date(agora);

  if (periodo === "hoje") {
    inicio.setHours(0, 0, 0, 0);
  } else if (periodo === "semana") {
    inicio.setDate(inicio.getDate() - 7);
  } else {
    inicio.setDate(1);
    inicio.setHours(0, 0, 0, 0);
  }
  return { inicio, fim };
}

@Injectable()
export class FinanceiroService {
  constructor(private prisma: PrismaService) {}

  // Resumo financeiro de UM funcionário (o próprio app dele), a partir do id do Usuario.
  // Inclui, além dos atendimentos concluídos, a multa retida (50%) de
  // agendamentos em que o cliente não compareceu — ver AgendamentosService.
  // marcarNaoCompareceu. A comissão do funcionário incide só sobre o que foi
  // de fato atendido (CONCLUIDO), não sobre a multa.
  async resumoFuncionario(usuarioId: string, periodo: Periodo) {
    const funcionario = await this.prisma.funcionario.findUnique({ where: { usuarioId } });
    if (!funcionario) throw new NotFoundException("Cadastro de funcionário não encontrado para este usuário.");

    const { inicio, fim } = intervaloPara(periodo);
    const agendamentos = await this.prisma.agendamento.findMany({
      where: {
        funcionarioId: funcionario.id,
        status: { in: [StatusAgendamento.CONCLUIDO, StatusAgendamento.NAO_COMPARECEU] },
        inicio: { gte: inicio, lte: fim },
      },
    });
    const concluidos = agendamentos.filter((a) => a.status === StatusAgendamento.CONCLUIDO);
    const naoCompareceram = agendamentos.filter((a) => a.status === StatusAgendamento.NAO_COMPARECEU);

    const faturamentoConcluidosCentavos = concluidos.reduce((soma, a) => soma + a.precoCentavos, 0);
    const multasCentavos = naoCompareceram.reduce((soma, a) => soma + (a.valorMultaCentavos ?? 0), 0);
    const comissaoCentavos = Math.round((faturamentoConcluidosCentavos * funcionario.comissaoPercentual) / 100);

    return {
      periodo,
      atendimentos: concluidos.length,
      faturamentoCentavos: faturamentoConcluidosCentavos + multasCentavos,
      multasCentavos,
      comissaoCentavos,
    };
  }

  // Resumo consolidado do lava jato inteira (app do dono), com detalhamento por
  // funcionário, por serviço/pacote e por forma de pagamento (pra saber o que
  // realmente traz receita, e quanto disso o Mercado Pago já descontou).
  // porFuncionario/porServico contam só atendimentos concluídos de verdade;
  // a multa de não comparecimento entra separada, no total (ver multasCentavos).
  async resumoLavaJato(lavaJatoId: string, periodo: Periodo) {
    const { inicio, fim } = intervaloPara(periodo);

    const [todos, funcionarios] = await Promise.all([
      this.prisma.agendamento.findMany({
        where: { lavaJatoId, status: { in: [StatusAgendamento.CONCLUIDO, StatusAgendamento.NAO_COMPARECEU] }, inicio: { gte: inicio, lte: fim } },
        include: { servico: true, pacote: true },
      }),
      // Só .nome é usado abaixo (porFuncionario) — select explícito em vez de
      // include genérico pra nunca puxar telefone/endereco do funcionário pra
      // esse resumo financeiro (que é só números, não devia nem ter esses dados
      // na memória do processo).
      this.prisma.funcionario.findMany({
        where: { lavaJatoId },
        include: { usuario: { select: { id: true, nome: true } } },
      }),
    ]);
    const agendamentos = todos.filter((a) => a.status === StatusAgendamento.CONCLUIDO);
    const multasCentavos = todos
      .filter((a) => a.status === StatusAgendamento.NAO_COMPARECEU)
      .reduce((soma, a) => soma + (a.valorMultaCentavos ?? 0), 0);

    const porFuncionario = funcionarios.map((f) => {
      const doFuncionario = agendamentos.filter((a) => a.funcionarioId === f.id);
      const faturamentoCentavos = doFuncionario.reduce((soma, a) => soma + a.precoCentavos, 0);
      const comissaoCentavos = Math.round((faturamentoCentavos * f.comissaoPercentual) / 100);
      return {
        funcionarioId: f.id,
        nome: f.usuario.nome,
        atendimentos: doFuncionario.length,
        faturamentoCentavos,
        comissaoCentavos,
      };
    });

    const porServicoMap = new Map<string, { nome: string; atendimentos: number; faturamentoCentavos: number }>();
    for (const a of agendamentos) {
      const nome = a.servico?.nome ?? a.pacote?.nome ?? "Outro";
      const atual = porServicoMap.get(nome) ?? { nome, atendimentos: 0, faturamentoCentavos: 0 };
      atual.atendimentos += 1;
      atual.faturamentoCentavos += a.precoCentavos;
      porServicoMap.set(nome, atual);
    }
    const porServico = Array.from(porServicoMap.values()).sort((a, b) => b.faturamentoCentavos - a.faturamentoCentavos);

    // Detalhamento por forma de pagamento: pra um agendamento lançado
    // manualmente (origem LAVAJATO_MANUAL), o método já vem no próprio
    // Agendamento (metodoPagamentoManual — não existe Pagamento, foi recebido
    // por fora). Pra um agendamento vindo do app (origem CLIENTE_APP), o
    // método e a taxa descontada pelo Mercado Pago vêm do Pagamento ligado
    // pelo grupoId (ver schema.prisma) — busca todos de uma vez e soma a taxa
    // de cada Pagamento só uma vez (um grupo pode ter vários agendamentos
    // concluídos cobrados juntos por um único Pagamento). Agendamentos usando
    // cota de pacote mensal (assinaturaPacoteId) não entram aqui: não têm
    // Pagamento nem foram recebidos por fora, são receita de assinatura à parte.
    const gruposClienteApp = Array.from(
      new Set(
        agendamentos
          .filter((a) => a.origem === OrigemAgendamento.CLIENTE_APP && a.grupoId)
          .map((a) => a.grupoId as string),
      ),
    );
    const pagamentos = gruposClienteApp.length
      ? await this.prisma.pagamento.findMany({ where: { grupoId: { in: gruposClienteApp } } })
      : [];
    const pagamentoPorGrupo = new Map(pagamentos.map((p) => [p.grupoId as string, p]));

    const porMetodo: Record<MetodoPagamento, ResumoPorMetodo> = {
      PIX: metodoVazio(),
      CARTAO: metodoVazio(),
      DINHEIRO: metodoVazio(),
    };
    const gruposComTaxaContada = new Set<string>();
    for (const a of agendamentos) {
      let metodo: MetodoPagamento | null = null;
      let taxaDesseItemCentavos = 0;
      if (a.origem === OrigemAgendamento.LAVAJATO_MANUAL) {
        metodo = (a.metodoPagamentoManual as MetodoPagamento | null) ?? MetodoPagamento.DINHEIRO;
      } else if (a.grupoId) {
        const pagamento = pagamentoPorGrupo.get(a.grupoId);
        if (pagamento) {
          metodo = pagamento.metodo as MetodoPagamento;
          if (!gruposComTaxaContada.has(a.grupoId)) {
            taxaDesseItemCentavos = pagamento.taxaMercadoPagoCentavos;
            gruposComTaxaContada.add(a.grupoId);
          }
        }
      }
      if (!metodo || !porMetodo[metodo]) continue; // pacote mensal ou sem Pagamento identificável
      const bucket = porMetodo[metodo];
      bucket.atendimentos += 1;
      bucket.brutoCentavos += a.precoCentavos;
      bucket.taxasCentavos += taxaDesseItemCentavos;
    }
    for (const metodo of Object.keys(porMetodo) as MetodoPagamento[]) {
      porMetodo[metodo].liquidoCentavos = porMetodo[metodo].brutoCentavos - porMetodo[metodo].taxasCentavos;
    }
    const taxasMercadoPagoCentavos = Object.values(porMetodo).reduce((soma, m) => soma + m.taxasCentavos, 0);

    const faturamentoConcluidosCentavos = porFuncionario.reduce((soma, f) => soma + f.faturamentoCentavos, 0);
    const comissoesCentavos = porFuncionario.reduce((soma, f) => soma + f.comissaoCentavos, 0);
    // Bruto, igual sempre foi (mantido pra quem já lê esse campo há mais tempo).
    const faturamentoCentavos = faturamentoConcluidosCentavos + multasCentavos;
    // O que o lava jato de fato recebe, já descontada a taxa que o Mercado
    // Pago fica com uma parte (pedido explícito do dono) — é esse valor que
    // entra no lucro.
    const faturamentoLiquidoCentavos = faturamentoCentavos - taxasMercadoPagoCentavos;

    return {
      periodo,
      atendimentos: agendamentos.length,
      faturamentoCentavos,
      faturamentoLiquidoCentavos,
      taxasMercadoPagoCentavos,
      multasCentavos,
      comissoesCentavos,
      lucroCentavos: faturamentoLiquidoCentavos - comissoesCentavos,
      porFuncionario,
      porServico,
      porMetodo,
    };
  }
}
