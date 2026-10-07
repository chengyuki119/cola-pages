/* ═══════════ 全站统一汉堡菜单（唯一导航数据源 + 唯一渲染逻辑）═══════════
   所有页面共用这一个组件：
   - 一个导航数据源（NAV + 数据库同步）
   - 一个渲染逻辑（内容/顺序/样式/动画全站一致）
   - 当前页轻微高亮，子菜单默认收起
   - 新增/删除页面只需改这里的 NAV */
(function () {
  var LANG = 'zh';
  try { LANG = localStorage.getItem('yuki-lang') || 'zh'; } catch (e) {}
  function t(zh, en) { return LANG === 'en' ? en : zh; }

  // ── 唯一导航数据源 ──
  // 站点部署在域名根：/ = 主页，/shop/ /askbox/ = 子页，/admin.html = 后台；页面内子区用 #hash
  var NAV = [
    { key: 'home', zh: 'Home', en: 'Home', page: 'index', hash: '' },
    { key: 'cal', zh: '日历', en: 'Calendar', page: 'index', hash: 'home-cal', scroll: true },
    { key: 'gallery', group: true, nav: 'gallery', zh: '照片展示', en: 'Photo Gallery', items: [
      { key: 'instax', zh: '拍立得展示', en: 'Instax Display', page: 'index', hash: 'instax' },
      { key: 'film', zh: '胶卷相机照片展示', en: 'Film Camera Pictures', page: 'index', hash: 'film' }
    ]},
    { key: 'bjd', zh: 'BJD', en: 'BJD', page: 'index', hash: 'bjd' },
    { key: 'cards', zh: '色卡', en: 'Color Cards', page: 'index', hash: 'cards' },
    { key: 'shop', group: true, nav: 'shop', zh: '我的小铺', en: 'My Shop', items: [
      { key: 'shop', zh: '逛小铺', en: 'Shop', page: 'shop', hash: '' },
      { key: 'reviews', zh: '评价返图', en: 'Review', page: 'shop', hash: 'reviews' },
      { key: 'pay', zh: '付款方式', en: 'Payment', page: 'shop', hash: 'pay' }
    ]},
    { key: 'anon', zh: '匿名留言', en: 'Ask Box', page: 'askbox', hash: '' },
    { key: 'links', zh: '找到我', en: 'Find Me', page: 'index', hash: 'links' }
  ];

  // 页面 → 根绝对路径（站点部署在域名根，从任何页面都能正确跳转）
  var PAGE_URL = { index: '/', shop: '/shop/', askbox: '/askbox/', admin: '/admin.html' };
  var curPage = (function () {
    var p = location.pathname;
    if (p.indexOf('/shop/') === 0 || p === '/shop.html' || p.indexOf('/shop.html') === 0) return 'shop';
    if (p.indexOf('/askbox/') === 0 || p.indexOf('/askbox.html') === 0) return 'askbox';
    if (p.indexOf('/admin.html') === 0) return 'admin';
    return 'index';
  })();
  var curHash = location.hash.replace('#', '');
  function normHash(h) {
    if (!h) return '';
    if (h === 'home-cal') return 'cal';
    if (h.indexOf('bjd') === 0) return 'bjd';
    if (h.indexOf('card') === 0) return 'cards';
    return h;
  }

  function hrefOf(item) {
    if (curPage === item.page) {
      if (item.scroll) return '#home';
      return '#' + (item.hash || '');
    }
    return PAGE_URL[item.page] + (item.hash ? '#' + item.hash : '');
  }
  function isCurrent(item) {
    if (item.page !== curPage) return false;
    if (!item.hash) return !curHash || curHash === 'home' || curHash === 'links';
    return normHash(item.hash) === normHash(curHash);
  }

  function el(html) {
    var d = document.createElement('div');
    d.innerHTML = html.trim();
    return d.firstChild;
  }
  function span(zh, en) {
    return '<span data-zh="' + zh + '" data-en="' + en + '">' + t(zh, en) + '</span>';
  }

  function buildMenu(nav) {
    var frag = document.createDocumentFragment();
    nav.forEach(function (item) {
      if (item.group) {
        var g = el('<div class="menu-group" data-nav="' + item.nav + '" data-key="' + item.key + '"></div>');
        var tg = el('<button class="menu-toggle" type="button">' + span(item.zh, item.en) + '<span class="plus"></span></button>');
        var sub = el('<div class="submenu"></div>');
        item.items.forEach(function (s) {
          sub.appendChild(el('<a href="' + hrefOf(s) + '" data-key="' + s.key + '"><span class="dash">-</span>' + span(s.zh, s.en) + '</a>'));
        });
        g.appendChild(tg); g.appendChild(sub);
        frag.appendChild(g);
      } else {
        var attrs = [];
        if (item.scroll && curPage === item.page) attrs.push('data-scroll="' + item.hash + '"');
        frag.appendChild(el('<a class="menu-link" data-key="' + item.key + '" href="' + hrefOf(item) + '" ' + attrs.join(' ') + '>' + span(item.zh, item.en) + '</a>'));
      }
    });
    return frag;
  }
  function isCurrentGroup(item) {
    return item.items.some(function (s) { return s.page === curPage && normHash(s.hash || '') === normHash(curHash) && s.hash; });
  }

  // 柚子专属：登录后是可展开分组（管理后台），没登录是普通链接
  function buildOwner() {
    var logged = false;
    try { logged = !!localStorage.getItem('yuki-admin-session'); } catch (e) {}
    if (logged) {
      var g = el('<div class="menu-group" id="menu-owner-group" style="margin-top:auto;"></div>');
      g.appendChild(el('<button class="menu-toggle" type="button">' + span('柚子专属', 'Yuki\'s Personal') + '<span class="plus"></span></button>'));
      var sub = el('<div class="submenu"></div>');
      sub.appendChild(el('<a class="menu-link" data-key="admin" href="/admin.html">' + span('管理后台', 'Admin') + '</a>'));
      g.appendChild(sub);
      return g;
    }
    return el('<a class="menu-owner" id="menu-owner-link" href="/admin.html" style="margin-top:auto;">' + span('柚子专属', 'Yuki\'s Personal') + '</a>');
  }

  function render() {
    var menu = document.getElementById('menu');
    if (!menu) return;
    menu.innerHTML = '';
    menu.appendChild(buildMenu(NAV));
    menu.appendChild(buildOwner());
  }

  // ── 数据库同步（全站同一份数据：照片分区 / 区域标题与显隐 / BJD 名单）──
  var DB_BASE = 'https://zajcglvlzsolygvjeumb.supabase.co/rest/v1/';
  var DB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InphamNnbHZsenNvbHlndmpldW1iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEyMzI4NjUsImV4cCI6MjEwNjgwODg2NX0.7_Pthb3wPInb5v4o7IoWejozEvDZQgNPS8DgwikQ8ys';
  function dbFetch(path) {
    return fetch(DB_BASE + path, { headers: { 'apikey': DB_KEY, 'Authorization': 'Bearer ' + DB_KEY } })
      .then(function (r) { return r.ok ? r.json() : []; })
      .catch(function () { return []; });
  }

  function refresh() {
    render();
    Promise.all([
      dbFetch('photo_sections?select=id,key,name_zh,name_en,sort&order=sort.asc,created_at.asc&limit=100'),
      dbFetch('site_settings?select=key,value&key=in.(areas,bjds,cards)&limit=10')
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
        var aKey = item.nav || (item.page === 'index' && item.hash ? item.hash : item.key);
        if (item.key === 'home' || item.key === 'cal') return true;
        var a = areas[aKey];
        return !(a && a.visible === false);
      });
      // 照片分区 → 照片展示子项（BJD 分区已合并为独立区块）
      var gal = nav.filter(function (i) { return i.nav === 'gallery'; })[0];
      if (gal) {
        var secs = sections.filter(function (s) { return s.key !== 'bjd'; })
          .map(function (s) { return { key: s.key, zh: s.name_zh, en: s.name_en, page: 'index', hash: s.key }; });
        if (secs.length) gal.items = secs;
        var ga = areas.gallery;
        if (ga && ga.title_zh) { gal.zh = ga.title_zh; gal.en = ga.title_en || ga.title_zh; }
      }
      // BJD 名单 → BJD 分组（有娃娃才展开成组，没有就是普通入口）
      var bjdIdx = -1;
      nav.forEach(function (item, i) { if (item.key === 'bjd') bjdIdx = i; });
      if (bjdIdx > -1 && bjds.length) {
        nav[bjdIdx] = { key: 'bjd', group: true, nav: 'bjd', zh: 'BJD', en: 'BJD', items: bjds.map(function (b, i) {
          var nm = b.name || '未命名娃娃';
          return { key: 'bjd-' + i, zh: nm, en: nm, page: 'index', hash: 'bjd-' + i };
        })};
      }
      // 色卡名单 → 色卡分组（同一套数据）
      var cardsIdx = -1;
      nav.forEach(function (item, i) { if (item.key === 'cards') cardsIdx = i; });
      if (cardsIdx > -1 && cards.length) {
        nav[cardsIdx] = { key: 'cards', group: true, nav: 'cards', zh: '色卡', en: 'Color Cards', items: cards.map(function (c, i) {
          var nm = c.name || '未命名色卡';
          return { key: 'card-' + i, zh: nm, en: nm, page: 'index', hash: 'card-' + i };
        })};
      }
      render();
      applyCurrent();
      document.dispatchEvent(new CustomEvent('sitemenu:rendered'));
    });
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
    var burger = e.target.closest('.burger');
    if (burger) { setMenu(!document.getElementById('menu').classList.contains('open')); return; }
    var toggle = e.target.closest('.menu-toggle');
    if (toggle && toggle.closest('#menu')) { toggle.closest('.menu-group').classList.toggle('open'); return; }
    var a = e.target.closest('#menu a');
    if (a) {
      var sc = a.getAttribute('data-scroll');
      setMenu(false);
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
        pool.forEach(function (it) { if (best) return; if (it.page === curPage && cond(it)) best = it.key; });
      });
    };
    scan(function (it) { return !!it.hash && it.hash === curHash; });                 // 精确匹配
    if (!best) scan(function (it) { return !!it.hash && normHash(it.hash) === normHash(curHash); }); // 归一化（#bjd-0→bjd 等）
    if (!best) scan(function (it) { return !it.hash; });                              // 页面默认（无 hash 项）
    if (curPage === 'admin') best = 'admin';
    return best;
  }

  // 页面通知：index 切换内部页面时调用（分组/子项 active 由菜单组件独占管理）
  function notify(name) {
    var menu = document.getElementById('menu');
    if (!menu) return;
    menu.querySelectorAll('[data-nav]').forEach(function (g) {
      g.classList.toggle('active', g.getAttribute('data-nav') === name);
    });
    menu.querySelectorAll('.submenu a').forEach(function (a) {
      a.classList.toggle('active', a.getAttribute('href') === '#' + name);
    });
  }

  window.addEventListener('hashchange', function () {
    curHash = location.hash.replace('#', '');
    applyCurrent();
  });

  window.SiteMenu = {
    refresh: refresh,
    close: function () { setMenu(false); },
    notify: notify,
    applyCurrent: applyCurrent
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refresh);
  else refresh();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyCurrent);
  else applyCurrent();
})();
