// Second Brain MCP 서버: Claude Code · Codex · Hermes 같은 AI 에이전트가 보관함을 읽고 쓰는 통로.
// 인증은 앱 설정에서 만든 "에이전트 열쇠"(Bearer 토큰). 열쇠마다 한 보관함, 한 사람의 권한으로만 동작한다.
// MCP Streamable HTTP(JSON 응답) 방식: POST 한 번에 JSON-RPC 요청/응답.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const SERVER = { name: 'second-brain', version: '1.0.0' };
const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const COLS = 'id,title,folder,content,version,link_keys,updated_at,updated_by,updated_via,created_at';
const RULES_TITLES = ['agents', '위키 규칙', '규칙'];
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, mcp-session-id, mcp-protocol-version',
  'Access-Control-Allow-Methods': 'POST, GET, DELETE, OPTIONS',
};

const DEFAULT_RULES = `# LLM 위키 규칙 (기본값)

이 보관함은 사람과 AI 에이전트가 함께 키우는 **LLM 위키**입니다. (Karpathy의 LLM Wiki 방식)
원본 자료는 그대로 쌓고, 에이전트가 그 내용을 정리해 서로 링크된 위키 페이지로 만들고 계속 고칩니다.
이 규칙을 바꾸려면 보관함 최상위에 "AGENTS" 노트를 만들어 내용을 쓰세요. 이 서버는 그 노트를 우선 읽습니다.

## 구조
- \`원본/\` 폴더: 넣은 자료의 원문 또는 충실한 요약 (기사, 회의록, PDF, 대화). **한 번 넣으면 고치지 않습니다.**
  - 제목: \`YYYY-MM-DD 자료 제목\`
  - 맨 위에 출처(URL·파일 이름), 넣은 날짜, 넣은 사람/에이전트
- \`위키/\` 폴더: 에이전트가 정리하는 페이지. 주제·사람·회사·개념마다 한 페이지.
  - 첫 문단에 한두 줄 요약, 그다음 본문, 맨 아래 "## 출처"에 [[원본 노트]] 링크
- \`index\` 노트: 모든 위키 페이지를 분류별로 나열하고 한 줄 설명을 붙입니다.
- \`log\` 노트: 작업 기록. 최신이 위. 형식: \`- YYYY-MM-DD HH:MM · 에이전트 · 작업 · 바뀐 페이지\`

## 작업 1. 자료 넣기 (ingest)
1. \`wiki_guide\`와 \`read_note("index")\`로 현재 위키를 파악합니다.
2. 자료를 \`원본/\`에 \`write_note(mode: "create")\`로 저장합니다. 웹·PDF는 에이전트가 직접 읽어 원문이나 충실한 요약을 넣습니다.
3. 자료에서 핵심 사실·주장·사람·개념을 뽑습니다.
4. 관련 위키 페이지를 \`search_notes\`/\`read_note\`로 찾아 **고치거나** 새로 만듭니다.
   - 사실마다 출처 [[원본/..]] 를 링크합니다. 관련 페이지끼리 [[링크]]로 잇습니다.
   - 기존 내용과 다르면 지우지 말고 \`> [!warning] 상충하는 정보\` 콜아웃으로 두 내용을 모두 남깁니다.
5. \`index\`와 \`log\`를 고칩니다.

## 작업 2. 질문 (query)
1. \`index\` → 관련 페이지 \`read_note\` → 필요하면 원본까지 읽습니다.
2. 답에는 근거가 된 [[페이지]]를 밝힙니다. 위키에 없는 내용이면 없다고 말합니다.
3. 다시 쓸 가치가 있는 답은 사용자에게 물어 \`위키/\`에 새 페이지로 저장합니다.

## 작업 3. 점검 (lint)
모순, 출처 없는 주장, 오래된 정보, 백링크가 없는 고아 페이지, 끊긴 링크, 새 페이지로 만들 만한 주제를 찾아
\`위키/점검 보고 YYYY-MM-DD\` 노트로 남기고, 확실한 것은 바로 고칩니다.

## 쓰기 규칙
- 제목에 \`[ ] | # ^ / \\ :\` 를 쓰지 않습니다. 폴더는 folder 값으로 지정합니다.
- 고치기 전에 \`read_note\`로 version을 확인하고 \`expected_version\`을 넘깁니다. (다른 사람이 먼저 고쳤으면 실패하니 다시 읽고 합칩니다.)
- 사람이 쓴 문장은 함부로 지우지 않습니다. 고칠 때는 덧붙이거나 다듬습니다.
- 링크는 제목만 씁니다: [[페이지 제목]], [[페이지 제목#소제목]], [[페이지 제목|보이는 글자]]
- 한국어로 씁니다.
`;

