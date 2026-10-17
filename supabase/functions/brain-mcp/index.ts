// Second Brain MCP 서버: Claude Code · Codex · Hermes 같은 AI 에이전트가 보관함을 읽고 쓰는 통로.
// 인증은 앱 설정에서 만든 "에이전트 열쇠"(Bearer 토큰). 열쇠마다 한 보관함, 한 사람의 권한으로만 동작한다.
// MCP Streamable HTTP(JSON 응답) 방식: POST 한 번에 JSON-RPC 요청/응답.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
// 앱(브라우저)과 같은 규칙을 쓰기 위해 앱의 모듈을 그대로 가져온다 (속성 YAML, 템플릿 변수, 첨부 규칙)
import { parseFrontmatter, serializeFrontmatter } from './props.js';
import { applyVars } from './templates.js';
import { kindOf, cleanName, availableName, mimeOf } from './files.js';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const SERVER = { name: 'second-brain', version: '1.3.0' };
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
- 속성(맨 위 YAML)은 \`get_properties\`/\`set_properties\`, 첨부 파일은 \`list_attachments\`/\`add_attachment\`, 템플릿은 \`list_templates\`/\`create_from_template\` 도구를 씁니다. CSV·엑셀·JSON·ZIP 같은 로우 데이터도 첨부로 보관하고(10MB 넘으면 \`create_upload_url\`, 최대 50MB), 노트에는 요약·분석을 쓰고 원본은 ![[파일이름]] 으로 연결합니다.
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

type Ctx = { tokenId: string; vaultId: string; vaultName: string; userId: string; userName: string; role: string; via: string; vaults?: { name: string; role: string }[] };
// 접속한 주체: 열쇠(보관함 1개 고정) 또는 구글 로그인(OAuth, 여러 보관함 중 선택)
type Principal = { ctx?: Ctx; userId?: string; userName?: string };

async function authenticate(req: Request): Promise<Principal | null> {
  const auth = req.headers.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  if (!token.startsWith('sbw_')) {
    // 구글 로그인(OAuth)으로 받은 Supabase 로그인 토큰
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data?.user) return null;
    const { data: p } = await sb.from('brain_profiles').select('display_name').eq('user_id', data.user.id).maybeSingle();
    return { userId: data.user.id, userName: p?.display_name || data.user.email || '알 수 없음' };
  }
  const { data: t } = await sb.from('brain_agent_tokens').select('id,vault_id,user_id,name,revoked_at').eq('token_hash', await sha256(token)).maybeSingle();
  if (!t || t.revoked_at) return null;
  const [{ data: m }, { data: v }, { data: p }] = await Promise.all([
    sb.from('brain_members').select('role').eq('vault_id', t.vault_id).eq('user_id', t.user_id).is('removed_at', null).maybeSingle(),
    sb.from('brain_vaults').select('name').eq('id', t.vault_id).is('archived_at', null).maybeSingle(),
    sb.from('brain_profiles').select('display_name').eq('user_id', t.user_id).maybeSingle(),
  ]);
  if (!m || !v) return null;
  sb.from('brain_agent_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', t.id).then(() => {});
  return { ctx: { tokenId: t.id, vaultId: t.vault_id, vaultName: v.name, userId: t.user_id, userName: p?.display_name || '알 수 없음', role: m.role, via: t.name } };
}

async function userVaults(userId: string) {
  const { data: ms } = await sb.from('brain_members').select('vault_id,role').eq('user_id', userId).is('removed_at', null);
  const ids = (ms || []).map((m) => m.vault_id);
  if (!ids.length) return [];
  const { data: vs } = await sb.from('brain_vaults').select('id,name,created_at,created_by').in('id', ids).is('archived_at', null);
  return (vs || []).map((v) => ({ ...v, role: (ms || []).find((m) => m.vault_id === v.id)!.role as string }))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

// 이번 호출에 쓸 보관함을 정한다. 로그인 연결은 vault 값(이름)으로 고르고, 없으면 내가 만든 가장 오래된 보관함.
async function ctxFor(pr: Principal, vaultArg?: unknown): Promise<Ctx> {
  const want = vaultArg === undefined || vaultArg === null || vaultArg === '' ? '' : String(vaultArg);
  if (pr.ctx) {
    if (want && want !== pr.ctx.vaultId && keyOf(want) !== keyOf(pr.ctx.vaultName)) throw new ToolError(`이 열쇠는 "${pr.ctx.vaultName}" 보관함 전용입니다.`);
    return pr.ctx;
  }
  const vs = await userVaults(pr.userId!);
  if (!vs.length) throw new ToolError('접근할 수 있는 보관함이 없습니다. 앱에서 보관함을 만들거나 초대를 수락하세요.');
  const v = want ? vs.find((x) => x.id === want || keyOf(x.name) === keyOf(want)) : (vs.find((x) => x.created_by === pr.userId && x.role === 'owner') || vs[0]);
  if (!v) throw new ToolError(`"${want}" 보관함을 찾을 수 없습니다. list_vaults로 확인하세요.`);
  return { tokenId: 'oauth', vaultId: v.id, vaultName: v.name, userId: pr.userId!, userName: pr.userName || '알 수 없음', role: v.role, via: '로그인 연결', vaults: vs.map((x) => ({ name: x.name, role: x.role })) };
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
// 첨부 파일(![[그림.png]] 등)은 노트가 아니므로 노트 링크 목록에서 뺀다
const ATTACH = /\.(bmp|png|jpe?g|gif|svg|webp|avif|mp3|wav|m4a|3gp|flac|ogg|oga|opus|mp4|webm|ogv|mov|mkv|pdf)$/i;
const linksIn = (content: string) =>
  [...content.matchAll(/(!?)\[\[([^\]|#^\n]+)([#^][^\]|\n]*)?(?:\|[^\]\n]*)?\]\]/g)].map((m) => m[2].trim()).filter((t) => !ATTACH.test(t));

// ---------- 속성 · 템플릿 · 첨부 도움 함수 ----------
const DATE_RE = /^\d{4}-[01]\d-[0-3]\d$/;
const DATETIME_RE = /^\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d$/;
const LIST_KEYS = new Set(['tags', 'aliases', 'cssclasses']);
const MAX_MCP_FILE = 10 * 1024 * 1024; // 에이전트가 JSON으로 올리는 파일은 10MB까지 (앱에서는 50MB)

function entryFromValue(key: string, v: unknown) {
  if (Array.isArray(v)) return { key, type: 'list', value: v.map((x) => String(x)) };
  if (typeof v === 'boolean') return { key, type: 'checkbox', value: v };
  if (typeof v === 'number') return { key, type: 'number', value: String(v) };
  if (typeof v === 'string') {
    if (LIST_KEYS.has(key.toLowerCase())) return { key, type: 'list', value: [v] };
    return { key, type: DATE_RE.test(v) ? 'date' : DATETIME_RE.test(v) ? 'datetime' : 'text', value: v };
  }
  throw new ToolError(`"${key}" 값은 글자·숫자·true/false·목록만 쓸 수 있습니다.`);
}

const entryToJson = (e: any) => (e.type === 'raw' ? { key: e.key || '(원문)', type: 'raw', value: e.lines.join('\n') } : { key: e.key, type: e.type, value: e.type === 'number' ? Number(e.value) : e.value });

async function fileNames(ctx: Ctx) {
  const { data } = await sb.from('brain_files').select('name').eq('vault_id', ctx.vaultId);
  return new Set((data || []).map((f) => keyOf(f.name)));
}
const MAX_FILE = 50 * 1024 * 1024; // 무료 저장소 한도(파일당 50MB). 요금제를 올리면 앱·DB 한도와 함께 올린다
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function templateNotes(ctx: Ctx, folderArg?: unknown) {
  const notes = await allNotes(ctx, 'title,folder,content');
  const given = folderArg === undefined ? '' : normFolder(folderArg);
  const folder = given || ['Templates', '템플릿'].find((f) => notes.some((n) => n.folder === f || n.folder.startsWith(f + '/'))) || '';
  if (!folder) throw new ToolError('템플릿 폴더를 찾지 못했습니다. "Templates" 또는 "템플릿" 폴더에 템플릿 노트를 만들거나 folder를 지정하세요.');
  const list = notes.filter((n) => n.folder === folder || n.folder.startsWith(folder + '/'))
    .map((n) => ({ ...n, path: `${n.folder === folder ? '' : n.folder.slice(folder.length + 1) + '/'}${n.title}` }))
    .sort((a, b) => a.path.localeCompare(b.path, 'ko'));
  return { folder, list };
}

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
  {
    name: 'get_properties',
    description: '노트의 속성(맨 위 YAML 앞머리)을 {key, type, value} 목록으로 돌려줍니다. type: text/list/number/checkbox/date/datetime/raw.',
    inputSchema: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] },
  },
  {
    name: 'set_properties',
    description:
      '노트의 속성을 고칩니다(본문은 그대로). properties는 {키: 값} 객체: 글자/숫자/true·false/목록(배열) 값을 쓰고, null이면 그 속성을 지웁니다. 같은 키는 바뀌고 없는 키는 추가됩니다. 예: {"tags":["회의","2026"],"상태":"진행","완료":false}. expected_version을 넘기면 그사이 바뀐 경우 실패합니다.',
    inputSchema: {
      type: 'object',
      properties: { title: { type: 'string' }, properties: { type: 'object' }, expected_version: { type: 'number' } },
      required: ['title', 'properties'],
    },
  },
  {
    name: 'list_templates',
    description: '템플릿 노트 목록. 기본은 "Templates" 또는 "템플릿" 폴더. 템플릿 안의 {{title}} {{date}} {{time}} {{date:형식}}은 만들 때 채워집니다.',
    inputSchema: { type: 'object', properties: { folder: { type: 'string', description: '템플릿 폴더. 비우면 Templates/템플릿' } } },
  },
  {
    name: 'create_from_template',
    description: '템플릿으로 새 노트를 만듭니다. 변수({{title}} 등)가 채워진 상태로 저장됩니다. 같은 제목이 있으면 실패합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        template: { type: 'string', description: 'list_templates에 나온 이름(하위 폴더면 "하위/이름")' },
        title: { type: 'string', description: '새 노트 제목' },
        folder: { type: 'string', description: '새 노트를 둘 폴더(선택)' },
        template_folder: { type: 'string', description: '템플릿 폴더(선택)' },
      },
      required: ['template', 'title'],
    },
  },
  {
    name: 'list_attachments',
    description: '첨부 파일 목록(이미지·PDF·오디오·비디오뿐 아니라 CSV·엑셀·JSON·ZIP 같은 로우 데이터도). 노트에서는 ![[파일이름.csv]] 로 넣습니다.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_attachment_url',
    description: '첨부 파일을 내려받을 수 있는 임시 주소(1시간 유효)를 돌려줍니다.',
    inputSchema: { type: 'object', properties: { name: { type: 'string', description: '예: 회의사진.png' } }, required: ['name'] },
  },
  {
    name: 'add_attachment',
    description:
      '작은 첨부 파일(10MB까지)을 올립니다. data_base64에 파일 내용을 base64로 넣으세요. 모든 파일 형식 가능(확장자 필요). 10MB를 넘으면 create_upload_url을 쓰세요. 같은 이름이 있으면 "이름 1.csv"처럼 번호가 붙습니다. 올린 뒤 노트에 ![[이름]] 을 넣으면 보입니다.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string' }, data_base64: { type: 'string' }, folder: { type: 'string' } },
      required: ['name', 'data_base64'],
    },
  },
  {
    name: 'create_upload_url',
    description:
      '큰 파일(최대 50MB, 모든 형식)을 올리기 위한 1회용 업로드 주소를 만듭니다. 1) 이 도구로 주소를 받고 2) 터미널에서 curl -X PUT -H "Content-Type: <mime>" --data-binary @파일 "<upload_url>" 로 올린 뒤 3) finish_upload로 등록하세요. CSV·엑셀·JSON·ZIP 같은 로우 데이터에 씁니다.',
    inputSchema: { type: 'object', properties: { name: { type: 'string', description: '예: 2026-매출.csv' }, folder: { type: 'string' } }, required: ['name'] },
  },
  {
    name: 'finish_upload',
    description: 'create_upload_url로 올린 파일을 보관함에 등록합니다. create_upload_url이 알려 준 file_id와 name을 그대로 넣으세요. 등록 뒤 노트에 ![[name]] 을 넣으면 됩니다.',
    inputSchema: { type: 'object', properties: { file_id: { type: 'string' }, name: { type: 'string' }, folder: { type: 'string' } }, required: ['file_id', 'name'] },
  },
];

// 모든 도구에 선택 인자 vault(보관함 이름)를 붙인다. 로그인 연결에서 보관함이 여러 개일 때 쓴다.
for (const t of TOOLS) (t.inputSchema as any).properties.vault = { type: 'string', description: '(선택) 보관함 이름. 보관함이 여러 개일 때만. list_vaults로 확인' };
TOOLS.push({
  name: 'list_vaults',
  description: '내가 쓸 수 있는 보관함 목록(이름, 권한). 여러 보관함(개인·팀)이 있을 때 다른 도구의 vault 값을 정하는 데 씁니다.',
  inputSchema: { type: 'object', properties: {} },
} as any);

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
        ...(ctx.vaults && ctx.vaults.length > 1 ? [`- 내가 쓸 수 있는 보관함: ${ctx.vaults.map((v) => `${v.name}(${v.role === 'viewer' ? '읽기 전용' : v.role === 'owner' ? '소유자' : '편집자'})`).join(', ')} · 지금은 "${ctx.vaultName}". 다른 보관함은 도구마다 vault 값(이름)을 주면 됩니다.`] : []),
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
      const exists = new Set([...all.map((x) => keyOf(x.title)), ...(await fileNames(ctx))]);
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
      const exists = new Set([...notes.map((n) => keyOf(n.title)), ...(await fileNames(ctx))]); // 첨부 파일 이름도 "있는 것"
      const inbound = new Map<string, number>();
      for (const n of notes) for (const k of n.link_keys || []) inbound.set(k, (inbound.get(k) || 0) + 1);
      const scope = folder ? notes.filter((n) => n.folder === folder || n.folder.startsWith(folder + '/')) : notes;
      const broken = scope.flatMap((n) => [...new Set(linksIn(n.content))].filter((t) => !exists.has(keyOf(t))).map((t) => `- [[${n.title}]] → [[${t}]]`));
      const skip = new Set(['index', 'log', ...RULES_TITLES]);
      const orphans = scope.filter((n) => !inbound.get(keyOf(n.title)) && !skip.has(keyOf(n.title))).map((n) => `- ${n.title}${n.folder ? ` [${n.folder}]` : ''}`);
      const empty = scope.filter((n) => !n.content.trim()).map((n) => `- ${n.title}`);
      return [
        `## 끊긴 링크 ${broken.length}개 (없는 노트를 가리킴)`, ...broken.slice(0, 200),
        '', `## 고아 노트 ${orphans.length}개 (아무도 링크하지 않음)`, ...orphans.slice(0, 200),
        '', `## 빈 노트 ${empty.length}개`, ...empty.slice(0, 200),
      ].join('\n');
    }

    case 'get_properties': {
      const n = await findNote(ctx, String(a.title || ''));
      if (!n) throw new ToolError(`"${a.title}" 노트가 없습니다.`);
      const fm = parseFrontmatter(n.content);
      return JSON.stringify({ title: n.title, version: n.version, has_properties: !!fm, properties: (fm?.entries || []).map(entryToJson) }, null, 2);
    }

    case 'set_properties': {
      requireWrite(ctx);
      const n = await findNote(ctx, String(a.title || ''));
      if (!n) throw new ToolError(`"${a.title}" 노트가 없습니다.`);
      if (a.expected_version != null && Number(a.expected_version) !== n.version) {
        throw new ToolError(`그사이 노트가 바뀌었습니다(지금 version ${n.version}, 기대 ${a.expected_version}). get_properties로 다시 읽으세요.`);
      }
      if (!a.properties || typeof a.properties !== 'object' || Array.isArray(a.properties)) throw new ToolError('properties는 {키: 값} 객체여야 합니다.');
      const fm = parseFrontmatter(n.content);
      const entries: any[] = fm ? fm.entries : [];
      for (const [key, v] of Object.entries(a.properties)) {
        if (!key.trim() || /[\n:]/.test(key)) throw new ToolError(`속성 이름이 올바르지 않습니다: "${key}"`);
        const i = entries.findIndex((e) => e.type !== 'raw' && e.key === key);
        if (v === null) { if (i >= 0) entries.splice(i, 1); continue; }
        const e = entryFromValue(key, v);
        if (i >= 0) entries[i] = e; else entries.push(e);
      }
      const block = entries.length ? serializeFrontmatter(entries) : '';
      const rest = fm ? n.content.slice(fm.to).replace(/^\n/, '') : n.content;
      const next = block ? `${block}\n${rest}` : rest;
      const { data, error } = await sb.from('brain_notes').update({ content: next, updated_by: ctx.userId, updated_via: ctx.via }).eq('id', n.id).eq('version', n.version).select('title,version');
      if (error) throw new ToolError(error.message);
      if (!data?.length) throw new ToolError('저장하는 순간 다른 사람이 먼저 고쳤습니다. 다시 읽고 시도하세요.');
      return `속성을 고쳤습니다: "${data[0].title}" · version ${data[0].version} · 속성 ${entries.length}개`;
    }

    case 'list_templates': {
      const { folder, list } = await templateNotes(ctx, a.folder);
      return `템플릿 폴더 "${folder}" · ${list.length}개\n${list.map((t) => `- ${t.path}`).join('\n') || '(없음)'}`;
    }

    case 'create_from_template': {
      requireWrite(ctx);
      const { list } = await templateNotes(ctx, a.template_folder);
      const key = keyOf(String(a.template || ''));
      const tpl = list.find((t) => keyOf(t.path) === key) || list.find((t) => keyOf(t.title) === key);
      if (!tpl) throw new ToolError(`"${a.template}" 템플릿이 없습니다. list_templates로 확인하세요.`);
      const title = String(a.title || '').trim();
      const content = applyVars(tpl.content, { title }, {});
      return await callTool(ctx, 'write_note', { title, content, folder: a.folder, mode: 'create' });
    }

    case 'list_attachments': {
      const { data, error } = await sb.from('brain_files').select('name,folder,mime,size,created_at').eq('vault_id', ctx.vaultId).order('created_at', { ascending: false });
      if (error) throw new ToolError(error.message);
      const rows = (data || []).map((f) => `- ${f.name} · ${f.mime} · ${f.size}바이트 · ${f.created_at.slice(0, 16).replace('T', ' ')}`);
      return `첨부 파일 ${rows.length}개\n${rows.join('\n') || '(없음)'}`;
    }

    case 'get_attachment_url': {
      const want = keyOf(String(a.name || '').split('/').pop() || '');
      const { data: files, error } = await sb.from('brain_files').select('id,name,vault_id').eq('vault_id', ctx.vaultId);
      if (error) throw new ToolError(error.message);
      const f = (files || []).find((x) => keyOf(x.name) === want);
      if (!f) throw new ToolError(`"${a.name}" 첨부 파일이 없습니다. list_attachments로 확인하세요.`);
      const { data, error: e2 } = await sb.storage.from('brain-files').createSignedUrl(`${f.vault_id}/${f.id}`, 3600);
      if (e2 || !data) throw new ToolError('주소를 만들지 못했습니다.');
      return `${f.name}\n${data.signedUrl}\n(1시간 동안 유효)`;
    }

    case 'add_attachment': {
      requireWrite(ctx);
      const wanted = cleanName(String(a.name || ''));
      if (!kindOf(wanted)) throw new ToolError(`"${wanted}"에는 파일 확장자(.csv, .xlsx 등)가 없어 올릴 수 없습니다.`);
      let bytes: Uint8Array;
      try { bytes = Uint8Array.from(atob(String(a.data_base64 || '').replace(/^data:[^,]*,/, '').replace(/\s/g, '')), (c) => c.charCodeAt(0)); }
      catch { throw new ToolError('data_base64가 올바른 base64가 아닙니다.'); }
      if (!bytes.length) throw new ToolError('파일 내용이 비어 있습니다.');
      if (bytes.length > MAX_MCP_FILE) throw new ToolError(`10MB를 넘는 파일은 에이전트로 올릴 수 없습니다(${bytes.length}바이트). 앱에서 올려 주세요.`);
      const folder = a.folder === undefined ? '' : normFolder(a.folder);
      if (folder && BAD_FOLDER.test(folder)) throw new ToolError('폴더 이름에는 [ ] | # ^ \\ 를 쓸 수 없습니다.');
      const { data: existing } = await sb.from('brain_files').select('name').eq('vault_id', ctx.vaultId);
      const taken = new Set((existing || []).map((f) => keyOf(f.name)));
      const name = availableName(wanted, (n: string) => taken.has(keyOf(n)));
      const id = crypto.randomUUID();
      const up = await sb.storage.from('brain-files').upload(`${ctx.vaultId}/${id}`, bytes, { contentType: mimeOf(name), upsert: false });
      if (up.error) throw new ToolError(`올리지 못했습니다: ${up.error.message}`);
      const { error } = await sb.from('brain_files').insert({ id, vault_id: ctx.vaultId, name, folder, mime: mimeOf(name), size: bytes.length, created_by: ctx.userId });
      if (error) { await sb.storage.from('brain-files').remove([`${ctx.vaultId}/${id}`]); throw new ToolError(error.message); }
      return `올렸습니다: "${name}" (${bytes.length}바이트). 노트에 ![[${name}]] 를 넣으면 보입니다.`;
    }

    case 'create_upload_url': {
      requireWrite(ctx);
      const wanted = cleanName(String(a.name || ''));
      if (!kindOf(wanted)) throw new ToolError(`"${wanted}"에는 파일 확장자(.csv, .xlsx 등)가 없어 올릴 수 없습니다.`);
      const folder = a.folder === undefined ? '' : normFolder(a.folder);
      if (folder && BAD_FOLDER.test(folder)) throw new ToolError('폴더 이름에는 [ ] | # ^ \\ 를 쓸 수 없습니다.');
      const taken = await fileNames(ctx);
      const name = availableName(wanted, (n: string) => taken.has(keyOf(n)));
      const id = crypto.randomUUID();
      const { data, error } = await sb.storage.from('brain-files').createSignedUploadUrl(`${ctx.vaultId}/${id}`);
      if (error || !data) throw new ToolError(`업로드 주소를 만들지 못했습니다: ${error?.message || ''}`);
      return [
        `업로드 주소를 만들었습니다. 최대 ${MAX_FILE / 1024 / 1024}MB, 2시간 안에 올리세요.`,
        `file_id: ${id}`,
        `name: ${name}`,
        `upload_url: ${data.signedUrl}`,
        '',
        `1) 터미널에서 올리기: curl -X PUT -H "Content-Type: ${mimeOf(name)}" --data-binary @파일경로 "${data.signedUrl}"`,
        `2) 올린 뒤 finish_upload(file_id: "${id}", name: "${name}"${folder ? `, folder: "${folder}"` : ''}) 를 호출해 등록하세요.`,
      ].join('\n');
    }

    case 'finish_upload': {
      requireWrite(ctx);
      const id = String(a.file_id || '');
      if (!UUID_RE.test(id)) throw new ToolError('file_id가 올바르지 않습니다. create_upload_url이 알려 준 값을 그대로 넣으세요.');
      const wanted = cleanName(String(a.name || ''));
      if (!kindOf(wanted)) throw new ToolError(`"${wanted}"에는 파일 확장자가 없습니다.`);
      const folder = a.folder === undefined ? '' : normFolder(a.folder);
      const { data: objs, error: le } = await sb.storage.from('brain-files').list(ctx.vaultId, { search: id, limit: 5 });
      if (le) throw new ToolError(le.message);
      const obj = (objs || []).find((o: any) => o.name === id);
      if (!obj) throw new ToolError('올린 파일을 찾지 못했습니다. upload_url로 파일을 먼저 올린 뒤(2시간 안에) 다시 호출하세요.');
      const size = Number((obj as any).metadata?.size ?? (obj as any).metadata?.contentLength ?? 0);
      if (!size) throw new ToolError('올린 파일이 비어 있습니다.');
      if (size > MAX_FILE) { await sb.storage.from('brain-files').remove([`${ctx.vaultId}/${id}`]); throw new ToolError('50MB를 넘는 파일이라 삭제했습니다.'); }
      const taken = await fileNames(ctx);
      const name = availableName(wanted, (n: string) => taken.has(keyOf(n)));
      const { error } = await sb.from('brain_files').insert({ id, vault_id: ctx.vaultId, name, folder, mime: mimeOf(name), size, created_by: ctx.userId });
      if (error) throw new ToolError(error.message.includes('duplicate') ? '이미 등록된 파일입니다.' : error.message);
      return `등록했습니다: "${name}" (${size}바이트). 노트에 ![[${name}]] 를 넣으면 보입니다.`;
    }
  }
  throw new ToolError(`알 수 없는 도구: ${name}`);
}

