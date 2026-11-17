/* ═══════════ 页面封面图前台加载（她 20261117 02:50 任务书 PART C）═══════════
   · 数据源：page_covers 表（独立 covers 桶；RLS：匿名只读 is_active=true 的行）
   · 挂载页：shop / works / photos / bjd / color-card / about / foodie（中英 14 页）
   · 没有设置封面图的页面保持原设计，什么都不注入（不显示破损图/占位图）
   · 首页 hero 封面沿用「主页管理」原机制（site_settings cover），不在这里
   · 显示位置（object-position）由后台封面图管理设置 */
(function () {
  var PAGE_MAP = [
    { key: 'shop', test: function (p) { return p.indexOf('/shop/') === 0 || p.indexOf('/shop.html') === 0; } },
    { key: 'works', test: function (p) { return p.indexOf('/works/') === 0; } },
    { key: 'photos', test: function (p) { return p.indexOf('/photos/') === 0; } },
    { key: 'bjd', test: function (p) { return p.indexOf('/bjd/') === 0; } },
    { key: 'color-card', test: function (p) { return p.indexOf('/color-card/') === 0; } },
    { key: 'about', test: function (p) { return p.indexOf('/about/') === 0; } },
    { key: 'foodie', test: function (p) { return p.indexOf('/foodie/') === 0 && p.indexOf('/foodie/map/') !== 0 && p.indexOf('/foodie/restaurant/') !== 0; } }
  ];
  function normPath(p) {
    if (p === '/zh') p = '/';
    else if (p.indexOf('/zh/') === 0) p = p.slice(3);
    return p;
  }
  function pageKey() {
    var p = normPath(location.pathname);
    for (var i = 0; i < PAGE_MAP.length; i++) if (PAGE_MAP[i].test(p)) return PAGE_MAP[i].key;
    return null;
  }

  var CSS = '.pcov-banner{max-width:1200px;margin:76px auto 0;padding:0 16px;box-sizing:border-box;}'
    + '@media(max-width:700px){.pcov-banner{margin-top:70px;padding:0 10px;}}'
    + '.pcov-banner .pcov-clip{border-radius:16px;overflow:hidden;border:1px solid #F9E5ED;background:#FFF8FA;}'
    + '.pcov-banner img{display:block;width:100%;max-height:380px;object-fit:cover;}'
    + '@media(max-width:700px){.pcov-banner img{max-height:240px;}}';

  function boot() {
    var key = pageKey();
    if (!key) return;
    var anon = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVreHJ2Y3B0d2hsd3ZkYW5vdmdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyMzgyNDcsImV4cCI6MjEwODgxNDI0N30.Grdi23yToGPFF8e_kxFjf37JOOf51j-FW_FYQTUVu8E';
    fetch('https://ukxrvcptwhlwvdanovgd.supabase.co/rest/v1/page_covers?page_key=eq.' + encodeURIComponent(key) + '&is_active=eq.true&select=image_url,position', {
      headers: { 'apikey': anon }
    }).then(function (r) { return r.ok ? r.json() : []; }).then(function (rows) {
      var cov = (rows && rows[0]) || null;
      if (!cov || !cov.image_url) return; // 没设置封面：原页面原样，不注入任何东西
      var style = document.createElement('style');
      style.textContent = CSS;
      document.head.appendChild(style);
      var banner = document.createElement('div');
      banner.className = 'pcov-banner';
      var img = document.createElement('img');
      img.src = cov.image_url;
      img.alt = '';
      img.style.objectPosition = cov.position || 'center';
      img.loading = 'lazy';
      img.addEventListener('error', function () { if (banner.parentNode) banner.parentNode.removeChild(banner); }); // 图挂了就整块撤掉，不留破图
      banner.appendChild(document.createElement('div')).className = 'pcov-clip';
      banner.firstChild.appendChild(img);
      var topbar = document.querySelector('.topbar');
      if (topbar && topbar.parentNode) topbar.parentNode.insertBefore(banner, topbar.nextSibling);
      else if (document.body.firstChild) document.body.insertBefore(banner, document.body.firstChild);
    }).catch(function () {});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
