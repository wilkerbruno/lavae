import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  AJUSTE_PRECO_PORTE_PADRAO,
  MetodoPagamento,
  StatusAgendamento,
  StatusAssinaturaPacote,
  StatusPagamento,
  normalizarAjustePorte,
  precoParaPorte,
} from "@lavajato-app/shared";
import { PrismaService } from "../prisma/prisma.service";
import { VeiculosService } from "../veiculos/veiculos.service";
import { MercadoPagoService } from "../pagamentos/mercadopago.service";
import { CreatePacoteMensalDto } from "./dto/create-pacote-mensal.dto";
import { UpdatePacoteMensalDto } from "./dto/update-pacote-mensal.dto";
import { AssinarPacoteMensalDto } from "./dto/assinar-pacote-mensal.dto";
import { traduzirMotivoRecusaCartao } from "../agendamentos/agendamentos.service";

// Limites (segunda 00:00 até o próximo domingo 23:59:59) da semana em que
// "dataReferencia" cai — usado tanto pra checar quanto pra mostrar a cota
// (vezesPorSemana) já usada. Mesma definição de semana em
// AgendamentosService (não dá pra importar de lá sem criar um ciclo entre
// módulos, então é um helper pequeno duplicado de propósito).
function limitesDaSemana(dataReferencia: Date): { inicio: Date; fim: Date } {
  const diaSemana = dataReferencia.getDay(); // 0=domingo ... 6=sábado
  const diasDesdeSegunda = (diaSemana + 6) % 7; // segunda=0
  const inicio = new Date(dataReferencia);
  inicio.setHours(0, 0, 0, 0);
  inicio.setDate(inicio.getDate() - diasDesdeSegunda);
  const fim = new Date(inicio);
  fim.setDate(fim.getDate() + 7);
  return { inicio, fim };
}

@Injectable()
export class PacotesMensaisService {
  private readonly logger = new Logger(PacotesMensaisService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private mercadoPago: MercadoPagoService,
    private veiculos: VeiculosService,
  ) {}

  // ---------- Catálogo ----------

  // Público: o app do cliente lista os pacotes ativos de um lava jato pra
  // decidir se quer assinar (ver LavaJatoDetailScreen).
  listarPublico(lavaJatoId: string) {
    return this.prisma.pacoteMensal.findMany({
      where: { lavaJatoId, ativo: true },
      include: { servicos: { include: { servico: true } } },
      orderBy: { nome: "asc" },
    });
  }

  // Visão do dono: todos os pacotes (inclusive desativados, pra poder reativar).
  listarDaLavaJato(lavaJatoId: string) {
    return this.prisma.pacoteMensal.findMany({
      where: { lavaJatoId },
      include: { servicos: { include: { servico: true } } },
      orderBy: { nome: "asc" },
    });
  }

  criar(lavaJatoId: string, dto: CreatePacoteMensalDto) {
    const { servicoIds, ...dados } = dto;
    return this.prisma.pacoteMensal.create({
      data: {
        ...dados,
        diasSemanaPermitidos: dto.diasSemanaPermitidos,
        lavaJatoId,
        servicos: { create: servicoIds.map((servicoId) => ({ servicoId })) },
      },
      include: { servicos: { include: { servico: true } } },
    });
  }

  async atualizar(id: string, lavaJatoId: string, dto: UpdatePacoteMensalDto) {
    await this.garantirDaLavaJato(id, lavaJatoId);
    const { servicoIds, ...dados } = dto;

    return this.prisma.$transaction(async (tx) => {
      if (servicoIds) {
        await tx.pacoteMensalServico.deleteMany({ where: { pacoteMensalId: id } });
        await tx.pacoteMensalServico.createMany({
          data: servicoIds.map((servicoId) => ({ pacoteMensalId: id, servicoId })),
        });
      }
      return tx.pacoteMensal.update({
        where: { id },
        data: dados,
        include: { servicos: { include: { servico: true } } },
      });
    });
  }

  // ---------- Assinatura do cliente ----------

