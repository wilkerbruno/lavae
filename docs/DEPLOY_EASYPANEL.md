# Deploy no EasyPanel (API + MySQL) — o caminho seguro

Este guia parte do que você já confirmou: MySQL no EasyPanel, API no mesmo
servidor (também no EasyPanel), e sem acesso SSH ao servidor. Tudo abaixo foi
desenhado pra funcionar dentro dessas restrições.

## O princípio central

**O MySQL nunca deve ter um domínio público nem uma porta exposta à
internet.** Só a API deve ser pública. A API conversa com o MySQL pela rede
interna do EasyPanel (os serviços de um mesmo projeto se enxergam pelo nome
do serviço, sem passar pela internet). Isso sozinho já elimina o maior risco:
ninguém fora consegue nem tentar se conectar no banco.

```
Internet → HTTPS → [ API (pública) ] → rede interna do EasyPanel → [ MySQL (privado) ]
                                                                        ↑
                                                    nunca exposto, sem domínio, sem porta pública
```

## 1. Criar o serviço de MySQL

1. No EasyPanel, dentro do seu projeto, crie um novo serviço do tipo
   **MySQL** (ou "Database" → MySQL, dependendo da versão do painel).
2. Dê um nome ao serviço (ex.: `lavajato-mysql`) — **esse nome é o hostname
   interno** que a API vai usar pra se conectar. Anote-o.
3. **Não** adicione um domínio a esse serviço e **não** ative nenhuma opção
   de "acesso externo/público". Se o painel perguntar se quer expor a porta
   3306 publicamente, a resposta é não.
4. Aguarde o serviço subir e abra a aba de conexão/credenciais dele — o
   EasyPanel mostra usuário, senha e host tanto para uso interno quanto
   externo. **Use sempre a string/host interno**, nunca o externo.

### Criar um usuário de banco dedicado (em vez de usar o root)

Rodar a API com o usuário `root` do MySQL funciona, mas dá à API mais
permissão do que ela precisa (ex.: apagar outros bancos, se um dia você
hospedar mais de um no mesmo MySQL). O ideal é um usuário só com acesso ao
banco desta aplicação.

Se o serviço de MySQL do EasyPanel tiver uma aba **Console/Terminal** (a
maioria tem — é um terminal dentro do próprio container do banco, aberto
pelo navegador; isso **não é SSH no servidor**, então funciona mesmo sem
acesso SSH), abra-a e rode:

```sql
CREATE DATABASE IF NOT EXISTS lavajato_app;

CREATE USER 'app_lavajato'@'%' IDENTIFIED BY 'SENHA_FORTE_AQUI';

-- SELECT/INSERT/UPDATE/DELETE = uso normal da aplicação.
-- CREATE/ALTER/INDEX/DROP/REFERENCES = necessários pro `prisma db push`
-- criar e atualizar as tabelas sozinho (ver Dockerfile).
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, DROP, REFERENCES
  ON lavajato_app.* TO 'app_lavajato'@'%';

FLUSH PRIVILEGES;
```

Troque `SENHA_FORTE_AQUI` por uma senha forte só sua (pode gerar uma com
`openssl rand -base64 24`, por exemplo).

Se esse serviço **não** tiver uma aba de console, use o usuário/senha root
que o EasyPanel já gerou — só garanta que o banco continua sem domínio
público (o item mais importante da segurança aqui já está garantido mesmo
usando root).

## 2. Criar o serviço da API

1. Crie um novo serviço do tipo **App**, a partir do seu repositório Git
   (GitHub/GitLab) ou fazendo upload do código, conforme o que o EasyPanel
   oferecer.
2. Configuração de build:
   - **Build method**: Dockerfile
   - **Build context / Root directory**: a **raiz do repositório** (não
     `apps/api` — o build precisa enxergar `packages/shared` também, por
     causa do workspace pnpm)
   - **Dockerfile path**: `apps/api/Dockerfile`
   - **Porta**: `3000`
