-- =============================================================================
-- mcp_clients passa de lista de PERMITIDOS para lista de BLOQUEADOS
--
-- POR QUE A INVERSÃO. A tabela nasceu como allow-list: só o `client_id` cadastrado
-- podia usar o servidor MCP. Isso não sobrevive ao registro dinâmico de clientes —
-- e o registro dinâmico é obrigatório para o claude.ai se conectar.
--
-- Medido em produção: quatro tentativas de conexão do Claude, em cinco minutos,
-- geraram QUATRO client_ids distintos (16:09, 16:10, 16:12, 16:14). Autorizar um id
-- é autorizar algo que já morreu na tentativa seguinte; a lista nunca é satisfeita e
-- o conector nunca conecta.
--
-- E a proteção era menor do que parecia. Registrar um cliente, sozinho, não dá acesso
-- a nada: quem quer um token precisa das credenciais da pessoa e do consentimento
-- explícito dela. As defesas reais são outras três, e nenhuma muda aqui — o
-- consentimento, a RLS, e a blindagem que impede token de OAuth de escrever.
--
-- O que valia preservar era poder REVOGAR um conector na hora. Uma lista de bloqueio
-- faz isso igual, sem brigar com o protocolo: por padrão passa, barra quem foi
-- desativado. Quem está em uso de fato aparece em `mcp_query_log.client_id`.
--
-- Nada de schema muda: só o significado, e é ele que precisa estar escrito no banco.
-- =============================================================================

comment on table public.mcp_clients is
  'Conectores de IA com decisão explícita. LISTA DE BLOQUEIO: o servidor MCP consulta a cada requisição e barra (403) apenas o client_id cadastrado aqui com ativo = false. Conector ausente da tabela passa — com registro dinâmico, cada conexão gera um client_id novo. Para saber quais estão de fato em uso, consulte mcp_query_log.client_id.';

comment on column public.mcp_clients.ativo is
  'false bloqueia este conector imediatamente. É o botão de revogação.';

comment on column public.mcp_clients.company_ids is
  'Reservado: estreitar o escopo do conector para menos empresas do que o usuário enxerga. Ainda não imposto.';

comment on column public.mcp_clients.modules is
  'Reservado: estreitar o escopo do conector para menos módulos do que o usuário enxerga. Ainda não imposto.';
