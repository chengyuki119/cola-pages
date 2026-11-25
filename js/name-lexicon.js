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

  /* ── 种子：VALORANT（她 20261123 18:18 全角色标准名称表：27 名分四职补齐，中英文与角色分类均为官方口径）── */
  var VALORANT_ALL = ['Astra','Breach','Brimstone','Chamber','Clove','Cypher','Deadlock','Fade','Gekko','Harbor','Hush','Iso','Jett','KAY/O','Killjoy','Miks','Neon','Omen','Phoenix','Raze','Reyna','Sage','Skye','Sova','Tejo','Veto','Viper','Vyse','Waylay','Yoru'];
  var VALORANT = [
    /* 决斗者 Duelist */
    { en: 'Phoenix', zh: '不死鸟', role: '决斗者', aliases: ['不死鸟', 'Phoenix', '火男', '菲尼克斯'] },
    { en: 'Jett',    zh: '捷风',   role: '决斗者', aliases: ['捷风', 'Jett', '杰峰', '杰特', '杰奇'] },
    { en: 'Raze',    zh: '雷兹',   role: '决斗者', aliases: ['雷兹', 'Raze'] },
    { en: 'Reyna',   zh: '芮娜',   role: '决斗者', aliases: ['芮娜', 'Reyna'] },
    { en: 'Neon',    zh: '霓虹',   role: '决斗者', aliases: ['霓虹', 'Neon'] },
    { en: 'Yoru',    zh: '夜露',   role: '决斗者', aliases: ['夜露', 'Yoru'] },
    { en: 'Iso',     zh: '壹决',   role: '决斗者', aliases: ['壹决', 'Iso'] }, /* 她 20261123 18:18 官方表：壹决（取代上一轮任务书的「壹绝」） */
    { en: 'Waylay',  zh: '幻棱',   role: '决斗者', aliases: ['幻棱', 'Waylay', '威蕾', '威蕾键宝'] },
    { en: 'Clove',   zh: '暮蝶',   role: '决斗者', aliases: ['暮蝶', 'Clove'] },
    /* 先锋 Initiator */
    { en: 'Sova',    zh: '猎枭', role: '先锋', aliases: ['猎枭', 'Sova'] },
    { en: 'Breach',  zh: '铁臂', role: '先锋', aliases: ['铁臂', 'Breach'] },
    { en: 'KAY/O',   zh: '',     role: '先锋', aliases: ['KAY/O', 'Kayo', 'KO', 'K/O', 'KAYO', 'Ko'] }, /* 官方无中文名 */
    { en: 'Fade',    zh: '黑梦', role: '先锋', aliases: ['黑梦', 'Fade'] },
    { en: 'Skye',    zh: '斯凯', role: '先锋', aliases: ['斯凯', 'Skye'] },
    { en: 'Gekko',   zh: '盖可', role: '先锋', aliases: ['盖可', 'Gekko'] },
    { en: 'Tejo',    zh: '钛狐', role: '先锋', aliases: ['钛狐', 'Tejo'] },
    /* 控场 Controller */
    { en: 'Brimstone', zh: '炼狱', role: '控场', aliases: ['炼狱', 'Brimstone'] },
    { en: 'Viper',     zh: '蝰蛇', role: '控场', aliases: ['蝰蛇', 'Viper'] },
    { en: 'Omen',      zh: '幽影', role: '控场', aliases: ['幽影', 'Omen'] },
    { en: 'Astra',     zh: '星礈', role: '控场', aliases: ['星礈', 'Astra'] },
    { en: 'Harbor',    zh: '海神', role: '控场', aliases: ['海神', 'Harbor'] },
    { en: 'Miks',      zh: '迷核', role: '控场', aliases: ['迷核', 'Miks'] }, /* 她 20261123 §3：新增迷核，中英文都要能识别 */
    /* 哨卫 Sentinel */
    { en: 'Sage',    zh: '贤者',   role: '哨卫', aliases: ['贤者', 'Sage', '奶妈', '鼠尾草'] },
    { en: 'Cypher',  zh: '零',     role: '哨卫', aliases: ['零', 'Cypher', '保安'] },
    { en: 'Killjoy', zh: '奇乐',   role: '哨卫', aliases: ['奇乐', 'Killjoy', 'KJ', 'kj'] },
    { en: 'Chamber', zh: '尚博勒', role: '哨卫', aliases: ['尚博勒', 'Chamber', '钱包'] },
    { en: 'Deadlock', zh: '钢索',  role: '哨卫', aliases: ['钢索', 'Deadlock'] },
    /* 此前三名（她 20261117/20261123 任务书单独给的，不在本次 27 名名单内）：保持原状，无官方職介不编 */
    { en: 'Hush', zh: '遐思', aliases: ['遐思', 'Hush'] },
    { en: 'Veto', zh: '禁灭', aliases: ['禁灭', 'Veto'] }
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
    { en: 'Piano',          zh: '必安娜',   aliases: ['Piano', '必安诺', '必安娜', 'My Sweet Piano'] }, /* 她 20261123 18:18：必安娜 WASD 保持原样写，中文名用必安娜 */
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

  /* ── 组合别名：一个语音/识别错误输入 → 多个角色（她 20261123 §二：异丁香杰特 = 暮蝶+壹绝+捷风）── */
  var COMBOS = [
    { from: '异丁香', chars: ['Clove', 'Iso'] }
  ];

  /* ── 远端覆盖层（后台词库管理写入 site_settings.key='name_lexicon'）──
     结构：{ chars: [{en,zh,aliases,ip}], types: [{zh,en,aliases}], removedAlias: {alias:true} } */
  var OVERRIDE = null;

  function allChars() {
    var base = []
      .concat(VALORANT.map(function (c) { return Object.assign({ ip: 'VALORANT' }, c); }))
      .concat(SANRIO.map(function (c) { return Object.assign({ ip: 'Sanrio' }, c); }))
      .concat(OTHERS.map(function (c) { return Object.assign({ ip: 'Other', enabled: true }, c); }));
    // 她 §8：后台保存的完整词库（含种子行+新增行）优先——管理页保存后以远端为准
    if (OVERRIDE && Array.isArray(OVERRIDE.chars) && OVERRIDE.chars.length) {
      return OVERRIDE.chars.map(function (c) { return { en: c.en || '', zh: c.zh || '', aliases: (c.aliases || []).slice(), ip: c.ip || 'Other', role: c.role || '', enabled: c.enabled !== false }; });
    }
    return base;
  }
  function allTypes() {
    var base = TYPES.slice();
    if (OVERRIDE && Array.isArray(OVERRIDE.types) && OVERRIDE.types.length) {
      return OVERRIDE.types.map(function (t) { return { zh: t.zh || '', en: t.en || '', aliases: (t.aliases || []).slice(), enabled: t.enabled !== false }; });
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
  /* 她 20261123 §三：键帽规格统一大写 U（1u/1.25u → 1U/1.25U），前缀拆出来单独拼 */
  function splitSpec(s) {
    var m = String(s || '').match(/^\s*(\d+(?:\.\d+)?)\s*[uU](?![a-zA-Z0-9])/);
    if (!m) return { spec: '', rest: norm(String(s || '')) };
    return { spec: m[1] + 'U', rest: norm(String(s || '').slice(m[0].length)) };
  }
  function findType(input) {
    var types = allTypes();
    var hit = null;
    // 最长优先：先把「亚克力挂件」这类长词拆走，再把「挂件」这类短词算进去
    types.slice().sort(function (a, b) { return b.zh.length - a.zh.length; }).forEach(function (t) {
      if (hit || t.enabled === false) return;
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
  /* 她 20261123 §四：多角色组合必须完整保留所有角色——
     按位置顺序找全部非重叠命中（最长优先），同位同长不同角色才算歧义；不再只取一个最高分 */
  function findCharsSeq(rest) {
    if (!rest) return { seq: [], ambiguous: [] };
    var chars = allChars();
    var low = rest.toLowerCase();
    var cands = [];
    chars.forEach(function (c) {
      if (c.enabled === false) return;
      var list = (c.aliases || []).slice();
      if (c.zh) list.push(c.zh);
      if (c.en) list.push(c.en);
      list.forEach(function (a) {
        if (!a || removed(a)) return;
        var idx = 0;
        var exact = norm(rest).toLowerCase() === a.toLowerCase();
        while ((idx = low.indexOf(a.toLowerCase(), idx)) > -1) {
          if (exact || a.length >= (c.en === 'Neko' ? 4 : 2)) cands.push({ start: idx, len: a.length, char: c, alias: a });
          idx += 1;
        }
      });
    });
    cands.sort(function (x, y) { return y.len - x.len || x.start - y.start; });
    var taken = [], ambiguous = [];
    cands.forEach(function (cd) {
      var overlap = taken.some(function (t) { return cd.start < t.start + t.len && t.start < cd.start + t.len; });
      if (overlap) {
        var sameSpot = taken.some(function (t) { return t.start === cd.start && t.len === cd.len && t.char.en !== cd.char.en; });
        if (sameSpot && !ambiguous.some(function (x) { return x.char.en === cd.char.en && x.start === cd.start; })) ambiguous.push(cd);
        return;
      }
      taken.push(cd);
    });
    taken.sort(function (x, y) { return x.start - y.start; });
    return { seq: taken, ambiguous: ambiguous };
  }
  /* 组合别名替换成当前词库的标准中文名，再走常规识别（保证多角色顺序与输入一致） */
  function applyCombos(rest) {
    COMBOS.forEach(function (cb) {
      var rep = cb.chars.map(function (en) {
        var c = allChars().filter(function (x) { return x.en === en; })[0];
        return c ? (c.zh || c.en) : en;
      }).join('');
      rest = rest.split(cb.from).join(rep);
    });
    return rest;
  }
  /* 拼 标题 = [规格前缀] + [角色标准名（中文名直接连，英文名空格连）] + [类型] + [款式描述]
     她 20261123：款式描述里 (瑕疵) → （瑕疵），英文瑕疵统一 Imperfect */
  function compose(sp, type, seq, rest, matched) {
    var zhNames = seq.map(function (s) { return s.char.zh || s.char.en; });
    var enNames = seq.map(function (s) { return s.char.en; });
    // 款式描述 = 输入去掉角色命中区段后的剩余部分（保留原顺序），括号规范化
    var spans = (matched || seq).slice().sort(function (a, b) { return a.start - b.start; });
    var suffix = '';
    var pos = 0;
    spans.forEach(function (s) { if (s.start > pos) suffix += rest.slice(pos, s.start); pos = Math.max(pos, s.start + s.len); });
    suffix += rest.slice(pos);
    suffix = norm(suffix.replace(/\(\s*瑕疵\s*\)/g, '（瑕疵）'));
    var pending = seq.some(function (s) { return !s.char.en; });
    var nameZh = zhNames.join(''), nameEn = enNames.filter(Boolean).join(' ');
    var sepSuf = /^[A-Za-z0-9]/.test(suffix) ? ' ' : '';
    var typeZh = type ? type.zh : '', typeEn = type ? type.en : '';
    var head = sp.spec ? sp.spec + ' ' : '';
    var sufEn = suffix.replace(/（瑕疵）/g, ' Imperfect ').replace(/\s+/g, ' ').trim();
    var titleZh = seq.length
      ? (head + zhNames.join('') + typeZh + sepSuf + suffix)
      : (head + suffix + typeZh); /* 无角色：保持旧行为——描述在前、类型在后 */
    var titleEn = enNames.length
      ? (head + enNames.join(' ') + (typeEn ? ' Style ' + typeEn : '') + (sufEn ? (sepSuf || ' ') + sufEn : ''))
      : (head + suffix + (typeEn ? ' ' + typeEn : ''));
    return { pending: pending, nameZh: nameZh, nameEn: nameEn, titleZh: titleZh, titleEn: titleEn };
  }

  /* 对外：识别一个商品名输入（她 20261123：规格前缀/多角色组合/款式描述分别识别，标准名完整拼接） */
  function match(raw) {
    var input = norm(raw);
    if (!input) return { ok: false, empty: true };
    var sp = splitSpec(input);
    var type = findType(sp.rest);
    var rest = applyCombos(stripType(sp.rest, type));
    var m = findCharsSeq(rest);
    var res = {
      ok: true,
      input: input,
      spec: sp.spec,
      type: type,
      char: null,
      ambiguous: [],
      pending: false,
      nameZh: '', nameEn: '', titleZh: '', titleEn: ''
    };
    if (m.ambiguous.length) {
      res.ambiguous = m.ambiguous.map(function (x) { return { en: x.char.en, zh: x.char.zh, alias: x.alias, ip: x.char.ip }; });
      return res; // 同位同长不同角色：不猜，提示管理员选择
    }
    // 同角色重复出现只保留一个（如「Iso 壹绝」→ 壹绝）
    var seq = [];
    m.seq.forEach(function (s) { if (!seq.some(function (x) { return x.char.en === s.char.en; })) seq.push(s); });
    var c = seq.length ? seq[0].char : null;
    res.char = c ? { en: c.en, zh: c.zh, ip: c.ip, role: c.role || '' } : null;
    var out = compose(sp, type, seq, rest, m.seq);
    res.pending = out.pending;
    res.nameZh = out.nameZh || norm(rest);
    res.nameEn = out.nameEn;
    res.titleZh = out.titleZh;
    res.titleEn = out.titleEn;
    return res;
  }

  /* 管理员选定歧义项后重出结果（只保留选中角色，其余逻辑同 match） */
  function matchPick(raw, pickEn) {
    var input = norm(raw);
    var sp = splitSpec(input);
    var type = findType(sp.rest);
    var rest = applyCombos(stripType(sp.rest, type));
    var m = findCharsSeq(rest);
    var pick = m.seq.concat(m.ambiguous).filter(function (x) { return x.char.en === pickEn; })[0];
    if (!pick) return match(raw);
    var seq = [pick];
    var c = pick.char;
    var out = compose(sp, type, seq, rest, m.seq);
    return {
      ok: true, input: input, spec: sp.spec, type: type, ambiguous: [],
      char: { en: c.en, zh: c.zh, ip: c.ip, role: c.role || '' },
      pending: out.pending,
      nameZh: out.nameZh, nameEn: out.nameEn,
      titleZh: out.titleZh, titleEn: out.titleEn
    };
  }

  /* 搜索扩展：输入别名 → 返回该角色的全部别名+标准名（用于商品搜索命中同一商品） */
  function searchTerms(q) {
    var input = norm(q).toLowerCase();
    if (!input) return [q];
    var terms = [q];
    allChars().forEach(function (c) {
      if (c.enabled === false) return;
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
    combos: function () { return COMBOS; }, // 她 20261124：组合别名供显示层词库替换使用（异丁香→暮蝶+壹决）
    loadRemote: loadRemote,
    saveRemote: saveRemote,
    ips: function () { var list = allChars().map(function (c) { return c.ip || 'Other'; }); return list.filter(function (x, i) { return list.indexOf(x) === i; }); }
  };
})();
