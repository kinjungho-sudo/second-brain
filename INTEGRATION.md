# 연동 원칙과 현황 (정호님 지정, 2026-10-17)

second-brain은 단독 앱이 아니라 **CoMindWorks "AI 에이전트 오피스"의 중추 두뇌**다.
직원과 AI 에이전트가 모든 데이터를 이곳을 통해 주고받는다. 그래서 새 기능을 만들 때마다 **연동 기반이 필요한지 먼저 본다.**

## 지금 연동 수단
| 수단 | 상태 |
|---|---|
| MCP 서버 `brain-mcp` (Supabase Edge Function, 열쇠 인증, 보관함 1개·사람 1명 권한) | 노트 읽기·쓰기·검색·이름변경·보관·점검 |
| DB 권한(RLS) | 보관함 멤버 단위 (소유자/편집자/읽기전용) |
| 실시간 반영 | 노트·폴더·멤버·첨부 |

## MCP 도구 (brain-mcp v3, 2026-10-17)
| 영역 | 도구 |
|---|---|
| 노트 | wiki_guide, list_notes, read_note, search_notes, write_note, rename_note, archive_note, recent_changes, find_problems |
| 속성 | get_properties, set_properties (글자·숫자·체크박스·날짜·날짜+시간·목록, null이면 삭제) |
| 템플릿 | list_templates, create_from_template (Templates/템플릿 폴더, {{title}} {{date}} {{time}} 채움) |
| 첨부 | list_attachments, get_attachment_url (1시간 임시 주소), add_attachment (base64, 10MB까지) |

- 앱과 같은 규칙: 서버가 앱의 props.js·files.js·templates.js 서버용 복사본을 쓴다 (`python build-mcp-modules.py` 로 다시 만들고 brain-mcp 재배포).
- **API 키 불필요**: 앱에는 LLM이 없다. 에이전트(Claude Code·Codex CLI 등)가 자기 구독(예: ChatGPT 요금제 로그인)으로 돌고, 보관함 열쇠(`sbw_…`)만으로 접속한다.
- 검증: Codex CLI(ChatGPT 로그인)로 `list_attachments` 실호출 성공 (`bearer_token_env_var` + `default_tools_approval_mode="approve"`).

## 로그인(OAuth) 연결 — brain-mcp v4 (2026-10-17)
- 에이전트에 주소만 넣으면 브라우저가 열리고 구글 로그인 → "허용" → 연결. 열쇠 복사 불필요.
- 구조: MCP 서버가 `WWW-Authenticate: Bearer resource_metadata=…` 로 안내 → Supabase Auth(OAuth 2.1, PKCE, 동적 클라이언트 등록)가 로그인·토큰 발급 → 앱의 `/oauth/consent` 화면에서 사용자가 허용 → 서버가 로그인 토큰으로 사용자를 확인.
- 보관함이 여러 개면 `list_vaults`, 각 도구의 `vault`(이름)로 고른다. 기본은 내가 만든 가장 오래된 보관함. (재한님은 자기 계정으로 로그인하면 자기 보관함, 공용 보관함은 멤버로 초대하면 같은 방식으로 보임)
- 열쇠 방식은 서버·자동화용으로 남겨 둠.
- **Supabase 대시보드 설정 필요**: Authentication → OAuth Server → 켜기, Authorization Path `/oauth/consent`, Allow Dynamic OAuth Apps 켜기.

## 아직 안 된 것 (연동 빚)
| 항목 | 내용 |
|---|---|
| 이벤트 | 에이전트가 변경을 구독(웹훅)하는 기능 없음 |
| 큰 파일 | 에이전트 업로드는 10MB까지(앱은 50MB). 더 크면 업로드 주소 방식 필요 |
| 템플릿 폴더 | 앱은 사용자별 설정, MCP는 Templates/템플릿 폴더 규칙. 보관함 공통 설정으로 통일 필요 |
| 접근 범위 | OAuth 토큰은 사용자 전체 권한(Supabase 사용자 정의 scope 미지원). 앱의 "연결된 에이전트"에서 끊을 수 있음 |

## 새 기능을 만들 때 체크
1. 에이전트도 이 기능을 써야 하는가? → 그렇다면 MCP 도구를 같이 설계
2. 다른 프로젝트(오피스의 다른 부서·도구)가 이 데이터를 읽어야 하는가? → 안정적인 데이터 구조·API
3. 권한은 직원/에이전트/외부(컨설팅 고객) 구분이 되는가?
