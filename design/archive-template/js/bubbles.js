/* =====================================================================
   bubbles.js — мыльные пузыри на фоне сцены (груминг-студия).
   Медленно всплывают позади собачки и лопаются, если поднести к ним
   курсор. При «уменьшении движения» в системе пузырей нет.
   ===================================================================== */
(function () {
  'use strict';

  var stage = document.getElementById('stage');
  if (!stage) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var NS = 'http://www.w3.org/2000/svg';
  var COUNT = 9;

  var svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:0';
  stage.insertBefore(svg, stage.firstChild);

  var W = 1, H = 1, rect = { left: 0, top: 0 };
  function layout() {
    var r = stage.getBoundingClientRect();
    rect = { left: r.left, top: r.top };
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    svg.setAttribute('viewBox', '0 0 ' + W.toFixed(1) + ' ' + H.toFixed(1));
  }
  layout();
  if (window.ResizeObserver) new ResizeObserver(layout).observe(stage);
  else window.addEventListener('resize', layout);

  function el(tag, parent, attrs) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    parent.appendChild(e);
    return e;
  }

  // пузырь = прозрачный круг с белой каймой и бликом; лопнувший — короткая вспышка из капель
  function makeBubble(first) {
    var g = el('g', svg, {});
    var b = {
      g: g,
      body: el('circle', g, { fill: 'rgba(255,255,255,0.16)', stroke: 'rgba(255,255,255,0.8)', 'stroke-width': 1.5 }),
      shine: el('path', g, { fill: 'none', stroke: 'rgba(255,255,255,0.9)', 'stroke-width': 2, 'stroke-linecap': 'round' }),
      drops: [0, 1, 2, 3, 4].map(function () { return el('circle', g, { fill: 'rgba(255,255,255,0.85)', r: 0 }); })
    };
    reset(b, first);
    return b;
  }

  function reset(b, first) {
    b.r = 7 + Math.random() * 16;
    b.x = W * (0.06 + Math.random() * 0.88);
    b.y = first ? H * (0.3 + Math.random() * 0.75) : H + b.r + Math.random() * H * 0.3;
    b.vy = 10 + Math.random() * 16;
    b.ph = Math.random() * 6.28;
    b.popT = -1;
  }

  var bubbles = [];
  for (var i = 0; i < COUNT; i++) bubbles.push(makeBubble(true));

  var pointer = { x: -999, y: -999 };
  window.addEventListener('pointermove', function (e) {
    pointer.x = e.clientX - rect.left; pointer.y = e.clientY - rect.top;
  }, { passive: true });
  window.addEventListener('scroll', function () { var r = stage.getBoundingClientRect(); rect.left = r.left; rect.top = r.top; }, { passive: true });

  // Сцена ушла с экрана (телефон, прокрутка) — пузыри не считаем.
  var running = true, raf = 0;
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      var visible = entries[entries.length - 1].isIntersecting;
      if (visible && !running) { running = true; last = performance.now(); raf = requestAnimationFrame(frame); }
      else if (!visible && running) { running = false; cancelAnimationFrame(raf); }
    }, { threshold: 0 }).observe(stage);
  }

  var last = performance.now();
  function frame(now) {
    if (!running) return;
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    bubbles.forEach(function (b) {
      if (b.popT >= 0) {                                    // лопается: капли разлетаются и гаснут
        b.popT += dt;
        var q = b.popT / 0.35;
        b.body.setAttribute('r', 0);
        b.shine.setAttribute('d', '');
        b.drops.forEach(function (d, k) {
          var a = k / b.drops.length * 6.28 + b.ph;
          d.setAttribute('cx', (b.x + Math.cos(a) * b.r * (1 + q * 1.2)).toFixed(1));
          d.setAttribute('cy', (b.y + Math.sin(a) * b.r * (1 + q * 1.2)).toFixed(1));
          d.setAttribute('r', Math.max(0, 2 * (1 - q)).toFixed(2));
        });
        if (q >= 1) { b.drops.forEach(function (d) { d.setAttribute('r', 0); }); reset(b, false); }
        return;
      }
      b.ph += dt;
      b.y -= b.vy * dt;
      b.x += Math.sin(b.ph * 1.3) * 8 * dt;
      // наверху (у названия) пузыри тают, а не налезают на текст
      var fade = Math.min(1, Math.max(0, (b.y - H * 0.38) / (H * 0.12)));
      if (b.y < H * 0.36) reset(b, false);
      var dx = b.x - pointer.x, dy = b.y - pointer.y;
      if (dx * dx + dy * dy < (b.r + 10) * (b.r + 10)) { b.popT = 0; return; }
      var wob = 1 + Math.sin(b.ph * 3) * 0.04;
      b.body.setAttribute('cx', b.x.toFixed(1)); b.body.setAttribute('cy', b.y.toFixed(1));
      b.body.setAttribute('r', (b.r * wob).toFixed(1));
      var sr = b.r * 0.62, sx = b.x - b.r * 0.12, sy = b.y - b.r * 0.12;
      b.shine.setAttribute('d', 'M' + (sx - sr * 0.7).toFixed(1) + ',' + (sy - sr * 0.1).toFixed(1) +
        'A' + sr.toFixed(1) + ',' + sr.toFixed(1) + ' 0 0 1 ' + (sx - sr * 0.05).toFixed(1) + ',' + (sy - sr * 0.72).toFixed(1));
      b.g.setAttribute('opacity', fade.toFixed(2));
    });
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
})();
