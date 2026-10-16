-- 첨부 파일(이미지·PDF·오디오·비디오): 보관함 단위 비공개 저장소 + 목록 테이블
-- Obsidian처럼 파일 이름(대소문자 무시)으로 ![[이름.png]] 를 찾는다. 파일 본문은 Storage, 이름·크기 등은 brain_files.

create table public.brain_files (
  id uuid primary key default gen_random_uuid(),
  vault_id uuid not null references public.brain_vaults(id) on delete cascade,
  name text not null check (length(btrim(name)) > 0 and name !~ '[][|#^\\/:]'),
  folder text not null default '' check (folder = '' or (folder !~ '(^/|/$|//)' and folder !~ '[][|#^\\]')),
  mime text not null default 'application/octet-stream',
  size bigint not null check (size >= 0 and size <= 52428800),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);
create unique index brain_files_name on public.brain_files (vault_id, lower(name));
create index brain_files_vault on public.brain_files (vault_id, created_at desc);

alter table public.brain_files enable row level security;
create policy brain_files_read on public.brain_files for select to authenticated using (public.brain_can_read(vault_id));
create policy brain_files_insert on public.brain_files for insert to authenticated
  with check (public.brain_can_write(vault_id) and created_by = auth.uid());
create policy brain_files_delete on public.brain_files for delete to authenticated using (public.brain_can_write(vault_id));
revoke all on public.brain_files from anon;
alter publication supabase_realtime add table public.brain_files;

-- Storage: 비공개 버킷. 경로는 "<보관함 id>/<파일 id>" 이고 첫 칸의 보관함 권한으로 막는다.
insert into storage.buckets (id, name, public, file_size_limit)
values ('brain-files', 'brain-files', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = 52428800;

create policy brain_files_obj_read on storage.objects for select to authenticated
  using (bucket_id = 'brain-files' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
         and public.brain_can_read(((storage.foldername(name))[1])::uuid));
create policy brain_files_obj_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'brain-files' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
              and public.brain_can_write(((storage.foldername(name))[1])::uuid));
create policy brain_files_obj_delete on storage.objects for delete to authenticated
  using (bucket_id = 'brain-files' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
         and public.brain_can_write(((storage.foldername(name))[1])::uuid));
