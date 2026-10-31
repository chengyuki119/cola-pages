/* Snow Yuzu 后台 · 商品批量导入（她 20261030 §3.4）
   无第三方依赖：Excel 模板用 JS 现场生成真正的 .xlsx（zip + inlineStr），
   上传的 .xlsx 用浏览器原生 DecompressionStream 解压后读 sheet1。
   流程固定为：上传 → 识别字段 → 匹配图片 → 预览 → 检查错误 → 修改 → 确认导入。
   导入默认创建为「草稿」（进 site_settings.shop_hidden，不公开上架）。 */
(function () {
  'use strict';

  var FIELDS = [
    { key: 'name', label: '商品名称', req: true, tip: '必填' },
    { key: 'category', label: '分类', tip: '商品分类' },
    { key: 'tag', label: '标签', tip: '不填默认「手作」' },
    { key: 'price', label: '价格', tip: '售价，只写数字' },
    { key: 'unit', label: '单位', tip: '个 / 件 / 套' },
    { key: 'stock', label: '库存', tip: '整数，留空=1' },
    { key: 'cost', label: '成本', tip: '只后台可见' },
    { key: 'sku', label: '商品编码', tip: '唯一编码，重复会提示' },
    { key: 'desc', label: '中文介绍', tip: '中文描述' },
    { key: 'desc_en', label: '英文介绍', tip: 'English description' },
    { key: 'status', label: '商品状态', tip: '草稿 / 上架（默认草稿）' },
    { key: 'vname', label: '规格名称', tip: '同一商品多规格就写多行' },
    { key: 'vprice', label: '规格价格', tip: '该规格单独售价' },
    { key: 'vstock', label: '规格库存', tip: '该规格单独库存' },
    { key: 'vimg', label: '规格图片', tip: '图片文件名或编码，用于匹配上传的图' }
  ];
  var ALIAS = {
    name: ['商品名称', '名称', '商品名', 'name', 'title', '商品'],
    category: ['分类', '商品分类', 'category', '分类名'],
    tag: ['标签', 'tag', 'tags'],
    price: ['价格', '售价', '单价', 'price'],
    unit: ['单位', 'unit'],
    stock: ['库存', '库存数量', 'stock', 'qty'],
    cost: ['成本', '成本价', 'cost'],
    sku: ['商品编码', '编码', '货号', 'sku', 'code'],
    desc: ['中文介绍', '中文描述', '描述', 'desc', 'description'],
    desc_en: ['英文介绍', '英文描述', 'description_en', 'desc_en', 'english'],
    status: ['商品状态', '状态', 'status'],
    vname: ['规格名称', '规格', '规格名', 'variant', 'variant_name'],
    vprice: ['规格价格', '规格价', 'variant_price'],
    vstock: ['规格库存', 'variant_stock'],
    vimg: ['规格图片', '规格图', 'variant_image']
  };

  /* ───────── zip 写入（store，无压缩） ───────── */
  var CRCT = (function () {
    var t = new Int32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c;
    }
    return t;
  })();
  function crc32(buf) {
    var c = -1;
    for (var i = 0; i < buf.length; i++) c = CRCT[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  }
  function utf8(str) { return new TextEncoder().encode(str); }
  function zipStore(files) { // files: [{name, data:Uint8Array}]
    var chunks = [], central = [], offset = 0;
    var now = new Date();
    var dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xFFFF;
    var dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xFFFF;
    files.forEach(function (f) {
      var nameB = utf8(f.name), crc = crc32(f.data), len = f.data.length;
      var lh = new Uint8Array(30 + nameB.length);
      var dv = new DataView(lh.buffer);
      dv.setUint32(0, 0x04034b50, true);
      dv.setUint16(4, 20, true); dv.setUint16(6, 0x0800, true); dv.setUint16(8, 0, true);
      dv.setUint16(10, dosTime, true); dv.setUint16(12, dosDate, true);
      dv.setUint32(14, crc, true); dv.setUint32(18, len, true); dv.setUint32(22, len, true);
      dv.setUint16(26, nameB.length, true); dv.setUint16(28, 0, true);
      lh.set(nameB, 30);
      chunks.push(lh, f.data);
      var cd = new Uint8Array(46 + nameB.length);
      var cv = new DataView(cd.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, 0, true); cv.setUint16(12, dosTime, true); cv.setUint16(14, dosDate, true);
      cv.setUint32(16, crc, true); cv.setUint32(20, len, true); cv.setUint32(24, len, true);
      cv.setUint16(28, nameB.length, true); cv.setUint16(30, 0, true); cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true); cv.setUint16(36, 0, true); cv.setUint32(38, 0, true);
      cv.setUint32(42, offset, true);
      cd.set(nameB, 46);
      central.push(cd);
      offset += lh.length + len;
    });
    var cdSize = central.reduce(function (a, b) { return a + b.length; }, 0);
    var eocd = new Uint8Array(22);
    var ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true);
    ev.setUint32(12, cdSize, true); ev.setUint32(16, offset, true);
    var all = chunks.concat(central, [eocd]);
    var total = all.reduce(function (a, b) { return a + b.length; }, 0);
    var out = new Uint8Array(total), p = 0;
    all.forEach(function (b) { out.set(b, p); p += b.length; });
    return out;
  }

  /* ───────── xlsx 读取（只读 sheet1） ───────── */
  async function inflateRaw(bytes) {
    if (typeof DecompressionStream === 'undefined') throw new Error('这个浏览器不支持直接读 xlsx，请另存为 CSV 再上传');
    var ds = new DecompressionStream('deflate-raw');
    var stream = new Blob([bytes]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  async function unzip(buf) {
    var u8 = new Uint8Array(buf), dv = new DataView(u8.buffer), i = u8.length - 22;
    while (i >= 0 && dv.getUint32(i, true) !== 0x06054b50) i--;
    if (i < 0) throw new Error('不是有效的 xlsx 文件');
    var count = dv.getUint16(i + 10, true), cdOff = dv.getUint32(i + 16, true);
    var out = {}, p = cdOff;
    for (var n = 0; n < count; n++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      var method = dv.getUint16(p + 10, true);
      var csize = dv.getUint32(p + 20, true);
      var nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
      var lho = dv.getUint32(p + 42, true);
      var name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nlen));
      var lnlen = dv.getUint16(lho + 26, true), lelen = dv.getUint16(lho + 28, true);
      var dataStart = lho + 30 + lnlen + lelen;
      var raw = u8.subarray(dataStart, dataStart + csize);
      out[name] = { method: method, raw: raw };
      p += 46 + nlen + elen + clen;
    }
    return out;
  }
  function xmlText(s) {
    return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  }
  function colIndex(ref) {
    var m = /^([A-Z]+)/.exec(ref || '');
    if (!m) return 0;
    var s = m[1], n = 0;
    for (var i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64);
    return n - 1;
  }
  async function readXlsx(file) {
    var entries = await unzip(await file.arrayBuffer());
    var shared = [];
    if (entries['xl/sharedStrings.xml']) {
      var ss = new TextDecoder().decode(entries['xl/sharedStrings.xml'].method === 0 ? entries['xl/sharedStrings.xml'].raw : await inflateRaw(entries['xl/sharedStrings.xml'].raw));
      var items = ss.split('<si>').slice(1);
      shared = items.map(function (si) {
        var texts = si.match(/<t[^>]*>([\s\S]*?)<\/t>/g) || [];
        return texts.map(function (t) { return xmlText(t.replace(/<[^>]+>/g, '')); }).join('');
      });
    }
    var sheetKey = Object.keys(entries).filter(function (k) { return /^xl\/worksheets\/sheet1\.xml$/.test(k); })[0];
    if (!sheetKey) throw new Error('xlsx 里没找到第一张表');
    var sheet = new TextDecoder().decode(entries[sheetKey].method === 0 ? entries[sheetKey].raw : await inflateRaw(entries[sheetKey].raw));
    var rows = [];
    var rowMatches = sheet.match(/<row[^>]*>[\s\S]*?<\/row>/g) || [];
    rowMatches.forEach(function (rx) {
      var rnum = parseInt((/r="(\d+)"/.exec(rx) || [])[1] || '0', 10);
      var cells = rx.match(/<c[^>]*>[\s\S]*?<\/c>|<c[^>]*\/>/g) || [];
      var row = [];
      cells.forEach(function (cx) {
        var ref = (/r="([A-Z]+\d+)"/.exec(cx) || [])[1] || '';
        var t = (/t="([^"]+)"/.exec(cx) || [])[1] || '';
        var v = '';
        if (t === 'inlineStr') {
          var its = cx.match(/<t[^>]*>([\s\S]*?)<\/t>/g) || [];
          v = its.map(function (x) { return xmlText(x.replace(/<[^>]+>/g, '')); }).join('');
        } else {
          var vm = /<v>([\s\S]*?)<\/v>/.exec(cx);
          v = vm ? xmlText(vm[1]) : '';
          if (t === 's' && v !== '') v = shared[parseInt(v, 10)] || '';
        }
        row[colIndex(ref)] = v;
      });
      if (row.length) rows.push({ r: rnum, cells: row });
    });
    rows.sort(function (a, b) { return a.r - b.r; });
    return rows.map(function (x) {
      var arr = x.cells.map(function (c) { return c == null ? '' : c; });
      return arr;
    });
  }
  function readCsv(text) {
    text = text.replace(/^\uFEFF/, '');
    var rows = [], row = [], cell = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === ',' || c === '，') { row.push(cell); cell = ''; }
      else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else if (c === '\r') { }
      else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (x) { return String(x).trim() !== ''; }); });
  }

  /* ───────── 模板 ───────── */
  var HEAD = FIELDS.map(function (f) { return f.label; });
  var SAMPLE = [
    ['毛线小兔（示例·请删除）', '手作', '毛线', '39.9', '个', '3', '18', 'SKU-001', '手工毛线钩织，高约 10cm。', 'Handmade crochet bunny, about 10cm.', '草稿', '粉色', '39.9', '2', 'SKU-001-粉'],
    ['毛线小兔（示例·请删除）', '手作', '毛线', '39.9', '个', '3', '18', 'SKU-001', '', '', '草稿', '米白', '42', '1', 'SKU-001-白'],
    ['黏土小熊（示例·请删除）', '手作', '黏土', '52', '只', '1', '25', 'SKU-002', '软陶黏土，不可水洗。', 'Polymer clay bear, not washable.', '上架', '', '', '', '']
  ];
  function sheetXml(rows) {
    var esc = function (s) {
      return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    };
    var body = rows.map(function (r, ri) {
      var cells = r.map(function (v, ci) {
        var ref = String.fromCharCode(65 + (ci % 26)) + (ri + 1);
        if (ci >= 26) ref = 'A' + String.fromCharCode(65 + (ci - 26)) + (ri + 1);
        var style = ri === 0 ? ' s="1"' : '';
        return '<c r="' + ref + '" t="inlineStr"' + style + '><is><t xml:space="preserve">' + esc(v) + '</t></is></c>';
      }).join('');
      return '<row r="' + (ri + 1) + '">' + cells + '</row>';
    }).join('');
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<cols><col min="1" max="15" width="18" customWidth="1"/></cols><sheetData>' + body + '</sheetData></worksheet>';
  }
  function buildXlsx() {
    var help = [['字段', '说明'], ['商品名称', '必填。同一个商品的多规格：这个字段写相同名字，或商品编码写同一个。']]
      .concat(FIELDS.map(function (f) { return [f.label, (f.req ? '必填。' : '') + (f.tip || '')]; }))
      .concat([
        ['商品图片', '不支持写进表格。导入时另外选图片文件，按「商品编码」或「商品名称」出现在文件名里自动匹配。'],
        ['规格图片', '同上，按规格图片列的编码/名称匹配文件名。'],
        ['商品状态', '填「上架」才会公开；空着或其他值一律当草稿，不上架。'],
        ['重复检查', '商品编码或商品名称已存在会标黄，可自己改掉再导入。']
      ]);
    var files = [
      { name: '[Content_Types].xml', data: utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>') },
      { name: '_rels/.rels', data: utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>') },
      { name: 'xl/workbook.xml', data: utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="商品" sheetId="1" r:id="rId1"/><sheet name="字段说明" sheetId="2" r:id="rId2"/></sheets></workbook>') },
      { name: 'xl/_rels/workbook.xml.rels', data: utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>') },
      { name: 'xl/styles.xml', data: utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFCE1EA"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs></styleSheet>') },
      { name: 'xl/worksheets/sheet1.xml', data: utf8(sheetXml([HEAD].concat(SAMPLE))) },
      { name: 'xl/worksheets/sheet2.xml', data: utf8(sheetXml(help)) }
    ];
    return zipStore(files);
  }
  function download(name, bytes, mime) {
    var blob = new Blob([bytes], { type: mime });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  function downloadXlsx() {
    download('商品导入模板.xlsx', buildXlsx(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  }
  function downloadCsv() {
    var lines = [HEAD].concat(SAMPLE).concat([['# 说明：商品名称必填；商品状态填「上架」才公开，其余当草稿；同一商品多规格请写多行并保持商品编码相同；图片请在导入时另外选择文件按编码/名称匹配。']]);
    var csv = '\uFEFF' + lines.map(function (r) {
      return r.map(function (c) { return '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"'; }).join(',');
    }).join('\r\n');
    download('商品导入模板.csv', utf8(csv), 'text/csv;charset=utf-8');
  }

  /* ───────── 导入界面 ───────── */
  var ST = { rows: [], header: null, map: null, imgs: [], step: 1, existing: [] };

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function toast(m) { if (typeof window.toast === 'function') window.toast(m); else alert(m); }

  function modal() {
    var m = document.getElementById('imp-mask');
    if (m) return m;
    m = document.createElement('div');
    m.id = 'imp-mask';
    m.innerHTML = '<div class="imp-box" role="dialog" aria-modal="true">' +
      '<div class="imp-top"><b>批量导入商品</b>' +
      '<span class="imp-top-tip">上传 → 识别字段 → 匹配图片 → 预览 → 检查错误 → 修改 → 确认导入</span>' +
      '<button type="button" class="imp-x" title="关闭">✕</button></div>' +
      '<div class="imp-body"></div></div>';
    document.body.appendChild(m);
    m.querySelector('.imp-x').addEventListener('click', function () { m.style.display = 'none'; });
    m.addEventListener('click', function (e) { if (e.target === m) m.style.display = 'none'; });
    return m;
  }
  function body() { return modal().querySelector('.imp-body'); }

  function stepUpload() {
    ST.step = 1;
    body().innerHTML =
      '<div class="imp-sec"><div class="imp-h"><b>① 先拿模板</b><span>模板里已有真实表头、字段说明和示例，别从空文件开始</span></div>' +
      '<div class="imp-row"><button type="button" class="btn-mini imp-tpl-x">下载 Excel 模板（.xlsx）</button>' +
      '<button type="button" class="btn-mini imp-tpl-c">下载 CSV 模板（.csv）</button></div></div>' +
      '<div class="imp-sec"><div class="imp-h"><b>② 上传填好的文件</b><span>支持 .xlsx / .csv，第一行必须是表头</span></div>' +
      '<label class="imp-drop"><input type="file" class="imp-file" accept=".xlsx,.xls,.csv" hidden><span>点这里选文件，或把文件拖进来</span></label>' +
      '<div class="imp-file-name"></div></div>' +
      '<div class="imp-sec"><div class="imp-h"><b>③ 商品图片（可选）</b><span>按文件名里的「商品编码」或「商品名称」自动匹配，不会乱配</span></div>' +
      '<label class="btn-mini imp-imgbtn">选择图片文件（可多选）<input type="file" class="imp-imgs" accept="image/*" multiple hidden></label>' +
      '<div class="imp-img-list"></div></div>';
    body().querySelector('.imp-tpl-x').addEventListener('click', downloadXlsx);
    body().querySelector('.imp-tpl-c').addEventListener('click', downloadCsv);
    body().querySelector('.imp-file').addEventListener('change', function () { handleFile(this.files[0]); });
    body().querySelector('.imp-imgs').addEventListener('change', function () { addImgs(this.files); });
    var drop = body().querySelector('.imp-drop');
    ['dragover', 'drop'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) {
        e.preventDefault();
        if (ev === 'drop' && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
      });
    });
  }
  function addImgs(files) {
    Array.prototype.forEach.call(files || [], function (f) { ST.imgs.push(f); });
    var box = body().querySelector('.imp-img-list');
    if (box) box.innerHTML = ST.imgs.length ? ST.imgs.map(function (f) { return '<span class="imp-imgpill">' + esc(f.name) + '</span>'; }).join('') : '';
  }
  async function handleFile(f) {
    if (!f) return;
    var nameEl = body().querySelector('.imp-file-name');
    if (nameEl) nameEl.textContent = '已选：' + f.name;
    try {
      var rows;
      if (/\.csv$/i.test(f.name)) rows = readCsv(await f.text());
      else rows = await readXlsx(f);
      rows = rows.filter(function (r) { return r && r.some(function (x) { return String(x).trim() !== ''; }); });
      if (rows.length < 2) { toast('文件里只有表头，没有商品数据'); return; }
      ST.rows = rows;
      ST.header = rows[0].map(function (x) { return String(x).trim(); });
      ST.map = autoMap(ST.header);
      stepMap();
    } catch (err) {
      toast('读不出来：' + err.message);
    }
  }
  function autoMap(header) {
    var map = {};
    FIELDS.forEach(function (f) {
      var hit = -1;
      header.forEach(function (h, i) {
        if (hit >= 0) return;
        var key = String(h).trim().toLowerCase();
        var cands = (ALIAS[f.key] || []).concat([f.label]);
        if (cands.some(function (c) { return String(c).toLowerCase() === key; })) hit = i;
      });
      if (hit < 0) {
        header.forEach(function (h, i) {
          if (hit >= 0) return;
          var key = String(h).trim().toLowerCase();
          var cands = (ALIAS[f.key] || []);
          if (cands.some(function (c) { return key.indexOf(String(c).toLowerCase()) !== -1; })) hit = i;
        });
      }
      map[f.key] = hit;
    });
    return map;
  }
  function stepMap() {
    ST.step = 2;
    var opts = function (sel) {
      return '<option value="-1">（不使用）</option>' + ST.header.map(function (h, i) {
        return '<option value="' + i + '"' + (i === sel ? ' selected' : '') + '>' + esc(h || ('第 ' + (i + 1) + ' 列')) + '</option>';
      }).join('');
    };
    body().innerHTML =
      '<div class="imp-sec"><div class="imp-h"><b>② 字段匹配</b><span>已经自动认出来的先填好了，对不上就手动选</span></div>' +
      '<div class="imp-map">' + FIELDS.map(function (f) {
        return '<label class="imp-maprow"><span>' + esc(f.label) + (f.req ? ' *' : '') + '</span>' +
          '<select data-k="' + f.key + '">' + opts(ST.map[f.key]) + '</select></div>';
      }).join('') + '</div></div>' +
      '<div class="imp-foot"><button type="button" class="btn-mini imp-back">返回上一步</button>' +
      '<button type="button" class="btn-save imp-next">下一步：预览与检查</button></div>';
    body().querySelectorAll('.imp-map select').forEach(function (s) {
      s.addEventListener('change', function () { ST.map[s.getAttribute('data-k')] = parseInt(s.value, 10); });
    });
    body().querySelector('.imp-back').addEventListener('click', stepUpload);
    body().querySelector('.imp-next').addEventListener('click', function () {
      if (ST.map.name < 0) { toast('「商品名称」必须对应一列'); return; }
      prepare();
    });
  }

  /* 把表格行合并成商品 + 规格 */
  function prepare() {
    var get = function (row, k) {
      var i = ST.map[k];
      if (i == null || i < 0) return '';
      return String(row[i] == null ? '' : row[i]).trim();
    };
    var list = [], byKey = {};
    ST.rows.slice(1).forEach(function (row, idx) {
      var name = get(row, 'name');
      if (!name) return;
      var sku = get(row, 'sku');
      var key = (sku ? 'k:' + sku.toLowerCase() : 'n:' + name.toLowerCase());
      var vn = get(row, 'vname');
      var item = byKey[key];
      if (!item) {
        item = {
          key: key, rowNo: idx + 2, name: name, category: get(row, 'category'), tag: get(row, 'tag') || '手作',
          price: get(row, 'price'), unit: get(row, 'unit'), stock: get(row, 'stock'), cost: get(row, 'cost'),
          sku: sku, desc: get(row, 'desc'), desc_en: get(row, 'desc_en'),
          status: /上架|publish|公开/i.test(get(row, 'status')) ? '上架' : '草稿',
          variants: []
        };
        byKey[key] = item; list.push(item);
      }
      if (vn || get(row, 'vprice') || get(row, 'vstock')) {
        item.variants.push({ name: vn || ('规格' + (item.variants.length + 1)), price: get(row, 'vprice'), stock: get(row, 'vstock'), imgRef: get(row, 'vimg') });
      }
    });
    ST.items = list;
    ST.step = 3;
    validate();
    stepPreview();
  }
  function matchImg(ref, files) {
    if (!ref) return null;
    var r = String(ref).toLowerCase();
    var hit = files.filter(function (f) { return f.name.toLowerCase().indexOf(r) !== -1; })[0];
    return hit || null;
  }
  function validate() {
    ST.existing = ST.existing || [];
    ST.items.forEach(function (it) {
      it.errs = []; it.warns = [];
      if (!it.name) it.errs.push('缺商品名称');
      if (it.price !== '' && !(parseFloat(it.price) >= 0)) it.errs.push('价格不是数字');
      if (it.stock !== '' && !(parseInt(it.stock, 10) >= 0)) it.errs.push('库存不是整数');
      if (it.cost !== '' && !(parseFloat(it.cost) >= 0)) it.errs.push('成本不是数字');
      var dup = (ST.existing || []).filter(function (p) {
        return (it.sku && p.sku && String(p.sku).toLowerCase() === it.sku.toLowerCase()) ||
          String(p.name || '').trim().toLowerCase() === it.name.trim().toLowerCase();
      });
      if (dup.length) it.warns.push('已存在同名或同编码商品（' + dup[0].name + '）');
      it.variants.forEach(function (v) {
        if (v.price !== '' && !(parseFloat(v.price) >= 0)) it.errs.push('规格「' + v.name + '」价格不是数字');
      });
      if (ST.imgs && ST.imgs.length) {
        it.imgFile = matchImg(it.sku, ST.imgs) || matchImg(it.name, ST.imgs);
        it.variants.forEach(function (v) { v.imgFile = matchImg(v.imgRef, ST.imgs) || matchImg(it.sku ? it.sku + '-' + v.name : it.name + '-' + v.name, ST.imgs); });
      }
    });
  }
  function stepPreview() {
    var okN = ST.items.filter(function (i) { return !i.errs.length; }).length;
    var badN = ST.items.length - okN;
    body().innerHTML =
      '<div class="imp-sec"><div class="imp-h"><b>③ 预览与检查</b><span>共 ' + ST.items.length + ' 个商品 · 可导入 ' + okN + ' · 有错 ' + badN + '（错的会被跳过，不影响其他的）</span></div>' +
      '<div class="imp-tbl-wrap"><table class="imp-tbl"><thead><tr>' +
      '<th>行</th><th>商品名称 *</th><th>分类</th><th>标签</th><th>价格</th><th>单位</th><th>库存</th><th>成本</th><th>编码</th><th>规格</th><th>图片</th><th>状态</th><th>检查</th>' +
      '</tr></thead><tbody>' + ST.items.map(function (it, i) {
        return '<tr class="' + (it.errs.length ? 'bad' : (it.warns.length ? 'warn' : '')) + '">' +
          '<td>' + it.rowNo + '</td>' +
          '<td><input data-i="' + i + '" data-f="name" value="' + esc(it.name) + '"></td>' +
          '<td><input data-i="' + i + '" data-f="category" value="' + esc(it.category) + '" style="width:80px;"></td>' +
          '<td><input data-i="' + i + '" data-f="tag" value="' + esc(it.tag) + '" style="width:80px;"></td>' +
          '<td><input data-i="' + i + '" data-f="price" value="' + esc(it.price) + '" style="width:70px;"></td>' +
          '<td><input data-i="' + i + '" data-f="unit" value="' + esc(it.unit) + '" style="width:56px;"></td>' +
          '<td><input data-i="' + i + '" data-f="stock" value="' + esc(it.stock) + '" style="width:60px;"></td>' +
          '<td><input data-i="' + i + '" data-f="cost" value="' + esc(it.cost) + '" style="width:66px;"></td>' +
          '<td><input data-i="' + i + '" data-f="sku" value="' + esc(it.sku) + '" style="width:90px;"></td>' +
          '<td>' + (it.variants.length ? it.variants.map(function (v) { return esc(v.name) + (v.price ? ' $' + esc(v.price) : ''); }).join('<br>') : '—') + '</td>' +
          '<td>' + (it.imgFile ? '主图 ✓' : '—') + (it.variants.some(function (v) { return v.imgFile; }) ? '<br>规格 ✓' : '') + '</td>' +
          '<td><button type="button" class="imp-st" data-i="' + i + '">' + (it.status === '上架' ? '上架' : '草稿') + '</button></td>' +
          '<td class="imp-chk">' + (it.errs.length ? '<span style="color:#C4636E;">' + esc(it.errs.join('；')) + '</span>' : (it.warns.length ? '<span style="color:#B98598;">' + esc(it.warns.join('；')) + '</span>' : '<span style="color:#7BA37B;">通过</span>')) + '</td>' +
          '</tr>';
      }).join('') + '</tbody></table></div>' +
      '<p class="imp-note">导入后默认是草稿，不会公开上架；要公开就去小铺商品里把「草稿」改掉。表格里的格子可以直接改，改完点「重新检查」。</p></div>' +
      '<div class="imp-foot"><button type="button" class="btn-mini imp-back">返回字段匹配</button>' +
      '<button type="button" class="btn-mini imp-recheck">重新检查</button>' +
      '<button type="button" class="btn-save imp-go">确认导入（' + okN + ' 个）</button></div>';
    body().querySelectorAll('.imp-tbl input').forEach(function (inp) {
      inp.addEventListener('change', function () {
        var it = ST.items[parseInt(inp.getAttribute('data-i'), 10)];
        it[inp.getAttribute('data-f')] = inp.value.trim();
      });
    });
    body().querySelectorAll('.imp-st').forEach(function (b) {
      b.addEventListener('click', function () {
        var it = ST.items[parseInt(b.getAttribute('data-i'), 10)];
        it.status = it.status === '上架' ? '草稿' : '上架';
        b.textContent = it.status;
      });
    });
    body().querySelector('.imp-back').addEventListener('click', stepMap);
    body().querySelector('.imp-recheck').addEventListener('click', function () { validate(); stepPreview(); });
    body().querySelector('.imp-go').addEventListener('click', doImport);
  }

  /* ───────── 真正写入 ───────── */
  function api(path, opt) {
    if (typeof window.api === 'function') return window.api(path, opt);
    throw new Error('api() 不可用');
  }
  async function postProduct(it) {
    var url = null, varUrls = [];
    if (it.imgFile && typeof window.uploadShopFiles === 'function') {
      try { var u = await window.uploadShopFiles([it.imgFile]); url = u && u[0]; } catch (e) { url = null; }
    }
    if (typeof window.uploadShopFiles === 'function') {
      for (var i = 0; i < it.variants.length; i++) {
        var f = it.variants[i].imgFile;
        if (!f) { varUrls.push(null); continue; }
        try { var ur = await window.uploadShopFiles([f]); varUrls.push(ur && ur[0]); } catch (e) { varUrls.push(null); }
      }
    }
    var body = {
      name: it.name,
      price: it.price === '' ? '' : String(it.price),
      description: it.desc || '',
      description_en: it.desc_en || '',
      tag: it.tag || '手作',
      image_url: url,
      stock: it.stock === '' ? 1 : parseInt(it.stock, 10),
      cost: it.cost === '' ? null : parseFloat(it.cost),
      currency: 'USD'
    };
    if (it.unit) body.unit = it.unit;
    if (it.sku) body.sku = it.sku;
    if (it.category) body.category = it.category;
    if (it.variants.length) {
      body.variants = it.variants.map(function (v, k) {
        return {
          sku: (it.sku ? it.sku + '-' + v.name : v.name),
          name: v.name,
          price: v.price === '' ? (it.price || '') : v.price,
          stock: v.stock === '' ? 0 : parseInt(v.stock, 10),
          images: varUrls[k] ? [varUrls[k]] : []
        };
      });
    }
    return api('products', { method: 'POST', headers: { 'Prefer': 'return=representation' }, body: JSON.stringify(body) }).then(function (r) {
      if (r && r.ok) return r;
      var b2 = Object.assign({}, body); delete b2.unit; delete b2.sku; delete b2.category;
      return api('products', { method: 'POST', headers: { 'Prefer': 'return=representation' }, body: JSON.stringify(b2) });
    });
  }
  async function doImport() {
    var btn = body().querySelector('.imp-go');
    var okItems = ST.items.filter(function (i) { return !i.errs.length; });
    if (!okItems.length) { toast('没有可以导入的商品，先把红色的错误改掉'); return; }
    btn.disabled = true;
    var ok = 0, fail = 0, failList = [], createdIds = [];
    for (var i = 0; i < okItems.length; i++) {
      btn.textContent = '导入中 ' + (i + 1) + '/' + okItems.length + '…';
      try {
        var r = await postProduct(okItems[i]);
        if (r && r.ok) {
          ok++;
          try { var j = await r.json(); if (j && j[0] && j[0].id) createdIds.push(j[0].id); else if (j && j.id) createdIds.push(j.id); } catch (e) {}
        } else { fail++; failList.push(okItems[i].name); }
      } catch (e) { fail++; failList.push(okItems[i].name); }
    }
    // 草稿：进 shop_hidden，前台看不到（她 §3.4：导入后默认草稿，不自动上架）
    var draftItems = okItems.filter(function (x) { return x.status !== '上架'; });
    if (draftItems.length && typeof window.api === 'function') {
      try {
        // 接口没回 id 就按刚建的名称/编码反查（不靠猜，按编码优先）
        if (createdIds.length < draftItems.length) {
          var recent = await api('products?select=id,name,sku&order=created_at.desc&limit=200').then(function (r) { return r.json(); });
          recent = Array.isArray(recent) ? recent : [];
          createdIds = draftItems.map(function (it) {
            var hit = recent.filter(function (p) {
              return (it.sku && p.sku && String(p.sku) === String(it.sku)) || String(p.name || '').trim() === it.name;
            })[0];
            return hit ? hit.id : null;
          }).filter(Boolean);
        }
        if (createdIds.length) {
          var cur = await api('site_settings?select=value&key=eq.shop_hidden').then(function (r) { return r.json(); });
          var hidden = [];
          if (cur && cur[0] && cur[0].value) { try { hidden = JSON.parse(cur[0].value) || []; } catch (e) { hidden = []; } }
          createdIds.forEach(function (id) { if (hidden.indexOf(id) === -1) hidden.push(id); });
          await api('site_settings?on_conflict=key', { method: 'POST', headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify([{ key: 'shop_hidden', value: JSON.stringify(hidden) }]) });
        }
      } catch (e) {}
    }
    ST.step = 4;
    body().innerHTML = '<div class="imp-sec"><div class="imp-h"><b>导入完成</b></div>' +
      '<p class="imp-done">成功 <b style="color:#7BA37B;">' + ok + '</b> 个 · 失败 <b style="color:#C4636E;">' + fail + '</b> 个</p>' +
      (fail ? '<p class="imp-note">失败的：' + esc(failList.join('、')) + '（数据已保留在表格里，可关掉重来只导入这些）</p>' : '') +
      '<p class="imp-note">' + (draftItems.length ? '其中 ' + draftItems.length + ' 个是草稿，前台暂时看不到；' : '') + '所有商品都在「小铺商品」里可以继续编辑。</p></div>' +
      '<div class="imp-foot"><button type="button" class="btn-save imp-close">知道了</button></div>';
    body().querySelector('.imp-close').addEventListener('click', function () {
      modal().style.display = 'none';
      if (typeof window.renderShopList === 'function') window.renderShopList();
    });
  }

  function open() {
    var m = modal();
    m.style.display = 'flex';
    if (ST.step === 4 || !ST.rows.length) { ST.items = []; ST.imgs = []; stepUpload(); }
    else stepPreview();
    // 拉一次现有商品做重复检查（拿不到也不阻塞）
    if (typeof window.api === 'function' && !ST.existing.length) {
      window.api('products?select=id,name,price,sku,stock&limit=500').then(function (r) { return r.json(); })
        .then(function (rows) { ST.existing = Array.isArray(rows) ? rows : []; })
        .catch(function () { ST.existing = []; });
    }
  }

  window.YkImport = { open: open, downloadXlsx: downloadXlsx, downloadCsv: downloadCsv, _st: ST, _buildXlsx: buildXlsx, _readXlsx: readXlsx, _readCsv: readCsv, _prepare: prepare, _stepPreview: stepPreview, _load: handleFile, _doImport: doImport, _validate: validate };
})();
