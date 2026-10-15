-- Second Brain 스키마: 함께 쓰는 Obsidian (보관함 단위 공유)
-- 새 Supabase 프로젝트에 다시 만들 때 이 파일을 SQL Editor에서 한 번에 실행하면 된다.
-- 구조
--   brain_vaults    보관함 (Obsidian의 vault)
--   brain_members   보관함 멤버와 권한 (owner / editor / viewer). 내보내기는 removed_at 표시
--   brain_invites   이메일 초대. Google로 확인된 같은 이메일 계정만 수락할 수 있다
--   brain_profiles  각자 정하는 표시 이름 (처음엔 Google 이름)
--   brain_notes     노트 (link_keys = Obsidian metadataCache 역할의 링크 색인)
--   brain_folders   빈 폴더도 남도록 폴더 목록
--   brain_revisions 수정 이력

-- ---------- 링크 해석 (공용) ----------
-- 본문에서 [[대상]], [[대상#소제목]], [[대상|별칭]] 추출
create or replace function public.sb_extract_links(p_content text)
returns table (target_key text, target_text text, cnt int)
language sql immutable set search_path = '' as $$
  select lower(t), min(t), count(*)::int
  from (
    select btrim(m[1]) as t
    from regexp_matches(p_content, '\[\[([^]|#^]+)(?:[#^][^]|]*)?(?:\|[^]]*)?\]\]', 'g') as m
  ) s
  where length(t) > 0
  group by lower(t);
$$;

-- 특정 제목을 가리키는 [[링크]]의 정규식
create or replace function public.sb_link_pattern(p_title text) returns text
language sql immutable set search_path = '' as $$
  select '\[\[\s*' || regexp_replace(btrim(p_title), '([.^$*+?(){}|\\[\]])', '\\\1', 'g') || '\s*(?=[]|#^])';
$$;

-- ---------- 테이블 ----------
create table public.brain_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (length(btrim(display_name)) between 1 and 40),
  updated_at timestamptz not null default now()
);

create table public.brain_vaults (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 80),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create table public.brain_members (
  vault_id uuid not null references public.brain_vaults(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'editor' check (role in ('owner', 'editor', 'viewer')),
  joined_at timestamptz not null default now(),
  removed_at timestamptz,
  primary key (vault_id, user_id)
);
create index brain_members_user on public.brain_members (user_id) where removed_at is null;

create table public.brain_invites (
  id uuid primary key default gen_random_uuid(),
  vault_id uuid not null references public.brain_vaults(id) on delete cascade,
  email text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role text not null default 'editor' check (role in ('editor', 'viewer')),
  invited_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  claimed_by uuid references auth.users(id),
  revoked_at timestamptz
);
create unique index brain_invites_pending on public.brain_invites (vault_id, lower(email)) where claimed_at is null and revoked_at is null;

create table public.brain_notes (
  id uuid primary key default gen_random_uuid(),
  vault_id uuid not null references public.brain_vaults(id) on delete cascade,
  title text not null check (length(btrim(title)) > 0 and title !~ '[][|#^]'),
  folder text not null default '' check (folder = '' or (folder !~ '(^/|/$|//)' and folder !~ '[][|#^\\]')),
  content text not null default '',
  link_keys text[] not null default '{}',
  version int not null default 1,
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
create unique index brain_notes_title on public.brain_notes (vault_id, lower(title)) where archived_at is null;
create index brain_notes_vault on public.brain_notes (vault_id, updated_at desc);
create index brain_notes_link_keys on public.brain_notes using gin (link_keys);

create table public.brain_folders (
  vault_id uuid not null references public.brain_vaults(id) on delete cascade,
  path text not null check (path <> '' and path !~ '(^/|/$|//)' and path !~ '[][|#^\\]'),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  hidden_at timestamptz,
  primary key (vault_id, path)
);

create table public.brain_revisions (
  id bigint generated always as identity primary key,
  note_id uuid not null references public.brain_notes(id) on delete cascade,
  vault_id uuid not null references public.brain_vaults(id) on delete cascade,
  version int not null,
  title text not null,
  content text not null,
  edited_by uuid not null references auth.users(id),
  edited_at timestamptz not null default now()
);
create index brain_revisions_note on public.brain_revisions (note_id, edited_at desc);

-- ---------- 권한 확인 ----------
create or replace function public.brain_role(p_vault uuid) returns text
language sql stable security definer set search_path = '' as $$
  select m.role from public.brain_members m
  join public.brain_vaults v on v.id = m.vault_id and v.archived_at is null
  where m.vault_id = p_vault and m.user_id = auth.uid() and m.removed_at is null;
$$;
create or replace function public.brain_can_read(p_vault uuid) returns boolean
language sql stable security definer set search_path = '' as $$ select public.brain_role(p_vault) is not null; $$;
create or replace function public.brain_can_write(p_vault uuid) returns boolean
language sql stable security definer set search_path = '' as $$ select public.brain_role(p_vault) in ('owner', 'editor'); $$;
create or replace function public.brain_shares_vault(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_user = auth.uid() or exists (
    select 1 from public.brain_members a join public.brain_members b on a.vault_id = b.vault_id
    where a.user_id = auth.uid() and b.user_id = p_user and a.removed_at is null and b.removed_at is null);
$$;

-- ---------- RLS: 보관함 멤버만 읽고, 편집자 이상만 쓴다 ----------
alter table public.brain_profiles enable row level security;
alter table public.brain_vaults enable row level security;
alter table public.brain_members enable row level security;
alter table public.brain_invites enable row level security;
alter table public.brain_notes enable row level security;
alter table public.brain_folders enable row level security;
alter table public.brain_revisions enable row level security;

create policy brain_profiles_read on public.brain_profiles for select to authenticated using (public.brain_shares_vault(user_id));
create policy brain_profiles_insert on public.brain_profiles for insert to authenticated with check (user_id = auth.uid());
create policy brain_profiles_update on public.brain_profiles for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy brain_vaults_read on public.brain_vaults for select to authenticated using (public.brain_can_read(id));
create policy brain_members_read on public.brain_members for select to authenticated using (public.brain_can_read(vault_id));
create policy brain_invites_read on public.brain_invites for select to authenticated using (public.brain_role(vault_id) = 'owner');

create policy brain_notes_read on public.brain_notes for select to authenticated using (public.brain_can_read(vault_id));
create policy brain_notes_insert on public.brain_notes for insert to authenticated with check (public.brain_can_write(vault_id));
create policy brain_notes_update on public.brain_notes for update to authenticated using (public.brain_can_write(vault_id)) with check (public.brain_can_write(vault_id));
create policy brain_folders_read on public.brain_folders for select to authenticated using (public.brain_can_read(vault_id));
create policy brain_folders_insert on public.brain_folders for insert to authenticated with check (public.brain_can_write(vault_id));
create policy brain_folders_update on public.brain_folders for update to authenticated using (public.brain_can_write(vault_id)) with check (public.brain_can_write(vault_id));
create policy brain_revisions_read on public.brain_revisions for select to authenticated using (public.brain_can_read(vault_id));

revoke all on public.brain_profiles, public.brain_vaults, public.brain_members, public.brain_invites,
  public.brain_notes, public.brain_folders, public.brain_revisions from anon;
alter publication supabase_realtime add table public.brain_notes, public.brain_folders, public.brain_members;

-- ---------- 저장 트리거: 버전, 링크 색인, 수정자, 이력 ----------
create or replace function public.brain_notes_before() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.title := btrim(new.title);
  if tg_op = 'UPDATE' then
    new.version := old.version + 1;
    new.vault_id := old.vault_id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  if tg_op = 'INSERT' or new.content is distinct from old.content then
    new.link_keys := coalesce((select array_agg(l.target_key order by l.target_key) from public.sb_extract_links(new.content) l), '{}');
  end if;
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  new.updated_at := now();
  return new;
end $$;

-- 같은 사람이 5분 안에 다시 저장하면 마지막 이력을 갱신한다
create or replace function public.brain_notes_after() returns trigger
language plpgsql security definer set search_path = '' as $$
declare last_rev record;
begin
  if tg_op = 'UPDATE' and new.content = old.content and new.title = old.title then return null; end if;
  select id, edited_by, edited_at into last_rev from public.brain_revisions
    where note_id = new.id order by edited_at desc limit 1;
  if found and last_rev.edited_by = new.updated_by and last_rev.edited_at > now() - interval '5 minutes' then
    update public.brain_revisions set version = new.version, title = new.title, content = new.content, edited_at = now()
      where id = last_rev.id;
  else
    insert into public.brain_revisions (note_id, vault_id, version, title, content, edited_by)
      values (new.id, new.vault_id, new.version, new.title, new.content, new.updated_by);
  end if;
  return null;
end $$;

create trigger brain_notes_before before insert or update on public.brain_notes
  for each row execute function public.brain_notes_before();
create trigger brain_notes_after after insert or update on public.brain_notes
  for each row execute function public.brain_notes_after();

-- ---------- 프로필 / 보관함 ----------
-- 첫 로그인 시 Google 이름으로 프로필을 만든다 (이미 있으면 그대로)
create or replace function public.brain_ensure_profile() returns text
language plpgsql security definer set search_path = '' as $$
declare v_name text;
begin
  if auth.uid() is null then return null; end if;
  select display_name into v_name from public.brain_profiles where user_id = auth.uid();
  if found then return v_name; end if;
  select left(coalesce(nullif(btrim(raw_user_meta_data->>'full_name'), ''), nullif(btrim(raw_user_meta_data->>'name'), ''), split_part(email, '@', 1)), 40)
    into v_name from auth.users where id = auth.uid();
  insert into public.brain_profiles (user_id, display_name) values (auth.uid(), v_name) on conflict (user_id) do nothing;
  return v_name;
end $$;

create or replace function public.brain_create_vault(p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into public.brain_vaults (name, created_by) values (btrim(p_name), auth.uid()) returning id into v_id;
  insert into public.brain_members (vault_id, user_id, role) values (v_id, auth.uid(), 'owner');
  return v_id;
end $$;

create or replace function public.brain_rename_vault(p_vault uuid, p_name text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if public.brain_role(p_vault) is distinct from 'owner' then raise exception 'owner only'; end if;
  update public.brain_vaults set name = btrim(p_name) where id = p_vault;
end $$;

create or replace function public.brain_vault_members(p_vault uuid)
returns table (user_id uuid, display_name text, email text, role text, joined_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.brain_can_read(p_vault) then raise exception 'forbidden'; end if;
  return query
    select m.user_id, coalesce(p.display_name, split_part(u.email, '@', 1)), u.email::text, m.role, m.joined_at
    from public.brain_members m
    join auth.users u on u.id = m.user_id
    left join public.brain_profiles p on p.user_id = m.user_id
    where m.vault_id = p_vault and m.removed_at is null
    order by m.joined_at;
end $$;

-- ---------- 초대 ----------
create or replace function public.brain_invite(p_vault uuid, p_email text, p_role text default 'editor') returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_email text := lower(btrim(p_email));
begin
  if public.brain_role(p_vault) is distinct from 'owner' then raise exception 'owner only'; end if;
  if exists (select 1 from public.brain_members m join auth.users u on u.id = m.user_id
             where m.vault_id = p_vault and m.removed_at is null and lower(u.email) = v_email) then
    raise exception 'already a member' using errcode = '23505';
  end if;
  insert into public.brain_invites (vault_id, email, role, invited_by) values (p_vault, v_email, p_role, auth.uid())
    on conflict (vault_id, lower(email)) where claimed_at is null and revoked_at is null do update set role = excluded.role
    returning id into v_id;
  return v_id;
end $$;

create or replace function public.brain_revoke_invite(p_invite uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_vault uuid;
begin
  select vault_id into v_vault from public.brain_invites where id = p_invite;
  if public.brain_role(v_vault) is distinct from 'owner' then raise exception 'owner only'; end if;
  update public.brain_invites set revoked_at = now() where id = p_invite and claimed_at is null;
end $$;

-- 내 이메일로 온 초대 (Google로 확인된 이메일만 인정: 이메일 가입이 자동 승인이면 남의 주소로 가입할 수 있다)
create or replace function public.brain_my_invites()
returns table (invite_id uuid, vault_id uuid, vault_name text, role text, invited_by_name text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare u record;
begin
  select id, email, email_confirmed_at, raw_app_meta_data into u from auth.users where id = auth.uid();
  if u.email is null or u.email_confirmed_at is null
     or not coalesce((u.raw_app_meta_data -> 'providers') @> '["google"]'::jsonb, false) then return; end if;
  return query
    select i.id, v.id, v.name, i.role, coalesce(p.display_name, '알 수 없음'), i.created_at
    from public.brain_invites i
    join public.brain_vaults v on v.id = i.vault_id and v.archived_at is null
    left join public.brain_profiles p on p.user_id = i.invited_by
    where lower(i.email) = lower(u.email) and i.claimed_at is null and i.revoked_at is null
      and not exists (select 1 from public.brain_members m where m.vault_id = i.vault_id and m.user_id = u.id and m.removed_at is null);
end $$;

create or replace function public.brain_accept_invite(p_invite uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare u record; inv record;
begin
  select id, email, email_confirmed_at, raw_app_meta_data into u from auth.users where id = auth.uid();
  if u.email is null or u.email_confirmed_at is null
     or not coalesce((u.raw_app_meta_data -> 'providers') @> '["google"]'::jsonb, false) then
    raise exception 'google account required';
  end if;
  select * into inv from public.brain_invites
    where id = p_invite and lower(email) = lower(u.email) and claimed_at is null and revoked_at is null for update;
  if not found then raise exception 'invite not found'; end if;
  insert into public.brain_members (vault_id, user_id, role) values (inv.vault_id, u.id, inv.role)
    on conflict (vault_id, user_id) do update set removed_at = null, role = excluded.role, joined_at = now();
  update public.brain_invites set claimed_at = now(), claimed_by = u.id where id = inv.id;
  return inv.vault_id;
end $$;

-- ---------- 멤버 관리 (지우지 않고 removed_at 표시) ----------
-- p_role = null 이면 내보내기 / 나가기. 마지막 소유자는 나갈 수 없다.
create or replace function public.brain_set_member(p_vault uuid, p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_user = auth.uid() then
    if p_role is not null then raise exception 'cannot change own role'; end if;
  elsif public.brain_role(p_vault) is distinct from 'owner' then
    raise exception 'owner only';
  end if;
  if p_role is not null and p_role not in ('owner', 'editor', 'viewer') then raise exception 'bad role'; end if;
  if (p_role is null or p_role <> 'owner')
     and exists (select 1 from public.brain_members where vault_id = p_vault and user_id = p_user and role = 'owner' and removed_at is null)
     and (select count(*) from public.brain_members where vault_id = p_vault and role = 'owner' and removed_at is null) <= 1 then
    raise exception 'last owner';
  end if;
  if p_role is null then
    update public.brain_members set removed_at = now() where vault_id = p_vault and user_id = p_user;
  else
    update public.brain_members set role = p_role where vault_id = p_vault and user_id = p_user and removed_at is null;
  end if;
end $$;

-- ---------- 이름 변경 (Obsidian 방식: 영향 미리보기 → 링크 재작성) ----------
create or replace function public.brain_rename_preview(p_note uuid)
returns table (link_count int, note_count int)
language plpgsql stable security definer set search_path = '' as $$
declare v_title text; v_vault uuid;
begin
  select title, vault_id into v_title, v_vault from public.brain_notes where id = p_note;
  if not public.brain_can_read(v_vault) then raise exception 'forbidden'; end if;
  return query
    select coalesce(sum((select count(*) from regexp_matches(n.content, public.sb_link_pattern(v_title), 'gi'))), 0)::int, count(*)::int
    from public.brain_notes n
    where n.vault_id = v_vault and n.archived_at is null and n.link_keys @> array[lower(v_title)];
end $$;

create or replace function public.brain_rename_note(p_note uuid, p_new_title text, p_update_links boolean)
returns json
language plpgsql security definer set search_path = '' as $$
declare v_old text; v_vault uuid; v_new text := btrim(p_new_title); v_pattern text; v_links int := 0; v_notes int := 0;
begin
  select title, vault_id into v_old, v_vault from public.brain_notes where id = p_note for update;
  if not found or not public.brain_can_write(v_vault) then raise exception 'forbidden'; end if;
  if v_new = v_old then return json_build_object('links', 0, 'notes', 0); end if;
  if exists (select 1 from public.brain_notes where vault_id = v_vault and archived_at is null and lower(title) = lower(v_new) and id <> p_note) then
    raise exception 'title already exists' using errcode = '23505';
  end if;
  update public.brain_notes set title = v_new where id = p_note;
  if p_update_links then
    v_pattern := public.sb_link_pattern(v_old);
    select coalesce(sum((select count(*) from regexp_matches(n.content, v_pattern, 'gi'))), 0), count(*)
      into v_links, v_notes
      from public.brain_notes n where n.vault_id = v_vault and n.archived_at is null and n.link_keys @> array[lower(v_old)];
    update public.brain_notes n
      set content = regexp_replace(n.content, v_pattern, '[[' || replace(v_new, '\', '\\'), 'gi')
      where n.vault_id = v_vault and n.archived_at is null and n.link_keys @> array[lower(v_old)];
  end if;
  return json_build_object('links', v_links, 'notes', v_notes);
end $$;

create or replace function public.brain_rename_folder(p_vault uuid, p_old text, p_new text) returns int
language plpgsql security definer set search_path = '' as $$
declare v_count int; v_pre text := p_old || '/';
begin
  if not public.brain_can_write(p_vault) then raise exception 'forbidden'; end if;
  if p_new = '' or p_new ~ '(^/|/$|//)' or p_new ~ '[][|#^\\]' then raise exception 'invalid folder name'; end if;
  if p_new = p_old or left(p_new, length(v_pre)) = v_pre then raise exception 'invalid target'; end if;
  insert into public.brain_folders (vault_id, path)
    select p_vault, p_new || substr(f.path, length(p_old) + 1) from public.brain_folders f
    where f.vault_id = p_vault and (f.path = p_old or left(f.path, length(v_pre)) = v_pre) and f.hidden_at is null
    on conflict (vault_id, path) do update set hidden_at = null;
  insert into public.brain_folders (vault_id, path) values (p_vault, p_new) on conflict (vault_id, path) do update set hidden_at = null;
  update public.brain_folders set hidden_at = now() where vault_id = p_vault and (path = p_old or left(path, length(v_pre)) = v_pre);
  update public.brain_notes set folder = p_new || substr(folder, length(p_old) + 1)
    where vault_id = p_vault and (folder = p_old or left(folder, length(v_pre)) = v_pre);
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- ---------- 실행 권한 ----------
revoke execute on function public.sb_extract_links(text), public.sb_link_pattern(text),
  public.brain_role(uuid), public.brain_can_read(uuid), public.brain_can_write(uuid), public.brain_shares_vault(uuid),
  public.brain_notes_before(), public.brain_notes_after(), public.brain_ensure_profile(), public.brain_create_vault(text),
  public.brain_rename_vault(uuid, text), public.brain_vault_members(uuid), public.brain_invite(uuid, text, text),
  public.brain_revoke_invite(uuid), public.brain_my_invites(), public.brain_accept_invite(uuid),
  public.brain_set_member(uuid, uuid, text), public.brain_rename_preview(uuid), public.brain_rename_note(uuid, text, boolean),
  public.brain_rename_folder(uuid, text, text)
  from public, anon;
revoke execute on function public.brain_notes_before(), public.brain_notes_after() from authenticated;
grant execute on function public.sb_extract_links(text), public.sb_link_pattern(text),
  public.brain_role(uuid), public.brain_can_read(uuid), public.brain_can_write(uuid), public.brain_shares_vault(uuid),
  public.brain_ensure_profile(), public.brain_create_vault(text), public.brain_rename_vault(uuid, text), public.brain_vault_members(uuid),
  public.brain_invite(uuid, text, text), public.brain_revoke_invite(uuid), public.brain_my_invites(), public.brain_accept_invite(uuid),
  public.brain_set_member(uuid, uuid, text), public.brain_rename_preview(uuid), public.brain_rename_note(uuid, text, boolean),
  public.brain_rename_folder(uuid, text, text) to authenticated;
