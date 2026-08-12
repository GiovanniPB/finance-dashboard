-- Aging: quebrar o futuro em faixas de proximidade do vencimento.
--
-- O card de aging media só atraso: quatro faixas de vencido e um balde único
-- "A vencer" para todo o resto. Isso funcionava quando o futuro tinha uma dúzia
-- de títulos. Com as recorrências materializadas 12 meses à frente, o balde
-- passou a concentrar quase todo o valor — numa empresa, 227 títulos e
-- R$ 462 mil contra R$ 5 mil de vencido — e o card parou de informar.
--
-- Agora o eixo é a linha do tempo inteira, com a mesma régua dos dois lados do
-- vencimento: até 30, 31-60, 61-90 e mais de 90 dias. A pergunta que o card
-- passa a responder é "quanto sai nos próximos 30 dias", que é a que importa
-- quando existe um ano de futuro projetado.
--
-- O vencido **mantém** as quatro faixas em vez de virar um bloco só: há empresa
-- com 30 títulos e R$ 156 mil vencidos em 0-30 dias, e perder essa quebra seria
-- trocar um problema por outro.
--
-- Título sem vencimento ganha faixa própria. Antes caía em "A vencer" e sumia
-- no meio — são 13 títulos e R$ 153 mil em aberto, dinheiro demais para ficar
-- escondido num balde que diz outra coisa. Como a soma das faixas é o total em
-- aberto exibido no topo da tela, ele também não pode simplesmente sair da
-- conta.

create or replace view public.v_bills_aging as
with bucketed as (
  select
    company_id,
    direction,
    open_amount,
    case
      -- Sem data não dá para posicionar na linha do tempo: faixa própria, para
      -- aparecer como pendência de cadastro em vez de se disfarçar de futuro.
      when days_overdue is null       then 'no_due_date'
      -- Vencido (days_overdue >= 0; vencer hoje conta como vencido, como antes).
      when days_overdue > 90          then 'overdue_90_plus'
      when days_overdue > 60          then 'overdue_61_90'
      when days_overdue > 30          then 'overdue_31_60'
      when days_overdue >= 0          then 'overdue_0_30'
      -- A vencer (days_overdue negativo = dias que faltam).
      when days_overdue >= -30        then 'due_0_30'
      when days_overdue >= -60        then 'due_31_60'
      when days_overdue >= -90        then 'due_61_90'
      else                                 'due_90_plus'
    end as bucket
  from public.v_bills
  where effective_status not in ('paid', 'canceled')
)
select
  company_id,
  direction,
  bucket,
  count(*)::int as count,
  coalesce(sum(open_amount), 0)::numeric as total
from bucketed
group by company_id, direction, bucket;

comment on view public.v_bills_aging is
  'Aging por faixa de vencimento: vencido 0-30/31-60/61-90/+90, a vencer 0-30/31-60/61-90/+90 e sem vencimento. A soma das faixas é o total em aberto.';
