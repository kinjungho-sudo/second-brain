// [자동 생성] 앱의 files.js 에서 화면(브라우저) 코드를 뺀 서버용 복사본. 직접 고치지 말고 build-mcp-modules.py 로 다시 만든다.
// 첨부 파일: Obsidian이 첨부로 인식하는 확장자와 이름 규칙, 그리고 화면에 그리는 방법.
// (Obsidian app.js: 이미지 bmp png jpg jpeg gif svg webp avif / 오디오 mp3 wav m4a 3gp flac ogg oga opus /
//  비디오 mp4 webm ogv mov mkv / pdf. 붙여넣은 이미지 이름은 "Pasted image YYYYMMDDHHmmss", 겹치면 "이름 1", "이름 2"…)

const IMAGE = ['bmp', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'avif'];
const AUDIO = ['mp3', 'wav', 'm4a', '3gp', 'flac', 'ogg', 'oga', 'opus'];
const VIDEO = ['mp4', 'webm', 'ogv', 'mov', 'mkv'];
const PDF = ['pdf'];

export const MAX_FILE_SIZE = 50 * 1024 * 1024;

export const extOf = (name) => { const m = /\.([^./\\]+)$/.exec(String(name || '')); return m ? m[1].toLowerCase() : ''; };
export const kindOf = (name) => {
  const e = extOf(name);
  return IMAGE.includes(e) ? 'image' : AUDIO.includes(e) ? 'audio' : VIDEO.includes(e) ? 'video' : PDF.includes(e) ? 'pdf' : null;
};
// 노트가 아니라 첨부 파일을 가리키는 이름인가 ([[x.png]] 처럼 확장자가 첨부 형식)
export const isAttachmentName = (name) => kindOf(name) !== null;

const MIME = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp', bmp: 'image/bmp', avif: 'image/avif',
  mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', '3gp': 'video/3gpp', flac: 'audio/flac', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg',
  mp4: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg', mov: 'video/quicktime', mkv: 'video/x-matroska', pdf: 'application/pdf',
};
export const mimeOf = (name, fallback = '') => MIME[extOf(name)] || fallback || 'application/octet-stream';

// 이름에 쓸 수 없는 글자는 '-' (노트 제목과 같은 규칙)
export const cleanName = (name) => String(name || '').replace(/[[\]|#^\\/:]/g, '-').trim();

const pad = (n) => String(n).padStart(2, '0');
export const pastedName = (ext, d = new Date()) =>
  `Pasted image ${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.${ext}`;

// 같은 이름이 있으면 "이름 1.png", "이름 2.png" … (Obsidian getAvailablePath)
export function availableName(name, exists) {
  if (!exists(name)) return name;
  const e = extOf(name);
  const base = e ? name.slice(0, -(e.length + 1)) : name;
  for (let i = 1; ; i++) {
    const t = e ? `${base} ${i}.${e}` : `${base} ${i}`;
    if (!exists(t)) return t;
  }
}
