/* ═══════════ 全站共享运行时（所有页面共用：数据层 / 工具 / 分享 / 双语 / 灯箱 / 日期选择器 / 下拉）═══════════
   页面脚本在其之后加载，可直接使用这里暴露的全部函数与变量。 */

// ===== 转义 =====
function escDb(s) {
  var d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}
function escAttrDb(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

// ===== Supabase 数据层（全站同一份连接与登录态） =====
var DB_BASE = 'https://zajcglvlzsolygvjeumb.supabase.co/rest/v1/';
var DB_HEADERS = {
  'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InphamNnbHZsenNvbHlndmpldW1iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEyMzI4NjUsImV4cCI6MjEwNjgwODg2NX0.7_Pthb3wPInb5v4o7IoWejozEvDZQgNPS8DgwikQ8ys',
  'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InphamNnbHZsenNvbHlndmpldW1iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEyMzI4NjUsImV4cCI6MjEwNjgwODg2NX0.7_Pthb3wPInb5v4o7IoWejozEvDZQgNPS8DgwikQ8ys'
};
function dbFetch(path) {
  return fetch(DB_BASE + path, { headers: DB_HEADERS }).then(function (r) { return r.ok ? r.json() : []; });
}
var AUTH_TOKEN = null;
function getAuthToken() { // 用后台登录态（refresh token）换 access token，让前台写入走 authenticated
  if (AUTH_TOKEN) return Promise.resolve(AUTH_TOKEN);
  var s = null;
  try { s = JSON.parse(localStorage.getItem('yuki-admin-session') || 'null'); } catch (e) {}
  if (!s || !s.r) return Promise.resolve(null);
  return fetch('https://zajcglvlzsolygvjeumb.supabase.co/auth/v1/token?grant_type=refresh_token', {
    method: 'POST',
    headers: { 'apikey': DB_HEADERS.apikey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: s.r })
  }).then(function (r) { return r.ok ? r.json() : null; }).then(function (data) {
    if (data && data.access_token) {
      AUTH_TOKEN = data.access_token;
      if (data.refresh_token) {
        s.r = data.refresh_token;
        try { localStorage.setItem('yuki-admin-session', JSON.stringify(s)); } catch (e) {}
      }
      return AUTH_TOKEN;
    }
    return null;
  }).catch(function () { return null; });
}
function dbSend(path, method, body) {
  return getAuthToken().then(function (tk) {
    var h = Object.assign({}, DB_HEADERS, { 'Content-Type': 'application/json' });
    if (tk) h.Authorization = 'Bearer ' + tk;
    return fetch(DB_BASE + path, { method: method, headers: h, body: JSON.stringify(body) }).then(function (r) {
      if (!r.ok) throw new Error('db');
      return r.json();
    });
  });
}

// ===== 金额与色卡数据（前台展示版，与后台同一套计算口径） =====
function fmtMoney(v) {
  return (parseFloat(v) || 0).toFixed(2); // 金额统一两位小数，避免浮点长尾
}
function rowTotalV(r) {
  return (parseFloat(r.price) || 0) * (parseInt(r.qty, 10) || 0);
}
function artistCountV(a) {
  return a.rows.reduce(function (t, r) { return t + (parseInt(r.qty, 10) || 0); }, 0);
}
function labelAggV(a) {
  var agg = {}, order = [];
  a.rows.forEach(function (r) {
    var l = r.label || '其他';
    if (!(l in agg)) { agg[l] = 0; order.push(l); }
    agg[l] += parseInt(r.qty, 10) || 0;
  });
  return order.map(function (l) { return l + ' ' + agg[l] + ' 张'; }).join(' · ');
}
function artistSubV(a) {
  return a.rows.reduce(function (t, r) { return t + rowTotalV(r); }, 0);
}
function cardTotalV(c) {
  return c.artists.reduce(function (t, a) { return t + artistSubV(a); }, 0);
}
function cardCountV(c) {
  return c.artists.reduce(function (t, a) { return t + artistCountV(a); }, 0);
}
function cardFinalV(c) {
  return cardTotalV(c) + (parseFloat(c.origPrice) || 0); // 色卡最终总金额 = 色卡购入价 + 全部私调费用
}
function normCardView(c) {
  if (!c.artists) {
    c.artists = [];
    if (c.po || c.rows) c.artists.push({ name: c.po || '画师 1', rows: c.rows || [] });
  }
  c.artists.forEach(function (a) {
    if (!a.rows) {
      a.rows = [];
      if (a.price != null && a.price !== '' || a.qty != null) a.rows.push({ label: '单人', price: a.price, qty: a.qty || 1 });
      if (a.d) a.rows.push({ label: '双人', qty: parseInt(a.d, 10) || 0, price: a.price });
      if (a.o) a.rows.push({ label: '其他', qty: parseInt(a.o, 10) || 0, price: a.price });
      if (!a.rows.length) a.rows.push({ label: '单人', price: '', qty: 1 });
    }
    a.rows.forEach(function (r) {
      if (r.qty == null) r.qty = 1;
      if (r.label == null) r.label = '';
    });
  });
  return c;
}
var CARDS_CACHE = [];  // 页面脚本按需填充
var BJDS_CACHE = [];   // 页面脚本按需填充