// ---------- 공통 ----------
const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS, ...extra } });

async function sha256(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const keyOf = (t: string) => String(t || '').trim().toLowerCase();
const BAD_TITLE = /[[\]|#^\\/:]/;
const BAD_FOLDER = /[[\]|#^\\]/;
const normFolder = (f: unknown) => String(f ?? '').trim().replace(/^\/+|\/+$/g, '').replace(/\/{2,}/g, '/');

class ToolError extends Error {}

type Ctx = { tokenId: string; vaultId: string; vaultName: string; userId: string; userName: string; role: string; via: string };

async function authenticate(req: Request): Promise<Ctx | null> {
  const auth = req.headers.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token.startsWith('sbw_')) return null;
  const { data: t } = await sb.from('brain_agent_tokens').select('id,vault_id,user_id,name,revoked_at').eq('token_hash', await sha256(token)).maybeSingle();
  if (!t || t.revoked_at) return null;
  const [{ data: m }, { data: v }, { data: p }] = await Promise.all([
    sb.from('brain_members').select('role').eq('vault_id', t.vault_id).eq('user_id', t.user_id).is('removed_at', null).maybeSingle(),
    sb.from('brain_vaults').select('name').eq('id', t.vault_id).is('archived_at', null).maybeSingle(),
    sb.from('brain_profiles').select('display_name').eq('user_id', t.user_id).maybeSingle(),
  ]);
  if (!m || !v) return null;
  sb.from('brain_agent_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', t.id).then(() => {});
  return { tokenId: t.id, vaultId: t.vault_id, vaultName: v.name, userId: t.user_id, userName: p?.display_name || '알 수 없음', role: m.role, via: t.name };
}

function requireWrite(ctx: Ctx) {
  if (ctx.role !== 'owner' && ctx.role !== 'editor') throw new ToolError('이 열쇠는 읽기 전용 멤버의 것이라 쓸 수 없습니다.');
}

async function findNote(ctx: Ctx, title: string) {
  const { data, error } = await sb.from('brain_notes').select(COLS).eq('vault_id', ctx.vaultId).is('archived_at', null).ilike('title', escapeLike(title.trim()));
  if (error) throw new ToolError(error.message);
  return (data || []).find((n) => keyOf(n.title) === keyOf(title)) || null;
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => '\\' + c);

async function allNotes(ctx: Ctx, cols = 'id,title,folder,updated_at,updated_by,updated_via,link_keys') {
  const out: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('brain_notes').select(cols).eq('vault_id', ctx.vaultId).is('archived_at', null).range(from, from + 999);
    if (error) throw new ToolError(error.message);
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function memberNames(ctx: Ctx) {
  const { data: ms } = await sb.from('brain_members').select('user_id').eq('vault_id', ctx.vaultId);
  const ids = (ms || []).map((m) => m.user_id);
  const { data } = await sb.from('brain_profiles').select('user_id,display_name').in('user_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
  return new Map((data || []).map((p) => [p.user_id, p.display_name]));
}

const who = (names: Map<string, string>, uid: string, via?: string | null) => `${names.get(uid) || '알 수 없음'}${via ? ` (🤖 ${via})` : ''}`;
const linksIn = (content: string) =>
  [...content.matchAll(/(!?)\[\[([^\]|#^\n]+)([#^][^\]|\n]*)?(?:\|[^\]\n]*)?\]\]/g)].map((m) => m[2].trim());

// ---------- 도구 ----------
const TOOLS = [
  {
    name: 'wiki_guide',
    description: '가장 먼저 호출하세요. 이 보관함의 위키 규칙(AGENTS 노트 또는 기본 LLM 위키 규칙), 폴더 구조, 노트 수, 내 권한을 돌려줍니다.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_notes',
    description: '노트 목록(제목, 폴더, 마지막 수정자, 수정 시각, 링크 수). folder를 주면 그 폴더(하위 포함)만.',
    inputSchema: {
      type: 'object',
      properties: {
        folder: { type: 'string', description: '예: "위키" 또는 "원본/2026". 비우면 전체' },
        sort: { type: 'string', enum: ['updated', 'title'], description: '기본 updated(최근 수정 순)' },
        limit: { type: 'number', description: '기본 300, 최대 2000' },
      },
    },
  },
  {
    name: 'read_note',
    description: '노트 하나를 제목으로 읽습니다. 본문, version(고칠 때 expected_version으로 넘기세요), 나가는 링크, 백링크를 함께 돌려줍니다.',
    inputSchema: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] },
  },
  {
    name: 'search_notes',
    description: '제목·본문에서 낱말을 찾습니다(모든 낱말을 포함한 노트). 일치한 줄을 함께 보여줍니다.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' }, folder: { type: 'string' }, limit: { type: 'number', description: '기본 20' } },
      required: ['query'],
    },
  },
  {
    name: 'write_note',
    description:
      '노트를 만들거나 고칩니다. mode: create(새로 만들기, 같은 제목이 있으면 실패) / overwrite(전체 바꾸기) / append(끝에 덧붙이기) / upsert(없으면 만들고 있으면 전체 바꾸기, 기본). 기존 노트를 고칠 때는 expected_version을 넘기면 그사이 다른 사람이 고친 경우 실패합니다. 링크는 [[제목]] 형식.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '[ ] | # ^ / \\ : 는 쓸 수 없음' },
        content: { type: 'string', description: '마크다운 본문' },
        folder: { type: 'string', description: '새로 만들 때 폴더. 예: "위키/회사". 기존 노트에 주면 그 폴더로 옮김' },
        mode: { type: 'string', enum: ['create', 'overwrite', 'append', 'upsert'] },
        expected_version: { type: 'number' },
      },
      required: ['title', 'content'],
    },
  },
  {
    name: 'rename_note',
    description: '노트 이름을 바꾸고, 다른 노트에서 이 노트를 가리키던 [[링크]]도 함께 고칩니다(update_links 기본 true).',
    inputSchema: {
      type: 'object',
      properties: { title: { type: 'string' }, new_title: { type: 'string' }, update_links: { type: 'boolean' } },
      required: ['title', 'new_title'],
    },
  },
  {
    name: 'archive_note',
    description: '노트를 보관함으로 옮깁니다(지우지 않음, 앱에서 되돌릴 수 있음). 정말 필요할 때만 쓰세요.',
    inputSchema: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] },
  },
  {
    name: 'recent_changes',
    description: '최근 바뀐 노트 목록(누가, 어떤 에이전트로). 사람이 새로 쓴 것을 위키에 반영할 때 유용합니다.',
    inputSchema: { type: 'object', properties: { hours: { type: 'number', description: '기본 24' }, limit: { type: 'number', description: '기본 50' } } },
  },
  {
    name: 'find_problems',
    description: '위키 점검용: 끊긴 링크(없는 노트를 가리킴), 고아 노트(백링크 없음), 빈 노트를 찾아 돌려줍니다.',
    inputSchema: { type: 'object', properties: { folder: { type: 'string', description: '이 폴더만 점검. 비우면 전체' } } },
  },
];

