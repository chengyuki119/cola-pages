/* ═══════════ 全站中英自动互译（YK18N · 唯一翻译机制）═══════════
   她 20261112 01:51 任务书 §一：
   1) 后台只填一种语言，前台自动生成另一种语言——电脑端与手机端同一套逻辑
   2) 自动识别原文是中文还是英文 → 翻译成另一种语言
   3) 结果缓存（localStorage，按「原文哈希」做键）——原文改一个字就是新键，等于自动失效重翻
   4) 原文永久保留：这里只做显示层翻译，绝不写回数据库，也不覆盖 p.name / p.description 等原值
   5) 价格 / 库存 / SKU / 尺寸 / 数字 / 型号不参与翻译（只翻词典命中的自然语言片段）
   6) 翻译失败 / 断网：原样显示原文，不报错、不丢选项

   用法：
     YK18N.t(text)              → 当前语言下的文本（同步：缓存/词典/原文）
     YK18N.t(text, 'en')        → 指定目标语言
     YK18N.pick(zh, en)         → 按当前语言挑一份：有对应语言就用它，没有就翻另一份
     YK18N.need([...texts])     → Promise：把这些文本预先翻好（页面上一次批量请求，渲染前调用）
     YK18N.en(text) / zh(text)  → 明确方向
   ═══════════════════════════════════════════════════════════ */
