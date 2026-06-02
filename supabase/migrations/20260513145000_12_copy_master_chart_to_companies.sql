
insert into chart_of_accounts (
  company_id, code, name, kind, dre_section, master_account_id,
  is_summary, below_the_line, sign_hint, sort_order, is_active
)
select
  c.id, m.code, m.name, m.kind, m.dre_section, m.id,
  m.is_summary, m.below_the_line, m.sign_hint, m.sort_order, true
from companies c
cross join chart_of_accounts_master m
where c.is_holding = false
  and m.organization_id = c.organization_id;

-- set parent_id usando join próprio
update chart_of_accounts c
set parent_id = (
  select pc.id
  from chart_of_accounts pc
  join chart_of_accounts_master pm on pm.id = pc.master_account_id
  join chart_of_accounts_master m on m.id = c.master_account_id
  where pm.id = m.parent_id and pc.company_id = c.company_id
  limit 1
)
where c.master_account_id is not null;

