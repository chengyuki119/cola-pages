/* ═══════════════════════════════════════════════════════════
   Our Little World｜我们的小世界（她 20261117 02:22 任务书）
   · 双人邀请 / 绑定 / 授权 / 共享状态仪表盘
   · 服务端权限 = Supabase RLS + RPC（前端只做展示与引导，不做权限判断）
   · 设备数据只用浏览器真实能拿到的 API，拿不到就显示「暂不可用」，
     绝不伪造数据（她 §八：不许假数据冒充真实设备数据）
   · 语言：随站点路径（/zh/ = 中文，根路径 = 英文），data-zh/data-en 切换
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var SUPA = 'https://ukxrvcptwhlwvdanovgd.supabase.co';
  var AK = window.SUPABASE_ANON_KEY; // anon key 由页面内提供（与 shop/about 等页同一模式）
  var LANG = window.LANG || (location.pathname.indexOf('/zh/') === 0 ? 'zh' : 'en');
  function t(zh, en) { return LANG === 'zh' ? zh : en; }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }

  var root = document.getElementById('olw-root');
  if (!root) return;

  /* ── 会话（与 site-common ykSession 同源）────────────────── */
  function sess() { return (typeof window.ykSession === 'function') ? window.ykSession() : null; }
  function at() { var s = sess(); return s ? s.a : null; }
  function rt() { var s = sess(); return s ? s.r : null; }
  function saveSess(u) {
    try {
      var key = (typeof window.ykSessionKey === 'function') ? window.ykSessionKey() : 'yuki-shop-user';
      localStorage.setItem(key, JSON.stringify(u));
    } catch (e) {}
  }

  function api(path, opts) {
    opts = opts || {};
    var headers = { 'apikey': AK, 'Content-Type': 'application/json' };
    var token = at();
    if (token) headers['Authorization'] = 'Bearer ' + token;
    if (opts.prefer) headers['Prefer'] = opts.prefer;
    return fetch(SUPA + '/rest/v1/' + path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (r) {
      if (r.status === 404) throw new Error('db-not-ready'); // 表未建（她未执行 SQL）→ 友好降级
      if (r.status === 401 && rt()) {
        // 会话过期静默续期一次
        return fetch(SUPA + '/auth/v1/token?grant_type=refresh_token', {
          method: 'POST', headers: { 'apikey': AK, 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: rt() })
        }).then(function (rr) { return rr.json(); }).then(function (j) {
          if (j.access_token) { saveSess({ a: j.access_token, r: j.refresh_token, email: (sess() || {}).email }); }
          headers['Authorization'] = 'Bearer ' + (j.access_token || token);
          return fetch(SUPA + '/rest/v1/' + path, { method: opts.method || 'GET', headers: headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
        }).catch(function () { return r; });
      }
      return r;
    });
  }
  function rpc(fn, args) {
    return api('rpc/' + fn, { method: 'POST', body: args || {} }).then(function (r) {
      return r.json().then(function (j) { return { ok: r.ok, status: r.status, data: j }; });
    });
  }

  /* ── 设备能力（真实 API，不伪造）────────────────────────── */
  function deviceInfo() {
    var ua = navigator.userAgent;
    var os = 'Unknown', name = '';
    var m;
    if (/iPhone/.test(ua)) { os = 'iOS ' + (ua.match(/OS (\d+[_\d]*)/) ? RegExp.$1.replace(/_/g, '.') : ''); name = 'iPhone'; }
    else if (/iPad/.test(ua)) { os = 'iPadOS ' + (ua.match(/OS (\d+[_\d]*)/) ? RegExp.$1.replace(/_/g, '.') : ''); name = 'iPad'; }
    else if (/Macintosh/.test(ua)) { os = 'macOS ' + (ua.match(/Mac OS X (\d+[_\d]*)/) ? RegExp.$1.replace(/_/g, '.') : ''); name = 'Mac'; }
    else if (/Android/.test(ua)) { os = 'Android ' + (ua.match(/Android (\d+[\d.]*)/) ? RegExp.$1 : ''); name = 'Android phone'; }
    else if (/Windows/.test(ua)) { os = 'Windows ' + (ua.match(/Windows NT ([\d.]+)/) ? RegExp.$1 : ''); name = 'PC'; }
    return { os: os, name: name || (navigator.platform || '') };
  }
  function batteryApi() {
    if (navigator.getBattery || navigator.battery) {
      return (navigator.getBattery || navigator.battery).call(navigator);
    }
    return Promise.resolve(null); // 浏览器不支持 →「暂不可用」，绝不估算
  }

  /* ── 状态 ───────────────────────────────────────────────── */
  var ST = { space: null, members: [], invites: [], perms: null, mine: null, partner: null,
             watchId: null, watchOn: false, batRef: null, map: null, markers: {}, tab: 'dash' };

  function myMember() {
    var token = at();
    if (!token) return null;
    try {
      var payload = JSON.parse(atob(token.split('.')[1]));
      return { uid: payload.sub, email: payload.email || (sess() || {}).email };
    } catch (e) { return null; }
  }

  /* ── 数据加载 ───────────────────────────────────────────── */
  function loadAll() {
    return api('couple_members?select=*').then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rows) {
        if (!Array.isArray(rows) || !rows.length) { ST.space = null; ST.members = []; return null; }
        ST.members = rows;
        return api('couple_spaces?id=eq.' + rows[0].space_id + '&select=*').then(function (r2) { return r2.ok ? r2.json() : []; })
          .then(function (sp) { ST.space = sp && sp[0] ? sp[0] : null; return ST.space; });
      })
      .then(function (space) {
        if (!space) return null;
        var uid = (myMember() || {}).uid;
        return Promise.all([
          api('couple_permissions?space_id=eq.' + space.id + '&select=*').then(function (r) { return r.ok ? r.json() : []; }),
          api('couple_presence?space_id=eq.' + space.id + '&select=*').then(function (r) { return r.ok ? r.json() : []; }),
          api('couple_invites?space_id=eq.' + space.id + '&status=eq.pending&select=*').then(function (r) { return r.ok ? r.json() : []; })
        ]).then(function (res) {
          ST.perms = res[0] || []; ST.presence = res[1] || []; ST.invites = res[2] || [];
          ST.mine = ST.presence.filter(function (p) { return p.user_id === uid; })[0] || null;
          ST.partner = ST.presence.filter(function (p) { return p.user_id !== uid; })[0] || null;
          ST.myPerm = ST.perms.filter(function (p) { return p.user_id === uid; })[0] || null;
          ST.partnerPerm = ST.perms.filter(function (p) { return p.user_id !== uid; })[0] || null;
          return space;
        });
      });
  }

  function fmtTime(iso) {
    if (!iso) return t('—', '—');
    var d = new Date(iso);
    return d.toLocaleString(LANG === 'zh' ? 'zh-CN' : 'en-US');
  }
  function ago(iso) {
    if (!iso) return '';
    var s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return t(s + ' 秒前', s + 's ago');
    if (s < 3600) return t(Math.floor(s / 60) + ' 分钟前', Math.floor(s / 60) + 'm ago');
    if (s < 86400) return t(Math.floor(s / 3600) + ' 小时前', Math.floor(s / 3600) + 'h ago');
    return t(Math.floor(s / 86400) + ' 天前', Math.floor(s / 86400) + 'd ago');
  }

  /* ── 视图 ───────────────────────────────────────────────── */
  function render() {
    if (!at()) { renderLoginGate(); return; }
    loadAll().then(function (space) {
      if (!space) renderNotBound();
      else renderDash();
    }).catch(function (e) {
      // 表还没建（她未执行 SQL）→ 友好提示，不报错白屏
      renderDbPending();
    });
  }

  function renderLoginGate() {
    root.innerHTML =
      '<div class="olw-card olw-deny">' +
        '<div style="font-size:34px;margin-bottom:10px;">♡</div>' +
        '<h1 class="olw-h1">' + t('我们的小世界', 'Our Little World') + '</h1>' +
        '<p class="olw-sub">' + t('这是两个人的私人空间，请先登录你的 Snow Yuzu 账号。', 'This is a private space for two — please sign in to your Snow Yuzu account first.') + '</p>' +
        '<a class="olw-btn" href="/account/?next=' + encodeURIComponent(location.pathname + location.search) + '">' + t('去登录', 'Sign in') + '</a>' +
      '</div>';
  }

  function renderDbPending() {
    root.innerHTML =
      '<div class="olw-card olw-deny">' +
        '<h1 class="olw-h1">' + t('我们的小世界', 'Our Little World') + '</h1>' +
        '<p class="olw-sub">' + t('私人空间的数据层还没有就绪，稍后再来看看 ♡', 'The private space is not ready yet — check back soon ♡') + '</p>' +
      '</div>';
  }

  function renderNotBound() {
    var code = new URLSearchParams(location.search).get('code') || '';
    var iAmOwner = false;
    var mm = myMember();
    root.innerHTML =
      '<div class="olw-card" style="max-width:560px;margin:0 auto;text-align:center;">' +
        '<div style="font-size:36px;margin-bottom:6px;">♡</div>' +
        '<h1 class="olw-h1">' + t('我们的小世界', 'Our Little World') + '</h1>' +
        '<p class="olw-sub">' + t('一个只属于两个人的私人空间。只有收到邀请的人才能加入，最多两个人。', 'A private space just for two. Only invited members can join — two people max.') + '</p>' +
        (code
          ? '<div style="margin:16px 0;"><div class="olw-muted">' + t('你的邀请码', 'Your invite code') + '</div>' +
            '<div style="font-size:30px;font-weight:700;letter-spacing:4px;color:#B98598;margin:8px 0;">' + esc(code) + '</div>' +
            '<button class="olw-btn" id="olw-accept">' + t('接受邀请并绑定', 'Accept invite &amp; bind') + '</button></div>'
          : '') +
        '<div style="margin:18px 0 6px;border-top:1.5px solid #F9E5ED;padding-top:16px;">' +
          '<div class="olw-muted" style="margin-bottom:8px;">' + t('收到邀请码？在这里输入', 'Have an invite code? Enter it here') + '</div>' +
          '<input class="olw-in" id="olw-code-in" placeholder="' + t('8 位邀请码', '8-char invite code') + '" style="max-width:240px;text-transform:uppercase;letter-spacing:3px;text-align:center;" maxlength="8">' +
          '<div style="margin-top:10px;"><button class="olw-btn" id="olw-accept2">' + t('接受邀请并绑定', 'Accept invite &amp; bind') + '</button></div>' +
        '</div>' +
        '<p class="olw-muted" id="olw-msg" style="margin-top:12px;"></p>' +
      '</div>';
    function accept(codeVal) {
      if (!codeVal) return showMsg(t('请输入邀请码', 'Enter the invite code'));
      var b = document.querySelector('#olw-accept, #olw-accept2');
      b.disabled = true;
      rpc('couple_accept_invite', { p_code: codeVal }).then(function (res) {
        b.disabled = false;
        if (res.ok) { location.search = ''; }
        else showMsg(errText(res.data), true);
      });
    }
    function showMsg(s, bad) {
      var m = document.getElementById('olw-msg');
      m.textContent = s; m.style.color = bad ? '#C4636E' : '#897783';
    }
    var a1 = document.getElementById('olw-accept');
    if (a1) a1.addEventListener('click', function () { accept(code); });
    document.getElementById('olw-accept2').addEventListener('click', function () {
      accept(document.getElementById('olw-code-in').value.trim().toUpperCase());
    });
  }

  function errText(data) {
    var m = (data && (data.message || data.error_description || data.msg)) || '';
    if (m.indexOf('两个人') > -1 || m.indexOf('full') > -1) return t('这个空间已经有两个人了', 'This space already has two members');
    if (m.indexOf('绑定') > -1) return t('你已经绑定了一个私人空间', 'You are already bound to a space');
    if (m.indexOf('过期') > -1) return t('邀请已过期，请让对方重新生成', 'Invite expired — ask for a new one');
    if (m.indexOf('无效') > -1) return t('邀请码无效或已被使用', 'Invite code is invalid or already used');
    return m || t('操作没有成功，稍后再试', 'Something went wrong — try again');
  }

  /* ── 仪表盘 ─────────────────────────────────────────────── */
  function renderDash() {
    var uid = (myMember() || {}).uid;
    var me = ST.members.filter(function (m) { return m.user_id === uid; })[0] || {};
    var partner = ST.members.filter(function (m) { return m.user_id !== uid; })[0] || null;
    var pm = ST.myPerm || {};
    root.innerHTML =
      '<h1 class="olw-h1">' + esc(ST.space.space_name || 'Our Little World') + '</h1>' +
      '<p class="olw-sub">' + t('两个人的私人空间 · 只有你们两个能进来 ♡', 'A private space for two — only you two can enter ♡') + '</p>' +
      '<div class="olw-grid">' +

        // 双人卡
        '<div class="olw-card">' +
          '<h2 class="olw-title">' + t('我们', 'Us') + '</h2>' + membersHtml(me, partner) +
        '</div>' +

        // 自定义状态
        '<div class="olw-card">' +
          '<h2 class="olw-title">' + t('我的状态', 'My status') + '</h2>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;" id="olw-status-chips"></div>' +
          '<input class="olw-in" id="olw-status-text" maxlength="40" placeholder="' + t('自定义状态…', 'Custom status…') + '" value="' + esc((ST.mine || {}).custom_status || '') + '">' +
          '<div style="margin-top:10px;"><button class="olw-btn" id="olw-status-save">' + t('保存状态', 'Save status') + '</button>' +
          '<span class="olw-muted" style="margin-left:10px;">' + t('手动设置，会标明来源', 'Manually set; source is labeled') + '</span></div>' +
        '</div>' +

        // 对方状态
        '<div class="olw-card">' +
          '<h2 class="olw-title">' + (partner ? t(esc(partner.display_name || partner.email) + ' 的状态', esc(partner.display_name || partner.email) + '\u2019s status') : t('对方状态', 'Partner status')) + '</h2>' +
          '<div id="olw-partner-status">' + partnerStatusHtml() + '</div>' +
        '</div>' +

        // 位置地图
        '<div class="olw-card" style="grid-column:1/-1;">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">' +
            '<h2 class="olw-title" style="margin:0;">' + t('位置', 'Location') + '</h2>' +
            '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">' +
              '<button class="olw-btn ghost" id="olw-loc-refresh">' + t('↻ 刷新我的位置', '↻ Refresh my location') + '</button>' +
              '<div style="display:flex;align-items:center;gap:8px;"><span class="olw-muted">' + t('持续共享（页面打开时）', 'Live share (while page is open)') + '</span>' +
              '<div class="olw-switch' + (ST.watchOn ? ' on' : '') + '" id="olw-loc-watch"></div></div>' +
            '</div>' +
          '</div>' +
          '<div id="olw-map" style="margin-top:12px;"></div>' +
          '<div class="olw-muted" id="olw-loc-status" style="margin-top:10px;"></div>' +
        '</div>' +

        // 电量与设备
        '<div class="olw-card">' +
          '<h2 class="olw-title">' + t('电量与设备', 'Battery &amp; device') + '</h2>' +
          '<div id="olw-battery"></div>' +
        '</div>' +

        // 授权管理
        '<div class="olw-card">' +
          '<h2 class="olw-title">' + t('我的授权', 'My sharing permissions') + '</h2>' +
          '<div id="olw-perms"></div>' +
          '<p class="olw-muted" style="margin-top:8px;">' + t('关闭任何一项都会立即停止收集与共享该项数据，且不影响其他项。', 'Turning off any item stops collecting & sharing it immediately — other items are unaffected.') + '</p>' +
        '</div>' +

        // 绑定管理
        '<div class="olw-card">' +
          '<h2 class="olw-title">' + t('绑定管理', 'Binding') + '</h2>' +
          '<div id="olw-binding"></div>' +
        '</div>' +

      '</div>' +
      '<p class="olw-muted" id="olw-msg" style="margin-top:14px;"></p>';

    bindDash(me, partner);
    paintBattery();
    paintMap();
  }

  function membersHtml(me, partner) {
    function one(m, isMe) {
      if (!m) return '';
      var initial = (m.display_name || m.email || '?').trim().charAt(0).toUpperCase();
      return '<div style="display:flex;align-items:center;gap:12px;' + (isMe ? '' : 'margin-top:12px;padding-top:12px;border-top:1.5px solid #F9E5ED;') + '">' +
        '<div class="olw-avatar">' + esc(initial) + '</div>' +
        '<div style="min-width:0;">' +
          '<div class="olw-kv"><b>' + esc(m.display_name || m.email) + '</b>' +
          (m.role === 'owner' ? ' <span class="olw-muted">· ' + t('创建者', 'creator') + '</span>' : '') +
          (isMe ? ' <span class="olw-muted">· ' + t('我', 'me') + '</span>' : '') + '</div>' +
          '<div class="olw-muted">' + esc(m.email) + '</div>' +
        '</div></div>';
    }
    if (!partner) return one(me, true) +
      '<p class="olw-muted" style="margin-top:14px;">' + t('还没有绑定另一半。', 'No partner bound yet.') + '</p>';
    return one(me, true) + one(partner, false);
  }

  function partnerStatusHtml() {
    if (!ST.partner) return '<p class="olw-muted">' + t('绑定后可以看到对方的共享状态。', 'Bind with your partner to see their shared status.') + '</p>';
    var pp = ST.partnerPerm || {};
    var p = ST.partner;
    var lines = [];
    lines.push('<div class="olw-kv"><b>' + esc(p.custom_status || t('（没有设置状态）', '(no status set)')) + '</b>' +
      '<span class="olw-muted"> · ' + t('手动', 'manual') + ' · ' + ago(p.updated_at) + '</span></div>');
    lines.push('<div class="olw-muted" style="margin-top:8px;">' + t('位置：', 'Location: ') +
      (pp.share_location === false ? t('未授权', 'not shared') : (p.location_at ? fmtTime(p.location_at) + '（' + ago(p.location_at) + '）' : t('暂无数据', 'no data yet'))) + '</div>');
    lines.push('<div class="olw-muted">' + t('电量：', 'Battery: ') +
      (pp.share_battery === false ? t('未授权', 'not shared') : (p.battery_level != null ? p.battery_level + '%' + (p.charging ? ' ⚡' : '') + ' · ' + ago(p.battery_at) : t('暂不可用', 'unavailable'))) + '</div>');
    lines.push('<div class="olw-muted">' + t('设备：', 'Device: ') +
      (pp.share_device === false ? t('未授权', 'not shared') : (p.os_info ? esc(p.os_info) : t('暂不可用', 'unavailable'))) + '</div>');
    lines.push('<div class="olw-muted">' + t('最近在线：', 'Last seen: ') + (p.online_at ? fmtTime(p.online_at) : '—') + '</div>');
    return lines.join('');
  }

  /* ── 仪表盘交互 ─────────────────────────────────────────── */
  var PRESETS = LANG === 'zh'
    ? ['正在工作', '正在上课', '正在休息', '正在睡觉', '外出中', '忙碌']
    : ['Working', 'In class', 'Resting', 'Sleeping', 'Out & about', 'Busy'];

  function bindDash(me, partner) {
    var msg = document.getElementById('olw-msg');
    function showMsg(s, bad) { msg.textContent = s; msg.style.color = bad ? '#C4636E' : '#897783'; }

    // 状态 chips
    var chipBox = document.getElementById('olw-status-chips');
    var cur = (ST.mine || {}).custom_status || '';
    function paintChips() {
      chipBox.innerHTML = PRESETS.map(function (p) {
        return '<button type="button" class="olw-chip' + (cur === p ? ' on' : '') + '" data-s="' + esc(p) + '">' + esc(p) + '</button>';
      }).join('');
      chipBox.querySelectorAll('[data-s]').forEach(function (b) {
        b.addEventListener('click', function () {
          cur = (cur === b.getAttribute('data-s')) ? '' : b.getAttribute('data-s');
          document.getElementById('olw-status-text').value = cur;
          paintChips();
        });
      });
    }
    paintChips();
    document.getElementById('olw-status-text').addEventListener('input', function () { cur = this.value; paintChips(); });
    document.getElementById('olw-status-save').addEventListener('click', function () {
      var b = this; b.disabled = true;
      savePresence({ custom_status: (document.getElementById('olw-status-text').value || '').trim(), status_source: 'manual' })
        .then(function () { b.disabled = false; showMsg(t('状态已保存 ♡', 'Status saved ♡')); flashHide(msg); refreshDash(); })
        .catch(function (e) { b.disabled = false; showMsg(e.message || t('保存失败', 'Save failed'), true); });
    });

    // 位置：手动刷新
    document.getElementById('olw-loc-refresh').addEventListener('click', function () {
      grabLocation(function (ok, txt) { showMsg(txt, !ok); if (ok) refreshDash(); });
    });
    // 持续共享开关
    var watch = document.getElementById('olw-loc-watch');
    watch.addEventListener('click', function () {
      if (ST.watchOn) { stopWatch(); paintMap(); showMsg(t('已暂停位置共享 ♡', 'Location sharing paused ♡')); }
      else startWatch(function (ok, txt) { showMsg(txt, !ok); });
      this.classList.toggle('on', ST.watchOn);
    });

    // 授权开关
    paintPerms();

    // 绑定管理
    var bindBox = document.getElementById('olw-binding');
    var myInvite = ST.invites.filter(function (i) { return i.invited_by === (myMember() || {}).uid; })[0];
    var html = '<div class="olw-kv">' + t('当前状态：', 'Current status: ') +
      (partner ? t('已绑定（两人）', 'Bound (two members)') : t('已创建空间，等待另一半加入', 'Space created — waiting for your partner')) + '</div>';
    if (myInvite && !partner) {
      html += '<div class="olw-muted" style="margin-top:8px;">' + t('当前邀请码（7 天内有效，只能用一次）：', 'Current invite code (valid 7 days, one-time use): ') +
        '<b style="letter-spacing:3px;color:#B98598;">' + esc(myInvite.code) + '</b> · ' + t('过期于', 'expires') + ' ' + fmtTime(myInvite.expires_at) + '</div>' +
        '<div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">' +
        '<button class="olw-btn ghost" id="olw-copy-code">' + t('复制邀请链接', 'Copy invite link') + '</button>' +
        '<button class="olw-btn danger" id="olw-cancel-invite">' + t('取消邀请', 'Cancel invite') + '</button></div>';
    }
    if (!partner) {
      html += '<div style="margin-top:10px;"><button class="olw-btn" id="olw-new-invite">' + t('生成新邀请', 'New invite') + '</button></div>';
    }
    html += '<div style="margin-top:14px;padding-top:12px;border-top:1.5px solid #F9E5ED;">' +
      '<button class="olw-btn danger" id="olw-unbind">' + t('解除绑定', 'Unbind') + '</button>' +
      '<div class="olw-muted" style="margin-top:6px;">' + t('解除后双方的共享访问立即停止，共享数据会被删除。', 'Unbinding stops both sides\u2019 access immediately and deletes shared data.') + '</div></div>';
    bindBox.innerHTML = html;

    if (document.getElementById('olw-copy-code')) {
      document.getElementById('olw-copy-code').addEventListener('click', function () {
        var link = location.origin + '/our-little-world/?code=' + myInvite.code;
        (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(function () {
          showMsg(t('邀请链接已复制 ♡', 'Invite link copied ♡'));
        }).catch(function () {
          showMsg(link, false); // 复制失败时直接展示链接（真实可用，绝不静默）
        });
      });
      document.getElementById('olw-cancel-invite').addEventListener('click', function () {
        rpc('couple_cancel_invite', { p_code: myInvite.code }).then(function (res) {
          showMsg(res.ok ? t('邀请已取消', 'Invite cancelled') : errText(res.data), !res.ok);
          refreshDash();
        });
      });
    }
    if (document.getElementById('olw-new-invite')) {
      document.getElementById('olw-new-invite').addEventListener('click', function () {
        var b = this; b.disabled = true;
        rpc('couple_create_invite', {}).then(function (res) {
          b.disabled = false;
          if (res.ok) refreshDash(); else showMsg(errText(res.data), true);
        });
      });
    }
    document.getElementById('olw-unbind').addEventListener('click', function () {
      var ok = confirm(t('确定解除绑定吗？双方的共享访问会立即停止，共享数据会被删除。', 'Unbind now? Both sides lose access immediately and shared data is deleted.'));
      if (!ok) return;
      rpc('couple_unbind', {}).then(function (res) {
        if (res.ok) location.href = '/our-little-world/';
        else showMsg(errText(res.data), true);
      });
    });

    // 电量/设备自动上报（只在自己授权开启时采集）
    autoReportDevice();
  }

  function paintPerms() {
    var box = document.getElementById('olw-perms');
    var pm = ST.myPerm || {};
    var items = [
      { k: 'share_location', zh: '位置共享', en: 'Share my location', desc: t('开启后你的设备位置会上报到私人空间，只有你们两个人能看到。需要浏览器/系统定位权限。', 'When on, your device location is shared to this private space — only you two can see it. Requires browser/system location permission.') },
      { k: 'share_battery', zh: '电量与充电状态', en: 'Share battery & charging', desc: t('开启后分享设备电量和充电状态（仅支持的浏览器能读取；Safari/Firefox 会显示「暂不可用」）。', 'When on, shares battery & charging state (only supported browsers can read it; Safari/Firefox will show "unavailable").') },
      { k: 'share_device', zh: '设备信息', en: 'Share device info', desc: t('开启后分享设备名称、系统版本和最近在线时间。不包含任何输入内容或隐私数据。', 'When on, shares device name, OS version and last-seen time. No keystrokes or private data of any kind.') },
      { k: 'share_custom_status', zh: '自定义状态', en: 'Share my status', desc: t('开启后对方可以看到你设置的状态。', 'When on, your partner can see the status you set.') }
    ];
    box.innerHTML = items.map(function (it) {
      var on = pm[it.k] === true || (it.k === 'share_custom_status' && pm.share_custom_status !== false);
      return '<div style="display:flex;align-items:flex-start;gap:12px;padding:10px 0;' + (it.k !== 'share_custom_status' ? 'border-bottom:1.5px solid #F9E5ED;' : '') + '">' +
        '<div class="olw-switch' + (on ? ' on' : '') + '" data-k="' + it.k + '"></div>' +
        '<div style="min-width:0;"><div class="olw-kv"><b>' + it.zh + ' / ' + it.en + '</b></div>' +
        '<div class="olw-muted">' + it.desc + '</div></div></div>';
    }).join('');
    box.querySelectorAll('.olw-switch').forEach(function (sw) {
      sw.addEventListener('click', function () {
        var k = sw.getAttribute('data-k');
        var turningOn = !sw.classList.contains('on');
        if (turningOn && !confirm(t('开启「' + k.replace('share_', '') + '」共享？用途与说明见下方文字，只有你们两个人能看到。', 'Turn on "' + k.replace('share_', '') + '" sharing? Only you two can see it. Details below.'))) return;
        sw.classList.toggle('on', turningOn);
        var body = {}; body[k] = turningOn;
        savePerm(body).then(function () {
          if (k === 'share_location' && !turningOn && ST.watchOn) { stopWatch(); document.getElementById('olw-loc-watch').classList.remove('on'); }
          if (k !== 'share_custom_status' && !turningOn) { clearPresenceField(k); }
          refreshDash();
        });
      });
    });
  }

  /* ── 数据写入（全部走真实 RPC/REST，绝不假写）────────────── */
  function ensurePermRow() {
    var sid = ST.space && ST.space.id; if (!sid) return Promise.resolve();
    if (ST.myPerm) return Promise.resolve();
    var uid = (myMember() || {}).uid;
    return api('couple_permissions', { method: 'POST', body: { space_id: sid, user_id: uid } });
  }
  function savePerm(patch) {
    var sid = ST.space.id, uid = (myMember() || {}).uid;
    return ensurePermRow().then(function () {
      return api('couple_permissions?space_id=eq.' + sid + '&user_id=eq.' + uid, { method: 'PATCH', body: patch });
    }).then(function (r) {
      Object.keys(patch).forEach(function (k) { if (ST.myPerm) ST.myPerm[k] = patch[k]; });
    });
  }
  function ensurePresenceRow() {
    var sid = ST.space && ST.space.id; if (!sid) return Promise.resolve();
    if (ST.mine) return Promise.resolve();
    var uid = (myMember() || {}).uid;
    return api('couple_presence', { method: 'POST', body: { space_id: sid, user_id: uid } })
      .then(function () { ST.mine = { space_id: sid, user_id: uid }; });
  }
  function savePresence(patch) {
    var sid = ST.space.id, uid = (myMember() || {}).uid;
    return ensurePresenceRow().then(function () {
      patch.updated_at = new Date().toISOString();
      patch.online_at = patch.online_at || new Date().toISOString();
      return api('couple_presence?space_id=eq.' + sid + '&user_id=eq.' + uid, { method: 'PATCH', body: patch });
    });
  }
  function clearPresenceField(permKey) { // 关闭授权 → 立即清掉对应已共享的数据
    var patch = {};
    if (permKey === 'share_location') { patch.latitude = null; patch.longitude = null; patch.location_at = null; }
    if (permKey === 'share_battery') { patch.battery_level = null; patch.charging = null; patch.battery_at = null; }
    if (permKey === 'share_device') { patch.device_name = null; patch.os_info = null; patch.online_at = null; }
    if (Object.keys(patch).length) savePresence(patch).catch(function () {});
  }

  /* ── 位置 ───────────────────────────────────────────────── */
  function grabLocation(cb) {
    if (!ST.myPerm || ST.myPerm.share_location !== true) {
      return cb(false, t('请先在「我的授权」里开启位置共享', 'Turn on location sharing in "My sharing permissions" first'));
    }
    if (!navigator.geolocation) return cb(false, t('这台设备不支持定位', 'Location not supported on this device'));
    document.getElementById('olw-loc-status').textContent = t('定位中…', 'Locating…');
    navigator.geolocation.getCurrentPosition(function (pos) {
      savePresence({
        latitude: pos.coords.latitude, longitude: pos.coords.longitude,
        location_accuracy: pos.coords.accuracy, location_at: new Date().toISOString()
      }).then(function () {
        paintMap();
        document.getElementById('olw-loc-status').textContent = t('位置已更新 ♡ · ', 'Location updated ♡ · ') + fmtTime(new Date().toISOString());
        cb(true, t('位置已更新 ♡', 'Location updated ♡'));
      }).catch(function (e) { cb(false, t('上传位置失败', 'Failed to upload location')); });
    }, function (err) {
      document.getElementById('olw-loc-status').textContent =
        err.code === 1 ? t('定位权限被拒绝——请在系统/浏览器设置里允许后重试', 'Location permission denied — allow it in system/browser settings and retry')
        : t('定位失败（' + (err.message || 'unknown') + '）', 'Location failed (' + (err.message || 'unknown') + ')');
      cb(false, document.getElementById('olw-loc-status').textContent);
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 });
  }
  function startWatch(cb) {
    if (!ST.myPerm || ST.myPerm.share_location !== true) return cb(false, t('请先开启位置共享授权', 'Enable location sharing first'));
    if (!navigator.geolocation) return cb(false, t('这台设备不支持定位', 'Not supported'));
    ST.watchOn = true;
    ST.watchId = navigator.geolocation.watchPosition(function (pos) {
      savePresence({
        latitude: pos.coords.latitude, longitude: pos.coords.longitude,
        location_accuracy: pos.coords.accuracy, location_at: new Date().toISOString()
      }).then(function () { paintMap(); }).catch(function () {});
    }, function (err) {
      ST.watchOn = false;
      var sw = document.getElementById('olw-loc-watch'); if (sw) sw.classList.remove('on');
      if (cb) cb(false, t('持续共享中断：权限被拒绝或定位失败', 'Live sharing stopped: permission denied or location failed'));
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 });
    if (cb) cb(true, t('持续共享已开启（页面打开期间有效）♡', 'Live sharing on (valid while page is open) ♡'));
  }
  function stopWatch() {
    if (ST.watchId != null && navigator.geolocation) navigator.geolocation.clearWatch(ST.watchId);
    ST.watchId = null; ST.watchOn = false;
  }

  /* ── 地图（Leaflet + OSM，私人空间不用地图引擎 Key）────── */
  function paintMap() {
    var el = document.getElementById('olw-map');
    if (!el || typeof L === 'undefined') return;
    if (!ST.map) {
      ST.map = L.map(el).setView([33.68, -117.8], 10);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(ST.map);
      ST.markers = {};
    }
    var uid = (myMember() || {}).uid;
    var pts = [];
    ST.members.forEach(function (m) {
      var p = (m.user_id === uid ? ST.mine : ST.partner);
      if (!p || p.latitude == null || ST.members.length < 2) return;
      var isMe = m.user_id === uid;
      var icon = L.divIcon({
        className: '',
        html: isMe
          ? '<span class="fd-loc-engine"><span class="fd-loc-halo"></span><span class="fd-loc-dot"></span></span>'
          : '<span style="display:flex;width:34px;height:34px;border-radius:50% 50% 50% 4px;transform:rotate(-45deg);background:#FFFFFF;border:2px solid #F48FB1;box-shadow:0 3px 8px rgba(180,120,150,.3);align-items:center;justify-content:center;"><span style="transform:rotate(45deg);font-size:18px;">♡</span></span>',
        iconSize: [34, 34], iconAnchor: [17, 17]
      });
      var mk = L.marker([p.latitude, p.longitude], { icon: icon }).addTo(ST.map);
      mk.bindPopup('<b>' + esc(isMe ? t('我', 'Me') : (ST.members.filter(function (x) { return x.user_id !== uid; })[0] || {}).display_name || '') + '</b><br>' +
        '<span style="font-size:12px;color:#897783;">' + fmtTime(p.location_at) + (p.location_accuracy ? ' · ±' + Math.round(p.location_accuracy) + 'm' : '') + '</span>');
      ST.markers[m.user_id] = mk;
      pts.push([p.latitude, p.longitude]);
    });
    if (pts.length === 1) ST.map.setView(pts[0], 14);
    else if (pts.length > 1) ST.map.fitBounds(pts, { padding: [40, 40], maxZoom: 15 });
  }

  /* ── 电量与设备 ─────────────────────────────────────────── */
  function paintBattery() {
    var box = document.getElementById('olw-battery');
    var dev = deviceInfo();
    var online = navigator.onLine;
    var pm = ST.myPerm || {};
    var mine = ST.mine || {};
    var partner = ST.members.filter(function (m) { return m.user_id !== (myMember() || {}).uid; })[0];
    var pp = ST.partnerPerm || {};
    var p = ST.partner || {};
    box.innerHTML =
      '<div class="olw-kv"><b>' + t('我的设备', 'My device') + '</b></div>' +
      '<div class="olw-muted" style="margin:4px 0 10px;">' + esc(dev.name || '—') + ' · ' + esc(dev.os) + ' · ' +
        (online ? t('在线', 'online') : t('离线', 'offline')) + '</div>' +
      '<div class="olw-kv">' + t('我的电量：', 'My battery: ') + '<b id="olw-my-bat">' +
        (pm.share_battery === false ? t('未授权', 'not shared') : ((mine.battery_level != null) ? mine.battery_level + '%' + (mine.charging ? ' ⚡' + t('充电中', ' charging') : '') + ' · ' + ago(mine.battery_at)
          : t('暂不可用（当前浏览器不支持读取电量）', 'unavailable (this browser cannot read battery)'))) + '</b></div>' +
      (partner
        ? '<div class="olw-kv" style="margin-top:12px;"><b>' + t('对方的电量：', 'Partner\u2019s battery: ') + '</b>' +
          (pp.share_battery === false ? t('未授权', 'not shared') : ((p.battery_level != null) ? p.battery_level + '%' + (p.charging ? ' ⚡' : '') + ' · ' + ago(p.battery_at) : t('暂不可用', 'unavailable'))) + '</div>' +
          '<div class="olw-muted" style="margin-top:4px;">' + t('对方设备：', 'Partner\u2019s device: ') +
          (pp.share_device === false ? t('未授权', 'not shared') : (p.os_info ? esc(p.os_info) + ' · ' + fmtTime(p.online_at) : t('暂不可用', 'unavailable'))) + '</div>'
        : '');
  }
  function autoReportDevice() {
    // 电量上报：仅授权开启且浏览器支持
    if (ST.myPerm && ST.myPerm.share_battery === true) {
      batteryApi().then(function (bat) {
        if (!bat) return; // 不支持 → 不写任何假数据
        var push = function () {
          savePresence({ battery_level: Math.round(bat.level * 100), charging: bat.charging, battery_at: new Date().toISOString() }).catch(function () {});
        };
        push();
        if (ST.batRef) { ST.batRef.forEach(function (h) { bat.removeEventListener(h[0], h[1]); }); }
        ST.batRef = [['levelchange', push], ['chargingchange', push]];
        ST.batRef.forEach(function (h) { bat.addEventListener(h[0], h[1]); });
      });
    }
    // 设备信息 + 最近在线：仅授权开启
    if (ST.myPerm && ST.myPerm.share_device === true) {
      var dev = deviceInfo();
      savePresence({ device_name: dev.name, os_info: dev.os, online_at: new Date().toISOString() }).catch(function () {});
    }
  }

  function refreshDash() { render(); }
  function flashHide(msg) { setTimeout(function () { if (msg.textContent && msg.textContent.indexOf('♡') > -1) msg.textContent = ''; }, 4000); }

  // 页面关闭/隐藏时停止持续共享（诚实：浏览器无法后台持续定位）
  window.addEventListener('beforeunload', stopWatch);
  document.addEventListener('visibilitychange', function () { if (document.hidden) { /* 保持 watch 由浏览器暂停 */ } });

  render();
})();
