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

## 아직 안 된 것 (연동 빚)
| 항목 | 내용 |
|---|---|
| 보관함 여러 개 | 열쇠 1개 = 보관함 1개. 오피스에서 여러 보관함·팀을 쓰려면 보관함 목록·전환 도구 필요 |
| 로그인 방식 | 지금은 열쇠 붙여넣기. 직원 단위로는 OAuth(구글 로그인) 방식이 맞음 |
| 이벤트 | 에이전트가 변경을 구독(웹훅)하는 기능 없음 |
| 큰 파일 | 에이전트 업로드는 10MB까지(앱은 50MB). 더 크면 업로드 주소 방식 필요 |
| 템플릿 폴더 | 앱은 사용자별 설정, MCP는 Templates/템플릿 폴더 규칙. 보관함 공통 설정으로 통일 필요 |

## 새 기능을 만들 때 체크
1. 에이전트도 이 기능을 써야 하는가? → 그렇다면 MCP 도구를 같이 설계
2. 다른 프로젝트(오피스의 다른 부서·도구)가 이 데이터를 읽어야 하는가? → 안정적인 데이터 구조·API
3. 권한은 직원/에이전트/외부(컨설팅 고객) 구분이 되는가?
