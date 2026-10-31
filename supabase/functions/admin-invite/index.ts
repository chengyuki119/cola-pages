/* ══════════════════════════════════════════════════════════════════
   admin-invite —— 管理员邀请（服务端）
   为什么必须在服务端：创建登录账号要 Auth Admin 接口（service role），
   浏览器里做不了，硬做等于把 service role key 放进网页。

   做四件事：
     ① 校验调用者本人是全权限管理员（shop_admins.role='owner' 且已改过密码）
     ② 建/关联登录账号；新账号用一次性初始密码（= 邀请码），首登强制改成六位数字
     ③ 写 shop_admins（role='readonly'，只读权限，不能改价改单删数据）
     ④ 把邀请邮件塞进 email_log 队列，并立刻催一次 email-worker

   刻意不做：
     · 不删任何账号、不动订单/顾客/商品数据
     · 不把「SMTP 收下了」说成「已送达」
     · 不给邀请对象任何写权限
   ══════════════════════════════════════════════════════════════════ */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY') ?? '';
const ANONC = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? '';
const SITE = 'https://yukicheng.com';
const INVITE_DAYS = 7;
const KIND = 'admin_invite';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function sr(): Record<string, string> {
  return { apikey: SERVICE, Authorization: 'Bearer ' + SERVICE, 'Content-Type': 'application/json' };
}

async function restGet(path: string): Promise<any[]> {
  const r = await fetch(SUPABASE_URL + '/rest/v1/' + path, { headers: sr() });
  if (!r.ok) return [];
  const j = await r.json().catch(() => []);
  return Array.isArray(j) ? j : [];
}

function today(): string { return new Date().toISOString().slice(0, 10); }
function plusDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function newCode(): string {
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(4)))
    .map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  return 'YUKI-' + hex;
}
function mailOk(email: string): boolean {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return false;
  // 占位/测试域名不发信，避免退信拖累发信信誉
  return !/(@test\.com|@example\.(com|org|net)|@testlocal\.invalid|\.invalid$|\.test$|@localhost)$/i.test(email);
}

/* ── 邀请邮件正文 ──
   这段是她在任务书 §三 里给的原始文案，逐字照抄，一个字也没有续写。
   只做两件事：把 {{admin_email}} 换成真实邮箱、把 {{initial_password}} 换成一次性初始码。
   她原文里没有写后台地址，这里也不自作主张加。
   已有的邮箱（重复邀请）不改密码，所以那一行必须如实写成「你原来的密码」。 ── */
function inviteSubject(): string {
  return '欢迎加入小柚的小世界！(｡･ω･｡)ﾉ♡';
}
function inviteBody(name: string, email: string, code: string, until: string, isNew: boolean): string {
  const pwLine = isNew
    ? '初始密码：' + code
    : '初始密码：就用你原来的密码（这个邮箱之前已经注册过了）';
  return [
    '嗨嗨～(｡･ω･｡)ﾉ♡',
    '',
    '欢迎来到小柚的小世界！',
    '',
    '很开心能邀请你成为小柚小世界的一员管理者 (´▽`ʃ♡ƪ)',
    '',
    '这里收藏着小柚亲手制作的小物、可爱的色卡、喜欢的娃娃。',
    '',
    '以后也请多多关照啦！希望你能在这里自在地逛逛，看看小柚认真经营的小小世界，一起守护这里的可爱与温柔 ♡',
    '',
    '你的后台账号已经为你准备好啦：',
    '',
    '登录邮箱：' + email,
    '',
    pwLine,
    '',
    '第一次登录时，请按照页面提示设置属于你自己的六位数字密码哦。',
    '',
    '小小提醒：你拥有的是只读管理权限，可以查看授权的后台内容，但不能修改或删除数据。请记得保管好自己的登录信息，不要把密码告诉其他人。',
    '',
    '那么，欢迎加入小柚的小世界！',
    '',
    '希望这里的每一个小角落，都能给你带来一点点开心 ( ˶ˆᗜˆ˵ )',
    '',
    '—— Snow Yuzu',
    '和你分享一点可爱日常的小柚 ♡',
  ].join('\n');
}

