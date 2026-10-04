import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { APP_GUARD } from "@nestjs/core";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { LavaJatosModule } from "./lavajatos/lavajatos.module";
import { ServicosModule } from "./servicos/servicos.module";
import { AgendamentosModule } from "./agendamentos/agendamentos.module";
import { FuncionariosModule } from "./funcionarios/funcionarios.module";
import { FinanceiroModule } from "./financeiro/financeiro.module";
import { PlanosModule } from "./planos/planos.module";
import { ConfiguracoesModule } from "./configuracoes/configuracoes.module";
import { AssinaturasModule } from "./assinaturas/assinaturas.module";
import { PacotesMensaisModule } from "./pacotes-mensais/pacotes-mensais.module";
import { WebhooksModule } from "./webhooks/webhooks.module";
import { UsuariosModule } from "./usuarios/usuarios.module";
import { CartoesModule } from "./cartoes/cartoes.module";
import { VeiculosModule } from "./veiculos/veiculos.module";
import { JwtAuthGuard } from "./common/guards/jwt-auth.guard";
import { RolesGuard } from "./common/guards/roles.guard";
import { AssinaturaGuard } from "./common/guards/assinatura.guard";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Único job agendado do projeto até agora — ver AssinaturasService.
    // verificarAvisosDeVencimento (aviso de assinatura vencendo em 3 dias).
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    LavaJatosModule,
    ServicosModule,
    AgendamentosModule,
    FuncionariosModule,
    FinanceiroModule,
    PlanosModule,
    ConfiguracoesModule,
    AssinaturasModule,
    PacotesMensaisModule,
    WebhooksModule,
    UsuariosModule,
    CartoesModule,
    VeiculosModule,
  ],
  providers: [
    // Ordem importa: primeiro autentica (JWT), depois checa o papel (@Roles)
    // e só então checa se a assinatura do lava jato está em dia.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: AssinaturaGuard },
  ],
})
export class AppModule {}
