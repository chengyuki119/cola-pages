// ══════════════════════════════════════════════════════════════════
// google-oauth：Snow Yuzu 测试站 Google 授权 + 联系人同步 + Gmail 自动分类
// - 鉴权：管理操作（start/status/sync/disconnect/filters）必须带后台登录 JWT
//   （supabase auth /auth/v1/user 验证 + 站长账号白名单）
// - OAuth 回调（Google 302 过来）：不带 JWT，靠一次性 state（10 分钟过期 + 用后即焚）验证
// - token 存储：public.google_tokens 表（RLS 无任何 policy，前端永远读不到；
//   只有本函数用 SERVICE_ROLE 读写），refresh_token 绝不进前端/日志
// - scope 最小化：
//     contacts                  —— 联系人读写（同步需要创建/更新）
//     gmail.settings.basic      —— 仅管理标签与过滤器（不读邮件内容）
//     userinfo.email            —— 识别连接的是哪个账号
// - 同步口径：仅 shop_customers.notify_birthday = true 且 email 非空的客户（明确同意过接收通知）
// - 幂等：先 list 现有联系人按邮箱精确匹配，已存在只补缺失字段，绝不重复创建
// ══════════════════════════════════════════════════════════════════

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') ?? '';
const CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '';
const ADMIN_EMAIL = 'chengyuki119@gmail.com';
const SITE = 'https://chengyuki119.github.io';
const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/google-oauth`;
const SCOPES = [
  'https://www.googleapis.com/auth/contacts',
  'https://www.googleapis.com/auth/gmail.settings.basic',
  'https://www.googleapis.com/auth/userinfo.email',
];

const CORS = {
  'Access-Control-Allow-Origin': SITE,
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
}
function redirect(url: string): Response {
  return new Response(null, { status: 302, headers: { Location: url } });
}

// ── 后台管理员验证 ──
async function requireAdmin(req: Request): Promise<boolean> {
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!jwt) return false;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${jwt}` },
    });
    if (!r.ok) return false;
    const u = await r.json();
    return (u?.email || '').toLowerCase() === ADMIN_EMAIL;
  } catch { return false; }
}

