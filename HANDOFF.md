# 인수인계 노트 (클라우드 → 내 PC)

2026-10-16 · 클라우드 Claude Code 세션에서 로컬 PC로 작업을 옮기며 남긴 기록입니다.
PC의 Claude Code에게 **"HANDOFF.md 읽고 이어서 하자"** 라고 말하면 됩니다.

---

## 1. 내 PC에서 시작하는 법 (정호님용)

1. 터미널(Windows는 PowerShell)을 엽니다.
2. 작업할 폴더로 가서 아래를 붙여 넣습니다.
   ```
   git clone https://github.com/kinjungho-sudo/second-brain.git
   cd second-brain
   claude
   ```
3. Claude Code가 열리면: `HANDOFF.md 읽고 이어서 하자`

PC의 Claude Code에 Supabase 연결이 필요하면 Claude Code에게 "Supabase MCP 연결해줘"라고 하세요.
(공식 Supabase MCP, 프로젝트 ID는 아래 표에 있습니다.)

---

## 2. 지금 있는 것

| 무엇 | 어디 | 비고 |
|---|---|---|
| 코드 | GitHub `kinjungho-sudo/second-brain` (main) | 빌드 없는 정적 사이트 |
| 배포된 웹 앱 | https://second-brain-phi-seven.vercel.app | Vercel 프로젝트 `prj_DLEt4wC0pRa0uzjo67BPVEzPcxx0`, main에 올리면 자동 배포 |
| 데이터 | Supabase project2 (`xsfriegbpygydcqhsqqq`) | `brain_` 로 시작하는 테이블. 다른 연습 앱 데이터와 섞여 있음 (정호님이 나중에 한꺼번에 지울 예정) |
| AI 에이전트용 MCP 서버 | Supabase Edge Function `brain-mcp` | 코드: `supabase/functions/brain-mcp/index.ts` |
| 에이전트용 스킬 | `agents/second-brain-wiki/SKILL.md` | |

DB 데이터
- 보관함 "Second Brain" (`d5be1c14-f988-48ba-acf3-507baae764ca`) — 소유자 김정호 (`d4f2c014-e4a7-43f0-9821-fb0e7d2cf954`), kinjungho@gmail.com. sinergy119@gmail.com(김재한) 초대 대기 중.
- 보관함 "LLM 위키 시연" (`547ff5a8-6770-46b4-a84e-86e6cbf62f1e`) — 시연용. 필요 없으면 `archived_at` 을 채워 숨기면 됩니다. 시연 열쇠는 취소됨.
- 옛 `sb_` 테이블은 남아 있지만 쓰지 않습니다 (`supabase/legacy-sb-schema.sql`).

---

## 3. 정직한 현재 상태 (중요)

정호님이 원한 것은 **"Obsidian과 똑같은 제품 + 내 기능 하나"** 였습니다. 지금 만든 것은 그것이 아닙니다.

- REA 분석은 얕았습니다 (도구 호출 8번: 링크 색인, 백링크, 이름 변경 시 링크 갱신 정도). Obsidian 기능 전체 목록과 비교하지 않았습니다.
- 결과물은 **Obsidian을 닮은 웹 앱** 입니다. 노트가 PC의 `.md` 파일이 아니라 DB에 있고, 오프라인·플러그인·캔버스 등이 없습니다.
- 그 위에 보관함·초대·권한, AI 에이전트(MCP) 연결까지 붙어서 원래 요청에서 더 멀어졌습니다.
- Obsidian은 비공개 상용 소프트웨어라 코드를 가져다 "똑같이" 만들 수는 없습니다. 동작을 보고 다시 만드는 것까지만 가능합니다.

## 4. 추천하는 다음 방향 (정호님 결정 대기)

**진짜 Obsidian을 쓰고, 원하는 기능을 Obsidian 플러그인으로 만든다.**
- Obsidian 설치: https://obsidian.md (무료). 노트는 PC 폴더의 `.md` 파일.
- 원하는 기능이 "여럿이 함께 쓰기"라면: Obsidian 볼트 ↔ Supabase ↔ 다른 사람 볼트를 동기화하는 플러그인.
  - 이미 만든 DB 구조(`brain_vaults`, `brain_members`, 초대·권한 RPC, `brain_notes.version` 충돌 감지, `brain_revisions` 이력, `brain_invites` 초대)를 동기화 창고로 재사용할 수 있습니다.
  - 플러그인 산출물: `main.js`, `manifest.json`, `styles.css` → 볼트의 `.obsidian/plugins/<id>/` 에 넣고 설정에서 켜기.
- AI 에이전트 연동은 Obsidian 폴더를 직접 읽고 쓰는 지금 방식 그대로 쓰면 됩니다.

**아직 정호님 답을 받지 못한 질문:** "더하고 싶은 기능 하나가 '여럿이 함께 쓰기'가 맞나요?"

다른 길: 웹 앱을 유지하면서 REA로 Obsidian 기능 목록을 제대로 만들고 빠진 것을 채우기. (이 길로는 "똑같은 것"에 닿지 못함)

## 5. 남은 작은 일

- **가짜 끊긴 링크 5개**: `wiki-rules.js` 의 `DEFAULT_RULES` 안 예시 `[[페이지 제목]]` 등이 실제 링크로 집계되어 `find_problems` 에 끊긴 링크로 나옵니다. 예시를 백틱으로 감싸고, 링크 추출(DB 트리거)이 코드 구간을 건너뛰게 고치면 됩니다. MCP 서버 쪽 같은 규칙 문자열도 함께 수정.
- Codex / Hermes 설정 문구(`app.js` 의 `agentSetupGuide`)는 실제 연결로 검증하지 않았습니다.
- `enable_pg_net_for_testing` 마이그레이션으로 켠 pg_net 은 테스트용입니다 (클라우드 샌드박스에서 supabase.co 에 직접 접속할 수 없어 DB에서 MCP 서버를 호출하는 데 썼음). 로컬에서는 필요 없습니다.

## 6. 작업 방식 메모 (정호님 선호)

- 비개발자. 쉬운 말로, 결정할 것만 짧게.
- 이름 하드코딩 금지 (일반 제품으로 만들 것).
- 쓰는 용도: 사업/업무 + 공부/연구. 다른 사람도 함께 씀.
- 에이전트가 고친 내용은 승인 없이 바로 반영. 입력: 붙여넣은 글, 웹 주소, PDF.
