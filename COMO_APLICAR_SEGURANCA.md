# Aplicar o schema completo e o endurecimento de segurança no Supabase

O arquivo [`supabase-security-hardening.sql`](./supabase-security-hardening.sql) agora é um **bootstrap completo** do banco. Ele cria primeiro o schema base do BluxTrade e depois aplica o endurecimento de segurança.

Isso corrige o erro:

```text
ERROR: 42P01: relation "public.profiles" does not exist
```

Esse erro aconteceu porque o arquivo anterior continha apenas a camada de segurança e pressupunha que `public.profiles` já existia.

## O que o arquivo completo cria

- extensão `pgcrypto`;
- enum `app_role`;
- tabelas `user_roles`, `profiles`, `pool`, `stakes`, `positions`, `deposits` e `withdrawals`;
- índices, RLS, políticas e permissões base;
- trigger de criação de usuário;
- funções financeiras de posição, stake, depósito e retirada;
- tabela privada `profile_challenges`;
- migração dos desafios Roblox existentes;
- RLS owner-only para o desafio Roblox;
- restrição dos campos públicos de `profiles`;
- validação server-side do nome Roblox;
- geração de frase com prefixo `invest with bluxtrade` e quatro palavras aleatórias;
- bootstrap de admin protegido por função server-side e lock;
- RPC transacional de depósitos com lock por usuário;
- permissões `service_role` necessárias para o backend.

Todas as mensagens SQL do arquivo estão em **inglês**, conforme o padrão da plataforma.

## Como executar

1. Abra o projeto correto no [Supabase](https://supabase.com/dashboard).
2. Confirme que o projeto é o mesmo usado pela aplicação BluxTrade.
3. Abra **SQL Editor**.
4. Clique em **New query**.
5. Abra o arquivo `supabase-security-hardening.sql` e copie **todo o conteúdo**, do `begin;` até o `commit;`.
6. Cole tudo no SQL Editor.
7. Clique em **Run**.
8. Espere a execução terminar sem erro.

O arquivo já contém `begin;` e `commit;`. Se ocorrer um erro, a transação deve ser revertida. Corrija o erro e execute o arquivo inteiro novamente.

> Use o arquivo completo atualizado. Não use uma cópia antiga que contenha somente a parte de security hardening.

## Conferência após executar

Depois que o SQL terminar, execute esta consulta separada:

```sql
select
  to_regclass('public.user_roles') as user_roles,
  to_regclass('public.profiles') as profiles,
  to_regclass('public.pool') as pool,
  to_regclass('public.stakes') as stakes,
  to_regclass('public.positions') as positions,
  to_regclass('public.deposits') as deposits,
  to_regclass('public.withdrawals') as withdrawals,
  to_regclass('public.profile_challenges') as profile_challenges,
  to_regprocedure('public.fn_claim_admin(uuid)') as claim_admin_function,
  to_regprocedure('public.fn_request_deposit(uuid,numeric)') as deposit_function;
```

Nenhuma coluna deve aparecer como `null`.

Confira as políticas RLS:

```sql
select schemaname, tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

Confira que RLS está ativo nas tabelas protegidas:

```sql
select relname, relrowsecurity, relforcerowsecurity
from pg_class
where oid in (
  'public.user_roles'::regclass,
  'public.profiles'::regclass,
  'public.profile_challenges'::regclass,
  'public.deposits'::regclass,
  'public.withdrawals'::regclass
)
order by relname;
```

`relrowsecurity` deve aparecer como `true`.

## Configurações da aplicação

No Vercel, mantenha estas variáveis somente no ambiente **Production** e como secrets:

```text
SUPABASE_SERVICE_ROLE_KEY
ADMIN_BOOTSTRAP_SECRET
```

`SUPABASE_SERVICE_ROLE_KEY` nunca deve começar com `VITE_` e nunca pode aparecer no frontend.

O secret `DATABASE_URL` do GitHub Actions só é necessário para o workflow automático. Depois de aplicar este arquivo manualmente, o workflow pode continuar falhando sem alterar o banco; isso não desfaz a migração manual.

## O que não fazer

- Não execute o SQL no projeto Supabase errado.
- Não cole chaves secretas neste arquivo.
- Não coloque `SUPABASE_SERVICE_ROLE_KEY` ou `ADMIN_BOOTSTRAP_SECRET` no frontend.
- Não rode apenas um trecho do arquivo.
- Não remova o `begin;` ou o `commit;`.