// ---------- JSON-RPC ----------
async function handle(pr: Principal, msg: any) {
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
        instructions: pr.ctx
          ? `Second Brain 보관함 "${pr.ctx.vaultName}"에 연결되었습니다. 작업 전에 반드시 wiki_guide를 먼저 호출해 규칙을 읽으세요.`
          : `Second Brain에 ${pr.userName}님 계정으로 연결되었습니다. 작업 전에 반드시 wiki_guide를 먼저 호출해 규칙을 읽으세요. 보관함이 여러 개면 list_vaults로 확인하고 도구의 vault 값으로 고르세요.`,
      });
    }
    case 'ping':
      return ok({});
    case 'tools/list':
      return ok({ tools: TOOLS });
    case 'tools/call': {
      try {
        let text: string;
        if (params?.name === 'list_vaults') {
          const vs = pr.ctx ? [{ name: pr.ctx.vaultName, role: pr.ctx.role }] : await userVaults(pr.userId!);
          text = `보관함 ${vs.length}개\n${vs.map((v) => `- ${v.name} · ${v.role === 'viewer' ? '읽기 전용' : v.role === 'owner' ? '소유자' : '편집자'}`).join('\n') || '(없음)'}`;
        } else {
          const ctx = await ctxFor(pr, params?.arguments?.vault);
          text = await callTool(ctx, params?.name, params?.arguments || {});
        }
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

const SELF = `${Deno.env.get('SUPABASE_URL')}/functions/v1/brain-mcp`;
const META_URL = `${SELF}/.well-known/oauth-protected-resource`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...CORS, 'Access-Control-Expose-Headers': 'WWW-Authenticate' } });
  if (req.method === 'DELETE') return new Response(null, { status: 200, headers: CORS });
  // MCP 로그인(OAuth) 안내문: 이 서버의 로그인은 Supabase Auth가 맡는다
  if (req.method === 'GET' && new URL(req.url).pathname.includes('/.well-known/oauth-protected-resource')) {
    return json({ resource: SELF, authorization_servers: [`${Deno.env.get('SUPABASE_URL')}/auth/v1`], bearer_methods_supported: ['header'], resource_name: 'Second Brain' });
  }
  if (req.method !== 'POST') return json({ error: 'POST로 MCP 요청을 보내세요.' }, 405, { Allow: 'POST' });

  const pr = await authenticate(req);
  if (!pr) {
    return json({ jsonrpc: '2.0', id: null, error: { code: -32001, message: '로그인이 필요하거나 열쇠가 없거나 취소되었습니다. MCP 주소만 넣고 로그인하거나, 앱의 설정 → AI 에이전트 연결에서 열쇠를 만드세요.' } }, 401,
      { 'WWW-Authenticate': `Bearer resource_metadata="${META_URL}"`, 'Access-Control-Expose-Headers': 'WWW-Authenticate' });
  }

  let body: any;
  try { body = await req.json(); } catch { return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400); }
  const batch = Array.isArray(body);
  const msgs = batch ? body : [body];
  const replies = [];
  for (const m of msgs) {
    if (m?.id === undefined || m?.id === null) continue; // 알림(notifications/*)은 답하지 않는다
    replies.push(await handle(pr, m));
  }
  if (!replies.length) return new Response(null, { status: 202, headers: CORS });
  return json(batch ? replies : replies[0]);
});
