/* ═══════════════════════════════════════════════════════════════════
   Foodie Map · 地图引擎适配层（她 20261115 地图引擎任务书 §一/§四/§五）
   · 海外（US/JP/TW/CA 及未来海外地区）→ Google Maps JS API
   · 中国大陆 CN → 高德地图 JS API（GCJ-02 显示）
   · 未配置 Key / SDK 加载失败 → Leaflet + OSM 降级兜底（页面不崩）
   · 配置来源：foodie_map_config 表（site 级单行；key 为前端 key，
     靠 HTTP Referrer 限制 + API 范围限制保护，不存任何服务器端秘密）
   · 引擎选择：country_code === 'CN' → amap，其余 → google；
     Global 全球图默认 Google。
   · 业务代码只通过 FoodieMapEngine.load(cfg).then(adapter) 调用，
     不直接依赖任何一家 SDK。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── 配置读取（foodie_map_config 单行）── */
  function fetchConfig() {
    var base = (window.DB_BASE || 'https://ukxrvcptwhlwvdanovgd.supabase.co/rest/v1/');
    var hdrs = window.DB_HEADERS || {};
    return fetch(base + 'foodie_map_config?select=*&limit=1', { headers: { 'apikey': hdrs.apikey || '', 'Authorization': hdrs.Authorization || '' } })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rows) { return (rows && rows[0]) || null; })
      .catch(function () { return null; });
  }

  /* ── SDK 动态加载（去重 + 失败回退）── */
  var sdkCache = {};
  function loadScriptOnce(key, url, check) {
    if (sdkCache[key]) return sdkCache[key];
    sdkCache[key] = new Promise(function (resolve, reject) {
      if (check()) { resolve(); return; }
      var s = document.createElement('script');
      s.src = url;
      s.async = true;
      s.onload = function () {
        // bootstrap onload ≠ 子库就绪（如 Google marker 库异步填充），轮询到 check() 通过为止；
        // 否则首访构造适配器时库未就绪抛错 → 误降级 Leaflet（她 20261117 实测 Global 首载降级的真根因）
        var t0 = Date.now();
        (function poll() {
          if (check()) { resolve(); return; }
          if (Date.now() - t0 > 15000) { sdkCache[key] = null; reject(new Error('SDK ready timeout: ' + key)); return; }
          setTimeout(poll, 60);
        })();
      };
      s.onerror = function () { sdkCache[key] = null; reject(new Error('SDK load failed: ' + key)); };
      document.head.appendChild(s);
    });
    return sdkCache[key];
  }

  function loadGoogle(key) {
    if (!key) return Promise.reject(new Error('no google key'));
    return loadScriptOnce('google', 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(key) + '&v=weekly&loading=async&libraries=marker&callback=__foodieGmapsReady', function () {
      return !!(window.google && window.google.maps && window.google.maps.marker && window.google.maps.marker.AdvancedMarkerElement);
    });
  }

  function loadAmap(cfg) {
    if (!cfg || !cfg.amap_key) return Promise.reject(new Error('no amap key'));
    window._AMapSecurityConfig = { securityJsCode: cfg.amap_security || '' }; // 高德 JS API 2.0 明文安全密钥机制（官方设计，靠域名白名单保护）
    return loadScriptOnce('amap', 'https://webapi.amap.com/maps?v=2.0&key=' + encodeURIComponent(cfg.amap_key) + '&plugin=AMap.MarkerCluster&callback=__foodieAmapReady', function () {
      return !!(window.AMap && window.AMap.Map);
    });
  }

  window.__foodieGmapsReady = function () {};
  window.__foodieAmapReady = function () {};

  /* ── 品牌柚子 pin DOM（Google/高德共用；Leaflet 用自己的 divIcon）── */
  var YUZU_SVG_LOCAL = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="13.2" r="8.2" fill="#FCECF2" stroke="#F48FB1" stroke-width="1.6"/><circle cx="9.2" cy="11" r="1" fill="#F6C5D7"/><circle cx="13.6" cy="12.4" r="1" fill="#F6C5D7"/><circle cx="11" cy="15.6" r="1" fill="#F6C5D7"/><path d="M12 5c0-1.8 1.2-3 3-3" stroke="#B98598" stroke-width="1.5" stroke-linecap="round"/><path d="M15 2c2.6.4 4.4 2 4.6 4.4-2.5.3-4.5-1.4-4.6-4.4z" fill="#F6C5D7" stroke="#B98598" stroke-width="1.1"/></svg>';
  function pinDom(rating) {
    var svg = YUZU_SVG_LOCAL.replace('<svg ', '<svg style="width:22px;height:22px;" ');
    var el = document.createElement('span');
    el.className = 'fd-pin-engine';
    el.style.cssText = 'display:flex;width:34px;height:34px;border-radius:50% 50% 50% 4px;transform:rotate(-45deg);background:#FFFFFF;border:2px solid #F48FB1;box-shadow:0 3px 8px rgba(180,120,150,.3);align-items:center;justify-content:center;';
    var inner = document.createElement('span');
    inner.style.cssText = 'transform:rotate(45deg);display:flex;';
    inner.innerHTML = svg;
    el.appendChild(inner);
    return el;
  }

  /* ── Google 适配器 ── */
  function GoogleAdapter(opts) {
    var self = this;
    self.name = 'google';
    self.el = opts.el;
    self.el.innerHTML = ''; // 防容器重复初始化（教训【52】）
    self.map = new google.maps.Map(opts.el, {
      mapId: opts.mapId || undefined, // AdvancedMarkerElement 必需；未配置 mapId 时降级提示由调用方处理
      center: { lat: opts.center[0], lng: opts.center[1] },
      zoom: opts.zoom,
      zoomControl: true,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      clickableIcons: false,
      disableDefaultUI: false
    });
    self.markers = {};
    self.cluster = null;
    self.info = null;
  }
  GoogleAdapter.prototype.setChanged = function () {
    if (this._onChange) this._onChange();
  };
  GoogleAdapter.prototype.setView = function (lat, lng, zoom) {
    this.map.setCenter({ lat: lat, lng: lng });
    if (zoom != null) this.map.setZoom(zoom);
  };
  GoogleAdapter.prototype.flyTo = function (lat, lng, zoom, done) {
    var self = this;
    self.setView(lat, lng, Math.max(self.map.getZoom() || 0, zoom || 0));
    if (done) setTimeout(done, 500); // google.setCenter 无动画回调，用短延时
  };
  GoogleAdapter.prototype.getZoom = function () { return this.map.getZoom(); };
  GoogleAdapter.prototype.clearMarkers = function () {
    var self = this;
    Object.keys(self.markers).forEach(function (k) { self.markers[k].map = null; });
    self.markers = {};
    if (self.cluster) { self.cluster.clearMarkers(); self.cluster.setMap(null); self.cluster = null; }
    if (self.info) { self.info.close(); self.info = null; }
  };
  GoogleAdapter.prototype.addMarkers = function (rows, handlers) {
    var self = this;
    handlers = handlers || {};
    var markers = [];
    rows.forEach(function (r) {
      if (r.latitude == null || r.longitude == null) return;
      var m = new google.maps.marker.AdvancedMarkerElement({
        map: self.map,
        position: { lat: Number(r.latitude), lng: Number(r.longitude) },
        content: pinDom(r.yuzu_rating),
        title: r.name || ''
      });
      if (handlers.onMarkerClick) {
        m.addListener('click', function () { handlers.onMarkerClick(r); });
      }
      if (handlers.popHtml) {
        m.addListener('click', function () { self.openPopup(r, handlers.popHtml(r)); });
      }
      self.markers[r.id] = m;
      markers.push(m);
    });
    if (window.markerClusterer && markers.length) {
      self.cluster = new markerClusterer.MarkerClusterer({
        map: self.map,
        markers: markers,
        maxZoom: 15,
        renderer: {
          render: function (_ref, stats, opt) {
            var count = _ref.count;
            var el = document.createElement('div');
            el.className = 'fd-cluster-engine';
            el.style.cssText = 'background:#F6C5D7;color:#B98598;border:2px solid #FFFFFF;border-radius:999px;padding:4px 11px;font:600 14px inherit;font-family:inherit;box-shadow:0 3px 8px rgba(180,120,150,.3);';
            el.textContent = count;
            return new google.maps.marker.AdvancedMarkerElement({ position: _ref.position, content: el, zIndex: 1000 + count });
          }
        }
      });
    }
  };
  GoogleAdapter.prototype.openPopup = function (r, html) {
    if (!this.info) this.info = new google.maps.InfoWindow({ maxWidth: 250 });
    this.info.setContent(html);
    this.info.open({ map: this.map, anchor: this.markers[r.id] });
  };
  GoogleAdapter.prototype.openAt = function (r) { /* popup 由 addMarkers 的 click 处理 */ };
  GoogleAdapter.prototype.on = function (ev, cb) {
    if (ev === 'change') google.maps.event.addListener(this.map, 'idle', cb);
  };
  GoogleAdapter.prototype.clickPoint = function (cb) {
    var self = this;
    if (this._clickListener) google.maps.event.removeListener(this._clickListener);
    this._clickListener = this.map.addListener('click', function (e) {
      cb(e.latLng.lat(), e.latLng.lng()); // WGS-84（Google Maps 原生坐标系，无需转换）
    });
  };
  GoogleAdapter.prototype.destroy = function () {
    try {
      this.clearMarkers();
      if (this._clickListener) google.maps.event.removeListener(this._clickListener);
      if (google.maps.event) google.maps.event.clearInstanceListeners(this.map);
    } catch (e) {}
    this.el.innerHTML = '';
  };

  /* ── 高德适配器（显示 GCJ-02；出入坐标统一在适配层转换）── */
  function AMapAdapter(opts) {
    this.name = 'amap';
    this.el = opts.el;
    this.el.innerHTML = ''; // 防容器重复初始化（教训【52】）
    this.map = new AMap.Map(opts.el, {
      center: opts.center, // 调用方传入时已是 GCJ-02
      zoom: opts.zoom,
      zooms: [3, 19],
      mapStyle: 'amap://styles/whitesmoke', // 最接近浅粉视觉的官方浅色底
      isHotspot: false,
      showIndoorMap: false
    });
    this.markers = {};
    this.cluster = null;
    this.info = null;
  }
  AMapAdapter.prototype.setView = function (lat, lng, zoom) {
    var g = window.FoodieCoord.wgs2gcj(lat, lng);
    this.map.setCenter([g[1], g[0]]);
    if (zoom != null) this.map.setZoom(zoom);
  };
  AMapAdapter.prototype.flyTo = function (lat, lng, zoom, done) {
    var g = window.FoodieCoord.wgs2gcj(lat, lng);
    this.map.setZoomAndCenter(Math.max(this.map.getZoom() || 0, zoom || 0), [g[1], g[0]], false, 500);
    if (done) setTimeout(done, 550);
  };
  AMapAdapter.prototype.getZoom = function () { return Math.round(this.map.getZoom() || 0); };
  AMapAdapter.prototype.clearMarkers = function () {
    Object.keys(this.markers).forEach(function (k) { this.markers[k].setMap(null); }, this);
    this.markers = {};
    if (this.cluster) { this.cluster.setMap(null); this.cluster = null; }
    if (this.info) { this.info.close(); this.info = null; }
  };
  AMapAdapter.prototype.addMarkers = function (rows, handlers) {
    var self = this;
    handlers = handlers || {};
    var markers = [];
    rows.forEach(function (r) {
      if (r.latitude == null || r.longitude == null) return;
      var g = window.FoodieCoord.wgs2gcj(Number(r.latitude), Number(r.longitude)); // 入库 WGS-84 → 显示 GCJ-02
      var m = new AMap.Marker({
        position: [g[1], g[0]],
        content: pinDom(r.yuzu_rating),
        anchor: 'bottom-center',
        title: r.name || '',
        zIndex: 10 + (Number(r.yuzu_rating) || 0)
      });
      if (handlers.popHtml || handlers.onMarkerClick) {
        m.on('click', function () {
          if (handlers.popHtml) self.openPopup(r, handlers.popHtml(r));
          if (handlers.onMarkerClick) handlers.onMarkerClick(r);
        });
      }
      self.markers[r.id] = m;
      markers.push(m);
    });
    if (markers.length && window.AMap && window.AMap.MarkerCluster) {
      self.cluster = new AMap.MarkerCluster(self.map, markers.map(function (m) { return m.getPosition(); }), {
        gridSize: 60,
        maxZoom: 15,
        renderMarker: function (ctx) { /* 单点已由 marker content 决定，保留默认 */ },
        renderClusterMarker: function (ctx) {
          var el = document.createElement('div');
          el.style.cssText = 'background:#F6C5D7;color:#B98598;border:2px solid #FFFFFF;border-radius:999px;padding:4px 11px;font:600 14px/1.4 inherit;font-family:inherit;box-shadow:0 3px 8px rgba(180,120,150,.3);';
          el.textContent = ctx.count;
          var d = document.createElement('div');
          d.appendChild(el);
          ctx.marker.setContent(d);
          ctx.marker.setAnchor('center');
        }
      });
    }
  };
  AMapAdapter.prototype.openPopup = function (r, html) {
    if (!this.info) this.info = new AMap.InfoWindow({ isCustom: true, offset: new AMap.Pixel(0, -36) });
    var wrap = document.createElement('div');
    wrap.className = 'fd-amap-pop';
    wrap.style.cssText = 'background:#FFFFFF;border:1.5px solid #F9E5ED;border-radius:12px;padding:10px 14px;box-shadow:0 8px 24px rgba(180,120,150,.2);font-family:inherit;';
    wrap.innerHTML = html;
    wrap.addEventListener('click', function (e) {
      var a = e.target.closest('a[data-no-translate]');
      if (a) e.stopPropagation();
    });
    var g = window.FoodieCoord.wgs2gcj(Number(r.latitude), Number(r.longitude));
    this.info.setContent(wrap);
    this.info.open(this.map, [g[1], g[0]]);
  };
  AMapAdapter.prototype.openAt = function (r) {};
  AMapAdapter.prototype.on = function (ev, cb) {
    if (ev === 'change') this.map.on('moveend', cb);
  };
  AMapAdapter.prototype.clickPoint = function (cb) {
    var self = this;
    this.map.off('click');
    this.map.on('click', function (e) {
      // AMap click 返回 GCJ-02，转回 WGS-84 入库
      var wgs = window.FoodieCoord.gcj2wgs(e.lnglat.getLat(), e.lnglat.getLng());
      cb(wgs[0], wgs[1]);
    });
  };
  AMapAdapter.prototype.destroy = function () {
    try {
      this.clearMarkers();
      this.map.destroy();
    } catch (e) {}
    this.el.innerHTML = '';
  };

  /* ── Leaflet 降级适配器（无 Key 时兜底；接口与上面一致）── */
  function LeafletAdapter(opts) {
    this.name = 'leaflet';
    this.el = opts.el;
    this.el.innerHTML = '';
    if (this.el._leaflet_id != null) delete this.el._leaflet_id; // innerHTML 清不掉 Leaflet 的判重标记，必须删属性（教训【52】真根因）
    this.map = L.map(opts.el, { worldCopyJump: true }).setView(opts.center, opts.zoom);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(this.map);
    // 聚合库可选：地图页有 leaflet.markercluster；详情页等未加载时直接散点标记
    this.cluster = (typeof L.markerClusterGroup === 'function')
      ? L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 42 })
      : null;
    if (this.cluster) this.map.addLayer(this.cluster);
    this.markers = {};
  }
  LeafletAdapter.prototype.setView = function (lat, lng, zoom) {
    this.map.setView([lat, lng], zoom != null ? zoom : this.map.getZoom());
  };
  LeafletAdapter.prototype.flyTo = function (lat, lng, zoom, done) {
    this.map.flyTo([lat, lng], Math.max(this.map.getZoom(), zoom || 0), { duration: .6 });
    if (done) setTimeout(done, 650);
  };
  LeafletAdapter.prototype.getZoom = function () { return this.map.getZoom(); };
  LeafletAdapter.prototype.clearMarkers = function () {
    if (this.cluster) this.cluster.clearLayers();
    else Object.keys(this.markers).forEach(function (k) { this.map.removeLayer(this.markers[k]); }, this);
    this.markers = {};
  };
  LeafletAdapter.prototype.addMarkers = function (rows, handlers) {
    var self = this;
    handlers = handlers || {};
    var group = [];
    rows.forEach(function (r) {
      if (r.latitude == null || r.longitude == null) return;
      var svg = YUZU_SVG_LOCAL.replace('<svg ', '<svg style="width:22px;height:22px;" ');
      var icon = L.divIcon({
        className: 'fd-pin',
        html: '<span style="display:flex;width:34px;height:34px;border-radius:50% 50% 50% 4px;transform:rotate(-45deg);background:#FFFFFF;border:2px solid #F48FB1;box-shadow:0 3px 8px rgba(180,120,150,.3);align-items:center;justify-content:center;"><span style="transform:rotate(45deg);display:flex;">' + svg + '</span></span>',
        iconSize: [34, 34], iconAnchor: [17, 34], popupAnchor: [0, -30]
      });
      var m = L.marker([r.latitude, r.longitude], { icon: icon });
      if (handlers.popHtml) m.bindPopup(handlers.popHtml(r), { className: 'fd-pop', maxWidth: 240 });
      if (handlers.onMarkerClick) m.on('click', function () { handlers.onMarkerClick(r); });
      self.markers[r.id] = m;
      group.push(m);
    });
    if (this.cluster) this.cluster.addLayers(group);
    else group.forEach(function (m) { m.addTo(this.map); }, this);
  };
  LeafletAdapter.prototype.openPopup = function (r) {
    var m = this.markers[r.id];
    if (m) m.openPopup();
  };
  LeafletAdapter.prototype.openAt = function (r) { this.openPopup(r); };
  LeafletAdapter.prototype.on = function (ev, cb) {
    if (ev === 'change') this.map.on('moveend', cb);
  };
  LeafletAdapter.prototype.clickPoint = function (cb) {
    var self = this;
    if (this._clickHandler) this.map.off('click', this._clickHandler);
    this._clickHandler = function (e) { cb(e.latlng.lat, e.latlng.lng); }; // Leaflet + OSM = WGS-84，直接入库
    this.map.on('click', this._clickHandler);
  };
  LeafletAdapter.prototype.destroy = function () {
    try { this.map.remove(); } catch (e) {} // 竞态时容器 DOM 可能已被新实例清空，remove 不许再抛（她 20261115 任务书 §一.5）
    this.el.innerHTML = '';
  };

  /* ── 对外接口 ── */
  window.FoodieMapEngine = {
    fetchConfig: fetchConfig,
    pinDom: pinDom,
    /* 决定某地区用哪个引擎；cfg 为空/缺 key 时一律 leaflet */
    pickEngine: function (country, cfg) {
      if (!cfg) return 'leaflet';
      if (country === 'CN') return cfg.amap_key ? 'amap' : 'leaflet';
      return cfg.google_key ? 'google' : 'leaflet';
    },
    /* 统一入口：加载引擎并创建适配器实例。cfg 缺省时自动 fetchConfig()。
       opts: { el, center:[lat,lng](WGS84), zoom, country, cfg }
       返回 Promise<adapter>；任何失败都回退 leaflet（页面不崩）。 */
    load: function (opts) {
      var self = this;
      var P = opts.cfg != null ? Promise.resolve(opts.cfg) : fetchConfig();
      return P.then(function (cfg) {
        opts.cfg = cfg;
        var engine = self.pickEngine(opts.country, cfg);
        if (engine === 'google') {
          opts.mapId = cfg.google_map_id || undefined; // GoogleAdapter 读 opts.mapId；调用方只传 cfg，必须在这里接上
          return loadGoogle(cfg.google_key).then(function () {
            return new GoogleAdapter(opts);
          });
        }
        if (engine === 'amap') {
          return loadAmap(cfg).then(function () {
            var o = Object.assign({}, opts);
            // 高德 center 需要 GCJ-02
            var g = window.FoodieCoord.wgs2gcj(opts.center[0], opts.center[1]);
            o.center = [g[1], g[0]];
            return new AMapAdapter(o);
          });
        }
        return new LeafletAdapter(opts);
      }).catch(function (er) {
        console.warn('[FoodieMapEngine] ' + opts.country + ' 引擎加载失败，降级 Leaflet:', er && er.message);
        return new LeafletAdapter(opts);
      });
    }
  };
})();
