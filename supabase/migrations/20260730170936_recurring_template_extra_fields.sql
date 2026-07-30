-- Recorrências: campos que o lançamento tem e o template não tinha.
--
-- O template já guardava conta bancária, centro de custo e contraparte, e a
-- materialização já os copiava — faltava só o formulário expor. Notas e
-- documento, porém, não existiam no template, então todo lançamento gerado
-- nascia sem eles e precisava ser completado à mão.
--
-- Também corrige o vencimento: a materialização não preenchia `due_date`, e
-- Contas a Pagar ordena e filtra por essa coluna. Lançamentos recorrentes
-- agendados ficavam de fora do filtro de período daquela tela.

alter table public.recurring_templates
  add column if not exists notes text,
  add column if not exists document_ref text;

comment on column public.recurring_templates.notes is
  'Observações copiadas para cada lançamento gerado.';
comment on column public.recurring_templates.document_ref is
  'Documento de referência (contrato, nota) copiado para cada lançamento gerado.';

-- ===========================================================
-- Materialização passa a copiar notas, documento e vencimento
-- ===========================================================
create or replace function public.materialize_recurring_occurrence(p_template_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  t recurring_templates;
  v_tx_id uuid;
begin
  select * into t from recurring_templates where id = p_template_id;
  if t.id is null then
    raise exception 'Template % não encontrado', p_template_id;
  end if;
  if not t.is_active then
    raise exception 'Template % está inativo', p_template_id;
  end if;
  if t.end_date is not null and t.next_run_date > t.end_date then
    raise exception 'Template % já encerrou em %', p_template_id, t.end_date;
  end if;
  if t.max_occurrences is not null and t.total_generated >= t.max_occurrences then
    raise exception 'Template % atingiu o limite de % ocorrências', p_template_id, t.max_occurrences;
  end if;

  insert into transactions (
    company_id, account_id, cost_center_id, bank_account_id, counterparty_id,
    amount, direction, status, accrual_date, due_date, description,
    notes, document_ref, recurring_template_id, created_by
  ) values (
    t.company_id, t.account_id, t.cost_center_id, t.bank_account_id, t.counterparty_id,
    t.amount, t.direction, 'scheduled', t.next_run_date,
    -- Vencimento na própria data da ocorrência: uma recorrência "todo dia 10"
    -- é uma conta que vence dia 10. Sem isso o lançamento não aparece nos
    -- filtros de Contas a Pagar, que trabalham por due_date.
    t.next_run_date,
    t.description, t.notes, t.document_ref, t.id, auth.uid()
  ) returning id into v_tx_id;

  update recurring_templates
  set
    last_generated_date = next_run_date,
    next_run_date = advance_recurrence_date(next_run_date, frequency::text, day_of_month),
    total_generated = total_generated + 1,
    updated_at = now()
  where id = t.id;

  return v_tx_id;
end;
$$;
