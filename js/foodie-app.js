/* ═══════════════════════════════════════════════════════════════════
   Foodie Map 全球美食地图 · 公共核心（Phase 1）
   · 语言: en / zh-Hans / zh-Hant / ja —— 页内四语切换，只作用于 foodie 内容；
     站点导航/页脚仍由 lang-path + YK18N 负责，互不干扰。
   · 数据: 复用 site-common 的 DB_BASE / DB_HEADERS（anon）。
   · 柚子评级: 品牌 SVG（不使用 emoji 充当品牌图标）。
   · 货币: 保存原始金额+货币代码，Intl 按地区货币格式化，不做数值混比。
   · 营业时间: 按餐厅所在地时区（hours 为当地时间，timezone 为 IANA）。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── 四语 ── */
  var LANGS = ['en', 'zh-Hans', 'zh-Hant', 'ja'];
  var LANG_LABELS = { en: 'English', 'zh-Hans': '简体中文', 'zh-Hant': '繁體中文', ja: '日本語' };
  var T = {
    discover:     { en: 'Discover', 'zh-Hans': '发现美食', 'zh-Hant': '發現美食', ja: 'グルメ探検' },
    map:          { en: 'Map', 'zh-Hans': '地图', 'zh-Hant': '地圖', ja: 'マップ' },
    foodieMap:    { en: 'Foodie Map', 'zh-Hans': '全球美食地图', 'zh-Hant': '全球美食地圖', ja: 'グルメマップ' },
    searchPh:     { en: 'Search restaurants, cuisines, cities…', 'zh-Hans': '搜索餐厅、菜系、城市…', 'zh-Hant': '搜尋餐廳、菜系、城市…', ja: 'レストラン・料理・都市を検索…' },
    global:       { en: 'Global', 'zh-Hans': '全球', 'zh-Hant': '全球', ja: '全世界' },
    yuzuPicks:    { en: 'Yuzu Picks', 'zh-Hans': '柚子推荐', 'zh-Hant': '柚子推薦', ja: '柚子のおすすめ' },
    editorsPicks: { en: "Editor's Picks", 'zh-Hans': '精选餐厅', 'zh-Hant': '精選餐廳', ja: '編集部イチオシ' },
    recently:     { en: 'Recently Added', 'zh-Hans': '最近上架', 'zh-Hant': '最近上架', ja: '新着レストラン' },
    seeAll:       { en: 'See all', 'zh-Hans': '查看全部', 'zh-Hant': '查看全部', ja: 'すべて見る' },
    openMap:      { en: 'Open the Foodie Map', 'zh-Hans': '打开美食地图', 'zh-Hant': '打開美食地圖', ja: 'マップを開く' },
    empty:        { en: 'No restaurants here yet — new finds are added all the time ♡', 'zh-Hans': '这里还没有餐厅，会不断补充新的发现 ♡', 'zh-Hant': '這裡還沒有餐廳，會不斷補充新的發現 ♡', ja: 'まだレストランがありません。これからどんどん追加します ♡' },
    noResult:     { en: 'Nothing matched — try another keyword or area.', 'zh-Hans': '没有找到匹配的餐厅，换个关键词或地区试试。', 'zh-Hant': '沒有找到匹配的餐廳，換個關鍵詞或地區試試。', ja: '該当するレストランがありません。キーワードを変えてお試しください。' },
    filters:      { en: 'Filters', 'zh-Hans': '筛选', 'zh-Hant': '篩選', ja: '絞り込み' },
    cuisine:      { en: 'Cuisine', 'zh-Hans': '菜系', 'zh-Hant': '菜系', ja: '料理の種類' },
    foodType:     { en: 'Food Type', 'zh-Hans': '类别', 'zh-Hant': '類別', ja: 'フードタイプ' },
    price:        { en: 'Price', 'zh-Hans': '价位', 'zh-Hant': '價位', ja: '価格帯' },
    rating:       { en: 'Yuzu Rating', 'zh-Hans': '柚子评级', 'zh-Hant': '柚子評級', ja: '柚子ランク' },
    clear:        { en: 'Clear', 'zh-Hans': '清除', 'zh-Hant': '清除', ja: 'クリア' },
    results:      { en: 'restaurants', 'zh-Hans': '家餐厅', 'zh-Hant': '家餐廳', ja: '件のレストラン' },
    openNow:      { en: 'Open now', 'zh-Hans': '营业中', 'zh-Hant': '營業中', ja: '営業中' },
    closedNow:    { en: 'Closed now', 'zh-Hans': '休息中', 'zh-Hant': '休息中', ja: '準備中・閉店' },
    hours:        { en: 'Hours', 'zh-Hans': '营业时间', 'zh-Hant': '營業時間', ja: '営業時間' },
    hoursTz:      { en: 'local time', 'zh-Hans': '当地时间', 'zh-Hant': '當地時間', ja: '現地時間' },
    address:      { en: 'Address', 'zh-Hans': '地址', 'zh-Hant': '地址', ja: '住所' },
    phone:        { en: 'Phone', 'zh-Hans': '电话', 'zh-Hant': '電話', ja: '電話' },
    website:      { en: 'Website', 'zh-Hans': '官网', 'zh-Hant': '官網', ja: '公式サイト' },
    menu:         { en: 'Menu', 'zh-Hans': '菜单', 'zh-Hant': '菜單', ja: 'メニュー' },
    parking:      { en: 'Parking', 'zh-Hans': '停车', 'zh-Hant': '停車', ja: '駐車場' },
    reservation:  { en: 'Reservation', 'zh-Hans': '预订', 'zh-Hant': '預訂', ja: '予約' },
    avgPrice:     { en: 'Average spend', 'zh-Hans': '人均消费', 'zh-Hant': '人均消費', ja: '平均予算' },
    navigate:     { en: 'Navigate', 'zh-Hans': '导航前往', 'zh-Hant': '導航前往', ja: 'ナビで行く' },
    share:        { en: 'Share', 'zh-Hans': '分享', 'zh-Hant': '分享', ja: 'シェア' },
    copied:       { en: 'Link copied ♡', 'zh-Hans': '链接已复制 ♡', 'zh-Hant': '連結已複製 ♡', ja: 'リンクをコピーしました ♡' },
    notFound:     { en: 'This restaurant is not here (or not published yet).', 'zh-Hans': '找不到这家餐厅（可能还没发布）。', 'zh-Hant': '找不到這家餐廳（可能還沒發布）。', ja: 'このレストランは見つかりません（未公開の可能性があります）。' },
    backFoodie:   { en: '← Foodie Map', 'zh-Hans': '← 美食地图', 'zh-Hant': '← 美食地圖', ja: '← グルメマップ' },
    yuzu1:        { en: 'Worth a stop if you are nearby.', 'zh-Hans': '值得顺路去吃。', 'zh-Hant': '值得順路去吃。', ja: '近くに寄ったら立ち寄りたい。' },
    yuzu2:        { en: 'Worth a detour.', 'zh-Hans': '值得专门绕路去吃。', 'zh-Hant': '值得專門繞路去吃。', ja: 'わざわざ足を運ぶ価値あり。' },
    yuzu3:        { en: 'Worth a special trip — highly recommended.', 'zh-Hans': '值得专程前往，强烈推荐。', 'zh-Hant': '值得專程前往，強烈推薦。', ja: 'はるばる行く価値あり、強くおすすめ。' },
    photos:       { en: 'Photos', 'zh-Hans': '照片', 'zh-Hant': '照片', ja: 'フォト' },
    myLocation:   { en: 'My location', 'zh-Hans': '我的位置', 'zh-Hant': '我的位置', ja: '現在地' }
  };
  var WEEK = { mon: 'mon', tue: 'tue', wed: 'wed', thu: 'thu', fri: 'fri', sat: 'sat', sun: 'sun' };
  var WEEK_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  var WEEK_EN = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
  var WEEK_ZH = { mon: '周一', tue: '周二', wed: '周三', thu: '周四', fri: '周五', sat: '周六', sun: '周日' };
  var WEEK_JA = { mon: '月曜', tue: '火曜', wed: '水曜', thu: '木曜', fri: '金曜', sat: '土曜', sun: '日曜' };

  function curLang() {
    return (window.YK && window.YK.isZh) ? 'zh-Hans' : 'en'; // 语言只随站点路径走（/zh/ = 简中，根路径 = 英文）；她 20261114 23:12 移除页内切换器
  }
  function t(key) {
    var row = T[key];
    if (!row) return '';
    var l = curLang();
    if (row[l]) return row[l];
    if (l === 'zh-Hant' && row['zh-Hans']) return row['zh-Hans']; // 繁體缺词回简中
    if (l === 'zh-Hans' && row['zh-Hant']) return row['zh-Hant'];
    return row.en || '';
  }

  /* ── 数据层 ── */
  /* 测试钩子：/foodie/?fdmock=1 —— SQL 未执行/想验 UI 时用内置样例数据（线上无参不受影响） */
  var MOCK = null;
  function mockData() {
    if (MOCK) return MOCK;
    var today = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date().getDay()];
    var hh = {};
    ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].forEach(function (d) { hh[d] = [['00:00', '23:59']]; });
    MOCK = {
      food_regions: [
        { code: 'US', name: 'United States', name_zh: '美国', currency_code: 'USD', timezone_default: 'America/Los_Angeles', map_center_lat: 39.5, map_center_lng: -98, map_zoom: 4, sort: 10, enabled: true },
        { code: 'JP', name: 'Japan', name_zh: '日本', currency_code: 'JPY', timezone_default: 'Asia/Tokyo', map_center_lat: 36.2, map_center_lng: 138.2, map_zoom: 5, sort: 20, enabled: true },
        { code: 'TW', name: 'Taiwan', name_zh: '台湾', currency_code: 'TWD', timezone_default: 'Asia/Taipei', map_center_lat: 23.7, map_center_lng: 121, map_zoom: 7, sort: 30, enabled: true }
      ],
      food_categories: [
        { kind: 'cuisine', key: 'chinese', label_en: 'Chinese', label_zh: '中餐' },
        { kind: 'cuisine', key: 'japanese', label_en: 'Japanese', label_zh: '日料' },
        { kind: 'cuisine', key: 'american', label_en: 'American', label_zh: '美式' },
        { kind: 'food_type', key: 'ramen', label_en: 'Ramen', label_zh: '拉面' },
        { kind: 'food_type', key: 'dessert', label_en: 'Dessert', label_zh: '甜品' },
        { kind: 'food_type', key: 'hot_pot', label_en: 'Hot Pot', label_zh: '火锅' }
      ],
      food_restaurants: [
        { id: 'm1', slug: 'mock-ramen-tokyo', name: '東京ラーメン街道', name_i18n: { 'zh-Hans': '东京拉面街道', 'zh-Hant': '東京拉麵街道' }, description: 'Mock 测试餐厅', description_i18n: { 'zh-Hans': '东京人气拉面（mock）' }, country_code: 'JP', country_name: 'Japan', city: 'Tokyo', address: '東京都渋谷区1-2-3', latitude: 35.6595, longitude: 139.7005, cuisine: ['japanese'], food_categories: ['ramen'], price_level: 2, average_price: 1200, currency_code: 'JPY', cover_image: '/cover.jpg', images: ['/cover.jpg', '/og-image.jpg'], hours: hh, timezone: 'Asia/Tokyo', yuzu_rating: 3, yuzu_note: 'Mock：值得专程前往', is_featured: true, status: 'published' },
        { id: 'm2', slug: 'mock-hotpot-irvine', name: ' Irvine Hot Pot 小锅', name_i18n: {}, description: '', country_code: 'US', country_name: 'United States', city: 'Irvine', state_or_province: 'California', postal_code: '92604', address: '123 Mock St', latitude: 33.6846, longitude: -117.8265, cuisine: ['chinese'], food_categories: ['hot_pot'], price_level: 2, average_price: 35.5, currency_code: 'USD', cover_image: '/avatar.jpg', images: ['/avatar.jpg'], hours: hh, timezone: 'America/Los_Angeles', yuzu_rating: 2, yuzu_note: '', is_featured: false, status: 'published' },
        { id: 'm3', slug: 'mock-cafe-taipei', name: '敦南小咖啡', name_i18n: { ja: '台北カフェ' }, description: '', country_code: 'TW', country_name: 'Taiwan', city: 'Taipei', address: '台北市大安區敦化南路一段', latitude: 25.0330, longitude: 121.5654, cuisine: [], food_categories: ['dessert'], price_level: 1, average_price: 180, currency_code: 'TWD', cover_image: '', images: [], hours: {}, timezone: '', yuzu_rating: null, is_featured: true, status: 'published' },
        { id: 'm4', slug: 'mock-burger-la', name: 'Sunset Burger', name_i18n: { 'zh-Hans': '日落汉堡' }, description: '', country_code: 'US', country_name: 'United States', city: 'Los Angeles', latitude: 34.0522, longitude: -118.2437, cuisine: ['american'], food_categories: [], price_level: 1, cover_image: '', images: [], hours: {}, timezone: '', yuzu_rating: 1, is_featured: false, status: 'hidden' }
      ]
    };
    return MOCK;
  }
  function api(path) {
    if (window.FOODIE_MOCK || /[?&]fdmock=1/.test(location.search)) {
      var tb = path.split('?')[0];
      var rows = (mockData()[tb] || []).slice();
      if (tb === 'food_restaurants' && /status=eq.published/.test(path)) rows = rows.filter(function (r) { return r.status === 'published'; });
      if (tb === 'food_restaurants' && /slug=eq\./.test(path)) {
        var sl = decodeURIComponent(/slug=eq\.([^&]+)/.exec(path)[1]);
        rows = rows.filter(function (r) { return r.slug === sl; });
      }
      return Promise.resolve(rows);
    }
    return fetch((window.DB_BASE || 'https://ukxrvcptwhlwvdanovgd.supabase.co/rest/v1/') + path, {
      headers: (window.DB_HEADERS || { apikey: '', Authorization: '' })
    }).then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)); })
      .catch(function (er) { return []; }); // 网络失败/表未建：显示空态而不是卡死
  }
  var CACHE = { regions: null, cats: null };
  function loadRegions() {
    if (CACHE.regions) return Promise.resolve(CACHE.regions);
    return api('food_regions?enabled=eq.true&order=sort.asc').then(function (rows) { CACHE.regions = rows || []; return CACHE.regions; });
  }
  function loadCats() {
    if (CACHE.cats) return Promise.resolve(CACHE.cats);
    return api('food_categories?enabled=eq.true&order=sort.asc').then(function (rows) { CACHE.cats = rows || []; return CACHE.cats; });
  }
  function restQuery(qs) { return api('food_restaurants?' + qs); }

  /* ── 多语言名称/介绍：缺词回退（zh-Hant ↔ zh-Hans ↔ 原文）── */
  function i18nPick(obj, lang) {
    if (!obj || typeof obj !== 'object') return '';
    if (obj[lang]) return obj[lang];
    if (lang === 'zh-Hant' && obj['zh-Hans']) return obj['zh-Hans'];
    if (lang === 'zh-Hans' && obj['zh-Hant']) return obj['zh-Hant'];
    return '';
  }
  function rName(r) { return i18nPick(r.name_i18n, curLang()) || r.name || ''; }
  function rDesc(r) { return i18nPick(r.description_i18n, curLang()) || r.description || ''; }
  function rCity(r) { return r.city || r.region || r.country_name || ''; }

  /* ── 柚子评级 SVG（品牌图标）── */
  var YUZU_SVG = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="13.2" r="8.2" fill="#FCECF2" stroke="#F48FB1" stroke-width="1.6"/><circle cx="9.2" cy="11" r="1" fill="#F6C5D7"/><circle cx="13.6" cy="12.4" r="1" fill="#F6C5D7"/><circle cx="11" cy="15.6" r="1" fill="#F6C5D7"/><path d="M12 5c0-1.8 1.2-3 3-3" stroke="#B98598" stroke-width="1.5" stroke-linecap="round"/><path d="M15 2c2.6.4 4.4 2 4.6 4.4-2.5.3-4.5-1.4-4.6-4.4z" fill="#F6C5D7" stroke="#B98598" stroke-width="1.1"/></svg>';
  function yuzuHtml(rating, big) {
    if (!rating) return '';
    var n = Math.max(1, Math.min(3, rating));
    var out = '';
    for (var i = 0; i < n; i++) out += YUZU_SVG;
    return '<span class="fd-yuzu' + (big ? ' fd-yuzu-lg' : '') + '" title="' + n + ' Yuzu">' + out + '</span>';
  }
  function yuzuWord(n) { return n === 1 ? t('yuzu1') : n === 2 ? t('yuzu2') : n === 3 ? t('yuzu3') : ''; }

  /* ── 货币/价格 ── */
  var CUR_LOCALE = { USD: 'en-US', JPY: 'ja-JP', TWD: 'zh-TW', CNY: 'zh-CN', CAD: 'en-CA' };
  function money(amount, code) {
    if (amount == null || amount === '' || isNaN(amount)) return '';
    var c = (code || 'USD').toUpperCase();
    try {
      return new Intl.NumberFormat(CUR_LOCALE[c] || 'en', { style: 'currency', currency: c, maximumFractionDigits: (c === 'JPY' || c === 'KRW') ? 0 : 2 }).format(Number(amount));
    } catch (e) { return c + ' ' + amount; }
  }
  function priceHtml(r) {
    var lvl = r.price_level ? '$'.repeat(r.price_level) : '';
    var avg = r.average_price != null && r.average_price !== '' ? money(r.average_price, r.currency_code) : '';
    var bits = [];
    if (lvl) bits.push('<span class="fd-price">' + esc(lvl) + '</span>');
    if (avg) bits.push('<span class="fd-cur">' + esc(avg) + '</span>');
    return bits.join('<span style="opacity:.5;"> · </span>');
  }

  /* ── 营业时间（当地时间 + 时区）── */
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function localNow(tz) {
    if (!tz) return null;
    try {
      var f = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
      var parts = {};
      f.formatToParts(new Date()).forEach(function (p) { parts[p.type] = p.value; });
      var wdMap = { Mon: 'mon', Tue: 'tue', Wed: 'wed', Thu: 'thu', Fri: 'fri', Sat: 'sat', Sun: 'sun' };
      return { wd: wdMap[parts.weekday] || 'mon', hm: pad2((Number(parts.hour) % 24)) + ':' + parts.minute };
    } catch (e) { return null; }
  }
  function hmToMin(s) { var m = /^(\d{1,2}):(\d{2})$/.exec(s || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : -1; }
  function isOpenNow(r) {
    var h = r && r.hours; if (!h || typeof h !== 'object') return null;
    var tz = r.timezone || (regionOf(r) || {}).timezone_default;
    var now = localNow(tz);
    if (!now) return null;
    var cur = hmToMin(now.hm); if (cur < 0) return null;
    var ranges = h[now.wd] || [];
    for (var i = 0; i < ranges.length; i++) {
      var a = hmToMin(ranges[i][0]), b = hmToMin(ranges[i][1]);
      if (a < 0 || b < 0) continue;
      if (b <= a) { if (cur >= a || cur < b) return true; } // 跨夜
      else if (cur >= a && cur < b) return true;
    }
    return false;
  }
  function regionOf(r) { return (CACHE.regions || []).filter(function (x) { return x.code === r.country_code; })[0] || null; }
  function hoursHtml(r) {
    var h = r && r.hours; if (!h || typeof h !== 'object' || !Object.keys(h).length) return '';
    var tz = r.timezone || (regionOf(r) || {}).timezone_default || '';
    var l = curLang();
    var wname = l === 'ja' ? WEEK_JA : (l === 'en' ? null : WEEK_ZH);
    var open = isOpenNow(r);
    var head = '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">';
    if (open !== null) head += '<span class="fd-open-now ' + (open ? 'open' : 'closed') + '">' + esc(open ? t('openNow') : t('closedNow')) + '</span>';
    head += '<span class="fd-h-tz">' + esc(tz ? (tz + ' · ' + t('hoursTz')) : '') + '</span></div>';
    var rows = WEEK_ORDER.map(function (d) {
      var ranges = h[d] || [];
      if (!ranges.length) return '';
      var txt = ranges.map(function (x) { return x[0] + '–' + x[1]; }).join(', ');
      var day = wname ? wname[d] : WEEK_EN[d];
      return '<div class="fd-hours-line"><span>' + esc(day) + '</span><span>' + esc(txt) + '</span></div>';
    }).join('');
    return head + rows;
  }

  /* ── 渲染小件 ── */
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function imgOf(r) {
    var arr = Array.isArray(r.images) ? r.images : [];
    return r.cover_image || arr[0] || '';
  }
  function catLabel(kind, key) {
    var c = (CACHE.cats || []).filter(function (x) { return x.kind === kind && x.key === key; })[0];
    return c ? (curLang() === 'en' ? c.label_en : (c.label_zh || c.label_en)) : key;
  }
  function cuisineLabel(key) { return catLabel('cuisine', key); }
  function firstCuisine(r) {
    var a = Array.isArray(r.cuisine) ? r.cuisine : [];
    return a.length ? cuisineLabel(a[0]) : '';
  }
  function detailUrl(r) {
    return (window.ykLink || function (x) { return x; })('/foodie/restaurant/?slug=' + encodeURIComponent(r.slug || r.id));
  }
  function cardHtml(r) {
    var img = imgOf(r);
    var loc = [rCity(r), r.country_name].filter(Boolean).join(', ');
    return '<a class="fd-card" href="' + esc(detailUrl(r)) + '" data-no-translate>' +
      '<div class="fd-card-img">' + (img ? '<img loading="lazy" src="' + esc(img) + '" alt="' + esc(rName(r)) + '">' : '') + '</div>' +
      '<div class="fd-card-body">' +
        '<div class="fd-card-name">' + esc(rName(r)) + '</div>' +
        '<div class="fd-card-meta">' + yuzuHtml(r.yuzu_rating) + (firstCuisine(r) ? '<span>' + esc(firstCuisine(r)) + '</span>' : '') + priceHtml(r) + '</div>' +
        (loc ? '<div class="fd-card-meta"><span class="fd-card-loc">' + esc(loc) + '</span></div>' : '') +
      '</div></a>';
  }

  /* 语言切换 UI 已按她 20261114 23:12 要求移除，语言随站点路径走；繁体/日文词典保留 */

  window.FOODIE = {
    LANGS: LANGS, LANG_LABELS: LANG_LABELS,
    lang: curLang, t: t, esc: esc,
    loadRegions: loadRegions, loadCats: loadCats, restQuery: restQuery, regionOf: regionOf,
    rName: rName, rDesc: rDesc, rCity: rCity, i18nPick: i18nPick,
    yuzuHtml: yuzuHtml, yuzuWord: yuzuWord, YUZU_SVG: YUZU_SVG,
    money: money, priceHtml: priceHtml,
    isOpenNow: isOpenNow, hoursHtml: hoursHtml, localNow: localNow,
    imgOf: imgOf, catLabel: catLabel, cuisineLabel: cuisineLabel, detailUrl: detailUrl, cardHtml: cardHtml,
    slugify: function (s) {
      var base = String(s || '').toLowerCase().trim()
        .replace(/[\u3000-\u303f・、。！？「」『』（）]/g, '')
        .replace(/[^\w\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]+/g, '-')
        .replace(/^-+|-+$/g, '').slice(0, 60) || 'restaurant';
      return base;
    }
  };
})();
