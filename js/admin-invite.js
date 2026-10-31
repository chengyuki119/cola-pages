/* ══════════════════════════════════════════════════════════════════
   admin-invite.js —— 管理员邀请 + 邮件链路自检（她 20261030 §4）
   背景（实测结论，详见 docs\20261031_管理员邀请邮件故障分析.md）：
     · 站内原本没有任何「管理员邀请邮件」功能，只有「晒单邀请」模板；
       她看到的「已发送」来自别处（Supabase 控制台 / auth 邀请接口 200），
       而 200 只代表接口收下了请求，不代表邮件投递成功。
     · 本项目自带邮件链路是 email_log 队列 → pg_cron → email-worker → Gmail SMTP。
       worker 只有 SMTP 收下后才把状态写成 sent，所以 sent = 服务商已接受，不是已送达。
   这个文件做两件事：
     1）真的能发管理员邀请：写 email_log 队列（同一条链路），邀请码与有效期存 site_settings.admin_invites；
     2）把 email_log 的真实状态如实摆出来，并做只读链路自检。
   不新建表、不改数据库结构、不发营销邮件、不把「接口 200」说成「已送达」。
   ══════════════════════════════════════════════════════════════════ */
(function () {
  var SUPABASE_URL = window.SUPABASE_URL || 'https://ukxrvcptwhlwvdanovgd.supabase.co';
  var KIND = 'admin_invite';
  var ST_LABEL = {
    pending: ['待发送', '#E0A458'],
    sending: ['发送中', '#B98598'],
    sent: ['服务商已接受（无投递回执）', '#5FA777'],
    delivered: ['投递成功（有回执）', '#5FA777'],
    failed: ['发送失败（将重试）', '#E0A458'],
    dead: ['发送失败（已停止重试）', '#C4636E'],
    bounced: ['已退信', '#C4636E']
  };
  function label(s) { return ST_LABEL[s] || ['未知状态：' + s, '#81717A']; }
  function stamp(s) {
    if (!s) return '';
    var d = new Date(s);
    if (isNaN(d.getTime())) return String(s);
    return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  }
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 3 | 8)).toString(16);
    });
  }
  function daysFromNow(n) {
    var d = new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }

  function inviteBody(name, code, until) {
    var who = name || '你好';
    return [
      'Hi ' + who + '，',
      '',
      '小柚（Snow Yuzu）想请你也成为这个小小店铺的后台管理员 ♡',
      '',
      '邀请码：' + code,
      '有效期到：' + until,
      '',
      '怎么接受邀请：',
      '1) 打开 https://yukicheng.com/account/ ，用这个邮箱注册一个账号；',
      '2) 注册好之后，把上面的邀请码发给小柚；',
      '3) 小柚会在后台把这个账号设为管理员，之后你就可以登录后台了。',
      '',
      '如果不是你本人要申请，忽略这封信就好，邀请码会在有效期后自动作废。',
      '',
      '— Snow Yuzu 的小店主 ♡'
    ].join('\n');
  }

  function boot() {
    var sendBtn = document.getElementById('inv-send');
    if (!sendBtn || sendBtn.dataset.booted) { loadList(); return; }
    sendBtn.dataset.booted = '1';
    sendBtn.addEventListener('click', sendInvite);
    var diag = document.getElementById('mail-diag-run');
    if (diag) diag.addEventListener('click', runDiag);
    loadList();
  }

  function sendInvite() {
    var emailEl = document.getElementById('inv-email');
    var nameEl = document.getElementById('inv-name');
    var btn = this;
    var email = (emailEl.value || '').trim();
    var name = (nameEl.value || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast('邮箱格式不对，检查一下'); return; }
    if (!window.confirm('给 ' + email + ' 发管理员邀请邮件？\n\n· 会真的进发信队列（对方能不能收到，之后看下面的真实状态）\n· 邀请码 7 天内有效')) return;
    btn.disabled = true; btn.textContent = '正在入队…';
    var code = 'YUKI-' + uuid().slice(0, 8).toUpperCase();
    var until = daysFromNow(7);
    var row = {
      kind: KIND,
      ref_id: code,
      to_email: email,
      subject: 'Snow Yuzu 后台管理员邀请 ♡（邀请码 ' + code + '）',
      body: inviteBody(name, code, until)
    };
    // 入队优先走受信任接口：SQL 跑过之后 email_log 只接受服务端/受信任 RPC 写入，
    // 匿名和普通登录态直写都会被 RLS 挡（42501）。函数还没建时退回直写队列，兼容旧库。
    api('rpc/shop_mail_enqueue', {
      method: 'POST',
      body: JSON.stringify({ p_kind: row.kind, p_to: row.to_email, p_subject: row.subject, p_body: row.body, p_ref: row.ref_id })
    })
      .then(function (r) { if (!r.ok) throw new Error('rpc'); return r.json(); })
      .then(function (id) { return [{ id: id }]; })
      .catch(function () {
        return api('email_log', { method: 'POST', headers: { 'Prefer': 'return=representation' }, body: JSON.stringify(row) })
          .then(function (r) {
            if (!r.ok) throw new Error('queue');
            return r.json().catch(function () { return []; });
          });
      })
      .then(function (rows) {
        var id = rows && rows[0] && rows[0].id;
        return saveInviteRecord({ id: id, email: email, name: name, code: code, until: until, created_at: new Date().toISOString() });
      })
      .then(function (okRec) {
        toast('邀请已进发信队列' + (okRec ? '，邀请码 ' + code : '（邀请码 ' + code + '，但邀请码记录没存上，请抄下来）'));
        emailEl.value = ''; nameEl.value = '';
        loadList();
      })
      .catch(function () { toast('入队失败：没有发信权限或网络问题，没发出去就是没发出去'); })
      .then(function () { btn.disabled = false; btn.textContent = '发出邀请'; });
  }

  function saveInviteRecord(rec) {
    return api('site_settings?select=value&key=eq.admin_invites').then(function (r) { return r.json(); })
      .then(function (rows) {
        var list = [];
        if (rows && rows[0] && rows[0].value) { try { list = JSON.parse(rows[0].value) || []; } catch (e) { list = []; } }
        list.push(rec);
        return api('site_settings?on_conflict=key', {
          method: 'POST', headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify([{ key: 'admin_invites', value: JSON.stringify(list.slice(-100)) }])
        }).then(function (r) { return r.ok; });
      })
      .catch(function () { return false; });
  }

  function loadList() {
    var box = document.getElementById('inv-list');
    if (!box) return;
    var want = [KIND, 'invite', 'admin_invite', 'auth_invite'];
    api('email_log?select=kind,ref_id,to_email,subject,status,attempts,created_at,sent_at&order=created_at.desc&limit=200')
      .then(function (r) { return r.json(); })
      .then(function (rows) {
        rows = (Array.isArray(rows) ? rows : []).filter(function (m) { return want.indexOf(m.kind) !== -1; });
        var invites = [];
        api('site_settings?select=value&key=eq.admin_invites').then(function (r) { return r.json(); })
          .then(function (s) {
            try { invites = JSON.parse((s && s[0] && s[0].value) || '[]') || []; } catch (e) { invites = []; }
          }).catch(function () {})
          .then(function () { paint(box, rows, invites); });
      })
      .catch(function () {
        box.innerHTML = '<p style="color:#C4636E;font-size:14px;">读不到发信记录：登录状态失效，或 email_log 权限不允许这个账号读。这不是「没发过」，是「看不到」。</p>';
      });
  }

  function paint(box, rows, invites) {
    if (!rows.length) {
      box.innerHTML = '<p style="color:#81717A;font-size:14px;margin:0 0 8px;">队列里没有管理员邀请记录。</p>' +
        '<p style="color:#81717A;font-size:13px;margin:0;">如果你之前在别处点过「发送邀请」并看到成功提示，那说明那封邀请**不是**从这里发出去的 —— 站内原本没有这个功能，这也正是收不到的原因之一。</p>';
    } else {
      box.innerHTML = rows.map(function (m) {
        var l = label(m.status);
        var inv = (invites || []).filter(function (x) { return x && (x.code === m.ref_id || (m.subject || '').indexOf(x.code) >= 0); })[0];
        return '<div style="padding:9px 0;border-bottom:1px dashed #FFE3EC;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">' +
          '<span style="flex:1;min-width:220px;"><b>' + esc(m.to_email) + '</b>' +
            (inv ? ' <span style="font-size:12px;color:#81717A;">邀请码 ' + esc(inv.code) + ' · 有效至 ' + esc(inv.until) + '</span>' : '') + '</span>' +
          '<span style="font-size:12px;color:#fff;background:' + l[1] + ';border-radius:999px;padding:2px 10px;white-space:nowrap;">' + esc(l[0]) + '</span>' +
          '<span style="font-size:13px;color:#81717A;min-width:120px;text-align:right;">' + esc(stamp(m.sent_at || m.created_at)) + '</span>' +
          (m.last_error ? '<div style="width:100%;font-size:13px;color:#C4636E;">上次错误：' + esc(m.last_error) + '</div>' : '') +
          '</div>';
      }).join('');
    }
    box.innerHTML += '<p style="color:#81717A;font-size:13px;line-height:1.8;margin:10px 0 0;">' +
      '状态含义：待发送 / 发送中 = 还在队列里；<b>服务商已接受</b> = Gmail SMTP 收下了这封信（没有投递回执，不能当「已送达」）；' +
      '发送失败 = 会被重试；已停止重试 / 已退信 = 需要看下面的错误原因。</p>';
  }

  /* ── 只读链路自检 ── */
  function runDiag() {
    var box = document.getElementById('mail-diag');
    var btn = document.getElementById('mail-diag-run');
    if (!box) return;
    if (btn) { btn.disabled = true; btn.textContent = '自检中…'; }
    box.innerHTML = '<p style="color:#81717A;font-size:14px;">正在检查…</p>';
    var out = [];
    var done = function () {
      box.innerHTML = '<div style="border:1.5px solid #FFE3EC;border-radius:12px;padding:12px 14px;background:#FFF7FA;font-size:14px;line-height:1.9;color:#55464E;">' +
        out.join('') + '</div>';
      if (btn) { btn.disabled = false; btn.textContent = '邮件链路自检'; }
    };
    var line = function (ok, txt) {
      out.push('<div>' + (ok === true ? '✅ ' : ok === false ? '❌ ' : '• ') + txt + '</div>');
    };

    // ① worker 可达性（浏览器读不到跨域函数的真实状态码，只能做可达探测）
    var workerUrl = SUPABASE_URL + '/functions/v1/email-worker';
    var p1 = fetch(workerUrl, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body: 'diag' })
      .then(function () {
        line(null, '邮件 Worker 地址可达；但浏览器读不到它的真实状态码（Supabase 函数不回 CORS 头），所以「它到底有没有在干活」不能靠这里判断，得看下面队列是不是在动。');
      })
      .catch(function () { line(false, '连不上邮件 Worker（网络或域名层面就不通）'); });

    // ② 队列状态
    var p2 = api('email_log?select=status,kind,created_at,sent_at&order=created_at.desc&limit=200')
      .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
      .then(function (rows) {
        rows = Array.isArray(rows) ? rows : [];
        var c = {};
        rows.forEach(function (m) { c[m.status || '?'] = (c[m.status || '?'] + 1) || 1; });
        var pend = rows.filter(function (m) { return m.status === 'pending' || m.status === 'sending'; });
        var oldest = pend.length ? pend[pend.length - 1].created_at : null;
        var sentRows = rows.filter(function (m) { return m.status === 'sent' && m.sent_at; });
        line(true, '最近 ' + rows.length + ' 封的状态分布：' + Object.keys(c).map(function (k) { return (label(k)[0]) + ' ' + c[k]; }).join(' · '));
        if (pend.length) {
          var waited = oldest ? (Date.now() - new Date(oldest).getTime()) : null;
          var ago = '';
          if (waited != null) {
            ago = waited < 3600000 ? Math.max(1, Math.round(waited / 60000)) + ' 分钟' : Math.round(waited / 3600000) + ' 小时';
          }
          line(waited != null && waited < 600000, '有 ' + pend.length + ' 封还在队列里' + (ago ? '，最老一封等了 ' + ago : '') +
            (waited != null && waited >= 600000 ? '。超过 10 分钟没动 = 定时任务没在跑，或 Worker 拿不到信封。' : '（刚入队，正常）'));
        } else {
          line(true, '队列没有积压（没有待发送/发送中的信）');
        }
        if (sentRows.length) line(null, '最近一次被服务商接受：' + stamp(sentRows[0].sent_at));
      })
      .catch(function () { line(false, '读不到 email_log（未登录 / 权限不足）→ 这一项无法判断'); });

    // ③ SMTP 配置无法从浏览器读取，如实说明
    Promise.all([p1, p2]).then(function () {
      line(null, '<b>只能你确认的项</b>：Supabase 项目里 SMTP_USER（snowyuzustudio@gmail.com）与 SMTP_PASS（Gmail 应用专用密码）是否还在有效状态；Gmail 应用密码失效时 SMTP 会直接拒登，队列会一直是「待发送」，而页面完全看不出。');
      line(null, '另外：如果邀请是在 Supabase 控制台发的，那条链路用的是 Supabase 自带邮件服务 —— 未配置自定义 SMTP 时只能投给项目成员，普通邮箱会被静默丢掉，但控制台照样显示已发送。');
      done();
    });
  }

  window.AdminInvite = { boot: boot, runDiag: runDiag, _label: label };
  function onReady() {
    var sendBtn = document.getElementById('inv-send');
    if (sendBtn && sendBtn.offsetParent !== null) boot();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', onReady);
  else setTimeout(onReady, 800);
})();
