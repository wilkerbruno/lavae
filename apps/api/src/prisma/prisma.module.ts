import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

// @Global() porque quase todo módulo do sistema precisa do Prisma.
// Evita ter que importar PrismaModule em cada feature module.
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
