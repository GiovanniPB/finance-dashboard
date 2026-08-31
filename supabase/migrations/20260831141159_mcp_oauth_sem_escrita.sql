-- =============================================================================
-- Token de OAuth não escreve — garantia do banco, não promessa do servidor
--
-- O PROBLEMA. O OAuth 2.1 Server do Supabase ainda não tem escopos (roadmap, sem
-- ETA). O access token que o claude.ai vai guardar é um JWT de sessão com TODOS os
-- privilégios do usuário — inclusive escrita. Um token vazado escreveria no banco
-- via PostgREST sem nunca passar pelo nosso servidor MCP. Num sistema contábil isso
-- é inaceitável, e nenhuma disciplina de código do lado do servidor resolve.
--
-- A TRAVA. O JWT emitido pelo OAuth Server carrega a claim `client_id`; um login
-- normal do aplicativo não carrega. Logo: `client_id is null` distingue "a pessoa,
-- no app" de "um cliente de IA agindo em nome da pessoa".
--
-- POR QUE POLICY RESTRITIVA, e não editar as policies existentes. São ~92 policies
-- de escrita hoje, 11 delas `for all` (onde o mesmo USING vale para SELECT). Mexer
-- em cada uma é caro e arrisca quebrar leitura sem que ninguém perceba. Uma policy
-- RESTRICTIVE faz AND com todas as permissivas: é aditiva, não toca em nada
-- existente, e vale mesmo para super admin — porque o token de IA do super admin
-- também não deve escrever.
--
-- O predicado vai em `(select ...)` para virar InitPlan, avaliado uma vez por
-- statement, conforme a convenção de RLS do projeto.
--
-- EXCEÇÃO DELIBERADA: `mcp_query_log`. É justamente o acesso via IA que precisa
-- registrar o próprio rastro; um log que o agente não consegue escrever não é log.
-- A tabela é append-only e não guarda conteúdo de linha.
--
-- COMO A RECUSA APARECE. INSERT falha alto (42501, citando a policy pelo nome);
-- UPDATE e DELETE simplesmente não alcançam linha nenhuma e retornam vazio — é a
-- semântica normal de RLS, em que o USING restritivo esconde a linha em vez de
-- recusar a operação. Verificado local, via PostgREST, com dois JWTs do MESMO
-- usuário: com `client_id`, PATCH e DELETE devolvem `[]` e a linha fica intacta;
-- sem `client_id`, o mesmo PATCH altera a linha.
--
-- Service role (Edge Functions, cron) ignora RLS e não é afetado.
-- =============================================================================

do $mig$
declare
  r record;
begin
  for r in
    select tablename
    from pg_tables
    where schemaname = 'public'
      and rowsecurity
      and tablename <> 'mcp_query_log'
    order by tablename
  loop
    execute format('drop policy if exists oauth_sem_escrita_ins on public.%I', r.tablename);
    execute format(
      $f$create policy oauth_sem_escrita_ins on public.%I
           as restrictive for insert to authenticated
           with check ((select auth.jwt() ->> 'client_id') is null)$f$,
      r.tablename);

    execute format('drop policy if exists oauth_sem_escrita_upd on public.%I', r.tablename);
    execute format(
      $f$create policy oauth_sem_escrita_upd on public.%I
           as restrictive for update to authenticated
           using ((select auth.jwt() ->> 'client_id') is null)
           with check ((select auth.jwt() ->> 'client_id') is null)$f$,
      r.tablename);

    execute format('drop policy if exists oauth_sem_escrita_del on public.%I', r.tablename);
    execute format(
      $f$create policy oauth_sem_escrita_del on public.%I
           as restrictive for delete to authenticated
           using ((select auth.jwt() ->> 'client_id') is null)$f$,
      r.tablename);
  end loop;
end
$mig$;

-- Nota para tabelas NOVAS: elas nascem sem estas policies. Enquanto o Supabase não
-- entregar escopos, toda tabela nova com RLS precisa do mesmo trio — registrado na
-- convenção de RLS do CLAUDE.md.
