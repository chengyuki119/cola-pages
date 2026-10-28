/* ══════════════════════════════════════════════════════════════════
   admin-crm.js —— 客户管理 / 线下开单 / 邮件与联系人同步（她 2026-10-26 阶段2）
   依赖 admin.html 全局：api() / esc() / escAttr() / toast() / uiConfirm() / fmtMoney()
   数据：shop_customers + shop_orders(order_source pos) + RPC shop_customer_save/merge/shop_pos_create/shop_pos_confirm
   ══════════════════════════════════════════════════════════════════ */
(function () {
  var SUPA = (window.SUPABASE_URL || (window.SUPABASE_URL = 'https://vmmmuyxrsiufzurwbydg.supabase.co'));
  var CRM = window.CRM = {};
  function t(zh, en) { return (window.LANG === 'en') ? en : zh; }

  /* ═══════════ 客户管理 ═══════════ */
  var CUST = { list: [], search: '', filter: '' };

  CRM.bootCrm = function () {
    var panel = document.getElementById('tab-crm');
    if (panel.dataset.booted) { renderCrm(); loadCust(); return; } // 切回来也要重新拉数据，否则永远卡「加载中…」（2026-10-26 实测抓到）
    panel.dataset.booted = '1';
    renderCrm();
    loadCust();
  };

  function renderCrm() {
    var panel = document.getElementById('tab-crm');
    panel.innerHTML =
      '<div class="card" style="padding:16px 20px;margin-bottom:14px;">' +
        '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">' +
          '<input id="cust-q" placeholder="' + t('搜索姓名 / 邮箱 / 电话 / 客户编号', 'Search name / email / phone / no.') + '" style="flex:1;min-width:220px;padding:10px 16px;font-size:15px;border:1.5px solid var(--accent-soft,#FCE4EC);border-radius:12px;outline:none;font-family:inherit;color:var(--text,#604C57);background:#fff;box-sizing:border-box;">' +
          '<button class="btn-save-tb" id="cust-new">＋ ' + t('新建客户', 'New customer') + '</button>' +
        '</div>' +
        '<div id="cust-stats" style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px;"></div>' +
      '</div>' +
      '<div id="cust-list"><p style="color:var(--muted,#A88E9B);text-align:center;padding:24px 0;">' + t('加载中…', 'Loading…') + '</p></div>';
    panel.querySelector('#cust-q').addEventListener('input', function () { CUST.search = this.value.trim().toLowerCase(); renderCustRows(); });
    panel.querySelector('#cust-new').addEventListener('click', function () { custForm(null); });
  }

  function loadCust() {
    api('shop_customers?select=*&order=created_at.desc').then(function (r) { return r.json(); }).then(function (rows) {
      CUST.list = rows || [];
      api('shop_orders?select=customer_id,user_id,status,total,order_no,order_source,email&order=created_at.desc&limit=500').then(function (r2) { return r2.json(); }).then(function (ords) {
        CUST.orders = ords || [];
        renderCustRows();
      });
    }).catch(function () { toast('客户列表加载失败'); });
  }

  // 消费统计：已付款（paid/shipped/completed/refunding）计入；refunded 全额退不计；测试/待付款/取消不计
  function custStats(c) {
    var ords = (CUST.orders || []).filter(function (o) {
      return (o.customer_id && o.customer_id === c.id) || (c.user_id && o.user_id === c.user_id);
    });
    var paid = ords.filter(function (o) { return ['paid', 'shipped', 'completed', 'refunding'].indexOf(o.status) >= 0; });
    var sum = 0; paid.forEach(function (o) { sum += Number(o.total) || 0; });
    var last = paid.length ? paid[0] : null;
    return { count: paid.length, sum: sum, last: last, ords: ords };
  }

  function renderCustRows() {
    var box = document.getElementById('cust-list');
    var rows = CUST.list.filter(function (c) {
      if (!CUST.search) return true;
      return [c.name, c.email, c.phone, c.c_no].some(function (v) { return String(v || '').toLowerCase().indexOf(CUST.search) >= 0; });
    });
    var vipN = CUST.list.filter(function (c) { return c.vip; }).length;
    var totalSum = 0; CUST.list.forEach(function (c) { totalSum += custStats(c).sum; });
    var stats = document.getElementById('cust-stats');
    if (stats) stats.innerHTML =
      '<span class="sm-stat"><b>' + CUST.list.length + '</b><span>' + t('客户总数', 'Customers') + '</span></span>' +
      '<span class="sm-stat"><b style="color:var(--price,#ff6fa5);">$' + fmtMoney(totalSum) + '</b><span>' + t('累计消费（已扣退款）', 'Total spent') + '</span></span>' +
      '<span class="sm-stat"><b>' + vipN + '</b><span>' + t('VIP 会员', 'VIP') + '</span></span>';
    if (!rows.length) { box.innerHTML = '<p style="color:var(--muted,#A88E9B);text-align:center;padding:24px 0;">' + t('还没有客户档案', 'No customers yet') + '</p>'; return; }
    box.innerHTML = rows.map(function (c) {
      var st = custStats(c);
      return '<div class="card cust-row" data-cid="' + escAttr(c.id) + '" style="padding:12px 16px;margin-bottom:10px;cursor:pointer;">' +
        '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">' +
          '<span style="font-size:16px;font-weight:700;color:var(--text,#604C57);">' + esc(c.name || t('（未命名）', '(Unnamed)')) + '</span>' +
          '<span style="font-size:13px;color:var(--muted,#A88E9B);">' + esc(c.c_no || '') + '</span>' +
          (c.vip ? '<span style="font-size:12px;font-weight:600;padding:2px 10px;border-radius:999px;background:var(--accent-soft,#FCE4EC);color:var(--accent-strong,#A04A68);">VIP' + (c.vip_until ? ' · ' + c.vip_until : '') + '</span>' : '') +
          '<span style="font-size:12px;padding:2px 10px;border-radius:999px;background:#fff;border:1px solid var(--accent-soft,#FCE4EC);color:var(--muted,#A88E9B);">' + (c.source === 'online' ? t('线上', 'Online') : t('线下', 'Offline')) + '</span>' +
          '<span style="margin-left:auto;font-size:15px;color:var(--price,#ff6fa5);font-weight:700;">$' + fmtMoney(st.sum) + '</span>' +
          '<span style="font-size:13px;color:var(--muted,#A88E9B);">' + st.count + ' ' + t('次', 'orders') + '</span>' +
        '</div>' +
        '<div style="font-size:13px;color:var(--muted,#A88E9B);margin-top:4px;">' + esc(c.email || '—') + ' · ' + esc(c.phone || '—') + (st.last ? ' · ' + t('最近', 'Last') + ' ' + st.last.order_no : '') + '</div>' +
      '</div>';
    }).join('');
    box.querySelectorAll('.cust-row').forEach(function (row) {
      row.addEventListener('click', function () {
        var c = CUST.list.filter(function (x) { return x.id === row.getAttribute('data-cid'); })[0];
        if (c) custDetail(c);
      });
    });
  }

  function custForm(c) {
    var panel = document.getElementById('tab-crm');
    var old = panel.querySelector('.cust-form-card'); if (old) old.remove();
    var div = document.createElement('div');
    div.className = 'card cust-form-card';
    div.style.cssText = 'padding:16px 20px;margin-bottom:14px;border:1.5px solid var(--accent-soft,#FCE4EC);';
    div.innerHTML =
      '<h3 style="margin:0 0 12px;font-size:17px;color:var(--text,#604C57);">' + (c ? t('编辑客户', 'Edit customer') : t('新建客户', 'New customer')) + (c ? ' · ' + esc(c.c_no) : '') + '</h3>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;">' +
        '<input id="cf-name" placeholder="' + t('姓名 / 称呼', 'Name') + '" value="' + escAttr(c ? c.name || '' : '') + '">' +
        '<input id="cf-email" placeholder="Email" value="' + escAttr(c ? c.email || '' : '') + '">' +
        '<input id="cf-phone" placeholder="' + t('电话', 'Phone') + '" value="' + escAttr(c ? c.phone || '' : '') + '">' +
        '<input id="cf-note" placeholder="' + t('备注（来源、喜好等）', 'Note') + '" value="' + escAttr(c ? c.note || '' : '') + '">' +
        '<input id="cf-birthday" type="date" title="' + t('生日（当天自动发送生日邮件）', 'Birthday (birthday email auto-sends on the day)') + '" value="' + escAttr(c ? c.birthday || '' : '') + '">' +
      '</div>' +
      '<div style="margin-top:10px;display:flex;gap:16px;flex-wrap:wrap;font-size:14px;color:var(--text,#604C57);">' +
        '<div style="display:flex;align-items:center;gap:8px;">' + t('邮件语言', 'Email language') +
          '<span class="chip' + (!c || (c.pref_lang || 'zh') === 'zh' ? ' on' : '') + '" id="cf-lang-zh">中文</span>' +
          '<span class="chip' + (c && c.pref_lang === 'en' ? ' on' : '') + '" id="cf-lang-en">English</span>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:8px;">' + t('生日邮件', 'Birthday email') +
          '<span class="chip' + (!c || c.notify_birthday !== false ? ' on' : '') + '" id="cf-bday-on">' + t('开启', 'On') + '</span>' +
          '<span class="chip' + (c && c.notify_birthday === false ? ' on' : '') + '" id="cf-bday-off">' + t('关闭', 'Off') + '</span>' +
        '</div>' +
      '</div>' +
      '<div style="margin-top:12px;display:flex;gap:10px;">' +
        '<button class="btn-save-tb" id="cf-save">' + t('保存', 'Save') + '</button>' +
        '<button class="btn-mini" id="cf-cancel">' + t('取消', 'Cancel') + '</button>' +
      '</div>';
    panel.insertBefore(div, panel.children[0]);
    div.querySelector('#cf-cancel').addEventListener('click', function () { div.remove(); });
    var cfLang = c ? (c.pref_lang || 'zh') : 'zh';
    var cfBday = c ? (c.notify_birthday !== false) : true;
    function cfSyncChips() {
      div.querySelector('#cf-lang-zh').classList.toggle('on', cfLang === 'zh');
      div.querySelector('#cf-lang-en').classList.toggle('on', cfLang === 'en');
      div.querySelector('#cf-bday-on').classList.toggle('on', cfBday);
      div.querySelector('#cf-bday-off').classList.toggle('on', !cfBday);
    }
    div.querySelector('#cf-lang-zh').addEventListener('click', function () { cfLang = 'zh'; cfSyncChips(); });
    div.querySelector('#cf-lang-en').addEventListener('click', function () { cfLang = 'en'; cfSyncChips(); });
    div.querySelector('#cf-bday-on').addEventListener('click', function () { cfBday = true; cfSyncChips(); });
    div.querySelector('#cf-bday-off').addEventListener('click', function () { cfBday = false; cfSyncChips(); });
    div.querySelector('#cf-save').addEventListener('click', function () {
      var body = {
        p_id: c ? c.id : null,
        p_name: div.querySelector('#cf-name').value.trim(),
        p_email: div.querySelector('#cf-email').value.trim(),
        p_phone: div.querySelector('#cf-phone').value.trim(),
        p_note: div.querySelector('#cf-note').value.trim(),
        p_source: c ? (c.source || 'offline') : 'offline',
        p_birthday: div.querySelector('#cf-birthday').value || null,
        p_pref_lang: cfLang,
        p_notify_birthday: cfBday
      };
      api('rpc/shop_customer_save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (j && j.message) { toast(j.message); return; }
          toast(t('已保存', 'Saved'));
          if (window.loadShopOrders) loadShopOrders();
          loadCust();
          div.remove();
        });
    });
  }

  function custDetail(c) {
    var st = custStats(c);
    var panel = document.getElementById('tab-crm');
    var old = panel.querySelector('.cust-detail-card'); if (old) old.remove();
    var div = document.createElement('div');
    div.className = 'card cust-detail-card';
    div.style.cssText = 'padding:16px 20px;margin-bottom:14px;border:1.5px solid var(--accent-soft,#FCE4EC);';
    div.innerHTML =
      '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">' +
        '<h3 style="margin:0;font-size:17px;color:var(--text,#604C57);">' + esc(c.name || '—') + ' <span style="font-size:13px;color:var(--muted,#A88E9B);font-weight:400;">' + esc(c.c_no) + '</span></h3>' +
        '<button class="btn-mini cd-edit" style="margin-left:auto;">' + t('编辑', 'Edit') + '</button>' +
        '<button class="btn-mini cd-vip">' + (c.vip ? t('取消 VIP', 'Remove VIP') : t('设为 VIP', 'Set VIP')) + '</button>' +
        '<button class="btn-mini cd-merge">' + t('合并重复客户', 'Merge duplicate') + '</button>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;margin:12px 0;font-size:14px;color:var(--text,#604C57);">' +
        '<div>' + t('邮箱', 'Email') + '：' + esc(c.email || '—') + '</div>' +
        '<div>' + t('电话', 'Phone') + '：' + esc(c.phone || '—') + '</div>' +
        '<div>' + t('来源', 'Source') + '：' + (c.source === 'online' ? t('线上', 'Online') : t('线下', 'Offline')) + '</div>' +
        '<div>' + t('累计消费', 'Spent') + '：<span style="color:var(--price,#ff6fa5);font-weight:700;">$' + fmtMoney(st.sum) + '</span> · ' + st.count + t('次', '') + '</div>' +
        '<div>' + t('生日', 'Birthday') + '：' + (c.birthday ? esc(c.birthday) : t('未设置', 'Not set')) + (c.birthday ? (c.notify_birthday !== false ? ' · ' + t('生日邮件开', 'email on') : ' · ' + t('生日邮件关', 'email off')) : '') + '</div>' +
        '<div>' + t('邮件语言', 'Email language') + '：' + ((c.pref_lang || 'zh') === 'en' ? 'English' : '中文') + '</div>' +
      '</div>' +
      (c.note ? '<div style="font-size:13px;color:var(--muted,#A88E9B);margin-bottom:10px;">' + t('备注', 'Note') + '：' + esc(c.note) + '</div>' : '') +
      '<div style="font-size:14px;color:var(--text,#604C57);font-weight:600;margin-bottom:6px;">' + t('购买历史', 'Purchase history') + '</div>' +
      (st.ords.length ? st.ords.map(function (o) {
        var stl = { pending: '待付款', reviewing: '待审核', rejected: '凭证有误', paid: '已付款', shipped: '已发货', completed: '已完成', cancelled: '已取消', refunding: '退款中', refunded: '已退款' }[o.status] || o.status;
        var inc = ['paid', 'shipped', 'completed', 'refunding'].indexOf(o.status) >= 0;
        return '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid var(--accent-soft,#FCE4EC);font-size:14px;' + (inc ? '' : 'opacity:.55;') + '">' +
          '<b style="color:var(--text,#604C57);">' + esc(o.order_no) + '</b>' +
          '<span style="color:var(--muted,#A88E9B);font-size:13px;">' + stl + ' · ' + (o.order_source === 'pos' ? t('线下', 'POS') : t('线上', 'Online')) + '</span>' +
          '<span style="margin-left:auto;color:var(--price,#ff6fa5);font-weight:700;">$' + fmtMoney(o.total) + '</span></div>';
      }).join('') : '<p style="color:var(--muted,#A88E9B);font-size:14px;">' + t('还没有购买记录', 'No purchases yet') + '</p>');
    panel.insertBefore(div, panel.children[0]);
    div.querySelector('.cd-edit').addEventListener('click', function () { custForm(c); });
    div.querySelector('.cd-vip').addEventListener('click', function () {
      api('shop_customers?id=eq.' + c.id, { method: 'PATCH', body: JSON.stringify({ vip: !c.vip, vip_until: c.vip ? null : '2027-10-26', updated_at: new Date().toISOString() }) })
        .then(function (r) { if (!r.ok) { toast(t('操作失败', 'Failed')); return; } toast(!c.vip ? t('已设为 VIP（至 2027-10-26）', 'VIP set') : t('已取消 VIP', 'VIP removed')); div.remove(); loadCust(); });
    });
    div.querySelector('.cd-merge').addEventListener('click', function () {
      var other = prompt(t('输入要合并掉的重复客户编号（C-xxxxxx），其订单会挂到本客户，档案数据择优保留：', 'Enter duplicate customer no. to merge into this one:'));
      if (!other) return;
      var dup = CUST.list.filter(function (x) { return x.c_no === other.trim(); })[0];
      if (!dup) { toast(t('找不到这个客户编号', 'Customer not found')); return; }
      if (dup.id === c.id) { toast(t('不能和自己合并', 'Cannot merge with itself')); return; }
      uiConfirm(t('确认把 ') + dup.c_no + ' ' + t('合并进 ') + c.c_no + t(' 吗？历史订单保留，操作不可撤销。', 'Merge? This cannot be undone.'), function () {
        api('rpc/shop_customer_merge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ p_keep: c.id, p_dup: dup.id }) })
          .then(function (r) { return r.json(); })
          .then(function (j) { if (j && j.message) { toast(j.message); return; } toast(t('已合并', 'Merged')); div.remove(); loadCust(); });
      });
    });
  }

  /* ═══════════ 线下开单 ═══════════ */
  var POS = { items: [], prods: [], custs: [], customerId: null, channel: 'cash', test: true, payPlan: 'full' }; // payPlan: full=全款 / deposit=定金＋尾款 / split=分次付款（她 2026-10-28 补充需求）

  CRM.bootPos = function () {
    var panel = document.getElementById('tab-pos');
    if (panel.dataset.booted) return;
    panel.dataset.booted = '1';
    renderPos();
    api('products?select=id,name,price,stock,sold,image_url&order=created_at.desc&limit=200').then(function (r) { return r.json(); }).then(function (rows) { POS.prods = rows || []; renderPosPicks(); });
    api('shop_customers?select=id,c_no,name,email&order=created_at.desc&limit=200').then(function (r) { return r.json(); }).then(function (rows) { POS.custs = rows || []; });
  };

  function posTotal() {
    var sum = 0; POS.items.forEach(function (x) { sum += x.price * x.qty; });
    return sum;
  }

  function renderPos() {
    var panel = document.getElementById('tab-pos');
    panel.innerHTML =
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px;">' +
        '<div class="card" style="padding:16px 20px;">' +
          '<h3 style="margin:0 0 10px;font-size:16px;color:var(--text,#604C57);">' + t('选商品', 'Pick products') + '</h3>' +
          '<input id="pos-q" placeholder="' + t('搜索商品，或直接添加临时自定义商品', 'Search products / add custom item') + '" style="width:100%;box-sizing:border-box;padding:10px 14px;font-size:15px;border:1.5px solid var(--accent-soft,#FCE4EC);border-radius:12px;outline:none;font-family:inherit;color:var(--text,#604C57);background:#fff;">' +
          '<div id="pos-picks" style="margin-top:10px;max-height:340px;overflow:auto;"></div>' +
          '<div style="margin-top:10px;font-size:13px;color:var(--muted,#A88E9B);">' + t('关联客户（可匿名）', 'Customer (anonymous ok)') + '</div>' +
          '<div style="margin-top:6px;"><span class="chip on" id="pos-anon">' + t('匿名销售', 'Anonymous') + '</span> <span class="chip" id="pos-pickcust">' + t('选已有客户', 'Pick customer') + '</span></div>' +
          '<div id="pos-custpick" style="display:none;margin-top:8px;"><select id="pos-cust" style="width:100%;padding:9px 12px;border-radius:10px;border:1.5px solid var(--accent-soft,#FCE4EC);font-family:inherit;color:var(--text,#604C57);background:#fff;"></select></div>' +
        '</div>' +
        '<div class="card" style="padding:16px 20px;">' +
          '<h3 style="margin:0 0 10px;font-size:16px;color:var(--text,#604C57);">' + t('收款', 'Payment') + ' · <span id="pos-no" style="color:var(--price,#ff6fa5);">—</span></h3>' +
          '<div id="pos-chans" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;"></div>' +
          '<input id="pos-note" placeholder="' + t('订单备注（客户要求／定制说明／收款说明，可选）', 'Order note (requests / custom specs / payment notes, optional)') + '" style="width:100%;margin-bottom:10px;box-sizing:border-box;" />' + // 订单备注：写入 shop_orders.note（她 20261028 总任务书 5.2）
          '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px;">' + // 收款安排：全款/定金＋尾款/分次付款（她 2026-10-28 补充需求 1）
            '<span style="font-size:13px;color:var(--muted,#A88E9B);">' + t('收款安排', 'Payment plan') + '</span>' +
            '<span class="paytab' + (POS.payPlan === 'full' ? ' on' : '') + '" data-plan="full">' + t('全款', 'Full') + '</span>' +
            '<span class="paytab' + (POS.payPlan === 'deposit' ? ' on' : '') + '" data-plan="deposit">' + t('定金＋尾款', 'Deposit + final') + '</span>' +
            '<span class="paytab' + (POS.payPlan === 'split' ? ' on' : '') + '" data-plan="split">' + t('分次付款', 'Installments') + '</span>' +
            '<span id="pos-plan-inputs" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;"></span>' +
          '</div>' +
          '<div style="font-size:13px;color:#8a6d3b;background:#fff7f0;border:1px solid #f0d9c0;border-radius:10px;padding:8px 12px;margin-bottom:10px;">' + t('现金 / 转账需实际收到钱后再点「确认收款」——只保存记录不代表已收款。', 'Cash/transfers: confirm only after money actually received.') + '</div>' +
          '<div id="pos-cart"></div>' +
          '<div id="pos-sum"></div>' +
          '<div style="margin-top:10px;"><span class="chip on" id="pos-mode-test">' + t('测试模式', 'Test mode') + '</span> <span class="chip" id="pos-mode-formal">' + t('正式开单', 'Formal sale') + '</span>' +
          '<span id="pos-nextno" style="margin-left:10px;font-size:12px;color:var(--muted,#A88E9B);"></span></div>' +
          '<button class="btn-save-tb" id="pos-save" style="width:100%;margin-top:12px;">' + t('保存销售记录（测试模式）', 'Save sale (test mode)') + '</button>' +
          '<div id="pos-after" style="margin-top:12px;"></div>' +
        '</div>' +
      '</div>' +
      '<div style="margin-top:14px;font-size:13px;color:var(--muted,#A88E9B);">' + t('编号规则：正式 SY-POS-001…，测试 SY-POS-TEST-001…，与线上订单独立计数；重复点击保存不会产生重复记录。', 'POS numbering is independent from online orders; duplicate submits are protected.') + '</div>';
    var chans = [['cash', t('现金', 'Cash')], ['zelle', 'Zelle'], ['venmo', 'Venmo'], ['paypal', 'PayPal'], ['stripe', t('Stripe 扫码', 'Stripe QR')], ['wechat', t('微信支付', 'WeChat Pay')], ['alipay', t('支付宝', 'Alipay')], ['other', t('＋ 其他', 'Other')]]; // 微信/支付宝：人工记录收款方式（未接在线 API）
    var chansEl = panel.querySelector('#pos-chans');
    chansEl.innerHTML = chans.map(function (c) { return '<span class="paytab' + (POS.channel === c[0] ? ' on' : '') + '" data-ch="' + c[0] + '">' + c[1] + '</span>'; }).join('');
    chansEl.querySelectorAll('.paytab').forEach(function (el) {
      el.addEventListener('click', function () { POS.channel = el.getAttribute('data-ch'); renderPos(); });
    });
    panel.querySelectorAll('[data-plan]').forEach(function (el) { // 收款安排切换（她 2026-10-28 补充需求）
      el.addEventListener('click', function () {
        POS.payPlan = el.getAttribute('data-plan');
        panel.querySelectorAll('[data-plan]').forEach(function (x) { x.classList.toggle('on', x === el); });
        renderPlanInputs();
      });
    });
    renderPlanInputs();
    panel.querySelector('#pos-anon').addEventListener('click', function () { POS.customerId = null; renderPos(); });
    // §4 单号模式切换：测试=SY-POS-TEST-xxx，正式=SY-POS-00x（两套序列均在库端 shop_order_seq 行级计数，与线上订单独立，不会撞号）
    var tChip = panel.querySelector('#pos-mode-test'), fChip = panel.querySelector('#pos-mode-formal');
    function paintPosMode() {
      tChip.classList.toggle('on', POS.test); fChip.classList.toggle('on', !POS.test);
      panel.querySelector('#pos-save').textContent = POS.test ? t('保存销售记录（测试模式）', 'Save sale (test mode)') : t('保存正式销售记录', 'Save formal sale');
      var nn = panel.querySelector('#pos-nextno');
      api('shop_order_seq?select=day,last_no&day=in.(POS,POS_TEST)').then(function (r) { return r.json(); }).then(function (rows) {
        var pos = (rows || []).filter(function (x) { return x.day === 'POS'; })[0], pt = (rows || []).filter(function (x) { return x.day === 'POS_TEST'; })[0];
        nn.textContent = t('下一单号：', 'Next no: ') + (POS.test ? ('SY-POS-TEST-' + (((pt && pt.last_no) || 0) + 1)) : ('SY-POS-' + String((((pos && pos.last_no) || 0) + 1)).padStart(3, '0')));
      }).catch(function () { nn.textContent = ''; });
    }
    tChip.addEventListener('click', function () { POS.test = true; paintPosMode(); });
    fChip.addEventListener('click', function () { POS.test = false; paintPosMode(); });
    paintPosMode();
    panel.querySelector('#pos-pickcust').addEventListener('click', function () {
      var sel = panel.querySelector('#pos-custpick');
      sel.style.display = sel.style.display === 'none' ? '' : 'none';
      var sel2 = panel.querySelector('#pos-cust');
      if (!sel2.options.length) {
        sel2.innerHTML = '<option value="">' + t('（不关联）', '(none)') + '</option>' + POS.custs.map(function (c) { return '<option value="' + escAttr(c.id) + '">' + esc((c.name || c.c_no) + (c.email ? ' · ' + c.email : '')) + '</option>'; }).join('');
      }
      sel2.addEventListener('change', function () { POS.customerId = sel2.value || null; });
    });
    panel.querySelector('#pos-q').addEventListener('input', renderPosPicks);
    panel.querySelector('#pos-save').addEventListener('click', posSave);
    renderPosPicks(); renderPosCart();
  }

  function renderPosPicks() {
    var box = document.getElementById('pos-picks'); if (!box) return;
    var q = (document.getElementById('pos-q').value || '').trim().toLowerCase();
    var picks = POS.prods.filter(function (p) { return !p.sold; }).filter(function (p) { return !q || (p.name || '').toLowerCase().indexOf(q) >= 0; }).slice(0, 12);
    box.innerHTML = picks.map(function (p, i) {
      return '<div class="pick" data-i="' + i + '"><img src="' + escAttr(p.image_url || '') + '" onerror="this.style.display=\'none\'">' +
        '<div><div class="nm">' + esc(p.name || '') + '</div><div class="st">' + t('库存', 'Stock') + ' ' + (p.stock == null ? '—' : p.stock) + '</div><div class="pr">$' + fmtMoney(p.price) + '</div></div>' +
        '<div class="qty"><button class="qb" data-add="' + escAttr(p.id) + '">＋</button></div></div>';
    }).join('') +
    '<div class="pick" style="border-style:dashed;" id="pos-custom"><div style="width:56px;height:56px;border-radius:12px;background:var(--accent-soft,#FCE4EC);display:flex;align-items:center;justify-content:center;color:var(--muted,#A88E9B);font-size:22px;">＋</div>' +
      '<div><div class="nm">' + t('临时自定义商品（不上架）', 'Custom item (not listed)') + '</div><div class="st">' + t('名称 / 价格现场填，只属于本笔销售', 'Only belongs to this sale') + '</div></div></div>';
    box.querySelectorAll('[data-add]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var p = POS.prods.filter(function (x) { return x.id === btn.getAttribute('data-add'); })[0];
        if (!p) return;
        var ex = POS.items.filter(function (x) { return x.id === p.id; })[0];
        if (ex) { ex.qty++; } else { POS.items.push({ id: p.id, name: p.name, price: Number(p.price) || 0, qty: 1, image: p.image_url || '', sku: '' }); }
        renderPosCart();
      });
    });
    var cu = box.querySelector('#pos-custom');
    if (cu) cu.addEventListener('click', function () {
      var name = prompt(t('临时商品名称：', 'Custom item name:'));
      if (!name) return;
      var price = parseFloat(prompt(t('价格（美元）：', 'Price (USD):')) || '0');
      if (isNaN(price) || price < 0) { toast(t('价格不对', 'Bad price')); return; }
      POS.items.push({ id: '', name: name, price: price, qty: 1, image: '', sku: '' });
      renderPosCart();
    });
  }

  function renderPosCart() {
    var box = document.getElementById('pos-cart'); if (!box) return;
    box.innerHTML = POS.items.map(function (x, i) {
      return '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid var(--accent-soft,#FCE4EC);font-size:14px;">' +
        '<div style="flex:1;min-width:0;"><b style="color:var(--text,#604C57);">' + esc(x.name) + '</b>' +
        (x.id ? '' : ' <span style="font-size:12px;color:var(--muted,#A88E9B);">' + t('临时', 'custom') + '</span>') +
        '<div style="color:var(--price,#ff6fa5);font-weight:600;">$' + fmtMoney(x.price) + '</div></div>' +
        '<button class="qb pos-dec" data-i="' + i + '">−</button><b style="color:var(--text,#604C57);">' + x.qty + '</b><button class="qb pos-inc" data-i="' + i + '">＋</button>' +
        '<button class="pos-rm" data-i="' + i + '" style="border:none;background:none;color:var(--danger,#D96570);font-size:13px;cursor:pointer;text-decoration:underline;">' + t('删', 'Del') + '</button>' +
        '<b style="min-width:70px;text-align:right;color:var(--text,#604C57);">$' + fmtMoney(x.price * x.qty) + '</b></div>';
    }).join('');
    var sum = document.getElementById('pos-sum');
    sum.innerHTML = '<div style="display:flex;justify-content:space-between;font-size:17px;font-weight:700;color:var(--text,#604C57);border-top:1.5px solid var(--accent-soft,#FCE4EC);padding-top:10px;margin-top:4px;"><span>' + t('应收', 'Total') + '</span><span style="color:var(--price,#ff6fa5);">$' + fmtMoney(posTotal()) + '</span></div>';
    box.querySelectorAll('.pos-dec').forEach(function (b) { b.addEventListener('click', function () { var x = POS.items[+b.getAttribute('data-i')]; x.qty = Math.max(1, x.qty - 1); renderPosCart(); }); });
    box.querySelectorAll('.pos-inc').forEach(function (b) { b.addEventListener('click', function () { POS.items[+b.getAttribute('data-i')].qty++; renderPosCart(); }); });
    box.querySelectorAll('.pos-rm').forEach(function (b) { b.addEventListener('click', function () { POS.items.splice(+b.getAttribute('data-i'), 1); renderPosCart(); }); });
  }

  function posSave() {
    if (!POS.items.length) { toast(t('先选商品', 'Pick some products first')); return; }
    var note = '线下开单 · ' + POS.channel;
    var noteInput = panel.querySelector('#pos-note');
    var userNote = (noteInput && noteInput.value.trim()) || '';
    if (userNote) note += '\n' + userNote; // 备注写入 shop_orders.note，不与姓名/商品/付款字段混用
    var body = {
      p_items: POS.items.map(function (x) { return { id: x.id, name: x.name, price: x.price, qty: x.qty, image: x.image, sku: x.sku }; }),
      p_pay_channel: POS.channel,
      p_customer_id: POS.customerId,
      p_note: note,
      p_client_token: 'pos-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      p_test: POS.test
    };
    var btn = document.getElementById('pos-save');
    btn.disabled = true; btn.textContent = t('保存中…', 'Saving…');
    api('rpc/shop_pos_create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        btn.disabled = false; btn.textContent = POS.test ? t('保存销售记录（测试模式）', 'Save sale (test mode)') : t('保存正式销售记录', 'Save formal sale');
        if (j && j.message) { toast(j.message); return; }
        toast(t('已保存：', 'Saved: ') + j.order_no);
        POS.lastSale = j;
        renderPosAfter(j);
        posRecordPayIfAny(j); // 收款安排：本次实收 > 0 时立即落收款台账（全款/定金/分次首笔）
        if (window.loadShopOrders) loadShopOrders();
        POS.items = []; renderPosCart();
      })
      .catch(function () { btn.disabled = false; btn.textContent = t('保存失败，再试', 'Save failed'); });
  }

  function renderPlanInputs() { // 收款安排输入区：全款自动记、定金+尾款各一框（她 15:01 补充）、分次收本次实收
    var box = document.getElementById('pos-plan-inputs');
    if (!box) return;
    if (POS.payPlan === 'full') {
      box.innerHTML = '<span style="font-size:13px;color:var(--muted,#A88E9B);">' + t('保存即记全款（应收全额）', 'full amount recorded on save') + '</span>';
    } else if (POS.payPlan === 'deposit') {
      box.innerHTML =
        '<input id="pos-deposit" type="number" min="0" step="0.01" placeholder="' + t('定金 $（现在收）', 'Deposit $ (now)') + '" style="width:120px;">' +
        '<input id="pos-final" type="number" min="0" step="0.01" placeholder="' + t('尾款 $（如当场收清，否则留空）', 'Final $ (or leave empty)') + '" style="width:150px;">';
    } else {
      box.innerHTML = '<input id="pos-paynow" type="number" min="0" step="0.01" placeholder="' + t('本次实收 $（选填）', 'Received now $ (optional)') + '" style="width:140px;">';
    }
  }
  function posRecordPayIfAny(j) { // 收款安排落地：按模式写 shop_pay_record_add（定金/尾款两框→分别落账，她 15:01 补充）
    var chain = Promise.resolve();
    var total = j.total;
    function over(k, amt) { if (total && amt > total + 0.005) { toast(t('金额超过应收，请核对：' + k + ' $' + fmtMoney(amt), 'Exceeds total')); return true; } return false; }
    if (POS.payPlan === 'full') {
      chain = chain.then(function () { return posRecordPay(j.order_id, j.order_no, total, 'full', total, POS.channel); });
    } else if (POS.payPlan === 'deposit') {
      var dep = parseFloat((document.getElementById('pos-deposit') || {}).value);
      var fin = parseFloat((document.getElementById('pos-final') || {}).value);
      if (isFinite(dep) && dep > 0 && !over('定金', dep)) {
        chain = chain.then(function () { return posRecordPay(j.order_id, j.order_no, total, 'deposit', dep, POS.channel); });
      }
      if (isFinite(fin) && fin > 0 && !over('尾款', fin)) {
        chain = chain.then(function () { return posRecordPay(j.order_id, j.order_no, total, 'final', fin, POS.channel); });
      }
    } else {
      var payNow = parseFloat((document.getElementById('pos-paynow') || {}).value);
      if (isFinite(payNow) && payNow > 0 && !over('本次实收', payNow)) {
        chain = chain.then(function () { return posRecordPay(j.order_id, j.order_no, total, 'installment', payNow, POS.channel); });
      }
    }
    return chain;
  }
  var PLAN_LABEL = { full: '全款', deposit: '定金', final: '尾款', installment: '分次付款' };
  function posRecordPay(orderId, orderNo, total, kind, amount, method) { // 落台账+回显；whitelist 未扩展前自动降级（full→other、wechat/alipay→other）
    var line = document.getElementById('pos-pay-line');
    function payMsg(html) { if (line) { var d = document.createElement('div'); d.innerHTML = html; line.appendChild(d); } }
    function call(k, m) {
      return api('rpc/shop_pay_record_add', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_order_id: orderId, p_kind: k, p_amount: amount, p_method: m, p_note: PLAN_LABEL[kind] || '' }) })
        .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('rpc')); });
    }
    return call(kind, method)
      .catch(function () { return call(kind === 'full' ? 'other' : kind, (method === 'wechat' || method === 'alipay') ? 'other' : method); }) // 兼容未跑扩展脚本时的旧白名单
      .then(function (res) {
        var rem = res && res.outstanding != null ? res.outstanding : null;
        toast(t('已记录' + (PLAN_LABEL[kind] || '收款') + ' $' + fmtMoney(amount) + (rem != null && rem > 0.005 ? '，待收 $' + fmtMoney(rem) : '，已结清'), 'Recorded payment'));
        payMsg('<span style="color:var(--text,#604C57);">' + t('已记录', 'Recorded') + ' ' + (PLAN_LABEL[kind] || '收款') + ' <b style="color:var(--price,#ff6fa5);">$' + fmtMoney(amount) + '</b>' +
          (rem != null && rem > 0.005 ? ' · ' + t('待收', 'Outstanding') + ' <b style="color:#f3b96d;">$' + fmtMoney(rem) + '</b>（' + t('后续收款去订单管理该订单卡里继续记', 'record the rest in order manager') + '）' : ' · <b style="color:var(--price,#ff6fa5);">' + t('已结清', 'Settled') + '</b>') + '</span>');
        if (window.loadShopOrders) loadShopOrders();
      })
      .catch(function () {
        toast(t('收款记录保存失败，可稍后在订单管理里补记', 'Save failed, record later in order manager'));
        payMsg('<span style="color:#8a6d3b;">' + t((PLAN_LABEL[kind] || '收款') + '记录没存上（可稍后在订单管理补记）', 'Payment not saved (retry in order manager)') + '</span>');
      });
  }

  function renderPosAfter(j) {
    var box = document.getElementById('pos-after');
    box.innerHTML =
      '<div class="card" style="padding:14px 16px;border:1.5px solid var(--accent-soft,#FCE4EC);">' +
        '<div style="font-size:15px;font-weight:700;color:var(--text,#604C57);">' + t('销售编号', 'Sale No.') + '：<span style="color:var(--price,#ff6fa5);">' + esc(j.order_no) + '</span>' + (POS.test ? ' <span style="font-size:12px;padding:2px 10px;border-radius:999px;background:#fff7f0;border:1px solid #f0d9c0;color:#8a6d3b;">TEST 测试模式</span>' : '') + '</div>' +
        '<div style="font-size:14px;color:var(--muted,#A88E9B);margin:4px 0 10px;">' + t('应收', 'Total') + ' $' + fmtMoney(j.total) + ' · ' + t('付款方式', 'Channel') + ' ' + POS.channel + ' · ' + t('收款安排', 'Plan') + ' ' + (PLAN_LABEL[POS.payPlan] || '全款') + '</div>' +
        '<div id="pos-pay-line" style="margin:0 0 10px;font-size:14px;"></div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
          '<button class="btn-save-tb pos-confirm">' + t('✓ 确认已收款', 'Confirm received') + '</button>' +
          (POS.channel === 'stripe' ? '<button class="btn-mini pos-stripe">' + t('生成 Stripe 测试付款链接 + 二维码', 'Stripe test link + QR') + '</button>' : '') +
          '<button class="btn-mini pos-cancel">' + t('取消本笔（回补库存）', 'Cancel (restock)') + '</button>' +
        '</div>' +
        '<div class="pos-stripe-box" style="margin-top:10px;"></div>' +
      '</div>';
    box.querySelector('.pos-confirm').addEventListener('click', function () {
      uiConfirm(t('确认已经实际收到这笔钱了吗？（现金/转账请核对到账）', 'Confirm money actually received?'), function () {
        api('rpc/shop_pos_confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ p_order_id: j.order_id }) })
          .then(function (r) { return r.json(); })
          .then(function (x) { if (x && x.message) { toast(x.message); return; } toast(t('已确认收款 ✓', 'Confirmed')); box.querySelector('.pos-confirm').disabled = true; });
      });
    });
    box.querySelector('.pos-cancel').addEventListener('click', function () {
      uiConfirm(t('取消这笔线下销售？已扣的库存会加回去。', 'Cancel this sale? Stock will be restored.'), function () {
        api('rpc/shop_pos_confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ p_order_id: j.order_id, p_cancel: true }) })
          .then(function (r) { return r.json(); })
          .then(function (x) { if (x && x.message) { toast(x.message); return; } toast(t('已取消，库存已回补', 'Cancelled')); box.remove(); });
      });
    });
    var sb = box.querySelector('.pos-stripe');
    if (sb) sb.addEventListener('click', function () {
      var sbox = box.querySelector('.pos-stripe-box');
      sbox.innerHTML = '<p style="color:var(--muted,#A88E9B);font-size:14px;">' + t('正在创建 Stripe 测试付款链接…', 'Creating Stripe test link…') + '</p>';
      var adminAt = (typeof ACCESS !== 'undefined' && ACCESS) || (function () { try { return (JSON.parse(localStorage.getItem('yuki-admin-session') || 'null') || {}).a || ''; } catch (e) { return ''; } })();
      fetch(SUPA + '/functions/v1/stripe-checkout', {
        method: 'POST',
        headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + adminAt, 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: j.order_id, origin: location.origin })
      }).then(function (r) { return r.json().then(function (x) { return { ok: r.ok, x: x }; }); }).then(function (res) {
        if (!res.ok || !res.x.url) { sbox.innerHTML = '<div class="warn" style="background:#fff7f0;border:1px solid #f0d9c0;color:#8a6d3b;font-size:13px;border-radius:10px;padding:8px 12px;">' + t('付款链接创建失败：', 'Link failed: ') + esc((res.x && (res.x.error || res.x.message)) || '未知错误') + '</div>'; return; }
        sbox.innerHTML =
          '<div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap;">' +
            '<img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=' + encodeURIComponent(res.x.url) + '" alt="QR" style="width:150px;height:150px;border-radius:12px;border:1px solid var(--accent-soft,#FCE4EC);">' +
            '<div style="flex:1;min-width:200px;font-size:13px;word-break:break-all;color:var(--text,#604C57);">' +
              '<b>TEST</b> ' + t('测试付款链接（手机扫码或复制打开，测试卡 4242…，不产生真实扣款）：', 'Test link (no real charge):') + '<br>' +
              '<a href="' + escAttr(res.x.url) + '" target="_blank" style="color:var(--accent-strong,#A04A68);text-decoration:underline;">' + esc(res.x.url.slice(0, 60)) + '…</a>' +
            '</div></div>';
      }).catch(function () { sbox.innerHTML = '<p style="color:var(--danger,#D96570);font-size:14px;">' + t('网络异常，再试一次', 'Network error') + '</p>'; });
    });
  }

  /* ═══════════ 邮件与联系人同步设置 ═══════════ */
  CRM.bootMailsync = function () {
    var panel = document.getElementById('tab-mailsync');
    if (panel.dataset.booted) return;
    panel.dataset.booted = '1';
    panel.innerHTML =
      '<style>#tab-mailsync .chip { margin: 0 10px 0 0; } /* 胶囊之间留出空隙（她 20261027 14:40）*/</style>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:22px;align-items:stretch;">' +
        '<div class="card" style="padding:24px 26px;display:flex;flex-direction:column;">' +
          '<h3 style="margin:0 0 14px;font-size:18px;color:var(--text,#604C57);">' + t('Gmail 自动分类（过滤器方案）', 'Gmail auto labels (filters)') + '</h3>' +
          '<p style="font-size:15px;color:var(--muted,#A88E9B);line-height:1.8;margin-bottom:16px;">' + t('默认只加标签，不删邮件、不动收件箱。以下过滤器待你完成 Google OAuth 授权后一键创建：', 'Labels only — nothing deleted. Filters created after you authorize Google OAuth:') + '</p>' +
          '<div style="font-size:15px;color:var(--text,#604C57);line-height:2.4;">' + /* 行高从 2.7 收到 2.4，胶囊不再被椑高（配合 .chip 自身 line-height 锡1.5）*/
            '<span class="chip on">Snow Yuzu/订单</span> ' + t('主题含「订单确认 / 付款成功」', 'subject: order confirm/paid') + '<br>' +
            '<span class="chip on">Snow Yuzu/发货</span> ' + t('主题含「订单已发货」', 'subject: shipped') + '<br>' +
            '<span class="chip on">Snow Yuzu/取消退款</span> ' + t('主题含「退款通知 / 订单已取消」', 'subject: refund/cancel') + '<br>' +
            '<span class="chip on">Snow Yuzu/新品上架</span> ' + t('主题含「新品上架」', 'subject: new item') + '<br>' +
            '<span class="chip on">Snow Yuzu/客户留言</span> ' + t('后台留言通知', 'contact notice') + '<br>' +
            '<span class="chip on">Snow Yuzu/VIP会员</span> ' + t('VIP 变更通知', 'VIP notice') +
          '</div>' +
          '<div style="font-size:14px;color:#8a6d3b;background:#fff7f0;border:1px solid #f0d9c0;border-radius:10px;padding:14px 16px;margin-top:auto;line-height:1.8;">' + t('需要 Google OAuth 授权（gmail.labels + gmail.filters）。SMTP 发信权限不等于邮箱管理权限——等你授权，我不会动你的邮箱。', 'Needs your Google OAuth (gmail.labels+filters). SMTP access is NOT mailbox access — nothing touched until you authorize.') + '</div>' +
        '</div>' +
        '<div class="card" style="padding:24px 26px;display:flex;flex-direction:column;">' +
          '<h3 style="margin:0 0 14px;font-size:18px;color:var(--text,#604C57);">' + t('Google Contacts 联系人同步（默认关）', 'Google Contacts sync (off)') + '</h3>' +
          '<div style="font-size:15px;color:var(--text,#604C57);line-height:2.2;display:grid;gap:10px;">' +
            t('同步范围：仅「已同意接收通知」的客户；字段：姓名 / 邮箱 / 电话。', 'Scope: only customers who agreed to notices; fields: name/email/phone.') + '<br>' +
            t('匹配：按邮箱精确匹配，已存在只更新不重建。', 'Match by exact email; update, never duplicate.') + '<br>' +
            '<div style="display:flex;flex-wrap:wrap;gap:0;align-items:center;">' + t('联系人标签：', 'Contact labels: ') + '<span class="chip on">Snow Yuzu/普通客户</span><span class="chip on">Snow Yuzu/VIP</span><span class="chip on">Snow Yuzu/回头客</span></div>' + /* 包 flex 防 grid 拉伸；间距靠 .chip margin（她 20261027 14:40 报撑满）*/
          '</div>' +
          '<div id="ms-sync-state" style="margin-top:18px;"></div>' +
          '<div id="ms-oauth" style="margin-top:16px;"></div>' +
          '<div style="font-size:14px;color:#8a6d3b;background:#fff7f0;border:1px solid #f0d9c0;border-radius:10px;padding:14px 16px;margin-top:auto;line-height:1.8;">' + t('必须等你本人完成 Google 授权后才会开启真实同步；现有 Google 联系人不会被修改或删除。Gmail 标签（邮件）≠ Contacts 标签（人物），两套分开。', 'Real sync waits for your authorization. Existing contacts untouched. Gmail labels ≠ Contacts labels.') + '</div>' +
        '</div>' +
      '</div>';
    loadSyncState();
    loadOAuth();
    // OAuth 回调返回提示（回调 URL：admin.html?oauth=ok&email=…#mailsync）
    var mo = new URLSearchParams(location.search).get('oauth');
    if (mo === 'ok') { toast(t('Google 账号已连接 ✓', 'Google account connected ✓')); }
    else if (mo === 'error') { var mm = decodeURIComponent(new URLSearchParams(location.search).get('msg') || ''); uiConfirm(t('连接未完成：' + mm, 'Connect failed: ' + mm), function () {}); }
    if (mo) history.replaceState(null, '', location.pathname + location.hash);
  };

  /* ── Google OAuth 连接区（真功能：授权/同步/断开；后端 google-oauth Edge Function）── */
  function msAdminJwt() {
    return (typeof ACCESS !== 'undefined' && ACCESS) || (function () { try { return (JSON.parse(localStorage.getItem('yuki-admin-session') || 'null') || {}).a || ''; } catch (e) { return ''; } })();
  }
  function msApi(action, opts) {
    opts = opts || {};
    return fetch(SUPA + '/functions/v1/google-oauth?action=' + action, {
      method: opts.method || 'GET',
      headers: { 'Authorization': 'Bearer ' + msAdminJwt(), 'Content-Type': 'application/json' },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); });
  }
  function loadOAuth() {
    var box = document.getElementById('ms-oauth');
    if (!box) return;
    msApi('status').then(function (r) {
      if (!r.ok || r.j.error) { box.innerHTML = '<p style="font-size:14px;color:var(--muted,#A88E9B);">' + t('连接状态读取失败：', 'Status load failed: ') + ((r.j && r.j.error) || '网络异常') + '</p>'; return; }
      var st = r.j;
      if (!st.connected) {
        box.innerHTML =
          '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">' +
            '<button class="btn-save-tb" id="ms-connect">' + t('连接 Google 账号', 'Connect Google account') + '</button>' +
            '<span style="font-size:13px;color:var(--muted,#A88E9B);">' + t('未连接', 'Not connected') + '</span>' +
          '</div>' +
          (!st.configured ? '<p style="font-size:13px;color:#8a6d3b;background:#fff7f0;border:1px solid #f0d9c0;border-radius:10px;padding:8px 12px;margin-top:10px;">' + t('后端 Google 凭据尚未配置完成，连接按钮暂时不可用。', 'Backend Google credentials not ready yet.') + '</p>' : '');
        var cb = box.querySelector('#ms-connect');
        if (cb) cb.addEventListener('click', function () {
          cb.disabled = true;
          msApi('start').then(function (r2) {
            if (!r2.ok || !r2.j.url) { toast(r2.j.error || t('发起授权失败', 'Failed to start auth')); cb.disabled = false; return; }
            location.href = r2.j.url; // 跳 Google 官方授权页，回来时自动刷新本页
          });
        });
        return;
      }
      box.innerHTML =
        '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:15px;color:var(--text,#604C57);">' +
          '<span class="chip on">✓ ' + escAttr(st.email || 'Google') + '</span>' +
          '<button class="btn-save-tb" id="ms-sync-dry">' + t('同步联系人', 'Sync contacts') + '</button>' +
          '<button class="btn-mini" id="ms-filters">' + t('一键创建 Gmail 标签过滤器', 'Create Gmail labels & filters') + '</button>' +
          '<button class="btn-del" id="ms-disconnect">' + t('断开连接', 'Disconnect') + '</button>' +
        '</div>' +
        '<div id="ms-sync-result" style="margin-top:12px;"></div>';
      box.querySelector('#ms-sync-dry').addEventListener('click', function () {
        var btn = this; btn.disabled = true;
        msApi('sync', { method: 'POST', body: { dry: true } }).then(function (r) {
          btn.disabled = false;
          var res = document.getElementById('ms-sync-result');
          if (!r.ok) { res.innerHTML = '<p style="font-size:14px;color:var(--danger,#D96570);">' + ((r.j && r.j.error) || '失败') + '</p>'; return; }
          var pv = (r.j.preview || []).map(function (p) { return '<span style="font-size:13px;color:var(--muted,#A88E9B);">' + escAttr(p.name || p.email) + ' → ' + escAttr(p.group || '') + '</span>'; }).join('<br>');
          res.innerHTML =
            '<div style="font-size:14px;color:var(--text,#604C57);background:var(--bg,#FFFBFC);border:1px solid var(--border,#FFD9E6);border-radius:12px;padding:12px 14px;">' +
              '<b>' + t('本次同步预计：', 'Preview: ') + '</b>' +
              t('新增 ' + r.j.created + ' 人，补全 ' + r.j.updated + ' 人，已完整跳过 ' + r.j.skipped + ' 人（共 ' + r.j.total + ' 位同意接收通知的客户）', '+' + r.j.created + ' new, ' + r.j.updated + ' to update, ' + r.j.skipped + ' unchanged, of ' + r.j.total + ' opted-in customers') +
              (pv ? '<br><br><b>' + t('将新增：', 'New: ') + '</b><br>' + pv : '') +
              '<div style="margin-top:10px;display:flex;gap:10px;flex-wrap:wrap;">' +
                '<button class="btn-ok" id="ms-sync-go">' + t('确认真正同步', 'Confirm & sync') + '</button>' +
                '<button class="btn-mini" id="ms-sync-cancel">' + t('先不同步', 'Not now') + '</button>' +
              '</div>' +
            '</div>';
          res.querySelector('#ms-sync-cancel').addEventListener('click', function () { res.innerHTML = ''; });
          res.querySelector('#ms-sync-go').addEventListener('click', function () {
            var go = this; go.disabled = true; go.textContent = t('同步中…', 'Syncing…');
            msApi('sync', { method: 'POST', body: { dry: false } }).then(function (r2) {
              go.disabled = false; go.textContent = t('确认真正同步', 'Confirm & sync');
              if (!r2.ok) { toast(r2.j.error || t('同步失败', 'Sync failed')); return; }
              toast(t('同步完成：新增 ' + r2.j.created + '，补全 ' + r2.j.updated + '，跳过 ' + r2.j.skipped, 'Done: +' + r2.j.created + ' / ~' + r2.j.updated + ' / =' + r2.j.skipped));
              res.innerHTML = '';
            });
          });
        });
      });
      box.querySelector('#ms-filters').addEventListener('click', function () {
        var btn = this; btn.disabled = true;
        uiConfirm(t('将在你的 Gmail 里创建 6 个「Snow Yuzu/…」标签和对应过滤器（只加标签，不删邮件、不动收件箱；已有同名的会跳过）。继续吗？', 'Creates 6 Snow Yuzu labels + filters in your Gmail (labels only). Continue?'), function () {
          msApi('filters').then(function (r) {
            btn.disabled = false;
            if (!r.ok) { toast(r.j.error || t('创建失败', 'Failed')); return; }
            toast(t('Gmail 标签与过滤器已就绪 ✓', 'Gmail labels & filters ready ✓'));
          });
        });
        btn.disabled = false;
      });
      box.querySelector('#ms-disconnect').addEventListener('click', function () {
        uiConfirm(t('断开后联系人同步和 Gmail 分类都会停止；已同步到 Google 的联系人不会被删除。确认断开？', 'Disconnect stops syncing; already-synced contacts stay. Confirm?'), function () {
          msApi('disconnect').then(function () { toast(t('已断开', 'Disconnected')); loadSyncState(); loadOAuth(); });
        });
      });
    });
  }

  function loadSyncState() {
    var box = document.getElementById('ms-sync-state');
    api('site_settings?key=eq.crm_sync&select=value').then(function (r) { return r.json(); }).then(function (rows) {
      var raw = (rows && rows[0] && rows[0].value) || '';
      try { raw = JSON.parse(raw); } catch (e) {}
      var st = (raw && typeof raw === 'object') ? raw : {};
      box.innerHTML =
        '<div style="display:flex;align-items:center;gap:14px;font-size:15px;color:var(--text,#604C57);flex-wrap:wrap;">' +
          '<span>' + t('同步开关', 'Sync switch') + '</span>' +
          '<span style="font-size:13px;padding:4px 16px;border-radius:999px;border:1.5px solid ' + (st.enabled ? 'transparent;background:var(--accent-soft,#FCE4EC);color:var(--accent-strong,#A04A68);' : '#e8d8e0;background:#fff;color:var(--muted,#A88E9B);') + 'font-weight:600;display:inline-flex;align-items:center;">' + (st.enabled ? t('已开启（待授权）', 'Enabled (pending auth)') : t('关闭', 'Off')) + '</span>' +
          '<button class="btn-mini" id="ms-toggle">' + (st.enabled ? t('关闭', 'Turn off') : t('开启', 'Turn on')) + '</button>' +
        '</div>' +
        '<div style="font-size:13px;color:var(--muted,#A88E9B);margin-top:14px;">' + t('状态：', 'Status: ') + (st.oauth_done ? t('Google 已授权，同步就绪', 'Google authorized, ready') : t('等待柚子完成 Google OAuth 授权', 'Waiting for your Google OAuth authorization')) + '</div>';
      box.querySelector('#ms-toggle').addEventListener('click', function () {
        var next = { enabled: !(st && st.enabled), oauth_done: false, updated: new Date().toISOString() };
        api('site_settings', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates' }, body: JSON.stringify({ key: 'crm_sync', value: next }) })
          .then(function (r) { if (!r.ok) { toast(t('保存失败', 'Save failed')); return; } toast(t('已更新（真实同步仍需 Google 授权）', 'Updated (real sync still needs auth)')); loadSyncState(); });
      });
    });
  }

  /* ═══════════ 邮件模板管理 ═══════════ */
  var TPL = {
    kinds: [
      { key: 'order_confirm', name: t('订单确认 / 付款成功', 'Order confirm / paid'), desc: t('买家下单、付款成功后自动发送', 'Sent after order placed / paid') },
      { key: 'order_shipped', name: t('订单已发货', 'Order shipped'), desc: t('填写物流单号发货后自动发送', 'Sent when shipped with tracking no.') },
      { key: 'order_refund', name: t('退款通知', 'Refund notice'), desc: t('退款处理完成后自动发送', 'Sent after refund processed') },
      { key: 'order_cancel', name: t('订单取消', 'Order cancelled'), desc: t('订单取消时自动发送', 'Sent when order cancelled') },
      { key: 'new_product', name: t('新品上架通知', 'New item notice'), desc: t('新品上架时发给订阅买家（带退订）', 'To subscribers (with unsubscribe)') },
      { key: 'contact_reply', name: t('客户留言回复', 'Message reply'), desc: t('站长回复客户留言时发送', 'Sent when you reply to a message') },
      { key: 'vip_notice', name: t('VIP 会员变更通知', 'VIP change notice'), desc: t('VIP 设定或到期提醒时发送', 'Sent on VIP set / expiry reminder') },
      { key: 'order_paid', name: t('付款确认', 'Payment received'), desc: t('定金/尾款/分期到账时发送（与下单确认分开）', 'Sent when a deposit / final / installment arrives') },
      { key: 'deposit_reminder', name: t('定金/尾款催付提醒', 'Payment reminder'), desc: t('定金或尾款逾期未付时发送', 'Sent when deposit / final payment is overdue') },
      { key: 'order_risk', name: t('大额订单确认', 'Large-order check'), desc: t('大额/高风险订单发货前的人工确认', 'Manual confirmation before shipping a large / risky order') },
      { key: 'out_of_stock', name: t('缺货通知', 'Out of stock'), desc: t('商品缺货需等待或换品时发送', 'Sent when an item is out of stock') },
      { key: 'restock_notice', name: t('补货到货通知', 'Restock notice'), desc: t('缺货商品重新到货时发送（带退订）', 'Sent when a restocked item is back (with unsubscribe)') },
      { key: 'shipped_delay', name: t('发货延迟通知', 'Shipping delay'), desc: t('预计发货时间需要顺延肘发送', 'Sent when the ship date has to be pushed back') },
      { key: 'package_exception', name: t('包裹异常/清关通知', 'Package exception'), desc: t('物流异常、海关扣留等需要买家配合时发送', 'Sent when a package needs buyer action (customs, exception)') },
      { key: 'delivered_notice', name: t('签收提醒', 'Delivery reminder'), desc: t('物流显示已签收后发送确认与售后提醒', 'Sent after delivery confirmed') },
      { key: 'review_invite', name: t('晒单/好评邀请', 'Review invite'), desc: t('签收几天后邀请晒单（带退订）', 'Sent days after delivery (with unsubscribe)') },
      { key: 'birthday', name: t('生日祝福', 'Birthday wish'), desc: t('客户生日当天自动发送（可在客户资料设置生日）', 'Sent automatically on the customer\'s birthday (set it in customer profile)') }
    ],
    vars: [
      ['{{客户称呼}}', t('买家称呼或昵称', 'Buyer name/nick')],
      ['{{订单编号}}', t('订单号，如 SY-001', 'e.g. SY-001')],
      ['{{商品名称}}', t('商品名，多件逐行', 'Product name(s)')],
      ['{{订单金额}}', t('如 $52.00', 'e.g. $52.00')],
      ['{{付款金额}}', t('本次到账的定金/尾款/分期金额', 'Amount received this time')],
      ['{{欠款金额}}', t('剩余应付金额', 'Outstanding amount')],
      ['{{付款链接}}', t('Stripe 支付链接', 'Payment link')],
      ['{{预计发货日期}}', t('如 11 月 5 日前', 'Expected ship date')],
      ['{{物流单号}}', t('快递单号', 'Tracking number')],
      ['{{店铺链接}}', t('小铺首页链接', 'Shop URL')],
      ['{{留言内容}}', t('客户留言原文', 'Customer message')],
      ['{{站长回复}}', t('你的回复内容', 'Your reply')]
    ],
    lang: 'zh', kind: 'order_confirm', saved: {}, dirty: false
  };

  function tplDefault(kind, lang) {
    var shop = 'https://yukicheng.com/shop/';
    var D = {
      order_confirm: {
        zh: { subject: '订单收到啦！{{订单编号}} ♡ · Snow Yuzu', body: '呀～{{客户称呼}}的订单顺利收到啦！(˶ᵔ ᵕ ᵔ˶)♡\n\n谢谢你来 Snow Yuzu 小铺逛逛，也谢谢你把喜欢的小东西带回家！\n\n订单编号：{{订单编号}}\n这次下单的商品：{{商品名称}}\n订单金额：{{订单金额}}\n\n我会尽快确认订单的付款情况，之后再继续安排订单的准备工作哦。如果有任何问题，可以直接回复这封邮件来找我呀～\n\n希望这份小小的期待，能给你带来一点快乐 ₍ᐢ.ˬ.ᐢ₎♡\n— Snow Yuzu ♡' },
        en: { subject: 'We Got Your Order! ♡ {{订单编号}} · Snow Yuzu', body: 'Hi {{客户称呼}}! Yay, your order came through! (˶ᵔ ᵕ ᵔ˶)♡\n\nThank you for stopping by Snow Yuzu and picking out something special!\n\nOrder No.: {{订单编号}}\nItems: {{商品名称}}\nTotal: {{订单金额}}\n\nI\'ll check your payment and get everything ready for the next step. I\'ll keep you posted as your order moves along!\n\nHave a question? Just hit reply. I\'m happy to help ♡\n— Snow Yuzu ♡' }
      },
      order_shipped: {
        zh: { subject: '你的包裹出发啦！{{订单编号}} ♡ · Snow Yuzu', body: '叮咚！{{客户称呼}}的包裹出发啦！(ﾉ˶>ᗜ<˵)ﾉ♡\n\n订单 {{订单编号}} 的小包裹已经交给快递公司啦，希望它能平平安安、顺顺利利地跑到你身边！\n\n物流单号：{{物流单号}}\n\n记得留意一下物流更新哦～如果有任何问题，也可以直接回复这封邮件来找我。\n\n希望你拆开包裹的时候会很开心呀 ₍ᐢ.ˬ.ᐢ₎♡\n— Snow Yuzu ♡' },
        en: { subject: 'Your Little Package Is on Its Way! ♡ {{订单编号}} · Snow Yuzu', body: 'It\'s shipping day, {{客户称呼}}! Your package is on its way! (˶ᵔ ᵕ ᵔ˶)♡\n\nYour goodies from order {{订单编号}} have been handed over to the carrier, and they\'re officially on their way to you!\n\nTracking No.: {{物流单号}}\n\nYou can follow its journey with the tracking number above. If anything looks unusual, just reply to this email!\n\nHope your package arrives safe and sound and makes your day a little brighter ₍ᐢ.ˬ.ᐢ₎♡\n— Snow Yuzu ♡' }
      },
      order_refund: {
        zh: { subject: '关于你的退款，来跟你说一声呀 ♡ · Snow Yuzu', body: '{{客户称呼}}，来跟你更新一下订单的退款情况哦 (｡•́︿•̀｡)\n\n订单 {{订单编号}} 的退款已经处理啦，退款金额 {{订单金额}} 会原路退回。\n\n具体到账时间取决于支付渠道，一般 1-5 个工作日。如果暂时还没看到退款记录，可以稍后再查看一下；如果有疑问，也可以直接回复这封邮件，我会尽力帮你确认情况呀。\n\n抱歉这次没能让你拥有完美的购物体验，也谢谢你的理解 ♡\n— Snow Yuzu ♡' },
        en: { subject: 'A Little Update About Your Refund ♡ · Snow Yuzu', body: 'Hi {{客户称呼}}, just a little update about your order (｡•́︿•̀｡)\n\nThe refund for order {{订单编号}} has been processed. The amount {{订单金额}} will be returned via the original payment method.\n\nIt usually takes 1-5 business days depending on your payment provider. If you don\'t see it just yet, please give it a little time. If you have any questions, simply reply to this email and I\'ll do my best to help!\n\nI\'m sorry things didn\'t go as smoothly as hoped, and I really appreciate your understanding ♡\n— Snow Yuzu ♡' }
      },
      order_cancel: {
        zh: { subject: '关于订单 {{订单编号}} 的小通知 · Snow Yuzu', body: '{{客户称呼}}，来跟你说一下订单的情况呀 (｡•ᴗ•｡)\n\n订单 {{订单编号}} 已经取消啦，订单金额 {{订单金额}} 不会产生扣款（已付款的部分会原路退回）。\n\n如果不是你本人操作的取消，或者你觉得哪里不太对，可以直接回复这封邮件来找我，我会尽力帮你确认情况的～\n\n希望下次还能见到你呀！\n— Snow Yuzu ♡' },
        en: { subject: 'A Little Update About Order {{订单编号}} · Snow Yuzu', body: 'Hi {{客户称呼}}! Just a quick update about your order (｡•ᴗ•｡)\n\nOrder {{订单编号}} has been cancelled. No charge will be made for {{订单金额}} (paid amounts will be refunded via the original method).\n\nIf you didn\'t request this cancellation or something doesn\'t look right, just reply to this email and I\'ll help you check what happened.\n\nHope to see you next time!\n— Snow Yuzu ♡' }
      },
      new_product: {
        zh: { subject: '小铺上新啦！{{商品名称}} 来咯 ♡ · Snow Yuzu', body: '嘿嘿，{{客户称呼}}，今天小铺有新朋友来报到啦！(˶ᵔ ᵕ ᵔ˶)♡\n\n这次上新的是：{{商品名称}}\n\n喜欢的话就来看看嘛～说不定它就是你一直在找的小可爱呢：{{店铺链接}}\n\n如果不想再收到新品通知，可以用邮件底部的退订链接一键退订，订单邮件不受影响哦。\n\n希望你能找到喜欢的小东西呀！\n— Snow Yuzu ♡' },
        en: { subject: 'A New Little Cutie Is Here! ♡ {{商品名称}} · Snow Yuzu', body: 'Hi {{客户称呼}}! Guess what? There\'s a new little cutie in the shop! (˶ᵔ ᵕ ᵔ˶)♡\n\nMeet our newest arrival: {{商品名称}}\n\nCurious? Come take a little look: {{店铺链接}}\n\nIf you no longer wish to receive new item notices, use the Unsubscribe link at the bottom. Order emails are not affected.\n\nHope you find something you love!\n— Snow Yuzu ♡' }
      },
      contact_reply: {
        zh: { subject: '你的留言有回复啦 ♡ · Snow Yuzu', body: '{{客户称呼}}，你的留言有回复啦！(˶ᵔ ᵕ ᵔ˶)♡\n\n当时你留言说：{{留言内容}}\n\n柚子的回复：\n{{站长回复}}\n\n如果还有想聊的，随时再来留言呀：{{店铺链接}}\n\n— Snow Yuzu 的小店主 ♡' },
        en: { subject: 'New Reply to Your Message ♡ · Snow Yuzu', body: 'Hi {{客户称呼}}, your message has a new reply! (˶ᵔ ᵕ ᵔ˶)♡\n\nYou wrote: {{留言内容}}\n\nYuki\'s reply:\n{{站长回复}}\n\nFeel free to keep the conversation going: {{店铺链接}}\n\n— Snow Yuzu\'s little shopkeeper ♡' }
      },
      vip_notice: {
        zh: { subject: '你的 VIP 会员有小更新啦 ♡ · Snow Yuzu', body: '{{客户称呼}}，来跟你说一声～你的 Snow Yuzu VIP 会员状态有更新啦！\n\n详情请到小铺看看：{{店铺链接}}\n\n谢谢你的喜欢与支持，每次你来逛逛我们都很开心 ♡\n— Snow Yuzu ♡' },
        en: { subject: 'A Little VIP Update for You ♡ · Snow Yuzu', body: 'Hi {{客户称呼}}! Just letting you know — your Snow Yuzu VIP membership has been updated!\n\nSee your shop page for details: {{店铺链接}}\n\nThank you for your support — we\'re always happy when you stop by ♡\n— Snow Yuzu ♡' }
      },
      order_paid: {
        zh: { subject: '收到付款啦！{{订单编号}} ♡ · Snow Yuzu', body: '好耶！{{客户称呼}}，来告诉你一个好消息～(˶˃ ᵕ ˂˶)♡\n\n订单 {{订单编号}} 有一笔付款已经确认到账：\n本次到账：{{付款金额}}\n剩余应付：{{欠款金额}}\n\n全部付清后我们就会排进制作队列，谢谢你的耐心等待～小小的期待正在慢慢准备中 ₍ᐢ.ˬ.ᐢ₎\n— Snow Yuzu ♡' },
        en: { subject: 'Payment Confirmed! ♡ {{订单编号}} · Snow Yuzu', body: 'Yay, {{客户称呼}}! A little good news for you! (˶˃ ᵕ ˂˶)♡\n\nA payment for order {{订单编号}} has been confirmed:\nReceived: {{付款金额}}\nOutstanding: {{欠款金额}}\n\nOnce fully paid, your order will join the making queue. Thank you for your patience!\n— Snow Yuzu ♡' }
      },
      deposit_reminder: {
        zh: { subject: '小小的付款提醒 · {{订单编号}} ♡ · Snow Yuzu', body: '{{客户称呼}}，来小小提醒一下呀～\n\n订单 {{订单编号}} 还有 {{欠款金额}} 待支付。方便的话尽快完成付款，我们就可以尽早为你安排制作啦～\n\n付款链接：{{付款链接}}\n\n如果有任何问题，直接回复这封邮件就好，不用客气呀 ♡\n— Snow Yuzu ♡' },
        en: { subject: 'A Gentle Payment Reminder · {{订单编号}} ♡ · Snow Yuzu', body: 'Hi {{客户称呼}}, just a gentle little reminder!\n\nOrder {{订单编号}} still has {{欠款金额}} outstanding. Completing the payment soon helps us start making your order earlier!\n\nPayment link: {{付款链接}}\n\nIf you have any questions, just reply to this email — happy to help ♡\n— Snow Yuzu ♡' }
      },
      order_risk: {
        zh: { subject: '请确认你的大额订单 · {{订单编号}} ♡ · Snow Yuzu', body: '{{客户称呼}}，谢谢你在 Snow Yuzu 下的大额订单 {{订单编号}}（金额 {{订单金额}}）！(˶ᵔ ᵕ ᵔ˶)\n\n为了保障我们双方，发货前请你回复本邮件确认以下信息：\n1. 订单商品与数量无误\n2. 收货地址正确\n3. 知悉定金/大额订单的退款规则\n\n确认后我们会尽快安排制作与发货，谢谢你的理解呀 ♡\n— Snow Yuzu ♡' },
        en: { subject: 'Please Confirm Your Order · {{订单编号}} ♡ · Snow Yuzu', body: 'Thank you for your large order {{订单编号}} ({{订单金额}}) at Snow Yuzu, {{客户称呼}}! (˶ᵔ ᵕ ᵔ˶)\n\nBefore shipping, please reply to this email to confirm:\n1. Items and quantities are correct\n2. Shipping address is correct\n3. You have read the deposit / large-order refund policy\n\nOnce confirmed, we\'ll prepare and ship your order as soon as possible. Thank you! ♡\n— Snow Yuzu ♡' }
      },
      out_of_stock: {
        zh: { subject: '商品暂时缺货啦 · {{订单编号}} ♡ · Snow Yuzu', body: '{{客户称呼}}，跟你说声抱歉 (｡•́︿•̀｡)\n\n你订单 {{订单编号}} 中的「{{商品名称}}」目前暂时缺货。\n\n你可以选择：\n1. 等待补货（预计 {{预计发货日期}}），一到货我们会第一时间通知你\n2. 更换其他商品\n3. 取消该商品并退款对应金额\n\n回复本邮件告诉我你的选择就好。给你带来不便真的非常抱歉，谢谢你的体谅呀 ♡\n— Snow Yuzu ♡' },
        en: { subject: 'Item Temporarily Out of Stock · {{订单编号}} ♡ · Snow Yuzu', body: 'So sorry, {{客户称呼}} (｡•́︿•̀｡)\n\nThe item "{{商品名称}}" in order {{订单编号}} is temporarily out of stock.\n\nYou can choose to:\n1. Wait for restock (expected {{预计发货日期}}) — we\'ll notify you the moment it\'s back\n2. Swap for another item\n3. Cancel the item and get a refund for that amount\n\nJust reply with your choice. Sorry for the inconvenience, and thank you for your patience ♡\n— Snow Yuzu ♡' }
      },
      restock_notice: {
        zh: { subject: '你等的商品补货啦！{{商品名称}} ♡ · Snow Yuzu', body: '{{客户称呼}}，好消息！(ﾉ˶>ᗜ<˵)ﾉ♡\n\n你之前缺货的「{{商品名称}}」重新到货啦～\n\n数量有限，先到先得：{{店铺链接}}\n\n如果不想再收到补货通知，可以用邮件底部的退订链接一键退订，订单邮件不受影响哦。\n\n— Snow Yuzu ♡' },
        en: { subject: 'Back in Stock! {{商品名称}} ♡ · Snow Yuzu', body: 'Good news, {{客户称呼}}! (ﾉ˶>ᗜ<˵)ﾉ♡\n\n"{{商品名称}}" is back in stock!\n\nLimited quantity, first come first served: {{店铺链接}}\n\nIf you no longer wish to receive restock notices, use the Unsubscribe link at the bottom. Order emails are not affected.\n\n— Snow Yuzu ♡' }
      },
      shipped_delay: {
        zh: { subject: '发货时间要顺延一下 · {{订单编号}} ♡ · Snow Yuzu', body: '{{客户称呼}}，真的非常抱歉 (｡•́︿•̀｡)\n\n你的订单 {{订单编号}} 需要顺延发货，新的预计发货时间为 {{预计发货日期}}。\n\n我们知道等待的滋味不好受，谢谢你的理解与耐心。如果有任何疑问，随时回复这封邮件来找我呀 ♡\n— Snow Yuzu ♡' },
        en: { subject: 'A Shipping Delay for Order {{订单编号}} ♡ · Snow Yuzu', body: 'We\'re truly sorry, {{客户称呼}} (｡•́︿•̀｡)\n\nOrder {{订单编号}} needs a shipping delay. The new expected ship date is {{预计发货日期}}.\n\nWe know waiting is hard, and we truly appreciate your understanding. Feel free to reply if you have any questions ♡\n— Snow Yuzu ♡' }
      },
      package_exception: {
        zh: { subject: '包裹需要你的协助 · {{订单编号}} ♡ · Snow Yuzu', body: '{{客户称呼}}，你的订单 {{订单编号}} 的包裹在运输途中遇到一点小状况（如海关扣留、地址问题等）。\n\n物流单号：{{物流单号}}\n\n可能需要你配合提供信息或支付关税，请留意快递公司的通知，或直接回复本邮件，我会协助你处理，不用太担心呀 ♡\n— Snow Yuzu ♡' },
        en: { subject: 'Your Package Needs a Little Help · {{订单编号}} ♡ · Snow Yuzu', body: 'Hi {{客户称呼}}, the package of order {{订单编号}} has hit an exception in transit (customs hold, address issue, etc.).\n\nTracking No.: {{物流单号}}\n\nYou may need to provide information or pay customs fees. Please watch for carrier notices, or reply to this email and I\'ll help you sort it out — no worries ♡\n— Snow Yuzu ♡' }
      },
      delivered_notice: {
        zh: { subject: '包裹签收啦！{{订单编号}} ♡ · Snow Yuzu', body: '{{客户称呼}}，物流显示你的订单 {{订单编号}} 已经安全签收啦！(˶ᵔ ᵕ ᵔ˶)♡\n\n拆箱的时候希望你一切都喜欢～如果有任何问题（缺件、损坏等），请在 48 小时内回复这封邮件并附上照片，我们会尽快帮你处理。\n\n谢谢你把它带回家呀！\n— Snow Yuzu ♡' },
        en: { subject: 'Package Delivered! {{订单编号}} ♡ · Snow Yuzu', body: 'Hi {{客户称呼}}, tracking shows order {{订单编号}} has been safely delivered! (˶ᵔ ᵕ ᵔ˶)♡\n\nWe hope you love everything! If there is any issue (missing parts, damage), reply within 48 hours with photos and we\'ll make it right.\n\nThank you for bringing it home!\n— Snow Yuzu ♡' }
      },
      review_invite: {
        zh: { subject: '喜欢这次的订单吗？来聊聊呀 ♡ · Snow Yuzu', body: '{{客户称呼}}，你的订单 {{订单编号}} 已经到手几天啦，希望它有好好陪伴你～\n\n如果喜欢的话，欢迎来 {{店铺链接}} 留言晒单，你的反馈对小柚超级超级重要！\n\n如果不想再收到这类邀请，可以用邮件底部的退订链接一键退订，订单邮件不受影响哦。\n\n— Snow Yuzu ♡' },
        en: { subject: 'How Is Your Order? Let\'s Chat ♡ · Snow Yuzu', body: 'Hi {{客户称呼}}, it\'s been a few days since order {{订单编号}} arrived — we hope it\'s treating you well!\n\nIf you love it, we\'d be thrilled to see your photos or hear your thoughts: {{店铺链接}}\n\nIf you no longer wish to receive these invites, use the Unsubscribe link at the bottom. Order emails are not affected.\n\n— Snow Yuzu ♡' }
      },
      birthday: {
        zh: { subject: '今天是你的生日呀！生日快乐 ♡ · Snow Yuzu', body: '亲爱的 {{客户称呼}}：\n\n呀！今天是你的生日嘛！生日快乐！！(ﾉ˶>ᗜ<˵)ﾉ♡\n\n新的一岁也要开开心心的呀！希望你遇到喜欢的小东西、温柔的人，还有好多好多值得期待的小事 ♡\n\n谢谢你来到 Snow Yuzu 小铺～能陪你生活里的一小段时间，我们也觉得很开心。\n\n今天一定要好好庆祝，吃饱饱、玩开心，收获满满的幸福哦！\n\n送你一只电子小兔兔和好多祝福 ₍ᐢ.ˬ.ᐢ₎♡\n\n生日快乐呀！\n— Snow Yuzu 的小店主 ♡' },
        en: { subject: 'Happy Birthday to You! A Little Wish from Snow Yuzu ♡', body: 'Hi {{客户称呼}}!\n\nIt\'s your birthday! Happy birthday!! (ﾉ˶>ᗜ<˵)ﾉ♡\n\nWishing you a new year filled with little joys, lovely surprises, and lots of things that make you smile ♡\n\nThank you for being part of Snow Yuzu. We\'re so happy our little shop gets to be a tiny part of your world!\n\nHave something yummy, enjoy your special day, and give yourself lots of reasons to smile ₍ᐢ.ˬ.ᐢ₎♡\n\nSending you a little virtual bunny and a whole lot of birthday wishes!\n\nHappy birthday!\n— Snow Yuzu\'s little shopkeeper ♡' }
      }
    };
    return (D[kind] && D[kind][lang]) || { subject: '', body: '' };
  }

  function tplKey(kind, lang) { return 'mailtpl_' + kind + '_' + lang; }
  function tplBase(kind, lang) { return TPL.saved[tplKey(kind, lang)] || tplDefault(kind, lang); }

  CRM.bootMailtpl = function () {
    var panel = document.getElementById('tab-mailtpl');
    if (panel.dataset.booted) return;
    panel.dataset.booted = '1';
    panel.innerHTML =
      // 20261028p12：生日邮件总开关 + 测试发送（发到官方邮箱）
      '<div class="card" style="padding:16px 20px;margin-bottom:14px;border:1.5px solid var(--accent-soft,#FCE4EC);">' +
        '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">' +
          '<h3 style="margin:0;font-size:17px;color:var(--text,#604C57);">' + t('生日邮件 ♡', 'Birthday emails ♡') + '</h3>' +
          '<span class="chip" id="bday-sw-on">' + t('自动发送开', 'Auto on') + '</span>' +
          '<span class="chip" id="bday-sw-off">' + t('自动发送关', 'Auto off') + '</span>' +
          '<button class="btn-mini" id="bday-test" style="margin-left:auto;">' + t('给官方邮箱发一封测试', 'Send a test to the official mailbox') + '</button>' +
        '</div>' +
        '<p style="margin:8px 0 0;font-size:13px;color:var(--muted,#A88E9B);line-height:1.8;">' +
          t('每天自动给当天生日的客户发一封生日祝福（客户资料里设置生日、可单独关闭）。这里控制全站自动发送。', 'Automatically sends a birthday wish to customers whose birthday is today (set birthdays in customer profiles; each profile can opt out). This switch controls the site-wide automation.') +
        '</p>' +
      '</div>' +
      '<div class="card" style="padding:16px 20px;margin-bottom:14px;">' +
        '<h3 style="margin:0 0 4px;font-size:17px;color:var(--text,#604C57);">' + t('邮件模板管理', 'Email templates') + '</h3>' +
        '<p style="margin:0;font-size:13px;color:var(--muted,#A88E9B);line-height:1.8;">' +
          t('各用途邮件的主题与正文模板，中英文分开管理；带变量占位，发送时自动替换。当前仅保存与预览，不会自动发送任何邮件。', 'Subject & body templates per email type, zh/en managed separately. Save & preview only — nothing is sent automatically.') +
        '</p>' +
        '<div id="tpl-kind-chips" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;"></div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:16px;">' +
        '<div class="card" style="padding:16px 20px;">' +
          '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px;">' +
            '<span class="chip" data-lang="zh">中文</span><span class="chip" data-lang="en">English</span>' +
            '<span id="tpl-kind-desc" style="font-size:12px;color:var(--muted,#A88E9B);margin-left:auto;"></span>' +
          '</div>' +
          '<div style="font-size:14px;color:var(--text,#604C57);margin-bottom:4px;">' + t('邮件主题', 'Subject') + '</div>' +
          '<input id="tpl-subject" style="width:100%;box-sizing:border-box;padding:10px 14px;font-size:15px;border:1.5px solid var(--accent-soft,#FCE4EC);border-radius:12px;outline:none;font-family:inherit;color:var(--text,#604C57);background:#fff;">' +
          '<div style="font-size:14px;color:var(--text,#604C57);margin:12px 0 4px;">' + t('邮件正文', 'Body') + '</div>' +
          '<textarea id="tpl-body" rows="10" style="width:100%;box-sizing:border-box;padding:10px 14px;font-size:15px;border:1.5px solid var(--accent-soft,#FCE4EC);border-radius:12px;outline:none;font-family:inherit;color:var(--text,#604C57);background:#fff;resize:vertical;line-height:1.8;"></textarea>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">' +
            '<button class="btn-save-tb" id="tpl-save">' + t('保存模板', 'Save') + '</button>' +
            '<button class="btn-mini" id="tpl-cancel">' + t('取消修改', 'Revert') + '</button>' +
            '<button class="btn-mini" id="tpl-reset">' + t('恢复默认', 'Reset to default') + '</button>' +
            '<button class="btn-mini" id="tpl-preview-btn">' + t('预览', 'Preview') + '</button>' +
          '</div>' +
          '<div id="tpl-vars" style="margin-top:14px;background:var(--bg,#FFF8FA);border:1px solid var(--accent-soft,#FCE4EC);border-radius:12px;padding:10px 14px;">' +
            '<div style="font-size:14px;font-weight:600;color:var(--text,#604C57);margin-bottom:6px;">' + t('可用变量（点击插入到正文末尾）', 'Variables (click to append to body)') + '</div>' +
            '<div id="tpl-var-list" style="display:flex;gap:6px;flex-wrap:wrap;"></div>' +
          '</div>' +
        '</div>' +
        '<div class="card" style="padding:16px 20px;align-self:start;">' +
          '<h3 style="margin:0 0 10px;font-size:16px;color:var(--text,#604C57);">' + t('模板预览', 'Preview') + '</h3>' +
          '<div id="tpl-preview" style="border:1px solid var(--accent-soft,#FCE4EC);border-radius:14px;padding:14px 16px;background:#fff;">' +
            '<p style="color:var(--muted,#A88E9B);font-size:14px;">' + t('点「预览」查看替换变量后的效果', 'Click Preview to see variable substitution') + '</p>' +
          '</div>' +
        '</div>' +
      '</div>';
    // 生日邮件开关/测试发送
    function bdaySync(on) {
      panel.querySelector('#bday-sw-on').classList.toggle('on', on);
      panel.querySelector('#bday-sw-off').classList.toggle('on', !on);
    }
    api('site_settings?select=key,value&key=eq.birthday_emails_enabled').then(function (r) { return r.json(); }).then(function (rows) {
      var v = (rows && rows[0] && rows[0].value) || 'on';
      bdaySync(v !== 'off');
    }).catch(function () { bdaySync(true); });
    function bdaySet(on) {
      api('site_settings', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates' }, body: JSON.stringify({ key: 'birthday_emails_enabled', value: on ? 'on' : 'off' }) })
        .then(function (r) { if (!r.ok) { toast(t('保存失败', 'Save failed')); return; } bdaySync(on); toast(on ? t('生日邮件自动发送已开启', 'Birthday emails on') : t('生日邮件自动发送已关闭', 'Birthday emails off')); });
    }
    panel.querySelector('#bday-sw-on').addEventListener('click', function () { bdaySet(true); });
    panel.querySelector('#bday-sw-off').addEventListener('click', function () { bdaySet(false); });
    panel.querySelector('#bday-test').addEventListener('click', function () {
      var btn = this; btn.disabled = true;
      var zh = (TPL.lang !== 'en');
      api('email_log', {
        method: 'POST', headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify({
          kind: 'birthday', ref_id: 'test-bday-' + Date.now(), to_email: 'snowyuzustudio@gmail.com',
          subject: '【测试】今天是你的生日呀！生日快乐 ♡',
          body: (zh
            ? '亲爱的 小柚：\n\n呀！今天是你的生日嘛！生日快乐！！(ﾉ˶>ᗜ<˵)ﾉ♡\n\n[生日图案]\n\n这是你自己点下「测试发送」的生日邮件样例～正式发送时，收件人会看到他们自己的称呼。\n\n送你一只电子小兔兔和好多祝福 ₍ᐢ.ˬ.ᐢ₎♡\n\n生日快乐呀！\n— Snow Yuzu 的小店主 ♡'
            : 'Hi Yuki!\n\nIt\'s your birthday! Happy birthday!! (ﾉ˶>ᗜ<˵)ﾉ♡\n\n[生日图案]\n\nThis is the birthday email you sent yourself as a test — real sends will greet each customer by name.\n\nSending you a little virtual bunny and a whole lot of birthday wishes! ₍ᐢ.ˬ.ᐢ₎♡\n\nHappy birthday!\n— Snow Yuzu\'s little shopkeeper ♡')
        })
      }).then(function (r) { if (!r.ok) throw new Error(); toast(t('测试邮件已加入队列，约 1 分钟内发到官方邮箱', 'Test queued — arriving at the official mailbox in ~1 min')); })
        .catch(function () { toast(t('加入队列失败，再试一次', 'Queue failed — try again')); })
        .finally(function () { btn.disabled = false; });
    });
    panel.querySelectorAll('[data-lang]').forEach(function (c) {
      c.addEventListener('click', function () { tplSwitchLang(c.getAttribute('data-lang')); });
    });
    panel.querySelector('#tpl-subject').addEventListener('input', function () { TPL.dirty = true; });
    panel.querySelector('#tpl-body').addEventListener('input', function () { TPL.dirty = true; });
    panel.querySelector('#tpl-save').addEventListener('click', tplSave);
    panel.querySelector('#tpl-cancel').addEventListener('click', tplRevert);
    panel.querySelector('#tpl-reset').addEventListener('click', tplReset);
    panel.querySelector('#tpl-preview-btn').addEventListener('click', tplPreview);
    loadTplSaved();
  };

  function loadTplSaved() {
    api('site_settings?select=key,value&key=like.mailtpl_*').then(function (r) { return r.json(); }).then(function (rows) {
      (rows || []).forEach(function (row) {
        try { TPL.saved[row.key] = JSON.parse(row.value); } catch (e) {}
      });
      renderTplChips();
      tplFill();
    }).catch(function () { renderTplChips(); tplFill(); });
  }

  function renderTplChips() {
    var panel = document.getElementById('tab-mailtpl');
    panel.querySelector('#tpl-kind-chips').innerHTML = TPL.kinds.map(function (k) {
      return '<span class="chip' + (TPL.kind === k.key ? ' on' : '') + '" data-kind="' + k.key + '">' + k.name + '</span>';
    }).join('');
    panel.querySelectorAll('#tpl-kind-chips [data-kind]').forEach(function (c) {
      c.addEventListener('click', function () { tplSwitchKind(c.getAttribute('data-kind')); });
    });
    panel.querySelector('#tpl-var-list').innerHTML = TPL.vars.map(function (v) {
      return '<span class="chip" data-var="' + v[0] + '" title="' + v[1] + '" style="font-size:12px;">' + v[0] + '</span>';
    }).join('');
    panel.querySelectorAll('#tpl-var-list [data-var]').forEach(function (c) {
      c.addEventListener('click', function () {
        var ta = panel.querySelector('#tpl-body');
        ta.value = (ta.value || '') + c.getAttribute('data-var');
        TPL.dirty = true; ta.focus();
      });
    });
    panel.querySelectorAll('[data-lang]').forEach(function (c) {
      c.classList.toggle('on', c.getAttribute('data-lang') === TPL.lang);
    });
  }

  function tplFill() {
    var panel = document.getElementById('tab-mailtpl');
    var base = tplBase(TPL.kind, TPL.lang);
    panel.querySelector('#tpl-subject').value = base.subject || '';
    panel.querySelector('#tpl-body').value = base.body || '';
    var k = TPL.kinds.filter(function (x) { return x.key === TPL.kind; })[0];
    var custom = !!TPL.saved[tplKey(TPL.kind, TPL.lang)];
    panel.querySelector('#tpl-kind-desc').textContent = (k ? k.desc : '') + (custom ? ' · ' + t('已自定义', 'customized') : '');
    TPL.dirty = false;
    renderTplChips();
  }

  function tplSwitchKind(key) {
    if (key === TPL.kind) return;
    if (TPL.dirty) {
      uiConfirm(t('当前模板改了还没保存，切换会丢弃修改，确定切换吗？', 'Discard unsaved changes and switch?'), function () { TPL.kind = key; tplFill(); }, t('切换', 'Switch'));
      return;
    }
    TPL.kind = key; tplFill();
  }

  function tplSwitchLang(lang) {
    if (lang === TPL.lang) return;
    if (TPL.dirty) {
      uiConfirm(t('当前模板改了还没保存，切换语言会丢弃修改，确定切换吗？', 'Discard unsaved changes and switch language?'), function () { TPL.lang = lang; tplFill(); }, t('切换', 'Switch'));
      return;
    }
    TPL.lang = lang; tplFill();
  }

  function tplSave() {
    var panel = document.getElementById('tab-mailtpl');
    var subject = panel.querySelector('#tpl-subject').value.trim();
    var body = panel.querySelector('#tpl-body').value.replace(/\s+$/, '');
    if (!subject) { toast(t('邮件主题不能为空', 'Subject cannot be empty')); return; }
    if (!body) { toast(t('邮件正文不能为空', 'Body cannot be empty')); return; }
    var key = tplKey(TPL.kind, TPL.lang);
    api('site_settings', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates' }, body: JSON.stringify({ key: key, value: JSON.stringify({ subject: subject, body: body, saved_at: new Date().toISOString() }) }) })
      .then(function (r) {
        if (!r.ok) { toast(t('保存失败，再试一次', 'Save failed')); return; }
        TPL.saved[key] = { subject: subject, body: body };
        toast(t('已保存 ✓（重开页面仍在）', 'Saved ✓'));
        tplFill();
      });
  }

  function tplRevert() {
    var panel = document.getElementById('tab-mailtpl');
    var base = tplBase(TPL.kind, TPL.lang);
    panel.querySelector('#tpl-subject').value = base.subject || '';
    panel.querySelector('#tpl-body').value = base.body || '';
    TPL.dirty = false;
    toast(t('已还原到上次保存的内容', 'Reverted to last saved'));
  }

  function tplReset() {
    uiConfirm(t('恢复默认会丢掉这类模板的自定义内容（含已保存的），确定恢复吗？', 'Reset to default? Saved custom content for this template will be lost.'), function () {
      var key = tplKey(TPL.kind, TPL.lang);
      api('site_settings?key=eq.' + key, { method: 'DELETE' }).then(function (r) {
        if (!r.ok) { toast(t('操作失败，再试一次', 'Failed')); return; }
        delete TPL.saved[key];
        toast(t('已恢复默认', 'Reset to default'));
        tplFill();
      });
    }, t('恢复默认', 'Reset'));
  }

  function tplPreview() {
    var panel = document.getElementById('tab-mailtpl');
    var subject = panel.querySelector('#tpl-subject').value.trim();
    var body = panel.querySelector('#tpl-body').value;
    var samples = { '{{客户称呼}}': 'Yuki', '{{订单编号}}': 'SY-001', '{{商品名称}}': '键帽 ×1', '{{订单金额}}': '$2.99', '{{付款金额}}': '$20.00', '{{欠款金额}}': '$32.00', '{{付款链接}}': 'https://buy.stripe.com/xxx', '{{预计发货日期}}': '11 月 5 日前', '{{物流单号}}': 'SF1234567890', '{{店铺链接}}': 'https://yukicheng.com/shop/', '{{留言内容}}': '什么时候能发货呀？', '{{站长回复}}': '本周内发出，谢谢等待～' };
    var sub = subject, txt = body;
    Object.keys(samples).forEach(function (k) { sub = sub.split(k).join(samples[k]); txt = txt.split(k).join(samples[k]); });
    panel.querySelector('#tpl-preview').innerHTML =
      '<div style="font-size:12px;color:var(--muted,#A88E9B);margin-bottom:4px;">' + t('邮件主题', 'Subject') + '</div>' +
      '<div style="font-size:15px;font-weight:700;color:var(--text,#604C57);padding-bottom:10px;border-bottom:1px solid var(--accent-soft,#FCE4EC);margin-bottom:10px;word-break:break-word;">' + esc(sub) + '</div>' +
      '<div style="font-size:12px;color:var(--muted,#A88E9B);margin-bottom:4px;">' + t('邮件正文', 'Body') + '</div>' +
      '<div style="font-size:14px;color:var(--text,#604C57);white-space:pre-wrap;line-height:1.9;word-break:break-word;">' + esc(txt) + '</div>';
  }

  /* ═══════════ 主题颜色（全站同步） ═══════════ */
  var THEME = {
    fields: [
      ['accent', t('粉底按钮 / 边框', 'Pink buttons / borders'), '#FFD9E6'],
      ['accentSoft', t('选中底色 / 浅粉块', 'Selected / soft pink'), '#FCE4EC'],
      ['accentStrong', t('强调深字（选中态字）', 'Accent strong'), '#A04A68'],
      ['price', t('金额亮粉', 'Price pink'), '#FF6FA5'],
      ['text', t('主文字 / 标题', 'Main text'), '#604C57'],
      ['muted', t('次要文字', 'Muted text'), '#A88E9B'],
      ['bg', t('页面背景', 'Page background'), '#FFF8FA'],
      ['card', t('卡片底色', 'Card background'), '#FFF0F5'],
      ['success', t('成功状态（合格/已付款）', 'Success status'), '#5FA777'],
      ['warning', t('警告状态（待处理/返工）', 'Warning status'), '#E0A458'],
      ['danger', t('危险状态（失败/退款）', 'Danger status'), '#D96570']
    ],
    presets: ['#FFD9E6', '#FCE4EC', '#FF6FA5', '#E073A8', '#A04A68', '#604C57', '#A88E9B', '#FFF8FA', '#FFF0F5', '#ffffff', '#D4B2C4', '#F6DFE8'],
    saved: {}
  };

  CRM.bootTheme = function () {
    var panel = document.getElementById('tab-theme');
    if (panel.dataset.booted) return;
    panel.dataset.booted = '1';
    panel.innerHTML =
      '<div class="card" style="padding:16px 20px;">' +
        '<h3 style="margin:0 0 4px;font-size:17px;color:var(--text,#604C57);">' + t('主题颜色', 'Theme colors') + '</h3>' +
        '<p style="margin:0;font-size:13px;color:var(--muted,#A88E9B);line-height:1.8;">' +
          t('改的是全站同一套变量：前台每个页面、后台所有页签、按钮/边框/金额/文字全部同步，不用挨个改。改完点「保存并同步全站」。', 'One set of variables for the whole site. Save to sync every page, admin tab, button, border and price color.') +
        '</p>' +
        '<div id="theme-fields" style="margin-top:14px;display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px;"></div>' +
        '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px;">' +
          '<button class="btn-save-tb" id="theme-save">' + t('保存并同步全站', 'Save & sync') + '</button>' +
          '<button class="btn-mini" id="theme-reset">' + t('恢复默认配色', 'Reset defaults') + '</button>' +
        '</div>' +
        '<div style="margin-top:14px;font-size:12px;color:var(--muted,#A88E9B);">' + t('当前状态：', 'Status: ') + '<span id="theme-status">…</span></div>' +
      '</div>';
    renderThemeFields();
    panel.querySelector('#theme-save').addEventListener('click', themeSave);
    panel.querySelector('#theme-reset').addEventListener('click', function () {
      uiConfirm(t('恢复默认会把所有自定义颜色还原成网站原配色，确定吗？', 'Reset all colors to the original palette?'), function () {
        api('site_settings?key=eq.theme_colors', { method: 'DELETE' }).then(function (r) {
          if (!r.ok) { toast(t('操作失败', 'Failed')); return; }
          THEME.saved = {};
          try { localStorage.removeItem('yuki-theme-colors-v2'); } catch (e) {}
          location.reload();
        });
      }, t('恢复默认', 'Reset'));
    });
    loadThemeSaved();
  };

  function themeApplyLive() { // admin 页不引 site-common，这里自带同一套应用逻辑（前台由 site-common 的 ykApplyTheme 负责）
    var map = { text: '--text', muted: '--muted', bg: '--bg', card: '--card', accent: '--accent', accentSoft: '--accent-soft', accentStrong: '--accent-strong', price: '--price', success: '--success', warning: '--warning', danger: '--danger' };
    var r = document.documentElement.style;
    Object.keys(map).forEach(function (k) { if (THEME.saved[k]) r.setProperty(map[k], THEME.saved[k]); });
  }

  function renderThemeFields() {
    var panel = document.getElementById('tab-theme');
    var box = panel.querySelector('#theme-fields');
    box.innerHTML = THEME.fields.map(function (f) {
      var cur = THEME.saved[f[0]] || f[2];
      var sw = THEME.presets.map(function (p) {
        var on = p.toLowerCase() === cur.toLowerCase();
        return '<span class="chip' + (on ? ' on' : '') + '" data-f="' + f[0] + '" data-c="' + p + '" style="width:30px;height:30px;padding:0;background:' + p + ';border:2px solid ' + (on ? 'var(--text,#604C57)' : 'var(--accent,#ffd9e6)') + ';" title="' + p + '"></span>';
      }).join('');
      return '<div style="background:#fff;border:1px solid var(--accent-soft,#FCE4EC);border-radius:14px;padding:12px 14px;">' +
        '<div style="font-size:14px;font-weight:600;color:var(--text,#604C57);">' + f[1] + ' <span style="font-weight:400;color:var(--muted,#A88E9B);">' + f[0] + '</span></div>' +
        '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:8px;">' + sw +
          '<input data-hex="' + f[0] + '" value="' + cur + '" style="width:96px;padding:5px 8px;font-size:13px;border:1.5px solid var(--accent-soft,#FCE4EC);border-radius:8px;font-family:inherit;color:var(--text,#604C57);" placeholder="#RRGGBB">' +
        '</div></div>';
    }).join('');
    box.querySelectorAll('[data-f]').forEach(function (c) {
      c.addEventListener('click', function () {
        THEME.saved[c.getAttribute('data-f')] = c.getAttribute('data-c');
        themeApplyLive();
        renderThemeFields();
      });
    });
    box.querySelectorAll('[data-hex]').forEach(function (inp) {
      inp.addEventListener('change', function () {
        var v = inp.value.trim();
        var key = inp.getAttribute('data-hex');
        if (!/^#[0-9a-fA-F]{6}$/.test(v)) { toast(t('颜色格式要是 #RRGGBB', 'Use #RRGGBB')); inp.value = THEME.saved[key] || THEME.fields.filter(function (f) { return f[0] === key; })[0][2]; return; }
        THEME.saved[key] = v;
        themeApplyLive();
        renderThemeFields();
      });
    });
  }

  function loadThemeSaved() {
    api('site_settings?select=value&key=eq.theme_colors').then(function (r) { return r.json(); }).then(function (rows) {
      var raw = rows && rows[0] && rows[0].value;
      try { var v = typeof raw === 'string' ? JSON.parse(raw) : raw; if (v && typeof v === 'object') THEME.saved = v; } catch (e) {}
      var st = document.querySelector('#theme-status');
      var n = Object.keys(THEME.saved).length;
      if (st) st.textContent = n ? t('已自定义 ' + n + ' 项', n + ' customized') : t('使用默认配色', 'Default palette');
      renderThemeFields();
    });
  }

  function themeSave() {
    var allowed = {}; THEME.fields.forEach(function (f) { allowed[f[0]] = true; });
    var clean = {};
    Object.keys(THEME.saved).forEach(function (k) { if (allowed[k] && /^#[0-9a-fA-F]{6}$/.test(THEME.saved[k])) clean[k] = THEME.saved[k]; });
    if (!Object.keys(clean).length) { toast(t('没有改过任何颜色', 'Nothing changed')); return; }
    api('site_settings', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates' }, body: JSON.stringify({ key: 'theme_colors', value: JSON.stringify(clean) }) })
      .then(function (r) {
        if (!r.ok) { toast(t('保存失败，再试一次', 'Save failed')); return; }
        try { localStorage.setItem('yuki-theme-colors-v2', JSON.stringify(clean)); } catch (e) {}
        toast(t('已保存 ✓ 全站已同步（刷新前台页面即可看到）', 'Saved ✓ synced site-wide'));
        loadThemeSaved();
      });
  }
})();
