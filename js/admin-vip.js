/* ══════════════════════════════════════════════════════════════════
   admin-vip.js —— VIP 客户查询（她 20261027 任务书，新增独立页签）
   只新增，不改任何现有页面/样式/数据。复用 admin.html 全局：api/esc/escAttr/toast/fmtMoney/t/switchTab
   数据：shop_customers（VIP 真实标记）+ shop_orders（customer_id 优先、email 谨慎关联，不自动建客户、不合并档案）
   KPI 口径（与订单管理 payInfo 同源）：实付=shop_payments(paid) 汇总，缺流水的已付订单以 total 计；
   退款=shop_payments(refunded) 汇总（无流水记录的退款单如实标注「全额退款·无金额记录」）；
   pending/cancelled 不计实付；TEST- 前缀排除；币种分别统计不相加。
   备注：复用 shop_customers.note + shop_customer_save（全参数回传，只改 note，不覆盖其它字段）
   ══════════════════════════════════════════════════════════════════ */
(function () {
  var SUPA = (window.SUPABASE_URL || (window.SUPABASE_URL = 'https://vmmmuyxrsiufzurwbydg.supabase.co'));
  function t(zh, en) { return (window.LANG === 'en') ? en : zh; }
  function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }
  function money(v, cur) { return (cur || '$') + fmtMoney(v); }
  var PAID_STATES = ['paid', 'shipped', 'completed', 'refunding', 'refunded'];
  var VIP = { customers: [], payments: [], cur: null };

  window.bootVip = function () {
    var panel = document.getElementById('tab-vip');
    if (panel.dataset.booted) return;
    panel.dataset.booted = '1';
    panel.innerHTML =
      '<div class="card" style="padding:16px 20px;margin-bottom:14px;">' +
        '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">' +
          '<input id="vip-q" placeholder="' + t('客户姓名 / 电话 / Email', 'Name / phone / email') + '" style="flex:1;min-width:220px;padding:10px 16px;font-size:15px;border:1.5px solid var(--accent-soft,#FCE4EC);border-radius:12px;outline:none;font-family:inherit;color:var(--text,#604C57);background:#fff;box-sizing:border-box;">' +
          '<button class="btn-save-tb" id="vip-go">' + t('搜索', 'Search') + '</button>' +
          '<button class="btn-mini" id="vip-clear">' + t('清空', 'Clear') + '</button>' +
        '</div>' +
        '<p style="font-size:13px;color:var(--muted,#A88E9B);margin:10px 0 0;">' + t('支持部分姓名、电话（自动忽略空格/横线/区号差异）、Email（不区分大小写）；可只填一项。', 'Partial name, phone (ignores spaces/dashes/country code), email (case-insensitive).') + '</p>' +
      '</div>' +
      '<div id="vip-results"></div>' +
      '<div id="vip-detail"></div>';
    var q = panel.querySelector('#vip-q');
    panel.querySelector('#vip-go').addEventListener('click', function () { doSearch(q.value.trim()); });
    panel.querySelector('#vip-clear').addEventListener('click', function () { q.value = ''; q.focus(); });
    q.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); doSearch(q.value.trim()); } });
  };

  function phoneNorm(s) {
    var d = String(s || '').replace(/\D/g, '');
    if (d.length > 10 && d.charAt(0) === '1') d = d.slice(1); // 兼容 +1 国家区号
    return d;
  }
  function doSearch(qs) {
    var box = document.getElementById('vip-results');
    var detail = document.getElementById('vip-detail');
    detail.innerHTML = ''; VIP.cur = null;
    if (!qs) { box.innerHTML = '<p style="color:var(--muted,#A88E9B);text-align:center;padding:18px 0;">' + t('输入姓名、电话或 Email 开始搜索', 'Type a name, phone or email to search') + '</p>'; return; }
    box.innerHTML = '<p style="color:var(--muted,#A88E9B);text-align:center;padding:18px 0;">' + t('搜索中…', 'Searching…') + '</p>';
    api('shop_customers?select=*&order=created_at.desc&limit=500').then(function (r) { return r.json(); }).then(function (rows) {
      VIP.customers = rows || [];
      var q = qs.toLowerCase();
      var qph = phoneNorm(qs);
      var hits = VIP.customers.filter(function (c) {
        if (c.name && String(c.name).toLowerCase().indexOf(q) >= 0) return true;
        if (c.email && String(c.email).toLowerCase().indexOf(q) >= 0) return true;
        if (qph.length >= 4 && c.phone && phoneNorm(c.phone).indexOf(qph) >= 0) return true;
        if (qph.length >= 4 && qph.length <= 7 && phoneNorm(c.phone).slice(-qph.length) === qph) return true;
        return false;
      });
      if (!hits.length) { box.innerHTML = '<div class="card" style="padding:20px;text-align:center;color:var(--muted,#A88E9B);font-size:15px;">' + t('没有找到匹配的客户。换个名字、电话或 Email 试试？', 'No matching customer. Try another name, phone or email?') + '</div>'; return; }
      box.innerHTML = '<div class="card" style="padding:8px 10px;margin-bottom:14px;">' + hits.map(function (c, i) {
        return '<div class="vip-hit" data-i="' + VIP.customers.indexOf(c) + '" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;padding:10px 12px;border-radius:10px;cursor:pointer;' + (i ? 'border-top:1px solid var(--card-hover,#F6E7EE);' : '') + '">' +
          '<b style="font-size:16px;color:var(--text,#604C57);">' + esc(c.name || t('未命名', 'Unnamed')) + '</b>' +
          (c.vip ? '<span class="chip on">VIP</span>' : '<span class="chip">' + t('普通客户', 'Regular') + '</span>') +
          '<span style="font-size:14px;color:var(--muted,#A88E9B);">' + esc(c.email || '') + (c.phone ? ' · ' + esc(c.phone) : '') + '</span>' +
          '<span style="font-size:13px;color:var(--muted,#A88E9B);margin-left:auto;">' + esc(c.c_no || '') + '</span>' +
        '</div>';
      }).join('') + '</div>';
      Array.prototype.forEach.call(box.querySelectorAll('.vip-hit'), function (el) {
        el.addEventListener('click', function () { showDetail(VIP.customers[Number(el.dataset.i)]); });
      });
      if (hits.length === 1) showDetail(hits[0]);
    }).catch(function () { box.innerHTML = '<p style="color:var(--danger,#D96570);text-align:center;">' + t('加载失败，请重试', 'Load failed — retry') + '</p>'; });
  }

  function showDetail(c) {
    VIP.cur = c;
    var detail = document.getElementById('vip-detail');
    detail.innerHTML = '<p style="color:var(--muted,#A88E9B);text-align:center;padding:18px 0;">' + t('加载客户数据…', 'Loading customer…') + '</p>';
    // 订单关联：customer_id 优先，email 兜底（只展示，不建客户不合并）
    var byId = api('shop_orders?select=*&customer_id=eq.' + c.id + '&order=created_at.desc&limit=100');
    var byMail = c.email ? api('shop_orders?select=*&email=eq.' + encodeURIComponent(c.email) + '&order=created_at.desc&limit=100') : Promise.resolve({ json: function () { return Promise.resolve([]); } });
    api('shop_payments?select=order_id,status,amount&order=created_at.desc&limit=1000').then(function (r) { return r.json(); }).catch(function () { return []; }).then(function (pays) {
      VIP.payments = pays || [];
      Promise.all([byId.then(function (r) { return r.json(); }), byMail.then(function (r) { return r.json(); })]).then(function (res) {
        var seen = {}, orders = [];
        (res[0] || []).forEach(function (o) { if (!seen[o.id]) { seen[o.id] = 1; o.__via = 'id'; orders.push(o); } });
        (res[1] || []).forEach(function (o) { if (!seen[o.id]) { seen[o.id] = 1; o.__via = 'email'; orders.push(o); } });
        orders.sort(function (a, b) { return String(b.created_at).localeCompare(String(a.created_at)); });
        renderDetail(c, orders);
      });
    });
  }

  function payOf(o) {
    var ps = VIP.payments.filter(function (x) { return String(x.order_id) === String(o.id); });
    return {
      paid: ps.filter(function (x) { return x.status === 'paid'; }).reduce(function (t2, x) { return t2 + num(x.amount); }, 0),
      refunded: ps.filter(function (x) { return x.status === 'refunded'; }).reduce(function (t2, x) { return t2 + num(x.amount); }, 0),
    };
  }
  function isTest(o) { return /^TEST-/.test(o.order_no || ''); }
  function counted(o) { return !isTest(o) && PAID_STATES.indexOf(o.status) !== -1; }

  function renderDetail(c, orders) {
    var detail = document.getElementById('vip-detail');
    var real = orders.filter(function (o) { return !isTest(o); });
    // KPI：币种分组
    var kpis = {};
    real.forEach(function (o) {
      var cur = o.currency || 'USD';
      if (!kpis[cur]) kpis[cur] = { n: 0, paid: 0, refunded: 0, net: 0, last: null };
      var k = kpis[cur];
      var pi = payOf(o);
      if (counted(o)) {
        k.n++;
        var paidAmt = pi.paid > 0 ? pi.paid : (num(o.pay_amount) > 0 ? num(o.pay_amount) : num(o.total));
        var refAmt = pi.refunded;
        k.paid += paidAmt; k.refunded += refAmt; k.net += paidAmt - refAmt;
        if (!k.last || String(o.created_at) > String(k.last.created_at)) k.last = o;
      }
    });
    var vipBadge = c.vip ? '<span class="chip on">VIP</span>' : '<span class="chip">' + t('普通客户', 'Regular') + '</span>';
    var lastOrderAll = orders[0];
    var lastTxt = lastOrderAll ? esc(String(lastOrderAll.created_at).slice(0, 10)) : t('暂无订单', 'No orders yet');

    var kpiHtml = '';
    var curs = Object.keys(kpis);
    if (!curs.length) kpiHtml = '<p style="font-size:14px;color:var(--muted,#A88E9B);margin:0;">' + t('暂无已支付订单（测试订单已排除）', 'No paid orders yet (test orders excluded)') + '</p>';
    curs.forEach(function (cur) {
      var k = kpis[cur];
      kpiHtml +=
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;width:100%;">' +
          kpiCell(t('历史订单数', 'Orders'), k.n, '') +
          kpiCell(t('累计实付', 'Total paid'), money(k.paid), cur) +
          kpiCell(t('累计退款', 'Refunded'), money(k.refunded), cur) +
          kpiCell(t('累计净消费', 'Net spend'), money(k.net), cur) +
          kpiCell(t('平均订单金额', 'Avg order'), k.n ? money(k.net / k.n) : '—', cur) +
          kpiCell(t('最近订单', 'Last order'), k.last ? esc(String(k.last.created_at).slice(0, 10)) : '—', k.last ? money(num(k.last.total)) : '') +
        '</div>' +
        (pi_note(k) ? '<p style="font-size:12px;color:var(--muted,#A88E9B);margin:8px 0 0;">' + pi_note(k) + '</p>' : '');
    });
    function pi_note(k) { return ''; }
    function kpiCell(label, val, sub) {
      return '<div style="background:var(--bg,#FFFBFC);border:1px solid var(--border,#FFD9E6);border-radius:12px;padding:10px 14px;">' +
        '<div style="font-size:13px;color:var(--muted,#A88E9B);">' + label + (sub && !/^\d/.test(String(val)) && sub.length <= 3 ? '（' + sub + '）' : '') + '</div>' +
        '<div style="font-size:19px;font-weight:700;color:var(--text,#604C57);margin-top:2px;font-variant-numeric:tabular-nums;">' + val + '</div>' +
      '</div>';
    }

    // 订单列表 + 筛选
    var VIPST = { fStatus: 'all', fDays: 'all' };
    function orderRows() {
      var list = orders.filter(function (o) {
        if (VIPST.fStatus !== 'all') {
          if (VIPST.fStatus === 'refund' && ['refunding', 'refunded'].indexOf(o.status) < 0) return false;
          if (VIPST.fStatus !== 'refund' && o.status !== VIPST.fStatus) return false;
        }
        if (VIPST.fDays !== 'all') {
          var d = new Date(o.created_at).getTime();
          if (Date.now() - d > Number(VIPST.fDays) * 86400000) return false;
        }
        return true;
      });
      if (!list.length) return '<p style="font-size:14px;color:var(--muted,#A88E9B);text-align:center;padding:14px 0;">' + t('没有符合筛选的订单', 'No orders match the filter') + '</p>';
      return list.map(function (o) {
        var pi = payOf(o);
        var items = [];
        try { items = typeof o.items === 'string' ? JSON.parse(o.items) : (o.items || []); } catch (e) { items = []; }
        var itemTxt = (Array.isArray(items) ? items : []).map(function (it) { return (it.name || it.title || '?') + ' ×' + (it.qty || it.quantity || 1); }).join('、') || '—';
        var stBadge = {
          pending: [t('待付款', 'Pending'), '#A88E9B'], reviewing: [t('待审核', 'Reviewing'), '#E0A458'],
          paid: [t('已付款', 'Paid'), 'var(--success,#5FA777)'], shipped: [t('已发货', 'Shipped'), 'var(--success,#5FA777)'],
          completed: [t('已完成', 'Completed'), 'var(--success,#5FA777)'], refunding: [t('退款中', 'Refunding'), '#E0A458'],
          refunded: [t('已退款', 'Refunded'), '#c4bcb6'], cancelled: [t('已取消', 'Cancelled'), '#c4bcb6'],
        }[o.status] || [o.status, '#A88E9B'];
        var refTxt = pi.refunded > 0 ? money(pi.refunded, '$') : (o.status === 'refunded' ? t('全额·金额未记录', 'Full (amount unrecorded)') : '—');
        return '<tr>' +
          '<td style="padding:8px 10px;"><a href="javascript:void(0)" class="vip-o" data-no="' + escAttr(o.order_no || '') + '" style="color:var(--accent-strong,#A04A68);text-decoration:underline;font-weight:600;white-space:nowrap;">' + esc(o.order_no || '') + '</a>' + (isTest(o) ? ' <span class="chip" style="font-size:11px;padding:1px 8px;">TEST</span>' : '') + '</td>' +
          '<td style="padding:8px 10px;white-space:nowrap;">' + esc(String(o.created_at).slice(0, 10)) + '</td>' +
          '<td style="padding:8px 10px;min-width:160px;">' + esc(itemTxt) + '</td>' +
          '<td style="padding:8px 10px;text-align:right;white-space:nowrap;">' + money(num(o.subtotal), '$') + '</td>' +
          '<td style="padding:8px 10px;text-align:right;white-space:nowrap;">' + (num(o.discount) ? '−' + money(num(o.discount), '$') : '—') + '</td>' +
          '<td style="padding:8px 10px;text-align:right;white-space:nowrap;">' + (num(o.shipping_actual) != null && num(o.shipping_actual) !== 0 ? money(num(o.shipping_actual), '$') : '—') + '</td>' +
          '<td style="padding:8px 10px;text-align:right;white-space:nowrap;font-weight:600;">' + money(num(o.total), '$') + '</td>' +
          '<td style="padding:8px 10px;text-align:right;white-space:nowrap;color:var(--price,#FF6FA5);">' + refTxt + '</td>' +
          '<td style="padding:8px 10px;white-space:nowrap;"><span class="chip" style="color:' + stBadge[1] + ';border-color:' + stBadge[1] + ';">' + stBadge[0] + '</span>' + (o.__via === 'email' ? ' <span class="chip" style="font-size:11px;padding:1px 8px;" title="' + t('按邮箱关联', 'matched by email') + '">' + t('邮箱关联', 'by email') + '</span>' : '') + '</td>' +
        '</tr>';
      }).join('');
    }
    function renderOrders() {
      var tbl = document.getElementById('vip-orders');
      if (!tbl) return;
      tbl.querySelector('tbody').innerHTML = orderRows();
      Array.prototype.forEach.call(tbl.querySelectorAll('.vip-o'), function (a) {
        a.addEventListener('click', function () { jumpToOrder(a.dataset.no); });
      });
    }
    function jumpToOrder(no) {
      if (typeof window.switchTab === 'function') window.switchTab('shopmgr');
      setTimeout(function () {
        var inp = document.getElementById('sm-o-search');
        if (inp) { inp.value = no; inp.dispatchEvent(new Event('input', { bubbles: true })); }
        toast(t('已在订单管理中定位 ' + no, 'Located ' + no + ' in order manager'));
      }, 350);
    }

    detail.innerHTML =
      '<div class="card" style="padding:20px 22px;margin-bottom:14px;">' +
        '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">' +
          '<h3 style="margin:0;font-size:18px;color:var(--text,#604C57);">' + esc(c.name || t('未命名', 'Unnamed')) + '</h3>' + vipBadge +
          '<span style="font-size:13px;color:var(--muted,#A88E9B);margin-left:auto;">' + esc(c.c_no || '') + '</span>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px 18px;margin-top:12px;font-size:15px;color:var(--text,#604C57);">' +
          '<div>' + t('Email', 'Email') + '：<b>' + esc(c.email || t('未填写', '—')) + '</b></div>' +
          '<div>' + t('电话', 'Phone') + '：<b>' + esc(c.phone || t('未填写', '—')) + '</b></div>' +
          '<div>' + t('建档时间', 'Created') + '：' + esc(String(c.created_at).slice(0, 10)) + '</div>' +
          '<div>' + t('最近下单', 'Last order') + '：' + lastTxt + '</div>' +
          '<div>' + t('VIP 标记时间', 'VIP since') + '：' + (c.vip ? esc(String(c.updated_at).slice(0, 10)) + t('（以档案最后更新时间为准）', ' (per profile update)') : t('—', '—')) + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="card" style="padding:20px 22px;margin-bottom:14px;">' +
        '<h3 style="margin:0 0 12px;font-size:17px;color:var(--text,#604C57);">' + t('消费统计', 'Spend stats') + '</h3>' + kpiHtml +
        '<p style="font-size:12px;color:var(--muted,#A88E9B);margin:12px 0 0;">' + t('口径：未付款与已取消订单不计入；TEST- 测试单排除；实付以付款流水为准（无流水的已付订单按订单金额计）；退款以退款流水记录为准；不同币种分别统计。', 'Excludes unpaid/cancelled and TEST- orders. Paid from payment records (falls back to order total); refunds from refund records; currencies kept separate.') + '</p>' +
      '</div>' +
      '<div class="card" style="padding:20px 22px;margin-bottom:14px;">' +
        '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px;">' +
          '<h3 style="margin:0;font-size:17px;color:var(--text,#604C57);">' + t('历史订单', 'Order history') + '</h3>' +
          '<span style="margin-left:auto;"></span>' +
          ['all|全部', 'paid|已付款', 'shipped|已发货', 'refund|退款类', 'cancelled|已取消'].map(function (s) { var p = s.split('|'); return '<button type="button" class="chip' + (VIPST.fStatus === p[0] ? ' on' : '') + '" data-fs="' + p[0] + '">' + p[1] + '</button>'; }).join('') +
          '<span style="width:10px;"></span>' +
          ['all|全部时间', '30|近 30 天', '90|近 90 天'].map(function (s) { var p = s.split('|'); return '<button type="button" class="chip' + (VIPST.fDays === p[0] ? ' on' : '') + '" data-fd="' + p[0] + '">' + p[1] + '</button>'; }).join('') +
        '</div>' +
        '<div style="overflow-x:auto;">' +
          '<table style="width:100%;border-collapse:collapse;font-size:14px;color:var(--text,#604C57);" id="vip-orders">' +
            '<thead><tr style="color:var(--muted,#A88E9B);text-align:left;">' +
              '<th style="padding:8px 10px;">' + t('订单编号', 'Order') + '</th>' +
              '<th style="padding:8px 10px;">' + t('日期', 'Date') + '</th>' +
              '<th style="padding:8px 10px;">' + t('商品', 'Items') + '</th>' +
              '<th style="padding:8px 10px;text-align:right;">' + t('小计', 'Subtotal') + '</th>' +
              '<th style="padding:8px 10px;text-align:right;">' + t('折扣', 'Discount') + '</th>' +
              '<th style="padding:8px 10px;text-align:right;">' + t('运费', 'Shipping') + '</th>' +
              '<th style="padding:8px 10px;text-align:right;">' + t('实付', 'Total') + '</th>' +
              '<th style="padding:8px 10px;text-align:right;">' + t('已退款', 'Refunded') + '</th>' +
              '<th style="padding:8px 10px;">' + t('状态', 'Status') + '</th>' +
            '</tr></thead><tbody></tbody>' +
          '</table>' +
        '</div>' +
      '</div>' +
      '<div class="card" style="padding:20px 22px;">' +
        '<h3 style="margin:0 0 10px;font-size:17px;color:var(--text,#604C57);">' + t('店主备注', 'Shopkeeper notes') + '</h3>' +
        '<textarea id="vip-note" rows="4" style="width:100%;box-sizing:border-box;background:var(--bg,#FFF8FA);border:1px solid var(--border,#FFD9E6);border-radius:12px;padding:10px 14px;font-size:15px;font-family:inherit;color:var(--text,#604C57);outline:none;resize:vertical;" placeholder="' + t('记录特殊需求、沟通情况、售后信息…', 'Special needs, conversations, after-sales info…') + '">' + esc(c.note || '') + '</textarea>' +
        '<div style="display:flex;gap:10px;align-items:center;margin-top:10px;flex-wrap:wrap;">' +
          '<button class="btn-save-tb" id="vip-note-save">' + t('保存备注', 'Save note') + '</button>' +
          '<span style="font-size:12px;color:var(--muted,#A88E9B);">' + t('仅后台可见，与「客户管理」共用同一备注字段', 'Admin-only; shared with Customer manager') + '</span>' +
        '</div>' +
      '</div>';

    // 筛选 chips 事件
    Array.prototype.forEach.call(detail.querySelectorAll('[data-fs]'), function (b) {
      b.addEventListener('click', function () { VIPST.fStatus = b.dataset.fs; refreshChips(); renderOrders(); });
    });
    Array.prototype.forEach.call(detail.querySelectorAll('[data-fd]'), function (b) {
      b.addEventListener('click', function () { VIPST.fDays = b.dataset.fd; refreshChips(); renderOrders(); });
    });
    function refreshChips() {
      Array.prototype.forEach.call(detail.querySelectorAll('[data-fs]'), function (b) { b.classList.toggle('on', b.dataset.fs === VIPST.fStatus); });
      Array.prototype.forEach.call(detail.querySelectorAll('[data-fd]'), function (b) { b.classList.toggle('on', b.dataset.fd === VIPST.fDays); });
    }
    renderOrders();

    // 备注保存：全参数回传（与客户管理同一 RPC，只改 note）
    detail.querySelector('#vip-note-save').addEventListener('click', function () {
      var btn = this; btn.disabled = true;
      var body = {
        p_id: c.id, p_name: c.name || '', p_email: c.email || '', p_phone: c.phone || '',
        p_note: detail.querySelector('#vip-note').value.trim(),
        p_source: c.source || 'offline', p_birthday: c.birthday || null,
        p_pref_lang: c.pref_lang || 'zh', p_notify_birthday: c.notify_birthday !== false,
      };
      api('rpc/shop_customer_save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          btn.disabled = false;
          if (j && j.message) { toast(j.message); return; }
          toast(t('备注已保存 ✓', 'Note saved ✓'));
          c.note = body.p_note;
          var idx = VIP.customers.indexOf(c);
          if (idx >= 0) VIP.customers[idx].note = body.p_note;
        })
        .catch(function () { btn.disabled = false; toast(t('保存失败，请重试', 'Save failed — retry')); });
    });
  }
})();
