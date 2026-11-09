/* «Собачье дело»: всё, что происходит на странице вокруг собачек.
   Обычный скрипт: работает и с диска (file://), и на любом хостинге.

   НАСТРОЙКИ ОТПРАВКИ ЗАЯВКИ
   endpoint: адрес обработчика (POST, FormData). Подойдёт свой сервер или сервис форм
             (Formspree, Getform, Basin). Пустая строка = демо: заявка никуда не уходит,
             через demoDelayMs показывается «Ура, заявка у нас!». */
var CONFIG = { endpoint: '', timeoutMs: 15000, demoDelayMs: 900 };

(function () {
  'use strict';
  var q = new URLSearchParams(location.search);
  var reduced = q.has('reduced') || !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var manual = q.has('paused');                       // для записи роликов: время идёт только через __site.step(ms)
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /* ---------- часы страницы: все таймеры сцен идут от одного шага ---------- */
  var clock = { t: 0, tasks: [] }, tickers = [];
  function after(sec, fn, tag) { clock.tasks.push({ at: clock.t + sec, fn: fn, tag: tag }); }
  function cancel(tag) { clock.tasks = clock.tasks.filter(function (x) { return x.tag !== tag; }); }
  function tick(dt) {
    clock.t += dt;
    var due = clock.tasks.filter(function (x) { return x.at <= clock.t; });
    if (due.length) { clock.tasks = clock.tasks.filter(function (x) { return x.at > clock.t; }); due.forEach(function (x) { x.fn(); }); }
    tickers.forEach(function (f) { f(dt); });
  }

  /* ---------- собачки ---------- */
  var dogs = [];
  function makeDog(stage, o) {
    if (!window.PuppyDog || !PuppyDog.create) return null;
    try {
      o.stage = stage; o.reducedMotion = reduced; o.startPaused = manual;
      var api = PuppyDog.create(o), d = { api: api, el: stage, visible: true, onShow: o.onShow, onHide: o.onHide };
      dogs.push(d); stage.__dog = d;
      return d;
    } catch (e) { if (window.console) console.error(e); return null; }
  }
  var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      var d = e.target.__dog; if (!d) return;
      var was = d.visible; d.visible = e.isIntersecting;
      if (d.visible === was && d.seen) return;
      d.seen = true;
      if (!manual) { if (d.visible) d.api.debug.resume(); else d.api.debug.pause(); }
      if (d.visible && d.onShow) d.onShow(); else if (!d.visible && d.onHide) d.onHide();
    });
  }, { rootMargin: '60px 0px' }) : null;
  function watch(d) { if (d && io) io.observe(d.el); else if (d && d.onShow) d.onShow(); }

  /* реплика над головой собаки */
  function say(bubble, d, text, sec, tag) {
    if (!bubble || !d) return;
    if (text) bubble.textContent = text;
    placeBubble(bubble, d);
    bubble.classList.add('is-on');
    cancel(tag + '-say');
    if (sec) after(sec, function () { bubble.classList.remove('is-on'); }, tag + '-say');
  }
  function placeBubble(bubble, d) {
    var m = d.api.metrics(), w = bubble.offsetWidth, h = bubble.offsetHeight;
    var x = m.head.x + 0.22 * m.hpx, y = m.head.y - 0.4 * m.hpx - h, left = x + w > m.W - 12;
    if (left) x = m.head.x - 0.22 * m.hpx - w;                       // не помещается справа: ставим слева
    bubble.classList.toggle('is-left', left);
    if (bubble.avoid) { var r = bubble.avoid(); if (x < r.right && x + w > r.left && y < r.bottom) y = r.bottom; }   // не на кнопках
    bubble.style.setProperty('--bx', Math.round(clamp(x, 8, m.W - w - 8)) + 'px');
    bubble.style.setProperty('--by', Math.round(Math.max(8, y)) + 'px');
  }

  /* =====================================================================
     1. Обложка: огромное название внизу, собачка сидит прямо на буквах
     ===================================================================== */
  var hero = $('#heroStage'), title = $('#heroTitle'), probe = $('#titleProbe'), lines = $$('.line', title);
  var hint = $('#petHint'), heroBubble = $('#heroBubble'), intro = $('.hero__intro', hero), nav = $('.nav', hero);
  var letters = [];
  lines.forEach(function (line, li) {
    var txt = line.firstChild.nodeValue; line.firstChild.nodeValue = '';
    txt.split('').forEach(function (c) {
      var s = document.createElement('span'); s.className = 'ch'; s.textContent = c;
      s.style.setProperty('--i', letters.length);
      line.insertBefore(s, probe && probe.parentNode === line ? probe : null);
      letters.push({ el: s, line: li, y: 0, v: 0, r: 0, rv: 0, cx: 0, w: 1, kicked: -9, live: false });
    });
  });
  var capK = 0.72;                                                // высота заглавной буквы в долях кегля, уточняется по шрифту
  function measureCap() {
    try {
      var c = document.createElement('canvas').getContext('2d'); c.font = '100px "Dela Gothic One"';
      var m = c.measureText('ЕДНЛ'); if (m.actualBoundingBoxAscent > 30) capK = m.actualBoundingBoxAscent / 100;
    } catch (e) { /* старый браузер: остаётся 0.72 */ }
  }
  var fs = 100, heroGeom = null;
  function layoutHero() {
    var W = hero.clientWidth, H = hero.clientHeight;
    var pad = parseFloat(getComputedStyle(nav).paddingLeft) || 24;
    var one = W >= 900 && W / H > 1.15;                           // широкий экран: название в одну строку
    title.classList.toggle('one', one);
    title.style.setProperty('--title-size', '100px');
    var wText = one ? lines[0].offsetWidth + lines[1].offsetWidth + 24 : lines[0].offsetWidth;
    fs = (W - 2 * pad) * 100 / wText;
    if (!one) fs = Math.min(fs, H * 0.16);
    var bottom = Math.max(14, H * (one ? 0.04 : 0.025));
    title.style.setProperty('--title-size', fs.toFixed(2) + 'px');
    title.style.setProperty('--title-bottom', bottom.toFixed(1) + 'px');
    var hr = hero.getBoundingClientRect(), baseline = probe.getBoundingClientRect().top - hr.top;
    var floor = baseline - capK * fs;                             // верхний край букв = пол для собаки
    var introBottom = intro.offsetTop + intro.offsetHeight, hpx, home;
    if (one) {
      hpx = Math.min(H * 0.52, floor - nav.offsetHeight - 6, W * 0.34);
      home = W * 0.73;
    } else {
      hpx = Math.min(floor - introBottom - clamp(H * 0.08, 56, 80), H * 0.46, W * 0.8);   // над головой остаётся просвет для подсказки и реплик
      home = W * (W < 560 ? 0.5 : 0.66);
    }
    hpx = Math.max(hpx, 120);
    letters.forEach(function (L) { var r = L.el.getBoundingClientRect(); L.cx = r.left - hr.left + r.width / 2; L.w = r.width; });
    // собака садится на середину ближайшей буквы верхней строки, а не в щель между буквами
    var best = null;
    letters.forEach(function (L) { if (L.line === 0 || one) { if (!best || Math.abs(L.cx - home) < Math.abs(best.cx - home)) best = L; } });
    if (best) home = best.cx;
    hero.style.setProperty('--spot-x', (home / W * 100).toFixed(1) + '%');
    heroGeom = { W: W, H: H, floor: floor, hpx: hpx, home: home, one: one, introBottom: introBottom };
    if (heroDog) heroDog.api.place(home, floor, hpx, { peek: floor - 0.12 * hpx, peekDx: Math.min(W * 0.2, hpx * 0.75), apex: 0.3 });
    if (hint.classList.contains('is-on')) placeHint();
  }
  // подсказка «погладь меня»: ищем свободное место у головы, не залезая на текст и кнопки;
  // стрелка всегда рисуется от подписи к голове
  var hintArrow = $('#hintArrow'), arrowLine = $('.hint-arrow__line', hintArrow), arrowHead = $('.hint-arrow__head', hintArrow);
  function showHint(on) { hint.classList.toggle('is-on', on); hintArrow.classList.toggle('is-on', on); }
  function placeHint() {
    if (!heroDog || !heroGeom) return;
    var g = heroGeom, m = heroDog.api.metrics(), hp = g.hpx, hx = m.head.x, hy = m.head.y, W = g.W;
    var ir = intro.getBoundingClientRect(), hr = hero.getBoundingClientRect();
    var iL = ir.left - hr.left, iR = ir.right - hr.left, iB = ir.bottom - hr.top + 10;
    var w = hint.offsetWidth, h = hint.offsetHeight, earR = 0.5 * hp, gap = Math.min(70, hp * 0.2), x, y, s, e, side;
    var roomL = hx - earR - gap - 12, roomR = W - 12 - (hx + earR + gap);
    if (Math.max(roomL, roomR) >= w) {                            // рядом с головой, со стороны, где просторнее
      side = roomL >= roomR ? -1 : 1;
      x = side < 0 ? hx - earR - gap - w : hx + earR + gap;
      y = hy - 0.12 * hp - h / 2;
      if (x < iR && x + w > iL && y < iB) y = iB;                 // не наезжаем на текст и кнопки
      s = [side < 0 ? x + w + 8 : x - 8, y + h * 0.6];
      e = [hx + side * 0.4 * hp, hy - 0.06 * hp];
      hint.style.setProperty('--hr', side < 0 ? '-5deg' : '5deg');
    } else {                                                      // тесно (телефон): в просвете между кнопками и головой
      x = clamp(hx - 0.28 * hp - w, 12, W - w - 12);
      y = Math.max(iB - 4, hy - 1.02 * hp - h);
      s = [x + w + 8, y + h * 0.62];
      e = [hx - 0.16 * hp, hy - 0.33 * hp];
      if (e[0] - s[0] < 18) { s = [x + w * 0.62, y + h + 6]; e = [hx - 0.24 * hp, hy - 0.3 * hp]; }   // голова прямо под подписью: стрелка вниз
      hint.style.setProperty('--hr', '-4deg');
    }
    hint.style.setProperty('--hx', Math.round(x) + 'px');
    hint.style.setProperty('--hy', Math.round(y) + 'px');
    drawArrow(s, e);
  }
  function drawArrow(s, e) {
    var dx = e[0] - s[0], dy = e[1] - s[1], len = Math.hypot(dx, dy) || 1;
    var bend = (dx >= 0 ? -1 : 1) * Math.min(40, len * 0.35);      // дуга, как от руки
    var cx = (s[0] + e[0]) / 2 - dy / len * bend, cy = (s[1] + e[1]) / 2 + dx / len * bend;
    arrowLine.setAttribute('d', 'M' + s[0].toFixed(1) + ',' + s[1].toFixed(1) + ' Q' + cx.toFixed(1) + ',' + cy.toFixed(1) + ' ' + e[0].toFixed(1) + ',' + e[1].toFixed(1));
    var ang = Math.atan2(e[1] - cy, e[0] - cx), k = 13, a1 = ang + 2.6, a2 = ang - 2.6;
    arrowHead.setAttribute('d', 'M' + (e[0] + Math.cos(a1) * k).toFixed(1) + ',' + (e[1] + Math.sin(a1) * k).toFixed(1) + ' L' + e[0].toFixed(1) + ',' + e[1].toFixed(1) + ' L' + (e[0] + Math.cos(a2) * k).toFixed(1) + ',' + (e[1] + Math.sin(a2) * k).toFixed(1));
    var L = 0; try { L = arrowLine.getTotalLength(); } catch (err) { L = len * 1.2; }
    hintArrow.style.setProperty('--len', Math.ceil(L + 2));
  }

  // буквы на пружинках: проминаются под собакой, подпрыгивают от её прыжков и бега и от курсора
  var lettersLive = false;
  function kick(L, v, r) { L.v += v; L.rv += r || 0; L.live = true; lettersLive = true; }
  tickers.push(function (dt) {
    if (!lettersLive || reduced) return;
    var any = false, n = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / n;
    letters.forEach(function (L) {
      if (!L.live) return;
      for (var i = 0; i < n; i++) {
        L.v += (-300 * L.y - 2 * 0.32 * 17.3 * L.v) * h; L.y += L.v * h;
        L.rv += (-220 * L.r - 2 * 0.35 * 15 * L.rv) * h; L.r += L.rv * h;
      }
      var sq = L.y > 0 ? clamp(L.y / fs, 0, 0.18) : 0;           // ниже места: сплющилась
      var st = L.y < 0 ? clamp(-L.v / fs * 0.015, 0, 0.07) : 0;  // летит вверх: вытянулась
      L.el.style.transform = 'translateY(' + L.y.toFixed(2) + 'px) rotate(' + L.r.toFixed(2) + 'deg) scale(' + (1 + sq * 0.5 - st * 0.4).toFixed(3) + ',' + (1 - sq * 1.1 + st).toFixed(3) + ')';
      if (Math.abs(L.y) < 0.05 && Math.abs(L.v) < 0.5 && Math.abs(L.r) < 0.02 && Math.abs(L.rv) < 0.5) { L.live = false; L.y = L.v = L.r = L.rv = 0; L.el.style.transform = ''; }
      else any = true;
    });
    lettersLive = any;
  });
  function onTop(L) { return heroGeom && (heroGeom.one || L.line === 0); }
  function landing(x, power) {
    letters.forEach(function (L) {
      var d = (L.cx - x) / (heroGeom ? heroGeom.hpx : 300);
      if (onTop(L) && Math.abs(L.cx - x) < 0.3 * heroGeom.hpx) kick(L, fs * 1.1 * power, 0);   // под лапами: промялась
      else { var k = Math.exp(-d * d * 1.2) * (onTop(L) ? 1 : 0.5); if (k > 0.04) kick(L, -fs * 1.9 * power * k, (d > 0 ? 1 : -1) * 40 * power * k); }
    });
  }
  letters.forEach(function (L) {
    L.el.addEventListener('pointerenter', function () { if (!reduced) kick(L, -fs * 1.1, (Math.random() - 0.5) * 40); });
  });

  var heroDog = null, heroIntroDone = false, petted = false, saidPet = false;
  heroBubble.avoid = function () {
    var ir = intro.getBoundingClientRect(), hr = hero.getBoundingClientRect();
    return { left: ir.left - hr.left, right: ir.right - hr.left, bottom: ir.bottom - hr.top + 6 };
  };
  var TRICKS = ['shake', 'zoomies', 'hop', 'scratch'], lastTrick = '';
  function makeHeroDog() {
    var g = heroGeom;
    heroDog = makeDog(hero, {
      seed: 7, randomBehaviors: true, shadow: '#141a6b',
      place: { x: g.home, y: g.floor, h: g.hpx, peek: g.floor - 0.12 * g.hpx, peekDx: Math.min(g.W * 0.2, g.hpx * 0.75), apex: 0.3 },
      on: function (name, data) {
        if (name === 'land') {
          landing(data.x, clamp(Math.abs(data.v) / 9, 0.4, 1.1));
          if (!heroIntroDone) {
            heroIntroDone = true;
            after(0.6, function () { say(heroBubble, heroDog, 'Гав! Привет!', 2.2, 'hero'); });
            after(3.2, function () { if (!petted && !heroDog.api.busy()) { placeHint(); showHint(true); } }, 'hint');
          }
        }
        if (name === 'pet') { petted = true; cancel('hint'); showHint(false); if (!saidPet) { saidPet = true; say(heroBubble, heroDog, 'Ещё-ё…', 1.8, 'hero'); } }
        if (name === 'behaviour' && data.name !== 'entrance') showHint(false);
      }
    });
    if (!heroDog) return;
    watch(heroDog);
    hero.addEventListener('pointermove', function (e) { hero.classList.toggle('stage-cursor', !!heroDog.api.hit(e.clientX, e.clientY) && !e.target.closest('a,button')); });
    hero.addEventListener('click', function (e) {
      var part = e.target.closest('a,button') ? '' : heroDog.api.hit(e.clientX, e.clientY);
      if (!part || heroDog.api.busy()) return;
      // на сенсорном экране навести курсор нельзя: касание головы гладит, касание туловища — трюк
      var touch = e.pointerType === 'touch' || (!e.pointerType && window.matchMedia && matchMedia('(hover: none)').matches);
      if (touch && part === 'head') { heroDog.api.pet(1.4); return; }
      var pick = TRICKS.filter(function (x) { return x !== lastTrick; })[Math.floor(Math.random() * 3)];
      lastTrick = pick; heroDog.api.play(pick);
      if (pick === 'hop') say(heroBubble, heroDog, 'Ура!', 1.4, 'hero');
    });
  }
  // собака прячется за буквами, пока выглядывает; бег по буквам: они проминаются под лапами, как клавиши
  tickers.push(function () {
    if (!heroDog || !heroDog.visible || !heroGeom) return;
    var st = heroDog.api.debug.state(), m = heroDog.api.metrics();
    var behind = /^entrance:[012]$/.test(st) || (st === 'entrance:3' && m.y > heroGeom.floor + 2);
    title.classList.toggle('front', behind);
    if (reduced || st.indexOf('zoomies') !== 0) return;
    letters.forEach(function (L) {
      if (!onTop(L) || clock.t - L.kicked < 0.35) return;
      if (Math.abs(L.cx - m.x) < L.w * 0.4) { L.kicked = clock.t; kick(L, fs * 0.5, (Math.random() - 0.5) * 20); }
    });
  });
  // появление букв
  function heroIntro() {
    title.classList.add('is-in');
    if (reduced) return;
    letters.forEach(function (L, i) {
      L.el.style.transform = 'translateY(' + (fs * 0.4).toFixed(1) + 'px)';
      after(0.1 + i * 0.045, function () { L.y = fs * 0.4; L.v = -fs * 2.2; L.live = true; lettersLive = true; });
    });
  }

  /* =====================================================================
     2. Страница комикса: в каждом кадре своя собачка играет свою сценку
     ===================================================================== */
  var SCENES = {
    meet: { dog: { fluff: 1, seed: 11 }, home: 0.68, start: function (f) { f.say('А ты кто?', 2.4); f.dog.api.play('tilt'); }, loop: function (f, n) { if (n % 2) { f.dog.api.play('scratch'); } else { f.dog.api.play('tilt'); f.say('А ты кто?', 2.2); } return 4.6; } },
    bath: { dog: { fluff: 1, seed: 12 }, home: 0.6, start: function (f) { f.dog.api.play('bath'); f.say('Буль-буль!', 2.4); }, loop: function (f) { f.dog.api.play('bath'); f.say('Буль-буль!', 2.4); return 7.5; } },
    haircut: { dog: { fluff: 1, seed: 13 }, home: 0.6, start: function (f) { f.dog.api.set({ fluff: 1, bandana: 0 }); f.dog.api.play('haircut'); f.say('Щёлк-щёлк', 2.2); },
      loop: function (f) { f.dog.api.set({ fluff: 1, snap: false }); after(1.4, function () { f.dog.api.set({ bandana: 0 }); f.dog.api.play('haircut'); f.say('Щёлк-щёлк', 2.2); }, f.tag); return 10; } },
    done: { dog: { fluff: 0.001, seed: 14 }, home: 0.66, start: function (f) { f.dog.api.set({ bandana: 1 }); f.dog.api.play('hop'); f.say('Я красивый?', 2.4); }, loop: function (f, n) { f.dog.api.play(n % 2 ? 'zoomies' : 'hop'); if (!(n % 2)) f.say('Я красивый?', 2.2); return 6.5; } }
  };
  var frames = $$('.frame').map(function (el) {
    var sc = SCENES[el.getAttribute('data-scene')], stage = $('.frame__stage', el), bubble = $('.bubble', el);
    var f = { el: el, sc: sc, bubble: bubble, tag: 'f-' + el.getAttribute('data-scene'), n: 0, played: false };
    f.say = function (text, sec) { say(bubble, f.dog, text, sec, f.tag); };
    f.dog = makeDog(stage, {
      seed: sc.dog.seed, entrance: false, randomBehaviors: false, fluff: sc.dog.fluff, shadow: '#2b1610',
      homeX: sc.home, ground: 0.885, size: 0.5, sizeMax: 290,
      onShow: function () { cancel(f.tag); after(f.played ? 0.6 : 0.35, function () { play(f, true); }, f.tag); },
      onHide: function () { cancel(f.tag); bubble.classList.remove('is-on'); }
    });
    if (!f.dog) return f;
    if (sc === SCENES.done) f.dog.api.set({ bandana: 1 });
    function play(fr, first) {
      if (reduced) return;
      var next;
      if (first || !fr.played) { fr.played = true; sc.start(fr); next = sc === SCENES.haircut ? 9 : sc === SCENES.bath ? 7.5 : 5.5; }
      else { fr.n++; next = sc.loop(fr, fr.n); }
      after(next, function () { play(fr, false); }, fr.tag + '-loop');
    }
    f.replay = function () { cancel(f.tag); cancel(f.tag + '-loop'); f.n = 0; play(f, true); };
    $('.replay', el).addEventListener('click', f.replay);
    watch(f.dog);
    return f;
  });
  // в «уменьшенном движении» кадры показывают итог сценки без анимации
  if (reduced) frames.forEach(function (f) {
    if (!f.dog) return;
    var s = f.el.getAttribute('data-scene');
    if (s === 'bath') f.dog.api.set({ foam: 1 });
    if (s === 'haircut' || s === 'done') f.dog.api.set({ fluff: 0, bandana: 1 });
    $('.replay', f.el).hidden = true;
  });

  /* =====================================================================
     3. Цены: переключатель размера пересчитывает цены
     ===================================================================== */
  var sizeBox = $('.size'), pill = $('.size__pill'), sizeIdx = 0;
  function nf(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
  function movePill() {
    var lab = $('input:checked + label', sizeBox); if (!lab) return;
    pill.style.width = lab.offsetWidth + 'px'; pill.style.transform = 'translateX(' + lab.offsetLeft + 'px)';
  }
  $$('input', sizeBox).forEach(function (inp) {
    inp.addEventListener('change', function () {
      sizeIdx = +inp.value; movePill();
      $$('.menu__price').forEach(function (p, i) {
        var a = p.getAttribute('data-p').split(','), el = $('.price-anim', p);
        el.textContent = nf(a[sizeIdx]);
        if (!reduced) { el.classList.remove('is-tick'); void el.offsetWidth; el.style.animationDelay = (i * 40) + 'ms'; el.classList.add('is-tick'); }
      });
    });
  });
  // строка прайса ведёт к записи и отмечает услугу и размер
  $$('.menu a').forEach(function (a) {
    a.addEventListener('click', function () {
      var s = a.getAttribute('data-service'), inp = form && form.querySelector('input[name="service"][value="' + s + '"]');
      if (inp) inp.checked = true;
      var sz = form && form.querySelector('input[name="size"][value="' + ['mini', 'medium', 'large'][sizeIdx] + '"]');
      if (sz) sz.checked = true;
    });
  });

  /* =====================================================================
     4. Запись: собачка просится к экрану, пока вы заполняете форму
     ===================================================================== */
  var form = $('#leadForm'), formZone = $('#formZone'), bookStage = $('#bookStage'), begBubble = $('#begBubble');
  var bookDog = makeDog(bookStage, { seed: 21, randomBehaviors: true, formZone: formZone, shadow: '#141a6b', homeX: 0.5, ground: 0.86, size: 0.46, sizeMax: 380, maxW: 0.66 });
  watch(bookDog);
  var begOn = false;
  tickers.push(function () {
    if (!bookDog || !bookDog.visible) return;
    var st = bookDog.api.debug.state(), on = st === 'beg:2';
    if (on && !begOn) after(0.5, function () { if (bookDog.api.debug.state() === 'beg:2') say(begBubble, bookDog, 'Ну пожа-а-алуйста', 0, 'beg'); }, 'beg-show');
    if (!on && begOn) { cancel('beg-show'); begBubble.classList.remove('is-on'); }
    begOn = on;
  });
  if (bookDog) {
    formZone.addEventListener('focusin', function () { bookDog.api.notify('form-focus'); });
    formZone.addEventListener('focusout', function () { bookDog.api.notify('form-blur'); });
  }

  // форма: проверка, отправка, «Ура!»
  var submitBtn = $('#submitBtn'), alertBox = $('#formAlert'), doneView = $('#doneView');
  function fieldErr(name, msg) {
    var wrap = form.querySelector('[data-field="' + name + '"]'); if (!wrap) return;
    wrap.classList.toggle('is-bad', !!msg);
    var em = $('.field__err', wrap); if (em) em.textContent = msg || '';
  }
  function validate() {
    var ok = true, first = null, d = form.elements;
    var name = d.name.value.trim(), contact = d.contact.value.trim();
    if (!name) { fieldErr('name', 'Как к вам обращаться?'); ok = false; first = first || d.name; } else fieldErr('name');
    var digits = contact.replace(/\D/g, '');
    var good = digits.length >= 10 || /^@?[a-zA-Z0-9_]{5,}$/.test(contact) || /^\S+@\S+\.\S+$/.test(contact);
    if (!contact) { fieldErr('contact', 'Оставьте телефон или Telegram'); ok = false; first = first || d.contact; }
    else if (!good) { fieldErr('contact', 'Проверьте номер: нужно 10–11 цифр. Или ник Telegram: @имя'); ok = false; first = first || d.contact; }
    else fieldErr('contact');
    var cons = form.querySelector('[data-field="consent"]');
    cons.classList.toggle('is-bad', !d.consent.checked);
    if (!d.consent.checked) { ok = false; first = first || d.consent; }
    if (first) first.focus();
    return ok;
  }
  ['name', 'contact'].forEach(function (n) { form.elements[n].addEventListener('input', function () { if (form.querySelector('[data-field="' + n + '"]').classList.contains('is-bad')) validate(); }); });
  form.elements.consent.addEventListener('change', function () { form.querySelector('[data-field="consent"]').classList.toggle('is-bad', !form.elements.consent.checked); });
  function busy(on) { submitBtn.setAttribute('aria-busy', on ? 'true' : 'false'); $('.btn__label', submitBtn).textContent = on ? 'Отправляем…' : 'Отправить заявку'; }
  function showDone() {
    var pet = form.elements.pet.value.trim();
    $('#doneText').textContent = 'Перезвоним в\u00a0рабочее время и\u00a0подберём удобный день.' + (pet ? ' ' + pet + ', ждём тебя!' : '');
    doneView.style.minHeight = form.offsetHeight + 'px';             // блок не схлопывается: собачке есть где радоваться
    form.hidden = true; doneView.hidden = false; doneView.focus({ preventScroll: true });
    if (bookDog) bookDog.api.notify('form-submit-success');
    say(begBubble, bookDog, 'Ура! Ура!', 2.6, 'beg');
  }
  form.addEventListener('submit', function (e) {
    e.preventDefault(); alertBox.hidden = true;
    if (!validate()) { if (bookDog) bookDog.api.notify('form-error'); return; }
    if (form.elements.website.value) { showDone(); return; }      // ловушка для ботов: делаем вид, что всё ушло
    busy(true);
    if (!CONFIG.endpoint) { setTimeout(function () { busy(false); showDone(); }, CONFIG.demoDelayMs); return; }
    var ctrl = window.AbortController ? new AbortController() : null, to = setTimeout(function () { if (ctrl) ctrl.abort(); }, CONFIG.timeoutMs);
    fetch(CONFIG.endpoint, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' }, signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); clearTimeout(to); busy(false); showDone(); })
      .catch(function () {
        clearTimeout(to); busy(false);
        alertBox.textContent = 'Не получилось отправить заявку. Проверьте интернет и попробуйте ещё раз или позвоните нам.';
        alertBox.hidden = false; if (bookDog) bookDog.api.notify('form-error');
      });
  });
  $('#againBtn').addEventListener('click', function () { form.reset(); doneView.hidden = true; form.hidden = false; form.elements.name.focus(); });

  /* =====================================================================
     5. Заголовки разделов выезжают по словам; слово в подвале во всю ширину
     ===================================================================== */
  $$('.h2.rv').forEach(function (h) {
    var words = h.textContent.trim().split(/\s+/); h.textContent = '';
    words.forEach(function (w, i) {
      var o = document.createElement('span'); o.className = 'w'; var inner = document.createElement('span'); inner.textContent = w;
      o.appendChild(inner); o.style.setProperty('--i', i); h.appendChild(o); if (i < words.length - 1) h.appendChild(document.createTextNode(' '));
    });
  });
  if (io) {
    var rio = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('is-in'); rio.unobserve(e.target); } }); }, { threshold: 0.35 });
    $$('.h2.rv').forEach(function (h) { rio.observe(h); });
  } else $$('.h2.rv').forEach(function (h) { h.classList.add('is-in'); });
  var footWord = $('#footWord');
  function fitFoot() {
    var span = footWord.firstElementChild; footWord.style.setProperty('--word-size', '100px');
    var pad = parseFloat(getComputedStyle(footWord).paddingLeft);
    footWord.style.setProperty('--word-size', ((footWord.clientWidth - 2 * pad) * 100 / span.offsetWidth).toFixed(2) + 'px');
  }

  /* ---------- запуск ---------- */
  function relayout() {
    layoutHero(); movePill(); fitFoot();
    var narrow = innerWidth <= 860;                               // на телефоне подпись под сценой: собака по центру кадра
    frames.forEach(function (f) {
      if (!f.dog) return;
      var st = $('.frame__stage', f.el);
      if (narrow) f.dog.api.place(st.clientWidth * 0.5, st.clientHeight * 0.88, 0); else f.dog.api.place(null);
      if (f.bubble.classList.contains('is-on')) placeBubble(f.bubble, f.dog);
    });
  }
  var started = false;
  function startAll() { if (started) return; started = true; measureCap(); relayout(); makeHeroDog(); heroIntro(); }
  // ждём шрифт названия: от него зависит, где «пол» для собаки
  if (document.fonts && document.fonts.load) {
    Promise.all([document.fonts.load('400 100px "Dela Gothic One"', 'СОБАЧЬЕ ДЕЛО'), document.fonts.load('600 40px Onest', 'Моем')]).then(startAll, startAll);
    document.fonts.addEventListener && document.fonts.addEventListener('loadingdone', function () { if (started) { measureCap(); relayout(); } });
  } else startAll();
  setTimeout(startAll, 2500);                                     // шрифты не загрузились: не ждём
  var rt = 0;
  addEventListener('resize', function () { cancelAnimationFrame(rt); rt = requestAnimationFrame(relayout); });

  var last = performance.now();
  function frame(now) { var dt = Math.min(0.05, (now - last) / 1000); last = now; tick(dt); requestAnimationFrame(frame); }
  if (!manual) requestAnimationFrame(frame);
  window.__site = {
    step: function (ms) { tick(ms / 1000); dogs.forEach(function (d) { if (d.visible) d.api.debug.step(ms); }); },
    dogs: dogs, hero: function () { return heroDog; }, book: function () { return bookDog; }, frames: frames, relayout: relayout
  };
})();
