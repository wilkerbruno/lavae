import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { Papel, StatusAssinatura } from "@lavajato-app/shared";
import { PrismaService } from "../prisma/prisma.service";
import { ConfiguracoesService } from "../configuracoes/configuracoes.service";
import { LoginDto } from "./dto/login.dto";
import { RegisterClienteDto } from "./dto/register-cliente.dto";
import { RegisterLavaJatoDto } from "./dto/register-lavajato.dto";
import { camposEndereco } from "../common/endereco.util";

function slugify(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos (marcas diacríticas após normalize NFD)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private configuracoes: ConfiguracoesService,
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

    const { senhaHash: _, ...usuarioSemSenha } = resultado.dono;
    return {
      lavaJato: resultado.lavaJato,
      usuario: usuarioSemSenha,
      ...(await this.assinarToken(resultado.dono)),
    };
  }
}
