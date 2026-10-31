/* ══════════════════════════════════════════════════════════════════
   admin-customer.js —— 客户与会员（她 20261030 §2 / P0.7 合并页）
   把原来分散的「客户管理」和「VIP 客户查询」并成一个入口：
     搜索 + 筛选 + 排序 + 客户列表 → 点开分区详情（资料 / 会员 / 消费统计 / 历史订单 / 备注）
   数据只用现有表和 RPC，不新建表、不改结构、不重复建客户：
     shop_customers（客户档案，VIP 就存这里的 vip / vip_until）
     shop_orders / shop_payments（订单与实付）
     rpc/shop_customer_save（新增/编辑，全参数回传，只改传进来的字段）
     shop_customers PATCH（VIP 开关与到期日）
     site_settings.vip_log（会员开通/续费/到期记录，JSON 数组；写失败不影响主流程）
   ══════════════════════════════════════════════════════════════════ */
(function () {
  var PAID = ['paid', 'shipped', 'completed', 'refunding'];
  var S = { list: [], orders: [], pays: [], log: [], q: '', filter: 'all', sort: 'recent', cur: null, logOk: null };

  function t(zh, en) { return (window.LANG === 'en') ? en : zh; }
  function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }
  function money(v, cur) { return (cur || '$') + fmtMoney(v); }
  function isTest(o) { return /^TEST-/.test(o.order_no || ''); }
  function daysUntil(d) {
    if (!d) return null;
    var end = new Date(String(d).length <= 10 ? d + 'T23:59:59' : d).getTime();
    if (isNaN(end)) return null;
    return Math.ceil((end - Date.now()) / 86400000);
  }
  function vipState(c) {
    if (!c.vip) return { key: 'normal', label: t('普通客户', 'Regular'), color: '#81717A' };
    var d = daysUntil(c.vip_until);
    if (d == null) return { key: 'vip', label: 'VIP', color: '#A98D96' };
    if (d < 0) return { key: 'expired', label: t('VIP 已过期', 'Expired'), color: '#C4636E' };
    if (d <= 30) return { key: 'soon', label: t('VIP · ' + d + ' 天后到期', 'ends in ' + d + 'd'), color: '#B98598' };
    return { key: 'vip', label: 'VIP', color: '#A98D96' };
  }
  function isAdminRecord(c) { return c.role === 'admin' || c.is_admin === true || c.account_type === 'admin'; }
  function avatarOf(c) {
    var ch = String(c.name || c.email || '?').trim().charAt(0).toUpperCase() || '?';
    var hue = 0;
    var s = String(c.id || c.name || '');
    for (var i = 0; i < s.length; i++) hue = (hue + s.charCodeAt(i)) % 360;
    return '<span class="cust-av" style="background:hsl(' + hue + ', 62%, 92%);color:hsl(' + hue + ', 30%, 42%);">' + esc(ch) + '</span>';
  }
  function ordersOf(c) {
    return S.orders.filter(function (o) {
      if (o.customer_id && o.customer_id === c.id) return true;
      if (c.user_id && o.user_id && o.user_id === c.user_id) return true;
      if (c.email && o.email && String(o.email).toLowerCase() === String(c.email).toLowerCase()) return true; // 仅只读关联，不改档案
      return false;
    });
  }
  function statOf(c) {
    var ords = ordersOf(c).filter(function (o) { return !isTest(o); });
    var paid = ords.filter(function (o) { return PAID.indexOf(o.status) >= 0; });
    var sum = paid.reduce(function (a, o) { return a + num(o.total); }, 0);
    var last = paid.length ? paid[0] : (ords[0] || null);
    return { count: paid.length, sum: sum, last: last, all: ords };
  }

  /* ───────── 样式（只作用于本页） ───────── */
  function injectCss() {
    if (document.getElementById('cust-css')) return;
    var st = document.createElement('style');
    st.id = 'cust-css';
    st.textContent = [
      '#tab-vip .cust-av{display:inline-flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:50%;font-size:16px;font-weight:700;flex-shrink:0;}',
      '#tab-vip .cust-row{display:grid;grid-template-columns:44px 1.6fr 1.5fr 92px 70px 110px 130px;gap:10px;align-items:center;padding:10px 12px;border-radius:12px;cursor:pointer;}',
      '#tab-vip .cust-row:hover{background:#FFF7FA;}',
      '#tab-vip .cust-row.on{background:#FCE1EA;}',
      '#tab-vip .cust-head{font-size:13px;color:#81717A;font-weight:600;padding:6px 12px;cursor:default;}',
      '#tab-vip .cust-head:hover{background:none;}',
      '#tab-vip .cust-cell{font-size:15px;color:#62545B;min-width:0;overflow:hidden;text-overflow:ellipsis;}',
      '#tab-vip .cust-cell b{color:#55464E;}',
      '#tab-vip .cust-sub{font-size:12px;color:#81717A;}',
      '#tab-vip .cust-sec{border:1.5px solid #FFE3EC;border-radius:16px;background:#fff;padding:16px 18px;margin-bottom:12px;}',
      '#tab-vip .cust-sec h4{margin:0 0 4px;font-size:17px;color:#55464E;font-weight:700;}',
      '#tab-vip .cust-sec .tip{font-size:13px;color:#81717A;margin:0 0 12px;}',
      '#tab-vip .cust-kv{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px 18px;font-size:15px;color:#62545B;}',
      '#tab-vip .cust-kv b{color:#55464E;}',
      '#tab-vip .cust-kpi{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;}',
      '#tab-vip .cust-kpi > div{background:#FFF7FA;border:1.5px solid #FFE3EC;border-radius:12px;padding:10px 14px;}',
      '#tab-vip .cust-kpi .l{font-size:13px;color:#81717A;}',
      '#tab-vip .cust-kpi .v{font-size:19px;font-weight:700;color:#55464E;margin-top:2px;font-variant-numeric:tabular-nums;}',
      '#tab-vip .cust-log{font-size:13px;color:#62545B;line-height:1.9;}',
      '#tab-vip .cust-badge{display:inline-flex;align-items:center;gap:4px;font-size:12px;padding:1px 9px;border-radius:999px;border:1.5px solid currentColor;}',
      '@media (max-width:900px){#tab-vip .cust-row{grid-template-columns:40px 1fr 110px;}#tab-vip .cust-col-hide{display:none;}#tab-vip .cust-head{display:none;}}'
    ].join('\n');
    document.head.appendChild(st);
  }

  /* ───────── 启动 ───────── */
  function boot() {
    var panel = document.getElementById('tab-vip');
    if (!panel) return;
    injectCss();
    if (!panel.dataset.custBoot) {
      panel.dataset.custBoot = '1';
      panel.innerHTML =
        '<div class="card" style="padding:14px 16px;margin-bottom:14px;">' +
          '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">' +
            '<input id="cust-q" placeholder="' + t('搜索姓名 / 昵称 / 邮箱 / 电话 / 客户编号') + '" style="flex:1;min-width:220px;padding:10px 16px;font-size:15px;border:1.5px solid #FCE4EC;border-radius:12px;outline:none;font-family:inherit;color:#62545B;background:#fff;box-sizing:border-box;">' +
            '<button class="btn-save-tb" id="cust-reload">' + t('刷新') + '</button>' +
          '</div>' +
          '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:12px;">' +
            '<span style="font-size:13px;color:#81717A;">' + t('筛选') + '</span>' +
            [['all', '全部'], ['vip', '仅 VIP'], ['normal', '仅普通'], ['soon', '30 天内到期'], ['expired', '已过期']].map(function (p) {
              return '<button type="button" class="chip' + (p[0] === 'all' ? ' on' : '') + '" data-f="' + p[0] + '">' + p[1] + '</button>';
            }).join('') +
            '<span style="font-size:13px;color:#81717A;margin-left:auto;">' + t('排序') + '</span>' +
            '<select id="cust-sort" style="padding:7px 12px;border-radius:10px;border:1.5px solid #FCE4EC;background:#fff;font-size:14px;font-family:inherit;color:#62545B;">' +
              '<option value="recent">' + t('最近下单') + '</option>' +
              '<option value="spend">' + t('累计消费') + '</option>' +
              '<option value="created">' + t('注册时间') + '</option>' +
              '<option value="name">' + t('姓名') + '</option>' +
            '</select>' +
          '</div>' +
        '</div>' +
        '<div id="cust-kpi" style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;"></div>' +
        '<div id="cust-list-card" class="card" style="padding:8px 8px;"></div>' +
        '<div id="cust-detail"></div>';
      panel.querySelector('#cust-q').addEventListener('input', function () { S.q = this.value.trim().toLowerCase(); paintList(); });
      panel.querySelector('#cust-reload').addEventListener('click', function () { load(); });
      panel.querySelector('#cust-sort').addEventListener('change', function () { S.sort = this.value; paintList(); });
      panel.addEventListener('click', function (e) {
        var f = e.target.closest('[data-f]');
        if (f) {
          S.filter = f.getAttribute('data-f');
          panel.querySelectorAll('[data-f]').forEach(function (b) { b.classList.toggle('on', b === f); });
          paintList();
          return;
        }
      });
    }
    load();
  }

  function load() {
    var listCard = document.getElementById('cust-list-card');
    if (listCard) listCard.innerHTML = '<p style="color:#81717A;text-align:center;padding:22px 0;font-size:15px;">' + t('正在读取客户…') + '</p>';
    api('shop_customers?select=*&order=created_at.desc&limit=500').then(function (r) { return r.json(); }).then(function (rows) {
      S.list = Array.isArray(rows) ? rows : [];
      return api('shop_orders?select=id,order_no,customer_id,user_id,email,status,total,currency,items,created_at&order=created_at.desc&limit=1000')
        .then(function (r2) { return r2.json(); })
        .then(function (ords) { S.orders = Array.isArray(ords) ? ords : []; })
        .catch(function () { S.orders = []; });
    }).then(function () {
      return api('site_settings?select=value&key=eq.vip_log').then(function (r) { return r.json(); })
        .then(function (rows) {
          var v = rows && rows[0] && rows[0].value;
          try { S.log = v ? JSON.parse(v) : []; } catch (e) { S.log = []; }
          S.logOk = true;
        })
        .catch(function () { S.log = []; S.logOk = false; });
    }).then(function () {
      paintKpi();
      paintList();
      if (S.cur) {
        var again = S.list.filter(function (c) { return c.id === S.cur.id; })[0];
        if (again) { S.cur = again; paintDetail(); }
      }
    }).catch(function () {
      if (listCard) listCard.innerHTML = '<p style="color:#C4636E;text-align:center;padding:22px 0;font-size:15px;">' + t('客户列表加载失败，点右上「刷新」重试') + '</p>';
    });
  }

  function paintKpi() {
    var box = document.getElementById('cust-kpi');
    if (!box) return;
    var total = S.list.length;
    var vips = S.list.filter(function (c) { return c.vip; });
    var soon = vips.filter(function (c) { var d = daysUntil(c.vip_until); return d != null && d >= 0 && d <= 30; });
    var expired = vips.filter(function (c) { var d = daysUntil(c.vip_until); return d != null && d < 0; });
    var spend = 0;
    S.list.forEach(function (c) { spend += statOf(c).sum; });
    var cell = function (l, v, sub) {
      return '<div style="background:#FFF7FA;border:1.5px solid #FFE3EC;border-radius:12px;padding:10px 14px;min-width:130px;">' +
        '<div style="font-size:13px;color:#81717A;">' + l + '</div>' +
        '<div style="font-size:19px;font-weight:700;color:#55464E;margin-top:2px;">' + v + '</div>' +
        (sub ? '<div style="font-size:12px;color:#81717A;">' + sub + '</div>' : '') + '</div>';
    };
    box.innerHTML = cell(t('客户总数'), total) + cell('VIP', vips.length, soon.length ? soon.length + t(' 位 30 天内到期') : '') +
      cell(t('已过期 VIP'), expired.length) + cell(t('累计消费'), money(spend), t('按已付款订单合计'));
  }

  function visible() {
    var q = S.q;
    var list = S.list.filter(function (c) {
      var st = vipState(c).key;
      if (S.filter === 'vip' && !c.vip) return false;
      if (S.filter === 'normal' && c.vip) return false;
      if (S.filter === 'soon' && st !== 'soon') return false;
      if (S.filter === 'expired' && st !== 'expired') return false;
      if (!q) return true;
      var ph = String(q).replace(/\D/g, '');
      var hay = [c.name, c.email, c.phone, c.c_no, c.note].map(function (x) { return String(x || '').toLowerCase(); });
      if (hay.some(function (h) { return h.indexOf(q) >= 0; })) return true;
      if (ph.length >= 4 && String(c.phone || '').replace(/\D/g, '').indexOf(ph) >= 0) return true;
      return false;
    });
    var key = {
      recent: function (c) { var l = statOf(c).last; return l ? String(l.created_at) : ''; },
      spend: function (c) { return statOf(c).sum; },
      created: function (c) { return String(c.created_at || ''); },
      name: function (c) { return String(c.name || ''); }
    }[S.sort] || function () { return ''; };
    list.sort(function (a, b) {
      var ka = key(a), kb = key(b);
      if (typeof ka === 'number') return kb - ka;
      return String(kb).localeCompare(String(ka));
    });
    return list;
  }

  function paintList() {
    var card = document.getElementById('cust-list-card');
    if (!card) return;
    var rows = visible();
    if (!S.list.length) {
      card.innerHTML = '<p style="color:#81717A;text-align:center;padding:22px 0;font-size:15px;">' + t('还没有客户档案。客户会在下单或线下开单时自动建档。') + '</p>';
      return;
    }
    if (!rows.length) {
      card.innerHTML = '<p style="color:#81717A;text-align:center;padding:22px 0;font-size:15px;">' + t('没有符合筛选的客户') + '</p>';
      return;
    }
    card.innerHTML =
      '<div class="cust-row cust-head"><span></span><span>' + t('客户 / 昵称') + '</span><span>' + t('联系方式') + '</span>' +
      '<span class="cust-col-hide">' + t('注册时间') + '</span><span class="cust-col-hide">' + t('订单') + '</span>' +
      '<span class="cust-col-hide">' + t('累计消费') + '</span><span>' + t('等级 / 到期') + '</span></div>' +
      rows.map(function (c) {
        var st = vipState(c);
        var s = statOf(c);
        var adm = isAdminRecord(c);
        return '<div class="cust-row' + (S.cur && S.cur.id === c.id ? ' on' : '') + '" data-cid="' + escAttr(c.id) + '">' +
          avatarOf(c) +
          '<div class="cust-cell"><b>' + esc(c.name || t('未命名')) + '</b>' +
            (adm ? ' <span class="cust-badge" style="color:#C4636E;">' + t('管理员') + '</span>' : '') +
            '<div class="cust-sub">' + esc(c.c_no || '') + '</div></div>' +
          '<div class="cust-cell">' + esc(c.email || '—') + '<div class="cust-sub">' + esc(c.phone || t('未填电话')) + '</div></div>' +
          '<div class="cust-cell cust-col-hide cust-sub">' + esc(String(c.created_at || '').slice(0, 10)) + '</div>' +
          '<div class="cust-cell cust-col-hide">' + s.count + '</div>' +
          '<div class="cust-cell cust-col-hide">' + money(s.sum) + '</div>' +
          '<div class="cust-cell"><span class="cust-badge" style="color:' + st.color + ';">' + esc(st.label) + '</span>' +
            (c.vip && c.vip_until ? '<div class="cust-sub">' + t('至 ') + esc(String(c.vip_until).slice(0, 10)) + '</div>' : '') + '</div>' +
          '</div>';
      }).join('');
    card.querySelectorAll('.cust-row[data-cid]').forEach(function (el) {
      el.addEventListener('click', function () {
        var c = S.list.filter(function (x) { return x.id === el.getAttribute('data-cid'); })[0];
        if (!c) return;
        S.cur = c;
        paintList();
        paintDetail();
        var d = document.getElementById('cust-detail');
        if (d && d.scrollIntoView) d.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  function logFor(c) {
    return (S.log || []).filter(function (x) { return String(x.customer_id) === String(c.id); })
      .sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); });
  }

  function paintDetail() {
    var box = document.getElementById('cust-detail');
    var c = S.cur;
    if (!box || !c) return;
    var st = vipState(c);
    var s = statOf(c);
    var adm = isAdminRecord(c);
    var d = daysUntil(c.vip_until);
    var logs = logFor(c);

    box.innerHTML =
      /* ① 基本资料 */
      '<div class="cust-sec"><h4>' + t('① 基本资料') + '</h4>' +
        '<p class="tip">' + esc(c.c_no || '') + ' · ' + t('建档于 ') + esc(String(c.created_at || '').slice(0, 10)) + '</p>' +
        '<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">' + avatarOf(c) +
          '<div><b style="font-size:18px;color:#55464E;">' + esc(c.name || t('未命名')) + '</b>' +
          '<div class="cust-sub">' + (adm ? t('管理员账号 · 权限不要在这里改') : (c.source === 'online' ? t('线上客户') : t('线下客户'))) + '</div></div></div>' +
        '<div class="cust-kv">' +
          '<div>' + t('邮箱') + '：<b>' + esc(c.email || '—') + '</b></div>' +
          '<div>' + t('电话') + '：<b>' + esc(c.phone || '—') + '</b></div>' +
          '<div>' + t('生日') + '：<b>' + esc(c.birthday || '—') + '</b>' + (c.birthday ? ' · ' + (c.notify_birthday !== false ? t('生日邮件开') : t('生日邮件关')) : '') + '</div>' +
          '<div>' + t('邮件语言') + '：<b>' + ((c.pref_lang || 'zh') === 'en' ? 'English' : '中文') + '</b></div>' +
        '</div></div>' +

      /* ② 会员 */
      '<div class="cust-sec"><h4>' + t('② 会员与等级') + '</h4>' +
        '<p class="tip">' + t('VIP 状态存在客户档案里，改这里就是改真实会员状态；管理员账号不允许在这里改动。') + '</p>' +
        '<div class="cust-kv" style="margin-bottom:12px;">' +
          '<div>' + t('等级') + '：<b>' + (c.vip ? 'VIP' : t('普通客户')) + '</b></div>' +
          '<div>' + t('状态') + '：<span class="cust-badge" style="color:' + st.color + ';">' + esc(st.label) + '</span></div>' +
          '<div>' + t('到期日') + '：<b>' + esc(c.vip_until ? String(c.vip_until).slice(0, 10) : '—') + '</b></div>' +
          '<div>' + t('剩余天数') + '：<b>' + (d == null ? '—' : (d < 0 ? t('已过期 ' + (-d) + ' 天') : d + t(' 天'))) + '</b></div>' +
        '</div>' +
        (adm
          ? '<p class="tip" style="color:#C4636E;">' + t('这个档案被标记为管理员账号，这里不提供会员改动，避免误改权限。') + '</p>'
          : '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">' +
              '<button type="button" class="btn-mini" data-act="vip-on">' + t('设为 VIP / 续费') + '</button>' +
              '<button type="button" class="btn-mini" data-act="vip-30">+30 天</button>' +
              '<button type="button" class="btn-mini" data-act="vip-90">+90 天</button>' +
              '<button type="button" class="btn-mini" data-act="vip-365">+365 天</button>' +
              '<input id="cust-until" type="date" value="' + escAttr(c.vip_until ? String(c.vip_until).slice(0, 10) : '') + '" style="padding:7px 10px;border-radius:10px;border:1.5px solid #FCE4EC;font-size:14px;font-family:inherit;color:#62545B;">' +
              '<button type="button" class="btn-mini" data-act="vip-set">' + t('按这个日期设置') + '</button>' +
              (c.vip ? '<button type="button" class="btn-del" data-act="vip-off">' + t('取消 VIP') + '</button>' : '') +
            '</div>') +
        '<div style="margin-top:14px;"><b style="font-size:15px;color:#55464E;">' + t('会员记录') + '</b>' +
          (logs.length
            ? '<div class="cust-log">' + logs.map(function (x) {
                return '· ' + esc(String(x.at || '').replace('T', ' ').slice(0, 16)) + '　' + esc(x.label || x.action || '') +
                  (x.from || x.to ? '（' + esc(x.from || '—') + ' → ' + esc(x.to || '—') + '）' : '');
              }).join('<br>') + '</div>'
            : '<p class="tip" style="margin:6px 0 0;">' + t('还没有记录。以后每次开通 / 续费 / 取消都会记在这里。') +
              (S.logOk === false ? ' ' + t('（会员记录读取失败，可能是权限；不影响上面的会员操作）') : '') + '</p>') +
        '</div></div>' +

      /* ③ 消费统计 */
      '<div class="cust-sec"><h4>' + t('③ 消费统计') + '</h4>' +
        '<p class="tip">' + t('口径：已付款订单计入；待付款/已取消不计；TEST- 测试单排除。') + '</p>' +
        '<div class="cust-kpi">' +
          kpiCell(t('订单数'), s.count) +
          kpiCell(t('累计消费'), money(s.sum)) +
          kpiCell(t('平均每单'), s.count ? money(s.sum / s.count) : '—') +
          kpiCell(t('最近下单'), s.last ? esc(String(s.last.created_at).slice(0, 10)) : '—') +
        '</div></div>' +

      /* ④ 历史订单 */
      '<div class="cust-sec"><h4>' + t('④ 历史订单') + '</h4>' +
        '<p class="tip">' + t('点订单号可以直接跳到订单管理里定位这一单。') + '</p>' +
        '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:14px;color:#62545B;">' +
          '<thead><tr style="color:#81717A;text-align:left;">' +
            '<th style="padding:8px 10px;">' + t('订单编号') + '</th><th style="padding:8px 10px;">' + t('日期') + '</th>' +
            '<th style="padding:8px 10px;">' + t('商品') + '</th><th style="padding:8px 10px;text-align:right;">' + t('金额') + '</th>' +
            '<th style="padding:8px 10px;">' + t('状态') + '</th></tr></thead><tbody>' +
          (s.all.length ? s.all.map(function (o) {
            var label = { pending: '待付款', reviewing: '待审核', rejected: '凭证有误', paid: '已付款', shipped: '已发货', completed: '已完成', cancelled: '已取消', refunding: '退款中', refunded: '已退款', archived: '已归档' }[o.status] || o.status;
            var items = [];
            try { items = typeof o.items === 'string' ? JSON.parse(o.items) : (o.items || []); } catch (e) { items = []; }
            var txt = (Array.isArray(items) ? items : []).map(function (it) { return (it.name || it.title || '?') + ' ×' + (it.qty || it.quantity || 1) + (it.variant || it.sku ? '（' + (it.variant || it.sku) + '）' : ''); }).join('、') || '—';
            return '<tr><td style="padding:8px 10px;"><a href="javascript:void(0)" class="cust-o" data-no="' + escAttr(o.order_no || '') + '" style="color:#A98D96;font-weight:600;text-decoration:underline;white-space:nowrap;">' + esc(o.order_no || '') + '</a>' + (isTest(o) ? ' <span class="cust-badge" style="color:#81717A;">TEST</span>' : '') + '</td>' +
              '<td style="padding:8px 10px;white-space:nowrap;">' + esc(String(o.created_at).slice(0, 10)) + '</td>' +
              '<td style="padding:8px 10px;min-width:160px;">' + esc(txt) + '</td>' +
              '<td style="padding:8px 10px;text-align:right;white-space:nowrap;font-weight:600;">' + money(num(o.total)) + '</td>' +
              '<td style="padding:8px 10px;white-space:nowrap;">' + esc(label) + '</td></tr>';
          }).join('') : '<tr><td colspan="5" style="padding:16px 10px;color:#81717A;">' + t('还没有订单') + '</td></tr>') +
          '</tbody></table></div></div>' +

      /* ⑤ 备注 */
      '<div class="cust-sec"><h4>' + t('⑤ 店主备注') + '</h4>' +
        '<p class="tip">' + t('只有你能看到，与订单里的内部备注是两回事。') + '</p>' +
        '<textarea id="cust-note" rows="3" style="width:100%;box-sizing:border-box;background:#FFF8FA;border:1.5px solid #FFE3EC;border-radius:12px;padding:10px 14px;font-size:15px;font-family:inherit;color:#55464E;outline:none;resize:vertical;">' + esc(c.note || '') + '</textarea>' +
        '<div style="display:flex;gap:10px;align-items:center;margin-top:10px;flex-wrap:wrap;">' +
          '<button type="button" class="btn-save-tb" id="cust-note-save">' + t('保存备注') + '</button>' +
          '<span class="cust-sub">' + t('走 shop_customer_save，只改 note，其它字段原样回传，不会覆盖资料') + '</span>' +
        '</div></div>';

    function kpiCell(l, v) {
      return '<div><div class="l">' + l + '</div><div class="v">' + v + '</div></div>';
    }
    box.querySelectorAll('.cust-o').forEach(function (a) {
      a.addEventListener('click', function () { jumpOrder(a.getAttribute('data-no')); });
    });
    box.querySelector('#cust-note-save').addEventListener('click', function () { saveNote(c, box.querySelector('#cust-note').value.trim(), this); });
    box.querySelectorAll('[data-act]').forEach(function (b) {
      b.addEventListener('click', function () { vipAction(c, b.getAttribute('data-act'), box); });
    });
  }

  function jumpOrder(no) {
    if (typeof window.switchTab === 'function') window.switchTab('shopmgr');
    setTimeout(function () {
      var inp = document.getElementById('sm-o-search');
      if (inp) { inp.value = no; inp.dispatchEvent(new Event('input', { bubbles: true })); }
      if (typeof toast === 'function') toast(t('已在订单管理里搜索 ' + no));
    }, 350);
  }

  function saveNote(c, note, btn) {
    btn.disabled = true;
    var body = {
      p_id: c.id, p_name: c.name || '', p_email: c.email || '', p_phone: c.phone || '',
      p_note: note, p_source: c.source || 'offline', p_birthday: c.birthday || null,
      p_pref_lang: c.pref_lang || 'zh', p_notify_birthday: c.notify_birthday !== false
    };
    api('rpc/shop_customer_save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        btn.disabled = false;
        if (j && j.message && /error|denied|fail/i.test(String(j.message))) { toast(String(j.message)); return; }
        c.note = note;
        toast(t('备注已保存'));
      }).catch(function () { btn.disabled = false; toast(t('保存失败，重试一下')); });
  }

  function addDays(base, n) {
    var d = base ? new Date(String(base).slice(0, 10) + 'T12:00:00') : new Date();
    if (isNaN(d.getTime())) d = new Date();
    if (d.getTime() < Date.now()) d = new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }

  function vipAction(c, act, box) {
    var from = c.vip ? (c.vip_until ? String(c.vip_until).slice(0, 10) : t('无到期日')) : t('普通');
    var to = null, label = '';
    if (act === 'vip-on') { to = c.vip && c.vip_until ? addDays(c.vip_until, 365) : addDays(null, 365); label = c.vip ? t('续费 365 天') : t('开通 VIP'); }
    if (act === 'vip-30') { to = addDays(c.vip_until, 30); label = t('续费 30 天'); }
    if (act === 'vip-90') { to = addDays(c.vip_until, 90); label = t('续费 90 天'); }
    if (act === 'vip-365') { to = addDays(c.vip_until, 365); label = t('续费 365 天'); }
    if (act === 'vip-set') {
      var el = box.querySelector('#cust-until');
      to = el ? el.value : '';
      if (!to) { toast(t('先选一个到期日期')); return; }
      label = t('设为存入日期');
    }
    if (act === 'vip-off') {
      if (!window.confirm(t('取消 ' + (c.name || '这位客户') + ' 的 VIP？\n\n· 客户资料和订单都保留\n· 会员到期日会被清空'))) return;
      label = t('取消 VIP'); to = null;
    }
    if (act !== 'vip-off' && !window.confirm(t('把 ' + (c.name || '这位客户') + ' 的会员改为：' + label + '，到期 ' + (to || '—') + '？'))) return;
    var body = { vip: act !== 'vip-off', vip_until: to, updated_at: new Date().toISOString() };
    if (isAdminRecord(c)) { toast(t('这个档案是管理员账号，不能在这里改会员')); return; }
    api('shop_customers?id=eq.' + c.id, { method: 'PATCH', body: JSON.stringify(body) })
      .then(function (r) {
        if (!r.ok) { toast(t('操作失败，权限或网络问题')); return; }
        c.vip = body.vip; c.vip_until = to;
        toast(t('已更新：' + label + '（到期 ' + (to || '—') + '）'));
        writeLog(c, label, from, to || '—');
        paintKpi(); paintList(); paintDetail();
      })
      .catch(function () { toast(t('操作失败，重试一下')); });
  }

  function writeLog(c, label, from, to) {
    var entry = { customer_id: c.id, name: c.name || '', action: label, label: label, from: from, to: to, at: new Date().toISOString() };
    var next = (S.log || []).concat([entry]).slice(-500);
    api('site_settings?on_conflict=key', {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify([{ key: 'vip_log', value: JSON.stringify(next) }])
    }).then(function (r) {
      if (r && r.ok) { S.log = next; S.logOk = true; paintDetail(); }
      else { S.logOk = false; }
    }).catch(function () { S.logOk = false; });
  }

  window.CustomerPage = { boot: boot, _S: S, _vipState: vipState, _addDays: addDays, _visible: visible };
})();
