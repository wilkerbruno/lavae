# Arquitetura

## Modelo de dados (visão geral)

- **LavaJato**: o tenant. Tudo (usuários, funcionários, serviços, agenda)
  pertence a um lava jato, exceto o `CLIENTE` (que pode, no futuro, agendar
  em lava jatos diferentes — hoje o app mobile é white-label por lava jato,
  ver README).
- **Usuario**: login único, com `papel` (RBAC). `Funcionario` é uma tabela à
  parte, ligada 1:1 a um `Usuario` de papel `FUNCIONARIO`, guardando dados só
  relevantes pra quem trabalha no lava jato (comissão, disponibilidade).
- **Servico / Pacote**: catálogo com preço em centavos. Um `Pacote` agrupa
  vários `Servico` via `PacoteServico` (tabela de junção N:N).
- **Agendamento**: referencia um serviço OU um pacote (nunca os dois), trava
  o preço no momento da criação (mudar o preço do serviço depois não altera
  agendamentos já feitos) e guarda `inicio`/`fim` pra checagem de conflito.
- **Plano / Assinatura / Fatura**: o lado "SaaS cobra do lava jato". Um plano
  tem preço e lista de recursos; um lava jato tem uma assinatura (1:1) apontando
  pra um plano; cada cobrança periódica vira uma `Fatura`.

## Por que RBAC com guards globais

`JwtAuthGuard` e `RolesGuard` são registrados globalmente em `app.module.ts`
(via `APP_GUARD`), então toda rota nova já nasce protegida — é preciso marcar
explicitamente com `@Public()` pra abrir uma rota, em vez de lembrar de
proteger cada uma manualmente. Isso evita o erro comum de esquecer um guard
numa rota sensível.

## Por que "financeiro" é calculado, não guardado

Não existe uma tabela `Transacao` separada: o financeiro (faturamento,
comissão, lucro) é calculado on-the-fly a partir dos `Agendamento`s com
status `CONCLUIDO` dentro do período pedido (`financeiro.service.ts`). Isso
mantém uma única fonte de verdade (o agendamento) e evita que os dois fiquem
dessincronizados. Se o volume crescer muito, o próximo passo é materializar
esses resumos em uma tabela agregada recalculada por job, em vez de mudar o
modelo agora.

## Por que o app mobile é "um app, três papéis"

Cliente, funcionário e dono do lava jato usam o mesmo binário (`apps/mobile`),
e a navegação pós-login é decidida pelo `papel` do usuário
(`RootNavigator.tsx`). Isso evita manter três apps React Native separados
(três `package.json`, três pipelines de build) para telas que compartilham
autenticação, cliente HTTP, tema e vários componentes. Separar em apps
distintos é uma refatoração possível mais tarde, se times diferentes forem
cuidar de cada papel.
