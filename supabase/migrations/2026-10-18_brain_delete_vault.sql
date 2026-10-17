-- 보관함 삭제: 보관함을 만든 사람이면서 소유자인 경우에만 (이름을 정확히 입력해야 함)
create or replace function public.brain_can_delete_vault(p_vault uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.brain_vaults v
    where v.id = p_vault and v.created_by = auth.uid()
      and public.brain_role(p_vault) = 'owner'
  );
$$;

create or replace function public.brain_delete_vault(p_vault uuid, p_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_name text;
begin
  if not public.brain_can_delete_vault(p_vault) then raise exception 'creator owner only'; end if;
  select name into v_name from public.brain_vaults where id = p_vault;
  if v_name is distinct from btrim(p_name) then raise exception 'name mismatch'; end if;
  delete from public.brain_vaults where id = p_vault; -- 노트·이력·첨부·멤버·초대·열쇠는 cascade
end $$;

revoke all on function public.brain_can_delete_vault(uuid), public.brain_delete_vault(uuid, text) from public, anon;
grant execute on function public.brain_can_delete_vault(uuid), public.brain_delete_vault(uuid, text) to authenticated;