  // Inicia (ou reinicia, se cancelada antes) a assinatura do cliente — tudo
  // resolvido dentro do app, sem redirecionar pro site do Mercado Pago:
  //
  // - Cartão + automatico=true: cria a cobrança recorrente direto com o token
  //   do cartão (MercadoPagoService.criarPreapprovalComCartao) — vira ATIVA
  //   assim que o Mercado Pago autorizar (pode já vir "authorized" na hora,
  //   ou só depois via webhook "subscription_preapproval").
  // - Pix, ou Cartão sem renovação automática: cobra só esse período agora
  //   (igual um pagamento avulso de agendamento) e devolve o Pagamento
  //   criado pro app mostrar o QR code / aguardar a confirmação; o cliente
  //   volta a chamar esse mesmo endpoint pra pagar o próximo período quando
  //   proximaCobrancaEm vencer.
  async assinar(clienteId: string, pacoteMensalId: string, dto: AssinarPacoteMensalDto) {
    const pacote = await this.prisma.pacoteMensal.findUnique({ where: { id: pacoteMensalId } });
    if (!pacote || !pacote.ativo) throw new NotFoundException("Pacote mensal não encontrado.");

    // O pacote é assinado por veículo: o preço mensal depende do porte dele
    // (moto, hatch, SUV...) e a cota semanal só vale pra agendamentos dele.
    const veiculo = await this.veiculos.buscarDoCliente(clienteId, dto.veiculoId);
    const lavaJato = await this.prisma.lavaJato.findUnique({
      where: { id: pacote.lavaJatoId },
      select: { ajustePrecoPorte: true },
    });
    const precoCentavos = precoParaPorte(
      pacote.precoCentavos,
      veiculo.porte,
      normalizarAjustePorte(lavaJato?.ajustePrecoPorte, AJUSTE_PRECO_PORTE_PADRAO),
    );

    const existente = await this.prisma.assinaturaPacoteCliente.findUnique({
      where: { pacoteMensalId_clienteId_veiculoId: { pacoteMensalId, clienteId, veiculoId: veiculo.id } },
    });
    if (existente?.status === StatusAssinaturaPacote.ATIVA) {
      throw new BadRequestException("Esse veículo já tem uma assinatura ativa desse pacote.");
    }

    const automatico = dto.metodoPagamento === MetodoPagamento.CARTAO && !!dto.automatico;

    const [cliente, tokenLavaJato, ultimoPagamentoAprovado] = await Promise.all([
      this.prisma.usuario.findUnique({ where: { id: clienteId } }),
      this.mercadoPago.tokenDaLavaJato(pacote.lavaJatoId),
      // Só pra montar additional_info.payer da cobrança com cartão abaixo
      // (ver MercadoPagoService.criarPagamentoCartao) — mesmo dado que
      // AgendamentosService já calcula pra pagamento avulso de agendamento.
      this.prisma.pagamento.findFirst({
        where: { clienteId, status: StatusPagamento.APROVADO },
        orderBy: { atualizadoEm: "desc" },
      }),
    ]);
    if (!cliente) throw new NotFoundException("Cliente não encontrado.");

    // Reaproveita a linha (ex: assinatura CANCELADA antes) em vez de criar
    // outra — o índice único (pacoteMensalId, clienteId) não deixaria duas
    // ao mesmo tempo de qualquer forma.
    const assinatura = existente
      ? await this.prisma.assinaturaPacoteCliente.update({
          where: { id: existente.id },
          data: {
            status: StatusAssinaturaPacote.PENDENTE,
            metodoPagamento: dto.metodoPagamento,
            renovacaoAutomatica: automatico,
          },
        })
      : await this.prisma.assinaturaPacoteCliente.create({
          data: {
            pacoteMensalId,
            clienteId,
            veiculoId: veiculo.id,
            lavaJatoId: pacote.lavaJatoId,
            status: StatusAssinaturaPacote.PENDENTE,
            metodoPagamento: dto.metodoPagamento,
            renovacaoAutomatica: automatico,
          },
        });

    if (automatico) {
      if (!dto.cartaoToken) throw new BadRequestException("Dados do cartão incompletos.");

      const backUrl = this.config.get<string>("MERCADOPAGO_BACK_URL") ?? "https://www.mercadopago.com.br";
      const preapproval = await this.mercadoPago.criarPreapprovalComCartao(
        {
          reason: `Pacote mensal - ${pacote.nome} (${veiculo.placa})`,
          // "assinaturaPacote:<id>": mesmo formato usado pelo fluxo antigo de
          // checkout hospedado — é assim que o webhook (que só recebe o id da
          // preapproval no Mercado Pago) sabe qual AssinaturaPacoteCliente
          // ativar (ver WebhooksService.tratarPreapprovalPacoteMensal).
          externalReference: `assinaturaPacote:${assinatura.id}`,
          payerEmail: cliente.email,
          precoCentavos,
          cardTokenId: dto.cartaoToken,
          backUrl,
        },
        tokenLavaJato,
      );

      const jaAutorizado = preapproval.status === "authorized";
      const proximaCobrancaEm = jaAutorizado ? proximoMes(new Date()) : undefined;
      await this.prisma.assinaturaPacoteCliente.update({
        where: { id: assinatura.id },
        data: {
          gatewayAssinaturaId: preapproval.id,
          status: jaAutorizado ? StatusAssinaturaPacote.ATIVA : StatusAssinaturaPacote.PENDENTE,
          ...(proximaCobrancaEm ? { proximaCobrancaEm } : {}),
        },
      });

      return { assinaturaId: assinatura.id, automatico: true, status: jaAutorizado ? "ATIVA" : "PENDENTE", pagamento: null };
    }

    // Pix, ou Cartão sem renovação automática: cobra só esse período, igual
    // um pagamento avulso de agendamento (ver AgendamentosService.criarLote)
    // — ligado pela assinaturaPacoteClienteId em vez de grupoId.
    const pagamento = await this.prisma.pagamento.create({
      data: {
        clienteId,
        lavaJatoId: pacote.lavaJatoId,
        metodo: dto.metodoPagamento,
        valorCentavos: precoCentavos,
        assinaturaPacoteClienteId: assinatura.id,
      },
    });

    try {
      if (dto.metodoPagamento === MetodoPagamento.PIX) {
        const pix = await this.mercadoPago.criarPagamentoPix(
          {
            valorCentavos: precoCentavos,
            descricao: `Pacote mensal - ${pacote.nome} (${veiculo.placa})`,
            // "_" (não ":") — mesmo motivo de AgendamentosService: a Orders
            // API (usada pelo cartão) valida external_reference com um
            // padrão mais restrito e rejeita ":".
            externalReference: `pacotePagamento_${pagamento.id}`,
            payerEmail: cliente.email,
          },
          tokenLavaJato,
        );
        const aprovadoNaHora = pix.status === "approved";
        await this.prisma.pagamento.update({
          where: { id: pagamento.id },
          data: {
            gatewayPagamentoId: pix.id,
            pixQrCodeBase64: pix.qrCodeBase64,
            pixCopiaECola: pix.qrCode,
            status: aprovadoNaHora ? StatusPagamento.APROVADO : StatusPagamento.PENDENTE,
          },
        });
        if (aprovadoNaHora) await this.ativarPeriodo(assinatura.id);
      } else {
        if (!dto.cartaoToken || !dto.cartaoBin || !dto.cartaoCpf) {
          throw new BadRequestException("Dados do cartão incompletos.");
        }
        const { paymentMethodId } = await this.mercadoPago.identificarBandeiraCartao(dto.cartaoBin);
        const cobranca = await this.mercadoPago.criarPagamentoCartao(
          {
            valorCentavos: precoCentavos,
            descricao: `Pacote mensal - ${pacote.nome} (${veiculo.placa})`,
            externalReference: `pacotePagamento_${pagamento.id}`,
            token: dto.cartaoToken,
            paymentMethodId,
            payerEmail: cliente.email,
            payerCpf: dto.cartaoCpf,
            payerNome: cliente.nome,
            payerTelefone: cliente.telefone,
            deviceId: dto.cartaoDeviceId,
            payerCadastradoEm: cliente.criadoEm,
            payerPrimeiraCompra: !ultimoPagamentoAprovado,
            payerUltimaCompraEm: ultimoPagamentoAprovado?.atualizadoEm ?? null,
          },
          tokenLavaJato,
        );
        const aprovadoNaHora = cobranca.status === "approved";
        const recusado = cobranca.status === "rejected";
        await this.prisma.pagamento.update({
          where: { id: pagamento.id },
          data: {
            gatewayPagamentoId: cobranca.id,
            status: aprovadoNaHora ? StatusPagamento.APROVADO : recusado ? StatusPagamento.RECUSADO : StatusPagamento.PENDENTE,
            desafio3dsUrl: cobranca.desafio3dsUrl,
          },
        });
        if (aprovadoNaHora) await this.ativarPeriodo(assinatura.id);
        else if (recusado) throw new BadRequestException(traduzirMotivoRecusaCartao(cobranca.statusDetail));
      }
    } catch (e) {
      this.logger.error(`Falha ao gerar cobrança do pacote mensal (assinatura ${assinatura.id}): ${e}`);
      await this.prisma.pagamento.update({ where: { id: pagamento.id }, data: { status: StatusPagamento.RECUSADO } }).catch(() => {});
      if (e instanceof BadRequestException) throw e;
      throw new BadRequestException("Não foi possível gerar a cobrança agora. Tente novamente em instantes.");
    }

    const pagamentoFinal = await this.prisma.pagamento.findUniqueOrThrow({ where: { id: pagamento.id } });
    return { assinaturaId: assinatura.id, automatico: false, status: null, pagamento: this.mapearPagamento(pagamentoFinal) };
  }

