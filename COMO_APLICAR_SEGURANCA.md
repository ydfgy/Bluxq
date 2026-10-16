# Aplicar o endurecimento de segurança no Supabase

Este procedimento aplica a migração completa do BluxTrade diretamente pelo **Supabase SQL Editor**. O arquivo é idempotente: pode ser executado novamente sem duplicar a tabela de desafios, as funções ou as políticas.

## Arquivo SQL completo

Use o arquivo [`supabase-security-hardening.sql`](./supabase-security-hardening.sql). Ele contém:

- tabela privada `public.profile_challenges`;
- RLS owner-only para o desafio Roblox;
- cópia dos desafios já existentes;
- remoção do acesso amplo aos campos de `profiles`;
- restrição do perfil ao próprio usuário;
- validação server-side do nome Roblox;
- geração de frase com prefixo `invest with bluxtrade` e quatro palavras aleatórias;
- bootstrap de admin protegido por função server-side e lock;
- RPC transacional de depósitos com lock por usuário;
- permissões `service_role` necessárias para o backend.

## Como executar

1. Abra o projeto correto no [Supabase](https://supabase.com/dashboard).
2. Abra **SQL Editor**.
3. Clique em **New query**.
4. Abra o arquivo `supabase-security-hardening.sql` e copie **todo o conteúdo**, do `begin;` até o `commit;`.
5. Cole o conteúdo no SQL Editor.
6. Confira se está conectado ao projeto correto.
7. Clique em **Run**.
8. Espere a execução terminar sem erro.

O arquivo já contém `begin;` e `commit;`. Se ocorrer um erro, a transação não deve aplicar parcialmente as alterações. Corrija o erro e execute o arquivo inteiro novamente.

> Não altere os nomes das tabelas, funções, políticas ou colunas do arquivo.

## Conferência após executar

Depois que o SQL terminar, execute esta consulta separada no SQL Editor:

```sql
select
  to_regclass('public.profile_challenges') as profile_challenges,
  to_regclass('public.profiles') as profiles,
  to_regclass('public.deposits') as deposits,
  to_regprocedure('public.fn_claim_admin(uuid)') as claim_admin_function,
  to_regprocedure('public.fn_request_deposit(uuid,numeric)') as deposit_function;
```

O resultado esperado é que nenhuma coluna venha como `null`.

Confira as políticas RLS:

```sql
select schemaname, tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('profiles', 'profile_challenges')
order by tablename, policyname;
```

Você deve ver a política `own verification challenge` em `profile_challenges` e a política `own profile` em `profiles`.

Confira que a tabela de desafios está com RLS ativo:

```sql
select relname, relrowsecurity, relforcerowsecurity
from pg_class
where oid in (
  'public.profile_challenges'::regclass,
  'public.profiles'::regclass
);
```

`relrowsecurity` deve aparecer como `true` para as duas tabelas.

## Configurações necessárias na aplicação

No Vercel, mantenha estas variáveis somente no ambiente **Production** e como secrets:

```text
SUPABASE_SERVICE_ROLE_KEY
ADMIN_BOOTSTRAP_SECRET
```

`SUPABASE_SERVICE_ROLE_KEY` nunca deve começar com `VITE_` e nunca pode aparecer no frontend.

No GitHub Actions, o secret `DATABASE_URL` só é necessário para o workflow automático. Depois de aplicar este arquivo manualmente, o workflow pode continuar falhando sem alterar o banco; isso não desfaz a migração manual.

## O que não fazer

- Não execute o SQL no projeto Supabase errado.
- Não cole chaves secretas neste arquivo.
- Não coloque `SUPABASE_SERVICE_ROLE_KEY` ou `ADMIN_BOOTSTRAP_SECRET` no frontend.
- Não rode apenas um trecho do arquivo.
- Não remova o `begin;` ou o `commit;`.