(function () {
  if (window.YK18N) return;

  var LS_KEY = 'yk-i18n-cache:v2';
  var MAX_ENTRIES = 3000;
  var CJK_ONE = /[\u3400-\u9fff\uf900-\ufaff]/;
  var CJK_ALL = /[\u3400-\u9fff\uf900-\ufaff]/g;
  var HAN_LATIN = /^[\x20-\x7e]+$/;

  /* ── 词典：站内固定说法一定先走词典（不联网、不改数字、术语不被机器翻歪） ──
     键=中文，值=英文。反向查询自动生成（英文不分大小写）。 */
  var LEX = {
    /* 规格维度 */
    '款式': 'Style', '类型': 'Type', '高度': 'Profile', '尺寸': 'Size', '规格': 'Size', '配列': 'Layout',
    '颜色': 'Color', '材质': 'Material', '图案': 'Pattern', '娃娃尺寸': 'Doll Size', '适用娃种': 'Fits Doll',
    '制作方式': 'Made By', '套餐': 'Bundle', '数量': 'Qty',
    /* 规格选项 */
    '贴纸款': 'Sticker Edition', '3D款': '3D Edition',
    '瑕疵贴纸': 'Imperfect Sticker Edition', '瑕疵3D': 'Imperfect 3D Edition',
    '贴纸瑕疵款': 'Imperfect Sticker Edition', '瑕疵3D款': 'Imperfect 3D Edition',
    '单颗键帽': 'Single Keycap', '全套键帽': 'Full Set', '爱心键帽定制': 'Heart Keycap Custom',
    '6.25U 空格': '6.25U Spacebar', '6.25U空格': '6.25U Spacebar', '20颗/盒': '20 pcs / Box',
    'ANSI 60%（61键）': 'ANSI 60% (61 keys)', 'ANSI 65%（68键）': 'ANSI 65% (68 keys)',
    'ANSI 80% TKL（87键）': 'ANSI 80% TKL (87 keys)',
    '现货': 'Available Now', '补价专拍': 'Custom Payment', '价格表': 'Price List',
    '定制款': 'Customize Style', '整套款': 'Full Sets', '磨具瑕疵款': 'Imperfect Mold', '模具瑕疵款': 'Imperfect Mold',
    '树脂': 'Resin', '黏土': 'Clay', '水晶滴胶': 'UV Resin',
    /* 商品标签 / 类别 */
    '价格': 'Price', '库存': 'Stock', '型号': 'Model', '重量': 'Weight', '手作': 'Handmade', '毛线': 'Yarn', '贴纸': 'Sticker', '键帽': 'Keycap', '瑕疵款': 'Imperfect',
    '专拍补价': 'Price Adjustment', '新品': 'New', '限定': 'Limited', '色卡': 'Color Card', '稿件': 'Artwork',
    /* 常见描述用词 */
    '材料': 'Materials', '注意事项': 'Note', '注意': 'Note', '说明': 'Details', '尺寸说明': 'Size Guide',
    '手工制作': 'handmade', '手工制品': 'handmade items', '轻微气泡': 'minor air bubbles', '气泡': 'air bubbles',
    '闪粉': 'glitter', '转印贴纸': 'transfer stickers', '正常现象': 'normal', '请以实物为准': 'please refer to the actual product',
    '定做': 'made to order', '需要等待制作时间': 'needs making time', '不是现货': 'not in stock',
    '可以马上发出': 'ready to ship right away', '轻微瑕疵': 'minor imperfections', '没有瑕疵': 'no flaws',
    '单人': 'Single', '双人': 'Double', '半身': 'Half body', '全身': 'Full body', '头像': 'Headshot',
    '前任': 'Ex', '包天': 'Full Day', '加急': 'Rush', '商用': 'Commercial', '自用': 'Personal',
    /* 站内已有内容的固定译名（她自己的名称/画师名，机器直译会变味） */
    '抱小猪': 'Hug the Piggy', '拍立得稿件包天': 'Polaroid Commission (Full Day)', '盘中餐桓桓': 'Huanhuan on the Plate',
    '抖音 小懒': 'Douyin Xiaolan', '抖音小懒': 'Douyin Xiaolan'
  };
  var REV = {};
  (function () {
    Object.keys(LEX).forEach(function (zh) {
      var en = LEX[zh];
      if (!REV[en]) REV[en] = zh; // 多个中文同义 → 取第一个，避免互相覆盖
    });
  })();
  var ZH_KEYS = Object.keys(LEX).sort(function (a, b) { return b.length - a.length; }); // 长词优先：不让「贴纸」先吃掉「瑕疵贴纸」
  var EN_KEYS = Object.keys(REV).sort(function (a, b) { return b.length - a.length; });

  /* ── 缓存 ── */
  var cache = {};
  try { cache = JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {}; } catch (e) { cache = {}; }
  var saveTimer = null;
  function saveSoon() {
    if (saveTimer) return;
    saveTimer = setTimeout(function () {
      saveTimer = null;
      try { localStorage.setItem(LS_KEY, JSON.stringify(cache)); } catch (e) {} // 存不下（隐私模式/超额）就只留内存，不影响显示
    }, 300);
  }
  function prune() {
    var ks = Object.keys(cache);
    if (ks.length <= MAX_ENTRIES) return;
    ks.slice(0, ks.length - MAX_ENTRIES).forEach(function (k) { delete cache[k]; });
  }

  function hash(s) { var h = 5381, i = s.length; while (i) { h = (h * 33) ^ s.charCodeAt(--i); } return (h >>> 0).toString(36); }
  function ck(from, to, text) { return from + '>' + to + '|' + text.length + '|' + hash(text); }

  function hasCJK(s) { return CJK_ONE.test(String(s == null ? '' : s)); }
  function detect(s) { // 有汉字且汉字不算太少 → 中文；否则有拉丁字母 → 英文
    s = String(s == null ? '' : s);
    if (!s.trim()) return '';
    var cjk = (s.match(CJK_ALL) || []).length;
    var lat = (s.match(/[A-Za-z]/g) || []).length;
    if (cjk && cjk >= Math.max(1, Math.round(lat * 0.15))) return 'zh';
    if (lat) return 'en';
    return cjk ? 'zh' : '';
  }
  function curLang() {
    if (window.YK && window.YK.lang) return window.YK.lang;
    if (window.LANG === 'zh' || window.LANG === 'en') return window.LANG;
    try { return localStorage.getItem('yuki-lang') === 'zh' ? 'zh' : 'en'; } catch (e) { return 'en'; }
  }

  /* ── 词典翻译（保留数字、SKU、英文型号原样） ── */
  function lexZhToEn(text) {
    var out = String(text);
    ZH_KEYS.forEach(function (k) { if (out.indexOf(k) !== -1) out = out.split(k).join(LEX[k]); });
    return out;
  }
  function lexEnToZh(text) {
    var out = String(text);
    EN_KEYS.forEach(function (k) {
      var re = new RegExp('(^|[^A-Za-z])(' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')(?![A-Za-z])', 'gi');
      out = out.replace(re, function (m, pre) { return pre + REV[k]; });
    });
    return out;
  }
  function lex(text, from, to) {
    if (from === 'zh' && to === 'en') return lexZhToEn(text);
    if (from === 'en' && to === 'zh') return lexEnToZh(text);
    return String(text);
  }

  /* ── 同步取词：缓存 → 词典 → 原文 ── */
  function t(text, target) {
    var s = String(text == null ? '' : text);
    if (!s.trim()) return s;
    var to = target || curLang();
    var from = detect(s);
    if (!from || from === to) return s;            // 已经是目标语言：原样
    var k = ck(from, to, s);
    if (cache[k] != null) return cache[k];
    var lexed = lex(s, from, to);
    return lexed;                                   // 没有缓存就先给词典结果（可能仍是原文），页面不报错
  }

  /* pick(zh, en)：按当前语言挑一份；缺哪份就翻另一份 —— 后台只填一种语言也能两种显示 */
  function pick(zh, en) {
    var L = curLang();
    var a = String(zh == null ? '' : zh), b = String(en == null ? '' : en);
    if (L === 'zh') {
      if (a.trim() && detect(a) === 'zh') return a;   // 中文栏填了中文：直接用
      if (a.trim()) return t(a, 'zh');                // 中文栏填的其实是英文：翻回中文
      if (b.trim()) return t(b, 'zh');                // 中文栏空：把英文翻成中文
      return '';
    }
    if (b.trim()) return b;                           // 英文栏有英文：直接用
    if (a.trim()) return t(a, 'en');                  // 英文栏空 / 或英文栏里塞了中文：翻成英文
    return '';
  }

  /* 机翻后的收尾：中文量词/尾巴词典没收干净的，这里按数字上下文补干净（数字本身不动） */
  function tidyZhToEn(s) {
    return String(s)
      .replace(/(\d+)\s*张/g, '$1 cards')
      .replace(/(\d+)\s*个/g, '$1 pcs')
      .replace(/(\d+)\s*件/g, '$1 items')
      .replace(/(\d+)\s*人/g, '$1 people')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /* ── 联网翻译（批量 + 去重 + 失败保留原文） ── */
  var inflight = {};
  var REMOTE = 'https://translate.googleapis.com/translate_a/single?client=gtx&dt=t';
  function remoteOne(from, to, text) {
    var url = REMOTE + '&sl=' + (from === 'zh' ? 'zh-CN' : 'en') + '&tl=' + (to === 'zh' ? 'zh-CN' : 'en') + '&q=' + encodeURIComponent(text);
    return fetch(url, { mode: 'cors' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (j) {
        var out = '';
        try { out = (j[0] || []).map(function (x) { return x[0]; }).join(''); } catch (e) { out = ''; }
        return out || '';
      });
  }
  /* 一条一条但限并发，稳定第一（批量拼接换行会被机器翻译合并行，宁慢不乱） */
  function remoteBatch(items, to) {
    var i = 0, out = [];
    var CONC = 5;
    function worker() {
      if (i >= items.length) return Promise.resolve();
      var it = items[i++];
      return remoteOne(it.from, to, it.s).then(function (txt) {
        if (txt && txt.trim()) {
          if (it.from === 'zh') txt = tidyZhToEn(lexZhToEn(txt));
          // 反查：翻回来还是原样（说明没翻动）就不缓存，避免把中文当英文缓存住
          if (!(it.from === 'zh' && hasCJK(txt))) { cache[it.k] = txt; prune(); }
        }
      }).catch(function () { /* 失败：保留原文，下次再试 */ })
        .then(worker);
    }
    var ws = [];
    for (var w = 0; w < Math.min(CONC, items.length); w++) ws.push(worker());
    return Promise.all(ws);
  }

  function need(list) {
    var to = curLang();
    var miss = [], seen = {};
    (list || []).forEach(function (x) {
      var s = String(x == null ? '' : x).trim();
      if (!s || seen[s]) return;
      seen[s] = 1;
      var from = detect(s);
      if (!from || from === to) return;
      var k = ck(from, to, s);
      if (cache[k] != null || inflight[k]) return;
      var lexed = lex(s, from, to);
      // 词典已经完整覆盖（中文翻完不留汉字 / 英文翻完不留拉丁字母）→ 直接用，不必联网
      if (from === 'zh' && !hasCJK(lexed)) { cache[k] = lexed; return; }
      if (from === 'en' && lexed !== s && !/[A-Za-z]/.test(lexed)) { cache[k] = lexed; return; }
      miss.push({ k: k, s: s, from: from });
    });
    if (!miss.length) { saveSoon(); return Promise.resolve(0); }
    miss.forEach(function (m) { inflight[m.k] = 1; });
    return remoteBatch(miss, to).then(function () {
      miss.forEach(function (m) { delete inflight[m.k]; });
      saveSoon();
      try { window.dispatchEvent(new CustomEvent('yk18n', { detail: { n: miss.length } })); } catch (e) {}
      return miss.length;
    });
  }

  /* ── 英文标题首字母大写（她 20261112：首字母都要大写）──
     只动拉丁词：首词及分隔符后的词大写；冠词/介词等次要词非首位置保持小写；
     含汉字的文本原样返回（中文翻译不受影响）。 */
  var MINOR = ['a','an','the','and','or','nor','but','of','to','in','on','at','by','for','with','from','as','per'];
  function tcEn(s) {
    var x = String(s == null ? '' : s);
    if (!x || CJK_ONE.test(x)) return x;
    return x.replace(/[A-Za-z][A-Za-z'\u2019&.-]*/g, function (w, off, str) {
      if (!/^[a-z]/.test(w)) return w; // 已是大写开头（BJD / R1 / 本身大写）：不动
      var first = off === 0 || /[([{"'\u2018\u201c\u00b7\uff0f\/\-.,;:!?]/.test(str.charAt(off - 1));
      if (first || MINOR.indexOf(w.toLowerCase()) === -1) return w.charAt(0).toUpperCase() + w.slice(1);
      return w;
    });
  }

  window.YK18N = {
    t: t,
    pick: pick,
    need: need,
    en: function (s) { return t(s, 'en'); },
    zh: function (s) { return t(s, 'zh'); },
    detect: detect,
    lang: curLang,
    hasCJK: hasCJK,
    lex: lex,
    tc: tcEn,
    clear: function () { cache = {}; try { localStorage.removeItem(LS_KEY); } catch (e) {} },
    stats: function () { return { entries: Object.keys(cache).length, lang: curLang() }; }
  };
})();
