(function () {
  'use strict';
  var ROOT = 'food_wheel_options';
  var URL_ = window.SUPABASE_URL || 'https://ukxrvcptwhlwvdanovgd.supabase.co';
  var CATS = [['chinese','中餐'],['japanese','日料'],['korean','韩餐'],['american','美式'],['fast_food','快餐'],['dessert','甜品'],['drink','饮料'],['other','其他']];
  var started = false;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]); }); }
  function token() { if (window.ACCESS) return window.ACCESS; try { var s = JSON.parse(localStorage.getItem('yuki-admin-session') || 'null'); return s && s.a || ''; } catch (e) { return ''; } }
  function headers() { return { apikey: window.SUPABASE_ANON_KEY || '', Authorization: 'Bearer ' + token(), 'Content-Type':'application/json', Prefer:'return=representation' }; }
  function api(method, qs, body) {
    return fetch(URL_ + '/rest/v1/' + ROOT + (qs ? '?' + qs : ''), { method:method, headers:headers(), body:body ? JSON.stringify(body) : undefined })
      .then(function (r) { if (!r.ok) return r.text().then(function (x) { throw new Error('HTTP ' + r.status + ' ' + x.slice(0,180)); }); return r.status === 204 ? null : r.json(); });
  }
  function toast(s) { if (window.showToast) window.showToast(s); else { var e=document.getElementById('toast'); if(e){e.textContent=s;e.classList.add('show');setTimeout(function(){e.classList.remove('show');},2500);} } }
  function catOptions(selected) { return CATS.map(function (c) { return '<option value="'+c[0]+'"'+(c[0]===selected?' selected':'')+'>'+c[1]+'</option>'; }).join(''); }
  function boot() {
    var root = document.getElementById('food-wheel-admin-root'); if (!root) return;
    started = true;
    root.innerHTML = '<form id="fw-add-form" style="display:flex;gap:8px;flex-wrap:wrap;margin:0 0 16px;"><input name="name" required maxlength="100" placeholder="食物或餐厅名称" style="flex:1;min-width:190px;"><select name="category">'+catOptions('other')+'</select><button class="btn-save" type="submit">＋ 添加选项</button></form><div id="fw-admin-list"><p class="empty">加载中…</p></div>';
    root.querySelector('#fw-add-form').addEventListener('submit', function (e) {
      e.preventDefault(); var f=e.currentTarget, name=f.elements.name.value.trim(); if(!name)return;
      api('POST','', {name:name, category:f.elements.category.value, enabled:true, sort_order:0}).then(function(){f.reset(); loadList();toast('已添加食物选项');}).catch(function(err){toast('添加失败：'+err.message);});
    });
    loadList();
  }
  function loadList() {
    var list=document.getElementById('fw-admin-list'); if(!list)return;
    api('GET','select=id,name,category,enabled,sort_order,created_at&order=sort_order.asc,name.asc').then(function(rows){
      if(!rows.length){list.innerHTML='<p class="empty">暂无选项，请添加食物。</p>';return;}
      list.innerHTML=rows.map(function(x){return '<form class="fw-admin-row" data-id="'+esc(x.id)+'" style="display:grid;grid-template-columns:minmax(150px,1fr) minmax(115px,160px) auto auto auto;gap:8px;align-items:center;border:1.5px solid #F9E5ED;border-radius:14px;padding:10px 12px;margin:0 0 8px;background:#fff;">'+
        '<input name="name" required maxlength="100" value="'+esc(x.name)+'" aria-label="食物名称">'+
        '<select name="category" aria-label="分类">'+catOptions(x.category)+'</select>'+
        '<label style="white-space:nowrap;color:var(--muted);"><input type="checkbox" name="enabled"'+(x.enabled?' checked':'')+'> 启用</label>'+
        '<button class="btn-mini" type="submit">保存</button><button class="btn-mini" type="button" data-delete="1" style="color:#C4636E;">删除</button></form>';}).join('');
      list.querySelectorAll('.fw-admin-row').forEach(function(form){
        form.addEventListener('submit',function(e){e.preventDefault();var body={name:form.elements.name.value.trim(),category:form.elements.category.value,enabled:form.elements.enabled.checked};api('PATCH','id=eq.'+encodeURIComponent(form.dataset.id),body).then(function(){toast('已保存');loadList();}).catch(function(err){toast('保存失败：'+err.message);});});
        form.elements.enabled.addEventListener('change',function(){api('PATCH','id=eq.'+encodeURIComponent(form.dataset.id),{enabled:form.elements.enabled.checked}).then(loadList).catch(function(err){toast('状态更新失败：'+err.message);});});
        form.querySelector('[data-delete]').addEventListener('click',function(){if(!window.confirm('确定删除这个食物选项吗？'))return;api('DELETE','id=eq.'+encodeURIComponent(form.dataset.id)).then(function(){loadList();toast('已删除');}).catch(function(err){toast('删除失败：'+err.message);});});
      });
    }).catch(function(err){list.innerHTML='<p class="empty">无法读取选项。请确认管理员会话和数据库迁移状态。</p>';console.error('[food-wheel-admin]',err);});
  }
  window.AdminFoodWheel={boot:boot};
})();
