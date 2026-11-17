/* ═══════════════════════════════════════════════════════════════════
   Foodie Map · 全球地图页逻辑（Phase 2 引擎适配版，她 20261115 任务书）
   地图: FoodieMapEngine 适配层 —— 海外 Google Maps / 中国大陆高德 /
         无 Key 时 Leaflet+OSM 降级兜底；业务代码不直接依赖任何一家 SDK。
   搜索: 先在已加载餐厅里本地匹配（名称/多语言名/地址/城市/邮编/菜系），
         没有结果时用 Nominatim 地理编码把地图带到对应位置（免费公共接口）。
   筛选: 菜系/类别/价位/柚子评级/地区 —— 全部本地计算，地图列表双向联动。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var F = window.FOODIE;
  if (!F) return;

  var E = window.FoodieMapEngine; // 适配层（foodie-map-engine.js）
  var adapter = null;             // 当前地图适配器实例
  var ALL = [];                   // 全部已发布餐厅
  var CATS = { cuisine: [], food_type: [] };
  var REGIONS = [];
  var FILTER = { country: '', q: '', cuisine: '', food: '', price: 0, yuzu: 0 };
  var GEO_BUSY = false;

  function popHtml(r) {
    var loc = [F.rCity(r), r.country_name].filter(Boolean).join(', ');
    return '<div class="fd-leaflet-pop" data-no-translate><b>' + F.esc(F.rName(r)) + '</b>' +
      (loc ? '<span style="color:#897783;font-size:13px;">' + F.esc(loc) + '</span><br>' : '') +
      F.yuzuHtml(r.yuzu_rating) +
      '<br><a href="' + F.esc(F.detailUrl(r)) + '">' + F.esc(F.t('seeAll')) + ' →</a></div>';
  }

  function passFilter(r) {
    if (FILTER.country && r.country_code !== FILTER.country) return false;
    if (FILTER.cuisine && !(r.cuisine || []).some(function (k) { return k === FILTER.cuisine; })) return false;
    if (FILTER.food && !(r.food_categories || []).some(function (k) { return k === FILTER.food; })) return false;
    if (FILTER.price && Number(r.price_level) !== FILTER.price) return false;
    if (FILTER.yuzu && Number(r.yuzu_rating) !== FILTER.yuzu) return false;
    if (FILTER.q) {
      var q = FILTER.q.toLowerCase();
      var hay = [r.name, JSON.stringify(r.name_i18n || {}), r.city, r.region, r.state_or_province,
                 r.district, r.postal_code, r.address, r.address_en, r.country_name, r.slug,
                 (r.cuisine || []).map(F.cuisineLabel).join(','),
                 (r.food_categories || []).map(function (k) { return F.catLabel('food_type', k); }).join(',')]
                .join(' ').toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return (r.latitude != null && r.longitude != null) || true; // 无坐标的餐厅只在列表显示
  }

  function current() { return ALL.filter(passFilter); }

  function renderList(rows) {
    var box = document.getElementById('fd-list');
    document.getElementById('fd-count').textContent = rows.length + ' ' + F.t('results');
    if (!rows.length) { box.innerHTML = '<div class="fd-empty">' + F.esc(F.t('noResult')) + '</div>'; return; }
    box.innerHTML = rows.map(function (r) {
      var img = F.imgOf(r);
      var loc = [F.rCity(r), r.country_name].filter(Boolean).join(', ');
      return '<a class="fd-card" href="#" data-rid="' + F.esc(r.id) + '" data-no-translate>' +
        '<div class="fd-card-img">' + (img ? '<img loading="lazy" src="' + F.esc(img) + '" alt="">' : '') + '</div>' +
        '<div class="fd-card-body">' +
          '<div class="fd-card-name">' + F.esc(F.rName(r)) + '</div>' +
          '<div class="fd-card-meta">' + F.yuzuHtml(r.yuzu_rating) + F.priceHtml(r) + '</div>' +
          (loc ? '<div class="fd-card-meta"><span class="fd-card-loc">' + F.esc(loc) + '</span></div>' : '') +
        '</div></a>';
    }).join('');
  }

  function renderMarkers(rows) {
    if (!adapter) return;
    adapter.clearMarkers();
    adapter.addMarkers(rows, {
      popHtml: popHtml,
      onMarkerClick: function (r) {
        // 标记点击：轻提示坐标系统（高德显示 GCJ-02）；链接点击由 popup 内 <a> 自行跳转
      }
    });
  }

  function flyTo(r) {
    if (r.latitude == null || !adapter) return;
    adapter.flyTo(Number(r.latitude), Number(r.longitude), 14, function () {
      adapter.openPopup(r, popHtml(r));
    });
  }

  function refresh() {
    var rows = current();
    renderList(rows);
    renderMarkers(rows);
  }

  /* ── 筛选 UI ── */
  function chip(label, on, val, kind) {
    return '<button type="button" class="fd-region-chip' + (on ? ' on' : '') + '" data-fk="' + kind + '" data-fv="' + F.esc(val) + '">' + F.esc(label) + '</button>';
  }
  // 仅用于站内静态可信 HTML（柚子 SVG，非用户输入）；用户数据一律走 chip() 转义
  function chipHtml(labelHtml, on, val, kind) {
    return '<button type="button" class="fd-region-chip' + (on ? ' on' : '') + '" data-fk="' + kind + '" data-fv="' + F.esc(val) + '">' + labelHtml + '</button>';
  }
  function renderFilters() {
    var catRow = function (kind) {
      var cur = kind === 'cuisine' ? FILTER.cuisine : FILTER.food;
      return CATS[kind].map(function (c) {
        var label = F.lang() === 'en' ? c.label_en : (c.label_zh || c.label_en);
        return chip(label, cur === c.key, c.key, kind);
      }).join('');
    };
    var priceRow = [1, 2, 3, 4].map(function (n) { return chip('$'.repeat(n), FILTER.price === n, n, 'price'); }).join('');
    var yuzuRow = [3, 2, 1].map(function (n) {
      return chipHtml('<span style="display:inline-flex;gap:1px;">' + F.yuzuHtml(n) + '</span>', FILTER.yuzu === n, n, 'yuzu');
    }).join('');
    document.getElementById('fd-f-cuisine').innerHTML = chip(F.t('cuisine'), false, '', 'cuisine-all') + catRow('cuisine');
    document.getElementById('fd-f-food').innerHTML = chip(F.t('foodType'), false, '', 'food-all') + catRow('food_type');
    document.getElementById('fd-f-price').innerHTML = '<span style="font-size:14px;color:var(--muted,#897783);align-self:center;">' + F.esc(F.t('price')) + '</span>' + priceRow;
    document.getElementById('fd-f-yuzu').innerHTML = '<span style="font-size:14px;color:var(--muted,#897783);align-self:center;">' + F.esc(F.t('rating')) + '</span>' + yuzuRow;
    document.getElementById('fd-f-clear').style.display = (FILTER.cuisine || FILTER.food || FILTER.price || FILTER.yuzu) ? '' : 'none';
  }

  function bindFilters() {
    document.getElementById('fd-filters').addEventListener('click', function (e) {
      var b = e.target.closest('[data-fk]');
      if (!b) return;
      var k = b.getAttribute('data-fk'), v = b.getAttribute('data-fv');
      if (k === 'cuisine-all') FILTER.cuisine = '';
      else if (k === 'food-all') FILTER.food = '';
      else if (k === 'cuisine') FILTER.cuisine = (FILTER.cuisine === v ? '' : v);
      else if (k === 'food') FILTER.food = (FILTER.food === v ? '' : v);
      else if (k === 'price') FILTER.price = (FILTER.price === Number(v) ? 0 : Number(v));
      else if (k === 'yuzu') FILTER.yuzu = (FILTER.yuzu === Number(v) ? 0 : Number(v));
      else if (k === 'clear') { FILTER.cuisine = FILTER.food = ''; FILTER.price = FILTER.yuzu = 0; }
      renderFilters();
      refresh();
    });
  }

  /* ── 地区 chips ── */
  function renderRegions() {
    var box = document.getElementById('fd-regions');
    var html = ['<button type="button" class="fd-region-chip' + (FILTER.country === '' ? ' on' : '') + '" data-rc="">' + F.esc(F.t('global')) + '</button>'];
    REGIONS.forEach(function (r) {
      var label = F.lang() === 'en' ? r.name : (r.name_zh || r.name);
      html.push('<button type="button" class="fd-region-chip' + (FILTER.country === r.code ? ' on' : '') + '" data-rc="' + F.esc(r.code) + '">' + F.esc(label) + '</button>');
    });
    box.innerHTML = html.join('');
  }
  function applyRegion(keepView) {
    var reg = REGIONS.filter(function (x) { return x.code === FILTER.country; })[0];
    renderRegions();
    refresh();
    // 她 20261115 任务书 §一.5：切换地区销毁旧地图实例并重建，避免事件堆积/内存泄漏
    buildMap(reg);
  }

  /* 创建/重建地图适配器：按地区自动选引擎（§一.4）*/
  function buildMap(reg) {
    var el = document.getElementById('fd-map');
    if (!el || !E) return;
    var center = reg ? [Number(reg.map_center_lat) || 20, Number(reg.map_center_lng) || 0] : [20, 0];
    var zoom = reg ? (Number(reg.map_zoom) || 4) : 2;
    if (adapter) { adapter.destroy(); adapter = null; } // 任务书 §一.5：销毁旧实例
    E.load({ el: el, center: center, zoom: zoom, country: FILTER.country, cfg: E._cfg || null }).then(function (a) {
      adapter = a;
      renderMarkers(current());
      // 引擎信息轻提示（§六：显示当前坐标系统）
      var st = document.getElementById('fd-status');
      if (st) {
        var label = a.name === 'amap' ? 'AMap · GCJ-02' : (a.name === 'google' ? 'Google Maps · WGS-84' : 'OSM · WGS-84');
        st.textContent = label;
        setTimeout(function () { if (st.textContent === label) st.textContent = ''; }, 2600);
      }
    }).catch(function () { /* load 内部已降级 leaflet，不会到这里 */ });
  }

  /* ── 搜索：本地餐厅优先，空结果走 Nominatim ── */
  function doSearch(q) {
    FILTER.q = q;
    var rows = current();
    refresh();
    if (rows.length) return;
    if (!q || GEO_BUSY) return;
    GEO_BUSY = true;
    document.getElementById('fd-status').textContent = '…';
    var cc = REGIONS.filter(function (x) { return x.code === FILTER.country; }).map(function (x) { return x.code.toLowerCase(); }).join(',');
    var url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(q) + (cc ? '&countrycodes=' + cc : '');
    fetch(url).then(function (r) { return r.json(); }).then(function (js) {
      if (js && js[0]) {
        if (adapter) adapter.flyTo(Number(js[0].lat), Number(js[0].lon), 12);
        document.getElementById('fd-status').textContent = '';
      } else {
        document.getElementById('fd-status').textContent = '';
      }
    }).catch(function () { document.getElementById('fd-status').textContent = ''; })
      .finally(function () { GEO_BUSY = false; });
  }

  function init() {
    if (!E) return; // 适配层未加载：不建图，列表照常渲染

    var qs = new URLSearchParams(location.search);
    if (qs.get('country')) FILTER.country = qs.get('country').toUpperCase();
    if (qs.get('q')) { var s = document.getElementById('fd-q'); s.value = qs.get('q'); }

    Promise.all([
      F.loadRegions().then(function (rs) { REGIONS = rs || []; }),
      F.loadCats().then(function (cs) {
        (cs || []).forEach(function (c) { (CATS[c.kind] = CATS[c.kind] || []).push(c); });
      }),
      F.restQuery('status=eq.published&select=' + encodeURIComponent(
        'id,slug,name,name_i18n,description,city,region,state_or_province,country_code,country_name,district,postal_code,address,address_en,latitude,longitude,cuisine,food_categories,price_level,average_price,currency_code,yuzu_rating,yuzu_note,cover_image,images'
      )).then(function (rows) { ALL = rows || []; }),
      E.fetchConfig().then(function (cfg) { E._cfg = cfg; }) // 地图服务配置（Google/高德 key）
    ]).then(function () {
      renderRegions();
      renderFilters();
      bindFilters();
      document.getElementById('fd-regions').onclick = function (e) {
        var b = e.target.closest('[data-rc]');
        if (!b) return;
        FILTER.country = b.getAttribute('data-rc') || '';
        applyRegion();
      };
      document.getElementById('fd-locate').onclick = function () {
        if (!navigator.geolocation || !adapter) return;
        navigator.geolocation.getCurrentPosition(function (p) {
          adapter.flyTo(p.coords.latitude, p.coords.longitude, 13);
        }, function () {}, { timeout: 8000 });
      };
      document.getElementById('fd-search-form').addEventListener('submit', function (e) {
        e.preventDefault();
        doSearch((document.getElementById('fd-q').value || '').trim());
      });
      document.getElementById('fd-list').addEventListener('click', function (e) {
        var a = e.target.closest('[data-rid]');
        if (!a) return;
        e.preventDefault();
        var r = ALL.filter(function (x) { return x.id === a.getAttribute('data-rid'); })[0];
        if (r) flyTo(r);
      });
      applyRegion(true);
      refresh();
      if (FILTER.q) doSearch(FILTER.q);
    });
  }


  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
