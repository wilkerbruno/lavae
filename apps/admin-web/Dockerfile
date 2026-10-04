# Build context: a RAIZ do monorepo (mesmo motivo do apps/api/Dockerfile — o
# painel depende do pacote packages/shared via pnpm workspace). No EasyPanel,
# ao criar o serviço do painel:
#   - Build method: Dockerfile
#   - Build context / Root directory: a raiz do repositório (não apps/admin-web)
#   - Dockerfile path: apps/admin-web/Dockerfile
FROM node:22-slim
RUN corepack enable
WORKDIR /repo

# Copia o repo inteiro (o .dockerignore na raiz evita node_modules/dist/etc
# do seu computador vazando pra dentro da imagem — e por isso também não dá
# pra contar com um packages/shared/dist pré-compilado que porventura exista
# na sua máquina: ele é ignorado igual o resto, ver passo abaixo).
COPY . .

# Instala só o necessário pro painel (não puxa NestJS/Expo do resto do
# monorepo). O .npmrc na raiz do repo reduz conexões em paralelo e adiciona
# retries — builds em servidores com rede instável (ex.: alguns hosts do
# EasyPanel) às vezes dão ECONNRESET/EAI_AGAIN ao baixar pacotes.
RUN pnpm install --frozen-lockfile --filter "@lavajato-app/admin-web..."

# packages/shared/package.json aponta "main" pra "dist/index.js" — isso vale
# pra QUALQUER consumidor (API, mobile, admin-web), então esse arquivo
# compilado precisa existir de verdade, não importa o que o next.config.js
# faça depois. (`transpilePackages` no next.config.js só muda COMO o Next
# processa um arquivo já encontrado — ele não pula a resolução de módulo do
# Node, que lê o "main" do package.json antes de tudo.) Sem esse passo, o
# `next build` abaixo falha com "Module not found: Can't resolve
# '@lavajato-app/shared'". Usamos o `tsc` que já veio instalado dentro do
# admin-web (typescript está nas devDependencies dele) pra não precisar
# adicionar outra dependência só pra isso — mesmo truque do Dockerfile da API.
RUN pnpm --filter @lavajato-app/admin-web exec tsc -p ../../packages/shared/tsconfig.json

# IMPORTANTE: variáveis NEXT_PUBLIC_* são gravadas DIRETO no JavaScript que
# vai pro navegador NO MOMENTO DO BUILD — não é como o resto do sistema, onde
# uma variável de ambiente do container em runtime já resolve. Se você trocar
# a URL da API depois, precisa gerar uma imagem nova (rebuild), não só
# reiniciar o container com outra variável de ambiente.
#
# No EasyPanel: defina NEXT_PUBLIC_API_URL nas "Build variables" do serviço
# (não só nas "Environment variables" de runtime) para que ela chegue aqui
# como build arg. Localmente, `docker build --build-arg
# NEXT_PUBLIC_API_URL=https://sua-api.com/api ...`.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN pnpm --filter @lavajato-app/admin-web build

# Trava o build cedo (com mensagem clara) se um dia o build do Next parar de
# gerar a pasta esperada, em vez de só descobrir em produção que o `next
# start` não tem o que servir.
RUN test -d /repo/apps/admin-web/.next || (echo "ERRO: apps/admin-web/.next não foi gerado" && exit 1)

WORKDIR /repo/apps/admin-web
ENV NODE_ENV=production
EXPOSE 3001

# `next start` serve o build de produção gerado acima (não é um servidor de
# desenvolvimento). Porta 3001 fixa (ver package.json) pra não bater com a
# porta 3000 da API quando os dois rodam na mesma máquina/rede interna.
CMD ["npx", "next", "start", "-p", "3001"]
