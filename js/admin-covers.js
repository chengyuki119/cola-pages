/* ═══════════ 封面图管理（她 20261117 02:50 任务书 PART C）═══════════
   后台「封面图管理」tab：独立 covers 存储桶 + page_covers 表（SQL 她已执行）。
   - 七个页位：小铺 / 稿件 / 照片 / BJD / 色卡 / 关于 / 美食地图（首页 hero 沿用主页管理原机制，不在这里）
   - 上传→预览→替换→显示位置→删除，全部真实生效
   - 管理员判定走服务端 RLS（shop_is_admin），不信任前端参数
   - 删除只删这张封面：page_covers 软删 + covers 桶对象移除，不碰其他图片 */
(function () {
  var SB = 'https://ukxrvcptwhlwvdanovgd.supabase.co';
  var SLOTS = [
    { key: 'shop',       zh: '小铺 · Shop',            route: '/shop/' },
    { key: 'works',      zh: '稿件 · Commissions',     route: '/works/' },
    { key: 'photos',     zh: '照片展示 · Photo Gallery', route: '/photos/' },
    { key: 'bjd',        zh: 'BJD',                    route: '/bjd/' },
    { key: 'color-card', zh: '色卡 · Color Cards',      route: '/color-card/' },
    { key: 'about',      zh: '关于 · About',            route: '/about/' },
    { key: 'foodie',     zh: '美食地图 · Foodie Map',   route: '/foodie/map/' }
  ];
  var POSITIONS = [
    { v: 'center', label: '居中（默认）' },
    { v: 'center top', label: '偏上显示' },
    { v: 'center bottom', label: '偏下显示' },
    { v: 'left center', label: '靠左' },
    { v: 'right center', label: '靠右' }
  ];
  var ROWS = {};

  function auth(url, options) { return window.authedFetch ? authedFetch(url, options) : fetch(url, options); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fetchRows() {
    var anon = window.SUPABASE_ANON_KEY || '';
    return auth(SB + '/rest/v1/page_covers?select=*', { headers: { 'apikey': anon } })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rows) {
        ROWS = {};
        (rows || []).forEach(function (r) { ROWS[r.page_key] = r; });
        return ROWS;
      })
      .catch(function () { return {}; });
  }

  function posOptions(cur) {
    return POSITIONS.map(function (p) {
      return '<option value="' + p.v + '"' + (p.v === (cur || 'center') ? ' selected' : '') + '>' + p.label + '</option>';
    }).join('');
  }

  function render() {
    var list = document.getElementById('covers-list');
    if (!list) return;
    list.innerHTML = SLOTS.map(function (s) {
      var r = ROWS[s.key];
      var active = r && r.is_active !== false;
      var thumb = (r && active && r.image_url)
        ? '<img src="' + esc(r.image_url) + '" alt="" style="width:64px;height:64px;object-fit:cover;border-radius:12px;border:1px solid #F9E5ED;display:block;">'
        : '<div style="width:64px;height:64px;border-radius:12px;border:1px dashed #E8D5DE;display:flex;align-items:center;justify-content:center;color:#B9A6B0;font-size:12px;">无</div>';
      var status = (r && active) ? '<span style="color:#897783;">显示中 · ' + esc(r.position || 'center') + '</span>'
        : (r && !active) ? '<span style="color:#C4636E;">已删除（可重新上传恢复）</span>'
        : '<span style="color:#B9A6B0;">未设置</span>';
      var posSel = (r && active)
        ? '<select id="cov-pos-' + s.key + '" class="adm-input" style="max-width:150px;font-size:14px;padding:6px 8px;">' + posOptions(r.position) + '</select>'
        : '';
      var delBtn = (r && active)
        ? '<button class="btn-mini" id="cov-del-' + s.key + '" style="border-color:#F2DADB;color:#C4636E;">删除</button>'
        : '';
      return '<div class="cov-row" data-key="' + s.key + '" style="display:flex;align-items:center;gap:14px;padding:12px 0;border-bottom:1px solid #F9E5ED;flex-wrap:wrap;">'
        + thumb
        + '<div style="flex:1 1 200px;min-width:180px;">'
        + '<div style="font-weight:600;color:var(--text,#65515D);">' + s.zh + '</div>'
        + '<div style="font-size:13px;color:#897783;">页位 ' + esc(s.key) + ' · ' + esc(s.route) + '</div>'
        + '<div style="font-size:13px;margin-top:2px;" data-cov-status>' + status + '</div>'
        + '</div>'
        + posSel
        + '<button class="btn-mini" id="cov-up-' + s.key + '">' + ((r && active) ? '替换图片' : '上传图片') + '</button>'
        + delBtn
        + '<input type="file" id="cov-file-' + s.key + '" accept="image/*" style="display:none;">'
        + '</div>';
    }).join('');
    bind();
  }

  function bind() {
    SLOTS.forEach(function (s) {
      var up = document.getElementById('cov-up-' + s.key);
      var file = document.getElementById('cov-file-' + s.key);
      var del = document.getElementById('cov-del-' + s.key);
      var pos = document.getElementById('cov-pos-' + s.key);
      if (up && file) {
        up.addEventListener('click', function () { file.click(); });
        file.addEventListener('change', function () { if (file.files && file.files[0]) upload(s.key, file.files[0]); });
      }
      if (del) del.addEventListener('click', function () { removeCover(s.key); });
      if (pos) pos.addEventListener('change', function () { savePosition(s.key, pos.value); });
    });
  }

  function rowStatus(key, text, color) {
    var row = document.querySelector('.cov-row[data-key="' + key + '"] [data-cov-status]');
    if (row) { row.textContent = text; row.style.color = color || '#897783'; }
  }

  function upload(key, f) {
    rowStatus(key, '上传中…', '#897783');
    var done = function (url, path) { saveRow(key, url, path); };
    var viaStorage = function (blob, name) {
      var path = Date.now() + '-' + Math.random().toString(36).slice(2, 6) + '-' + name.replace(/[^\w.\-]+/g, '_');
      auth(SB + '/storage/v1/object/covers/' + path, { method: 'POST', body: blob })
        .then(function (r) {
          if (!r.ok) return r.text().then(function (t) { throw new Error('上传失败 ' + r.status + ' ' + t.slice(0, 120)); });
          done(SB + '/storage/v1/object/public/covers/' + path, path);
        })
        .catch(function (e) { toast('封面图上传失败：' + (e.message || e)); rowStatus(key, '上传失败', '#C4636E'); });
    };
    if (typeof window.ykShrinkImage === 'function') {
      window.ykShrinkImage(f).then(function (blob) { viaStorage(blob, f.name || 'cover.jpg'); })
        .catch(function () { viaStorage(f, f.name || 'cover.jpg'); });
    } else {
      viaStorage(f, f.name || 'cover.jpg');
    }
  }

  function saveRow(key, url, path) {
    // 先删旧对象（替换场景），再 upsert 行
    var old = ROWS[key];
    var delOld = (old && old.image_path && old.image_path !== path)
      ? auth(SB + '/storage/v1/object/covers/' + old.image_path, { method: 'DELETE' }).catch(function () {})
      : Promise.resolve();
    delOld.then(function () {
      var anon = window.SUPABASE_ANON_KEY || '';
      return auth(SB + '/rest/v1/page_covers?on_conflict=page_key', {
        method: 'POST',
        headers: { 'apikey': anon, 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify({ page_key: key, image_url: url, image_path: path, is_active: true, updated_by: (window.ADMIN_EMAIL || 'admin'), updated_at: new Date().toISOString() })
      });
    }).then(function () { return fetchRows(); })
      .then(function () { render(); toast('封面图已更新 ✓'); })
      .catch(function (e) { toast('保存失败：' + (e.message || e)); rowStatus(key, '保存失败', '#C4636E'); });
  }

  function savePosition(key, pos) {
    var anon = window.SUPABASE_ANON_KEY || '';
    auth(SB + '/rest/v1/page_covers?page_key=eq.' + encodeURIComponent(key), {
      method: 'PATCH',
      headers: { 'apikey': anon, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({ position: pos, updated_at: new Date().toISOString() })
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      if (ROWS[key]) ROWS[key].position = pos;
      render();
      toast('显示位置已保存 ✓');
    }).catch(function (e) { toast('保存失败：' + (e.message || e)); });
  }

  function removeCover(key) {
    if (!window.confirm('确定删除这个页面的封面图吗？前台会恢复为原页面设计。')) return;
    rowStatus(key, '删除中…', '#897783');
    var anon = (window.SUPABASE_ANON_KEY) || '';
    var obj = ROWS[key] || {};
    var rmObj = obj.image_path
      ? auth(SB + '/storage/v1/object/covers/' + obj.image_path, { method: 'DELETE' }).catch(function () {})
      : Promise.resolve();
    rmObj.then(function () {
      return auth(SB + '/rest/v1/page_covers?page_key=eq.' + encodeURIComponent(key), {
        method: 'PATCH',
        headers: { 'apikey': anon, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ is_active: false, image_url: '', image_path: '', updated_at: new Date().toISOString() })
      });
    }).then(function () { return fetchRows(); })
      .then(function () { render(); toast('封面图已删除 ✓'); })
      .catch(function (e) { toast('删除失败：' + (e.message || e)); });
  }

  window.AdminCovers = {
    boot: function () { fetchRows().then(render); },
    render: render
  };
})();
