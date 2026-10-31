/* ══════════════════════════════════════════════════════════════════
   admin-biz.js —— 生产后台三件套：成本计算 / 商品编码 / 扫码验货（纯新增，不改任何现有文件）
   挂载点：admin.html 需有 <div id="tab-cost"> <div id="tab-units"> <div id="tab-qcscan">
   注册：window.BIZ = { bootCost, bootUnits, bootQcscan }（admin.html 切页处按 CRM 同款方式调用）
   依赖 admin.html 全局：api() / toast() / esc() / escAttr() / uiConfirm() / fmtMoney()
   数据：shop_cost_templates / shop_product_units / shop_qc_templates / shop_qc_records
         RPC：shop_unit_create / shop_qc_submit（shop_next_unit_code 预留，由 shop_unit_create 内部取号）
   UI 铁律：无原生 select/checkbox（chip + 自定义下拉）；删除一律 uiConfirm；金额亮粉两位小数；全中文
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ═══════════ 全局助手（admin.html 提供，带本地兜底） ═══════════ */
  function t(zh, en) { return (window.LANG === 'en') ? en : zh; }
  function money(v) {
    v = parseFloat(v);
    if (!isFinite(v)) v = 0;
    return (typeof window.fmtMoney === 'function') ? window.fmtMoney(v) : v.toFixed(2);
  }
  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }
  function $(id) { return document.getElementById(id); }
  function esc(s) { return (typeof window.esc === 'function') ? window.esc(s) : String(s == null ? '' : s); }
  function escAttr(s) { return (typeof window.escAttr === 'function') ? window.escAttr(s) : String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function fmtDT(iso) {
    if (!iso) return '—';
    var d = new Date(iso); if (isNaN(d.getTime())) return String(iso);
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  function ymd(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function ymdCompact(d) { return ymd(d).replace(/-/g, ''); }

  /* ═══════════ 本模块专属样式（只新增 .biz- 前缀，不碰 admin.html） ═══════════ */
  (function injectStyle() {
    if ($('biz-style')) return;
    var st = document.createElement('style');
    st.id = 'biz-style';
    st.textContent = [
      /* 自定义勾选 chip：边框 #FFD9E6、选中 var(--accent-soft,#FCE4EC)、圆头 SVG 勾（铁律：不用原生 checkbox） */
      '.biz-chip{display:inline-flex;align-items:center;border:1.5px solid var(--border,#FFD9E6);background:#fff;color:var(--muted,#81717A);border-radius:999px;padding:5px 13px;font-size:15px;cursor:pointer;font-family:inherit;user-select:none;white-space:nowrap;transition:background .15s,color .15s;}',
      '.biz-chip:hover{color:var(--text,#62545B);}',
      '.biz-chip.on{background:var(--accent-soft,#FCE4EC);border-color:var(--accent-soft,#FCE4EC);color:var(--accent-strong,#A98D96);font-weight:600;}',
      '.biz-chip .ck{display:none;}',
      '.biz-chip.on .ck{display:inline-block;}',
      '.biz-chip:disabled{opacity:.5;cursor:default;}',
      /* 输入框 */
      '.biz-in{border:1.5px solid #FFD9E6;border-radius:10px;padding:7px 10px;font-size:14px;font-family:inherit;color:var(--text,#62545B);background:#fff;outline:none;box-sizing:border-box;min-width:0;}',
      '.biz-in:focus{border-color:#F8BBD0;}',
      /* 状态徽章 */
      '.biz-badge{display:inline-block;font-size:12px;font-weight:600;padding:2px 10px;border-radius:999px;color:#fff;white-space:nowrap;}',
      /* 勾选方块（自定义，非原生 checkbox）：白底粉框 → 选中深玫瑰底白勾 */
      '.biz-uchk{width:22px;height:22px;flex:none;border:1.5px solid var(--border,#FFD9E6);background:#fff;border-radius:7px;cursor:pointer;padding:0;display:inline-flex;align-items:center;justify-content:center;font-family:inherit;transition:background .15s,border-color .15s;}',
      '.biz-uchk:hover{border-color:#F8BBD0;background:var(--accent-soft,#FCE4EC);}',
      '.biz-uchk.on{background:var(--cb-on,#F2A9C4);border-color:var(--cb-on,#F2A9C4);color:#fff;}',
      /* 自定义下拉弹层（同 admin.html sel-menu 视觉，独立 id 防冲突） */
      '#biz-pop{position:fixed;z-index:10001;background:#fff;border-radius:12px;box-shadow:0 6px 20px rgba(180,120,150,.18);padding:6px;min-width:170px;max-height:280px;overflow-y:auto;display:none;box-sizing:border-box;}',
      '#biz-pop .biz-opt{display:block;width:100%;text-align:left;border:none;background:none;font-family:inherit;font-size:14px;color:var(--text,#62545B);padding:8px 12px;border-radius:8px;cursor:pointer;white-space:nowrap;}',
      '#biz-pop .biz-opt:hover{background:var(--accent-soft,#FCE4EC);}',
      '#biz-pop .biz-opt.active{background:var(--accent-soft,#FCE4EC);color:var(--accent-strong,#A98D96);font-weight:600;}',
      '#biz-pop .biz-opt .sub{font-size:12px;color:var(--muted,#81717A);margin-left:6px;}',
      /* 弹层遮罩 */
      '#biz-mask{position:fixed;inset:0;background:rgba(96,76,87,.45);z-index:10000;display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;padding:36px 12px;box-sizing:border-box;}',
      '.biz-modal{background:#fff;border-radius:18px;padding:20px 22px;max-width:640px;width:100%;margin:auto;box-sizing:border-box;box-shadow:0 10px 40px rgba(96,76,87,.25);}',
      /* 编辑区行网格 */
      '.biz-line{display:grid;gap:6px;align-items:center;margin-bottom:6px;}',
      '.biz-head{font-size:12px;color:var(--muted,#81717A);margin-bottom:4px;}',
      '.biz-sub{font-size:13px;font-weight:700;color:var(--price,#ff6fa5);white-space:nowrap;}',
      '.biz-x{border:none;background:none;color:var(--danger,#d96570);cursor:pointer;font-family:inherit;font-size:13px;padding:4px 6px;white-space:nowrap;}',
      '.biz-x:hover{opacity:.75;}',
      /* 计算面板 */
      '.biz-calc-line{display:flex;justify-content:space-between;gap:10px;font-size:14px;color:var(--text,#62545B);padding:3px 0;}',
      '.biz-calc-f{font-size:11.5px;color:var(--muted,#81717A);text-align:right;max-width:190px;}',
      '.biz-sec-t{font-size:13px;font-weight:700;color:var(--accent-strong,#A98D96);margin:10px 0 4px;}',
      '.biz-hr{border:none;border-top:1.5px dashed #F8BBD0;margin:8px 0;}',
      /* 摄像头 */
      '#biz-cam-box video{width:100%;max-width:420px;border-radius:14px;background:#000;display:block;margin:0 auto;}',
      '@media (max-width:720px){.biz-modal{padding:16px 14px;}}',
      /* 20261026k 整改：手机端弹窗不再横向溢出——双列表单转单列，日期框约束宽度，输入 16px 防 iOS 聚焦缩放 */
      '@media (max-width:600px){#biz-mask .biz-modal div[style*="grid-template-columns:1fr 1fr"]{grid-template-columns:1fr !important;}' +
        '.biz-in{font-size:16px;} input[type="date"].biz-in{min-width:0;width:100% !important;} select.biz-in{min-width:0;width:100% !important;}}',
    ].join('\n');
    document.head.appendChild(st);
  })();

  /* 圆头 SVG 勾（chip 选中态显示） */
  var CK = '<svg class="ck" width="14" height="14" viewBox="0 0 24 24" style="margin-right:5px;vertical-align:-2px;"><circle cx="12" cy="12" r="10" fill="#F2A9C4"/><path d="M7.2 12.6l3 3L16.8 9" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var UCHK = '<svg width="14" height="14" viewBox="0 0 24 24"><path d="M7.2 12.6l3 3L16.8 9" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  /* qc_status 徽章配色（pass 绿 / fail 红 / pending 灰 / rework 橙 / quarantine 紫） */
  var QC_COLOR = { pass: '#9ecfae', fail: 'var(--danger,#d96570)', pending: '#c4bcb6', rework: '#f3b96d', quarantine: '#b39ddb' };
  var QC_LABEL = { pass: t('合格', 'Pass'), fail: t('不合格', 'Fail'), pending: t('待质检', 'Pending'), rework: t('返工', 'Rework'), quarantine: t('隔离', 'Quarantine') };
  function qcBadge(s) {
    var v = QC_LABEL[s] || s || '—';
    var c = QC_COLOR[s] || '#c4bcb6';
    return '<span class="biz-badge" style="background:' + c + ';">' + esc(v) + '</span>';
  }
  var ORDER_STATUS = {
    pending: '待付款', reviewing: '待审核付款', rejected: '凭证有误', paid: '已付款·待发货',
    shipped: '已发货', completed: '已完成', cancelled: '已取消', refunding: '退款处理中', refunded: '已退款'
  };

  /* 自定义下拉（铁律：不用原生 select）—— anchored 到任意元素，全局单例 #biz-pop */
  var bizPopEl = null;
  function bizPop(anchor, options, cur, onPick) {
    if (!bizPopEl) { bizPopEl = document.createElement('div'); bizPopEl.id = 'biz-pop'; document.body.appendChild(bizPopEl); }
    bizPopEl.innerHTML = options.map(function (o) {
      return '<button type="button" class="biz-opt' + (o.v === cur ? ' active' : '') + '" data-v="' + escAttr(o.v) + '">' +
        esc(o.label) + (o.sub ? '<span class="sub">' + esc(o.sub) + '</span>' : '') + '</button>';
    }).join('');
    var r = anchor.getBoundingClientRect();
    bizPopEl.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 240)) + 'px';
    bizPopEl.style.top = Math.min(r.bottom + 4, window.innerHeight - 200) + 'px';
    bizPopEl.style.display = 'block';
    bizPopEl.onclick = function (e) {
      var b = e.target.closest('.biz-opt');
      if (!b) return;
      bizPopEl.style.display = 'none';
      onPick(b.getAttribute('data-v'));
    };
  }
  document.addEventListener('click', function (e) {
    if (bizPopEl && bizPopEl.style.display === 'block' && !e.target.closest('#biz-pop')) bizPopEl.style.display = 'none';
  });
  function bizPopClose() { if (bizPopEl) bizPopEl.style.display = 'none'; }

  /* 通用弹层（批量生成表单 / 单件详情） */
  function bizModal(inner) {
    bizCloseModal();
    var mask = document.createElement('div');
    mask.id = 'biz-mask';
    mask.innerHTML = '<div class="biz-modal">' + inner + '</div>';
    document.body.appendChild(mask);
    document.documentElement.style.overflow = 'hidden'; // 弹窗打开时禁止背景滚动（她 2026-10-26 任务书 §9.1）
    mask.addEventListener('click', function (e) { if (e.target === mask) bizCloseModal(); });
    return mask;
  }
  function bizCloseModal() { var m = $('biz-mask'); if (m) m.remove(); document.documentElement.style.overflow = ''; }

  /* ══════════════════════════════════════════════════════════════
     纯函数：成本公式（无 DOM、无请求，方便自检与复用）
     ── 手算对照（断言样例，改动公式请同步更新这组数字）──
       输入 components：
         materials: [{ name:'树脂', batch:'R01', costPerBatch:60, uses:30, yieldRate:10 }]
         labor:     [{ step:'打磨', hours:0.5, hourlyRate:20 }]
         equipment: [{ name:'模具折旧', costPerUse:0.8 }]
         packing:   [{ name:'礼盒', cost:1 }]
         fees:      { ratePct:2.9, fixed:0.30, platformPct:0, discountPct:0 }
       期望（手工计算）：
         材料     = 60 ÷ 30 × (1 + 10%) = 2 × 1.10              = 2.20
         人工     = 0.5 × 20                                    = 10.00
         设备     = 0.80      包装 = 1.00
         单件总成本 = 2.20 + 10.00 + 0.80 + 1.00                = 14.00
         售价 35：毛利 = 35 − 14                                 = 21.00
           毛利率 = 21 ÷ 35 = 60%      加价率 = 21 ÷ 14 = 150%   ← 两率分开显示，严禁混用
           销售费用 = 35 × (2.9%+0%+0%) + 0.30 = 1.015 + 0.30   = 1.315 → 显示 1.32
           净利 = 21 − 1.315                                    = 19.685 → 显示 19.69
         保本售价 = 14 ÷ (1 − 2.9%) = 14 ÷ 0.971                = 14.4183… → 14.42
           （保本价处净利 = −固定手续费 = −0.30：保本只摊平比例费率，固定费仍要覆盖）
         批量 N=10、批量固定项 0：总成本 = 14 × 10 = 140.00，单件平均 = 14.00
         建议售价参考（60% 毛利率）= 14 ÷ (1 − 0.6) = 14 ÷ 0.4   = 35.00
     ───────────────────────────────────────────────────────────── */
  function calcUnitCost(comp) {
    comp = comp || {};
    var material = 0, labor = 0, equipment = 0, packing = 0;
    (comp.materials || []).forEach(function (r) {
      // 简化公式：行成本 = 整批花费 ÷ 该批可产件数 × (1 + 损耗率%)；uses<=0 的行视为未填，计 0
      if (num(r.uses) > 0) material += num(r.costPerBatch) / num(r.uses) * (1 + num(r.yieldRate) / 100);
    });
    (comp.labor || []).forEach(function (r) { labor += num(r.hours) * num(r.hourlyRate); });
    (comp.equipment || []).forEach(function (r) { equipment += num(r.costPerUse); });
    (comp.packing || []).forEach(function (r) { packing += num(r.cost); });
    return { material: material, labor: labor, equipment: equipment, packing: packing, unit: material + labor + equipment + packing };
  }
  function feeRateSum(fees) { fees = fees || {}; return num(fees.ratePct) + num(fees.platformPct) + num(fees.discountPct); }
  function calcNet(unitCost, price, fees) {
    return (price - unitCost) - (price * feeRateSum(fees) / 100 + num((fees || {}).fixed));
  }
  function calcBreakEven(unitCost, fees) {
    var rs = feeRateSum(fees);
    return rs < 100 ? unitCost / (1 - rs / 100) : NaN; // 费率合计≥100% 无解，返回 NaN 由 UI 提示
  }
  function calcBatch(unitCost, n, fixedExtra) {
    n = Math.max(0, Math.round(num(n)));
    var total = unitCost * n + num(fixedExtra);
    return { total: total, avg: n > 0 ? total / n : 0 };
  }
  function suggestPrice60(unitCost) { return unitCost / 0.4; } // 毛利率 60% 参考：售价 = 成本 ÷ (1−0.6)

  /* 加载即跑一次公式自检（不弹 UI，只在 console 告警） */
  function selfTest() {
    var out = [];
    function eq(name, got, want, eps) { out.push({ name: name, ok: Math.abs(got - want) <= (eps || 0.005) }); }
    var comp = {
      materials: [{ name: '树脂', batch: 'R01', costPerBatch: 60, uses: 30, yieldRate: 10 }],
      labor: [{ step: '打磨', hours: 0.5, hourlyRate: 20 }],
      equipment: [{ name: '模具折旧', costPerUse: 0.8 }],
      packing: [{ name: '礼盒', cost: 1 }],
      fees: { ratePct: 2.9, fixed: 0.30, platformPct: 0, discountPct: 0 }
    };
    var u = calcUnitCost(comp);
    eq('材料单件', u.material, 2.20);
    eq('单件总成本', u.unit, 14.00);
    eq('毛利(售价35)', 35 - u.unit, 21.00);
    eq('销售费用(售价35)', 35 * 0.029 + 0.30, 1.315, 0.0005);
    eq('净利(售价35)', calcNet(u.unit, 35, comp.fees), 19.685, 0.0005);
    eq('保本售价', calcBreakEven(u.unit, comp.fees), 14.4183, 0.001);
    eq('批量总成本(N10)', calcBatch(u.unit, 10, 0).total, 140.00);
    eq('批量均价(N10)', calcBatch(u.unit, 10, 0).avg, 14.00);
    eq('建议售价(60%毛利)', suggestPrice60(u.unit), 35.00);
    var bad = out.filter(function (x) { return !x.ok; });
    if (bad.length) { try { console.warn('[admin-biz] 成本公式自检未通过：', bad); } catch (e) {} }
    return out;
  }
  selfTest();

  /* ══════════════════════════════════════════════════════════════
     模块一：成本计算（bootCost → #tab-cost）
     ══════════════════════════════════════════════════════════════ */
  var COST = { list: [], products: [], edit: null }; // edit = { model, isNew, id }
  var TYPE_LABEL = { keycap: '树脂键帽', handmade: '手工制品', purchased: '外购商品', custom: '定制品', combo: '组合商品' };

  function blankCostModel() {
    return {
      name: '', item_type: 'keycap', note: '',
      materials: [{}], labor: [{}], equipment: [], packing: [],
      fees: { ratePct: 2.9, fixed: 0.30, platformPct: 0, discountPct: 0 },
      suggested_price: '', actualPrice: '', suggestedTouched: false,
      linkedProductId: '', batchN: 10, batchFixed: 0,
      history: []
    };
  }
  function rowToModel(row) {
    var c = row.components || {};
    var m = blankCostModel();
    m.name = row.name || ''; m.item_type = row.item_type || 'keycap'; m.note = row.note || '';
    m.materials = (c.materials && c.materials.length) ? clone(c.materials) : [{}];
    m.labor = (c.labor && c.labor.length) ? clone(c.labor) : [{}];
    m.equipment = clone(c.equipment || []);
    m.packing = clone(c.packing || []);
    m.fees = Object.assign({ ratePct: 2.9, fixed: 0.30, platformPct: 0, discountPct: 0 }, c.fees || {});
    m.suggested_price = (row.suggested_price == null || row.suggested_price === '') ? '' : String(row.suggested_price);
    m.actualPrice = (c.actualPrice == null || c.actualPrice === '') ? '' : String(c.actualPrice);
    m.linkedProductId = c.linkedProductId || '';
    m.batchFixed = num(c.batchFixed);
    m.history = clone(c.history || []);
    return m;
  }

  function bootCost() {
    var panel = $('tab-cost');
    if (!panel) { try { console.warn('[admin-biz] 缺少 #tab-cost 挂载点'); } catch (e) {} return; }
    renderCostPage(panel);
    loadCostData();
    if (COST.edit) renderCostEditor(); // 切页回来恢复编辑现场（直接用模型重画，不等列表回来）
  }
  function renderCostPage(panel) {
    panel.innerHTML =
      '<div class="card" style="padding:16px 20px;margin-bottom:14px;">' +
        '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">' +
          '<b style="font-size:17px;color:var(--text,#62545B);">成本计算</b>' +
          '<span style="font-size:13px;color:var(--muted,#81717A);">模板算好单件成本、费用与保本价，保存后可随时回来对比</span>' +
          '<button class="btn-save-tb" id="biz-cost-new" style="margin-left:auto;">＋ 新建成本模板</button>' +
        '</div>' +
      '</div>' +
      '<div id="biz-cost-editor"></div>' +
      '<div id="biz-cost-list"><p style="color:var(--muted,#81717A);text-align:center;padding:24px 0;">加载中…</p></div>';
    $('biz-cost-new').addEventListener('click', function () { openCostEditor(null, true, null); });
  }

  function loadCostData() {
    api('shop_cost_templates?select=*&order=created_at.desc').then(function (r) { return r.json(); }).then(function (rows) {
      COST.list = Array.isArray(rows) ? rows : [];
      renderCostList();
    }).catch(function () {
      var box = $('biz-cost-list');
      if (box) box.innerHTML = '<p style="color:var(--muted,#81717A);text-align:center;padding:24px 0;">模板列表加载失败，请刷新重试</p>';
    });
    api('products?select=id,name,price,image_url&order=created_at.desc&limit=300').then(function (r) { return r.json(); }).then(function (rows) {
      COST.products = Array.isArray(rows) ? rows : [];
    }).catch(function () { COST.products = []; });
  }

  function costUnitOf(row) { return calcUnitCost(row.components || {}).unit; }

  function renderCostList() {
    var box = $('biz-cost-list');
    if (!box) return;
    if (!COST.list.length) {
      box.innerHTML = '<p style="color:var(--muted,#81717A);text-align:center;padding:24px 0;">还没有成本模板，点右上角「新建成本模板」开始算第一件作品的成本吧</p>';
      return;
    }
    box.innerHTML = COST.list.map(function (row) {
      var u = costUnitOf(row);
      return '<div class="card biz-cost-card" data-id="' + escAttr(row.id) + '" style="padding:12px 16px;margin-bottom:10px;cursor:pointer;">' +
        '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">' +
          '<b style="font-size:15px;color:var(--text,#62545B);">' + esc(row.name || '（未命名模板）') + '</b>' +
          '<span style="font-size:12px;padding:2px 10px;border-radius:999px;background:var(--accent-soft,#FCE4EC);color:var(--accent-strong,#A98D96);">' + esc(TYPE_LABEL[row.item_type] || row.item_type || '—') + '</span>' +
          '<span style="font-size:13px;color:var(--muted,#81717A);">单件总成本 <b style="color:var(--price,#ff6fa5);">$' + money(u) + '</b></span>' +
          '<span style="margin-left:auto;font-size:13px;color:var(--muted,#81717A);">建议售价 <b style="color:var(--price,#ff6fa5);">$' + money(row.suggested_price) + '</b></span>' +
        '</div>' +
      '</div>';
    }).join('');
    box.querySelectorAll('.biz-cost-card').forEach(function (el) {
      el.addEventListener('click', function () { openCostEditor(el.getAttribute('data-id'), false, null); });
    });
  }

  /* ── 编辑器（同一页展开）── */
  function openCostEditor(id, isNew, keepModel) {
    var row = null;
    if (!isNew && id) row = COST.list.filter(function (x) { return x.id === id; })[0] || null;
    if (!isNew && !row) { toast('模板不存在或已被删除'); return; }
    var model = keepModel || (isNew ? blankCostModel() : rowToModel(row));
    COST.edit = { id: isNew ? null : id, isNew: !!isNew, model: model };
    renderCostEditor();
    try { $('biz-cost-editor').scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {}
  }

  function chipHTML(label, on, act, v) {
    return '<button type="button" class="biz-chip' + (on ? ' on' : '') + '" data-act="' + act + '" data-v="' + escAttr(v) + '">' + CK + esc(label) + '</button>';
  }
  function secCard(title, addAct, addLabel, head, lines) {
    return '<div class="card" style="padding:14px 16px;margin-bottom:12px;">' +
      '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
        '<b style="font-size:15px;color:var(--text,#62545B);">' + title + '</b>' +
        (addAct ? '<button type="button" class="btn-mini" data-act="addRow" data-sec="' + addAct + '" style="padding:3px 12px;font-size:13px;margin-left:auto;">+ ' + addLabel + '</button>' : '') +
      '</div>' +
      (head ? '<div class="biz-line biz-head" style="grid-template-columns:' + head + ';">' + lines.head + '</div>' : '') +
      lines.body +
    '</div>';
  }
  function gridLine(cols, inner) {
    return '<div class="biz-line" style="grid-template-columns:' + cols + ';">' + inner + '</div>';
  }
  function fIn(path, val, ph, typ) {
    return '<input class="biz-in" data-path="' + path + '"' + (typ === 'str' ? ' data-typ="str"' : '') + ' value="' + escAttr(val == null ? '' : val) + '" placeholder="' + escAttr(ph || '') + '" style="width:100%;">';
  }

  function renderCostEditor() {
    var box = $('biz-cost-editor');
    if (!box) return;
    var ed = COST.edit;
    if (!ed) { box.innerHTML = ''; return; }
    var m = ed.model;

    /* 类型 chips */
    var typeChips = Object.keys(TYPE_LABEL).map(function (k) { return chipHTML(TYPE_LABEL[k], m.item_type === k, 'type', k); }).join('');

    /* 材料行 */
    var matBody = m.materials.map(function (r, i) {
      return gridLine('1.6fr 1.2fr 1fr 1fr .8fr .9fr 30px',
        fIn('materials.' + i + '.name', r.name, '名称', 'str') +
        fIn('materials.' + i + '.batch', r.batch, '采购批次', 'str') +
        fIn('materials.' + i + '.costPerBatch', r.costPerBatch, '整批花费$') +
        fIn('materials.' + i + '.uses', r.uses, '该批可产') +
        fIn('materials.' + i + '.yieldRate', r.yieldRate, '损耗%') +
        '<span class="biz-sub" data-sub="materials.' + i + '"></span>' +
        '<button type="button" class="biz-x" data-act="delRow" data-sec="materials" data-idx="' + i + '">删</button>');
    }).join('');
    var matSec = secCard('材料', 'materials', '添加材料', '1.6fr 1.2fr 1fr 1fr .8fr .9fr 30px',
      { head: '<span>名称</span><span>采购批次</span><span>整批花费 $</span><span>该批可产件数</span><span>损耗率 %</span><span>单件分摊</span><span></span>', body: matBody });

    /* 人工行 */
    var labBody = m.labor.map(function (r, i) {
      return gridLine('1.8fr 1fr 1fr .9fr 30px',
        fIn('labor.' + i + '.step', r.step, '工序', 'str') +
        fIn('labor.' + i + '.hours', r.hours, '小时') +
        fIn('labor.' + i + '.hourlyRate', r.hourlyRate, '时薪$') +
        '<span class="biz-sub" data-sub="labor.' + i + '"></span>' +
        '<button type="button" class="biz-x" data-act="delRow" data-sec="labor" data-idx="' + i + '">删</button>');
    }).join('');
    var labSec = secCard('人工', 'labor', '添加工序', '1.8fr 1fr 1fr .9fr 30px',
      { head: '<span>工序</span><span>小时</span><span>时薪 $</span><span>小计</span><span></span>', body: labBody });

    /* 设备/耗材行 */
    var eqBody = m.equipment.map(function (r, i) {
      return gridLine('2fr 1fr 30px',
        fIn('equipment.' + i + '.name', r.name, '设备 / 耗材名称', 'str') +
        fIn('equipment.' + i + '.costPerUse', r.costPerUse, '单次使用成本$') +
        '<button type="button" class="biz-x" data-act="delRow" data-sec="equipment" data-idx="' + i + '">删</button>');
    }).join('');
    var eqSec = secCard('设备 / 耗材', 'equipment', '添加设备/耗材', '2fr 1fr 30px',
      { head: '<span>名称</span><span>单次使用成本 $</span><span></span>', body: eqBody });

    /* 包装行（打包人工也算一行） */
    var pkBody = m.packing.map(function (r, i) {
      return gridLine('2fr 1fr 30px',
        fIn('packing.' + i + '.name', r.name, '包装项（盒 / 缎带 / 打包人工…）', 'str') +
        fIn('packing.' + i + '.cost', r.cost, '成本$') +
        '<button type="button" class="biz-x" data-act="delRow" data-sec="packing" data-idx="' + i + '">删</button>');
    }).join('');
    var pkSec = secCard('包装', 'packing', '添加包装', '2fr 1fr 30px',
      { head: '<span>名称</span><span>成本 $</span><span></span>', body: pkBody });

    /* 费用区 + 售价区 */
    var feeSec =
      '<div class="card" style="padding:14px 16px;margin-bottom:12px;">' +
        '<b style="font-size:15px;color:var(--text,#62545B);">费用</b>' +
        '<div class="biz-line" style="grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;">' +
          '<label style="font-size:13px;color:var(--muted,#81717A);">支付手续费率 %' + fIn('fees.ratePct', m.fees.ratePct, '2.9') + '</label>' +
          '<label style="font-size:13px;color:var(--muted,#81717A);">固定手续费 $' + fIn('fees.fixed', m.fees.fixed, '0.30') + '</label>' +
          '<label style="font-size:13px;color:var(--muted,#81717A);">平台费率 %' + fIn('fees.platformPct', m.fees.platformPct, '0') + '</label>' +
          '<label style="font-size:13px;color:var(--muted,#81717A);">折扣成本 %' + fIn('fees.discountPct', m.fees.discountPct, '0') + '</label>' +
        '</div>' +
        '<p style="font-size:12px;color:var(--muted,#81717A);margin:6px 0 0;">定金 / 尾款不参与成本——成本只看商品本身。</p>' +
      '</div>';

    var linkedName = '＋ 关联商品（可选）';
    if (m.linkedProductId) {
      var lp = COST.products.filter(function (p) { return p.id === m.linkedProductId; })[0];
      if (lp) linkedName = '已关联：' + lp.name;
    }
    var priceSec =
      '<div class="card" style="padding:14px 16px;margin-bottom:12px;">' +
        '<b style="font-size:15px;color:var(--text,#62545B);">售价</b>' +
        '<div class="biz-line" style="grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;">' +
          '<label style="font-size:13px;color:var(--muted,#81717A);">建议售价 $（60% 毛利参考可改）' + fIn('suggested_price', m.suggested_price, '自动按成本 ÷ 0.4 给参考值') + '</label>' +
          '<label style="font-size:13px;color:var(--muted,#81717A);">实际售价 $' + fIn('actualPrice', m.actualPrice, '实际成交价') + '</label>' +
        '</div>' +
        '<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;">' +
          '<button type="button" class="btn-mini" data-act="autoPrice" style="padding:5px 12px;font-size:13px;">按 60% 毛利重算参考价</button>' +
          '<button type="button" class="btn-mini" data-act="link" style="padding:5px 12px;font-size:13px;">' + esc(linkedName) + '</button>' +
        '</div>' +
      '</div>';

    /* 历史 + 备注 */
    var histHtml = '';
    if (m.history && m.history.length) {
      var rows = m.history.slice(-6).reverse();
      histHtml = '<div class="card" style="padding:14px 16px;margin-bottom:12px;">' +
        '<b style="font-size:15px;color:var(--text,#62545B);">单件成本变化（最近 ' + rows.length + ' 次保存）</b>' +
        rows.map(function (h, i) {
          var prev = rows[i + 1];
          var delta = prev ? (num(h.unitCost) - num(prev.unitCost)) : null;
          return '<div style="display:flex;justify-content:space-between;font-size:13.5px;color:var(--text,#62545B);padding:3px 0;">' +
            '<span>' + esc(fmtDT(h.at)) + '</span>' +
            '<span>成本 <b style="color:var(--price,#ff6fa5);">$' + money(h.unitCost) + '</b> · 售价 $' + money(h.price) +
            (delta === null ? '' : ' <span style="color:' + (delta > 0 ? 'var(--danger,#d96570)' : delta < 0 ? '#9ecfae' : 'var(--muted,#81717A)') + ';">(' + (delta > 0 ? '+' : '') + money(delta) + ')</span>') +
            '</span></div>';
        }).join('') +
      '</div>';
    }
    var noteSec =
      '<div class="card" style="padding:14px 16px;margin-bottom:12px;">' +
        '<label style="font-size:13px;color:var(--muted,#81717A);">备注' + fIn('note', m.note, '采购链接、配方要点…', 'str') + '</label>' +
      '</div>';

    /* 组装：左侧编辑区 + 右侧实时计算面板 */
    var topBtns =
      '<div class="card" style="padding:14px 16px;margin-bottom:12px;">' +
        '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">' +
          '<input class="biz-in" data-path="name" data-typ="str" value="' + escAttr(m.name) + '" placeholder="模板名称（必填）" style="flex:1;min-width:180px;font-size:15px;padding:9px 12px;">' +
          '<button class="btn-save-tb" data-act="save">保存模板</button>' +
          '<button class="btn-mini" data-act="cancel" style="padding:7px 14px;">取消修改</button>' +
          '<button class="btn-mini" data-act="copy" style="padding:7px 14px;">复制为新模板</button>' +
          (ed.isNew ? '' : '<button class="btn-mini" data-act="del" style="padding:7px 14px;color:var(--danger,#d96570);">删除</button>') +
        '</div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;">' + typeChips + '</div>' +
      '</div>';

    box.innerHTML =
      topBtns +
      '<div style="display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap;">' +
        '<div style="flex:1.4;min-width:320px;">' + matSec + labSec + eqSec + pkSec + feeSec + priceSec + noteSec + histHtml + '</div>' +
        '<div class="card" id="biz-calc-panel" style="flex:1;min-width:290px;padding:16px 18px;position:sticky;top:70px;"></div>' +
      '</div>';

    bindCostEditor(box);
    recalcCostPanel();
  }

  /* 编辑器事件委托：input 改模型 → 行小计 + 面板刷新；click 处理 chips / 行增删 / 按钮
     盒子元素跨重渲染持久存在，监听只绑一次（渲染只换 innerHTML，委托照常命中新子节点） */
  function bindCostEditor(box) {
    if (box.dataset.bizBound) return;
    box.dataset.bizBound = '1';
    box.addEventListener('input', function (e) {
      var el = e.target;
      if (!el.dataset || !el.dataset.path) return;
      var path = el.dataset.path;
      var val = el.value;
      if (el.dataset.typ !== 'str') val = num(val);
      setByPath(COST.edit.model, path, val);
      if (path === 'suggested_price') COST.edit.model.suggestedTouched = true;
      if (path.indexOf('batchN') === 0 || path.indexOf('batchFixed') === 0) { applyCalcNumbers(); return; } // 面板内输入：只刷数字，不动焦点
      updateRowSubs();
      recalcCostPanel();
    });
    box.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-act]');
      if (!btn) return;
      var act = btn.getAttribute('data-act');
      var m = COST.edit.model;
      if (act === 'type') { m.item_type = btn.getAttribute('data-v'); renderCostEditor(); return; }
      if (act === 'addRow') { m[btn.getAttribute('data-sec')].push({}); renderCostEditor(); return; }
      if (act === 'delRow') {
        var sec = btn.getAttribute('data-sec'), idx = parseInt(btn.getAttribute('data-idx'), 10);
        uiConfirm('确认删掉这一行？还没保存的填写内容会一起丢掉。', function () {
          m[sec].splice(idx, 1); renderCostEditor();
        });
        return;
      }
      if (act === 'autoPrice') { m.suggested_price = String(Math.round(suggestPrice60(calcUnitCost(m).unit) * 100) / 100); m.suggestedTouched = true; renderCostEditor(); return; }
      if (act === 'link') {
        bizPop(btn, [{ v: '', label: '不关联' }].concat(COST.products.map(function (p) {
          return { v: p.id, label: p.name, sub: p.price != null && p.price !== '' ? '$' + p.price : '' };
        })), m.linkedProductId, function (v) { m.linkedProductId = v; renderCostEditor(); });
        return;
      }
      if (act === 'save') { saveCostTemplate(false); return; }
      if (act === 'copy') { saveCostTemplate(true); return; }
      if (act === 'cancel') {
        COST.edit = null;
        $('biz-cost-editor').innerHTML = '';
        renderCostList();
        return;
      }
      if (act === 'del') { deleteCostTemplate(); return; }
    });
  }

  function setByPath(obj, path, val) {
    var ks = path.split('.'), o = obj;
    for (var i = 0; i < ks.length - 1; i++) { if (o[ks[i]] == null) o[ks[i]] = {}; o = o[ks[i]]; }
    o[ks[ks.length - 1]] = val;
  }
  function updateRowSubs() {
    var m = COST.edit.model;
    var box = $('biz-cost-editor');
    if (!box) return;
    box.querySelectorAll('[data-sub]').forEach(function (el) {
      var p = el.getAttribute('data-sub').split('.');
      var sec = p[0], i = parseInt(p[1], 10), r = (m[sec] || [])[i];
      var v = 0;
      if (sec === 'materials') v = num(r && r.uses) > 0 ? num(r.costPerBatch) / num(r.uses) * (1 + num(r.yieldRate) / 100) : 0;
      else if (sec === 'labor') v = num(r && r.hours) * num(r && r.hourlyRate);
      else if (sec === 'equipment') v = num(r && r.costPerUse);
      else if (sec === 'packing') v = num(r && r.cost);
      el.textContent = '$' + money(v);
    });
  }

  /* 实时计算面板：全公式明示 */
  function recalcCostPanel() {
    var panel = $('biz-calc-panel');
    if (!panel || !COST.edit) return;
    var m = COST.edit.model;
    var auto = (!m.suggestedTouched && num(m.suggested_price) === 0);
    if (auto) m.suggested_price = String(Math.round(suggestPrice60(calcUnitCost(m).unit) * 100) / 100);
    var sp = panel.querySelector('[data-path="suggested_price"]');
    if (auto && sp) sp.value = m.suggested_price;
    panel.innerHTML = panelSkeleton();
    applyCalcNumbers();
  }
  function panelSkeleton() {
    return '' +
      '<b style="font-size:16px;color:var(--text,#62545B);">实时计算</b>' +
      '<div style="margin-top:8px;">' +
        '<div class="biz-calc-line"><span>单件材料</span><b data-o="material"></b></div>' +
        '<div class="biz-calc-f" style="text-align:left;">= Σ（整批花费 ÷ 该批可产件数 ×（1 + 损耗率））</div>' +
        '<div class="biz-calc-line"><span>单件人工</span><b data-o="labor"></b></div>' +
        '<div class="biz-calc-f" style="text-align:left;">= Σ（小时 × 时薪）</div>' +
        '<div class="biz-calc-line"><span>单件设备 / 耗材</span><b data-o="equipment"></b></div>' +
        '<div class="biz-calc-line"><span>单件包装</span><b data-o="packing"></b></div>' +
        '<div class="biz-calc-line" style="font-size:16px;"><span><b>单件总成本</b></span><b style="font-size:19px;color:var(--price,#ff6fa5);" data-o="unit"></b></div>' +
        '<div class="biz-calc-f" style="text-align:left;">= 材料 + 人工 + 设备 + 包装</div>' +
      '</div>' +
      '<hr class="biz-hr">' +
      '<div class="biz-sec-t">毛利（按实际售价，没填则用建议售价）</div>' +
      '<div class="biz-calc-line"><span>售价</span><b data-o="price"></b></div>' +
      '<div class="biz-calc-line"><span>毛利</span><b data-o="gross"></b></div>' +
      '<div class="biz-calc-f" style="text-align:left;">= 售价 − 单件总成本</div>' +
      '<div class="biz-calc-line"><span>毛利率</span><b data-o="gmarg"></b></div>' +
      '<div class="biz-calc-f" style="text-align:left;">= 毛利 ÷ 售价</div>' +
      '<div class="biz-calc-line"><span>加价率</span><b data-o="markup"></b></div>' +
      '<div class="biz-calc-f" style="text-align:left;">= 毛利 ÷ 单件总成本（和毛利率是两个数，别混）</div>' +
      '<div class="biz-calc-line"><span>销售费用</span><b data-o="sellfee"></b></div>' +
      '<div class="biz-calc-f" style="text-align:left;">= 售价 ×（<span data-o="frate"></span>% 费率合计）+ $<span data-o="ffix"></span> 固定费</div>' +
      '<div class="biz-calc-line" style="font-size:16px;"><span><b>净利</b></span><b style="font-size:19px;color:var(--price,#ff6fa5);" data-o="net"></b></div>' +
      '<div class="biz-calc-f" style="text-align:left;">= 毛利 − 销售费用</div>' +
      '<hr class="biz-hr">' +
      '<div class="biz-sec-t">批量</div>' +
      '<div class="biz-calc-line"><span>批量件数 N</span><input class="biz-in" data-path="batchN" value="' + escAttr(COST.edit.model.batchN) + '" style="width:80px;text-align:right;"></div>' +
      '<div class="biz-calc-line"><span>批量固定项 $（场地 / 水电等）</span><input class="biz-in" data-path="batchFixed" value="' + escAttr(COST.edit.model.batchFixed) + '" style="width:80px;text-align:right;"></div>' +
      '<div class="biz-calc-line"><span>批量总成本</span><b data-o="btotal"></b></div>' +
      '<div class="biz-calc-f" style="text-align:left;">= 单件总成本 × N + 固定项（假设：材料已按「该批可产」摊进单件成本，整批未摊销部分请填进固定项）</div>' +
      '<div class="biz-calc-line"><span>单件平均成本</span><b data-o="bavg"></b></div>' +
      '<hr class="biz-hr">' +
      '<div class="biz-sec-t">保本价对比</div>' +
      '<div class="biz-calc-line"><span>保本售价</span><b data-o="be"></b></div>' +
      '<div class="biz-calc-f" style="text-align:left;">= 单件总成本 ÷（1 − <span data-o="besum"></span>% 费率合计）</div>' +
      '<div class="biz-calc-line" style="align-items:flex-start;">' +
        '<span>并排看</span>' +
        '<span style="text-align:right;font-size:13px;line-height:1.7;">' +
          '实际售价 <b data-o="cmpPrice"></b> → 净利 <b style="color:var(--price,#ff6fa5);" data-o="cmpNet"></b>/件<br>' +
          '保本价 <b data-o="cmpBe"></b> → 净利 <b data-o="cmpBeNet"></b>/件' +
        '</span>' +
      '</div>' +
      '<div class="biz-calc-f" style="text-align:left;margin-top:4px;">保本价只摊平比例费率，固定手续费仍需另覆盖（所以保本价处净利 = −固定手续费）。</div>';
  }
  function applyCalcNumbers() {
    var panel = $('biz-calc-panel');
    if (!panel || !COST.edit) return;
    var m = COST.edit.model;
    var c = calcUnitCost(m);
    var fees = m.fees || {};
    var price = num(m.actualPrice) || num(m.suggested_price);
    var gross = price - c.unit;
    var gmarg = price > 0 ? gross / price : 0;
    var markup = c.unit > 0 ? gross / c.unit : 0;
    var sellFee = price * feeRateSum(fees) / 100 + num(fees.fixed);
    var net = gross - sellFee;
    var b = calcBatch(c.unit, m.batchN, m.batchFixed);
    var be = calcBreakEven(c.unit, fees);
    var beNet = isFinite(be) ? calcNet(c.unit, be, fees) : NaN;
    function put(k, v) { var el = panel.querySelector('[data-o="' + k + '"]'); if (el) el.textContent = v; }
    put('material', '$' + money(c.material));
    put('labor', '$' + money(c.labor));
    put('equipment', '$' + money(c.equipment));
    put('packing', '$' + money(c.packing));
    put('unit', '$' + money(c.unit));
    put('price', '$' + money(price));
    put('gross', '$' + money(gross));
    put('gmarg', (gmarg * 100).toFixed(1) + '%');
    put('markup', (markup * 100).toFixed(1) + '%');
    put('sellfee', '$' + money(sellFee));
    put('frate', feeRateSum(fees).toFixed(2).replace(/\.?0+$/, ''));
    put('ffix', money(fees.fixed));
    put('net', '$' + money(net));
    put('btotal', '$' + money(b.total));
    put('bavg', '$' + money(b.avg));
    put('be', isFinite(be) ? '$' + money(be) : '费率合计 ≥ 100%，无保本价');
    put('besum', feeRateSum(fees).toFixed(2).replace(/\.?0+$/, ''));
    put('cmpPrice', '$' + money(price));
    put('cmpNet', '$' + money(net));
    put('cmpBe', isFinite(be) ? '$' + money(be) : '—');
    put('cmpBeNet', isFinite(beNet) ? '$' + money(beNet) : '—');
    updateRowSubs();
  }

  function saveCostTemplate(asCopy) {
    var ed = COST.edit;
    if (!ed) return;
    var m = ed.model;
    if (!String(m.name || '').trim()) { toast('先给模板起个名字'); return; }
    var unit = calcUnitCost(m).unit;
    var comps = {
      materials: m.materials, labor: m.labor, equipment: m.equipment, packing: m.packing,
      fees: m.fees, actualPrice: num(m.actualPrice), linkedProductId: m.linkedProductId || null,
      batchFixed: num(m.batchFixed),
      history: clone(m.history || [])
    };
    // 历史比较：保存时 push {at, unitCost, price}（price 优先实际售价，否则建议售价）
    comps.history.push({ at: new Date().toISOString(), unitCost: Math.round(unit * 100) / 100, price: Math.round((num(m.actualPrice) || num(m.suggested_price)) * 100) / 100 });
    if (comps.history.length > 12) comps.history = comps.history.slice(-12);
    var payload = {
      name: String(m.name).trim(), item_type: m.item_type, components: comps,
      suggested_price: num(m.suggested_price), currency: 'USD', note: m.note || '', updated_at: new Date().toISOString()
    };
    var p;
    if (ed.isNew || asCopy) {
      p = api('shop_cost_templates', { method: 'POST', headers: { 'Prefer': 'return=representation' }, body: JSON.stringify([payload]) });
    } else {
      p = api('shop_cost_templates?id=eq.' + ed.id, { method: 'PATCH', headers: { 'Prefer': 'return=representation' }, body: JSON.stringify(payload) });
    }
    p.then(function (r) {
      if (!r.ok) throw new Error('save failed');
      return r.json();
    }).then(function (rows) {
      toast(asCopy ? '已复制为新模板「' + payload.name + '」' : '模板已保存');
      COST.edit = null;
      $('biz-cost-editor').innerHTML = '';
      loadCostData();
      if (asCopy && rows && rows[0]) openCostEditor(rows[0].id, false, null); // 复制完直接进新模板继续改
    }).catch(function () { toast('保存失败，请重试'); });
  }

  function deleteCostTemplate() {
    var ed = COST.edit;
    if (!ed || ed.isNew || !ed.id) return;
    var row = COST.list.filter(function (x) { return x.id === ed.id; })[0];
    uiConfirm('确认删除成本模板「' + ((row && row.name) || '未命名') + '」？删除后不可恢复。', function () {
      api('shop_cost_templates?id=eq.' + ed.id, { method: 'DELETE' }).then(function (r) {
        if (!r.ok) throw new Error();
        toast('模板已删除');
        COST.edit = null;
        $('biz-cost-editor').innerHTML = '';
        loadCostData();
      }).catch(function () { toast('删除失败，请重试'); });
    });
  }

  /* ══════════════════════════════════════════════════════════════
     模块二：商品编码（bootUnits → #tab-units）
     ══════════════════════════════════════════════════════════════ */
  var UNITS = { list: [], products: [], orders: [], filter: 'all', search: '', pmap: {}, omap: {}, sel: {} };
  var UNIT_FILTERS = [
    { v: 'all', label: '全部' }, { v: 'pending', label: '待质检' }, { v: 'pass', label: '合格' },
    { v: 'fail', label: '不合格' }, { v: 'rework', label: '返工' }, { v: 'quarantine', label: '隔离' }
  ];

  function bootUnits() {
    var panel = $('tab-units');
    if (!panel) { try { console.warn('[admin-biz] 缺少 #tab-units 挂载点'); } catch (e) {} return; }
    renderUnitsPage(panel);
    loadUnits();
  }

  function renderUnitsPage(panel) {
    panel.innerHTML =
      '<div class="card" style="padding:16px 20px;margin-bottom:14px;">' +
        '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">' +
          '<b style="font-size:17px;color:var(--text,#62545B);">商品编码</b>' +
          '<span style="font-size:13px;color:var(--muted,#81717A);">每件手工品一个唯一编码（SYU-XXXXXX），扫码可查真伪与质检</span>' +
          '<button class="btn-save-tb" id="biz-u-new" style="margin-left:auto;">＋ 生成单件编码</button>' +
          '<button class="btn-mini" id="biz-u-bulk" style="padding:7px 16px;">批量生成</button>' +
          '<button class="btn-mini" id="biz-u-print" style="padding:7px 16px;">打印标签（当前列表）</button>' +
          '<button class="biz-chip" id="biz-u-print-sel" style="display:none;">打印标签（<span id="biz-u-seln">0</span> 张勾选）</button>' +
        '</div>' +
        '<div id="biz-u-filters" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;"></div>' +
        '<input id="biz-u-q" placeholder="搜索单件编码 / 型号编码 / 批次号" style="margin-top:10px;width:100%;max-width:360px;padding:8px 14px;font-size:14px;border:1.5px solid #FFD9E6;border-radius:12px;outline:none;font-family:inherit;color:var(--text,#62545B);background:#fff;box-sizing:border-box;">' +
      '</div>' +
      '<div id="biz-u-list"><p style="color:var(--muted,#81717A);text-align:center;padding:24px 0;">加载中…</p></div>';
    $('biz-u-new').addEventListener('click', function () { openUnitForm(1); });
    $('biz-u-print').addEventListener('click', function () {
      var rows = UNITS.list.filter(function (u) {
        if (UNITS.filter !== 'all' && u.qc_status !== UNITS.filter) return false;
        if (!UNITS.search) return true;
        return [u.unit_code, u.model_code, u.batch_code].some(function (v) { return String(v || '').toLowerCase().indexOf(UNITS.search) >= 0; });
      });
      if (!rows.length) { toast('当前列表没有可打印的编码'); return; }
      if (rows.length > 100) { toast('一次最多打印 100 张，请先用筛选缩小范围'); return; }
      printLabelsBatch(rows);
    });
    $('biz-u-bulk').addEventListener('click', function () { openUnitForm(null); });
    $('biz-u-print-sel').addEventListener('click', function () {
      var rows = UNITS.list.filter(function (u) { return UNITS.sel[u.id]; });
      if (!rows.length) { toast('先勾选要打印的编码'); return; }
      if (rows.length > 100) { toast('一次最多打印 100 张，请减少勾选'); return; }
      printLabelsBatch(rows);
    });
    $('biz-u-q').addEventListener('input', function () { UNITS.search = this.value.trim().toLowerCase(); renderUnitRows(); });
    renderUnitFilters();
  }

  function renderUnitFilters() {
    var box = $('biz-u-filters');
    if (!box) return;
    box.innerHTML = UNIT_FILTERS.map(function (f) {
      return '<button type="button" class="biz-chip' + (UNITS.filter === f.v ? ' on' : '') + '" data-f="' + f.v + '">' + CK + esc(f.label) + '</button>';
    }).join('');
    box.querySelectorAll('[data-f]').forEach(function (b) {
      b.addEventListener('click', function () { UNITS.filter = b.getAttribute('data-f'); renderUnitFilters(); renderUnitRows(); });
    });
  }

  function loadUnits() {
    api('shop_product_units?select=*&order=unit_code.desc&limit=500').then(function (r) { return r.json(); }).then(function (rows) {
      UNITS.list = Array.isArray(rows) ? rows : [];
      renderUnitRows();
    }).catch(function () {
      var box = $('biz-u-list');
      if (box) box.innerHTML = '<p style="color:var(--muted,#81717A);text-align:center;padding:24px 0;">编码列表加载失败，请刷新重试</p>';
    });
    api('products?select=id,name,price,image_url,tag&order=created_at.desc&limit=300').then(function (r) { return r.json(); }).then(function (rows) {
      UNITS.products = Array.isArray(rows) ? rows : [];
      UNITS.pmap = {};
      UNITS.products.forEach(function (p) { UNITS.pmap[p.id] = p; });
      renderUnitRows();
    }).catch(function () {});
    api('shop_orders?select=id,order_no,status&status=neq.deleted&order=created_at.desc&limit=200').then(function (r) { return r.json(); }).then(function (rows) { return window.YkOrderDel ? window.YkOrderDel.filter(rows) : rows; }).then(function (rows) {
      UNITS.orders = Array.isArray(rows) ? rows : [];
      UNITS.omap = {};
      UNITS.orders.forEach(function (o) { UNITS.omap[o.id] = o; });
      renderUnitRows();
    }).catch(function () {});
  }

  function renderUnitRows() {
    var box = $('biz-u-list');
    if (!box) return;
    var rows = UNITS.list.filter(function (u) {
      if (UNITS.filter !== 'all' && u.qc_status !== UNITS.filter) return false;
      if (!UNITS.search) return true;
      return [u.unit_code, u.model_code, u.batch_code].some(function (v) { return String(v || '').toLowerCase().indexOf(UNITS.search) >= 0; });
    });
    if (!rows.length) {
      box.innerHTML = '<p style="color:var(--muted,#81717A);text-align:center;padding:24px 0;">' +
        (UNITS.list.length ? '没有符合筛选条件的编码，换个筛选或关键词试试' : '还没有单件编码，点右上角「生成单件编码」给第一批作品发编号吧') + '</p>';
      return;
    }
    box.innerHTML = rows.map(function (u) {
      var p = u.product_id ? UNITS.pmap[u.product_id] : null;
      var o = u.order_id ? UNITS.omap[u.order_id] : null;
      return '<div class="card" style="padding:10px 14px;margin-bottom:10px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;">' +
        '<button type="button" class="biz-uchk'+(UNITS.sel[u.id]?' on':'')+'" data-chk="'+escAttr(u.id)+'" title="勾选后可批量打印标签" aria-label="勾选 '+escAttr(u.unit_code||'')+'">'+(UNITS.sel[u.id]?UCHK:'')+'</button>' +
        (p && p.image_url
          ? '<img src="' + escAttr(p.image_url) + '" alt="" style="width:60px;height:60px;object-fit:cover;border-radius:12px;flex:none;">'
          : '<span style="width:60px;height:60px;border-radius:12px;background:var(--accent-soft,#FCE4EC);display:inline-flex;align-items:center;justify-content:center;color:#D9A7C7;font-size:11px;flex:none;">无图</span>') +
        '<div style="min-width:120px;">' +
          '<b style="font-size:16px;color:var(--price,#ff6fa5);cursor:pointer;" data-act="unit" data-id="' + escAttr(u.id) + '">' + esc(u.unit_code || '') + '</b>' +
          '<div style="font-size:13px;color:var(--text,#62545B);margin-top:2px;">' + esc(p ? p.name : (u.model_code || '未关联商品')) + '</div>' +
        '</div>' +
        '<span style="font-size:13px;color:var(--muted,#81717A);">批次 ' + esc(u.batch_code || '—') + '</span>' +
        '<span style="font-size:13px;color:var(--muted,#81717A);">制作 ' + esc(u.made_at || '—') + '</span>' +
        qcBadge(u.qc_status) +
        '<span style="margin-left:auto;font-size:13px;color:var(--muted,#81717A);">' + (o ? '订单 ' + esc(o.order_no) : '未关联订单') + '</span>' +
        '<button type="button" class="btn-mini" data-act="viewcode" data-id="'+escAttr(u.id)+'" style="padding:5px 12px;font-size:13px;">查看条码</button>' +
      '</div>';
    }).join('');
    box.querySelectorAll('[data-chk]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-chk');
        if (UNITS.sel[id]) delete UNITS.sel[id]; else UNITS.sel[id] = true;
        b.classList.toggle('on', !!UNITS.sel[id]);
        b.innerHTML = UNITS.sel[id] ? UCHK : '';
        updatePrintSel();
      });
    });
    box.querySelectorAll('[data-act="viewcode"]').forEach(function (b) {
      b.addEventListener('click', function () {
        var u = UNITS.list.filter(function (x) { return x.id === b.getAttribute('data-id'); })[0];
        if (u) openCodeModal(u);
      });
    });
    box.querySelectorAll('[data-act="unit"]').forEach(function (b) {
      b.addEventListener('click', function () {
        var u = UNITS.list.filter(function (x) { return x.id === b.getAttribute('data-id'); })[0];
        if (u) openUnitDetail(u);
      });
    });
  }

  /* 勾选计数条：勾选后顶部出现「打印标签（N 张勾选）」 */
  function updatePrintSel() {
    var n = Object.keys(UNITS.sel).length;
    var btn = $('biz-u-print-sel'), nEl = $('biz-u-seln');
    if (btn) btn.style.display = n ? 'inline-flex' : 'none';
    if (nEl) nEl.textContent = n;
  }

  /* 单件条码弹窗：只展示这一件自己创建的码（大图 + 单张打印），不带其他编码 */
  function openCodeModal(u) {
    var p = u.product_id ? UNITS.pmap[u.product_id] : null;
    var mask = document.createElement('div');
    mask.id = 'biz-mask';
    mask.innerHTML =
      '<div class="biz-modal" style="max-width:420px;text-align:center;">' +
        '<b style="font-size:16px;color:var(--text,#62545B);">单件条码</b>' +
        '<div style="margin:14px auto 8px;max-width:320px;background:#fff;border:1.5px dashed #F8BBD0;border-radius:16px;padding:16px;">' + barcodeSvg(u.unit_code || '', { height: 80 }) + '</div>' +
        '<div style="font-size:20px;font-weight:800;color:var(--price,#ff6fa5);letter-spacing:1px;">' + esc(u.unit_code || '') + '</div>' +
        '<div style="font-size:14px;color:var(--muted,#81717A);margin-top:4px;">' + esc(p ? p.name : (u.model_code || '未关联商品')) + '</div>' +
        '<div style="display:flex;gap:8px;justify-content:center;margin-top:16px;flex-wrap:wrap;">' +
          '<button type="button" class="btn-save-tb" id="biz-cm-print">打印此标签</button>' +
          '<button type="button" class="btn-mini" id="biz-cm-close" style="padding:7px 18px;">关闭</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(mask);
    var close = function () { if (mask.parentNode) mask.parentNode.removeChild(mask); document.removeEventListener('keydown', onKey); };
    var onKey = function (e) { if (e.key === 'Escape') close(); };
    mask.addEventListener('click', function (e) { if (e.target === mask) close(); });
    document.addEventListener('keydown', onKey);
    $('biz-cm-close').addEventListener('click', close);
    $('biz-cm-print').addEventListener('click', function () { printLabel(u, p); });
  }

  /* ── 生成表单（单件 / 批量共用；连续生成版：生成完不关弹窗，可「继续生成」接着做，她 20261026t 任务书 §二）── */
  function openUnitForm(presetN) {
    var today = ymd();
    var isBulk = !(presetN >= 1);
    var mask = bizModal(
      '<b style="font-size:17px;color:var(--text,#62545B);">' + (isBulk ? '批量生成编码' : '生成单件编码') + '</b>' +
      '<div style="font-size:12px;color:var(--muted,#81717A);margin-top:2px;">' + (isBulk ? '一次生成多件，共用型号/批次，编号按次序连续发放' : '一件一个编码；生成后不关弹窗，可点「继续生成」接着做下一件') + '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px 12px;margin-top:12px;">' +
        '<label style="font-size:13px;color:var(--muted,#81717A);grid-column:1 / -1;">关联商品（可选，选了会带出商品图和质检关联）' +
          '<button type="button" class="biz-in" id="biz-uf-prod" style="width:100%;text-align:left;cursor:pointer;margin-top:4px;">不关联商品</button></label>' +
        '<label style="font-size:13px;color:var(--muted,#81717A);">型号编码 *<input id="biz-uf-model" class="biz-in" style="width:100%;margin-top:4px;" placeholder="如 Bunny Keycap V2"></label>' +
        '<label style="font-size:13px;color:var(--muted,#81717A);">批次号 *<input id="biz-uf-batch" class="biz-in" style="width:100%;margin-top:4px;" value="B' + ymdCompact() + '-01"></label>' +
        '<label style="font-size:13px;color:var(--muted,#81717A);">数量 N *<input id="biz-uf-n" class="biz-in" type="text" inputmode="numeric" style="width:100%;margin-top:4px;" value="' + (presetN || '') + '" placeholder="1"></label>' +
        '<label style="font-size:13px;color:var(--muted,#81717A);">制作日期<input id="biz-uf-made" class="biz-in" type="date" style="width:100%;margin-top:4px;" value="' + today + '"></label>' +
        '<label style="font-size:13px;color:var(--muted,#81717A);grid-column:1 / -1;">关联订单（可选，输入订单号搜索）' +
          '<input id="biz-uf-order" class="biz-in" style="width:100%;margin-top:4px;" placeholder="点这里搜索订单号，留空不关联" autocomplete="off"></label>' +
        '<label style="font-size:13px;color:var(--muted,#81717A);grid-column:1 / -1;">备注<input id="biz-uf-note" class="biz-in" style="width:100%;margin-top:4px;" placeholder="选填"></label>' +
      '</div>' +
      '<div id="biz-uf-result" style="display:none;margin-top:12px;max-height:190px;overflow-y:auto;"></div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">' +
        '<button class="btn-mini" id="biz-uf-cancel" style="padding:8px 16px;">取消</button>' +
        '<button class="btn-save-tb" id="biz-uf-ok">生成编码</button>' +
        '<button class="btn-mini" id="biz-uf-again" style="padding:8px 16px;display:none;">继续生成</button>' +
        '<button class="btn-save-tb" id="biz-uf-done" style="padding:8px 16px;display:none;">完成</button>' +
      '</div>'
    );
    var st = { productId: '', orderId: '', orderNo: '', pending: false };
    var okBtn = mask.querySelector('#biz-uf-ok');
    var resBox = mask.querySelector('#biz-uf-result');
    mask.querySelector('#biz-uf-prod').addEventListener('click', function () {
      var btn = this;
      bizPop(btn, [{ v: '', label: '不关联商品' }].concat(UNITS.products.map(function (p) {
        return { v: p.id, label: p.name, sub: p.price != null && p.price !== '' ? '$' + p.price : '' };
      })), st.productId, function (v) {
        st.productId = v;
        var p = UNITS.pmap[v];
        btn.textContent = p ? p.name : '不关联商品';
        if (p && p.name) mask.querySelector('#biz-uf-model').value = p.name; // 商品表没有独立型号字段，用商品名带出、可手改
      });
    });
    var orderIn = mask.querySelector('#biz-uf-order');
    orderIn.addEventListener('input', function () {
      var q = this.value.trim().toLowerCase();
      st.orderId = ''; st.orderNo = '';
      if (!q) { bizPopClose(); return; }
      var hits = UNITS.orders.filter(function (o) { return String(o.order_no || '').toLowerCase().indexOf(q) >= 0; }).slice(0, 8);
      if (!hits.length) { bizPopClose(); return; }
      bizPop(orderIn, hits.map(function (o) { return { v: o.id, label: o.order_no, sub: ORDER_STATUS[o.status] || o.status }; }), '', function (v) {
        var o = UNITS.orders.filter(function (x) { return x.id === v; })[0];
        st.orderId = v; st.orderNo = o ? o.order_no : '';
        orderIn.value = st.orderNo;
        bizPopClose();
      });
    });
    // 校验失败：具体说明哪个字段有问题，并标红该输入框（她 20261026t 任务书 §二）
    function badField(sel, msg) {
      var el = mask.querySelector(sel);
      el.style.borderColor = '#D96570';
      el.focus();
      toast(msg);
      setTimeout(function () { el.style.borderColor = ''; }, 2200);
    }
    mask.querySelector('#biz-uf-cancel').addEventListener('click', bizCloseModal); // 编码即时入库，取消/关闭都不会删掉已保存的编码
    mask.querySelector('#biz-uf-again').addEventListener('click', function () {
      resBox.innerHTML = ''; resBox.style.display = 'none';
      mask.querySelector('#biz-uf-again').style.display = 'none';
      mask.querySelector('#biz-uf-done').style.display = 'none';
      mask.querySelector('#biz-uf-cancel').style.display = '';
      okBtn.style.display = '';
      mask.querySelector('#biz-uf-n').value = isBulk ? '' : '1';
      mask.querySelector('#biz-uf-n').focus();
    });
    mask.querySelector('#biz-uf-done').addEventListener('click', function () {
      bizCloseModal();
      loadUnits();
    });
    okBtn.addEventListener('click', function () {
      if (st.pending) return; // 请求处理中拦截重复提交，防止重复编码
      var model = mask.querySelector('#biz-uf-model').value.trim();
      var batch = mask.querySelector('#biz-uf-batch').value.trim();
      var nRaw = mask.querySelector('#biz-uf-n').value.trim();
      var n = Math.max(1, Math.round(num(nRaw) || 1));
      var made = mask.querySelector('#biz-uf-made').value || '';
      var note = mask.querySelector('#biz-uf-note').value.trim();
      if (!model) { badField('#biz-uf-model', '「型号编码」还没填'); return; }
      if (!batch) { badField('#biz-uf-batch', '「批次号」还没填'); return; }
      if (nRaw && (!/^\d+$/.test(nRaw) || parseInt(nRaw, 10) < 1)) { badField('#biz-uf-n', '「数量 N」要是不小于 1 的整数'); return; }
      var run = function () {
        st.pending = true;
        okBtn.disabled = true; okBtn.textContent = '生成中…';
        resBox.style.display = 'block';
        var done = 0, fail = 0, i = 0;
        // 顺序循环：SYU 编码按调用次序发放，保证同一批里号码连续
        function next() {
          if (i >= n) {
            st.pending = false;
            okBtn.disabled = false; okBtn.textContent = '生成编码';
            okBtn.style.display = 'none';
            mask.querySelector('#biz-uf-cancel').style.display = 'none';
            mask.querySelector('#biz-uf-again').style.display = '';
            mask.querySelector('#biz-uf-done').style.display = '';
            var summary = '<div style="font-size:14px;color:#5FA777;font-weight:600;">✓ 已生成 ' + done + ' / ' + n + ' 个编码（批次 ' + esc(batch) + (st.orderNo ? ' · 订单 ' + esc(st.orderNo) : '') + '）</div>' +
              '<div style="font-size:12px;color:var(--muted,#81717A);margin-top:2px;">条形码为 CODE128，扫码枪可直接读取；编号已即时保存</div>' +
              '<div style="margin-top:8px;display:grid;grid-template-columns:1fr 1fr;gap:8px;">';
            var old = resBox.innerHTML;
            resBox.innerHTML = summary + old + '</div>';
            if (fail) toast('成功 ' + done + ' / ' + n + ' 个，' + fail + ' 个失败，请刷新后重试');
            else toast('已生成 ' + done + ' 个编码（' + batch + '）');
            loadUnits();
            return;
          }
          i++;
          api('rpc/shop_unit_create', {
            method: 'POST', headers: { 'Prefer': 'params=single-object' },
            body: JSON.stringify({ p_model_code: model, p_batch_code: batch, p_product_id: st.productId || null, p_order_id: st.orderId || null, p_made_at: made || null, p_note: note || '' })
          }).then(function (res) {
            if (!res.ok) throw new Error();
            return res.json();
          }).then(function (d) {
            var code = d && d.unit_code ? d.unit_code : (Array.isArray(d) && d[0] && d[0].unit_code) || '';
            done++;
            if (code) {
              var div = document.createElement('div');
              div.style.cssText = 'border:1px solid var(--card-hover);border-radius:10px;padding:8px 10px;background:#fff;';
              div.innerHTML = '<div style="font-size:15px;font-weight:700;color:var(--price,#ff6fa5);">' + esc(code) + '</div>' +
                '<div style="max-width:250px;margin-top:4px;">' + barcodeSvg(code, { height: 44 }) + '</div>';
              resBox.appendChild(div);
            }
            next();
          }).catch(function () { fail++; next(); });
        }
        next();
      };
      if (isBulk) {
        uiConfirm('确认为「' + model + '」批次「' + batch + '」生成 ' + n + ' 个单件编码？' + (st.orderNo ? '\n关联订单：' + st.orderNo : ''), run, '生成');
      } else {
        run();
      }
    });
  }

  /* ── 单件详情卡 ── */
  function openUnitDetail(u) {
    var p = u.product_id ? UNITS.pmap[u.product_id] : null;
    var o = u.order_id ? UNITS.omap[u.order_id] : null;
    bizModal(
      '<b style="font-size:20px;color:var(--price,#ff6fa5);">' + esc(u.unit_code || '') + '</b>' +
      qcBadge(u.qc_status) +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 14px;margin-top:12px;font-size:14px;color:var(--text,#62545B);">' +
        '<span>商品：' + esc(p ? p.name : '未关联') + (p && p.price != null && p.price !== '' ? '（$' + esc(p.price) + '）' : '') + '</span>' +
        '<span>型号编码：' + esc(u.model_code || '—') + '</span>' +
        '<span>批次：' + esc(u.batch_code || '—') + '</span>' +
        '<span>制作日期：' + esc(u.made_at || '—') + '</span>' +
        '<span>关联订单：' + esc(o ? o.order_no : '无') + '</span>' +
        '<span>创建时间：' + esc(fmtDT(u.created_at)) + '</span>' +
        '<span style="grid-column:1 / -1;">备注：' + esc(u.note || '—') + '</span>' +
      '</div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">' +
        '<button class="btn-mini" id="biz-ud-close" style="padding:8px 16px;">关闭</button>' +
        '<button class="btn-save-tb" id="biz-ud-print">打印标签（条形码）</button>' +
      '</div>'
    );
    $('biz-ud-close').addEventListener('click', bizCloseModal);
    // 重新打印标签必须用原 unit_code：打印按钮挂在单件自己的详情卡里，编码永远取自这条数据库记录
    //（u.unit_code 由列表数据带入），不存在“重新生成编号”的路径——重复打印不会产生新码，unit_code 唯一约束也天然防重。
    $('biz-ud-print').addEventListener('click', function () { printLabel(u, p); });
  }

  // Code128 条形码 SVG（JsBarcode v3.11.6，MIT，本地 vendor）：扫码枪可直接读取，矢量打印更清晰
  //（她 20261026t 任务书 §一：编码标签用真条形码，不再用二维码）
  function barcodeSvg(code, opts) {
    var o = opts || {};
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    try {
      window.JsBarcode(svg, String(code || ''), {
        format: 'CODE128',
        width: o.width || 2,
        height: o.height || 56,
        margin: o.margin != null ? o.margin : 6,
        displayValue: true, // 条形码下方直接印可读编码
        font: 'monospace',
        fontSize: 13,
        textMargin: 2,
        background: '#ffffff',
        lineColor: '#1c1c1e'
      });
      var w = parseFloat(svg.getAttribute('width')), h = parseFloat(svg.getAttribute('height'));
      if (w && h) {
        svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        svg.removeAttribute('width'); svg.removeAttribute('height');
        svg.style.width = '100%'; svg.style.height = 'auto'; svg.style.display = 'block';
      }
      return svg.outerHTML;
    } catch (e) {
      return '<div style="color:#D96570;font-size:12px;">条形码生成失败</div>';
    }
  }
  // 标签文字区：商品名称 + 商品种类 + 单件编码（必显），型号 SKU / 批次（有则显示），与记录一一对应
  function labelHtml(u, p, big) {
    return '<div class="label">' +
      '<div class="bcode">' + barcodeSvg(u.unit_code || '') + '</div>' +
      '<div class="txt">' +
        '<div class="pname">' + esc(p ? p.name : (u.model_code || '未关联商品')) + '</div>' +
        (p && p.tag ? '<div class="meta">商品种类：' + esc(p.tag) + '</div>' : '') +
        '<div class="ucode">' + esc(u.unit_code || '') + '</div>' +
        (u.model_code ? '<div class="meta">型号 SKU：' + esc(u.model_code) + '</div>' : '') +
        (u.batch_code ? '<div class="meta">批次：' + esc(u.batch_code) + '</div>' : '') +
      '</div>' +
    '</div>';
  }
  function printLabel(u, p) {
    var w = window.open('', '_blank');
    if (!w) { toast('浏览器拦截了新窗口，请允许弹窗后重试'); return; }
    // 二维码内容：前台扫码验货页的绝对 URL，带单件原编码
    var html = [
      '<!doctype html><html><head><meta charset="utf-8"><title>标签 ' + esc(u.unit_code) + '</title><style>',
      '*{box-sizing:border-box;}',
      "body{font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;background:#FFF9FB;margin:0;padding:24px;display:flex;flex-direction:column;align-items:center;gap:14px;}",
      '.label{width:420px;background:#fff;border:1.5px dashed #F8BBD0;border-radius:16px;padding:18px;display:flex;gap:16px;align-items:center;text-align:left;}',
      '.brand{font-size:20px;font-weight:800;color:#A98D96;letter-spacing:1px;text-align:center;flex:none;width:100%;}',
      '.pname{font-size:16px;color:#62545B;font-weight:600;line-height:1.4;}',
      '.ucode{font-size:20px;font-weight:800;color:#ff6fa5;margin-top:4px;letter-spacing:1px;}',
      '.meta{font-size:12px;color:#81717A;margin-top:4px;line-height:1.7;}',
      '.label .bcode{width:240px;flex:none;}.label .bcode svg{width:100%;height:auto;display:block;}',
      '.label .txt{flex:1;min-width:0;}',
      '.foot{font-size:10px;color:#D9A7C7;margin-top:8px;}',
      '.noprint{border:none;background:#ffd9e6;color:var(--text,#62545B);font-size:15px;padding:9px 26px;border-radius:999px;cursor:pointer;font-family:inherit;}',
      '@media print{body{background:#fff;padding:0;} .noprint{display:none !important;} .label{border:1.5px solid #eee;}}',
      '</style></head><body>',
      '<div class="brand">Snow Yuzu<small>SNOW YUZU STUDIO</small></div>',
      labelHtml(u, p, true),
      '<div class="foot">条形码（CODE128）可被扫码枪直接读取；编码印在条码下方</div>',
      '<button class="noprint" onclick="window.print()">打印标签</button>',
      '</body></html>'
    ].join('\n');
    w.document.write(html);
    w.document.close();
  }

  // 批量打印标签：普通家用打印机 A4 / Letter 均可，2 列 × 4 行每页 8 张，打印后沿线剪下
  function printLabelsBatch(rows) {
    var w = window.open('', '_blank');
    if (!w) { toast('浏览器拦截了新窗口，请允许弹窗后重试'); return; }
    var labels = rows.map(function (u) { return labelHtml(u, u.product_id ? UNITS.pmap[u.product_id] : null, false); }).join('');
    var write = function (paper) {
      var size = paper === 'LETTER' ? 'letter' : 'A4';
      w.document.open();
      w.document.write([
        '<!doctype html><html><head><meta charset="utf-8"><title>批量标签（' + rows.length + ' 张 · ' + size + '）</title><style>',
        '*{box-sizing:border-box;}',
        "body{font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;margin:0;padding:10mm;background:#fff;}",
        '@page{size:' + size + ';margin:8mm;}',
        '.sheet{display:flex;flex-wrap:wrap;gap:4mm;align-content:flex-start;}',
        '.label{width:88mm;height:54mm;border:1px dashed #bbb;border-radius:3mm;padding:4mm;display:flex;gap:4mm;align-items:center;break-inside:avoid;page-break-inside:avoid;background:#fff;}',
        '.label .bcode{width:52mm;flex:none;}.label .bcode svg{width:100%;height:auto;display:block;}',
        '.label .txt{flex:1;min-width:0;overflow:hidden;}',
        '.label .pname{font-size:13px;font-weight:700;color:#62545B;line-height:1.35;}',
        '.label .ucode{font-size:16px;font-weight:800;color:#ff6fa5;letter-spacing:.5px;margin-top:1.5mm;}',
        '.label .meta{font-size:10px;color:#81717A;line-height:1.5;margin-top:1mm;}',
        '.noprint{margin:0 8px 14px 0;border:none;background:#ffd9e6;color:#62545B;font-size:15px;padding:9px 22px;border-radius:999px;cursor:pointer;font-family:inherit;}',
        '@media print{.noprint{display:none !important;}body{padding:0;}.label{border:1px solid #ddd;}}',
        '</style></head><body>',
        '<div class="noprint-wrap"><button class="noprint" onclick="window.print()">打印（' + size + '）</button>',
        '<button class="noprint" onclick="window.switchPaper(\'A4\')">切 A4</button>',
        '<button class="noprint" onclick="window.switchPaper(\'LETTER\')">切 Letter</button>',
        '<span style="font-size:12px;color:#81717A;">每页 8 张（2×4），普通纸打印后沿线剪开即可；条形码矢量清晰，扫码枪直接读取，编码印在条码下方</span></div>',
        '<div class="sheet">' + labels + '</div>',
        '<scr' + 'ipt>function switchPaper(p){window.PAPER=p;window.build();}</scr' + 'ipt>',
        '</body></html>'
      ].join('\n'));
      w.document.close();
    };
    w.PAPER = 'A4';
    w.build = function () { write(w.PAPER || 'A4'); };
    w.build();
  }

  /* ══════════════════════════════════════════════════════════════
     模块三：扫码验货（bootQcscan → #tab-qcscan）
     ══════════════════════════════════════════════════════════════ */
  var QC = { code: '', unit: null, product: null, tpls: [], entry: null, camStream: null, camOn: false };

  function bootQcscan() {
    var panel = $('tab-qcscan');
    if (!panel) { try { console.warn('[admin-biz] 缺少 #tab-qcscan 挂载点'); } catch (e) {} return; }
    stopCam(); // 切页回来先关掉旧摄像头，避免流泄漏
    renderQcPage(panel);
  }

  function renderQcPage(panel) {
    panel.innerHTML =
      '<div class="card" style="padding:16px 20px;margin-bottom:14px;">' +
        '<b style="font-size:17px;color:var(--text,#62545B);">扫码验货</b>' +
        '<span style="font-size:13px;color:var(--muted,#81717A);margin-left:8px;">输入或扫入单件编码（SYU-XXXXXX），查真伪、看质检、录结果</span>' +
        '<div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap;">' +
          '<input id="biz-q-in" placeholder="单件编码，如 SYU-000001；扫码枪直接扫即可" ' +
            'style="flex:1;min-width:220px;padding:12px 18px;font-size:17px;letter-spacing:1px;border:2px solid #FFD9E6;border-radius:14px;outline:none;font-family:inherit;color:var(--text,#62545B);background:#fff;box-sizing:border-box;">' +
          '<button class="btn-save-tb" id="biz-q-go">查询</button>' +
          '<button class="btn-mini" id="biz-q-cam" style="padding:10px 18px;">开启摄像头扫描</button>' +
          '<button class="btn-mini" id="biz-q-camstop" style="padding:10px 18px;display:none;">停止扫描</button>' +
          '<button class="btn-mini" id="biz-q-camflip" style="padding:10px 18px;display:none;">切换镜头</button>' +
        '</div>' +
        '<div id="biz-cam-box" style="display:none;margin-top:12px;">' +
          '<video autoplay playsinline muted></video>' +
          '<p style="font-size:13px;color:var(--muted,#81717A);text-align:center;margin:6px 0 0;">对准标签上的二维码，识别到会自动查询</p>' +
        '</div>' +
        '<p id="biz-q-hint" style="font-size:13px;color:var(--muted,#81717A);margin:8px 0 0;">USB 扫码枪：点一下输入框后直接扫，枪会自动回车提交。</p>' +
      '</div>' +
      '<div id="biz-q-result"><p style="color:var(--muted,#81717A);text-align:center;padding:24px 0;">还没有查询，输入编码或扫码开始</p></div>';
    var input = $('biz-q-in');
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') doQcQuery(input.value); }); // 兼容 USB 扫码枪（扫完自动发 Enter）
    $('biz-q-go').addEventListener('click', function () { doQcQuery(input.value); });
    $('biz-q-cam').addEventListener('click', startCam);
    $('biz-q-camstop').addEventListener('click', stopCam);
    $('biz-q-camflip').addEventListener('click', function () { QC.facing = (QC.facing === 'environment') ? 'user' : 'environment'; startCam(); });
    if (QC.code) { input.value = QC.code; doQcQuery(QC.code); } // 从打印标签链接 #qcscan?code=SYU-… 跳进来时自动查
  }

  function camButtons(on) {
    var b1 = $('biz-q-cam'), b2 = $('biz-q-camstop'), b3 = $('biz-q-camflip');
    if (b1) b1.style.display = on ? 'none' : '';
    if (b2) b2.style.display = on ? '' : 'none';
    if (b3) b3.style.display = on ? '' : 'none';
  }
  // 识别到码 → 解析出单件编码（标签二维码是完整链接，取 code 参数；裸编码兼容）
  function handleCamCode(raw) {
    raw = String(raw || '').trim();
    stopCam();
    var mCode = raw.match(/[?&]code=([^&\s]+)/);
    var code = mCode ? decodeURIComponent(mCode[1]) : raw;
    var input = $('biz-q-in');
    if (input) input.value = code;
    doQcQuery(code);
  }
  function startCam() {
    var hint = $('biz-q-hint');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (hint) hint.textContent = '当前环境无法访问摄像头（需 HTTPS），请手动输入或用扫码枪。';
      toast('无法访问摄像头，请手动输入或用扫码枪');
      return;
    }
    // 有 BarcodeDetector 用原生（Android Chrome 最快）；没有则用本地 jsQR 逐帧识别（iPhone Safari / Firefox 等），MIT 协议
    var useNative = 'BarcodeDetector' in window;
    if (!useNative && !window.jsQR) {
      if (hint) hint.textContent = '本地识别库还没加载好，请刷新页面再试；或直接手动输入 / 用扫码枪。';
      toast('识别库未加载，请刷新重试');
      return;
    }
    if (QC.camStream) stopCam(); // 切换镜头 / 重复点击先关旧流
    var facing = QC.facing || 'environment';
    navigator.mediaDevices.getUserMedia({ video: { facingMode: facing } }).then(function (stream) {
      QC.camStream = stream; QC.camOn = true;
      var box = $('biz-cam-box');
      if (!box) { stopCam(); return; }
      box.style.display = 'block';
      camButtons(true);
      if (hint) hint.textContent = '正在扫描（' + (facing === 'environment' ? '后置' : '前置') + '镜头）· 识别到二维码会自动查询';
      var video = box.querySelector('video');
      video.srcObject = stream;
      var detector = useNative ? new window.BarcodeDetector() : null;
      var canvas = document.createElement('canvas');
      var ctx = canvas.getContext('2d', { willReadFrequently: true });
      var busy = false;
      (function tick() {
        if (!QC.camOn) return;
        if (useNative) {
          detector.detect(video).then(function (codes) {
            if (!QC.camOn) return;
            if (codes && codes.length && codes[0].rawValue) { handleCamCode(codes[0].rawValue); return; }
            requestAnimationFrame(tick);
          }).catch(function () { if (QC.camOn) requestAnimationFrame(tick); });
          return;
        }
        if (busy) { requestAnimationFrame(tick); return; }
        if (!video.videoWidth) { requestAnimationFrame(tick); return; }
        busy = true;
        var w = 480, h = Math.round(video.videoHeight / video.videoWidth * 480) || 360;
        canvas.width = w; canvas.height = h;
        ctx.drawImage(video, 0, 0, w, h);
        var img = ctx.getImageData(0, 0, w, h);
        var found = null;
        try { found = window.jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' }); } catch (e) {}
        busy = false;
        if (QC.camOn && found && found.data) { handleCamCode(found.data); return; }
        requestAnimationFrame(tick);
      })();
    }).catch(function (err) {
      var name = (err && err.name) || '';
      var msg = name === 'NotAllowedError' ? '摄像头权限被拒绝：请在浏览器权限设置里允许摄像头后重试'
        : (name === 'NotFoundError' || name === 'OverconstrainedError') ? '没找到可用的摄像头，请手动输入或用扫码枪'
        : name === 'NotReadableError' ? '摄像头被其他程序占用，关掉后再试'
        : '摄像头打开失败，请检查权限，或手动输入 / 用扫码枪';
      toast(msg);
      if (hint) hint.textContent = msg + '。';
    });
  }
  function stopCam() {
    QC.camOn = false;
    if (QC.camStream) { try { QC.camStream.getTracks().forEach(function (tr) { tr.stop(); }); } catch (e) {} QC.camStream = null; }
    var box = $('biz-cam-box');
    if (box) { box.style.display = 'none'; var v = box.querySelector('video'); if (v) v.srcObject = null; }
    camButtons(false);
    var hint = $('biz-q-hint');
    if (hint && hint.textContent.indexOf('正在扫描') === 0) hint.textContent = 'USB 扫码枪：点一下输入框后直接扫，枪会自动回车提交。';
  }

  function doQcQuery(code) {
    code = String(code || '').trim().toUpperCase();
    if (!code) { toast('请输入单件编码'); return; }
    QC.code = code;
    var box = $('biz-q-result');
    if (box) box.innerHTML = '<p style="color:var(--muted,#81717A);text-align:center;padding:24px 0;">查询中…</p>';
    api('shop_product_units?unit_code=eq.' + encodeURIComponent(code) + '&select=*').then(function (r) { return r.json(); }).then(function (rows) {
      if (!rows || !rows.length) {
        QC.unit = null; QC.product = null; QC.entry = null;
        if (box) box.innerHTML =
          '<div class="card" style="padding:28px 20px;text-align:center;">' +
            '<p style="font-size:17px;color:var(--text,#62545B);font-weight:700;margin:0;">编码不存在</p>' +
            '<p style="font-size:14px;color:var(--muted,#81717A);margin:8px 0 0;">没查到「' + esc(code) + '」，请确认编码是否抄对，或先到「商品编码」页生成。</p>' +
          '</div>';
        return;
      }
      QC.unit = rows[0];
      if (!QC.entryFor || QC.entryFor !== rows[0].id) { QC.entry = null; QC.entryFor = rows[0].id; } // 换了单件就重置录入现场
      loadQcDetail();
    }).catch(function () {
      if (box) box.innerHTML = '<p style="color:var(--muted,#81717A);text-align:center;padding:24px 0;">查询失败，请重试</p>';
    });
  }

  function loadQcDetail() {
    var u = QC.unit;
    var jobs = [];
    // 商品（显式列名：products 的表级 SELECT 已撤销，select=* 会报 permission denied）
    jobs.push(api(u.product_id ? 'products?id=eq.' + u.product_id + '&select=id,name,price,stock,image_url,tag,description' : 'products?id=eq.00000000-0000-0000-0000-000000000000&select=id')
      .then(function (r) { return r.json(); }).then(function (rows) { QC.product = (rows && rows[0]) || null; }).catch(function () { QC.product = null; }));
    jobs.push(api('shop_qc_templates?select=*&order=updated_at.desc').then(function (r) { return r.json(); }).then(function (rows) { QC.tpls = Array.isArray(rows) ? rows : []; }).catch(function () { QC.tpls = []; }));
    jobs.push(api('shop_qc_records?unit_id=eq.' + u.id + '&select=*&order=created_at.desc')
      .then(function (r) { return r.json(); }).then(function (rows) { QC.records = Array.isArray(rows) ? rows : []; }).catch(function () { QC.records = []; }));
    QC.order = null; QC.packages = [];
    if (u.order_id) {
      jobs.push(api('shop_orders?id=eq.' + u.order_id + '&select=id,order_no,status,carrier,tracking')
        .then(function (r) { return r.json(); }).then(function (rows) { QC.order = (rows && rows[0]) || null; }).catch(function () { QC.order = null; }));
      jobs.push(api('shop_packages?order_id=eq.' + u.order_id + '&select=*')
        .then(function (r) { return r.json(); }).then(function (rows) { QC.packages = Array.isArray(rows) ? rows : []; }).catch(function () { QC.packages = []; }));
    }
    Promise.all(jobs).then(function () { renderQcResult(); }).catch(function () {
      var box = $('biz-q-result');
      if (box) box.innerHTML = '<p style="color:var(--muted,#81717A);text-align:center;padding:24px 0;">详情加载失败，请重试</p>';
    });
  }

  /* 质检模板匹配：优先商品的 item_type（未来字段），否则用型号编码匹配模板的 item_type；
     都对不上就视为「没有关联模板」，质检录入降级为手动加检查项。 */
  function matchTpl() {
    var u = QC.unit, p = QC.product;
    var key = (p && p.item_type) || u.model_code || '';
    return QC.tpls.filter(function (x) { return x.item_type === key; })[0] || null;
  }

  function renderQcResult() {
    var box = $('biz-q-result');
    if (!box || !QC.unit) return;
    var u = QC.unit, p = QC.product;
    var o = QC.order;
    var pkgLines = (QC.packages || []).map(function (pk) {
      return '<div style="font-size:13.5px;color:var(--text,#62545B);padding:2px 0;">包裹：' + esc(pk.carrier || '—') + ' · ' + esc(pk.tracking || '未填单号') +
        (pk.shipped_at ? ' · 已发出 ' + esc(fmtDT(pk.shipped_at)) : ' · 未发出') + '</div>';
    }).join('');

    var headHtml =
      '<div class="card" style="padding:16px 20px;margin-bottom:12px;">' +
        '<div style="display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap;">' +
          (p && p.image_url
            ? '<img src="' + escAttr(p.image_url) + '" alt="" style="width:64px;height:64px;object-fit:cover;border-radius:14px;flex:none;">'
            : '') +
          '<div style="flex:1;min-width:200px;">' +
            '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">' +
              '<b style="font-size:19px;color:var(--price,#ff6fa5);">' + esc(u.unit_code || '') + '</b>' + qcBadge(u.qc_status) +
            '</div>' +
            '<div style="font-size:15px;color:var(--text,#62545B);margin-top:4px;">' + esc(p ? p.name : (u.model_code || '未关联商品')) +
              (p && p.price != null && p.price !== '' ? ' <span style="color:var(--muted,#81717A);font-size:13px;">$' + esc(p.price) + '</span>' : '') + '</div>' +
            '<div style="font-size:13.5px;color:var(--muted,#81717A);margin-top:4px;line-height:1.8;">' +
              '型号编码：' + esc(u.model_code || '—') + '　批次：' + esc(u.batch_code || '—') + '<br>' +
              '制作日期：' + esc(u.made_at || '—') + '　录入时间：' + esc(fmtDT(u.created_at)) +
              (u.note ? '<br>备注：' + esc(u.note) : '') +
            '</div>' +
          '</div>' +
        '</div>' +
        (o
          ? '<hr class="biz-hr"><div style="font-size:13.5px;color:var(--text,#62545B);line-height:1.8;">' +
              '关联订单：<b>' + esc(o.order_no) + '</b> · ' + esc(ORDER_STATUS[o.status] || o.status || '—') +
              (o.tracking ? '<br>主运单：' + esc(o.carrier || '—') + ' ' + esc(o.tracking) : '') +
            '</div>' +
            (pkgLines || '<div style="font-size:13px;color:var(--muted,#81717A);padding:2px 0;">暂无包裹记录（未打包 / 未发货）</div>')
          : '') +
      '</div>';

    /* 质检清单展示：模板逐项 + 历史记录 */
    var tpl = matchTpl();
    var recs = QC.records || [];
    var listHtml = '';
    if (tpl) {
      var items = tpl.items || [];
      listHtml = items.map(function (it) {
        var rec = recs.filter(function (r) { return r.item === it.name; })[0];
        var badge = rec ? qcBadge(rec.result) : (it.required ? '<span class="biz-badge" style="background:var(--danger,#d96570);">未检查</span>' : '<span style="font-size:12px;color:var(--muted,#81717A);">未检查</span>');
        return '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:5px 0;border-bottom:1px dashed var(--accent-soft,#FCE4EC);">' +
          '<span style="font-size:14px;color:var(--text,#62545B);min-width:130px;">' + esc(it.name) + (it.required ? ' <span style="color:var(--danger,#d96570);font-size:11px;">必检</span>' : '') + '</span>' +
          badge +
          '<span style="font-size:12.5px;color:var(--muted,#81717A);flex:1;min-width:120px;">' + esc(rec ? (rec.note || '') : '') + '</span>' +
          '<span style="font-size:12.5px;color:var(--muted,#81717A);">' + esc(rec ? (rec.inspector || '') : '') + '</span>' +
          '<span style="font-size:12.5px;color:var(--muted,#81717A);">' + esc(rec ? fmtDT(rec.created_at) : '') + '</span>' +
        '</div>';
      }).join('');
      // 模板外的历史记录也列出来
      recs.forEach(function (r) {
        if (items.some(function (it) { return it.name === r.item; })) return;
        listHtml += '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:5px 0;border-bottom:1px dashed var(--accent-soft,#FCE4EC);">' +
          '<span style="font-size:14px;color:var(--muted,#81717A);min-width:130px;">' + esc(r.item) + '</span>' + qcBadge(r.result) +
          '<span style="font-size:12.5px;color:var(--muted,#81717A);flex:1;">' + esc(r.note || '') + '</span>' +
          '<span style="font-size:12.5px;color:var(--muted,#81717A);">' + esc(r.inspector || '') + ' · ' + esc(fmtDT(r.created_at)) + '</span></div>';
      });
      listHtml = '<b style="font-size:15px;color:var(--text,#62545B);">质检清单（模板：' + esc(tpl.name) + '）</b>' +
        '<p style="font-size:12px;color:var(--muted,#81717A);margin:4px 0 6px;">同一项显示最近一次结果；标红「未检查」的必检项必须处理完才能提交</p>' + listHtml;
    } else {
      listHtml = '<b style="font-size:15px;color:var(--text,#62545B);">质检清单</b>' +
        '<p style="font-size:13px;color:var(--muted,#81717A);margin:4px 0 0;">没有找到关联的质检模板，可在下面手动加检查项录入。</p>';
    }

    /* 质检录入（无原生 select/checkbox：全 chip） */
    if (!QC.entry) {
      QC.entry = {
        items: (tpl && tpl.items ? tpl.items : []).map(function (it) {
          return { item: it.name, required: !!it.required, result: 'pending' };
        }),
        note: '', inspector: '', photo: ''
      };
    }
    var en = QC.entry;
    var RESULT_CHIPS = [{ v: 'pending', label: '待检查' }, { v: 'pass', label: '合格' }, { v: 'fail', label: '不合格' }, { v: 'na', label: '不适用' }];
    var entryHtml =
      '<div class="card" style="padding:16px 20px;margin-bottom:12px;">' +
        '<b style="font-size:15px;color:var(--text,#62545B);">质检录入</b>' +
        '<div id="biz-q-entry">' +
          en.items.map(function (it, i) {
            return '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:6px 0;">' +
              '<span style="font-size:14px;color:var(--text,#62545B);min-width:130px;">' + esc(it.item) + (it.required ? ' <span style="color:var(--danger,#d96570);font-size:11px;">必检</span>' : '') + '</span>' +
              RESULT_CHIPS.map(function (rc) {
                return '<button type="button" class="biz-chip' + (it.result === rc.v ? ' on' : '') + '" data-act="qcres" data-idx="' + i + '" data-v="' + rc.v + '">' + CK + esc(rc.label) + '</button>';
              }).join('') +
            '</div>';
          }).join('') +
          '<button type="button" class="btn-mini" data-act="qcadd" style="padding:4px 12px;font-size:13px;margin-top:4px;">+ 添加检查项</button>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px;">' +
          '<label style="font-size:13px;color:var(--muted,#81717A);">检查人<input id="biz-q-inspector" class="biz-in" style="width:100%;margin-top:4px;" value="' + escAttr(en.inspector) + '" placeholder="Yuzu"></label>' +
          '<label style="font-size:13px;color:var(--muted,#81717A);">照片 URL（手填）<input id="biz-q-photo" class="biz-in" style="width:100%;margin-top:4px;" value="' + escAttr(en.photo) + '" placeholder="https://…"></label>' +
          '<label style="font-size:13px;color:var(--muted,#81717A);grid-column:1 / -1;">备注<input id="biz-q-note" class="biz-in" style="width:100%;margin-top:4px;" value="' + escAttr(en.note) + '" placeholder="整体观感、小瑕疵位置…"></label>' +
        '</div>' +
        '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;flex-wrap:wrap;">' +
          '<button class="btn-save-tb" id="biz-q-submit">提交质检结果</button>' +
        '</div>' +
      '</div>';

    /* 异常处理动作：不合格（或历史有不合格）时给返工 / 隔离 chips */
    var hasFail = u.qc_status === 'fail' || recs.some(function (r) { return r.result === 'fail'; });
    var actHtml = hasFail
      ? '<div class="card" style="padding:14px 20px;margin-bottom:12px;">' +
          '<b style="font-size:15px;color:var(--text,#62545B);">异常处理</b>' +
          '<span style="font-size:13px;color:var(--muted,#81717A);margin-left:8px;">这件有不合格记录，确认下一步去向：</span>' +
          '<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;">' +
            '<button type="button" class="biz-chip" data-act="mark" data-v="rework">' + CK + '标记返工</button>' +
            '<button type="button" class="biz-chip" data-act="mark" data-v="quarantine">' + CK + '标记隔离</button>' +
          '</div>' +
        '</div>'
      : '';

    box.innerHTML = headHtml + '<div id="biz-q-listcard" class="card" style="padding:16px 20px;margin-bottom:12px;">' + listHtml + '</div>' + entryHtml + actHtml;
    bindQcResult();
  }

  function bindQcResult() {
    var box = $('biz-q-result');
    if (!box) return;
    if (box.dataset.bizBound) { var sub2 = $('biz-q-submit'); if (sub2) sub2.addEventListener('click', submitQc); return; }
    box.dataset.bizBound = '1';
    box.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-act]');
      if (!btn) return;
      var act = btn.getAttribute('data-act');
      var en = QC.entry;
      if (act === 'qcres') {
        var i = parseInt(btn.getAttribute('data-idx'), 10);
        en.items[i].result = btn.getAttribute('data-v');
        renderQcResult();
        return;
      }
      if (act === 'qcadd') {
        bizPop(btn, [{ v: '外观无气泡', label: '外观无气泡' }, { v: '尺寸核对', label: '尺寸核对' }, { v: '功能测试', label: '功能测试' }, { v: '包装完整', label: '包装完整' }, { v: '自定义项', label: '自定义项' }], '', function (v) {
          var name = v;
          if (v === '自定义项') { name = window.prompt('检查项名称：'); if (!name) return; }
          en.items.push({ item: name, required: false, result: 'pending' });
          renderQcResult();
        });
        return;
      }
      if (act === 'mark') {
        var v = btn.getAttribute('data-v');
        uiConfirm('确认把 ' + (QC.unit ? QC.unit.unit_code : '') + ' 标记为「' + (QC_LABEL[v] || v) + '」？', function () {
          api('shop_product_units?id=eq.' + QC.unit.id, {
            method: 'PATCH', headers: { 'Prefer': 'return=representation' },
            body: JSON.stringify({ qc_status: v, updated_at: new Date().toISOString() })
          }).then(function (r) {
            if (!r.ok) throw new Error();
            toast('已标记为「' + (QC_LABEL[v] || v) + '」');
            doQcQuery(QC.code);
          }).catch(function () { toast('标记失败，请重试'); });
        }, '确认');
        return;
      }
    }, { once: false });
    var sub = $('biz-q-submit');
    if (sub) sub.addEventListener('click', submitQc);
  }

  function submitQc() {
    var en = QC.entry, u = QC.unit;
    if (!en || !u) return;
    // 读取备注 / 检查人 / 照片（在弹层外所以直接取值）
    en.note = ($('biz-q-note') || {}).value || '';
    en.inspector = ($('biz-q-inspector') || {}).value || '';
    en.photo = ($('biz-q-photo') || {}).value || '';
    var pending = en.items.filter(function (it) { return it.required && it.result === 'pending'; });
    if (pending.length) {
      toast('必检项「' + pending[0].item + (pending.length > 1 ? '」等 ' + pending.length + ' 项' : '」') + '还没检查，不能提交合格结果');
      return;
    }
    if (!en.items.length) { toast('还没有检查项，先添加或选择模板'); return; }
    var records = en.items.map(function (it) {
      return { item: it.item, result: it.result, note: en.note || '', inspector: en.inspector || '', photo_url: en.photo || '' };
    });
    uiConfirm('确认提交 ' + records.length + ' 项质检结果？提交后单件状态由质检服务端判定。', function () {
      api('rpc/shop_qc_submit', {
        method: 'POST', headers: { 'Prefer': 'params=single-object' },
        body: JSON.stringify({ p_unit_id: u.id, p_records: records })
      }).then(function (r) { return r.json(); }).then(function (res) {
        var st = res && res.qc_status;
        toast('质检已提交，单件状态：' + (QC_LABEL[st] || st || '已更新'));
        doQcQuery(QC.code); // 重新查询显示新 qc_status 与清单
      }).catch(function () { toast('提交失败，请重试'); });
    }, '提交');
  }

  /* ═══════════ 注册（admin.html 切页处调用：BIZ.bootCost() / BIZ.bootUnits() / BIZ.bootQcscan()） ═══════════ */
  window.BIZ = { bootCost: bootCost, bootUnits: bootUnits, bootQcscan: bootQcscan, selfTest: selfTest };
})();
