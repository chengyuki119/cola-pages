/* ═══════════════════════════════════════════════════════════════════
   Foodie Map · 餐厅详情页（Phase 1）
   · URL: /foodie/restaurant/?slug=xxx（404.html 会把 /foodie/restaurant/<slug> 转进来）
   · 营业时间按餐厅所在地时区显示；Open Now 只有时区+时间数据可靠时才计算。
   · 导航链接: 中国大陆用高德（坐标 WGS84→GCJ-02 转换），其他地区用 Google Maps。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var F = window.FOODIE;
  if (!F) return;

  var R = null;
  var miniMap = null;

  /* WGS-84 → GCJ-02（中国大陆坐标纠偏，公开算法） */
  function wgs2gcj(lat, lng) {
    var a = 6378245.0, ee = 0.00669342162296594323;
    function tLat(x, y) {
      var ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
      ret += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
      ret += (20.0 * Math.sin(y * Math.PI) + 40.0 * Math.sin(y / 3.0 * Math.PI)) * 2.0 / 3.0;
      ret += (160.0 * Math.sin(y / 12.0 * Math.PI) + 320 * Math.sin(y * Math.PI / 30.0)) * 2.0 / 3.0;
      return ret;
    }
    function tLng(x, y) {
      var ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
      ret += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
      ret += (20.0 * Math.sin(x * Math.PI) + 40.0 * Math.sin(x / 3.0 * Math.PI)) * 2.0 / 3.0;
      ret += (150.0 * Math.sin(x / 12.0 * Math.PI) + 300.0 * Math.sin(x / 30.0 * Math.PI)) * 2.0 / 3.0;
      return ret;
    }
    var dLat = tLat(lng - 105.0, lat - 35.0);
    var dLng = tLng(lng - 105.0, lat - 35.0);
    var radlat = lat / 180.0 * Math.PI;
    var magic = Math.sin(radlat);
    magic = 1 - ee * magic * magic;
    var sqrtmagic = Math.sqrt(magic);
    dLat = (dLat * 180.0) / ((a * (1 - ee)) / (magic * sqrtmagic) * Math.PI);
    dLng = (dLng * 180.0) / (a / sqrtmagic * Math.cos(radlat) * Math.PI);
    return [lat + dLat, lng + dLng];
  }

  function navUrl(r) {
    if (r.latitude == null) return '';
    if (r.country_code === 'CN') {
      var g = wgs2gcj(r.latitude, r.longitude);
      return 'https://uri.amap.com/navigation?to=' + g[1].toFixed(6) + ',' + g[0].toFixed(6) + ',' + encodeURIComponent(r.name || '') + '&mode=car&coordinate=gaode&callnative=1';
    }
    return 'https://www.google.com/maps/dir/?api=1&destination=' + r.latitude + ',' + r.longitude;
  }

  function infoItem(icon, label, valHtml) {
    if (!valHtml) return '';
    return '<div class="fd-info-item">' + icon + '<span><span class="fd-info-label">' + F.esc(label) + ':</span> ' + valHtml + '</span></div>';
  }
  var I = {
    pin: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.1-7-11a7 7 0 0 1 14 0c0 4.9-7 11-7 11z"/><circle cx="12" cy="10" r="2.6"/></svg>',
    phone: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 4.5C4 3.7 4.7 3 5.5 3h2L9 7 7 8.5a12 12 0 0 0 8.5 8.5L17 15l4 1.5v2c0 .8-.7 1.5-1.5 1.5C10.6 20 4 13.4 4 4.5z"/></svg>',
    web: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 3.8 5.6 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.6-3.8-9s1.3-6.5 3.8-9z"/></svg>',
    clock: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    car: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 16l1.5-5h11L19 16M6 16h12v3h-2v-1.5H8V19H6z"/><path d="M7.5 11l1.8-4h5.4l1.8 4"/></svg>',
    book: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 4h6a3 3 0 0 1 3 3v13a3 3 0 0 0-3-3H5zM19 4h-3.5A2.5 2.5 0 0 0 13 6.5V20a2.5 2.5 0 0 1 2.5-2.5H19z"/></svg>',
    yen: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 4l7 8m7-8-7 8m0 0v8m-4-3.5h8"/></svg>'
  };

  function render() {
    var r = R;
    var imgs = Array.isArray(r.images) ? r.images.filter(Boolean) : [];
    var cover = r.cover_image || imgs[0] || '';
    document.getElementById('fd-cover').innerHTML = cover ? '<img src="' + F.esc(cover) + '" alt="' + F.esc(F.rName(r)) + '">' : '';

    var open = F.isOpenNow(r);
    var cats = (r.cuisine || []).map(F.cuisineLabel).filter(Boolean);
    var foods = (r.food_categories || []).map(function (k) { return F.catLabel('food_type', k); }).filter(Boolean);
    var addr = (F.lang() === 'en' && r.address_en) ? r.address_en : r.address;
    var locBits = [r.district, r.city, r.region, r.state_or_province, r.postal_code, r.country_name].filter(Boolean);

    document.getElementById('fd-head').innerHTML =
      '<h1 class="fd-detail-name" data-no-translate>' + F.esc(F.rName(r)) + '</h1>' +
      '<div class="fd-detail-sub">' + F.yuzuHtml(r.yuzu_rating, true) +
        (cats.length ? '<span>' + F.esc(cats.join(' · ')) + '</span>' : '') +
        (foods.length ? '<span>' + F.esc(foods.join(' · ')) + '</span>' : '') +
        F.priceHtml(r) +
        (open !== null ? '<span class="fd-open-now ' + (open ? 'open' : 'closed') + '">' + F.esc(open ? F.t('openNow') : F.t('closedNow')) + '</span>' : '') +
      '</div>';

    if (r.yuzu_rating && r.yuzu_note) {
      document.getElementById('fd-rating').innerHTML =
        '<div class="fd-rating-row"><span style="flex-shrink:0;">' + F.yuzuHtml(r.yuzu_rating, true) + '</span>' +
        '<span class="fd-rating-note" data-no-translate>' + F.esc(r.yuzu_note) + '</span></div>';
    } else if (r.yuzu_rating) {
      document.getElementById('fd-rating').innerHTML = '<div class="fd-rating-row"><span style="flex-shrink:0;">' + F.yuzuHtml(r.yuzu_rating, true) + '</span><span class="fd-rating-note">' + F.esc(F.yuzuWord(r.yuzu_rating)) + '</span></div>';
    }

    document.getElementById('fd-desc').textContent = F.rDesc(r);

    var info = '';
    info += infoItem(I.pin, F.t('address'), addr ? F.esc(addr) + (locBits.length ? '<br><span style="color:var(--muted,#897783);font-size:13px;">' + F.esc(locBits.join(', ')) + '</span>' : '') : '');
    info += infoItem(I.yen, F.t('avgPrice'), r.average_price != null && r.average_price !== '' ? F.esc(F.money(r.average_price, r.currency_code)) : '');
    info += infoItem(I.phone, F.t('phone'), r.phone ? '<a href="tel:' + F.esc(r.phone) + '">' + F.esc(r.phone) + '</a>' : '');
    info += infoItem(I.web, F.t('website'), r.website ? '<a href="' + F.esc(r.website) + '" target="_blank" rel="noopener">' + F.esc(r.website.replace(/^https?:\/\//, '').slice(0, 40)) + '</a>' : '');
    info += infoItem(I.book, F.t('menu'), r.menu_url ? '<a href="' + F.esc(r.menu_url) + '" target="_blank" rel="noopener">' + F.esc(F.t('menu')) + ' →</a>' : '');
    info += infoItem(I.car, F.t('parking'), r.parking ? F.esc(r.parking) : '');
    info += infoItem(I.book, F.t('reservation'), r.reservation ? F.esc(r.reservation) : '');
    document.getElementById('fd-info').innerHTML = info;

    var hours = F.hoursHtml(r);
    document.getElementById('fd-hours').innerHTML = hours ? '<h2 class="fd-sec-title" style="font-size:18px;">' + F.esc(F.t('hours')) + '</h2>' + hours : '';

    var gallery = imgs.slice(cover && imgs[0] === cover ? 1 : 0);
    document.getElementById('fd-gallery').innerHTML = gallery.length
      ? '<h2 class="fd-sec-title" style="font-size:18px;">' + F.esc(F.t('photos')) + '</h2><div class="fd-gallery">' +
        gallery.map(function (u) { return '<img loading="lazy" src="' + F.esc(u) + '" alt="" data-gallery>'; }).join('') + '</div>'
      : '';

    var nav = navUrl(r);
    document.getElementById('fd-actions').innerHTML =
      (nav ? '<a class="fd-map-cta" href="' + F.esc(nav) + '" target="_blank" rel="noopener">' + F.esc(F.t('navigate')) + ' →</a>' : '') +
      '<button type="button" class="fd-map-cta" id="fd-share" style="cursor:pointer;">' + F.esc(F.t('share')) + '</button>';

    document.getElementById('fd-share').onclick = function () {
      var url = location.origin + F.detailUrl(r);
      if (navigator.share) { navigator.share({ title: F.rName(r), url: url }).catch(function () {}); return; }
      if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { toast(); });
      else location.href = url;
    };

    // 小地图
    if (miniMap) { miniMap.remove(); miniMap = null; }
    if (r.latitude != null && typeof L !== 'undefined') {
      miniMap = L.map('fd-mini-map', { scrollWheelZoom: false, attributionControl: true }).setView([r.latitude, r.longitude], 15);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(miniMap);
      L.marker([r.latitude, r.longitude]).addTo(miniMap);
      miniMap.on('click', function () { miniMap.scrollWheelZoom.enable(); });
    } else {
      document.getElementById('fd-mini-map').style.display = 'none';
    }

    document.getElementById('fd-error').style.display = 'none';
    document.getElementById('fd-page').style.display = '';

    // SEO 动态补全
    var name = F.rName(r);
    document.title = name + ' · Foodie Map · Snow Yuzu';
    var mDesc = document.querySelector('meta[name="description"]');
    if (mDesc) mDesc.setAttribute('content', (F.rDesc(r) || (locBits.join(', '))).slice(0, 150));
    var canon = document.querySelector('link[rel="canonical"]');
    if (canon) canon.setAttribute('href', 'https://yukicheng.com/foodie/restaurant/' + encodeURIComponent(r.slug || r.id));
  }

  function toast() {
    var d = document.createElement('div');
    d.className = 'fd-empty';
    d.style.cssText = 'position:fixed;left:50%;bottom:40px;transform:translateX(-50%);background:#FFFFFF;border:1.5px solid #F9E5ED;border-radius:999px;padding:10px 22px;font-size:15px;color:#B98598;box-shadow:0 8px 24px rgba(180,120,150,.2);z-index:99;';
    d.textContent = F.t('copied');
    document.body.appendChild(d);
    setTimeout(function () { d.remove(); }, 2200);
  }

  function init() {
    var qs = new URLSearchParams(location.search);
    var slug = (qs.get('slug') || '').replace(/\/+$/, '');
    if (!slug) { document.getElementById('fd-error').textContent = F.t('notFound'); document.getElementById('fd-error').style.display = ''; return; }
    F.restQuery('status=eq.published&select=*&slug=eq.' + encodeURIComponent(slug)).then(function (rows) {
      if (!rows.length) {
        // slug 未命中回退按 id 找一次（旧链接兼容）
        return F.restQuery("status=eq.published&select=*&id=eq." + encodeURIComponent(slug));
      }
      return rows;
    }).then(function (rows) {
      if (!rows || !rows.length) {
        document.getElementById('fd-error').textContent = F.t('notFound');
        document.getElementById('fd-error').style.display = '';
        return;
      }
      R = rows[0];
      F.loadCats().then(render);
      render();
    }).catch(function () {
      document.getElementById('fd-error').textContent = F.t('notFound');
      document.getElementById('fd-error').style.display = '';
    });

  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
