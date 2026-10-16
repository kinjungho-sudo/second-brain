// 가져오기·내보내기. Obsidian 보관함은 .md 파일이 든 폴더이므로 폴더를 그대로 읽고, ZIP으로 내보낸다.

import { kindOf } from './files.js';

const BAD =/[[\]|#^\\/:]/g;
const clean = (s) => s.replace(BAD, '-').trim();

// 'a/b/c.md' → { title: 'c', folder: 'a/b' } (보관함에서 허용하지 않는 글자는 '-'로 바꾼다)
export function splitPath(path) {
  const parts = path.split('/').filter(Boolean);
  const file = parts.pop() || '';
  return { title: clean(file.replace(/\.md$/i, '')), folder: parts.map(clean).filter(Boolean).join('/') };
}

// [[폴더/노트|별칭]] → [[노트|별칭]]  (이 앱은 노트 이름만으로 링크를 찾는다)
export function flattenLinks(text) {
  return text.replace(/(!?\[\[)([^\]|#\n]*\/)([^\]|#\n]+)/g, '$1$3');
}

// 선택한 폴더의 File 목록 → 가져올 노트 목록. 첫 경로(폴더 이름)는 떼고, 숨김 폴더(.obsidian 등)는 건너뛴다.
export async function readVaultFiles(files) {
  const notes = [];
  const attachments = [];
  let skipped = 0;
  for (const f of files) {
    const rel = (f.webkitRelativePath || f.name).split('/').slice(f.webkitRelativePath ? 1 : 0);
    if (rel.some((p) => p.startsWith('.'))) continue;
    if (!/\.md$/i.test(f.name)) {
      // 이미지·PDF·오디오·비디오는 첨부 파일로 가져온다 (나머지는 건너뜀)
      if (kindOf(f.name)) attachments.push({ name: clean(f.name), file: f });
      else skipped++;
      continue;
    }
    const { title, folder } = splitPath(rel.join('/'));
    if (!title) { skipped++; continue; }
    notes.push({ title, folder, content: flattenLinks((await f.text()).replace(/\r\n?/g, '\n')) });
  }
  return { notes, attachments, skipped };
}

// 이름이 겹치면 "제목 (폴더)" → "제목 (폴더) 2" 순으로 바꾼다. taken은 소문자 키 Set.
export function dedupe(notes, taken) {
  let renamed = 0;
  for (const n of notes) {
    let t = n.title;
    const tail = n.folder.split('/').pop();
    if (taken.has(t.toLowerCase()) && tail) t = `${n.title} (${tail})`;
    for (let i = 2; taken.has(t.toLowerCase()); i++) t = `${n.title} ${i}`;
    if (t !== n.title) { n.title = t; renamed++; }
    taken.add(t.toLowerCase());
  }
  return renamed;
}

// ---- ZIP (저장만 하고 압축은 안 함. 외부 라이브러리 없음) ----
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

export function buildZip(entries /* [{ path, text, date }] */) {
  const enc = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const e of entries) {
    const name = enc.encode(e.path);
    const data = e.data || enc.encode(e.text);
    const d = e.date || new Date();
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const day = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    const crc = crc32(data);
    const head = new DataView(new ArrayBuffer(30));
    [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [8, 0, 2], [10, time, 2], [12, day, 2], [14, crc, 4], [18, data.length, 4], [22, data.length, 4], [26, name.length, 2], [28, 0, 2]]
      .forEach(([o, v, n]) => (n === 4 ? head.setUint32(o, v, true) : head.setUint16(o, v, true)));
    chunks.push(new Uint8Array(head.buffer), name, data);
    const cen = new DataView(new ArrayBuffer(46));
    [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [10, 0, 2], [12, time, 2], [14, day, 2], [16, crc, 4], [20, data.length, 4], [24, data.length, 4], [28, name.length, 2], [30, 0, 2], [32, 0, 2], [34, 0, 2], [36, 0, 2], [38, 0, 4], [42, offset, 4]]
      .forEach(([o, v, n]) => (n === 4 ? cen.setUint32(o, v, true) : cen.setUint16(o, v, true)));
    central.push(new Uint8Array(cen.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const cenSize = central.reduce((s, c) => s + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, cenSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...chunks, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
}
