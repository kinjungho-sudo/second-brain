# Second Brain

**함께 쓰는 Obsidian.** 메모를 `[[링크]]`로 이어 지식망을 만들고, 초대한 사람과 실시간으로 같이 키우는 웹 노트 앱입니다.

Obsidian 1.14.4를 REA로 분석해서 알아낸 **동작 원리와 구조**를 바탕으로 처음부터 새로 만들었습니다. Obsidian의 코드는 쓰지 않았습니다. Obsidian은 혼자 쓰도록 설계되어 있어서, 여기에 여럿이 함께 쓰는 기능을 더했습니다.

## 쓰는 방법

1. Google 계정으로 로그인합니다.
2. **보관함**(Obsidian의 vault)을 만들거나, 받은 초대를 수락합니다.
3. 보관함에서 노트를 쓰고 `[[노트 이름]]`으로 서로 잇습니다.
4. 왼쪽 아래 보관함 이름이나 리본의 👥 버튼을 누르면 **멤버와 초대** 창이 열립니다. 여기서 이메일로 사람을 초대합니다.

한 사람이 여러 보관함에 속할 수 있습니다. 예를 들어 "사업 리서치"는 동료와, "독서 모임"은 모임 사람들과 따로 씁니다.

## 기능

**Obsidian과 같은 것**
- Live Preview 편집기: 커서가 없는 줄은 마크다운 기호를 숨기고 서식만 보여 줍니다.
- 읽기 보기 전환 (Ctrl+E)
- `[[노트]]` · `[[노트#소제목]]` · `[[노트|별칭]]` · `![[노트]]` 임베드
- `[[` 자동완성과 `#태그` 자동완성
- 콜아웃 `> [!tip]`, `==형광펜==`, 체크박스
- 백링크(문맥 포함)와 **링크되지 않은 언급**(버튼 하나로 링크로 바꾸기)
- 노트 이름을 바꾸면 다른 노트의 링크도 함께 갱신 (항상 / 이번만 / 안 함)
- 탭, 폴더 탐색기(끌어서 이동), 빠른 이동(Ctrl+O), 명령 팔레트(Ctrl+P), 데일리 노트(Alt+D)
- 검색 연산자: `"구절"` `tag:#할일` `path:폴더` `file:제목` `-제외`
- 그래프 뷰, 로컬 그래프, 개요, 태그 목록, 링크 미리보기
- 어두운/밝은 테마

**함께 쓰기 위해 더한 것**
- 보관함마다 멤버와 권한을 둡니다: 소유자 / 편집자 / 읽기 전용
- 이메일 초대, 초대 취소, 멤버 내보내기, 보관함에서 나가기
- 다른 멤버가 고친 내용이 실시간으로 반영됩니다.
- 누가 지금 어떤 노트를 보고 있는지 표시됩니다.
- 같은 노트를 동시에 고치면 충돌을 감지해서 어느 쪽을 남길지 고릅니다.
- 수정 이력: 누가 언제 무엇을 바꿨는지 보고, 지금 내용과 비교한 뒤 되돌릴 수 있습니다.
- 그래프에서 마지막으로 고친 사람별로 색을 나눠 봅니다.
- 보관함(휴지통): 노트를 지우지 않고 보관하며 언제든 되돌릴 수 있습니다.

## AI 에이전트로 LLM 위키 만들기

Karpathy의 "LLM 위키" 방식으로 쓸 수 있습니다. 원본 자료를 넣으면 AI 에이전트가 정리된 위키 페이지를 만들고 계속 고칩니다.
앱 안에 AI가 들어 있지 않습니다. **정호님이 쓰는 에이전트(Claude Code, Codex, Hermes 등)가 MCP로 보관함에 접속해** 읽고 씁니다.
그래서 앱 쪽 API 비용이 들지 않고, 웹·PDF 읽기도 에이전트가 직접 합니다.

1. 설정(또는 리본의 🤖) → **LLM 위키 시작하기**
   규칙 노트 `AGENTS`, `index`, `log`와 `원본/`, `위키/` 폴더를 만듭니다. `AGENTS` 노트를 고치면 모든 에이전트의 규칙이 바뀝니다.
2. 설정 → **에이전트 연결** → 열쇠 만들기
   Claude Code, Codex, Hermes용 설정 문구가 나옵니다. 복사해서 붙이면 됩니다.
3. (선택) `agents/second-brain-wiki/SKILL.md`를 에이전트의 스킬 폴더에 넣습니다. Claude Code라면 `~/.claude/skills/`입니다.
   그러면 "이 글 위키에 넣어줘"라는 말만으로 정리 순서를 따릅니다.
