import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module";

// Origens que podem chamar a API mandando cookies (credentials). Preciso
// listar explicitamente porque navegador não manda/aceita cookie em request
// cross-origin com `credentials: true` se o CORS responder "*" — ver
// jwt.strategy.ts (cookie httpOnly) e auth.controller.ts (quem seta o
// cookie). Dá pra adicionar mais origens em produção via CORS_ORIGINS
// (separadas por vírgula) sem precisar mexer no código.
const ORIGENS_PADRAO = [
  "https://app.seudominio.com.br",
  "https://painel.seudominio.com.br",
  "https://www.painel.seudominio.com.br",
];

function origemPermitida(origin: string | undefined, extras: string[]): boolean {
  if (!origin) return true; // requisições sem Origin (apps nativos, curl, etc.)
  if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) return true; // dev local
  if (/^https?:\/\/192\.168\.\d+\.\d+(:\d+)?$/.test(origin)) return true; // Expo Go na rede local
  // Domínios automáticos do EasyPanel desse projeto (ex:
  // banco-de-dados-lava jato.lcgx8u.easypanel.host) — o "lcgx8u" é o
  // identificador da sua conta/cluster, não de qualquer app no EasyPanel.
  // Cobre o painel/API/app por qualquer domínio padrão deles, inclusive
  // enquanto o DNS de painel.seudominio.com.br não estiver resolvendo.
  if (/^https:\/\/[a-z0-9-]+\.lcgx8u\.easypanel\.host$/.test(origin)) return true;
  return [...ORIGENS_PADRAO, ...extras].includes(origin);
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const extras = (process.env.CORS_ORIGINS ?? "").split(",").map((o) => o.trim()).filter(Boolean);
  app.enableCors({
    origin: (origin, callback) => callback(null, origemPermitida(origin, extras)),
    credentials: true,
  });
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // remove campos que não existem no DTO
      transform: true, // converte payloads JSON pros tipos dos DTOs
      forbidNonWhitelisted: true,
    }),
  );
  app.setGlobalPrefix("api");

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`API rodando em http://localhost:${port}/api`);
}
bootstrap();
