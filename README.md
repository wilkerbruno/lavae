# LavaJato SaaS

Sistema de gestão para lava jatos: agenda, financeiro, catálogo de
serviços/pacotes com preços por porte do veículo (hatch, sedã, SUV, picape...),
cadastro de veículos (placa) por cliente, pacotes mensais por veículo, e
cobrança de mensalidade dos lava jatos assinantes (modelo SaaS). Derivado do
BarberOne — veja `docs/ARQUITETURA.md` para o racional.

## Estrutura do monorepo

```
apps/
  api/          Backend (NestJS + Prisma + MySQL) — a fonte da verdade de tudo
  mobile/       App React Native (Expo) — cliente, funcionário e dono do lava jato
  admin-web/    Painel web (Next.js) — administrador da plataforma (SaaS)
packages/
  shared/       Tipos e enums TypeScript compartilhados entre api/mobile/admin-web
infra/
  docker-compose.yml   Sobe só um MySQL local (pra desenvolver sem mexer em produção)
```

Em produção, o banco é o **MySQL do EasyPanel** e a API roda também no
EasyPanel (mesmo servidor) — veja `docs/DEPLOY_EASYPANEL.md` para o passo a
passo completo (criação do banco, usuário com privilégio mínimo, variáveis
de ambiente, e como as tabelas são criadas automaticamente sem precisar de
SSH/console).

Um único app mobile atende os três papéis operacionais (cliente, funcionário,
lava jato) — a tela que aparece depois do login muda de acordo com o papel do
usuário logado (`RootNavigator.tsx`). O administrador da plataforma (dono do
SaaS) usa o painel web separado, por ser um back-office de uso ocasional.

## Decisões assumidas (ajuste se quiser outra coisa)

- **Backend**: NestJS + TypeScript + Prisma + MySQL, com autenticação
  JWT e controle de acesso por papel (`CLIENTE`, `FUNCIONARIO`,
  `LAVAJATO_ADMIN`, `SAAS_ADMIN`).
- **Mobile**: Expo (React Native) + React Navigation + Zustand.
- **Painel SaaS**: Next.js (App Router), autenticado separadamente.
- **Pagamento/cobrança recorrente**: ainda **não integrado**. O schema já tem
  `Assinatura`/`Fatura` com campos para o id do gateway
  (`gatewayAssinaturaId`/`gatewayFaturaId`) e um endpoint de webhook vazio
  (`POST /api/webhooks/pagamento`) pronto para receber eventos. Para o Brasil,
  avalie Stripe (mais documentação, cartão internacional) vs. Asaas/Iugu/Vindi
  (boleto e Pix nativos, mais comuns em SaaS B2B brasileiro).
- **Preços em centavos** (inteiros) em vez de float, pra evitar erro de
  arredondamento em dinheiro.

## Como rodar

### 0. Pacote compartilhado (uma vez, e de novo sempre que editar `packages/shared`)

```bash
pnpm install
pnpm build:shared
```

`packages/shared` (tipos usados pela API, mobile e painel web) precisa estar
compilado (`packages/shared/dist`) antes de rodar qualquer um dos três apps —
sem isso, a API não builda e o mobile/admin-web não encontram o pacote. Rode
de novo toda vez que mudar algo em `packages/shared/src`.

### 1. Banco de dados

```bash
pnpm db:up   # sobe um MySQL local via Docker (infra/docker-compose.yml)
```

Isso é só para desenvolver na sua máquina. Em produção, use o MySQL do
EasyPanel — veja `docs/DEPLOY_EASYPANEL.md`.

### 2. Backend

```bash
cd apps/api
cp .env.example .env   # já vem apontando para o MySQL local do passo 1
pnpm install
pnpm prisma:generate
npx prisma db push      # cria as tabelas no banco (local: MySQL do docker-compose)
pnpm prisma:seed        # cria os 3 planos iniciais (Básico/Profissional/Premium)
pnpm start:dev          # http://localhost:3000/api
```

Em produção (EasyPanel), esses dois últimos passos (criar tabelas e rodar o
seed) acontecem sozinhos toda vez que o container sobe — não precisa repetir
isso lá, é só o fluxo local mesmo que é manual.

Crie a primeira lavaJato (e seu usuário dono) direto pela API:

```bash
curl -X POST http://localhost:3000/api/auth/registrar-lavaJato \
  -H "Content-Type: application/json" \
  -d '{"nomeLavaJato":"LavaJato Alameda","nomeDono":"Marcos Dono","email":"dono@alameda.com","senha":"123456","planoId":"plano-profissional"}'
```

A resposta traz o `lavaJato.id` — use-o no `.env` do app mobile
(`EXPO_PUBLIC_LAVAJATO_ID`) e para cadastrar serviços/funcionários.