  // O app chama isso pra saber se o Pix/cartão avulso do período já foi pago
  // — enquanto PENDENTE, também confere ao vivo com o Mercado Pago (mesmo
  // padrão de AgendamentosService.buscarPagamento).
  async buscarPagamento(pagamentoId: string, clienteId: string) {
    const pagamento = await this.prisma.pagamento.findUnique({ where: { id: pagamentoId } });
    if (!pagamento || pagamento.clienteId !== clienteId) throw new NotFoundException("Pagamento não encontrado.");

    if (pagamento.status === StatusPagamento.PENDENTE && pagamento.gatewayPagamentoId) {
      try {
        const token = await this.mercadoPago.tokenDaLavaJato(pagamento.lavaJatoId);
        const pagamentoMp = await this.mercadoPago.buscarPayment(pagamento.gatewayPagamentoId, token);
        const novoStatus =
          pagamentoMp.status === "approved"
            ? StatusPagamento.APROVADO
            : pagamentoMp.status === "pending" || pagamentoMp.status === "in_process" || pagamentoMp.status === "authorized"
              ? StatusPagamento.PENDENTE
              : StatusPagamento.RECUSADO;

        const atualizado = await this.prisma.pagamento.update({
          where: { id: pagamento.id },
          data: {
            status: novoStatus,
            desafio3dsUrl: pagamentoMp.desafio3dsUrl ?? null,
            taxaMercadoPagoCentavos: pagamentoMp.taxaCentavos,
          },
        });
        if (novoStatus === StatusPagamento.APROVADO && pagamento.assinaturaPacoteClienteId) {
          await this.ativarPeriodo(pagamento.assinaturaPacoteClienteId);
        }
        return this.mapearPagamento(atualizado);
      } catch (e) {
        this.logger.warn(`Falha ao sincronizar pagamento ${pagamentoId} (pacote mensal) ao vivo, devolvendo estado salvo: ${e}`);
      }
    }
    return this.mapearPagamento(pagamento);
  }