4. 에이전트에게 말합니다.
   - 자료 넣기: "이 기사 위키에 넣어줘 https://…"
   - 질문: "위키 보고 A사와 B사 차이 정리해줘"
   - 점검: "위키 점검해줘"

에이전트가 고친 내용은 실시간으로 앱에 나타납니다. 이력에는 "🤖 Claude Code"처럼 남고, 언제든 되돌릴 수 있습니다.
열쇠는 보관함 하나와 만든 사람의 권한으로만 동작하며, 설정에서 언제든 취소할 수 있습니다.

**MCP 도구:** `wiki_guide`, `list_notes`, `read_note`, `search_notes`, `write_note`, `rename_note`, `archive_note`, `recent_changes`, `find_problems`
**서버:** `supabase/functions/brain-mcp` (Supabase Edge Function)

## Obsidian 구조와의 대응

| Obsidian (분석 결과) | 이 앱 |
|---|---|
| vault (폴더 하나) | `brain_vaults` + `brain_members` (여러 사람이 공유) |
| `metadataCache`: 링크 색인 | `brain_notes.link_keys`: 저장할 때 DB 트리거가 `[[링크]]`를 추출 |
| `getBacklinksForFile` | `link_keys`에 내 제목이 들어 있는 노트 |
| `renameFile` → `runAsyncLinkUpdate` | `brain_rename_note()`: 한 트랜잭션에서 제목 변경과 링크 재작성 |
| 확인창 [항상 업데이트 / 이번만 / 업데이트 안 함] | 같은 확인창 |
| `vault.process()`: 읽기·고치기·쓰기를 한 번에 | `version` 비교로 저장 (동시 편집 충돌 감지) |

## 구성

```
├── index.html          화면 뼈대
├── app.js              작업공간 (보관함, 탭, 파일 탐색기, 검색, 백링크, 실시간, 멤버)
├── editor.js           CodeMirror Live Preview 편집기
├── render.js           읽기 보기 렌더러 (위키링크, 임베드, 콜아웃)
├── graph.js            그래프 뷰 (d3-force + canvas)
├── icons.js            아이콘
├── wiki-rules.js       LLM 위키 기본 규칙 (AGENTS 노트의 처음 내용)
├── agents/second-brain-wiki/SKILL.md   에이전트용 스킬
├── style.css           스타일 (어두운/밝은 테마)
├── config.js           Supabase 주소와 공개 키
├── vendor.js           외부 라이브러리 묶음 (supabase-js, CodeMirror 6, marked, DOMPurify, d3-force)
├── build-vendor.sh     vendor.js를 다시 만드는 스크립트
├── vercel.json         보안 헤더 (CSP 등)
└── supabase/
    ├── schema.sql              DB 스키마 (brain_ 보관함 구조)
    ├── functions/brain-mcp/    AI 에이전트용 MCP 서버
    └── legacy-sb-schema.sql    이전 두 사람 전용 구조 (기록용)
```

빌드 단계가 없는 정적 사이트입니다. 폴더를 그대로 Vercel에 올리면 됩니다.

## 보안 모델

- **로그인:** Google 계정만 받습니다.
- **접근:** 모든 테이블에 RLS를 걸었습니다. 그 보관함의 멤버가 아니면 노트·폴더·이력·멤버가 0건으로 보입니다. 테스트로 확인했습니다.
- **쓰기:** 편집자 이상만 쓸 수 있습니다. 초대, 권한 변경, 내보내기는 소유자만 할 수 있습니다.
- **초대 수락:** Google로 확인된 같은 이메일 계정만 할 수 있습니다. 이메일 가입이 자동 승인되는 프로젝트에서는 남의 주소로 가입할 수 있기 때문입니다.
- **지우지 않음:** 노트, 멤버, 폴더는 모두 "보관"이나 "내보냄" 표시로만 처리하고 이력은 남깁니다.
- **XSS:** 마크다운 결과는 DOMPurify로 정리합니다. CSP로 자기 도메인 스크립트만 허용하고, 데이터 통신은 Supabase로만 허용합니다.

## 새로 설치할 때

1. Supabase SQL Editor에서 `supabase/schema.sql`을 실행합니다.
2. Supabase Authentication에서 Google 로그인을 켜고, 배포 주소를 Redirect URLs에 추가합니다.
3. `config.js`에 프로젝트 주소와 공개(publishable) 키를 넣습니다.
4. Vercel에 올립니다.