// ===== BJD 数据（前台展示版） =====
function normBjdView(b) {
  b = b || {};
  return {
    name: b.name || '', image: b.image || '', cover: b.cover || '',
    head: b.head || {}, body: b.body || {}, eyes: b.eyes || {}, clothes: b.clothes || {},
    faceup: b.faceup || {}, price: b.price || {}, purchase: b.purchase || {},
    photos: Array.isArray(b.photos) ? b.photos : [], notes: b.notes || '',
    parts: b.parts || {}, homeShow: b.homeShow !== false
  };
}
function bjdMeta(b) {
  if (b.head && b.head.size == null) b.head.size = b.size || ''; // 旧数据迁移
  return [(b.head && b.head.size) || '', [b.head.brand || '', b.head.sculpt || ''].join(' ').trim()].filter(Boolean).join(' · ');
}
function bjdRow(label, val) {
  if (val == null || String(val).trim() === '') return '';
  return '<div style="display:flex;gap:12px;padding:3px 0;font-size:13px;"><span style="color:var(--muted);flex-shrink:0;width:96px;">' + label + '</span><span>' + escDb(val) + '</span></div>';
}
function bjdHasPart(b, part) {
  // 部件由后台勾选决定：没勾选 = 没有这个部件
  if (part === '娃娃头') return b.parts.head !== false;
  if (part === '娃娃身体') return b.parts.body !== false;
  if (part === '眼睛') return b.parts.eyes !== false;
  return true;
}
function bjdCatRank(b) {
  return (bjdHasPart(b, '娃娃头') ? 4 : 0) + (bjdHasPart(b, '娃娃身体') ? 2 : 0) + (bjdHasPart(b, '眼睛') ? 1 : 0);
}

