-- =============================================================================
-- pagar.me — Ledger de vendas (1/2): valores de enum
-- Doc: docs/integrations/pagarme-sales-plan.md · pagarme-api-contract.md
--
-- POR QUE UMA MIGRATION SÓ PARA ISSO: `alter type ... add value` adiciona o
-- valor na transação corrente, mas o novo rótulo só pode ser USADO depois do
-- commit. Como as policies da migration seguinte referenciam `'sales'` e a
-- conta gateway usa `'payment_gateway'`, os dois passos precisam de transações
-- distintas — ou seja, de arquivos distintos.
-- =============================================================================

-- Módulo de visualização do ledger/dashboard de vendas.
-- Perfis com `visible_modules` NULL continuam vendo tudo (comportamento atual);
-- allow-lists explícitas precisam ganhar 'sales' para ver a área nova.
alter type public.data_module add value if not exists 'sales';

-- A carteira do gateway é uma conta de verdade: recebe as liquidações, paga as
-- taxas de adquirência e sai por transferência para o banco. Modelar como
-- `bank_accounts` é o que faz o saque virar `create_transfer` (fora da DRE/fluxo,
-- dentro do saldo por conta) em vez de receita — é isso que elimina o spike.
alter type public.bank_account_type add value if not exists 'payment_gateway';
