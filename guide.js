// 시작 가이드: LLM 위키 연결 방법을 가장 쉬운 말로. 앱 안 도움말 창에 들어간다 (GUIDE.md와 같은 내용).
// ctx: { el, mcpUrl, appUrl, copyText, openAgents, openMembers }

export function guideContent({ el, mcpUrl, appUrl, copyText, openAgents, openMembers }) {
  const code = (text) => el('div', { class: 'agent-code' }, el('pre', { text }), el('button', { class: 'small-button', text: '복사', onclick: () => copyText(text) }));
  const step = (n, title, ...body) => el('div', { class: 'guide-step' },
    el('div', { class: 'guide-num', text: String(n) }),
    el('div', { class: 'guide-step-body' }, el('div', { class: 'guide-step-title', text: title }), ...body));
  const p = (text) => el('p', { class: 'guide-p', text });
  const h = (text) => el('div', { class: 'members-section-title guide-h', text });

  return el('div', { class: 'guide' },
    el('div', { class: 'guide-hero' },
      el('div', { class: 'guide-hero-title', text: '내 AI에게 "이거 위키에 저장해줘" 한마디면 끝' }),
      el('div', { class: 'guide-hero-sub', text: '좋은 글이나 영상 링크를 Claude나 Codex에게 주면, AI가 읽고 정리해서 이 Second Brain에 저장합니다. 아래 순서대로 한 번만 연결하면 됩니다.' })),

    h('① 먼저, 연결 주소 복사'),
    p('이 주소 하나만 있으면 됩니다. API 키나 비밀번호는 필요 없습니다.'),
    code(mcpUrl),

    h('② 쓰는 AI에 연결하기 (아래 중 하나만 하세요)'),
    step('A', 'Claude 앱 (가장 쉬움)',
      p('Claude 앱 → 설정 → 커넥터 → "커스텀 커넥터 추가"를 누릅니다.'),
      p('이름에는 Second Brain, 주소에는 위에서 복사한 주소를 붙여 넣고 추가합니다.'),
      p('연결을 누르면 브라우저가 열립니다. 구글로 로그인하고 "허용"을 누르면 끝입니다. (화면 이름은 앱 버전에 따라 조금 다를 수 있어요)')),
    step('B', 'Codex (ChatGPT 요금제)',
      p('터미널(명령 창)에 아래 두 줄을 차례로 붙여 넣고 Enter를 누르세요. 두 번째 줄을 치면 브라우저가 열리고, 구글 로그인 후 "허용"을 누릅니다.'),
      code(`codex mcp add second-brain --url ${mcpUrl}\ncodex mcp login second-brain`)),
    step('C', '터미널의 Claude Code',
      p('터미널에 아래 줄을 붙여 넣고, Claude Code를 연 다음 /mcp 를 입력해 second-brain을 고르고 로그인하세요.'),
      code(`claude mcp add --transport http second-brain ${mcpUrl}`)),

    h('③ 이렇게 말해 보세요'),
    p('연결한 AI에게 그대로 복사해서 말하면 됩니다. (링크 부분만 바꾸세요)'),
    code('second-brain의 LLM 위키 규칙을 읽고, 이 글을 위키에 저장해줘: https://여기에-링크'),
    code('내 위키를 보고 ○○에 대해 정리해서 알려줘'),
    code('위키 점검해줘 (끊긴 링크와 빈 노트를 찾아서 고쳐줘)'),
    code('이 엑셀 파일을 보관함에 올리고, 핵심을 정리한 노트도 만들어줘 (50MB까지)'),
    p('AI가 저장한 내용은 왼쪽 노트 목록에 바로 나타납니다. 노트 오른쪽 "수정 이력"에서 🤖 표시로 누가 고쳤는지 보고, 마음에 안 들면 되돌릴 수 있습니다.'),

    h('④ 둘이 같이 쓰기 (재한님 등 팀원)'),
    step(1, '초대하기', p('앱 왼쪽 아래 👥(멤버와 초대)에서 상대방 이메일을 적어 초대합니다.'),
      el('div', {}, el('button', { class: 'small-button', text: '멤버와 초대 열기', onclick: openMembers }))),
    step(2, '상대방이 할 일', p('아래 앱 주소로 자기 구글 계정으로 로그인하고, 보이는 초대를 "수락"합니다.'), code(appUrl)),
    step(3, '연결하기', p('상대방도 위 ② 방법으로 같은 연결 주소를 넣고 구글 로그인하면 끝입니다. 각자 자기 구글 계정으로 연결되고, 함께 쓰는 보관함은 둘 다 볼 수 있습니다.')),
    p('보관함이 여러 개일 때는 이렇게 말하세요: "코마인드웍스 보관함에 저장해줘"'),

    h('막혔을 때'),
    el('div', { class: 'guide-faq' },
      faq(el, '"접근할 수 있는 보관함이 없습니다"라고 나와요', '앱에 먼저 로그인해서 보관함을 만들거나, 받은 초대를 수락하세요.'),
      faq(el, '로그인 창이 안 열려요', '연결 주소가 정확한지 보세요. 그래도 안 되면 앱에 먼저 로그인한 뒤 다시 연결해 보세요.'),
      faq(el, '파일이 안 올라가요', '파일 한 개가 50MB 이하여야 합니다. 더 큰 파일은 나중에 저장소 요금제를 올리면 가능합니다.'),
      faq(el, '연결을 끊고 싶어요', '앱 왼쪽 아래 🤖 버튼 → "로그인으로 연결된 에이전트"에서 "연결 끊기"를 누르세요.'),
      faq(el, 'AI가 잘못 고쳤어요', '노트 오른쪽 "수정 이력"에서 이전 모습으로 되돌릴 수 있습니다.')),

    el('div', { class: 'guide-footer' }, el('button', { class: 'mod-cta', text: '🤖 연결 관리 열기', onclick: openAgents })));
}

function faq(el, q, a) {
  return el('details', { class: 'guide-faq-item' }, el('summary', { text: q }), el('div', { class: 'muted small', text: a }));
}
