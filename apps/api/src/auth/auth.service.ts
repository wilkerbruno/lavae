import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { createHmac, randomInt, timingSafeEqual } from "crypto";
import { Papel, StatusAssinatura } from "@lavajato-app/shared";
import { PrismaService } from "../prisma/prisma.service";
import { ConfiguracoesService } from "../configuracoes/configuracoes.service";
import { LoginDto } from "./dto/login.dto";
import { RegisterClienteDto } from "./dto/register-cliente.dto";
import { RegisterLavaJatoDto } from "./dto/register-lavajato.dto";
import { MailService } from "../common/servicos/mail.service";
import { GeocodingService } from "../common/servicos/geocoding.service";
import { camposEndereco } from "../common/endereco.util";

function slugify(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos (marcas diacríticas após normalize NFD)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const MINUTOS_CODIGO = 15;

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private configuracoes: ConfiguracoesService,
    private mail: MailService,
    private geocoding: GeocodingService,
  ) {}

  private async assinarToken(usuario: { id: string; papel: Papel; lavaJatoId: string | null }) {
    const token = await this.jwt.signAsync({
      sub: usuario.id,
      papel: usuario.papel,
      lavaJatoId: usuario.lavaJatoId,
    });
    return { accessToken: token };
  }

  async login(dto: LoginDto) {
    const usuario = await this.prisma.usuario.findUnique({ where: { email: dto.email } });
    if (!usuario) throw new UnauthorizedException("E-mail ou senha inválidos.");

    const senhaValida = await bcrypt.compare(dto.senha, usuario.senhaHash);
    if (!senhaValida) throw new UnauthorizedException("E-mail ou senha inválidos.");

    const { senhaHash, ...usuarioSemSenha } = usuario;
    return {
      usuario: usuarioSemSenha,
      ...(await this.assinarToken(usuario)),
    };
  }

  async registerCliente(dto: RegisterClienteDto) {
    const existente = await this.prisma.usuario.findUnique({ where: { email: dto.email } });
    if (existente) throw new ConflictException("Já existe uma conta com este e-mail.");

    const senhaHash = await bcrypt.hash(dto.senha, 10);
    const usuario = await this.prisma.usuario.create({
      data: {
        nome: dto.nome,
        email: dto.email,
        senhaHash,
        telefone: dto.telefone,
        ...camposEndereco(dto.endereco),
        papel: Papel.CLIENTE,
      },
    });

    const { senhaHash: _, ...usuarioSemSenha } = usuario;
    return { usuario: usuarioSemSenha, ...(await this.assinarToken(usuario)) };
  }

  // Onboarding do SaaS: cria o lava jato (tenant), o usuário dono e a assinatura
  // inicial em modo TRIAL. É aqui que o lava jato "vira cliente" da plataforma.
  async registerLavaJato(dto: RegisterLavaJatoDto) {
    const existente = await this.prisma.usuario.findUnique({ where: { email: dto.email } });
    if (existente) throw new ConflictException("Já existe uma conta com este e-mail.");

    const plano = await this.prisma.plano.findUnique({ where: { id: dto.planoId } });
    if (!plano) throw new ConflictException("Plano informado não existe.");

    const slugBase = slugify(dto.nomeLavaJato);
    let slug = slugBase;
    let tentativa = 1;
    while (await this.prisma.lavaJato.findUnique({ where: { slug } })) {
      slug = `${slugBase}-${++tentativa}`;
    }

    const senhaHash = await bcrypt.hash(dto.senha, 10);
    const { diasTesteGratis } = await this.configuracoes.obter();

    const resultado = await this.prisma.$transaction(async (tx) => {
      const lavaJato = await tx.lavaJato.create({
        // Telefone e endereço pra começar já preenchidos com o informado no
        // cadastro — é o que o cliente vê no botão "Ligar para o lava jato"
        // e no endereço do estabelecimento. O dono pode trocar depois em
        // Mais > Editar perfil > Dados do lava jato (EditarPerfilScreen),
        // sem afetar os dados pessoais dele.
        data: { nome: dto.nomeLavaJato, slug, telefone: dto.telefone, ...camposEndereco(dto.endereco) },
      });

      const dono = await tx.usuario.create({
        data: {
          nome: dto.nomeDono,
          email: dto.email,
          senhaHash,
          telefone: dto.telefone,
          papel: Papel.LAVAJATO_ADMIN,
          lavaJatoId: lavaJato.id,
        },
      });

      const trialTerminaEm = new Date();
      trialTerminaEm.setDate(trialTerminaEm.getDate() + diasTesteGratis);

      await tx.assinatura.create({
        data: {
          lavaJatoId: lavaJato.id,
          planoId: plano.id,
          status: StatusAssinatura.TRIAL,
          trialTerminaEm,
        },
      });

      return { lavaJato, dono };
    });

    // Põe o lava jato no mapa pelo endereço cadastrado (em segundo plano).
    void this.geocoding.preencherLavaJato(resultado.lavaJato.id);

    const { senhaHash: _, ...usuarioSemSenha } = resultado.dono;
    return {
      lavaJato: resultado.lavaJato,
      usuario: usuarioSemSenha,
      ...(await this.assinarToken(resultado.dono)),
    };
  }

  // ---------- Esqueci minha senha ----------
  private hashCodigo(id: string, codigo: string) {
    return createHmac("sha256", process.env.JWT_SECRET ?? "lavae").update(`${id}:${codigo}`).digest("hex");
  }

  // Sempre responde igual (exista o e-mail ou não) para não revelar quem tem conta.
  async esqueciSenha(emailBruto: string) {
    const email = emailBruto.trim().toLowerCase();
    const resposta = { ok: true, mensagem: "Se o e-mail estiver cadastrado, enviamos um código de 6 dígitos." };
    const usuario = await this.prisma.usuario.findUnique({ where: { email } });
    if (!usuario) return resposta;

    const recente = await this.prisma.redefinicaoSenha.findFirst({
      where: { usuarioId: usuario.id, criadoEm: { gt: new Date(Date.now() - 60_000) } },
    });
    if (recente) return resposta; // espera 60s entre pedidos

    await this.prisma.redefinicaoSenha.updateMany({
      where: { usuarioId: usuario.id, usadoEm: null },
      data: { usadoEm: new Date() },
    });
    const codigo = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const registro = await this.prisma.redefinicaoSenha.create({
      data: { usuarioId: usuario.id, codigoHash: "", expiraEm: new Date(Date.now() + MINUTOS_CODIGO * 60_000) },
    });
    await this.prisma.redefinicaoSenha.update({ where: { id: registro.id }, data: { codigoHash: this.hashCodigo(registro.id, codigo) } });
    await this.mail.enviarCodigoRedefinicao(usuario.email, usuario.nome, codigo, MINUTOS_CODIGO);
    return resposta;
  }

  async verificarCodigo(emailBruto: string, codigo: string) {
    const invalido = new BadRequestException("Código inválido ou expirado.");
    const usuario = await this.prisma.usuario.findUnique({ where: { email: emailBruto.trim().toLowerCase() } });
    if (!usuario) throw invalido;
    const registro = await this.prisma.redefinicaoSenha.findFirst({
      where: { usuarioId: usuario.id, usadoEm: null, expiraEm: { gt: new Date() } },
      orderBy: { criadoEm: "desc" },
    });
    if (!registro || registro.tentativas >= 5) throw invalido;

    const esperado = Buffer.from(registro.codigoHash);
    const recebido = Buffer.from(this.hashCodigo(registro.id, codigo));
    const confere = esperado.length === recebido.length && timingSafeEqual(esperado, recebido);
    if (!confere) {
      await this.prisma.redefinicaoSenha.update({ where: { id: registro.id }, data: { tentativas: { increment: 1 } } });
      throw invalido;
    }
    await this.prisma.redefinicaoSenha.update({ where: { id: registro.id }, data: { verificadoEm: new Date() } });
    const token = await this.jwt.signAsync({ sub: usuario.id, purpose: "reset", rid: registro.id }, { expiresIn: "10m" });
    return { ok: true, token };
  }

  async redefinirSenha(token: string, novaSenha: string, confirmarSenha: string) {
    if (novaSenha.length < 8) throw new BadRequestException("A nova senha deve ter no mínimo 8 caracteres.");
    if (novaSenha !== confirmarSenha) throw new BadRequestException("As senhas não conferem.");
    let payload: { sub: string; purpose?: string; rid?: string };
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      throw new BadRequestException("Sessão de redefinição expirada. Peça um novo código.");
    }
    if (payload.purpose !== "reset" || !payload.rid) throw new BadRequestException("Token inválido.");
    const registro = await this.prisma.redefinicaoSenha.findUnique({ where: { id: payload.rid } });
    if (!registro || registro.usuarioId !== payload.sub || registro.usadoEm || !registro.verificadoEm) {
      throw new BadRequestException("Sessão de redefinição inválida. Peça um novo código.");
    }
    const senhaHash = await bcrypt.hash(novaSenha, 10);
    await this.prisma.$transaction([
      this.prisma.usuario.update({ where: { id: payload.sub }, data: { senhaHash } }),
      this.prisma.redefinicaoSenha.updateMany({ where: { usuarioId: payload.sub, usadoEm: null }, data: { usadoEm: new Date() } }),
    ]);
    return { ok: true };
  }
}
