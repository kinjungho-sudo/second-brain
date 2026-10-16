// 템플릿: Obsidian "템플릿" 코어 플러그인과 같은 규칙 (Obsidian app.js 확인)
//  - 변수: {{title}}, {{date}}, {{time}}, {{date:형식}}, {{time:형식}} (대소문자 무시). 기본 형식 YYYY-MM-DD / HH:mm
//  - 커서가 문서 맨 앞이면 템플릿 전체를 넣고, 아니면 본문만 넣고 템플릿의 속성은 노트 속성에 합친다
//  - 속성 합치기: 목록은 합집합, 값은 템플릿 값이 이긴다 (null 제외)
export const DEFAULT_DATE_FORMAT = 'YYYY-MM-DD';
export const DEFAULT_TIME_FORMAT = 'HH:mm';

const pad = (n, w = 2) => String(n).padStart(w, '0');

// moment 형식 일부: YYYY YY MMMM MMM MM M DD D dddd ddd HH H hh h mm m ss s A a Q X x, [글자]는 그대로
export function formatDate(d, fmt) {
  const h12 = d.getHours() % 12 || 12;
  return fmt.replace(/\[([^\]]*)\]|YYYY|YY|MMMM|MMM|MM|M|DD|D|dddd|ddd|HH|H|hh|h|mm|m|ss|s|A|a|Q|X|x/g, (t, lit) => {
    if (lit !== undefined) return lit;
    switch (t) {
      case 'YYYY': return String(d.getFullYear());
      case 'YY': return pad(d.getFullYear() % 100);
      case 'MMMM': return d.toLocaleDateString('ko-KR', { month: 'long' });
      case 'MMM': return d.toLocaleDateString('ko-KR', { month: 'short' });
      case 'MM': return pad(d.getMonth() + 1);
      case 'M': return String(d.getMonth() + 1);
      case 'DD': return pad(d.getDate());
      case 'D': return String(d.getDate());
      case 'dddd': return d.toLocaleDateString('ko-KR', { weekday: 'long' });
      case 'ddd': return d.toLocaleDateString('ko-KR', { weekday: 'short' });
      case 'HH': return pad(d.getHours());
      case 'H': return String(d.getHours());
      case 'hh': return pad(h12);
      case 'h': return String(h12);
      case 'mm': return pad(d.getMinutes());
      case 'm': return String(d.getMinutes());
      case 'ss': return pad(d.getSeconds());
      case 's': return String(d.getSeconds());
      case 'A': return d.getHours() < 12 ? 'AM' : 'PM';
      case 'a': return d.getHours() < 12 ? 'am' : 'pm';
      case 'Q': return String(Math.ceil((d.getMonth() + 1) / 3));
      case 'X': return String(Math.floor(d.getTime() / 1000));
      case 'x': return String(d.getTime());
      default: return t;
    }
  });
}

export function applyVars(text, { title = '' }, { dateFormat, timeFormat } = {}, now = new Date()) {
  return text
    .replace(/{{title}}/gi, () => title)
    .replace(/{{(date|time)(?::(.*?))?}}/gi, (_, kind, fmt) =>
      formatDate(now, fmt || (kind.toLowerCase() === 'date' ? dateFormat || DEFAULT_DATE_FORMAT : timeFormat || DEFAULT_TIME_FORMAT)));
}

// 노트 속성(entries)에 템플릿 속성을 합친다
export function mergeEntries(noteEntries, tplEntries) {
  const out = noteEntries.map((e) => ({ ...e, value: Array.isArray(e.value) ? [...e.value] : e.value }));
  for (const t of tplEntries) {
    if (t.type === 'raw') { if (!out.some((e) => e.type === 'raw' && e.lines.join() === t.lines.join())) out.push({ ...t }); continue; }
    const cur = out.find((e) => e.type !== 'raw' && e.key === t.key);
    if (!cur) { out.push({ ...t, value: Array.isArray(t.value) ? [...t.value] : t.value }); continue; }
    if (cur.type === 'list' && t.type === 'list') cur.value = [...new Set([...cur.value, ...t.value])];
    else if (t.value !== '' && t.value !== null) { cur.type = t.type; cur.value = Array.isArray(t.value) ? [...t.value] : t.value; }
  }
  return out;
}
