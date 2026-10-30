/* ═══════════ 全站统一 Footer（双语文案 · 粉色系 · 手机单栏 / 电脑两栏）═══════════
   用法：页面引入本文件后调用 window.renderSiteFooter()。
   - 页面里已有 <footer>：保留原 <footer> 标签（避免破坏原样式选择器），只把内容替换成统一 Footer。
   - 页面里没有 <footer>：在 </body> 前插入一个。
   - 语言：读取 window.LANG（localStorage 'yuki-lang'，'zh'/'en'）；
     监听 document 上 .lang-btn 的 click，延迟 50ms 重渲染（site-common 本身会整页刷新，这里做兜底）。 */
(function () {
  'use strict';

  var STYLE_ID = 'sy-footer-style';

  var TEXT = {
    zh: {
      account: '我的账户',
      login: '登录',
      orders: '订单',
      cart: '购物车',
      profile: 'Profile 编辑',
      service: '客户服务',
      about: '关于 Snow Yuzu',
      brand: '品牌介绍',
      findme: '找到我',
      policies: '网站政策',
      contact: '联系我们',
      faq: '常见问题',
      'return-policy': '退货与退款政策',
      'shipping-policy': '配送政策',
      'privacy-policy': '隐私政策',
      'terms-of-service': '服务条款',
      copy: '© 2026 Snow Yuzu. 保留所有权利。'
    },
    en: {
      account: 'My Account',
      login: 'Sign in',
      orders: 'Orders',
      cart: 'Cart',
      profile: 'Edit Profile',
      service: 'Customer Service',
      about: 'About Snow Yuzu',
      brand: 'About the Brand',
      findme: 'Find Me',
      policies: 'Policies',
      contact: 'Contact Us',
      faq: 'FAQ',
      'return-policy': 'Return & Refund Policy',
      'shipping-policy': 'Shipping Policy',
      'privacy-policy': 'Privacy Policy',
      'terms-of-service': 'Terms of Service',
      copy: '© 2026 Snow Yuzu. All rights reserved.'
    }
  };

  /* 四栏结构（她 20261026 最终合并版 §5）：标题都是可点链接；账户栏子链接按登录态跳转（§5.1）
     /account/?sec=orders 已内置登录门（shop-app openOrders：未登录先提示登录，登录后自动进订单） */
  var LINKS = {
    /* §4.1（她 20261026 总任务书）：账户栏只保留「登录」「订单」两个直接入口，不再重复设置独立「账户中心」入口；购物车走 Header 购物车图标 */
    account: [['login', '/account/', 'login'], ['orders', '/account/?sec=orders']],
    service: [['contact', '/askbox/'], ['faq', '/faq/'], ['return-policy', '/return-policy/'], ['shipping-policy', '/shipping-policy/']],
    about: [['brand', '/brand/'], ['findme', '/about/']],
    policies: [['privacy-policy', '/privacy-policy/'], ['terms-of-service', '/terms-of-service/']]
  };
  var TITLE_HREF = { account: '/account/', service: '/service/', about: '/brand/', policies: '/policies/' }; /* 账户栏标题 → Profile 编辑对应页面（/account/ 登录后默认即 Profile） */

  // 社交纵向文字列表（§3.4/§5.3）：与「找到我」页同一份数据源；只有确认有效的链接才渲染成可点文字，未配置的平台不展示

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function currentLang() {
    if (window.YK && (window.YK.lang === 'zh' || window.YK.lang === 'en')) return window.YK.lang; // URL 路径优先
    if (window.LANG === 'zh' || window.LANG === 'en') return window.LANG;
    try {
      var l = localStorage.getItem('yuki-lang');
      if (l === 'en') return 'en';
    } catch (e) {}
    return 'en';
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var st = document.createElement('style');
    st.id = STYLE_ID;
    /* 电商多列 Footer（她 2026-10-26：参考 lululemon 多列布局，去掉大圆角粉卡，白/极浅粉底、顶部细分隔线） */
    st.textContent =
      '.sy-footer{max-width:1400px;margin:26px auto 22px;padding:0 24px;font-family:inherit;box-sizing:border-box;}' +
      '.sy-footer-inner{border-top:1px solid var(--accent,#FFD9E6);padding-top:30px;}' +
      '.sy-footer-cols{display:grid;grid-template-columns:repeat(4,1fr);gap:26px 36px;}' +
      '@media (max-width:899px){.sy-footer-cols{grid-template-columns:1fr 1fr;}}' +
      '@media (max-width:559px){.sy-footer{padding:0 18px 6px;margin-bottom:30px;}.sy-footer-cols{grid-template-columns:1fr;gap:22px;}}' +
      '.sy-footer-head{display:inline-block;font-size:15px;font-weight:700;color:var(--text,#604C57);margin-bottom:12px;letter-spacing:.03em;text-decoration:none;}' +
      '.sy-footer-head:hover{color:var(--price,#FF6FA5);}' +
      '.sy-footer-links{display:flex;flex-direction:column;align-items:flex-start;}' +
      '.sy-footer-social{margin-top:10px;display:flex;flex-direction:column;align-items:flex-start;gap:0;}' +
      '.sy-footer-link{color:var(--muted,#A88E9B);font-size:15px;line-height:2.15;text-decoration:none;transition:color .2s;}' +
      '.sy-footer-link:hover{color:var(--price,#FF6FA5);}' +
      '.sy-footer-bottom{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px 18px;' +
        'border-top:1px solid var(--accent,#FFD9E6);margin-top:30px;padding-top:18px;font-size:14px;color:var(--muted,#A88E9B);}' +
      '@media (max-width:559px){.sy-footer-bottom{flex-direction:column;align-items:flex-start;}}' +
      '.sy-footer-bottom .sy-footer-legal{display:flex;gap:18px;flex-wrap:wrap;}' +
      '.sy-footer-bottom a{color:var(--muted,#A88E9B);text-decoration:none;transition:color .2s;}' +
      '.sy-footer-bottom a:hover{color:var(--price,#FF6FA5);}';;
    document.head.appendChild(st);
  }

  function buildHtml() {
    var lang = currentLang();
    var txt = TEXT[lang] || TEXT.zh;
    var col = function (titleKey, items) {
      var yk = function (u) { return (typeof window.ykLink === 'function') ? window.ykLink(u) : u; }; // 链接跟随语言路径
      return '<div class="sy-footer-col">' +
        '<a class="sy-footer-head" href="' + esc(yk(TITLE_HREF[titleKey])) + '">' + esc(txt[titleKey]) + '</a>' +
        '<div class="sy-footer-links">' +
        items.map(function (p) {
          var extra = p[2] === 'login' ? ' data-acc="login"' : '';
          return '<a class="sy-footer-link" href="' + esc(yk(p[1])) + '"' + extra + '>' + esc(txt[p[0]]) + '</a>';
        }).join('') +
        (titleKey === 'about' ? '<div class="sy-footer-social" id="sy-footer-social"></div>' : '') +
        '</div></div>';
    };
    return '<div class="sy-footer"><div class="sy-footer-inner">' +
      '<div class="sy-footer-cols">' +
        col('account', LINKS.account) + col('service', LINKS.service) +
        col('about', LINKS.about) + col('policies', LINKS.policies) +
      '</div>' +
      '<div class="sy-footer-bottom">' +
        '<span>' + esc(txt.copy) + '</span>' +
        '<span class="sy-footer-legal">' +
          '<a href="' + ((typeof window.ykLink === 'function') ? window.ykLink('/privacy-policy/') : '/privacy-policy/') + '">' + esc(txt['privacy-policy']) + '</a>' +
          '<a href="' + ((typeof window.ykLink === 'function') ? window.ykLink('/terms-of-service/') : '/terms-of-service/') + '">' + esc(txt['terms-of-service']) + '</a>' +
        '</span>' +
      '</div>' +
      '</div></div>';
  }

  // 社交文字列表：与「找到我」页同一份 links 配置（social-cards.js 单一数据源）；
  // 页面未引 social-cards.js 时动态加载；有 url 才渲染成可点文字，微信纯展示账号名，未配置平台（TikTok/YouTube）不出现在 Footer
  function renderSocial() {
    var box = document.getElementById('sy-footer-social');
    if (!box) return;
    var done = function (links) {
      if (!box.isConnected) return;
      // 她 20261031 §6：页脚只留 Discord / Gmail / WeChat / TikTok / Instagram，其余平台过滤掉（包括旧数据里残留的）
      var ALLOW = ['discord', 'gmail', 'wechat', 'tiktok', 'instagram'];
      var NAME_EN = { '微信': 'WeChat' };
      var isEn = false;
      try { isEn = (window.YK && window.YK.lang === 'en') || /^en/i.test(document.documentElement.lang || ''); } catch (e) {}
      box.innerHTML = (links || []).filter(function (l) { return ALLOW.indexOf(l.icon) !== -1; }).map(function (l) {
        var nm = (isEn && NAME_EN[l.name]) ? NAME_EN[l.name] : l.name;
        if (l.url) return '<a class="sy-footer-link" href="' + esc(l.url) + '"' + (l.url.indexOf('mailto:') === 0 ? '' : ' target="_blank" rel="noopener"') + '>' + esc(nm) + '</a>';
        if (l.sub) return '<span class="sy-footer-link" style="cursor:default;">' + esc(nm) + '：' + esc(l.sub) + '</span>';
        return '';
      }).join('');
    };
    if (window.getSocialLinks) { window.getSocialLinks().then(done); return; }
    var ver = '20261026m';
    try { var me = document.querySelector('script[src*="site-footer"]'); var mv = me && me.src.match(/v=([\w-]+)/); if (mv) ver = mv[1]; } catch (e) {}
    var sEl = document.createElement('script');
    sEl.src = '/js/social-cards.js?v=' + ver;
    sEl.onload = function () { if (window.getSocialLinks) window.getSocialLinks().then(done); else box.parentNode.removeChild(box); };
    sEl.onerror = function () { box.parentNode.removeChild(box); };
    document.head.appendChild(sEl);
  }

  window.renderSiteFooter = function () {
    ensureStyle();
    var html = buildHtml();
    var footer = document.querySelector('footer');
    if (footer) {
      footer.style.padding = '0';
      footer.style.background = '#FFFBFC'; /* §5.5.6：主背景 #FFFBFC，不恢复浓粉卡 */
      footer.innerHTML = html;
      renderSocial();
      return;
    }
    var el = document.createElement('footer');
    el.style.padding = '0';
    el.style.background = '#FFFBFC';
    el.innerHTML = html;
    document.body.appendChild(el);
    renderSocial();
  };

  // 「登录」按登录态跳：已登录进订单页，未登录进登录页（§5.1）；页面自带用户态判断（shop-app 的 yuki-user-session）
  if (!window.__syFooterNavBound) {
    window.__syFooterNavBound = true;
    document.addEventListener('click', function (e) {
      var a = e.target && e.target.closest ? e.target.closest('a[data-acc="login"]') : null;
      if (!a) return;
      var logged = false;
      try { logged = !!(JSON.parse(localStorage.getItem('yuki-user-session') || 'null')); } catch (err) {}
      if (logged) { e.preventDefault(); location.href = (typeof window.ykLink === 'function' ? window.ykLink('/account/') : '/account/') + '?sec=orders'; }
    });
    // 页底返回钮（§1.2）：有站内来源时回退历史，直达时走默认 href，不会离开网站
    document.addEventListener('click', function (e) {
      var a = e.target && e.target.closest ? e.target.closest('a.page-back') : null;
      if (!a) return;
      try {
        if (document.referrer && new URL(document.referrer).origin === location.origin && history.length > 1) {
          e.preventDefault();
          history.back();
        }
      } catch (err) {}
    });
  }

  // 语言切换时跟随更新（延迟 50ms，等页面自身逻辑先跑）
  if (!window.__syFooterLangBound) {
    window.__syFooterLangBound = true;
    document.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('.lang-btn') : null;
      if (!btn) return;
      setTimeout(function () { window.renderSiteFooter(); }, 50);
    });
  }
})();
