/* ═══════════ 全站统一汉堡菜单（唯一导航数据源 + 唯一渲染逻辑）═══════════
   她 20261117 02:59 任务书 PART B：汉堡式下拉导航改版
   - 默认顶栏只有 Logo（左）/ 购物车 · 账号按钮 · 汉堡（右），中间无导航文字
   - 点汉堡后在 Header 正下方从上往下展开整排导航（不再右侧滑出）
   - 桌面端横向多栏分组；手机端纵向分组可折叠；opacity + translateY 轻柔展开
   - 一个导航数据源（NAV + 数据库同步）、一个渲染逻辑，全站一致
   - 语言切换行在展开菜单顶部（lang-path.js 继续接管点击）
   - 顶栏账号按钮：未登录→账号页登录；已登录→RPC 专属确认后分流（专属→后台/买家→账户页）
   站点结构（根绝对路径，无 hash 路由）：
   / = 主页 · /photos/ = Photo Gallery · /bjd/ = BJD · /color-card/ = 色卡
   /shop/ = 小铺 · /askbox/ = 提问箱 · /admin.html = 后台 */
(function () {
  var LANG = (window.YK && window.YK.lang) || 'en'; // 语言由 URL 路径决定（/zh/ = 中文，根路径 = 英文）
  try { LANG = (window.YK && window.YK.lang) || localStorage.getItem('yuki-lang') || 'en'; } catch (e) {}
  function t(zh, en) { return LANG === 'en' ? en : zh; }

  // ── 唯一导航数据源：六栏分组（她 20261117 PART B §四）──
  // 具体路由以现有网站为准；权限过滤 permFilter 照旧（照片=任意登录；BJD/色卡/稿件=柚子专属确认后出现）
  var NAV = [ // 她 20261117 17:48 任务书：五栏 Home / My Shop / Collection / Explore / Account；All Commissions 归入 Collection 第四位，不再单独成栏
    { key: 'home', num: '01', zh: '首页', en: 'Home', url: '/', items: [
      { key: 'cal', zh: '日历 · 重要日子', en: 'Calendar', page: 'index', url: '/', scrollTo: 'home-cal', scroll: true },
      { key: 'about', zh: '关于 Snow Yuzu', en: 'About', page: 'about', url: '/about/' }
    ]},
    { key: 'shop', num: '02', zh: '我的小铺', en: 'My Shop', nav: 'shop', url: '/shop/', items: [
      { key: 'shop-main', zh: '小铺', en: 'My Shop', page: 'shop', url: '/shop/' },
      { key: 'howto', zh: '下单流程', en: 'How to Order', page: 'howto', url: '/how-to-order/' },
      { key: 'cart', zh: '购物车', en: 'Cart', page: 'shop', url: '/shop/?sec=cart', sec: 'cart', area: 'shop' },
      { key: 'orders', zh: '我的订单', en: 'My Orders', page: 'account', url: '/account/?sec=orders', sec: 'orders' }
    ]},
    { key: 'gallery', num: '03', zh: '收藏展示', en: 'Collection', nav: 'gallery', url: '/bjd/', items: [
      { key: 'bjd', zh: 'BJD', en: 'BJD', page: 'bjd', url: '/bjd/', area: 'bjd' },
      { key: 'cards', zh: '色卡', en: 'Color Cards', page: 'cards', url: '/color-card/', area: 'cards' },
      { key: 'photos', zh: '照片展示', en: 'Photo Gallery', page: 'photos', url: '/photos/', area: 'gallery' },
      { key: 'works-all', zh: '稿件展示', en: 'All Commissions', page: 'works', url: '/works/', area: 'works' }
    ]},
    { key: 'explore', num: '04', zh: '探索', en: 'Explore', nav: 'foodie', url: '/foodie/', items: [
      { key: 'foodie', zh: '美食地图', en: 'Foodie Map', page: 'foodie', url: '/foodie/', path: '/foodie/', area: 'foodie' },
      { key: 'foodiemap', zh: '地图找餐厅', en: 'Find Restaurants', page: 'foodie', url: '/foodie/map/', path: '/foodie/map/', area: 'foodie' },
      { key: 'yuzurec', zh: '柚子推荐', en: 'Yuki\'s Picks', page: 'foodie', url: '/foodie/?sec=yuzu', sec: 'yuzu', path: '/foodie/', area: 'foodie' }
    ]},
    { key: 'account', num: '05', zh: '账号', en: 'Account', url: '/account/', items: [
      { key: 'acct-profile', zh: '我的账号', en: 'My Account', page: 'account', url: '/account/' },
      { key: 'acct-reviews', zh: '我的评价', en: 'My Reviews', page: 'account', url: '/account/?sec=my-reviews', sec: 'my-reviews' },
      { key: 'acct-questions', zh: '我的提问', en: 'My Questions', page: 'account', url: '/account/?sec=my-questions', sec: 'my-questions' },
      { key: 'admin', zh: '管理后台', en: 'Admin', page: 'admin', url: '/admin.html', adminOnly: true } // 仅管理员可见（shop_is_admin 服务端判定）
    ]}
  ];

  // 当前页面 / 当前子区（?sec= / ?id= / ?card=）
  var QS = new URLSearchParams(location.search);
  function normPath(p) { // /zh/ 前缀先剥掉，页面判定与语言无关
    if (p === '/zh') p = '/';
    else if (p.indexOf('/zh/') === 0) p = p.slice(3);
    return p;
  }
  var curPage = (function () {
    var p = normPath(location.pathname);
    if (p.indexOf('/photos/') === 0) return 'photos';
    if (p.indexOf('/bjd/') === 0) return 'bjd';
    if (p.indexOf('/color-card/') === 0) return 'cards';
    if (p.indexOf('/works/') === 0) return 'works';
    if (p.indexOf('/shop/') === 0 || p.indexOf('/shop.html') === 0) return 'shop';
    if (p.indexOf('/foodie/') === 0) return 'foodie';
    if (p.indexOf('/askbox/') === 0) return 'askbox';
    if (p.indexOf('/about/') === 0) return 'about';
    if (p.indexOf('/account/') === 0) return 'account';
    if (p.indexOf('/how-to-order/') === 0) return 'howto';
    if (p.indexOf('/admin.html') === 0) return 'admin';
    return 'index';
  })();
  var curSec = QS.get('sec') || '';
  var curSubId = QS.get('id') != null ? QS.get('id') : (QS.get('card') != null ? QS.get('card') : '');
  // 是否真是首页（curPage 会把 policies/faq/brand 等归到 'index'，不能用它判定）
  var isHomePage = (function () { return normPath(location.pathname) === '/' || normPath(location.pathname) === '/index.html'; })();

  function hrefOf(item) {
    // 导航链接跟随语言路径：英文根路径 / /zh/ 前缀
    var u = (typeof window.ykLink === 'function') ? window.ykLink(item.url) : item.url;
    return u;
  }
  function itemMatchesCurrent(it) {
    if (it.page !== curPage) return false;
    if (it.path && normPath(location.pathname) !== it.path) return false;
    if (it.sec) return it.sec === curSec && !curSubId;
    if (/(^|\?|&)id=/.test(it.url)) return curSubId !== '' && QS.get('id') === curSubId && it.page === 'bjd';
    if (/(^|\?|&)card=/.test(it.url)) return curSubId !== '' && QS.get('card') === curSubId && it.page === 'cards';
    return !curSec && !curSubId;
  }

  function el(html) {
    var d = document.createElement('div');
    d.innerHTML = html.trim();
    return d.firstChild;
  }
  function span(zh, en) {
    return '<span data-zh="' + zh + '" data-en="' + en + '">' + t(zh, en) + '</span>';
  }

  // ── 会话读取（购物车 badge / 账号按钮共用）──
  function readSession() {
    var u = null, m = null;
    try { u = JSON.parse(localStorage.getItem('yuki-user-session') || 'null'); } catch (e) {}
    try { m = JSON.parse(localStorage.getItem('yuki-admin-session') || 'null'); } catch (e) {}
    var ok = function (v) { return v && (v.a || v.r); };
    if (ok(u) && ok(m)) return (m.t && (!u.t || m.t > u.t)) ? m : u;
    return ok(u) ? u : (ok(m) ? m : null);
  }

  // ── 顶栏账号按钮（PART B：右上角账号入口，旁边是汉堡）──
  // 未登录 → /account/?next=回跳；已登录 → RPC 专属确认分流（专属→后台/买家→账户页）
  // 小圆点（她 20261117 03:41）：不常驻——只有管理员有没看过的新订单才显示；
  // 已读标记 = 她进过后台（admin 页面打开时把 lastseen 刷到当下）
  var ORDERS_SEEN_KEY = 'yuki-orders-lastseen';
  function paintAcctBtn() {
    if (curPage === 'admin') { // 进过后台 = 已看过，清掉小红点（后台无账号按钮也要刷标记）
      try { localStorage.setItem(ORDERS_SEEN_KEY, String(Date.now())); } catch (e) {}
    }
    var b = document.getElementById('topbar-acct');
    if (!b) return;
    var s = readSession();
    if (!s || !s.a) return;
    // 用 shop_is_admin（后台登录验证同一套服务端判定）而不是柚子专属白名单
    fetch(DB_BASE + 'rpc/shop_is_admin', {
      method: 'POST',
      headers: { 'apikey': DB_KEY, 'Authorization': 'Bearer ' + s.a, 'Content-Type': 'application/json' },
      body: '{}'
    }).then(function (r) { return r.json(); }).then(function (ok) {
      if (ok === true) checkNewOrders(b, s.a); // 只有管理员看得到订单点，买家不显示
    }).catch(function () {});
  }
  function checkNewOrders(btn, token) {
    var last = Number((function () { try { return localStorage.getItem(ORDERS_SEEN_KEY) || '0'; } catch (e) { return '0'; } })());
    fetch(DB_BASE + 'shop_orders?select=created_at&order=created_at.desc&limit=1', {
      headers: { 'apikey': DB_KEY, 'Authorization': 'Bearer ' + token }
    }).then(function (r) { return r.ok ? r.json() : []; }).then(function (rows) {
      if (rows[0] && rows[0].created_at && new Date(rows[0].created_at).getTime() > last) {
        btn.classList.add('has-update');
      }
    }).catch(function () {}); // 拿不到就安静地不显示，绝不乱点
  }
  function goAccountBtn(btn) {
    var acct = (typeof window.ykLink === 'function') ? window.ykLink('/account/') : '/account/';
    var s = readSession();
    setMenu(false);
    if (!s) { location.href = acct + '?next=' + encodeURIComponent(location.pathname + location.search); return; }
    if (typeof window.ykExclusiveCheck !== 'function') { location.href = acct; return; }
    var busy = btn.classList.contains('acct-loading');
    if (busy) return; // 确认中防重复点击
    btn.classList.add('acct-loading');
    var done = function () { btn.classList.remove('acct-loading'); };
    var go = function (exclusive) {
      if (curPage === 'admin') { location.href = acct; return; } // 后台里点账号图标 → 前台账号页（不重载后台）
      if (exclusive) { location.href = '/admin.html'; return; }
      if (curPage === 'shop' && typeof window.__shopNav === 'function') { location.href = acct; return; }
      location.href = acct;
    };
    window.ykExclusiveCheck().then(function (res) {
      if (res && res.ok === 'pending') {
        setTimeout(function () {
          try { window.YK_EXCLUSIVE_MEMO = null; } catch (e) {}
          window.ykExclusiveCheck().then(function (r2) {
            if (r2 && r2.ok === 'pending') { done(); return; } // 仍未就绪：回原样，不误跳
            go(!!(r2 && r2.ok === true));
          }).catch(function () { done(); go(false); });
        }, 2500);
        return;
      }
      go(!!(res && res.ok === true));
    }).catch(function () { done(); go(false); });
  }


  // ── 语言切换行（已按她 20261117 03:38 指示撤出菜单：原本顶栏的切换器保留原位，这里不再重复渲染）──

  // ── 五栏渲染（她 20261117 15:15：一级标题改为可点链接——桌面直接跳转，手机仍作手风琴展开）──
  function titleCurrent(col) { // 栏头高亮：目标页就是当前页（含 sec）
    try {
      var u = new URL(col.url, location.origin);
      if (normPath(u.pathname) !== curPage) return false;
      var q = u.searchParams;
      if (q.get('sec')) return q.get('sec') === curSec && !curSubId;
      return !curSec && !curSubId;
    } catch (e) { return false; }
  }
  function buildCol(col) {
    var g = el('<div class="menu-group' + (titleCurrent(col) ? ' current' : '') + '" data-nav="' + (col.nav || '') + '" data-key="' + col.key + '"></div>');
    var subLabel = (LANG === 'en') ? col.zh : col.en; // 标题本地化，副标题永远显示另一种语言
    var head = '<a class="menu-toggle" href="' + hrefOf({ url: col.url }) + '">'
      + (col.num ? '<span class="menu-col-num">' + col.num + '</span>' : '')
      + '<span>' + span(col.zh, col.en) + '</span>'
      + (subLabel ? '<span class="menu-col-en">' + subLabel + '</span>' : '')
      + '<span class="plus"></span></a>';
    g.appendChild(el(head));
    var sub = el('<div class="submenu"></div>');
    col.items.forEach(function (s) {
      var attrs = [];
      if (s.scroll) attrs.push('data-scroll="' + s.scrollTo + '"');
      sub.appendChild(el('<a href="' + hrefOf(s) + '" data-key="' + s.key + '" ' + attrs.join(' ') + '>' + span(s.zh, s.en) + '</a>'));
    });
    g.appendChild(sub);
    return g;
  }

  // 权限过滤（不改动传入对象，返回新数组）：照片=任意登录可见；BJD/色卡/稿件=柚子专属（未确认前先隐藏，确认后自动出现）；Admin=shop_is_admin 服务端确认后出现
  // 区块显隐（areas）沿用后台设置的同一份数据：关了的区块菜单里也不出现
  function permFilter(list) {
    var s = null;
    try { s = JSON.parse(localStorage.getItem('yuki-user-session') || 'null') || JSON.parse(localStorage.getItem('yuki-admin-session') || 'null'); } catch (e) {}
    var logged = !!(s && (s.a || s.r));
    var out = [];
    (list || []).forEach(function (col) {
      var items = col.items.filter(function (it) {
        if (it.adminOnly) return window.__YK_ADMIN_OK === true;
        // 照片展示（/photos/）页面本身对所有人开放，菜单不再要登录：否则未登录访客的 Collection 整栏会消失
        if (it.key === 'bjd' || it.key === 'cards' || it.page === 'works') return window.__YK_MENU_OK === true;
        return true;
      });
      if (items.length) out.push(Object.assign({}, col, { items: items }));
    });
    return out;
  }
  // Admin 子项：登录后用 shop_is_admin（与后台登录同一套服务端判定）确认一次，确认后重建菜单
  function checkAdminMenu() {
    var s = readSession();
    if (!s || !s.a || window.__YK_ADMIN_CHECKED) return;
    window.__YK_ADMIN_CHECKED = true;
    fetch(DB_BASE + 'rpc/shop_is_admin', {
      method: 'POST',
      headers: { 'apikey': DB_KEY, 'Authorization': 'Bearer ' + s.a, 'Content-Type': 'application/json' },
      body: '{}'
    }).then(function (r) { return r.json(); }).then(function (ok) {
      if (ok === true) { window.__YK_ADMIN_OK = true; render(); }
    }).catch(function () {});
  }
  function render(list) {
    var menu = document.getElementById('menu');
    if (!menu) return;
    menu.innerHTML = '';
    var cols = el('<div class="menu-cols" id="menu-cols"></div>');
    var visCols = permFilter(list || NAV);
    visCols.forEach(function (col, i) { col.num = String(i + 1).padStart(2, '0'); }); // 她 20261117：编号按实际可见栏连续排（柚子专属栏隐藏时不跳号）
    visCols.forEach(function (col) { cols.appendChild(buildCol(col)); });
    menu.appendChild(cols);
    paintAcctBtn();
    checkAdminMenu(); // 登录态下确认一次 shop_is_admin，确认后重建菜单补上 Admin 子项
  }

  // ── 数据库同步（全站同一份数据：照片分区 / 区域标题与显隐 / BJD 名单 / 色卡名单）──
  var DB_BASE = 'https://ukxrvcptwhlwvdanovgd.supabase.co/rest/v1/';
  var DB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVreHJ2Y3B0d2hsd3ZkYW5vdmdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyMzgyNDcsImV4cCI6MjEwODgxNDI0N30.Grdi23yToGPFF8e_kxFjf37JOOf51j-FW_FYQTUVu8E';
  function dbFetch(path) {
    return fetch(DB_BASE + path, { headers: { 'apikey': DB_KEY, 'Authorization': 'Bearer ' + DB_KEY } })
      .then(function (r) { return r.ok ? r.json() : []; })
      .catch(function () { return []; });
  }

  function refresh() {
    try {
      var st = JSON.parse(localStorage.getItem('yuki-user-session') || 'null') || JSON.parse(localStorage.getItem('yuki-admin-session') || 'null');
      if (!(st && (st.a || st.r))) { window.__YK_ADMIN_OK = false; window.__YK_ADMIN_CHECKED = false; } // 登出后重置，避免残留管理员入口
    } catch (e) {}
    render();
    Promise.all([
      dbFetch('photo_sections?select=id,key,name_zh,name_en,sort&order=sort.asc,created_at.asc&limit=100'),
      (typeof window.ykAuthFetch === 'function' ? window.ykAuthFetch : dbFetch)('site_settings?select=key,value&key=in.(areas,bjds,cards)&limit=10') /* 私有键走登录态（无 site-common 的页面回退匿名）*/
    ]).then(function (res) {
      var sections = res[0] || [];
      var settings = {};
      (res[1] || []).forEach(function (row) {
        try { settings[row.key] = typeof row.value === 'string' ? JSON.parse(row.value) : row.value; } catch (e) {}
      });
      var areas = settings.areas || {};

      var nav = NAV.map(function (item) { return Object.assign({}, item, { items: item.items.slice() }); });
      // 区域显隐（主页后台设置的同一份数据：关了的区块菜单里也不出现）——逐条目过滤，空栏整栏不出现
      nav.forEach(function (col) {
        col.items = col.items.filter(function (it) {
          if (col.key === 'home' || col.key === 'account') return true;
          var a = it.area ? areas[it.area] : null;
          return !(a && a.visible === false);
        });
      });
      nav = nav.filter(function (col) { return col.items.length > 0; });
      // 照片分区 → 收藏展示栏（拍立得/胶卷等分区来自 photo_sections，BJD 分区已合并为独立区块）
      var gal = nav.filter(function (i) { return i.key === 'gallery'; })[0];
      if (gal) {
        // 她 20261117 17:48：Collection 固定四个入口，顺序 BJD → Color Cards → Photo Gallery → All Commissions
        // （不再把照片分区动态塞进这栏；拍立得 / 胶卷分区仍在 /photos/ 页内的分区里）
        var statics = gal.items.filter(function (it) { return it.key === 'bjd' || it.key === 'cards' || it.key === 'photos' || it.key === 'works-all'; });
        gal.items = statics;
        var ga = areas.gallery;
        if (ga && ga.title_zh) { gal.zh = ga.title_zh; gal.en = ga.title_en || ga.title_zh; }
      }
      // BJD/色卡（她 20261027 02:16：只要一个按钮，点进去就是列表页）——保持单链接直达
      render(nav);
      applyCurrent();
      document.dispatchEvent(new CustomEvent('sitemenu:rendered'));
    });
    // 柚子专属权限异步确认：确认后重建菜单（BJD/色卡/稿件入口自动出现）
    if (window.ykExclusiveCheck && !window.__YK_MENU_CHECKED) {
      window.__YK_MENU_CHECKED = true;
      window.ykExclusiveCheck().then(function (res) {
        if (res.ok === true) { window.__YK_MENU_OK = true; refresh(); }
      }).catch(function () {});
    }
  }

  // ── 交互：开合 / 手风琴 / 点击后收起（全站同一套）──
  function isMobile() { return window.matchMedia('(max-width: 700px)').matches; }
  function setMenu(open) {
    var burger = document.querySelector('.burger');
    var menu = document.getElementById('menu');
    var mask = document.getElementById('menu-mask');
    if (!menu) return;
    menu.classList.toggle('open', open);
    mask = mask || createMask();
    mask.classList.toggle('open', open);
    if (burger) burger.classList.toggle('open', open);
  }
  function createMask() {
    var mask = document.createElement('div');
    mask.className = 'menu-mask';
    mask.id = 'menu-mask';
    mask.addEventListener('click', function () { setMenu(false); });
    document.body.appendChild(mask);
    return mask;
  }
  document.addEventListener('keydown', function (e) { // Esc 关闭（PART B §七）
    if (e.key === 'Escape') setMenu(false);
  });
  document.addEventListener('click', function (e) {
    var tc = e.target.closest('.topbar-cart');
    if (tc) {
      setMenu(false);
      if (curPage === 'shop' && typeof window.__shopNav === 'function') { e.preventDefault(); window.__shopNav('cart'); }
      return;
    }
    var ab = e.target.closest('.topbar-acct');
    if (ab) { e.preventDefault(); goAccountBtn(ab); return; }
    var burger = e.target.closest('.burger');
    if (burger) { setMenu(!document.getElementById('menu').classList.contains('open')); return; }
    var toggle = e.target.closest('.menu-toggle');
    if (toggle && toggle.closest('#menu')) {
      if (!isMobile()) return; // 桌面端栏头是链接，直接跳转
      e.preventDefault(); // 手机端栏头 = 手风琴展开（她 20261117 15:15：桌面可点跳转，手机继续折叠）
      toggle.closest('.menu-group').classList.toggle('open');
      return;
    }
    var aa = e.target.closest('#menu a[data-acct]');
    if (aa) {
      setMenu(false);
      if (curPage === 'shop' && typeof window.__shopNav === 'function') {
        e.preventDefault();
        window.__shopNav(aa.getAttribute('data-acct'));
      }
      return;
    }
    var a = e.target.closest('#menu a');
    if (a) {
      var sc = a.getAttribute('data-scroll');
      setMenu(false);
      if (sc && curPage !== 'index') {
        // 子页点「日历」：先回主页再精准定位到区块（含顶栏偏移，主页端统一处理）
        e.preventDefault();
        location.href = (typeof window.ykLink === 'function' ? window.ykLink('/') : '/') + '?scroll=' + encodeURIComponent(sc);
        return;
      }
      if (sc && typeof window.__menuScroll === 'function') {
        e.preventDefault();
        window.__menuScroll(sc);
      }
      return;
    }
    if (!e.target.closest('#menu')) setMenu(false);
  });

  // 当前页高亮：只切换 class，不重建菜单（避免菜单打开时突然跳动）
  function applyCurrent() {
    var menu = document.getElementById('menu');
    if (!menu) return;
    var curKey = currentKey();
    menu.querySelectorAll('a[data-key]').forEach(function (elm) { // 只给链接高亮：栏头与子项不再同时发粉（避免重复高亮）
      elm.classList.toggle('current', elm.getAttribute('data-key') === curKey);
    });
  }
  function currentKey() {
    var best = '';
    var scan = function (cond) {
      NAV.forEach(function (item) {
        if (best) return;
        item.items.forEach(function (it) { if (best) return; if (cond(it)) best = it.key; });
      });
    };
    scan(function (it) { return itemMatchesCurrent(it); });   // 精确匹配（含 ?sec= / ?id= / ?card=）
    if (!best) scan(function (it) { return it.page === curPage; }); // 页面默认项
    if (curPage === 'admin') best = 'admin';
    return best;
  }

  // 页面通知：子页加载后调用（分组 active 由菜单组件独占管理）
  function notify(name) {
    var menu = document.getElementById('menu');
    if (!menu) return;
    var hit = false;
    menu.querySelectorAll('[data-nav]').forEach(function (g) {
      if (g.getAttribute('data-nav') === name) { g.classList.add('active'); hit = true; }
      else if (name === null) g.classList.remove('active');
    });
    // 稿件已并入 Collection，没有自己的栏了：按栏目里的条目反查所属栏，高亮依然生效
    if (name && !hit) {
      var a = menu.querySelector('a[data-key="' + name + '"], a[data-key="' + name + '-all"]');
      var grp = a ? a.closest('.menu-group') : null;
      if (grp) grp.classList.add('active');
    }
  }

  window.addEventListener('popstate', function () {
    setMenu(false); // 切换页面/前进后退时菜单不得卡住
    applyCurrent();
  });

  window.SiteMenu = {
    refresh: refresh,
    close: function () { setMenu(false); },
    notify: notify,
    applyCurrent: applyCurrent,
    setCartCount: function (n) {
      [['topbar-cart-badge', 'topbar-cart'], ['menu-cart-badge', null]].forEach(function (pair) {
        var b = document.getElementById(pair[0]);
        if (!b) return;
        b.textContent = n;
        b.style.display = n ? 'inline-flex' : 'none';
      });
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refresh);
  else refresh();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyCurrent);
  else applyCurrent();
})();