// ===== 通用 UI =====
function toast(msg) {
  var t0 = document.getElementById('toast');
  if (!t0) return;
  t0.textContent = msg;
  t0.classList.add('show');
  setTimeout(function () { t0.classList.remove('show'); }, 1800);
}
function normImg(u) { // 相对图片路径转根绝对（子页在 /photos/ /bjd/ 等目录下也能正确加载）
  u = String(u || '');
  return /^(https?:\/\/|data:)/.test(u) ? u : '/' + u.replace(/^\/+/, '');
}
function loadPhoto(el, hideIfMissing) {
  var src = normImg(el.getAttribute('data-img'));
  var probe = new Image();
  probe.onload = function () {
    el.style.background = 'none';
    el.innerHTML = '';
    var img = document.createElement('img');
    img.src = src;
    img.alt = '照片';
    el.appendChild(img);
  };
  if (hideIfMissing) probe.onerror = function () { el.style.display = 'none'; };
  probe.src = src;
}
function loadDbImg(el, src) {
  src = normImg(src);
  var probe = new Image();
  probe.onload = function () {
    el.style.background = 'none';
    Array.prototype.forEach.call(el.querySelectorAll('img'), function (x) { if (x.parentNode) x.parentNode.removeChild(x); }); // 幂等：先清旧图再换新，避免同一容器叠多张
    var img = document.createElement('img');
    img.src = src;
    img.alt = '照片';
    el.appendChild(img);
  };
  probe.onerror = function () {
    var box = el.closest('.album-item, .photo');
    if (box) box.style.display = 'none';
  };
  probe.src = src;
}
// 相册小字：点 figcaption 直接写，自动保存到本机
function bindCaption(cap) {
  var fig = cap.closest('.album-item');
  if (!fig) return;
  var key = 'yuki-note-' + fig.getAttribute('data-img');
  var saved = null;
  try { saved = localStorage.getItem(key); } catch (err) {}
  if (saved) {
    cap.textContent = saved;
    cap.removeAttribute('data-zh');
    cap.removeAttribute('data-en');
  }
  cap.setAttribute('contenteditable', 'true');
  cap.setAttribute('spellcheck', 'false');
  cap.addEventListener('input', function () {
    try { localStorage.setItem(key, cap.textContent); } catch (err) {}
  });
  cap.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); cap.blur(); }
  });
  cap.addEventListener('click', function (e) { e.stopPropagation(); });
}
function scrollToEl(el) {
  setTimeout(function () {
    var y = el.getBoundingClientRect().top + window.pageYOffset - 74;
    window.scrollTo({ top: y, behavior: 'smooth' });
  }, 60);
}
window.__menuScroll = function (sc) { // 菜单点「日历/找到我」等区块入口：当前页内平滑滚动
  var el = document.getElementById(sc);
  if (el) scrollToEl(el);
};
var ASKBOX_URL = '/askbox/'; // 匿名提问箱页面

