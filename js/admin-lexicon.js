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
  function renderLexicon() {
    ensureRemote().then(function () {
      LX_TMP = { chars: LX.chars().map(function (c) { return { en: c.en || '', zh: c.zh || '', aliases: (c.aliases || []).slice(), ip: c.ip || 'Other' }; }),
                 types: LX.types().map(function (t) { return { zh: t.zh || '', en: t.en || '', aliases: (t.aliases || []).slice() }; }) };
      paintLexicon();
    });
  }
  function paintLexicon() {
    var boxC = document.getElementById('lx-chars');
    var boxT = document.getElementById('lx-types');
    if (!boxC || !LX_TMP) return;
    var ips = ['VALORANT', 'Sanrio', 'Other'];
    var html = '<div class="lx-head">角色（标准英文名 · 标准中文名 · 别名，逗号分隔）</div>';
    ips.forEach(function (ip) {
      var idxs = LX_TMP.chars.map(function (c, i) { return { c: c, i: i }; }).filter(function (x) { return (x.c.ip || 'Other') === ip; });
      if (!idxs.length) return;
      html += '<div class="lx-ip">' + ip + '</div>';
      idxs.forEach(function (x) {
        html += '<div class="lx-row" data-i="' + x.i + '">' +
          '<input class="lx-en" value="' + escAttr(x.c.en) + '" placeholder="标准英文名">' +
          '<input class="lx-zh" value="' + escAttr(x.c.zh) + '" placeholder="标准中文名">' +
          '<input class="lx-alias-in" value="' + escAttr((x.c.aliases || []).join(', ')) + '" placeholder="别名（逗号分隔）">' +
          '<button type="button" class="lx-x" title="删除该角色">✕</button>' +
        '</div>';
      });
    });
    boxC.innerHTML = html;
    boxC.querySelectorAll('.lx-row').forEach(function (row) {
      var i = parseInt(row.getAttribute('data-i'), 10);
      row.querySelector('.lx-en').addEventListener('input', function () { LX_TMP.chars[i].en = this.value.trim(); });
      row.querySelector('.lx-zh').addEventListener('input', function () { LX_TMP.chars[i].zh = this.value.trim(); });
      row.querySelector('.lx-alias-in').addEventListener('input', function () { LX_TMP.chars[i].aliases = this.value.split(/[,，]/).map(function (x) { return x.trim(); }).filter(Boolean); });
      row.querySelector('.lx-x').addEventListener('click', function () { LX_TMP.chars.splice(i, 1); paintLexicon(); });
    });
    var thtml = '<div class="lx-head">商品类型（标准中文 · 标准英文 · 别名）</div>';
    LX_TMP.types.forEach(function (t, i) {
      thtml += '<div class="lx-row" data-ti="' + i + '">' +
        '<input class="lx-tzh" value="' + escAttr(t.zh) + '" placeholder="标准中文">' +
        '<input class="lx-ten" value="' + escAttr(t.en) + '" placeholder="标准英文">' +
        '<input class="lx-talias-in" value="' + escAttr((t.aliases || []).join(', ')) + '" placeholder="别名（逗号分隔）">' +
        '<button type="button" class="lx-x" title="删除该类型">✕</button>' +
      '</div>';
    });
    boxT.innerHTML = thtml;
    boxT.querySelectorAll('.lx-row').forEach(function (row) {
      var i = parseInt(row.getAttribute('data-ti'), 10);
      row.querySelector('.lx-tzh').addEventListener('input', function () { LX_TMP.types[i].zh = this.value.trim(); });
      row.querySelector('.lx-ten').addEventListener('input', function () { LX_TMP.types[i].en = this.value.trim(); });
      row.querySelector('.lx-talias-in').addEventListener('input', function () { LX_TMP.types[i].aliases = this.value.split(/[,，]/).map(function (x) { return x.trim(); }).filter(Boolean); });
      row.querySelector('.lx-x').addEventListener('click', function () { LX_TMP.types.splice(i, 1); paintLexicon(); });
    });
  }
  function bindLexiconButtons() {
    var a = document.getElementById('lx-addchar'), b = document.getElementById('lx-addtype'), c = document.getElementById('lx-save');
    if (!a || a.dataset.bound) return;
    a.dataset.bound = b.dataset.bound = c.dataset.bound = '1';
    a.addEventListener('click', function () {
      if (!LX_TMP) return;
      LX_TMP.chars.push({ en: '', zh: '', aliases: [], ip: 'Other' });
      paintLexicon();
      var rows = document.querySelectorAll('#lx-chars .lx-row');
      if (rows.length) rows[rows.length - 1].querySelector('.lx-en').focus();
    });
    b.addEventListener('click', function () {
      if (!LX_TMP) return;
      LX_TMP.types.push({ zh: '', en: '', aliases: [] });
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
      LX_DIRTY.name = true;
      clearTimeout(debounce);
      debounce = setTimeout(function () { runRecognize(); }, 400);
    });
    if (nameEnEl) nameEnEl.addEventListener('input', function () { LX_DIRTY.nameEn = true; });
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
      if (res.nameZh && !LX_DIRTY.name) nameEl.value = res.nameZh;
      if (res.nameEn && nameEnEl && !LX_DIRTY.nameEn) nameEnEl.value = res.nameEn;
      hint.dataset.match = JSON.stringify({ raw: raw, nameZh: res.nameZh, nameEn: res.nameEn, titleZh: res.titleZh, titleEn: res.titleEn, charEn: res.char ? res.char.en : '', typeZh: res.type ? res.type.zh : '', ambiguousPick: pickEn || '' });
    }
    window.__lxRunRecognize = runRecognize;
  }
  /* 保存时由 admin.html 合并 window.__lxCollectFields() 的 name_raw/name_match（列没建时走现有降级链） */
  window.__lxCollectFields = function () {
    var hint = document.getElementById('lx-hint');
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
