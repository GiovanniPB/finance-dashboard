
alter table chart_of_accounts_master drop constraint chart_of_accounts_master_sign_hint_check;
alter table chart_of_accounts_master
  add constraint chart_of_accounts_master_sign_hint_check
  check (sign_hint in ('+','-','+/-','='));

alter table chart_of_accounts drop constraint chart_of_accounts_sign_hint_check;
alter table chart_of_accounts
  add constraint chart_of_accounts_sign_hint_check
  check (sign_hint in ('+','-','+/-','='));

