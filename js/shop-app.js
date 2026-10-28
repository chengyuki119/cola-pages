/* ===== 小铺商城 · 买家端（账号 / 购物车 / 详情规格 / 订单 / 拼团）=====
   shop/index.html 专用，不依赖 site-common；所有数据经 Supabase RLS 保护。
   金额/价格一律以数据库为准（下单走 shop_place_order RPC 服务端计算）。 */
(function () {
  'use strict';
  var SUPABASE_URL = 'https://vmmmuyxrsiufzurwbydg.supabase.co';
  var ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZtbW11eXhyc2l1Znp1cndieWRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI4NzM2NTAsImV4cCI6MjEwODQ0OTY1MH0.SbdbAJV5hP3MtyZxf7DQUAD9Fm-XNlVC5PaYf47lzsw';

  // ===== 小工具 =====
  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
  function arr(x) { return Array.isArray(x) ? x : []; } // REST 报错/表未建时优雅兜底
  function money(v) { var n = parseFloat(v); return isNaN(n) ? '0.00' : n.toFixed(2); }
  /* ═══ 货币：商品可分别使用 CNY(¥) / USD($)；金额永不自动换算，符号跟商品 currency 字段走（小铺统一 $，无字段默认 USD，兼容旧购物车数据）═══ */
  var CURS = { CNY: '¥', USD: '$' };
  function sym(c) { return CURS[c] || '¥'; }
  function curOf(p, v) { var c = (v && v.currency) || (p && p.currency) || 'USD'; return CURS[c] ? c : 'USD'; }
  function priceHtml(c, v) { return '<small>' + sym(c) + '</small>' + money(v); }
  function normImg(u) { u = String(u || ''); if (!/^data:/.test(u)) { var mR = u.match(/https?:\/\/[^/]+\.supabase\.co\/storage\/v1\/object\/public\/([^?#]+)/); if (mR) return 'https://img.yukicheng.com/' + mR[1]; var mR2 = u.match(/^\/?storage\/v1\/object\/public\/([^?#]+)/); if (mR2) return 'https://img.yukicheng.com/' + mR2[1]; } return /^(https?:\/\/|data:)/.test(u) ? u : '/' + u.replace(/^\/+/, ''); }
  function t(zh, en) { return (window.LANG === 'en') ? en : zh; }
  function svgHeart(on) { // 收藏按钮：实心/空心 SVG（原 ♥/♡ 字符按「全站去 emoji」改矢量）
    var p = 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z';
    return '<svg viewBox="0 0 24 24" width="17" height="17" style="display:block;margin:auto;" ' + (on ? 'fill="#A04A68"' : 'fill="none" stroke="#A88E9B" stroke-width="1.8"') + '><path d="' + p + '"/></svg>';
  }

  // ===== 买家登录态 =====
  var USER = null; // {a: access, r: refresh, email}
  var YK_EXCLUSIVE_EMAIL = 'chengyuki119@gmail.com';
  function loadUser() {
    // 统一会话源：读双键中最近登录的那把（管理员/买家同一套判断，全站一致）
    if (window.ykSession) { USER = ykSession(); return; }
    try { USER = JSON.parse(localStorage.getItem('yuki-user-session') || 'null'); } catch (e) { USER = null; }
  }
  function saveUser() {
    // 统一写入点：专属邮箱写后台键，其他写买家键，并清掉另一把（不再双拷贝）
    if (window.ykWriteSession) {
      if (USER) { USER.t = Date.now(); ykWriteSession(USER, USER.email && USER.email.toLowerCase() === YK_EXCLUSIVE_EMAIL ? 'yuki-admin-session' : 'yuki-user-session'); }
      else ykWriteSession(null);
      return;
    }
    try {
      if (USER) { USER.t = Date.now(); localStorage.setItem('yuki-user-session', JSON.stringify(USER)); }
      else localStorage.removeItem('yuki-user-session');
    } catch (e) {}
  }
  function refreshUser() {
    if (!USER || !USER.r) return Promise.resolve(false);
    // 统一续期：单飞 + 并发竞态重试；只有会话真失效才清空
    if (window.ykRefreshSession) {
      return window.ykRefreshSession().then(function (s) {
        if (s) { USER = s; return true; }
        // 瞬时失败（网络抖动）≠ 会话失效：存储里会话还在就保持登录态，不降级成普通用户
        var keep = window.ykSession ? ykSession() : null;
        USER = keep || null;
        return !!keep;
      });
    }
    return fetch(SUPABASE_URL + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST', headers: { 'apikey': ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: USER.r })
    }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (d && d.access_token) { USER = { a: d.access_token, r: d.refresh_token, email: d.user && d.user.email }; saveUser(); return true; }
      USER = null; saveUser(); return false;
    }).catch(function () { return false; });
  }
  function api(path, opts) {
    opts = opts || {};
    var headers = { 'apikey': ANON, 'Content-Type': 'application/json' };
    if (USER && USER.a) headers['Authorization'] = 'Bearer ' + USER.a;
    opts.headers = Object.assign(headers, opts.headers || {});
    return fetch(SUPABASE_URL + '/rest/v1/' + path, opts).then(function (r) {
      if (r.status === 401 && USER) {
        return refreshUser().then(function (ok) {
          if (!ok) return r;
          opts.headers['Authorization'] = 'Bearer ' + USER.a;
          return fetch(SUPABASE_URL + '/rest/v1/' + path, opts);
        });
      }
      return r;
    });
  }
  function rpc(fn, args) {
    return refreshUser().then(function () {
      var headers = { 'apikey': ANON, 'Content-Type': 'application/json' };
      if (USER && USER.a) headers['Authorization'] = 'Bearer ' + USER.a;
      return fetch(SUPABASE_URL + '/rest/v1/rpc/' + fn, { method: 'POST', headers: headers, body: JSON.stringify(args) })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); });
    });
  }

  // ===== 购物车（本地 + 登录后云同步合并）=====
  var CART = [];
  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function loadCart() {
    try { CART = JSON.parse(localStorage.getItem('yuki-cart') || '[]'); } catch (e) { CART = []; }
    if (!Array.isArray(CART)) CART = [];
    // 旧版购物车里可能有非 uuid 的残留数据（会报 invalid input syntax for type uuid），
    // 载入时直接滤掉（她 2026-10-25 提交不了订单就是它）
    var bad = CART.filter(function (x) { return !x || !UUID_RE.test(String(x.id || '')); });
    if (bad.length) {
      CART = CART.filter(function (x) { return x && UUID_RE.test(String(x.id || '')); });
      saveCart();
    }
  }
  function saveCart() {
    try { localStorage.setItem('yuki-cart', JSON.stringify(CART)); } catch (e) {}
    paintCartBadge();
    if (USER) {
      // 云端同步：登录后购物车跨设备跟随（user_id 由服务端拿）
      getUid().then(function (uid) {
        if (!uid) return;
        api('shop_carts?on_conflict=user_id', { method: 'POST', headers: { 'Prefer': 'resolution=merge-duplicates' }, body: JSON.stringify({ user_id: uid, items: CART }) }).catch(function () {});
      });
    }
  }
  var UID = null;
  function getUid() {
    if (UID) return Promise.resolve(UID);
    if (!USER || !USER.a) return Promise.resolve(null);
    return fetch(SUPABASE_URL + '/auth/v1/user', { headers: { 'apikey': ANON, 'Authorization': 'Bearer ' + USER.a } })
      .then(function (r) { return r.ok ? r.json() : null; }).then(function (u) { UID = u ? u.id : null; return UID; }).catch(function () { return null; });
  }
  function cartKey(id, sku) { return String(id) + '::' + String(sku || ''); }
  function cartAdd(item, qty) {
    var k = cartKey(item.id, item.sku);
    var hit = CART.filter(function (x) { return cartKey(x.id, x.sku) === k; })[0];
    if (hit) hit.qty += qty || 1;
    else CART.push({ id: item.id, sku: item.sku || '', name: item.name, image: item.image || '', price: item.price, currency: item.currency || 'USD', qty: qty || 1, checked: true });
    saveCart();
  }
  function paintCartBadge() {
    var n = 0; CART.forEach(function (x) { n += x.qty; });
    try { if (window.SiteMenu) SiteMenu.setCartCount(n); } catch (e) {}
  }

  window.__rgNotifyWanted = false; // 注册时勾选的上新订阅，建号成功后写入资料

  // ===== 输入框 / 选项卡统一样式（边界清晰、状态明确）=====
  function styleInputs(root) {
    (root || document).querySelectorAll('input, textarea').forEach(function (i) {
      if (i.dataset.styled) return;
      i.dataset.styled = '1';
      i.style.cssText = 'width:100%;padding:11px 14px;font-size:17px;border:1.5px solid var(--accent-soft,#FCE4EC);border-radius:12px;background:#fff;outline:none;color:var(--text,#604C57);font-family:inherit;box-sizing:border-box;transition:border-color .15s;box-shadow:0 2px 10px rgba(255,143,171,.06);';
      i.addEventListener('focus', function () { i.style.borderColor = 'var(--accent-strong,#A04A68)'; });
      i.addEventListener('blur', function () { i.style.borderColor = 'var(--accent-soft,#FCE4EC)'; });
    });
  }
  function paintTabs(scope, active) {
    scope.querySelectorAll('.acct-tab').forEach(function (x) {
      var on = x === active;
      // 柔和粉色系：选中浅粉底深玫瑰字，未选中白底软粉描边，不过分强烈
      x.style.background = on ? 'var(--accent,#ffd9e6)' : '#fff';
      x.style.color = on ? 'var(--text,#604C57)' : 'var(--muted,#A88E9B)';
      x.style.boxShadow = 'none';
    });
  }
  function styleTabs(scope) { paintTabs(scope, scope.querySelector('.acct-tab.on')); }

  // ===== 新品上架通知订阅（默认关闭；站内自定义开关，不用原生 checkbox）=====
  function subRead() {
    try { return localStorage.getItem('yuki-notify-new') === '1'; } catch (e) { return false; }
  }
  function subWrite(on, uid) {
    try { localStorage.setItem('yuki-notify-new', on ? '1' : '0'); } catch (e) {}
    if (!uid) return Promise.resolve(false);
    return api('shop_profiles?on_conflict=id', { method: 'POST', headers: { 'Prefer': 'resolution=merge-duplicates' }, body: JSON.stringify({ id: uid, notify_new: on }) }).then(function (r) {
      return !!r.ok;
    }).catch(function () { return false; });
  }
  function subToggleHtml(id, on) {
    return '<button type="button" id="' + id + '" role="switch" aria-checked="' + (on ? 'true' : 'false') + '" style="width:46px;height:26px;border-radius:999px;border:none;cursor:pointer;padding:0;position:relative;transition:background .2s;font-family:inherit;background:' + (on ? 'var(--accent,#ffd9e6)' : '#e8d5de') + ';flex-shrink:0;">' +
      '<span style="position:absolute;top:3px;left:' + (on ? '23px' : '3px') + ';width:20px;height:20px;border-radius:50%;background:#fff;transition:left .2s;box-shadow:0 1px 4px rgba(120,70,95,.25);"></span></button>';
  }
  function bindSubToggle(btn, getUidFn, onChange) {
    if (!btn) return;
    btn.addEventListener('click', function () {
      var on = btn.getAttribute('aria-checked') !== 'true';
      btn.setAttribute('aria-checked', on ? 'true' : 'false');
      btn.style.background = on ? 'var(--accent,#ffd9e6)' : '#e8d5de';
      btn.querySelector('span').style.left = on ? '23px' : '3px';
      var done = subWrite(on, getUidFn ? getUidFn() : null);
      if (onChange) onChange(on);
      if (done && done.then) done.then(function (ok) { if (!ok && on) toast(t('订阅已在本机保存（账号资料同步失败）', 'Saved on this device (account sync failed)')); });
    });
  }

  // ===== 邮件退订链接（/shop/?unsub=<token>）：无需登录，直接退订上新通知 =====
  (function () {
    var unsub = new URLSearchParams(location.search).get('unsub');
    if (!unsub) return;
    try { history.replaceState(null, '', location.pathname); } catch (e) {}
    api('rpc/unsubscribe_notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ p_token: unsub }) })
      .then(function (r) { return r.json(); })
      .then(function (ok) {
        try { localStorage.setItem('yuki-notify-new', '0'); } catch (e) {}
        // 持久提示条（toast 会消失，退订结果要留在页面上）
        var bar = document.createElement('div');
        bar.style.cssText = 'max-width:680px;margin:14px auto 0;padding:14px 18px;border-radius:16px;font-size:15px;line-height:1.7;'
          + 'background:var(--accent-soft,#FCE4EC);border:1.5px solid var(--accent,#FFD9E6);color:var(--text,#604C57);text-align:center;';
        bar.innerHTML = ok
          ? '✔ 已退订上新通知，以后不会再收到啦<br><span style="font-size:13px;color:var(--muted,#A88E9B);">订单、发货相关的邮件不受影响，仍会正常发送</span>'
          : '退订链接无效或已过期';
        var anchor = document.querySelector('#view-shop, main, body');
        (anchor || document.body).insertBefore(bar, (anchor || document.body).firstChild);
        toast(ok ? t('已退订上新通知，以后不会再收到啦', 'Unsubscribed from new-item notices') : t('退订链接无效或已过期', 'This unsubscribe link is invalid'));
      })
      .catch(function () { toast(t('退订失败，请稍后再试', 'Unsubscribe failed, please try again')); });
  })();

  // ===== 视图路由 =====
  var LIST_SELS = ['.notice', '#product-grid', '#past', '#reviews', '#pay'];
  function showView(name) {
    LIST_SELS.forEach(function (s) { var el = document.querySelector(s); if (el) el.style.display = (name === 'list') ? '' : 'none'; });
    ['detail', 'cart', 'checkout', 'orders', 'account', 'groups', 'myreviews', 'myquestions'].forEach(function (v) {
      var el = document.getElementById('view-' + v);
      if (el) el.style.display = (v === name) ? 'block' : 'none';
    });
    window.scrollTo(0, 0);
  }

  // ===== 商品详情（淘宝式规格联动）=====
  var DETAIL = null; // {p, sku, qty}
  function variantsOf(p) {
    return (Array.isArray(p.variants) && p.variants.length) ? p.variants : null;
  }
  function currentVariant(p, sku) {
    var vs = variantsOf(p);
    if (!vs) return null;
    return vs.filter(function (v) { return v.sku === sku; })[0] || null;
  }
  function variantStock(v) { return v ? (parseInt(v.stock, 10) || 0) : 0; }
  function openDetail(id, sku, retry) {
    if (!PRODUCTS.length && !(retry > 20)) { setTimeout(function () { openDetail(id, sku, (retry || 0) + 1); }, 250); return; } // 等商品异步加载完
    var p = PRODUCTS.filter(function (x) { return String(x.id) === String(id); })[0];
    var box = document.getElementById('view-detail');
    if (!p) { box.innerHTML = '<p style="text-align:center;color:var(--muted);padding:40px 0;">' + t('商品不存在或已下架', 'Item not found') + '</p>'; showView('detail'); return; }
    var vs = variantsOf(p);
    // 默认规格：URL 指定的 > 第一个有货的 > 第一个
    if (vs) {
      var hit = sku ? currentVariant(p, sku) : null;
      if (!hit) hit = vs.filter(function (v) { return variantStock(v) > 0; })[0] || vs[0];
      sku = hit.sku;
    }
    DETAIL = { p: p, sku: sku || '', qty: 1 };
    box.innerHTML = '';
    box.appendChild(detailEl());
    showView('detail');
    paintDetail();
  }
  function detailEl() {
    var d = DETAIL, p = d.p, vs = variantsOf(p), v = vs ? currentVariant(p, d.sku) : null;
    var st = v ? (variantStock(v) > 0 ? 'on' : 'out') : (p.sold || !(p.stock > 0) ? 'out' : 'on');
    var imgs = v && Array.isArray(v.images) && v.images.length ? v.images : (Array.isArray(p.images) && p.images.length ? p.images : (p.image_url ? [p.image_url] : []));
    var price = v ? (v.price != null ? v.price : p.price) : p.price;
    var skuText = v ? (v.sku || '') : '';
    var el = document.createElement('div');
    el.innerHTML =
      '<a class="back-link" href="/shop/" style="margin-bottom:14px;display:inline-flex;">← ' + t('回小铺', 'Back to shop') + '</a>' +
      '<div class="pdp">' +
        '<div class="d-pager" id="d-pager">' + pagerWrapHtml(imgs.map(normImg), p.name) + '</div>' +
        '<div class="d-info">' +
        '<div class="d-head" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">' +
          '<h2 style="font-size:24px;margin:0;">' + esc(p.name) + '</h2>' +
          '<span class="product-tag">' + esc(p.tag || t('没有标签', 'Untagged')) + '</span>' +
          '<button type="button" class="fav-btn detail-fav' + (isFav(p.id) ? ' on' : '') + '" data-fav="' + escAttr(p.id) + '" aria-label="' + t('收藏', 'Favorite') + '" style="margin-left:auto;">' + svgHeart(isFav(p.id)) + '</button>' +
        '</div>' +
        '<div class="d-price">' +
          '<div style="font-size:26px;color:var(--price,#ff6fa5);font-weight:700;margin:10px 0;">' + sym(curOf(p, v)) + money(price) + '</div>' +
          (skuText ? '<div style="font-size:15px;color:var(--muted);margin-bottom:6px;">SKU: ' + esc(skuText) + '</div>' : '') +
        '</div>' +
        (vs ?
          '<div class="d-variants" style="margin:10px 0;"><div style="font-size:16px;margin-bottom:6px;">' + t('规格', 'Option') + '</div><div id="d-variants" style="display:flex;gap:8px;flex-wrap:wrap;">' +
          vs.map(function (x) {
            var out = variantStock(x) <= 0;
            return '<button type="button" class="sku-chip' + (x.sku === d.sku ? ' on' : '') + (out ? ' dis' : '') + '" data-sku="' + escAttr(x.sku) + '">' + esc(x.name || x.sku) + (out ? ' · ' + t('缺货', 'Out') : '') + '</button>';
          }).join('') + '</div></div>' : '') +
        (st === 'on' ?
          '<div class="d-notice card" style="padding:12px 14px;margin:12px 0 0;background:var(--bg,#FFFBFC);border:1.5px solid var(--accent-soft,#FCE4EC);">' +
            '<b style="font-size:15px;">' + t('购买须知 ♡', 'Before You Order ♡') + '</b>' +
            '<p style="font-size:14px;color:var(--muted);margin:6px 0 0;line-height:1.7;">' +
              t('下单前请仔细阅读商品描述与图片。手工制品与键帽可能存在轻微瑕疵或正常工艺差异，与描述一致的轻微差异不构成退款理由。详细规则见', 'Please review the description and photos carefully. Handmade items and keycaps may have minor imperfections or variations; minor variations consistent with the description are not grounds for refund. See our ') +
              '<a href="/return-policy/" style="color:var(--price,#ff6fa5);text-decoration:underline;">' + t('《退货与退款政策》', 'Return & Refund Policy') + '</a>' + t('。', '.') + '</p>' +
          '</div>' : '') +
        (st === 'on' ?
            '<div class="d-actions" style="margin:12px 0;">' +
              '<div style="display:flex;align-items:center;gap:12px;margin:0 0 12px;">' +
                '<span style="font-size:16px;">' + t('数量', 'Qty') + '</span>' +
                '<button type="button" class="qty-btn" data-d="-1">−</button><b id="d-qty">1</b><button type="button" class="qty-btn" data-d="1">＋</button>' +
                '<span style="font-size:15px;color:var(--muted);">' + t('库存', 'Stock') + ' ' + (v ? variantStock(v) : (p.stock || 0)) + '</span>' +
              '</div>' +
              '<div style="display:flex;gap:10px;flex-wrap:wrap;margin:0;">' +
                '<button class="buy-btn" id="d-add" style="padding:10px 22px;">' + t('加入购物车', 'Add to cart') + '</button>' +
                '<button class="buy-btn" id="d-buy" style="padding:10px 22px;background:var(--accent,#ffd9e6);color:var(--text,#604C57);">' + t('立即购买', 'Buy now') + '</button>' +
              '</div>' +
            '</div>'
          : '<div class="d-actions"><p class="no-buy" style="margin:14px 0;">' + (st === 'out' ? t('已售罄，看看别的吧～', 'Sold out — take a look at other items~') : t('仅展示，不能下单', 'Not for sale')) + '</p></div>') +
        '</div>' +
        '<div class="d-desc"><p style="color:var(--muted);font-size:17px;line-height:1.8;margin:12px 0;">' + esc((window.LANG === 'en' && p.description_en) ? p.description_en : (p.description || '')) + '</p></div>' +
      '</div>' +
      // 20261028p13：键帽商品购买须知（手工/气泡/色差/兼容性/定制/规格；仅键帽类商品显示）
      (isKeycapProduct(p) ? '<div class="keycap-notes-wrap" id="keycap-notes"></div>' : '') +
      '<div id="d-group-form" style="display:none;margin-top:16px;" class="card"></div>';
    return el;
  }
  function escAttr(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
  // 键帽类商品判定：名称/描述/标签含「键帽」或 keycap（不把树脂说明套到不相关商品）
  function isKeycapProduct(p) {
    if (!p) return false;
    return /键帽|keycap/i.test([p.name, p.description, p.description_en, p.tag].join(' '));
  }
  function paintDetail() {
    // 规格 → 图片/价格/库存/SKU 同步刷新
    var d = DETAIL; if (!d) return;
    var fresh = detailEl();
    var box = document.getElementById('view-detail');
    box.innerHTML = '';
    box.appendChild(fresh);
    bindDetail();
    // 键帽购买须知渲染（数据源 js/policy-content.js，与政策页口径一致）
    if (isKeycapProduct(p) && typeof window.renderKeycapNotes === 'function') window.renderKeycapNotes('keycap-notes');
  }
  function bindDetail() {
    var d = DETAIL, p = d.p;
    document.querySelectorAll('#d-variants .sku-chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        if (chip.classList.contains('dis')) { toast(t('这个规格缺货啦，选一个有货的吧', 'This option is out of stock')); return; }
        d.sku = chip.getAttribute('data-sku');
        paintDetail(); // 重建 → 图/价/库存/SKU 同步
        try { history.replaceState(null, '', '?id=' + encodeURIComponent(p.id) + '&sku=' + encodeURIComponent(d.sku)); } catch (e) {}
      });
    });
    document.querySelectorAll('.qty-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        var vs = variantsOf(p); var v = vs ? currentVariant(p, d.sku) : null;
        var max = v ? variantStock(v) : (p.stock || 99);
        d.qty = Math.min(max, Math.max(1, d.qty + parseInt(b.getAttribute('data-d'), 10)));
        var el = document.getElementById('d-qty'); if (el) el.textContent = d.qty;
      });
    });
    var add = document.getElementById('d-add');
    if (add) add.addEventListener('click', function () { addCartFromDetail(false); });
    var buy = document.getElementById('d-buy');
    if (buy) buy.addEventListener('click', function () { addCartFromDetail(true); });
  }
  function addCartFromDetail(goCheckout) {
    var d = DETAIL, p = d.p, vs = variantsOf(p), v = vs ? currentVariant(p, d.sku) : null;
    var price = v ? (v.price != null ? v.price : p.price) : p.price;
    var img = v && Array.isArray(v.images) && v.images.length ? v.images[0] : (Array.isArray(p.images) && p.images.length ? p.images[0] : p.image_url);
    cartAdd({ id: p.id, sku: d.sku, name: p.name + (v ? ' · ' + (v.name || d.sku) : ''), image: img, price: price, currency: curOf(p, v) }, d.qty);
    toast(t('已加入购物车', 'Added to cart'));
    if (goCheckout) { renderCart(); showView('cart'); }
  }

  // ===== 发起拼团 =====
  function openGroupForm() {
    var d = DETAIL, p = d.p, v = variantsOf(p) ? currentVariant(p, d.sku) : null;
    var price = v ? (v.price != null ? v.price : p.price) : p.price;
    var box = document.getElementById('d-group-form');
    box.style.display = '';
    box.innerHTML =
      '<h3 style="font-size:19px;margin-bottom:10px;">' + t('发起拼团', 'Start a group buy') + '</h3>' +
      '<p style="font-size:15px;color:var(--muted);margin-bottom:10px;">' + t('拼团价 <span style="color:var(--price,#ff6fa5);">' + sym(p.currency) + money(price) + '</span>' + ' · 你是团长，把链接分享给小伙伴，人满即成团', 'Group price <span style="color:var(--price,#ff6fa5);">' + sym(p.currency) + money(price) + '</span>' + ' · You are the leader. Share the link — group closes when full.') + '</p>' +
      '<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;">' +
        '<label style="font-size:16px;">' + t('目标人数', 'Target') + ' <input id="g-target" type="number" min="2" max="50" value="2" style="width:70px;padding:8px;border:none;border-radius:10px;background:#fff;font-family:inherit;font-size:17px;"></label>' +
        '<label style="font-size:16px;">' + t('有效小时数', 'Hours open') + ' <input id="g-hours" type="number" min="1" max="720" value="48" style="width:70px;padding:8px;border:none;border-radius:10px;background:#fff;font-family:inherit;font-size:17px;"></label>' +
        '<button class="buy-btn" id="g-go" style="padding:9px 20px;">' + t('创建拼团', 'Create group') + '</button>' +
      '</div>';
    document.getElementById('g-go').addEventListener('click', function () {
      var target = parseInt(document.getElementById('g-target').value, 10) || 2;
      var hours = parseInt(document.getElementById('g-hours').value, 10) || 48;
      if (!USER) { toast(t('发起拼团要先登录哦', 'Please log in first')); renderAccount(); return; }
      var body = {
        product_id: p.id, variant_sku: d.sku || '', name: p.name + (v ? ' · ' + (v.name || '') : ''),
        product_name: p.name, product_image: (v && Array.isArray(v.images) && v.images.length ? v.images[0] : (Array.isArray(p.images) && p.images.length ? p.images[0] : p.image_url)) || '',
        price: price, target: target, joined: 0, status: 'open',
        deadline: new Date(Date.now() + hours * 3600e3).toISOString(), leader_id: null
      };
      getUid().then(function (uid) {
        body.leader_id = uid;
        return api('shop_groups', { method: 'POST', body: JSON.stringify(body) });
      }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (!res.ok || !res.j || !res.j.id) { toast((res.j && res.j.message) || t('创建失败，请先登录', 'Create failed')); return; }
        toast(t('拼团创建成功！现在去下单占座', 'Group created! Now place your order'));
        GROUP_CURRENT = res.j.id;
        openGroupDetail(res.j.id, { autoJoin: true });
      });
    });
  }

  // ===== 拼团 =====
  var GROUP_CURRENT = null, GROUP_TIMER = null;
  function openGroups() {
    showView('groups');
    fetch(SUPABASE_URL + '/rest/v1/shop_groups?select=*&order=created_at.desc&limit=50', { headers: { 'apikey': ANON } })
      .then(function (r) { return r.json(); }).then(function (rows) {
        rows = arr(rows).map(function (g) { if (g.status === 'open' && new Date(g.deadline) < new Date()) g.status = 'failed'; return g; });
        var box = document.getElementById('view-groups');
        var stMap = { open: [t('进行中', 'Open'), 'var(--success,#5FA777)'], success: [t('已成团', 'Success'), 'var(--success,#5FA777)'], failed: [t('已失败', 'Failed'), '#c4bcb6'], cancelled: [t('已取消', 'Cancelled'), '#c4bcb6'] };
        box.innerHTML = '<h2 style="font-size:22px;margin-bottom:14px;">' + t('拼团', 'Group Buys') + '</h2>' +
          (!rows.length ? '<p style="color:var(--muted);text-align:center;padding:30px 0;">' + t('还没有进行中的拼团，来发一个～', 'No group buys yet — start one!') + '</p>' :
          '<div class="grid">' + rows.map(function (g) {
            var st = stMap[g.status] || stMap.open;
            var full = g.joined >= g.target;
            return '<div class="product" data-gid="' + escAttr(g.id) + '" style="cursor:pointer;">' +
              '<div class="product-img">' + (g.product_image ? '<img src="' + escAttr(normImg(g.product_image)) + '" style="width:100%;height:100%;object-fit:cover;">' : '') +
                '<span class="st" style="background:' + st[1] + ';">' + st[0] + '</span></div>' +
              '<div class="product-info"><span class="product-tag">' + t('拼团价', 'Group price') + '</span>' +
                '<h3>' + esc(g.name || g.product_name) + '</h3>' +
                '<div style="font-size:22px;color:var(--price,#ff6fa5);font-weight:700;">' + sym(g.currency) + money(g.price) + '</div>' +
                '<div style="font-size:15px;color:var(--muted);margin-top:4px;">' + g.joined + '/' + g.target + ' ' + t('人', 'joined') +
                (g.status === 'open' ? ' · ' + t('截止', 'Ends') + ' ' + new Date(g.deadline).toLocaleString() : '') + '</div>' +
                (g.status === 'open' && !full ? '<div class="product-row"><button class="buy-btn">' + t('去参团', 'Join') + '</button></div>' : '') +
              '</div></div>';
          }).join('') + '</div>');
        box.querySelectorAll('[data-gid]').forEach(function (card) {
          card.addEventListener('click', function () { openGroupDetail(card.getAttribute('data-gid')); });
        });
      });
  }
  function openGroupDetail(gid, opts) {
    opts = opts || {};
    if (GROUP_TIMER) { clearInterval(GROUP_TIMER); GROUP_TIMER = null; }
    fetch(SUPABASE_URL + '/rest/v1/shop_groups?select=*&id=eq.' + gid, { headers: { 'apikey': ANON } })
      .then(function (r) { return r.json(); }).then(function (rows) {
        var g = rows && rows[0];
        var box = document.getElementById('view-groups');
        if (!g) { box.innerHTML = '<p style="color:var(--muted);text-align:center;padding:30px 0;">' + t('拼团不存在', 'Group not found') + '</p>'; return; }
        if (g.status === 'open' && new Date(g.deadline) < new Date()) g.status = 'failed';
        var memberQ = USER ? api('shop_group_members?select=nickname,user_id,created_at&group_id=eq.' + gid) : Promise.resolve({ json: function () { return []; } });
        memberQ.then(function (r) { return r.json(); }).then(function (members) {
          members = arr(members);
          var stText = { open: t('进行中', 'Open'), success: t('已成团', 'Success'), failed: t('已失败', 'Failed'), cancelled: t('已取消', 'Cancelled') }[g.status];
          box.innerHTML =
            '<a class="back-link" href="/shop/?sec=groups" style="margin-bottom:14px;display:inline-flex;">← ' + t('全部拼团', 'All groups') + '</a>' +
            '<div class="card" style="padding:18px;">' +
              '<div style="display:grid;grid-template-columns:180px 1fr;gap:18px;">' +
                (g.product_image ? '<img src="' + escAttr(normImg(g.product_image)) + '" style="width:180px;height:180px;object-fit:cover;border-radius:14px;">' : '') +
                '<div><h2 style="font-size:22px;">' + esc(g.name || g.product_name) + '</h2>' +
                  '<div style="font-size:26px;color:var(--price,#ff6fa5);font-weight:700;margin:6px 0;">' + sym(g.currency) + money(g.price) + '</div>' +
                  '<div style="font-size:16px;">' + t('已参团', 'Joined') + ' <b>' + g.joined + '</b> / ' + g.target + ' ' + t('人', 'people') + '</div>' +
                  '<div style="font-size:16px;color:var(--muted);margin-top:4px;">' + (g.status === 'open' ? t('截止', 'Ends') + ' <b id="g-countdown"></b>' : stText) + '</div>' +
                '</div>' +
              '</div>' +
              (g.status === 'open' ?
                '<div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap;">' +
                  (g.joined < g.target ? '<button class="buy-btn" id="g-join" style="padding:10px 24px;background:var(--accent,#ffd9e6);color:var(--text,#604C57);">' + t('加入拼团', 'Join group') + '</button>' : '<span class="no-buy">' + t('人数已满，等待成员付款中', 'Full — waiting for payments') + '</span>') +
                '</div>' : '') +
              '<div style="margin-top:14px;font-size:15px;color:var(--muted);">' + t('成员', 'Members') + '：' +
                (members.length ? members.map(function (m) { return esc(m.nickname || t('小伙伴', 'member')); }).join('、') : t('虚位以待…', 'Waiting…')) +
              '</div>' +
              '<p style="font-size:14px;color:var(--muted);margin-top:10px;">' + t('满员后所有成员付款验证通过才算成团；超时未满员自动失败，订单可取消。', 'A group closes only when full AND every member\'s payment is confirmed. If time runs out, it fails and orders can be cancelled.') + '</p>' +
            '</div>';
          var join = document.getElementById('g-join');
          if (join) join.addEventListener('click', function () { joinGroup(g); });
          if (g.status === 'open') {
            GROUP_TIMER = setInterval(function () {
              var cd = document.getElementById('g-countdown');
              if (!cd) { clearInterval(GROUP_TIMER); return; }
              var ms = new Date(g.deadline) - new Date();
              if (ms <= 0) { cd.textContent = t('已截止', 'Ended'); clearInterval(GROUP_TIMER); return; }
              var h = Math.floor(ms / 3600e3), m2 = Math.floor(ms % 3600e3 / 60e3), s2 = Math.floor(ms % 60e3 / 1e3);
              cd.textContent = h + ':' + String(m2).padStart(2, '0') + ':' + String(s2).padStart(2, '0');
            }, 1000);
          }
        });
        if (opts.autoJoin) setTimeout(function () { var j = document.getElementById('g-join'); if (j) j.click(); }, 300);
      });
  }
  function joinGroup(g) {
    if (!USER) { toast(t('参团要先登录哦', 'Please log in first')); renderAccount(); return; }
    // 有规格的商品 → 去详情页选规格后下单；无规格 → 直接 RPC 下单
    var p = PRODUCTS.filter(function (x) { return String(x.id) === String(g.product_id); })[0];
    if (p && variantsOf(p)) {
      toast(t('先选好规格，下单时会自动加入这个团', 'Pick an option — checkout will join this group'));
      sessionStorage.setItem('yuki-join-group', g.id);
      openDetail(g.product_id, g.variant_sku);
      return;
    }
    placeOrder([{ id: g.product_id, sku: g.variant_sku || '', qty: 1 }], null, '', '', g.id);
  }

  // ===== 结算 / 下单 =====
  var ADDR = [];
  function loadAddr() {
    if (!USER) return Promise.resolve([]);
    return api('shop_addresses?select=*&order=created_at.desc').then(function (r) { return r.json(); }).then(function (rows) { ADDR = arr(rows); return ADDR; });
  }
  function placeOrder(items, addr, note, coupon, groupId) {
    var btn = document.getElementById('ck-submit');
    // 双保险：非 uuid 的残留商品直接滤掉，不让它到数据库里炸
    items = (items || []).filter(function (x) { return UUID_RE.test(String(x.id || '')); });
    if (!items.length) { toast(t('购物车里的商品已失效，请重新加入', 'Cart items expired — add them again')); return; }
    if (btn) { btn.disabled = true; btn.textContent = t('提交中…', 'Submitting…'); }
    getUid().then(function (uid) {
      return rpc('shop_place_order', {
        p_items: items, p_address: addr, p_note: note || '', p_coupon: coupon || '',
        p_group_id: groupId || null, p_client_token: 'ct-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)
      });
    }).then(function (res) {
      if (btn) { btn.disabled = false; btn.textContent = t('提交订单', 'Place order'); }
      if (!res.ok) {
        var msg = res.data && (res.data.message || res.data.msg);
        toast(msg || t('下单失败，再试一次', 'Order failed, try again'));
        return;
      }
      // 从购物车移除已下单项
      var ids = items.map(function (x) { return cartKey(x.id, x.sku); });
      CART = CART.filter(function (x) { return ids.indexOf(cartKey(x.id, x.sku)) === -1; });
      saveCart();
      toast(t('下单成功！', 'Order placed!'));
      if (groupId) sessionStorage.setItem('yuki-join-group', groupId);
      openOrders(res.data.order_id);
    });
  }
  // 运费估算（Pirate Ship 口径：USPS Ground Advantage 商业费率近似）
  // 按 收货地 ZIP 首位 → 区位（发货地 926xx 加州），包裹重量查费率表；发货前以 Pirate Ship 实际价为准
  function shipBase(zip, oz) {
    var z = String(zip || '').replace(/\D/g, '');
    if (!z) return 0; // 没地址时不估，让服务端用默认值
    var zoneIdx = { '9': 0, '8': 1, '7': 2, '6': 3, '5': 4, '4': 5, '3': 6, '2': 7 };
    var zi = zoneIdx[z[0]]; if (zi == null) zi = 7;
    oz = Math.max(1, parseFloat(oz) || 0); if (oz > 70 * 16) oz = 70 * 16;
    var T4 = [4.15, 4.35, 4.60, 4.85, 5.15, 5.45, 5.75, 6.15];
    var T8 = [4.60, 4.90, 5.25, 5.60, 6.00, 6.45, 6.90, 7.45];
    var T12 = [5.00, 5.40, 5.90, 6.45, 7.00, 7.60, 8.15, 8.85];
    var T16 = [5.40, 5.95, 6.55, 7.25, 8.05, 8.80, 9.50, 10.30];
    var ADD = [0.55, 0.70, 0.90, 1.10, 1.35, 1.55, 1.80, 2.05];
    var base;
    if (oz <= 4) base = T4[zi];
    else if (oz <= 8) base = T8[zi];
    else if (oz <= 12) base = T12[zi];
    else if (oz <= 16) base = T16[zi];
    else base = T16[zi] + Math.ceil((oz - 16) / 16) * ADD[zi];
    return Math.round(base * 100) / 100;
  }
  function renderCheckout() {
    if (!USER) { pendingAfterLogin = 'checkout'; renderAccount(); toast(t('先登录再结算哦', 'Log in to check out')); return; }
    var sel = CART.filter(function (x) { return x.checked !== false; });
    var box = document.getElementById('view-checkout');
    if (!sel.length) { box.innerHTML = '<p style="color:var(--muted);text-align:center;padding:40px 0;">' + t('没有勾选要结算的商品', 'Nothing selected to check out') + '</p>'; showView('checkout'); return; }
    // 一单一币：美元和人民币不直接相加，混合时提示分开下单
    var curs = {}; sel.forEach(function (x) { curs[curOf(null, x)] = 1; });
    var curList = Object.keys(curs);
    if (curList.length > 1) {
      box.innerHTML = '<p style="color:var(--muted);text-align:center;padding:40px 0;">' +
        t('购物车里同时有美元和人民币的商品，不能一起结算，请分开下单～', 'Your cart mixes USD and CNY items — they cannot be checked out together. Please place separate orders.') + '</p>';
      showView('checkout'); return;
    }
    var cur = curList[0] || 'CNY';
    var sub = 0; sel.forEach(function (x) { sub += x.price * x.qty; });
    Promise.all([loadAddr(), fetch(SUPABASE_URL + '/rest/v1/site_settings?select=value&key=eq.shop_ship', { headers: { 'apikey': ANON } }).then(function (r) { return r.json(); })]).then(function (res) {
      var ship = {}; try { ship = JSON.parse((res[1] && res[1][0] && res[1][0].value) || '{}'); } catch (e) {}
      var fee = parseFloat(ship.service_fee); if (isNaN(fee)) fee = 2;
      // 估算运费：按包裹重量 + 收货地（与 shop_place_order 服务端同一套算法）
      var woz = 0; sel.forEach(function (x) {
        var p = PRODUCTS.filter(function (p2) { return String(p2.id) === String(x.id); })[0];
        woz += (parseFloat(p && p.weight_oz) || 0) * x.qty;
      });
      function ckZip() { var a = ADDR.filter(function (x) { return String(x.id) === String(ckAddrId); })[0]; return a ? (a.zip || '') : ''; }
      var est = shipBase(ckZip(), woz);
      function updateShip() {
        est = shipBase(ckZip(), woz);
        var l = document.getElementById('ck-ship-line'); if (l) l.textContent = ckZip() ? (sym(cur) + money(est + fee)) : t('选好收货地址后显示', 'Pick an address first');
        var tt = document.getElementById('ck-total'); if (tt) tt.textContent = sym(cur) + money(sub + est + fee);
      }
      var joinGid = sessionStorage.getItem('yuki-join-group') || '';
      box.innerHTML =
        '<h2 style="font-size:22px;margin-bottom:14px;">' + t('确认订单', 'Checkout') + '</h2>' +
        '<div class="card" style="padding:18px;margin-bottom:14px;"><b style="font-size:17px;">' + t('商品', 'Items') + '</b>' +
          sel.map(function (x) { return '<div style="display:flex;justify-content:space-between;font-size:16px;margin-top:6px;"><span>' + esc(x.name) + ' × ' + x.qty + '</span><span style="color:var(--price,#ff6fa5);">' + sym(cur) + money(x.price * x.qty) + '</span></div>'; }).join('') +
          '<div style="display:flex;justify-content:space-between;font-size:17px;margin-top:10px;border-top:1px dashed var(--accent-soft);padding-top:8px;"><span>' + t('商品小计', 'Subtotal') + '</span><b style="color:var(--price,#ff6fa5);">' + sym(cur) + money(sub) + '</b></div>' +
        '</div>' +
        '<div class="card" style="padding:18px;margin-bottom:14px;"><b style="font-size:17px;">' + t('收货地址', 'Shipping address') + '</b><div id="ck-addr" style="margin-top:8px;"></div>' +
          '<button class="buy-btn" id="ck-new-addr" style="margin-top:8px;padding:7px 16px;">' + t('＋ 新地址', '+ New address') + '</button>' +
          '<div id="ck-addr-form" style="display:none;margin-top:10px;"></div>' +
        '</div>' +
        '<div class="card" style="padding:18px;margin-bottom:14px;"><b style="font-size:17px;">' + t('运费', 'Shipping') + '</b>' +
          '<div style="display:flex;justify-content:space-between;font-size:17px;margin-top:8px;"><span>' + t('运费（含打包服务费）', 'Shipping (incl. handling)') + '</span><b id="ck-ship-line" style="color:var(--price,#ff6fa5);">' + sym(cur) + money(est + fee) + '</b></div>' +
          '<p style="font-size:14px;color:var(--muted);margin-top:4px;">' + t('按重量和收货地估算，发货前以 Pirate Ship 实际运费为准，多退少补。', 'Estimated by weight & destination; final Pirate Ship rate confirmed before shipping.') + '</p>' +
        '</div>' +
        '<div class="card" style="padding:18px;margin-bottom:14px;"><b style="font-size:17px;">' + t('优惠码', 'Coupon') + '</b>' +
          '<div style="display:flex;gap:8px;margin-top:8px;"><input id="ck-coupon" placeholder="' + t('有优惠码就填这里', 'Coupon code') + '" style="flex:1;padding:10px 14px;font-size:17px;border:1.5px solid var(--accent-soft,#FCE4EC);border-radius:12px;background:#fff;outline:none;color:var(--text);font-family:inherit;"></div>' +
          '<label style="display:block;margin-top:10px;font-size:16px;">' + t('订单备注', 'Order note') + '<textarea id="ck-note" style="width:100%;min-height:60px;border:1.5px solid var(--accent-soft,#FCE4EC);border-radius:12px;background:#fff;padding:10px 14px;font-family:inherit;font-size:17px;color:var(--text);resize:none;outline:none;margin-top:4px;box-sizing:border-box;"></textarea></label>' +
        '</div>' +
        '<div class="card" style="padding:18px;"><div style="display:flex;justify-content:space-between;font-size:19px;"><b>' + t('预估合计', 'Estimated total') + '</b><b id="ck-total" style="color:var(--price,#ff6fa5);">' + sym(cur) + money(sub + est + fee) + '</b></div>' +
          '<p style="font-size:14px;color:var(--muted);margin-top:4px;">' + t('以服务端验证后的金额为准；实际运费由后台确认后更新。', 'Final amount is validated server-side; shipping updates once confirmed.') + '</p>' +
          '<button class="buy-btn" id="ck-submit" style="width:100%;margin-top:12px;padding:12px;background:var(--accent,#ffd9e6);color:var(--text,#604C57);font-size:18px;">' + t('提交订单', 'Place order') + '</button>' +
        '</div>';
      paintAddrPicker();
      window.__ckUpdateShip = updateShip;
      updateShip();
      document.getElementById('ck-new-addr').addEventListener('click', function () { addrForm('ck-addr-form', null, function () { loadAddr().then(function () { paintAddrPicker(); updateShip(); }); }); });
      document.getElementById('ck-submit').addEventListener('click', function () {
        var a = ADDR.filter(function (x) { return String(x.id) === String(ckAddrId); })[0];
        if (!a) { toast(t('选一个收货地址呀', 'Pick a shipping address')); return; }
        placeOrder(sel.map(function (x) { return { id: x.id, sku: x.sku, qty: x.qty }; }),
          { name: a.name, phone: a.phone, street: a.street, city: a.city, state: a.state, zip: a.zip, country: a.country },
          document.getElementById('ck-note').value.trim(), document.getElementById('ck-coupon').value.trim(), joinGid || null);
      });
      showView('checkout');
    });
  }
  var ckAddrId = null;
  function paintAddrPicker() {
    var box = document.getElementById('ck-addr');
    if (!ADDR.length) { box.innerHTML = '<p style="color:var(--muted);font-size:15px;">' + t('还没有地址，点下面添加', 'No addresses yet — add one below') + '</p>'; return; }
    if (!ckAddrId || !ADDR.filter(function (x) { return x.id === ckAddrId; }).length) {
      var def = ADDR.filter(function (x) { return x.is_default; })[0] || ADDR[0];
      ckAddrId = def.id;
    }
    // 按收件人名字排（不用 A-Z 字母导航，她 2026-10-25 要求删掉）
    var list = ADDR.slice().sort(function (a, b) { return String(a.name || '').localeCompare(String(b.name || ''), 'zh-u-co-pinyin'); });
    var html = '<div>' + list.map(function (a) {
      return '<label style="display:flex;gap:8px;align-items:flex-start;padding:10px;border-radius:12px;background:' + (a.id === ckAddrId ? 'var(--card-hover)' : '#fff') + ';margin-bottom:6px;cursor:pointer;" data-aid="' + escAttr(a.id) + '">' +
        '<span class="addr-dot" style="width:16px;height:16px;border-radius:50%;border:2px solid var(--muted,#A88E9B);margin-top:4px;flex-shrink:0;background:' + (a.id === ckAddrId ? 'var(--accent,#ffd9e6)' : 'transparent') + ';"></span>' +
        '<span style="font-size:16px;">' + esc(a.name) + ' · ' + esc(a.phone) + '<br><span style="color:var(--muted);">' + esc(a.street + ', ' + a.city + ', ' + a.state + ' ' + a.zip + ', ' + a.country) + '</span></span></label>';
    }).join('') + '</div>';
    box.innerHTML = html;
    box.querySelectorAll('[data-aid]').forEach(function (lab) {
      lab.addEventListener('click', function () { ckAddrId = lab.getAttribute('data-aid'); paintAddrPicker(); if (window.__ckUpdateShip) window.__ckUpdateShip(); });
    });
  }
  function addrForm(containerId, existing, done) {
    var box = document.getElementById(containerId);
    box.style.display = '';
    var e = existing || {};
    box.innerHTML =
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
        '<input id="af-name" placeholder="' + t('收件人姓名 *', 'Full name *') + '" value="' + escAttr(e.name || '') + '">' +
        '<input id="af-phone" placeholder="' + t('电话 *', 'Phone *') + '" value="' + escAttr(e.phone || '') + '">' +
        '<input id="af-street" placeholder="' + t('街道地址 *', 'Street *') + '" value="' + escAttr(e.street || '') + '" style="grid-column:1/-1;">' +
        '<input id="af-city" placeholder="' + t('城市 *', 'City *') + '" value="' + escAttr(e.city || '') + '">' +
        '<input id="af-state" placeholder="' + t('州/省', 'State') + '" value="' + escAttr(e.state || '') + '">' +
        '<input id="af-zip" placeholder="' + t('ZIP Code', 'ZIP Code') + '" value="' + escAttr(e.zip || '') + '">' +
        '<input id="af-country" placeholder="' + t('国家', 'Country') + '" value="' + escAttr(e.country || 'United States') + '">' +
      '</div>' +
      '<div style="display:flex;gap:8px;margin-top:8px;"><button class="buy-btn" id="af-save" style="padding:8px 18px;">' + t('保存', 'Save') + '</button>' +
      '<button class="buy-btn" id="af-cancel" style="padding:8px 18px;background:#fff;color:var(--muted);">' + t('取消', 'Cancel') + '</button></div>';
    box.querySelectorAll('input').forEach(function (i) {
      i.style.cssText = 'width:100%;padding:10px 12px;font-size:16px;border:1.5px solid var(--accent-soft,#FCE4EC);border-radius:12px;background:#fff;outline:none;color:var(--text,#604C57);font-family:inherit;box-sizing:border-box;transition:border-color .15s;';
      i.addEventListener('focus', function () { i.style.borderColor = 'var(--card-hover,#FCE4EC)'; });
      i.addEventListener('blur', function () { i.style.borderColor = 'var(--accent-soft,#FCE4EC)'; });
    });
    document.getElementById('af-cancel').addEventListener('click', function () { box.style.display = 'none'; });
    document.getElementById('af-save').addEventListener('click', function () {
      var body = {
        name: document.getElementById('af-name').value.trim(), phone: document.getElementById('af-phone').value.trim(),
        street: document.getElementById('af-street').value.trim(), city: document.getElementById('af-city').value.trim(),
        state: document.getElementById('af-state').value.trim(), zip: document.getElementById('af-zip').value.trim(),
        country: document.getElementById('af-country').value.trim() || 'United States'
      };
      if (!body.name || !body.street || !body.city) { toast(t('姓名/街道/城市要填哦', 'Name / street / city required')); return; }
      var p = existing ? api('shop_addresses?id=eq.' + existing.id, { method: 'PATCH', body: JSON.stringify(body) })
                       : getUid().then(function (uid) { body.user_id = uid; return api('shop_addresses', { method: 'POST', body: JSON.stringify(body) }); });
      p.then(function (r) {
        if (!r.ok) { toast(t('保存失败，要先登录哦', 'Save failed — log in first')); return; }
        toast(t('地址已保存', 'Address saved'));
        box.style.display = 'none';
        done && done();
      });
    });
  }

  // ===== 我的订单 =====
  var ST_LABEL = {
    pending: ['待付款', 'Awaiting payment', 'var(--warning,#E0A458)'], reviewing: ['待审核付款', 'Payment under review', 'var(--warning,#E0A458)'],
    rejected: ['凭证有误', 'Proof rejected', 'var(--danger,#D96570)'], paid: ['已付款·待发货', 'Paid · to ship', 'var(--success,#5FA777)'],
    shipped: ['已发货', 'Shipped', '#7fb8e8'], completed: ['已完成', 'Completed', 'var(--success,#5FA777)'],
    cancelled: ['已取消', 'Cancelled', '#c4bcb6'], refunding: ['退款处理中', 'Refund processing', 'var(--warning,#E0A458)'], refunded: ['已退款', 'Refunded', '#c4bcb6']
  };
  function trackUrlOf(carrier, no) {
    if (!no) return '';
    if (/ups/i.test(carrier)) return 'https://www.ups.com/track?tracknum=' + encodeURIComponent(no);
    if (/usps/i.test(carrier)) return 'https://tools.usps.com/go/TrackConfirmAction?tLabels=' + encodeURIComponent(no);
    if (/fedex/i.test(carrier)) return 'https://www.fedex.com/fedextrack/?trknumber=' + encodeURIComponent(no);
    return 'https://www.google.com/search?q=' + encodeURIComponent('tracking ' + no);
  }
  function proofUrl(order) {
    // 私有桶：用自己的 token 换已认证读取流
    if (!order.pay_url || !USER) return Promise.resolve('');
    var path = order.pay_url.replace(/^.*\/object\/(public|authenticated)\/pay\//, '');
    return fetch(SUPABASE_URL + '/storage/v1/object/authenticated/pay/' + path, { headers: { 'apikey': ANON, 'Authorization': 'Bearer ' + USER.a } })
      .then(function (r) { return r.ok ? r.blob() : null; }).then(function (b) { return b ? URL.createObjectURL(b) : ''; });
  }
  function openOrders(focusId) {
    if (!USER) { pendingAfterLogin = 'orders'; renderAccount(); toast(t('先登录查看订单哦', 'Log in to see orders')); return; }
    showView('orders');
    var box = document.getElementById('view-orders');
    box.innerHTML = '<h2 style="font-size:22px;margin-bottom:14px;">' + t('我的订单', 'My Orders') + '</h2><p style="color:var(--muted);text-align:center;">' + t('加载中…', 'Loading…') + '</p>';
    api('shop_orders?select=*&order=created_at.desc&limit=50').then(function (r) { return r.json(); }).then(function (rows) {
      rows = rows || [];
      if (!rows.length) { box.innerHTML += '<p style="color:var(--muted);text-align:center;padding:30px 0;">' + t('还没有订单，去小铺逛逛吧～', 'No orders yet — go shopping~') + '</p>'; return; }
      box.innerHTML = '<h2 style="font-size:22px;margin-bottom:14px;">' + t('我的订单', 'My Orders') + '</h2>' +
        '<div id="order-list">' + rows.map(function (o) { return orderCard(o); }).join('') + '</div>';
      rows.forEach(function (o) { bindOrderCard(o, box, focusId); });
    });
  }
  function orderCard(o) {
    var st = ST_LABEL[o.status] || [o.status, o.status, '#c4bcb6'];
    return '<div class="card" id="oc-' + o.id + '" style="padding:16px;margin-bottom:12px;">' +
      '<div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px;align-items:center;">' +
        '<b style="font-size:17px;">' + esc(o.order_no) + '</b>' +
        '<span style="font-size:14px;color:#fff;background:' + st[2] + ';border-radius:999px;padding:3px 12px;">' + esc(st[0]) + '</span>' +
      '</div>' +
      '<div style="font-size:15px;color:var(--muted);margin-top:2px;">' + new Date(o.created_at).toLocaleString() + '</div>' +
      (o.items || []).map(function (it) {
        return '<div style="display:flex;gap:12px;align-items:center;margin-top:10px;padding-top:10px;border-top:1px solid var(--accent-soft,#FCE4EC);">' +
          (it.image ? '<a href="/shop/?id=' + escAttr(it.id) + '" target="_blank" style="text-decoration:none;"><img src="' + escAttr(normImg(it.image)) + '" style="width:56px;height:56px;border-radius:12px;object-fit:cover;flex-shrink:0;"></a>' : '<div style="width:56px;height:56px;border-radius:12px;background:var(--accent-soft,#FCE4EC);flex-shrink:0;display:flex;align-items:center;justify-content:center;color:var(--muted,#A88E9B);font-size:20px;">♡</div>') +
          '<div style="flex:1;min-width:0;">' +
            '<div style="font-size:16px;color:var(--text,#604C57);font-weight:600;">' + esc(it.name) + '</div>' +
            (it.sku ? '<div style="font-size:13px;color:var(--muted,#A88E9B);margin-top:2px;">' + t('规格', 'Option') + '：' + esc(it.sku) + '</div>' : '') +
            '<div style="font-size:14px;color:var(--price,#ff6fa5);font-weight:600;margin-top:2px;">' + sym(o.currency) + money(it.price) + ' × ' + it.qty + '</div>' +
          '</div>' +
          '<div style="font-size:16px;color:var(--price,#ff6fa5);font-weight:700;flex-shrink:0;">' + sym(o.currency) + money(it.price * it.qty) + '</div></div>';
      }).join('') +
      '<div style="display:flex;justify-content:space-between;font-size:17px;margin-top:10px;border-top:1.5px dashed var(--accent-soft);padding-top:10px;">' +
        '<span>' + t('应付', 'Total') + '</span><b style="color:var(--price,#ff6fa5);">' + sym(o.currency) + money(o.total) + '</b></div>' +
      '<div id="oc-body-' + o.id + '" style="display:none;margin-top:10px;"></div>' +
      '<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">' +
        '<button class="buy-btn oc-more" data-oid="' + escAttr(o.id) + '" style="padding:7px 16px;">' + t('详情 / 付款', 'Details / Pay') + '</button></div>' +
    '</div>';
  }
  function bindOrderCard(o, box, focusId) {
    var card = box.querySelector('#oc-' + o.id);
    var more = card.querySelector('.oc-more');
    more.addEventListener('click', function () {
      var body = card.querySelector('#oc-body-' + o.id);
      if (body.style.display !== 'none') { body.style.display = 'none'; return; }
      body.style.display = '';
      renderOrderBody(o, body);
    });
    if (focusId && o.id === focusId) more.click();
  }
  function renderOrderBody(o, body) {
    var st = ST_LABEL[o.status] || ['', '', ''];
    var addr = o.address || {};
    var html =
      '<div style="font-size:15px;color:var(--muted);line-height:1.7;">' +
        t('收货', 'Ship to') + '：' + esc(addr.name || '') + ' · ' + esc(addr.phone || '') + '<br>' +
        esc([addr.street, addr.city, addr.state, addr.zip, addr.country].filter(Boolean).join(', ')) +
      '</div>' +
      (o.reject_reason ? '<p style="font-size:15px;color:var(--danger,#D96570);margin-top:6px;">' + t('凭证有误：', 'Proof rejected: ') + esc(o.reject_reason) + '</p>' : '') +
      ((o.note || o.coupon) ? '<div style="font-size:15px;color:var(--muted);margin-top:6px;">' +
        (o.note ? t('订单备注', 'Note') + '：' + esc(o.note) : '') +
        (o.note && o.coupon ? '　·　' : '') +
        (o.coupon ? t('优惠码', 'Coupon') + '：' + esc(o.coupon) : '') + '</div>' : '') +
      (o.discount ? '<div style="font-size:15px;color:#9ecfae;margin-top:4px;">' + t('优惠码已减', 'Coupon saved') + ' ' + sym(o.currency) + money(o.discount) + '</div>' : '') +
      (o.carrier ? '<p style="font-size:15px;margin-top:6px;">' + t('物流', 'Shipping') + '：' + esc(o.carrier) + ' <a href="' + escAttr(trackUrlOf(o.carrier, o.tracking)) + '" target="_blank" style="color:var(--text,#604C57);">' + esc(o.tracking) + ' ↗</a>' +
        (o.shipped_at ? ' · ' + new Date(o.shipped_at).toLocaleDateString() : '') + '</p>' : '') +
      '<div style="font-size:15px;color:var(--muted);margin-top:6px;">' + t('明细', 'Breakdown') + '：<span style="color:var(--price,#ff6fa5);">' + sym(o.currency) + money(o.subtotal) + '</span>' + (o.discount > 0 ? ' − 优惠 <span style="color:var(--price,#ff6fa5);">' + sym(o.currency) + money(o.discount) + '</span>' : '') + ' + 运费 <span style="color:var(--price,#ff6fa5);">' + sym(o.currency) + money(o.shipping_actual != null ? o.shipping_actual : o.shipping_est) + '</span>' + ' + 服务费 <span style="color:var(--price,#ff6fa5);">' + sym(o.currency) + money(o.service_fee) + '</span>' + '</div>' +
      '<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">';
    if (o.status === 'pending' || o.status === 'rejected') {
      html += '<button class="buy-btn oc-stripe" style="padding:8px 18px;background:var(--accent,#ffd9e6);color:var(--text,#604C57);">' + t('在线支付（Stripe 测试）', 'Pay online (Stripe test)') + '</button>';
      html += '<button class="buy-btn oc-pay" style="padding:8px 18px;background:var(--accent,#ffd9e6);color:var(--text,#604C57);">' + t('上传付款截图', 'Upload payment proof') + '</button>';
    }
    if (o.status === 'reviewing') html += '<span class="no-buy">' + t('凭证已提交，等柚子确认～', 'Proof submitted — awaiting confirmation~') + '</span>';
    if (['pending', 'reviewing', 'rejected'].indexOf(o.status) >= 0) {
      html += '<button class="buy-btn oc-cancel" style="padding:8px 18px;background:#fff;color:var(--muted);">' + t('取消订单', 'Cancel order') + '</button>';
    }
    if (o.status === 'shipped') html += '<button class="buy-btn oc-done" style="padding:8px 18px;">' + t('确认收货', 'Confirm received') + '</button>';
    html += '<button class="buy-btn oc-msg" style="padding:8px 18px;background:#fff;">' + t('留言 / 售后', 'Messages') + '</button>';
    html += '</div><div class="oc-pay-box" style="display:none;margin-top:10px;"></div><div class="oc-msg-box" style="display:none;margin-top:10px;"></div>';
    body.innerHTML = html;
    var payBtn = body.querySelector('.oc-pay');
    if (payBtn) payBtn.addEventListener('click', function () { renderPayUpload(o, body.querySelector('.oc-pay-box')); });
    var stripeBtn = body.querySelector('.oc-stripe');
    if (stripeBtn) stripeBtn.addEventListener('click', function () {
      if (!USER || !USER.a) { toast(t('先登录再支付哦', 'Log in first')); return; }
      stripeBtn.disabled = true; stripeBtn.textContent = t('正在创建支付…', 'Creating payment…');
      fetch(SUPABASE_URL + '/functions/v1/stripe-checkout', {
        method: 'POST',
        headers: { 'apikey': ANON, 'Authorization': 'Bearer ' + USER.a, 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: o.id, origin: location.origin })
      }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); }).then(function (x) {
        if (x.ok && x.j && x.j.url) { location.href = x.j.url; return; } // 跳 Stripe 收银台
        stripeBtn.disabled = false; stripeBtn.textContent = t('在线支付（Stripe 测试）', 'Pay online (Stripe test)');
        toast((x.j && (x.j.error || x.j.message)) || t('在线支付暂时不可用', 'Online payment unavailable'));
      }).catch(function () {
        stripeBtn.disabled = false; stripeBtn.textContent = t('在线支付（Stripe 测试）', 'Pay online (Stripe test)');
        toast(t('网络异常，再试一次', 'Network error, try again'));
      });
    });
    var cancelBtn = body.querySelector('.oc-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', function () {
      if (!confirmZh(t('确定取消这个订单吗？', 'Cancel this order?'))) return;
      rpc('shop_cancel_order', { p_order_id: o.id }).then(function (res) {
        if (!res.ok) { toast((res.data && res.data.message) || t('取消失败', 'Cancel failed')); return; }
        toast(t('已取消', 'Cancelled')); openOrders();
      });
    });
    var doneBtn = body.querySelector('.oc-done');
    if (doneBtn) doneBtn.addEventListener('click', function () {
      api('shop_orders?id=eq.' + o.id, { method: 'PATCH', body: JSON.stringify({ status: 'completed' }) }).then(function (r) {
        if (!r.ok) { toast(t('操作失败', 'Failed')); return; }
        toast(t('已确认收货，谢谢～', 'Confirmed, thank you~')); openOrders();
      });
    });
    var msgBtn = body.querySelector('.oc-msg');
    if (msgBtn) msgBtn.addEventListener('click', function () { renderOrderMsgs(o, body.querySelector('.oc-msg-box')); });
    // 已传过凭证 → 显示缩略图
    if (o.pay_url) {
      proofUrl(o).then(function (u) {
        if (u) { var img = document.createElement('img'); img.src = u; img.style.cssText = 'width:90px;height:90px;object-fit:cover;border-radius:10px;margin-top:8px;'; body.appendChild(img); }
      });
    }
    // 包裹物流（多包裹：shop_packages；旧单回退订单自带字段）
    var pkBox = document.createElement('div');
    body.appendChild(pkBox);
    api('shop_packages?select=*&order_id=eq.' + o.id + '&order=created_at.asc').then(function (r) { return r.json(); }).then(function (rows) {
      var pks = arr(rows);
      var list = pks.length ? pks.map(function (p) { return { carrier: p.carrier, tracking: p.tracking, track_url: p.track_url, shipped_at: p.shipped_at, note: p.note }; })
        : (o.tracking ? [{ carrier: o.carrier, tracking: o.tracking, track_url: o.track_url, shipped_at: o.shipped_at, note: o.ship_note }] : []);
      if (!list.length) return;
      pkBox.innerHTML = '<div style="font-size:16px;font-weight:700;margin-top:10px;">' + t('包裹物流', 'Packages') + '</div>' + list.map(function (p, i) {
        return '<div style="font-size:15px;color:var(--text);margin-top:6px;">' + t('包裹', 'Package') + ' ' + (i + 1) + '：' + esc(p.carrier || '') + ' ' + esc(p.tracking || '') +
          (p.track_url ? ' <a href="' + escAttr(p.track_url) + '" target="_blank" rel="noopener" style="color:var(--text,#604C57);">' + t('查询', 'Track') + '</a>' : '') +
          (p.shipped_at ? ' · ' + esc(String(p.shipped_at).slice(0, 10)) : '') +
          (p.note ? ' · ' + esc(p.note) : '') + '</div>';
      }).join('');
    }).catch(function () {});
  }
  function confirmZh(msg) { return window.confirm(msg); }
  function renderPayUpload(o, box) {
    box.style.display = '';
    box.innerHTML =
      '<div class="card" style="padding:14px;background:var(--card);">' +
        '<p style="font-size:15px;color:var(--muted);">' + t('微信/支付宝付款后，把截图传上来，柚子确认后就发货～', 'Pay via WeChat/Alipay, then upload your screenshot here.') + '</p>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;">' +
          '<input id="pu-amount" placeholder="' + t('付款金额', 'Amount paid') + '">' +
          '<input id="pu-channel" placeholder="' + t('付款渠道（微信/支付宝…）', 'Channel (WeChat/Alipay…)') + '">' +
          '<input id="pu-time" placeholder="' + t('付款时间（如 10-23 21:00）', 'Time paid') + '" style="grid-column:1/-1;">' +
        '</div>' +
        '<div style="margin-top:8px;display:flex;gap:8px;align-items:center;">' +
          '<label class="buy-btn" style="padding:7px 16px;cursor:pointer;">' + t('选择截图', 'Choose screenshot') + '<input id="pu-file" type="file" accept="image/*" hidden></label>' +
          '<span id="pu-name" style="font-size:15px;color:var(--muted);">' + t('未选择', 'None') + '</span>' +
          '<button class="buy-btn" id="pu-go" style="padding:8px 18px;background:var(--accent,#ffd9e6);color:var(--text,#604C57);margin-left:auto;">' + t('提交凭证', 'Submit proof') + '</button>' +
        '</div>' +
      '</div>';
    box.querySelectorAll('input:not([type=file])').forEach(function (i) { i.style.cssText = 'width:100%;padding:10px 12px;font-size:16px;border:none;border-radius:12px;background:#fff;outline:none;color:var(--text);font-family:inherit;'; });
    var file = null;
    box.querySelector('#pu-file').addEventListener('change', function () {
      file = this.files[0] || null;
      box.querySelector('#pu-name').textContent = file ? file.name : t('未选择', 'None');
    });
    box.querySelector('#pu-go').addEventListener('click', function () {
      if (!file) { toast(t('先选一张截图哦', 'Pick a screenshot first')); return; }
      getUid().then(function (uid) {
        var path = uid + '/order-' + o.id + '-' + Date.now() + '.' + (file.name.split('.').pop() || 'jpg').replace(/[^\w]/g, '');
        return fetch(SUPABASE_URL + '/storage/v1/object/pay/' + path, {
          method: 'POST', headers: { 'apikey': ANON, 'Authorization': 'Bearer ' + USER.a, 'Content-Type': file.type || 'image/jpeg' }, body: file
        }).then(function (r) { if (!r.ok) throw new Error('up'); return SUPABASE_URL + '/storage/v1/object/authenticated/pay/' + path; });
      }).then(function (url) {
        return api('shop_orders?id=eq.' + o.id, { method: 'PATCH', body: JSON.stringify({
          pay_url: url, pay_amount: parseFloat(box.querySelector('#pu-amount').value) || null,
          pay_channel: box.querySelector('#pu-channel').value.trim(), pay_time: box.querySelector('#pu-time').value.trim(),
          status: 'reviewing'
        }) });
      }).then(function (r) {
        if (!r.ok) { toast(t('提交失败，请确认已登录', 'Submit failed — make sure you are logged in')); return; }
        toast(t('凭证已提交，等审核～', 'Proof submitted for review~'));
        openOrders(o.id);
      }).catch(function () { toast(t('上传失败，再试一次', 'Upload failed, try again')); });
    });
  }
  function renderOrderMsgs(o, box) {
    box.style.display = box.style.display === 'none' || !box.innerHTML ? '' : 'none';
    api('shop_order_msgs?select=*&order_id=eq.' + o.id + '&order=created_at.asc').then(function (r) { return r.json(); }).then(function (rows) {
      rows = rows || [];
      box.innerHTML = '<div class="card" style="padding:14px;background:var(--card);">' +
        (rows.length ? rows.map(function (m) {
          return '<div style="font-size:15px;margin-bottom:6px;"><b>' + (m.is_admin ? '柚子' : t('我', 'Me')) + '：</b>' + esc(m.text) +
            ' <span style="color:var(--muted);font-size:13px;">' + new Date(m.created_at).toLocaleString() + '</span></div>';
        }).join('') : '<p style="font-size:15px;color:var(--muted);">' + t('有什么想问的写在这里～', 'Ask anything about this order~') + '</p>') +
        '<div style="display:flex;gap:8px;margin-top:8px;"><input id="om-text" placeholder="' + t('订单咨询 / 售后说明', 'Question / after-sales note') + '" style="flex:1;padding:10px 12px;font-size:16px;border:none;border-radius:12px;background:#fff;outline:none;color:var(--text);font-family:inherit;">' +
        '<button class="buy-btn" id="om-go" style="padding:8px 16px;">' + t('发送', 'Send') + '</button></div></div>';
      box.querySelector('#om-go').addEventListener('click', function () {
        var text = box.querySelector('#om-text').value.trim();
        if (!text) return;
        getUid().then(function (uid) {
          return api('shop_order_msgs', { method: 'POST', body: JSON.stringify({ order_id: o.id, user_id: uid, is_admin: false, type: 'msg', text: text }) });
        }).then(function (r) {
          if (!r.ok) { toast(t('发送失败', 'Failed')); return; }
          toast(t('已发送', 'Sent'));
          renderOrderMsgs(o, box); box.style.display = '';
        });
      });
    });
  }

  // ===== 账号 =====
  var pendingAfterLogin = null;
  function renderAccount() {
    var box = document.getElementById('view-account');
    if (!USER) {
      box.innerHTML =
        '<h2 style="font-size:22px;margin-bottom:14px;">' + t('登录', 'Log in') + '</h2>' +
        '<div class="card" style="padding:18px;">' +
          '<div style="display:flex;gap:8px;margin-bottom:14px;">' +
            '<button class="buy-btn acct-tab on" data-v="login" style="padding:8px 20px;">' + t('登录', 'Log in') + '</button>' +
            '<button class="buy-btn acct-tab" data-v="reg" style="padding:8px 20px;background:#fff;">' + t('注册', 'Sign up') + '</button>' +
          '</div>' +
          '<div id="ac-login">' +
            '<input id="li-email" placeholder="Email" style="width:100%;margin-bottom:14px;">' +
            '<input id="li-pw" type="password" placeholder="' + t('密码', 'Password') + '" style="width:100%;margin-bottom:16px;">' +
            '<button class="buy-btn" id="li-go" style="width:100%;padding:11px;background:var(--accent,#ffd9e6);color:var(--text,#604C57);font-size:17px;">' + t('登录', 'Log in') + '</button>' +
            '<button id="li-forgot" style="background:none;border:none;color:var(--muted);font-family:inherit;font-size:15px;margin-top:14px;cursor:pointer;">' + t('忘记密码？发重置邮件', 'Forgot password? Send reset email') + '</button>' +
          '</div>' +
          '<div id="ac-reg" style="display:none;">' +
            '<p style="font-size:14px;color:var(--muted);margin-bottom:8px;">' + t('注册即创建买家账号（邮箱可能需要点击验证邮件）。', 'Sign up creates your buyer account (email verification may be required).') + '</p>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">' +
              '<input id="rg-name" placeholder="' + t('姓名 *', 'Full name *') + '">' +
              '<input id="rg-nick" placeholder="' + t('昵称（选填）', 'Nickname (optional)') + '">' +
              '<input id="rg-email" placeholder="Email *" style="grid-column:1/-1;">' +
              '<input id="rg-phone" placeholder="' + t('电话 *', 'Phone *') + '" style="grid-column:1/-1;">' +
              '<input id="rg-pw" type="password" placeholder="' + t('密码 *（至少 6 位）', 'Password * (6+ chars)') + '" style="grid-column:1/-1;">' +
            '</div>' +
            '<p style="font-size:16px;margin:10px 0 4px;">' + t('收货地址', 'Shipping address') + '</p>' +
            '<div id="rg-addr"></div>' +
            '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px;padding:10px 12px;border:1.5px solid var(--accent-soft,#FCE4EC);border-radius:12px;background:#fff;">' +
              '<span style="font-size:16px;color:var(--text,#604C57);">' + t('接收新品上架通知', 'Notify me about new items') + '<br><span style="font-size:13px;color:var(--muted,#A88E9B);">' + t('默认关闭 · 邮件通知服务尚未配置，启用前不会发送邮件', 'Off by default · email delivery not configured yet') + '</span></span>' +
              subToggleHtml('rg-notify', false) +
            '</div>' +
            '<button class="buy-btn" id="rg-go" style="width:100%;padding:11px;background:var(--accent,#ffd9e6);color:var(--text,#604C57);font-size:17px;margin-top:14px;">' + t('注册', 'Create account') + '</button>' +
          '</div>' +
        '</div>';
      styleInputs(box);
      styleTabs(box);
      // styleInputs 会整体覆盖内联样式，间距在这里补回来（登录表单元素之间的空隔）
      var le = document.getElementById('li-email');
      var lp = document.getElementById('li-pw');
      if (le) le.style.marginBottom = '14px';
      if (lp) lp.style.marginBottom = '16px';
      var rgN = document.getElementById('rg-notify');
      bindSubToggle(rgN, function () { return null; }, function (on) { window.__rgNotifyWanted = on; });
      box.querySelectorAll('.acct-tab').forEach(function (b) {
        b.addEventListener('click', function () {
          paintTabs(box, b);
          document.getElementById('ac-login').style.display = b.getAttribute('data-v') === 'login' ? '' : 'none';
          document.getElementById('ac-reg').style.display = b.getAttribute('data-v') === 'reg' ? '' : 'none';
        });
      });
      document.getElementById('li-go').addEventListener('click', doLogin);
      document.getElementById('li-forgot').addEventListener('click', function () {
        var email = document.getElementById('li-email').value.trim();
        if (!email) { toast(t('先填邮箱再点重置', 'Enter your email first')); return; }
        fetch(SUPABASE_URL + '/auth/v1/recover', { method: 'POST', headers: { 'apikey': ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email }) })
          .then(function (r) { toast(r.ok ? t('重置邮件已发送，去邮箱查收', 'Reset email sent — check your inbox') : t('发送失败（邮件服务可能限流），稍后再试', 'Send failed (email rate limit?) — try later')); });
      });
      addrForm('rg-addr', null, null);
      document.getElementById('rg-go').addEventListener('click', doRegister);
      showView('account');
      return;
    }
    // 已登录：资料 + 地址（原来的 id=eq.x 哑请求每次都打 400 只是刷控制台错误，已删）
    Promise.all([
      getUid()
    ]).then(function (r2) {
      var uid = r2[0];
      if (!uid) { showView('account'); return; } // 拿不到 uid 就别打无效查询（防 id=eq.null 400）
      Promise.all([
        api('shop_profiles?select=*&id=eq.' + uid).then(function (r) { return r.json(); }),
        api('shop_addresses?select=*&order=created_at.desc').then(function (r) { return r.json(); })
      ]).then(function (res) {
        var prof = (arr(res[0]))[0] || {};
        ADDR = arr(res[1]);
        var prof0 = prof;
        function profileDisplay(p) {
          var row = function (label, val) {
            var v = (val && String(val).trim()) ? esc(val) : '<span style="color:var(--muted,#A88E9B);">' + t('尚未填写', 'Not set') + '</span>';
            return '<span style="color:var(--muted,#A88E9B);font-size:15px;">' + label + '</span><span style="font-size:16px;word-break:break-all;">' + v + '</span>';
          };
          return '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px;">' +
              '<b style="font-size:17px;">' + t('基本资料', 'Basic info') + '</b>' +
              '<button class="buy-btn" id="pf-edit" style="padding:7px 18px;background:var(--accent,#ffd9e6);color:var(--text,#604C57);">' + t('编辑', 'Edit') + '</button>' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:76px 1fr;row-gap:10px;column-gap:12px;align-items:baseline;">' +
              row(t('邮箱', 'Email'), USER.email || '') +
              row(t('姓名', 'Name'), p.name || '') +
              row(t('昵称', 'Nickname'), p.nickname || '') +
              row(t('电话', 'Phone'), p.phone || '') +
            '</div>'; // 退出登录已挪到左侧栏常驻显眼按钮（doLogout）
        }
        function profileEdit(p, errMsg) {
          return '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px;">' +
              '<b style="font-size:17px;">' + t('编辑资料', 'Edit info') + '</b>' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
              '<input id="pf-name" placeholder="' + t('姓名', 'Full name') + '" value="' + escAttr(p.name || '') + '">' +
              '<input id="pf-nick" placeholder="' + t('昵称', 'Nickname') + '" value="' + escAttr(p.nickname || '') + '">' +
              '<input id="pf-phone" placeholder="' + t('电话', 'Phone') + '" value="' + escAttr(p.phone || '') + '" style="grid-column:1/-1;">' +
            '</div>' +
            (errMsg ? '<p id="pf-err" style="color:var(--danger,#D96570);font-size:14px;margin:10px 0 0;">' + esc(errMsg) + '</p>' : '') +
            '<div style="display:flex;gap:10px;margin-top:14px;">' +
              '<button class="buy-btn" id="pf-save" style="padding:9px 22px;background:var(--accent,#ffd9e6);color:var(--text,#604C57);">' + t('保存', 'Save') + '</button>' +
              '<button class="buy-btn" id="pf-cancel" style="padding:9px 22px;background:#fff;color:var(--muted);">' + t('取消', 'Cancel') + '</button>' +
            '</div>';
        }
        function paintProfile(p, editing, errMsg) {
          var card = document.getElementById('pf-card');
          card.innerHTML = editing ? profileEdit(p, errMsg) : profileDisplay(p);
          if (editing) {
            styleInputs(card);
            card.querySelector('#pf-cancel').addEventListener('click', function () { paintProfile(p, false); });
            card.querySelector('#pf-save').addEventListener('click', function () {
              var btn = card.querySelector('#pf-save');
              if (btn.dataset.busy) return; // 防重复提交
              btn.dataset.busy = '1'; btn.disabled = true; btn.textContent = t('保存中…', 'Saving…');
              var restoreBtn = function () { btn.dataset.busy = ''; btn.disabled = false; btn.textContent = t('保存', 'Save'); };
              var body = {
                id: uid, name: card.querySelector('#pf-name').value.trim(),
                nickname: card.querySelector('#pf-nick').value.trim(), phone: card.querySelector('#pf-phone').value.trim()
              };
              api('shop_profiles?on_conflict=id', { method: 'POST', headers: { 'Prefer': 'resolution=merge-duplicates' }, body: JSON.stringify(body) }).then(function (r) {
                if (r.ok) { prof0 = body; paintProfile(body, false); toast(t('已保存', 'Saved')); }
                else { restoreBtn(); paintProfile(body, true, t('保存失败，请检查网络后重试', 'Save failed — check your connection and retry')); }
              }).catch(function () { restoreBtn(); paintProfile(p, true, t('保存失败，请检查网络后重试', 'Save failed — check your connection and retry')); });
            });
          } else {
            card.querySelector('#pf-edit').addEventListener('click', function () { paintProfile(p, true); });
          }
        }
        box.innerHTML =
          '<h2 style="font-size:22px;margin-bottom:14px;">' + t('Profile 编辑', 'Profile') + '</h2>' +
          '<div class="card" id="pf-card" style="padding:18px;margin-bottom:14px;"></div>' +
          '<div class="card" style="padding:18px;margin-bottom:14px;">' +
            '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">' +
              '<span style="font-size:16px;color:var(--text,#604C57);">' + t('接收新品上架通知', 'Notify me about new items') + '<br><span style="font-size:13px;color:var(--muted,#A88E9B);">' + t('邮件通知服务尚未配置，启用前不会发送邮件', 'Email delivery not configured yet — no emails will be sent until enabled') + '</span></span>' +
              subToggleHtml('pf-notify', !!(prof0 && prof0.notify_new) || subRead()) +
            '</div>' +
          '</div>' +
          '<div class="card" style="padding:18px;">' +
            '<b style="font-size:17px;">' + t('收货地址', 'Addresses') + '</b><div id="pf-addr" style="margin-top:8px;"></div>' +
            '<button class="buy-btn" id="pf-add" style="margin-top:8px;padding:7px 16px;">' + t('＋ 新地址', '+ New address') + '</button>' +
            '<div id="pf-addr-form"></div>' +
          '</div>';
        paintProfile(prof0, false);
        styleInputs(box); // 通知/地址区块内输入框统一样式（资料卡编辑态在 paintProfile 内单独处理）
        bindSubToggle(document.getElementById('pf-notify'), function () { return uid; });
        paintMyAddr();
        document.getElementById('pf-add').addEventListener('click', function () { addrForm('pf-addr-form', null, function () { loadAddr().then(paintMyAddr); }); });
        renderFavsInAccount();
        showView('account');
      });
    });
  }
  function paintMyAddr() {
    var box = document.getElementById('pf-addr');
    if (!ADDR.length) { box.innerHTML = '<p style="color:var(--muted);font-size:15px;">' + t('还没有地址', 'No addresses yet') + '</p>'; return; }
    // 按收件人名字排（不用 A-Z 字母导航，她 2026-10-25 要求删掉）
    var list = ADDR.slice().sort(function (a, b) { return String(a.name || '').localeCompare(String(b.name || ''), 'zh-u-co-pinyin'); });
    var html = '<div>' + list.map(function (a) {
      return '<div style="display:flex;gap:8px;align-items:center;padding:10px;border-radius:12px;background:#fff;margin-bottom:6px;">' +
        '<div style="flex:1;font-size:15px;min-width:0;">' + esc(a.name) + ' · ' + esc(a.phone) + (a.is_default ? ' <span style="color:var(--text,#604C57);font-size:13px;">' + t('默认', 'Default') + '</span>' : '') + '<br><span style="color:var(--muted);">' + esc(a.street + ', ' + a.city + ', ' + a.state + ' ' + a.zip + ', ' + a.country) + '</span></div>' +
        '<button class="buy-btn ad-def" data-id="' + escAttr(a.id) + '" style="padding:5px 10px;font-size:14px;">' + t('设默认', 'Default') + '</button>' +
        '<button class="buy-btn ad-edit" data-id="' + escAttr(a.id) + '" style="padding:5px 10px;font-size:14px;">' + t('编辑', 'Edit') + '</button>' +
        '<button class="buy-btn ad-del" data-id="' + escAttr(a.id) + '" style="padding:5px 10px;font-size:14px;background:#fff;color:var(--danger,#D96570);">' + t('删除', 'Del') + '</button>' +
      '</div>';
    }).join('') + '</div>';
    box.innerHTML = html;
    box.querySelectorAll('.ad-def').forEach(function (b) { b.addEventListener('click', function () {
      var id = b.getAttribute('data-id');
      api('shop_addresses?user_id=eq.' + UID, { method: 'PATCH', body: JSON.stringify({ is_default: false }) }).then(function () {
        return api('shop_addresses?id=eq.' + id, { method: 'PATCH', body: JSON.stringify({ is_default: true }) });
      }).then(function () { toast(t('已设为默认', 'Default set')); loadAddr().then(paintMyAddr); });
    }); });
    box.querySelectorAll('.ad-edit').forEach(function (b) { b.addEventListener('click', function () {
      var a = ADDR.filter(function (x) { return x.id === b.getAttribute('data-id'); })[0];
      addrForm('pf-addr-form', a, function () { loadAddr().then(paintMyAddr); });
    }); });
    box.querySelectorAll('.ad-del').forEach(function (b) { b.addEventListener('click', function () {
      if (!confirmZh(t('删除这个地址？', 'Delete this address?'))) return;
      api('shop_addresses?id=eq.' + b.getAttribute('data-id'), { method: 'DELETE' }).then(function () { toast(t('已删除', 'Deleted')); loadAddr().then(paintMyAddr); });
    }); });
  }
  function doLogin() {
    var email = document.getElementById('li-email').value.trim();
    var pw = document.getElementById('li-pw').value;
    if (!email || !pw) { toast(t('邮箱和密码都要填', 'Email & password required')); return; }
    fetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
      method: 'POST', headers: { 'apikey': ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email, password: pw })
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); }).then(function (res) {
      if (!res.ok || !res.j.access_token) { toast((res.j.msg) || t('登录失败，检查邮箱密码', 'Login failed')); return; }
      USER = { a: res.j.access_token, r: res.j.refresh_token, email: email }; saveUser();
      // 柚子专属账号：直接进入原有专属后台，不落普通买家账户页（会话已由 saveUser 统一写入后台键）
      if (email.toLowerCase() === YK_EXCLUSIVE_EMAIL) {
        toast(t('专属身份已确认，正在进入后台…', 'Yuki mode — opening admin…'));
        setTimeout(function () { location.href = '/admin.html'; }, 500);
        return;
      }
      toast(t('欢迎回来～', 'Welcome back~'));
      afterLogin();
    });
  }
  function doRegister() {
    var name = document.getElementById('rg-name').value.trim();
    var nick = document.getElementById('rg-nick').value.trim();
    var email = document.getElementById('rg-email').value.trim();
    var phone = document.getElementById('rg-phone').value.trim();
    var pw = document.getElementById('rg-pw').value;
    var addr = {
      name: document.getElementById('af-name') ? document.getElementById('af-name').value.trim() : '',
      phone: document.getElementById('af-phone') ? document.getElementById('af-phone').value.trim() : '',
      street: document.getElementById('af-street') ? document.getElementById('af-street').value.trim() : '',
      city: document.getElementById('af-city') ? document.getElementById('af-city').value.trim() : '',
      state: document.getElementById('af-state') ? document.getElementById('af-state').value.trim() : '',
      zip: document.getElementById('af-zip') ? document.getElementById('af-zip').value.trim() : '',
      country: document.getElementById('af-country') ? document.getElementById('af-country').value.trim() : 'United States'
    };
    if (!name || !email || !phone || !pw) { toast(t('姓名/邮箱/电话/密码都要填', 'Name / email / phone / password required')); return; }
    if (pw.length < 6) { toast(t('密码至少 6 位', 'Password: 6+ chars')); return; }
    fetch(SUPABASE_URL + '/auth/v1/signup', {
      method: 'POST', headers: { 'apikey': ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: pw, data: { name: name, nickname: nick, phone: phone } })
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); }).then(function (res) {
      if (!res.ok || res.j.error_code) { toast((res.j.msg) || t('注册失败', 'Sign up failed')); return; }
      if (res.j.access_token) {
        USER = { a: res.j.access_token, r: res.j.refresh_token, email: email }; saveUser();
        toast(t('注册成功！', 'Account created!'));
        afterLogin(addr, { name: name, nickname: nick, phone: phone });
      } else {
        toast(t('验证邮件已发送，验证后就能登录啦', 'Verification email sent — verify then log in'));
      }
    });
  }
  function afterLogin(addr, prof) {
    paintAcctIcon(); loadFavs(); paintNav(); paintAccountMenu(); // 登录成功：顶部「我的订单」入口和侧栏订单/评价/留言此时才出现
    if (window.__rgNotifyWanted) {
      getUid().then(function (uid) { if (uid) subWrite(true, uid); });
      window.__rgNotifyWanted = false;
    }
    // 本地购物车合并到云端（云端已有的拉下来合并）
    getUid().then(function (uid) {
      if (!uid) { route(); return; }
      var p1 = api('shop_carts?select=*&user_id=eq.' + uid).then(function (r) { return r.json(); });
      p1.then(function (rows) {
        var cloud = (Array.isArray(rows) && rows[0] && rows[0].items) || [];
        cloud.forEach(function (c) {
          var k = cartKey(c.id, c.sku);
          if (!CART.filter(function (x) { return cartKey(x.id, x.sku) === k; }).length) CART.push(c);
        });
        saveCart();
      }).then(function () {
        var p2 = api('shop_profiles?on_conflict=id', { method: 'POST', headers: { 'Prefer': 'resolution=merge-duplicates' },
          body: JSON.stringify(Object.assign({ id: uid }, prof || {})) });
        var p3 = addr && addr.street ? api('shop_addresses', { method: 'POST', body: JSON.stringify(Object.assign({ user_id: uid }, addr)) }) : Promise.resolve();
        Promise.all([p2, p3]).then(function () { if (!goNextAfterLogin()) route(); });
      });
    });
  }

  // ===== 顶栏入口（顺序固定：购物车 → 登录/我的账号 → 汉堡）=====
  function paintAcctIcon() {
    var acct = document.getElementById('tb-account');
    if (!acct) return;
    var a = acct.querySelector('.tb-ic-in'), b2 = acct.querySelector('.tb-ic-out');
    if (a) a.style.display = USER ? '' : 'none';
    if (b2) b2.style.display = USER ? 'none' : '';
  }
  function bindTopbar() {
    var cart = document.getElementById('tb-cart');
    var acct = document.getElementById('tb-account');
    if (cart) cart.addEventListener('click', function () { renderCart(); showView('cart'); });
    if (acct) acct.addEventListener('click', function () { renderAccount(); showView('account'); });
    paintAcctIcon();
  }
  // Index 统一账户区域在商城页内的直达入口（site-menu.js 调用）
  window.__shopNav = function (which) {
    if (which === 'cart') { renderCart(); showView('cart'); }
    else { renderAccount(); showView('account'); }
  };
  function goNextAfterLogin() {
    try {
      var nx = new URLSearchParams(location.search).get('next');
      if (nx && (/^\/[^/]/.test(nx) || nx.indexOf('https://yukicheng.com') === 0)) { location.href = nx; return true; }
    } catch (e) {}
    return false;
  }

  // ===== 收藏（登录后云端 shop_favorites，未登录本地，登录时合并上云）=====
  var FAVS = [];
  function loadFavsLocal() { try { FAVS = JSON.parse(localStorage.getItem('yuki-favs') || '[]'); } catch (e) { FAVS = []; } if (!Array.isArray(FAVS)) FAVS = []; }
  function saveFavsLocal() { try { localStorage.setItem('yuki-favs', JSON.stringify(FAVS)); } catch (e) {} }
  function pushFavSrv(id) {
    getUid().then(function (uid) {
      if (!uid) return;
      api('shop_favorites', { method: 'POST', headers: { 'Prefer': 'resolution=merge-duplicates' }, body: JSON.stringify({ user_id: uid, product_id: id }) }).catch(function () {});
    });
  }
  function loadFavs() {
    loadFavsLocal();
    if (!USER || !USER.a) { paintFavs(); return; }
    api('shop_favorites?select=product_id').then(function (r) { return r.json(); }).then(function (rows) {
      if (!Array.isArray(rows)) return;
      var ids = rows.map(function (x) { return String(x.product_id); });
      FAVS.forEach(function (id) { if (ids.indexOf(String(id)) === -1 && /^[0-9a-f-]{36}$/i.test(String(id))) pushFavSrv(id); }); // 本地合并上云（仅真实 uuid）
      var merged = ids.slice();
      FAVS.forEach(function (id) { if (merged.indexOf(String(id)) === -1) merged.push(String(id)); });
      FAVS = merged; saveFavsLocal(); paintFavs();
    }).catch(function () {});
  }
  function isFav(id) { return FAVS.map(String).indexOf(String(id)) !== -1; }
  function toggleFav(id) {
    var s = String(id);
    if (isFav(s)) {
      FAVS = FAVS.filter(function (x) { return String(x) !== s; });
      if (USER) getUid().then(function (uid) { if (uid) api('shop_favorites?user_id=eq.' + uid + '&product_id=eq.' + s, { method: 'DELETE' }).catch(function () {}); });
    } else {
      FAVS.push(s);
      if (USER) pushFavSrv(s);
    }
    saveFavsLocal(); paintFavs();
  }
  function paintFavs() {
    document.querySelectorAll('[data-fav]').forEach(function (b) {
      var on = isFav(b.getAttribute('data-fav'));
      b.classList.toggle('on', on);
      b.innerHTML = svgHeart(on);
    });
  }
  document.addEventListener('click', function (e) {
    var f = e.target.closest ? e.target.closest('[data-fav]') : null;
    if (!f) return;
    e.preventDefault(); e.stopPropagation();
    toggleFav(f.getAttribute('data-fav'));
  }, true);
  function renderFavsInAccount() {
    var box = document.getElementById('view-account');
    if (!box || !USER) return;
    var old = document.getElementById('fav-section'); if (old) old.remove();
    var sec = document.createElement('div');
    sec.id = 'fav-section';
    sec.style.cssText = 'background:var(--card);border-radius:var(--radius,18px);padding:16px;margin-top:14px;';
    var items = FAVS.map(function (id) { return PRODUCTS.filter(function (p) { return String(p.id) === String(id); })[0]; }).filter(Boolean);
    sec.innerHTML = '<b style="font-size:17px;">' + t('我的收藏', 'Favorites') + '</b>' +
      (items.length ? '<div class="grid" style="margin-top:10px;">' + items.map(productCardShop).join('') + '</div>'
                    : '<p style="font-size:15px;color:var(--muted);margin:8px 0 0;">' + t('还没有收藏，去逛逛点 ♡ 收起来', 'Nothing saved yet — tap ♡ on any item') + '</p>');
    box.appendChild(sec);
    var g2 = sec.querySelector('.grid'); if (g2) bindCards(g2);
    paintFavs();
  }

  // ===== 购物车视图 =====
  function cartCur(list) { // 勾选项统一币种（混合时返回多数派用于小计显示，结算时仍会拦）
    var c = null, n = 0, seen = {};
    list.forEach(function (x) { var k = curOf(null, x); seen[k] = (seen[k] || 0) + 1; if (seen[k] > n) { n = seen[k]; c = k; } });
    return c || 'USD';
  }
  function renderCart() {
    var box = document.getElementById('view-cart');
    if (!CART.length) { box.innerHTML = '<h2 style="font-size:22px;margin-bottom:14px;">' + t('购物车', 'Cart') + '</h2><p style="color:var(--muted);text-align:center;padding:30px 0;">' + t('购物车空空的，去小铺逛逛～', 'Cart is empty — go shopping~') + '</p>'; showView('cart'); return; }
    var selI = CART.filter(function (x) { return x.checked !== false; });
    var sub = 0, subCur = cartCur(selI);
    selI.forEach(function (x) { sub += x.price * x.qty; });
    box.innerHTML =
      '<h2 style="font-size:22px;margin-bottom:14px;">' + t('购物车', 'Cart') + '</h2>' +
      CART.map(function (x, i) {
        return '<div class="card" style="padding:14px 16px;margin-bottom:10px;display:flex;gap:12px;align-items:center;">' +
          '<span class="ck-box" data-i="' + i + '" style="width:20px;height:20px;border-radius:6px;border:2px solid var(--border,#FFD9E6);flex-shrink:0;cursor:pointer;background:' + (x.checked !== false ? 'var(--accent-soft,#FCE4EC)' : '#fff') + ';display:inline-flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;line-height:1;color:var(--text,#604C57);">' + (x.checked !== false ? '<svg viewBox=\"0 0 16 16\" width=\"12\" height=\"12\" style=\"display:block;\"><path d=\"M3.2 8.6 L6.6 11.8 L12.8 4.6\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></svg>' : '') + '</span>' +
          (x.image ? '<img src="' + escAttr(normImg(x.image)) + '" style="width:64px;height:64px;border-radius:14px;object-fit:cover;flex-shrink:0;">' : '<div style="width:64px;height:64px;border-radius:14px;background:var(--accent-soft,#FCE4EC);flex-shrink:0;display:flex;align-items:center;justify-content:center;color:var(--muted,#A88E9B);font-size:22px;">♡</div>') +
          '<div style="flex:1;min-width:0;">' +
            '<div style="font-size:16px;color:var(--text,#604C57);font-weight:600;">' + esc(x.name) + '</div>' +
            (x.sku ? '<div style="font-size:13px;color:var(--muted,#A88E9B);margin-top:2px;">' + t('规格', 'Option') + '：' + esc(x.sku) + '</div>' : '') +
            '<div style="font-size:15px;color:var(--price,#ff6fa5);font-weight:700;margin-top:4px;">' + sym(curOf(null, x)) + money(x.price) + '</div>' +
            '<div style="display:flex;align-items:center;gap:10px;margin-top:8px;">' +
              '<button class="qty-btn cart-q" data-i="' + i + '" data-d="-1">−</button><b style="color:var(--text,#604C57);">' + x.qty + '</b><button class="qty-btn cart-q" data-i="' + i + '" data-d="1">＋</button>' +
              '<button class="cart-rm" data-i="' + i + '" style="border:none;background:none;color:var(--danger,#D96570);font-size:13px;cursor:pointer;text-decoration:underline;padding:0;font-family:inherit;">' + t('删除', 'Remove') + '</button>' +
            '</div>' +
          '</div>' +
          '<div style="text-align:right;flex-shrink:0;">' +
            '<div style="font-size:12px;color:var(--muted,#A88E9B);">' + t('小计', 'Subtotal') + '</div>' +
            '<div style="font-size:17px;color:var(--price,#ff6fa5);font-weight:700;margin-top:2px;">' + sym(curOf(null, x)) + money(x.price * x.qty) + '</div>' +
          '</div>' +
        '</div>';
      }).join('') +
      '<div class="card" style="padding:14px;display:flex;justify-content:space-between;align-items:center;">' +
        '<span style="font-size:17px;">' + t('已选小计', 'Selected subtotal') + '</span><b style="font-size:20px;color:var(--price,#ff6fa5);">' + sym(subCur) + money(sub) + '</b></div>' +
      '<button class="buy-btn" id="cart-go" style="width:100%;margin-top:12px;padding:12px;background:var(--accent,#ffd9e6);color:var(--text,#604C57);font-size:18px;font-weight:600;">' + t('去结算', 'Check out') + '</button>';
    box.querySelectorAll('.ck-box').forEach(function (el) { el.addEventListener('click', function () {
      var x = CART[+el.getAttribute('data-i')]; x.checked = x.checked === false; saveCart(); renderCart();
    }); });
    box.querySelectorAll('.cart-q').forEach(function (el) { el.addEventListener('click', function () {
      var x = CART[+el.getAttribute('data-i')];
      x.qty = Math.max(1, x.qty + parseInt(el.getAttribute('data-d'), 10));
      saveCart(); renderCart();
    }); });
    box.querySelectorAll('.cart-rm').forEach(function (el) { el.addEventListener('click', function () {
      CART.splice(+el.getAttribute('data-i'), 1); saveCart(); renderCart();
    }); });
    document.getElementById('cart-go').addEventListener('click', renderCheckout);
    showView('cart');
  }

  // ===== 列表增强：筛选 / 排序 + 卡片行为（搜索框已按她 2026-10-25 要求删掉）=====
  function enhanceList() {
    if (window.__ACCOUNT_DEFAULT_SEC) return; // 独立账号页：不注入筛选栏、不拉商品列表
    var bar = document.createElement('div');
    bar.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:16px;';
    bar.innerHTML =
      '<div id="q-tags" style="display:flex;gap:6px;flex-wrap:wrap;"></div>' +
      '<button id="q-sort" class="buy-btn" style="padding:8px 14px;background:#fff;">' + t('最新', 'Newest') + '</button>';
    var grid = document.getElementById('product-grid');
    grid.parentNode.insertBefore(bar, grid);
    var SORTS = [['new', t('最新', 'Newest')], ['plow', t('价格从低', 'Price ↑')], ['phigh', t('价格从高', 'Price ↓')]];
    var sortIdx = 0, tag = '';
    function tags() {
      var set = []; PRODUCTS.forEach(function (p) { if (p.tag && set.indexOf(p.tag) < 0) set.push(p.tag); });
      document.getElementById('q-tags').innerHTML = [''].concat(set).map(function (x) {
        return '<button class="buy-btn q-tag" data-t="' + escAttr(x) + '" style="padding:6px 12px;font-size:14px;border-radius:999px;background:' + (x === tag ? 'var(--accent-soft,#FCE4EC);color:var(--accent-strong,#A04A68);box-shadow:none;' : '#fff;color:var(--muted,#A88E9B)') + ';box-shadow:' + 'none' + ';">' + esc(x || t('全部', 'All')) + '</button>';
      }).join('');
      bar.querySelectorAll('.q-tag').forEach(function (b) { b.addEventListener('click', function () { tag = b.getAttribute('data-t'); paint(); }); });
    }
    function paint() {
      var list = PRODUCTS.filter(function (p) {
        if (tag && (p.tag || '') !== tag) return false;
        return true;
      });
      if (sortIdx === 1) list = list.slice().sort(function (a, b) { return (parseFloat(a.price) || 0) - (parseFloat(b.price) || 0); });
      if (sortIdx === 2) list = list.slice().sort(function (a, b) { return (parseFloat(b.price) || 0) - (parseFloat(a.price) || 0); });
      var onSale = list.filter(function (p) { return statusOfG(p) !== 'out'; });
      var past = list.filter(function (p) { return statusOfG(p) === 'out'; });
      var g = document.getElementById('product-grid');
      g.innerHTML = onSale.length ? onSale.map(productCardShop).join('') : '<p style="grid-column:1/-1;text-align:center;color:var(--muted);">' + t('没有找到相关商品', 'Nothing found') + '</p>';
      bindCards(g);
      var pastSec = document.getElementById('past'), pg = document.getElementById('past-grid');
      if (!past.length) { pastSec.style.display = 'none'; }
      else { pastSec.style.display = ''; pg.innerHTML = past.map(productCardShop).join(''); bindCards(pg); }
    }
    function statusOfG(p) { if (p.display_only) return 'display'; if (p.sold || !(p.stock > 0)) return 'out'; return 'on'; }
    window.__shopPaint = paint;
    document.getElementById('q-sort').addEventListener('click', function () {
      sortIdx = (sortIdx + 1) % 3; this.textContent = SORTS[sortIdx][1]; paint();
    });
    tags(); paint();
    // 接管旧脚本的 renderProducts：商品异步加载完成后仍走增强列表
    window.renderProducts = function () { paint(); tags(); };
  }
  // 增强版商品卡：整卡进详情 + 加入购物车 + 保留「找我下单」
  function productCardShop(p) {
    var img = pagerWrapHtml(pagerImgsOf({ images: p.images, image_url: p.image_url }), p.name);
    var st = statusOf(p);
    var stText = st === 'on' ? t('在售', 'On sale') : st === 'display' ? t('仅展示', 'Display only') : t('售尽', 'Sold out');
    var stCls = st === 'on' ? 'st-on' : st === 'display' ? 'st-display' : 'st-out';
    var off = st === 'on' ? '' : ' off';
    return '<div class="product' + off + '" data-pid="' + escAttr(p.id) + '" style="cursor:pointer;">' +
      '<div class="product-img">' + img + '<span class="st ' + stCls + '">' + stText + '</span>' +
      '<button type="button" class="fav-btn' + (isFav(p.id) ? ' on' : '') + '" data-fav="' + escAttr(p.id) + '" aria-label="' + t('收藏', 'Favorite') + '">' + svgHeart(isFav(p.id)) + '</button></div>' +
      '<div class="product-info">' +
      '<span class="product-tag">' + esc(p.tag || t('没有标签', 'Untagged')) + '</span>' +
      '<h3>' + esc(p.name) + '</h3>' +
      '<div class="product-row">' +
      '<span class="price">' + (p.price ? priceHtml(curOf(p), fmtPriceShop(p.price)) : '') + '</span>' +
      (st === 'on' ? '<button class="buy-btn cart-quick">' + t('加入购物车', 'Add to cart') + '</button>' : '<span class="no-buy">' + (st === 'display' ? t('仅展示，不能下单', 'Not for sale') : '') + '</span>') +
      productEditBtn(p) +
      '</div></div></div>';
  }
  function bindCards(scope) {
    scope.querySelectorAll('.product').forEach(function (card) {
      card.addEventListener('click', function (e) {
        if (e.target.closest('.buy-btn, .card-edit-btn, .pg-btn, .pg-thumb, .fav-btn')) return;
        openDetail(card.getAttribute('data-pid'));
      });
      var quick = card.querySelector('.cart-quick');
      if (quick) quick.addEventListener('click', function () {
        var p = PRODUCTS.filter(function (x) { return String(x.id) === String(card.getAttribute('data-pid')); })[0];
        if (!p) return;
        var vs = variantsOf(p);
        if (vs) { openDetail(p.id); toast(t('先选规格再加入购物车', 'Pick an option first')); return; }
        var img = Array.isArray(p.images) && p.images.length ? p.images[0] : p.image_url;
        cartAdd({ id: p.id, sku: '', name: p.name, image: img, price: parseFloat(p.price) || 0, currency: curOf(p) }, 1);
        toast(t('已加入购物车', 'Added to cart'));
      });
    });
  }

  // ===== 顶部快捷入口（「我的订单」按钮已按她 2026-10-25 要求删掉；保留空函数防旧调用报错）=====
  function paintNav() {
    var old = document.getElementById('shop-quick-nav');
    if (old) old.parentNode.removeChild(old);
  }

  // ===== 路由入口 =====
  function route() {
    loadCart(); paintCartBadge(); bindTopbar(); loadFavs();
    var qs = new URLSearchParams(location.search);
    var id = qs.get('id'), gid = qs.get('gid'), sec = qs.get('sec') || window.__ACCOUNT_DEFAULT_SEC || '';
    if (qs.get('paid') === '1') { // Stripe 支付成功回跳（真实状态以 webhook 为准）
      toast(t('支付已完成！等柚子确认后发货～', 'Payment completed! Awaiting confirmation~'));
      history.replaceState(null, '', location.pathname + '?sec=orders');
    } else if (qs.get('canceled') === '1') {
      toast(t('已取消支付，订单还在待付款', 'Payment cancelled — order still pending'));
      history.replaceState(null, '', location.pathname + '?sec=orders');
    }
    if (id) return openDetail(id, qs.get('sku'));
    if (gid) return openGroupDetail(gid);
    if (sec === 'cart') return renderCart();
    if (sec === 'checkout') return renderCheckout();
    if (sec === 'orders') return openOrders();
    if (sec === 'groups') return openGroups();
    if (window.__ACCOUNT_DEFAULT_SEC) { // 独立账号页：分组侧栏面板（同柚子专属后台的交互风格）
      paintAccountShell(); paintAccountMenu(); // 侧栏按登录态画：未登录不显示订单/评价/留言
      if (sec === 'orders') { accNav('orders'); return; }
      if (sec === 'my-reviews') { accNav('myreviews'); return; }
      if (sec === 'my-questions') { accNav('myquestions'); return; }
      accNav('account'); return;
    }
    if (sec === 'account') return renderAccount();
    showView('list');
    if (sec === 'reviews') {
      setTimeout(function () {
        var el = document.getElementById(sec);
        if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.pageYOffset - 74, behavior: 'smooth' });
      }, 300);
    }
  }

  // ===== 独立账号页：分组侧栏面板（同柚子专属后台的交互风格） =====
  function myIds(key) { try { var v = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
  function rememberMine(key, id) {
    var ids = myIds(key);
    if (id && ids.indexOf(id) === -1) { ids.push(id); try { localStorage.setItem(key, JSON.stringify(ids.slice(-100))); } catch (e) {} }
  }
  function accLoggedIn() { return !!(USER && USER.a); }
  function paintAccountMenu() { // 登录门：未登录整个侧栏不出现，页面只有登录/注册；登录后才出现侧栏面板
    var menu = document.getElementById('acc-menu');
    if (!menu) return;
    menu.style.display = accLoggedIn() ? '' : 'none'; // 未登录：侧栏不出现也不占位，登录卡铺满整页
    var inn = '';
    if (accLoggedIn()) {
      inn = '<div class="acc-group"><div class="acc-group-title">' + t('账户', 'Account') + '</div>' +
        '<button type="button" class="acc-item" data-v="account">' + t('Profile 编辑', 'Profile') + '</button>' +
        '<button type="button" class="acc-item" data-v="orders">' + t('我的订单', 'My Orders') + '</button></div>' +
        '<div class="acc-group"><div class="acc-group-title">' + t('互动', 'Activity') + '</div>' +
        '<button type="button" class="acc-item" data-v="myreviews">' + t('评价', 'Reviews') + '</button>' +
        '<button type="button" class="acc-item" data-v="myquestions">' + t('留言', 'Messages') + '</button></div>' +
        '<div class="acc-group"><button type="button" class="acc-logout" id="acc-logout">' + t('退出登录', 'Log out') + '</button></div>';
    }
    menu.innerHTML = inn;
  }
  function doLogout() { // 退出登录：侧栏常驻显眼按钮，清空双键即全站退出
    USER = null; UID = null; saveUser();
    try { localStorage.setItem('yuki-cart-merge-done', '0'); } catch (e) {}
    window.__YK_MENU_OK = false; window.__YK_MENU_CHECKED = false;
    try { window.YK_EXCLUSIVE_MEMO = null; } catch (e) {}
    try { if (window.SiteMenu) SiteMenu.refresh(); } catch (e) {}
    loadFavsLocal(); paintFavs(); paintAcctIcon(); paintNav();
    paintAccountMenu();
    toast(t('已退出', 'Logged out'));
    renderAccount();
  }
  function paintAccountShell() {
    var menu = document.getElementById('acc-menu');
    if (!menu || menu.dataset.bound) return;
    menu.dataset.bound = '1';
    menu.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('.acc-logout')) { doLogout(); return; }
      var it = e.target.closest('.acc-item');
      if (it) accNav(it.getAttribute('data-v'));
    });
  }
  function accNav(v) {
    if (v === 'account') renderAccount();
    else if (v === 'orders') openOrders();
    else if (v === 'myreviews') renderMyReviews();
    else if (v === 'myquestions') renderMyQuestions();
    document.querySelectorAll('#acc-menu .acc-item').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-v') === v);
    });
  }
  function renderMyReviews() {
    var box = document.getElementById('view-myreviews');
    if (!box) return;
    showView('myreviews');
    var ids = myIds('yuki-my-reviews');
    if (!ids.length) {
      box.innerHTML = '<h2 style="font-size:22px;margin-bottom:14px;">' + t('评价', 'Reviews') + '</h2>' +
        '<p style="color:var(--muted);text-align:center;padding:30px 0;font-size:17px;">' + t('还没有发过评价。在小铺「评价返图」发的会显示在这里（按这台设备记录）。', 'No reviews yet. Ones you post in Reviews will show up here (recorded on this device).') + '</p>';
      return;
    }
    box.innerHTML = '<h2 style="font-size:22px;margin-bottom:14px;">' + t('评价', 'Reviews') + '</h2><p style="color:var(--muted);text-align:center;">' + t('加载中…', 'Loading…') + '</p>';
    api('reviews?select=*&id=in.(' + ids.join(',') + ')&order=created_at.desc').then(function (r) { return r.json(); }).then(function (rows) {
      rows = rows || [];
      box.innerHTML = '<h2 style="font-size:22px;margin-bottom:14px;">' + t('评价', 'Reviews') + '</h2>' +
        (rows.length ? rows.map(function (rv) {
          return '<div class="card" style="padding:16px;margin-bottom:12px;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;"><b style="font-size:16px;">' + esc(rv.name || t('匿名', 'Anonymous')) + '</b>' +
            '<span style="font-size:14px;color:var(--muted);">' + new Date(rv.created_at).toLocaleDateString() + '</span></div>' +
            '<div style="font-size:17px;color:#e2b100;letter-spacing:2px;margin-top:4px;">' + '★★★★★'.slice(0, rv.rating || 0) + '☆☆☆☆☆'.slice(0, 5 - (rv.rating || 0)) + '</div>' +
            (rv.content ? '<p style="font-size:16px;line-height:1.7;margin-top:6px;">' + esc(rv.content) + '</p>' : '') +
            (rv.image_url ? '<img src="' + escAttr(normImg(rv.image_url)) + '" style="max-width:180px;border-radius:12px;margin-top:8px;display:block;">' : '') +
            (rv.reply ? '<div style="margin-top:10px;padding:10px 12px;background:var(--card,#FFFFFF);border-radius:12px;font-size:15px;"><b>' + t('柚子 回复：', 'Yuki replied:') + '</b> ' + esc(rv.reply) + '</div>' : '') +
            '</div>';
        }).join('') : '<p style="color:var(--muted);text-align:center;padding:20px 0;font-size:16px;">' + t('评价可能在后台审核中被隐藏了', 'Your reviews may be hidden for moderation') + '</p>');
    }).catch(function () {
      box.innerHTML = '<h2 style="font-size:22px;">' + t('评价', 'Reviews') + '</h2><p style="color:var(--muted);text-align:center;">' + t('加载失败，稍后再试', 'Failed to load') + '</p>';
    });
  }
  function renderMyQuestions() {
    var box = document.getElementById('view-myquestions');
    if (!box) return;
    showView('myquestions');
    var ids = myIds('yuki-my-questions');
    if (!ids.length) {
      box.innerHTML = '<h2 style="font-size:22px;margin-bottom:14px;">' + t('留言', 'Messages') + '</h2>' +
        '<p style="color:var(--muted);text-align:center;padding:30px 0;font-size:17px;">' + t('还没有发过留言。在「匿名留言」投递的会显示在这里（按这台设备记录，仍是匿名的）。', 'No messages yet. Ones you send in Ask Box will show up here (recorded on this device, still anonymous).') + '</p>';
      return;
    }
    box.innerHTML = '<h2 style="font-size:22px;margin-bottom:14px;">' + t('留言', 'Messages') + '</h2><p style="color:var(--muted);text-align:center;">' + t('加载中…', 'Loading…') + '</p>';
    api('questions?select=id,content,reply,created_at,replied_at&id=in.(' + ids.join(',') + ')&order=created_at.desc').then(function (r) { return r.json(); }).then(function (rows) {
      rows = rows || [];
      box.innerHTML = '<h2 style="font-size:22px;margin-bottom:14px;">' + t('留言', 'Messages') + '</h2>' +
        (rows.length ? rows.map(function (q) {
          return '<div class="card" style="padding:16px;margin-bottom:12px;">' +
            '<p style="font-size:16px;line-height:1.7;">' + esc(q.content) + '</p>' +
            '<div style="font-size:13px;color:var(--muted);margin-top:6px;">' + new Date(q.created_at).toLocaleString() + '</div>' +
            (q.reply
              ? '<div style="margin-top:10px;padding:10px 12px;background:var(--card,#FFFFFF);border-radius:12px;font-size:15px;"><b>' + t('柚子 回复：', 'Yuki replied:') + '</b> ' + esc(q.reply) + '</div>'
              : '<div style="margin-top:10px;font-size:15px;color:var(--muted);">' + t('已收到，等柚子回复哦～', 'Received! Yuki will reply soon~') + '</div>') +
            '</div>';
        }).join('') : '<p style="color:var(--muted);text-align:center;padding:20px 0;font-size:16px;">' + t('留言可能已被删除', 'Messages may have been removed') + '</p>');
    }).catch(function () {
      box.innerHTML = '<h2 style="font-size:22px;">' + t('留言', 'Messages') + '</h2><p style="color:var(--muted);text-align:center;">' + t('加载失败，稍后再试', 'Failed to load') + '</p>';
    });
  }

  // ===== 启动 =====
  window.__shopDebug = { openDetail: openDetail, openGroupDetail: openGroupDetail, renderAccount: renderAccount, placeOrder: placeOrder, cartAdd: cartAdd }; // 测试钩子
  loadUser();
  loadCart();
  enhanceList();
  refreshUser().then(function () { UID = null; paintNav(); route(); });
})();
