/* ═══════════ 全站统一汉堡菜单（唯一导航数据源 + 唯一渲染逻辑）═══════════
   所有页面共用这一个组件：
   - 一个导航数据源（NAV + 数据库同步）
   - 一个渲染逻辑（内容/顺序/样式/动画全站一致）
   - 当前页轻微高亮，子菜单默认收起
   - 新增/删除页面只需改这里的 NAV
   站点结构（根绝对路径，无 hash 路由）：
   / = 主页 · /photos/ = Photo Gallery · /bjd/ = BJD · /color-card/ = 色卡
   /shop/ = 小铺 · /askbox/ = 提问箱 · /admin.html = 后台 */
(function () {
  var LANG = 'zh';
  try { LANG = localStorage.getItem('yuki-lang') || 'zh'; } catch (e) {}
  function t(zh, en) { return LANG === 'en' ? en : zh; }

  // ── 唯一导航数据源 ──
  var NAV = [
    { key: 'home', zh: 'Home', en: 'Home', page: 'index', url: '/' },
    { key: 'cal', zh: '日历', en: 'Calendar', page: 'index', url: '/', scrollTo: 'home-cal', scroll: true },
    { key: 'gallery', group: true, nav: 'gallery', zh: '照片展示', en: 'Photo Gallery', items: [
      { key: 'instax', zh: '拍立得展示', en: 'Instax Display', page: 'photos', url: '/photos/?sec=instax', sec: 'instax' },
      { key: 'film', zh: '胶卷相机照片展示', en: 'Film Camera Pictures', page: 'photos', url: '/photos/?sec=film', sec: 'film' }
    ]},
    { key: 'bjd', zh: 'BJD', en: 'BJD', page: 'bjd', url: '/bjd/' },
    { key: 'cards', zh: '色卡', en: 'Color Cards', page: 'cards', url: '/color-card/' },
    { key: 'works', zh: '稿件展示', en: 'Works', page: 'works', url: '/works/' },
    { key: 'shop', group: true, nav: 'shop', zh: '我的小铺', en: 'My Shop', items: [
      { key: 'shop', zh: '逛小铺', en: 'Shop', page: 'shop', url: '/shop/' },
      { key: 'reviews', zh: '评价返图', en: 'Review', page: 'shop', url: '/shop/?sec=reviews', sec: 'reviews' }
    ]},
    { key: 'anon', zh: '联系我们', en: 'Contact Us', page: 'askbox', url: '/askbox/' },
    { key: 'about', zh: '关于 Snow Yuzu', en: 'About', page: 'about', url: '/about/' }
  ];

  // 当前页面 / 当前子区（?sec= / ?id= / ?card=）
  var QS = new URLSearchParams(location.search);
  var curPage = (function () {
    var p = location.pathname;
    if (p.indexOf('/photos/') === 0) return 'photos';
    if (p.indexOf('/bjd/') === 0) return 'bjd';
    if (p.indexOf('/color-card/') === 0) return 'cards';
    if (p.indexOf('/works/') === 0) return 'works';
    if (p.indexOf('/shop/') === 0 || p.indexOf('/shop.html') === 0) return 'shop';
    if (p.indexOf('/askbox/') === 0) return 'askbox';
    if (p.indexOf('/about/') === 0) return 'about';
    if (p.indexOf('/admin.html') === 0) return 'admin';
    return 'index';
  })();
  var curSec = QS.get('sec') || '';
  var curSubId = QS.get('id') != null ? QS.get('id') : (QS.get('card') != null ? QS.get('card') : '');

  function hrefOf(item) {
    if (curPage === item.page && item.scrollTo) return item.url; // 同页区块入口：点击时 data-scroll 平滑滚动，不产生 hash
    return item.url;
  }
  function itemMatchesCurrent(it) {
    if (it.page !== curPage) return false;
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

  // ── 顶部导航栏购物车（Logo 右侧、汉堡左侧）+ 菜单底部账户入口 ──
  function readSession() {
    var u = null, m = null;
    try { u = JSON.parse(localStorage.getItem('yuki-user-session') || 'null'); } catch (e) {}
    try { m = JSON.parse(localStorage.getItem('yuki-admin-session') || 'null'); } catch (e) {}
    var ok = function (v) { return v && (v.a || v.r); };
    if (ok(u) && ok(m)) return (m.t && (!u.t || m.t > u.t)) ? m : u;
    return ok(u) ? u : (ok(m) ? m : null);
  }
  function buildAcctBottom() {
    var s = readSession();
    if (s) return el('<a class="menu-acct-bottom is-in" href="/account/" data-acct="account">' + span('我的账户', 'My Account') + '</a>');
    return el('<a class="menu-acct-bottom" href="/account/?next=' + encodeURIComponent(location.pathname + location.search) + '" data-acct="account">' + span('登录', 'Log in') + '</a>');
  }
  // 已登录点「我的账户」：按真实专属身份（RPC）决定去向——专属→后台、买家→普通账户页；验证中保持加载态不误跳
  function routeAccount(link) {
    if (typeof window.ykExclusiveCheck !== 'function') { location.href = '/account/'; return; }
    var restore = link.innerHTML;
    link.classList.add('acct-loading');
    link.innerHTML = span('身份确认中…', 'Checking…');
    var go = function (exclusive) {
      if (exclusive) { location.href = '/admin.html'; return; }
      if (curPage === 'shop' && typeof window.__shopNav === 'function') { location.href = '/account/'; return; }
      location.href = '/account/';
    };
    var fail = function () { link.classList.remove('acct-loading'); link.innerHTML = restore; };
    window.ykExclusiveCheck().then(function (res) {
      if (res && res.ok === 'pending') {
        setTimeout(function () {
          try { window.YK_EXCLUSIVE_MEMO = null; } catch (e) {}
          window.ykExclusiveCheck().then(function (r2) {
            if (r2 && r2.ok === 'pending') { fail(); return; } // 仍未就绪：回原样，不误跳
            go(!!(r2 && r2.ok === true));
          }).catch(fail);
        }, 2500);
        return;
      }
      go(!!(res && res.ok === true));
    }).catch(function () { fail(); go(false); });
  }
  function buildMenu(nav) {
    var frag = document.createDocumentFragment();
    nav.forEach(function (item) {
      if (item.group) {
        var g = el('<div class="menu-group" data-nav="' + item.nav + '" data-key="' + item.key + '"></div>');
        var tg = el('<button class="menu-toggle" type="button">' + span(item.zh, item.en) + '<span class="plus"></span></button>');
        var sub = el('<div class="submenu"></div>');
        item.items.forEach(function (s) {
          sub.appendChild(el('<a href="' + hrefOf(s) + '" data-key="' + s.key + '">' + span(s.zh, s.en) + '</a>'));
        });
        g.appendChild(tg); g.appendChild(sub);
        frag.appendChild(g);
      } else {
        var attrs = [];
        if (item.scroll) attrs.push('data-scroll="' + item.scrollTo + '"'); // 跨页也带上：不在主页时点菜单会带 ?scroll= 回主页定位
        frag.appendChild(el('<a class="menu-link" data-key="' + item.key + '" href="' + hrefOf(item) + '" ' + attrs.join(' ') + '>' + span(item.zh, item.en) + '</a>'));
      }
    });
    return frag;
  }
  function isCurrent(item) {
    return itemMatchesCurrent(item);
  }

  // 柚子专属：没登录是普通链接（后台登录入口）；专属账号登录后是可展开分组；普通买家登录后隐藏
  function buildOwner() {
    var s = readSession();
    // 前台/商城（有权限模块）：未登录与普通买家一律不显示专属后台入口，仅专属确认后显示
    if (window.ykExclusiveCheck) {
      if (window.__YK_MENU_OK !== true) {
        // 已登录但权限确认未完成：显示「身份确认中」占位，不提前降级成普通用户
        if (s) return el('<div class="menu-owner-pending">' + span('身份确认中…', 'Checking identity…') + '</div>');
        return el('<div style="display:none;"></div>');
      }
    } else if (!s) {
      return el('<div style="display:none;"></div>'); // 后台自身未登录也不显示
    }
    if (s) {
      var g = el('<div class="menu-group" id="menu-owner-group"></div>');
      g.appendChild(el('<button class="menu-toggle" type="button">' + span('柚子专属', 'Yuki\'s Personal') + '<span class="plus"></span></button>'));
      var sub = el('<div class="submenu"></div>');
      sub.appendChild(el('<a class="menu-link" data-key="admin" href="/admin.html">' + span('管理后台', 'Admin') + '</a>'));
      g.appendChild(sub);
      return g;
    }
    return el('<a class="menu-owner" id="menu-owner-link" href="/admin.html">' + span('柚子专属', 'Yuki\'s Personal') + '</a>');
  }

  // 权限过滤：照片=任意登录可见；BJD/色卡/稿件=柚子专属（未确认前先隐藏，确认后自动出现）
  function permFilter(list) {
    var s = null;
    try { s = JSON.parse(localStorage.getItem('yuki-user-session') || 'null') || JSON.parse(localStorage.getItem('yuki-admin-session') || 'null'); } catch (e) {}
    var logged = !!(s && (s.a || s.r));
    return (list || []).filter(function (item) {
      if (item.key === 'gallery') return logged;
      if (item.key === 'cal' || item.key === 'bjd' || item.key === 'cards' || item.key === 'works') return window.__YK_MENU_OK === true;
      return true;
    });
  }
  function render(list) {
    var menu = document.getElementById('menu');
    if (!menu) return;
    menu.innerHTML = '';
    menu.appendChild(buildMenu(permFilter(list || NAV)));
    menu.appendChild(buildOwner());
    menu.appendChild(buildAcctBottom());
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
      var bjds = settings.bjds || [];
      var cardsRaw = settings.cards;
      var cards = Array.isArray(cardsRaw) ? cardsRaw : (cardsRaw && cardsRaw.artists ? cardsRaw.artists : []);

      var nav = NAV.map(function (item) { return Object.assign({}, item); });
      // 区域显隐（主页后台设置的同一份数据：关了的区块菜单里也不出现）
      nav = nav.filter(function (item) {
        var aKey = item.nav || (item.page === 'index' ? item.key : item.key);
        if (item.key === 'home' || item.key === 'cal') return true;
        var a = areas[aKey];
        return !(a && a.visible === false);
      });
      // 照片分区 → 照片展示子项（BJD 分区已合并为独立区块）
      var gal = nav.filter(function (i) { return i.nav === 'gallery'; })[0];
      if (gal) {
        var secs = sections.filter(function (s) { return s.key !== 'bjd'; })
          .map(function (s) { return { key: s.key, zh: s.name_zh, en: s.name_en, page: 'photos', url: '/photos/?sec=' + encodeURIComponent(s.key), sec: s.key }; });
        if (secs.length) gal.items = secs;
        var ga = areas.gallery;
        if (ga && ga.title_zh) { gal.zh = ga.title_zh; gal.en = ga.title_en || ga.title_zh; }
      }
      // BJD/色卡（她 20261027 02:16：只要一个按钮，点进去就是列表页）——不再按名单展开成子项分组，一律保持单链接直达
      // 权限过滤照旧：permFilter 控制未授权时隐藏
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
  document.addEventListener('click', function (e) {
    var tc = e.target.closest('.topbar-cart');
    if (tc) {
      setMenu(false);
      if (curPage === 'shop' && typeof window.__shopNav === 'function') { e.preventDefault(); window.__shopNav('cart'); }
      return;
    }
    var burger = e.target.closest('.burger');
    if (burger) { setMenu(!document.getElementById('menu').classList.contains('open')); return; }
    var toggle = e.target.closest('.menu-toggle');
    if (toggle && toggle.closest('#menu')) { toggle.closest('.menu-group').classList.toggle('open'); return; }
    var aa = e.target.closest('#menu a[data-acct]');
    if (aa) {
      setMenu(false);
      if (aa.classList.contains('menu-acct-bottom') && readSession()) {
        // 已登录：先过真实专属身份验证再决定去向（专属→后台 / 买家→账户页）
        e.preventDefault();
        routeAccount(aa);
        return;
      }
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
        // 子页点「日历/找到我」：先回主页再精准定位到区块（含顶栏偏移，主页端统一处理）
        e.preventDefault();
        location.href = '/?scroll=' + encodeURIComponent(sc);
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
    menu.querySelectorAll('[data-key]').forEach(function (el) {
      el.classList.toggle('current', el.getAttribute('data-key') === curKey);
    });
  }
  function currentKey() {
    var best = '';
    var scan = function (cond) {
      NAV.forEach(function (item) {
        if (best) return;
        var pool = item.group ? item.items : [item];
        pool.forEach(function (it) { if (best) return; if (cond(it)) best = it.key; });
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
    menu.querySelectorAll('[data-nav]').forEach(function (g) {
      g.classList.toggle('active', g.getAttribute('data-nav') === name);
    });
  }

  window.addEventListener('popstate', function () {
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

  /* ═══ 手机端 Index 页面选择入口（她 20261028 总任务书 B3）═══
     仅手机端显示（CSS ≤700px）；同一导航数据源 NAV + 同一套 permFilter 权限过滤；
     样式与后台「当前页面」选择器同款（胶囊 + 白底圆角浮层 + 浅粉高亮）；后台页不挂载。 */
  function buildWrap() {
    var wrap = el('<div class="idx-wrap" id="idx-wrap"><button class="idx-btn" id="idx-btn" type="button">Index <span class="idx-arrow">▾</span></button><div class="idx-menu" id="idx-menu"></div></div>');
    var menu = wrap.querySelector('.idx-menu');
    var flat = [];
    permFilter(NAV).forEach(function (item) {
      if (item.group) item.items.forEach(function (s) { flat.push(s); });
      else flat.push(item);
    });
    flat.forEach(function (it) {
      if (it.key === 'cal') return; // 主页锚点：Index 里由 Home 入口覆盖，不重复放
      var a = el('<a href="' + hrefOf(it) + '" data-key="' + it.key + '" class="idx-link">' + span(it.zh, it.en) + '</a>');
      if (isCurrent(it)) a.classList.add('current');
      menu.appendChild(a);
    });
    return wrap;
  }
  function idxBuild() {
    var old = document.getElementById('idx-wrap');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var page = document.querySelector('.page.active');
    if (page && curPage !== 'admin') {
      page.insertBefore(buildWrap(), page.firstChild);
      return;
    }
    var tb = document.querySelector('.topbar'); // shop 等无 .page 容器的页面：挂在 topbar 之后（B3 兼容）
    if (!tb || curPage === 'admin') return;
    tb.insertAdjacentElement('afterend', buildWrap());
  }
  function idxToggle(force) {
    var m = document.getElementById('idx-menu');
    if (!m) return;
    var open = (force === undefined) ? !m.classList.contains('open') : force;
    m.classList.toggle('open', open);
  }
  document.addEventListener('click', function (e) {
    if (e.target.closest('#idx-btn')) idxToggle();
    else if (!e.target.closest('#idx-wrap')) idxToggle(false);
  });
  window.addEventListener('storage', function (e) { if (e.key === 'yuki-lang') idxBuild(); });
  document.addEventListener('DOMContentLoaded', idxBuild);
  if (document.readyState !== 'loading') idxBuild();
  // 专属权限异步确认后随菜单重建（BJD/色卡/稿件入口自动出现）
  var _ykRefresh = refresh;
  refresh = function () { _ykRefresh(); try { idxBuild(); } catch (e) {} };
})();