// ===== 色卡 / BJD 分享：独立子页链接（不再使用 #） =====
var SHARE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V4"/><path d="M8 7l4-4 4 4"/><path d="M6 11h-1a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1"/></svg>';
var ADMIN_LOGGED = false;
try { ADMIN_LOGGED = !!localStorage.getItem('yuki-admin-session'); } catch (e) {}
function cardEditBtn(i) {
  // 编辑卡：仅登录后显示；传真实 card_id（旧数据暂无 id 时传位置，后台打开会自动补 id）
  if (!ADMIN_LOGGED) return '';
  var c = (window.CARDS_CACHE || CARDS_CACHE)[i];
  var key = (c && c.id) ? String(c.id) : String(i);
  return '<button class="card-edit-btn" data-edit-card="' + escAttrDb(key) + '" data-zh="编辑卡" data-en="Edit">编辑卡</button>';
}
function shareBtnHtml(i, type, inline) {
  return '<button class="share-btn' + (inline ? ' share-inline' : '') + '" data-share="' + i + '" data-share-type="' + (type || 'card') + '" title="' + t('分享', 'Share') + '" aria-label="' + t('分享', 'Share') + '">' + SHARE_ICON + '</button>';
}
function shareLink(i, type) {
  return location.origin + (type === 'bjd' ? '/bjd/?id=' : '/color-card/?card=') + i;
}
function sharePopItems() {
  return [['wx', '微信'], ['qq', 'QQ'], ['wb', '微博'], ['xhs', '小红书'], ['fb', 'Facebook'], ['x', 'X / Twitter'], ['wa', 'WhatsApp'], ['ms', 'Messenger'], ['mail', t('邮件分享', 'Email')], ['copy', t('复制链接', 'Copy Link')]]
    .map(function (p) { return '<button class="sc-opt" data-opt="' + p[0] + '">' + p[1] + '</button>'; }).join('');
}
var shareLinkIdx = -1;   // 当前分享的色卡 / 娃娃序号
var shareLinkType = 'card'; // 'card' | 'bjd'
var shareBtnEl = null;   // 触发菜单的分享按钮（定位基准）
function sharePopOpen(btn, i, type) {
  shareLinkIdx = i;
  shareLinkType = type || 'card';
  shareBtnEl = btn;
  var pop = document.getElementById('share-pop');
  if (!pop) return;
  pop.innerHTML = sharePopItems();
  pop.style.visibility = 'hidden';
  pop.style.display = 'block';
  var r = btn.getBoundingClientRect();
  var mw = pop.offsetWidth, mh = pop.offsetHeight;
  var left = Math.min(Math.max(8, r.right - mw), window.innerWidth - mw - 8);
  var top = r.bottom + 6;
  if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 6);
  pop.style.left = left + 'px';
  pop.style.top = top + 'px';
  pop.style.visibility = 'visible';
}
function sharePopClose() {
  shareLinkIdx = -1;
  shareLinkType = 'card';
  shareBtnEl = null;
  var pop = document.getElementById('share-pop');
  if (pop) { pop.style.display = 'none'; pop.innerHTML = ''; }
}
function fallbackCopy(txt, done) {
  var ta = document.createElement('textarea');
  ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); done(); } catch (e) { toast(t('复制失败，请手动复制', 'Copy failed, please copy manually')); }
  document.body.removeChild(ta);
}
function copyText(txt, msg) {
  var done = function () { toast(msg || t('链接已复制', 'Link copied')); };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(txt).then(done, function () { fallbackCopy(txt, done); });
  } else fallbackCopy(txt, done);
}
function doShare(opt, i, type) {
  var isBjd = (type || 'card') === 'bjd';
  var c = isBjd ? BJDS_CACHE[i] : CARDS_CACHE[i];
  var link = shareLink(i, type || 'card');
  var title = (isBjd ? t('来看看这个娃娃：', 'Check out this doll: ') : t('来看看这张色卡：', 'Check out this color card: ')) +
    ((c && c.name) || (isBjd ? t('未命名娃娃', 'Unnamed doll') : t('未命名色卡', 'Unnamed card')));
  var enc = encodeURIComponent;
  if (opt === 'copy') { copyText(link); return; }
  if (opt === 'wx') { copyText(link, t('链接已复制，去微信粘贴发送', 'Link copied, paste it in WeChat')); return; }
  if (opt === 'xhs') { copyText(link, t('链接已复制，去小红书粘贴发布', 'Link copied, paste it in RED')); return; }
  if (opt === 'ms') { copyText(link, t('链接已复制，去 Messenger 粘贴发送', 'Link copied, paste it in Messenger')); return; }
  if (opt === 'qq') { window.open('https://connect.qq.com/widget/shareqq/index.html?url=' + enc(link) + '&title=' + enc(title), '_blank'); return; }
  if (opt === 'wb') { window.open('https://service.weibo.com/share/share.php?url=' + enc(link) + '&title=' + enc(title), '_blank'); return; }
  if (opt === 'fb') { window.open('https://www.facebook.com/sharer/sharer.php?u=' + enc(link), '_blank'); return; }
  if (opt === 'x') { window.open('https://twitter.com/intent/tweet?url=' + enc(link) + '&text=' + enc(title), '_blank'); return; }
  if (opt === 'wa') { window.open('https://wa.me/?text=' + enc(title + ' ' + link), '_blank'); return; }
  if (opt === 'mail') { location.href = 'mailto:?subject=' + enc(title) + '&body=' + enc(link); return; }
}
if (document.getElementById('share-pop')) {
  // 分享按钮 / 菜单的全局点击协调（开关、外部关闭、选项执行）
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.share-btn');
    if (btn) {
      if (shareBtnEl === btn) { sharePopClose(); return; } // 再点同一个图标 → 关闭
      sharePopOpen(btn, parseInt(btn.getAttribute('data-share'), 10), btn.getAttribute('data-share-type'));
      return;
    }
    var pop = document.getElementById('share-pop');
    if (pop.contains(e.target)) {
      var b = e.target.closest('.sc-opt');
      if (b) { var opt = b.getAttribute('data-opt'); var idx = shareLinkIdx; var tp = shareLinkType; sharePopClose(); doShare(opt, idx, tp); }
      return;
    }
    if (shareBtnEl) sharePopClose(); // 点外部空白 → 关闭
  });
}

