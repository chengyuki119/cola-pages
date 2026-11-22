/* ══════════════════════════════════════════════════════════════════
   admin-invite.js —— 管理员邀请（前台）
   真正的活儿在 Edge Function：supabase/functions/admin-invite/index.ts
     · 建/关联登录账号（一次性初始密码 = 邀请码，首登必须改成六位数字）
     · 写 shop_admins（role='readonly'，只能看，不能改写任何东西）
     · 把邀请信塞进 email_log 队列，并立刻催一次 email-worker
   这个文件只做三件事：调它、把真实状态摆出来、给它重试/撤销的按钮。
   刻意不做：不把「SMTP 收下了」说成「已送达」；不自己拼密码；不直接写库。
   ══════════════════════════════════════════════════════════════════ */
(function () {
  var SUPABASE_URL = window.SUPABASE_URL || 'https://ukxrvcptwhlwvdanovgd.supabase.co';
  var FN = SUPABASE_URL + '/functions/v1/admin-invite';

  var ST_LABEL = {
    pending:  ['待发送', '#E0A458'],
    sending:  ['发送中', '#B98598'],
    sent:     ['服务商已接受（无投递回执）', '#5FA777'],
    delivered:['投递成功（有回执）', '#5FA777'],
    failed:   ['发送失败（将重试）', '#E0A458'],
    dead:     ['发送失败（已停止重试）', '#C4636E'],
    bounced:  ['已退信', '#C4636E']
  };
  function label(s) { return ST_LABEL[s] || ['未知状态：' + (s || '空'), '#897783']; }
  function stamp(s) {
    if (!s) return '';
    var d = new Date(s);
    if (isNaN(d.getTime())) return String(s);
    return d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function toastMsg(t) {
    if (typeof toast === 'function') { try { toast(t); return; } catch (e) {} }
    alert(t);
  }

  function token() { return (typeof window.ACCESS === 'string' && window.ACCESS) ? window.ACCESS : ''; }

  function fnCall(payload) {
    var t = token();
    if (!t) return Promise.resolve({ ok: false, error: '登录状态丢了，重新登录一下后台' });
    return fetch(FN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + t },
      body: JSON.stringify(payload || {})
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!j || typeof j !== 'object') j = { ok: r.ok };
        if (j.ok === undefined) j.ok = r.ok;
        if (!j.error && !r.ok) j.error = 'HTTP ' + r.status;
        return j;
      });
    }).catch(function (e) {
      return { ok: false, error: '连不上邀请服务：' + (e && e.message ? e.message : '网络错误') };
    });
  }

  /* ── 邀请记录的读写（直连 site_settings；只有登录的管理员能写）── */
  function restApi(path, options) {
    if (typeof window.api === 'function') return window.api(path, options);
    var t = token();
    var headers = { 'Content-Type': 'application/json' };
    if (window.SUPABASE_ANON_KEY) headers.apikey = window.SUPABASE_ANON_KEY;
    if (t) headers.Authorization = 'Bearer ' + t;
    return fetch(SUPABASE_URL + '/rest/v1/' + path, {
      method: (options && options.method) || 'GET',
      headers: headers,
      body: options && options.body ? options.body : undefined
    });
  }

  function readInvites() {
    return restApi('site_settings?select=value&key=eq.admin_invites')
      .then(function (r) { return r.json(); })
      .then(function (rows) {
        var raw = rows && rows[0] ? rows[0].value : '[]';
        var list;
        try { list = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { list = []; }
        return Array.isArray(list) ? list : [];
      });
  }

  function writeInvites(list) {
    return restApi('site_settings?on_conflict=key', {
      method: 'POST',
      body: JSON.stringify([{ key: 'admin_invites', value: JSON.stringify(list) }])
    });
  }

  /* ── 删除单条邀请记录（两次确认；只删这一行记录，不碰账号、邮件记录、订单）── */
  function deleteInvite(code, email, accTxt) {
    if (!window.confirm('删除这条邀请记录？\n\n邮箱：' + (email || '—') + '\n邀请码：' + code + (accTxt ? '\n账号：' + accTxt : '') +
      '\n\n只会从这张列表里删掉这一条。')) return;
    var warn = '';
    if (accTxt && /可用|等对方/.test(accTxt)) warn = '\n\n⚠ 这个邮箱现在仍然有后台权限。删掉记录后，你在列表里就看不到它的来源了，账号本身仍然可用。';
    if (!window.confirm('再确认一次：确定删除 ' + (email || code) + ' 这条邀请记录？' + warn +
      '\n\n· 不会删除管理员账号，也不会改任何密码\n· 不会删除这封邮件的发送记录\n· 不会动订单、顾客、收款数据')) return;
    readInvites().then(function (list) {
      var next = list.filter(function (x) { return String(x.code) !== String(code); });
      if (next.length === list.length) { toastMsg('列表里已经找不到这条记录了，刷新一下看看'); return null; }
      return writeInvites(next).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status + (r.statusText ? ' ' + r.statusText : ''));
        toastMsg('已删除这条邀请记录（账号没有动）');
        loadList();
      });
    }).catch(function (e) {
      toastMsg('删除失败：' + (e && e.message ? e.message : '网络错误') + '（记录还在，没有删掉）');
    });
  }

  /* ── 发邀请 ── */
  function sendInvite() {
    var emailEl = document.getElementById('inv-email');
    var nameEl = document.getElementById('inv-name');
    var noteEl = document.getElementById('inv-note');
    var btn = document.getElementById('inv-send');
    var email = (emailEl.value || '').trim();
    var name = (nameEl.value || '').trim();
    var note = (noteEl && noteEl.value || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { toastMsg('邮箱格式不对，检查一下'); return; }
    if (!window.confirm('给 ' + email + ' 发管理员邀请？\n\n· 会给他建一个只读后台账号\n· 信里只有一条一次性的设置密码链接，没有明文密码\n· 邀请信真的会发出去（发没发出去之后看下面状态）')) return;

    btn.disabled = true; btn.textContent = '正在建账号 + 入队…';
    fnCall({ action: 'invite', email: email, name: name, note: note }).then(function (r) {
      if (r.ok) {
        toastMsg(r.link ? ('邀请已入队，设置密码链接：' + r.link) : ('邀请已入队：' + (r.message || ('邀请码 ' + r.code))));
        emailEl.value = ''; if (nameEl) nameEl.value = ''; if (noteEl) noteEl.value = '';
        loadList();
        setTimeout(loadList, 6000); // 队列通常几秒内就会被 Worker 取走，回来再看一眼真实状态
      } else if (r.duplicate && r.code) {
        if (window.confirm(r.error + '\n\n现在重新发送这一封？')) { resend(r.code); } else { loadList(); }
      } else {
        toastMsg(r.error || '邀请失败');
      }
    }).then(function () { btn.disabled = false; btn.textContent = '发送邀请'; });
  }

  function resend(code) {
    fnCall({ action: 'resend', code: code }).then(function (r) {
      toastMsg(r.ok ? '已重新放进队列' : (r.error || '重发失败'));
      loadList();
      setTimeout(loadList, 6000);
    });
  }

  function revoke(code, email) {
    if (!window.confirm('撤销给 ' + (email || code) + ' 的邀请？\n\n· 后台权限会立刻收回\n· 账号本身保留，订单和顾客数据一点都不动')) return;
    fnCall({ action: 'revoke', code: code }).then(function (r) {
      toastMsg(r.ok ? (r.message || '已撤销') : (r.error || '撤销失败'));
      loadList();
    });
  }

  /* ── 列表 ── */
  function loadList() {
    var box = document.getElementById('inv-list');
    if (!box) return;
    fnCall({ action: 'status' }).then(function (r) {
      if (!r.ok) {
        box.innerHTML = '<p style="color:#C4636E;font-size:14px;margin:0;">' + esc(r.error || '读不到邀请记录') +
          '。这不是「没发过」，是「看不到」。</p>';
        return;
      }
      paint(box, r.invites || [], r.mails || [], r.admins || []);
    });
  }

  function adminOf(admins, userId) {
    for (var i = 0; i < admins.length; i++) { if (admins[i].user_id === userId) return admins[i]; }
    return null;
  }

  function ensureInviteCardStyles() {
    if (document.getElementById('admin-invite-record-styles')) return;
    var style = document.createElement('style');
    style.id = 'admin-invite-record-styles';
    style.textContent =
      '#admin-invite-card .inv-record{border:1px solid #F3D5E2;border-radius:14px;background:#fff;padding:14px 16px;margin:10px 0;box-shadow:0 2px 8px rgba(180,120,150,.08);}' +
      '#admin-invite-card .inv-record-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;}' +
      '#admin-invite-card .inv-record-email{font-size:17px;font-weight:700;color:#65515D;overflow-wrap:anywhere;line-height:1.45;}' +
      '#admin-invite-card .inv-record-email a{color:inherit;text-decoration:underline;text-decoration-color:#EEC7D6;text-underline-offset:3px;}' +
      '#admin-invite-card .inv-record-name{font-size:13px;color:#897783;margin-top:3px;}' +
      '#admin-invite-card .inv-record-state{flex:0 0 auto;border-radius:999px;padding:4px 10px;color:#fff;font-size:12px;line-height:1.5;white-space:nowrap;}' +
      '#admin-invite-card .inv-record-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px 18px;margin-top:12px;}' +
      '#admin-invite-card .inv-record-field{font-size:13px;color:#65515D;line-height:1.65;overflow-wrap:anywhere;}' +
      '#admin-invite-card .inv-record-label{color:#897783;margin-right:5px;}' +
      '#admin-invite-card .inv-record-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;}' +
      '#admin-invite-card .inv-record-actions .btn-mini{min-height:36px;}' +
      '#admin-invite-card .inv-record-links,#admin-invite-card .inv-record-error{margin-top:8px;font-size:13px;color:#897783;line-height:1.75;overflow-wrap:anywhere;}' +
      '@media(max-width:600px){#admin-invite-card .inv-record{padding:13px;border-radius:12px;}#admin-invite-card .inv-record-head{flex-direction:column;align-items:stretch;}#admin-invite-card .inv-record-state{align-self:flex-start;}#admin-invite-card .inv-record-fields{grid-template-columns:minmax(0,1fr);gap:4px;}#admin-invite-card .inv-record-actions{display:grid;grid-template-columns:1fr;gap:7px;}#admin-invite-card .inv-record-actions .btn-mini{width:100%;text-align:center;}}';
    document.head.appendChild(style);
  }

  function paint(box, invites, mails, admins) {
    ensureInviteCardStyles();
    var mailByCode = Object.create(null), mailById = Object.create(null), lastSentByCode = Object.create(null);
    mails.forEach(function (m) {
      if (m.id && !mailById[String(m.id)]) mailById[String(m.id)] = m;
      if (m.ref_id && !mailByCode[String(m.ref_id)]) mailByCode[String(m.ref_id)] = m;
      if (m.ref_id && m.sent_at) {
        var key = String(m.ref_id), old = lastSentByCode[key];
        if (!old || String(m.sent_at) > String(old)) lastSentByCode[key] = m.sent_at;
      }
    });

    if (!invites.length) {
      box.innerHTML = '<p style="color:#897783;font-size:14px;margin:0;">还没有发出过邀请。<b>注意</b>：如果之前在别处点过「发送邀请」并看到成功，那封邀请不是从这里发的 —— 站内当时没有这个功能，这本身就是收不到的原因之一。</p>';
      return;
    }

    var rows = invites.slice().reverse().map(function (v) {
      v = v || {};
      var code = String(v.code || '').trim();
      var email = String(v.email || '').trim();
      var m = (v.mail_id && mailById[String(v.mail_id)]) || mailByCode[code] || null;
      var a = adminOf(admins, v.user_id);
      var status = String(m && m.status || '').toLowerCase();
      var st;
      if (v.revoked) st = ['已撤销', '#C4636E'];
      else if (!m || status === 'pending' || status === 'queued') st = ['待发送', '#E0A458'];
      else if (status === 'sending' || status === 'processing' || status === 'claimed') st = ['发送中', '#B98598'];
      else if (status === 'sent' || status === 'delivered') st = ['服务商已接受', '#5FA777'];
      else if (status === 'failed' || status === 'dead' || status === 'bounced') st = ['发送失败', '#C4636E'];
      else st = ['发送状态未知', '#897783'];

      var accTxt;
      if (v.revoked) accTxt = '已撤销';
      else if (!a) accTxt = '没有后台权限';
      else if (a.must_set_password) accTxt = '等待首次登录设置密码';
      else accTxt = '可用（' + (a.role === 'owner' ? '全权限' : '只读') + '）';

      var expired = !v.revoked && (v.until || '') < new Date().toISOString().slice(0, 10);
      var linkState = v.used_at ? '链接已使用'
        : (v.link ? (expired ? '链接已过期' : '链接未使用') : '');
      var lastSent = lastSentByCode[code] || (m && m.sent_at) || '';
      var emailHtml = email
        ? '<a href="mailto:' + esc(encodeURIComponent(email).replace(/%40/gi, '@')) + '">' + esc(email) + '</a>'
        : '<span style="color:#C4636E;">邮箱信息缺失</span>';
      var fields =
        (v.note ? '<div class="inv-record-field"><span class="inv-record-label">备注</span>' + esc(v.note) + '</div>' : '') +
        '<div class="inv-record-field"><span class="inv-record-label">状态</span>' + esc(st[0]) + '</div>' +
        '<div class="inv-record-field"><span class="inv-record-label">创建时间</span>' + esc(stamp(v.created_at) || '—') + '</div>' +
        '<div class="inv-record-field"><span class="inv-record-label">最近发送时间</span>' + esc(stamp(lastSent) || '尚无发送记录') + '</div>' +
        '<div class="inv-record-field"><span class="inv-record-label">账号</span>' + esc(accTxt) + '</div>' +
        '<div class="inv-record-field"><span class="inv-record-label">邀请码</span>' + esc(code || '邀请编号缺失') +
          (v.until ? ' · 有效至 ' + esc(v.until) + (expired ? '（已过期）' : '') : '') + '</div>';
      var links = v.link
        ? '<div class="inv-record-links">设置密码链接：<a href="' + esc(v.link) + '" target="_blank" rel="noopener" style="color:#897783;">' + esc(v.link) + '</a>' +
          (linkState ? ' · ' + esc(linkState) : '') +
          ' <button type="button" class="btn-mini" data-act="copylink" data-link="' + esc(v.link) + '" style="font-size:12px;padding:3px 10px;">复制链接</button></div>'
        : '';
      var actions = code
        ? '<div class="inv-record-actions">' +
          (v.revoked ? '' :
            '<button type="button" class="btn-mini" data-act="resend" data-invite-code="' + esc(code) + '">重新发送</button>' +
            '<button type="button" class="btn-mini" data-act="revoke" data-invite-code="' + esc(code) + '" data-email="' + esc(email) + '">撤销邀请</button>') +
          '<button type="button" class="btn-mini" data-act="del" data-invite-code="' + esc(code) + '" data-email="' + esc(email) + '" data-acc="' + esc(accTxt) + '" style="color:#C4636E;border-color:#F3D5D8;">删除记录</button>' +
          '</div>'
        : '<p class="inv-record-error">缺少邀请编号，为避免操作到其他记录，当前记录不可操作。</p>';

      return '<article class="inv-record" data-invite-code="' + esc(code) + '">' +
        '<div class="inv-record-head"><div style="min-width:0;flex:1;">' +
          '<div class="inv-record-email">' + emailHtml + '</div>' +
          (v.name ? '<div class="inv-record-name">' + esc(v.name) + '</div>' : '') +
        '</div><span class="inv-record-state" style="background:' + st[1] + ';">' + esc(st[0]) + '</span></div>' +
        '<div class="inv-record-fields">' + fields + '</div>' +
        links +
        (m && m.last_error ? '<div class="inv-record-error">上次错误：' + esc(m.last_error) + '</div>' : '') +
        actions +
      '</article>';
    }).join('');

    box.innerHTML = rows +
      '<p style="color:#897783;font-size:13px;line-height:1.8;margin:10px 0 0;">' +
      '状态含义：待发送 / 发送中 = 仍在队列或处理；<b>服务商已接受</b> = Gmail SMTP 接受邮件（不代表已送达）；发送失败 = 邮件发送失败或退信，可检查错误后重试。</p>';

    box.querySelectorAll('button[data-act]').forEach(function (b) {
      b.addEventListener('click', function () {
        var code = b.getAttribute('data-invite-code') || '';
        var act = b.getAttribute('data-act');
        if (act === 'copylink') {
          var link = b.getAttribute('data-link') || '';
          var done = function () { toastMsg('链接已复制'); };
          if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(done).catch(function () { window.prompt('手动复制这条链接：', link); });
          else window.prompt('手动复制这条链接：', link);
          return;
        }
        if (!code) return;
        if (act === 'resend') resend(code);
        else if (act === 'del') deleteInvite(code, b.getAttribute('data-email'), b.getAttribute('data-acc'));
        else if (act === 'revoke') revoke(code, b.getAttribute('data-email'));
      });
    });
  }

  /* ── 链路自检（只读） ── */
  function runDiag() {
    var box = document.getElementById('mail-diag');
    var btn = document.getElementById('mail-diag-run');
    if (!box) return;
    if (btn) { btn.disabled = true; btn.textContent = '自检中…'; }
    box.innerHTML = '<p style="color:#897783;font-size:14px;margin:0;">正在检查…</p>';
    fnCall({ action: 'status' }).then(function (r) {
      var out = [];
      function line(ok, txt) { out.push('<div>' + (ok === true ? '✅ ' : ok === false ? '❌ ' : '• ') + txt + '</div>'); }
      if (!r.ok) {
        line(false, esc(r.error || '自检接口不通'));
      } else {
        var mails = r.mails || [];
        var pend = mails.filter(function (m) { return m.status === 'pending' || m.status === 'sending'; });
        var sentRows = mails.filter(function (m) { return m.status === 'sent' && m.sent_at; });
        line(true, '邀请邮件共 ' + mails.length + ' 封：' + (sentRows.length ? '服务商已接受 ' + sentRows.length + ' 封' : '还没有成功记录') +
          (pend.length ? '，队列里还有 ' + pend.length + ' 封' : '，没有积压'));
        if (sentRows.length) line(true, '最近一次被服务商接受：' + stamp(sentRows[0].sent_at) + ' → ' + esc(sentRows[0].to_email));
        if (pend.length) line(null, '队列里的信由定时任务每分钟取一次；超过 10 分钟没动才需要怀疑定时任务。');
        var admins = r.admins || [];
        line(true, '后台账号共 ' + admins.length + ' 个：' +
          admins.filter(function (a) { return a.role === 'owner'; }).length + ' 个全权限，' +
          admins.filter(function (a) { return a.role !== 'owner'; }).length + ' 个只读');
        line(null, '<b>只有你本人能确认的一项</b>：收件箱里到底有没有收到那封信（含垃圾邮件箱）。「服务商已接受」不等于「已送达」，这一点我不会替它打包票。');
      }
      box.innerHTML = '<div style="border:1.5px solid #FFE3EC;border-radius:12px;padding:12px 14px;background:#FFF8FA;font-size:14px;line-height:1.9;color:#65515D;">' +
        out.join('') + '</div>';
      if (btn) { btn.disabled = false; btn.textContent = '邮件链路自检'; }
    });
  }

  function boot() {
    var sendBtn = document.getElementById('inv-send');
    if (!sendBtn) return;
    if (!sendBtn.dataset.booted) {
      sendBtn.dataset.booted = '1';
      sendBtn.addEventListener('click', sendInvite);
      var diag = document.getElementById('mail-diag-run');
      if (diag) diag.addEventListener('click', runDiag);
    }
    loadList();
  }

  window.AdminInvite = { boot: boot, runDiag: runDiag, load: loadList, _label: label };
  function onReady() {
    var sendBtn = document.getElementById('inv-send');
    if (sendBtn && sendBtn.offsetParent !== null) boot();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(onReady, 900); });
  else setTimeout(onReady, 900);
})();
