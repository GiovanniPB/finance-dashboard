-- Polymorphic attachments table linking files in Supabase Storage to any
-- entity in the system (transactions, counterparties, companies, etc.).

create type public.attachment_entity_type as enum (
  'transaction',
  'counterparty',
  'company',
  'payroll_run',
  'employee'
);

create table public.attachments (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  entity_type   public.attachment_entity_type not null,
  entity_id     uuid not null,
  storage_path  text not null unique,
  file_name     text not null,
  mime_type     text not null,
  size_bytes    bigint not null check (size_bytes > 0 and size_bytes <= 26214400), -- 25 MB
  uploaded_by   uuid references auth.users(id) on delete set null,
  notes         text,
  created_at    timestamptz not null default now()
);

create index attachments_entity_idx on public.attachments(entity_type, entity_id);
create index attachments_company_idx on public.attachments(company_id);

alter table public.attachments enable row level security;

-- RLS: any user with company access can manage attachments scoped to that company.
create policy "Users with company access can view attachments"
  on public.attachments for select to authenticated
  using (has_company_access(company_id));

create policy "Users with company access can insert attachments"
  on public.attachments for insert to authenticated
  with check (has_company_access(company_id) and uploaded_by = auth.uid());

create policy "Users with company access can update attachments"
  on public.attachments for update to authenticated
  using (has_company_access(company_id));

create policy "Users with company access can delete attachments"
  on public.attachments for delete to authenticated
  using (has_company_access(company_id));

-- Storage bucket: private (signed URLs only).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'attachments',
  'attachments',
  false,
  26214400,
  array[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
    'application/xml',
    'text/xml',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv',
    'application/x-ofx'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Storage RLS: object path is `{company_id}/{entity_type}/{entity_id}/{uuid}.{ext}`.
-- We extract the leading UUID (company_id) to check access.
create policy "Users with company access can read attachment objects"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'attachments'
    and has_company_access((storage.foldername(name))[1]::uuid)
  );

create policy "Users with company access can upload attachment objects"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and has_company_access((storage.foldername(name))[1]::uuid)
  );

create policy "Users with company access can delete attachment objects"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'attachments'
    and has_company_access((storage.foldername(name))[1]::uuid)
  );

comment on table public.attachments is
  'Polymorphic attachments linking storage objects to domain entities, scoped by company';
