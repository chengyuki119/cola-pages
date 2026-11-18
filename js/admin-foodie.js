/* ═══════════════════════════════════════════════════════════════════
   Foodie 管理（她 20261114 Foodie Map 任务书 §十三）— Phase 1
   · 依赖 admin.html 全局: SUPABASE_URL / SUPABASE_ANON_KEY / ACCESS /
     authedFetch / toast / esc / enhanceSelects / uploadShopFiles
   · 子页: 总览 / 餐厅管理 / 地区管理 / 分类管理 / 数据(CSV)
   · 权限: 全部经 RLS（food_restaurants_admin_write = shop_is_admin()），
     非管理员任何写操作数据库都会拒绝，不依赖前端隐藏。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var URL_ = window.SUPABASE_URL || 'https://ukxrvcptwhlwvdanovgd.supabase.co';
  var REST = URL_ + '/rest/v1/';
  var HDRS = function () {
    return {
      'apikey': window.SUPABASE_ANON_KEY || (window.DB_HEADERS && window.DB_HEADERS.apikey) || '',
      'Authorization': 'Bearer ' + (window.ACCESS || ''),
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    };
  };
  function api(method, table, qs, body) {
    return fetch(REST + table + (qs ? '?' + qs : ''), {
      method: method, headers: HDRS(), body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error('HTTP ' + r.status + ' ' + t.slice(0, 160)); });
      return r.status === 204 ? null : r.json();
    });
  }
  function db() { return fetch(REST + 'food_restaurants?select=*&order=created_at.desc', { headers: HDRS() }).then(function (r) { return r.ok ? r.json() : []; }); }

  var S = { regions: [], cats: [], rests: [], subs: [], sub: 'dash', editing: null, subView: null, map: null, marker: null, cfgRow: null, mapAdapter: null };

  var SUBS = [
    ['dash', '总览'], ['subs', '投稿审核'], ['rests', '餐厅管理'], ['settings', '地图与分类设置'], ['data', '数据管理']
  ]; // 她 20261117 16:26 任务书 §八：地区/分类/地图服务合并为一个设置区，CSV 归入数据管理，导航 7→5

  /* ── 小件 ── */
  function h(tag, attrs, html) { return '<' + tag + (attrs ? ' ' + attrs : '') + '>' + (html == null ? '' : html) + '</' + tag.split(' ')[0] + '>'; }
  function yuzuIco(n, size) {
    var s = size || 20;
    var svg = '<svg viewBox="0 0 24 24" fill="none" style="width:' + s + 'px;height:' + s + 'px;"><circle cx="12" cy="13.2" r="8.2" fill="#FCECF2" stroke="#F48FB1" stroke-width="1.6"/><circle cx="9.2" cy="11" r="1" fill="#F6C5D7"/><circle cx="13.6" cy="12.4" r="1" fill="#F6C5D7"/><circle cx="11" cy="15.6" r="1" fill="#F6C5D7"/><path d="M12 5c0-1.8 1.2-3 3-3" stroke="#B98598" stroke-width="1.5" stroke-linecap="round"/><path d="M15 2c2.6.4 4.4 2 4.6 4.4-2.5.3-4.5-1.4-4.6-4.4z" fill="#F6C5D7" stroke="#B98598" stroke-width="1.1"/></svg>';
    var out = ''; for (var i = 0; i < (n || 0); i++) out += svg;
    return '<span style="display:inline-flex;gap:2px;align-items:center;">' + out + '</span>';
  }
  function catLabel(kind, key) {
    var c = S.cats.filter(function (x) { return x.kind === kind && x.key === key; })[0];
    return c ? (c.label_zh || c.label_en) : key;
  }
  function subBar() {
    return '<div class="fdm-subs" style="display:flex;gap:8px;flex-wrap:wrap;margin:0 0 18px;">' +
      SUBS.map(function (x) {
        return '<button type="button" class="fdm-sub" data-sub="' + x[0] + '">' + x[1] + '</button>';
      }).join('') + '</div>';
  }
  function fdmSubStyle() {
    if (document.getElementById('fdm-style')) return;
    var st = document.createElement('style'); st.id = 'fdm-style';
    st.textContent = '.fdm-sub{border:1.5px solid #F9E5ED;background:#fff;color:#65515D;border-radius:999px;padding:7px 18px;font-size:15px;cursor:pointer;font-family:inherit;}' +
      '.fdm-sub:hover{background:#FCECF2;}' +
      '.fdm-sub.on{background:#F6C5D7;border-color:#F6C5D7;color:#B98598;font-weight:600;}' +
      '.fdm-row{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:0 0 12px;}' +
      '.fdm-field{display:flex;flex-direction:column;gap:4px;min-width:0;}' +
      '.fdm-field label{font-size:13px;color:#897783;}' +
      '.fdm-field input,.fdm-field select,.fdm-field textarea{font-family:inherit;font-size:15px;color:#65515D;border:1.5px solid #F9E5ED;border-radius:10px;padding:8px 10px;background:#fff;outline:none;min-width:0;}' +
      '.fdm-field textarea{resize:vertical;}' +
      '.fdm-chip{border:1.5px solid #F9E5ED;background:#fff;color:#65515D;border-radius:999px;padding:5px 13px;font-size:14px;cursor:pointer;font-family:inherit;}' +
      '.fdm-chip.on{background:#F6C5D7;border-color:#F6C5D7;color:#B98598;font-weight:600;}' +
      '.fdm-rest{display:flex;gap:12px;align-items:center;border:1.5px solid #F9E5ED;border-radius:14px;padding:10px 14px;margin-bottom:10px;background:#fff;}' +
      '.fdm-rest img{width:72px;height:72px;object-fit:cover;border-radius:10px;background:#FCECF2;flex-shrink:0;}' +
      '.fdm-rest-body{flex:1;min-width:0;}' +
      '.fdm-more{position:relative;}' +
      '.fdm-menu{position:absolute;right:0;top:34px;background:#fff;border-radius:12px;box-shadow:0 6px 20px rgba(180,120,150,.18);padding:6px;min-width:130px;display:none;z-index:30;}' +
      '.fdm-menu button{display:block;width:100%;border:none;background:none;text-align:left;padding:8px 12px;font-size:15px;cursor:pointer;border-radius:8px;color:#65515D;font-family:inherit;}' +
      '.fdm-menu button:hover{background:#FCECF2;}' +
      '.fdm-menu button.danger{color:#C4636E;}' +
      '.fdm-btn{border:none;background:#FCECF2;border:1.5px solid #F8DDE8;color:#B98598;border-radius:999px;padding:9px 20px;font-size:15px;font-weight:600;cursor:pointer;font-family:inherit;}' +
      '.fdm-btn:hover{background:#F6C5D7;}' +
      '.fdm-btn.ghost{background:#fff;}' +
      '.fdm-btn.danger{background:#FBE3E6;border-color:#F2C7CD;color:#C4636E;}' +
      '.fdm-tbl{width:100%;border-collapse:collapse;font-size:15px;}' +
      '.fdm-tbl th{text-align:left;color:#897783;font-weight:600;padding:8px 10px;border-bottom:1.5px solid #F9E5ED;}' +
      '.fdm-tbl td{padding:8px 10px;border-bottom:1px solid #F9E5ED;color:#65515D;}' +
      '.fdm-imgs{display:flex;gap:10px;flex-wrap:wrap;}' +
      '.fdm-img{position:relative;width:96px;}' +
      '.fdm-img img{width:96px;height:96px;object-fit:cover;border-radius:10px;border:1.2px solid #F9E5ED;}' +
      '.fdm-img .del{position:absolute;top:4px;right:4px;width:22px;height:22px;border-radius:50%;border:none;background:#fff;color:#C4636E;cursor:pointer;font-size:13px;line-height:1;box-shadow:0 2px 8px rgba(180,120,150,.25);}' +
      '.fdm-hint{font-size:14px;color:#897783;}';
    document.head.appendChild(st);
  }

  /* ── 数据加载 ── */
  function loadAll() {
    return Promise.all([
      api('GET', 'food_regions', 'select=*&order=sort.asc').catch(function () { return []; }),
      api('GET', 'food_categories', 'select=*&order=sort.asc').catch(function () { return []; }),
      db().catch(function () { return []; }),
      api('GET', 'food_restaurant_submissions', 'select=*&order=created_at.desc').catch(function () { return []; })
    ]).then(function (rs) {
      S.regions = rs[0] || []; S.cats = rs[1] || []; S.rests = rs[2] || []; S.subs = rs[3] || [];
    });
  }

  function boot() {
    if (document.getElementById('fdm-root').dataset.ready === '1') { render(); return; }
    document.getElementById('fdm-root').dataset.ready = '1';
    document.getElementById('fdm-root').innerHTML = subBar() +
      '<div id="fdm-sub-dash"></div><div id="fdm-sub-rests" style="display:none;"></div>' +
      '<div id="fdm-sub-subs" style="display:none;"></div>' +
      '<div id="fdm-sub-settings" style="display:none;"></div>' +
      '<div id="fdm-sub-regions" style="display:none;"></div><div id="fdm-sub-cats" style="display:none;"></div>' +
      '<div id="fdm-sub-mapcfg" style="display:none;"></div>' +
      '<div id="fdm-sub-data" style="display:none;"></div>';
    fdmSubStyle();
    document.getElementById('fdm-root').addEventListener('click', function (e) {
      var b = e.target.closest('.fdm-sub');
      if (!b) return;
      showSub(b.getAttribute('data-sub'));
    });
    loadAll().then(function () {
      render();
      if (typeof enhanceSelects === 'function') enhanceSelects();
    });
  }

  function showSub(name) {
    S.sub = name;
    document.querySelectorAll('#fdm-root .fdm-subs > .fdm-sub').forEach(function (x) { x.classList.toggle('on', x.getAttribute('data-sub') === name); });
    var wrap = null;
    SUBS.forEach(function (x) {
      var el = document.getElementById('fdm-sub-' + x[0]);
      if (el) el.style.display = (x[0] === name) ? '' : 'none';
      if (x[0] === name) wrap = x[0];
    });
    // 设置区内嵌三个原始容器（地区/分类/地图服务）：选中设置区时一并展开
    ['regions', 'cats', 'mapcfg'].forEach(function (k) {
      var el = document.getElementById('fdm-sub-' + k);
      if (el) el.style.display = (name === 'settings') ? '' : 'none';
    });
    render();
    if (typeof enhanceSelects === 'function') enhanceSelects();
  }

  function render() {
    if (S.sub === 'dash') renderDash();
    else if (S.sub === 'subs') renderSubs();
    else if (S.sub === 'rests') renderRests();
    else if (S.sub === 'settings') { renderRegions(); renderCats(); renderMapCfg(); } // 一个设置区内三段连排，数据与逻辑不动
    else if (S.sub === 'data') renderData();
  }

  /* ── ① 总览 ── */
  function renderDash() {
    var byCountry = {};
    S.rests.forEach(function (r) { var c = r.country_code || '—'; byCountry[c] = (byCountry[c] || 0) + 1; });
    var pub = S.rests.filter(function (r) { return r.status === 'published'; }).length;
    var hid = S.rests.length - pub;
    var feat = S.rests.filter(function (r) { return r.is_featured; }).length;
    var yc = {}; [1,2,3,4,5].forEach(function (n) { yc[n] = S.rests.filter(function (r) { return r.yuzu_rating === n; }).length; }); // 她 20261117：评级扩到 1~5 颗柚子
    var hot = S.rests.filter(function (r) { return (r.yuzu_rating || 0) >= 4; }).slice(0, 5)
      .map(function (r) { return '<div style="display:flex;gap:8px;align-items:center;padding:4px 0;">' + yuzuIco(r.yuzu_rating) + '<span>' + esc(r.name) + '</span></div>'; }).join('');
    document.getElementById('fdm-sub-dash').innerHTML =
      '<div class="card" style="max-width:none;">' +
      '<h3>Foodie 总览</h3>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:16px;">' +
      stat('待审投稿', S.subs.filter(function (s) { return s.status === 'pending'; }).length) +
      stat('餐厅总数', S.rests.length) + stat('已发布', pub) + stat('地区数', S.regions.length) + // 她 20261117 任务书 §八5：总览只留必要统计，不再铺隐藏/精选/逐级柚子卡
      '</div>' +
      '<h3 style="font-size:16px;">各国家和地区餐厅数</h3>' +
      (Object.keys(byCountry).map(function (c) {
        var reg = S.regions.filter(function (x) { return x.code === c; })[0];
        return '<span style="display:inline-flex;margin:0 14px 6px 0;">' + esc((reg && reg.name_zh) || c) + ': <b style="margin-left:6px;">' + byCountry[c] + '</b></span>';
      }).join('') || '<span class="empty">暂无数据</span>') +
      (hot ? '<h3 style="font-size:16px;margin-top:16px;">柚子推荐（4 颗以上）</h3>' + hot : '') +
      '</div>';
  }
  function stat(label, val) {
    return '<div style="background:#FFF8FA;border:1.5px solid #F9E5ED;border-radius:14px;padding:12px 14px;"><div style="font-size:13px;color:#897783;">' + label + '</div><div style="font-size:22px;font-weight:700;color:#65515D;margin-top:2px;">' + val + '</div></div>';
  }

  /* ── ② 投稿审核（Phase 2，她 20261115）── */
  var SUB_STATUS = { pending: ['待审', '#B98598', '#FCECF2'], approved: ['已上架', '#4E8A5A', '#EAF6EC'], rejected: ['已拒绝', '#C4636E', '#FBE3E6'], hidden: ['已隐藏', '#897783', '#FFF8FA'] };
  function subPayload(s) { var p = s.payload || {}; return (p && typeof p === 'object' && !Array.isArray(p)) ? p : {}; }
  function subName(s) { return subPayload(s).name || '（无名称）'; }
  function subLoc(s) {
    var p = subPayload(s);
    var reg = S.regions.filter(function (x) { return x.code === p.country_code; })[0];
    return [p.city, (reg && reg.name_zh) || p.country_name].filter(Boolean).join(', ');
  }
  function fmtTime(t) { return t ? String(t).replace('T', ' ').slice(0, 16).replace(/-/g, '/') : '—'; }
  function renderSubs() {
    var box = document.getElementById('fdm-sub-subs');
    if (S.subView) { renderSubDetail(box); return; }
    var pend = S.subs.filter(function (s) { return s.status === 'pending'; });
    var pendN = pend.length;
    var other = S.subs.filter(function (s) { return s.status !== 'pending'; });
    box.innerHTML =
      '<div class="card" style="max-width:none;">' +
      '<h3>投稿审核' + (pendN ? '<span style="margin-left:10px;font-size:14px;background:#FCECF2;color:#B98598;border-radius:999px;padding:3px 12px;vertical-align:2px;">待审 ' + pendN + '</span>' : '') + '</h3>' +
      '<p class="fdm-hint" style="margin:0 0 14px;">访客在前台「推荐餐厅」提交的内容都在这里；通过后自动上架为已发布餐厅，随时可在餐厅管理里编辑。</p>' +
      (pendN ? pend.map(function (s) { return subRow(s); }).join('') : '<p class="empty">没有待审投稿 ♡</p>') +
      (other.length ? '<h3 style="font-size:16px;margin:20px 0 10px;">历史记录</h3>' + other.map(function (s) { return subRow(s); }).join('') : '') +
      '</div>';
    box.querySelectorAll('[data-sid]').forEach(function (row) {
      row.style.cursor = 'pointer';
      row.onclick = function () { S.subView = row.getAttribute('data-sid'); renderSubs(); };
    });
  }
  function subRow(s) {
    var st = SUB_STATUS[s.status] || SUB_STATUS.hidden;
    var p = subPayload(s);
    var cats = [].concat(Array.isArray(p.cuisine) ? p.cuisine : [], Array.isArray(p.food_categories) ? p.food_categories : [])
      .map(function (k) { return catLabel('cuisine', k) !== k ? catLabel('cuisine', k) : catLabel('food_type', k); }).filter(Boolean).join(' · ');
    return '<div class="fdm-rest" data-sid="' + esc(s.id) + '">' +
      '<div class="fdm-rest-body"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">' +
      '<b>' + esc(subName(s)) + '</b>' +
      '<span style="font-size:12px;color:' + st[1] + ';border:1px solid currentColor;border-radius:999px;padding:1px 8px;">' + st[0] + '</span>' +
      '</div>' +
      '<div style="font-size:13px;color:#897783;margin-top:3px;">' + esc(subLoc(s) || '—') + (cats ? ' · ' + esc(cats) : '') + ' · 投稿人 ' + esc(s.user_email || '—') + ' · ' + fmtTime(s.created_at) + '</div>' +
      (s.note ? '<div style="font-size:14px;color:#65515D;margin-top:5px;line-height:1.6;">' + esc(String(s.note).slice(0, 80)) + '</div>' : '') +
      '</div><span style="color:#897783;">›</span></div>';
  }
  function renderSubDetail(box) {
    var s = S.subs.filter(function (x) { return x.id === S.subView; })[0];
    if (!s) { S.subView = null; renderSubs(); return; }
    var p = subPayload(s);
    var st = SUB_STATUS[s.status] || SUB_STATUS.hidden;
    var line = function (k, v) { return v ? '<div style="font-size:15px;line-height:1.7;color:#65515D;"><span style="color:#897783;">' + k + '：</span>' + esc(v) + '</div>' : ''; };
    var reg = S.regions.filter(function (x) { return x.code === p.country_code; })[0];
    var chipsHtml = function (kind) {
      return (Array.isArray(p[kind]) ? p[kind] : []).map(function (k) { return catLabel(kind === 'cuisine' ? 'cuisine' : 'food_type', k); }).filter(Boolean)
        .map(function (lb) { return '<span style="display:inline-block;font-size:13px;background:#FCECF2;color:#B98598;border-radius:999px;padding:2px 10px;margin:0 6px 6px 0;">' + esc(lb) + '</span>'; }).join('');
    };
    var linkedId = String(s.admin_note || '').indexOf('restaurant:') === 0 ? String(s.admin_note).slice(11) : '';
    var linked = linkedId ? S.rests.filter(function (r) { return r.id === linkedId; })[0] : null;
    var imgs = Array.isArray(p.images) ? p.images.filter(Boolean) : [];
    box.innerHTML =
      '<div class="card" style="max-width:none;">' +
      '<div class="fdm-row" style="align-items:center;"><button type="button" class="fdm-btn ghost" id="fsd-back">← 返回列表</button>' +
      '<span style="font-size:13px;color:' + st[1] + ';border:1px solid currentColor;border-radius:999px;padding:2px 10px;">' + st[0] + '</span>' +
      '<span class="fdm-hint">投稿时间 ' + fmtTime(s.created_at) + (s.reviewed_at ? ' · 审核时间 ' + fmtTime(s.reviewed_at) : '') + '</span></div>' +
      '<h3>' + esc(subName(s)) + (p.name_i18n && p.name_i18n['zh-Hans'] ? '<span style="font-size:16px;color:#897783;font-weight:500;margin-left:8px;">' + esc(p.name_i18n['zh-Hans']) + '</span>' : '') + '</h3>' +
      '<div style="margin:6px 0 12px;">' + line('国家/地区', ((reg && ((reg.name_zh || reg.name) + ' · ' + reg.code)) || p.country_name)) +
      line('城市', p.city) + line('地址', p.address) +
      ((p.cuisine || []).length || (p.food_categories || []).length ? '<div style="margin:4px 0;">' + chipsHtml('cuisine') + chipsHtml('food_type') + '</div>' : '') +
      line('价位', p.price_level ? '$'.repeat(Number(p.price_level)) + (p.average_price != null && p.currency_code ? ' · 人均约 ' + p.currency_code + ' ' + p.average_price : '') : '') +
      (imgs.length ? '<div style="margin:8px 0;">' + imgs.map(function (u) { return '<img src="' + esc(u) + '" style="width:110px;height:110px;object-fit:cover;border-radius:10px;border:1.2px solid #F9E5ED;margin:0 8px 8px 0;background:#FCECF2;">'; }).join('') + '</div>' : '') +
      '<div style="background:#FFF8FA;border:1.5px solid #F9E5ED;border-radius:14px;padding:12px 14px;margin:10px 0 4px;">' +
      '<div style="font-size:13px;color:#897783;margin-bottom:4px;">投稿人推荐理由（' + esc(s.user_email || '—') + '）</div>' +
      '<div style="font-size:15px;line-height:1.8;color:#65515D;white-space:pre-wrap;">' + esc(s.note || '') + '</div></div>' +
      (linked ? '<p class="fdm-hint" style="margin:10px 0;">已上架为「' + esc(linked.name) + '」（餐厅管理里可编辑）</p>' : '') +
      (s.status === 'pending' ? '<div class="fdm-row" style="margin-top:14px;">' +
        '<button type="button" class="fdm-btn" id="fsd-approve">✓ 通过并上架</button>' +
        '<button type="button" class="fdm-btn danger" id="fsd-reject">✕ 拒绝</button>' +
        '<span class="fdm-hint" id="fsd-msg"></span></div>' : '') +
      (s.status !== 'pending' ? '<div class="fdm-row" style="margin-top:14px;"><button type="button" class="fdm-btn danger" id="fsd-del">删除这条投稿记录</button><span class="fdm-hint" id="fsd-msg"></span></div>' : '') +
      '</div>';
    box.querySelector('#fsd-back').onclick = function () { S.subView = null; renderSubs(); };
    var msg = box.querySelector('#fsd-msg');
    if (s.status === 'pending') {
      box.querySelector('#fsd-approve').onclick = function () { approveSub(s, msg); };
      box.querySelector('#fsd-reject').onclick = function () {
        var note = window.prompt('拒绝原因（写给自己的备注，可留空）：') || '';
        if (note === null) return;
        api('PATCH', 'food_restaurant_submissions', 'id=eq.' + s.id, {
          status: 'rejected', admin_note: note,
          reviewed_at: new Date().toISOString(), reviewed_by: adminEmail()
        }).then(function () { toast('已拒绝'); S.subView = null; loadAll().then(render); })
          .catch(function (er) { msg.textContent = '失败: ' + er.message; });
      };
    } else {
      box.querySelector('#fsd-del').onclick = function () {
        if (!window.confirm('删除这条投稿记录？不可恢复。')) return;
        api('DELETE', 'food_restaurant_submissions', 'id=eq.' + s.id).then(function () { toast('已删除'); S.subView = null; loadAll().then(render); })
          .catch(function (er) { msg.textContent = '失败: ' + er.message; });
      };
    }
  }
  function approveSub(s, msg) {
    var p = subPayload(s);
    var reg = S.regions.filter(function (x) { return x.code === p.country_code; })[0];
    // slug 去重
    var base = F_slug(p.name);
    var slug = base, n = 2;
    var slugs = {};
    S.rests.forEach(function (r) { slugs[r.slug] = 1; });
    while (slugs[slug]) { slug = base + '-' + n; n++; }
    var dup = S.rests.filter(function (x) { return x.name === p.name && x.city === p.city; })[0];
    if (dup && !window.confirm('发现疑似重复餐厅：「' + dup.name + '」（' + (dup.city || '—') + '）。仍要上架吗？')) return;
    var body = {
      name: p.name,
      name_i18n: p.name_i18n || {},
      slug: slug,
      description: p.description || '',
      description_i18n: p.description_i18n || {},
      country_code: p.country_code || '',
      country_name: p.country_name || (reg ? reg.name : ''),
      city: p.city || '',
      address: p.address || '',
      address_en: p.address_en || '',
      latitude: p.latitude == null ? null : Number(p.latitude),
      longitude: p.longitude == null ? null : Number(p.longitude),
      cuisine: Array.isArray(p.cuisine) ? p.cuisine : [],
      food_categories: Array.isArray(p.food_categories) ? p.food_categories : [],
      price_level: p.price_level == null ? null : Number(p.price_level),
      average_price: p.average_price == null ? null : Number(p.average_price),
      currency_code: p.currency_code || (reg ? reg.currency_code : ''),
      images: Array.isArray(p.images) ? p.images : [],
      cover_image: (Array.isArray(p.images) && p.images.length) ? p.images[0] : (p.cover_image || ''),
      hours: p.hours || {},
      timezone: p.timezone || (reg ? reg.timezone_default : ''),
      yuzu_rating: null, yuzu_note: '', yuzu_source: '社区投稿',
      yuzu_updated_at: null, yuzu_updated_by: adminEmail(),
      status: 'published', is_featured: false,
      source: 'submission'
    };
    msg.textContent = '上架中…';
    api('POST', 'food_restaurants', 'select=id', body).then(function (rows) {
      var rid = rows && rows[0] && rows[0].id;
      return api('PATCH', 'food_restaurant_submissions', 'id=eq.' + s.id, {
        status: 'approved',
        admin_note: rid ? 'restaurant:' + rid : '',
        reviewed_at: new Date().toISOString(),
        reviewed_by: adminEmail()
      });
    }).then(function () {
      toast('已上架 ✓ 前台地图和主页区块都能看到它');
      S.subView = null;
      loadAll().then(render);
    }).catch(function (er) { msg.textContent = '失败: ' + er.message; });
  }

  /* ── ③ 餐厅管理 ── */
  var restFilters = { q: '', status: '', country: '' };
  function restList() {
    return S.rests.filter(function (r) {
      if (restFilters.status && r.status !== restFilters.status) return false;
      if (restFilters.country && r.country_code !== restFilters.country) return false;
      if (restFilters.q) {
        var q = restFilters.q.toLowerCase();
        var hay = [r.name, JSON.stringify(r.name_i18n || {}), r.city, r.address, r.slug, r.postal_code].join(' ').toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
  }
  function renderRests() {
    var box = document.getElementById('fdm-sub-rests');
    if (S.editing !== null) { renderRestForm(box); return; }
    var opts = function (arr, cur, allLabel) {
      return '<option value="">' + allLabel + '</option>' + arr.map(function (x) {
        return '<option value="' + esc(x[0]) + '"' + (cur === x[0] ? ' selected' : '') + '>' + esc(x[1]) + '</option>';
      }).join('');
    };
    box.innerHTML =
      '<div class="fdm-row">' +
      '<button type="button" class="fdm-btn" id="fdm-add">+ 新增餐厅</button>' +
      '<input id="fdm-q" placeholder="搜索名称/城市/地址" value="' + esc(restFilters.q) + '" style="border:1.5px solid #F9E5ED;border-radius:999px;padding:8px 16px;font-family:inherit;font-size:15px;min-width:200px;outline:none;">' +
      '<select id="fdm-fstatus"><option value="">全部状态</option><option value="published"' + (restFilters.status === 'published' ? ' selected' : '') + '>已发布</option><option value="hidden"' + (restFilters.status === 'hidden' ? ' selected' : '') + '>隐藏</option></select>' +
      '<select id="fdm-fcountry">' + opts(S.regions.map(function (r) { return [r.code, r.name_zh || r.name]; }), restFilters.country, '全部地区') + '</select>' +
      '<span class="fdm-hint">' + restList().length + ' / ' + S.rests.length + ' 家</span>' +
      '</div><div id="fdm-rest-list">' +
      (restList().map(restRow).join('') || '<p class="empty">没有餐厅，点「+ 新增餐厅」开始</p>') +
      '</div>';

    document.getElementById('fdm-add').onclick = function () { S.editing = {}; renderRests(); if (typeof enhanceSelects === 'function') enhanceSelects(); };
    document.getElementById('fdm-q').oninput = function (e) { restFilters.q = e.target.value; renderRests(); if (typeof enhanceSelects === 'function') enhanceSelects(); document.getElementById('fdm-q').focus(); };
    document.getElementById('fdm-fstatus').onchange = function (e) { restFilters.status = e.target.value; renderRests(); if (typeof enhanceSelects === 'function') enhanceSelects(); };
    document.getElementById('fdm-fcountry').onchange = function (e) { restFilters.country = e.target.value; renderRests(); if (typeof enhanceSelects === 'function') enhanceSelects(); };

    box.querySelectorAll('[data-act]').forEach(function (b) {
      b.onclick = function (e) {
        e.stopPropagation();
        var id = b.closest('[data-rid]').getAttribute('data-rid');
        var r = S.rests.filter(function (x) { return x.id === id; })[0];
        var act = b.getAttribute('data-act');
        if (act === 'menu') {
          var menu = b.parentElement.querySelector('.fdm-menu');
          document.querySelectorAll('.fdm-menu').forEach(function (m) { if (m !== menu) m.style.display = 'none'; });
          menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
          return;
        }
        if (act === 'edit') { S.editing = JSON.parse(JSON.stringify(r)); renderRests(); if (typeof enhanceSelects === 'function') enhanceSelects(); }
        else if (act === 'toggle') {
          r.status = r.status === 'published' ? 'hidden' : 'published';
          api('PATCH', 'food_restaurants', 'id=eq.' + id, { status: r.status }).then(function () { toast(r.status === 'published' ? '已发布' : '已隐藏'); loadAll().then(render); })
            .catch(function (er) { toast('失败: ' + er.message); });
        }
        else if (act === 'del') {
          if (!window.confirm('确定删除「' + r.name + '」？删除后不可恢复。')) return;
          api('DELETE', 'food_restaurants', 'id=eq.' + id).then(function () { toast('已删除'); loadAll().then(render); })
            .catch(function (er) { toast('失败: ' + er.message); });
        }
      };
    });
    document.addEventListener('click', closeAllMenus);
  }
  function closeAllMenus(e) {
    if (!e.target.closest('.fdm-more')) document.querySelectorAll('.fdm-menu').forEach(function (m) { m.style.display = 'none'; });
  }
  function restRow(r) {
    var img = r.cover_image || (Array.isArray(r.images) && r.images[0]) || '';
    var reg = S.regions.filter(function (x) { return x.code === r.country_code; })[0];
    var loc = [r.city, (reg && reg.name_zh) || r.country_name].filter(Boolean).join(', ');
    return '<div class="fdm-rest" data-rid="' + esc(r.id) + '">' +
      '<img src="' + esc(img) + '" alt="">' +
      '<div class="fdm-rest-body"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">' +
      '<b>' + esc(r.name) + '</b>' + yuzuIco(r.yuzu_rating) +
      (r.is_featured ? '<span style="font-size:12px;background:#FCECF2;color:#B98598;border-radius:999px;padding:2px 8px;">精选</span>' : '') +
      '<span style="font-size:12px;color:' + (r.status === 'published' ? '#4E8A5A' : '#897783') + ';border:1px solid currentColor;border-radius:999px;padding:1px 8px;">' + (r.status === 'published' ? '已发布' : '隐藏') + '</span>' +
      '</div><div style="font-size:13px;color:#897783;margin-top:3px;">' + esc(loc) + ' · ' + esc(r.slug) + '</div></div>' +
      '<div class="fdm-more"><button type="button" class="fdm-sub" data-act="menu" style="padding:5px 12px;">⋯</button>' +
      '<div class="fdm-menu">' +
      '<button data-act="edit">编辑</button>' +
      '<button data-act="toggle">' + (r.status === 'published' ? '隐藏' : '发布') + '</button>' +
      '<button data-act="del" class="danger">删除</button>' +
      '</div></div></div>';
  }

  /* ── 餐厅表单 ── */
  function renderRestForm(box) {
    var f = S.editing || {};
    var isNew = !f.id;
    var cuisine = Array.isArray(f.cuisine) ? f.cuisine : [];
    var foods = Array.isArray(f.food_categories) ? f.food_categories : [];
    var imgs = Array.isArray(f.images) ? f.images.filter(Boolean) : [];
    var hours = f.hours && typeof f.hours === 'object' ? f.hours : {};
    var DAYS = [['mon', '周一'], ['tue', '周二'], ['wed', '周三'], ['thu', '周四'], ['fri', '周五'], ['sat', '周六'], ['sun', '周日']];
    var ffield = function (id, label, val, w, ph, type) {
      return '<div class="fdm-field"' + (w ? ' style="flex:1 1 ' + w + ';"' : '') + '><label>' + label + '</label><input id="' + id + '" type="' + (type || 'text') + '" value="' + esc(val == null ? '' : val) + '" placeholder="' + esc(ph || '') + '"></div>';
    };
    var chipRow = function (kind, selArr) {
      return S.cats.filter(function (c) { return c.kind === kind; }).map(function (c) {
        return '<button type="button" class="fdm-chip' + (selArr.indexOf(c.key) > -1 ? ' on' : '') + '" data-ck="' + esc(c.key) + '">' + esc(c.label_zh || c.label_en) + '</button>';
      }).join('');
    };
    var hoursRow = function (d, label) {
      var rs = hours[d] || [];
      var r1 = rs[0] || ['', ''], r2 = rs[1] || ['', ''];
      return '<div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;flex-wrap:wrap;"><span style="font-size:14px;color:#897783;width:40px;">' + label + '</span>' +
        '<input class="fdm-h" data-day="' + d + '" data-i="0" data-e="0" type="time" value="' + esc(r1[0] || '') + '">' +
        '<input class="fdm-h" data-day="' + d + '" data-i="0" data-e="1" type="time" value="' + esc(r1[1] || '') + '">' +
        '<input class="fdm-h" data-day="' + d + '" data-i="1" data-e="0" type="time" value="' + esc(r2[0] || '') + '">' +
        '<input class="fdm-h" data-day="' + d + '" data-i="1" data-e="1" type="time" value="' + esc(r2[1] || '') + '">' +
        '</div>';
    };
    var ni = f.name_i18n || {}, di = f.description_i18n || {};

    box.innerHTML =
      '<div class="card" style="max-width:none;">' +
      '<h3>' + (isNew ? '新增餐厅' : '编辑餐厅') + '</h3>' +
      '<div class="fdm-row">' + ffield('ff-name', '餐厅名称 *（当地语言原文）', f.name, '260px') +
      ffield('ff-slug', 'slug（URL，留空自动生成）', f.slug, '220px') + '</div>' +
      '<div class="fdm-row">' + ffield('ff-name-zhs', '简中名称', ni['zh-Hans'] || '', '200px') +
      ffield('ff-name-zht', '繁中名称', ni['zh-Hant'] || '', '200px') +
      ffield('ff-name-ja', '日文名称', ni.ja || '', '200px') + '</div>' +
      '<div class="fdm-row" style="align-items:flex-start;">' +
      '<div class="fdm-field" style="flex:1 1 100%;"><label>介绍（当地语言）</label><textarea id="ff-desc" rows="3">' + esc(f.description || '') + '</textarea></div></div>' +
      '<div class="fdm-row"><div class="fdm-field" style="flex:1 1 100%;"><label>介绍 · 简中</label><textarea id="ff-desc-zhs" rows="2">' + esc(di['zh-Hans'] || '') + '</textarea></div></div>' +
      '<div class="fdm-row" style="align-items:flex-start;">' +
      '<div class="fdm-field" style="flex:1 1 300px;"><label>菜系（可多选）</label><div class="fdm-row" style="margin:0;" id="ff-cuisine">' + chipRow('cuisine', cuisine) + '</div></div>' +
      '<div class="fdm-field" style="flex:1 1 300px;"><label>类别（可多选）</label><div class="fdm-row" style="margin:0;" id="ff-food">' + chipRow('food_type', foods) + '</div></div></div>' +
      '<div class="fdm-row">' +
      '<div class="fdm-field"><label>国家/地区 *</label><select id="ff-country"><option value="">选择</option>' +
      S.regions.map(function (r) { return '<option value="' + esc(r.code) + '"' + (f.country_code === r.code ? ' selected' : '') + '>' + esc((r.name_zh || r.name) + ' · ' + r.code) + '</option>'; }).join('') +
      '</select></div>' +
      ffield('ff-region', '大区', f.region, '150px') + ffield('ff-state', '州/省', f.state_or_province, '150px') +
      ffield('ff-city', '城市', f.city, '150px') + ffield('ff-district', '街区', f.district, '130px') +
      ffield('ff-postal', '邮编/ZIP', f.postal_code, '120px') + '</div>' +
      '<div class="fdm-row">' + ffield('ff-addr', '地址（当地语言）', f.address, '420px') +
      ffield('ff-addr-en', '地址（英文，可选）', f.address_en, '420px') + '</div>' +
      '<div class="fdm-row">' + ffield('ff-lat', '纬度 Latitude', f.latitude, '170px') +
      ffield('ff-lng', '经度 Longitude', f.longitude, '170px') +
      '<div class="fdm-field"><label>&nbsp;</label><button type="button" class="fdm-btn ghost" id="ff-pin">📍 在地图上点选</button></div>' +
      '<div class="fdm-field"><label>&nbsp;</label><button type="button" class="fdm-btn ghost" id="ff-geocode">🔎 按地址查询坐标</button></div></div>' +
      '<div id="ff-mapbox" style="display:none;height:260px;border-radius:14px;border:1.5px solid #F9E5ED;overflow:hidden;margin-bottom:6px;"></div>' +
      '<div class="fdm-hint" id="ff-coordsys" style="margin:0 0 12px;display:none;"></div>' +
      '<div class="fdm-row">' + ffield('ff-phone', '电话', f.phone, '200px') +
      ffield('ff-web', '官网', f.website, '260px') + ffield('ff-menu', '菜单链接', f.menu_url, '260px') +
      '<div class="fdm-field"><label>价位</label><select id="ff-price">' +
      [1, 2, 3, 4].map(function (n) { return '<option value="' + n + '"' + (Number(f.price_level) === n ? ' selected' : '') + '>' + '$'.repeat(n) + '</option>'; }).join('') +
      '<option value="">—</option></select></div>' +
      ffield('ff-avg', '人均消费', f.average_price, '110px') +
      '<div class="fdm-field"><label>货币</label><select id="ff-cur">' +
      (S.regions.map(function (r) { return r.currency_code; }).filter(function (v, i, a) { return a.indexOf(v) === i; })).map(function (c) {
        return '<option value="' + esc(c) + '"' + ((f.currency_code || '') === c ? ' selected' : '') + '>' + esc(c) + '</option>';
      }).join('') + '</select></div></div>' +
      '<div class="fdm-row" style="align-items:flex-start;">' +
      '<div class="fdm-field" style="flex:1 1 100%;"><label>餐厅照片（可多选上传；第一张为封面）</label>' +
      '<div class="fdm-imgs" id="ff-imgs">' + imgs.map(function (u, i) {
        return '<div class="fdm-img"><img src="' + esc(u) + '"><button type="button" class="del" data-i="' + i + '" title="删除">✕</button></div>';
      }).join('') +
      '<button type="button" class="fdm-btn ghost" id="ff-img-add" style="width:96px;height:96px;border-radius:10px;">＋ 上传</button>' +
      '<input type="file" id="ff-img-file" accept="image/*" multiple style="display:none;">' +
      '</div></div></div>' +
      '<div class="fdm-row" style="align-items:flex-start;">' +
      '<div class="fdm-field" style="flex:1 1 380px;"><label>营业时间（当地时间，可留空；跨夜填如 18:00–01:00）</label>' +
      DAYS.map(function (d) { return hoursRow(d[0], d[1]); }).join('') + '</div>' +
      '<div class="fdm-field" style="flex:1 1 240px;">' + ffield('ff-tz', '时区（IANA，如 Asia/Tokyo）', f.timezone, '100%') +
      ffield('ff-parking', '停车信息', f.parking, '100%') + ffield('ff-resv', '预订信息', f.reservation, '100%') + '</div></div>' +
      '<div class="fdm-row">' +
      '<div class="fdm-field"><label>柚子评级（官方）</label><select id="ff-yuzu">' +
      '<option value="">未评级</option>' + [1, 2, 3, 4, 5].map(function (n) {
        return '<option value="' + n + '"' + (Number(f.yuzu_rating) === n ? ' selected' : '') + '>' + n + ' 个柚子</option>';
      }).join('') + '</select></div>' +
      '<div class="fdm-field" style="flex:1 1 280px;"><label>推荐理由（评级时展示）</label><input id="ff-ynote" value="' + esc(f.yuzu_note || '') + '"></div>' +
      ffield('ff-ysrc', '推荐来源', f.yuzu_source, '160px') +
      '<div class="fdm-field"><label>状态</label><select id="ff-status"><option value="published"' + (f.status !== 'hidden' ? ' selected' : '') + '>已发布</option><option value="hidden"' + (f.status === 'hidden' ? ' selected' : '') + '>隐藏</option></select></div>' +
      '<div class="fdm-field"><label>&nbsp;</label><button type="button" class="fdm-chip' + (f.is_featured ? ' on' : '') + '" id="ff-feat">⭐ 精选</button></div></div>' +
      '<div class="fdm-row">' +
      '<button type="button" class="fdm-btn" id="ff-save">保存</button>' +
      '<button type="button" class="fdm-btn ghost" id="ff-cancel">取消</button>' +
      '<span class="fdm-hint" id="ff-msg"></span></div>' +
      '</div>';

    // 交互
    box.querySelector('#ff-cuisine').onclick = function (e) { var b = e.target.closest('.fdm-chip'); if (b) b.classList.toggle('on'); };
    box.querySelector('#ff-food').onclick = function (e) { var b = e.target.closest('.fdm-chip'); if (b) b.classList.toggle('on'); };
    box.querySelector('#ff-feat').onclick = function (e) { e.target.closest('#ff-feat').classList.toggle('on'); };
    box.querySelector('#ff-country').onchange = function (e) {
      var reg = S.regions.filter(function (x) { return x.code === e.target.value; })[0];
      if (reg && !document.getElementById('ff-tz').value) document.getElementById('ff-tz').value = reg.timezone_default;
      if (reg && !document.getElementById('ff-cur').value) document.getElementById('ff-cur').value = reg.currency_code;
    };
    // 图片
    var imgsArr = imgs.slice();
    var paintImgs = function () {
      document.getElementById('ff-imgs').innerHTML = imgsArr.map(function (u, i) {
        return '<div class="fdm-img"><img src="' + esc(u) + '"><button type="button" class="del" data-i="' + i + '" title="删除">✕</button></div>';
      }).join('') + '<button type="button" class="fdm-btn ghost" id="ff-img-add" style="width:96px;height:96px;border-radius:10px;">＋ 上传</button><input type="file" id="ff-img-file" accept="image/*" multiple style="display:none;">';
      bindImgs();
    };
    var bindImgs = function () {
      document.getElementById('ff-img-add').onclick = function () { document.getElementById('ff-img-file').click(); };
      document.getElementById('ff-img-file').onchange = function (e) {
        var files = Array.prototype.slice.call(e.target.files || []);
        if (!files.length || typeof window.uploadShopFiles !== 'function') return;
        document.getElementById('ff-img-add').textContent = '上传中…';
        window.uploadShopFiles(files).then(function (urls) {
          imgsArr = imgsArr.concat(urls || []);
          document.getElementById('ff-img-add').textContent = '＋ 上传';
          paintImgs();
        }).catch(function () { document.getElementById('ff-img-add').textContent = '＋ 上传'; toast('图片上传失败'); });
      };
      box.querySelectorAll('#ff-imgs .del').forEach(function (b) {
        b.onclick = function () { imgsArr.splice(Number(b.getAttribute('data-i')), 1); paintImgs(); };
      });
    };
    bindImgs();
    // 地图点选（她 20261115 地图引擎任务书 §六）：按所选地区自动选引擎，CN 高德选点自动 GCJ-02→WGS-84
    function putEngineMarker(la, ln) {
      if (!S.mapAdapter) return;
      S.mapAdapter.clearMarkers();
      S.mapAdapter.addMarkers([{ id: 'pick', latitude: la, longitude: ln, yuzu_rating: 0, name: '' }], {});
    }
    function coordsysHint(a) {
      var el = document.getElementById('ff-coordsys');
      el.style.display = '';
      el.textContent = a.name === 'amap' ? '当前地图：高德 AMap · 显示 GCJ-02（选点会自动转回 WGS-84 保存）'
        : (a.name === 'google' ? '当前地图：Google Maps · WGS-84' : '当前地图：OpenStreetMap 降级 · WGS-84（未配置 Google/高德 Key）');
    }
    box.querySelector('#ff-pin').onclick = function () {
      var bx = document.getElementById('ff-mapbox');
      bx.style.display = '';
      var cc = document.getElementById('ff-country').value || '';
      var reg = S.regions.filter(function (x) { return x.code === cc; })[0];
      var la = Number(document.getElementById('ff-lat').value), ln = Number(document.getElementById('ff-lng').value);
      if (!(la && ln)) { la = reg ? Number(reg.map_center_lat) : 20; ln = reg ? Number(reg.map_center_lng) : 0; }
      if (S.mapAdapter) { S.mapAdapter.destroy(); S.mapAdapter = null; } // 每次打开按地区重建（避免引擎混用）
      if (!window.FoodieMapEngine) { toast('地图引擎脚本未加载'); return; }
      window.FoodieMapEngine.load({ el: bx, center: [la || 20, ln || 0], zoom: (document.getElementById('ff-lat').value ? 14 : (reg ? (reg.map_zoom || 4) : 2)), country: cc }).then(function (a) {
        S.mapAdapter = a;
        coordsysHint(a);
        if (document.getElementById('ff-lat').value) putEngineMarker(Number(document.getElementById('ff-lat').value), Number(document.getElementById('ff-lng').value));
        a.clickPoint(function (wla, wln) {
          document.getElementById('ff-lat').value = wla.toFixed(6);
          document.getElementById('ff-lng').value = wln.toFixed(6);
          putEngineMarker(wla, wln);
        });
      }).catch(function (er) { toast('地图加载失败: ' + (er && er.message || '')); });
    };
    box.querySelector('#ff-geocode').onclick = function () {
      var parts = [document.getElementById('ff-addr').value, document.getElementById('ff-city').value, document.getElementById('ff-postal').value, document.getElementById('ff-state').value].filter(Boolean).join(', ');
      if (!parts) { toast('先填地址再查询'); return; }
      var cc = document.getElementById('ff-country').value || '';
      document.getElementById('ff-msg').textContent = '坐标查询中…';
      var fill = function (la, ln, via) {
        document.getElementById('ff-lat').value = Number(la).toFixed(6);
        document.getElementById('ff-lng').value = Number(ln).toFixed(6);
        document.getElementById('ff-msg').textContent = '已按地址填入坐标（' + via + '；可点「在地图上点选」微调）';
        if (S.mapAdapter) { S.mapAdapter.flyTo(Number(la), Number(ln), 14); putEngineMarker(Number(la), Number(ln)); }
      };
      // CN 走高德地理编码（GCJ-02→WGS-84 入库），其余走 Nominatim（免费）
      if (cc === 'CN' && window.AMap && window.FoodieCoord) {
        window.AMap.plugin('AMap.Geocoder', function () {
          var g = new window.AMap.Geocoder({});
          g.getLocation(parts, function (status, result) {
            if (status === 'complete' && result.geocodes && result.geocodes[0] && result.geocodes[0].location) {
              var p = result.geocodes[0].location;
              var w = window.FoodieCoord.gcj2wgs(p.getLat(), p.getLng());
              fill(w[0], w[1], '高德 GCJ-02→WGS-84');
            } else { document.getElementById('ff-msg').textContent = '高德没查到这个地址，手动填或地图点选'; }
          });
        });
        return;
      }
      fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(parts)).then(function (r) { return r.json(); }).then(function (js) {
        if (js && js[0]) fill(js[0].lat, js[0].lon, 'Nominatim');
        else { document.getElementById('ff-msg').textContent = '没查到这个地址的坐标，手动填或地图点选'; }
      }).catch(function () { document.getElementById('ff-msg').textContent = '查询失败，手动填或地图点选'; });
    };
    box.querySelector('#ff-cancel').onclick = function () { S.editing = null; renderRests(); };
    box.querySelector('#ff-save').onclick = function () { saveRest(isNew); };
  }

  function saveRest(isNew) {
    var g = function (id) { return document.getElementById(id); };
    var name = (g('ff-name').value || '').trim();
    if (!name) { toast('餐厅名称必填'); return; }
    var cc = g('ff-country').value;
    if (!cc) { toast('选择国家/地区'); return; }
    var reg = S.regions.filter(function (x) { return x.code === cc; })[0];
    var hours = {};
    document.querySelectorAll('.fdm-h').forEach(function (inp) {
      var d = inp.getAttribute('data-day'), i = inp.getAttribute('data-i'), e = inp.getAttribute('data-e'), v = inp.value;
      if (!v) return;
      hours[d] = hours[d] || [[], []];
      hours[d][i] = hours[d][i] || [];
      hours[d][i][e === '0' ? 0 : 1] = v;
    });
    Object.keys(hours).forEach(function (d) { hours[d] = hours[d].filter(function (x) { return x.length === 2; }); if (!hours[d].length) delete hours[d]; });
    var body = {
      name: name,
      name_i18n: buildI18n(g('ff-name-zhs').value, g('ff-name-zht').value, g('ff-name-ja').value),
      slug: (g('ff-slug').value || '').trim() || F_slug(name),
      description: (g('ff-desc').value || '').trim(),
      description_i18n: (function (v) { return v.trim() ? { 'zh-Hans': v.trim() } : {}; })(g('ff-desc-zhs').value),
      country_code: cc,
      country_name: reg ? reg.name : '',
      region: (g('ff-region').value || '').trim(),
      state_or_province: (g('ff-state').value || '').trim(),
      city: (g('ff-city').value || '').trim(),
      district: (g('ff-district').value || '').trim(),
      postal_code: (g('ff-postal').value || '').trim(),
      address: (g('ff-addr').value || '').trim(),
      address_en: (g('ff-addr-en').value || '').trim(),
      latitude: g('ff-lat').value === '' ? null : Number(g('ff-lat').value),
      longitude: g('ff-lng').value === '' ? null : Number(g('ff-lng').value),
      phone: (g('ff-phone').value || '').trim(),
      website: (g('ff-web').value || '').trim(),
      menu_url: (g('ff-menu').value || '').trim(),
      cuisine: chipsOf('ff-cuisine'),
      food_categories: chipsOf('ff-food'),
      price_level: g('ff-price').value === '' ? null : Number(g('ff-price').value),
      average_price: g('ff-avg').value === '' ? null : Number(g('ff-avg').value),
      currency_code: g('ff-cur').value || '',
      images: imgsArrOf(),
      cover_image: imgsArrOf()[0] || '',
      hours: hours,
      timezone: (g('ff-tz').value || '').trim(),
      parking: (g('ff-parking').value || '').trim(),
      reservation: (g('ff-resv').value || '').trim(),
      yuzu_rating: g('ff-yuzu').value === '' ? null : Number(g('ff-yuzu').value),
      yuzu_note: (g('ff-ynote').value || '').trim(),
      yuzu_source: (g('ff-ysrc').value || '').trim(),
      yuzu_updated_at: g('ff-yuzu').value === '' ? null : new Date().toISOString(),
      yuzu_updated_by: adminEmail(),
      status: g('ff-status').value,
      is_featured: g('ff-feat').classList.contains('on'),
      source: isNew ? 'admin' : undefined
    };
    if (!body.currency_code && reg) body.currency_code = reg.currency_code;
    var done = function () {
      S.editing = null;
      loadAll().then(function () { showSub('rests'); toast('已保存'); });
    };
    // 重复检查：同名+同城市
    // 保存前检查经纬度有效性（她 20261115 地图引擎任务书 §六）
    if ((body.latitude == null) !== (body.longitude == null)) { toast('经纬度要一起填或一起留空'); return; }
    if (body.latitude != null && (body.latitude < -90 || body.latitude > 90)) { toast('纬度无效（范围 -90 ~ 90）'); return; }
    if (body.longitude != null && (body.longitude < -180 || body.longitude > 180)) { toast('经度无效（范围 -180 ~ 180）'); return; }
    var dup = S.rests.filter(function (x) {
      return (!isNew && x.id !== S.editing.id) || isNew;
    }).filter(function (x) { return x.name === body.name && x.city === body.city; })[0];
    if (dup && !window.confirm('发现疑似重复餐厅：「' + dup.name + '」（' + (dup.city || '—') + '）。仍要保存吗？')) return;
    var req;
    if (isNew) req = api('POST', 'food_restaurants', 'select=id', body);
    else req = api('PATCH', 'food_restaurants', 'id=eq.' + S.editing.id, body);
    req.then(done).catch(function (er) { toast('保存失败: ' + er.message); });
  }
  function F_slug(s) {
    var base = String(s || '').toLowerCase().trim()
      .replace(/[\u3000-\u303f・、。！？「」『』（）]/g, '')
      .replace(/[^\w\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]+/g, '-')
      .replace(/^-+|-+$/g, '').slice(0, 60) || 'restaurant';
    return base;
  }
  function buildI18n(zhs, zht, ja) {
    var o = {};
    if (zhs) o['zh-Hans'] = zhs.trim();
    if (zht) o['zh-Hant'] = zht.trim();
    if (ja) o.ja = ja.trim();
    return o;
  }
  function chipsOf(id) {
    return Array.prototype.slice.call(document.getElementById(id).querySelectorAll('.fdm-chip.on')).map(function (b) { return b.getAttribute('data-ck'); });
  }
  function imgsArrOf() {
    return Array.prototype.slice.call(document.querySelectorAll('#ff-imgs .fdm-img img')).map(function (im) { return im.getAttribute('src'); });
  }
  function adminEmail() {
    try {
      var s = JSON.parse(localStorage.getItem('yuki-admin-session') || 'null') || {};
      return s.email || '';
    } catch (e) { return ''; }
  }

  /* ── ③ 地区管理 ── */
  function renderRegions() {
    var box = document.getElementById('fdm-sub-regions');
    box.innerHTML =
      '<div class="fdm-row"><button type="button" class="fdm-btn" id="fr-add">+ 新增地区</button><span class="fdm-hint">新国家只要加一行，前台/地图/货币/时区自动跟随</span></div>' +
      '<table class="fdm-tbl"><thead><tr><th>代码</th><th>名称</th><th>简中</th><th>货币</th><th>默认时区</th><th>地图中心</th><th>启用</th><th>⋮</th></tr></thead><tbody>' +
      S.regions.map(function (r) {
        return '<tr data-rid="' + esc(r.id) + '"><td>' + esc(r.code) + '</td><td>' + esc(r.name) + '</td><td>' + esc(r.name_zh) + '</td><td>' + esc(r.currency_code) + '</td><td>' + esc(r.timezone_default) + '</td><td style="font-size:13px;">' + (r.map_center_lat != null ? Number(r.map_center_lat).toFixed(1) + ', ' + Number(r.map_center_lng).toFixed(1) : '—') + '</td><td>' + (r.enabled ? '✓' : '✕') + '</td>' +
        '<td><button type="button" class="fdm-chip" data-fr="edit">编辑</button> <button type="button" class="fdm-chip" data-fr="del" style="color:#C4636E;">删</button></td></tr>';
      }).join('') + '</tbody></table>' +
      '<div id="fr-form"></div>';
    document.getElementById('fr-add').onclick = function () { regionForm(null); };
    box.querySelectorAll('[data-fr]').forEach(function (b) {
      b.onclick = function () {
        var id = b.closest('tr').getAttribute('data-rid');
        var r = S.regions.filter(function (x) { return x.id === id; })[0];
        if (b.getAttribute('data-fr') === 'edit') regionForm(r);
        else if (window.confirm('删除地区「' + r.name + '」？（餐厅数据不会被删，但会失去地区关联显示）')) {
          api('DELETE', 'food_regions', 'id=eq.' + id).then(function () { toast('已删除'); loadAll().then(render); }).catch(function (er) { toast('失败: ' + er.message); });
        }
      };
    });
  }
  function regionForm(r) {
    var f = r || {};
    var el = document.getElementById('fr-form');
    el.innerHTML = '<div class="card" style="margin-top:14px;max-width:none;"><h3>' + (r ? '编辑地区' : '新增地区') + '</h3><div class="fdm-row">' +
      field('fr-code', '代码 *（ISO，如 US/JP/TW/CN/CA）', f.code, '120px') +
      field('fr-name', '英文名 *', f.name, '170px') + field('fr-zh', '简中名 *', f.name_zh, '140px') +
      field('fr-cur', '货币 *（ISO 4217）', f.currency_code || 'USD', '110px') +
      field('fr-tz', '默认时区 *（IANA）', f.timezone_default || 'UTC', '200px') +
      field('fr-lang', '当地语言', f.lang_local || 'en', '110px') + '</div><div class="fdm-row">' +
      field('fr-lat', '地图中心纬度', f.map_center_lat, '150px') + field('fr-lng', '地图中心经度', f.map_center_lng, '150px') +
      field('fr-zoom', '默认缩放', f.map_zoom == null ? 4 : f.map_zoom, '110px', '', 'number') +
      '<div class="fdm-field"><label>&nbsp;</label><button type="button" class="fdm-chip' + (f.enabled !== false ? ' on' : '') + '" id="fr-en">启用</button></div>' +
      field('fr-sort', '排序', f.sort == null ? 100 : f.sort, '90px', '', 'number') + '</div>' +
      '<div class="fdm-row"><button type="button" class="fdm-btn" id="fr-save">保存</button><button type="button" class="fdm-btn ghost" id="fr-cancel">取消</button></div></div>';
    el.querySelector('#fr-en').onclick = function (e) { e.target.classList.toggle('on'); };
    el.querySelector('#fr-cancel').onclick = function () { el.innerHTML = ''; };
    el.querySelector('#fr-save').onclick = function () {
      var g = function (id) { return el.querySelector('#' + id).value.trim(); };
      if (!g('fr-code') || !g('fr-name')) { toast('代码和英文名必填'); return; }
      var body = {
        code: g('fr-code').toUpperCase(), name: g('fr-name'), name_zh: g('fr-zh'),
        currency_code: g('fr-cur').toUpperCase(), timezone_default: g('fr-tz'),
        lang_local: g('fr-lang') || 'en',
        map_center_lat: g('fr-lat') === '' ? 20 : Number(g('fr-lat')),
        map_center_lng: g('fr-lng') === '' ? 0 : Number(g('fr-lng')),
        map_zoom: g('fr-zoom') === '' ? 4 : Number(g('fr-zoom')),
        enabled: el.querySelector('#fr-en').classList.contains('on'),
        sort: g('fr-sort') === '' ? 100 : Number(g('fr-sort'))
      };
      var req = r ? api('PATCH', 'food_regions', 'id=eq.' + r.id, body) : api('POST', 'food_regions', 'select=id', body);
      req.then(function () { el.innerHTML = ''; loadAll().then(render); toast('已保存'); }).catch(function (er) { toast('失败: ' + er.message); });
    };
  }
  function field(id, label, val, w, ph, type) {
    return '<div class="fdm-field"' + (w ? ' style="width:' + w + ';"' : '') + '><label>' + label + '</label><input id="' + id + '" type="' + (type || 'text') + '" value="' + esc(val == null ? '' : val) + '"></div>';
  }

  /* ── ④ 分类管理 ── */
  function renderCats() {
    var box = document.getElementById('fdm-sub-cats');
    box.innerHTML =
      '<div class="fdm-row"><button type="button" class="fdm-btn" id="fc-add">+ 新增分类</button><span class="fdm-hint">菜系（cuisine）/ 类别（food_type）；停用的分类不再出现在筛选里，历史数据不受影响</span></div>' +
      '<table class="fdm-tbl"><thead><tr><th>类型</th><th>key</th><th>英文</th><th>中文</th><th>排序</th><th>启用</th><th>⋮</th></tr></thead><tbody>' +
      S.cats.map(function (c) {
        return '<tr data-rid="' + esc(c.id) + '"><td>' + (c.kind === 'cuisine' ? '菜系' : '类别') + '</td><td>' + esc(c.key) + '</td><td>' + esc(c.label_en) + '</td><td>' + esc(c.label_zh) + '</td><td>' + c.sort + '</td><td>' + (c.enabled ? '✓' : '✕') + '</td>' +
        '<td><button type="button" class="fdm-chip" data-fc="edit">编辑</button> <button type="button" class="fdm-chip" data-fc="del" style="color:#C4636E;">删</button></td></tr>';
      }).join('') + '</tbody></table><div id="fc-form"></div>';
    document.getElementById('fc-add').onclick = function () { catForm(null); };
    box.querySelectorAll('[data-fc]').forEach(function (b) {
      b.onclick = function () {
        var id = b.closest('tr').getAttribute('data-rid');
        var c = S.cats.filter(function (x) { return x.id === id; })[0];
        if (b.getAttribute('data-fc') === 'edit') catForm(c);
        else if (window.confirm('删除分类「' + (c.label_zh || c.label_en) + '」？（餐厅上已挂的这个分类不会被删，只是失去筛选入口）')) {
          api('DELETE', 'food_categories', 'id=eq.' + id).then(function () { toast('已删除'); loadAll().then(render); }).catch(function (er) { toast('失败: ' + er.message); });
        }
      };
    });
  }
  function catForm(c) {
    var f = c || {};
    var el = document.getElementById('fc-form');
    el.innerHTML = '<div class="card" style="margin-top:14px;max-width:none;"><h3>' + (c ? '编辑分类' : '新增分类') + '</h3><div class="fdm-row">' +
      '<div class="fdm-field"><label>类型 *</label><select id="fc-kind"><option value="cuisine"' + (f.kind === 'cuisine' ? ' selected' : '') + '>菜系</option><option value="food_type"' + (f.kind === 'food_type' ? ' selected' : '') + '>类别</option></select></div>' +
      field('fc-key', 'key *（小写英文，如 hot_pot）', f.key, '160px') +
      field('fc-en', '英文 *', f.label_en, '160px') + field('fc-zh', '中文 *', f.label_zh, '140px') +
      field('fc-sort', '排序', f.sort == null ? 100 : f.sort, '90px', '', 'number') +
      '<div class="fdm-field"><label>&nbsp;</label><button type="button" class="fdm-chip' + (f.enabled !== false ? ' on' : '') + '" id="fc-en">启用</button></div></div>' +
      '<div class="fdm-row"><button type="button" class="fdm-btn" id="fc-save">保存</button><button type="button" class="fdm-btn ghost" id="fc-cancel">取消</button></div></div>';
    el.querySelector('#fc-en').onclick = function (e) { e.target.classList.toggle('on'); };
    el.querySelector('#fc-cancel').onclick = function () { el.innerHTML = ''; };
    el.querySelector('#fc-save').onclick = function () {
      var g = function (id) { return el.querySelector('#' + id).value.trim(); };
      if (!g('fc-key') || !g('fc-en')) { toast('key 和英文必填'); return; }
      var body = { kind: g('fc-kind'), key: g('fc-key'), label_en: g('fc-en'), label_zh: g('fc-zh'), sort: g('fc-sort') === '' ? 100 : Number(g('fc-sort')), enabled: el.querySelector('#fc-en').classList.contains('on') };
      var req = c ? api('PATCH', 'food_categories', 'id=eq.' + c.id, body) : api('POST', 'food_categories', 'select=id', body);
      req.then(function () { el.innerHTML = ''; loadAll().then(render); toast('已保存'); }).catch(function (er) { toast('失败: ' + er.message); });
    };
  }

  /* ── 地图服务配置（她 20261115 地图引擎任务书 §四/§五）：key 存库不入 git ── */
  function renderMapCfg() {
    var box = document.getElementById('fdm-sub-mapcfg');
    box.innerHTML = '<div class="card" style="max-width:none;"><h3>地图服务配置</h3>' +
      '<p class="fdm-hint" style="margin:0 0 12px;">海外用 Google Maps，中国大陆用高德；这里填的都是「前端 Key」（要在 Google Cloud / 高德开放平台设置 HTTP Referrer 白名单 + API 范围 + 配额限制，不会存任何服务器端秘密）。没填 Key 的地区自动降级 OpenStreetMap，页面不会报错。</p>' +
      '<div id="mapcfg-form"><span class="fdm-hint">读取配置中…</span></div></div>';
    api('GET', 'foodie_map_config', 'select=*&limit=1').then(function (rows) {
      var c = (rows && rows[0]) || null;
      S.cfgRow = c;
      var f = function (id, label, val, ph) {
        return '<div class="fdm-field" style="flex:1 1 380px;"><label>' + label + '</label><input id="' + id + '" value="' + esc(val == null ? '' : val) + '" placeholder="' + esc(ph || '') + '" autocomplete="off"></div>';
      };
      var html = '<div class="fdm-row">' +
        f('mc-gkey', 'Google Maps JS API Key（海外引擎；另需配 mapId）', c && c.google_key, 'AIza…') +
        f('mc-gmid', 'Google mapId（AdvancedMarkerElement 需要；Cloud Console → Maps Management 创建）', c && c.google_map_id, '') + '</div>' +
        '<div class="fdm-row">' +
        f('mc-akey', '高德 Web端(JS API) Key（中国大陆引擎）', c && c.amap_key, '') +
        f('mc-asec', '高德安全密钥 securityJsCode（与 Key 配套）', c && c.amap_security, '') + '</div>' +
        '<div class="fdm-row"><button type="button" class="fdm-btn" id="mc-save">保存</button>' +
        '<button type="button" class="fdm-btn ghost" id="mc-test">预览地图页</button>' +
        '<span class="fdm-hint" id="mc-msg"></span></div>' +
        '<p class="fdm-hint" style="margin:8px 0 0;">Key 申请指引：Google Cloud Console → 启用 Maps JavaScript API → 建立 Key → Application restrictions 选 HTTP referrers，加 https://yukicheng.com/* 和 http://localhost:8901/*；API restrictions 只留 Maps JavaScript API。高德开放平台 → 创建「Web端(JS API)」Key → 安全密钥一并显示；安全域名填 yukicheng.com。</p>';
      document.getElementById('mapcfg-form').innerHTML = html;
      document.getElementById('mc-save').onclick = function () {
        var g = function (id) { return (document.getElementById(id).value || '').trim(); };
        var body = {
          google_key: g('mc-gkey'), google_map_id: g('mc-gmid'),
          amap_key: g('mc-akey'), amap_security: g('mc-asec')
        };
        var msg = document.getElementById('mc-msg');
        msg.textContent = '保存中…';
        var req = S.cfgRow && S.cfgRow.id
          ? api('PATCH', 'foodie_map_config', 'id=eq.' + S.cfgRow.id, body)
          : api('POST', 'foodie_map_config', 'select=id', body);
        req.then(function () { msg.textContent = '已保存 ✓ 前台地图页刷新后生效'; renderMapCfg(); })
          .catch(function (er) { msg.textContent = '失败: ' + er.message.slice(0, 120); });
      };
      document.getElementById('mc-test').onclick = function () { window.open('/foodie/map/', '_blank'); };
    }).catch(function (er) {
      document.getElementById('mapcfg-form').innerHTML = '<span style="color:#C4636E;font-size:15px;">foodie_map_config 表还不存在——先执行 sql/foodie-map-engine.sql（地图引擎升级的数据库迁移）。</span>';
    });
  }

  /* ── ⑤ 数据 CSV ── */
  var CSV_COLS = ['name', 'slug', 'country_code', 'city', 'region', 'state_or_province', 'district', 'postal_code', 'address', 'address_en', 'latitude', 'longitude', 'cuisine', 'food_categories', 'price_level', 'average_price', 'currency_code', 'phone', 'website', 'menu_url', 'timezone', 'parking', 'reservation', 'yuzu_rating', 'yuzu_note', 'status', 'is_featured'];
  function csvEsc(v) {
    var s = v == null ? '' : String(v);
    if (Array.isArray(v)) s = v.join('|');
    if (/[",\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }
  function renderData() {
    var box = document.getElementById('fdm-sub-data');
    box.innerHTML =
      '<div class="card" style="max-width:none;"><h3>导出 CSV</h3>' +
      '<div class="fdm-row"><button type="button" class="fdm-btn" id="fd-exp">导出全部餐厅 CSV</button><span class="fdm-hint">数组列用 | 分隔；导出文件按当前数据生成</span></div>' +
      '<h3 style="margin-top:18px;">导入 CSV</h3>' +
      '<p class="fdm-hint" style="margin:0 0 8px;">表头请用：<br><code style="font-size:12px;word-break:break-all;">' + CSV_COLS.join(',') + '</code><br>cuisine/food_categories 用 | 分隔多个值；已存在的 slug 会跳过并计入错误报告。</p>' +
      '<div class="fdm-row"><label class="fdm-btn" style="cursor:pointer;display:inline-flex;align-items:center;">选择 CSV 文件<input type="file" id="fd-imp-file" accept=".csv,text/csv" hidden></label><span class="fdm-hint" id="fd-imp-name">未选择文件</span></div>' +
      '<div class="fdm-row"><button type="button" class="fdm-btn" id="fd-imp">开始导入</button><span class="fdm-hint" id="fd-imp-msg"></span></div>' +
      '<div id="fd-imp-report" style="font-size:14px;color:#897783;max-height:220px;overflow-y:auto;"></div></div>';
    document.getElementById('fd-exp').onclick = function () {
      var head = CSV_COLS.join(',');
      var lines = S.rests.map(function (r) {
        return CSV_COLS.map(function (c) { return csvEsc(r[c]); }).join(',');
      });
      var blob = new Blob(['\uFEFF' + head + '\n' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'food-restaurants-' + new Date().toISOString().slice(0, 10) + '.csv';
      a.click();
      toast('已导出 ' + S.rests.length + ' 家');
    };
    var csvText = '';
    document.getElementById('fd-imp-file').onchange = function (e) {
      var f = e.target.files[0];
      document.getElementById('fd-imp-name').textContent = f ? '已选择：' + f.name : '未选择文件';
      if (!f) return;
      var fr = new FileReader();
      fr.onload = function () { csvText = String(fr.result || ''); document.getElementById('fd-imp-msg').textContent = '已读取 ' + f.name + '，点「开始导入」'; };
      fr.readAsText(f, 'utf-8');
    };
    document.getElementById('fd-imp').onclick = function () {
      if (!csvText) { toast('先选择 CSV 文件'); return; }
      parseCsv(csvText).then(function (rows) { importRows(rows); });
    };
  }
  function parseCsv(text) {
    return new Promise(function (resolve) {
      var rows = [], row = [], cur = '', inQ = false;
      text = text.replace(/^\uFEFF/, '');
      for (var i = 0; i < text.length; i++) {
        var ch = text[i];
        if (inQ) {
          if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
          else cur += ch;
        } else if (ch === '"') inQ = true;
        else if (ch === ',') { row.push(cur); cur = ''; }
        else if (ch === '\n' || ch === '\r') {
          if (ch === '\r' && text[i + 1] === '\n') i++;
          row.push(cur); cur = '';
          if (row.length > 1 || row[0] !== '') rows.push(row);
          row = [];
        } else cur += ch;
      }
      if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
      resolve(rows);
    });
  }
  function importRows(rows) {
    if (!rows.length) return;
    var head = rows[0].map(function (x) { return x.trim(); });
    var idx = {};
    CSV_COLS.forEach(function (c) { idx[c] = head.indexOf(c); });
    var dataRows = rows.slice(1).filter(function (r) { return r.join('').trim(); });
    var ok = 0, skip = [], fail = [];
    var existingSlugs = {};
    S.rests.forEach(function (r) { existingSlugs[r.slug] = 1; });
    var jobs = dataRows.map(function (r, ri) {
      return function () {
        var get = function (c) { return idx[c] > -1 ? (r[idx[c]] || '').trim() : ''; };
        var slug = get('slug') || F_slug(get('name'));
        if (!get('name')) { fail.push('第' + (ri + 2) + '行: 缺 name'); return Promise.resolve(); }
        if (existingSlugs[slug]) { skip.push('第' + (ri + 2) + '行: slug「' + slug + '」已存在'); return Promise.resolve(); }
        existingSlugs[slug] = 1;
        var num = function (c) { return get(c) === '' ? null : Number(get(c)); };
        var body = {
          name: get('name'), slug: slug, country_code: get('country_code'),
          city: get('city'), region: get('region'), state_or_province: get('state_or_province'),
          district: get('district'), postal_code: get('postal_code'), address: get('address'), address_en: get('address_en'),
          latitude: num('latitude'), longitude: num('longitude'),
          cuisine: get('cuisine') ? get('cuisine').split('|').map(function (x) { return x.trim(); }).filter(Boolean) : [],
          food_categories: get('food_categories') ? get('food_categories').split('|').map(function (x) { return x.trim(); }).filter(Boolean) : [],
          price_level: num('price_level'), average_price: num('average_price'), currency_code: get('currency_code'),
          phone: get('phone'), website: get('website'), menu_url: get('menu_url'),
          timezone: get('timezone'), parking: get('parking'), reservation: get('reservation'),
          yuzu_rating: [1, 2, 3].indexOf(Number(get('yuzu_rating'))) > -1 ? Number(get('yuzu_rating')) : null,
          yuzu_note: get('yuzu_note'), status: get('status') === 'hidden' ? 'hidden' : 'published',
          is_featured: get('is_featured') === 'true', source: 'csv'
        };
        return api('POST', 'food_restaurants', 'select=id', body).then(function () { ok++; })
          .catch(function (er) { fail.push('第' + (ri + 2) + '行: ' + er.message.slice(0, 80)); });
      };
    });
    var run = jobs.reduce(function (p, j) { return p.then(j); }, Promise.resolve());
    run.then(function () {
      document.getElementById('fd-imp-report').innerHTML =
        '<p>导入完成：成功 ' + ok + '，跳过 ' + skip.length + '，失败 ' + fail.length + '</p>' +
        (skip.concat(fail).map(function (x) { return '<p>' + esc(x) + '</p>'; }).join(''));
      loadAll().then(function () { if (S.sub === 'data') render(); toast('导入完成'); });
    });
  }

  window.AdminFoodie = { boot: boot };
})();