// ── site_settings 读写（service role）──
async function getSetting(key: string): Promise<Record<string, unknown> | null> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/site_settings?key=eq.${encodeURIComponent(key)}&select=value`, {
    headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` },
  });
  const rows = await r.json().catch(() => []);
  const raw = rows?.[0]?.value;
  if (!raw) return null;
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; }
}
async function setSetting(key: string, value: unknown): Promise<void> {
  await fetch(`${SUPABASE_URL}/rest/v1/site_settings`, {
    method: 'POST',
    headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ key, value }),
  });
}
async function delSetting(key: string): Promise<void> {
  await fetch(`${SUPABASE_URL}/rest/v1/site_settings?key=eq.${encodeURIComponent(key)}`, {
    method: 'DELETE',
    headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` },
  });
}

// ── google_tokens 表（RLS 全拒前端）──
interface TokenRow { refresh_token: string; account_email: string; scope: string; updated_at: string }
async function getToken(): Promise<TokenRow | null> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/google_tokens?provider=eq.google&select=refresh_token,account_email,scope,updated_at&limit=1`, {
    headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` },
  });
  const rows = await r.json().catch(() => []);
  return rows?.[0] || null;
}

async function refreshAccessToken(refresh: string): Promise<string> {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID, client_secret: CLIENT_SECRET, refresh_token: refresh, grant_type: 'refresh_token',
    }).toString(),
  });
  const j = await r.json();
  if (!r.ok || !j.access_token) throw new Error('token refresh failed: ' + (j.error || r.status));
  return j.access_token as string;
}

// ── Gmail 侧封装 ──
async function gmailGet(at: string, path: string): Promise<any> {
  const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, { headers: { Authorization: `Bearer ${at}` } });
  if (!r.ok) throw new Error('gmail ' + path + ': ' + r.status);
  return r.json();
}

// ═══════════════ 主入口 ═══════════════
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const url = new URL(req.url);
  const action = url.searchParams.get('action') || '';

  // ── 1) OAuth 回调（Google 302 过来，无 JWT，state 验证）──
  if (url.searchParams.get('code')) {
    const code = url.searchParams.get('code')!;
    const state = url.searchParams.get('state') || '';
    const err = url.searchParams.get('error');
    if (err) return redirect(`${SITE}/admin.html?oauth=error&msg=${encodeURIComponent(err)}`);
    const saved = await getSetting('google_oauth_state');
    await delSetting('google_oauth_state'); // 一次性，用后即焚
    if (!saved || saved.state !== state || Date.now() > (Number(saved.exp) || 0)) {
      return redirect(`${SITE}/admin.html?oauth=error&msg=${encodeURIComponent('state 校验失败（链接过期或重复使用），请回后台重新连接')}`);
    }
    try {
      const r = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET, redirect_uri: REDIRECT_URI,
          grant_type: 'authorization_code',
        }).toString(),
      });
      const j = await r.json();
      if (!r.ok || !j.refresh_token) {
        const m = j.error === 'invalid_grant' ? '授权码已使用或已过期，请重新连接' : 'Google 返回 ' + (j.error || r.status);
        return redirect(`${SITE}/admin.html?oauth=error&msg=${encodeURIComponent(m)}`);
      }
      // 取账号 email
      let email = '';
      try {
        const ui = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: `Bearer ${j.access_token}` } });
        email = (await ui.json())?.email || '';
      } catch { /* email 非关键，失败不阻断 */ }
      // 存表（merge：同 provider 一行，重授权覆盖）
      await fetch(`${SUPABASE_URL}/rest/v1/google_tokens`, {
        method: 'POST',
        headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({
          provider: 'google', refresh_token: j.refresh_token, account_email: email,
          scope: j.scope || SCOPES.join(' '), updated_at: new Date().toISOString(),
        }),
      });
      await setSetting('crm_sync', { enabled: true, oauth_done: true, account: email, updated: new Date().toISOString() });
      return redirect(`${SITE}/admin.html?oauth=ok&email=${encodeURIComponent(email)}`);
    } catch (e) {
      return redirect(`${SITE}/admin.html?oauth=error&msg=${encodeURIComponent(String(e?.message || e))}`);
    }
  }

  // ── 以下全部需要管理员 ──
  if (!(await requireAdmin(req))) return json({ error: '需要后台管理员登录' }, 401);

  // ── 2) status ──
  if (action === 'status') {
    const t = await getToken();
    return json({ connected: !!t, email: t?.account_email || '', scope: t?.scope || '', updated_at: t?.updated_at || '', configured: !!(CLIENT_ID && CLIENT_SECRET) });
  }

  // ── 3) start：生成 state → 返回授权跳转 URL ──
  if (action === 'start') {
    if (!CLIENT_ID || !CLIENT_SECRET) return json({ error: '后端 Google 凭据未配置（GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET）' }, 500);
    const state = crypto.randomUUID() + '.' + Date.now();
    await setSetting('google_oauth_state', { state, exp: Date.now() + 10 * 60 * 1000 });
    const auth = new URLSearchParams({
      client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, response_type: 'code',
      scope: SCOPES.join(' '), access_type: 'offline', prompt: 'consent', include_granted_scopes: 'false',
      state,
    });
    return json({ url: 'https://accounts.google.com/o/oauth2/v2/auth?' + auth.toString() });
  }

  // ── 4) disconnect：撤销+删 token ──
  if (action === 'disconnect') {
    const t = await getToken();
    if (t) {
      try { // 尽力撤销，撤销失败也删本地
        const at = await refreshAccessToken(t.refresh_token);
        await fetch('https://oauth2.googleapis.com/revoke?token=' + at, { method: 'POST' });
      } catch { /* ignore */ }
      await fetch(`${SUPABASE_URL}/rest/v1/google_tokens?provider=eq.google`, {
        method: 'DELETE', headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` },
      });
    }
    await setSetting('crm_sync', { enabled: false, oauth_done: false, updated: new Date().toISOString() });
    return json({ ok: true });
  }

  // ── 5) filters：Gmail 标签 + 过滤器一键创建（幂等）──
  if (action === 'filters') {
    const t = await getToken();
    if (!t) return json({ error: '尚未连接 Google 账号' }, 400);
    try {
      const at = await refreshAccessToken(t.refresh_token);
      // 现有标签
      const labels = await gmailGet(at, 'labels');
      const byName = new Map<string, string>((labels.labels || []).map((l: any) => [l.name, l.id]));
      const plan = [
        ['Snow Yuzu/订单', 'subject:("订单确认" OR "付款成功" OR "Order Confirmation" OR "Payment Confirmed")'],
        ['Snow Yuzu/发货', 'subject:("订单已发货" OR "Shipping Notification")'],
        ['Snow Yuzu/取消退款', 'subject:("退款通知" OR "订单已取消" OR "Refund" OR "Cancelled")'],
        ['Snow Yuzu/新品上架', 'subject:("新品上架" OR "New Arrival")'],
        ['Snow Yuzu/客户留言', 'subject:("客户留言" OR "New Message")'],
        ['Snow Yuzu/VIP会员', 'subject:("VIP")'],
      ];
      let created = 0; const detail: string[] = [];
      for (const [name, query] of plan) {
        if (!byName.has(name)) {
          const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels', {
            method: 'POST', headers: { Authorization: `Bearer ${at}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, labelListVisibility: 'labelShow', messageListVisibility: 'show' }),
          });
          const j = await r.json();
          if (!r.ok) { detail.push(name + ': 建标签失败 ' + (j.error?.message || r.status)); continue; }
          byName.set(name, j.id); created++;
        }
        const existingFilters = await gmailGet(at, 'settings/filters');
        const dup = (existingFilters.filter || []).some((f: any) => f.action?.addLabelIds?.includes(byName.get(name)) && (f.criteria?.query || '').includes(name.split('/')[1]));
        if (!dup) {
          const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/settings/filters', {
            method: 'POST', headers: { Authorization: `Bearer ${at}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ criteria: { query }, action: { addLabelIds: [byName.get(name)!], removeLabelIds: [] } }),
          });
          if (!r.ok) { const j = await r.json().catch(() => ({})); detail.push(name + ': 建过滤器失败 ' + (j.error?.message || r.status)); continue; }
          created++;
        }
      }
      return json({ ok: true, created, detail });
    } catch (e) {
      return json({ error: String(e?.message || e) }, 500);
    }
  }

  // ── 6) sync：联系人同步（dry=true 只统计不写入）──
  if (action === 'sync') {
    const t = await getToken();
    if (!t) return json({ error: '尚未连接 Google 账号' }, 400);
    let body: any = {};
    try { body = await req.json(); } catch { /* 默认 dry */ }
    const dry = body?.dry !== false;
    try {
      const at = await refreshAccessToken(t.refresh_token);
      // 同意口径：notify_birthday = true 且有邮箱
      const cr = await fetch(`${SUPABASE_URL}/rest/v1/shop_customers?notify_birthday=eq.true&email=not.is.null&select=name,email,phone,vip`, {
        headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` },
      });
      const customers: any[] = (await cr.json()).filter((c: any) => c.email && String(c.email).includes('@'));
      // Google 现有联系人（最多 1000）
      const existing = new Map<string, any>();
      let pageToken = '';
      for (let i = 0; i < 5; i++) {
        const u = new URL('https://people.googleapis.com/v1/people/me/connections');
        u.searchParams.set('personFields', 'names,emailAddresses,phoneNumbers');
        u.searchParams.set('pageSize', '200');
        if (pageToken) u.searchParams.set('pageToken', pageToken);
        const r = await fetch(u, { headers: { Authorization: `Bearer ${at}` } });
        if (!r.ok) throw new Error('People API list 失败 ' + r.status);
        const j = await r.json();
        for (const p of j.connections || []) {
          const em = (p.emailAddresses || []).map((e: any) => (e.value || '').toLowerCase());
          if (em.length) existing.set(em[0], p);
        }
        pageToken = j.nextPageToken || '';
        if (!pageToken) break;
      }
      // 分组：VIP / 回头客（同邮箱订单≥2）/ 普通客户
      const repeatSet = new Set<string>();
      const ordersR = await fetch(`${SUPABASE_URL}/rest/v1/shop_orders?select=customer_email`, {
        headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` },
      });
      if (ordersR.ok) {
        const counts = new Map<string, number>();
        for (const o of await ordersR.json()) {
          const em = (o.customer_email || '').toLowerCase();
          if (em) counts.set(em, (counts.get(em) || 0) + 1);
        }
        for (const [em, n] of counts) if (n >= 2) repeatSet.add(em);
      }
      // 确保分组存在
      async function ensureGroup(name: string, existingGroups: Map<string, string>): Promise<string> {
        if (existingGroups.has(name)) return existingGroups.get(name)!;
        const r = await fetch('https://people.googleapis.com/v1/contactGroups', {
          method: 'POST', headers: { Authorization: `Bearer ${at}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ contactGroup: { name } }),
        });
        const j = await r.json().catch(() => ({}));
        const id = j?.resourceName || '';
        existingGroups.set(name, id);
        return id;
      }
      let groupMap = new Map<string, string>();
      if (!dry) {
        const gr = await fetch('https://people.googleapis.com/v1/contactGroups?pageSize=100', { headers: { Authorization: `Bearer ${at}` } });
        const gj = await gr.json().catch(() => ({}));
        for (const g of gj.contactGroups || []) groupMap.set(g.name || '', g.resourceName || '');
      }

      let created = 0, updated = 0, skipped = 0;
      const preview: any[] = [];
      const groups = ['Snow Yuzu/普通客户', 'Snow Yuzu/VIP', 'Snow Yuzu/回头客'];
      for (const c of customers) {
        const em = String(c.email).toLowerCase();
        const groupKey = c.vip ? 'Snow Yuzu/VIP' : (repeatSet.has(em) ? 'Snow Yuzu/回头客' : 'Snow Yuzu/普通客户');
        const ex = existing.get(em);
        if (ex) {
          const hasName = (ex.names || []).some((n: any) => n.displayName);
          const hasPhone = (ex.phoneNumbers || []).some((p: any) => p.value);
          if (hasName && hasPhone) { skipped++; }
          else {
            updated++;
            if (!dry) {
              const body2: any = {};
              if (!hasName && c.name) body2.names = [{ givenName: c.name }];
              if (!hasPhone && c.phone) body2.phoneNumbers = [{ value: c.phone }];
              if (Object.keys(body2).length) {
                await fetch(`https://people.googleapis.com/v1/${ex.resourceName}:updateContact?updatePersonFields=${Object.keys(body2).join(',')}`, {
                  method: 'PATCH', headers: { Authorization: `Bearer ${at}`, 'Content-Type': 'application/json' },
                  body: JSON.stringify({ ...body2, etag: ex.etag }),
                });
              }
            }
          }
          // 分组补挂（dry 不写）
          if (!dry) {
            const gid = await ensureGroup(groupKey, groupMap);
            const cur = new Set((ex.memberships || []).map((m: any) => m.contactGroupMembership?.contactGroupId || m.contactGroupMembership?.contactGroupResourceName));
            if (gid && !cur.has(gid)) {
              await fetch(`https://people.googleapis.com/v1/${ex.resourceName}:modifyContactGroups`, {
                method: 'POST', headers: { Authorization: `Bearer ${at}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ membershipsToAdd: [{ contactGroupMembership: { contactGroupResourceName: gid } }] }),
              });
            }
          }
        } else {
          created++;
          if (preview.length < 8) preview.push({ email: em, name: c.name || '', group: groupKey });
          if (!dry) {
            const gid = await ensureGroup(groupKey, groupMap);
            const person: any = {
              names: [{ givenName: c.name || em.split('@')[0] }],
              emailAddresses: [{ value: c.email }],
            };
            if (c.phone) person.phoneNumbers = [{ value: c.phone }];
            if (gid) person.memberships = [{ contactGroupMembership: { contactGroupResourceName: gid } }];
            const r = await fetch('https://people.googleapis.com/v1/people:createContact', {
              method: 'POST', headers: { Authorization: `Bearer ${at}`, 'Content-Type': 'application/json' },
              body: JSON.stringify(person),
            });
            if (!r.ok) { created--; preview.push({ email: em, error: r.status }); }
          }
        }
      }
      return json({ ok: true, dry, total: customers.length, created, updated, skipped, preview, repeatCount: repeatSet.size });
    } catch (e) {
      const msg = String(e?.message || e);
      const m = msg.includes('401') || msg.includes('403') || msg.includes('invalid_grant')
        ? '授权已过期或被撤销，请断开后重新连接 Google 账号'
        : msg;
      return json({ error: m }, 500);
    }
  }

  return json({ error: '未知 action' }, 400);
});
