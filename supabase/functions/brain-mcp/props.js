// [자동 생성] 앱의 props.js 에서 화면(브라우저) 코드를 뺀 서버용 복사본. 직접 고치지 말고 build-mcp-modules.py 로 다시 만든다.
// 속성(Properties): 노트 맨 위 YAML 앞머리를 읽고, 표처럼 보여 주고, 고친 값을 다시 YAML로 쓴다.
// 지원하는 값: 텍스트 · 목록 · 숫자 · 체크박스 · 날짜. 그 밖의 YAML(중첩, 여러 줄)은 'raw'로 그대로 보존한다.

// Obsidian(app.js)의 기본 속성: tags / aliases / cssclasses 는 이름의 대소문자를 구분하지 않고 목록으로 다룬다.
const LIST_KEYS = new Set(['tags', 'aliases', 'cssclasses']);
const isListKey = (k) => LIST_KEYS.has(String(k).toLowerCase());
// 속성 이름 → 타입 (이 브라우저에 저장. Obsidian의 .obsidian/types.json 역할)
const HINT_KEY = 'sb.propTypes';
const typeHints = () => { try { return JSON.parse(localStorage.getItem(HINT_KEY) || '{}'); } catch { return {}; } };
const rememberType = (key, type) => { try { localStorage.setItem(HINT_KEY, JSON.stringify({ ...typeHints(), [key]: type })); } catch { /* 저장 못 해도 값은 정상 */ } };
// Obsidian의 날짜 형식: YYYY-MM-DD 와 YYYY-MM-DDTHH:mm
const DATE_RE = /^\d{4}-[01]\d-[0-3]\d$/;
const DATETIME_RE = /^\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d$/;
const KEY_RE = /^([^\s#:'"-][^:]*?|"[^"]+"|'[^']+'):(?:\s+(.*))?$/;

const unquote = (s) => {
  const m = /^(["'])(.*)\1$/.exec(s);
  return m ? (m[1] === '"' ? m[2].replace(/\\(["\\])/g, '$1') : m[2].replace(/''/g, "'")) : s;
};
const isQuoted = (s) => /^(["']).*\1$/.test(s);

function splitInline(s) {
  const out = [];
  let cur = '', q = null;
  for (const ch of s) {
    if (q) { cur += ch; if (ch === q) q = null; } else if (ch === '"' || ch === "'") { q = ch; cur += ch; } else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out.map((x) => unquote(x.trim())).filter((x) => x !== '');
}

/** 앞머리가 있으면 { to, entries } (to = 닫는 --- 줄 끝 위치), 없으면 null */
export function parseFrontmatter(text) {
  // Obsidian과 같이: 맨 첫 줄이 정확히 ---, 닫는 --- 도 줄 맨 앞에서 바로 줄바꿈/끝이 와야 한다 (뒤에 공백이 있으면 앞머리가 아님)
  const m = /^---\n(?:([\s\S]*?)\n)?---(?=\n|$)/.exec(text || '');
  if (!m) return null;
  const lines = (m[1] ?? '').split('\n');
  const entries = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const km = KEY_RE.exec(line);
    if (!km) { entries.push({ key: '', type: 'raw', lines: [line] }); continue; }
    const key = unquote(km[1].trim());
    const v = (km[2] ?? '').trim();
    const rest = [];
    while (i + 1 < lines.length && /^(\s+\S|\s*-(\s|$))/.test(lines[i + 1])) rest.push(lines[++i]);
    if (v === '') {
      const items = rest.map((r) => /^\s*-\s*(.*)$/.exec(r));
      if (rest.length && items.every(Boolean)) entries.push({ key, type: 'list', value: items.map((x) => unquote(x[1].trim())).filter((x) => x !== '') });
      else if (rest.length) entries.push({ key, type: 'raw', lines: [line, ...rest] });
      else {
        // 값이 비면 YAML만으로는 타입을 알 수 없다 → Obsidian(metadataTypeManager)처럼 속성 이름별로 기억한 타입을 쓴다
        const hint = isListKey(key) ? 'list' : typeHints()[key];
        entries.push(hint === 'list' ? { key, type: 'list', value: [] }
          : hint === 'checkbox' ? { key, type: 'checkbox', value: false }
            : hint === 'number' || hint === 'date' || hint === 'datetime' ? { key, type: hint, value: '' }
              : { key, type: 'text', value: '' });
      }
    } else if (rest.length || /^[|>]/.test(v) || /^[{&*!]/.test(v)) {
      entries.push({ key, type: 'raw', lines: [line, ...rest] });
    } else if (v.startsWith('[') && v.endsWith(']')) {
      entries.push({ key, type: 'list', value: splitInline(v.slice(1, -1)) });
    } else if (isQuoted(v)) {
      entries.push({ key, type: 'text', value: unquote(v) });
    } else if (v === 'true' || v === 'false') {
      entries.push({ key, type: 'checkbox', value: v === 'true' });
    } else if (/^-?\d+(\.\d+)?$/.test(v)) {
      entries.push({ key, type: 'number', value: v });
    } else if (DATE_RE.test(v)) {
      entries.push({ key, type: 'date', value: v });
    } else if (DATETIME_RE.test(v)) {
      entries.push({ key, type: 'datetime', value: v });
    } else if (isListKey(key)) {
      // Obsidian: 목록 속성에 문자열 하나가 오면 쉼표로 쪼개지 않고 항목 하나로 본다
      entries.push({ key, type: 'list', value: [v] });
    } else entries.push({ key, type: 'text', value: v });
  }
  return { to: m[0].length, entries };
}

const needsQuote = (s) => s === '' || /^\s|\s$|^[-?:,[\]{}#&*!|>'"%@`]|:\s|\s#|^(true|false|null|yes|no|on|off|~)$/i.test(s) || /^-?\d+(\.\d+)?$/.test(s) || DATE_RE.test(s) || DATETIME_RE.test(s);
const q = (s) => (needsQuote(s) ? JSON.stringify(s) : s);
const keyOut = (k) => (/^[^\s#:'"-][^:]*$/.test(k) && !/\s$/.test(k) ? k : JSON.stringify(k));

export function serializeFrontmatter(entries) {
  const out = ['---'];
  for (const e of entries) {
    if (e.type === 'raw') out.push(...e.lines);
    else if (e.type === 'list') {
      if (!e.value.length) out.push(`${keyOut(e.key)}: []`);
      else { out.push(`${keyOut(e.key)}:`); e.value.forEach((x) => out.push(`  - ${q(x)}`)); }
    } else if (e.type === 'checkbox') out.push(`${keyOut(e.key)}: ${e.value ? 'true' : 'false'}`);
    else if (e.type === 'number' || e.type === 'date' || e.type === 'datetime') out.push(`${keyOut(e.key)}: ${e.value}`);
    else out.push(e.value === '' ? `${keyOut(e.key)}:` : `${keyOut(e.key)}: ${q(String(e.value))}`);
  }
  out.push('---');
  return out.join('\n');
}

/** 앞머리의 태그(#없이) */
export function frontmatterTags(text) {
  const fm = parseFrontmatter(text);
  const e = fm?.entries.find((x) => x.key.toLowerCase() === 'tags');
  if (!e || e.type !== 'list') return [];
  // Obsidian(XT): 항목을 다듬고, 비었거나 공백이 들어간 항목은 태그로 치지 않는다
  return e.value.map((t) => t.trim().replace(/^#/, '')).filter((t) => t && !t.includes(' '));
}
