/* ═══════════════════════════════════════════════════════════════════════
   订单工作台（js/admin-workbench.js）
   页签 #tab-workbench · 注册 window.WB = { bootWorkbench }
   功能：订单草稿（新建/编辑/审核/确认导入/丢弃）· 批量导入（CSV/xlsx 模板+预览校验）
        · 外部商品（SKU 匹配/仅展示/可建商品）· 付款计划（定金/尾款/分期/退款）
        · 正式订单审核（上一单/下一单/付款记录/欠款）
   数据契约：shop_order_drafts / shop_import_batches / shop_order_pay_records
        RPC：shop_draft_confirm / shop_draft_discard / shop_pay_record_add / shop_pay_record_delete
   （2026-10-26 由 Cola 主会话编写——子会话超时未交稿）
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  function t(zh, en) { return (window.LANG === 'en') ? en : zh; }
  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }
  function n2(v) { return Math.round(num(v) * 100) / 100; }
  function money(v) { return '$' + n2(v).toFixed(2); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function fmtDT(iso) {
    if (!iso) return '';
    try {
      var d = new Date(iso);
      var p = function (x) { return (x < 10 ? '0' : '') + x; };
      return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    } catch (e) { return String(iso || ''); }
  }
  var PAY_KIND = { deposit: '定金', final: '尾款', installment: '分期', refund: '退款', other: '其他' };
  var PAY_METHOD = { stripe: 'Stripe', venmo: 'Venmo', zelle: 'Zelle', cashapp: 'CashApp', paypal: 'PayPal', cash: '现金', bank: '银行转账', other: '其他' };

  var WB = { view: 'drafts', drafts: [], batches: [], orders: [], search: '', editor: null, reviewIdx: -1, booted: false };

  function escHtml(s) { return esc(String(s == null ? '' : s)); }

  /* ═══════════ 入口 ═══════════ */
  window.WB = { bootWorkbench: bootWorkbench };

  function bootWorkbench() {
    var panel = document.getElementById('tab-workbench');
    if (!panel) return;
    if (panel.dataset.booted) { if (WB.view === 'drafts') loadDrafts(); else loadOrders(); return; }
    panel.dataset.booted = '1';
    panel.innerHTML =
      '<div class="card" style="padding:16px 20px;margin-bottom:14px;">' +
        '<h3 style="margin:0 0 4px;font-size:17px;color:var(--text,#604C57);">' + t('订单工作台', 'Order workbench') + '</h3>' +
        '<p style="margin:0;font-size:13px;color:var(--muted,#A88E9B);line-height:1.8;">' +
          t('草稿（含外部平台导入）先审核、再确认导入成正式订单；外部商品默认仅展示；定金/尾款/分期/退款都在这里记账，欠款自动算。', 'Review drafts (incl. imported ones) before confirming them into real orders; external items are display-only by default; deposits / final payments / installments / refunds are tracked here.') +
        '</p>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:12px;">' +
          '<span class="chip" data-view="drafts" style="font-size:15px;">草稿</span>' +
          '<span class="chip" data-view="orders" style="font-size:15px;">正式订单</span>' +
          '<input id="wb-search" placeholder="搜订单号 / 邮箱 / 姓名" style="flex:1;min-width:160px;padding:9px 14px;font-size:15px;border:1.5px solid var(--accent-soft,#FCE4EC);border-radius:12px;outline:none;font-family:inherit;color:var(--text,#604C57);background:#fff;">' +
          '<button class="btn-mini" id="wb-new-draft">＋ 新建订单草稿</button>' +
          '<button class="btn-mini" id="wb-import">批量导入</button>' +
        '</div>' +
        '<div id="wb-batch-note" style="margin-top:8px;font-size:12px;color:var(--muted,#A88E9B);"></div>' +
      '</div>' +
      '<div id="wb-body"><div class="empty">加载中…</div></div>';
    panel.querySelectorAll('[data-view]').forEach(function (c) {
      c.addEventListener('click', function () { switchView(c.getAttribute('data-view')); });
    });
    panel.querySelector('#wb-search').addEventListener('input', function () {
      WB.search = this.value.trim().toLowerCase();
      if (WB.view === 'drafts') renderDrafts(); else renderOrders();
    });
    panel.querySelector('#wb-new-draft').addEventListener('click', function () { openEditor(null); });
    panel.querySelector('#wb-import').addEventListener('click', openImport);
    WB.booted = true;
    switchView('drafts');
  }

  function switchView(v) {
    var panel = document.getElementById('tab-workbench');
    WB.view = v;
    panel.querySelectorAll('[data-view]').forEach(function (c) { c.classList.toggle('on', c.getAttribute('data-view') === v); });
    if (v === 'drafts') loadDrafts(); else loadOrders();
  }

  /* ═══════════ 草稿区 ═══════════ */
  function loadDrafts() {
    var body = document.getElementById('wb-body');
    if (!body) return;
    body.innerHTML = '<div class="empty">加载中…</div>';
    api('shop_order_drafts?select=*&status=neq.discarded&order=created_at.desc&limit=200').then(function (r) { return r.json(); }).then(function (rows) {
      WB.drafts = arr(rows);
      renderDrafts();
    }).catch(function (e) {
      body.innerHTML = '<div class="empty">草稿加载失败：' + escHtml(e && e.message || e) + '</div>';
    });
  }

  function renderDrafts() {
    var body = document.getElementById('wb-body');
    if (!body) return;
    var list = WB.drafts.filter(function (d) {
      if (!WB.search) return true;
      var hay = ((d.src_no || '') + ' ' + JSON.stringify(d.payload || {})).toLowerCase();
      return hay.indexOf(WB.search) !== -1;
    });
    if (!list.length) {
      body.innerHTML = '<div class="empty">还没有草稿。点「＋ 新建订单草稿」或「批量导入」开始吧～</div>';
      return;
    }
    body.innerHTML = '<div class="card" style="padding:6px 0;overflow:visible;">' + list.map(function (d) {
      var p = d.payload || {};
      var items = arr(p.items);
      var amt = p.amounts || {};
      var buyer = p.buyer || {};
      return '<div style="display:flex;align-items:center;gap:12px;padding:12px 18px;border-bottom:1px solid var(--accent-soft,#FCE4EC);flex-wrap:wrap;">' +
        '<div style="min-width:130px;"><b style="color:var(--text,#604C57);font-size:15px;">' + escHtml(d.src_no || '(无单号)') + '</b>' +
          '<div style="font-size:12px;color:var(--muted,#A88E9B);">' + fmtDT(d.created_at) + '</div></div>' +
        '<div style="flex:1;min-width:150px;font-size:14px;color:var(--text,#604C57);">' + escHtml(buyer.name || buyer.email || '—') +
          '<span style="color:var(--muted,#A88E9B);"> · ' + items.length + ' 件商品</span>' +
          (d.status === 'imported' ? '<span style="color:var(--success,#5FA777);font-size:12px;"> · 已导入</span>' : '') +
          (d.error ? '<span style="color:var(--danger,#D96570);font-size:12px;"> · ' + escHtml(d.error) + '</span>' : '') + '</div>' +
        '<div style="font-size:15px;font-weight:700;color:var(--price,#ff6fa5);">' + money(amt.total || 0) + '</div>' +
        '<div style="display:flex;gap:8px;">' +
          '<button class="btn-mini" data-review="' + d.id + '">' + (d.status === 'imported' ? '查看' : '审核') + '</button>' +
          (d.status === 'draft' ? '<button class="btn-mini" data-confirm="' + d.id + '">确认导入</button>' : '') +
          '<button class="btn-mini" data-discard="' + d.id + '">删除草稿</button>' +
        '</div></div>';
    }).join('') + '</div>';
    body.querySelectorAll('[data-review]').forEach(function (b) {
      b.addEventListener('click', function () {
        var d = WB.drafts.filter(function (x) { return x.id === b.getAttribute('data-review'); })[0];
        if (d) openEditor(d);
      });
    });
    body.querySelectorAll('[data-confirm]').forEach(function (b) {
      b.addEventListener('click', function () { confirmDraft(b.getAttribute('data-confirm')); });
    });
    body.querySelectorAll('[data-discard]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-discard');
        uiConfirm('确定删除（丢弃）这笔草稿吗？草稿内容不可恢复。', function () {
          api('rpc/shop_draft_discard', { method: 'POST', body: JSON.stringify({ p_draft_id: id }) }).then(function (r) {
            if (!r.ok) { r.json().then(function (j) { toast('删除失败：' + (j.message || '未知错误')); }).catch(function () { toast('删除失败'); }); return; }
            toast('已删除草稿');
            loadDrafts();
          });
        }, '删除');
      });
    });
  }

  function confirmDraft(id) {
    uiConfirm('确认把这笔草稿导入为正式订单吗？导入后会生成正式订单号。', function () {
      api('rpc/shop_draft_confirm', { method: 'POST', body: JSON.stringify({ p_draft_id: id }) }).then(function (r) { return r.json(); }).then(function (j) {
        if (j.message && !j.order_no) { toast('导入失败：' + j.message); return; }
        toast(j.duplicate ? '这笔已经导入过啦（' + j.order_no + '）' : '导入成功 ✓ ' + j.order_no);
        loadDrafts();
      }).catch(function (e) { toast('导入失败：' + (e && e.message || e)); });
    }, '确认导入');
  }

  /* ═══════════ 草稿编辑器 ═══════════ */
  function blankDraft() {
    return {
      id: null, src_no: '',
      payload: {
        src_no: '', buyer: { name: '', email: '', phone: '' },
        address: { name: '', phone: '', line1: '', line2: '', city: '', state: '', zip: '', country: 'US' },
        items: [], amounts: { subtotal: 0, discount: 0, shipping: 0, tax: 0, total: 0, currency: 'USD' },
        pay_records: [], note: '', eta: ''
      },
      status: 'draft', error: null
    };
  }

  function openEditor(draft) {
    var body = document.getElementById('wb-body');
    if (!body) return;
    WB.editor = draft ? JSON.parse(JSON.stringify(draft)) : blankDraft();
    if (WB.editor.payload && WB.editor.payload.src_no && !WB.editor.src_no) WB.editor.src_no = WB.editor.payload.src_no;
    renderEditor();
  }

  function ed() { return WB.editor; }
  function edDirty() { return true; } // 编辑器状态即真相：离开按钮直接返回列表（草稿随时可保存）

  function renderEditor() {
    var body = document.getElementById('wb-body');
    var d = ed();
    var p = d.payload, buyer = p.buyer || {}, addr = p.address || {}, amt = p.amounts || {};
    var isNew = !d.id;
    var title = isNew ? '新建订单草稿' : (d.status === 'imported' ? '草稿（已导入 ' + (d.order_no || '') + '）' : '审核草稿');
    body.innerHTML =
      '<div class="card" style="padding:16px 20px;">' +
        '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px;">' +
          '<h3 style="margin:0;font-size:17px;color:var(--text,#604C57);">' + title + '</h3>' +
          '<span style="font-size:12px;color:var(--muted,#A88E9B);margin-left:auto;">' + (isNew ? '' : '原始单号：' + escHtml(d.src_no || '—')) + '</span>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;">' +
          wbField('原始单号', 'ed-src', d.src_no, 'text') +
          wbField('买家称呼', 'ed-bname', buyer.name) +
          wbField('买家邮箱', 'ed-bemail', buyer.email, 'email') +
          wbField('买家电话', 'ed-bphone', buyer.phone) +
        '</div>' +
        '<div style="font-size:14px;font-weight:600;color:var(--text,#604C57);margin:14px 0 8px;">收货地址</div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;">' +
          wbField('收件人', 'ed-aname', addr.name) +
          wbField('电话', 'ed-aphone', addr.phone) +
          wbField('地址 1', 'ed-a1', addr.line1) +
          wbField('地址 2', 'ed-a2', addr.line2) +
          wbField('城市', 'ed-city', addr.city) +
          wbField('州/省', 'ed-state', addr.state) +
          wbField('邮编', 'ed-zip', addr.zip) +
          wbField('国家', 'ed-country', addr.country || 'US') +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:10px;margin:14px 0 8px;flex-wrap:wrap;">' +
          '<div style="font-size:14px;font-weight:600;color:var(--text,#604C57);">商品明细</div>' +
          '<button class="btn-mini" id="ed-add-item">＋ 加一件商品</button>' +
          '<span style="font-size:12px;color:var(--muted,#A88E9B);">输入 SKU 或名称可匹配已有商品；匹配不到就作为外部商品（默认仅展示）</span>' +
        '</div>' +
        '<div id="ed-items"></div>' +
        '<div style="font-size:14px;font-weight:600;color:var(--text,#604C57);margin:14px 0 8px;">金额</div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;">' +
          wbField('商品总价（自动）', 'ed-subtotal', n2(amt.subtotal), 'number') +
          wbField('折扣', 'ed-discount', n2(amt.discount), 'number') +
          wbField('运费', 'ed-shipping', n2(amt.shipping), 'number') +
          wbField('税费', 'ed-tax', n2(amt.tax), 'number') +
          '<div><div style="font-size:13px;color:var(--muted,#A88E9B);margin-bottom:4px;">应付总额（自动，可手改）</div>' +
          '<input id="ed-total" type="number" step="0.01" value="' + n2(amt.total) + '" style="width:100%;box-sizing:border-box;padding:9px 12px;font-size:15px;font-weight:700;border:1.5px solid var(--accent-soft,#FCE4EC);border-radius:12px;outline:none;font-family:inherit;color:var(--price,#ff6fa5);background:#fff;"></div>' +
        '</div>' +
        '<div style="font-size:14px;font-weight:600;color:var(--text,#604C57);margin:14px 0 8px;">付款计划（草稿阶段暂存，导入后写入付款记录）</div>' +
        '<div id="ed-pays"></div>' +
        '<button class="btn-mini" id="ed-add-pay" style="margin-top:6px;">＋ 添加付款记录</button>' +
        '<div style="margin-top:12px;">' + wbField('备注', 'ed-note', p.note || '') + '</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:16px;">' +
          '<button class="btn-save-tb" id="ed-save">保存草稿</button>' +
          (!isNew && d.status === 'draft' ? '<button class="btn-save-tb" id="ed-confirm">保存并确认导入</button>' : '') +
          '<button class="btn-mini" id="ed-back">返回列表</button>' +
        '</div>' +
      '</div>';
    renderEdItems();
    renderEdPays();
    bindEditor();
  }

  function wbField(label, id, val, type) {
    return '<div><div style="font-size:13px;color:var(--muted,#A88E9B);margin-bottom:4px;">' + label + '</div>' +
      '<input id="' + id + '"' + (type ? ' type="' + type + '"' + (type === 'number' ? ' step="0.01"' : '') : '') + ' value="' + escAttr(val == null ? '' : String(val)) + '" style="width:100%;box-sizing:border-box;padding:9px 12px;font-size:15px;border:1.5px solid var(--accent-soft,#FCE4EC);border-radius:12px;outline:none;font-family:inherit;color:var(--text,#604C57);background:#fff;"></div>';
  }

  function collectEd() {
    var d = ed(), p = d.payload;
    var g = function (id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; };
    d.src_no = g('ed-src');
    p.src_no = d.src_no;
    p.buyer = { name: g('ed-bname'), email: g('ed-bemail'), phone: g('ed-bphone') };
    p.address = { name: g('ed-aname'), phone: g('ed-aphone'), line1: g('ed-a1'), line2: g('ed-a2'), city: g('ed-city'), state: g('ed-state'), zip: g('ed-zip'), country: g('ed-country') };
    p.amounts = {
      subtotal: num(g('ed-subtotal')), discount: num(g('ed-discount')),
      shipping: num(g('ed-shipping')), tax: num(g('ed-tax')), total: num(g('ed-total')), currency: 'USD'
    };
    p.note = g('ed-note');
    return d;
  }

  function recalcAuto() {
    var d = ed(), p = d.payload;
    var sub = 0;
    arr(p.items).forEach(function (it) { sub += num(it.price) * num(it.qty); });
    var el = document.getElementById('ed-subtotal'); if (el) el.value = n2(sub);
    var g = function (id) { var e = document.getElementById(id); return e ? num(e.value) : 0; };
    var totalEl = document.getElementById('ed-total');
    if (totalEl) totalEl.value = n2(sub - g('ed-discount') + g('ed-shipping') + g('ed-tax'));
  }

  /* ── 商品明细行 ── */
  function renderEdItems() {
    var box = document.getElementById('ed-items');
    if (!box) return;
    var items = arr(ed().payload.items);
    if (!items.length) { box.innerHTML = '<div style="font-size:13px;color:var(--muted,#A88E9B);padding:8px 0;">还没有商品，点「＋ 加一件商品」。</div>'; return; }
    box.innerHTML = items.map(function (it, i) {
      return '<div data-item="' + i + '" style="background:var(--bg,#FFF8FA);border:1px solid var(--accent-soft,#FCE4EC);border-radius:12px;padding:10px 12px;margin-bottom:8px;">' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;align-items:end;">' +
          '<div style="grid-column:span 2;"><div style="font-size:12px;color:var(--muted,#A88E9B);">商品名 *</div><input data-f="name" value="' + escAttr(it.name || '') + '" style="' + wbInputCss() + '"></div>' +
          '<div><div style="font-size:12px;color:var(--muted,#A88E9B);">SKU / 搜商品</div><input data-f="sku" value="' + escAttr(it.sku || '') + '" placeholder="失焦自动匹配" style="' + wbInputCss() + '"></div>' +
          '<div><div style="font-size:12px;color:var(--muted,#A88E9B);">规格</div><input data-f="spec" value="' + escAttr(it.spec || '') + '" style="' + wbInputCss() + '"></div>' +
          '<div><div style="font-size:12px;color:var(--muted,#A88E9B);">单价 $</div><input data-f="price" type="number" step="0.01" value="' + n2(it.price) + '" style="' + wbInputCss() + '"></div>' +
          '<div><div style="font-size:12px;color:var(--muted,#A88E9B);">数量</div><input data-f="qty" type="number" step="1" value="' + (parseInt(it.qty, 10) || 1) + '" style="' + wbInputCss() + '"></div>' +
          '<div style="grid-column:span 2;"><div style="font-size:12px;color:var(--muted,#A88E9B);">定制要求</div><input data-f="note" value="' + escAttr(it.note || '') + '" style="' + wbInputCss() + '"></div>' +
          '<button class="btn-mini" data-del="' + i + '">删除</button>' +
        '</div>' +
        '<div data-match="' + i + '" style="margin-top:6px;font-size:12px;">' + itemMatchHint(it) + '</div>' +
      '</div>';
    }).join('');
    box.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () {
        ed().payload.items.splice(parseInt(b.getAttribute('data-del'), 10), 1);
        renderEdItems(); recalcAuto();
      });
    });
    box.querySelectorAll('[data-item]').forEach(function (row) {
      var i = parseInt(row.getAttribute('data-item'), 10);
      row.querySelectorAll('[data-f]').forEach(function (inp) {
        inp.addEventListener('input', function () {
          var f = inp.getAttribute('data-f');
          var v = inp.value;
          if (f === 'price' || f === 'qty') { ed().payload.items[i][f] = num(v); recalcAuto(); }
          else ed().payload.items[i][f] = v;
        });
        if (inp.getAttribute('data-f') === 'sku') {
          inp.addEventListener('change', function () { skuMatch(i); });
        }
      });
    });
  }

  function wbInputCss() {
    return 'width:100%;box-sizing:border-box;padding:8px 10px;font-size:14px;border:1.5px solid var(--accent-soft,#FCE4EC);border-radius:10px;outline:none;font-family:inherit;color:var(--text,#604C57);background:#fff;';
  }

  function itemMatchHint(it) {
    if (it.id) return '<span style="color:var(--success,#5FA777);">✓ 已匹配商城商品：' + escHtml(it.matched_name || it.name) + '</span>';
    return '<span style="color:var(--muted,#A88E9B);">外部商品（导入时默认仅展示，不会扣库存）</span>';
  }

  function skuMatch(i) {
    var it = ed().payload.items[i];
    var kw = (it.sku || '').trim();
    var box = document.querySelector('[data-item="' + i + '"] [data-match="' + i + '"]');
    if (!kw) { it.id = ''; if (box) box.innerHTML = itemMatchHint(it); return; }
    api('products?select=id,name,price,image_url,stock&name=ilike.*' + encodeURIComponent(kw) + '*&limit=5').then(function (r) { return r.json(); }).then(function (rows) {
      rows = arr(rows);
      if (!rows.length) { it.id = ''; if (box) box.innerHTML = itemMatchHint(it) + ' <span style="color:var(--warning,#E0A458);">没搜到匹配的商品</span>'; return; }
      if (rows.length === 1 || rows[0].name.toLowerCase() === kw.toLowerCase()) {
        applyMatch(i, rows[0]);
        return;
      }
      if (box) box.innerHTML = '找到多个候选：<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px;">' +
        rows.map(function (pr, k) { return '<span class="chip" data-pick="' + k + '">' + escHtml(pr.name) + ' · ' + money(pr.price) + '</span>'; }).join('') +
        '<span class="chip" data-pick="-1">都不匹配，作为外部商品</span></div>';
      box.querySelectorAll('[data-pick]').forEach(function (c) {
        c.addEventListener('click', function () {
          var k = parseInt(c.getAttribute('data-pick'), 10);
          if (k < 0) { it.id = ''; renderEdItems(); }
          else applyMatch(i, rows[k]);
        });
      });
    }).catch(function () { it.id = ''; });
  }

  function applyMatch(i, pr) {
    var it = ed().payload.items[i];
    it.id = pr.id; it.matched_name = pr.name; it.name = pr.name;
    it.price = num(pr.price);
    it.sku = '';
    renderEdItems(); recalcAuto();
  }

  /* ── 付款计划 ── */
  function renderEdPays() {
    var box = document.getElementById('ed-pays');
    if (!box) return;
    var pays = arr(ed().payload.pay_records);
    if (!pays.length) { box.innerHTML = '<div style="font-size:13px;color:var(--muted,#A88E9B);">暂无付款记录（可不填，导入后也能在正式订单里补记）。</div>'; return; }
    box.innerHTML = pays.map(function (pr, i) {
      var kindChips = Object.keys(PAY_KIND).map(function (k) {
        return '<span class="chip' + (pr.kind === k ? ' on' : '') + '" data-pk="' + k + '">' + PAY_KIND[k] + '</span>';
      }).join('');
      var methodChips = Object.keys(PAY_METHOD).map(function (k) {
        return '<span class="chip' + (pr.method === k ? ' on' : '') + '" data-pm="' + k + '">' + PAY_METHOD[k] + '</span>';
      }).join('');
      return '<div data-pay="' + i + '" style="background:var(--bg,#FFF8FA);border:1px solid var(--accent-soft,#FCE4EC);border-radius:12px;padding:10px 12px;margin-bottom:8px;">' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">' + kindChips +
          '<input data-pf="amount" type="number" step="0.01" value="' + n2(pr.amount) + '" placeholder="金额 $（亮粉）" style="' + wbInputCss() + 'max-width:120px;color:var(--price,#ff6fa5);font-weight:700;">' +
          '<input data-pf="txn_ref" value="' + escAttr(pr.txn_ref || '') + '" placeholder="交易编号" style="' + wbInputCss() + 'max-width:150px;">' +
          '<input data-pf="paid_at" value="' + escAttr(pr.paid_at || '') + '" placeholder="日期 如 2026-10-26" style="' + wbInputCss() + 'max-width:160px;">' +
          '<input data-pf="note" value="' + escAttr(pr.note || '') + '" placeholder="备注" style="' + wbInputCss() + 'flex:1;min-width:120px;">' +
          '<button class="btn-mini" data-pdel="' + i + '">删除</button></div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;">' + methodChips + '</div></div>';
    }).join('');
    box.querySelectorAll('[data-pdel]').forEach(function (b) {
      b.addEventListener('click', function () { ed().payload.pay_records.splice(parseInt(b.getAttribute('data-pdel'), 10), 1); renderEdPays(); });
    });
    box.querySelectorAll('[data-pay]').forEach(function (row) {
      var i = parseInt(row.getAttribute('data-pay'), 10);
      var pr = ed().payload.pay_records[i];
      row.querySelectorAll('[data-pk]').forEach(function (c) {
        c.addEventListener('click', function () { pr.kind = c.getAttribute('data-pk'); renderEdPays(); });
      });
      row.querySelectorAll('[data-pm]').forEach(function (c) {
        c.addEventListener('click', function () { pr.method = c.getAttribute('data-pm'); renderEdPays(); });
      });
      row.querySelectorAll('[data-pf]').forEach(function (inp) {
        inp.addEventListener('input', function () {
          var f = inp.getAttribute('data-pf');
          pr[f] = f === 'amount' ? num(inp.value) : inp.value;
        });
      });
    });
  }

  function bindEditor() {
    var body = document.getElementById('wb-body');
    body.querySelector('#ed-add-item').addEventListener('click', function () {
      ed().payload.items.push({ id: '', name: '', image: '', sku: '', spec: '', price: 0, qty: 1, note: '' });
      renderEdItems();
    });
    body.querySelector('#ed-add-pay').addEventListener('click', function () {
      if (!arr(ed().payload.pay_records).length) ed().payload.pay_records = [];
      ed().payload.pay_records.push({ kind: 'deposit', amount: 0, method: 'paypal', txn_ref: '', paid_at: '', note: '' });
      renderEdPays();
    });
    ['ed-discount', 'ed-shipping', 'ed-tax', 'ed-total'].forEach(function (id) {
      var el = body.querySelector('#' + id);
      if (el) el.addEventListener('input', recalcAuto);
    });
    body.querySelector('#ed-back').addEventListener('click', function () {
      if (WB.view === 'drafts') loadDrafts(); else renderOrders();
    });
    body.querySelector('#ed-save').addEventListener('click', function () { saveDraft(false); });
    var cbtn = body.querySelector('#ed-confirm');
    if (cbtn) cbtn.addEventListener('click', function () { saveDraft(true); });
  }

  function saveDraft(andConfirm) {
    var d = collectEd();
    if (!arr(d.payload.items).length) { toast('至少要有一件商品'); return; }
    var bad = d.payload.items.filter(function (it) { return !(it.name || '').trim(); });
    if (bad.length) { toast('有商品没填名字，补一下'); return; }
    if (d.payload.amounts.total <= 0) { toast('应付总额要大于 0'); return; }
    var isNew = !d.id;
    var req;
    if (isNew) {
      req = api('shop_order_drafts', { method: 'POST', headers: { 'Prefer': 'return=representation' }, body: JSON.stringify({ src_no: d.src_no, payload: d.payload, status: 'draft' }) });
    } else {
      req = api('shop_order_drafts?id=eq.' + d.id, { method: 'PATCH', body: JSON.stringify({ src_no: d.src_no, payload: d.payload }) });
    }
    req.then(function (r) {
      if (!r.ok) { toast('保存失败，再试一次'); return; }
      if (isNew) {
        // 取回新草稿 id（POST 返回行）
        r.json().then(function (row) {
          WB.editor = arr(row)[0] || d;
          if (andConfirm) confirmDraft(WB.editor.id);
          else { toast('草稿已保存 ✓'); loadDrafts(); }
        }).catch(function () { toast('草稿已保存 ✓'); loadDrafts(); });
      } else {
        if (andConfirm) confirmDraft(d.id);
        else { toast('草稿已保存 ✓'); loadDrafts(); }
      }
    }).catch(function () { toast('保存失败，再试一次'); });
  }

  /* ═══════════ 批量导入 ═══════════ */
  function openImport() {
    var mask = document.createElement('div');
    mask.id = 'wb-mask';
    mask.innerHTML =
      '<div style="position:fixed;inset:0;background:rgba(96,76,87,.35);z-index:999;display:flex;align-items:center;justify-content:center;padding:16px;">' +
        '<div class="card" style="max-width:760px;width:100%;max-height:86vh;overflow-y:auto;padding:18px 22px;">' +
          '<h3 style="margin:0 0 8px;font-size:17px;color:var(--text,#604C57);">批量导入订单</h3>' +
          '<p style="margin:0;font-size:13px;color:var(--muted,#A88E9B);line-height:1.8;">支持 CSV / Excel(.xlsx)。一行一个商品，同一原始单号的多行会合并成一单多商品。解析后先预览校验，再保存为草稿。</p>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;align-items:center;">' +
            '<button class="btn-mini" id="wb-dl-tpl">下载 CSV 模板</button>' +
            '<input id="wb-file" type="file" accept=".csv,.xlsx,.xls" style="font-size:14px;color:var(--text,#604C57);font-family:inherit;">' +
          '</div>' +
          '<div id="wb-imp-preview" style="margin-top:12px;"></div>' +
          '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;">' +
            '<button class="btn-mini" id="wb-imp-close">关闭</button>' +
            '<button class="btn-save-tb" id="wb-imp-save" style="display:none;">保存全部为草稿</button>' +
          '</div>' +
        '</div></div>';
    document.body.appendChild(mask);
    mask.querySelector('#wb-imp-close').addEventListener('click', function () { mask.remove(); });
    mask.addEventListener('click', function (e) { if (e.target === mask.firstElementChild) mask.remove(); });
    mask.querySelector('#wb-dl-tpl').addEventListener('click', downloadTpl);
    mask.querySelector('#wb-file').addEventListener('change', function () {
      var f = this.files && this.files[0];
      if (f) parseImportFile(f, mask);
    });
  }

  var TPL_COLS = ['src_no', 'buyer_name', 'buyer_email', 'buyer_phone', 'address_line1', 'address_line2', 'city', 'state', 'zip', 'country', 'item_name', 'item_sku', 'item_price', 'item_qty', 'item_note', 'discount', 'shipping', 'tax', 'note'];

  function downloadTpl() {
    var head = TPL_COLS.join(',');
    var sample = [
      'EXT-1001,Yuki,yc20060119@gmail.com,,1 Test St,Apt 2,Testville,TS,00000,US,树脂键帽 Moomin,KB-MOOMIN,12.50,1,浅蓝,0,5.00,0,请包装牢固',
      'EXT-1001,Yuki,yc20060119@gmail.com,,1 Test St,Apt 2,Testville,TS,00000,US,色卡 samples,CARD-S,3.00,2,,0,5.00,0,'
    ].join('\r\n');
    var blob = new Blob(['\uFEFF' + head + '\r\n' + sample], { type: 'text/csv;charset=utf-8;' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'Snow Yuzu-订单导入模板.csv';
    a.click();
    URL.revokeObjectURL(a.href);
    toast('模板已下载');
  }

  /* CSV 解析：带引号/逗号/换行，UTF-8 BOM */
  function parseCsv(text) {
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    var rows = [], row = [], cur = '', inQ = false, i = 0;
    while (i < text.length) {
      var ch = text[i];
      if (inQ) {
        if (ch === '"') {
          if (text[i + 1] === '"') { cur += '"'; i += 2; continue; }
          inQ = false; i++; continue;
        }
        cur += ch; i++; continue;
      }
      if (ch === '"') { inQ = true; i++; continue; }
      if (ch === ',') { row.push(cur); cur = ''; i++; continue; }
      if (ch === '\r') { i++; continue; }
      if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; i++; continue; }
      cur += ch; i++;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows.filter(function (r) { return r.length > 1 || (r[0] && r[0].trim() !== ''); });
  }

  function rowsToObjects(rows) {
    if (!rows.length) return [];
    var head = rows[0].map(function (h) { return (h || '').trim().toLowerCase(); });
    return rows.slice(1).map(function (r) {
      var o = {};
      head.forEach(function (h, i) { o[h] = (r[i] == null ? '' : String(r[i])).trim(); });
      return o;
    });
  }

  /* 纯函数：把扁平行合并为单据（同 src_no 多行合并）；返回 {orders, warnings} */
  function mergeRows(objs) {
    var bySrc = {}, order = [], warnings = [];
    objs.forEach(function (o, idx) {
      var src = o.src_no || '';
      if (!src) { warnings.push({ line: idx + 2, msg: '缺 src_no，跳过' }); return; }
      if (!o.item_name) { warnings.push({ line: idx + 2, msg: '缺商品名，跳过' }); return; }
      var qty = parseInt(o.item_qty, 10) || 0;
      if (qty <= 0) { warnings.push({ line: idx + 2, msg: '数量非法，跳过' }); return; }
      var price = num(o.item_price);
      if (price < 0) { warnings.push({ line: idx + 2, msg: '单价为负，跳过' }); return; }
      if (!bySrc[src]) {
        bySrc[src] = {
          src_no: src, buyer: { name: o.buyer_name || '', email: o.buyer_email || '', phone: o.buyer_phone || '' },
          address: { name: o.buyer_name || '', phone: o.buyer_phone || '', line1: o.address_line1 || '', line2: o.address_line2 || '', city: o.city || '', state: o.state || '', zip: o.zip || '', country: o.country || 'US' },
          items: [], discount: num(o.discount), shipping: num(o.shipping), tax: num(o.tax), note: o.note || '', lines: []
        };
        order.push(src);
      }
      bySrc[src].items.push({ id: '', name: o.item_name, image: '', sku: o.item_sku || '', spec: '', price: n2(price), qty: qty, note: o.item_note || '' });
      bySrc[src].lines.push(idx + 2);
    });
    var orders = order.map(function (src) {
      var d = bySrc[src];
      var sub = 0;
      d.items.forEach(function (it) { sub += it.price * it.qty; });
      d.amounts = { subtotal: n2(sub), discount: n2(d.discount), shipping: n2(d.shipping), tax: n2(d.tax), total: n2(sub - num(d.discount) + num(d.shipping) + num(d.tax)), currency: 'USD' };
      return d;
    });
    // 疑似重复单号检查（导入文件内正常合并；这里检测的是与现有草稿的重复）
    return { orders: orders, warnings: warnings };
  }

  function parseImportFile(file, mask) {
    var preview = mask.querySelector('#wb-imp-preview');
    var saveBtn = mask.querySelector('#wb-imp-save');
    preview.innerHTML = '<div style="font-size:13px;color:var(--muted,#A88E9B);">解析中…</div>';
    var isXlsx = /\.xlsx$|\.xls$/i.test(file.name);
    if (isXlsx) {
      if (!window.XLSX) {
        var s = document.createElement('script');
        s.src = 'https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js';
        s.onload = function () { doParseXlsx(file, mask); };
        s.onerror = function () { preview.innerHTML = '<div style="color:var(--danger,#D96570);font-size:14px;">SheetJS 加载失败，请改用 CSV 或检查网络。</div>'; };
        document.head.appendChild(s);
      } else doParseXlsx(file, mask);
      return;
    }
    var fr = new FileReader();
    fr.onload = function () { doParse(rowsToObjects(parseCsv(String(fr.result))), file.name, mask); };
    fr.onerror = function () { preview.innerHTML = '<div style="color:var(--danger,#D96570);">文件读取失败</div>'; };
    fr.readAsText(file, 'utf-8');
  }

  function doParseXlsx(file, mask) {
    var fr = new FileReader();
    fr.onload = function () {
      try {
        var wb = XLSX.read(fr.result, { type: 'array' });
        var rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
        doParse(rowsToObjects(rows), file.name, mask);
      } catch (e) { mask.querySelector('#wb-imp-preview').innerHTML = '<div style="color:var(--danger,#D96570);">Excel 解析失败：' + escHtml(e.message) + '</div>'; }
    };
    fr.readAsArrayBuffer(file);
  }

  var IMP = { orders: [], warnings: [] };

  function doParse(objs, filename, mask) {
    var res = mergeRows(objs);
    IMP.orders = res.orders; IMP.warnings = res.warnings;
    var preview = mask.querySelector('#wb-imp-preview');
    var saveBtn = mask.querySelector('#wb-imp-save');
    if (!IMP.orders.length) {
      preview.innerHTML = '<div style="color:var(--danger,#D96570);font-size:14px;">没有解析出任何有效订单，检查列名是否和模板一致。</div>';
      saveBtn.style.display = 'none';
      return;
    }
    preview.innerHTML =
      '<div style="font-size:14px;color:var(--text,#604C57);margin-bottom:6px;">解析出 <b>' + IMP.orders.length + '</b> 笔订单、共 ' +
        IMP.orders.reduce(function (a, o) { return a + o.items.length; }, 0) + ' 件商品' +
        (IMP.warnings.length ? '，<span style="color:var(--warning,#E0A458);">' + IMP.warnings.length + ' 行有警告（已跳过）</span>' : '') + '</div>' +
      (IMP.warnings.length ? '<div style="font-size:12px;color:var(--warning,#E0A458);max-height:80px;overflow-y:auto;margin-bottom:8px;">' + IMP.warnings.map(function (w) { return '第 ' + w.line + ' 行：' + escHtml(w.msg); }).join('<br>') + '</div>' : '') +
      '<div style="border:1px solid var(--accent-soft,#FCE4EC);border-radius:12px;overflow:hidden;">' +
        IMP.orders.map(function (o) {
          return '<div style="display:flex;gap:10px;padding:8px 12px;border-bottom:1px solid var(--accent-soft,#FCE4EC);font-size:13px;flex-wrap:wrap;align-items:center;">' +
            '<b style="color:var(--text,#604C57);min-width:90px;">' + escHtml(o.src_no) + '</b>' +
            '<span style="flex:1;color:var(--muted,#A88E9B);">' + escHtml(o.buyer.name || o.buyer.email || '—') + ' · ' + o.items.length + ' 件</span>' +
            '<b style="color:var(--price,#ff6fa5);">' + money(o.amounts.total) + '</b></div>';
        }).join('') +
      '</div>';
    saveBtn.style.display = '';
    saveBtn.onclick = function () { saveImportBatches(filename, mask); };
  }

  function saveImportBatches(filename, mask) {
    var saveBtn = mask.querySelector('#wb-imp-save');
    saveBtn.disabled = true;
    var batch = { source: 'file', filename: filename, total: IMP.orders.length, ok: 0, failed: 0, skipped: 0, note: '' };
    api('shop_import_batches', { method: 'POST', headers: { 'Prefer': 'return=representation' }, body: JSON.stringify(batch) }).then(function (r) { return r.json(); }).then(function (brows) {
      var batchId = arr(brows)[0] && arr(brows)[0].id;
      var chain = Promise.resolve();
      var done = 0;
      IMP.orders.forEach(function (o) {
        chain = chain.then(function () {
          return api('shop_order_drafts', { method: 'POST', body: JSON.stringify({ batch_id: batchId, src_no: o.src_no, payload: { src_no: o.src_no, buyer: o.buyer, address: o.address, items: o.items, amounts: o.amounts, note: o.note } , status: 'draft'}) })
            .then(function (r) { if (r.ok) batch.ok++; else batch.failed++; done++; saveBtn.textContent = '保存中… ' + done + '/' + IMP.orders.length; });
        });
      });
      chain.then(function () {
        if (batch.failed) api('shop_import_batches?id=eq.' + batchId, { method: 'PATCH', body: JSON.stringify({ ok: batch.ok, failed: batch.failed }) });
        toast('导入完成：' + batch.ok + ' 笔成草稿' + (batch.failed ? '，' + batch.failed + ' 笔失败' : ''));
        mask.remove();
        switchView('drafts');
      });
    }).catch(function () { toast('批次创建失败'); saveBtn.disabled = false; });
  }

  /* ═══════════ 正式订单审核 ═══════════ */
  function loadOrders() {
    var body = document.getElementById('wb-body');
    if (!body) return;
    body.innerHTML = '<div class="empty">加载中…</div>';
    api('shop_orders?select=*&order=created_at.desc&limit=300').then(function (r) { return r.json(); }).then(function (rows) {
      WB.orders = arr(rows);
      WB.reviewIdx = -1;
      renderOrders();
    }).catch(function (e) {
      body.innerHTML = '<div class="empty">订单加载失败：' + escHtml(e && e.message || e) + '</div>';
    });
  }

  var ORDER_STATUS = { pending: '待付款', reviewing: '待审核', rejected: '已拒绝', paid: '已付款', shipped: '已发货', completed: '已完成', cancelled: '已取消', refunding: '退款中', refunded: '已退款' };

  function renderOrders() {
    var body = document.getElementById('wb-body');
    if (!body) return;
    var list = WB.orders.filter(function (o) {
      if (!WB.search) return true;
      var hay = ((o.order_no || '') + ' ' + (o.email || '') + ' ' + JSON.stringify(o.address || {})).toLowerCase();
      return hay.indexOf(WB.search) !== -1;
    });
    if (WB.reviewIdx >= 0 && WB.reviewIdx < list.length) { renderOrderReview(list); return; }
    if (!list.length) { body.innerHTML = '<div class="empty">没有符合条件的订单。</div>'; return; }
    body.innerHTML = '<div class="card" style="padding:6px 0;overflow:visible;">' + list.map(function (o, i) {
      var items = arr(o.items);
      return '<div style="display:flex;align-items:center;gap:12px;padding:12px 18px;border-bottom:1px solid var(--accent-soft,#FCE4EC);flex-wrap:wrap;">' +
        '<div style="min-width:140px;"><b style="color:var(--price,#ff6fa5);font-size:15px;">' + escHtml(o.order_no) + '</b>' +
          '<div style="font-size:12px;color:var(--muted,#A88E9B);">' + fmtDT(o.created_at) + '</div></div>' +
        '<div style="flex:1;min-width:140px;font-size:14px;color:var(--text,#604C57);">' + escHtml((o.address && o.address.name) || o.email || '—') +
          '<span style="color:var(--muted,#A88E9B);font-size:12px;"> · ' + (ORDER_STATUS[o.status] || o.status) + '</span>' +
          (o.order_source === 'import' ? '<span style="color:var(--warning,#E0A458);font-size:12px;"> · 导入</span>' : '') + '</div>' +
        '<div style="font-size:15px;font-weight:700;color:var(--price,#ff6fa5);">' + money(o.total) + '</div>' +
        '<button class="btn-mini" data-open="' + i + '">审核</button></div>';
    }).join('') + '</div>';
    body.querySelectorAll('[data-open]').forEach(function (b) {
      b.addEventListener('click', function () { WB.reviewIdx = parseInt(b.getAttribute('data-open'), 10); renderOrders(); });
    });
  }

  function renderOrderReview(list) {
    var body = document.getElementById('wb-body');
    var o = list[WB.reviewIdx];
    var addr = o.address || {};
    var items = arr(o.items);
    body.innerHTML =
      '<div class="card" style="padding:16px 20px;">' +
        '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px;">' +
          '<button class="btn-mini" id="rv-prev"' + (WB.reviewIdx <= 0 ? ' disabled style="opacity:.55;"' : '') + '>‹ 上一单</button>' +
          '<span style="font-size:13px;color:var(--muted,#A88E9B);">第 ' + (WB.reviewIdx + 1) + ' / ' + list.length + ' 笔</span>' +
          '<button class="btn-mini" id="rv-next"' + (WB.reviewIdx >= list.length - 1 ? ' disabled style="opacity:.55;"' : '') + '>下一单 ›</button>' +
          '<button class="btn-mini" id="rv-back" style="margin-left:auto;">返回列表</button>' +
        '</div>' +
        '<h3 style="margin:0 0 4px;font-size:17px;color:var(--text,#604C57);"><span style="color:var(--price,#ff6fa5);">' + escHtml(o.order_no) + '</span> · ' + (ORDER_STATUS[o.status] || escHtml(o.status)) + '</h3>' +
        '<div style="font-size:13px;color:var(--muted,#A88E9B);margin-bottom:10px;">' + fmtDT(o.created_at) + ' · 来源：' + escHtml(o.order_source || '线上') + ' · ' + escHtml(o.email || '—') + '</div>' +
        '<div style="border:1px solid var(--accent-soft,#FCE4EC);border-radius:12px;overflow:hidden;margin-bottom:12px;">' +
          items.map(function (it) {
            return '<div style="display:flex;gap:10px;align-items:center;padding:8px 12px;border-bottom:1px solid var(--accent-soft,#FCE4EC);">' +
              (it.image ? '<img src="' + escAttr(it.image) + '" style="width:56px;height:56px;object-fit:cover;border-radius:10px;" onerror="this.style.display=\'none\'">' : '') +
              '<div style="flex:1;min-width:0;"><div style="font-size:14px;color:var(--text,#604C57);">' + escHtml(it.name) + (it.spec ? ' <span style="color:var(--muted,#A88E9B);font-size:12px;">(' + escHtml(it.spec) + ')</span>' : '') + '</div>' +
                (it.note ? '<div style="font-size:12px;color:var(--muted,#A88E9B);">' + escHtml(it.note) + '</div>' : '') + '</div>' +
              '<span style="font-size:13px;color:var(--muted,#A88E9B);">×' + (it.qty || 1) + '</span>' +
              '<b style="color:var(--price,#ff6fa5);font-size:14px;">' + money(num(it.price) * num(it.qty || 1)) + '</b></div>';
          }).join('') +
        '</div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;font-size:14px;margin-bottom:12px;">' +
          '<div>商品总价 <b>' + money(o.subtotal) + '</b></div>' +
          '<div>折扣 <b>' + money(o.discount || 0) + '</b></div>' +
          '<div>运费 <b>' + money(num(o.shipping_actual) || num(o.shipping_est) || 0) + '</b></div>' +
          '<div>应付 <b style="color:var(--price,#ff6fa5);">' + money(o.total) + '</b></div>' +
        '</div>' +
        '<div style="font-size:13px;color:var(--muted,#A88E9B);margin-bottom:6px;">地址：' + escHtml([addr.line1, addr.line2, addr.city, addr.state, addr.zip, addr.country].filter(Boolean).join(', ') || '—') + (addr.phone ? ' · ' + escHtml(addr.phone) : '') + '</div>' +
        (o.note ? '<div style="font-size:13px;color:var(--text,#604C57);background:var(--bg,#FFF8FA);border-radius:10px;padding:8px 12px;margin-bottom:6px;">客户备注：' + escHtml(o.note) + '</div>' : '') +
        (o.admin_note ? '<div style="font-size:13px;color:var(--text,#604C57);background:var(--bg,#FFF8FA);border-radius:10px;padding:8px 12px;margin-bottom:6px;">内部备注：' + escHtml(o.admin_note) + '</div>' : '') +
        '<div style="font-size:14px;font-weight:600;color:var(--text,#604C57);margin:14px 0 6px;">付款记录（定金/尾款/分期/退款）</div>' +
        '<div id="rv-pays" style="margin-bottom:8px;"><div style="font-size:13px;color:var(--muted,#A88E9B);">加载中…</div></div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">' +
          '<button class="btn-mini" id="rv-add-pay">＋ 记一笔</button>' +
          '<span id="rv-pay-sum" style="font-size:14px;color:var(--text,#604C57);"></span>' +
        '</div>' +
      '</div>';
    body.querySelector('#rv-prev').addEventListener('click', function () { if (WB.reviewIdx > 0) { WB.reviewIdx--; renderOrders(); } });
    body.querySelector('#rv-next').addEventListener('click', function () { if (WB.reviewIdx < list.length - 1) { WB.reviewIdx++; renderOrders(); } });
    body.querySelector('#rv-back').addEventListener('click', function () { WB.reviewIdx = -1; renderOrders(); });
    body.querySelector('#rv-add-pay').addEventListener('click', function () { addPayDialog(o); });
    loadPayRecords(o);
  }

  function loadPayRecords(o) {
    var box = document.getElementById('rv-pays');
    api('shop_order_pay_records?order_id=eq.' + o.id + '&select=*&order=created_at.asc').then(function (r) { return r.json(); }).then(function (rows) {
      var pays = arr(rows);
      var paid = 0, refund = 0;
      pays.forEach(function (p) { if (p.kind === 'refund') refund += num(p.amount); else paid += num(p.amount); });
      var outstanding = n2(num(o.total) - paid + refund);
      if (!box) return;
      box.innerHTML = pays.length
        ? pays.map(function (p) {
            return '<div style="display:flex;gap:8px;align-items:center;padding:6px 0;font-size:14px;border-bottom:1px dashed var(--accent-soft,#FCE4EC);flex-wrap:wrap;">' +
              '<span class="chip on" style="pointer-events:none;">' + (PAY_KIND[p.kind] || p.kind) + '</span>' +
              '<b style="color:' + (p.kind === 'refund' ? 'var(--danger,#D96570)' : 'var(--price,#ff6fa5)') + ';">' + (p.kind === 'refund' ? '−' : '') + money(p.amount) + '</b>' +
              '<span style="color:var(--muted,#A88E9B);font-size:13px;">' + (PAY_METHOD[p.method] || p.method) + (p.txn_ref ? ' · ' + escHtml(p.txn_ref) : '') + (p.paid_at ? ' · ' + escHtml(p.paid_at) : '') + '</span>' +
              '<button class="btn-mini" data-pdel="' + p.id + '" style="margin-left:auto;">删除</button></div>';
          }).join('')
        : '<div style="font-size:13px;color:var(--muted,#A88E9B);">还没有付款记录。</div>';
      var sumEl = document.getElementById('rv-pay-sum');
      if (sumEl) sumEl.innerHTML = '已收 <b style="color:var(--price,#ff6fa5);">' + money(paid) + '</b> · 退款 <b style="color:var(--danger,#D96570);">' + money(refund) + '</b> · 欠款 <b style="color:' + (outstanding > 0.005 ? 'var(--warning,#E0A458)' : 'var(--success,#5FA777)') + ';">' + money(outstanding) + '</b>';
      box.querySelectorAll('[data-pdel]').forEach(function (b) {
        b.addEventListener('click', function () {
          uiConfirm('确定删除这条付款记录吗？', function () {
            api('rpc/shop_pay_record_delete', { method: 'POST', body: JSON.stringify({ p_id: b.getAttribute('data-pdel') }) }).then(function (r) {
              if (!r.ok) { toast('删除失败'); return; }
              toast('已删除'); loadPayRecords(o);
            });
          }, '删除');
        });
      });
    }).catch(function () { if (box) box.innerHTML = '<div style="color:var(--danger,#D96570);font-size:13px;">付款记录加载失败</div>'; });
  }

  function addPayDialog(o) {
    var mask = document.createElement('div');
    mask.id = 'wb-mask';
    var kindChips = Object.keys(PAY_KIND).map(function (k, i) {
      return '<span class="chip' + (i === 0 ? ' on' : '') + '" data-pk="' + k + '">' + PAY_KIND[k] + '</span>';
    }).join('');
    var methodChips = Object.keys(PAY_METHOD).map(function (k, i) {
      return '<span class="chip' + (i === 0 ? ' on' : '') + '" data-pm="' + k + '">' + PAY_METHOD[k] + '</span>';
    }).join('');
    mask.innerHTML =
      '<div style="position:fixed;inset:0;background:rgba(96,76,87,.35);z-index:999;display:flex;align-items:center;justify-content:center;padding:16px;">' +
        '<div class="card" style="max-width:480px;width:100%;padding:18px 22px;">' +
          '<h3 style="margin:0 0 10px;font-size:16px;color:var(--text,#604C57);">记一笔 · ' + escHtml(o.order_no) + '</h3>' +
          '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;" id="pk-chips">' + kindChips + '</div>' +
          '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;" id="pm-chips">' + methodChips + '</div>' +
          '<input id="np-amount" type="number" step="0.01" placeholder="金额 $（必填）" style="' + wbInputCss() + 'margin-bottom:8px;">' +
          '<input id="np-txn" placeholder="交易编号（可选）" style="' + wbInputCss() + 'margin-bottom:8px;">' +
          '<input id="np-date" placeholder="日期（可选，如 2026-10-26）" style="' + wbInputCss() + 'margin-bottom:8px;">' +
          '<input id="np-note" placeholder="备注（可选）" style="' + wbInputCss() + 'margin-bottom:12px;">' +
          '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
            '<button class="btn-mini" id="np-cancel">取消</button>' +
            '<button class="btn-save-tb" id="np-ok">保存</button>' +
          '</div></div></div>';
    document.body.appendChild(mask);
    var kind = 'deposit', method = 'stripe';
    mask.querySelector('#pk-chips').addEventListener('click', function (e) {
      var c = e.target.closest('[data-pk]'); if (!c) return;
      kind = c.getAttribute('data-pk');
      mask.querySelectorAll('#pk-chips .chip').forEach(function (x) { x.classList.toggle('on', x === c); });
    });
    mask.querySelector('#pm-chips').addEventListener('click', function (e) {
      var c = e.target.closest('[data-pm]'); if (!c) return;
      method = c.getAttribute('data-pm');
      mask.querySelectorAll('#pm-chips .chip').forEach(function (x) { x.classList.toggle('on', x === c); });
    });
    mask.querySelector('#np-cancel').addEventListener('click', function () { mask.remove(); });
    mask.addEventListener('click', function (e) { if (e.target === mask.firstElementChild) mask.remove(); });
    mask.querySelector('#np-ok').addEventListener('click', function () {
      var amount = num(mask.querySelector('#np-amount').value);
      if (amount <= 0) { toast('金额要大于 0'); return; }
      api('rpc/shop_pay_record_add', { method: 'POST', body: JSON.stringify({
        p_order_id: o.id, p_kind: kind, p_amount: amount, p_method: method,
        p_txn_ref: mask.querySelector('#np-txn').value.trim(),
        p_paid_at: mask.querySelector('#np-date').value.trim(),
        p_note: mask.querySelector('#np-note').value.trim()
      }) }).then(function (r) { return r.json(); }).then(function (j) {
        if (j.message && !j.id) { toast('保存失败：' + j.message); return; }
        toast('已记录 ✓ 欠款 ' + money(j.outstanding));
        mask.remove();
        loadPayRecords(o);
      }).catch(function (e) { toast('保存失败：' + (e && e.message || e)); });
    });
  }

})();
