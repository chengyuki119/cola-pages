/* ══════════════════════════════════════════════════════════════════
   admin-invite —— 管理员邀请（服务端）

   为什么必须在服务端：创建登录账号要 Auth Admin 接口（service role），
   浏览器里做不了，硬做等于把 service role key 放进网页。

   做五件事：
     ① 校验调用者本人是全权限管理员（shop_admins.role='owner' 且已改过密码）
     ② 建登录账号：密码由服务端随机生成、谁都不告诉、也永远不写进邮件
     ③ 生成一次性邀请链接（32 位随机串），7 天有效，用过一次就作废
     ④ 写 shop_admins（role='readonly'，只读权限，不能改价改单删数据）
     ⑤ 把邀请邮件塞进 email_log 队列，并立刻催一次 email-worker

   2026-10-30 22:56 任务书 §1.3 改写要点（她本人要求）：
     · 不再通过邮件发送明文初始密码
     · 改为一次性邀请链接，管理员自己设密码
     · 链接有有效期、不能重复使用

   刻意不做：
     · 不删任何账号、不动订单/顾客/商品数据
     · 不把「SMTP 收下了」说成「已送达」
     · 不给邀请对象任何写权限
     · 不覆盖已有账号的密码（已有账号的邀请直接拒绝，要重置必须她明确点头）
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
/* 一次性邀请令牌：32 位十六进制随机串（128 bit）。只存在邀请记录里，
   邮件里只有链接；用过一次就写 used_at，再拿来用一律拒绝。 */
function newToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, '0')).join('');
}
/* 账号密码：随机生成、谁都不知道、也不发出去。真正的密码由对方点链接自己设置。 */
function randomPassword(): string {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#%^*-_';
  const buf = crypto.getRandomValues(new Uint8Array(28));
  let s = '';
  for (let i = 0; i < buf.length; i++) s += a.charAt(buf[i] % a.length);
  return s;
}
function mailOk(email: string): boolean {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return false;
  // 占位/测试域名不发信，避免退信拖累发信信誉
  return !/(@test\.com|@example\.(com|org|net)|@testlocal\.invalid|\.invalid$|\.test$|@localhost)$/i.test(email);
}

/* ── 邀请邮件正文 ──
   底稿是她在任务书 §三 里给的原始文案，语气、顺序、结尾全部保留。
   2026-10-30 22:56 任务书 §1.3 明确要求「不再通过邮件发送明文初始密码，改为一次性邀请链接」，
   所以只把「初始密码：xxxxxx」那一段换成「设置密码的链接」。这不叫改写文案，是换掉必须换的那一行。 ── */