  async minhasAssinaturas(clienteId: string) {
    const assinaturas = await this.prisma.assinaturaPacoteCliente.findMany({
      where: { clienteId },
      include: {
        pacoteMensal: { include: { servicos: { include: { servico: true } } } },
        veiculo: true,
      },
      orderBy: { criadoEm: "desc" },
    });

    return Promise.all(
      assinaturas.map(async (a) => {
        // Pagamento PENDENTE mais recente desse período (Pix/cartão avulso
        // aguardando confirmação) — o app usa isso pra retomar a tela de
        // pagamento em vez de reiniciar a assinatura do zero.
        const pagamentoPendente = !a.renovacaoAutomatica
          ? await this.prisma.pagamento.findFirst({
              where: { assinaturaPacoteClienteId: a.id, status: StatusPagamento.PENDENTE },
              orderBy: { criadoEm: "desc" },
            })
          : null;

        return {
          ...a,
          usosNaSemana: a.status === StatusAssinaturaPacote.ATIVA ? await this.usosNaSemana(a.id) : 0,
          pagamentoPendente: pagamentoPendente ? this.mapearPagamento(pagamentoPendente) : null,
        };
      }),
    );
  }

  // Quantos agendamentos essa assinatura já "gastou" da cota semanal — conta
  // também NAO_COMPARECEU (o cliente reservou a vaga, então ela foi usada,
  // mesmo sem cobrança avulsa pra reter — ver AgendamentosService.marcarNaoCompareceu).
  usosNaSemana(assinaturaId: string, dataReferencia: Date = new Date()) {
    const { inicio, fim } = limitesDaSemana(dataReferencia);
    return this.prisma.agendamento.count({
      where: {
        assinaturaPacoteId: assinaturaId,
        status: { in: [StatusAgendamento.CONFIRMADO, StatusAgendamento.CONCLUIDO, StatusAgendamento.NAO_COMPARECEU] },
        inicio: { gte: inicio, lt: fim },
      },
    });
  }

