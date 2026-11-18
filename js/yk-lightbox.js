/* ═══════════════════════════════════════════════════════════════════
   YK Lightbox · 站内统一「看图」灯箱（她 20261117）
   · 外观沿用照片展示页那套 .lightbox（浅粉底 / 圆角大图 / 下载原图 + 关闭）
   · 多图：左右翻页（电脑箭头 + 键盘 ← →，手机左右滑动）
   · 双指缩放看细节（1~4 倍）；放大后单指拖动平移、双击复位/放大
   · 用法：YK_LB.open(urls, index, { download: '下载原图', close: '关闭', hint: '双指放大' })
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.YK_LB) return;

  var MAXS = 4;          // 最大放大倍数
  var CUR = [];          // 当前图列表
  var I = 0;             // 当前下标
  var S = 1, TX = 0, TY = 0;   // 缩放 / 平移
  var EL = null;

  function build() {
    if (EL) return EL;
    var box = document.createElement('div');
    box.className = 'lightbox yk-lb';
    box.id = 'yk-lightbox';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.innerHTML =
      '<button type="button" class="yk-lb-nav yk-lb-prev" aria-label="Previous">‹</button>' +
      '<div class="yk-lb-stage" id="yk-lb-stage"><img id="yk-lb-img" alt=""></div>' +
      '<div class="lightbox-bar">' +
        '<a class="lightbox-btn" id="yk-lb-download" download="photo.jpg">Download</a>' +
        '<button type="button" class="lightbox-btn" id="yk-lb-close">Close</button>' +
        '<span class="yk-lb-count" id="yk-lb-count"></span>' +
        '<span class="yk-lb-hint" id="yk-lb-hint"></span>' +
      '</div>' +
      '<button type="button" class="yk-lb-nav yk-lb-next" aria-label="Next">›</button>';
    document.body.appendChild(box);
    EL = box;

    box.addEventListener('click', function (e) {
      if (e.target.closest('.yk-lb-prev')) { go(I - 1); return; }
      if (e.target.closest('.yk-lb-next')) { go(I + 1); return; }
      if (e.target.closest('#yk-lb-close')) { close(); return; }
      if (e.target.closest('.lightbox-bar')) return;      // 底栏上的点击不关
      if (e.target.closest('#yk-lb-img') && S > 1.01) return; // 放大状态下点图不关（在拖动）
      close();
    });

    document.addEventListener('keydown', function (e) {
      if (!isOpen()) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft' && S <= 1.01) go(I - 1);
      else if (e.key === 'ArrowRight' && S <= 1.01) go(I + 1);
      else if (e.key === '0') zoomTo(1);
    });

    bindTouch();
    bindWheel();
    return EL;
  }

  function isOpen() { return !!EL && EL.classList.contains('open'); }
  var stage = function () { return document.getElementById('yk-lb-stage'); };
  var imgEl = function () { return document.getElementById('yk-lb-img'); };

  function apply() {
    var img = imgEl();
    if (!img) return;
    img.style.transform = S === 1 && !TX && !TY ? '' : 'translate(' + TX + 'px,' + TY + 'px) scale(' + S + ')';
    var st = stage();
    if (st) st.classList.toggle('zoomed', S > 1.01);
  }

  function clampPan() {
    var st = stage();
    if (!st) return;
    var w = st.clientWidth, h = st.clientHeight;
    var mx = Math.max(0, (S - 1) * w / 2), my = Math.max(0, (S - 1) * h / 2);
    TX = Math.min(mx, Math.max(-mx, TX));
    TY = Math.min(my, Math.max(-my, TY));
  }

  function zoomTo(ns, focusX, focusY) {
    var st = stage(), img = imgEl();
    if (!st || !img) return;
    ns = Math.min(MAXS, Math.max(1, ns));
    var r = st.getBoundingClientRect();
    var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (focusX == null) { focusX = cx; focusY = cy; }
    var mp = [focusX - cx, focusY - cy];
    var q = [(mp[0] - TX) / S, (mp[1] - TY) / S];
    S = ns;
    TX = mp[0] - q[0] * S;
    TY = mp[1] - q[1] * S;
    if (S <= 1.01) { S = 1; TX = 0; TY = 0; }
    clampPan();
    apply();
  }

  function show(i) {
    if (!CUR.length) return;
    I = ((i % CUR.length) + CUR.length) % CUR.length;
    var img = imgEl();
    img.src = CUR[I];
    img.alt = (img.getAttribute('data-alt') || '') + ' ' + (I + 1);
    S = 1; TX = 0; TY = 0; apply();
    var dl = document.getElementById('yk-lb-download');
    dl.href = CUR[I];
    dl.setAttribute('download', String(CUR[I]).split('/').pop().split('?')[0] || 'photo.jpg');
    var one = CUR.length < 2;
    var prev = EL.querySelector('.yk-lb-prev'), next = EL.querySelector('.yk-lb-next');
    prev.style.display = one ? 'none' : '';
    next.style.display = one ? 'none' : '';
    document.getElementById('yk-lb-count').textContent = one ? '' : (I + 1) + ' / ' + CUR.length;
  }

  function go(i) { show(i); }

  function open(urls, index, labels) {
    build();
    CUR = (urls || []).filter(Boolean);
    if (!CUR.length) return false;
    labels = labels || {};
    document.getElementById('yk-lb-download').textContent = labels.download || 'Download';
    document.getElementById('yk-lb-close').textContent = labels.close || 'Close';
    document.getElementById('yk-lb-hint').textContent = labels.hint || '';
    imgEl().setAttribute('data-alt', labels.alt || '');
    show(index || 0);
    EL.classList.add('open');
    document.body.style.overflow = 'hidden';
    return true;
  }

  function close() {
    if (!EL) return;
    EL.classList.remove('open');
    document.body.style.overflow = '';
    S = 1; TX = 0; TY = 0; apply();
  }

  /* ── 触摸：单指滑动翻页 / 放大后拖动；双指缩放；双击放大复位 ── */
  function bindTouch() {
    var t0 = null, pinch = null, lastTap = 0, moved = false;

    EL.addEventListener('touchstart', function (e) {
      if (e.touches.length === 2) {
        var a = e.touches[0], b = e.touches[1];
        pinch = {
          d0: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1,
          s0: S, tx0: TX, ty0: TY,
          mx: (a.clientX + b.clientX) / 2, my: (a.clientY + b.clientY) / 2
        };
        moved = true;
      } else if (e.touches.length === 1) {
        var t = e.touches[0];
        t0 = { x: t.clientX, y: t.clientY, tx: TX, ty: TY };
        moved = false;
      }
    }, { passive: true });

    EL.addEventListener('touchmove', function (e) {
      if (pinch && e.touches.length === 2) {
        var a = e.touches[0], b = e.touches[1];
        var d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1;
        var st = stage();
        var r = st.getBoundingClientRect();
        var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        var mx = (a.clientX + b.clientX) / 2, my = (a.clientY + b.clientY) / 2;
        var ns = Math.min(MAXS, Math.max(1, pinch.s0 * (d / pinch.d0)));
        // 以双指中点为锚点缩放，同时跟着手指平移
        var q = [(pinch.mx - cx - pinch.tx0) / pinch.s0, (pinch.my - cy - pinch.ty0) / pinch.s0];
        S = ns;
        TX = (mx - cx) - q[0] * S;
        TY = (my - cy) - q[1] * S;
        if (S <= 1.01) { S = 1; TX = 0; TY = 0; }
        clampPan();
        apply();
        if (e.cancelable) e.preventDefault();
        return;
      }
      if (t0 && e.touches.length === 1 && S > 1.01) {
        var t = e.touches[0];
        TX = t0.tx + (t.clientX - t0.x);
        TY = t0.ty + (t.clientY - t0.y);
        clampPan();
        apply();
        if (e.cancelable) e.preventDefault();
        moved = true;
      }
    }, { passive: false });

    EL.addEventListener('touchend', function (e) {
      if (pinch) {
        if (S <= 1.05) { S = 1; TX = 0; TY = 0; apply(); }
        if (e.touches.length === 0) pinch = null;
        return;
      }
      if (!t0) return;
      var t = (e.changedTouches && e.changedTouches[0]) || null;
      var dx = t ? t.clientX - t0.x : 0, dy = t ? t.clientY - t0.y : 0;
      var wasSingle = S <= 1.01;
      var isTap = !moved && Math.abs(dx) < 10 && Math.abs(dy) < 10;
      t0 = null;
      if (isTap) {
        // 双击：放大到 2.5 倍 / 复位（放大状态下也能双击还原）
        var now = Date.now();
        if (now - lastTap < 300 && t) {
          lastTap = 0;
          if (S > 1.01) zoomTo(1); else zoomTo(2.5, t.clientX, t.clientY);
          return;
        }
        lastTap = now;
        return;
      }
      if (wasSingle && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) go(I + (dx < 0 ? 1 : -1));
    }, { passive: true });
  }

  /* ── 桌面滚轮缩放（灯箱里才生效，不影响页面滚动） ── */
  function bindWheel() {
    EL.addEventListener('wheel', function (e) {
      if (!isOpen()) return;
      e.preventDefault();
      zoomTo(S * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX, e.clientY);
    }, { passive: false });
  }

  window.YK_LB = { open: open, close: close, isOpen: isOpen, zoomTo: zoomTo };
})();
