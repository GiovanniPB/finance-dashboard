-- =============================================================================
-- NFS-e — bucket de Storage para XML e DANFSe
--
-- A focus-webhook (service role) baixa o XML/DANFSe do Focus e sobe aqui em
-- `<company_id>/<focus_ref>.{xml,pdf}`. A leitura no dashboard é escopada pela
-- empresa dona da pasta (has_company_access). Escrita só por service role
-- (bypassa RLS). Bucket privado (arquivos fiscais / PII).
-- =============================================================================

insert into storage.buckets (id, name, public)
values ('nfse-files', 'nfse-files', false)
on conflict (id) do nothing;

-- Leitura: usuário com acesso à empresa dona (1ª pasta do path = company_id).
create policy "nfse_files_read"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'nfse-files'
    and public.has_company_access(((storage.foldername(name))[1])::uuid)
  );