// ===== 中英双语切换 =====
var LANG = 'zh';
try { LANG = localStorage.getItem('yuki-lang') || 'zh'; } catch (err) {}
var I18N_EN = {
  '找到我': 'Find Me',
  '我的小铺': 'My Shop',
  '全部照片': 'All Photos',
  '全部娃照': 'All Doll Photos',
  '匿名留言': 'Ask Box',
  'Instax Picture Collection Display 拍立得展示': 'Instax Picture Display',
  'Film Camera Pictures 胶卷相机': 'Film Camera Pictures',
  'ᜊ ·̩͙ Hello~ Welcome to My Little Word! ·̩͙ ᜊ｜ᜊ ·̩͙ Hello~ 欢迎来到小柚世界の指南 ·̩͙ ᜊ': 'ᜊ ·̩͙ Hello~ Welcome to My Little World! ·̩͙ ᜊ',
  '°⑅+「全世界最好の小桓宝宝」+⑅°': '°⑅+ The Best Little Huan in the World +⑅°',
  '微信': 'WeChat',
  '点击复制：yuki_060119': 'Tap to copy: yuki_060119',
  '抖音': 'Douyin',
  '网易云音乐': 'NetEase Music',
  '拍立得展示': 'Instax Display',
  '胶卷相机': 'Film Camera',
  '看全部照片 →': 'See all photos →',
  '我的娃娃们': 'My dolls',
  '看全部娃照 →': 'See all doll photos →',
  '小柚的小铺': "Yuki's Shop",
  '自制小物上架中 · 点进去逛逛': 'Handmade goodies inside · Take a look',
  '匿名提问箱': 'Anonymous Q&A Box',
  '悄悄问我任何话，完全匿名 · 我的回答在这里可以看到': 'Ask me anything, totally anonymous · My replies are posted here',
  '给我递个小纸条吧': 'Send me a little note',
  '匿名提问 · 我会在这里回复 · 点进去可以看所有回答': 'Anonymous · I reply here · Tap to see all answers',
  '← 返回主页': '← Back to Home',
  '点开可全屏查看，可自行选择是否下载原图 · 文件放进去就自动显示': 'Tap to view full screen · Original photo download optional',
  '点开可全屏查看，可自行选择是否下载原图': 'Tap to view full screen · Optional download',
  '下载原图': 'Download',
  '关闭': 'Close'
};
var I18N_ZH = {};
Object.keys(I18N_EN).forEach(function (k) { I18N_ZH[I18N_EN[k]] = k; });

function t(zh, en) { return LANG === 'en' ? en : zh; }

function applyLang(lang) {
  LANG = lang;
  document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';
  var dict = lang === 'en' ? I18N_EN : I18N_ZH;
  var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
  var nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(function (n) {
    if (!n.parentElement || n.parentElement.closest('[data-zh], figcaption, script, style')) return;
    var txt = n.nodeValue;
    var trimmed = txt.trim();
    if (trimmed && dict[trimmed] !== undefined) {
      n.nodeValue = txt.replace(trimmed, dict[trimmed]);
    }
  });
  document.querySelectorAll('.lang-btn').forEach(function (b) {
    b.classList.toggle('active', b.getAttribute('data-lang') === lang);
  });
  // 相册小字/双语文案跟随语言（自己手写过的仍然优先显示手写内容）
  function setCaptionText(node, text) {
    node.textContent = '';
    var m = text.match(/^((?:Film|Instax) \d+:)([\s\S]*)$/);
    if (m) {
      var b = document.createElement('b');
      b.textContent = m[1];
      node.appendChild(b);
      node.appendChild(document.createTextNode(m[2]));
    } else {
      node.textContent = text;
    }
  }
  document.querySelectorAll('[data-zh][data-en]').forEach(function (node) {
    var text = lang === 'en' ? node.getAttribute('data-en') : node.getAttribute('data-zh');
    var fig = node.tagName === 'FIGCAPTION' ? node.closest('.album-item') : null;
    if (fig) {
      var key = 'yuki-note-' + fig.getAttribute('data-img');
      var saved = null;
      try { saved = localStorage.getItem(key); } catch (err) {}
      if (saved) { setCaptionText(node, saved); return; }
    }
    setCaptionText(node, text);
  });
  try { localStorage.setItem('yuki-lang', lang); } catch (err) {}
}
document.querySelectorAll('.lang-btn').forEach(function (b) {
  b.addEventListener('click', function () {
    var lang = b.getAttribute('data-lang') === 'en' ? 'en' : 'zh';
    try { localStorage.setItem('yuki-lang', lang); } catch (err) {}
    location.reload(); // 保存后整页刷新：从已存语言状态重新初始化，URL 保持不变
  });
});

