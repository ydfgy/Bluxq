# Auditoria de Segurança Zero Trust — Bluxq

Data: 17/10/2026

## Escopo

Foi revisado o fluxo da aplicação React/TanStack Start, server functions, autenticação Supabase, políticas RLS, funções SQL de saldo/posição, migrações, executor de deploy, integração de preços externos e consultas do frontend.

A revisão foi estática e baseada no código versionado. Não foram executados testes destrutivos no banco de produção.

## Correções aplicadas

### 1. Executor de migrações incompleto — corrigido

O executor aplicava somente `0003_security_hardening.sql`, embora o repositório possua migrações `0000` até `0010`. Isso podia deixar recursos de carteira, afiliados, métodos de pagamento, privacidade e correções financeiras fora do ambiente implantado.

Agora o executor:

- descobre todas as migrações SQL numeradas;
- aplica em ordem;
- registra cada arquivo individualmente;
- não reaplica migrações já registradas;
- reconhece um banco legado que já possui a tabela-base;
- remove apenas os wrappers transacionais externos dos arquivos que já possuem `BEGIN/COMMIT`.

### 2. Duplo pagamento de comissão de afiliado — corrigido

`fn_claim_affiliate` calculava o total pendente antes de marcar as linhas como resgatadas. Duas requisições simultâneas podiam ler o mesmo total e creditar duas vezes.

A migração `0011_atomic_affiliate_claim.sql` agora usa `UPDATE ... RETURNING`. A primeira transação bloqueia e marca as linhas; uma chamada concorrente não recebe as mesmas linhas.

### 3. Invariantes financeiras no banco — adicionadas

A migração `0012_financial_invariants.sql` adiciona constraints defensivas, `NOT VALID`, para novas escritas:

- símbolos permitidos;
- alavancagem entre 1x e 50x;
- margem, quantidade, preço de entrada e preço de liquidação positivos;
- dívida e reserva não negativas;
- valores da pool não negativos.

O banco passa a ser a última barreira, mesmo que uma chamada contorne o frontend ou um novo endpoint seja implementado incorretamente.

### 4. Autorização e exposição de dados — endurecidas

- Mutations usam `context.userId`, nunca um `user_id` fornecido pelo cliente.
- O token do painel Admin é vinculado ao subject do JWT autenticado.
- Consultas com `select("*")` foram reduzidas às colunas necessárias.
- O painel Admin limita a quantidade de registros pendentes retornados.
- Headers HTTP anti-clickjacking, anti-MIME-sniffing, referrer policy e permissions policy foram adicionados.
- A rota privada do Admin foi removida do manifesto público e bloqueada no `robots.txt`.

## Controles já existentes confirmados

- Server functions usam middleware Supabase antes de acessar dados sensíveis.
- Operações monetárias chamam funções SQL `security definer` via service role.
- RLS restringe perfis, posições, stakes, depósitos, saques, desafios de verificação e comissões ao usuário autenticado.
- Fechamento de posição verifica no banco se a posição está aberta e pertence ao usuário.
- Aprovação de depósitos e saques exige papel Admin no servidor.
- Valores monetários, métodos, usernames, símbolos e identificadores são validados server-side.
- CSRF middleware está habilitado para server functions.
- Nenhum segredo privado foi encontrado versionado.

## Riscos residuais e recomendações

### Oráculo de preço

A plataforma depende de Binance e CoinGecko. O backend usa fallback entre fontes, mas não há circuito de divergência entre fontes, mediana, stale-price guard ou registro de preço usado na liquidação. Para produção financeira, recomenda-se:

1. comparar múltiplas fontes simultaneamente;
2. rejeitar preço quando a divergência exceder um limite;
3. registrar fonte, timestamp e preço no fechamento;
4. impedir operações com preço mais antigo que uma janela curta;
5. implementar circuit breaker quando as fontes estiverem instáveis.

### Rate limiting distribuído

O bloqueio do PIN Admin é server-side, mas a tabela de tentativas é em memória do processo. Em múltiplas instâncias, o rate limit não é global. O ambiente de produção deve adicionar rate limiting no edge/WAF ou Redis/KV compartilhado para autenticação, criação de conta, verificação Roblox, operações de trading e consultas de alta frequência.

### Token Admin

O token ainda é enviado pelo cliente em cada server function e mantido em `sessionStorage`. O backend o valida criptograficamente e o vincula ao usuário, mas uma vulnerabilidade XSS futura poderia expô-lo durante a sessão. O próximo endurecimento recomendado é trocar por cookie `HttpOnly`, `Secure`, `SameSite=Strict`, com revogação server-side.

### Migrações legadas

`supabase-security-hardening.sql` é uma cópia manual antiga e não representa automaticamente todas as migrações posteriores. O caminho de deploy recomendado passa a ser `scripts/migrate.mjs` com `DATABASE_URL`, seguido de verificação de `bluxtrade_schema_migrations`. O script manual deve ser aposentado ou regenerado para evitar drift.

### Contabilidade

A contabilidade de pool, reserva, fees e payout deve ter testes de propriedade/invariantes no banco ou em ambiente de staging. Recomenda-se verificar após cada operação:

- saldo nunca negativo;
- `total_reserved <= total_assets` quando essa for a regra de negócio;
- posição fechada não pode ser fechada novamente;
- cada comissão possui no máximo um claim;
- soma de débitos, créditos, fees e reservas permanece reconciliável.

## Validação executada

- TypeScript sem erros.
- Testes existentes aprovados.
- Build de produção aprovado antes desta rodada; após as migrações, foi feita validação sintática do executor e revisão de diff.
- Lint focado sem erros; permanecem apenas warnings preexistentes no `useMemo` da tela de trading.
