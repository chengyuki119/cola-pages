/* ═══════════════════════════════════════════════════════════════════
   Snow Yuzu · 商品名称智能识别词库（她 20261117 第二份任务书 第一部分）
   - 标准英文角色名 = 唯一识别主键；中文标准名 + 别名辅助识别
   - 种子词库内置于本文件；后台可增改别名/标准名/类型，覆盖层存
     site_settings.key='name_lexicon'（远端优先，种子兜底）
   - match(input) → { ok, ambiguous, char, type, nameZh, nameEn, titleZh, titleEn, pending }
   - 商品类型独立词库（键帽/挂件/钥匙扣…），后台可扩展
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── 种子：VALORANT（她 20261117 词库表 + 官方 30 人）── */
  var VALORANT_ALL = ['Astra','Breach','Brimstone','Chamber','Clove','Cypher','Deadlock','Fade','Gekko','Harbor','Hush','Iso','Jett','KAY/O','Killjoy','Miks','Neon','Omen','Phoenix','Raze','Reyna','Sage','Skye','Sova','Tejo','Veto','Viper','Vyse','Waylay','Yoru'];
  var VALORANT = [
    { en: 'Hush',   zh: '遐思', aliases: ['遐思', 'Hush'] },
    { en: 'Waylay', zh: '幻棱', aliases: ['幻棱', 'Waylay', '威蕾', '威蕾键宝'] },
    { en: 'Tejo',   zh: '钛狐', aliases: ['钛狐', 'Tejo'] },
    { en: 'Sage',   zh: '贤者', aliases: ['贤者', 'Sage', '奶妈'] },
    { en: 'Jett',   zh: '捷风', aliases: ['捷风', 'Jett', '杰峰', '杰特', '杰奇'] },
    { en: 'Clove',  zh: '齐乐', aliases: ['齐乐', 'Clove'] },
    /* 她 20261117 23:51 任务书 §一：补充别名（只加别名与标准名，不新建角色）
       她 20261118 00:14 §一：Killjoy 中文名定为「奇乐」、Phoenix 定为「不死鸟」、KAY/O 不设中文名 */
    { en: 'Chamber', zh: '尚博勒', aliases: ['尚博勒', 'Chamber', '钱包'] },
    { en: 'Cypher',  zh: '零',     aliases: ['零', 'Cypher', '保安'] },
    { en: 'Veto',    zh: '禁灭',   aliases: ['禁灭', 'Veto'] },
    { en: 'Killjoy', zh: '奇乐',   aliases: ['奇乐', 'Killjoy', 'KJ', 'kj'] },
    { en: 'Phoenix', zh: '不死鸟', aliases: ['不死鸟', 'Phoenix', '火男', '菲尼克斯'] },
    { en: 'KAY/O',   zh: '',       aliases: ['KAY/O', 'Kayo', 'KO', 'K/O', 'KAYO', 'Ko'] }
  ];
  // 官方名单里没有确认中文名的：只挂英文名本身做识别，不编中文名
  VALORANT_ALL.forEach(function (en) {
    if (!VALORANT.some(function (c) { return c.en === en; })) VALORANT.push({ en: en, zh: '', aliases: [en] });
  });

  /* ── 种子：Sanrio（她 20261117 词库表）── */
  var SANRIO = [
    { en: 'Hello Kitty',    zh: 'KT猫',     aliases: ['Hello Kitty', 'Kitty', 'KT猫', 'HelloKitty', 'hello kitty'] },
    { en: 'My Melody',      zh: '美乐蒂',   aliases: ['My Melody', '美乐蒂', 'MyMelody'] },
    { en: 'Kuromi',         zh: '酷洛米',   aliases: ['Kuromi', '酷洛米'] },
    { en: 'Cinnamoroll',    zh: '玉桂狗',   aliases: ['Cinnamoroll', '玉桂狗', '大耳狗'] },
    { en: 'Pompompurin',    zh: '布丁狗',   aliases: ['Pompompurin', '布丁狗'] },
    { en: 'Pochacco',       zh: '帕恰狗',   aliases: ['Pochacco', '帕恰狗'] },
    { en: 'Little Twin Stars', zh: '双子星', aliases: ['Little Twin Stars', '双子星', 'Kiki', 'Lala'] },
    { en: 'Keroppi',        zh: '大眼蛙',   aliases: ['Keroppi', '大眼蛙'] },
    { en: 'Badtz-maru',     zh: '酷企鹅',   aliases: ['Badtz-maru', 'Badtz Maru', '酷企鹅'] },
    { en: 'Hangyodon',      zh: '人鱼汉顿', aliases: ['Hangyodon', '人鱼汉顿'] },
    { en: 'Gudetama',       zh: '蛋黄哥',   aliases: ['Gudetama', '蛋黄哥'] },
    { en: 'Tuxedosam',      zh: '',         aliases: ['Tuxedosam', 'Tuxedo Sam'] },
    { en: 'U*SA*HA*NA',     zh: '兔兔',     aliases: ['U*SA*HA*NA', 'Usahana', '兔兔', 'USAHANA'] },
    { en: 'Piano',          zh: '必安诺',   aliases: ['Piano', '必安诺', 'My Sweet Piano'] },
    { en: 'Charmmy Kitty',  zh: '甜心凯蒂', aliases: ['Charmmy Kitty', 'Charmmy', '甜心凯蒂'] },
    { en: 'Chococat',       zh: '巧克力猫', aliases: ['Chococat', '巧克力猫'] },
    { en: 'Wish Me Mell',   zh: '许愿兔',   aliases: ['Wish Me Mell', 'WishMeMell', '许愿兔'] },
    { en: 'Marron Cream',   zh: '玛伦兔',   aliases: ['Marron Cream', 'Marron', '玛伦兔'] },
    { en: 'Pekkle',         zh: '阿飞',     aliases: ['Pekkle', '阿飞'] },
    { en: 'Hanamaruobake',  zh: '小幽灵',   aliases: ['Hanamaruobake', 'Hanamaru', '小幽灵'] }
  ];

  /* ── 种子：其他热门 IP（英文名待确认的保留中文原名，不编造）── */
  var OTHERS = [
    { en: 'Miffy',    zh: '米菲兔', aliases: ['Miffy', '米菲兔'] },
    { en: 'Boris',    zh: '博里斯', aliases: ['Boris', '博里斯'] },
    { en: 'Melanie',  zh: '梅拉妮', aliases: ['Melanie', '梅拉妮'] },
    { en: 'Snuffy',   zh: '史努菲', aliases: ['Snuffy', '史努菲'] },
    { en: 'Chiikawa', zh: '吉伊卡哇', aliases: ['Chiikawa', '吉伊卡哇', 'chiikawa'] },
    { en: '',         zh: '豆汁芝麻', aliases: ['豆汁芝麻'] },
    { en: 'LOVEEZ',   zh: '', aliases: ['LOVEEZ', 'loveez'] },
    { en: '',         zh: '甜点兔', aliases: ['甜点兔'] },
    { en: '',         zh: '暴力熊', aliases: ['暴力熊'] },
    { en: '',         zh: '暴力兔', aliases: ['暴力兔'] },
    { en: 'Sumikko Gurashi', zh: '角落生物', aliases: ['Sumikko Gurashi', '角落生物', 'すみっコぐらし'] },
    { en: 'Shirokuma',          zh: '白熊',   aliases: ['Shirokuma', '白熊'] },
    { en: 'Tonkatsu',           zh: '炸猪排', aliases: ['Tonkatsu', '炸猪排'] },
    { en: 'Ebi Furai no Shippo', zh: '炸虾尾', aliases: ['Ebi Furai no Shippo', '炸虾尾'] },
    { en: 'Neko',               zh: '猫',     aliases: ['Neko'] },
    { en: 'Tokage',             zh: '蜥蜴',   aliases: ['Tokage', '蜥蜴'] },
    { en: 'Penguin?',           zh: '企鹅？', aliases: ['Penguin?', '企鹅？', 'Penguin'] },
    { en: 'Tapioca',            zh: '粉圆',   aliases: ['Tapioca', '粉圆'] },
    { en: 'Furoshiki',          zh: '炸鸡块', aliases: ['Furoshiki', '炸鸡块'] }
  ];

  /* ── 种子：商品类型（独立词库，可扩展）── */
  var TYPES = [
    { zh: '键帽',       en: 'Keycap',            aliases: ['键帽', '键宝', 'keycap', 'Keycap'] },
    { zh: '亚克力挂件', en: 'Acrylic Charm',     aliases: ['亚克力挂件', '挂件', 'acrylic charm', 'Acrylic Charm'] },
    { zh: '钥匙扣',     en: 'Keychain',          aliases: ['钥匙扣', 'keychain', 'Keychain'] },
    { zh: '贴纸',       en: 'Sticker',           aliases: ['贴纸', 'sticker', 'Sticker'] },
    { zh: '徽章',       en: 'Pin',               aliases: ['徽章', 'pin', 'Pin'] },
    { zh: '玩偶',       en: 'Plush',             aliases: ['玩偶', 'plush', 'Plush'] },
    { zh: '亚克力立牌', en: 'Acrylic Stand',     aliases: ['亚克力立牌', '立牌', 'acrylic stand', 'Acrylic Stand'] },
    { zh: '卡片',       en: 'Card',              aliases: ['卡片', 'card', 'Card'] },
    { zh: '色纸',       en: 'Shikishi',          aliases: ['色纸', 'shikishi', 'Shikishi'] },
    { zh: '手工饰品',   en: 'Handmade Accessory', aliases: ['手工饰品', '饰品', 'handmade accessory', 'Handmade Accessory'] }
  ];

  /* ── 远端覆盖层（后台词库管理写入 site_settings.key='name_lexicon'）──
     结构：{ chars: [{en,zh,aliases,ip}], types: [{zh,en,aliases}], removedAlias: {alias:true} } */
  var OVERRIDE = null;

  function allChars() {
    var base = []
      .concat(VALORANT.map(function (c) { return Object.assign({ ip: 'VALORANT' }, c); }))
      .concat(SANRIO.map(function (c) { return Object.assign({ ip: 'Sanrio' }, c); }))
      .concat(OTHERS.map(function (c) { return Object.assign({ ip: 'Other' }, c); }));
    // 她 §8：后台保存的完整词库（含种子行+新增行）优先——管理页保存后以远端为准
    if (OVERRIDE && Array.isArray(OVERRIDE.chars) && OVERRIDE.chars.length) {
      return OVERRIDE.chars.map(function (c) { return { en: c.en || '', zh: c.zh || '', aliases: (c.aliases || []).slice(), ip: c.ip || 'Other' }; });
    }
    return base;
  }
  function allTypes() {
    var base = TYPES.slice();
    if (OVERRIDE && Array.isArray(OVERRIDE.types) && OVERRIDE.types.length) {
      return OVERRIDE.types.map(function (t) { return { zh: t.zh || '', en: t.en || '', aliases: (t.aliases || []).slice() }; });
    }
    (OVERRIDE && OVERRIDE.types || []).forEach(function (t) {
      var hit = base.filter(function (x) { return x.zh === t.zh; })[0];
      if (hit) Object.assign(hit, t);
      else base.push(t);
    });
    return base;
  }
  function removed(alias) {
    return !!(OVERRIDE && OVERRIDE.removedAlias && OVERRIDE.removedAlias[alias]);
  }

  /* ── 识别核心 ── */
  function norm(s) {
    return String(s || '').replace(/\s+/g, ' ').trim();
  }
  function findType(input) {
    var types = allTypes();
    var hit = null;
    // 最长优先：先把「亚克力挂件」这类长词拆走，再把「挂件」这类短词算进去
    types.slice().sort(function (a, b) { return b.zh.length - a.zh.length; }).forEach(function (t) {
      if (hit) return;
      var list = [t.zh].concat(t.aliases || []);
      list.sort(function (a, b) { return b.length - a.length; }).some(function (a) {
        if (a && input.toLowerCase().indexOf(a.toLowerCase()) > -1) { hit = t; return true; }
        return false;
      });
    });
    return hit;
  }
  function stripType(input, type) {
    var s = input;
    if (type) [type.zh].concat(type.aliases || []).forEach(function (a) {
      if (!a) return;
      // 只按词边界剥英文别名，中文直接剥子串
      s = s.split(a).join('');
    });
    return norm(s.replace(/^[\/\-·、,，\s]+|[\/\-·、,，\s]+$/g, ''));
  }
  function findChars(rest) {
    if (!rest) return [];
    var chars = allChars();
    var scored = [];
    chars.forEach(function (c) {
      var list = (c.aliases || []).slice();
      if (c.zh) list.push(c.zh);
      if (c.en) list.push(c.en);
      list.forEach(function (a) {
        if (!a || removed(a)) return;
        var idx = rest.toLowerCase().indexOf(a.toLowerCase());
        if (idx === -1) return;
        // 她 20261117 23:51 §一：单字别名（如「零」）只在整段输入就是它时才算命中，避免误伤其他商品名
        var exact = norm(rest).toLowerCase() === a.toLowerCase();
        if (exact || a.length >= (c.en === 'Neko' ? 4 : 2)) scored.push({ c: c, a: a, len: a.length });
      });
    });
    scored.sort(function (x, y) { return y.len - x.len; });
    var winners = [];
    scored.forEach(function (s) {
      if (!winners.some(function (w) { return w.c.en === s.c.en; })) winners.push(s); // 同角色去重
    });
    // 互不重叠的最高分候选：取第一个，再检查是否有「不同角色且长度相同」的并列 → 歧义
    if (!winners.length) return [];
    var best = winners[0];
    var tie = winners.filter(function (w) { return w.c.en !== best.c.en && w.len === best.len; });
    return [best].concat(tie);
  }

  /* 对外：识别一个商品名输入 */
  function match(raw) {
    var input = norm(raw);
    if (!input) return { ok: false, empty: true };
    var type = findType(input);
    var rest = stripType(input, type);
    var cand = findChars(rest);
    var res = {
      ok: true,
      input: input,
      type: type,
      char: null,
      ambiguous: [],
      pending: false, // 英文标准名待确认
      nameZh: '', nameEn: '', titleZh: '', titleEn: ''
    };
    if (cand.length > 1) {
      res.ambiguous = cand.map(function (x) { return { en: x.c.en, zh: x.c.zh, alias: x.a, ip: x.c.ip }; });
      return res; // 多角色歧义：不猜，提示管理员选择
    }
    var c = cand.length ? cand[0].c : null;
    res.char = c ? { en: c.en, zh: c.zh, ip: c.ip } : null;
    var zhName = c ? (c.zh || rest) : rest;          // 有角色无中文名：回填原始输入；无角色：商品本身名称
    var enName = c ? (c.en || '') : '';
    res.nameZh = zhName;
    res.nameEn = enName;
    if (c && !enName) res.pending = true;          // 角色存在但英文名待确认（如 暴力熊）
    var typeZh = type ? type.zh : '';
    var typeEn = type ? type.en : '';
    if (c) {
      res.titleZh = typeZh ? (zhName + '主题' + typeZh) : zhName;
      res.titleEn = typeEn ? (enName ? enName + ' Style ' + typeEn : (res.pending ? zhName + ' Style ' + typeEn : '')) : (enName || zhName);
    } else {
      // 普通商品：不强制 Style
      res.titleZh = typeZh ? (rest + typeZh) : rest;
      res.titleEn = typeEn ? (rest + ' ' + typeEn) : rest;
    }
    return res;
  }

  /* 管理员选定歧义项后重出结果 */
  function matchPick(raw, pickEn) {
    var input = norm(raw);
    var type = findType(input);
    var rest = stripType(input, type);
    var c = allChars().filter(function (x) { return x.en === pickEn; })[0];
    if (!c) return match(raw);
    var typeZh = type ? type.zh : '', typeEn = type ? type.en : '';
    var zhName = c.zh || '', enName = c.en || '';
    return {
      ok: true, input: input, type: type, ambiguous: [],
      char: { en: c.en, zh: c.zh, ip: c.ip },
      pending: !enName,
      nameZh: zhName, nameEn: enName,
      titleZh: typeZh ? (zhName + '主题' + typeZh) : zhName,
      titleEn: typeEn ? (enName ? enName + ' Style ' + typeEn : zhName + ' Style ' + typeEn) : (enName || zhName)
    };
  }

  /* 搜索扩展：输入别名 → 返回该角色的全部别名+标准名（用于商品搜索命中同一商品） */
  function searchTerms(q) {
    var input = norm(q).toLowerCase();
    if (!input) return [q];
    var terms = [q];
    allChars().forEach(function (c) {
      var list = (c.aliases || []).concat(c.zh ? [c.zh] : [], c.en ? [c.en] : []);
      var hit = list.some(function (a) { return a && input.indexOf(a.toLowerCase()) > -1; });
      if (hit) list.forEach(function (a) { if (a && terms.indexOf(a) === -1) terms.push(a); });
    });
    return terms;
  }

  /* 远端覆盖层加载/保存（后台用；需登录态 api()） */
  function loadRemote(fetcher) {
    return fetcher('site_settings?select=value&key=eq.name_lexicon').then(function (rows) {
      var v = rows && rows[0] && rows[0].value;
      if (v) { try { OVERRIDE = typeof v === 'string' ? JSON.parse(v) : v; } catch (e) { OVERRIDE = null; } }
      return OVERRIDE;
    }).catch(function () { return null; });
  }
  function saveRemote(apiFn, override) {
    OVERRIDE = override;
    return apiFn('site_settings?key=eq.name_lexicon').then(function (r) {
      var body = JSON.stringify({ key: 'name_lexicon', value: JSON.stringify(override) });
      if (r.ok) return apiFn('site_settings?key=eq.name_lexicon', { method: 'PATCH', body: body });
      return apiFn('site_settings', { method: 'POST', body: body });
    });
  }

  window.NameLexicon = {
    match: match,
    matchPick: matchPick,
    searchTerms: searchTerms,
    chars: allChars,
    types: allTypes,
    loadRemote: loadRemote,
    saveRemote: saveRemote,
    ips: function () { return ['VALORANT', 'Sanrio', 'Other']; }
  };
})();