async function callTool(ctx: Ctx, name: string, a: any): Promise<string> {
  switch (name) {
    case 'wiki_guide': {
      const notes = await allNotes(ctx, 'id,title,folder');
      const rules = notes.find((n) => !n.folder && RULES_TITLES.includes(keyOf(n.title)));
      const rulesText = rules ? (await findNote(ctx, rules.title))!.content : DEFAULT_RULES;
      const folders = new Map<string, number>();
      for (const n of notes) folders.set(n.folder || '(최상위)', (folders.get(n.folder || '(최상위)') || 0) + 1);
      return [
        `# 보관함 "${ctx.vaultName}"`,
        `- 연결: ${ctx.userName}님의 열쇠 "${ctx.via}" · 권한: ${ctx.role === 'viewer' ? '읽기 전용' : ctx.role === 'owner' ? '소유자' : '편집자'}`,
        `- 노트 ${notes.length}개`,
        `- 폴더: ${[...folders.entries()].map(([f, c]) => `${f}(${c})`).join(', ') || '없음'}`,
        `- index 노트: ${notes.some((n) => keyOf(n.title) === 'index') ? '있음' : '없음'} · log 노트: ${notes.some((n) => keyOf(n.title) === 'log') ? '있음' : '없음'}`,
        `- 규칙 출처: ${rules ? `"${rules.title}" 노트` : '기본 규칙 (보관함에 AGENTS 노트를 만들면 그것을 따릅니다)'}`,
        '',
        rulesText,
      ].join('\n');
    }

    case 'list_notes': {
      const folder = normFolder(a.folder);
      const names = await memberNames(ctx);
      let notes = await allNotes(ctx);
      if (folder) notes = notes.filter((n) => n.folder === folder || n.folder.startsWith(folder + '/'));
      notes.sort(a.sort === 'title' ? (x, y) => x.title.localeCompare(y.title, 'ko') : (x, y) => y.updated_at.localeCompare(x.updated_at));
      const limit = Math.min(Math.max(Number(a.limit) || 300, 1), 2000);
      const keys = new Map<string, number>();
      for (const n of await allNotes(ctx, 'link_keys')) for (const k of n.link_keys || []) keys.set(k, (keys.get(k) || 0) + 1);
      const rows = notes.slice(0, limit).map((n) =>
        `- ${n.title}${n.folder ? `  [${n.folder}]` : ''} · ${who(names, n.updated_by, n.updated_via)} · ${n.updated_at.slice(0, 16).replace('T', ' ')} · 링크 ${n.link_keys?.length || 0} / 백링크 ${keys.get(keyOf(n.title)) || 0}`);
      return `노트 ${notes.length}개${notes.length > limit ? ` 중 ${limit}개` : ''}\n${rows.join('\n') || '(없음)'}`;
    }

    case 'read_note': {
      const n = await findNote(ctx, String(a.title || ''));
      if (!n) throw new ToolError(`"${a.title}" 노트가 없습니다. list_notes나 search_notes로 제목을 확인하세요.`);
      const [names, all] = await Promise.all([memberNames(ctx), allNotes(ctx, 'title,link_keys')]);
      const exists = new Set(all.map((x) => keyOf(x.title)));
      const outs = [...new Set(linksIn(n.content))];
      const backs = all.filter((x) => (x.link_keys || []).includes(keyOf(n.title)) && keyOf(x.title) !== keyOf(n.title)).map((x) => x.title);
      return [
        `# ${n.title}`,
        `- 폴더: ${n.folder || '(최상위)'} · version: ${n.version} · 마지막 수정: ${who(names, n.updated_by, n.updated_via)} ${n.updated_at.slice(0, 16).replace('T', ' ')}`,
        `- 나가는 링크: ${outs.map((t) => (exists.has(keyOf(t)) ? t : `${t}(아직 없음)`)).join(', ') || '없음'}`,
        `- 백링크: ${backs.join(', ') || '없음'}`,
        '',
        '---',
        n.content || '(빈 노트)',
      ].join('\n');
    }

    case 'search_notes': {
      const words = String(a.query || '').trim().split(/\s+/).filter(Boolean);
      if (!words.length) throw new ToolError('query가 비어 있습니다.');
      const folder = normFolder(a.folder);
      let q = sb.from('brain_notes').select('title,folder,content,updated_at').eq('vault_id', ctx.vaultId).is('archived_at', null);
      for (const w of words) q = q.or(`title.ilike.%${escapeLike(w).replace(/[,()]/g, ' ')}%,content.ilike.%${escapeLike(w).replace(/[,()]/g, ' ')}%`);
      const { data, error } = await q.order('updated_at', { ascending: false }).limit(200);
      if (error) throw new ToolError(error.message);
      let rows = data || [];
      if (folder) rows = rows.filter((n) => n.folder === folder || n.folder.startsWith(folder + '/'));
      const lw = words.map((w) => w.toLowerCase());
      rows.sort((x, y) => Number(lw.some((w) => y.title.toLowerCase().includes(w))) - Number(lw.some((w) => x.title.toLowerCase().includes(w))));
      const limit = Math.min(Math.max(Number(a.limit) || 20, 1), 100);
      const out = rows.slice(0, limit).map((n) => {
        const lines = n.content.split('\n').filter((l: string) => lw.some((w) => l.toLowerCase().includes(w))).slice(0, 3)
          .map((l: string) => `    > ${l.trim().slice(0, 200)}`);
        return [`- ${n.title}${n.folder ? `  [${n.folder}]` : ''}`, ...lines].join('\n');
      });
      return `"${words.join(' ')}" 검색 결과 ${rows.length}개\n${out.join('\n') || '(없음)'}`;
    }

    case 'write_note': {
      requireWrite(ctx);
      const title = String(a.title || '').trim().replace(/\s+/g, ' ');
      const content = String(a.content ?? '');
      const mode = a.mode || 'upsert';
      if (!title) throw new ToolError('title이 비어 있습니다.');
      if (BAD_TITLE.test(title)) throw new ToolError('제목에는 [ ] | # ^ / \\ : 를 쓸 수 없습니다. 폴더는 folder 값으로 지정하세요.');
      const folder = a.folder === undefined ? undefined : normFolder(a.folder);
      if (folder && BAD_FOLDER.test(folder)) throw new ToolError('폴더 이름에는 [ ] | # ^ \\ 를 쓸 수 없습니다.');
      const existing = await findNote(ctx, title);

      if (!existing) {
        if (mode === 'overwrite' || mode === 'append') throw new ToolError(`"${title}" 노트가 없습니다. mode "create"나 "upsert"로 만드세요.`);
        const { data, error } = await sb.from('brain_notes').insert({
          vault_id: ctx.vaultId, title, folder: folder || '', content,
          created_by: ctx.userId, updated_by: ctx.userId, updated_via: ctx.via,
        }).select('title,folder,version').single();
        if (error) throw new ToolError(error.message.includes('brain_notes_title') ? '같은 제목의 노트가 이미 있습니다.' : error.message);
        if (data.folder) await sb.from('brain_folders').upsert({ vault_id: ctx.vaultId, path: data.folder, created_by: ctx.userId, hidden_at: null }, { onConflict: 'vault_id,path' });
        return `만들었습니다: "${data.title}"${data.folder ? ` [${data.folder}]` : ''} · version ${data.version}`;
      }

      if (mode === 'create') throw new ToolError(`"${existing.title}" 노트가 이미 있습니다(version ${existing.version}). 고치려면 mode "overwrite"나 "append"를 쓰세요.`);
      if (a.expected_version != null && Number(a.expected_version) !== existing.version) {
        throw new ToolError(`그사이 노트가 바뀌었습니다(지금 version ${existing.version}, 기대 ${a.expected_version}). read_note로 다시 읽고 합친 뒤 다시 쓰세요.`);
      }
      const next = mode === 'append' ? `${existing.content.replace(/\s+$/, '')}\n\n${content}` : content;
      const patch: Record<string, unknown> = { content: next, updated_by: ctx.userId, updated_via: ctx.via };
      if (folder !== undefined) patch.folder = folder;
      const { data, error } = await sb.from('brain_notes').update(patch).eq('id', existing.id).eq('version', existing.version).select('title,folder,version');
      if (error) throw new ToolError(error.message);
      if (!data?.length) throw new ToolError('저장하는 순간 다른 사람이 먼저 고쳤습니다. read_note로 다시 읽고 다시 시도하세요.');
      if (folder) await sb.from('brain_folders').upsert({ vault_id: ctx.vaultId, path: folder, created_by: ctx.userId, hidden_at: null }, { onConflict: 'vault_id,path' });
      return `${mode === 'append' ? '덧붙였습니다' : '고쳤습니다'}: "${data[0].title}" · version ${data[0].version}`;
    }

    case 'rename_note': {
      requireWrite(ctx);
      const n = await findNote(ctx, String(a.title || ''));
      if (!n) throw new ToolError(`"${a.title}" 노트가 없습니다.`);
      const nt = String(a.new_title || '').trim().replace(/\s+/g, ' ');
      if (!nt || BAD_TITLE.test(nt)) throw new ToolError('새 제목이 비었거나 [ ] | # ^ / \\ : 가 들어 있습니다.');
      const { data, error } = await sb.rpc('brain_agent_rename_note', {
        p_user: ctx.userId, p_via: ctx.via, p_note: n.id, p_new_title: nt, p_update_links: a.update_links !== false,
      });
      if (error) throw new ToolError(error.message.includes('already') ? '같은 제목의 노트가 이미 있습니다.' : error.message);
      return `"${n.title}" → "${nt}" · 고친 링크 ${data?.links ?? 0}개 (노트 ${data?.notes ?? 0}개)`;
    }

    case 'archive_note': {
      requireWrite(ctx);
      const n = await findNote(ctx, String(a.title || ''));
      if (!n) throw new ToolError(`"${a.title}" 노트가 없습니다.`);
      const { error } = await sb.from('brain_notes').update({ archived_at: new Date().toISOString(), updated_by: ctx.userId, updated_via: ctx.via }).eq('id', n.id);
      if (error) throw new ToolError(error.message);
      return `"${n.title}"을(를) 보관함으로 옮겼습니다. 앱의 보관함에서 되돌릴 수 있습니다.`;
    }

    case 'recent_changes': {
      const hours = Math.min(Math.max(Number(a.hours) || 24, 1), 24 * 90);
      const since = new Date(Date.now() - hours * 3600e3).toISOString();
      const names = await memberNames(ctx);
      const { data, error } = await sb.from('brain_revisions').select('version,title,edited_by,edited_via,edited_at')
        .eq('vault_id', ctx.vaultId).gte('edited_at', since).order('edited_at', { ascending: false }).limit(Math.min(Number(a.limit) || 50, 300));
      if (error) throw new ToolError(error.message);
      const rows = (data || []).map((r) => `- ${r.edited_at.slice(0, 16).replace('T', ' ')} · ${r.title} (v${r.version}) · ${who(names, r.edited_by, r.edited_via)}`);
      return `최근 ${hours}시간 동안 바뀐 기록 ${rows.length}개\n${rows.join('\n') || '(없음)'}`;
    }

    case 'find_problems': {
      const folder = normFolder(a.folder);
      const notes = await allNotes(ctx, 'title,folder,content,link_keys');
      const exists = new Set(notes.map((n) => keyOf(n.title)));
      const inbound = new Map<string, number>();
      for (const n of notes) for (const k of n.link_keys || []) inbound.set(k, (inbound.get(k) || 0) + 1);
      const scope = folder ? notes.filter((n) => n.folder === folder || n.folder.startsWith(folder + '/')) : notes;
      // 첨부 파일(![[그림.png]] 등)은 노트가 아니므로 끊긴 링크로 세지 않는다
      const ATTACH = /\.(bmp|png|jpe?g|gif|svg|webp|avif|mp3|wav|m4a|3gp|flac|ogg|oga|opus|mp4|webm|ogv|mov|mkv|pdf)$/i;
      const broken = scope.flatMap((n) => [...new Set(linksIn(n.content))].filter((t) => !exists.has(keyOf(t)) && !ATTACH.test(t.trim())).map((t) => `- [[${n.title}]] → [[${t}]]`));
      const skip = new Set(['index', 'log', ...RULES_TITLES]);
      const orphans = scope.filter((n) => !inbound.get(keyOf(n.title)) && !skip.has(keyOf(n.title))).map((n) => `- ${n.title}${n.folder ? ` [${n.folder}]` : ''}`);
      const empty = scope.filter((n) => !n.content.trim()).map((n) => `- ${n.title}`);
      return [
        `## 끊긴 링크 ${broken.length}개 (없는 노트를 가리킴)`, ...broken.slice(0, 200),
        '', `## 고아 노트 ${orphans.length}개 (아무도 링크하지 않음)`, ...orphans.slice(0, 200),
        '', `## 빈 노트 ${empty.length}개`, ...empty.slice(0, 200),
      ].join('\n');
    }
  }
  throw new ToolError(`알 수 없는 도구: ${name}`);
}