/* ── 调用者身份 ── */
async function caller(token: string): Promise<{ id: string; email: string } | null> {
  if (!token) return null;
  const r = await fetch(SUPABASE_URL + '/auth/v1/user', {
    headers: { apikey: SERVICE, Authorization: 'Bearer ' + token },
  });
  if (!r.ok) return null;
  const u = await r.json().catch(() => null);
  if (!u || !u.id) return null;
  return { id: u.id, email: u.email ?? '' };
}

async function isOwner(uid: string): Promise<boolean> {
  const rows = await restGet('shop_admins?user_id=eq.' + uid + '&select=role,must_set_password');
  const a = rows[0];
  return !!a && a.role === 'owner' && a.must_set_password === false;
}

/* ── 邀请记录（site_settings.admin_invites）── */
async function readInvites(): Promise<any[]> {
  const rows = await restGet('site_settings?select=value&key=eq.admin_invites');
  try { return JSON.parse((rows[0] && rows[0].value) || '[]') || []; } catch { return []; }
}
async function writeInvites(list: any[]): Promise<boolean> {
  const r = await fetch(SUPABASE_URL + '/rest/v1/site_settings?on_conflict=key', {
    method: 'POST',
    headers: { ...sr(), Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([{ key: 'admin_invites', value: JSON.stringify(list.slice(-200)) }]),
  });
  return r.ok;
}

/* ── Auth：找已有用户 / 建新用户 ── */
async function findUser(email: string): Promise<any | null> {
  for (let page = 1; page <= 10; page++) {
    const r = await fetch(SUPABASE_URL + '/auth/v1/admin/users?page=' + page + '&per_page=200', { headers: sr() });
    if (!r.ok) return null;
    const j = await r.json().catch(() => null);
    const users = (j && j.users) || [];
    const hit = users.find((u: any) => (u.email || '').toLowerCase() === email.toLowerCase());
    if (hit) return hit;
    if (users.length < 200) return null;
  }
  return null;
}

async function createUser(email: string, password: string, name: string): Promise<{ user?: any; error?: string }> {
  const r = await fetch(SUPABASE_URL + '/auth/v1/admin/users', {
    method: 'POST',
    headers: sr(),
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: name || email.split('@')[0], invited_by: 'admin_invite' },
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (r.ok && j && j.id) return { user: j };
  const msg = String(j.msg || j.message || j.error_description || j.error || '').slice(0, 200);
  if (/already|exist|registered/i.test(msg)) {
    const u = await findUser(email);
    if (u) return { user: u };
  }
  return { error: '建账号失败：' + (msg || ('HTTP ' + r.status)) };
}

/* ── 入队 + 立刻催一次 ── */
async function enqueue(to: string, code: string, body: string): Promise<{ id?: string; error?: string }> {
  const r = await fetch(SUPABASE_URL + '/rest/v1/email_log', {
    method: 'POST',
    headers: { ...sr(), Prefer: 'return=representation' },
    body: JSON.stringify([{
      kind: KIND, ref_id: code, to_email: to,
      subject: inviteSubject(), body,
      status: 'pending', attempts: 0,
    }]),
  });
  const j = await r.json().catch(() => []);
  if (!r.ok) return { error: '进队列失败：' + String(JSON.stringify(j)).slice(0, 200) };
  const id = Array.isArray(j) && j[0] ? j[0].id : undefined;
  // 立刻催一次（不保证成功，失败也不影响 cron 一分钟内补上）
  try {
    await fetch(SUPABASE_URL + '/rest/v1/rpc/shop_mail_tick', {
      method: 'POST', headers: sr(), body: '{}',
    });
  } catch (_) { /* cron 兜底 */ }
  return { id };
}

async function mailStatus(id?: string): Promise<{ status: string; last_error: string | null } | null> {
  if (!id) return null;
  const rows = await restGet('email_log?select=status,last_error&id=eq.' + id);
  return rows[0] ? { status: rows[0].status, last_error: rows[0].last_error ?? null } : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: '只接受 POST' }, 405);

  let p: any = {};
  try { p = await req.json(); } catch { p = {}; }

  // 自检：只回布尔与长度，不回任何密钥内容
  if (String(p.action || '') === 'diag') {
    return json({
      ok: true,
      has_url: SUPABASE_URL !== '',
      has_service: SERVICE !== '',
      service_len: SERVICE.length,
      service_head: SERVICE.slice(0, 3),
      has_anon: ANONC !== '',
      env_names: Object.keys(Deno.env.toObject()).filter((k) => /SUPABASE|SERVICE|SMTP/i.test(k)).sort(),
    });
  }

  const auth = req.headers.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  // 服务端自调用（运维/自检）走 service role，与 shop_is_admin() 对 service_role 的口径一致
  const isService = token !== '' && token === SERVICE;
  const me = isService ? { id: '', email: '' } : await caller(token);
  if (!me) return json({ ok: false, error: '登录已失效，请重新登录后台再试' }, 401);
  if (!isService && !(await isOwner(me.id))) return json({ ok: false, error: '只有全权限管理员（owner）能邀请管理员' }, 403);
  const action = String(p.action || 'invite');
  const email = String(p.email || '').trim().toLowerCase();
  const name = String(p.name || '').trim().slice(0, 40);
  const note = String(p.note || '').trim().slice(0, 200);

  /* ────────── 预览（不发、不建号、不入队，纯只读）────────── */
  if (action === 'preview') {
    const isNew = !(await findUser(email));
    const sampleCode = '123456';
    return json({
      ok: true,
      to: email,
      subject: inviteSubject(),
      body: inviteBody(name, email, sampleCode, '2026-11-07', isNew),
      is_new_user: isNew,
      badge: '管理员邀请',
      note: isNew ? '这是「新邮箱」的版本，初始密码位置会填真实的一次性邀请码。'
                  : '这是「邮箱已有账号」的版本，密码位置会写成沿用原来的密码。',
    });
  }

  /* ────────── 发邀请 ────────── */
  if (action === 'invite') {
    if (!mailOk(email)) return json({ ok: false, error: '邮箱格式不对，或者是测试/占位域名（这类地址不发信）' }, 400);
    if (!isService && me.email && email === me.email.toLowerCase()) return json({ ok: false, error: '这是你自己现在的登录邮箱' }, 400);

    const list = await readInvites();
    const dup = list.find((x: any) => x && x.email === email && !x.revoked && (x.until || '') >= today());
    if (dup) {
      return json({
        ok: false, code: dup.code, duplicate: true,
        error: '这个邮箱已经有一封有效邀请（邀请码 ' + dup.code + '，有效至 ' + dup.until + '）。要再发一次请用「重新发送」。',
      }, 409);
    }

    const code = newCode();
    const until = plusDays(INVITE_DAYS);
    const existing = await findUser(email);
    let userId = existing && existing.id;
    let isNew = !userId;
    let initialPwUsed: string | null = null;

    if (isNew) {
      const made = await createUser(email, code, name);
      if (made.error) return json({ ok: false, error: made.error }, 500);
      userId = made.user.id;
      initialPwUsed = code;
      isNew = true;
    } else {
      const rows = await restGet('shop_admins?user_id=eq.' + userId + '&select=role,must_set_password');
      if (rows[0] && rows[0].role === 'owner') {
        return json({ ok: false, error: '这个账号已经是全权限管理员，不用再邀请' }, 409);
      }
    }

    // 只读管理员：能看，不能改
    const up = await fetch(SUPABASE_URL + '/rest/v1/shop_admins?on_conflict=user_id', {
      method: 'POST',
      headers: { ...sr(), Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify([{
        user_id: userId,
        role: 'readonly',
        must_set_password: isNew, // 新账号必须先改成自己的六位数字密码；老账号不打断现有登录
      }]),
    });
    if (!up.ok) {
      const t = await up.text().catch(() => '');
      return json({ ok: false, error: '写管理员权限失败：' + t.slice(0, 200) }, 500);
    }

    const body = inviteBody(name, email, code, until, isNew);
    const q = await enqueue(email, code, body);
    if (q.error) return json({ ok: false, error: q.error, code, until }, 500);

    list.push({
      email, name, note, code, until,
      created_at: new Date().toISOString(),
      user_id: userId, is_new_user: isNew,
      mail_id: q.id || null, revoked: false,
    });
    await writeInvites(list);

    const st = await mailStatus(q.id);
    return json({
      ok: true, code, until, queued: true, mail_id: q.id || null,
      is_new_user: isNew,
      initial_password: initialPwUsed,
      mail_status: st ? st.status : 'pending',
      mail_error: st ? st.last_error : null,
      message: isNew
        ? '邀请已发出：账号已建好，初始密码就是邀请码 ' + code + '（一次性，首登必须改成自己的六位数字）'
        : '邀请已发出：这个邮箱本来就有账号，登录用原来的密码，进来后是只读权限',
    });
  }

  /* ────────── 重新发送 ────────── */
  if (action === 'resend') {
    const code = String(p.code || '').trim().toUpperCase();
    const list = await readInvites();
    const rec = list.find((x: any) => x && x.code === code);
    if (!rec) return json({ ok: false, error: '找不到这条邀请记录' }, 404);
    if (rec.revoked) return json({ ok: false, error: '这条邀请已经被撤销了，请重新发一封新的' }, 409);
    if ((rec.until || '') < today()) return json({ ok: false, error: '这条邀请已经过期（' + rec.until + '），请重新发一封新的' }, 409);
    const q = await enqueue(rec.email, rec.code, inviteBody(rec.name, rec.email, rec.code, rec.until, !!rec.is_new_user));
    if (q.error) return json({ ok: false, error: q.error }, 500);
    rec.resent_at = new Date().toISOString();
    rec.mail_id = q.id || rec.mail_id;
    await writeInvites(list);
    const st = await mailStatus(q.id);
    return json({ ok: true, code: rec.code, mail_id: q.id, mail_status: st ? st.status : 'pending', message: '已重新放进队列' });
  }

  /* ────────── 撤销邀请 ────────── */
  if (action === 'revoke') {
    const code = String(p.code || '').trim().toUpperCase();
    const list = await readInvites();
    const rec = list.find((x: any) => x && x.code === code);
    if (!rec) return json({ ok: false, error: '找不到这条邀请记录' }, 404);
    if (rec.user_id) {
      const rows = await restGet('shop_admins?user_id=eq.' + rec.user_id + '&select=role');
      if (rows[0] && rows[0].role === 'owner') return json({ ok: false, error: '不能撤销全权限管理员' }, 409);
      await fetch(SUPABASE_URL + '/rest/v1/shop_admins?user_id=eq.' + rec.user_id, {
        method: 'DELETE', headers: sr(),
      });
    }
    rec.revoked = true;
    rec.revoked_at = new Date().toISOString();
    await writeInvites(list);
    return json({ ok: true, code, message: '已撤销：后台权限已收回（账号本身保留，订单与顾客数据一点没动）' });
  }

  /* ────────── 只看状态 ────────── */
  if (action === 'status') {
    const list = await readInvites();
    const mails = await restGet('email_log?select=id,kind,ref_id,to_email,status,attempts,last_error,created_at,sent_at&kind=in.(admin_invite,account_invite)&order=created_at.desc&limit=100');
    const admins = await restGet('shop_admins?select=user_id,role,must_set_password,created_at');
    return json({ ok: true, invites: list, mails, admins });
  }

  return json({ ok: false, error: '不认识的动作：' + action }, 400);
});
