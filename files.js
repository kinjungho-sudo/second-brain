// 첨부 파일: Obsidian이 첨부로 인식하는 확장자와 이름 규칙, 그리고 화면에 그리는 방법.
// (Obsidian app.js: 이미지 bmp png jpg jpeg gif svg webp avif / 오디오 mp3 wav m4a 3gp flac ogg oga opus /
//  비디오 mp4 webm ogv mov mkv / pdf. 붙여넣은 이미지 이름은 "Pasted image YYYYMMDDHHmmss", 겹치면 "이름 1", "이름 2"…)

const IMAGE = ['bmp', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'avif'];
const AUDIO = ['mp3', 'wav', 'm4a', '3gp', 'flac', 'ogg', 'oga', 'opus'];
const VIDEO = ['mp4', 'webm', 'ogv', 'mov', 'mkv'];
const PDF = ['pdf'];

export const MAX_FILE_SIZE = 50 * 1024 * 1024;

export const extOf = (name) => { const m = /\.([^./\\]+)$/.exec(String(name || '')); return m ? m[1].toLowerCase() : ''; };
// 화면에 바로 보여 주는 형식(image·audio·video·pdf)이면 그 종류, 그 밖의 파일(csv·xlsx·json·zip 등 .md가 아닌 확장자)은 'file'
export const kindOf = (name) => {
  const e = extOf(name);
  if (IMAGE.includes(e)) return 'image';
  if (AUDIO.includes(e)) return 'audio';
  if (VIDEO.includes(e)) return 'video';
  if (PDF.includes(e)) return 'pdf';
  return e && e !== 'md' && /\.[A-Za-z0-9]{1,8}$/.test(String(name || '')) ? 'file' : null;
};
// 바로 보여 주는 형식인가 (이 경우는 파일이 없어도 노트 링크로 치지 않는다)
export const isMediaName = (name) => { const k = kindOf(name); return k !== null && k !== 'file'; };
// 파일 이름처럼 생겼나. 'file' 종류는 [[Node.js]] 같은 노트 제목과 헷갈릴 수 있어서 실제 파일이 있을 때만 파일로 친다
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

// ![[그림.png|300]] 또는 |300x200
export function embedSize(alias) {
  const m = /^(\d+)(?:x(\d+))?$/.exec(String(alias || '').trim());
  return m ? { w: +m[1], h: m[2] ? +m[2] : null } : null;
}

/**
 * container 안에 첨부 파일 하나를 그린다.
 * file: brain_files 행 또는 null / urlOf(file): Promise<string> / alias: 크기 표기 또는 대체 글
 */
export function renderAttachment(container, name, file, urlOf, alias) {
  container.replaceChildren();
  container.classList.add('attachment-embed');
  const kind = kindOf(name);
  if (!file) {
    container.classList.add('is-unresolved');
    container.textContent = `"${name}" 파일이 없습니다`;
    return;
  }
  const size = embedSize(alias);
  const sized = (el) => { if (size) { el.style.width = `${size.w}px`; if (size.h) el.style.height = `${size.h}px`; } return el; };
  const slot = (tag, props = {}) => {
    const el = Object.assign(document.createElement(tag), props);
    container.append(el);
    urlOf(file).then((u) => { el.src = u; }, () => { container.classList.add('is-unresolved'); container.textContent = `"${name}"을(를) 불러오지 못했습니다`; });
    return el;
  };
  if (kind === 'file') {
    const a = Object.assign(document.createElement('a'), { className: 'attachment-file', href: '#', title: '클릭하면 내려받습니다' });
    a.textContent = `📎 ${name}${file.size != null ? ` · ${fmtBytes(file.size)}` : ''}`;
    a.addEventListener('click', (e) => { e.preventDefault(); urlOf(file).then((u) => window.open(u, '_blank', 'noopener')); });
    container.append(a);
    return;
  }
  if (kind === 'image') sized(slot('img', { alt: size ? '' : alias || name, className: 'attachment-image', loading: 'lazy' }));
  else if (kind === 'audio') slot('audio', { controls: true, className: 'attachment-audio' });
  else if (kind === 'video') sized(slot('video', { controls: true, className: 'attachment-video' }));
  else if (kind === 'pdf') {
    const frame = slot('iframe', { className: 'attachment-pdf', title: name });
    sized(frame);
    if (!size) frame.style.height = '600px';
  }
}

export const fmtBytes = (n) => (n < 1024 ? `${n}B` : n < 1048576 ? `${(n / 1024).toFixed(1)}KB` : `${(n / 1048576).toFixed(1)}MB`);