3. Variáveis de ambiente do serviço (aba **Environment**):

   ```
   DATABASE_URL=mysql://app_lavajato:SENHA_FORTE_AQUI@lavajato-mysql:3306/lavajato_app
   JWT_SECRET=<gere um valor forte — veja abaixo>
   JWT_EXPIRES_IN=7d
   NODE_ENV=production
   PORT=3000
   SAAS_ADMIN_EMAIL=voce@suaempresa.com
   SAAS_ADMIN_SENHA=<uma senha forte só sua>
   ```

   Troque `lavajato-mysql` pelo nome real que você deu ao serviço de MySQL
   no passo 1, e `app_lavajato`/`SENHA_FORTE_AQUI` pelo usuário criado lá
   (ou pelas credenciais root, se não criou um usuário dedicado).

   Gere o `JWT_SECRET` no seu computador com:

   ```bash
   openssl rand -base64 48
   ```

   Um valor já gerado pra você usar agora, se preferir (é seguro, foi gerado
   aleatoriamente e não é reaproveitado em nada meu): 

   ```
   bgjQ6lRLPnkONmzwRbNpuoASjy5jqrLpk1/ygvkWo1Alco324qDusY9yh1DQOCtO
   ```

   `SAAS_ADMIN_EMAIL`/`SAAS_ADMIN_SENHA` são opcionais, mas é assim que você
   ganha acesso ao painel do dono da plataforma (`apps/admin-web`) sem
   precisar mexer no banco na mão — o container cria esse usuário sozinho ao
   subir (ver seção 3).

