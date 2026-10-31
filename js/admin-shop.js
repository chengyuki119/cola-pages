/* ═══════════════════════════════════════════════════════════════════
   商城管理（买家商城升级 · 后台半边）
   · 全部走 admin.html 现有 api() / authedFetch / toast / uiConfirm / dpOpen / pickPop
   · 未连库（stub 会话 / 离线）时自动回退到可注入的全局假数组：
     SHOP_ORDERS / SHOP_GROUPS / SHOP_GROUP_MEMBERS / SHOP_COUPONS /
     SHOP_PROFILES / SHOP_MSGS / SHOP_PRODUCTS / SHOP_SHIP
   · 渲染函数收拢在 window.ShopAdmin，测试可直接注入假数据后调用
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  var root = document.getElementById('tab-shopmgr');
  if (!root) return;

  /* ── 样式：只作用于本 tab（前缀 sm-），完全复用现有粉色变量与组件 ── */
  var css = document.createElement('style');
  css.textContent = [
    '#tab-shopmgr .sm-stats { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin-bottom:14px; }',
    '#tab-shopmgr .sm-stat { background:#fff; border-radius:var(--radius); padding:10px 14px; box-shadow:0 2px 10px rgba(180,120,150,.12); }',
    '#tab-shopmgr .sm-stat b { display:block; font-size:23px; color:var(--text,#62545B); line-height:1.3; }',
    '#tab-shopmgr .sm-stat span { font-size:14px; color:var(--muted); }',
    '#tab-shopmgr .sm-tabs { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:14px; }',
    '#tab-shopmgr .sm-tab { border:none; background:var(--card); color:var(--muted); font-size:16px; padding:7px 14px; border-radius:999px; cursor:pointer; font-family:inherit; transition:background .15s,color .15s; }',
    '#tab-shopmgr .sm-tab:hover { background:var(--card-hover); }',
    '#tab-shopmgr .sm-tab.active { background:var(--accent-soft,#FCE4EC); color:var(--text,#62545B); }',
    '#tab-shopmgr .sm-toolbar { display:flex; gap:10px; flex-wrap:wrap; align-items:center; margin-bottom:12px; }',
    '#tab-shopmgr .sm-toolbar .dy-chips { flex:1; min-width:260px; }',
    '#tab-shopmgr .sm-toolbar input { width:230px; flex-shrink:0; }',
    '#tab-shopmgr .sm-o-head { display:flex; align-items:center; gap:8px; flex-wrap:wrap; cursor:pointer; }',
    '#tab-shopmgr .sm-o-no { font-weight:700; color:var(--text); }',
    '#tab-shopmgr .sm-o-mail { font-size:15px; color:var(--muted); word-break:break-all; }',
    '#tab-shopmgr .sm-o-total { color:var(--text,#62545B); font-weight:600; }',
    '#tab-shopmgr .sm-o-time, #tab-shopmgr .sm-o-cnt { font-size:15px; color:var(--muted); }',
    '#tab-shopmgr .sm-o-arrow { margin-left:auto; color:var(--muted); transition:transform .15s; }',
    /* 她 20261030 §6.2：定金＋尾款订单的第二行收款进度条（按实际到账） */
    '#tab-shopmgr .sm-o-buyer { font-size:15px; color:var(--text,#62545B); }',
    '#tab-shopmgr .sm-o-pay2 { margin-top:8px; padding:8px 12px; border:1.5px solid #FFE3EC; border-radius:12px; background:#FFF7FA; }',
    '#tab-shopmgr .sm-p2-head { display:flex; align-items:center; gap:10px; font-size:14px; color:#55464E; margin-bottom:4px; }',
    '#tab-shopmgr .sm-p2-state { font-size:13px; font-weight:600; }',
    '#tab-shopmgr .sm-p2-state.bad { color:#C4636E !important; }',
    '#tab-shopmgr .sm-p2-row { display:grid; grid-template-columns:36px minmax(90px,max-content) 1fr 34px; gap:8px; align-items:center; font-size:13px; color:#62545B; margin:3px 0; }',
    '#tab-shopmgr .sm-p2-k { color:#81717A; }',
    '#tab-shopmgr .sm-p2-bar { display:block; height:7px; border-radius:999px; background:#FFE3EC; overflow:hidden; }',
    '#tab-shopmgr .sm-p2-bar i { display:block; height:100%; border-radius:999px; transition:width .25s; }',
    '#tab-shopmgr .sm-p2-t { text-align:right; color:#81717A; }',
    '#tab-shopmgr .sm-p2-sum { font-size:14px; color:#81717A; margin-top:6px; }',
    '#tab-shopmgr .sm-danger-zone { border:1.5px dashed #FFD1E0; }',
    /* 2026-10-30 §一：手机上「归档/删除」这类订单操作要真的能点得中（不缩到只剩 28px） */
    '@media (max-width:760px){ #tab-shopmgr .sm-o-acts .btn-mini { padding:9px 14px; font-size:14px; min-height:36px; } #tab-shopmgr .sm-o-acts { gap:6px; } }',
    /* 删除是危险操作：文字用危险色（button-theme.css 的全局颜色会盖掉内联样式，这里提高优先级） */
    '#tab-shopmgr .sm-o-del { color:#C4636E !important; border-color:#F3D5D8 !important; }',
    '#tab-shopmgr .sm-o-del:hover { background:#FDF0F1 !important; border-color:#EFB0B8 !important; }',
    '@media (max-width:720px){ #tab-shopmgr .sm-p2-row { grid-template-columns:32px 86px 1fr 30px; gap:6px; } }',
    '#tab-shopmgr .sm-order.open .sm-o-arrow { transform:rotate(90deg); }',
    '#tab-shopmgr .sm-o-body { border-top:1px solid var(--card-hover); margin-top:10px; padding-top:10px; display:flex; flex-direction:column; gap:10px; }',
    '#tab-shopmgr .sm-io-row { display:flex; align-items:center; gap:8px; font-size:16px; }',
    '#tab-shopmgr .sm-io-row img { width:44px; height:44px; border-radius:8px; object-fit:cover; background:var(--card); flex-shrink:0; }',
    '#tab-shopmgr .sm-io-sub { color:var(--muted); font-size:15px; }',
    '#tab-shopmgr .sm-line { font-size:16px; color:var(--text); word-break:break-word; }',
    '#tab-shopmgr .sm-line .lbl { color:var(--muted); font-size:15px; margin-right:6px; }',
    '#tab-shopmgr .sm-pay-img { max-width:220px; max-height:220px; border-radius:10px; border:1px solid var(--card-hover); display:block; background:var(--card); }',
    '#tab-shopmgr .sm-act { display:flex; gap:8px; flex-wrap:wrap; align-items:center; background:var(--card); border-radius:12px; padding:10px; }',
    '#tab-shopmgr .sm-act-v { display:block; }',
    '#tab-shopmgr .sm-act-v .sm-vrow { margin-bottom:12px; }',
    '#tab-shopmgr .sm-act-v .sm-vrow:last-child { margin-bottom:0; }',
    '#tab-shopmgr .sm-vlabel { display:block; font-size:13px; color:var(--muted,#81717A); margin-bottom:5px; }',
    '#tab-shopmgr .sm-act-v input { width:100%; box-sizing:border-box; margin-top:0; }',
    '#tab-shopmgr .sm-vfee-row { display:flex; gap:10px; align-items:center; flex-wrap:wrap; background:#fff; border:1.5px solid var(--accent-soft,#FCE4EC); border-radius:12px; padding:12px; }',
    '#tab-shopmgr .sm-vfee-row input { flex:1; min-width:140px; margin:0; }',
    '#tab-shopmgr .sm-vfee-row .sm-total-prev { font-size:15px; color:var(--muted); flex-shrink:0; }',
    '#tab-shopmgr .mo-item { background:#fff; border:1.5px solid var(--accent-soft,#FCE4EC); border-radius:14px; padding:14px; margin-bottom:12px; }',
    '#tab-shopmgr .mo-flabel { display:block; font-size:13px; color:var(--muted,#81717A); margin-bottom:5px; }',
    '#tab-shopmgr .mo-item input { width:100%; box-sizing:border-box; padding:10px 12px; font-size:15px; border:1.5px solid var(--accent-soft,#FCE4EC); border-radius:10px; background:#fff; color:var(--text); font-family:inherit; outline:none; }',
    '#tab-shopmgr .mo-sum-box { background:var(--card,#FFF0F5); border-radius:14px; padding:14px 16px; margin-bottom:12px; }',
    '#tab-shopmgr .mo-sum-row { display:flex; justify-content:space-between; font-size:16px; color:var(--text); padding:4px 0; }',
    '#tab-shopmgr .mo-sum-row .mo-sl { color:var(--muted); }',
    '#tab-shopmgr .mo-sum-total { display:flex; justify-content:space-between; align-items:center; border-top:1.5px dashed var(--accent-soft,#FCE4EC); margin-top:8px; padding-top:10px; }',
    '#tab-shopmgr .mo-sum-total b { font-size:22px; font-weight:800; color:var(--price,#ff6fa5); }',
    /* 手动开单：四个分区（默认展开）+ 高级选项（默认折叠）*/ 
    '#mo-form .mo-sec { border:1.5px solid var(--accent-soft,#FCE1EA); border-radius:14px; margin-bottom:10px; background:#fff; overflow:hidden; }',
    '#mo-form .mo-sec > summary { cursor:pointer; list-style:none; display:flex; align-items:center; gap:9px; padding:11px 14px; font-size:16px; font-weight:700; color:var(--text,#62545B); background:var(--card,#FFF8FA); user-select:none; }',
    '#mo-form .mo-sec > summary::-webkit-details-marker { display:none; }',
    '#mo-form .mo-sec > summary::after { content:"▾"; margin-left:auto; color:#A98D96; font-size:13px; transition:transform .2s; }',
    '#mo-form .mo-sec[open] > summary::after { transform:rotate(180deg); }',
    '#mo-form .mo-step { display:inline-flex; align-items:center; justify-content:center; width:22px; height:22px; border-radius:50%; background:#FCE1EA; color:#A98D96; font-size:13px; font-weight:700; flex:none; }',
    '#mo-form .mo-sec-body { padding:12px 14px 14px; }',
    '#mo-form .mo-adv { margin-top:10px; border:1.5px dashed var(--accent-soft,#FCE1EA); border-radius:12px; padding:0 12px 12px; }',
    '#mo-form .mo-adv > summary { cursor:pointer; list-style:none; padding:10px 0; font-size:14px; color:#A98D96; font-weight:600; }',
    '#mo-form .mo-adv > summary::-webkit-details-marker { display:none; }',
    '#mo-form .mo-adv > summary::before { content:"＋ "; }',
    '#mo-form .mo-adv[open] > summary::before { content:"－ "; }',
    '#tab-shopmgr .sm-act .lbl { font-size:15px; color:var(--muted); flex-shrink:0; }',
    '#tab-shopmgr .sm-act input, #tab-shopmgr .sm-act textarea { flex:1; min-width:120px; width:auto; }',
    '#tab-shopmgr .sm-act .sm-reject-reason { min-width:190px; }',
    '#tab-shopmgr .sm-act textarea { min-height:44px; }',
    '#tab-shopmgr .sm-total-prev { color:var(--text,#62545B); font-size:15px; white-space:nowrap; }',
    '#tab-shopmgr .sm-g-top { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }',
    '#tab-shopmgr .sm-g-meta { font-size:15px; color:var(--muted); margin-top:4px; }',
    '#tab-shopmgr .sm-mb-row { font-size:16px; padding:5px 0; border-bottom:1px dashed var(--card-hover); }',
    '#tab-shopmgr .sm-mb-row:last-child { border-bottom:none; }',
    '#tab-shopmgr .sm-c-row { display:flex; align-items:center; gap:8px; flex-wrap:wrap; padding:9px 0; border-bottom:1px solid var(--card-hover); }',
    '#tab-shopmgr .sm-c-row:last-child { border-bottom:none; }',
    '#tab-shopmgr .sm-c-code { font-weight:700; color:var(--text); }',
    '#tab-shopmgr .sm-b-mail { display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap; padding:6px 0; border-bottom:1px dashed var(--card-hover); font-size:16px; }',
    '#tab-shopmgr .sm-b-mail:last-child { border-bottom:none; }',
    '#tab-shopmgr .sm-var-row, #tab-shop .sm-var-row { background:#fff; border-radius:14px; padding:14px; margin-bottom:12px; box-shadow:0 2px 10px rgba(180,120,150,.10); }',
    '#tab-shopmgr .sm-var-grid, #tab-shop .sm-var-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; }',
    '#tab-shopmgr .sm-var-grid label, #tab-shop .sm-var-grid label { display:block; font-size:13px; color:var(--muted,#81717A); margin-bottom:5px; line-height:1.4; }',
    '#tab-shopmgr .sm-var-grid input, #tab-shop .sm-var-grid input { width:100%; box-sizing:border-box; padding:10px 12px; font-size:15px; border:1.5px solid var(--accent-soft,#FCE4EC); border-radius:10px; background:#fff; outline:none; color:var(--text); font-family:inherit; }',
    '#tab-shopmgr .sm-var-grid input:focus, #tab-shop .sm-var-grid input:focus { border-color:var(--card-hover,#FCE4EC); }',
    '#tab-shopmgr .sm-var-imgs, #tab-shop .sm-var-imgs { display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-top:12px; }',
    '#tab-shopmgr .sm-var-imgs img, #tab-shop .sm-var-imgs img { width:52px; height:52px; border-radius:10px; object-fit:cover; background:var(--card); }',
    '#tab-shopmgr .sm-var-imgdel, #tab-shop .sm-var-imgdel { position:absolute; top:-6px; right:-6px; width:18px; height:18px; border:none; border-radius:50%; background:#FBE3E6; color:#C4636E; font-size:12px; line-height:1; cursor:pointer; }',
    '#tab-shopmgr .sm-var-imgmv, #tab-shop .sm-var-imgmv { position:absolute; bottom:-6px; width:18px; height:18px; border:1.5px solid #FFD1E0; border-radius:50%; background:#FFF7FA; color:#A98D96; font-size:13px; line-height:1; cursor:pointer; padding:0; }',
    '#tab-shopmgr .sm-var-imgmv[data-d="-1"], #tab-shop .sm-var-imgmv[data-d="-1"] { left:-4px; }',
    '#tab-shopmgr .sm-var-imgmv[data-d="1"], #tab-shop .sm-var-imgmv[data-d="1"] { right:8px; }',
    '#tab-shopmgr .sm-var-imgmv:disabled, #tab-shop .sm-var-imgmv:disabled { opacity:.45; cursor:default; background:#F8F0F3; border-color:#EADCE2; color:#B9A5AE; }',
    '#tab-shopmgr .sm-empty { text-align:center; color:var(--muted); font-size:17px; padding:24px 0; }',
    '@media (max-width:640px) { #tab-shopmgr .sm-stats { grid-template-columns:repeat(2,1fr); } #tab-shopmgr .sm-var-grid, #tab-shop .sm-var-grid { grid-template-columns:1fr 1fr; } }'
  ].join('\n');
  document.head.appendChild(css);

  /* ── 状态 ── */
  var SM = {
    tab: 'orders',
    loaded: false,
    orders: [], groups: [], coupons: [], profiles: [], msgs: [], products: [], payments: [], payRecords: [],
    ship: { service_fee: 2, flat_est: 5 },
    ofilter: '', osearch: '',
    oopen: {},            // order_id -> 行是否展开
    gopen: {},            // group_id -> 成员列表是否展开
    members: {},          // group_id -> 成员数组
    gPid: '', gSku: '',   // 新建拼团：选中的商品 / 规格
    cEdit: null,          // 编辑中的优惠券 id（null = 新建）
    cType: 'percent',     // 优惠券类型（自定义下拉，不用原生 select）
    cAg: false            // 优惠券 allow_group（自定义开关，不用原生 checkbox）
  };

  /* ── 小工具 ── */
  function arr(v) { return Array.isArray(v) ? v : []; }
  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }
  function byId(list, id) {
    for (var i = 0; i < list.length; i++) if (String(list[i].id) === String(id)) return list[i];
    return null;
  }
  function restGet(path) {
    return api(path).then(function (r) { if (!r.ok) throw new Error('http'); return r.json(); });
  }
  function restWrite(path, method, body, okMsg) {
    return api(path, { method: method, body: JSON.stringify(body) })
      .then(function (r) { if (!r.ok) throw new Error('http'); if (okMsg) toast(okMsg); return true; })
      .catch(function () { toast('保存失败：数据库没连上（本次改动不会落库）'); return false; });
  }
  /* 2026-10-30 §一：操作人写真实管理员邮箱（会话里就有），以后查“谁删的”能查到人，不只一个 admin 字样 */
  function adminActor() {
    try {
      var s = JSON.parse(localStorage.getItem('yuki-admin-session') || 'null');
      if (s && s.email) return 'admin:' + s.email;
    } catch (e) {}
    return 'admin';
  }
  function addLog(orderId, action, detail, actor) {
    return api('shop_order_logs', { method: 'POST', body: JSON.stringify({ order_id: orderId, actor: actor || adminActor(), action: action, detail: detail || '' }) }).catch(function () {});
  }

  var ST = {
    pending:   ['待付款',   '#c4bcb6'],
    reviewing: ['待审核',   'var(--warning,#E0A458)'],
    rejected:  ['凭证有误', '#e6a9c3'],
    paid:      ['待发货',   'var(--success,#5FA777)'],
    shipped:   ['已发货',   '#b3ace0'],
    completed: ['已完成',   'var(--success,#5FA777)'],
    cancelled: ['已取消',   '#c4bcb6'],
    archived: ['已归档', '#c4bcb6'],
    refunding: ['退款处理', 'var(--warning,#E0A458)'],
    refunded:  ['已退款',   '#c4bcb6']
  };
  var O_CHIPS = [['', '全部'], ['pending', '待付款'], ['reviewing', '待审核'], ['paid', '待发货'],
                 ['shipped', '已发货'], ['completed', '已完成'], ['rejected', '凭证有误'],
                 ['refunding', '退款中'], ['refunded', '已退款'], ['cancelled', '已取消'], ['archived', '已归档']];
  var G_ST = { open: ['进行中', 'var(--success,#5FA777)'], success: ['已成团', 'var(--success,#5FA777)'], failed: ['已失败', '#c4bcb6'], cancelled: ['已取消', '#c4bcb6'] };
  var AS_ST = { open: ['待处理', 'var(--warning,#E0A458)'], done: ['已结案', 'var(--success,#5FA777)'], rejected: ['已拒绝', '#c4bcb6'] };

  function badge(st, map) {
    var m = map[st] || [st, '#c4bcb6'];
    return '<span class="sold-badge" style="background:' + m[1] + ';">' + esc(m[0]) + '</span>';
  }

  /* ── 付款凭证：私有桶 pay 路径 → 带签名临时 URL ── */
  var PAY_SIGN = {};
  function signedPay(path) {
    if (!path) return Promise.resolve('');
    var key = String(path).replace(/^\/+/, '');
    if (PAY_SIGN[key]) return Promise.resolve(PAY_SIGN[key]);
    return authedFetch(SUPABASE_URL + '/storage/v1/object/sign/pay/' + key, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_ANON_KEY },
      body: JSON.stringify({ expiresIn: 600 })
    }).then(function (r) { if (!r.ok) throw new Error('sign'); return r.json(); })
      .then(function (d) {
        var u = SUPABASE_URL + '/storage/v1' + (d.signedURL || ('/object/sign/' + (d.signedPath || '')));
        PAY_SIGN[key] = u;
        return u;
      })
      .catch(function () { return ''; });
  }

  /* ── 数据加载（真 API 优先，失败回退可注入假数组）── */
  function loadOrders() {
    return restGet('shop_orders?select=*&status=neq.deleted&order=created_at.desc&limit=300')
      .then(function (rows) {
        // 再按「删除登记表」排一次（触发器还没允许 deleted 时，靠这张表把已删单挡在外面）
        if (window.YkOrderDel) return window.YkOrderDel.filter(arr(rows));
        return arr(rows);
      })
      .then(function (rows) { SM.orders = arr(rows); SM._oFailed = false; })
      .catch(function () { SM.orders = arr(window.SHOP_ORDERS); SM._oFailed = true; })
      .then(function () { renderOrders(); renderStats(); });
  }
  window.loadShopOrders = loadOrders; // 线下开单（admin-crm.js）保存/取消后让订单页即时刷新
  function loadGroups() {
    return restGet('shop_groups?select=*&order=created_at.desc&limit=200')
      .then(function (rows) { SM.groups = arr(rows); })
      .catch(function () { SM.groups = arr(window.SHOP_GROUPS); })
      .then(function () { renderGroups(); renderStats(); });
  }
  function loadCoupons() {
    return restGet('shop_coupons?select=*&order=created_at.desc&limit=200')
      .then(function (rows) { SM.coupons = arr(rows); })
      .catch(function () { SM.coupons = arr(window.SHOP_COUPONS); })
      .then(renderCoupons);
  }
  function loadProfiles() {
    return restGet('shop_profiles?select=id,name,nickname,phone&order=created_at.desc&limit=300')
      .then(function (rows) { SM.profiles = arr(rows); })
      .catch(function () { SM.profiles = arr(window.SHOP_PROFILES); })
      .then(renderBuyers);
  }
  function loadMsgs() {
    return restGet('shop_order_msgs?select=*&type=eq.aftersale&order=created_at.desc&limit=100')
      .then(function (rows) { SM.msgs = arr(rows); })
      .catch(function () { SM.msgs = arr(window.SHOP_MSGS).filter(function (m) { return m.type === 'aftersale'; }); })
      .then(renderAftersale);
  }
  function loadProducts() {
    return restGet('products?select=id,name,price,stock,variants,weight_oz,image_url,tag&order=created_at.desc&limit=200')
      .then(function (rows) { SM.products = arr(rows); })
      .catch(function () { SM.products = arr(window.SHOP_PRODUCTS); });
  }
  function loadShip() {
    var local = null;
    try { local = JSON.parse(SETTINGS['shop_ship'] || 'null'); } catch (e) {}
    if (local && typeof local === 'object') { SM.ship = local; renderSettings(); return Promise.resolve(); }
    return restGet('site_settings?select=key,value&key=eq.shop_ship')
      .then(function (rows) {
        var v = (arr(rows)[0] || {}).value;
        try { v = JSON.parse(v); } catch (e) { v = null; }
        SM.ship = (v && typeof v === 'object') ? v : (window.SHOP_SHIP || { service_fee: 2, flat_est: 5 });
      })
      .catch(function () { SM.ship = window.SHOP_SHIP || { service_fee: 2, flat_est: 5 }; })
      .then(renderSettings);
  }
  function loadPayments() { // Stripe 支付/退款流水：付款状态判定以这里为准（她 2026-10-25 规格）
    return restGet('shop_payments?select=order_id,status,amount&order=created_at.desc&limit=1000')
      .then(function (rows) { SM.payments = arr(rows); })
      .catch(function () { SM.payments = arr(window.SHOP_PAYMENTS); });
  }
  function loadPayRecords() { // 人工收款台账（订金/尾款/分期/退款，生产库已有表+RPC，2026-10-28 接线）
    return restGet('shop_order_pay_records?select=id,order_id,kind,amount,method,txn_ref,paid_at&order=created_at.desc&limit=1000')
      .then(function (rows) { SM.payRecords = arr(rows); })
      .catch(function () { SM.payRecords = []; });
  }
  var KIND_LABEL = { deposit: '订金', final: '尾款', installment: '分期', full: '全款', other: '其他' }; // 收款类型（shop_pay_record_add 白名单，含 2026-10-28 扩展的 full）
  function payNet(o) { // 人工收款台账汇总：非退款=累计实收，refund=退款
    var ps = arr(SM.payRecords).filter(function (x) { return String(x.order_id) === String(o.id); });
    var paid = ps.filter(function (x) { return x.kind !== 'refund'; }).reduce(function (t, x) { return t + num(x.amount); }, 0);
    var refunded = ps.filter(function (x) { return x.kind === 'refund'; }).reduce(function (t, x) { return t + num(x.amount); }, 0);
    return { paid: paid, refunded: refunded, rows: ps };
  }
  function payInfo(o) {
    var ps = arr(SM.payments).filter(function (x) { return String(x.order_id) === String(o.id); });
    var paid = ps.filter(function (x) { return x.status === 'paid'; }).reduce(function (t, x) { return t + num(x.amount); }, 0);
    var refunded = ps.filter(function (x) { return x.status === 'refunded'; }).reduce(function (t, x) { return t + num(x.amount); }, 0);
    return { paid: paid, refunded: refunded };
  }
  /* 她 20261030 §6.2：定金＋尾款订单的第二行收款进度（必须按实际到账算，不能按应收算）
     应收定金/应收尾款优先读 shop_orders.deposit_due / balance_due（列未建时以已收代替并在界面注明） */
  function payPlan(o) {
    var mn = payNet(o), pi = payInfo(o);
    var depPaid = 0, finPaid = 0, fullPaid = 0;
    mn.rows.filter(function (x) { return x.kind !== 'refund'; }).forEach(function (x) {
      if (x.kind === 'deposit') depPaid += num(x.amount);
      else if (x.kind === 'final') finPaid += num(x.amount);
      else fullPaid += num(x.amount);
    });
    fullPaid += pi.paid; // Stripe 实收归入「其他/全款」，不当定金尾款用
    var total = num(o.total);
    var depDue = (o.deposit_due != null && o.deposit_due !== '') ? num(o.deposit_due) : null;
    var finDue = (o.balance_due != null && o.balance_due !== '') ? num(o.balance_due) : null;
    var isPlan = !!(depDue || finDue || depPaid > 0 || finPaid > 0);
    if (!isPlan) return null;
    var guessed = false;
    if (depDue == null) { depDue = depPaid; guessed = true; }
    if (finDue == null) finDue = Math.max(0, total - depDue);
    var paidAll = depPaid + finPaid + fullPaid;
    var rem = total - paidAll;
    var pct = total > 0 ? Math.min(100, Math.round(paidAll / total * 100)) : 0;
    var warn = '';
    if (rem < -0.005) warn = '超收 $' + fmtMoney(-rem);
    else if (Math.abs((depDue + finDue) - total) > 0.02) warn = '应收不符：定金＋尾款 $' + fmtMoney(depDue + finDue) + ' ≠ 总额 $' + fmtMoney(total);
    var state;
    if (warn) state = warn;
    else if (depPaid <= 0.005) state = '定金待收';
    else if (depPaid + 0.005 < depDue) state = '定金部分收款';
    else if (finPaid <= 0.005) state = '定金已收 · 尾款待收';
    else if (finPaid + 0.005 < finDue) state = '尾款部分收款';
    else state = '已结清';
    return { depDue: depDue, depPaid: depPaid, finDue: finDue, finPaid: finPaid, paidAll: paidAll, rem: rem, pct: pct, warn: warn, state: state, guessed: guessed, total: total };
  }
  function pay2Html(o) {
    var p = payPlan(o);
    if (!p) return ''; // 一次性全款订单不显示第二行（她 §6.2）
    var barW = function (paid, due) { return due > 0 ? Math.max(0, Math.min(100, Math.round(paid / due * 100))) : (paid > 0 ? 100 : 0); };
    var col = p.warn ? '#C4636E' : '#A98D96';
    var line = function (label, paid, due) {
      var w = barW(paid, due);
      return '<div class="sm-p2-row"><span class="sm-p2-k">' + label + '</span>' +
        '<span class="sm-p2-v">$' + fmtMoney(paid) + ' / $' + fmtMoney(due) + '</span>' +
        '<span class="sm-p2-bar"><i style="width:' + w + '%;background:' + (w >= 100 ? '#A98D96' : '#F2A9C4') + ';"></i></span>' +
        '<span class="sm-p2-t">' + (w >= 100 ? '已收' : (paid > 0 ? '部分' : '待收')) + '</span></div>';
    };
    return '<div class="sm-o-pay2">' +
      '<div class="sm-p2-head"><b>定金 / 尾款</b><span class="sm-p2-state' + (p.warn ? ' bad' : '') + '" style="color:' + col + ';">' + esc(p.state) + '</span></div>' +
      line('定金', p.depPaid, p.depDue) + line('尾款', p.finPaid, p.finDue) +
      '<div class="sm-p2-sum">已收总额 <b style="color:var(--price,#ff6fa5);">$' + fmtMoney(p.paidAll) + '</b>' +
      (p.rem > 0.005 ? ' · 剩余待收 <b style="color:#f3b96d;">$' + fmtMoney(p.rem) + '</b>' : ' · <b style="color:var(--price,#ff6fa5);">已结清</b>') +
      ' · 收款进度 <b>' + p.pct + '%</b>' + (p.guessed ? ' · <span style="color:var(--muted,#81717A);">应收定金列未建，暂按已收计</span>' : '') + '</div>' +
      '</div>';
  }
  /* ═══════════════════════════════════════════════════════════════════════
     她 20261031 §三/§五：所有订单都显示真实可视付款进度条
     - 全款单：一条总进度条
     - 定金尾款单：定金 + 尾款 + 总进度三条
     - 数据全部来自「有效收款流水 - 退款流水」，不读也不写死百分比
     ═══════════════════════════════════════════════════════════════════════ */
  var PAY_BAR_HIDE = ['shipped', 'completed', 'cancelled', 'archived']; // §七：这四种不显示进度条
  function payStat(o) {
    var pi = payInfo(o), mn = payNet(o);
    var dep = 0, fin = 0, other = 0, depDue0 = null, finDue0 = null;
    mn.rows.forEach(function (x) {
      if (x.kind === 'refund') return;
      if (x.kind === 'deposit') dep += num(x.amount);
      else if (x.kind === 'final') fin += num(x.amount);
      else other += num(x.amount);
    });
    var flowGross = dep + fin + other + pi.paid;
    var legacy = 0, noFlow = false;
    if (flowGross <= 0.005 && num(o.pay_amount) > 0) { legacy = num(o.pay_amount); noFlow = true; }
    var gross = flowGross + legacy;
    var refunded = pi.refunded + mn.refunded;
    var net = Math.max(0, gross - refunded);
    var due = num(o.total);
    var remaining = Math.max(0, due - net);
    var over = due > 0 ? Math.max(0, net - due) : Math.max(0, net);
    var pct = due > 0 ? Math.min(100, net / due * 100) : (net > 0 ? 100 : 0);
    if (o.deposit_due != null && o.deposit_due !== '') depDue0 = num(o.deposit_due);
    if (o.balance_due != null && o.balance_due !== '') finDue0 = num(o.balance_due);
    var isPlan = (depDue0 != null || finDue0 != null || dep > 0 || fin > 0);
    var depDue = depDue0, finDue = finDue0;
    if (isPlan) {
      if (depDue == null) depDue = dep;
      if (finDue == null) finDue = Math.max(0, due - depDue);
    }
    var st;
    if (refunded > 0.005 && net <= 0.005) st = '已全额退款';
    else if (due <= 0) st = '应收 $0';
    else if (net >= due - 0.005) st = '已付清';
    else if (net > 0.005) st = '部分付款';
    else st = '未付款';
    return {
      dep: dep, fin: fin, other: other, depDue: depDue, finDue: finDue, isPlan: isPlan,
      gross: gross, refunded: refunded, net: net, due: due, remaining: remaining, over: over,
      pct: pct, state: st, noFlow: noFlow, legacy: legacy,
      incomplete: (net <= 0.005 && ['paid', 'completed', 'shipped'].indexOf(o.status) !== -1 && gross <= 0.005)
    };
  }
  function fmtPct(v) {
    var r = Math.round(v * 100) / 100;
    return (Math.abs(r - Math.round(r)) < 0.005 ? String(Math.round(r)) : r.toFixed(2)) + '%';
  }
  function pbSlot(got, due) {
    var pct = due > 0 ? Math.max(0, Math.min(1, got / due)) * 100 : (got > 0 ? 100 : 0);
    return '<span class="sm-pb-slot"><i style="width:' + (Math.round(pct * 100) / 100) + '%;"></i></span>';
  }
  function pbLine(label, got, due) {
    var pct = due > 0 ? Math.max(0, Math.min(1, got / due)) * 100 : (got > 0 ? 100 : 0);
    var tag = pct >= 99.995 ? '已收' : (got > 0.005 ? '部分' : '待收');
    return '<div class="sm-pb-line"><span class="sm-pb-k">' + label + '</span>' +
      '<span class="sm-pb-v">$' + fmtMoney(got) + ' / $' + fmtMoney(due) + '</span>' +
      pbSlot(got, due) +
      '<span class="sm-pb-t">' + tag + ' · ' + fmtPct(pct) + '</span></div>';
  }
  function progressHtml(o) {
    if (PAY_BAR_HIDE.indexOf(o.status) !== -1) return ''; // 已发货/已完成/已取消/已归档不显示
    var s = payStat(o);
    if (s.due <= 0 && s.net <= 0) return '';
    var head = '<div class="sm-paybar-top"><b>付款进度</b>' +
      '<span class="sm-pb-state' + (s.state === '已付清' ? ' ok' : (s.over > 0 || s.refunded > 0 ? ' warn' : '')) + '">' + esc(s.state) + '</span></div>';
    var lines = '';
    if (s.isPlan) {
      lines = pbLine('定金', s.dep, s.depDue) + pbLine('尾款', s.fin, s.finDue);
    }
    lines += pbLine(s.isPlan ? '总付款' : '付款', s.net, s.due);
    var sum = '已收 <b>$' + fmtMoney(s.net) + '</b> / 应收 <b>$' + fmtMoney(s.due) + '</b>' +
      ' · 剩余待收 <b>' + (s.remaining > 0.005 ? '$' + fmtMoney(s.remaining) : '$0.00') + '</b>' +
      ' · 进度 <b>' + fmtPct(s.pct) + '</b>';
    if (s.refunded > 0.005) sum += ' · 已退款 <b>$' + fmtMoney(s.refunded) + '</b>';
    if (s.over > 0.005) sum += ' · <span class="sm-pb-extra">超收 $' + fmtMoney(s.over) + '</span>';
    var tips = '';
    if (s.noFlow) tips += '<div class="sm-pb-tip">按订单里的付款金额 $' + fmtMoney(s.legacy) + ' 计算（这张单没有收款流水记录）</div>';
    if (s.incomplete) tips += '<div class="sm-pb-tip bad">这张单标记为已付款，但找不到收款流水；进度不伪造，显示为 0%</div>';
    return '<div class="sm-paybar" data-paybar="1">' + head + lines +
      '<div class="sm-pb-sum">' + sum + '</div>' + tips + '</div>';
  }
  function payLabel(o) { // 付款状态（与订单状态分开展示，不把已付款和已发货混为一谈；含人工收款台账）
    var pi = payInfo(o);
    var mn = payNet(o);
    var paidAll = pi.paid + mn.paid, refAll = pi.refunded + mn.refunded;
    var total = num(o.total) || 1;
    if (refAll > 0 && refAll >= total - 0.005) return '已全额退款';
    if (refAll > 0) return '部分退款 $' + fmtMoney(refAll);
    if (paidAll > 0) return paidAll >= total - 0.005 ? '已付款' : '部分付款 $' + fmtMoney(paidAll);
    if (['paid', 'shipped', 'completed'].indexOf(o.status) !== -1) return '已付款';
    if (o.status === 'pending') return '待付款';
    if (o.status === 'reviewing') return '待审核付款';
    if (o.status === 'rejected') return '凭证有误';
    if (o.status === 'refunding') return '退款处理中';
    if (o.status === 'cancelled') return '未付款 · 已取消';
    return '未付款';
  }
  function loadAll() {
    return Promise.all([loadOrders(), loadGroups(), loadCoupons(), loadProfiles(), loadMsgs(), loadProducts(), loadShip(), loadPayments(), loadPayRecords()])
      .then(function () { SM.loaded = true; renderOrders(); renderStats(); }); // 全部到齐再刷一次：付款状态徽章要用支付流水（她 2026-10-25）
  }

  /* ── 顶部统计条 ── */
  function renderStats() {
    var box = document.getElementById('sm-stats');
    if (!box) return;
    // 统计只算「当前这个人的可见订单」：已删除、已归档都不计入
    var vis = SM.orders.filter(function (o) {
      if (o.status === 'deleted') return false;
      if (window.YkOrderDel && window.YkOrderDel.isDel(o.id)) return false;
      return !isArchived(o);
    });
    var reviewing = vis.filter(function (o) { return o.status === 'reviewing'; }).length;
    var paid = vis.filter(function (o) { return o.status === 'paid'; }).length;
    var openG = SM.groups.filter(function (g) { return g.status === 'open'; }).length;
    var confirmed = vis.filter(function (o) { return ['paid', 'shipped', 'completed'].indexOf(o.status) !== -1; })
      .reduce(function (t, o) { return t + num(o.total); }, 0);
    box.innerHTML =
      '<div class="sm-stat"><b data-stat="reviewing">' + reviewing + '</b><span>待审核付款</span></div>' +
      '<div class="sm-stat"><b data-stat="paid">' + paid + '</b><span>待发货</span></div>' +
      '<div class="sm-stat"><b data-stat="groups">' + openG + '</b><span>进行中拼团</span></div>' +
      '<div class="sm-stat"><b data-stat="confirmed">$' + fmtMoney(confirmed) + '</b><span>已确认收款</span></div>';
  }

  /* ═══ 订单管理 ═══ */
  function renderOrderChips() {
    var box = document.getElementById('sm-o-chips');
    if (!box) return;
    box.innerHTML = O_CHIPS.map(function (c) {
      return '<button type="button" class="dy-chip' + (SM.ofilter === c[0] ? ' active' : '') + '" data-f="' + c[0] + '">' + c[1] + '</button>';
    }).join('');
  }
  function filteredOrders() {
    var q = SM.osearch.toLowerCase();
    return SM.orders.filter(function (o) {
      // 2026-10-31：已删除的永远不进任何列表；已归档的只在「已归档」里出现
      if (window.YkOrderDel && window.YkOrderDel.isDel(o.id)) return false;
      if (o.status === 'deleted') return false;
      var arch = isArchived(o);
      if (SM.ofilter === 'archived') {
        if (!arch) return false;
      } else {
        if (arch) return false;
        if (SM.ofilter && o.status !== SM.ofilter) return false;
      }
      if (q) {
        var a = o.address || {};
        var names = arr(o.items).map(function (it) { return it.name; }); // 她 §6.3：商品名称也要能搜
        var hay = [o.order_no, o.email, a.name, a.phone].concat(names).map(function (x) { return String(x || '').toLowerCase(); });
        if (!hay.some(function (h) { return h.indexOf(q) !== -1; })) return false; // 编号/邮箱/姓名/电话/商品名都可搜
      }
      return true;
    });
  }
  function itemsHtml(o) {
    return arr(o.items).map(function (it) {
      var img = it.image ? '<img src="' + escAttr(it.image) + '">' : '';
      return '<div class="sm-io-row">' + img +
        '<span>' + esc(it.name || it.sku || '商品') + '</span>' +
        '<span class="sm-io-sub">' + (it.sku ? 'SKU ' + esc(it.sku) + ' · ' : '') + '×' + (it.qty || 1) + ' · <span style="color:var(--price,#ff6fa5);">$' + fmtMoney(it.price) + '</span>' + '</span>' +
        '</div>';
    }).join('');
  }
  // ── 订单商品编辑（从现有商品中选择，自动重算金额）──
  function ieProdOpts(selName) {
    return '<option value="">选择商品…</option>' + SM.products.map(function (p) {
      return '<option value="' + escAttr(p.id) + '" data-name="' + escAttr(p.name || '') + '" data-price="' + escAttr(p.price != null ? p.price : '') + '"' + (p.name === selName ? ' selected' : '') + '>' + esc((p.name || '（未命名）') + ' · $' + fmtMoney(p.price)) + '</option>';
    }).join('');
  }
  function itemEditRow(it) {
    it = it || {};
    return '<div class="sm-ie-row" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;background:var(--card,#FFF0F5);border-radius:10px;padding:6px 8px;margin-bottom:6px;">' +
      '<select class="sm-ie-prod" style="flex:1;min-width:170px;max-width:280px;border:1.5px solid var(--accent-soft,#FCE4EC);border-radius:10px;padding:6px 8px;font-family:inherit;font-size:14px;background:#fff;color:var(--text,#62545B);">' + ieProdOpts(it.name) + '</select>' +
      '<label style="font-size:13px;color:var(--muted);">单价 $<input class="sm-ie-price" type="number" step="0.01" min="0" value="' + escAttr(it.price != null ? it.price : '') + '" style="width:74px;border:1.5px solid var(--accent-soft,#FCE4EC);border-radius:8px;padding:4px 6px;font-family:inherit;font-size:14px;"></label>' +
      '<label style="font-size:13px;color:var(--muted);">×<input class="sm-ie-qty" type="number" min="1" step="1" value="' + (it.qty || 1) + '" style="width:52px;border:1.5px solid var(--accent-soft,#FCE4EC);border-radius:8px;padding:4px 6px;font-family:inherit;font-size:14px;"></label>' +
      '<span class="sm-ie-line" style="font-size:14px;min-width:64px;text-align:right;color:var(--price,#ff6fa5);"></span>' +
      '<button type="button" class="btn-del sm-ie-del">删除</button>' +
    '</div>';
  }
  function ieReadRows(card) {
    var rows = [];
    Array.prototype.forEach.call(card.querySelectorAll('.sm-ie-row'), function (r) {
      var sel = r.querySelector('.sm-ie-prod');
      var opt = sel.selectedOptions[0];
      if (!opt || !opt.value) return; // 未选商品的行不算
      rows.push({
        product_id: opt.value,
        name: opt.getAttribute('data-name') || '',
        price: parseFloat(r.querySelector('.sm-ie-price').value) || 0,
        qty: Math.max(1, parseInt(r.querySelector('.sm-ie-qty').value, 10) || 1),
        image: (SM.products.filter(function (p) { return String(p.id) === String(opt.value); })[0] || {}).image || ''
      });
    });
    return rows;
  }
  function iePaintSum(card, o) {
    var items = ieReadRows(card);
    var sub = items.reduce(function (s, it) { return s + it.price * it.qty; }, 0);
    var ship = num(o.shipping_actual != null ? o.shipping_actual : o.shipping_est);
    var total = sub - num(o.discount) + ship + num(o.service_fee);
    var el = card.querySelector('.sm-ie-sum');
    if (el) el.innerHTML = '新小计 $' + fmtMoney(sub) + '（原 $' + fmtMoney(o.subtotal) + '）· 优惠 -$' + fmtMoney(o.discount) + ' · 运费 $' + fmtMoney(ship) + ' · 服务费 <span style="color:var(--price,#ff6fa5);">$' + fmtMoney(o.service_fee) + '</span>' + ' → 新总价 <b>$' + fmtMoney(total) + '</b>（原 $' + fmtMoney(o.total) + '）';
    return { items: items, sub: sub, total: total };
  }
  function ieRowLine(row) {
    if (!row) return;
    var p = parseFloat(row.querySelector('.sm-ie-price').value) || 0;
    var q = parseInt(row.querySelector('.sm-ie-qty').value, 10) || 1;
    row.querySelector('.sm-ie-line').textContent = '$' + fmtMoney(p * q);
  }
  function addrHtml(a) {
    a = a || {};
    /* 她 20261030 §6：库里存的是 line1 / line2（下单与开单都写这个键），
       旧显示只认 street 导致「收货」那行把街道吞掉（导出同时认两个键，所以导出是对的）。
       这里统一：line1 优先，兼容老的 street，并补上第二行。 */
    var street = a.line1 || a.street || '';
    var parts = [a.name, a.phone, street, a.line2, a.city, a.state, a.zip, a.country].filter(function (x) { return x; });
    return parts.length ? esc(parts.join(', ')) : '（无地址）';
  }

  /* ═══ 收件人模块（她 20261030 §6）：独立查看 / 编辑 / 粘贴识别 / 常用地址 / 独立保存 ═══
     严格边界：只写本订单自己的 orders.address 快照（+ 本订单邮箱），
     不碰其它订单、不碰商品与支付、不碰历史订单已经保存过的地址。
     地址识别只做「预览 → 用户点确认才填入」，绝不自动保存。 */
  function buildAddrSection(o) {
    var a = o.address || {};
    var v = function (k) { return escAttr(a[k] == null ? '' : a[k]); };
    var row = function (label, cls, val, ph) {
      return '<label class="sm-a-f"><span class="sm-a-l">' + label + '</span>' +
        '<input class="sm-a-in ' + cls + '" value="' + val + '" placeholder="' + (ph || '') + '"></label>';
    };
    return '<details class="sm-sec" data-sec="addr"' + (SM.oopen['addr_' + o.id] === false ? '' : ' open') + '>' +
      '<summary class="sm-sec-sum"><span class="sm-sec-step">②</span>收件人<span class="sm-sec-tip">改完要点「保存收件人」，不会自动提交</span></summary>' +
      '<div class="sm-sec-body">' +
        '<div class="sm-addr-view">' +
          '<div class="sm-line"><span class="lbl">收货</span><span class="sm-addr-text">' + addrHtml(o.address) + '</span></div>' +
          '<div class="sm-line"><span class="lbl">买家</span>' +
            (a.name ? esc(a.name) : '未提供') +
            (o.email ? ' · ' + esc(o.email) : ' · <span style="color:#D96570;">邮箱未填</span>') +
            (a.phone ? ' · ' + esc(a.phone) : ' · <span style="color:#D96570;">电话未提供</span>') +
          '</div>' +
          '<div class="sm-act">' +
            '<button type="button" class="btn-mini sm-addr-edit">编辑收件人</button>' +
            '<button type="button" class="btn-mini sm-addr-book">常用地址</button>' +
          '</div>' +
        '</div>' +
        '<div class="sm-addr-edit-box" style="display:none;">' +
          '<div class="sm-a-grid">' +
            row('收件人姓名', 'sm-a-name', v('name'), '必填') +
            row('电话', 'sm-a-phone', v('phone'), '必填') +
            row('邮箱', 'sm-a-email', escAttr(o.email || ''), '选填') +
            row('国家', 'sm-a-country', v('country'), '如 US / China') +
            row('州 / 省', 'sm-a-state', v('state'), '如 CA / 广东') +
            row('城市', 'sm-a-city', v('city'), '') +
            row('街道地址', 'sm-a-line1', v('line1') || v('street'), '街道 + 门牌') +
            row('地址第二行', 'sm-a-line2', v('line2'), '公寓 / 单元号（选填）') +
            row('邮编', 'sm-a-zip', v('zip'), '') +
          '</div>' +
          '<div class="sm-a-paste-wrap">' +
            '<div class="sm-a-paste-h">直接粘贴一整段地址（中英文都行），先识别再点「确认填入」；不确认就不动表单</div>' +
            '<textarea class="sm-a-paste" placeholder="例：Yuki Cheng, 415-555-0199, 123 Main St Apt 4B, San Francisco, CA 94110, US"></textarea>' +
            '<div class="sm-a-prevbox" style="display:none;"></div>' +
            '<div class="sm-act">' +
              '<button type="button" class="btn-mini sm-addr-parse">识别地址</button>' +
              '<button type="button" class="btn-mini sm-addr-apply" style="display:none;">确认填入</button>' +
            '</div>' +
          '</div>' +
          '<div class="sm-addr-booklist" style="display:none;"></div>' +
          '<div class="sm-act">' +
            '<button type="button" class="btn-save sm-addr-save">保存收件人</button>' +
            '<button type="button" class="btn-mini sm-addr-cancel">取消</button>' +
            '<span class="sm-a-dirty" style="color:#C4636E;font-size:13px;"></span>' +
          '</div>' +
        '</div>' +
      '</div></details>';
  }
  function orderHtml(o) {
    var open = !!SM.oopen[o.id];
    var st = ST[o.status] || [o.status, '#c4bcb6'];
    var ship = num(o.subtotal) - num(o.discount) + num(o.shipping_actual != null ? o.shipping_actual : o.shipping_est) + num(o.service_fee);
    var dead = o.status === 'refunded' || o.status === 'cancelled' || o.status === 'archived'; // 终态：不再出现付款/发货按钮（她 2026-10-25）
    var payL = payLabel(o);
    var body = '';
    if (open) {
      var a0 = o.address || {};
      var addrName = a0.name || '';
      var addrPhone = a0.phone || '';
      body = '<div class="sm-o-body">' +
        /* 她 20261030 §8：订单详情拆成四个独立折叠模块（商品 / 收件人 / 金额与收款 / 发货与备注），
           每块自己折叠、自己的保存按钮只保存自己的字段，不互相覆盖。 */
        '<details class="sm-sec" data-sec="items" open><summary class="sm-sec-sum"><span class="sm-sec-step">①</span>商品</summary><div class="sm-sec-body">' +
        '<div style="min-width:0;">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px;"><b style="font-size:15px;">商品</b>' +
          (o.status !== 'rejected'
            ? '<button type="button" class="btn-mini sm-item-edit">编辑商品</button>'
            : '<span style="font-size:13px;color:var(--muted);">凭证有误订单不可编辑商品</span>') +
          '</div>' +
          '<div class="sm-items-view">' + itemsHtml(o) + '</div>' +
          '<div class="sm-items-edit" style="display:none;"></div>' +
        '</div>' +
        '</div></details>' +
        buildAddrSection(o) +
        '<details class="sm-sec" data-sec="money" open><summary class="sm-sec-sum"><span class="sm-sec-step">③</span>金额与收款</summary><div class="sm-sec-body">' +
        '<div class="sm-line"><span class="lbl">订单信息</span>' + esc(o.order_no || '') + ' · ' +
          esc((o.created_at || '').replace('T', ' ').slice(0, 16).replace(/-/g, '/')) + ' · 来源：' +
          esc(SOURCE_LABEL[o.order_source || 'online'] || (o.order_source || 'online')) + ' · 付款：' + esc(payL) + '</div>' +
        (o.note ? '<div class="sm-line"><span class="lbl">买家留言</span>' + esc(o.note) + '</div>' : '') +
        (o.coupon_code ? '<div class="sm-line"><span class="lbl">优惠码</span>' + esc(o.coupon_code) + (num(o.discount) > 0 ? '（已减 <span style="color:var(--price,#ff6fa5);">$' + fmtMoney(o.discount) + '</span>' + '）' : '') + '</div>' : '') +
        '<div class="sm-line"><span class="lbl">付款</span>' +
        (o.pay_channel ? esc(o.pay_channel) + ' · ' : '') + (o.pay_amount != null && o.pay_amount !== '' ? '<span style="color:var(--price,#ff6fa5);">$' + fmtMoney(o.pay_amount) + '</span>' + ' · ' : '') +
        (o.pay_time ? esc(o.pay_time) + ' · ' : '') + (o.pay_note ? esc(o.pay_note) : '') +
        (o.status === 'rejected' && o.reject_reason ? '<div class="sm-io-sub">上次拒绝原因：' + esc(o.reject_reason) + '</div>' : '') +
        '</div>' +
        (o.pay_url ? '<img class="sm-pay-img" data-paypath="' + escAttr(o.pay_url) + '" alt="付款凭证">' : '') +
        '<div class="sm-line"><span class="lbl">金额</span>商品小计 <span style="color:var(--price,#ff6fa5);">$' + fmtMoney(o.subtotal) + '</span>' +
          (num(o.discount) > 0 ? ' · 折扣 -<span style="color:var(--price,#ff6fa5);">$' + fmtMoney(o.discount) + '</span>' : '') +
          ' · 运费 <span style="color:var(--price,#ff6fa5);">$' + fmtMoney(o.shipping_actual != null && o.shipping_actual !== '' ? o.shipping_actual : o.shipping_est) + '</span>' +
          ' · 税费 未收取' +
          ' · 服务费 <span style="color:var(--price,#ff6fa5);">$' + fmtMoney(o.service_fee) + '</span>' +
          ' · <b style="color:var(--price,#ff6fa5);">总价 $' + fmtMoney(o.total) + '</b></div>' +
        (function () {
          var pi = payInfo(o);
          var mn = payNet(o);
          var paidAll = pi.paid + mn.paid, refAll = pi.refunded + mn.refunded;
          var out = '';
          if (paidAll > 0 || refAll > 0) { // 收款明细：Stripe 流水+人工台账（订金/尾款/分期）分列，待收=总价-实收+退款（她 2026-10-28 任务书 6.4）
            var bits = [];
            if (pi.paid > 0) bits.push('Stripe <span style="color:var(--price,#ff6fa5);">$' + fmtMoney(pi.paid) + '</span>');
            var by = {};
            mn.rows.filter(function (x) { return x.kind !== 'refund'; }).forEach(function (x) { var k = x.kind || 'other'; by[k] = (by[k] || 0) + num(x.amount); });
            Object.keys(by).forEach(function (k) { bits.push((KIND_LABEL[k] || k) + ' <span style="color:var(--price,#ff6fa5);">$' + fmtMoney(by[k]) + '</span>'); });
            if (bits.length) out += '<div class="sm-line"><span class="lbl">收款</span>' + bits.join(' · ');
            var rem = num(o.total) - paidAll + refAll;
            if (bits.length) out += (rem > 0.005 ? ' · <b style="color:#f3b96d;">待收 $' + fmtMoney(rem) + '</b>' : ' · <b style="color:var(--price,#ff6fa5);">已结清</b>') + '</div>';
            if (refAll > 0) out += '<div class="sm-line"><span class="lbl">退款</span>' +
              (refAll >= num(o.total) - 0.005 ? '已全额退款 <span style="color:var(--price,#ff6fa5);">$' + fmtMoney(refAll) + '</span>' : '<b style="color:#f3b96d;">部分退款 $' + fmtMoney(refAll) + '</b>') + '</div>';
          }
          if (!dead) { // 定金/尾款勾选态：已记=粉底✓（点击可撤销），未记=白底（点击展开记录表单并预选，她 15:01 补充）
            var hasDep = mn.rows.some(function (x) { return x.kind === 'deposit'; });
            var hasFin = mn.rows.some(function (x) { return x.kind === 'final'; });
            out += '<div class="sm-line"><span class="lbl">付款进度</span>' +
              '<button type="button" class="chip sm-pflag' + (hasDep ? ' on' : '') + '" data-kind="deposit">定金' + (hasDep ? ' ✓' : '') + '</button> ' +
              '<button type="button" class="chip sm-pflag' + (hasFin ? ' on' : '') + '" data-kind="final">尾款' + (hasFin ? ' ✓' : '') + '</button>' +
              '<span style="font-size:12px;color:var(--muted,#81717A);margin-left:6px;">' + (hasDep || hasFin ? '点已勾的可撤销' : '点未勾的记一笔') + '</span></div>';
          }
          if (!dead) { // 多次收款：订金/尾款/分期分笔记录（人工收款，走 shop_pay_record_add RPC，幂等）
            out += '<div class="sm-act"><button type="button" class="btn-mini sm-recpay-toggle">＋ 记录收款</button>' +
              '<span class="sm-recpay" style="display:none;gap:8px;align-items:center;flex-wrap:wrap;">' +
              '<button type="button" class="sel-btn sm-pkind" data-v="deposit"><span class="pick-btn-label">订金</span></button>' +
              '<button type="button" class="sel-btn sm-pmethod" data-v="cash"><span class="pick-btn-label">现金</span></button>' +
              '<input class="sm-recpay-amt" type="number" step="0.01" min="0.01" placeholder="本次实收 $" style="width:110px;">' +
              '<input class="sm-recpay-ref" placeholder="参考号（选填，防重复）" style="width:150px;">' +
              '<button type="button" class="btn-save sm-recpay-save">保存收款</button>' +
              '</span></div>';
          }
          return out;
        })() +
        '</div></details>' +
        '<details class="sm-sec" data-sec="ship"><summary class="sm-sec-sum"><span class="sm-sec-step">④</span>发货与备注</summary><div class="sm-sec-body">' +
        (dead ? '<div class="sm-line"><span class="lbl">发货</span>' + (o.status === 'refunded' ? '已退款 · 无需发货' : '已取消 · 无需发货') +
            (o.tracking ? '（历史物流：' + esc(o.carrier || '') + ' ' + esc(o.tracking) + '）' : '') + '</div>' : '') +
        (dead ? '' :
        '<div class="sm-act">' +
        '<button type="button" class="btn-save sm-act-pay">确认付款</button>' +
        '<button type="button" class="btn-del sm-act-reject">拒绝凭证</button>' +
        '<input class="sm-reject-reason" placeholder="拒绝原因（拒绝凭证必填）">' +
        '</div>') +
        (dead ? '' : '<div class="sm-act sm-act-v"><span class="sm-vlabel">实际运费（Pirate Ship 实际金额，保存后买家应付同步更新）</span>' +
        '<div class="sm-vfee-row">' +
        '<input class="sm-ship-actual" type="number" step="0.01" min="0" placeholder="如 6.15" value="' + escAttr(o.shipping_actual == null ? '' : o.shipping_actual) + '">' +
        '<span class="sm-total-prev">当前应付 <span style="color:var(--price,#ff6fa5);">$' + fmtMoney(ship) + '</span>' + '</span>' +
        '<button type="button" class="btn-save sm-act-fee" style="padding:9px 24px;font-size:16px;">保存运费</button>' +
        '</div></div>' +
        '<div class="sm-act sm-act-v"><span class="sm-vlabel">发货物流（一行一项，填完点确认发货）</span>' +
        '<div class="sm-vrow"><span class="sm-vlabel">快递公司</span>' +
        '<button type="button" class="sel-btn sm-carrier" data-v="' + escAttr(o.carrier || 'UPS') + '"><span class="pick-btn-label">' + esc(o.carrier || 'UPS') + '</span></button></div>' +
        '<div class="sm-vrow"><span class="sm-vlabel">快递单号 *</span>' +
        '<input class="sm-tracking" placeholder="填运单号" value="' + escAttr(o.tracking || '') + '"></div>' +
        '<div class="sm-vrow"><span class="sm-vlabel">查件链接（可留空）</span>' +
        '<input class="sm-track-url" placeholder="https://…" value="' + escAttr(o.track_url || '') + '"></div>' +
        '<div class="sm-vrow"><span class="sm-vlabel">发货日期（点选）</span>' +
        '<input class="sm-ship-date" placeholder="点选日期" value="' + (o.shipped_at ? escAttr(String(o.shipped_at).slice(0, 10).replace(/-/g, '/')) : '') + '"></div>' +
        '<div class="sm-vrow"><span class="sm-vlabel">发货备注（可留空）</span>' +
        '<input class="sm-ship-note" placeholder="备注" value="' + escAttr(o.ship_note || '') + '"></div>' +
        '<button type="button" class="btn-save sm-act-ship" style="padding:10px 26px;font-size:16px;">确认发货</button>' +
        '</div>' +
        // 20261028p182：虚拟物流 6 状态推进（仅 TEST- 测试单号；加载当前进度后可点击切换）
        ((o.tracking || '').indexOf('TEST-') === 0 ?
          '<div class="sm-act sm-act-v"><span class="sm-vlabel">虚拟物流状态（测试单号专用，点击切换 · 不会发给真实客户）</span>' +
          '<div class="sm-track-steps" data-no="' + escAttr(o.tracking) + '" style="display:flex;gap:6px;flex-wrap:wrap;margin:8px 0;"><span style="font-size:13px;color:var(--muted);">加载中…</span></div>' +
          '<button type="button" class="btn-mini sm-ship-preview" style="margin-top:4px;">预览发货邮件（只预览，不发信）</button>' +
          '</div>' : '') +
        '<div class="sm-act"><span class="lbl">包裹</span>' +
        '<div class="sm-pkgs" style="width:100%;display:flex;flex-direction:column;gap:6px;"><span style="font-size:14px;color:var(--muted);">加载中…</span></div>' +
        '<button type="button" class="btn-mini sm-pkg-add">＋ 加一个包裹</button>' +
        '</div>') +
        '<div class="sm-act"><span class="lbl">内部备注</span>' +
        '<textarea class="sm-admin-note" placeholder="只有你自己能看到">' + esc(o.admin_note || '') + '</textarea>' +
        '<button type="button" class="btn-mini sm-act-note">保存备注</button>' +
        '</div>' +
        '</div></details>' +
        '<div class="sm-act sm-danger-zone"><span class="lbl">订单操作</span>' +
        (dead ? '<span style="font-size:13px;color:var(--muted);">已终态，不能重复取消</span>' : '<button type="button" class="btn-mini sm-act-cancel">取消订单</button>') +
        '<button type="button" class="btn-mini sm-act-export1">导出这一单</button>' +
        '<button type="button" class="btn-mini sm-act-print1">打印这一单</button>' +
        '<button type="button" class="btn-del sm-act-archive">归档订单</button>' +
        '<button type="button" class="btn-del sm-act-del">删除订单</button>' +
        '<span style="font-size:12px;color:var(--muted,#81717A);">归档＝可恢复的软删除（订单与收款流水全保留）；删除＝从订单列表彻底移出，只能靠审计日志追溯</span>' +
        '</div>' +
        '</div>';
    }
    return '<div class="card sm-order' + (open ? ' open' : '') + '" data-id="' + escAttr(o.id) + '">' +
      '<div class="sm-o-head">' +
      '<span class="ck-box sm-osel' + (SM.osel[o.id] ? ' on' : '') + '" data-id="' + escAttr(o.id) + '" style="width:18px;height:18px;border-radius:6px;border:2px solid var(--border,#FFD9E6);flex-shrink:0;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;line-height:1;color:var(--text,#62545B);background:' + (SM.osel[o.id] ? 'var(--accent-soft,#FCE4EC)' : '#fff') + '">' + (SM.osel[o.id] ? '<svg viewBox=\"0 0 16 16\" width=\"11\" height=\"11\" style=\"display:block;\"><path d=\"M3.2 8.6 L6.6 11.8 L12.8 4.6\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></svg>' : '') + '</span>' +
      '<span class="sm-o-no">' + esc(o.order_no || '') + '</span>' +
      '<span class="sold-badge" style="background:' + st[1] + ';">' + esc(dead ? (st[0] + ' · 无需发货') : (isArchived(o) ? (st[0] + ' · 已归档') : st[0])) + '</span>' +
      '<span class="sold-badge" style="background:#fff;border:1.5px solid var(--accent-soft,#FCE4EC);color:var(--muted,#81717A);">收款：' + esc(payL) + '</span>' +
      '<span class="sm-o-buyer">' + esc((o.address && o.address.name) || o.ship_name || '') + '</span>' +
      '<span class="sm-o-mail">' + esc(o.email || '') + '</span>' +
      ((o.note || o.coupon_code) ? '<span class="sm-o-cnt" title="' + escAttr((o.note ? '备注：' + o.note : '') + (o.coupon_code ? (o.note ? '；' : '') + '优惠码：' + o.coupon_code : '')) + '">' + (o.note ? '' : '') + (o.coupon_code ? '' : '') + '</span>' : '') +
      '<span class="sm-o-cnt">' + arr(o.items).length + ' 件</span>' +
      '<span class="sm-o-total" style="color:var(--price,#ff6fa5);font-weight:700;">$' + fmtMoney(o.total) + '</span>' +
      '<span class="sm-o-time">' + fmtTime(o.created_at) + '</span>' +
      /* 她 20261031 §二：归档入口必须一眼看到 —— 放在第一行、带文字，不藏在展开后的角落里 */
      '<span class="sm-o-acts">' +
        (isArchived(o)
          ? '<button type="button" class="btn-mini sm-o-restore" data-act="restore">恢复订单</button>'
          : '<button type="button" class="btn-mini sm-o-arch" data-act="archive">归档订单</button>') +
        '<button type="button" class="btn-mini sm-o-del" data-act="delete" style="color:#C4636E;border-color:#F3D5D8;">删除订单</button>' +
      '</span>' +
      '<span class="sm-o-arrow">▸</span>' +
      '</div>' + progressHtml(o) + body + '</div>';
  }
  // 虚拟物流 6 状态 chip 渲染（TEST- 单号）
  var TRACK_STEPS = ['已创建运单', '已发货', '运输途中', '到达当地配送站', '派送中', '已送达'];
  function loadTrackSteps(no) {
    var box = document.querySelector('.sm-track-steps[data-no="' + no.replace(/"/g, '') + '"]');
    if (!box) return;
    restGet('mock_tracking?select=step,status_zh&tracking_no=eq.' + encodeURIComponent(no) + '&order=step.asc').then(function (rows) {
      var cur = (rows && rows.length) ? rows[rows.length - 1].step : 0;
      box.innerHTML = TRACK_STEPS.map(function (st, i) {
        var step = i + 1;
        return '<button type="button" class="chip' + (step <= cur ? ' on' : '') + '" data-step="' + step + '">' + st + '</button>';
      }).join('') + '<span style="font-size:12px;color:var(--muted);align-self:center;">' + (cur >= 6 ? '已送达' : '当前：' + (cur > 0 ? TRACK_STEPS[cur - 1] : '未开始')) + '</span>';
    }).catch(function () { box.innerHTML = '<span style="font-size:13px;color:var(--muted);">进度加载失败，点其他地方刷新再试</span>'; });
  }

  function renderOrders() {
    renderOrderChips();
    var list = document.getElementById('sm-o-list');
    if (!list) return;
    var rows = filteredOrders();
    if (SM._oFailed) { // 网络断了就明说，不再无限「加载中」（她 2026-10-25 要求查根因，不能只靠重试）
      list.innerHTML = '<div class="sm-o-retrybox" style="background:var(--card,#FFF0F5);border-radius:14px;padding:20px;text-align:center;">' +
        '<p style="margin:0 0 10px;color:var(--muted);font-size:16px;">订单没加载出来（网络问题，不是订单丢了）</p>' +
        '<button type="button" class="btn-mini sm-o-retry" style="background:#FCE1EA;color:#A98D96;padding:9px 22px;font-size:15px;">点这里重新加载</button></div>';
      return;
    }
    list.innerHTML = rows.length ? rows.map(orderHtml).join('') : '<p class="sm-empty">没有符合条件的订单</p>';
    rows.forEach(function (o) { if ((o.tracking || '').indexOf('TEST-') === 0) loadTrackSteps(o.tracking); });
    // 已展开的行：补付款凭证签名图 + 包裹列表
    Array.prototype.forEach.call(list.querySelectorAll('img.sm-pay-img[data-paypath]'), function (img) {
      signedPay(img.getAttribute('data-paypath')).then(function (u) { if (u) img.src = u; });
    });
    Array.prototype.forEach.call(list.querySelectorAll('.sm-order.open'), function (card) { loadPkgs(card); });
    refreshArchBtn();
  }

  // ── 包裹管理（多包裹物流，shop_packages 表）──
  function pkgRowHtml(p) {
    p = p || {};
    return '<div class="sm-pkg-row" data-pkid="' + escAttr(p.id || '') + '" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;width:100%;background:var(--card,#FFF0F5);border-radius:10px;padding:6px 8px;">' +
      '<button type="button" class="sel-btn sm-carrier" data-v="' + escAttr(p.carrier || 'UPS') + '"><span class="pick-btn-label">' + esc(p.carrier || 'UPS') + '</span></button>' +
      '<input class="sm-p-tracking" placeholder="单号" value="' + escAttr(p.tracking || '') + '" style="width:130px;">' +
      '<input class="sm-p-url" placeholder="查件链接" value="' + escAttr(p.track_url || '') + '" style="width:150px;">' +
      '<input class="sm-p-weight" type="number" step="0.1" min="0" placeholder="重量oz" value="' + escAttr(p.weight_oz == null ? '' : p.weight_oz) + '" style="width:80px;">' +
      '<input class="sm-p-date" placeholder="发货日期" value="' + (p.shipped_at ? escAttr(String(p.shipped_at).slice(0, 10).replace(/-/g, '/')) : '') + '" style="width:110px;">' +
      '<input class="sm-p-note" placeholder="备注" value="' + escAttr(p.note || '') + '" style="width:110px;">' +
      '<button type="button" class="btn-mini sm-pkg-save">保存</button>' +
      '<button type="button" class="btn-del sm-pkg-del">删除</button>' +
      '</div>';
  }
  function loadPkgs(card) {
    var o = byId(SM.orders, card.getAttribute('data-id')); if (!o) return;
    var box = card.querySelector('.sm-pkgs'); if (!box) return;
    api('shop_packages?select=*&order_id=eq.' + o.id + '&order=created_at.asc').then(function (r) { return r.json(); }).then(function (rows) {
      rows = arr(rows);
      box.innerHTML = rows.length ? rows.map(pkgRowHtml).join('') : '<span style="font-size:14px;color:var(--muted);">还没有包裹，点「＋ 加一个包裹」</span>';
    }).catch(function () {
      box.innerHTML = '<span style="font-size:14px;color:var(--muted);">包裹数据没连上（跑 SQL2 后可用）</span>';
    });
  }

  function patchOrder(id, body, okMsg, logAction, logDetail) {
    return restWrite('shop_orders?id=eq.' + id, 'PATCH', body, okMsg).then(function (ok) {
      if (!ok) return false;
      var o = byId(SM.orders, id);
      if (o) Object.keys(body).forEach(function (k) { o[k] = body[k]; });
      if (logAction) addLog(id, logAction, logDetail || '');
      renderOrders(); renderStats();
      return true;
    });
  }

  /* ═══════════════════════════════════════════════════════════════════
     她 20261031 §二：归档 / 恢复（软删、二次确认、可恢复、流水全保留）
     ═══════════════════════════════════════════════════════════════════ */
  function selOrders() { return SM.orders.filter(function (o) { return SM.osel[o.id]; }); }
  /* 2026-10-31：归档不再改订单状态（状态机触发器不允许 archived），
     改成「按用户作用域的归档标记」：只影响当前这个人的列表，别人照旧看得见。 */
  function isArchived(o) {
    if (!o) return false;
    if (window.YkOrderDel && window.YkOrderDel.isArch(o.id)) return true;
    return o.status === 'archived'; // 老数据兼容
  }
  function markEntry(o) {
    var s = payStat(o);
    return {
      id: o.id,
      order_no: o.order_no || String(o.id).slice(0, 8),
      buyer: (o.address && o.address.name) || o.ship_name || o.email || '',
      total: num(o.total), currency: o.currency || 'USD', paid: s.net,
      from: o.status || '', at: new Date().toISOString(),
      by: String(adminActor()).replace(/^admin:/, '')
    };
  }
  /* 后端是表 + RPC 时，审计由服务端自己写（带 auth.uid()）；只有后备模式才在前端补日志 */
  function auditLocal(orderId, action, detail) {
    var be = (window.YkOrderDel && window.YkOrderDel.info) ? window.YkOrderDel.info().backend : '';
    if (be === 'rpc') return;
    addLog(orderId, action, detail);
  }
  function refreshArchBtn() {
    var b = document.getElementById('sm-o-arch-sel');
    if (!b) return;
    var n = selOrders().length;
    b.textContent = n ? '归档所选（' + n + '）' : '归档所选';
    b.disabled = !n;
    b.style.opacity = n ? '1' : '.55';
  }
  function archiveList(list) {
    var skipped = 0;
    list = (list || []).filter(function (o) {
      if (!o) return false;
      if (isArchived(o)) { skipped++; return false; }              // 已归档不重复归档
      if (window.YkOrderDel && window.YkOrderDel.isDel(o.id)) { skipped++; return false; } // 已删除的不能归档
      return true;
    });
    if (!list.length) { toast('这些订单已经归档过、或者已经删除了'); return; }
    var nos = list.slice(0, 5).map(function (o) { return o.order_no || o.id; }).join('、') + (list.length > 5 ? ' 等 ' + list.length + ' 笔' : '');
    var buyers = list.slice(0, 3).map(function (o) { return (o.address && o.address.name) || o.ship_name || ''; }).filter(Boolean).join('、');
    var total = list.reduce(function (t, o) { return t + num(o.total); }, 0);
    var got = list.reduce(function (t, o) { return t + payStat(o).net; }, 0);
    if (!window.confirm('把 ' + list.length + ' 笔订单归档？\n\n单号：' + nos +
      (buyers ? '\n买家：' + buyers : '') +
      '\n订单金额合计：$' + fmtMoney(total) +
      '\n\n归档后：只从你自己的订单列表里收进「已归档」，别人（管理员／其他操作人／买家）看到的照旧。' +
      '\n订单状态不变，不会触发邮件、不会退款，收款与退款流水全部保留，随时可以恢复。')) return;
    if (!window.confirm('再确认一次：确定归档 ' + list.length + ' 笔订单？' +
      (got > 0.005 ? '\n\n其中已收款合计 $' + fmtMoney(got) + '：归档不会自动退款，收款与退款流水都会保留。' : ''))) return;
    if (!window.YkOrderDel) { toast('标记模块没加载出来，刷新页面再试'); return; }
    var i = 0, fail = 0, firstErr = '';
    (function next() {
      if (i >= list.length) {
        var okN = list.length - fail;
        if (fail) toast('归档完成 ' + okN + ' 笔，失败 ' + fail + ' 笔：' + (firstErr || '原因未知'));
        else toast('已归档 ' + okN + ' 笔（可在「已归档」里恢复）' + (skipped ? '；另有 ' + skipped + ' 笔跳过' : ''));
        renderOrders(); renderStats();
        return;
      }
      var o = list[i++];
      var prev = o.status;
      window.YkOrderDel.mark(markEntry(o), 'archived').then(function (res) {
        if (res && res.ok) {
          delete SM.osel[o.id];
          auditLocal(o.id, 'archive', 'order_no:' + (o.order_no || '') + '; from:' + (prev || ''));
        } else {
          fail++; if (!firstErr) firstErr = (res && res.reason) || '未知原因';
        }
        next();
      });
    })();
  }
  function restoreOne(o) {
    if (!o) return;
    var no = o.order_no || String(o.id).slice(0, 8);
    if (!window.YkOrderDel) { toast('标记模块没加载出来，刷新页面再试'); return; }
    if (!window.confirm('恢复订单 ' + no + '？\n\n恢复后会重新出现在你自己的正常订单列表里；' +
      '订单状态、收款与退款流水都不变。')) return;
    window.YkOrderDel.unmark(o.id, 'archived').then(function (res) {
      if (!res || !res.ok) { toast('恢复失败：' + ((res && res.reason) || '未知原因')); return; }
      auditLocal(o.id, 'unarchive', 'order_no:' + no + '; from:archived');
      toast('订单已恢复到正常列表');
      renderOrders(); renderStats();
    });
  }

  /* ══════════════════════════════════════════════════════════════════
     订单删除（2026-10-30 23:09 任务书）
     跟「取消」「归档」的区别说清楚：
       取消 → 订单还在，状态变 cancelled（钱的事继续走）
       归档 → 软删除可恢复，在「已归档」里找得回来
       删除 → 从订单管理里彻底移出，刷新/搜索/筛选/导出都不会再出现；
              订单行本身、付款流水、退款流水、物流、日志都保留（不毁历史）
     写法：status='deleted' + shop_order_logs 记一笔（单号/买家/金额/操作人/时间）
     为什么不直接 DELETE 行：付款/退款流水、订单日志都指向这个 order_id，
     硬删会把历史弄成断头，也不会真的让 RLS 更安全 —— 她要求「不影响付款和退款历史」。
     ══════════════════════════════════════════════════════════════════ */
  function deleteOrder(o) {
    if (!o) return;
    if (o.status === 'deleted' || (window.YkOrderDel && window.YkOrderDel.isDel(o.id))) { toast('这笔订单已经删除过了'); return; }
    var no = o.order_no || String(o.id).slice(0, 8);
    var buyer = (o.address && o.address.name) || o.ship_name || o.email || '（没填买家名）';
    var sym = o.currency === 'CNY' ? '\u00a5' : '$';
    var amt = sym + fmtMoney(o.total);
    var s = payStat(o);
    var stName = (ST[o.status] || [o.status || '未知'])[0];
    if (!window.confirm('删除订单 ' + no + '？\n\n' +
      '买家：' + buyer + '\n' +
      '订单金额：' + amt + '\n' +
      '当前状态：' + stName +
      (s.net > 0.005 ? '\n已收款：' + sym + fmtMoney(s.net) + '（删除不会自动退款）' : '') +
      '\n\n删除后：\n' +
      '· 这笔单从「订单管理」里彻底移出（刷新、搜索、筛选、导出都不会再出现）\n' +
      '· 付款记录、退款记录、物流记录、操作日志全部保留\n' +
      '· 不会删客户档案、商品资料，也不会影响其他订单\n' +
      '· 删除后不能像「归档」那样一键恢复')) return;
    if (!window.confirm('最后确认：确定删除订单 ' + no + '？\n\n这是一次不可逆操作，只会留下审计记录（单号／买家／金额／操作人／时间）。')) return;

    var detail = 'order_no:' + no + '; buyer:' + buyer + '; total:' + fmtMoney(o.total) + '; from:' + (o.status || '') +
      '; paid:' + fmtMoney(s.net) + '; at:' + new Date().toISOString();
    if (!window.YkOrderDel) { toast('标记模块没加载出来，刷新页面再试'); return Promise.resolve(false); }
    return window.YkOrderDel.mark(markEntry(o), 'deleted').then(function (res) {
      if (!res || !res.ok) {
        // 真实原因照原样给她，不再用「可能是没权限或网络断了」糊过去
        toast('删除失败（订单还在）：' + ((res && res.reason) || '服务端没有返回原因'));
        return false;
      }
      delete SM.osel[o.id];
      SM.oopen[o.id] = false;
      // 本地列表一并排掉，不等下次刷新
      SM.orders = SM.orders.filter(function (x) { return x.id !== o.id; });
      // 审计：后端是表 + RPC 时由服务端写（带 auth.uid），后备模式才在前端补
      auditLocal(o.id, 'delete', detail);
      toast('已删除订单 ' + no);
      renderOrders(); renderStats();
      return true;
    });
  }

  /* ═══ 拼团管理 ═══ */
  function renderGroups() {
    var box = document.getElementById('sm-g-list');
    if (!box) return;
    if (!SM.groups.length) { box.innerHTML = '<p class="sm-empty">还没有拼团</p>'; return; }
    box.innerHTML = SM.groups.map(function (g) {
      var st = G_ST[g.status] || [g.status, '#c4bcb6'];
      var p = byId(SM.products, g.product_id);
      var variant = g.variant_sku ? ' · ' + g.variant_sku : '';
      var members = SM.gopen[g.id] ? '<div class="sm-g-members">' +
        (arr(SM.members[g.id]).length
          ? arr(SM.members[g.id]).map(function (m) {
              return '<div class="sm-mb-row">' + esc(m.nickname || '（未填昵称）') +
                ' · ' + esc(orderNoOf(m.order_id)) + '</div>';
            }).join('')
          : '<p class="sm-empty" style="padding:8px 0;">还没有人参加</p>') + '</div>'
        : '';
      return '<div class="card sm-group" data-gid="' + escAttr(g.id) + '">' +
        '<div class="sm-g-top">' +
        '<b>' + esc(g.name || '（未命名拼团）') + '</b>' + badge(g.status, G_ST) +
        '<span style="flex:1;"></span>' +
        '<button type="button" class="btn-mini sm-g-mb">成员</button>' +
        (g.status === 'open' ? '<button type="button" class="btn-del sm-g-cancel">取消拼团</button>' : '') +
        '</div>' +
        '<div class="sm-g-meta">' + esc((g.product_name || (p ? p.name : '') || '') + variant) +
        ' · 拼团价 <span style="color:var(--price,#ff6fa5);">$' + fmtMoney(g.price) + '</span>' + ' · ' + (g.joined || 0) + '/' + (g.target || 0) + ' 人 · 截止 ' + fmtTime(g.deadline) + '</div>' +
        members + '</div>';
    }).join('');
  }
  function orderNoOf(orderId) {
    var o = byId(SM.orders, orderId);
    return o && o.order_no ? o.order_no : (orderId ? '订单 ' + String(orderId).slice(0, 8) : '无订单');
  }
  function loadMembers(gid) {
    return api('shop_group_members?select=nickname,order_id&group_id=eq.' + gid)
      .then(function (r) { if (!r.ok) throw new Error('http'); return r.json(); })
      .then(function (rows) { SM.members[gid] = arr(rows); })
      .catch(function () {
        SM.members[gid] = arr(window.SHOP_GROUP_MEMBERS).filter(function (m) { return String(m.group_id) === String(gid); });
      })
      .then(function () { renderGroups(); });
  }

  /* ═══ 优惠券管理 ═══ */
  function couponDesc(c) {
    return c.type === 'percent' ? '减 ' + fmtMoney(c.value) + '%' : '立减 $' + fmtMoney(c.value);
  }
  function renderCoupons() {
    var box = document.getElementById('sm-c-list');
    if (!box) return;
    if (!SM.coupons.length) { box.innerHTML = '<p class="sm-empty">还没有优惠券</p>'; return; }
    box.innerHTML = SM.coupons.map(function (c) {
      return '<div class="sm-c-row" data-cid="' + escAttr(c.id) + '">' +
        '<span class="sm-c-code">' + esc(c.code || '') + '</span>' + badge(c.active ? 'open' : 'cancelled', { open: ['生效中', 'var(--success,#5FA777)'], cancelled: ['已停用', '#c4bcb6'] }) +
        '<span>' + couponDesc(c) + '</span>' +
        '<span class="sm-io-sub">满 $' + fmtMoney(c.min_spend) + ' 可用 · 已用 ' + (c.used || 0) + (num(c.max_uses) > 0 ? '/' + c.max_uses : '') + ' 次 · 每人限 ' + (c.per_user || 0) + ' 次</span>' +
        '<span class="sm-io-sub">' + (c.starts_at ? fmtTime(c.starts_at) + ' 起' : '') + (c.ends_at ? ' ~ ' + fmtTime(c.ends_at) : '') + (c.tag ? ' · 仅「' + esc(c.tag) + '」' : ' · 全场') + (c.allow_group ? ' · 可与拼团同用' : '') + '</span>' +
        '<span style="flex:1;"></span>' +
        '<button type="button" class="btn-mini sm-c-edit">编辑</button>' +
        '<button type="button" class="btn-mini sm-c-toggle">' + (c.active ? '停用' : '启用') + '</button>' +
        '</div>';
    }).join('');
  }
  function couponFormState() {
    return {
      code: document.getElementById('sm-c-code').value.trim(),
      value: document.getElementById('sm-c-value').value.trim(),
      min_spend: document.getElementById('sm-c-min').value.trim(),
      max_uses: document.getElementById('sm-c-max').value.trim(),
      per_user: document.getElementById('sm-c-pu').value.trim(),
      starts_at: document.getElementById('sm-c-start').value.trim(),
      ends_at: document.getElementById('sm-c-end').value.trim(),
      tag: document.getElementById('sm-c-tag').value.trim()
    };
  }
  function fillCouponForm(c) {
    document.getElementById('sm-c-title').textContent = c ? '编辑优惠券 · ' + c.code : '新建优惠券';
    document.getElementById('sm-c-code').value = c ? (c.code || '') : '';
    document.getElementById('sm-c-value').value = c && c.value != null ? c.value : '';
    document.getElementById('sm-c-min').value = c && c.min_spend != null ? c.min_spend : '';
    document.getElementById('sm-c-max').value = c && c.max_uses != null ? c.max_uses : '';
    document.getElementById('sm-c-pu').value = c && c.per_user != null ? c.per_user : 1;
    document.getElementById('sm-c-start').value = c && c.starts_at ? String(c.starts_at).slice(0, 10).replace(/-/g, '/') : '';
    document.getElementById('sm-c-end').value = c && c.ends_at ? String(c.ends_at).slice(0, 10).replace(/-/g, '/') : '';
    document.getElementById('sm-c-tag').value = c ? (c.tag || '') : '';
    SM.cType = c ? (c.type || 'percent') : 'percent';
    document.getElementById('sm-c-type').setAttribute('data-v', SM.cType);
    document.querySelector('#sm-c-type .pick-btn-label').textContent = SM.cType === 'percent' ? '百分比（减%）' : '固定金额（立减$）';
    SM.cAg = c ? !!c.allow_group : false;
    document.getElementById('sm-c-ag').classList.toggle('on', SM.cAg);
    document.getElementById('sm-c-cancel').style.display = c ? '' : 'none';
  }

  /* ═══ 售后 ═══ */
  function renderAftersale() {
    var box = document.getElementById('sm-as-list');
    if (!box) return;
    if (!SM.msgs.length) { box.innerHTML = '<p class="sm-empty">没有售后申请</p>'; return; }
    box.innerHTML = SM.msgs.map(function (m) {
      var o = byId(SM.orders, m.order_id);
      var open = m.status === 'open' || !m.status;
      return '<div class="card sm-as" data-mid="' + escAttr(m.id) + '">' +
        '<div class="sm-g-top">' + badge(open ? 'open' : m.status, AS_ST) +
        '<b>' + esc(o && o.order_no ? o.order_no : orderNoOf(m.order_id)) + '</b>' +
        '<span class="sm-o-time">' + fmtTime(m.created_at) + '</span></div>' +
        '<div class="sm-line" style="margin:6px 0;">' + esc(m.text || '') + '</div>' +
        (open
          ? '<div class="sm-act"><textarea class="sm-as-reply" placeholder="回复买家（会作为商家留言发送）"></textarea>' +
            '<button type="button" class="btn-save sm-as-done">回复并结案</button>' +
            '<button type="button" class="btn-del sm-as-rej">拒绝</button></div>'
          : '') +
        '</div>';
    }).join('');
  }
  function resolveAftersale(mid, status, replyText) {
    var m = byId(SM.msgs, mid);
    if (!m) return;
    var postMsg = function () {
      return api('shop_order_msgs', { method: 'POST', body: JSON.stringify({ order_id: m.order_id, is_admin: true, type: 'msg', text: replyText }) })
        .then(function (r) { if (!r.ok) throw new Error('http'); return true; })
        .catch(function () { toast('回复发送失败：数据库没连上'); return false; });
    };
    (replyText ? postMsg() : Promise.resolve(true)).then(function (ok) {
      if (!ok) return;
      restWrite('shop_order_msgs?id=eq.' + mid, 'PATCH', { status: status }, status === 'done' ? '售后已结案' : '售后已拒绝')
        .then(function (ok2) { if (ok2) { m.status = status; renderAftersale(); } });
    });
  }

  /* ═══ 买家 ═══ */
  function renderBuyers() {
    var mails = document.getElementById('sm-b-mails');
    if (mails) {
      var seen = {}, list = [];
      SM.orders.forEach(function (o) {
        var e = String(o.email || '').trim().toLowerCase();
        if (!e) return;
        if (!seen[e]) { seen[e] = { email: e, count: 0, last: o.created_at }; list.push(seen[e]); }
        seen[e].count++;
        if (o.created_at > seen[e].last) seen[e].last = o.created_at;
      });
      mails.innerHTML = list.length
        ? list.map(function (x) {
            return '<div class="sm-b-mail"><span>' + esc(x.email) + '</span><span class="sm-io-sub">' + x.count + ' 单 · 最近 ' + fmtTime(x.last) + '</span></div>';
          }).join('')
        : '<p class="sm-empty">还没有订单邮箱</p>';
    }
    var pl = document.getElementById('sm-b-list');
    if (pl) {
      pl.innerHTML = SM.profiles.length
        ? SM.profiles.map(function (p) {
            return '<div class="sm-b-mail"><span>' + esc(p.name || '（未填姓名）') + '</span>' +
              '<span>' + esc(p.nickname || '（未填昵称）') + '</span>' +
              '<span class="sm-io-sub">' + esc(p.phone || '（未填电话）') + '</span></div>';
          }).join('')
        : '<p class="sm-empty">还没有买家资料</p>';
    }
  }

  /* ═══ 运费设置 ═══ */
  function renderSettings() {
    var f = document.getElementById('sm-s-fee'), e = document.getElementById('sm-s-flat');
    if (f && document.activeElement !== f) f.value = SM.ship.service_fee != null ? SM.ship.service_fee : 2;
    if (e && document.activeElement !== e) e.value = SM.ship.flat_est != null ? SM.ship.flat_est : 5;
  }

  /* ═══ 商品规格 + 重量（挂进现有商品编辑卡 .edit-grid）═══ */
  function augmentProductEdit(card) {
    var grid = card.querySelector('.edit-grid');
    if (!grid || grid.querySelector('.e-weight')) return;
    var pid = card.getAttribute('data-id');
    var local = byId(SM.products, pid);
    var build = function (p) {
      // 重查 DOM：卡片可能已被主流程重绘，别把块插到已脱禹的节点上
      var g2 = card.querySelector('.edit-grid');
      if (!g2 || g2.querySelector('.e-weight')) return;
      card.__p = p || null;
      card.__variants = JSON.parse(JSON.stringify(p && Array.isArray(p.variants) ? p.variants : []));
      var w = document.createElement('input');
      w.className = 'e-weight';
      w.type = 'number'; w.min = '0'; w.step = '0.1';
      w.value = p && p.weight_oz != null ? p.weight_oz : '';
      w.placeholder = '重量 weight_oz（盎司，含包装）';
      g2.appendChild(w);
      var block = document.createElement('div');
      block.className = 'sm-var-block';
      block.style.gridColumn = '1 / -1';
      block.innerHTML = '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;">' +
        '<b style="font-size:16px;color:var(--text);">商品规格</b>' +
        '<span class="hint" style="flex:1;min-width:180px;">一个规格＝买家看到的一个选项（比如一个颜色款）；全部留空＝单规格</span>' +
        '<button type="button" class="btn-mini sm-var-add" style="background:#FCE1EA;color:#A98D96;padding:9px 20px;font-size:15px;">＋ 添加规格</button></div>' +
        '<div class="sm-var-rows"></div>' +
        '<p class="hint" style="margin:6px 0 0;">每个规格可以传自己的图，第一张就是这个选项的封面；详情页点选项会换图、换价、换库存。</p>';
      g2.appendChild(block);
      smVarRenderRows(card);
    };
    // 只信带 variants 字段的数据；缓存里没有就单独拉这个商品，绝不把已有规格当空（她 2026-10-25 遇到）
    if (local && Array.isArray(local.variants)) { build(local); return; }
    restGet('products?select=id,name,price,stock,variants,weight_oz,image_url,tag&id=eq.' + pid)
      .then(function (rows) {
        var row = arr(rows)[0] || local;
        if (row) {
          var ex = byId(SM.products, pid);
          if (ex) Object.assign(ex, row); else SM.products.push(row);
        }
        build(row);
      })
      .catch(function () { build(local); });
  }
  function smVarImgHtml(v, i) {
    var imgs = arr(v.images);
    return imgs.map(function (u, k) {
      return '<span style="position:relative;display:inline-block;"><img src="' + escAttr(u) + '">' +
        '<button type="button" class="sm-var-imgdel" data-i="' + i + '" data-k="' + k + '" title="删除图片">✕</button>' +
        (imgs.length > 1 && k > 0 ? '<button type="button" class="sm-var-imgmv" data-i="' + i + '" data-k="' + k + '" data-d="-1" title="往前一位（第一位＝这个规格的封面）" style="position:absolute;left:1px;bottom:1px;width:15px;height:15px;line-height:1;font-size:10px;padding:0;border:none;border-radius:50%;background:rgba(255,255,255,.92);color:#A98D96;cursor:pointer;">‹</button>' : '') +
        (imgs.length > 1 && k < imgs.length - 1 ? '<button type="button" class="sm-var-imgmv" data-i="' + i + '" data-k="' + k + '" data-d="1" title="往后一位" style="position:absolute;right:1px;bottom:1px;width:15px;height:15px;line-height:1;font-size:10px;padding:0;border:none;border-radius:50%;background:rgba(255,255,255,.92);color:#A98D96;cursor:pointer;">›</button>' : '') +
        (k === 0 && imgs.length > 1 ? '<span style="position:absolute;left:1px;bottom:1px;background:#A98D96;color:#fff;border-radius:999px;padding:0 4px;font-size:9px;line-height:12px;">封面</span>' : '') +
        '</span>';
    }).join('');
  }
  function smVarRenderRows(card) {
    var box = card.querySelector('.sm-var-rows');
    if (!box) return;
    var head = card.querySelector('.sm-var-batchbar');
    if (!head) {
      head = document.createElement('div');
      head.className = 'sm-var-batchbar';
      head.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:2px 0 10px;';
      head.innerHTML = '<span class="hint" style="margin:0;">批量：</span>' +
        '<input class="sm-batch-price" type="number" min="0" step="0.01" placeholder="统一价格" style="width:120px;padding:7px 10px;border-radius:10px;border:1.5px solid #FFD1E0;background:#FFF7FA;color:#55464E;font-size:14px;font-family:inherit;">' +
        '<button type="button" class="btn-mini sm-apply-price" style="padding:7px 12px;font-size:14px;">套用价格</button>' +
        '<input class="sm-batch-stock" type="number" min="0" placeholder="统一库存" style="width:120px;padding:7px 10px;border-radius:10px;border:1.5px solid #FFD1E0;background:#FFF7FA;color:#55464E;font-size:14px;font-family:inherit;">' +
        '<button type="button" class="btn-mini sm-apply-stock" style="padding:7px 12px;font-size:14px;">套用库存</button>';
      box.parentNode.insertBefore(head, box);
    }
    box.innerHTML = arr(card.__variants).length ? arr(card.__variants).map(function (v, i) {
      return '<div class="sm-var-row' + (v.frozen ? ' is-frozen' : '') + '" data-i="' + i + '" style="' + (v.frozen ? 'opacity:.62;' : '') + '">' +
        '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:6px;">' +
          '<b style="font-size:14px;color:#55464E;">规格 ' + (i + 1) + '</b>' +
          (v.frozen ? '<span style="font-size:12px;color:#A98D96;background:#FCE1EA;border-radius:999px;padding:1px 8px;">已冻结</span>' : '') +
          '<span style="flex:1;"></span>' +
          '<button type="button" class="btn-mini sm-var-up" data-i="' + i + '" title="上移"' + (i === 0 ? ' disabled' : '') + ' style="padding:4px 10px;font-size:13px;">↑</button>' +
          '<button type="button" class="btn-mini sm-var-down" data-i="' + i + '" title="下移"' + (i === arr(card.__variants).length - 1 ? ' disabled' : '') + ' style="padding:4px 10px;font-size:13px;">↓</button>' +
          '<button type="button" class="btn-mini sm-var-freeze" data-i="' + i + '" style="padding:4px 10px;font-size:13px;">' + (v.frozen ? '解冻' : '冻结') + '</button>' +
        '</div>' +
        '<div class="sm-var-grid">' +
          '<div><label>规格名（买家看到的）</label><input class="sv-name" placeholder="如：粉色款" value="' + escAttr(v.name || '') + '"></div>' +
          '<div><label>SKU（区分用·唯一）</label><input class="sv-sku" placeholder="如：PINK-1" value="' + escAttr(v.sku || '') + '"></div>' +
          '<div><label>价格 $（留空用商品价）</label><input class="sv-price" type="number" step="0.01" min="0" placeholder="0.00" value="' + escAttr(v.price == null ? '' : v.price) + '"></div>' +
          '<div><label>库存（留空用商品库存）</label><input class="sv-stock" type="number" min="0" placeholder="如：5" value="' + escAttr(v.stock == null ? '' : v.stock) + '"></div>' +
        '</div>' +
        '<div class="sm-var-imgs">' + smVarImgHtml(v, i) +
          '<label class="btn-mini" style="cursor:pointer;">＋ 上传图片<input type="file" class="sm-var-file" data-i="' + i + '" accept="image/*" multiple hidden></label>' +
          '<button type="button" class="btn-del sm-var-del" data-i="' + i + '" style="padding:6px 14px;font-size:14px;margin-left:auto;">删除此规格</button>' +
        '</div>' +
        '</div>';
    }).join('') : '<p class="hint" style="background:var(--card,#FFF0F5);border-radius:12px;padding:14px;text-align:center;">还没有规格，点上面「＋ 添加规格」加第一个选项</p>';
  }
  function saveProductExtra(card) {
    var vlist = arr(card.__variants);
    Array.prototype.forEach.call(card.querySelectorAll('.sm-var-row'), function (row) {
      var v = vlist[parseInt(row.getAttribute('data-i'), 10)];
      if (!v) return;
      v.sku = row.querySelector('.sv-sku').value.trim();
      v.name = row.querySelector('.sv-name').value.trim();
      v.price = row.querySelector('.sv-price').value.trim();
      v.stock = row.querySelector('.sv-stock').value.trim();
    });
    var wEl = card.querySelector('.e-weight');
    var body = {};
    if (wEl) body.weight_oz = wEl.value.trim() === '' ? null : parseFloat(wEl.value);
    var clean = vlist.filter(function (v) { return v.sku || v.name; }).map(function (v) {
      return { sku: v.sku || '', name: v.name || '', price: fmtMoney(v.price), stock: parseInt(v.stock, 10) || 0, images: arr(v.images), frozen: v.frozen === true };
    });
    if (card.__p || clean.length) body.variants = clean;
    if (!Object.keys(body).length) return;
    api('products?id=eq.' + card.getAttribute('data-id'), { method: 'PATCH', body: JSON.stringify(body) })
      .then(function (r) {
        if (!r.ok) throw new Error('http');
        toast('重量/规格已保存');
        if (card.__p) { card.__p.weight_oz = body.weight_oz; card.__p.variants = clean; }
      })
      .catch(function () { toast('重量/规格保存失败'); });
  }

  /* ── 上架新商品表单：也带「商品规格」区（她 2026-10-25：添加商品时没有加规格的地方）── */
  var ADDVAR = { list: [] };
  window.smAddVarCollect = function () {
    var card = document.getElementById('tab-shop');
    Array.prototype.forEach.call(card.querySelectorAll('.sm-var-row'), function (row) {
      var v = ADDVAR.list[parseInt(row.getAttribute('data-i'), 10)];
      if (!v) return;
      v.sku = row.querySelector('.sv-sku').value.trim();
      v.name = row.querySelector('.sv-name').value.trim();
      v.price = row.querySelector('.sv-price').value.trim();
      v.stock = row.querySelector('.sv-stock').value.trim();
    });
    return ADDVAR.list.filter(function (v) { return v.sku || v.name; }).map(function (v) {
      return { sku: v.sku || '', name: v.name || '', price: fmtMoney(v.price), stock: parseInt(v.stock, 10) || 0, images: arr(v.images), frozen: v.frozen === true };
    });
  };
  window.smAddVarReset = function () { ADDVAR.list = []; smVarRenderRows(document.getElementById('tab-shop')); };
  (function () {
    var form = document.querySelector('#tab-shop .pf') || document.querySelector('#tab-shop .card');
    if (!form || document.querySelector('.sm-var-block')) return;
    var block = document.createElement('div');
    block.className = 'sm-var-block pf-sec';
    block.setAttribute('data-sec', 'variants');
    block.innerHTML = '<div class="pf-h"><b>商品规格</b><span class="pf-tip">可选；一个规格＝买家看到的一个选项，全部留空＝单规格</span></div>' +
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;">' +
      '<span class="hint" style="flex:1;min-width:180px;">不填价格/库存就用上面的商品价/库存</span>' +
      '<button type="button" class="btn-mini sm-var-add" style="background:#FCE1EA;color:#A98D96;padding:9px 20px;font-size:15px;">＋ 添加规格</button></div>' +
      '<div class="sm-var-rows"></div>' +
      '<p class="hint" style="margin:6px 0 0;">每个规格可以传自己的图（与商品主图分开），第一张就是这个选项的封面。</p>';
    form.appendChild(block); // 连续表单里直接接在「商品介绍」后面（保存按钮在 .pf 之外）
  })();
  (function () {
    var form = document.getElementById('tab-shop');
    form.__variants = ADDVAR.list; // 同一份数组的引用：smVarRenderRows 直接读 __variants
    form.addEventListener('click', function (e) {
      if (e.target.classList.contains('sm-var-add')) { ADDVAR.list.push({ sku: '', name: '', price: '', stock: '', images: [] }); smVarRenderRows(form); return; }
      if (e.target.classList.contains('sm-var-del')) { ADDVAR.list.splice(parseInt(e.target.getAttribute('data-i'), 10), 1); smVarRenderRows(form); return; }
      // 她 20261030 §3：上移 / 下移 / 冻结 / 批量设置
      if (e.target.classList.contains('sm-var-up') || e.target.classList.contains('sm-var-down')) {
        var ii = parseInt(e.target.getAttribute('data-i'), 10);
        var to = ii + (e.target.classList.contains('sm-var-up') ? -1 : 1);
        if (to >= 0 && to < ADDVAR.list.length) { var mv = ADDVAR.list.splice(ii, 1)[0]; ADDVAR.list.splice(to, 0, mv); smVarRenderRows(form); }
        return;
      }
      if (e.target.classList.contains('sm-var-freeze')) {
        var fi = parseInt(e.target.getAttribute('data-i'), 10);
        var fv = ADDVAR.list[fi];
        if (fv) { fv.frozen = !fv.frozen; smVarRenderRows(form); toast(fv.frozen ? '已冻结：前台不能再买这个规格' : '已解冻'); }
        return;
      }
      if (e.target.classList.contains('sm-apply-price') || e.target.classList.contains('sm-apply-stock')) {
        var isPrice = e.target.classList.contains('sm-apply-price');
        var inp = form.querySelector(isPrice ? '.sm-batch-price' : '.sm-batch-stock');
        var val = inp ? inp.value.trim() : '';
        if (val === '') { toast('先填一个值'); return; }
        ADDVAR.list.forEach(function (v) { if (isPrice) v.price = val; else v.stock = val; });
        smVarRenderRows(form);
        toast(isPrice ? '已把 ' + ADDVAR.list.length + ' 个规格的价格改成 ' + val : '已把 ' + ADDVAR.list.length + ' 个规格的库存改成 ' + val);
        return;
      }
      var imgdel = e.target.closest('.sm-var-imgdel');
      if (imgdel) { var v = ADDVAR.list[parseInt(imgdel.getAttribute('data-i'), 10)]; if (v && arr(v.images)) { v.images.splice(parseInt(imgdel.getAttribute('data-k'), 10), 1); smVarRenderRows(form); } }
      var imgmv = e.target.closest('.sm-var-imgmv');
      if (imgmv) {
        var vmv = ADDVAR.list[parseInt(imgmv.getAttribute('data-i'), 10)];
        var kk = parseInt(imgmv.getAttribute('data-k'), 10), dd = parseInt(imgmv.getAttribute('data-d'), 10);
        if (vmv && arr(vmv.images).length > 1 && kk + dd >= 0 && kk + dd < vmv.images.length) {
          var tmp = vmv.images[kk]; vmv.images[kk] = vmv.images[kk + dd]; vmv.images[kk + dd] = tmp;
          smVarRenderRows(form);
        }
      }
    });
    form.addEventListener('input', function (e) {
      var row = e.target.closest('.sm-var-row'); if (!row) return;
      var v = ADDVAR.list[parseInt(row.getAttribute('data-i'), 10)]; if (!v) return;
      if (e.target.classList.contains('sv-sku')) v.sku = e.target.value;
      if (e.target.classList.contains('sv-name')) v.name = e.target.value;
      if (e.target.classList.contains('sv-price')) v.price = e.target.value;
      if (e.target.classList.contains('sv-stock')) v.stock = e.target.value;
    });
    form.addEventListener('change', function (e) {
      if (!e.target.classList.contains('sm-var-file')) return;
      var i = parseInt(e.target.getAttribute('data-i'), 10);
      var v = ADDVAR.list[i];
      var files = Array.prototype.slice.call(e.target.files || []);
      if (!v || !files.length) return;
      uploadShopFiles(files).then(function (urls) { v.images = arr(v.images).concat(urls); smVarRenderRows(form); toast('规格图已上传，点「上架这个商品」一起保存'); }).catch(function () { toast('图片上传失败'); });
    });
  })();

  /* ═══ 构建 DOM ═══ */
  root.innerHTML =
    '<div class="sm-stats" id="sm-stats"></div>' +
    '<div class="sm-tabs" id="sm-tabs">' +
    '<button type="button" class="sm-tab active" data-st="orders">订单</button>' +
    '<button type="button" class="sm-tab" data-st="groups">拼团</button>' +
    '<button type="button" class="sm-tab" data-st="coupons">优惠券</button>' +
    '<button type="button" class="sm-tab" data-st="aftersale">售后</button>' +
    '<button type="button" class="sm-tab" data-st="buyers">买家</button>' +
    '<button type="button" class="sm-tab" data-st="settings">设置</button>' +
    '</div>' +
    '<div id="sm-sec-orders">' +
    '<div class="sm-toolbar"><div class="dy-chips" id="sm-o-chips"></div>' +
    '<input id="sm-o-search" placeholder="搜订单号 / 买家姓名 / 邮箱 / 商品名" autocomplete="off">' +
    '<button type="button" class="btn-mini" id="sm-o-new" style="white-space:nowrap;">＋ 手动建单</button>' +
    /* 她 20261030 §3：导出与装箱打印并入订单列表，不再单独入口 */
    '<button type="button" class="btn-mini" id="sm-o-export" style="white-space:nowrap;">导出（当前筛选）</button>' +
    '<button type="button" class="btn-mini" id="sm-o-export-sel" style="white-space:nowrap;">导出（已选）</button>' +
    /* 她 20261031 §二：批量归档入口，勾了单就能点，不用去展开订单找 */
    '<button type="button" class="btn-mini" id="sm-o-arch-sel" style="white-space:nowrap;">归档所选</button>' +
    '<button type="button" class="btn-mini" id="sm-o-print" style="white-space:nowrap;">打印装箱清单</button></div>' +
    '<div id="sm-o-list"><p class="sm-empty">加载中…</p></div>' +
    '</div>' +
    '<div id="sm-sec-groups" style="display:none;">' +
    '<div class="card"><h3>新建拼团</h3><div class="form-grid">' +
    '<input id="sm-g-name" placeholder="拼团名称 *">' +
    '<button type="button" class="sel-btn" id="sm-g-product" data-v=""><span class="pick-btn-label">选择商品 *</span></button>' +
    '<button type="button" class="sel-btn" id="sm-g-variant" data-v=""><span class="pick-btn-label">规格（可选）</span></button>' +
    '<input id="sm-g-price" type="number" step="0.01" min="0" placeholder="拼团价 *">' +
    '<input id="sm-g-target" type="number" min="2" value="2" placeholder="目标人数">' +
    '<input id="sm-g-deadline" placeholder="截止时间（点选日期）">' +
    '</div><div class="actions"><button type="button" class="btn-save" id="sm-g-save">发起拼团</button></div></div>' +
    '<div id="sm-g-list"><p class="sm-empty">加载中…</p></div>' +
    '</div>' +
    '<div id="sm-sec-coupons" style="display:none;">' +
    '<div class="card"><h3 id="sm-c-title">新建优惠券</h3><div class="form-grid">' +
    '<input id="sm-c-code" placeholder="优惠码 *（唯一，如 WELCOME10）">' +
    '<button type="button" class="sel-btn" id="sm-c-type" data-v="percent"><span class="pick-btn-label">百分比（减%）</span></button>' +
    '<input id="sm-c-value" type="number" step="0.01" min="0" placeholder="优惠值 *（percent: 10 = 减10%）">' +
    '<input id="sm-c-min" type="number" step="0.01" min="0" placeholder="满减门槛 $（0 = 无门槛）">' +
    '<input id="sm-c-max" type="number" min="0" placeholder="总次数上限（0 = 不限）">' +
    '<input id="sm-c-pu" type="number" min="0" placeholder="每人限用次数">' +
    '<input id="sm-c-start" placeholder="开始日期（点选，可留空）">' +
    '<input id="sm-c-end" placeholder="结束日期（点选，可留空）">' +
    '<input id="sm-c-tag" placeholder="仅适用标签商品（留空 = 全场）">' +
    '<div class="fld-inline"><label class="tgl-label"><button type="button" class="tgl" id="sm-c-ag"><span class="tgl-knob"></span></button>可与拼团价同用</label></div>' +
    '</div><div class="actions">' +
    '<button type="button" class="btn-mini" id="sm-c-cancel" style="display:none;">取消编辑</button>' +
    '<button type="button" class="btn-save" id="sm-c-save">保存优惠券</button></div></div>' +
    '<div id="sm-c-list"><p class="sm-empty">加载中…</p></div>' +
    '</div>' +
    '<div id="sm-sec-aftersale" style="display:none;"><div id="sm-as-list"><p class="sm-empty">加载中…</p></div></div>' +
    '<div id="sm-sec-buyers" style="display:none;">' +
    '<div class="card"><h3>最近下单邮箱</h3><div id="sm-b-mails"><p class="sm-empty">加载中…</p></div></div>' +
    '<div class="card"><h3>买家资料</h3><div id="sm-b-list"><p class="sm-empty">加载中…</p></div></div>' +
    '</div>' +
    '<div id="sm-sec-settings" style="display:none;">' +
    '<div class="card"><h3>运费设置</h3><div class="form-grid">' +
    '<div class="fld-inline"><span class="fld-label">服务费 $</span><input id="sm-s-fee" type="number" step="0.01" min="0"></div>' +
    '<div class="fld-inline"><span class="fld-label">运费估算 $</span><input id="sm-s-flat" type="number" step="0.01" min="0"></div>' +
    '</div><p class="hint" style="margin:8px 0 0;">下单应付 = 商品小计 − 优惠 + 运费估算 + 服务费；实际运费发货前在订单里逐单录入。保存后新订单立即生效。</p>' +
    '<div class="actions"><button type="button" class="btn-save" id="sm-s-save">保存设置</button></div></div>' +
    '</div>';

  /* ═══ 事件绑定 ═══ */

  // 一级 tab（商城管理）+ 二级 tab
  document.addEventListener('click', function (e) {
    var b = e.target.closest('.tab-btn');
    if (!b) return;
    var on = b.dataset.tab === 'shopmgr';
    root.style.display = on ? '' : 'none';
    if (on && !SM.loaded) loadAll().then(function () {
      // 兼容偶发加载时序：订单一个都没拿到就自动重试一次（她 2026-10-25 遇到卡「加载中」）
      if (!SM.orders.length && !SM._retried) {
        SM._retried = true; SM.loaded = false;
        setTimeout(function () { if (!SM.loaded) loadAll(); }, 2500);
      }
    });
  }, true); // capture：在现有 tab 切换逻辑之外独立控制本容器
  document.getElementById('sm-tabs').addEventListener('click', function (e) {
    var b = e.target.closest('.sm-tab');
    if (!b) return;
    SM.tab = b.getAttribute('data-st');
    Array.prototype.forEach.call(document.querySelectorAll('#sm-tabs .sm-tab'), function (x) {
      x.classList.toggle('active', x === b);
    });
    ['orders', 'groups', 'coupons', 'aftersale', 'buyers', 'settings'].forEach(function (name) {
      document.getElementById('sm-sec-' + name).style.display = SM.tab === name ? '' : 'none';
    });
  });

  // ── 订单 ──
  document.getElementById('sm-o-chips').addEventListener('click', function (e) {
    var b = e.target.closest('.dy-chip');
    if (!b) return;
    SM.ofilter = b.getAttribute('data-f') || '';
    SM.osel = {}; // 切筛选清空勾选，避免隐藏的订单被误导出（她 2026-10-25）
    renderOrders();
  });
  document.getElementById('sm-o-search').addEventListener('input', function () {
    SM.osearch = this.value.trim().toLowerCase();
    renderOrders();
  });
  var oList = document.getElementById('sm-o-list');
  /* 收件人表单：一改字就给未保存提示（她 20261030 §8 未保存提醒） */
  oList.addEventListener('input', function (e) {
    if (!e.target.classList || (!e.target.classList.contains('sm-a-in') && !e.target.classList.contains('sm-a-paste'))) return;
    var card0 = e.target.closest('.sm-order'); if (!card0) return;
    var d0 = card0.querySelector('.sm-a-dirty'); if (d0) d0.textContent = '有未保存的改动';
  });
  /* 收件人有未保存改动时收起模块：先问一句，避免误丢 */
  oList.addEventListener('toggle', function (e) {
    var d = e.target;
    if (!d || d.tagName !== 'DETAILS' || d.getAttribute('data-sec') !== 'addr' || d.open) return;
    var ab = d.querySelector('.sm-addr-edit-box');
    var dt = d.querySelector('.sm-a-dirty');
    if (ab && ab.style.display === 'block' && dt && dt.textContent) {
      if (!window.confirm('收件人有未保存的改动，确定收起吗？')) d.open = true;
    }
  }, true);
  oList.addEventListener('click', function (e) {
    var card = e.target.closest('.sm-order');
    if (!card) return;
    var id = card.getAttribute('data-id');
    var o = byId(SM.orders, id);
    if (!o) return;

    // 后台保存类按钮：防重复提交（成功后 renderOrders 重绘节点自动恢复，4s 兕底）
    var tBtn = e.target.closest('button');
    if (tBtn && (tBtn.classList.contains('btn-save') || tBtn.classList.contains('btn-mini') || tBtn.classList.contains('btn-del')) && !tBtn.dataset.busy) {
      tBtn.dataset.busy = '1'; tBtn.disabled = true;
      setTimeout(function () { if (tBtn.isConnected) { tBtn.dataset.busy = ''; tBtn.disabled = false; } }, 4000);
    }

    // 展开 / 收起（点头部；点操作区不收起）
    if (e.target.closest('.sm-o-arch')) { e.stopPropagation(); e.preventDefault(); archiveList([o]); return; }
    if (e.target.closest('.sm-o-del')) { e.stopPropagation(); e.preventDefault(); deleteOrder(o); return; }
    if (e.target.closest('.sm-o-restore')) { e.stopPropagation(); e.preventDefault(); restoreOne(o); return; }
    if (e.target.closest('.sm-o-head')) {
      SM.oopen[id] = !SM.oopen[id];
      renderOrders();
      return;
    }

    /* ═══ 收件人模块（她 20261030 §6）：独立查看 / 编辑 / 粘贴识别 / 常用地址 / 独立保存 ═══ */
    var abox = card.querySelector('.sm-addr-edit-box');
    if (e.target.classList.contains('sm-addr-edit')) {
      card.querySelector('.sm-addr-view').style.display = 'none';
      if (abox) abox.style.display = 'block';
      return;
    }
    if (e.target.classList.contains('sm-addr-cancel')) {
      // 取消：丢弃本次所有未保存改动（直接重绘回库里的值，什么也不写）
      renderOrders();
      toast('已取消，未保存任何改动');
      return;
    }
    if (e.target.classList.contains('sm-addr-parse')) {
      var raw = (card.querySelector('.sm-a-paste') || {}).value || '';
      if (!raw.trim()) { toast('先把要识别的地址粘进去'); return; }
      var pr = parseAddressText(raw);
      SM.__addrPrev = pr;
      var pbox = card.querySelector('.sm-a-prevbox');
      var cf = pr.confirm || {};
      var line = function (k, label) {
        var val = pr[k] || '';
        var sure = cf[k] !== false && !!val;
        return '<div style="display:flex;gap:8px;font-size:14px;padding:3px 0;"><span style="width:88px;color:#81717A;flex-shrink:0;">' + label + '</span>' +
          '<span style="' + (val && !sure ? 'color:#C4636E;font-weight:600;' : '') + '">' + (val ? esc(val) : '—') + (val && !sure ? ' ⚠ 需确认' : '') + '</span></div>';
      };
      if (pbox) {
        pbox.innerHTML = '<div style="background:#FFF7FA;border:1.5px solid #FFD1E0;border-radius:12px;padding:12px 14px;margin:8px 0;">' +
          '<div style="font-size:13px;color:#81717A;margin-bottom:6px;">识别结果（还没写入表单，点「确认填入」才会填）</div>' +
          line('name', '姓名') + line('phone', '电话') + line('email', '邮箱') + line('country', '国家') +
          line('state', '州/省') + line('city', '城市') + line('street', '街道') + line('zip', '邮编') +
          '</div>';
        pbox.style.display = 'block';
      }
      var ap = card.querySelector('.sm-addr-apply'); if (ap) ap.style.display = 'inline-flex';
      return;
    }
    if (e.target.classList.contains('sm-addr-apply')) {
      var pv2 = SM.__addrPrev;
      if (!pv2) { toast('先点「识别地址」'); return; }
      var setf = function (cls, val) { var el2 = card.querySelector(cls); if (el2 && val) el2.value = val; };
      setf('.sm-a-name', pv2.name); setf('.sm-a-phone', pv2.phone); setf('.sm-a-email', pv2.email);
      setf('.sm-a-country', pv2.country); setf('.sm-a-state', pv2.state);
      setf('.sm-a-city', pv2.city); setf('.sm-a-line1', pv2.street); setf('.sm-a-zip', pv2.zip);
      var dd = card.querySelector('.sm-a-dirty'); if (dd) dd.textContent = '已填入，确认后点「保存收件人」';
      return;
    }
    if (e.target.classList.contains('sm-addr-book')) {
      var book = card.querySelector('.sm-addr-booklist');
      if (book.style.display === 'block') { book.style.display = 'none'; return; }
      var seen = {}, list = [];
      (SM.orders || []).forEach(function (oo) {
        var aa = oo.address || {};
        if (!aa.name && !aa.line1 && !aa.street) return;
        var key = [aa.name, aa.phone, aa.line1 || aa.street, aa.city, aa.zip].join('|');
        if (seen[key]) return; seen[key] = 1;
        list.push({ a: aa, email: oo.email || '', no: oo.order_no || '' });
      });
      book.innerHTML = list.length
        ? '<div style="font-size:13px;color:#81717A;margin:8px 0 6px;">历史订单用过的收件地址（未改过的抢眼快照，点一下填入表单）</div>' +
          list.slice(0, 20).map(function (x, i) {
            return '<div class="sm-book-pick" data-i="' + i + '" style="cursor:pointer;border:1.5px solid #FFD1E0;border-radius:10px;padding:9px 12px;margin-bottom:6px;font-size:14px;background:#fff;">' +
              '<b>' + esc(x.a.name || '（无姓名）') + '</b> <span style="color:#81717A;">' + esc(x.no) + '</span><br>' +
              '<span style="color:#62545B;">' + addrHtml(x.a) + '</span></div>';
          }).join('')
        : '<div style="font-size:14px;color:#81717A;padding:8px 0;">还没有可复用的历史地址</div>';
      book._items = list;
      book.style.display = 'block';
      return;
    }
    if (e.target.closest('.sm-book-pick')) {
      var pk = e.target.closest('.sm-book-pick');
      var bk = card.querySelector('.sm-addr-booklist');
      var it = (bk && bk._items) ? bk._items[parseInt(pk.getAttribute('data-i'), 10)] : null;
      if (it) {
        var setb = function (cls, val) { var el3 = card.querySelector(cls); if (el3 && val) el3.value = val; };
        setb('.sm-a-name', it.a.name); setb('.sm-a-phone', it.a.phone); setb('.sm-a-email', it.email);
        setb('.sm-a-country', it.a.country); setb('.sm-a-state', it.a.state); setb('.sm-a-city', it.a.city);
        setb('.sm-a-line1', it.a.line1 || it.a.street); setb('.sm-a-line2', it.a.line2); setb('.sm-a-zip', it.a.zip);
        if (bk) bk.style.display = 'none';
        var dd2 = card.querySelector('.sm-a-dirty'); if (dd2) dd2.textContent = '已填入，确认后点「保存收件人」';
      }
      return;
    }
    if (e.target.classList.contains('sm-addr-save')) {
      var gv = function (cls) { var el4 = card.querySelector(cls); return el4 ? el4.value.trim() : ''; };
      var naddr = {
        name: gv('.sm-a-name'), phone: gv('.sm-a-phone'),
        line1: gv('.sm-a-line1'), line2: gv('.sm-a-line2'),
        city: gv('.sm-a-city'), state: gv('.sm-a-state'), zip: gv('.sm-a-zip'), country: gv('.sm-a-country')
      };
      if (!naddr.name || !naddr.phone) { toast('收件人姓名和电话不能留空'); return; }
      if (!naddr.line1) { toast('街道地址不能留空'); return; }
      uiConfirm('确认把收件人信息保存到订单 ' + (o.order_no || '') + ' 吗？只影响这一单。', function () {
        patchOrder(id, { address: naddr, email: gv('.sm-a-email') }, '收件人已保存（只对这单生效）', 'address', '收件人信息更新');
      }, '保存收件人');
      return;
    }
    if (e.target.classList.contains('sm-carrier')) { // 快递公司：站内自定义下拉
      pickPop(e.target, [{ v: 'UPS', label: 'UPS' }, { v: 'USPS', label: 'USPS' }, { v: 'FedEx', label: 'FedEx' }, { v: 'Other', label: 'Other' }],
        e.target.getAttribute('data-v') || 'UPS', function (v) {
          e.target.setAttribute('data-v', v);
          e.target.querySelector('.pick-btn-label').textContent = v;
        });
      return;
    }
    if (e.target.classList.contains('sm-act-pay')) { // 确认付款
      uiConfirm('确认订单 ' + (o.order_no || '') + ' 的付款凭证没问题吗？确认后进入待发货。', function () {
        patchOrder(id, { status: 'paid', reject_reason: '' }, '已确认付款，记得尽快发货', 'status', '审核凭证通过 → paid');
      }, '确认付款');
      return;
    }
    if (e.target.classList.contains('sm-act-reject')) { // 拒绝凭证（原因必填）
      var reason = card.querySelector('.sm-reject-reason').value.trim();
      if (!reason) { toast('拒绝凭证要写原因哦（必填）'); return; }
      patchOrder(id, { status: 'rejected', reject_reason: reason }, '已拒绝，买家可重传凭证', 'status', '凭证有误 → rejected：' + reason);
      return;
    }
    if (e.target.classList.contains('sm-recpay-toggle')) { // 记录收款表单展开/收起
      var rf = card.querySelector('.sm-recpay');
      if (rf) rf.style.display = rf.style.display === 'none' ? 'inline-flex' : 'none';
      return;
    }
    if (e.target.classList.contains('sm-pflag')) { // 定金/尾款勾选态（她 15:01：勾选=已付，点击切换）
      var pkind = e.target.getAttribute('data-kind');
      var rows = payNet(o).rows.filter(function (x) { return x.kind === pkind; }); // 该类已记台账
      var wasOn = e.target.classList.contains('on');
      if (!wasOn) { // 未勾 → 展开记录表单并预选类型（尾款预填待收金额）
        var tg = card.querySelector('.sm-recpay-toggle');
        if (tg && card.querySelector('.sm-recpay').style.display === 'none') tg.click();
        var kb = card.querySelector('.sm-pkind');
        if (kb) { kb.setAttribute('data-v', pkind); kb.querySelector('.pick-btn-label').textContent = KIND_LABEL[pkind] || pkind; }
        var amt = card.querySelector('.sm-recpay-amt');
        if (amt) {
          var pi0 = payInfo(o), mn1 = payNet(o);
          var out0 = num(o.total) - (pi0.paid + mn1.paid) + (pi0.refunded + mn1.refunded);
          if (pkind === 'final' && out0 > 0.005) amt.value = (Math.round(out0 * 100) / 100).toString();
          else if (pkind === 'final') amt.value = '';
        }
        var am2 = amt || card.querySelector('.sm-recpay-amt'); if (am2) am2.focus();
      } else { // 已勾 → 撤销：删掉该类台账（逐条 RPC，需确认）
        var tot = rows.reduce(function (t, x) { return t + num(x.amount); }, 0);
        uiConfirm('撤销「' + (KIND_LABEL[pkind] || pkind) + '」标记？会从收款台账删掉 ' + rows.length + ' 笔记录（合计 $' + fmtMoney(tot) + '），订单待收金额会随之增加。', function () {
          var dels = rows.map(function (x) { return api('rpc/shop_pay_record_delete', { method: 'POST', body: JSON.stringify({ p_id: x.id }) }); });
          Promise.all(dels).then(function () {
            toast('已撤销' + (KIND_LABEL[pkind] || pkind) + '标记，台账已删除');
            return loadPayRecords();
          }).then(function () { renderOrders(); renderStats(); }).catch(function () { toast('撤销失败，重试一下'); });
        }, '撤销');
      }
      return;
    }
    if (e.target.classList.contains('sm-pkind')) { // 收款类型：订金/尾款/分期/其他（站内弹层）
      pickPop(e.target, Object.keys(KIND_LABEL).map(function (k) { return { v: k, label: KIND_LABEL[k] }; }),
        e.target.getAttribute('data-v') || 'deposit', function (v) {
          e.target.setAttribute('data-v', v);
          e.target.querySelector('.pick-btn-label').textContent = KIND_LABEL[v] || v;
        });
      return;
    }
    if (e.target.classList.contains('sm-pmethod')) { // 收款渠道：含微信/支付宝（whitelist 未扩展前自动降级 other）
      pickPop(e.target, [['cash', '现金'], ['zelle', 'Zelle'], ['venmo', 'Venmo'], ['paypal', 'PayPal'], ['wechat', '微信支付'], ['alipay', '支付宝'], ['other', '其他']].map(function (m) { return { v: m[0], label: m[1] }; }),
        e.target.getAttribute('data-v') || 'cash', function (v) {
          var L = { cash: '现金', bank: '银行转账', other: '其他' };
          e.target.setAttribute('data-v', v);
          e.target.querySelector('.pick-btn-label').textContent = L[v] || v;
        });
      return;
    }
    if (e.target.classList.contains('sm-recpay-save')) { // 保存一笔人工收款：shop_pay_record_add（幂等，返回累计/待收）
      var amt = parseFloat(card.querySelector('.sm-recpay-amt').value);
      var kind = (card.querySelector('.sm-pkind').getAttribute('data-v')) || 'deposit';
      var method = (card.querySelector('.sm-pmethod').getAttribute('data-v')) || 'cash';
      if (!isFinite(amt) || amt <= 0) { toast('收款金额要大于 0'); return; }
      var svBtn = e.target; svBtn.disabled = true;
      function callPay(k, m) {
        return api('rpc/shop_pay_record_add', { method: 'POST', body: JSON.stringify({
          p_order_id: id, p_kind: k, p_amount: amt, p_method: m,
          p_txn_ref: card.querySelector('.sm-recpay-ref').value.trim(), p_note: ''
        }) }).then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('rpc')); });
      }
      callPay(kind, method)
        .catch(function () { return callPay(kind === 'full' ? 'other' : kind, (method === 'wechat' || method === 'alipay') ? 'other' : method); }) // 兼容未跑扩展脚本时的旧白名单
        .then(function (res) {
          toast('已记录' + (KIND_LABEL[kind] || '收款') + ' $' + fmtMoney(amt) + (res && res.outstanding > 0.005 ? '，待收 $' + fmtMoney(res.outstanding) : '，已结清'));
          return loadPayRecords();
        })
        .then(function () { renderOrders(); renderStats(); })
        .catch(function (err) {
          toast(err && err.message === 'rpc' ? '记录失败：数据库没连上（本次不会落库）' : '记录失败，重试一下');
          svBtn.disabled = false;
        });
      return;
    }
    if (e.target.classList.contains('sm-act-fee')) { // 录入实际运费（total 一起重算）
      var inp = card.querySelector('.sm-ship-actual');
      var v = parseFloat(inp.value);
      if (!isFinite(v) || v < 0) { toast('运费要填一个不小于 0 的数字'); return; }
      var total = num(o.subtotal) - num(o.discount) + v + num(o.service_fee);
      patchOrder(id, { shipping_actual: fmtMoney(v), total: fmtMoney(total) },
        '运费已录入，应付改为 $' + fmtMoney(total), 'fee', '实际运费 $' + fmtMoney(v));
      return;
    }
    if (e.target.classList.contains('sm-act-ship')) { // 确认发货
      var carrier = card.querySelector('.sm-carrier').getAttribute('data-v') || 'UPS';
      var shipDate = card.querySelector('.sm-ship-date').value.trim();
      var body = {
        carrier: carrier,
        tracking: card.querySelector('.sm-tracking').value.trim(),
        // TEST- 前缀 = 测试单号：track_url 留空时自动指向站内测试物流查询页（虚拟物流）
        track_url: card.querySelector('.sm-track-url').value.trim() || (card.querySelector('.sm-tracking').value.trim().indexOf('TEST-') === 0 ? 'https://yukicheng.com/tracking/?no=' + card.querySelector('.sm-tracking').value.trim() : ''),
        ship_note: card.querySelector('.sm-ship-note').value.trim(),
        shipped_at: shipDate ? dpToInternal(shipDate) + 'T12:00:00Z' : new Date().toISOString(),
        status: 'shipped'
      };
      uiConfirm('确认 ' + (o.order_no || '') + ' 已交给 ' + carrier + ' 发出？', function () {
        patchOrder(id, body, '已发货，买家会看到物流信息', 'status', '确认发货 → shipped（' + carrier + ' ' + body.tracking + '）');
      }, '确认发货');
      return;
    }
    if (e.target.closest('.sm-track-steps .chip')) { // 虚拟物流：点击状态推进/回退（仅 TEST- 单号，rpc 里也有校验）
      var chip = e.target.closest('.chip');
      var stNo = chip.parentElement.getAttribute('data-no');
      var stStep = parseInt(chip.getAttribute('data-step'), 10);
      api('rpc/mock_tracking_set', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ p_tracking_no: stNo, p_step: stStep }) })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (j && j.message) { toast(j.message); return; }
          toast(t('虚拟物流已切到「' + chip.textContent.trim() + '」', 'Mock tracking set to "' + chip.textContent.trim() + '"'));
          loadTrackSteps(stNo);
        })
        .catch(function () { toast(t('切换失败，再试一次', 'Failed — try again')); });
      return;
    }
    if (e.target.classList.contains('sm-ship-preview')) { // 预览发货邮件（status=preview，email_pick_batch 不会取它，绝不发信）
      var pvNo = e.target.closest('.sm-act-v').querySelector('.sm-track-steps').getAttribute('data-no');
      var pvO = byId(SM.orders, id);
      var pvLang = 'zh';
      api('email_log', {
        method: 'POST', headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify({
          status: 'preview', // email_pick_batch 只取 pending/failed——预览永远不发信
          kind: 'order_shipped_preview', ref_id: (pvO ? pvO.order_no : 'TEST') + '#preview-' + Date.now(),
          to_email: (pvO ? pvO.email : ''), subject: '【预览 · 不发送】你的包裹出发啦！' + (pvO ? pvO.order_no : '') + ' ♡',
          body: '【这是一封预览邮件，不会发出】\n\n快递公司：' + (pvO ? (pvO.carrier || 'Snow Yuzu Test Carrier') : '') + '\n运单号：' + pvNo + '\n物流链接：https://yukicheng.com/tracking/?no=' + pvNo + '\n\n最新物流状态以物流查询页为准；真实发货邮件由确认发货自动触发。\n— Snow Yuzu ♡'
        })
      }).then(function (r) { if (!r.ok) throw new Error(); toast(t('预览已保存到邮件记录（状态 preview，不会发送），去「邮件与联系人同步」里查看正文', 'Preview saved to mail log (status=preview, never sent)')); })
        .catch(function () { toast(t('预览失败，再试一次', 'Preview failed — try again')); });
      return;
    }
    if (e.target.classList.contains('sm-pkg-add')) { // 包裹：新增一行
      var pkBox = card.querySelector('.sm-pkgs');
      if (pkBox) {
        var ph = pkBox.querySelector('span');
        if (ph && ph.textContent.indexOf('还没有') !== -1) ph.remove();
        pkBox.insertAdjacentHTML('beforeend', pkgRowHtml({}));
      }
      return;
    }
    if (e.target.classList.contains('sm-pkg-save')) { // 包裹：保存
      var prow = e.target.closest('.sm-pkg-row');
      var po = byId(SM.orders, card.getAttribute('data-id')); if (!po || !prow) return;
      var pdate = prow.querySelector('.sm-p-date').value.trim();
      var pbody = {
        order_id: po.id,
        carrier: prow.querySelector('.sm-carrier').getAttribute('data-v') || 'UPS',
        tracking: prow.querySelector('.sm-p-tracking').value.trim(),
        track_url: prow.querySelector('.sm-p-url').value.trim(),
        weight_oz: parseFloat(prow.querySelector('.sm-p-weight').value) || null,
        shipped_at: pdate ? dpToInternal(pdate) + 'T12:00:00Z' : null,
        note: prow.querySelector('.sm-p-note').value.trim()
      };
      var pkid = prow.getAttribute('data-pkid');
      var preq = pkid
        ? api('shop_packages?id=eq.' + pkid, { method: 'PATCH', body: JSON.stringify(pbody) })
        : api('shop_packages', { method: 'POST', body: JSON.stringify(pbody) });
      preq.then(function (r) {
        toast(r.ok ? '包裹已保存' : '保存失败（需要跑 SQL2）');
        if (r.ok) loadPkgs(card);
      }).catch(function () { toast('保存失败（需要跑 SQL2）'); });
      return;
    }
    if (e.target.classList.contains('sm-pkg-del')) { // 包裹：删除
      var drow = e.target.closest('.sm-pkg-row');
      var did = drow ? drow.getAttribute('data-pkid') : '';
      if (!did) { drow.remove(); return; }
      uiConfirm('删除这个包裹的物流信息？', function () {
        api('shop_packages?id=eq.' + did, { method: 'DELETE' }).then(function (r) {
          toast(r.ok ? '已删除' : '删除失败');
          if (r.ok) loadPkgs(card);
        });
      });
      return;
    }
    if (e.target.classList.contains('sm-item-edit')) { // 订单商品：进入编辑模式
      var ieBox = card.querySelector('.sm-items-edit');
      if (!ieBox) return;
      ieBox.innerHTML = arr(o.items).map(itemEditRow).join('') +
        '<button type="button" class="btn-mini sm-ie-add">＋ 加商品</button>' +
        '<div class="sm-ie-sum" style="margin:8px 0;font-size:14px;"></div>' +
        '<div style="display:flex;gap:8px;"><button type="button" class="btn-save sm-ie-save">保存商品变更</button>' +
        '<button type="button" class="btn-mini sm-ie-cancel">取消</button></div>';
      ieBox.style.display = '';
      card.querySelector('.sm-items-view').style.display = 'none';
      Array.prototype.forEach.call(ieBox.querySelectorAll('.sm-ie-row'), ieRowLine);
      iePaintSum(card, o);
      return;
    }
    if (e.target.classList.contains('sm-ie-add')) { // 加一行商品
      var addBtn = card.querySelector('.sm-ie-add');
      if (addBtn) addBtn.insertAdjacentHTML('beforebegin', itemEditRow({}));
      return;
    }
    if (e.target.classList.contains('sm-ie-cancel')) { // 取消编辑：回到展示，不写库
      card.querySelector('.sm-items-edit').style.display = 'none';
      card.querySelector('.sm-items-view').style.display = '';
      return;
    }
    if (e.target.classList.contains('sm-ie-del')) {
      e.target.closest('.sm-ie-row').remove();
      iePaintSum(card, o);
      return;
    }
    if (e.target.classList.contains('sm-ie-save')) { // 保存：确认变更 → PATCH 重算金额
      var calc = iePaintSum(card, o);
      if (!calc.items.length) { toast('至少保留一件商品（选好商品再保存）'); return; }
      var paidWarn = (['paid', 'shipped', 'completed'].indexOf(o.status) !== -1 && o.pay_amount != null && o.pay_amount !== '')
        ? '\n\n注意：该订单已付款 $' + fmtMoney(o.pay_amount) + '，付款记录不会自动修改；金额有变请走退款/补款流程确认。' : '';
      uiConfirm('确认保存商品变更？\n\n' + (o.order_no || '') + '\n小计 $' + fmtMoney(o.subtotal) + ' → $' + fmtMoney(calc.sub) + '\n总价 $' + fmtMoney(o.total) + ' → $' + fmtMoney(calc.total) + paidWarn, function () {
        patchOrder(id, { items: calc.items, subtotal: fmtMoney(calc.sub), total: fmtMoney(calc.total) },
          '商品已更新，金额已重算', 'edit_items',
          '商品编辑：' + calc.items.length + ' 件，小计 $' + fmtMoney(o.subtotal) + '→$' + fmtMoney(calc.sub) + '，总价 $' + fmtMoney(o.total) + '→$' + fmtMoney(calc.total));
        // 成功后 patchOrder→renderOrders 重绘回展示态；失败则保留编辑框内容
      }, '保存');
      return;
    }
    if (e.target.classList.contains('sm-act-note')) { // 内部备注
      patchOrder(id, { admin_note: card.querySelector('.sm-admin-note').value }, '内部备注已保存');
      return;
    }
    if (e.target.classList.contains('sm-act-export1')) {
      var oe = byId(SM.orders, id);
      if (oe && window.EXPORT && window.EXPORT.quickExport) window.EXPORT.quickExport([oe], 'xls');
      else toast('导出模块未加载，刷新一下再试');
      return;
    }
    if (e.target.classList.contains('sm-act-print1')) {
      var op = byId(SM.orders, id);
      if (op && window.EXPORT && window.EXPORT.quickPrint) window.EXPORT.quickPrint([op]);
      else toast('打印模块未加载，刷新一下再试');
      return;
    }
    /* 她 20261030 §7.3：取消 / 删除都必须二次确认；删除走归档（软删），不抹掉订单和收款流水 */
    if (e.target.classList.contains('sm-act-cancel')) {
      var o1 = byId(SM.orders, id);
      var name1 = o1 ? (o1.order_no || '') : '';
      if (!window.confirm('确定取消订单 ' + name1 + '？\n\n取消后：\n· 订单标记为「已取消」，不再出现付款/发货按钮\n· 已有收款记录、物流和历史都保留\n· 买家侧的待付款提醒会停止')) return;
      if (!window.confirm('再确认一次：真的要取消 ' + name1 + ' 吗？')) return;
      patchOrder(id, { status: 'cancelled' }, '订单已取消（收款与历史都保留）', 'cancel', '取消订单');
      return;
    }
    if (e.target.classList.contains('sm-act-del')) {
      var od = byId(SM.orders, id);
      if (!od) return;
      deleteOrder(od);
      return;
    }
    if (e.target.classList.contains('sm-act-archive')) {
      var o2 = byId(SM.orders, id);
      if (!o2) return;
      var name2 = o2.order_no || '';
      var pi2 = payInfo(o2), mn2 = payNet(o2);
      var paid2 = pi2.paid + mn2.paid;
      var warn2 = paid2 > 0.005 ? '\n\n注意：这张单已经收到 $' + fmtMoney(paid2) + '，归档不会退回钱，财务流水也保留。' : '';
      if (!window.confirm('删除（归档）订单 ' + name2 + '？\n\n· 归档后默认不在列表里显示，可在「已归档」筛选里找回\n· 订单、收款记录、物流、聊天记录全部保留，不是真删\n· 这个操作可逆（重新设为其他状态即可）' + warn2)) return;
      if (!window.confirm('最后确认：归档 ' + name2 + '？')) return;
      patchOrder(id, { status: 'archived' }, '订单已归档（数据都还在，可在「已归档」里找回）', 'archive', '归档订单');
      return;
    }
  });
  oList.addEventListener('input', function (e) {
    var card = e.target.closest('.sm-order');
    if (!card) return;
    var o = byId(SM.orders, card.getAttribute('data-id'));
    if (e.target.classList.contains('sm-ie-price') || e.target.classList.contains('sm-ie-qty')) { // 商品编辑：行小计+汇总实时重算
      if (!o) return;
      ieRowLine(e.target.closest('.sm-ie-row'));
      iePaintSum(card, o);
      return;
    }
    if (!e.target.classList.contains('sm-ship-actual')) return;
    if (!o) return;
    var v = parseFloat(e.target.value);
    var ship = num(o.subtotal) - num(o.discount) + (isFinite(v) ? v : num(o.shipping_est)) + num(o.service_fee);
    card.querySelector('.sm-total-prev').textContent = '应付 $' + fmtMoney(ship);
  });
  oList.addEventListener('change', function (e) { // 商品选择：带入现有商品单价
    if (!e.target.classList.contains('sm-ie-prod')) return;
    var card = e.target.closest('.sm-order');
    var row = e.target.closest('.sm-ie-row');
    var opt = e.target.selectedOptions[0];
    if (opt && opt.value) {
      var dp = opt.getAttribute('data-price');
      if (dp !== null && dp !== '') row.querySelector('.sm-ie-price').value = dp;
    }
    ieRowLine(row);
    var o = byId(SM.orders, card.getAttribute('data-id'));
    if (o) iePaintSum(card, o);
  });
  oList.addEventListener('click', function (e) { // 发货日期：复用现有 dp 日期选择器
    if (!e.target.classList.contains('sm-ship-date') && !e.target.classList.contains('sm-p-date')) return;
    dpOpen(e.target);
  });

  // ── 拼团 ──
  document.getElementById('sm-g-product').addEventListener('click', function () {
    var btn = this;
    if (!SM.products.length) { toast('商品还没加载好'); return; }
    pickPop(btn, SM.products.map(function (p) { return { v: p.id, label: p.name }; }), SM.gPid, function (v) {
      SM.gPid = v; SM.gSku = '';
      var p = byId(SM.products, v);
      btn.setAttribute('data-v', v);
      btn.querySelector('.pick-btn-label').textContent = p ? p.name : '选择商品 *';
      var vb = document.getElementById('sm-g-variant');
      vb.setAttribute('data-v', '');
      vb.querySelector('.pick-btn-label').textContent = '规格（可选）';
    });
  });
  document.getElementById('sm-g-variant').addEventListener('click', function () {
    var btn = this;
    var p = byId(SM.products, SM.gPid);
    if (!p) { toast('先选商品'); return; }
    var vs = arr(p.variants);
    if (!vs.length) { toast('这个商品是单规格，不用选'); return; }
    pickPop(btn, [{ v: '', label: '无规格（整件）' }].concat(vs.map(function (v) {
      return { v: v.sku || '', label: (v.name || v.sku) + ' · $' + fmtMoney(v.price) };
    })), SM.gSku, function (v) {
      SM.gSku = v;
      btn.setAttribute('data-v', v);
      btn.querySelector('.pick-btn-label').textContent = v ? v : '规格（可选）';
    });
  });
  document.getElementById('sm-g-deadline').addEventListener('click', function () { dpOpen(this); });
  document.getElementById('sm-g-save').addEventListener('click', function () {
    var name = document.getElementById('sm-g-name').value.trim();
    var p = byId(SM.products, SM.gPid);
    var price = parseFloat(document.getElementById('sm-g-price').value);
    var target = parseInt(document.getElementById('sm-g-target').value, 10) || 2;
    var deadline = dpToInternal(document.getElementById('sm-g-deadline').value);
    if (!name) { toast('先给拼团起个名字'); return; }
    if (!p) { toast('选一个商品'); return; }
    if (!isFinite(price) || price < 0) { toast('拼团价要填一个数字'); return; }
    if (target < 2) { toast('目标人数至少 2 人'); return; }
    if (!deadline) { toast('选一下截止时间'); return; }
    this.disabled = true;
    api('shop_groups', {
      method: 'POST',
      body: JSON.stringify({
        product_id: p.id, variant_sku: SM.gSku, name: name,
        product_name: p.name, product_image: p.image_url || '',
        price: fmtMoney(price), target: target,
        deadline: deadline + 'T23:59:59Z', status: 'open'
      })
    }).then(function (r) {
      if (!r.ok) throw new Error('http');
      toast('拼团已发起，前台能看到啦');
      document.getElementById('sm-g-name').value = '';
      document.getElementById('sm-g-price').value = '';
      SM.gPid = ''; SM.gSku = '';
      document.getElementById('sm-g-product').setAttribute('data-v', '');
      document.querySelector('#sm-g-product .pick-btn-label').textContent = '选择商品 *';
      document.getElementById('sm-g-variant').setAttribute('data-v', '');
      document.querySelector('#sm-g-variant .pick-btn-label').textContent = '规格（可选）';
      document.getElementById('sm-g-deadline').value = '';
      loadGroups();
    }).catch(function () { toast('发起失败：数据库没连上'); })
      .finally(function () { this.disabled = false; }.bind(document.getElementById('sm-g-save')));
  });
  document.getElementById('sm-g-list').addEventListener('click', function (e) {
    var card = e.target.closest('.sm-group');
    if (!card) return;
    var gid = card.getAttribute('data-gid');
    if (e.target.classList.contains('sm-g-mb')) {
      SM.gopen[gid] = !SM.gopen[gid];
      if (SM.gopen[gid]) loadMembers(gid); else renderGroups();
      return;
    }
    if (e.target.classList.contains('sm-g-cancel')) {
      var g = byId(SM.groups, gid);
      uiConfirm('确定取消拼团「' + ((g && g.name) || '') + '」吗？已参加的买家订单不受影响，但团不会再成。', function () {
        restWrite('shop_groups?id=eq.' + gid, 'PATCH', { status: 'cancelled' }, '拼团已取消')
          .then(function (ok) { if (ok) { var gg = byId(SM.groups, gid); if (gg) gg.status = 'cancelled'; renderGroups(); renderStats(); } });
      }, '取消拼团');
    }
  });

  // ── 优惠券 ──
  document.getElementById('sm-c-type').addEventListener('click', function () {
    var btn = this;
    pickPop(btn, [{ v: 'percent', label: '百分比（减%）' }, { v: 'fixed', label: '固定金额（立减$）' }], SM.cType, function (v) {
      SM.cType = v;
      btn.setAttribute('data-v', v);
      btn.querySelector('.pick-btn-label').textContent = v === 'percent' ? '百分比（减%）' : '固定金额（立减$）';
    });
  });
  document.getElementById('sm-c-ag').addEventListener('click', function () {
    SM.cAg = !SM.cAg;
    this.classList.toggle('on', SM.cAg);
  });
  document.getElementById('sm-c-start').addEventListener('click', function () { dpOpen(this); });
  document.getElementById('sm-c-end').addEventListener('click', function () { dpOpen(this); });
  document.getElementById('sm-c-cancel').addEventListener('click', function () { SM.cEdit = null; fillCouponForm(null); });
  document.getElementById('sm-c-save').addEventListener('click', function () {
    var f = couponFormState();
    if (!f.code) { toast('优惠码总要有的'); return; }
    if (f.value === '' || !isFinite(parseFloat(f.value))) { toast('优惠值要填一个数字'); return; }
    var body = {
      code: f.code,
      type: SM.cType,
      value: fmtMoney(f.value),
      min_spend: fmtMoney(f.min_spend || 0),
      max_uses: parseInt(f.max_uses, 10) || 0,
      per_user: parseInt(f.per_user, 10) || 0,
      starts_at: f.starts_at ? dpToInternal(f.starts_at) + 'T00:00:00Z' : null,
      ends_at: f.ends_at ? dpToInternal(f.ends_at) + 'T23:59:59Z' : null,
      tag: f.tag,
      allow_group: SM.cAg
    };
    var btn = this;
    btn.disabled = true;
    var req = SM.cEdit
      ? restWrite('shop_coupons?id=eq.' + SM.cEdit, 'PATCH', body, '优惠券已更新')
      : api('shop_coupons', { method: 'POST', body: JSON.stringify(body) })
          .then(function (r) { if (!r.ok) throw new Error('http'); toast('优惠券已创建'); return true; })
          .catch(function () { toast('创建失败：码可能重复，或数据库没连上'); return false; });
    Promise.resolve(req).then(function (ok) {
      btn.disabled = false;
      if (!ok) return;
      SM.cEdit = null;
      fillCouponForm(null);
      loadCoupons();
    });
  });
  document.getElementById('sm-c-list').addEventListener('click', function (e) {
    var row = e.target.closest('.sm-c-row');
    if (!row) return;
    var c = byId(SM.coupons, row.getAttribute('data-cid'));
    if (!c) return;
    if (e.target.classList.contains('sm-c-edit')) {
      SM.cEdit = c.id;
      fillCouponForm(c);
      document.getElementById('sm-sec-coupons').scrollIntoView({ block: 'start' });
      return;
    }
    if (e.target.classList.contains('sm-c-toggle')) {
      restWrite('shop_coupons?id=eq.' + c.id, 'PATCH', { active: !c.active }, c.active ? '已停用' : '已启用')
        .then(function (ok) { if (ok) { c.active = !c.active; renderCoupons(); } });
    }
  });

  // ── 售后 ──
  document.getElementById('sm-as-list').addEventListener('click', function (e) {
    var card = e.target.closest('.sm-as');
    if (!card) return;
    var mid = card.getAttribute('data-mid');
    if (e.target.classList.contains('sm-as-done')) {
      resolveAftersale(mid, 'done', card.querySelector('.sm-as-reply').value.trim());
      return;
    }
    if (e.target.classList.contains('sm-as-rej')) {
      resolveAftersale(mid, 'rejected', card.querySelector('.sm-as-reply').value.trim());
    }
  });

  // ── 设置 ──
  document.getElementById('sm-s-save').addEventListener('click', function () {
    var fee = parseFloat(document.getElementById('sm-s-fee').value);
    var est = parseFloat(document.getElementById('sm-s-flat').value);
    if (!isFinite(fee) || fee < 0 || !isFinite(est) || est < 0) { toast('服务费和运费都要填不小于 0 的数字'); return; }
    var val = { service_fee: fmtMoney(fee), flat_est: fmtMoney(est) };
    saveSetting('shop_ship', val).then(function (r) {
      if (!r.ok) throw new Error('http');
      SETTINGS['shop_ship'] = JSON.stringify(val);
      SM.ship = val;
      toast('运费设置已保存，新订单立即生效');
    }).catch(function () { toast('保存失败：数据库没连上'); });
  });

  // ── 商品编辑卡：追加 重量 + 规格编辑器（不动现有 .edit-grid 逻辑）──
  // 注意：现有 kebab 处理器会同步替换 card.innerHTML，气泡阶段轮到我时 e.target 已脱禹 DOM，
  // 所以用捕获阶段接管：kebab 延迟一拍等卡片重建完再追加；保存则在现有处理器读值前先读走重量/规格。
  var productList = document.getElementById('product-list');
  if (productList) {
    productList.addEventListener('click', function (e) {
      var t = e.target;
      var isKebab = t.classList && t.classList.contains('kebab');
      var isSave = t.classList && t.classList.contains('btn-save-edit');
      if (!isKebab && !isSave) return;
      var card = t.closest('.shop-item');
      if (!card) return;
      if (isKebab) setTimeout(function () { augmentProductEdit(card); }, 0);
      else saveProductExtra(card);
    }, true);
    productList.addEventListener('input', function (e) {
      var row = e.target.closest('.sm-var-row');
      if (!row) return;
      var card = e.target.closest('.shop-item');
      var v = arr(card.__variants)[parseInt(row.getAttribute('data-i'), 10)];
      if (!v) return;
      if (e.target.classList.contains('sv-sku')) v.sku = e.target.value;
      if (e.target.classList.contains('sv-name')) v.name = e.target.value;
      if (e.target.classList.contains('sv-price')) v.price = e.target.value;
      if (e.target.classList.contains('sv-stock')) v.stock = e.target.value;
    });
    productList.addEventListener('click', function (e) { // 规格行：添加 / 删行 / 删图（与保存按钮同一监听器分开写，逻辑清楚）
      var card = e.target.closest('.shop-item');
      if (!card) return;
      if (e.target.classList.contains('sm-var-add')) {
        card.__variants = arr(card.__variants);
        card.__variants.push({ sku: '', name: '', price: '', stock: '', images: [] });
        smVarRenderRows(card);
        return;
      }
      if (e.target.classList.contains('sm-var-del')) {
        card.__variants.splice(parseInt(e.target.getAttribute('data-i'), 10), 1);
        smVarRenderRows(card);
        return;
      }
      // 她 20261030 §3：上移 / 下移 / 冻结
      if (e.target.classList.contains('sm-var-up') || e.target.classList.contains('sm-var-down')) {
        var ii2 = parseInt(e.target.getAttribute('data-i'), 10);
        var to2 = ii2 + (e.target.classList.contains('sm-var-up') ? -1 : 1);
        card.__variants = arr(card.__variants);
        if (to2 >= 0 && to2 < card.__variants.length) { var mv2 = card.__variants.splice(ii2, 1)[0]; card.__variants.splice(to2, 0, mv2); smVarRenderRows(card); }
        return;
      }
      if (e.target.classList.contains('sm-var-freeze')) {
        var fi2 = parseInt(e.target.getAttribute('data-i'), 10);
        var fv2 = arr(card.__variants)[fi2];
        if (fv2) { fv2.frozen = !fv2.frozen; smVarRenderRows(card); toast(fv2.frozen ? '已冻结：前台不能再买这个规格' : '已解冻'); }
        return;
      }
      var imgdel = e.target.closest('.sm-var-imgdel');
      if (imgdel) {
        var v = arr(card.__variants)[parseInt(imgdel.getAttribute('data-i'), 10)];
        if (v && arr(v.images)) { v.images.splice(parseInt(imgdel.getAttribute('data-k'), 10), 1); smVarRenderRows(card); }
      }
      var imgmv = e.target.closest('.sm-var-imgmv');
      if (imgmv) {
        var vmv = arr(card.__variants)[parseInt(imgmv.getAttribute('data-i'), 10)];
        var kk2 = parseInt(imgmv.getAttribute('data-k'), 10), dd2 = parseInt(imgmv.getAttribute('data-d'), 10);
        if (vmv && arr(vmv.images).length > 1 && kk2 + dd2 >= 0 && kk2 + dd2 < vmv.images.length) {
          var tmp2 = vmv.images[kk2]; vmv.images[kk2] = vmv.images[kk2 + dd2]; vmv.images[kk2 + dd2] = tmp2;
          smVarRenderRows(card);
        }
      }
    });
    productList.addEventListener('change', function (e) { // 规格图上传：复用 uploadShopFiles（shop 桶）
      if (!e.target.classList.contains('sm-var-file')) return;
      var card = e.target.closest('.shop-item');
      var i = parseInt(e.target.getAttribute('data-i'), 10);
      var v = arr(card.__variants)[i];
      var files = Array.prototype.slice.call(e.target.files || []);
      if (!v || !files.length) return;
      uploadShopFiles(files).then(function (urls) {
        v.images = arr(v.images).concat(urls);
        smVarRenderRows(card);
        toast('规格图已上传，点「保存修改」落库');
      }).catch(function () { toast('图片上传失败'); });
    });
  }

  /* ── 首次打开加载 + #shopmgr 直达（必须在事件绑定之后执行，否则 click 没人接；登录态则交给 admin.html 的 PENDING_TAB 机制）── */
  (function () {
    var run = function () {
      if (location.hash.replace('#', '') !== 'shopmgr') return;
      if (document.getElementById('admin-body') && document.getElementById('admin-body').style.display !== 'none') {
        var tb = document.querySelector('.tab-btn[data-tab="shopmgr"]');
        if (tb && !tb.classList.contains('active')) tb.click();
      } // 未登录/还没进后台时不动，登录成功后 admin.html 会用 PENDING_TAB 点开
    };
    run();
    window.addEventListener('load', run); // 兜底：脚本执行时如果还在登录门后面，登录完成后也不会丢
  })();

  /* ════════ 手动建单 / 批量导出 / 政策内容编辑（她 2026-10-25 规格）════════ */
  SM.osel = SM.osel || {};
  var SOURCE_LABEL = { online: '线上下单', admin: '后台手动创建' };

  // ── 勾选框（捕获阶段，别触发行展开）──
  root.addEventListener('click', function (e) {
    var retry = e.target.closest('.sm-o-retry'); // 加载失败的手动重试（根因：网络请求卡死/断开，不能只靠自动重试）
    if (retry) { SM._oFailed = false; renderOrders(); loadOrders(); return; }
    var box = e.target.closest('.sm-osel');
    if (!box) return;
    e.stopPropagation(); e.preventDefault();
    var id = box.getAttribute('data-id');
    SM.osel[id] = !SM.osel[id];
    renderOrders();
  }, true);

  /* 订单编号一律找数据库要，前端不算号（2026-10-30 23:41 任务书）
     优先 rpc/shop_alloc_order_no（末尾补位版，需先跑 20261031_order_no_alloc.sql）
     没跑过就退回老的 rpc/shop_next_order_no（只递增不补位），保证不会因为缺函数而建不了单 */
  function nextOrderNo() {
    return api('rpc/shop_alloc_order_no', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ p_hold_minutes: 30 }) })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (no) {
        if (no) return no;
        return api('rpc/shop_next_order_no', { method: 'POST', body: '{}' })
          .then(function (r2) { return r2.ok ? r2.json() : null; });
      })
      .catch(function () { return null; });
  }
  // ── 手动建单 ──
  var MO_ITEMS = [];
  function genOrderNo() {
    var d = new Date();
    var ymd = ('' + d.getFullYear()).slice(2) + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2);
    var hex = ''; for (var i = 0; i < 6; i++) hex += '0123456789ABCDEF'[Math.floor(Math.random() * 16)];
    return 'YK' + ymd + '-' + hex;
  }
  function moItemRowHtml(it, i) {
    var p = it.pid ? byId(SM.products, it.pid) : null;
    var label = p ? (p.name || '（未命名商品）') : (it.custom ? '自定义商品' : '选择商品');
    var sub = num(it.qty) * num(it.price);
    return '<div class="mo-item" data-i="' + i + '">' +
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap;">' +
        '<b style="font-size:15px;color:var(--text);">商品 ' + (i + 1) + '</b>' +
        '<button type="button" class="btn-del mo-del" data-i="' + i + '" style="margin-left:auto;padding:5px 14px;font-size:14px;">删除此商品</button>' +
      '</div>' +
      '<div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;margin-bottom:12px;">' +
        '<div style="flex:1;min-width:180px;"><span class="mo-flabel">商品（点选择）</span>' +
        '<button type="button" class="sel-btn mo-pick" data-i="' + i + '"><span class="pick-btn-label">' + esc(label) + '</span></button></div>' +
        (it.pid && p && arr(p.variants).length ? '<div style="flex:1;min-width:150px;"><span class="mo-flabel">规格（可留空）</span>' +
        '<button type="button" class="sel-btn mo-vpick" data-i="' + i + '"><span class="pick-btn-label">' + esc(it.sku ? (currentVariantName(p, it.sku)) : '无规格') + '</span></button></div>' : '') +
        (it.custom ? '<div style="flex:1;min-width:180px;"><span class="mo-flabel">自定义商品名 *</span>' +
        '<input class="mo-name" data-i="' + i + '" placeholder="填个名字" value="' + escAttr(it.name || '') + '"></div>' : '') +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">' +
        '<div><span class="mo-flabel">单价 $（留空用商品价）</span><input class="mo-price" data-i="' + i + '" type="number" min="0" step="0.01" value="' + escAttr(it.price == null ? '' : it.price) + '" placeholder="0.00"></div>' +
        '<div><span class="mo-flabel">数量</span><input class="mo-qty" data-i="' + i + '" type="number" min="1" step="1" value="' + escAttr(it.qty == null ? 1 : it.qty) + '"></div>' +
        '<div><span class="mo-flabel">小计</span><div class="mo-item-sub" data-i="' + i + '" style="padding:10px 12px;font-size:16px;font-weight:700;color:var(--price,#ff6fa5);background:var(--card,#FFF0F5);border-radius:10px;">$' + fmtMoney(sub) + '</div></div>' +
      '</div>' +
      (it.custom ? '<div class="mo-photo-row" style="margin-top:12px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">' +
        '<span class="mo-flabel">商品照片（可留空）</span>' +
        '<span class="mo-img-prev">' + (it.imgUrl ? '<img src="' + escAttr(it.imgUrl) + '" style="width:46px;height:46px;object-fit:cover;border-radius:10px;border:1px solid #FFD9E6;vertical-align:middle;">' : (it.imgPrev ? '<img src="' + escAttr(it.imgPrev) + '" style="width:46px;height:46px;object-fit:cover;border-radius:10px;border:1px dashed #F3C9D8;vertical-align:middle;">' : '<span style="font-size:13px;color:var(--muted,#81717A);">未选择</span>')) + '</span>' +
        '<label class="sel-btn" style="cursor:pointer;">' + (it.imgUrl || it.imgPrev ? '替换照片' : '选择照片') + '<input type="file" accept="image/*" class="mo-img" data-i="' + i + '" hidden></label>' +
        (it.imgUrl || it.imgPrev ? '<button type="button" class="btn-del mo-img-del" data-i="' + i + '" style="padding:5px 14px;font-size:14px;">删除照片</button>' : '') +
        (it.imgUp ? '<span style="font-size:13px;color:var(--muted,#81717A);">上传中…</span>' : '') +
      '</div>' : '') +
      '</div>';
  }
  function currentVariantName(p, sku) {
    var v = arr(p.variants).filter(function (x) { return x.sku === sku; })[0];
    return v ? (v.name || v.sku) : '规格（可选）';
  }
  function applyMoPick(i, v) {
    if (!MO_ITEMS[i]) return;
    if (v === '__custom__') { MO_ITEMS[i] = { pid: '', sku: '', qty: MO_ITEMS[i].qty || 1, price: MO_ITEMS[i].price || '', custom: true, name: MO_ITEMS[i].name || '' }; return; }
    var pp = byId(SM.products, v);
    MO_ITEMS[i] = { pid: v, sku: '', qty: MO_ITEMS[i].qty || 1, price: pp ? String(pp.price) : '', custom: false, name: '' };
  }
  function moCalc() {
    var sub = 0;
    MO_ITEMS.forEach(function (it) { sub += num(it.qty) * num(it.price); });
    var disc = num(document.querySelector('#mo-form .mo-discount').value);
    var ship = num(document.querySelector('#mo-form .mo-ship').value);
    var fee = num(document.querySelector('#mo-form .mo-fee').value);
    var total = sub - disc + ship + fee;
    var cs = '$'; // 汇总行固定按美元展示符号，保存时按所选货币入库（与原逻辑一致）
    var el = document.querySelector('#mo-form .mo-sum');
    if (el) el.innerHTML = '<div class="mo-sum-box">' +
      '<div class="mo-sum-row"><span class="mo-sl">商品小计</span><span style="color:var(--price,#ff6fa5);">' + cs + fmtMoney(sub) + '</span></div>' +
      '<div class="mo-sum-row"><span class="mo-sl">折扣</span><span style="color:var(--price,#ff6fa5);">-' + cs + fmtMoney(disc) + '</span></div>' +
      '<div class="mo-sum-row"><span class="mo-sl">运费</span><span style="color:var(--price,#ff6fa5);">' + cs + fmtMoney(ship) + '</span></div>' +
      '<div class="mo-sum-row"><span class="mo-sl">税费</span><span>未收取</span></div>' +
      '<div class="mo-sum-row"><span class="mo-sl">服务费</span><span style="color:var(--price,#ff6fa5);">' + cs + fmtMoney(fee) + '</span></div>' +
      '<div class="mo-sum-total"><b style="font-size:17px;color:var(--text);">订单总价</b><b style="color:var(--price,#ff6fa5);">' + cs + fmtMoney(total) + '</b></div>' +
      '</div>';
    // 每个商品自己的小计也跟着刷新（数量/单价一改立刻变）
    Array.prototype.forEach.call(document.querySelectorAll('#mo-form .mo-item-sub'), function (el2) {
      var it = MO_ITEMS[parseInt(el2.getAttribute('data-i'), 10)];
      if (it) el2.textContent = cs + fmtMoney(num(it.qty) * num(it.price));
    });
    return { sub: sub, disc: disc, ship: ship, fee: fee, total: total };
  }
  function moRenderItems() {
    var box = document.querySelector('#mo-form .mo-items');
    if (box) box.innerHTML = MO_ITEMS.length ? MO_ITEMS.map(moItemRowHtml).join('') : '<p class="hint">还没加商品，点下面「＋ 添加商品」</p>';
  }
  /* ─────────────────────────────────────────────────────────────
     地址文本解析（中英文混排都能吃；纯前端启发式，不联网、不自动提交）
     返回 {name, phone, email, country, state, city, zip, street, confirm}
     confirm 里为 false 的字段 = 我没把握，界面上标 ⚠ 让她自己确认
     ───────────────────────────────────────────────────────────── */
  var ADDR_COUNTRY_ALIAS = {
    'united states': 'United States', 'usa': 'United States', 'u.s.a.': 'United States', 'u.s.': 'United States',
    'america': 'United States', '美国': 'United States',
    'canada': 'Canada', '加拿大': 'Canada',
    'united kingdom': 'United Kingdom', 'uk': 'United Kingdom', 'england': 'United Kingdom', '英国': 'United Kingdom',
    'australia': 'Australia', '澳大利亚': 'Australia', '澳洲': 'Australia',
    'japan': 'Japan', '日本': 'Japan',
    'china': 'China', '中国': 'China',
    'singapore': 'Singapore', '新加坡': 'Singapore',
    'germany': 'Germany', '德国': 'Germany',
    'france': 'France', '法国': 'France',
    'new zealand': 'New Zealand', '新西兰': 'New Zealand',
    'malaysia': 'Malaysia', '马来西亚': 'Malaysia',
    'south korea': 'South Korea', 'korea': 'South Korea', '韩国': 'South Korea',
    'hong kong': 'Hong Kong', '香港': 'Hong Kong',
    'taiwan': 'Taiwan', '台湾': 'Taiwan',
    'netherlands': 'Netherlands', '荷兰': 'Netherlands',
    'italy': 'Italy', '意大利': 'Italy', 'spain': 'Spain', '西班牙': 'Spain',
    'sweden': 'Sweden', '瑞典': 'Sweden', 'switzerland': 'Switzerland', '瑞士': 'Switzerland'
  };
  var ADDR_US_STATES = {
    AL: 1, AK: 1, AZ: 1, AR: 1, CA: 1, CO: 1, CT: 1, DE: 1, FL: 1, GA: 1, HI: 1, ID: 1, IL: 1, IN: 1, IA: 1,
    KS: 1, KY: 1, LA: 1, ME: 1, MD: 1, MA: 1, MI: 1, MN: 1, MS: 1, MO: 1, MT: 1, NE: 1, NV: 1, NH: 1, NJ: 1,
    NM: 1, NY: 1, NC: 1, ND: 1, OH: 1, OK: 1, OR: 1, PA: 1, RI: 1, SC: 1, SD: 1, TN: 1, TX: 1, UT: 1, VT: 1,
    VA: 1, WA: 1, WV: 1, WI: 1, WY: 1, DC: 1
  };
  var ADDR_CA_PROV = { ON: 1, QC: 1, BC: 1, AB: 1, MB: 1, SK: 1, NS: 1, NB: 1, NL: 1, PE: 1, YT: 1, NT: 1, NU: 1 };
  var ADDR_STATE_NAMES = {
    alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO',
    connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID',
    illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA',
    maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN',
    mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
    'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
    'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR',
    pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD',
    tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT', virginia: 'VA', washington: 'WA',
    'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY'
  };
  function parseAddressText(raw) {
    var out = { name: '', phone: '', email: '', country: '', state: '', city: '', zip: '', street: '' };
    var conf = { name: true, phone: true, email: true, country: true, state: true, city: true, zip: true, street: true };
    var t = String(raw || '').replace(/[，、；]/g, function (m) { return m === '；' ? '\n' : ','; }).replace(/\u3000/g, ' ').trim();
    if (!t) return { name: '', phone: '', email: '', country: '', state: '', city: '', zip: '', street: '', confirm: conf };

    // 邮箱
    var em = t.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
    if (em) { out.email = em[0]; t = t.replace(em[0], ' '); }

    // 电话：美国 10/11 位、中国 11 位、通用长串数字
    var ph = t.match(/(?:\+?1[\s.\-]?)?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}\b/)
      || t.match(/(?:\+?86[\s\-]?)?1[3-9]\d{9}\b/)
      || t.match(/\+?\d[\d\s().\-]{7,}\d/);
    if (ph) { out.phone = ph[0].replace(/\s+/g, ' ').trim(); t = t.replace(ph[0], ' '); }
    else { conf.phone = false; }

    var full = t; // 保留未去邮编的全文，供后面的城市/州正则用

    // 邮编：US 5 位 / 5-4，日本 3-4，加拿大 A1A 1A1，中国 6 位
    var zp = t.match(/\b\d{5}-\d{4}\b/)
      || t.match(/\b\d{3}-\d{4}\b/)
      || t.match(/\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b/)
      || t.match(/(?<!\d)\d{5}(?!\d)/)
      || t.match(/(?<!\d)\d{6}(?!\d)/);
    if (zp) { out.zip = zp[0]; t = t.replace(zp[0], ' '); }
    else { conf.zip = false; }

    // 国家
    var lower = ' ' + t.toLowerCase() + ' ';
    var ckeys = Object.keys(ADDR_COUNTRY_ALIAS).sort(function (a, b) { return b.length - a.length; });
    for (var ci = 0; ci < ckeys.length; ci++) {
      var ck = ckeys[ci];
      var isCn = /[\u4e00-\u9fa5]/.test(ck);
      if (isCn ? t.indexOf(ck) >= 0 : lower.indexOf(' ' + ck) >= 0 || lower.indexOf(ck + ' ') >= 0) {
        out.country = ADDR_COUNTRY_ALIAS[ck];
        break;
      }
    }

    // 州 / 省
    var stAbbr = t.match(/\b([A-Z]{2})\b/);
    if (stAbbr && (ADDR_US_STATES[stAbbr[1]] || ADDR_CA_PROV[stAbbr[1]])) { out.state = stAbbr[1]; }
    if (!out.state) {
      var sk = Object.keys(ADDR_STATE_NAMES);
      for (var si = 0; si < sk.length; si++) {
        if (lower.indexOf(sk[si]) >= 0) { out.state = ADDR_STATE_NAMES[sk[si]]; break; }
      }
    }
    if (!out.state) {
      var cnProv = t.match(/([\u4e00-\u9fa5]{2,8}?(?:省|自治区|特别行政区))/);
      if (cnProv) out.state = cnProv[1];
    }
    if (!out.state) conf.state = false;

    // 城市
    var cnCity = t.match(/([\u4e00-\u9fa5]{2,10}?(?:市|地区|自治州|县))/);
    if (cnCity) out.city = cnCity[1];
    if (out.city && out.state && out.city.indexOf(out.state) === 0) out.city = out.city.slice(out.state.length); // 广东省深圳市 → 深圳市
    if (!out.city) {
      var usCity = full.match(/,\s*([A-Za-z][A-Za-z .'\-]{1,30})\s*,\s*(?:[A-Z]{2}|\d{5})/)
        || full.match(/([A-Za-z][A-Za-z .'\-]{1,30}),\s*[A-Z]{2}\b/) 
        || full.match(/([A-Za-z][A-Za-z .'\-]{1,30})\s+\d{3}-\d{4}/)
        || full.match(/([A-Za-z][A-Za-z .'\-]{1,30})[\s,]+(?:\d{5}|[A-Z]\d[A-Z]\s?\d[A-Z]\d)\b/);
      if (usCity) out.city = usCity[1].trim();
    }
    if (!out.city) conf.city = false;

    // 拆行：姓名行 / 详细地址行（单行用逗号拆；中文单行按空格拆）
    var lines = t.split(/\r?\n/).map(function (s) { return s.replace(/\s+/g, ' ').trim(); }).filter(Boolean);
    if (lines.length === 1 && lines[0].indexOf(',') >= 0) {
      lines = lines[0].split(/\s*,\s*/).filter(Boolean);
    }
    if (lines.length === 1 && /[\u4e00-\u9fa5]/.test(lines[0])) {
      lines = lines[0].split(/\s+/).filter(Boolean);
    }
    var rest = [];
    var nameHit = false;
    var nameKey = /^(?:收件人|收货人|姓名|联系人|name|receiver|to)\s*[:：]?\s*/i;
    for (var li = 0; li < lines.length; li++) {
      var ln = lines[li];
      var cleaned = ln.replace(nameKey, '');
      var looksName = cleaned.length <= 24 && !/\d/.test(cleaned)
        && !/(street|st\.|ave|road|rd\.|drive|dr\.|lane|ln\.|blvd|suite|apt|unit|city|state|province|zip|county)/i.test(cleaned)
        && !/(省|市|区|路|街|道|巷|号|楼|室|镇|村)/.test(cleaned);
      if (!nameHit && (nameKey.test(ln) || looksName)) {
        if (nameKey.test(ln) || cleaned.length >= 2) {
          out.name = cleaned.trim();
          nameHit = true;
          continue;
        }
      }
      // 中文单行：“张三 广东省深圳市…” → 领头 2-4 个汉字当姓名
      if (!nameHit) {
        var cnNm = ln.match(/^([\u4e00-\u9fa5]{2,4})(?=[\s\d,])/);
        if (cnNm && !/(省|市|区|县|路|街|道|号|楼|室|镇|村|收件人|收货人)/.test(cnNm[1])) {
          out.name = cnNm[1];
          nameHit = true;
          ln = ln.slice(cnNm[1].length).trim();
          if (ln) rest.push(ln);
          continue;
        }
      }
      rest.push(ln);
    }
    // 详细地址：优先带门牌/路名的行
    var streetLines = rest.filter(function (ln) {
      return /\d/.test(ln) || /(street|st\.|ave|avenue|road|rd\.|drive|dr\.|lane|ln\.|blvd|suite|apt|unit|#|\u53f7|\u8def|\u8857|\u9053|\u5df7|\u5f04|\u697c|\u5ba4)/i.test(ln);
    });
    if (streetLines.length) out.street = streetLines.join(', ').replace(/\s*,\s*/g, ', ').replace(/(,\s*){2,}/g, ', ').trim();

    // 兜底：如果街道为空但还有非空行，就把剩下的拼起来当街道
    if (!out.street) {
      var left = rest.filter(function (ln) { return ln && ln !== out.city && ln !== out.state && ln !== out.country; });
      if (left.length) out.street = left.join(', ').trim();
    }
    if (!out.street) conf.street = false;
    if (!out.name) conf.name = false;
    if (!out.city) conf.city = false;
    // 没识别出国家：美国州默认美国，加拿大省默认加拿大，中文省/市默认中国
    if (!out.country && out.state && ADDR_US_STATES[out.state]) out.country = 'United States';
    if (!out.country && out.state && ADDR_CA_PROV[out.state]) out.country = 'Canada';
    if (!out.country && /(省|自治区|市)/.test((out.state || '') + (out.city || '')) && /[\u4e00-\u9fa5]/.test(out.state || out.city || '')) out.country = 'China';
    if (!out.country) conf.country = false;

    // 收尾清理：街道里别再把姓名/城市/州/省/邮编/国家重复一遍
    if (out.street) {
      var strip = [out.name, out.city, out.state, out.zip, out.country].filter(Boolean);
      strip.forEach(function (w) {
        out.street = out.street.split(w).join(' ').replace(/\s*,\s*,/g, ',').replace(/^\s*,\s*|\s*,\s*$/g, ' ').replace(/\s{2,}/g, ' ').trim();
      });
    }

    return { name: out.name, phone: out.phone, email: out.email, country: out.country, state: out.state, city: out.city, zip: out.zip, street: out.street, confirm: conf };
  }

  function openManualOrder() {
    MO_ITEMS = [{ pid: '', sku: '', qty: 1, price: '', custom: false, name: '' }];
    if (!SM.products.length) loadProducts().then(function () { if (document.querySelector('#mo-form')) moRenderItems(); });
    var now = new Date();
    var pad = function (n) { return ('0' + n).slice(-2); };
    var local = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) + 'T' + pad(now.getHours()) + ':' + pad(now.getMinutes());
    var mask = document.createElement('div');
    mask.id = 'mo-mask';
    mask.style.cssText = 'position:fixed;inset:0;background:rgba(90,80,90,.45);z-index:9998;overflow:auto;padding:30px 10px;';
    // 订单编号改为保存时才向服务端申请（20261029 她反馈：打开弹窗就预占号，不开单号码也一直变/被烧掉）
    mask.innerHTML =
      '<div id="mo-form" style="max-width:820px;margin:0 auto;background:#fff;border-radius:18px;padding:22px;box-shadow:0 10px 40px rgba(120,80,100,.25);">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;"><h3 style="margin:0;font-size:19px;">手动创建订单</h3>' +
      '<button type="button" class="btn-mini mo-close">关闭</button></div>' +
      '<p class="hint" style="margin:0 0 10px;">顺序 ① 客户 → ② 商品 → ③ 收款 → ④ 确认；高级选项默认收起。</p>' +

      '<details class="mo-sec" open><summary><span class="mo-step">1</span>客户信息</summary><div class="mo-sec-body">' +
      '<textarea class="mo-addr-text" placeholder="把买家发来的地址整段粘进来（中英文都行），点「识别并预览」自动拆开" style="width:100%;min-height:58px;box-sizing:border-box;padding:10px 12px;font-family:inherit;font-size:15px;border:1.5px solid var(--accent-soft,#FCE1EA);border-radius:12px;"></textarea>' +
      '<button type="button" class="btn-mini mo-addr-parse" style="margin-top:6px;padding:8px 18px;">识别并预览</button>' +
      '<p class="hint mo-addr-hint" style="margin:6px 0 0;"></p>' +
      '<div class="form-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px;">' +
      '<input class="mo-email" placeholder="买家邮箱（可空）" style="grid-column:1/-1;">' +
      '<input class="mo-bname" placeholder="买家姓名（可空）">' +
      '<input class="mo-bphone" placeholder="联系电话（可空）">' +
      '<input class="mo-addr-name" placeholder="收件人姓名 *">' +
      '<input class="mo-addr-country" placeholder="国家（默认 United States）">' +
      '<input class="mo-addr-street" placeholder="街道地址 *" style="grid-column:1/-1;">' +
      '<input class="mo-addr-city" placeholder="城市 *">' +
      '<input class="mo-addr-state" placeholder="州/省">' +
      '<input class="mo-addr-zip" placeholder="ZIP Code">' +
      '</div></div></details>' +

      '<details class="mo-sec" open><summary><span class="mo-step">2</span>商品信息</summary><div class="mo-sec-body">' +
      '<div class="mo-items"></div>' +
      '<button type="button" class="btn-mini mo-additem" style="background:#FCE1EA;color:#A98D96;padding:9px 22px;font-size:15px;">＋ 添加商品</button>' +
      '<p class="hint" style="margin:6px 0 0;">从商品列表选，或选「自定义商品」录临时商品；单价留空自动用商品价</p>' +
      '</div></details>' +

      '<details class="mo-sec" open><summary><span class="mo-step">3</span>收款安排</summary><div class="mo-sec-body">' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
      '<button type="button" class="paytab mo-plan on" data-v="full">全款</button>' +
      '<button type="button" class="paytab mo-plan" data-v="deposit">定金＋尾款</button>' +
      '<button type="button" class="paytab mo-plan" data-v="split">分次付款</button>' +
      '</div>' +
      '<div class="mo-plan-inputs" style="margin-top:8px;"></div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin:12px 0 10px;">' +
      '<div><span class="mo-flabel mo-flabel-inpop">折扣金额 $</span><input class="mo-discount" type="number" min="0" step="0.01" value="0"></div>' +
      '<div><span class="mo-flabel mo-flabel-inpop">运费 $</span><input class="mo-ship" type="number" min="0" step="0.01" value="0"></div>' +
      '<div><span class="mo-flabel mo-flabel-inpop">服务费 $</span><input class="mo-fee" type="number" min="0" step="0.01" value="2"></div>' +
      '</div>' +
      '<div class="mo-sum"></div>' +
      '</div></details>' +

      '<details class="mo-sec" open><summary><span class="mo-step">4</span>订单确认</summary><div class="mo-sec-body">' +
      '<input class="mo-note" placeholder="买家备注（可空）" style="width:100%;box-sizing:border-box;">' +
      '<details class="mo-adv"><summary>高级选项（订单时间 / 状态 / 货币 / 内部备注）</summary>' +
      '<div class="form-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;">' +
      '<input class="mo-no" value="" readonly placeholder="订单编号：保存时自动生成" style="color:var(--muted,#81717A);background:#FFF8FA;">' +
      '<input class="mo-time" type="datetime-local" value="' + local + '">' +
      '<button type="button" class="sel-btn mo-status" data-v="pending"><span class="pick-btn-label">状态：待付款</span></button>' +
      '<button type="button" class="sel-btn mo-cur" data-v="USD"><span class="pick-btn-label">货币：USD</span></button>' +
      '<input class="mo-adminnote" placeholder="管理员备注（只有你能看）" style="grid-column:1/-1;">' +
      '</div></details>' +
      '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:14px;">' +
      '<button type="button" class="btn-mini mo-save" style="background:#FCE1EA;color:#A98D96;padding:10px 26px;font-size:16px;">保存订单</button>' +
      '<span class="hint" style="margin:0;">默认「待付款」，不会自动标成已付款；来源自动记为「后台手动创建」</span>' +
      '</div></div></details>' +
      '</div>';
    root.appendChild(mask);
    // ── 地址识别：粘贴 → 预览（⚠ 标出没把握的字段）→ 确认后才填入，绝不自动提交 ──
    var moFillAddr = function (a) {
      var q = function (c) { return mask.querySelector(c); };
      var set = function (c, v) { var el = q(c); if (el && v) el.value = v; };
      set('.mo-addr-name', a.name);
      set('.mo-addr-street', a.street);
      set('.mo-addr-city', a.city);
      set('.mo-addr-state', a.state);
      set('.mo-addr-zip', a.zip);
      set('.mo-addr-country', a.country);
      var bp = q('.mo-bphone'); if (bp && !bp.value && a.phone) bp.value = a.phone;
      var em = q('.mo-email'); if (em && !em.value && a.email) em.value = a.email;
      var bn = q('.mo-bname'); if (bn && !bn.value && a.name) bn.value = a.name;
    };
    var moOpenAddrPreview = function () {
      var box = mask.querySelector('.mo-addr-text');
      var raw = box ? box.value.trim() : '';
      if (!raw) { toast('先把买家发来的地址粘进框里'); return; }
      var a = parseAddressText(raw);
      var prev = document.createElement('div');
      prev.id = 'mo-addr-prev';
      prev.style.cssText = 'position:fixed;inset:0;background:rgba(90,80,90,.45);z-index:9999;overflow:auto;padding:40px 12px;';
      var fld = function (label, key, val) {
        var low = a.confirm && a.confirm[key] === false;
        return '<label style="display:block;margin-bottom:8px;">' +
          '<span style="display:block;font-size:13px;color:#A98D96;margin-bottom:4px;">' + label + (low ? ' <b style="color:#C4636E;font-weight:600;">⚠ 需确认</b>' : '') + '</span>' +
          '<input data-f="' + key + '" value="' + escAttr(val || '') + '" style="width:100%;box-sizing:border-box;padding:9px 11px;font-size:15px;font-family:inherit;border:1.5px solid ' + (low ? '#F5BFD1' : '#FCE1EA') + ';border-radius:10px;">' +
          '</label>';
      };
      prev.innerHTML = '<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:18px;padding:20px;box-shadow:0 10px 40px rgba(120,80,100,.25);">' +
        '<h3 style="margin:0 0 4px;font-size:18px;">地址识别结果</h3>' +
        '<p class="hint" style="margin:0 0 12px;">标 ⚠ 的是我没把握的；确认之前不会写进订单，也不会提交。</p>' +
        fld('收件人姓名', 'name', a.name) +
        fld('电话', 'phone', a.phone) +
        fld('国家', 'country', a.country) +
        fld('州 / 省', 'state', a.state) +
        fld('城市', 'city', a.city) +
        fld('邮编', 'zip', a.zip) +
        fld('详细地址', 'street', a.street) +
        '<div style="display:flex;gap:10px;margin-top:14px;">' +
        '<button type="button" class="btn-mini ap-ok" style="background:#FCE1EA;color:#A98D96;padding:9px 22px;">确认填入</button>' +
        '<button type="button" class="btn-mini ap-no" style="padding:9px 22px;">取消</button></div></div>';
      root.appendChild(prev);
      prev.addEventListener('click', function (ev) {
        if (ev.target === prev || ev.target.classList.contains('ap-no')) { prev.remove(); return; }
        if (ev.target.classList.contains('ap-ok')) {
          var o = {};
          Array.prototype.forEach.call(prev.querySelectorAll('input[data-f]'), function (inp) { o[inp.getAttribute('data-f')] = inp.value.trim(); });
          moFillAddr(o);
          prev.remove();
          var hint = mask.querySelector('.mo-addr-hint');
          if (hint) hint.textContent = '已按你确认的结果填入，可继续手改。';
          toast('地址已填入');
        }
      });
    };
    mask.addEventListener('click', function (e) {
      if (e.target.closest('.mo-addr-parse')) { moOpenAddrPreview(); }
    });
    // 收款安排（她 20261029：与 POS 同款全款/定金＋尾款/分次）
    var moRenderPlanInputs = function () {
      var onBtn = mask.querySelector('.mo-plan.on');
      var plan = onBtn ? onBtn.getAttribute('data-v') : 'full';
      var box = mask.querySelector('.mo-plan-inputs');
      if (!box) return;
      if (plan === 'deposit') {
        box.innerHTML = '<input class="mo-deposit" type="number" min="0" step="0.01" placeholder="定金 $（现在收）" style="width:150px;">' +
          '<input class="mo-final" type="number" min="0" step="0.01" placeholder="尾款 $（如当场收清，否则留空）" style="width:190px;">';
      } else if (plan === 'split') {
        box.innerHTML = '<input class="mo-paynow" type="number" min="0" step="0.01" placeholder="本次实收 $（选填）" style="width:150px;">';
      } else {
        box.innerHTML = '<span class="hint" style="margin:0;">保存即记全款（应收全额）</span>';
      }
    };
    Array.prototype.forEach.call(mask.querySelectorAll('.mo-plan'), function (b) {
      b.addEventListener('click', function () {
        Array.prototype.forEach.call(mask.querySelectorAll('.mo-plan'), function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        moRenderPlanInputs();
      });
    });
    moRenderPlanInputs();
    moRenderItems(); moCalc();
    mask.addEventListener('click', function (e) {
      if (e.target === mask) { mask.remove(); return; }
      if (e.target.classList.contains('mo-close')) { mask.remove(); return; }
      var card = mask.querySelector('#mo-form');
      if (e.target.classList.contains('mo-additem')) { MO_ITEMS.push({ pid: '', sku: '', qty: 1, price: '', custom: false, name: '' }); moRenderItems(); return; }
      var del = e.target.closest('.mo-del');
      if (del) { MO_ITEMS.splice(parseInt(del.getAttribute('data-i'), 10), 1); moRenderItems(); moCalc(); return; }
      var imgDel = e.target.closest('.mo-img-del');
      if (imgDel) { var di = parseInt(imgDel.getAttribute('data-i'), 10); if (MO_ITEMS[di]) { MO_ITEMS[di].imgUrl = ''; MO_ITEMS[di].imgPrev = ''; MO_ITEMS[di].imgFile = null; moRenderItems(); } return; }
      var pick = e.target.closest('.mo-pick');
      if (pick) {
        var i = parseInt(pick.getAttribute('data-i'), 10);
        if (!SM.products.length) { // 商品列表还没加载完就点选择 → 现拉，别让买家只能选自定义（她 2026-10-25）
          loadProducts().then(function () {
            if (!MO_ITEMS[i]) return;
            pickPop(pick, [{ v: '__custom__', label: '自定义商品' }].concat(SM.products.map(function (pp) {
              return { v: pp.id, label: (pp.name || '未命名') + ' · $' + fmtMoney(pp.price) };
            })), MO_ITEMS[i].pid || '', function (v) {
              applyMoPick(i, v); moRenderItems(); moCalc();
            });
          });
          return;
        }
        pickPop(pick, [{ v: '__custom__', label: '自定义商品' }].concat(SM.products.map(function (pp) {
          return { v: pp.id, label: (pp.name || '未命名') + ' · $' + fmtMoney(pp.price) };
        })), MO_ITEMS[i].pid || '', function (v) {
          applyMoPick(i, v); moRenderItems(); moCalc();
        });
        return;
      }
      var vp = e.target.closest('.mo-vpick');
      if (vp) {
        var j = parseInt(vp.getAttribute('data-i'), 10);
        var pj = byId(SM.products, MO_ITEMS[j].pid);
        if (!pj) return;
        pickPop(vp, [{ v: '', label: '无规格' }].concat(arr(pj.variants).map(function (vv) {
          return { v: vv.sku || '', label: (vv.name || vv.sku) + (vv.price != null ? ' · $' + fmtMoney(vv.price) : '') };
        })), MO_ITEMS[j].sku, function (v) {
          MO_ITEMS[j].sku = v;
          var vv = arr(pj.variants).filter(function (x) { return x.sku === v; })[0];
          if (vv && vv.price != null) MO_ITEMS[j].price = String(vv.price);
          moRenderItems(); moCalc();
        });
        return;
      }
      var stBtn = e.target.closest('.mo-status');
      if (stBtn) {
        var STS = [['pending', '待付款'], ['reviewing', '待审核'], ['paid', '已付款·待发货'], ['shipped', '已发货'], ['completed', '已完成']];
        pickPop(stBtn, STS.map(function (s) { return { v: s[0], label: s[1] }; }), stBtn.getAttribute('data-v'), function (v) {
          stBtn.setAttribute('data-v', v);
          stBtn.querySelector('.pick-btn-label').textContent = '状态：' + (STS.filter(function (s) { return s[0] === v; })[0] || ['', v])[1];
        });
        return;
      }
      var curBtn = e.target.closest('.mo-cur');
      if (curBtn) {
        pickPop(curBtn, [{ v: 'USD', label: 'USD $' }, { v: 'CNY', label: 'CNY ¥' }], curBtn.getAttribute('data-v'), function (v) {
          curBtn.setAttribute('data-v', v);
          curBtn.querySelector('.pick-btn-label').textContent = '货币：' + v;
        });
        return;
      }
    });
    mask.addEventListener('input', function (e) {
      var t = e.target;
      if (t.classList.contains('mo-qty') || t.classList.contains('mo-price')) {
        var it = MO_ITEMS[parseInt(t.getAttribute('data-i'), 10)];
        if (it) { if (t.classList.contains('mo-qty')) it.qty = t.value; else it.price = t.value; }
        moCalc();
      }
      if (t.classList.contains('mo-discount') || t.classList.contains('mo-ship') || t.classList.contains('mo-fee')) moCalc();
      if (t.classList.contains('mo-name')) { var it2 = MO_ITEMS[parseInt(t.getAttribute('data-i'), 10)]; if (it2) it2.name = t.value; }
    });
    mask.addEventListener('change', function (e) { // 自定义商品照片：选了就传 shop 桶（与规格图同款机制），可预览/替换/删除
      var tf = e.target;
      if (!tf.classList || !tf.classList.contains('mo-img')) return;
      var ii = parseInt(tf.getAttribute('data-i'), 10);
      var file = tf.files && tf.files[0];
      if (!file || !MO_ITEMS[ii]) return;
      if (file.size > 8 * 1024 * 1024) { toast('照片别超过 8MB'); tf.value = ''; return; }
      MO_ITEMS[ii].imgUp = true; moRenderItems();
      uploadShopFiles([file]).then(function (urls) {
        MO_ITEMS[ii].imgUrl = urls[0] || ''; MO_ITEMS[ii].imgPrev = ''; MO_ITEMS[ii].imgUp = false; moRenderItems();
      }).catch(function () { MO_ITEMS[ii].imgUp = false; moRenderItems(); toast('照片上传失败，重试一下'); });
    });
    mask.querySelector('.mo-save').addEventListener('click', function () {
      var btn = this;
      if (btn.disabled) return;
      var f = mask.querySelector('#mo-form');
      var addr = {
        name: f.querySelector('.mo-addr-name').value.trim(),
        street: f.querySelector('.mo-addr-street').value.trim(),
        city: f.querySelector('.mo-addr-city').value.trim(),
        state: f.querySelector('.mo-addr-state').value.trim(),
        zip: f.querySelector('.mo-addr-zip').value.trim(),
        country: f.querySelector('.mo-addr-country').value.trim() || 'United States'
      };
      if (!addr.name || !addr.street || !addr.city) { toast('收件人 / 街道 / 城市要填哦'); return; }
      var items = [];
      for (var k = 0; k < MO_ITEMS.length; k++) {
        var it = MO_ITEMS[k];
        var pp = it.pid ? byId(SM.products, it.pid) : null;
        var name = pp ? (pp.name || '') + (it.sku ? ' · ' + currentVariantName(pp, it.sku) : '') : (it.name || '').trim();
        var price = it.price === '' || it.price == null ? (pp ? num(pp.price) : NaN) : num(it.price);
        var qty = parseInt(it.qty, 10) || 0;
        if (!name) { toast('第 ' + (k + 1) + ' 行商品名没填'); return; }
        if (!(price >= 0) || qty < 1) { toast('第 ' + (k + 1) + ' 行数量/单价不合法'); return; }
        items.push({ id: it.pid || null, name: name, image: it.custom ? (it.imgUrl || '') : (pp ? (pp.image || pp.image_url || '') : ''), image_url: it.custom ? (it.imgUrl || '') : (pp ? (pp.image || pp.image_url || '') : ''), sku: it.sku || '', variant: it.sku || '', price: fmtMoney(price), qty: qty });
      }
      if (!items.length) { toast('至少要有一个商品'); return; }
      var c = moCalc();
      if (c.total < 0) { toast('总价不能是负数'); return; }
      if (c.disc < 0 || c.ship < 0 || c.fee < 0) { toast('折扣/运费/服务费不能填负数'); return; }
      // 收款安排校验（与 POS 同款：全款 / 定金＋尾款 / 分次付款）
      var planBtn0 = mask.querySelector('.mo-plan.on');
      var moPlan = planBtn0 ? planBtn0.getAttribute('data-v') : 'full';
      var moDep = num(f.querySelector('.mo-deposit') ? f.querySelector('.mo-deposit').value : 0);
      var moFin = num(f.querySelector('.mo-final') ? f.querySelector('.mo-final').value : 0);
      var moNow = num(f.querySelector('.mo-paynow') ? f.querySelector('.mo-paynow').value : 0);
      if (moPlan === 'deposit' && moDep + moFin > c.total + 0.005) { toast('定金＋尾款超过应收，请核对'); return; }
      if (moPlan === 'split' && moNow > c.total + 0.005) { toast('本次实收超过应收，请核对'); return; }
      var created = f.querySelector('.mo-time').value;
      var body = {
        order_no: '',
        email: f.querySelector('.mo-email').value.trim(),
        items: items,
        subtotal: fmtMoney(c.sub),
        discount: fmtMoney(c.disc),
        coupon_code: '',
        shipping_est: fmtMoney(c.ship),
        service_fee: fmtMoney(c.fee),
        total: fmtMoney(c.total),
        status: f.querySelector('.mo-status').getAttribute('data-v') || 'pending',
        address: addr,
        note: f.querySelector('.mo-note').value.trim(),
        admin_note: f.querySelector('.mo-adminnote').value.trim(),
        currency: f.querySelector('.mo-cur').getAttribute('data-v') || 'USD',
        order_source: 'admin'
      };
      var dt = created ? new Date(created) : null;
      if (dt && !isNaN(dt.getTime())) body.created_at = dt.toISOString();
      btn.disabled = true; btn.textContent = '保存中…';
      var submitOrder = function (attempt) {
        return api('shop_orders', { method: 'POST', body: JSON.stringify(body), headers: { 'Prefer': 'return=representation' } }).then(function (r) {
          if (r.ok) return r.json().then(function (d) { return { ok: true, row: (d || [])[0] }; });
          return r.json().catch(function () { return {}; }).then(function (d) {
            var msg = (d && (d.message || d.msg)) || '';
            if (attempt < 1 && /duplicate|unique|重复/.test(msg)) { // 编号撞车自动换号重试一次（并发兜底）
              return nextOrderNo().then(function (no) {
                if (no) { body.order_no = no; var noEl = f.querySelector('.mo-no'); if (noEl) noEl.value = no; }
                return submitOrder(attempt + 1);
              });
            }
            return { ok: false, msg: msg };
          });
        });
      };
      // 订单编号只在保存时申请（20261029 她反馈：开弹窗就预占号，不开单号码也一直变/被烧掉）
      nextOrderNo().then(function (no) {
        if (!no) throw new Error('拿不到订单编号');
        body.order_no = no;
        var noEl = f.querySelector('.mo-no'); if (noEl) noEl.value = no;
        return submitOrder(0);
      }).then(function (res) {
        btn.disabled = false; btn.textContent = '保存订单';
        if (!res || !res.ok) { toast('保存失败：' + ((res && res.msg) || '数据库拒绝，检查订单号是否重复')); return; }
        var newId = res.row && res.row.id;
        api('shop_order_logs', { method: 'POST', body: JSON.stringify({ order_id: newId || null, actor: 'admin', action: 'create', detail: '后台手动建单 ' + body.order_no }) }).catch(function () {});
        // 自定义商品带照片 → 自动进现有「已展示/已售出」区（她 20261029 任务书 §6：display_only+sold，不可购买，不进库存）
        MO_ITEMS.forEach(function (it) {
          if (!(it.custom && it.imgUrl)) return;
          api('products', { method: 'POST', body: JSON.stringify({
            name: (it.name || '').trim() || '自定义商品',
            price: it.price === '' || it.price == null ? '0' : String(num(it.price)),
            description: '', image_url: it.imgUrl, sold: true, display_only: true, stock: 0, cost: '0',
            currency: f.querySelector('.mo-cur').getAttribute('data-v') || 'USD'
          }) }).catch(function () {});
        });
        // 收款台账：全款/定金+尾款/分次（同 POS，落 shop_pay_record_add）
        var pays = [];
        if (moPlan === 'full') pays.push(['full', c.total]);
        else if (moPlan === 'deposit') { if (moDep > 0) pays.push(['deposit', moDep]); if (moFin > 0) pays.push(['final', moFin]); }
        else if (moPlan === 'split' && moNow > 0) pays.push(['installment', moNow]);
        var chain = Promise.resolve();
        pays.forEach(function (pr) {
          chain = chain.then(function () {
            return api('rpc/shop_pay_record_add', { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ p_order_id: newId, p_kind: pr[0], p_amount: pr[1], p_method: 'other', p_note: '手动创建订单' }) }).catch(function () {});
          });
        });
        chain.then(function () {
          toast('订单已保存：' + body.order_no + (pays.length ? '（已记收款）' : ''));
          mask.remove();
          loadOrders().then(renderOrders);
        });
      }).catch(function (e) { btn.disabled = false; btn.textContent = '保存订单'; toast('保存失败：' + (e && e.message ? e.message : '网络异常，重试一下')); });
    });
  }

  // ── 批量导出 CSV ──
  function csvCell(v) {
    var s = (v == null ? '' : String(v));
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function csvEscapeCh(v) { return v; }
  function fetchAllOrders() {
    var all = [];
    function page(offset) {
      return restGet('shop_orders?select=*&status=neq.deleted&order=created_at.desc&limit=1000&offset=' + offset)
        .then(function (rows) {
          all = all.concat(arr(rows));
          if (arr(rows).length === 1000) return page(offset + 1000);
          return all;
        });
    }
    return page(0);
  }
  function exportOrdersCSV(sel) {
    // sel: {mode:'all'|'selected'|'filtered', from, to, status, source}
    var btn = document.getElementById('sm-o-export');
    if (btn) { btn.disabled = true; btn.textContent = '导出中…'; }
    fetchAllOrders().then(function (all) {
      var rows = all;
      if (sel.mode === 'selected') rows = rows.filter(function (o) { return SM.osel[o.id]; });
      if (sel.mode === 'filtered') {
        var q = (document.getElementById('sm-o-search').value || '').toLowerCase();
        rows = rows.filter(function (o) {
          if (sel.status && o.status !== sel.status) return false;
          if (sel.source && (o.order_source || 'online') !== sel.source) return false;
          var d = (o.created_at || '').slice(0, 10);
          if (sel.from && d < sel.from) return false;
          if (sel.to && d > sel.to) return false;
          if (q) {
            var aq = o.address || {};
            var hay = [o.order_no, o.email, aq.name, aq.phone].map(function (x) { return String(x || '').toLowerCase(); });
            if (!hay.some(function (h) { return h.indexOf(q) !== -1; })) return false;
          }
          return true;
        });
      }
      if (!rows.length) {
        toast('没有符合条件的订单，没有导出文件');
        if (btn) { btn.disabled = false; btn.textContent = '导出 CSV'; }
        return;
      }
      var PAY = { pending: '待付款', reviewing: '待审核付款', rejected: '凭证有误', paid: '已付款', shipped: '已付款', completed: '已付款', cancelled: '已取消', refunding: '退款处理中', refunded: '已退款' };
      var head = ['Order ID', 'Order Number', 'Order Date', 'Order Status', 'Payment Status', 'Refund Amount', 'Refund Status', 'Received (Stripe+Manual)', 'Outstanding', 'Tax', 'Order Source', 'Currency', 'Subtotal', 'Discount', 'Shipping Fee', 'Service Fee', 'Total Amount', 'Admin Notes', 'Customer Notes', 'Customer ID', 'Customer Name', 'Email', 'Phone', 'Recipient Name', 'Shipping Address', 'City', 'State', 'ZIP Code', 'Country', 'Product ID', 'SKU', 'Product Name', 'Variant', 'Quantity', 'Unit Price', 'Line Total'];
      var lines = [head.map(csvCell).join(',')];
      rows.forEach(function (o) {
        var a = o.address || {};
        var pi = payInfo(o);
        var mn = payNet(o); // 人工收款台账（订金/尾款/分期/全款，她 2026-10-28 补充需求 5：导出含实收与待收）
        var paidAll = pi.paid + mn.paid, refAll = pi.refunded + mn.refunded;
        var outstanding = num(o.total) - paidAll + refAll;
        var refundAmt = refAll > 0 ? fmtMoney(refAll) : '';
        var refundSt = refAll <= 0 ? '' : (refAll >= num(o.total) - 0.005 ? '已全额退款' : '部分退款');
        var payL = payLabel(o);
        var base = [
          o.id, o.order_no, o.created_at, o.status, payL,
          refundAmt, refundSt,
          fmtMoney(paidAll) + (mn.paid > 0 ? '（含人工 ' + fmtMoney(mn.paid) + '）' : ''),
          fmtMoney(outstanding > 0.005 ? outstanding : 0),
          '', // 税费：系统不收税，留空（她 2026-10-25）
          SOURCE_LABEL[o.order_source || 'online'] || (o.order_source || 'online'),
          o.currency || 'USD', fmtMoney(o.subtotal), fmtMoney(o.discount),
          fmtMoney(o.shipping_actual != null && o.shipping_actual !== '' ? o.shipping_actual : o.shipping_est),
          fmtMoney(o.service_fee), fmtMoney(o.total), o.admin_note || '', o.note || '',
          o.user_id || '', a.name || '', o.email || '', a.phone || '', a.name || '',
          a.street || '', a.city || '', a.state || '', a.zip || '', a.country || ''
        ];
        var its = arr(o.items);
        if (!its.length) { lines.push(base.map(csvCell).join(',')); return; }
        its.forEach(function (it) {
          lines.push(base.concat([
            (it && it.id) || '', (it && it.sku) || '', (it && it.name) || '', (it && (it.variant || it.sku)) || '',
            (it && it.qty) || '', it ? fmtMoney(it.price) : '', it ? fmtMoney(num(it.price) * num(it.qty)) : ''
          ]).map(csvCell).join(','));
        });
      });
      var blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
      var a = document.createElement('a');
      var today = (new Date()).toISOString().slice(0, 10);
      a.href = URL.createObjectURL(blob);
      a.download = 'Snow Yuzu_Orders_' + today + '.csv';
      document.body.appendChild(a); a.click(); a.remove();
      var detailRows = lines.length - 1;
      toast('已导出 ' + rows.length + ' 笔订单（' + detailRows + ' 行明细）');
      if (btn) { btn.disabled = false; btn.textContent = '导出 CSV'; }
    }).catch(function () {
      toast('导出失败：读取订单数据出错，重试一下');
      if (btn) { btn.disabled = false; btn.textContent = '导出 CSV'; }
    });
  }
  function openExport() {
    var mask = document.createElement('div');
    mask.id = 'ex-mask';
    mask.style.cssText = 'position:fixed;inset:0;background:rgba(90,80,90,.45);z-index:9998;overflow:auto;padding:40px 10px;';
    mask.innerHTML =
      '<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:18px;padding:22px;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;"><h3 style="margin:0;font-size:19px;">批量导出订单</h3>' +
      '<button type="button" class="btn-mini ex-close">关闭</button></div>' +
      '<b style="font-size:15px;">范围</b>' +
      '<div style="display:flex;gap:8px;margin:6px 0 12px;flex-wrap:wrap;">' +
        '<button type="button" class="sel-btn ex-mode" data-v="all"><span class="pick-btn-label">全部订单</span></button>' +
        '<button type="button" class="sel-btn ex-mode" data-v="selected"><span class="pick-btn-label">勾选的订单（' + Object.keys(SM.osel).filter(function (k) { return SM.osel[k]; }).length + '）</span></button>' +
        '<button type="button" class="sel-btn ex-mode" data-v="filtered"><span class="pick-btn-label">按筛选</span></button>' +
      '</div>' +
      '<div class="ex-filters" style="display:none;">' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">' +
          '<input class="ex-from" placeholder="开始日期 YYYY-MM-DD">' +
          '<input class="ex-to" placeholder="结束日期 YYYY-MM-DD">' +
          '<button type="button" class="sel-btn ex-status" data-v=""><span class="pick-btn-label">状态：全部</span></button>' +
          '<button type="button" class="sel-btn ex-source" data-v=""><span class="pick-btn-label">来源：全部</span></button>' +
        '</div>' +
        '<p class="hint" style="margin:0 0 8px;">也会套用当前订单搜索关键字；跨页导出会包含所有符合条件的记录</p>' +
      '</div>' +
      '<p class="hint">CSV 为 UTF-8（带 BOM），Excel 可直接打开；每个商品一行，订单信息重复以便筛选</p>' +
      '<button type="button" class="btn-mini ex-go" style="background:#FCE1EA;color:#A98D96;padding:10px 26px;font-size:16px;">导出</button>' +
      '</div>';
    root.appendChild(mask);
    var mode = 'all';
    mask.addEventListener('click', function (e) {
      if (e.target === mask || e.target.classList.contains('ex-close')) { mask.remove(); return; }
      var m = e.target.closest('.ex-mode');
      if (m) {
        mode = m.getAttribute('data-v');
        mask.querySelectorAll('.ex-mode').forEach(function (b) { b.style.background = b === m ? '#FCE1EA' : ''; b.style.color = b === m ? '#A98D96' : ''; }); /* 选中态：粉胶囊深玫瑰字（白字不配浅底，她 20261029 §4） */
        mask.querySelector('.ex-filters').style.display = mode === 'filtered' ? '' : 'none';
        return;
      }
      var stb = e.target.closest('.ex-status');
      if (stb) {
        pickPop(stb, [['', '全部']].concat(O_CHIPS.slice(1)).map(function (s) { return { v: s[0], label: s[1] }; }), stb.getAttribute('data-v'), function (v) {
          stb.setAttribute('data-v', v);
          stb.querySelector('.pick-btn-label').textContent = '状态：' + (v === '' ? '全部' : v);
        });
        return;
      }
      var srb = e.target.closest('.ex-source');
      if (srb) {
        pickPop(srb, [{ v: '', label: '全部' }, { v: 'online', label: '线上下单' }, { v: 'admin', label: '后台手动创建' }], srb.getAttribute('data-v'), function (v) {
          srb.setAttribute('data-v', v);
          srb.querySelector('.pick-btn-label').textContent = '来源：' + (v === '' ? '全部' : SOURCE_LABEL[v]);
        });
        return;
      }
      if (e.target.classList.contains('ex-go')) {
        var sel = { mode: mode, from: (mask.querySelector('.ex-from').value || '').trim(), to: (mask.querySelector('.ex-to').value || '').trim(), status: mask.querySelector('.ex-status').getAttribute('data-v') || '', source: mask.querySelector('.ex-source').getAttribute('data-v') || '' };
        if (mode === 'selected' && !Object.keys(SM.osel).some(function (k) { return SM.osel[k]; })) { toast('先在订单列表里勾选要导出的订单'); return; }
        mask.remove();
        exportOrdersCSV(sel);
      }
    });
  }

  // ── 政策内容后台编辑（存 site_settings，policy_<key>_<lang>）──
  var POLICY_KEYS = [['faq', '常见问题 FAQ', '/faq/'], ['return', '退货与退款政策', '/return-policy/'], ['shipping', '配送政策', '/shipping-policy/'], ['privacy', '隐私政策', '/privacy-policy/'], ['terms', '服务条款', '/terms-of-service/']];
  function policyEditorHtml() {
    return '<div class="card" id="sm-policy-editor" style="margin-top:14px;">' +
      '<h3 style="margin:0 0 8px;font-size:17px;">政策页面内容（中 / 英）</h3>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:8px;">' +
        '<button type="button" class="sel-btn po-page" data-v=""><span class="pick-btn-label">选择页面</span></button>' +
        '<a class="btn-mini po-preview" href="/faq/" target="_blank" style="text-decoration:none;display:none;">预览</a>' +
      '</div>' +
      '<textarea class="po-zh" placeholder="简体中文内容（留空 = 使用内置默认；支持 <p> <ul> <li> <a> <strong> <br>）" style="width:100%;min-height:140px;box-sizing:border-box;"></textarea>' +
      '<textarea class="po-en" placeholder="English content (leave empty = built-in default)" style="width:100%;min-height:140px;box-sizing:border-box;margin-top:8px;"></textarea>' +
      '<div style="display:flex;gap:8px;margin-top:8px;align-items:center;">' +
        '<button type="button" class="btn-mini po-save" style="background:#FCE1EA;color:#A98D96;">保存并发布</button>' +
        '<button type="button" class="btn-mini po-reset">恢复内置默认</button>' +
        '<span class="hint">保存后前台立即生效；「联系我们」页面就是留言板，不需要在这里编辑</span>' +
      '</div></div>';
  }
  var PO_STATE = { key: '' };
  function poLoad() {
    if (!PO_STATE.key) return;
    restGet('site_settings?select=key,value&key=in.(policy_' + PO_STATE.key + '_zh,policy_' + PO_STATE.key + '_en)')
      .then(function (rows) {
        var zh = '', en = '';
        arr(rows).forEach(function (r) { if (r.key === 'policy_' + PO_STATE.key + '_zh') zh = r.value || ''; if (r.key === 'policy_' + PO_STATE.key + '_en') en = r.value || ''; });
        var box = document.getElementById('sm-policy-editor');
        if (!box) return;
        box.querySelector('.po-zh').value = zh;
        box.querySelector('.po-en').value = en;
        box.querySelector('.po-zh').placeholder = zh ? '' : '简体中文内容（留空 = 使用内置默认；支持 <p> <ul> <li> <a> <strong> <br>）';
      });
  }
  function bindPolicyEditor() {
    var box = document.getElementById('sm-policy-editor');
    if (!box) return;
    box.querySelector('.po-page').addEventListener('click', function () {
      pickPop(this, POLICY_KEYS.map(function (k) { return { v: k[0], label: k[1] }; }), PO_STATE.key, function (v) {
        PO_STATE.key = v;
        var meta = POLICY_KEYS.filter(function (k) { return k[0] === v; })[0] || ['', '', '#'];
        box.querySelector('.po-page .pick-btn-label').textContent = meta[1];
        var prev = box.querySelector('.po-preview');
        prev.href = meta[2]; prev.style.display = '';
        poLoad();
      });
    });
    box.querySelector('.po-save').addEventListener('click', function () {
      if (!PO_STATE.key) { toast('先选一个页面'); return; }
      var zh = box.querySelector('.po-zh').value;
      var en = box.querySelector('.po-en').value;
      var payload = [
        { key: 'policy_' + PO_STATE.key + '_zh', value: zh },
        { key: 'policy_' + PO_STATE.key + '_en', value: en }
      ];
      api('site_settings', { method: 'POST', headers: { 'Prefer': 'resolution=merge-duplicates' }, body: JSON.stringify(payload) }).then(function (r) {
        toast(r.ok ? '已保存并发布（前台刷新即生效）' : '保存失败：数据库拒绝');
      });
    });
    box.querySelector('.po-reset').addEventListener('click', function () {
      if (!PO_STATE.key) { toast('先选一个页面'); return; }
      api('site_settings?key=in.(policy_' + PO_STATE.key + '_zh,policy_' + PO_STATE.key + '_en)', { method: 'DELETE' }).then(function (r) {
        toast(r.ok ? '已恢复内置默认内容' : '操作失败');
        if (r.ok) { box.querySelector('.po-zh').value = ''; box.querySelector('.po-en').value = ''; }
      });
    });
  }

  // ── 绑定入口 ──
  document.getElementById('sm-o-new').addEventListener('click', openManualOrder);
  /* 她 20261030 §3：导出/打印直接调 EXPORT 的同一套逻辑；旧的单页 CSV 逻辑保留但不再单独入口 */
  document.getElementById('sm-o-export').addEventListener('click', function () {
    var rows = filteredOrders();
    if (!rows.length) { toast('当前筛选下没有订单'); return; }
    if (window.EXPORT && window.EXPORT.quickExport) window.EXPORT.quickExport(rows, 'xls');
    else exportOrdersCSV(rows); // 旧版兜底（EXPORT 未加载时）
  });
  document.getElementById('sm-o-export-sel').addEventListener('click', function () {
    var rows = SM.orders.filter(function (o) { return SM.osel[o.id]; });
    if (!rows.length) { toast('先在左边勾选要导出的订单'); return; }
    if (window.EXPORT && window.EXPORT.quickExport) window.EXPORT.quickExport(rows, 'xls');
    else exportOrdersCSV(rows);
  });
  document.getElementById('sm-o-print').addEventListener('click', function () {
    var selRows = SM.orders.filter(function (o) { return SM.osel[o.id]; });
    var rows = selRows.length ? selRows : filteredOrders();
    if (!rows.length) { toast('没有可打印的订单'); return; }
    if (window.EXPORT && window.EXPORT.quickPrint) window.EXPORT.quickPrint(rows);
    else toast('打印模块未加载，刷新一下再试');
  });
  /* 她 20261031 §二：批量归档 */
  (function () {
    var bs = document.getElementById('sm-o-arch-sel');
    if (bs) bs.addEventListener('click', function () {
      var rows = selOrders();
      if (!rows.length) { toast('先在左边勾选要归档的订单'); return; }
      archiveList(rows);
    });
  })();
  // 设置页追加政策编辑器
  var secSettings = document.getElementById('sm-sec-settings');
  if (secSettings) {
    secSettings.insertAdjacentHTML('beforeend', policyEditorHtml());
    bindPolicyEditor();
  }

  /* ── 暴露给测试：注入假数组后直接调渲染函数 ── */
  /* ═══ 订单四模块 + 收件人表单样式（她 20261030 §6/§8）：只加样式，不改动原有尺寸与布局 ═══ */
  (function () {
    if (document.getElementById('sm-sec-style')) return;
    var st = document.createElement('style');
    st.id = 'sm-sec-style';
    st.textContent = [
      '.sm-o-body .sm-sec{border:1.5px solid #FFE3EC;border-radius:14px;margin:10px 0;background:#fff;overflow:hidden;}',
      '.sm-o-body .sm-sec>summary{cursor:pointer;list-style:none;padding:10px 14px;font-weight:600;font-size:15px;background:#FFF7FA;color:#55464E;display:flex;align-items:center;gap:8px;}',
      '.sm-o-body .sm-sec>summary::-webkit-details-marker{display:none;}',
      '.sm-o-body .sm-sec>summary::after{content:"▾";margin-left:auto;color:#81717A;font-size:12px;transition:transform .2s;}',
      '.sm-o-body .sm-sec[open]>summary::after{transform:rotate(180deg);}',
      '.sm-sec-step{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:#FCE1EA;color:#A98D96;font-size:12px;flex-shrink:0;}',
      '.sm-sec-tip{font-size:12px;font-weight:400;color:#81717A;}',
      '.sm-sec-body{padding:12px 14px;}',
      '.sm-a-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px 14px;margin:8px 0 12px;}',
      '.sm-a-f{display:flex;flex-direction:column;gap:4px;font-size:13px;color:#81717A;}',
      '.sm-a-in{border:1.5px solid #FFD9E6;border-radius:10px;padding:8px 10px;font-size:15px;font-family:inherit;background:#fff;color:#55464E;}',
      '.sm-a-in:focus{outline:none;border-color:#F5BFD1;}',
      '.sm-a-paste-wrap{border-top:1px dashed #FFE3EC;padding-top:10px;margin-top:4px;}',
      '.sm-a-paste-h{font-size:13px;color:#81717A;margin-bottom:6px;}',
      '.sm-a-paste{width:100%;min-height:62px;border:1.5px solid #FFD9E6;border-radius:10px;padding:9px 11px;font-size:14px;font-family:inherit;box-sizing:border-box;resize:vertical;}',
      '@media (max-width:700px){.sm-a-grid{grid-template-columns:1fr;}.sm-sec-body{padding:10px;}}'
    ].join('');
    document.head.appendChild(st);
  })();

  /* ═══ 她 20261031 §四：真实付款进度条样式（粉色填充 + 浅灰粉槽）═══ */
  (function () {
    if (document.getElementById('sm-paybar-style')) return;
    var st = document.createElement('style');
    st.id = 'sm-paybar-style';
    st.textContent = [
      '.sm-paybar{margin:6px 0 10px;padding:10px 12px;background:#FFF7FA;border:1px solid #FFE9F1;border-radius:12px;}',
      '.sm-paybar-top{display:flex;align-items:center;gap:8px;font-size:14px;color:#55464E;}',
      '.sm-pb-state{font-size:12px;padding:2px 10px;border-radius:999px;background:#FCE1EA;color:#A98D96;font-weight:600;}',
      '.sm-pb-state.ok{background:#FCE1EA;color:#A98D96;}',
      '.sm-pb-state.warn{background:#FBE3E6;color:#C4636E;}',
      '.sm-pb-line{display:grid;grid-template-columns:52px 134px minmax(60px,1fr) 108px;gap:8px;align-items:center;margin-top:7px;font-size:13px;color:#62545B;}',
      '.sm-pb-k{font-weight:600;color:#55464E;}',
      '.sm-pb-v{white-space:nowrap;color:#81717A;font-variant-numeric:tabular-nums;}',
      '.sm-pb-slot{display:block;height:10px;border-radius:999px;background:#F4E9EE;overflow:hidden;}',
      '.sm-pb-slot i{display:block;height:100%;border-radius:999px;background:#F2A9C4;transition:width .35s ease;}',
      '.sm-pb-t{text-align:right;white-space:nowrap;color:#81717A;}',
      '.sm-pb-sum{margin-top:9px;font-size:13px;color:#81717A;}',
      '.sm-pb-sum b{color:#55464E;}',
      '.sm-pb-extra{color:#C4636E;}',
      '.sm-pb-tip{margin-top:6px;font-size:12px;color:#81717A;}',
      '.sm-pb-tip.bad{color:#C4636E;}',
      '.sm-o-acts{display:inline-flex;gap:6px;flex-shrink:0;margin-left:auto;}',
      '.sm-o-head .sm-o-acts + .sm-o-arrow{margin-left:8px;}',
      '#tab-shopmgr .sm-o-head .sm-o-acts + .sm-o-arrow{margin-left:8px;}',
      '.sm-o-acts .btn-mini{padding:4px 12px;font-size:13px;white-space:nowrap;}',
      '@media (max-width:760px){',
      '  .sm-paybar{padding:9px 10px;}',
      '  .sm-pb-line{grid-template-columns:42px minmax(0,1fr);row-gap:5px;}',
      '  .sm-pb-slot{grid-column:1 / -1;}',
      '  .sm-pb-t{grid-column:1 / -1;text-align:left;}',
      '  .sm-o-acts{margin-left:auto;}',
      '}'
    ].join('');
    document.head.appendChild(st);
  })();

  window.ShopAdmin = {
    sm: SM,
    loadAll: loadAll,
    loadOrders: loadOrders,
    loadGroups: loadGroups,
    loadCoupons: loadCoupons,
    loadProfiles: loadProfiles,
    loadMsgs: loadMsgs,
    loadProducts: loadProducts,
    loadShip: loadShip,
    renderStats: renderStats,
    renderOrders: renderOrders,
    payPlan: payPlan,
    pay2Html: pay2Html,
    payStat: payStat,
    progressHtml: progressHtml,
    archiveList: archiveList,
    restoreOne: restoreOne,
    deleteOrder: deleteOrder,
    refreshArchBtn: refreshArchBtn,
    renderGroups: renderGroups,
    renderCoupons: renderCoupons,
    renderAftersale: renderAftersale,
    renderBuyers: renderBuyers,
    renderSettings: renderSettings
  };
})();

  /* 她 20261030 §13：移动端 SKU 编辑页专用的底部固定「返回 / 保存」栏。
     只在手机宽度、并且真的在编规格时出现；桌面端一律不出现，也不扩展到其他后台页面。 */
  (function () {
    function isPhone() { return window.matchMedia('(max-width: 760px)').matches; }
    function bar() { return document.getElementById('sm-phone-bar'); }
    var target = null;
    function show(on, tgt) {
      var b = bar(); if (!b) return;
      if (!on || !isPhone()) { b.style.display = 'none'; target = null; return; }
      target = tgt || null;
      b.style.display = 'flex';
    }
    function boot() {
      if (bar()) return;
      var b = document.createElement('div');
      b.id = 'sm-phone-bar';
      b.innerHTML = '<button type="button" class="sm-pb-back">返回</button><button type="button" class="sm-pb-save">保存</button>';
      document.body.appendChild(b);
      b.querySelector('.sm-pb-back').addEventListener('click', function () {
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        show(false);
        var blk = target && target.querySelector('.sm-var-block');
        if (blk && blk.scrollIntoView) blk.scrollIntoView({ block: 'start', behavior: 'smooth' });
      });
      b.querySelector('.sm-pb-save').addEventListener('click', function () {
        var btn = null;
        if (target && target.id === 'newprod-wrap') btn = document.getElementById('btn-add-product');
        if (target && !btn) btn = target.querySelector('.btn-save-edit');
        if (btn) { btn.click(); show(false); }
        else if (typeof toast === 'function') toast('没找到保存按钮，往上滑看一下');
      });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
    // 进入规格编辑（点＋添加规格，或聚焦规格输入框）时才出现
    document.addEventListener('focusin', function (e) {
      if (!isPhone()) return;
      var blk = e.target.closest && e.target.closest('.sm-var-block');
      if (!blk || !document.getElementById('tab-shop')) return;
      var stub = document.getElementById('tab-shop');
      if (!stub || stub.style.display === 'none') return;
      show(true, blk.closest('#newprod-wrap') || blk.closest('.card'));
    });
    document.addEventListener('click', function (e) {
      if (!isPhone()) return;
      if (e.target.closest && e.target.closest('.sm-var-add')) {
        var blk = e.target.closest('.sm-var-block');
        if (blk) show(true, blk.closest('#newprod-wrap') || blk.closest('.card'));
      }
    });
    window.addEventListener('resize', function () { if (!isPhone()) show(false); });
  })();
