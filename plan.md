# Correção estrutural do staking, operações e ranking

## Objetivo

Corrigir o modelo de staking para que cada aporte seja uma posição independente, com valor, prazo, desbloqueio, valor atual e PnL próprios. O saque de uma posição somente poderá ocorrer depois do desbloqueio e respeitando a liquidez disponível da pool.

## Implementação

- Criar `market_stake_positions` com um registro por aporte e estado `open/closed`.
- Preservar `market_pools` e `market_stakes` para a contabilidade agregada usada pelo trading.
- Migrar stakes agregados existentes para posições legadas já desbloqueadas.
- Criar configuração operacional singleton para limites de valor, prazo, saque antecipado e critérios do ranking.
- Atualizar RPCs de stake/unstake com validação transacional, lock individual, PnL calculado pelo NAV atual e auditoria.
- Atualizar a tela `/stake/:symbol` para escolher prazo no novo stake e listar cada posição com valor travado, tempo restante e PnL percentual.
- Atualizar o ranking para separar pódio dos 3 primeiros e lista Top 10, usando critérios configuráveis e somente traders elegíveis.

## Design

A interface preserva o visual escuro/terminal financeiro atual. O detalhe do stake usa cartões compactos com estados claros (travado, disponível e encerrado), PnL positivo/negativo por cor e contagem regressiva textual. O ranking usa um pódio horizontal para os 3 primeiros e uma tabela/lista densa para as posições 4–10.

## Estrutura

- `drizzle/migrations/0022_individual_stakes_and_operation_settings.sql`: schema, dados legados e RPCs.
- `src/lib/blux.functions.ts`: contratos server-side para stake, posições, configurações e ranking.
- `src/routes/stake.$symbol.tsx`: fluxo de aporte/saque e visualização das posições.
- `src/routes/copy.tsx`: pódio e Top 10.
- `src/routes/ops-*.tsx`: leitura operacional e futuros controles administrativos preservando autenticação existente.
