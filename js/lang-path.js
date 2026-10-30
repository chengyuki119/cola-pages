/* ═══════════ 全站语言路径控制器（唯一语言判定来源）═══════════
   规则（20261030 总任务书 §1）：
   - 英文 = 默认 = 根路径： /  /shop/  /bjd/  /color-card/ ...
   - 中文 = /zh/ 前缀：   /zh/  /zh/shop/  /zh/bjd/  /zh/color-card/ ...
   - URL 路径优先级最高：有 /zh/ 前缀就是中文，没有就是英文。
     浏览器语言、localStorage 一律不能覆盖当前访问的明确语言路径。
   - 切换语言 = 跳到同一页面的另一种语言路径，保留 query 与 hash；不会统一跳回首页。

   本文件必须在 <head> 里、其它脚本之前同步加载：
   site-common.js / site-menu.js / shop-app.js 等旧逻辑都从 localStorage['yuki-lang']
   读语言，这里先把路径对应的语言写进去，旧逻辑就自动跟着 URL 走，无需重写翻译系统。
   ═══════════════════════════════════════════════════════════ */
(function () {
  var ZH_PREFIX = '/zh';

  /* 有中文镜像的中文路径（由 tools/build-zh.ps1 生成）。没列进来的页面（如 admin.html）
     只在根路径存在：切语言时回退到该语言的首页，而不是跳出一个 404。 */
  var ROUTES = [
    '/',
    '/shop/',
    '/bjd/',
    '/color-card/',
    '/works/',
    '/photos/',
    '/askbox/',
    '/about/',
    '/account/',
    '/policies/',
    '/faq/',
    '/brand/',
    '/service/',
    '/tracking/',
    '/privacy-policy/',
    '/terms-of-service/',
    '/return-policy/',
    '/shipping-policy/',
    '/bjdselfie/'
  ];

  var path = location.pathname || '/';
  var isZh = path === ZH_PREFIX || path.indexOf(ZH_PREFIX + '/') === 0;
  var LANG = isZh ? 'zh' : 'en';

  // 1) 路径 → localStorage（旧逻辑从 localStorage 读语言，这里把 URL 结论喂给它）
  try { localStorage.setItem('yuki-lang', LANG); } catch (e) {}
  // 2) <html lang>
  try { document.documentElement.lang = LANG === 'zh' ? 'zh-CN' : 'en'; } catch (e) {}

  function pageOf(p) { // '/shop/index.html' → '/shop/'，'/shop?x' 之外的部分已由调用方剥离
    p = p.replace(/\/index\.html?$/i, '/');
    if (p.charAt(0) !== '/') p = '/' + p;
    if (p.charAt(p.length - 1) !== '/') p += '/';
    return p;
  }
  function hasRoute(p) { return ROUTES.indexOf(p) !== -1; }
  function zhOf(p) { return p === '/' ? '/zh/' : ZH_PREFIX + p; }

  /* 内部页面链接 → 当前语言对应的路径。外部链接、资源、admin.html、已带 /zh 的都不动。 */
  function link(url) {
    if (!url || typeof url !== 'string') return url;
    if (url.charAt(0) !== '/' || url.charAt(1) === '/') return url; // 站外 / 协议相对
    if (url === ZH_PREFIX || url.indexOf(ZH_PREFIX + '/') === 0 || url.indexOf(ZH_PREFIX + '?') === 0) return url;
    var q = url.indexOf('?'), h = url.indexOf('#');
    var cut = (q === -1 ? url.length : q);
    if (h !== -1 && h < cut) cut = h;
    var p = url.slice(0, cut), rest = url.slice(cut);
    var page = pageOf(p);
    if (!hasRoute(page)) return url;     // admin.html / css / js / 图片等：保持原样
    if (LANG !== 'zh') return url;       // 英文默认根路径：原样
    return zhOf(page) + rest;
  }

  /* 当前页 → 另一种语言的目标 URL（保留 query + hash）；目标语言没有这页就回退该语言首页 */
  function switchUrl(want) {
    var base = isZh ? (path === ZH_PREFIX ? '/' : path.slice(ZH_PREFIX.length)) : path;
    var page = pageOf(base || '/');
    var target;
    if (want === 'zh') target = hasRoute(page) ? zhOf(page) : '/zh/';
    else target = hasRoute(page) ? page : '/';
    return target + (location.search || '') + (location.hash || '');
  }

  function go(url) { location.href = link(url); }

  window.YK = {
    lang: LANG,
    isZh: isZh,
    routes: ROUTES.slice(),
    link: link,
    go: go,
    switchUrl: switchUrl,
    home: isZh ? '/zh/' : '/'
  };
  // 全局快捷函数：各页内联脚本与共公 JS 直接用 ykLink('/shop/') 就能跟随语言路径
  window.ykLink = link;

  /* 语言按钮：捕获阶段接管，压掉各页面原有的「存 localStorage 再 reload」逻辑。
     点当前语言 = 什么都不做；点另一种语言 = 跳到同一页面的另一种语言路径。 */
  document.addEventListener('click', function (e) {
    var t = e.target;
    var btn = t && t.closest ? t.closest('.lang-btn') : null;
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    var want = btn.getAttribute('data-lang') === 'zh' ? 'zh' : 'en';
    if (want === LANG) return;                // 已经是这个语言：不刷新、不丢状态
    location.href = switchUrl(want);
  }, true);
})();
