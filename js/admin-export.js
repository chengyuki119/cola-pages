/* ═══════════════════════════════════════════════════════════════════
   订单导出 + 商品清单打印（Snow Yuzu 后台半边 · 纯新增，不改现有文件）
   · 挂载点：admin.html 里的 #tab-export / #tab-print
   · 注册 window.EXPORT = { bootExport, bootPrint }（幂等，可放心重复调用）
   · 数据源：
       shop_orders?select=*&order=created_at.desc&limit=500
       shop_order_pay_records?order_id=in.(...)   手动付款/退款记录
       shop_packages?order_id=in.(...)            多包裹物流
   · 纯函数 csvCell 带防公式注入；内联断言样例：
       断言1  csvCell('=SUM(A1:A2)')      === "'=SUM(A1:A2)"
       断言2  csvCell('@cmd|del a"b,c\nd') === "\"'@cmd|del a\"\"b,c\nd\""
              （先加防注入前缀 '，再因含引号/逗号/换行整体双引号包裹并双写引号）
       断言3  csvCell('-12.50')           === "-12.50"
              （纯数字字符串不加前缀，避免把负数金额破坏成文本）
       断言3b csvCell('a"b')              === '"a""b"'
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  function t(zh, en) { return (window.LANG === 'en') ? en : zh; }

  /* ── 纯函数：CSV 单元格（防公式注入 + 引号转义）──────────────────── */
  function csvCell(v) {
    var s = (v == null ? '' : String(v));
    // 防公式注入：字符串以 = + - @ 开头时前面加 '（纯数字字符串除外，保住负数金额）
    if (typeof v !== 'number' && /^[=+\-@]/.test(s) && !/^-?\d*\.?\d+$/.test(s)) s = "'" + s;
    // 含引号 / 逗号 / 换行：整体双引号包裹，内部引号双写
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  /* ── 纯函数：SpreadsheetML 转义 + 工作簿生成 ─────────────────────── */
  function xmlEsc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }
  function xlsRow(cells) {
    return '<Row>' + cells.map(function (c) {
      var isNum = c && typeof c === 'object' && ('n' in c);
      var val = isNum ? c.v : c;
      return '<Cell><Data ss:Type="' + (isNum ? 'Number' : 'String') + '">' + xmlEsc(val) + '</Data></Cell>';
    }).join('') + '</Row>';
  }
  // sheetName: 工作表名；header: 字符串数组；rows: 每行是单元格数组，
  // 普通字符串 → ss:Type="String"，{ v: '12.00', n: 12 } 形态 → ss:Type="Number"
  function xlsWorkbook(sheetName, header, rows) {
    var out = ['<?xml version="1.0"?>', '<?mso-application progid="Excel.Sheet"?>'];
    out.push('<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">');
    out.push('<Worksheet ss:Name="' + xmlEsc(sheetName) + '"><Table>');
    out.push(xlsRow(header));
    rows.forEach(function (r) { out.push(xlsRow(r)); });
    out.push('</Table></Worksheet></Workbook>');
    return out.join('\r\n');
  }

  /* ── 小工具 ── */
  function arr(v) { return Array.isArray(v) ? v : []; }
  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }
  function n2(v) { return Math.round(num(v) * 100) / 100; }
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  function fmtDT(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes());
  }
  function stamp() { // 文件名用：YYYYMMDD-HHMM（本地时间）
    var d = new Date();
    return '' + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + '-' + p2(d.getHours()) + p2(d.getMinutes());
  }
  // 金额单元格：CSV 里出 "12.00"（纯数字字符串不会触发防注入前缀），Excel 里出 Number
  function money(v) { return { v: (num(v)).toFixed(2), n: n2(v) }; }
  function qty(v) { var q = parseInt(v, 10); if (!isFinite(q)) q = 0; return { v: String(q), n: q }; }

  function restGet(path) {
    return api(path).then(function (r) { if (!r.ok) throw new Error('http'); return r.json(); });
  }
  function download(name, content, mime) {
    var blob = new Blob([content], { type: mime });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { try { URL.revokeObjectURL(a.href); } catch (e) {} a.remove(); }, 800);
  }

  /* ── 标签 ── */
  var ST_LABEL = {
    pending: '待付款', reviewing: '待审核付款', rejected: '凭证有误', paid: '已付款',
    shipped: '已发货', completed: '已完成', cancelled: '已取消', refunding: '退款处理中', refunded: '已退款'
  };
  var STATUSES = [
    ['pending', '待付款'], ['reviewing', '待审核'], ['rejected', '凭证有误'], ['paid', '待发货'],
    ['shipped', '已发货'], ['completed', '已完成'], ['cancelled', '已取消'], ['refunding', '退款中'], ['refunded', '已退款']
  ];
  // 来源：站内历史值 admin（后台手动开单）归入「线下」
  function srcLabel(s) {
    return { online: '线上', offline: '线下', admin: '线下（后台）', import: '导入' }[s || 'online'] || (s || '线上');
  }
  var KIND_LABEL = { deposit: '定金', final: '尾款', installment: '分期款', refund: '退款', other: '其他' };
  var PKG_LABEL = { pending: '待发出', shipped: '已发出', delivered: '已送达', returned: '已退回' };

  /* ── 自定义勾选框（禁原生 checkbox）：边框 #FFD9E6、选中 var(--accent-soft,#FCE4EC)、圆头 SVG 勾 ── */
  var CK_SVG = '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8.5 6.5 12 13 4.5" stroke="#D4719A" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function cbHtml(oid, on) {
    return '<span class="ex-cb' + (on ? ' on' : '') + '" data-cb="' + escAttr(oid) + '" role="checkbox" aria-checked="' + (on ? 'true' : 'false') + '">' + CK_SVG + '</span>';
  }

  /* ── 样式：只作用于两个 tab（前缀 ex-）── */
  var CSS_DONE = false;
  function injectCss() {
    if (CSS_DONE) return;
    CSS_DONE = true;
    var css = document.createElement('style');
    css.textContent = [
      '#tab-export .ex-card, #tab-print .ex-card { background:#fff; border-radius:var(--radius,16px); padding:16px 18px; margin-bottom:14px; box-shadow:0 2px 10px rgba(180,120,150,.12); }',
      '#tab-export .ex-card h3, #tab-print .ex-card h3 { margin:0 0 10px; font-size:17px; }',
      '#tab-export .ex-frow, #tab-print .ex-frow { display:flex; gap:10px; flex-wrap:wrap; align-items:center; margin-bottom:10px; }',
      '#tab-export .ex-lbl, #tab-print .ex-lbl { font-size:15px; color:var(--muted,#A88E9B); flex:none; }',
      '#tab-export .ex-date, #tab-print .ex-date { background:#fff; border:1.5px solid #FFD9E6; border-radius:10px; padding:8px 12px; font-size:15px; font-family:inherit; color:var(--text,#604C57); outline:none; }',
      '#tab-export .ex-date:focus, #tab-print .ex-date:focus { border-color:var(--accent,#ffd9e6); }',
      '#tab-export .ex-input, #tab-print .ex-input { background:#fff; border:1.5px solid #FFD9E6; border-radius:10px; padding:9px 12px; font-size:15px; font-family:inherit; color:var(--text,#604C57); outline:none; width:280px; max-width:100%; }',
      '#tab-export .ex-hint, #tab-print .ex-hint { font-size:14px; color:var(--muted,#A88E9B); margin-top:8px; line-height:1.6; }',
      '#tab-export .ex-cb, #tab-print .ex-cb { width:22px; height:22px; border:1.5px solid var(--border,#FFD9E6); border-radius:7px; background:#fff; display:inline-flex; align-items:center; justify-content:center; cursor:pointer; flex:none; transition:background .15s; box-sizing:border-box; }',
      '#tab-export .ex-cb svg, #tab-print .ex-cb svg { width:14px; height:14px; opacity:0; transition:opacity .15s; }',
      '#tab-export .ex-cb.on, #tab-print .ex-cb.on { background:var(--accent-soft,#FCE4EC); }',
      '#tab-export .ex-cb.on svg, #tab-print .ex-cb.on svg { opacity:1; }',
      '#tab-export .ex-row, #tab-print .ex-row { display:flex; align-items:center; gap:10px; padding:8px 4px; border-bottom:1px dashed var(--card-hover,#FCE4EC); cursor:pointer; }',
      '#tab-export .ex-row:last-child, #tab-print .ex-row:last-child { border-bottom:none; }',
      '#tab-export .ex-row:hover, #tab-print .ex-row:hover { background:var(--card,#FFF0F5); border-radius:10px; }',
      '#tab-export .ex-row .ex-no, #tab-print .ex-row .ex-no { font-weight:700; color:var(--text,#604C57); }',
      '#tab-export .ex-row .ex-sub, #tab-print .ex-row .ex-sub { font-size:15px; color:var(--muted,#A88E9B); }',
      '#tab-export .ex-money, #tab-print .ex-money { color:var(--price,#ff6fa5); font-weight:600; }',
      '#tab-export .ex-empty, #tab-print .ex-empty { text-align:center; color:var(--muted,#A88E9B); font-size:16px; padding:20px 0; }',
      '#tab-export .ex-chips, #tab-print .ex-chips { display:flex; gap:6px; flex-wrap:wrap; }',
      '#tab-export .ex-grp-list, #tab-print .ex-grp-list { display:flex; gap:6px; flex-wrap:wrap; }',
      '#tab-export .ex-btns, #tab-print .ex-btns { display:flex; gap:10px; flex-wrap:wrap; align-items:center; }',
      '#tab-export .ex-pv-head, #tab-print .ex-pv-head { font-size:15px; color:var(--text,#604C57); margin:10px 0 4px; }',
      '#tab-export .ex-pv-cols, #tab-print .ex-pv-cols { font-size:14px; color:var(--muted,#A88E9B); line-height:1.8; margin-bottom:6px; }',
      '#tab-export .ex-pv-cols b, #tab-print .ex-pv-cols b { color:var(--text,#604C57); margin-right:6px; }',
      '#tab-export .ex-pv-tblwrap { overflow:auto; max-height:260px; border:1.5px solid var(--card-hover,#FCE4EC); border-radius:12px; }',
      '#tab-export table.ex-pv, #tab-print table.ex-pv { border-collapse:collapse; font-size:13px; white-space:nowrap; }',
      '#tab-export table.ex-pv th, #tab-export table.ex-pv td, #tab-print table.ex-pv th, #tab-print table.ex-pv td { border:1px solid var(--card-hover,#FCE4EC); padding:5px 9px; text-align:left; max-width:260px; overflow:hidden; text-overflow:ellipsis; }',
      '#tab-export table.ex-pv th, #tab-print table.ex-pv th { background:var(--card,#FFF0F5); color:var(--text,#604C57); font-weight:600; position:sticky; top:0; }'
    ].join('\n');
    document.head.appendChild(css);
  }

  /* ── 数据加载 ── */
  function loadOrders() {
    return restGet('shop_orders?select=*&status=neq.deleted&order=created_at.desc&limit=500')
      .then(function (rows) { return window.YkOrderDel ? window.YkOrderDel.filter(rows) : rows; })
      .then(function (rows) { return arr(rows); })
      .catch(function () { return arr(window.SHOP_ORDERS); }); // 未连库时回退到可注入的假数组
  }
  function inFilter(ids) { return 'in.(' + ids.join(',') + ')'; }
  function fetchPayRecords(ids) {
    if (!ids.length) return Promise.resolve([]);
    return restGet('shop_order_pay_records?select=*&order_id=' + inFilter(ids) + '&order=paid_at.asc')
      .catch(function () { return []; });
  }
  function fetchPackages(ids) {
    if (!ids.length) return Promise.resolve([]);
    return restGet('shop_packages?select=*&order_id=' + inFilter(ids) + '&order=shipped_at.asc')
      .catch(function () { return []; });
  }
  function indexBy(list, key) {
    var m = {};
    arr(list).forEach(function (x) {
      var k = String(x[key]);
      (m[k] = m[k] || []).push(x);
    });
    return m;
  }

  /* ── 付款汇总：已付 = 非退款记录合计；无记录时回退 pay_amount（她定的口径）── */
  function payAgg(o, ctx) {
    var recs = ctx.pay[String(o.id)] || [];
    if (!recs.length) return { paid: n2(o.pay_amount), refunded: 0, cnt: 0, recs: [] };
    var paid = 0, refunded = 0;
    recs.forEach(function (r) {
      if (r.kind === 'refund') refunded += num(r.amount);
      else paid += num(r.amount);
    });
    return { paid: n2(paid), refunded: n2(refunded), cnt: recs.length, recs: recs };
  }
  function kindSum(o, ctx, kind) {
    return n2((ctx.pay[String(o.id)] || []).filter(function (r) { return r.kind === kind; })
      .reduce(function (t2, r) { return t2 + num(r.amount); }, 0));
  }
  function payDetailLines(recs) {
    return recs.map(function (r) {
      var seg = [KIND_LABEL[r.kind] || r.kind || '其他', '$' + num(r.amount).toFixed(2)];
      if (r.method) seg.push(r.method);
      if (r.txn_ref) seg.push('单号 ' + r.txn_ref);
      if (r.paid_at) seg.push(fmtDT(r.paid_at));
      seg.push(r.verified ? '已核实' : '未核实');
      if (r.note) seg.push(r.note);
      return seg.join(' · ');
    });
  }

  /* ── 通用范围筛选（日期 + 状态多选 + 来源）── */
  function scopeFilter(st, o) {
    var hasSt = false, stOk = false;
    for (var k in st.stSet) { if (st.stSet[k]) { hasSt = true; if (k === o.status) stOk = true; } }
    if (hasSt && !stOk) return false;
    if (st.src !== 'all') {
      var s = o.order_source || 'online';
      if (st.src === 'offline') { if (s !== 'offline' && s !== 'admin') return false; }
      else if (s !== st.src) return false;
    }
    var d = (o.created_at || '').slice(0, 10);
    if (st.from && d < st.from) return false;
    if (st.to && d > st.to) return false;
    return true;
  }
  function scopeOrders(st, all) { return arr(all).filter(function (o) { return scopeFilter(st, o); }); }

  /* ── 导出列定义（分组 → 中文列头）────────────────────────────────
     商品明细采用「每个商品一行，主键列（订单号/时间/买家等）逐行重复」，
     方便在 Excel 里直接对订单号筛选/透视；无商品订单出 1 行空明细。 */
  var ITEM_COLS = [
    ['商品名称', function (it) { return (it && it.name) || ''; }],
    ['规格/SKU', function (it) { return (it && (it.sku || it.variant)) || ''; }],
    ['单价', function (it) { return money(it && it.price); }],
    ['数量', function (it) { return qty(it && it.qty); }],
    ['行小计', function (it) { return money(num(it && it.price) * num(it && it.qty)); }],
    ['定制/备注', function (it) { return (it && it.note) || ''; }],
    ['商品图片', function (it) { return (it && it.image) || ''; }]
  ];
  var GROUPS = [
    { id: 'base', label: '① 订单基本信息', cols: [
      ['订单号', function (o) { return o.order_no || ''; }],
      ['下单时间', function (o) { return fmtDT(o.created_at); }],
      ['订单状态', function (o) { return ST_LABEL[o.status] || o.status || ''; }],
      ['订单来源', function (o) { return srcLabel(o.order_source); }],
      ['客户ID', function (o) { return o.customer_id == null ? '' : String(o.customer_id); }],
      ['币种', function (o) { return o.currency || ''; }],
      ['商品小计', function (o) { return money(o.subtotal); }],
      ['优惠金额', function (o) { return money(o.discount); }],
      ['运费', function (o) { return money(o.shipping_actual != null && o.shipping_actual !== '' ? o.shipping_actual : o.shipping_est); }],
      ['服务费', function (o) { return money(o.service_fee); }],
      ['订单总额', function (o) { return money(o.total); }],
      ['买家备注', function (o) { return o.note || ''; }],
      ['内部备注', function (o) { return o.admin_note || ''; }]
    ] },
    { id: 'buyer', label: '② 买家信息和地址', cols: [
      ['收件人', function (o) { var a = o.address || {}; return a.name || ''; }],
      ['联系电话', function (o) { var a = o.address || {}; return a.phone || ''; }],
      ['邮箱', function (o) { return o.email || ''; }],
      ['地址1', function (o) { var a = o.address || {}; return a.line1 || a.street || ''; }],
      ['地址2', function (o) { var a = o.address || {}; return a.line2 || ''; }],
      ['城市', function (o) { var a = o.address || {}; return a.city || ''; }],
      ['州/省', function (o) { var a = o.address || {}; return a.state || ''; }],
      ['邮编', function (o) { var a = o.address || {}; return a.zip || ''; }],
      ['国家', function (o) { var a = o.address || {}; return a.country || ''; }]
    ] },
    { id: 'items', label: '③ 商品明细', cols: ITEM_COLS },
    { id: 'pay', label: '④ 付款和退款历史', cols: [
      ['支付渠道', function (o) { return o.pay_channel || ''; }],
      ['支付金额', function (o) { return money(o.pay_amount); }],
      ['已付总额（含手动）', function (o, ctx) { return money(payAgg(o, ctx).paid); }],
      ['退款总额', function (o, ctx) { return money(payAgg(o, ctx).refunded); }],
      ['付款笔数', function (o, ctx) { return qty(payAgg(o, ctx).cnt); }],
      ['付款记录明细', function (o, ctx) { return payDetailLines(payAgg(o, ctx).recs).join('\n'); }]
    ] },
    { id: 'debt', label: '⑤ 欠款清单', cols: [
      ['应付金额', function (o) { return money(o.total); }],
      ['已付金额', function (o, ctx) { return money(payAgg(o, ctx).paid); }],
      ['已退金额', function (o, ctx) { return money(payAgg(o, ctx).refunded); }],
      ['欠款金额', function (o, ctx) { var a = payAgg(o, ctx); return money(num(o.total) - a.paid + a.refunded); }]
    ] },
    { id: 'todo', label: '⑥ 待制作和待发货清单', cols: [
      ['处理标记', function (o) {
        if (o.status === 'reviewing') return '待审核付款';
        if (o.status === 'paid') {
          var custom = arr(o.items).some(function (it) { return it && it.note; });
          return custom ? '待制作 + 待发货' : '待发货';
        }
        return '';
      }],
      ['商品总件数', function (o) { return qty(arr(o.items).reduce(function (t, it) { return t + num(it && it.qty); }, 0)); }],
      ['定制要求汇总', function (o) {
        return arr(o.items).filter(function (it) { return it && it.note; })
          .map(function (it) { return (it.name || '') + '×' + num(it.qty) + '：' + it.note; }).join('\n');
      }]
    ] },
    { id: 'plan', label: '⑧ 定金与尾款', cols: [
      ['定金应收', function (o) { return money(o.deposit_due); }],
      ['定金已收', function (o, ctx) { return money(kindSum(o, ctx, 'deposit')); }],
      ['尾款应收', function (o) { return money(o.balance_due); }],
      ['尾款已收', function (o, ctx) { return money(kindSum(o, ctx, 'final')); }],
      ['已收合计', function (o, ctx) { return money(payAgg(o, ctx).paid); }],
      ['剩余待收', function (o, ctx) { var a = payAgg(o, ctx); return money(Math.max(0, num(o.total) - a.paid + a.refunded)); }],
      ['收款进度', function (o, ctx) {
        var a = payAgg(o, ctx); var t2 = num(o.total);
        var pct = t2 > 0 ? Math.round((a.paid - a.refunded) / t2 * 100) : 0;
        return { v: pct + '%', n: pct };
      }]
    ] },
    { id: 'ship', label: '⑦ 物流信息', cols: [
      ['承运商', function (o) { return o.carrier || ''; }],
      ['运单号', function (o) { return o.tracking || ''; }],
      ['包裹数', function (o, ctx) { return qty((ctx.pkg[String(o.id)] || []).length); }],
      ['包裹明细（多包裹逐行）', function (o, ctx) {
        return (ctx.pkg[String(o.id)] || []).map(function (p) {
          var seg = [p.carrier || '', p.tracking || '', PKG_LABEL[p.status] || p.status || ''];
          if (p.shipped_at) seg.push('发出 ' + fmtDT(p.shipped_at));
          if (p.delivered_at) seg.push('送达 ' + fmtDT(p.delivered_at));
          return seg.filter(Boolean).join(' · ');
        }).join('\n');
      }],
      ['追踪链接', function (o, ctx) {
        var pkgs = ctx.pkg[String(o.id)] || [];
        for (var i = 0; i < pkgs.length; i++) if (pkgs[i] && pkgs[i].track_url) return pkgs[i].track_url;
        return '';
      }]
    ] }
  ];

  // 行构建：返回 { head:[中文名], rows:[[cell,...]] }；cell 为字符串或 { v, n }
  function buildExport(orders, ctx, groupSel) {
    var sel = GROUPS.filter(function (g) { return groupSel[g.id]; });
    var head = [];
    sel.forEach(function (g) { g.cols.forEach(function (c) { head.push(c[0]); }); });
    var rows = [];
    orders.forEach(function (o) {
      var segs = {};
      sel.forEach(function (g) {
        segs[g.id] = g.cols.map(function (c) { return c[1](o, ctx); });
      });
      if (g2(sel, 'items')) {
        // 每个商品一行：主键列重复；商品段插在它自己在列头里的位置（②之后），不追加到行尾
        var its = arr(o.items);
        var makeLine = function (it) {
          var line = [];
          sel.forEach(function (g) {
            if (g.id === 'items') line = line.concat(ITEM_COLS.map(function (c) { return c[1](it); }));
            else line = line.concat(segs[g.id]);
          });
          return line;
        };
        if (!its.length) rows.push(makeLine(null));
        else its.forEach(function (it) { rows.push(makeLine(it)); });
      } else {
        var line = [];
        sel.forEach(function (g) { line = line.concat(segs[g.id]); });
        rows.push(line);
      }
    });
    return { head: head, rows: rows };
  }
  function g2(sel, id) { for (var i = 0; i < sel.length; i++) if (sel[i].id === id) return true; return false; }

  /* ── 订单列表（两个 tab 共用渲染，各自独立状态）── */
  function listHtml(st, orders) {
    if (!orders.length) return '<div class="ex-empty">没有符合条件的订单，换一下筛选再试试 ♡</div>';
    return orders.map(function (o) {
      var a = o.address || {};
      return '<div class="ex-row" data-oid="' + escAttr(o.id) + '">' +
        cbHtml(o.id, !!st.sel[o.id]) +
        '<span class="ex-no">' + esc(o.order_no || '(无单号)') + '</span>' +
        '<span class="ex-sub">' + esc(fmtDT(o.created_at)) + ' · ' + esc(ST_LABEL[o.status] || o.status || '') +
        ' · ' + esc(srcLabel(o.order_source)) + (a.name ? ' · ' + esc(a.name) : '') + '</span>' +
        '<span class="ex-money" style="margin-left:auto;">$' + esc(fmtMoney(o.total)) + '</span>' +
        '</div>';
    }).join('');
  }
  function chipsStatusHtml(st) {
    return STATUSES.map(function (s) {
      return '<button type="button" class="dy-chip' + (st.stSet[s[0]] ? ' active' : '') + '" data-act="st" data-v="' + s[0] + '">' + s[1] + '</button>';
    }).join('');
  }
  function chipsSrcHtml(st) {
    return [['all', '全部'], ['online', '线上'], ['offline', '线下'], ['import', '导入']].map(function (s) {
      return '<button type="button" class="dy-chip' + (st.src === s[0] ? ' active' : '') + '" data-act="src" data-v="' + s[0] + '">' + s[1] + '</button>';
    }).join('');
  }
  function selCount(st) { var n = 0; for (var k in st.sel) if (st.sel[k]) n++; return n; }

  // 两个 tab 的公共交互（状态 chips / 来源 chips / 日期 / 勾选）
  function bindCommon(root, st, rerender) {
    root.addEventListener('click', function (e) {
      var cb = e.target.closest('.ex-cb');
      if (cb) {
        var oid = cb.getAttribute('data-cb');
        st.sel[oid] = !st.sel[oid];
        cb.classList.toggle('on', st.sel[oid]);
        cb.setAttribute('aria-checked', st.sel[oid] ? 'true' : 'false');
        var cnt = root.querySelector('.ex-sel-cnt');
        if (cnt) cnt.textContent = '已勾选 ' + selCount(st) + ' 笔';
        return;
      }
      var row = e.target.closest('.ex-row[data-oid]');
      if (row) {
        var oid2 = row.getAttribute('data-oid');
        st.sel[oid2] = !st.sel[oid2];
        var cb2 = row.querySelector('.ex-cb');
        if (cb2) cb2.classList.toggle('on', st.sel[oid2]);
        var cnt2 = root.querySelector('.ex-sel-cnt');
        if (cnt2) cnt2.textContent = '已勾选 ' + selCount(st) + ' 笔';
        return;
      }
      var stb = e.target.closest('[data-act="st"]');
      if (stb) {
        var v = stb.getAttribute('data-v');
        st.stSet[v] = !st.stSet[v];
        rerender();
        return;
      }
      var srb = e.target.closest('[data-act="src"]');
      if (srb) { st.src = srb.getAttribute('data-v'); rerender(); return; }
      var ab = e.target.closest('[data-act="selall"]');
      if (ab) {
        scopeOrders(st, st.all).forEach(function (o) { st.sel[o.id] = true; });
        rerender();
        return;
      }
      var ib = e.target.closest('[data-act="invert"]');
      if (ib) {
        scopeOrders(st, st.all).forEach(function (o) { st.sel[o.id] = !st.sel[o.id]; });
        rerender();
        return;
      }
    });
    root.addEventListener('change', function (e) {
      var inp = e.target.closest('input.ex-date');
      if (inp) {
        if (inp.getAttribute('data-f') === 'from') st.from = inp.value || '';
        else st.to = inp.value || '';
        var cnt = root.querySelector('.ex-sel-cnt');
        if (cnt) cnt.textContent = '已勾选 ' + selCount(st) + ' 笔';
      }
    });
  }
  function filtersHtml(st) {
    return '<div class="ex-frow"><span class="ex-lbl">' + t('日期', 'Date') + '</span>' +
      '<input type="date" class="ex-date" data-f="from" value="' + escAttr(st.from) + '">' +
      '<span class="ex-lbl">' + t('至', 'to') + '</span>' +
      '<input type="date" class="ex-date" data-f="to" value="' + escAttr(st.to) + '">' +
      '<span class="ex-hint" style="margin:0;">' + t('不填 = 不限日期；状态不勾 = 全部状态', 'Leave empty for no date limit; no status chips = all statuses') + '</span></div>' +
      '<div class="ex-frow"><span class="ex-lbl">' + t('状态', 'Status') + '</span><div class="ex-chips ex-st-chips">' + chipsStatusHtml(st) + '</div></div>' +
      '<div class="ex-frow" style="margin-bottom:0;"><span class="ex-lbl">' + t('来源', 'Source') + '</span><div class="ex-chips">' + chipsSrcHtml(st) + '</div></div>';
  }

  /* ═══ 模块一：订单导出（#tab-export）═══ */
  var EX = {
    booted: false, all: [], sel: {}, stSet: {}, src: 'all', from: '', to: '',
    mode: 'all', orderNo: '',
    groups: { base: true, buyer: true, items: true, pay: true, debt: true, todo: true, ship: true }
  };

  function exRender(root) {
    root.innerHTML =
      '<div class="ex-card"><h3>' + t('筛选', 'Filters') + '</h3>' + filtersHtml(EX) + '</div>' +
      '<div class="ex-card"><h3>' + t('导出范围', 'Scope') + '</h3>' +
        '<div class="ex-frow">' +
          '<button type="button" class="dy-chip' + (EX.mode === 'all' ? ' active' : '') + '" data-act="mode" data-v="all">' + t('全部符合条件', 'All matching') + '</button>' +
          '<button type="button" class="dy-chip' + (EX.mode === 'sel' ? ' active' : '') + '" data-act="mode" data-v="sel">' + t('勾选订单', 'Selected') + '</button>' +
          '<button type="button" class="dy-chip' + (EX.mode === 'one' ? ' active' : '') + '" data-act="mode" data-v="one">' + t('单笔订单', 'Single order') + '</button>' +
          '<span class="ex-sel-cnt ex-lbl">已勾选 ' + selCount(EX) + ' 笔</span>' +
        '</div>' +
        '<div data-wrap="sel" style="' + (EX.mode === 'sel' ? '' : 'display:none;') + '">' +
          '<div class="ex-frow">' +
            '<button type="button" class="dy-chip" data-act="selall">' + t('全选', 'Select all') + '</button>' +
            '<button type="button" class="dy-chip" data-act="invert">' + t('反选', 'Invert') + '</button>' +
          '</div>' +
          '<div class="ex-list">' + listHtml(EX, scopeOrders(EX, EX.all)) + '</div>' +
        '</div>' +
        '<div data-wrap="one" style="' + (EX.mode === 'one' ? '' : 'display:none;') + '">' +
          '<input class="ex-input ex-ono" placeholder="' + escAttr(t('输入完整订单号，如 SY-2026…', 'Enter full order number')) + '" value="' + escAttr(EX.orderNo) + '">' +
        '</div>' +
      '</div>' +
      '<div class="ex-card"><h3>' + t('导出内容（可多选）', 'Sections') + '</h3>' +
        '<div class="ex-grp-list">' + GROUPS.map(function (g) {
          return '<button type="button" class="dy-chip' + (EX.groups[g.id] ? ' active' : '') + '" data-act="grp" data-v="' + g.id + '">' + g.label + '</button>';
        }).join('') + '</div>' +
        '<div class="ex-hint">③ 商品明细采用「每个商品一行，订单主键列（订单号/时间/买家等）逐行重复」，方便在表格里直接按订单号筛选；没有商品的订单出 1 行空明细。⑤ 欠款 = 应付 −（手动付款记录合计，无记录时用支付金额）+ 退款。</div>' +
      '</div>' +
      '<div class="ex-btns">' +
        '<button type="button" class="btn-mini btn-save-tb" data-act="go-csv">' + t('导出 CSV', 'Export CSV') + '</button>' +
        '<button type="button" class="btn-mini" data-act="go-xls">' + t('导出 Excel(.xls)', 'Export Excel(.xls)') + '</button>' +
        '<span class="ex-hint" style="margin:0;">' + t('导出前会先弹预览确认', 'A preview modal opens before exporting') + '</span>' +
      '</div>';
  }

  function exBoot(root) {
    exRender(root);
    bindCommon(root, EX, function () { exRender(root); });
    root.addEventListener('click', function (e) {
      var mb = e.target.closest('[data-act="mode"]');
      if (mb) { EX.mode = mb.getAttribute('data-v'); exRender(root); return; }
      var gb = e.target.closest('[data-act="grp"]');
      if (gb) {
        var gid = gb.getAttribute('data-v');
        EX.groups[gid] = !EX.groups[gid];
        gb.classList.toggle('active', EX.groups[gid]);
        return;
      }
      var ono = e.target.closest('.ex-ono');
      if (ono) { EX.orderNo = ono.value; return; }
      if (e.target.closest('[data-act="go-csv"]')) { exStart(root, 'csv'); return; }
      if (e.target.closest('[data-act="go-xls"]')) { exStart(root, 'xls'); }
    });
    root.addEventListener('input', function (e) {
      if (e.target.classList && e.target.classList.contains('ex-ono')) EX.orderNo = e.target.value;
    });
    loadOrders().then(function (rows) {
      EX.all = rows;
      var list = root.querySelector('.ex-list');
      if (list) list.innerHTML = listHtml(EX, scopeOrders(EX, EX.all));
    }).catch(function () {
      toast('订单列表加载失败：数据库没连上');
    });
  }

  function exScopeOrders() {
    if (EX.mode === 'one') {
      var no = (EX.orderNo || '').trim();
      if (!no) return [];
      return EX.all.filter(function (o) { return String(o.order_no || '').toLowerCase() === no.toLowerCase(); });
    }
    if (EX.mode === 'sel') return EX.all.filter(function (o) { return EX.sel[o.id]; });
    return scopeOrders(EX, EX.all);
  }

  function exStart(root, kind) {
    var orders = exScopeOrders();
    if (!orders.length) {
      toast(EX.mode === 'one' ? '没找到这个订单号，检查一下再试' : '没有符合条件的订单，先调一下筛选或勾选');
      return;
    }
    var grpCount = 0;
    for (var k in EX.groups) if (EX.groups[k]) grpCount++;
    if (!grpCount) { toast('至少勾一个导出内容分组'); return; }
    var btn = e2btn(root, kind === 'csv' ? '[data-act="go-csv"]' : '[data-act="go-xls"]');
    if (btn) { btn.disabled = true; }
    var ids = orders.map(function (o) { return String(o.id); });
    Promise.all([fetchPayRecords(ids), fetchPackages(ids)]).then(function (res) {
      var ctx = { pay: indexBy(res[0], 'order_id'), pkg: indexBy(res[1], 'order_id') };
      var data = buildExport(orders, ctx, EX.groups);
      var fname = 'Snow Yuzu-订单导出-' + stamp() + (kind === 'csv' ? '.csv' : '.xls');
      exPreview(root, kind, fname, orders.length, data);
    }).catch(function () {
      toast('读取付款/物流记录失败，重试一下');
    }).finally(function () { if (btn) { btn.disabled = false; } });
  }
  function e2btn(root, sel) { return root.querySelector(sel); }

  // 导出前预览弹层：行数 + 列清单 + 前 3 行样例 → uiConfirm 确认才生成
  function exPreview(root, kind, fname, orderCnt, data) {
    var old = document.getElementById('ex-pv-mask');
    if (old) old.remove();
    var mask = document.createElement('div');
    mask.id = 'ex-pv-mask';
    mask.style.cssText = 'position:fixed;inset:0;background:rgba(90,80,90,.45);z-index:9998;overflow:auto;padding:40px 10px;';
    var grpLines = GROUPS.filter(function (g) { return EX.groups[g.id]; }).map(function (g) {
      return '<div><b>' + g.label + '</b>' + g.cols.map(function (c) { return esc(c[0]); }).join('、') + '</div>';
    }).join('');
    var sample = data.rows.slice(0, 3).map(function (r) {
      return '<tr>' + r.map(function (c) { return '<td>' + esc(c && typeof c === 'object' ? c.v : c) + '</td>'; }).join('') + '</tr>';
    }).join('');
    mask.innerHTML =
      '<div style="max-width:760px;margin:0 auto;background:#fff;border-radius:18px;padding:22px;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
      '<h3 style="margin:0;font-size:19px;">导出预览</h3>' +
      '<button type="button" class="btn-mini ex-pv-close">关闭</button></div>' +
      '<div class="ex-pv-head">共 <b>' + orderCnt + '</b> 笔订单 · 将导出 <b>' + data.rows.length + '</b> 行数据 · 文件名：<b>' + esc(fname) + '</b></div>' +
      '<div class="ex-pv-cols">' + grpLines + '</div>' +
      (sample ? '<div class="ex-pv-tblwrap"><table class="ex-pv"><thead><tr>' +
        data.head.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') +
        '</tr></thead><tbody>' + sample + '</tbody></table></div>' : '') +
      '<div class="ex-btns" style="margin-top:14px;">' +
      '<button type="button" class="btn-mini btn-save-tb ex-pv-go">' + t('确认导出', 'Confirm export') + '</button>' +
      '<button type="button" class="btn-mini ex-pv-close">' + t('再想想', 'Cancel') + '</button></div>' +
      '</div>';
    root.appendChild(mask);
    mask.addEventListener('click', function (e) {
      if (e.target === mask || e.target.classList.contains('ex-pv-close')) { mask.remove(); return; }
      if (e.target.classList.contains('ex-pv-go')) {
        uiConfirm('确认生成「' + fname + '」并下载吗？（' + data.rows.length + ' 行数据）', function () {
          mask.remove();
          exGenerate(kind, fname, data, orderCnt);
        }, '确认导出');
      }
    });
  }

  function exGenerate(kind, fname, data, orderCnt) {
    var rows = data.rows.map(function (r) {
      return r.map(function (c) { return (c && typeof c === 'object') ? c.v : (c == null ? '' : c); });
    });
    if (kind === 'csv') {
      var lines = [data.head.map(csvCell).join(',')];
      rows.forEach(function (r) { lines.push(r.map(csvCell).join(',')); });
      download(fname, '\uFEFF' + lines.join('\r\n'), 'text/csv;charset=utf-8;');
    } else {
      download(fname, xlsWorkbook('订单导出', data.head, data.rows), 'application/vnd.ms-excel');
    }
    toast('已导出 ' + orderCnt + ' 笔订单 · ' + rows.length + ' 行（' + (kind === 'csv' ? 'CSV' : 'Excel') + '）');
  }

  /* ═══ 模块二：商品清单打印（#tab-print）═══ */
  var PR = {
    booted: false, all: [], sel: {}, stSet: {}, src: 'all', from: '', to: '',
    mode: 'single', orderNo: ''
  };

  function ptRender(root) {
    root.innerHTML =
      '<div class="ex-card"><h3>' + t('筛选', 'Filters') + '</h3>' + filtersHtml(PR) + '</div>' +
      '<div class="ex-card"><h3>' + t('选择订单', 'Orders') + '</h3>' +
        '<div class="ex-frow">' +
          '<button type="button" class="dy-chip' + (PR.mode === 'single' ? ' active' : '') + '" data-act="mode" data-v="single">' + t('单笔', 'Single') + '</button>' +
          '<button type="button" class="dy-chip' + (PR.mode === 'multi' ? ' active' : '') + '" data-act="mode" data-v="multi">' + t('多笔', 'Multiple') + '</button>' +
          '<span class="ex-sel-cnt ex-lbl">已勾选 ' + selCount(PR) + ' 笔</span>' +
        '</div>' +
        '<div data-wrap="single" style="' + (PR.mode === 'single' ? '' : 'display:none;') + '">' +
          '<input class="ex-input pt-ono" placeholder="' + escAttr(t('输入完整订单号，如 SY-2026…', 'Enter full order number')) + '" value="' + escAttr(PR.orderNo) + '">' +
        '</div>' +
        '<div data-wrap="multi" style="' + (PR.mode === 'multi' ? '' : 'display:none;') + '">' +
          '<div class="ex-frow">' +
            '<button type="button" class="dy-chip" data-act="selall">' + t('全选', 'Select all') + '</button>' +
            '<button type="button" class="dy-chip" data-act="invert">' + t('反选', 'Invert') + '</button>' +
          '</div>' +
          '<div class="ex-list">' + listHtml(PR, scopeOrders(PR, PR.all)) + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="ex-btns">' +
        '<button type="button" class="btn-mini btn-save-tb" data-act="go-print">' + t('生成打印页', 'Build print page') + '</button>' +
        '<span class="ex-hint" style="margin:0;">' + t('新窗口预览，每笔订单一页，黑白打印友好', 'Opens a preview window; one section per order; printer-friendly') + '</span>' +
      '</div>';
  }

  function ptBoot(root) {
    ptRender(root);
    bindCommon(root, PR, function () { ptRender(root); });
    root.addEventListener('click', function (e) {
      var mb = e.target.closest('[data-act="mode"]');
      if (mb) { PR.mode = mb.getAttribute('data-v'); ptRender(root); return; }
      if (e.target.closest('[data-act="go-print"]')) { ptStart(); }
    });
    root.addEventListener('input', function (e) {
      if (e.target.classList && e.target.classList.contains('pt-ono')) PR.orderNo = e.target.value;
    });
    loadOrders().then(function (rows) {
      PR.all = rows;
      var list = root.querySelector('.ex-list');
      if (list) list.innerHTML = listHtml(PR, scopeOrders(PR, PR.all));
    }).catch(function () {});
  }

  function ptScopeOrders() {
    if (PR.mode === 'single') {
      var no = (PR.orderNo || '').trim();
      if (!no) return [];
      return PR.all.filter(function (o) { return String(o.order_no || '').toLowerCase() === no.toLowerCase(); });
    }
    return PR.all.filter(function (o) { return PR.sel[o.id]; });
  }

  function ptStart() {
    var orders = ptScopeOrders();
    if (!orders.length) {
      toast(PR.mode === 'single' ? '没找到这个订单号，检查一下再试' : '先在列表里勾选要打印的订单');
      return;
    }
    var html = buildPrintHtml(orders);
    var win = null;
    try { win = window.open('', '_blank'); } catch (e) {}
    if (win && win.document) {
      win.document.open();
      win.document.write(html);
      win.document.close();
      toast('打印页已生成（' + orders.length + ' 笔订单）');
    } else {
      // 弹窗被拦截时兜底：下载独立 HTML 文件，双击打开再打印
      download('Snow Yuzu-商品清单-' + stamp() + '.html', html, 'text/html;charset=utf-8;');
      toast('弹窗被浏览器拦了，已改成下载 HTML 文件，打开后点「打印」即可');
    }
  }

  // 打印页：完整独立 HTML。图 60px 圆角；缺图显示空占位框；每行一个空白勾选框；每笔订单强制分页
  function buildPrintHtml(orders) {
    var now = fmtDT(new Date().toISOString());
    var blocks = orders.map(function (o) {
      var a = o.address || {};
      var meta = [a.name, a.phone, o.email, [a.line1, a.line2].filter(Boolean).join(' '),
        [a.city, a.state, a.zip, a.country].filter(Boolean).join(', ')].filter(Boolean).join(' · ');
      var its = arr(o.items);
      var rows = its.map(function (it) {
        var img = (it && it.image) || '';
        var imgCell;
        if (/^https:\/\//i.test(img)) {
          imgCell = '<img src="' + escAttr(img) + '" alt="" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">' +
            '<span class="img-ph" style="display:none">♡</span>';
        } else {
          imgCell = '<span class="img-ph">♡</span>';
        }
        return '<tr>' +
          '<td class="c-img">' + imgCell + '</td>' +
          '<td>' + esc((it && it.name) || '') + '</td>' +
          '<td>' + esc((it && (it.sku || it.variant)) || '') + '</td>' +
          '<td class="c-qty">' + esc(String(num(it && it.qty))) + '</td>' +
          '<td>' + esc((it && it.note) || '') + '</td>' +
          '<td class="c-cb"><span class="pcb"></span></td>' +
          '</tr>';
      }).join('');
      var kinds = its.length;
      var totalQty = its.reduce(function (t2, it) { return t2 + num(it && it.qty); }, 0);
      return '<div class="blk">' +
        '<div class="blk-no">' + esc(o.order_no || '(无单号)') + '<span class="blk-st ' + (['cancelled', 'refunded', 'archived'].indexOf(o.status) >= 0 ? 'void' : '') + '">' + esc(ST_LABEL[o.status] || o.status || '') + '</span></div>' +
        (['cancelled', 'refunded', 'archived'].indexOf(o.status) >= 0
          ? '<div class="void-bar">' + t('这张单是「', 'This order is ') + esc(ST_LABEL[o.status] || o.status) + t('」状态，不要发出去', ' — do not ship') + '</div>' : '') +
        (meta ? '<div class="meta">' + esc(meta) + '</div>' : '') +
        '<table><thead><tr><th style="width:76px;">图</th><th>商品名称</th><th style="width:110px;">规格/SKU</th>' +
        '<th style="width:52px;">数量</th><th>定制要求</th><th style="width:56px;">备货 ✓</th></tr></thead>' +
        '<tbody>' + (rows || '<tr><td colspan="6" class="c-empty">这个订单没有商品明细</td></tr>') + '</tbody></table>' +
        '<div class="stats">' + t('商品种类数', 'Item kinds') + ' <b>' + kinds + '</b> · ' + t('总数量', 'Total qty') + ' <b>' + totalQty + '</b>' +
        ' · ' + t('下单时间', 'Placed at') + ' ' + esc(fmtDT(o.created_at)) + '</div>' +
        (o.admin_note ? '<div class="note">' + t('内部备注', 'Admin note') + '：' + esc(o.admin_note) + '</div>' : '') +
        (o.note ? '<div class="note">' + t('买家备注', 'Buyer note') + '：' + esc(o.note) + '</div>' : '') +
        '</div>';
    }).join('');
    return '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>Snow Yuzu 商品清单</title><style>' +
      'body{font-family:-apple-system,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;color:#3a2e36;margin:24px;}' +
      '@page{size:auto;margin:12mm;}' +
      '.brand{font-size:26px;font-weight:800;letter-spacing:3px;color:#33232d;}' +
      '.gen-time{color:#9a8a92;font-size:13px;margin-top:4px;}' +
      '.no-print{margin-top:14px;}' +
      '.no-print button{border:1.5px solid #e0c8d3;background:#fff;color:#5a4650;border-radius:999px;padding:8px 22px;font-size:15px;cursor:pointer;font-family:inherit;}' +
      '.no-print button:hover{background:#fdf1f6;}' +
      '.blk{border:1.5px solid #e9dbe1;border-radius:14px;padding:18px;margin-top:18px;page-break-after:always;}' +
      '.blk:last-child{page-break-after:auto;}' +
      '.blk-no{color:#e0559a;font-weight:700;font-size:17px;letter-spacing:.5px;}' +
      '.blk-st{margin-left:10px;font-size:12px;font-weight:600;color:#6d5d66;border:1px solid #e9dbe1;border-radius:999px;padding:1px 10px;letter-spacing:0;}' +
      '.blk-st.void{color:#c0405a;border-color:#c0405a;}' +
      '.void-bar{margin:10px 0 0;border:1.5px solid #c0405a;background:#fff4f5;color:#c0405a;font-weight:700;font-size:14px;padding:8px 12px;border-radius:10px;}' +
      '.meta{font-size:13px;color:#6d5d66;margin:6px 0 12px;word-break:break-all;}' +
      'table{width:100%;border-collapse:collapse;font-size:13px;}' +
      'th,td{border:1px solid #e9dbe1;padding:8px;text-align:left;vertical-align:middle;word-break:break-word;}' +
      'th{font-weight:600;background:#faf5f7;}' +
      '.c-img{width:76px;}.c-qty{text-align:center;}.c-empty{text-align:center;color:#9a8a92;}' +
      'td.c-img img{width:60px;height:60px;border-radius:10px;object-fit:cover;display:block;background:#faf5f7;}' +
      '.img-ph{width:60px;height:60px;border-radius:10px;border:1px dashed #d8c4cd;display:flex;align-items:center;justify-content:center;color:#c9aeb9;font-size:22px;background:#fdfafb;}' +
      '.pcb{display:inline-block;width:18px;height:18px;border:1.5px solid #b9a6b0;border-radius:4px;}' +
      '.c-cb{text-align:center;width:56px;}' +
      '.stats{margin-top:10px;font-size:13px;color:#6d5d66;}' +
      '.stats b{color:#3a2e36;}' +
      '.note{margin-top:8px;font-size:13px;color:#a14d6e;background:#fdf6f8;border-radius:8px;padding:8px 10px;}' +
      '@media print{.no-print{display:none!important;}body{margin:8mm;}.blk{margin-top:0;}}' +
      '</style></head><body>' +
      '<div class="brand">Snow Yuzu</div>' +
      '<div class="gen-time">' + t('商品清单 · 生成时间', 'Packing list · generated at') + ' ' + esc(now) + '</div>' +
      '<div class="no-print"><button type="button" onclick="window.print()">打印</button></div>' +
      blocks +
      '</body></html>';
  }

  /* ── 注册入口（幂等；admin.html 切 tab 时调用即可）── */
  function bootExport() {
    var root = document.getElementById('tab-export');
    if (!root || EX.booted) return;
    EX.booted = true;
    injectCss();
    exBoot(root);
  }
  function bootPrint() {
    var root = document.getElementById('tab-print');
    if (!root || PR.booted) return;
    PR.booted = true;
    injectCss();
    ptBoot(root);
  }
  window.EXPORT = { bootExport: bootExport, bootPrint: bootPrint,
    /* 她 20261030 §3：给订单列表直接调用的两个函数，复用同一套导出/打印逻辑，不另写一份 */
    quickExport: function (orders, kind, done) {
      orders = arr(orders);
      if (!orders.length) { toast('先选订单或调一下筛选'); return; }
      var ids = orders.map(function (o) { return String(o.id); });
      toast('正在准备导出…');
      Promise.all([fetchPayRecords(ids), fetchPackages(ids)]).then(function (res) {
        var ctx = { pay: indexBy(res[0], 'order_id'), pkg: indexBy(res[1], 'order_id') };
        var all = {}; GROUPS.forEach(function (g) { all[g.id] = true; });
        var data = buildExport(orders, ctx, all);
        exGenerate(kind || 'xls', 'Snow Yuzu-订单导出-' + stamp() + (kind === 'csv' ? '.csv' : '.xls'), data, orders.length);
        if (typeof done === 'function') done();
      }).catch(function () { toast('导出失败，检查网络后重试'); });
    },
    quickPrint: function (orders) {
      orders = arr(orders);
      if (!orders.length) { toast('先在列表里选要打印的订单'); return; }
      var html = buildPrintHtml(orders);
      var win = null;
      try { win = window.open('', '_blank'); } catch (e) {}
      if (win && win.document) {
        win.document.open(); win.document.write(html); win.document.close();
        toast('打印页已生成（' + orders.length + ' 笔订单）');
      } else {
        download('Snow Yuzu-装箱清单-' + stamp() + '.html', html, 'text/html;charset=utf-8;');
        toast('弹窗被拦了，已改成下载 HTML，打开后点打印即可');
      }
    }
  };

  // 她 20261030 §3：导出/打印已并入订单列表，不再自动挂载两个独立页（函数保留，?tab 参数或手动调用仍可用）
  function autoBoot() {
    if (/[?&]panel=(export|print)/.test(location.search)) { bootExport(); bootPrint(); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', autoBoot);
  else autoBoot();
})();
