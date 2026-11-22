/* ═══════════ 词库管理 + 商品表单智能识别（她 20261117 第二份任务书）
   自带鉴权（localStorage yuki-admin-session 的 access token / window.ACCESS），
   依赖 js/name-lexicon.js（NameLexicon 全局）。RLS：词库 site_settings 管理员写 */
(function () {
  'use strict';
  var LX = window.NameLexicon;
  if (!LX) return;
  var REST = (window.SUPABASE_URL || 'https://ukxrvcptwhlwvdanovgd.supabase.co') + '/rest/v1/';
  function token() {
    if (typeof window.ACCESS === 'string' && window.ACCESS) return window.ACCESS;
    try { var s = JSON.parse(localStorage.getItem('yuki-admin-session') || 'null'); return (s && s.a) ? s.a : null; } catch (e) { return null; }
  }
  function hdrs() {
    var at = token();
    return {
      'apikey': window.SUPABASE_ANON_KEY || (window.DB_HEADERS && window.DB_HEADERS.apikey) || '',
      'Authorization': 'Bearer ' + (at || ''),
      'Content-Type': 'application/json'
    };
  }
  function api(path, opts) {
    opts = opts || {};
    return fetch(REST + path, { method: opts.method || 'GET', headers: hdrs(), body: opts.body || undefined })
      .then(function (r) { return { ok: r.ok, status: r.status, json: function () { return r.json(); }, text: function () { return r.text(); } }; });
  }
  function toast(msg) {
    var el = document.getElementById('toast');
    if (el) { el.textContent = msg; el.classList.add('show'); setTimeout(function () { el.classList.remove('show'); }, 2200); }
    else console.log('[lexicon]', msg);
  }
  function escAttr(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

  /* ── 远端覆盖层加载 ── */
  var REMOTE_READY = false;
  function ensureRemote() {
    if (REMOTE_READY) return Promise.resolve();
    return LX.loadRemote(function (path) {
      return api(path).then(function (r) { return r.ok ? r.json() : []; });
    }).then(function () { REMOTE_READY = true; });
  }

  /* ═══ 词库管理页签 ═══ */
  var LX_TMP = null; // 本地编辑副本 {chars:[], types:[]}（保存后远端为准）
  var LX_FILTER = { q: '', ip: '' };
  function renderLexicon() {
    ensureRemote().then(function () {
      LX_TMP = { chars: LX.chars().map(function (c) { return { en: c.en || '', zh: c.zh || '', aliases: (c.aliases || []).slice(), ip: c.ip || 'Other', enabled: c.enabled !== false }; }),
                 types: LX.types().map(function (t) { return { zh: t.zh || '', en: t.en || '', aliases: (t.aliases || []).slice(), enabled: t.enabled !== false }; }) };
      paintLexicon();
      renderRecognitionAudit();
    });
  }
  function renderRecognitionAudit() {
    var box = document.getElementById('lx-audit');
    if (!box) return;
    api('products?select=id,name,name_en,name_raw,name_match,created_at&order=created_at.desc&limit=50').then(function (r) {
      if (!r.ok) throw new Error('识别记录字段不可读取');
      return r.json();
    }).then(function (rows) {
      if (!rows.length) { box.innerHTML = '<b>商品名称识别记录</b><p class="lx-head">还没有商品记录。</p>'; return; }
      box.innerHTML = '<b>商品名称识别记录（最近 50 件）</b><p class="lx-head">查看原始输入与标准化结果。</p>' + rows.map(function (p) {
        var m = p.name_match || {};
        var finalZh = p.name || m.titleZh || '—', finalEn = p.name_en || m.titleEn || '';
        var matched = m.charEn ? ' · 识别角色：' + m.charEn : '';
        return '<div class="lx-audit-row"><div><b>' + escAttr(p.name || '未命名商品') + '</b><small>原始输入：' + escAttr(p.name_raw || '未记录') + '</small></div><div><b>标准化</b><small>' + escAttr(finalZh) + (finalEn ? ' / ' + escAttr(finalEn) : '') + '</small></div></div>';
      }).join('');
    }).catch(function () {
      box.innerHTML = '<b>商品名称识别记录</b><p class="lx-head">当前数据库未能读取识别记录；词库管理和商品表单自动识别仍可使用。</p>';
    });
  }
  function paintLexicon() {
    var boxC = document.getElementById('lx-chars');
    var boxT = document.getElementById('lx-types');
    if (!boxC || !LX_TMP) return;
    var ips = LX_TMP.chars.map(function (c) { return c.ip || 'Other'; }).filter(function (x, i, a) { return a.indexOf(x) === i; }).sort();
    if (ips.indexOf('Other') < 0) ips.push('Other');
    var html = '<div class="lx-head">角色词条：标准英文名、标准中文名、所属 IP、别名及启用状态</div>' +
      '<div class="lx-tools"><input id="lx-search" type="search" value="' + escAttr(LX_FILTER.q) + '" placeholder="搜索名称或别名">' +
      '<select id="lx-ip-filter"><option value="">全部 IP</option>' + ips.map(function (ip) { return '<option value="' + escAttr(ip) + '"' + (LX_FILTER.ip === ip ? ' selected' : '') + '>' + escAttr(ip) + '</option>'; }).join('') + '</select></div>';
    var q = LX_FILTER.q.trim().toLowerCase();
    var visible = LX_TMP.chars.map(function (c, i) { return { c: c, i: i }; }).filter(function (x) {
      var c = x.c;
      if (LX_FILTER.ip && (c.ip || 'Other') !== LX_FILTER.ip) return false;
      return !q || [c.en, c.zh, c.ip].concat(c.aliases || []).join(' ').toLowerCase().indexOf(q) > -1;
    });
    ips.forEach(function (ip) {
      var idxs = visible.filter(function (x) { return (x.c.ip || 'Other') === ip; });
      if (!idxs.length) return;
      html += '<div class="lx-ip">' + escAttr(ip) + '</div>';
      idxs.forEach(function (x) {
        html += '<div class="lx-row" data-i="' + x.i + '">' +
          '<input class="lx-en" value="' + escAttr(x.c.en) + '" placeholder="标准英文名">' +
          '<input class="lx-zh" value="' + escAttr(x.c.zh) + '" placeholder="标准中文名">' +
          '<input class="lx-ip-in" value="' + escAttr(x.c.ip || 'Other') + '" placeholder="IP / 品牌分类">' +
          '<input class="lx-alias-in" value="' + escAttr((x.c.aliases || []).join(', ')) + '" placeholder="别名、错别字、语音输入错误（逗号分隔）">' +
          '<label class="lx-enabled"><input type="checkbox" class="lx-enabled-in"' + (x.c.enabled === false ? '' : ' checked') + '> 启用</label>' +
          '<button type="button" class="lx-x" title="删除该词条">✕</button>' +
        '</div>';
      });
    });
    boxC.innerHTML = html;
    var search = boxC.querySelector('#lx-search'), ipFilter = boxC.querySelector('#lx-ip-filter');
    if (search) search.addEventListener('input', function () { LX_FILTER.q = this.value; paintLexicon(); var el = document.getElementById('lx-search'); if (el) { el.focus(); el.setSelectionRange(el.value.length,el.value.length); } });
    if (ipFilter) ipFilter.addEventListener('change', function () { LX_FILTER.ip = this.value; paintLexicon(); });
    boxC.querySelectorAll('.lx-row').forEach(function (row) {
      var i = parseInt(row.getAttribute('data-i'), 10);
      row.querySelector('.lx-en').addEventListener('input', function () { LX_TMP.chars[i].en = this.value.trim(); });
      row.querySelector('.lx-zh').addEventListener('input', function () { LX_TMP.chars[i].zh = this.value.trim(); });
      row.querySelector('.lx-ip-in').addEventListener('input', function () { LX_TMP.chars[i].ip = this.value.trim() || 'Other'; });
      row.querySelector('.lx-alias-in').addEventListener('input', function () { LX_TMP.chars[i].aliases = this.value.split(/[,，]/).map(function (x) { return x.trim(); }).filter(Boolean); });
      row.querySelector('.lx-enabled-in').addEventListener('change', function () { LX_TMP.chars[i].enabled = this.checked; });
      row.querySelector('.lx-x').addEventListener('click', function () { if (!window.confirm('删除这条词库记录？保存后才会生效。')) return; LX_TMP.chars.splice(i, 1); paintLexicon(); });
    });
    var thtml = '<div class="lx-head">商品类型（标准中文、标准英文、别名）</div>';
    LX_TMP.types.forEach(function (t, i) {
      thtml += '<div class="lx-row" data-ti="' + i + '">' +
        '<input class="lx-tzh" value="' + escAttr(t.zh) + '" placeholder="标准中文">' +
        '<input class="lx-ten" value="' + escAttr(t.en) + '" placeholder="标准英文">' +
        '<input class="lx-talias-in" value="' + escAttr((t.aliases || []).join(', ')) + '" placeholder="别名（逗号分隔）">' +
        '<label class="lx-enabled"><input type="checkbox" class="lx-type-enabled"' + (t.enabled === false ? '' : ' checked') + '> 启用</label>' +
        '<button type="button" class="lx-x" title="删除该类型">✕</button>' +
      '</div>';
    });
    boxT.innerHTML = thtml;
    boxT.querySelectorAll('.lx-row').forEach(function (row) {
      var i = parseInt(row.getAttribute('data-ti'), 10);
      row.querySelector('.lx-tzh').addEventListener('input', function () { LX_TMP.types[i].zh = this.value.trim(); });
      row.querySelector('.lx-ten').addEventListener('input', function () { LX_TMP.types[i].en = this.value.trim(); });
      row.querySelector('.lx-talias-in').addEventListener('input', function () { LX_TMP.types[i].aliases = this.value.split(/[,，]/).map(function (x) { return x.trim(); }).filter(Boolean); });
      row.querySelector('.lx-type-enabled').addEventListener('change', function () { LX_TMP.types[i].enabled = this.checked; });
      row.querySelector('.lx-x').addEventListener('click', function () { if (!window.confirm('删除这条商品类型？保存后才会生效。')) return; LX_TMP.types.splice(i, 1); paintLexicon(); });
    });
  }
  function bindLexiconButtons() {
    var a = document.getElementById('lx-addchar'), b = document.getElementById('lx-addtype'), c = document.getElementById('lx-save');
    if (!a || a.dataset.bound) return;
    a.dataset.bound = b.dataset.bound = c.dataset.bound = '1';
    a.addEventListener('click', function () {
      if (!LX_TMP) return;
      LX_TMP.chars.push({ en: '', zh: '', aliases: [], ip: 'Other', enabled: true });
      paintLexicon();
      var rows = document.querySelectorAll('#lx-chars .lx-row');
      if (rows.length) rows[rows.length - 1].querySelector('.lx-en').focus();
    });
    b.addEventListener('click', function () {
      if (!LX_TMP) return;
      LX_TMP.types.push({ zh: '', en: '', aliases: [], enabled: true });
      paintLexicon();
      var rows = document.querySelectorAll('#lx-types .lx-row');
      if (rows.length) rows[rows.length - 1].querySelector('.lx-tzh').focus();
    });
    c.addEventListener('click', function () {
      if (!LX_TMP) return;
      var seenEn = {}, dup = [];
      LX_TMP.chars.forEach(function (ch) {
        if (!ch.en) return;
        if (seenEn[ch.en]) dup.push(ch.en);
        seenEn[ch.en] = true;
      });
      if (dup.length) { toast('标准英文名重复了：' + dup.join('、') + '（同一角色的多个昵称请合并到同一行别名里）'); return; }
      var chars = LX_TMP.chars.filter(function (ch) { return ch.en || ch.zh || (ch.aliases || []).length; });
      var types = LX_TMP.types.filter(function (t) { return t.zh || t.en; });
      c.disabled = true; c.textContent = '保存中…';
      LX.saveRemote(api, { chars: chars, types: types }).then(function () {
        toast('词库已保存，商品识别和小铺搜索立即生效');
      }).catch(function () { toast('保存失败，重试一下'); }).finally(function () {
        c.disabled = false; c.textContent = '保存词库';
      });
    });
  }

  /* ═══ 商品表单：输入名称 → 自动识别（她 §8.1-8.8；人工改过不覆盖 §8.10）═══ */
  var LX_DIRTY = { name: false, nameEn: false };
  function initProdRecognize() {
    var nameEl = document.getElementById('p-name');
    var nameEnEl = document.getElementById('p-name-en');
    if (!nameEl || nameEl.dataset.lxBound) return;
    nameEl.dataset.lxBound = '1';
    var hint = document.createElement('div');
    hint.id = 'lx-hint';
    hint.style.cssText = 'grid-column:1/-1;font-size:14px;color:#897783;background:#FCECF2;border:1.5px solid #F9E5ED;border-radius:12px;padding:10px 14px;display:none;line-height:1.8;';
    nameEl.closest('.pf-row').appendChild(hint);
    var debounce = null;
    nameEl.addEventListener('input', function () {
      delete hint.dataset.match;
      clearTimeout(debounce);
      debounce = setTimeout(function () { runRecognize(); }, 400);
    });

    function runRecognize(pickEn) {
      var raw = nameEl.value.trim();
      hint.style.display = raw ? 'block' : 'none';
      if (!raw) { delete hint.dataset.match; return; }
      var res = pickEn ? LX.matchPick(raw, pickEn) : LX.match(raw);
      if (res.ambiguous && res.ambiguous.length) {
        hint.innerHTML = '「' + escAttr(raw) + '」可能对应多个角色，不会替你猜——选一个：<br>' +
          res.ambiguous.map(function (a) {
            return '<button type="button" class="lx-btn" data-pick="' + escAttr(a.en) + '" style="margin:4px 6px 0 0;padding:5px 14px;">' + escAttr(a.zh || a.en) + (a.en ? '（' + escAttr(a.en) + '）' : '') + '</button>';
          }).join('');
        hint.querySelectorAll('[data-pick]').forEach(function (b) {
          b.addEventListener('click', function () { runRecognize(b.getAttribute('data-pick')); });
        });
        delete hint.dataset.match;
        return;
      }
      if (!res.ok || res.empty) return;
      var parts = [];
      if (res.char) {
        parts.push('识别角色：' + escAttr(res.nameZh || res.char.en) + (res.nameEn ? ' / ' + escAttr(res.nameEn) : '') + (res.pending ? '（英文标准名待确认：标题暂用中文名，确认官方英文名后请到「词库管理」补上）' : ''));
      } else {
        parts.push('未识别出已知角色，按普通商品处理（原始输入保留）');
      }
      if (res.type) parts.push('商品类型：' + escAttr(res.type.zh) + ' / ' + escAttr(res.type.en));
      if (res.titleZh) parts.push('标题：' + escAttr(res.titleZh) + (res.titleEn ? ' / ' + escAttr(res.titleEn) : ''));
      hint.innerHTML = parts.join('<br>');
      if (res.titleZh) nameEl.value = res.titleZh;
      if (res.titleEn && nameEnEl) nameEnEl.value = res.titleEn;
      hint.dataset.match = JSON.stringify({ raw: raw, nameZh: res.nameZh, nameEn: res.nameEn, titleZh: res.titleZh, titleEn: res.titleEn, charEn: res.char ? res.char.en : '', typeZh: res.type ? res.type.zh : '', ambiguousPick: pickEn || '' });
    }
    window.__lxRunRecognize = runRecognize;
  }
  /* 保存时由 admin.html 合并 window.__lxCollectFields() 的 name_raw/name_match（列没建时走现有降级链） */
  window.__lxCollectFields = function () {
    var hint = document.getElementById('lx-hint');
    if (hint && !hint.dataset.match && window.__lxRunRecognize) window.__lxRunRecognize();
    var nameEl = document.getElementById('p-name');
    if (!hint || !hint.dataset.match) return {};
    try {
      var m = JSON.parse(hint.dataset.match);
      return { name_raw: m.raw || (nameEl ? nameEl.value.trim() : ''), name_match: m };
    } catch (e) { return {}; }
  };
  /* 商品表单「所属区域」：普通商品 / 手作素材（＋三分类）；保存时写 category */
  window.__lxSecCategory = function () {
    var row = document.getElementById('p-sec-row');
    if (!row) return { sec: 'product', cat: '' };
    var on = row.querySelector('.cur-chip.on');
    var sec = on ? on.getAttribute('data-psec') : 'product';
    var cat = '';
    var mrow = document.getElementById('p-mcat-row');
    if (mrow) { var mc = mrow.querySelector('.cur-chip.on'); if (mc) cat = mc.getAttribute('data-mcat'); }
    return { sec: sec, cat: cat };
  };
  function bindSecChips() {
    var secRow = document.getElementById('p-sec-row');
    if (!secRow || secRow.dataset.lxBound) return;
    secRow.dataset.lxBound = '1';
    secRow.querySelectorAll('[data-psec]').forEach(function (b) {
      b.addEventListener('click', function () {
        secRow.querySelectorAll('[data-psec]').forEach(function (x) { x.classList.toggle('on', x === b); });
        var mrow = document.getElementById('p-mat-row');
        if (mrow) mrow.style.display = b.getAttribute('data-psec') === 'material' ? 'block' : 'none';
      });
    });
    var mrow = document.getElementById('p-mcat-row');
    if (mrow) mrow.querySelectorAll('[data-mcat]').forEach(function (b) {
      b.addEventListener('click', function () {
        mrow.querySelectorAll('[data-mcat]').forEach(function (x) { x.classList.toggle('on', x === b); });
      });
    });
  }

  /* 启动：商品表单在 #tab-shop 内，页签显示时绑定；词库按钮也在此刻绑 */
  function bootLexicon() {
    initProdRecognize();
    bindLexiconButtons();
    bindSecChips();
  }
  document.addEventListener('DOMContentLoaded', bootLexicon);
  if (document.readyState !== 'loading') bootLexicon();
  window.AdminLexicon = { renderLexicon: renderLexicon };
})();
