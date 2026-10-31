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
var DB_BASE = 'https://ukxrvcptwhlwvdanovgd.supabase.co/rest/v1/';
var DB_HEADERS = {
  'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVreHJ2Y3B0d2hsd3ZkYW5vdmdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyMzgyNDcsImV4cCI6MjEwODgxNDI0N30.Grdi23yToGPFF8e_kxFjf37JOOf51j-FW_FYQTUVu8E',
  'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVreHJ2Y3B0d2hsd3ZkYW5vdmdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyMzgyNDcsImV4cCI6MjEwODgxNDI0N30.Grdi23yToGPFF8e_kxFjf37JOOf51j-FW_FYQTUVu8E'
};
function dbFetch(path) {
  return fetch(DB_BASE + path, { headers: DB_HEADERS }).then(function (r) { return r.ok ? r.json() : []; });
}
var AUTH_TOKEN = null;
function ykSessionKey() { // 与 ykSession 同判，返回命中的键名（刷新后写回同一把，避免双拷贝互踩）
  var u = ykReadKey('yuki-user-session'), m = ykReadKey('yuki-admin-session');
  if (u && m) return (m.t && (!u.t || m.t > u.t)) ? 'yuki-admin-session' : 'yuki-user-session';
  return u ? 'yuki-user-session' : 'yuki-admin-session';
}
function ykWriteSession(s, prefer) {
  // 全站唯一会话写入点：会话只存一把钥匙，写入时清掉另一把，
  // 杜绝同一 refresh token 的两份拷贝互相作废（身份在不同页面不一致的根因）
  try {
    if (!s) { localStorage.removeItem('yuki-user-session'); localStorage.removeItem('yuki-admin-session'); AUTH_TOKEN = null; return; }
    var k = prefer || ykSessionKey();
    localStorage.setItem(k, JSON.stringify(s));
    localStorage.removeItem(k === 'yuki-user-session' ? 'yuki-admin-session' : 'yuki-user-session');
    AUTH_TOKEN = null;
  } catch (e) {}
}
var YK_REFRESHING = null; // 页内单飞：多处同时要刷新时只发一次请求
function ykATFresh(s) { // access token 还新鲜（余量 >120s）就不旋转 refresh token，避免多页/多标签无谓互踩
  if (!s || !s.a) return false;
  try {
    var p = JSON.parse(atob(s.a.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return !!(p && p.exp && p.exp > Date.now() / 1000 + 120);
  } catch (e) { return false; }
}
function ykRefreshSession() { // 统一续期：a 新鲜直接复用；否则刷新并写回原键；并发/竞态时重读最新 r 重试一次
  if (YK_REFRESHING) return YK_REFRESHING;
  var key = ykSessionKey();
  var s = ykReadKey(key);
  if (!s || !s.r) return Promise.resolve(null);
  if (ykATFresh(s)) return Promise.resolve(s);
  var triedR = s.r;
  var callRefresh = function (r) {
    return fetch('https://ukxrvcptwhlwvdanovgd.supabase.co/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: { 'apikey': DB_HEADERS.apikey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: r })
    }).then(function (resp) { return resp.json().then(function (j) { return { ok: resp.ok, j: j }; }); });
  };
  var apply = function (res, base, k) {
    if (res && res.ok && res.j && res.j.access_token) {
      var s2 = { a: res.j.access_token, r: res.j.refresh_token || base.r, email: base.email || (res.j.user && res.j.user.email) || null, t: base.t || Date.now() };
      ykWriteSession(s2, k);
      AUTH_TOKEN = s2.a;
      return s2;
    }
    return null;
  };
  YK_REFRESHING = callRefresh(triedR).then(function (res) {
    var done = apply(res, s, key);
    if (done) return done;
    // 失败先别下结论：别的页面可能刚把 r 换新（并发刷新），重读重试一次
    var sNow = ykReadKey(key);
    if (sNow && sNow.r && sNow.r !== triedR) return callRefresh(sNow.r).then(function (res2) { return apply(res2, sNow, key); });
    // r 没变还被拒：会话真失效了（含 refresh token 被旋转后超窗），清干净避免半死状态
    var err = (res.j && (res.j.error || res.j.error_code || res.j.msg)) || '';
    if (res.j && res.j.error_description && res.j.error_description.indexOf('invalid') !== -1) err = 'invalid';
    if (err === 'invalid_grant' || err === 'refresh_token_not_found' || err === 'invalid' || res.j && res.j.error === 'invalid_grant') ykWriteSession(null);
    return null;
  }).catch(function () { return null; /* 网络抖动：保会话，下次再试 */ }).then(function (v) { YK_REFRESHING = null; return v; });
  return YK_REFRESHING;
}
function getAuthToken() { // 用登录态（refresh token）换 access token，让前台写入走 authenticated
  if (AUTH_TOKEN) return Promise.resolve(AUTH_TOKEN);
  return ykRefreshSession().then(function (s) { return s ? s.a : null; });
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
// 兼容纯文本价格：能提取到数字就统一两位小数，纯文字备注原样保留（兼容带 $/¥ 符号的旧数据）
function fmtPriceText(s) {
  var str = String(s == null ? '' : s).trim().replace(/^[¥$]+/, '');
  if (str === '') return '';
  var num = parseFloat(str.replace(/[,\s]/g, ''));
  return isFinite(num) && /^\d+(\.\d+)?$/.test(str.replace(/[,\s]/g, '')) ? fmtMoney(num) : str;
}
// 详情页价格行：纯数字加 ¥ 前缀 + 两位小数，文字原样
function fmtPriceRow(s) {
  var v = fmtPriceText(s);
  return v === '' ? '' : (/^\d/.test(v) ? '¥' + v : v);
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
var WORKS_CACHE = [];  // 页面脚本按需填充（稿件展示）

// ===== 卡片多图翻页（色卡 / BJD / 小铺通用）：‹ › 切换、右下角计数 =====
function pagerImgsOf(o) {
  o = o || {};
  var arr = [];
  if (Array.isArray(o.images) && o.images.length) arr = o.images.filter(Boolean); // 小铺：images 自带主图
  else if (o.image || Array.isArray(o.photos)) { // 色卡/BJD/稿件：封面在前，照片跟后（去重）
    if (o.image) arr.push(o.image);
    (Array.isArray(o.photos) ? o.photos : []).forEach(function (u) { if (u && arr.indexOf(u) === -1) arr.push(u); });
  }
  else if (o.image_url) arr = [o.image_url];
  return arr.map(function (u) { return normImg(u); });
}
function pagerWrapHtml(urls, alt) {
  urls = urls || [];
  if (!urls.length) return '<div style="width:100%;aspect-ratio:1/1;background:var(--card);"></div>';
  var multi = urls.length > 1;
  // 圆点 + 缩略图条放在图片下方（不覆盖在图片上），箭头保留在图两侧
  return '<div class="pg-holder">' +
    '<div class="pg-wrap" data-i="0" style="position:relative;width:100%;aspect-ratio:1/1;overflow:hidden;background:var(--card);">' +
      '<img class="pg-img" src="' + escAttrDb(urls[0]) + '" data-urls="' + escAttrDb(JSON.stringify(urls)) + '" style="width:100%;height:100%;object-fit:contain;display:block;" alt="' + escAttrDb(alt || '') + '" loading="lazy">' +
      (multi ? '<button type="button" class="pg-btn pg-prev" aria-label="上一张">‹</button><button type="button" class="pg-btn pg-next" aria-label="下一张">›</button>' : '') +
    '</div>' +
    (multi ?
      '<div class="pg-dots">' + urls.map(function (_, k) { return '<span class="pg-dot' + (k === 0 ? ' on' : '') + '"></span>'; }).join('') + '</div>' +
      '<div class="pg-thumbs">' + urls.map(function (u, k) { return '<img class="pg-thumb' + (k === 0 ? ' on' : '') + '" src="' + escAttrDb(u) + '" data-k="' + k + '" alt="" loading="lazy">'; }).join('') + '</div>'
      : '') +
    '</div>';
}
function pgSet(wrap, i) { // 统一切换：大图 + 下方圆点（当前长条） + 图下小图预览（自动滚到当前，也可点小图跳转）
  var img = wrap.querySelector('.pg-img');
  var holder = wrap.closest('.pg-holder') || wrap;
  var urls = [];
  try { urls = JSON.parse(img.getAttribute('data-urls') || '[]'); } catch (err) {}
  if (!urls.length) return;
  i = (i + urls.length) % urls.length;
  wrap.setAttribute('data-i', String(i));
  img.src = urls[i];
  holder.querySelectorAll('.pg-dot').forEach(function (d, k) { d.classList.toggle('on', k === i); });
  holder.querySelectorAll('.pg-thumb').forEach(function (t, k) {
    t.classList.toggle('on', k === i);
    if (k === i) { try { t.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }); } catch (err) { t.scrollIntoView(); } } // 小图条自动滑到当前张
  });
}
document.addEventListener('click', function (e) { // 捕获阶段拦下箭头/小图点击，不触发卡片本身的进详情；点大图直接进详情页
  var t = e.target.closest ? e.target.closest('.pg-btn, .pg-thumb') : null;
  if (!t) return;
  e.preventDefault(); e.stopPropagation();
  var holder = t.closest('.pg-holder');
  var wrap = holder ? holder.querySelector('.pg-wrap') : t.closest('.pg-wrap');
  if (!wrap) return;
  var urls = [];
  try { urls = JSON.parse(wrap.querySelector('.pg-img').getAttribute('data-urls') || '[]'); } catch (err) {}
  if (urls.length < 2) return;
  if (t.classList.contains('pg-thumb')) { pgSet(wrap, parseInt(t.getAttribute('data-k'), 10) || 0); return; }
  var i = parseInt(wrap.getAttribute('data-i') || '0', 10) || 0;
  pgSet(wrap, i + (t.classList.contains('pg-next') ? 1 : -1));
}, true);

// ===== BJD 总价（与色卡总价同一套展示口径）：已启用部件的价格自动求和 =====
function bjdTotalV(b) {
  var p = (b && b.price) || {}, parts = (b && b.parts) || {};
  var sum = 0;
  var add = function (v) {
    var m = String(v == null ? '' : v).replace(/[^\d.]/g, '');
    if (m !== '' && !isNaN(parseFloat(m))) sum += parseFloat(m);
  };
  if (parts.head !== false) { add(p.doll); add(p.faceup); } // 娃头选中时妆面才计价
  if (parts.body !== false) add(p.body);
  if (parts.eyes !== false) add(p.eyes);
  if (parts.clothes === true) add(p.clothes);
  return sum;
}

// ===== BJD 数据（前台展示版） =====
function normBjdView(b) {
  b = b || {};
  return {
    name: b.name || '', image: b.image || '', cover: b.cover || '',
    head: b.head || {}, body: b.body || {}, eyes: b.eyes || {}, clothes: b.clothes || {},
    birth: b.birth || '', faceup: b.faceup || {}, price: b.price || {}, purchase: b.purchase || {},
    photos: Array.isArray(b.photos) ? b.photos : [], notes: b.notes || '',
    parts: b.parts || {}, homeShow: b.homeShow !== false
  };
}
var SIZE_EN = { '三分头': '1/3', '四分头': '1/4', '六分头': '1/6', '三分': '1/3', '四分': '1/4', '六分': '1/6', '八分': '1/8', '十二分': '1/12', '肉四': 'Chubby 1/4', '小六': 'Small 1/6', '矮胖六': 'Short & Chubby 1/6', '正常六分': 'Normal 1/6' };
function sizeEn(s) {
  if (s == null) return s;
  s = String(s);
  if (SIZE_EN[s]) return SIZE_EN[s];
  return s.replace(/(十二|三|四|五|六|七|八|九|十)分(头)?/g, function (_, n) {
    var f = { '三': '1/3', '四': '1/4', '五': '1/5', '六': '1/6', '七': '1/7', '八': '1/8', '九': '1/9', '十': '1/10', '十二': '1/12' }[n];
    return f || _;
  });
}
function sizeEnKeep(s) {
  if (s == null) return s;
  var en = sizeEn(s);
  return (en === String(s)) ? s : en + ' (' + s + ')';
}
function bjdMeta(b) {
  if (b.head && b.head.size == null) b.head.size = b.size || ''; // 旧数据迁移
  var sz = (b.head && b.head.size) || '';
  if (sz && LANG === 'en') sz = sizeEnKeep(sz);
  return [sz, [b.head.brand || '', b.head.sculpt || ''].join(' ').trim()].filter(Boolean).join(' · ');
}
function bjdRow(label, val) {
  if (val == null || String(val).trim() === '') return '';
  return '<div style="display:flex;gap:12px;padding:3px 0;font-size:16px;"><span style="color:var(--muted);flex-shrink:0;width:96px;">' + label + '</span><span class="f-data">' + escDb(val) + '</span></div>';
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
// ── R2 图片适配层（正式站版）─────────────────────────
// 图片源：R2 镜像 → 正式库 Supabase（后台新传图；测试库已于 2026-10-28 删除，已移出回退链）
var R2_BASE = 'https://img.yukicheng.com';
var R2_FB = ['https://ukxrvcptwhlwvdanovgd.supabase.co/storage/v1/object/public/'];
function ykImgNext(src) { // 加载失败 → 返回下一个候选源（耗尽返回空）
  var p = null, idx = -1;
  if (src && src.indexOf(R2_BASE + '/') === 0) { p = src.slice(R2_BASE.length + 1).split('?')[0]; idx = 0; }
  else {
    for (var i = 0; i < R2_FB.length; i++) {
      if (src && src.indexOf(R2_FB[i]) === 0) { p = src.slice(R2_FB[i].length).split('?')[0]; idx = i + 1; break; }
    }
  }
  if (p === null || idx >= R2_FB.length) return '';
  return R2_FB[idx] + p;
}
function normImg(u) { // 相对图片路径转根绝对 + R2 重写
  u = String(u || '');
  if (!/^data:/.test(u)) {
    var m = u.match(/https?:\/\/[^/]+\.supabase\.co\/storage\/v1\/object\/public\/([^?#]+)/);
    if (m) return R2_BASE + '/' + m[1];
    var m2 = u.match(/^\/?storage\/v1\/object\/public\/([^?#]+)/);
    if (m2) return R2_BASE + '/' + m2[1];
  }
  return /^(https?:\/\/|data:)/.test(u) ? u : '/' + u.replace(/^\/+/, '');
}
// 全局图片回退：任何 <img>（含动态渲染）加载失败自动切下一个源
document.addEventListener('error', function (e) {
  var t = e.target;
  if (t && t.tagName === 'IMG' && t.src) {
    var nxt = ykImgNext(t.src);
    if (nxt) { t.src = nxt; return; }
  }
}, true);
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
  probe.onerror = function () {
    var nxt = ykImgNext(src);
    if (nxt) { src = nxt; probe.src = nxt; return; }
    if (hideIfMissing) el.style.display = 'none';
  };
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
    var nxt = ykImgNext(src);
    if (nxt) { src = nxt; probe.src = nxt; return; }
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
var ASKBOX_URL = (window.ykLink ? window.ykLink('/askbox/') : '/askbox/'); // 匿名提问箱页面（随语言路径）

// ===== 色卡 / BJD 分享：独立子页链接（不再使用 #） =====
var SHARE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V4"/><path d="M8 7l4-4 4 4"/><path d="M6 11h-1a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1"/></svg>';
var ADMIN_LOGGED = false;
try { ADMIN_LOGGED = !!localStorage.getItem('yuki-admin-session'); } catch (e) {}
// ===== 前台「编辑」按钮（只有登录了后台账号才出现）：色卡 / BJD / 小铺 共用同一套 =====
// 传真实 id（色卡 / 商品有 id）；没有 id 的（BJD 档案）传位置编号，后台按编号打开
var EDIT_TAB_OF = { card: 'cards', bjd: 'bjd', product: 'shop', work: 'works' };
function adminEditBtn(kind, i, list) {
  if (!ADMIN_LOGGED) return '';
  var it = (list || [])[i] || {};
  var key = (it && it.id != null) ? String(it.id) : String(i);
  var zh = kind === 'bjd' ? '编辑娃' : (kind === 'product' ? '编辑商品' : '编辑卡');
  var label = t(zh, 'Edit');
  return '<button class="card-edit-btn" data-edit-kind="' + kind + '" data-edit-key="' + escAttrDb(key) + '" data-edit-card="' + escAttrDb(key) + '" data-zh="' + zh + '" data-en="Edit">' + label + '</button>';
}
function cardEditBtn(i) { return adminEditBtn('card', i, (window.CARDS_CACHE || CARDS_CACHE)); }
function bjdEditBtn(i) { return adminEditBtn('bjd', i, (window.BJDS_CACHE || BJDS_CACHE)); }
function workEditBtn(i, list) { return adminEditBtn('work', i, list).replace(/编辑卡/g, '编辑稿'); } // 稿件：同套编辑按钮，文案用「编辑稿」
// 点「编辑」→ 记下要编辑的对象，跳到后台对应 tab 直接展开它
if (!window.__editBtnBound) {
  window.__editBtnBound = 1;
  document.addEventListener('click', function (e) {
    var eb = e.target && e.target.closest ? e.target.closest('.card-edit-btn') : null;
    if (!eb) return;
    e.preventDefault(); e.stopPropagation();
    var kind = eb.getAttribute('data-edit-kind') || 'card';
    try { sessionStorage.setItem('admin-edit-' + kind, eb.getAttribute('data-edit-key') || ''); } catch (err) {}
    location.href = '/admin.html#' + (EDIT_TAB_OF[kind] || 'cards');
  }, true);
}
function shareBtnHtml(i, type, inline) {
  return '<button class="share-btn' + (inline ? ' share-inline' : '') + '" data-share="' + i + '" data-share-type="' + (type || 'card') + '" title="' + t('分享', 'Share') + '" aria-label="' + t('分享', 'Share') + '">' + SHARE_ICON + '</button>';
}
function shareLink(i, type) {
  // 分享链接跟随当前页面语言：中文页分享出去就是 /zh/... 的中文页面
  var p = type === 'bjd' ? '/bjd/?id=' : type === 'work' ? '/works/?id=' : '/color-card/?card=';
  return location.origin + (window.ykLink ? window.ykLink(p) : p) + i;
}
function sharePopItems() {
  // 她 20261031 §6：分享面板也只保留微信 / 邮件 / 复制链接，其他平台（QQ、微博、小红书、Facebook、X、WhatsApp、Messenger）全部下掉
  return [['wx', '微信'], ['mail', t('邮件分享', 'Email')], ['copy', t('复制链接', 'Copy Link')]]
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
  var kind = type || 'card';
  var isBjd = kind === 'bjd';
  var isWork = kind === 'work';
  var c = isBjd ? BJDS_CACHE[i] : isWork ? WORKS_CACHE[i] : CARDS_CACHE[i];
  var link = shareLink(i, kind);
  var title = (isBjd ? t('来看看这个娃娃：', 'Check out this doll: ') : isWork ? t('来看看这篇稿件：', 'Check out this work: ') : t('来看看这张色卡：', 'Check out this color card: ')) +
    ((c && c.name) || (isBjd ? t('未命名娃娃', 'Unnamed doll') : isWork ? t('未命名稿件', 'Untitled work') : t('未命名色卡', 'Unnamed card')));
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
/* 她 20261030 §2：用户原始内容彻底不译——留言墙、提问与回复、任何标了 data-raw 的节点。
   命中这个选择器范围内的文字节点与属性一概不碰，即便用户写的字刚好和界面词典里的词一样。 */
var YK_RAW_SEL = '#qa-list, .qa, .qa-q, .qa-reply, .qa-meta, [data-raw], [data-no-translate]';
var LANG = (window.YK && window.YK.lang) || 'en'; // 语言由 URL 路径决定（/zh/ = 中文，根路径 = 英文）
try { history.scrollRestoration = 'manual'; } catch (err) {} // 刷新/切语言/logo 回主页都从页面顶部开始，不恢复上次滚动位置
try { LANG = (window.YK && window.YK.lang) || localStorage.getItem('yuki-lang') || 'en'; } catch (err) {}
var I18N_EN = {
  '找到我': 'Find Me',
  '我的小铺': 'My Shop',
  '全部照片': 'All Photos',
  '全部娃照': 'All Doll Photos',
  '匿名留言': 'Contact & Messages',
  '联系我们': 'Contact Us',
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
  '匿名提问箱': 'Contact Us',
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

/* ═══ 英文页残留中文补齐（她 20261031 §1/§4/§5/§6）═══
   文字节点、下拉选项、无障碍与提示属性（aria-label/title/placeholder/alt）统一走这张表；
   中文页不查这张表（中文就是原文），因此不影响中文页面。 */
var YK_EN_EXTRA = {
  /* ——— 无障碍 / 提示 ——— */
  '回主页': 'Back to home',
  '购物车': 'Cart',
  '菜单': 'Menu',
  '关闭': 'Close',
  '关闭聊天': 'Close chat',
  '上一张': 'Previous',
  '下一张': 'Next',
  '上个月': 'Previous month',
  '下个月': 'Next month',
  '管理': 'Manage',
  '发送': 'Send',
  '打开小助手ovo': "Open Yuki's Assistant",
  '小柚助手': "Yuki's Assistant",
  '点击快速选择年月': 'Tap to choose year & month',
  '运单号 / Tracking number': 'Tracking number',
  /* ——— 排序 / 筛选下拉（BJD、色卡） ——— */
  '默认排序': 'Default',
  '添加时间 最新 → 最旧': 'Added: newest → oldest',
  '添加时间 最旧 → 最新': 'Added: oldest → newest',
  '购入日期 最新 → 最旧': 'Purchased: newest → oldest',
  '购入日期 最旧 → 最新': 'Purchased: oldest → newest',
  '价格 低 → 高': 'Price: low → high',
  '价格 高 → 低': 'Price: high → low',
  '张数 多 → 少': 'Cards: many → few',
  '张数 少 → 多': 'Cards: few → many',
  '种类 正序': 'Type: A → Z',
  '种类 倒序': 'Type: Z → A',
  '名称 A → Z': 'Name: A → Z',
  '名称 Z → A': 'Name: Z → A',
  '尺寸 正序': 'Size: small → large',
  '尺寸 倒序': 'Size: large → small',
  /* ——— 政策 / 品牌 / 服务页 ——— */
  '网站政策': 'Policies',
  '隐私政策': 'Privacy Policy',
  '我们如何收集与保护你的信息': 'How we collect and protect your information',
  '服务条款': 'Terms of Service',
  '使用本站与小铺服务的相关条款': 'Terms for using the site and the shop',
  '常见问题': 'FAQ',
  '品牌介绍': 'About the Brand',
  '各平台账号汇总': 'All social accounts',
  '手作小物 · 色卡 · 稿件': 'Handmade goods · Color cards · Commissions',
  '留言会直接送达柚子': 'Messages go straight to Yuki',
  '客户服务': 'Customer Service',
  '商品咨询、订单问题、售后与退款，留言直接送达柚子': 'Product questions, order issues, after-sales and refunds — messages go straight to Yuki',
  '购买流程、发货时间、常见疑问一次说清': 'Ordering, dispatch times and common questions, all in one place',
  '退货与退款政策': 'Return & Refund Policy',
  '退货条件、退款流程与时限': 'Return conditions, refund process and time limits',
  '配送政策': 'Shipping Policy',
  '发货时间、运费与物流查询': 'Dispatch times, shipping fees and tracking'
};
Object.assign(I18N_EN, YK_EN_EXTRA); // 保留旧入口，同时单独留一份给会被内页覆盖的页面用

/* ═══ 页面标题（浏览器标签）也要跟随语言（她 20261031 §1）═══
   源页的 <title> 是中文/英文混写的，这里按“原文标题”查表给出对应语言版本；
   首次运行把原标题存进 <html data-base-title>，反复 applyLang 不会叠加。 */
var TITLE_MAP = {
  '关于 Snow Yuzu · 小柚的小世界': { zh: '关于 Snow Yuzu · 小柚的小世界', en: 'About Snow Yuzu · My Little World' },
  "我的账号 · Yuki's Shop": { zh: '我的账号 · Yuki\'s Shop', en: "My Account · Yuki's Shop" },
  '联系我们 · Yuki / 柚子': { zh: '联系我们 · Yuki / 柚子', en: 'Contact Us · Yuki' },
  'BJD · Yuki / 柚子': { zh: 'BJD · Yuki / 柚子', en: 'BJD · Yuki / 柚子' },
  'BJD萌物自拍 · Yuki / 柚子': { zh: 'BJD萌物自拍 · Yuki / 柚子', en: 'BJD Doll Selfies · Yuki' },
  '品牌介绍 · Snow Yuzu': { zh: '品牌介绍 · Snow Yuzu', en: 'About the Brand · Snow Yuzu' },
  'Color Cards · Yuki / 柚子': { zh: '色卡 · Yuki / 柚子', en: 'Color Cards · Yuki / 柚子' },
  '常见问题 FAQ · Snow Yuzu': { zh: '常见问题 FAQ · Snow Yuzu', en: 'FAQ · Snow Yuzu' },
  'Photo Gallery · Yuki / 柚子': { zh: '照片墙 · Yuki / 柚子', en: 'Photo Gallery · Yuki / 柚子' },
  '网站政策 · Snow Yuzu': { zh: '网站政策 · Snow Yuzu', en: 'Policies · Snow Yuzu' },
  '隐私政策 · Snow Yuzu': { zh: '隐私政策 · Snow Yuzu', en: 'Privacy Policy · Snow Yuzu' },
  '退货与退款政策 · Snow Yuzu': { zh: '退货与退款政策 · Snow Yuzu', en: 'Return & Refund Policy · Snow Yuzu' },
  '客户服务 · Snow Yuzu': { zh: '客户服务 · Snow Yuzu', en: 'Customer Service · Snow Yuzu' },
  '配送政策 · Snow Yuzu': { zh: '配送政策 · Snow Yuzu', en: 'Shipping Policy · Snow Yuzu' },
  "小柚的小铺 · Yuki's Shop": { zh: '小柚的小铺', en: "Yuki's Shop" },
  '服务条款 · Snow Yuzu': { zh: '服务条款 · Snow Yuzu', en: 'Terms of Service · Snow Yuzu' },
  '物流查询 · Snow Yuzu': { zh: '物流查询 · Snow Yuzu', en: 'Track Your Order · Snow Yuzu' },
  '稿件展示 · Yuki / 柚子': { zh: '稿件展示 · Yuki / 柚子', en: 'Commissions · Yuki' },
  '页面走丢了 · Yuki / 柚子': { zh: '页面走丢了 · Yuki / 柚子', en: 'Page not found · Yuki' },
  '小柚的小世界': { zh: '小柚的小世界', en: 'My Little World · Yuki' }
};

/* 属性文案翻译：英文页把 aria-label / title / placeholder / alt 里残留的中文换成英文（她 20261031 §1）
   注意：shop / askbox 两个页面自己又声明了一份同名 I18N_EN，会把全站那份覆盖掉，
   所以这里同时合并 YK_EN_EXTRA（独立命名，不会被覆盖）。 */
function ykEnDict() {
  var d = {};
  var base = (window.I18N_EN && typeof window.I18N_EN === 'object') ? window.I18N_EN : {};
  for (var k in base) if (Object.prototype.hasOwnProperty.call(base, k)) d[k] = base[k];
  for (var k2 in YK_EN_EXTRA) if (Object.prototype.hasOwnProperty.call(YK_EN_EXTRA, k2)) d[k2] = YK_EN_EXTRA[k2];
  return d;
}
function ykTranslateAttrs(lang) {
  if (lang !== 'en') return;
  var d = ykEnDict();
  document.querySelectorAll('[aria-label],[title],[placeholder],[alt]').forEach(function (el) {
    /* 她 20261030 §2：用户原始内容（留言墙等）一律不动，连属性也不碰 */
    if (el.closest && el.closest(YK_RAW_SEL)) return;
    ['aria-label', 'title', 'placeholder', 'alt'].forEach(function (a) {
      var v = el.getAttribute(a);
      if (!v) return;
      var s = v.trim();
      if (d[s] !== undefined && d[s] !== v) el.setAttribute(a, d[s]);
    });
  });
}
/* 动态插入的节点（购物车弹窗、灯箱、列表）也要跟上：监听 DOM，英文页下防抖重跑属性翻译 */
if (!window.__ykAttrObserver) {
  window.__ykAttrObserver = true;
  var _ykAttrTimer = null;
  var _ykAttrObs = new MutationObserver(function () {
    if (LANG !== 'en') return;
    clearTimeout(_ykAttrTimer);
    _ykAttrTimer = setTimeout(function () { ykTranslateAttrs('en'); }, 90);
  });
  var _startObs = function () {
    if (document.body) _ykAttrObs.observe(document.body, { childList: true, subtree: true });
  };
  if (document.body) _startObs();
  else document.addEventListener('DOMContentLoaded', _startObs);
}

function applyLang(lang) {
  LANG = lang;
  document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';
  /* 浏览器标签标题 */
  try {
    var root = document.documentElement;
    var baseTitle = root.getAttribute('data-base-title') || document.title;
    if (!root.getAttribute('data-base-title')) root.setAttribute('data-base-title', baseTitle);
    var tm = TITLE_MAP[baseTitle];
    if (tm && tm[lang]) document.title = tm[lang];
  } catch (e) {}
  var dict = lang === 'en' ? I18N_EN : I18N_ZH;
  var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
  var nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(function (n) {
    if (!n.parentElement || n.parentElement.closest('[data-zh], figcaption, script, style')) return;
    /* 她 20261030 §2：留言墙等用户原始内容禁止翻译、禁止改写——即便用户写的字刚好和界面词典撞上也不动 */
    if (n.parentElement.closest(YK_RAW_SEL)) return;
    var txt = n.nodeValue;
    var trimmed = txt.trim();
    if (trimmed && dict[trimmed] !== undefined) {
      n.nodeValue = txt.replace(trimmed, dict[trimmed]);
    }
  });
  /* 属性文案（aria-label / title / placeholder / alt）翻译：抽成独立函数，动态插入的节点可以再调一次 */
  ykTranslateAttrs(lang);
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
  /* 她 20261031 §1：反向兼容「只写了 data-en、没写 data-zh」的元素（BJD/色卡下拉选项全是这种），
     旧版只认同时带 data-zh+data-en 的，导致英文页下拉满屏中文。 */
  document.querySelectorAll('[data-zh],[data-en]').forEach(function (node) {
    var text;
    if (lang === 'en') text = node.getAttribute('data-en') || node.getAttribute('data-zh');
    else text = node.getAttribute('data-zh'); // 中文页：只认 data-zh；只有 data-en 的元素正文本来就是中文，不动它
    if (text == null) return;
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
/* 兼容 site-common 在 <head> 引入的页面（about/brand/service/policies）：load 时按钮还不存在，用事件委托兜底，同一套逻辑不重复绑 */
document.addEventListener('click', function (e) {
  var b = e.target && e.target.closest ? e.target.closest('.lang-btn') : null;
  if (!b || b._langBound) return;
  b._langBound = true;
  var lang = b.getAttribute('data-lang') === 'en' ? 'en' : 'zh';
  try { localStorage.setItem('yuki-lang', lang); } catch (err) {}
  location.reload();
});
/* 语言选中态自动初始化：任何页面刷新/跳转后恢复 yuki-lang（她 20261026 总任务书 §1.3） */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function () { applyLang(LANG); });
} else {
  applyLang(LANG);
}

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
  var DP = null; // { input, y, m, val, mode } val=内部 yyyy-mm-dd；mode='grid'|'ym'
  var DP_WD = LANG === 'en' ? ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] : ['一', '二', '三', '四', '五', '六', '日']; // 周一起始，与主页日历一致
  var DP_MON_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function dpToInternal(s) { var m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s || ''); return m ? m[1] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[3]).padStart(2, '0') : ''; }
  function dpToDisp(ds) { var m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(ds || ''); return m ? m[1] + '/' + String(m[2]).padStart(2, '0') + '/' + String(m[3]).padStart(2, '0') : (ds || ''); }
  function dpWrite(input, internal) { // data-disp="1" 的输入框显示 YYYY/MM/DD，其余保持内部格式
    input.value = input.getAttribute('data-disp') === '1' ? dpToDisp(internal) : internal;
  }
  function dpClose() { DP = null; document.getElementById('date-pop').style.display = 'none'; }
  function dpOpen(input) {
    var cur = dpToInternal(input.value);
    var t0 = new Date();
    var y0 = cur ? parseInt(cur.slice(0, 4), 10) : t0.getFullYear();
    var m0 = cur ? parseInt(cur.slice(5, 7), 10) - 1 : t0.getMonth();
    DP = { input: input, y: y0, m: m0, val: cur, mode: 'grid' };
    dpRender();
    var pop = document.getElementById('date-pop');
    var inp = pop.querySelector('.dp-input');
    if (inp) inp.value = input.value || ''; // 打开时同步当前值，输入过程中不再覆盖用户正在敲的内容
    pop.style.display = 'block';
    var r = input.getBoundingClientRect();
    var pw = pop.offsetWidth || 240, ph = pop.offsetHeight || 350;
    var left = Math.max(8, Math.min(r.left, window.innerWidth - pw - 8));
    var top = r.bottom + 6; // 始终在输入框正下方
    if (top + ph > window.innerHeight - 8) { // 下方放不下：先把输入框滚到视口中部再重算，弹层仍然贴在正下方
      try { input.scrollIntoView({ block: 'center' }); } catch (err) {}
      var r2 = input.getBoundingClientRect();
      left = Math.max(8, Math.min(r2.left, window.innerWidth - pw - 8));
      top = Math.max(8, r2.bottom + 6);
      if (top + ph > window.innerHeight - 8) top = Math.max(8, window.innerHeight - ph - 8);
    }
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
    if (!window.__dpScrollBound) { // 页面滚动时日期弹层直接收起，避免 fixed 弹层飘走
      window.__dpScrollBound = true;
      window.addEventListener('scroll', function () { var p = document.getElementById('date-pop'); if (p && p.style.display === 'block') p.style.display = 'none'; }, { passive: true });
    }
  }
  function dpRender() {
    var pop = document.getElementById('date-pop');
    var inp = pop.querySelector('.dp-input');
    if (inp) inp.value = DP.val ? dpToDisp(DP.val) : '';
    pop.querySelector('.dp-hint').style.display = 'none';
    pop.querySelector('.dp-title').textContent = LANG === 'en'
      ? DP_MON_EN[DP.m] + ' ' + DP.y
      : DP.y + ' 年 ' + (DP.m + 1) + ' 月';
    var grid = pop.querySelector('.dp-grid');
    var ym = pop.querySelector('.dp-ym');
    if (DP.mode === 'ym') { // 年月快速选择：苹果式双滚轮（年 | 月）
      grid.style.display = 'none';
      ym.style.display = 'block';
      var y1 = new Date().getFullYear() + 5, years = [];
      for (var yy = y1; yy >= 2000; yy--) years.push(yy);
      var months = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
      var yl = years.map(function (y) { return '<div class="wheel-item' + (y === DP.y ? ' cur' : '') + '" data-v="' + y + '">' + y + '</div>'; }).join('');
      var ml = months.map(function (m) { return '<div class="wheel-item' + (m === DP.m ? ' cur' : '') + '" data-v="' + m + '">' + (m + 1) + (LANG === 'en' ? '' : ' 月') + '</div>'; }).join('');
      ym.innerHTML = '<div class="dp-wheel"><div class="wheel" data-k="y"><div class="wheel-list">' + yl + '</div></div><div class="wheel" data-k="m"><div class="wheel-list">' + ml + '</div></div><div class="wheel-band"></div></div>';
      ym.querySelectorAll('.wheel').forEach(function (col) {
        var isY = col.getAttribute('data-k') === 'y';
        var vals = isY ? years : months;
        var list = col.querySelector('.wheel-list');
        var curIdx = isY ? years.indexOf(DP.y) : DP.m;
        if (curIdx < 0) curIdx = 0;
        list.scrollTop = curIdx * 36;
        var wt = null;
        list.addEventListener('scroll', function () {
          clearTimeout(wt);
          wt = setTimeout(function () {
            var i = Math.max(0, Math.min(vals.length - 1, Math.round(list.scrollTop / 36)));
            list.querySelectorAll('.wheel-item').forEach(function (c, j) { c.classList.toggle('cur', j === i); });
            if (isY) DP.y = vals[i]; else DP.m = vals[i];
            var pop2 = document.getElementById('date-pop');
            pop2.querySelector('.dp-title').textContent = LANG === 'en' ? DP_MON_EN[DP.m] + ' ' + DP.y : DP.y + ' 年 ' + (DP.m + 1) + ' 月';
          }, 130);
        });
        list.addEventListener('click', function (e) {
          var it = e.target.closest('.wheel-item'); if (!it) return;
          var i = Array.prototype.indexOf.call(list.children, it);
          list.scrollTo({ top: i * 36, behavior: 'smooth' });
        });
      });
      return;
    }
    ym.style.display = 'none';
    grid.style.display = '';
    var t0 = new Date();
    var offset = (new Date(DP.y, DP.m, 1).getDay() + 6) % 7;
    var days = new Date(DP.y, DP.m + 1, 0).getDate();
    var html = DP_WD.map(function (w) { return '<div class="dp-wd">' + w + '</div>'; }).join('');
    for (var i = 0; i < offset; i++) html += '<span class="dp-empty"></span>';
    for (var d = 1; d <= days; d++) {
      var ds = DP.y + '-' + String(DP.m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      html += '<button class="dp-day' + (ds === DP.val ? ' sel' : '') + (DP.y === t0.getFullYear() && DP.m === t0.getMonth() && d === t0.getDate() ? ' today' : '') + '" data-d="' + ds + '">' + d + '</button>';
    }
    grid.innerHTML = html;
  }
  function dpPick(ds) {
    if (!DP) return;
    DP.val = ds;
    dpWrite(DP.input, ds);
    DP.input.dispatchEvent(new Event('input', { bubbles: true }));
    DP.input.dispatchEvent(new Event('change', { bubbles: true }));
    dpClose();
  }
  document.getElementById('date-pop').addEventListener('click', function (e) {
    e.stopPropagation();
    var t = e.target;
    if (t.classList.contains('dp-nav')) { DP.m += t.id === 'dp-prev' ? -1 : 1; if (DP.m < 0) { DP.m = 11; DP.y--; } if (DP.m > 11) { DP.m = 0; DP.y++; } DP.mode = 'grid'; dpRender(); return; }
    if (t.id === 'dp-today') { var td = new Date(); dpPick(td.getFullYear() + '-' + String(td.getMonth() + 1).padStart(2, '0') + '-' + String(td.getDate()).padStart(2, '0')); return; }
    if (t.classList.contains('dp-day')) { dpPick(t.getAttribute('data-d')); return; }
    if (t.classList.contains('dp-title')) { DP.mode = DP.mode === 'ym' ? 'grid' : 'ym'; dpRender(); return; }
    if (t.classList.contains('dp-year')) { DP.y = parseInt(t.getAttribute('data-y'), 10); DP.mode = 'grid'; dpRender(); return; }
    if (t.classList.contains('dp-mon')) { DP.m = parseInt(t.getAttribute('data-m'), 10); DP.mode = 'grid'; dpRender(); return; }
  });
  document.getElementById('date-pop').addEventListener('input', function (e) {
    if (!DP) return;
    if (e.target.classList.contains('dp-input')) { // 直接输入 2020/01/20 → 自动跳转
      var v = dpToInternal(e.target.value);
      var hint = document.getElementById('date-pop').querySelector('.dp-hint');
      var partial = /^\d{4}\/?$|^\d{4}\/\d{1,2}\/?$/.test(e.target.value.trim());
      if (v) {
        DP.val = v; DP.y = parseInt(v.slice(0, 4), 10); DP.m = parseInt(v.slice(5, 7), 10) - 1; DP.mode = 'grid';
        hint.style.display = 'none';
        dpRender();
      } else if (e.target.value.trim() && !partial) {
        hint.style.display = 'block';
      } else {
        hint.style.display = 'none';
      }
      return;
    }
    if (e.target.classList.contains('dp-year-input')) {
      var yv = parseInt(e.target.value, 10);
      if (yv >= 1900 && yv <= 2200) { DP.y = yv; DP.mode = 'grid'; dpRender(); }
    }
  });
  document.addEventListener('click', function (e) {
    if (e.target.classList && e.target.classList.contains('date-pick')) { dpOpen(e.target); return; }
    if (DP && !e.target.closest('#date-pop') && !e.target.classList.contains('date-pick')) dpClose();
  });
}

// ===== 统一下拉菜单（替代浏览器原生 select 面板） =====
function closeSelMenus() { document.querySelectorAll('.sel-menu').forEach(function (m) { m.style.display = 'none'; }); }
function enhanceSelects() {
  function optLabel(o) {
    var en = LANG === 'en' ? o.getAttribute('data-en') : null;
    return en || o.textContent;
  }
  document.querySelectorAll('select:not([data-enh])').forEach(function (sel) {
    sel.setAttribute('data-enh', '1');
    sel.style.display = 'none';
    var btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'sel-btn';
    btn.textContent = sel.options[sel.selectedIndex] ? optLabel(sel.options[sel.selectedIndex]) : '';
    sel.parentNode.insertBefore(btn, sel);
    var menu = document.createElement('div');
    menu.className = 'sel-menu';
    menu.innerHTML = Array.prototype.map.call(sel.options, function (o) {
      return '<button type="button" class="sel-opt' + (o.selected ? ' active' : '') + '" data-v="' + escAttrDb(o.value) + '">' + escDb(optLabel(o)) + '</button>';
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
      btn.textContent = sel.options[sel.selectedIndex] ? (LANG === 'en' && sel.options[sel.selectedIndex].getAttribute('data-en') || sel.options[sel.selectedIndex].textContent) : '';
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

// ===== Service Worker：页面导航断网/加载失败时兜底到 /offline.html（自己的 UI 风格） =====
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').catch(function () {});
  });
}

// ═══════════ 柚子专属权限（白名单邮箱 chengyuki119@gmail.com；权威判断在后端 RPC yuki_exclusive_get）═══════════
// 三态：true 白名单已登录 / false 无权限 / 'pending' 后端 RPC 未部署（SQL 未跑），页面自行决定放行与否
var YK_EXCLUSIVE_MEMO = null; // 会话内缓存，避免每页多次 ping
function ykReadKey(k) {
  try { var v = JSON.parse(localStorage.getItem(k) || 'null'); return (v && (v.a || v.r)) ? v : null; } catch (e) { return null; }
}
function ykSession() {
  // 支持两种形态：商城 {a,r,email} / 后台 {r}（仅 refresh token，access token 需换取）
  // 双键共存（商城账号 + 后台账号）时，取最近登录的那个（t 时间戳），保证「切换账号」全站判断一致
  var u = ykReadKey('yuki-user-session'), m = ykReadKey('yuki-admin-session');
  if (u && m) return (m.t && (!u.t || m.t > u.t)) ? m : u;
  return u || m;
}
function ykHasAT() { var s = ykSession(); return !!(s && s.a); }
function ykToken() {
  var s = ykSession();
  if (!s) return Promise.resolve(null);
  if (s.a) return Promise.resolve(s.a);
  return getAuthToken(); // 后台 {r} 形态：用现有刷新逻辑换 access token（内部已缓存并回写）
}
function ykStoreKey() {
  var u = ykReadKey('yuki-user-session'), m = ykReadKey('yuki-admin-session');
  if (u && m) return (m.t && (!u.t || m.t > u.t)) ? 'yuki-admin-session' : 'yuki-user-session';
  return u ? 'yuki-user-session' : 'yuki-admin-session';
}
function ykRpc(p_kind) {
  return ykToken().then(function (at) {
    if (!at) { var e0 = new Error('请先登录'); e0.ykCode = 'nosession'; throw e0; }
    var call = function (token) {
      return fetch(DB_BASE + 'rpc/yuki_exclusive_get', {
        method: 'POST',
        headers: { 'apikey': DB_HEADERS.apikey, 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_kind: p_kind })
      }).then(function (r) { return r.json().then(function (j) { return { status: r.status, body: j }; }); });
    };
    return call(at).then(function (res) {
      if (res.status !== 401) return res;
      // access token 过期 → 走统一续期（单飞+竞态重试）再试一次
      AUTH_TOKEN = null;
      return ykRefreshSession().then(function (s2) {
        if (!s2 || !s2.a) { var e1 = new Error('登录过期'); e1.ykCode = 'expired'; throw e1; }
        return call(s2.a);
      });
    });
  }).then(function (res) {
    var code = res.body && res.body.code;
    if (res.status === 404 || code === 'PGRST202') { var e3 = new Error('RPC 未部署'); e3.ykCode = 'pending'; throw e3; }
    if (res.status !== 200) {
      var msg = (res.body && (res.body.message || res.body.msg)) || '查询失败';
      if (msg.indexOf('仅限柚子专属') !== -1) { var e4 = new Error(msg); e4.ykCode = 'denied'; throw e4; }
      var e5 = new Error(msg); e5.ykCode = 'error'; throw e5;
    }
    return res.body;
  });
}
function ykExclusiveCheck() {
  if (!ykSession()) return Promise.resolve({ ok: false, email: null });
  if (YK_EXCLUSIVE_MEMO) return Promise.resolve({ ok: YK_EXCLUSIVE_MEMO, email: ykSession().email || null });
  var run = function (isRetry) {
    return ykRpc('ping').then(function (j) {
      YK_EXCLUSIVE_MEMO = true;
      var s = ykSession();
      if (s && !s.email && j && j.email) { // 后台 {r} 形态补记邮箱，提示卡/菜单都能用
        s.email = j.email;
        try { localStorage.setItem(ykStoreKey(), JSON.stringify(s)); } catch (e) {}
      }
      return { ok: true, email: (j && j.email) || null };
    }).catch(function (e) {
      if (e && e.ykCode === 'pending') { YK_EXCLUSIVE_MEMO = 'pending'; return { ok: 'pending', email: null }; }
      // 明确拒绝（非白名单）才算降级；网络/服务抖动（error/expired）不算——返回 retry 并自动重试一次
      var transient = e && (e.ykCode === 'error' || e.ykCode === 'expired');
      if (transient && !isRetry) {
        return new Promise(function (res) { setTimeout(res, 2500); }).then(function () { return run(true); });
      }
      if (transient) return { ok: 'retry', email: null }; // 不写 memo，下页/手动重试仍会再试
      YK_EXCLUSIVE_MEMO = false;
      var sNow = ykSession();
      return { ok: false, email: (sNow && sNow.email) || null };
    });
  };
  return run(false);
}
function ykExclusiveData(kind) {
  return ykRpc(kind); // 返回 payload 原样（数组或对象，由调用方按 site_settings 同型处理）
}
function ykExclusiveLogout() {
  try { localStorage.removeItem('yuki-user-session'); } catch (e) {}
  try { localStorage.removeItem('yuki-admin-session'); } catch (e) {}
  YK_EXCLUSIVE_MEMO = null;
  location.reload();
}
// 跨标签页会话同步：任何一处登录/登出，其他页面的菜单与权限立即重建
window.addEventListener('storage', function (e) {
  if (e.key !== 'yuki-user-session' && e.key !== 'yuki-admin-session') return;
  YK_EXCLUSIVE_MEMO = null;
  window.__YK_MENU_OK = false;
  window.__YK_MENU_CHECKED = false;
  try { if (window.SiteMenu) SiteMenu.refresh(); } catch (err) {}
  try { document.dispatchEvent(new CustomEvent('yk-session-changed')); } catch (err) {}
});
// 页面门禁：mode 'exclusive'（默认，柚子专属白名单）| 'photos'（任意登录用户可看）
// resolve(true) = 可渲染；false = 已渲染权限提示页（调用方必须停止数据加载）
// 权限提示页 / 重试页隐藏正文时，必须保留顶栏：汉堡菜单要求全站任何页面都在最右（她 20261031）
function ykKeepChrome(el) {
  if (!el || el.nodeType !== 1) return true;
  var tag = el.tagName;
  if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'LINK' || tag === 'NOSCRIPT') return true;
  if (el.classList && (el.classList.contains('topbar') || el.classList.contains('menu-mask') || el.classList.contains('site-menu'))) return true;
  if (el.id === 'menu' || el.id === 'idx-wrap' || el.id === 'sm-phone-bar') return true;
  /* 她 20261031 02:15：页脚在每个页面都要在（包含登录门禁页）—— 否则 /photos/、/bjdselfie/ 未登录时整块页脚被隐藏成 0 高 */
  if (tag === 'FOOTER' || (el.classList && el.classList.contains('sy-footer'))) return true;
  return false;
}
function ykGatePage(mode) {
  mode = mode || 'exclusive';
  var check = (mode === 'photos')
    ? Promise.resolve({ ok: ykSession() ? true : false, email: (ykSession() || {}).email || null })
    : ykExclusiveCheck();
  return check.then(function (res) {
    if (res.ok === 'pending') {
      var bar = document.createElement('div');
      bar.style.cssText = 'position:sticky;top:0;z-index:99;background:var(--card,#FFFFFF);color:var(--text,#604C57);text-align:center;font-size:14px;padding:7px 12px;border-bottom:1px solid var(--accent-soft,#FCE4EC);';
      bar.textContent = (window.LANG === 'en' ? 'Permission layer not active yet (waiting for SQL).' : '专属权限层尚未启用（等待 SQL），当前仅前端临时放行。');
      document.body.insertBefore(bar, document.body.firstChild);
      return true;
    }
    if (res.ok === 'retry') {
      // 网络/服务抖动：不下「普通用户」的结论，给重试入口
      var wrapR = document.createElement('div');
      wrapR.style.cssText = 'min-height:62vh;display:flex;align-items:center;justify-content:center;padding:76px 16px 30px;';
      wrapR.innerHTML = '<div style="background:var(--card,#FFFFFF);border-radius:22px;padding:44px 34px;max-width:480px;width:100%;text-align:center;">' +
        '<div style="font-size:34px;color:var(--text,#604C57);line-height:1;">♥</div>' +
        '<h2 style="font-size:20px;color:var(--text,#604C57);margin:14px 0 8px;">' + (en ? 'Checking your identity…' : '身份确认没成功') + '</h2>' +
        '<p style="font-size:15px;color:var(--muted,#A88E9B);margin:0 0 22px;">' + (en ? 'Network hiccup — your login is safe. Tap to retry.' : '刚才网络抖了一下，你的登录还在，点下面重试就好。') + '</p>' +
        '<button id="yk-retry" style="background:var(--accent,#ffd9e6);color:var(--text,#604C57);border:0;border-radius:999px;padding:11px 26px;font-size:16px;cursor:pointer;">' + (en ? 'Retry' : '重试') + '</button>' +
        '</div>';
      document.body.insertBefore(wrapR, document.body.firstChild);
      var othersR = document.querySelectorAll('body > *:not(:first-child)');
      for (var jR = 0; jR < othersR.length; jR++) { if (!ykKeepChrome(othersR[jR])) othersR[jR].style.display = 'none'; }
      document.getElementById('yk-retry').addEventListener('click', function () { YK_EXCLUSIVE_MEMO = null; location.reload(); });
      return false;
    }
    if (res.ok === true) return true;
    // 权限提示页（与 404 页同款风格：粉色卡居中）
    var en = window.LANG === 'en';
    var wrap = document.createElement('div');
    wrap.style.cssText = 'min-height:62vh;display:flex;align-items:center;justify-content:center;padding:76px 16px 30px;';
    var logged = !!ykSession();
    var title = (mode === 'photos') ? (en ? 'Photos are for logged-in visitors' : '照片展示要登录后才能看哦') : (en ? 'Yuki Members Only' : '此内容仅限柚子专属账号查看');
    var btns = '';
    if (!logged) {
      btns = '<a href="' + (window.ykLink ? window.ykLink('/account/?next=' + encodeURIComponent(location.pathname + location.search)) : '/account/?next=' + encodeURIComponent(location.pathname + location.search)) + '" style="display:inline-block;background:var(--accent,#ffd9e6);color:var(--text,#604C57);border-radius:999px;padding:11px 26px;font-size:16px;text-decoration:none;">' + (en ? 'Go to Login' : '去登录') + '</a>';
    } else {
      btns = '<button id="yk-logout" style="background:var(--accent,#ffd9e6);color:var(--text,#604C57);border:0;border-radius:999px;padding:11px 26px;font-size:16px;cursor:pointer;">' + (en ? 'Log Out' : '退出登录') + '</button>' +
             ' <a href="' + (window.ykLink ? window.ykLink('/') : '/') + '" style="display:inline-block;margin-left:10px;color:var(--muted,#A88E9B);text-decoration:none;">' + (en ? 'Back to Home' : '返回主页') + '</a>';
    }
    wrap.innerHTML = '<div style="background:var(--card,#FFFFFF);border-radius:22px;padding:44px 34px;max-width:480px;width:100%;text-align:center;">' +
      '<div style="font-size:34px;color:var(--text,#604C57);line-height:1;">♥</div>' +
      '<h2 style="font-size:20px;color:var(--text,#604C57);margin:14px 0 8px;">' + title + '</h2>' +
      '<p style="font-size:15px;color:var(--muted,#A88E9B);margin:0 0 22px;">' +
        (logged
          ? (mode === 'photos'
              ? (en ? 'You are logged in — enjoying the photos~' : '你已登录，慢慢看照片～')
              : (en ? 'Current account: ' + escDb(res.email || '') + '. This area is only for Yuki\'s own account.' : '当前登录：' + escDb(res.email || '') + '，这里只有柚子的专属账号能进来哦'))
          : (mode === 'photos'
              ? (en ? 'Please log in first.' : '请先登录再来看照片哦')
              : (en ? 'Please log in with the Yuki exclusive account first.' : '请先用柚子的专属账号登录再来哦'))) +
      '</p>' + btns + '</div>';
    document.body.insertBefore(wrap, document.body.firstChild);
    var others = document.querySelectorAll('body > *:not(:first-child)');
    for (var i = 0; i < others.length; i++) { if (!ykKeepChrome(others[i])) others[i].style.display = 'none'; }
    var lo = document.getElementById('yk-logout');
    if (lo) lo.addEventListener('click', ykExclusiveLogout);
    return false;
  });
}
window.ykExclusiveCheck = ykExclusiveCheck;
window.ykExclusiveData = ykExclusiveData;
window.ykGatePage = ykGatePage;
window.ykRefreshSession = ykRefreshSession;
window.ykWriteSession = ykWriteSession;
window.ykSessionKey = ykSessionKey;
// 登录态取数：有会话用 access token，否则 anon（照片页等登录可见数据用）
function ykAuthFetch(path) {
  return ykToken().then(function (at) {
    var h = at ? { 'apikey': DB_HEADERS.apikey, 'Authorization': 'Bearer ' + at } : DB_HEADERS;
    return fetch(DB_BASE + path, { headers: h }).then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; });
  });
}
window.ykAuthFetch = ykAuthFetch;

/* ═══ 主题颜色：全站单一数据源（她 2026-10-26）═══
   库 site_settings.key='theme_colors'，后台「主题颜色」页签可改；
   所有页面引用的都是 var(--text/--muted/--bg/--card/--accent/--accent-soft/--accent-strong/--price)，
   这里读库后覆写 :root 变量 → 全站同步，无需改任何页面代码。 */
function ykApplyTheme(v) {
  if (!v || typeof v !== 'object') return;
  var map = { text: '--text', muted: '--muted', bg: '--bg', card: '--card', accent: '--accent', accentSoft: '--accent-soft', accentStrong: '--accent-strong', price: '--price', success: '--success', warning: '--warning', danger: '--danger' };
  var r = document.documentElement.style;
  Object.keys(map).forEach(function (k) { if (v[k]) r.setProperty(map[k], v[k]); });
}
window.ykApplyTheme = ykApplyTheme;
(function () {
  try {
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem('yuki-theme-colors-v2') || 'null'); } catch (e) {}
    if (saved) ykApplyTheme(saved); // 先用本地快照免闪烁，再拉库校准
  } catch (e) {}
  fetch(DB_BASE + 'site_settings?select=value&key=eq.theme_colors', { headers: DB_HEADERS })
    .then(function (r) { return r.ok ? r.json() : []; })
    .then(function (rows) {
      var raw = rows && rows[0] && rows[0].value;
      if (!raw) return;
      try {
        var v = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (v && typeof v === 'object') {
          ykApplyTheme(v);
          try { localStorage.setItem('yuki-theme-colors-v2', JSON.stringify(v)); } catch (e) {}
        }
      } catch (e) {}
    })
    .catch(function () {});
})();