4. Ative um **domínio** para esse serviço (o EasyPanel provisiona HTTPS
   automaticamente via Let's Encrypt). Esse é o único dos dois serviços que
   deve ter domínio público.
5. Faça o deploy.

## 3. Criar o serviço do Painel SaaS (apps/admin-web)

O painel do dono da plataforma (visão geral, lava jatos, planos, faturamento)
é um app Next.js separado — precisa do seu próprio serviço no EasyPanel.

1. Crie outro serviço do tipo **App**, do mesmo repositório.
2. Configuração de build:
   - **Build method**: Dockerfile
   - **Build context / Root directory**: a **raiz do repositório** (mesmo
     motivo da API — o build usa `packages/shared`)
   - **Dockerfile path**: `apps/admin-web/Dockerfile`
   - **Porta**: `3001`
3. **Build variables** (não "Environment variables" — o Next.js grava essa
   URL direto no JavaScript enviado ao navegador no momento do build, então
   ela precisa chegar como *build arg*, não como variável de runtime; veja o
   comentário no topo do `apps/admin-web/Dockerfile`):

   ```
   NEXT_PUBLIC_API_URL=https://sua-api.dominio.com/api
   ```

   Troque pela URL pública de verdade do serviço da API (passo 2). Se depois
   você mudar essa URL, precisa fazer um novo deploy (rebuild) do painel, não
   só reiniciar o container.

4. Ative um **domínio** para esse serviço também (ex.: `painel.seudominio.com.br`).
5. Faça o deploy.

Se for configurar cobrança recorrente (Mercado Pago, ver
`apps/api/.env.example` e os comentários em `AssinaturasService`), aponte
`MERCADOPAGO_BACK_URL` (variável de ambiente da API) para
`https://painel.seudominio.com.br/pagamento-confirmado` — é a página pra onde
o dono do lava jato volta depois de autorizar o pagamento.

## 4. O que acontece automaticamente no primeiro boot

O `CMD` do `apps/api/Dockerfile` roda, nesta ordem, toda vez que o container
sobe:

1. `prisma db push` — cria (ou atualiza) todas as tabelas no MySQL a partir
   de `schema.prisma`. É isso que resolve "criar todas as tabelas" sem você
   precisar rodar nenhum comando manualmente.
2. `prisma/seed.ts` — cria os 3 planos iniciais (Básico/Profissional/Premium)
   e, se você definiu `SAAS_ADMIN_EMAIL`/`SAAS_ADMIN_SENHA`, garante esse
   usuário SAAS_ADMIN. Roda de novo em todo redeploy sem problema (é
   idempotente — nunca duplica nem apaga nada).
3. `node dist/main.js` — inicia a API de fato.

Depois do primeiro deploy bem-sucedido, confira nos **Logs** do serviço da
API se apareceram as linhas `Planos criados/atualizados com sucesso.` e
(se configurou) `Usuário SAAS_ADMIN garantido para ...`.

Com isso:
- **Painel SaaS** (`apps/admin-web`): faça login com o `SAAS_ADMIN_EMAIL`/
  `SAAS_ADMIN_SENHA` que você definiu.
- **Primeira lavaJato**: registre via
  `POST https://sua-api.dominio.com/api/auth/registrar-lavaJato` (mesmo
  corpo do exemplo no README), usando um dos `planoId` do seed
  (`plano-basico`, `plano-profissional` ou `plano-premium`).

## 5. Checklist de segurança (resumo)

- [ ] MySQL sem domínio público e sem porta exposta à internet.
- [ ] `DATABASE_URL` da API aponta para o **hostname interno** do MySQL
      (nome do serviço no EasyPanel), nunca para um endereço público.
- [ ] Usuário do banco usado pela API não é o `root` (ou, se for, você sabe
      que é uma concessão temporária).
- [ ] `JWT_SECRET` é um valor longo e gerado aleatoriamente, diferente entre
      ambientes (nunca o valor de exemplo do `.env.example`).
- [ ] Só a API e o painel (`apps/admin-web`) têm domínio/HTTPS público — o
      MySQL nunca.
- [ ] `SAAS_ADMIN_SENHA` é uma senha forte, não uma senha reaproveitada de
      outro lugar.

## 6. Evoluindo depois

Quando o schema do banco estabilizar (poucas mudanças de tabela por semana),
vale trocar `prisma db push` por `prisma migrate deploy` com migrações
versionadas (`prisma migrate dev` localmente gera os arquivos) — mais seguro
para mudanças que alteram dados existentes, e cria um histórico do que mudou
no banco ao longo do tempo.

## 7. Deploy da versão web do app (clientes acessando pelo navegador)

Além do painel (`apps/admin-web`), o próprio app do cliente final (agendar/
pagar) também roda no navegador — via Expo Web (`react-native-web`), ver
`apps/mobile/Dockerfile.web`. Serve como alternativa pros clientes com iPhone
enquanto o app não está na App Store; dono/funcionário continuam usando o
app Android normalmente (essa versão web bloqueia essas contas com um aviso,
ver comentário em `RootNavigator.tsx`).

1. Crie outro serviço do tipo **App**, do mesmo repositório.
2. Configuração de build:
   - **Build method**: Dockerfile
   - **Build context / Root directory**: a **raiz do repositório** (mesmo
     motivo da API/painel — o build usa `packages/shared`)
   - **Dockerfile path**: `apps/mobile/Dockerfile.web`
   - **Porta**: `3002`
3. **Build variables** (não "Environment variables" — pelo mesmo motivo do
   `NEXT_PUBLIC_API_URL` do painel: essa URL é gravada direto no JavaScript
   que vai pro navegador no momento do build):

   ```
   EXPO_PUBLIC_API_URL=https://sua-api.dominio.com/api
   ```

   Troque pela URL pública de verdade do serviço da API (seção 2). Se depois
   mudar essa URL, precisa fazer um novo deploy (rebuild), não só reiniciar
   o container.

4. Ative um **domínio** para esse serviço (ex.: `app.seudominio.com.br`) —
   esse é o link que você manda pros clientes com iPhone.
5. Faça o deploy.

Essa versão web é só um paliativo: reaproveita o mesmo código do app mobile
(mesmas telas de cliente, mesma API), então qualquer melhoria feita numa
também pode valer pra outra — mas WebView nativa (mapa, formulário de
cartão, desafio 3DS) foi trocada por equivalentes de navegador
(`WebViewCompat`/`DeviceIdCollector`, ver `apps/mobile/src/components/`), e
o app Android **não muda em nada** por causa disso (ver comentário no topo
de cada um desses arquivos).