  async cancelarAssinatura(clienteId: string, id: string) {
    const assinatura = await this.prisma.assinaturaPacoteCliente.findUnique({ where: { id } });
    if (!assinatura || assinatura.clienteId !== clienteId) throw new NotFoundException("Assinatura não encontrada.");

    if (assinatura.gatewayAssinaturaId) {
      const token = await this.mercadoPago.tokenDaLavaJato(assinatura.lavaJatoId).catch(() => null);
      if (token) {
        await this.mercadoPago.cancelarPreapproval(assinatura.gatewayAssinaturaId, token).catch((e) => {
          this.logger.error(`Falha ao cancelar preapproval de pacote mensal ${assinatura.gatewayAssinaturaId}: ${e}`);
        });
      }
    }
    return this.prisma.assinaturaPacoteCliente.update({ where: { id }, data: { status: StatusAssinaturaPacote.CANCELADA } });
  }

  // Marca o período atual como pago e empurra proximaCobrancaEm pra 1 mês à
  // frente — chamado tanto na confirmação na hora (assinar) quanto pelo
  // webhook (WebhooksService.tratarPagamentoPeriodoPacoteMensal) e pelo poll
  // do app (buscarPagamento), todos podendo chegar primeiro dependendo da
  // rede/latência do Mercado Pago.
  async ativarPeriodo(assinaturaId: string) {
    await this.prisma.assinaturaPacoteCliente.update({
      where: { id: assinaturaId },
      data: { status: StatusAssinaturaPacote.ATIVA, proximaCobrancaEm: proximoMes(new Date()) },
    });
  }

  // Mesmo formato de AgendamentosService.mapearPagamento — devolvido tanto na
  // resposta de assinar() quanto no polling (buscarPagamento) e na lista de
  // assinaturas (minhasAssinaturas).
  private mapearPagamento(pagamento: {
    id: string;
    clienteId: string;
    lavaJatoId: string;
    metodo: string;
    status: string;
    valorCentavos: number;
    valorEstornadoCentavos: number;
    pixQrCodeBase64: string | null;
    pixCopiaECola: string | null;
    desafio3dsUrl: string | null;
    criadoEm: Date;
  }) {
    return {
      id: pagamento.id,
      clienteId: pagamento.clienteId,
      lavaJatoId: pagamento.lavaJatoId,
      metodo: pagamento.metodo,
      status: pagamento.status,
      valorCentavos: pagamento.valorCentavos,
      valorEstornadoCentavos: pagamento.valorEstornadoCentavos,
      pixQrCodeBase64: pagamento.pixQrCodeBase64,
      pixCopiaECola: pagamento.pixCopiaECola,
      desafio3dsUrl: pagamento.desafio3dsUrl,
      criadoEm: pagamento.criadoEm.toISOString(),
    };
  }

  private async garantirDaLavaJato(id: string, lavaJatoId: string) {
    const pacote = await this.prisma.pacoteMensal.findUnique({ where: { id } });
    if (!pacote) throw new NotFoundException("Pacote mensal não encontrado.");
    if (pacote.lavaJatoId !== lavaJatoId) throw new ForbiddenException("Pacote mensal não pertence ao seu lava jato.");
  }
}

function proximoMes(data: Date): Date {
  const proxima = new Date(data);
  proxima.setMonth(proxima.getMonth() + 1);
  return proxima;
}
