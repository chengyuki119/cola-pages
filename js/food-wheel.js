(function () {
  'use strict';
  var canvas = document.getElementById('food-wheel-canvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var lang = (window.YK && window.YK.lang) || 'en';
  var t = function (zh, en) { return lang === 'zh' ? zh : en; };
  var options = [], rotation = 0, spinning = false, raf = 0;
  var colors = ['#F6C5D7','#FBE4EC','#F8D4E1','#FCECF2','#EFC2D4','#FFF2F6','#F4D5E1','#F9E5ED'];
  var base = window.DB_BASE || 'https://ukxrvcptwhlwvdanovgd.supabase.co/rest/v1/';
  var headers = window.DB_HEADERS || {};
  var spinButton = document.getElementById('food-wheel-spin');
  var status = document.getElementById('food-wheel-status');
  var result = document.getElementById('food-wheel-result');
  var resultName = document.getElementById('food-wheel-result-name');
  var legend = document.getElementById('food-wheel-legend');
  var categoryLabels = {
    chinese: ['中餐','Chinese'], japanese: ['日料','Japanese'], korean: ['韩餐','Korean'],
    american: ['美式','American'], fast_food: ['快餐','Fast Food'], dessert: ['甜品','Dessert'],
    drink: ['饮料','Drinks'], other: ['其他','Other']
  };
  function normalize(a) { var tau = Math.PI * 2; return ((a % tau) + tau) % tau; }
  function draw() {
    var w = canvas.width, cx = w / 2, cy = w / 2, radius = w * .46;
    ctx.clearRect(0, 0, w, w);
    if (!options.length) {
      ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
      ctx.lineWidth = 5; ctx.strokeStyle = '#f6c5d7'; ctx.stroke();
      ctx.fillStyle = '#b98598'; ctx.font = '600 26px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(t('先添加食物选项','Add food options first'), cx, cy, w * .72); return;
    }
    var step = Math.PI * 2 / options.length;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(rotation);
    options.forEach(function (item, i) {
      var start = -Math.PI / 2 + i * step, end = start + step, mid = start + step / 2;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, radius, start, end); ctx.closePath();
      ctx.fillStyle = colors[i % colors.length]; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
      ctx.save(); ctx.rotate(mid); ctx.translate(0, -radius * .68); ctx.rotate(Math.PI / 2);
      var maxWidth = Math.max(30, radius * step * .73), fontSize = Math.max(12, Math.min(22, 22 * Math.min(1, maxWidth / Math.max(1, ctx.measureText(item.name).width))));
      ctx.font = '600 ' + fontSize + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#65515D';
      var text = item.name;
      while (ctx.measureText(text).width > maxWidth && text.length > 2) text = text.slice(0, -1);
      if (text !== item.name) text = text.slice(0, -1) + '…';
      ctx.fillText(text, 0, 0, maxWidth); ctx.restore();
    });
    ctx.restore();
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.lineWidth = 5; ctx.strokeStyle = '#f6c5d7'; ctx.stroke();
  }
  function paintLegend() {
    legend.innerHTML = options.map(function (x) {
      var c = categoryLabels[x.category] || categoryLabels.other;
      return '<span class="fw-chip">' + esc(x.name) + '<small>' + esc(c[lang === 'zh' ? 0 : 1]) + '</small></span>';
    }).join('');
  }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]); }); }
  function load() {
    status.textContent = t('正在加载可选项目…','Loading food options…');
    fetch(base + 'food_wheel_options?select=id,name,category&enabled=eq.true&order=sort_order.asc,name.asc', { headers: headers })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (rows) {
        options = Array.isArray(rows) ? rows : []; paintLegend(); draw();
        status.textContent = options.length ? '' : t('还没有可抽选的食物，请管理员先添加选项。','There are no active options yet. Please ask an administrator to add some.');
        spinButton.disabled = !options.length;
      })
      .catch(function () {
        options = []; paintLegend(); draw(); spinButton.disabled = true;
        status.textContent = t('选项加载失败，请稍后重试。','Could not load options. Please try again later.');
      });
  }
  function randomIndex(length) {
    if (window.crypto && window.crypto.getRandomValues) {
      var a = new Uint32Array(1); window.crypto.getRandomValues(a);
      return Math.floor((a[0] / 4294967296) * length);
    }
    return Math.floor(Math.random() * length);
  }
  function spin() {
    if (spinning || !options.length) return;
    var pickIndex = randomIndex(options.length), pick = options[pickIndex];
    var step = Math.PI * 2 / options.length;
    var targetMod = normalize(-((pickIndex + .5) * step));
    var diff = normalize(targetMod - normalize(rotation));
    var from = rotation, to = rotation + Math.PI * 2 * (6 + randomIndex(3)) + diff;
    var start = performance.now(), duration = 5200;
    spinning = true; spinButton.disabled = true;
    spinButton.textContent = t('旋转中…','Spinning…'); result.hidden = true; resultName.textContent = '';
    status.textContent = '';
    function frame(now) {
      var p = Math.min(1, (now - start) / duration), ease = 1 - Math.pow(1 - p, 4);
      rotation = from + (to - from) * ease; draw();
      if (p < 1) { raf = requestAnimationFrame(frame); return; }
      rotation = to; draw(); spinning = false; spinButton.disabled = false;
      spinButton.textContent = t('再抽一次','Spin Again');
      resultName.textContent = pick.name; result.hidden = false;
    }
    raf = requestAnimationFrame(frame);
  }
  spinButton.addEventListener('click', spin);
  window.addEventListener('resize', draw);
  load();
})();
