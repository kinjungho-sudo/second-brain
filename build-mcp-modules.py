# brain-mcp(Edge Function)이 앱과 같은 규칙을 쓰도록, 앱의 props.js / files.js / templates.js 에서 서버용 복사본을 만든다.
# 사용: python build-mcp-modules.py  (앱 모듈을 고친 뒤에 실행하고 brain-mcp를 다시 배포)
def cut(src, marker, dst, note):
    s = open(src, 'rb').read().decode('utf-8').replace('\r\n', '\n')
    out = s if marker is None else s[:s.index(marker)].rstrip('\n') + '\n'
    out = f"// [자동 생성] 앱의 {note} 에서 화면(브라우저) 코드를 뺀 서버용 복사본. 직접 고치지 말고 build-mcp-modules.py 로 다시 만든다.\n" + out
    open(dst, 'wb').write(out.encode('utf-8'))
d = 'supabase/functions/brain-mcp/'
cut('props.js', '// ---------- 화면 ----------', d + 'props.js', 'props.js')
cut('files.js', '// ![[그림.png|300]] 또는 |300x200', d + 'files.js', 'files.js')
cut('templates.js', None, d + 'templates.js', 'templates.js')
