// 초대 메일 보내기 (Resend). 앱이 초대를 만든 직후 호출한다.
// 로그인한 사용자의 권한으로 초대 기록을 읽기 때문에 "그 보관함의 소유자"만 메일을 보낼 수 있다.
// 비밀 값(Supabase 함수 비밀): RESEND_API_KEY 또는 RESEND_KEY (필수), MAIL_FROM (선택, 예: "Second Brain <invite@도메인>"), APP_URL (선택)
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } });
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return reply({ error: 'POST only' }, 405);
  const auth = req.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) return reply({ error: 'login required' }, 401);

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } }, auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: u } = await sb.auth.getUser(auth.slice(7));
  if (!u?.user) return reply({ error: 'login required' }, 401);

  let invite_id = '';
  try { invite_id = String((await req.json()).invite_id || ''); } catch { /* */ }
  if (!/^[0-9a-f-]{36}$/i.test(invite_id)) return reply({ error: 'invite_id required' }, 400);

  // 소유자만 초대 기록을 읽을 수 있다 (RLS)
  const { data: inv } = await sb.from('brain_invites').select('id,email,role,vault_id,claimed_at,revoked_at,created_at').eq('id', invite_id).maybeSingle();
  if (!inv || inv.claimed_at || inv.revoked_at) return reply({ sent: false, reason: 'no_invite' }, 404);
  if (Date.now() - new Date(inv.created_at).getTime() > 10 * 60 * 1000) return reply({ sent: false, reason: 'too_old' }, 400); // 방금 만든 초대만
  const { data: vault } = await sb.from('brain_vaults').select('name').eq('id', inv.vault_id).maybeSingle();

  const key = (Deno.env.get('RESEND_API_KEY') || Deno.env.get('RESEND_KEY') || '').trim();
  if (!key) {
    // 진단: 비슷한 이름의 비밀 값이 있는지 이름만 알려 준다 (값은 절대 내보내지 않음)
    const names = Object.keys(Deno.env.toObject()).filter((k) => /resend|mail|api_?key/i.test(k));
    return reply({ sent: false, reason: 'not_configured', seen: names });
  }

  const appUrl = Deno.env.get('APP_URL') || 'https://second-brain-phi-seven.vercel.app';
  const from = Deno.env.get('MAIL_FROM') || 'Second Brain <onboarding@resend.dev>';
  const who = String(u.user.user_metadata?.full_name || u.user.user_metadata?.name || u.user.email);
  const vname = vault?.name || 'Second Brain';
  const role = inv.role === 'viewer' ? '읽기 전용' : '편집자';
  const html = `<div style="font-family:sans-serif;max-width:480px;line-height:1.6">
<h2 style="margin:0 0 12px">${esc(who)}님이 "${esc(vname)}" 보관함에 초대했습니다</h2>
<p>권한: <b>${role}</b></p>
<p>아래 버튼을 눌러 <b>${esc(inv.email)}</b> 구글 계정으로 로그인하면 초대가 보입니다. "수락"을 누르면 함께 쓸 수 있습니다.</p>
<p><a href="${esc(appUrl)}" style="display:inline-block;background:#7c3aed;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Second Brain 열기</a></p>
<p style="color:#888;font-size:12px">이 메일을 요청하지 않았다면 무시하셔도 됩니다.</p></div>`;

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from, to: [inv.email], subject: `[Second Brain] ${who}님이 "${vname}" 보관함에 초대했습니다`, html }),
  });
  const out = await r.json().catch(() => ({}));
  console.log('resend', r.status, JSON.stringify(out).slice(0, 200));
  if (!r.ok) return reply({ sent: false, reason: 'resend_error', detail: String(out?.message || r.status) }, 200);
  return reply({ sent: true, id: out?.id });
});
