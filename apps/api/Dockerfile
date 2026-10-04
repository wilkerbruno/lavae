# Build context: a RAIZ do monorepo (por causa do pnpm workspace — a API
# depende do pacote packages/shared). No EasyPanel, ao criar o serviço da API:
#   - Build method: Dockerfile
#   - Build context / Root directory: a raiz do repositório (não apps/api)
#   - Dockerfile path: apps/api/Dockerfile
#
# Ao subir o container pela primeira vez, ele cria todas as tabelas sozinho
# (via `prisma db push`, ver CMD no final) — não precisa de acesso SSH nem
# console pra rodar migração manualmente.
#
# Base Debian (slim), não Alpine: os binários do Prisma têm suporte melhor a
# glibc + OpenSSL. Em Alpine (musl), o "schema engine" do Prisma às vezes
# nem consegue rodar (falha ao detectar a versão do OpenSSL e quebra com um
# erro que nem chega a ser um JSON válido) — foi exatamente isso que
# aconteceu ao rodar `prisma db push` em produção. Instalar openssl aqui
# evita esse problema.
FROM node:22-slim
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
# Sem isso o container roda em UTC por padrão (comum em hosts como o
# EasyPanel), e todo cálculo de "horário disponível" feito com Date local
# (ex: "abre às 9h") ficaria 3h adiantado em relação ao horário de Brasília.
ENV TZ=America/Sao_Paulo
RUN corepack enable
WORKDIR /repo

# Copia o repo inteiro (o .dockerignore abaixo evita node_modules/dist/etc.)
COPY . .

# Instala só o necessário pra API + o pacote compartilhado (não puxa
# Expo/Next do resto do monorepo). O .npmrc na raiz do repo reduz conexões
# em paralelo e adiciona retries — builds em servidores com rede instável
# (ex.: alguns hosts do EasyPanel) às vezes dão ECONNRESET/EAI_AGAIN ao
# baixar pacotes; isso deixa o install resistente a isso.
RUN pnpm install --frozen-lockfile --filter "@lavajato-app/api..."

RUN pnpm --filter @lavajato-app/api prisma:generate

# packages/shared é usado como TypeScript "cru" (sem build próprio) durante o
# desenvolvimento do mobile/admin-web, porque o bundler deles (Metro/Next)
# compila os .ts direto. Mas o `nest build` da API usa o `tsc` de verdade, e
# se ele enxergar um arquivo .ts de fora de apps/api/src (o do shared) no
# meio da compilação, ele muda onde tudo é gerado e o `dist/main.js` some do
# lugar esperado. Por isso compilamos o shared separadamente aqui pra virar
# um .js + .d.ts de verdade antes de compilar a API (usamos o `tsc` que já
# está instalado dentro de apps/api pra isso, sem precisar adicionar outra
# dependência).
RUN pnpm --filter @lavajato-app/api exec tsc -p ../../packages/shared/tsconfig.json

RUN pnpm --filter @lavajato-app/api build

# Trava o build cedo (com mensagem clara) se um dia isso voltar a acontecer,
# em vez de descobrir só em produção que faltou o arquivo de entrada.
RUN test -f /repo/apps/api/dist/main.js || (echo "ERRO: dist/main.js não foi gerado onde esperado" && find /repo/apps/api/dist -maxdepth 2 && exit 1)

WORKDIR /repo/apps/api
ENV NODE_ENV=production
EXPOSE 3000

# `prisma db push` cria/atualiza as tabelas a partir do schema.prisma direto
# no banco configurado em DATABASE_URL — é o que "cria todas as tabelas" na
# primeira vez que o container sobe. Rodar de novo em deploys futuros é
# seguro para mudanças aditivas (novo campo, nova tabela); se um dia você
# fizer uma mudança destrutiva (remover coluna com dados, etc.), o comando
# para e avisa em vez de apagar algo sem confirmação. Quando o schema
# estabilizar, migre para `prisma migrate dev` (gera arquivos de migração
# versionados) + `prisma migrate deploy` aqui no CMD.
#
# Depois roda o seed (prisma/seed.ts): cria os 3 planos iniciais e, se você
# definir SAAS_ADMIN_EMAIL/SAAS_ADMIN_SENHA nas variáveis de ambiente do
# serviço, garante o primeiro usuário SAAS_ADMIN — tudo isso sem precisar de
# SSH nem console, porque roda dentro do próprio container a cada boot (é
# idempotente, então rodar de novo em todo redeploy não causa problema).
CMD ["sh", "-c", "npx prisma db push --skip-generate && npx ts-node prisma/seed.ts && node dist/main.js"]
