import { ConflictException, ForbiddenException, Injectable } from "@nestjs/common";
import { Papel } from "@lavajato-app/shared";
import { PrismaService } from "../prisma/prisma.service";
import { UpdateMeuPerfilDto } from "./dto/update-meu-perfil.dto";
import { camposEndereco } from "../common/endereco.util";

// Campos devolvidos depois de editar o perfil — mesmo formato do Usuario
// "seguro" (sem senhaHash) usado em AuthService.login/registerCliente, pra o
// app poder atualizar o authStore direto com a resposta.
// Inclui os campos de endereço de propósito: esta constante SÓ é usada em
// respostas "sobre mim mesmo" (login/registro/meu-perfil) — NUNCA pra expor
// o usuário de outra pessoa. Ver comentário em Usuario.endereco no schema.
const SELECT_SEGURO = {
  id: true,
  nome: true,
  email: true,
  telefone: true,
  cep: true,
  logradouro: true,
  numero: true,
  complemento: true,
  bairro: true,
  cidade: true,
  uf: true,
  endereco: true,
  papel: true,
  lavaJatoId: true,
  criadoEm: true,
};

@Injectable()
export class UsuariosService {
  constructor(private prisma: PrismaService) {}

  // Sobrescreve o token de push do usuário logado (último aparelho em que
  // entrou é o que recebe notificação — ver comentário do campo no schema).
  async salvarPushToken(usuarioId: string, pushToken: string) {
    await this.prisma.usuario.update({ where: { id: usuarioId }, data: { pushToken } });
    return { ok: true };
  }

  // Usado pela versão web do app pra reidratar o usuário logado a cada
  // abertura (ver authStore.ts "restaurarSessao" web) — lá nada sensível
  // fica salvo em localStorage, então os dados reais vêm de novo da API a
  // cada carregamento, autenticado só pelo cookie httpOnly.
  async buscarMeuPerfil(usuarioId: string) {
    return this.prisma.usuario.findUniqueOrThrow({ where: { id: usuarioId }, select: SELECT_SEGURO });
  }

  // Tela "Perfil" (cliente, funcionário e dono) — cada um edita os próprios
  // dados básicos. O telefone do FUNCIONARIO é exclusivo do lava jato (ver
  // FuncionariosService.atualizar): recusa aqui em vez de simplesmente
  // ignorar, pra o app mostrar um erro claro em vez de parecer que salvou.
  async atualizarMeuPerfil(usuarioId: string, papel: Papel, dto: UpdateMeuPerfilDto) {
    if (dto.telefone !== undefined && papel === Papel.FUNCIONARIO) {
      throw new ForbiddenException("Seu telefone é cadastrado e só pode ser alterado pelo lava jato.");
    }

    if (dto.email) {
      const existente = await this.prisma.usuario.findUnique({ where: { email: dto.email } });
      if (existente && existente.id !== usuarioId) {
        throw new ConflictException("Já existe uma conta com este e-mail.");
      }
    }

    return this.prisma.usuario.update({
      where: { id: usuarioId },
      data: {
        nome: dto.nome,
        email: dto.email,
        telefone: dto.telefone,
        ...(dto.endereco ? camposEndereco(dto.endereco) : {}),
      },
      select: SELECT_SEGURO,
    });
  }
}
