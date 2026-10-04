// Popula os planos do SaaS (pré-requisito para registrar um lava jato) e,
// opcionalmente, cria o primeiro usuário SAAS_ADMIN (dono da plataforma).
// Rodar com: pnpm --filter @lavajato-app/api exec ts-node prisma/seed.ts
// (ou configure "prisma.seed" no package.json e use `prisma db seed`).
//
// Em produção (EasyPanel, sem acesso a console/SSH pra criar esse usuário na
// mão), esse script roda sozinho a cada boot do container (ver CMD no
// Dockerfile) e é seguro rodar várias vezes: tudo aqui é upsert (idempotente),
// nunca duplica nem apaga dado. O SAAS_ADMIN só é criado se você definir
// SAAS_ADMIN_EMAIL e SAAS_ADMIN_SENHA nas variáveis de ambiente do serviço da
// API — se não definir, essa parte é simplesmente pulada.
import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  await prisma.plano.upsert({
    where: { id: "plano-basico" },
    update: {},
    create: {
      id: "plano-basico",
      nome: "Básico",
      precoCentavos: 7900,
      limiteFuncionarios: 2,
      recursos: ["Até 2 funcionários", "Agenda e financeiro", "Suporte por e-mail"],
    },
  });

  await prisma.plano.upsert({
    where: { id: "plano-profissional" },
    update: {},
    create: {
      id: "plano-profissional",
      nome: "Profissional",
      precoCentavos: 12900,
      limiteFuncionarios: 6,
      recursos: ["Até 6 funcionários", "Serviços e pacotes", "Relatórios financeiros", "Suporte prioritário"],
    },
  });

  await prisma.plano.upsert({
    where: { id: "plano-premium" },
    update: {},
    create: {
      id: "plano-premium",
      nome: "Premium",
      precoCentavos: 19900,
      limiteFuncionarios: null,
      recursos: ["Funcionários ilimitados", "Tudo do Profissional", "Marca personalizada", "Gerente de conta dedicado"],
    },
  });

  console.log("Planos criados/atualizados com sucesso.");

  const adminEmail = process.env.SAAS_ADMIN_EMAIL;
  const adminSenha = process.env.SAAS_ADMIN_SENHA;

  if (adminEmail && adminSenha) {
    const senhaHash = await bcrypt.hash(adminSenha, 10);
    await prisma.usuario.upsert({
      where: { email: adminEmail },
      update: { senhaHash, papel: "SAAS_ADMIN" },
      create: {
        nome: "Administrador SaaS",
        email: adminEmail,
        senhaHash,
        papel: "SAAS_ADMIN",
      },
    });
    console.log(`Usuário SAAS_ADMIN garantido para ${adminEmail}.`);
  } else {
    console.log(
      "SAAS_ADMIN_EMAIL/SAAS_ADMIN_SENHA não definidos — nenhum usuário SAAS_ADMIN foi criado.",
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
