-- Obsidian과 같이 코드 블록(```, ~~~)과 인라인 코드 안의 [[...]]는 링크로 치지 않는다 (VERIFY.md 근거)
-- 아직 DB에 적용하지 않음: 정호님 승인 후 적용
create or replace function public.sb_extract_links(p_content text)
returns table (target_key text, target_text text, cnt int)
language sql immutable set search_path = '' as $$
  select lower(t), min(t), count(*)::int
  from (
    select btrim(m[1]) as t
    from regexp_matches(
      regexp_replace(
        regexp_replace(coalesce(p_content, ''), '(^|\n)(```|~~~).*?\n(```|~~~)', E'\\1', 'g'),
        '`[^`\n]*`', '', 'g'),
      '\[\[([^]|#^]+)(?:[#^][^]|]*)?(?:\|[^]]*)?\]\]', 'g') as m
  ) s
  where length(t) > 0
  group by lower(t);
$$;

-- 이미 저장된 노트의 링크 색인을 새 규칙으로 다시 계산 (버전·이력은 건드리지 않는다)
alter table public.brain_notes disable trigger brain_notes_before;
alter table public.brain_notes disable trigger brain_notes_after;
update public.brain_notes n
   set link_keys = coalesce((select array_agg(l.target_key order by l.target_key) from public.sb_extract_links(n.content) l), '{}')
 where n.link_keys is distinct from coalesce((select array_agg(l.target_key order by l.target_key) from public.sb_extract_links(n.content) l), '{}');
alter table public.brain_notes enable trigger brain_notes_before;
alter table public.brain_notes enable trigger brain_notes_after;