// ---------- JSON-RPC ----------
async function handle(ctx: Ctx, msg: any) {
  const { id, method, params } = msg;
  const ok = (result: unknown) => ({ jsonrpc: '2.0', id, result });
  const fail = (code: number, message: string) => ({ jsonrpc: '2.0', id, error: { code, message } });
  switch (method) {
    case 'initialize': {
      const asked = params?.protocolVersion;
      return ok({
        protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER,
        instructions: `Second Brain 보관함 "${ctx.vaultName}"에 연결되었습니다. 작업 전에 반드시 wiki_guide를 먼저 호출해 규칙을 읽으세요.`,
      });
    }
    case 'ping':
      return ok({});
    case 'tools/list':
      return ok({ tools: TOOLS });
    case 'tools/call': {
      try {
        const text = await callTool(ctx, params?.name, params?.arguments || {});
        return ok({ content: [{ type: 'text', text }] });
      } catch (e) {
        const message = e instanceof ToolError ? e.message : `서버 오류: ${(e as Error).message}`;
        if (!(e instanceof ToolError)) console.error(e);
        return ok({ content: [{ type: 'text', text: message }], isError: true });
      }
    }
    case 'resources/list':
      return ok({ resources: [] });
    case 'prompts/list':
      return ok({ prompts: [] });
    default:
      return fail(-32601, `Method not found: ${method}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method === 'DELETE') return new Response(null, { status: 200, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST로 MCP 요청을 보내세요.' }, 405, { Allow: 'POST' });

  const ctx = await authenticate(req);
  if (!ctx) return json({ jsonrpc: '2.0', id: null, error: { code: -32001, message: '에이전트 열쇠가 없거나 취소되었습니다. 앱의 설정 → AI 에이전트 연결에서 확인하세요.' } }, 401);

  let body: any;
  try { body = await req.json(); } catch { return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400); }
  const batch = Array.isArray(body);
  const msgs = batch ? body : [body];
  const replies = [];
  for (const m of msgs) {
    if (m?.id === undefined || m?.id === null) continue; // 알림(notifications/*)은 답하지 않는다
    replies.push(await handle(ctx, m));
  }
  if (!replies.length) return new Response(null, { status: 202, headers: CORS });
  return json(batch ? replies : replies[0]);
});