// ===== 灯箱：全屏展示 + 可选下载 =====
function closeLightbox() {
  var box = document.getElementById('lightbox');
  if (box) box.classList.remove('open');
}
if (document.getElementById('lightbox')) {
  document.addEventListener('click', function (e) {
    var img = e.target.closest('.photo img, .album-img img');
    if (!img || img.closest('a')) return;
    var box = document.getElementById('lightbox');
    document.getElementById('lightbox-img').src = img.src;
    var dl = document.getElementById('lightbox-download');
    dl.href = img.src;
    dl.download = img.src.split('/').pop().split('?')[0] || 'photo.jpg';
    // 照片详情：大图下方保留原本的文案与分区信息
    var info = document.getElementById('lightbox-info');
    if (info) {
      var zh = '', en = '', sec = '';
      var fig = img.closest('.album-item');
      if (fig) {
        var cap = fig.querySelector('figcaption');
        if (cap) { zh = cap.getAttribute('data-zh') || ''; en = cap.getAttribute('data-en') || ''; }
        var secEl = fig.closest('section[data-sec]');
        var key = secEl ? secEl.getAttribute('data-sec') : '';
        var secObj = (window.PHOTO_SECTIONS || []).filter(function (s) { return s.key === key; })[0];
        if (secObj) sec = secObj.name_zh + (secObj.name_en ? ' / ' + secObj.name_en : '');
      }
      info.innerHTML =
        (zh ? '<div class="lb-zh">' + escDb(zh) + '</div>' : '') +
        (en && en !== zh ? '<div class="lb-en">' + escDb(en) + '</div>' : '') +
        (sec ? '<div class="lb-sec">' + escDb(sec) + '</div>' : '');
      info.style.display = info.innerHTML ? '' : 'none';
    }
    box.classList.add('open');
  });
  document.getElementById('lightbox').addEventListener('click', closeLightbox);
  document.getElementById('lightbox-close').addEventListener('click', function (e) {
    e.stopPropagation();
    closeLightbox();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeLightbox();
  });
}