### 3. App mobile — testando no celular físico

```bash
cd apps/mobile
pnpm install
cp .env.example .env   # defina EXPO_PUBLIC_API_URL e EXPO_PUBLIC_LAVAJATO_ID
pnpm start
```

O Expo (`pnpm start`) roda um servidor local na sua máquina que só serve o
código do app (o "bundle" JS) — é por isso que o celular precisa estar na
**mesma rede Wi-Fi** do computador: é assim que o app Expo Go no celular
consegue baixar esse código pra rodar. Passo a passo:

1. Instale o app **Expo Go** (Android/iOS) no celular.
2. Garanta que o celular está na mesma Wi-Fi do computador (não em dados
   móveis).
3. Em `apps/mobile/.env`, defina:
   - `EXPO_PUBLIC_API_URL`: a URL **pública** da sua API já publicada no
     EasyPanel (ex.: `https://sua-api.dominio.com/api`) — veja
     `docs/DEPLOY_EASYPANEL.md`. Essa chamada de API não depende da Wi-Fi
     local, só o carregamento do app em si depende.
   - `EXPO_PUBLIC_LAVAJATO_ID`: o `id` retornado ao registrar o lava jato
     (exemplo de comando logo abaixo).
4. Rode `pnpm start` — vai aparecer um QR code no terminal.
5. Abra o Expo Go no celular e escaneie o QR code (no Android, tem um
   scanner dentro do próprio app; no iPhone, pode escanear pela câmera
   nativa, que oferece abrir no Expo Go).

Isso funciona mesmo sem publicar o app nas lojas — é o jeito normal de testar
durante o desenvolvimento. Se ainda não tiver a API publicada, você pode
testar localmente primeiro: rode a API na sua máquina (`pnpm start:dev` em
`apps/api`) e, no `.env` do mobile, use o IP da sua máquina na rede local em
vez de `localhost` (ex.: `http://192.168.0.10:3000/api`) — no emulador
Android, `localhost` não chega no host, por isso o `10.0.2.2` é o valor
usual só para emulador (não vale para celular físico nem para Expo Go).

### 4. Painel SaaS (web)

```bash
cd apps/admin-web
pnpm install
cp .env.example .env
pnpm dev   # http://localhost:3001 (ou a porta que o Next escolher)
```

Para logar como `SAAS_ADMIN` (ainda não há tela de onboarding para o dono da
plataforma — é intencional, só quem já opera o SaaS deveria criar essa
conta), há duas formas:

- **Em produção (EasyPanel)**: defina `SAAS_ADMIN_EMAIL`/`SAAS_ADMIN_SENHA`
  nas variáveis de ambiente do serviço da API — o container cria esse
  usuário sozinho ao subir. Veja `docs/DEPLOY_EASYPANEL.md`.
- **Localmente**: use o Prisma Studio pra editar as tabelas manualmente:

  ```bash
  cd apps/api
  pnpm prisma:studio   # abre uma UI pra editar as tabelas manualmente
  ```

## O que já funciona de ponta a ponta

- Cadastro de lavaJato (onboarding do SaaS) e de cliente, login com JWT.
- LavaJato cadastra serviços e pacotes e edita preços (no app e no protótipo
  de telas essa é a tela "Serviços e pacotes").
- Cliente vê o catálogo, escolhe profissional/horário e agenda (com checagem
  de conflito de horário no backend).
- Funcionário vê a própria agenda e financeiro (comissão sobre atendimentos
  concluídos).
- LavaJato vê agenda geral, financeiro consolidado por funcionário, e
  gerencia a própria assinatura do plano.
- Painel SaaS lista lava jatos assinantes, edita o preço dos planos e lista
  faturas.

## Próximos passos sugeridos

1. **Pagamento de verdade**: integrar um gateway (ver decisão acima) nos
   fluxos de assinatura do lava jato e, opcionalmente, no pagamento do
   cliente final dentro do app.
2. **Gestão de equipe completa**: convite de funcionário por e-mail, ativar/
   desativar, definir comissão — hoje o schema já suporta, falta a tela/rota
   de convite.
3. **Seletor de data/hora de verdade** no app do cliente (a tela atual aceita
   uma data digitada manualmente, de propósito, para não travar o resto do
   fluxo por causa de um único componente de UI).
4. **Notificações push** (lembrete de agendamento, aviso de fatura em atraso).
5. **Testes automatizados** — nenhum foi incluído neste scaffold inicial.
6. Revisar o protótipo de telas (arquivo `.html` enviado antes deste código)
   e portar os detalhes visuais que ainda faltam nas telas mobile (o app já
   usa a mesma paleta de cores e estrutura, mas não está pixel-perfect).