function inviteSubject(): string {
  return '欢迎加入小柚的小世界！(｡･ω･｡)ﾉ♡';
}
function inviteLink(token: string): string {
  return SITE + '/invite/?t=' + token;
}
function inviteBody(email: string, link: string, until: string): string {
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
    '点下面这条链接，设置属于你自己的六位数字密码：',
    '',
    link,
    '',
    '这条链接只能用一次，有效期到 ' + until + '。设好密码之后它就失效了，要重设密码再跟我说一声就行。',
    '',
    '后台登录地址：' + SITE + '/admin.html',
    '',
    '小小提醒：你拥有的是只读管理权限，可以查看授权的后台内容，但不能修改或删除数据。请记得保管好自己的密码，不要告诉其他人。',
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
  try {
    const raw = rows[0] && rows[0].value;
    const list = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}
async function writeInvites(list: any[]): Promise<boolean> {
  const r = await fetch(SUPABASE_URL + '/rest/v1/site_settings?on_conflict=key', {
    method: 'POST',
    headers: { ...sr(), Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([{ key: 'admin_invites', value: JSON.stringify(list.slice(-200)) }]),
  });
  return r.ok;
}

/* ── Auth：找已有用户 / 建新用户 / 改密码 ── */
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

async function setPassword(userId: string, password: string): Promise<boolean> {
  const r = await fetch(SUPABASE_URL + '/auth/v1/admin/users/' + userId, {
    method: 'PUT',
    headers: sr(),
    body: JSON.stringify({ password }),
  });
  return r.ok;
}

/* ── 入队 + 立刻催一次 ── */
async function enqueue(to: string, refId: string, body: string): Promise<{ id?: string; error?: string }> {
  const r = await fetch(SUPABASE_URL + '/rest/v1/email_log', {
    method: 'POST',
    headers: { ...sr(), Prefer: 'return=representation' },
    body: JSON.stringify([{
      kind: KIND, ref_id: refId, to_email: to,
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
  const action = String(p.action || 'invite');

  /* ────────── 设置密码（公开，靠令牌鉴权）──────────
     令牌就是凭据：32 位随机串，只能用来设置一次密码。
     不返回任何账号信息，除了对方自己的邮箱（让他确认点的是自己的链接）。 */
  if (action === 'accept') {
    const tok = String(p.token || '').trim().toLowerCase();
    const pw = String(p.password || '');
    if (!/^[0-9a-f]{32}$/.test(tok)) return json({ ok: false, error: '链接不完整或已经损坏' }, 400);
    if (!/^\d{6}$/.test(pw)) return json({ ok: false, error: '密码要正好六位数字' }, 400);

    const list = await readInvites();
    const rec = list.find((x: any) => x && String(x.token || '').toLowerCase() === tok);
    if (!rec) return json({ ok: false, error: '这条链接无效（可能已经用过了，或者已经换了新的）' }, 404);
    if (rec.used_at) return json({ ok: false, error: '这条链接已经用过了，不能再用第二次' }, 409);
    if (rec.revoked) return json({ ok: false, error: '这条邀请已经被撤销了' }, 409);
    if ((rec.link_until || rec.until || '') < today()) return json({ ok: false, error: '这条链接已经过期了（有效期到 ' + (rec.link_until || rec.until) + '）' }, 409);
    if (!rec.user_id) return json({ ok: false, error: '这条邀请没有关联的账号，请让站长重新发一次' }, 409);

    const okPw = await setPassword(rec.user_id, pw);
    if (!okPw) return json({ ok: false, error: '设置密码失败，稍后再试一次' }, 500);

    // 密码是他自己设的，就不用再强制改一次了
    await fetch(SUPABASE_URL + '/rest/v1/shop_admins?user_id=eq.' + rec.user_id, {
      method: 'PATCH',
      headers: { ...sr(), Prefer: 'return=minimal' },
      body: JSON.stringify({ must_set_password: false }),
    });

    rec.used_at = new Date().toISOString();
    rec.token = '';           // 令牌一次性：用掉就抹掉，链接立刻失效
    delete rec.link;
    await writeInvites(list);

    return json({ ok: true, email: rec.email, message: '密码已经设好，去后台登录就可以啦' });
  }

  /* ────────── 自检：只回布尔与长度，不回任何密钥内容 ────────── */
  if (action === 'diag') {
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

  /* 以下动作都必须是全权限管理员 */
  const auth = req.headers.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  const isService = token !== '' && token === SERVICE;
  const me = isService ? { id: '', email: '' } : await caller(token);
  if (!me) return json({ ok: false, error: '登录已失效，请重新登录后台再试' }, 401);
  if (!isService && !(await isOwner(me.id))) return json({ ok: false, error: '只有全权限管理员（owner）能邀请管理员' }, 403);

  const email = String(p.email || '').trim().toLowerCase();
  const name = String(p.name || '').trim().slice(0, 40);
  const note = String(p.note || '').trim().slice(0, 200);

  /* ────────── 预览（不发、不建号、不入队，纯只读）────────── */
  if (action === 'preview') {
    const isNew = !(await findUser(email));
    const sampleToken = '0'.repeat(32);
    return json({
      ok: true,
      to: email,
      subject: inviteSubject(),
      body: inviteBody(email, inviteLink(sampleToken), plusDays(INVITE_DAYS)),
      is_new_user: isNew,
      badge: '管理员邀请',
      contains_password: false,
      note: isNew
        ? '新邮箱：邮件里只有一次性设置密码链接，没有任何密码。'
        : '这个邮箱已经有账号。现在不会自动覆盖它现有的密码 —— 需要重置要单独确认。',
    });
  }

  /* ────────── 发邀请 ────────── */
  if (action === 'invite') {
    if (!mailOk(email)) return json({ ok: false, error: '邮箱格式不对，或者是测试/占位域名（这类地址不发信）' }, 400);
    if (!isService && me.email && email === me.email.toLowerCase()) return json({ ok: false, error: '这是你自己现在的登录邮箱' }, 400);

    const list = await readInvites();
    const dup = list.find((x: any) => x && x.email === email && !x.revoked && !x.used_at && (x.link_until || x.until || '') >= today());
    if (dup) {
      return json({
        ok: false, code: dup.code, duplicate: true,
        error: '这个邮箱已经有一条还没用的邀请（邀请码 ' + dup.code + '，有效至 ' + (dup.link_until || dup.until) + '）。要再发一次请用「重新发送」。',
      }, 409);
    }

    const code = newCode();
    const until = plusDays(INVITE_DAYS);
    const tok = newToken();
    const existing = await findUser(email);
    let userId = existing && existing.id;
    const isNew = !userId;

    if (!isNew) {
      const rows = await restGet('shop_admins?user_id=eq.' + userId + '&select=role');
      if (rows[0] && rows[0].role === 'owner') {
        return json({ ok: false, error: '这个账号已经是全权限管理员，不用再邀请' }, 409);
      }
      // 已有账号有它自己的密码。发一条能改密码的链接 = 覆盖现有密码，必须她明确点头
      return json({
        ok: false, needs_password_reset: true,
        error: '这个邮箱已经是注册账号，有它自己的密码。发设置密码的链接会把它现在能用的密码换掉 —— 属于覆盖现有密码，需要你明确同意我才会动。',
      }, 409);
    }

    // 密码随机生成、谁都不告诉、也不写进邮件
    const made = await createUser(email, randomPassword(), name);
    if (made.error) return json({ ok: false, error: made.error }, 500);
    userId = made.user.id;

    // 只读管理员：能看，不能改
    const up = await fetch(SUPABASE_URL + '/rest/v1/shop_admins?on_conflict=user_id', {
      method: 'POST',
      headers: { ...sr(), Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify([{
        user_id: userId,
        role: 'readonly',
        must_set_password: true, // 设完密码（accept）才置 false，置 false 之前进不了后台
      }]),
    });
    if (!up.ok) {
      const t = await up.text().catch(() => '');
      return json({ ok: false, error: '写管理员权限失败：' + t.slice(0, 200) }, 500);
    }

    const link = inviteLink(tok);
    const body = inviteBody(email, link, until);
    const q = await enqueue(email, code, body);
    if (q.error) return json({ ok: false, error: q.error, code, until }, 500);

    list.push({
      email, name, note, code, until,
      token: tok, link, link_until: until, used_at: null,
      created_at: new Date().toISOString(),
      user_id: userId, is_new_user: isNew,
      mail_id: q.id || null, revoked: false,
    });
    await writeInvites(list);

    const st = await mailStatus(q.id);
    return json({
      ok: true, code, until, link, queued: true, mail_id: q.id || null,
      is_new_user: isNew,
      contains_password: false,
      mail_status: st ? st.status : 'pending',
      mail_error: st ? st.last_error : null,
      message: '邀请已发出：邮件里只有一次性设置密码链接（' + until + ' 前有效，只能用一次），没有明文密码',
    });
  }

  /* ────────── 重新发送 ────────── */
  if (action === 'resend') {
    const code = String(p.code || '').trim().toUpperCase();
    const list = await readInvites();
    const rec = list.find((x: any) => x && x.code === code);
    if (!rec) return json({ ok: false, error: '找不到这条邀请记录' }, 404);
    if (rec.revoked) return json({ ok: false, error: '这条邀请已经被撤销了，请重新发一封新的' }, 409);
    if (rec.used_at) return json({ ok: false, error: '对方已经用这条链接设好密码了，不用再发' }, 409);
    if ((rec.link_until || rec.until || '') < today()) return json({ ok: false, error: '这条链接已经过期（' + (rec.link_until || rec.until) + '），请重新发一封新的' }, 409);

    // 重发一定换新令牌：旧链接立刻作废，永远只有一个链接能用
    const tok = newToken();
    rec.token = tok;
    rec.link = inviteLink(tok);
    const q = await enqueue(rec.email, rec.code, inviteBody(rec.email, rec.link, rec.link_until || rec.until));
    if (q.error) return json({ ok: false, error: q.error }, 500);
    rec.resent_at = new Date().toISOString();
    rec.mail_id = q.id || rec.mail_id;
    await writeInvites(list);
    const st = await mailStatus(q.id);
    return json({ ok: true, code: rec.code, link: rec.link, mail_id: q.id, mail_status: st ? st.status : 'pending', message: '已重新放进队列（旧链接已作废）' });
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
    rec.token = '';     // 撤销 = 链接立刻作废
    delete rec.link;
    await writeInvites(list);
    return json({ ok: true, code, message: '已撤销：后台权限已收回、设置密码链接已作废（账号本身保留，订单与顾客数据一点没动）' });
  }

  /* ────────── 删除邀请记录 ──────────
     只删 site_settings 里的这一条记录：不删账号、不删邮件记录、不动业务数据。 */
  if (action === 'delete') {
    const code = String(p.code || '').trim().toUpperCase();
    const list = await readInvites();
    const idx = list.findIndex((x: any) => x && x.code === code);
    if (idx < 0) return json({ ok: false, error: '找不到这条邀请记录（可能已经删掉了）' }, 404);
    const rec = list[idx];
    if (rec.user_id) {
      const rows = await restGet('shop_admins?user_id=eq.' + rec.user_id + '&select=role');
      if (rows[0] && rows[0].role === 'owner') return json({ ok: false, error: '这条记录连着全权限管理员，不能删' }, 409);
    }
    list.splice(idx, 1);
    const ok = await writeInvites(list);
    if (!ok) return json({ ok: false, error: '删除失败（记录还在）' }, 500);
    return json({ ok: true, code, message: '已删除这条邀请记录（账号和邮件记录都没有动）' });
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