// ===== 自定义日期选择器（与后台同一套，替代系统原生；仅主页日历表单使用） =====
if (document.getElementById('date-pop')) {
  var DP = null; // { input, y, m }
  var DP_WD = ['一', '二', '三', '四', '五', '六', '日']; // 周一起始，与主页日历一致
  function dpClose() { DP = null; document.getElementById('date-pop').style.display = 'none'; }
  function dpOpen(input) {
    var m = /^(\d{4})-(\d{2})/.exec(input.value || '');
    var t0 = new Date();
    DP = { input: input, y: m ? parseInt(m[1], 10) : t0.getFullYear(), m: m ? parseInt(m[2], 10) - 1 : t0.getMonth() };
    dpRender();
    var pop = document.getElementById('date-pop');
    pop.style.display = 'block';
    var r = input.getBoundingClientRect();
    pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 245)) + 'px';
    pop.style.top = Math.min(r.bottom + 6, window.innerHeight - 290) + 'px';
  }
  function dpRender() {
    var pop = document.getElementById('date-pop');
    pop.querySelector('.dp-title').textContent = DP.y + ' 年 ' + (DP.m + 1) + ' 月';
    var t0 = new Date();
    var offset = (new Date(DP.y, DP.m, 1).getDay() + 6) % 7;
    var days = new Date(DP.y, DP.m + 1, 0).getDate();
    var html = DP_WD.map(function (w) { return '<div class="dp-wd">' + w + '</div>'; }).join('');
    for (var i = 0; i < offset; i++) html += '<span class="dp-empty"></span>';
    for (var d = 1; d <= days; d++) {
      var ds = DP.y + '-' + String(DP.m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      html += '<button class="dp-day' + (ds === DP.input.value ? ' sel' : '') + (DP.y === t0.getFullYear() && DP.m === t0.getMonth() && d === t0.getDate() ? ' today' : '') + '" data-d="' + ds + '">' + d + '</button>';
    }
    pop.querySelector('.dp-grid').innerHTML = html;
  }
  function dpPick(ds) {
    if (!DP) return;
    DP.input.value = ds;
    DP.input.dispatchEvent(new Event('input', { bubbles: true }));
    DP.input.dispatchEvent(new Event('change', { bubbles: true }));
    dpClose();
  }
  document.getElementById('date-pop').addEventListener('click', function (e) {
    e.stopPropagation();
    var t = e.target;
    if (t.classList.contains('dp-nav')) { DP.m += t.id === 'dp-prev' ? -1 : 1; if (DP.m < 0) { DP.m = 11; DP.y--; } if (DP.m > 11) { DP.m = 0; DP.y++; } dpRender(); return; }
    if (t.id === 'dp-today') { var td = new Date(); dpPick(td.getFullYear() + '-' + String(td.getMonth() + 1).padStart(2, '0') + '-' + String(td.getDate()).padStart(2, '0')); return; }
    if (t.classList.contains('dp-day')) { dpPick(t.getAttribute('data-d')); return; }
  });
  document.addEventListener('click', function (e) {
    if (e.target.classList && e.target.classList.contains('date-pick')) { dpOpen(e.target); return; }
    if (DP && !e.target.closest('#date-pop') && !e.target.classList.contains('date-pick')) dpClose();
  });
}

// ===== 统一下拉菜单（替代浏览器原生 select 面板） =====
function closeSelMenus() { document.querySelectorAll('.sel-menu').forEach(function (m) { m.style.display = 'none'; }); }
function enhanceSelects() {
  document.querySelectorAll('select:not([data-enh])').forEach(function (sel) {
    sel.setAttribute('data-enh', '1');
    sel.style.display = 'none';
    var btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'sel-btn';
    btn.textContent = sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].textContent : '';
    sel.parentNode.insertBefore(btn, sel);
    var menu = document.createElement('div');
    menu.className = 'sel-menu';
    menu.innerHTML = Array.prototype.map.call(sel.options, function (o) {
      return '<button type="button" class="sel-opt' + (o.selected ? ' active' : '') + '" data-v="' + escAttrDb(o.value) + '">' + escDb(o.textContent) + '</button>';
    }).join('');
    sel.parentNode.insertBefore(menu, sel);
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var wasOpen = menu.style.display === 'block';
      closeSelMenus();
      if (window.dpClose) dpClose();
      if (!wasOpen) {
        var r = btn.getBoundingClientRect();
        menu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 200)) + 'px';
        menu.style.top = Math.min(r.bottom + 4, window.innerHeight - 120) + 'px';
        menu.style.display = 'block';
      }
    });
    menu.addEventListener('click', function (e) {
      var b = e.target.closest('.sel-opt'); if (!b) return;
      sel.value = b.getAttribute('data-v');
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      btn.textContent = sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].textContent : '';
      Array.prototype.forEach.call(menu.children, function (x) { x.classList.toggle('active', x === b); });
      closeSelMenus();
    });
  });
}
document.addEventListener('click', function (e) {
  if (!e.target.closest('.sel-menu') && !e.target.closest('.sel-btn')) closeSelMenus();
});
enhanceSelects();

// ===== 汉堡菜单关闭（site-menu.js 负责） =====
function closeMenu() { if (window.SiteMenu) SiteMenu.close(); }
