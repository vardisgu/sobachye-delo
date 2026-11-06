/* PuppyDog engine: behaviours for the rigged puppy. Load rig/body.js and rig/head.js first.
   API: PuppyDog.create({ stage, canvas, formZone, startPaused, seed, randomBehaviors, reducedMotion,
                           size, sizeMax, homeX, ground, entrance, shadow, fluff, on(event, data) })
     -> { notify(name), play(name), place(x, y, h), metrics(), set(state), hit(clientX, clientY), scrub(state), destroy(),
          debug: { pause, resume, step(ms), trigger(name), state(), setPointer(x, y) } }
   events passed to opts.on: 'land' {x, y, v}, 'pet', 'behaviour' {name}
   notify: 'form-focus' | 'form-blur' | 'form-submit-success' | 'form-error' | 'service-bath' | 'service-haircut' */
(function () {
  'use strict';
  var D = window.PuppyDog && window.PuppyDog._dev;
  if (!D) return;
  var NS = 'http://www.w3.org/2000/svg', DEG = Math.PI / 180, SIT_UNITS = 870, F = 2600;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function ease(s) { s = clamp(s, 0, 1); return s * s * (3 - 2 * s); }
  function Spring(x, w, z) { this.x = x; this.v = 0; this.w = w; this.z = z; this.t = x; }
  Spring.prototype.step = function (dt) { this.v += (this.w * this.w * (this.t - this.x) - 2 * this.z * this.w * this.v) * dt; this.x += this.v * dt; return this.x; };
  Spring.prototype.set = function (t, w, z) { this.t = t; if (w) this.w = w; if (z) this.z = z; return this; };
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function rot(x, z, a) { var c = Math.cos(a), s = Math.sin(a); return [x * c + z * s, -x * s + z * c]; }

  // key poses (dog units, relative to the root on the ground; f = front paw, h = hind paw, mirrored for the left side)
  var POSES = {
    sit:     { cx: 0, cy: -350, cz: 40, phi: 72, f: [62, -32, 120], h: [200, -32, 70] },
    stand:   { cx: 0, cy: -330, cz: 70, phi: 8, f: [70, -32, 130], h: [125, -32, -100] },
    crouch:  { cx: 0, cy: -250, cz: 82, phi: 14, f: [85, -32, 140], h: [135, -32, -85] },
    stretch: { cx: 0, cy: -420, cz: 10, phi: 84, f: [108, -395, 175], h: [80, 10, -40] },
    tuck:    { cx: 0, cy: -400, cz: 30, phi: 62, f: [100, -370, 175], h: [125, -110, -30] },
    reach:   { cx: 0, cy: -362, cz: 50, phi: 38, f: [88, -36, 125], h: [115, -100, -90] },
    brace:   { cx: 0, cy: -295, cz: 20, phi: 16, f: [78, -32, 215], h: [120, -32, -30] },
    beg:     { cx: 0, cy: -500, cz: 40, phi: 76, f: [92, -470, 300], h: [110, -32, 30] },
    hop:     { cx: 0, cy: -420, cz: 20, phi: 80, f: [105, -420, 170], h: [90, -10, -20] }
  };
  var KEYS = ['cx', 'cy', 'cz', 'phi', 'fLx', 'fLy', 'fLz', 'fRx', 'fRy', 'fRz', 'hLx', 'hLy', 'hLz', 'hRx', 'hRy', 'hRz'];
  function expand(name, over) {
    var p = POSES[name], o = { cx: p.cx, cy: p.cy, cz: p.cz, phi: p.phi,
      fLx: -p.f[0], fLy: p.f[1], fLz: p.f[2], fRx: p.f[0], fRy: p.f[1], fRz: p.f[2],
      hLx: -p.h[0], hLy: p.h[1], hLz: p.h[2], hRx: p.h[0], hRy: p.h[1], hRz: p.h[2] };
    if (over) for (var k in over) o[k] = over[k];
    return o;
  }
  var NEUTRAL = { fL: [-70, 125], fR: [70, 125], hL: [-125, -100], hR: [125, -100] };
  var STAR = 'M0,-1L0.22,-0.22L1,0L0.22,0.22L0,1L-0.22,0.22L-1,0L-0.22,-0.22Z';

  function create(opts) {
    opts = opts || {};
    var stage = opts.stage, formZone = opts.formZone;
    var rnd = mulberry32(opts.seed != null ? opts.seed : (Math.random() * 1e9) | 0);
    var reduced = opts.reducedMotion != null ? !!opts.reducedMotion : !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    var randomOn = opts.randomBehaviors !== false;
    var sizeK = opts.size || 0.2, sizeMax = opts.sizeMax || 230;   // sitting height as a fraction of the stage height, capped in px
    var homeK = opts.homeX != null ? opts.homeX : 0.5, groundK = opts.ground != null ? opts.ground : 0.89, fixed = null;
    function emit(name, data) { if (opts.on) { try { opts.on(name, data || {}); } catch (e) { /* page handler failed: keep the dog alive */ } } }
    if (opts.canvas) opts.canvas.style.display = 'none';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:1;overflow:hidden';
    stage.appendChild(svg);
    var defs = D.el('defs', svg);
    var fogGrad = D.el('radialGradient', defs, { id: 'pdFog' + ((rnd() * 1e9) | 0) });
    D.el('stop', fogGrad, { offset: '0', 'stop-color': '#ffffff', 'stop-opacity': '0.85' });
    D.el('stop', fogGrad, { offset: '0.6', 'stop-color': '#ffffff', 'stop-opacity': '0.35' });
    D.el('stop', fogGrad, { offset: '1', 'stop-color': '#ffffff', 'stop-opacity': '0' });
    var shadow = D.el('ellipse', svg, { fill: opts.shadow || '#27476a', opacity: 0 });
    var fxBack = D.el('g', svg), rootG = D.el('g', svg), fxFront = D.el('g', svg);
    var sc = new D.Scene(rootG), rig = new D.Rig(sc), P = D.defaultPose();
    var foamG = D.el('g', rootG);                                // foam blobs, dog units, on top of the dog
    var foamUl = D.el('path', foamG, { fill: '#a9c9e8', stroke: '#a9c9e8', 'stroke-width': 16, 'stroke-linejoin': 'round' });
    var foamF = D.el('path', foamG, { fill: '#ffffff' }), foamHl = D.el('path', foamG, { fill: '#e6f2fc' });
    var fogEl = D.el('ellipse', fxFront, { fill: 'url(#' + fogGrad.id + ')', opacity: 0 });
    var printsG = D.el('g', fxFront), partG = D.el('g', fxFront);
    var scis = D.el('g', fxFront, { opacity: 0 });
    var scisA = D.el('g', scis), scisB = D.el('g', scis);
    [scisA, scisB].forEach(function (g, i) {
      D.el('path', g, { d: 'M0,0 L-6,-62 Q0,-78 6,-62 Z', fill: '#c9d4df', stroke: '#4a2519', 'stroke-width': 3.5, 'stroke-linejoin': 'round' });
      D.el('circle', g, { cx: 0, cy: 26, r: 13, fill: 'none', stroke: '#e8664f', 'stroke-width': 7 });
      D.el('path', g, { d: 'M0,0 L0,14', stroke: '#4a2519', 'stroke-width': 4 });
    });
    D.el('circle', scis, { cx: 0, cy: 0, r: 4, fill: '#4a2519' });

    // ---------------- layout
    var W = 1, H = 1, hpx = 150, S = 0.2, homeX = 0, groundY = 0, sRect = { left: 0, top: 0 };
    function layout() {
      var r = stage.getBoundingClientRect(), oldW = W;
      sRect = { left: r.left, top: r.top, width: r.width, height: r.height };
      W = Math.max(1, r.width); H = Math.max(1, r.height);
      svg.setAttribute('viewBox', '0 0 ' + W.toFixed(1) + ' ' + H.toFixed(1));
      hpx = fixed && fixed.h ? fixed.h : Math.min(Math.max(sizeK * H, 110), sizeMax, (opts.maxW || 0.42) * W); S = hpx / SIT_UNITS;
      var oldGround = groundY;
      homeX = fixed ? fixed.x : W * homeK; groundY = fixed ? fixed.y : groundK * H;
      if (oldW > 1 && rx != null) { rx = rx / oldW * W; if (Math.abs(ry - oldGround) < 1) ry = groundY; }
    }

    // ---------------- state
    var t = 0, paused = !!opts.startPaused, destroyed = false;
    var rx = null, ry = 0, vx = 0, vy = 0;
    layout();
    if (opts.place) { fixed = opts.place; layout(); }
    rx = homeX; ry = H + 1.35 * hpx;
    var pose = {};
    KEYS.forEach(function (k) { pose[k] = new Spring(0, 12, 0.8); });
    function setPose(name, w, z, over) { var o = expand(name, over); KEYS.forEach(function (k) { pose[k].set(o[k], w || 12, z || 0.8); }); poseName = name; }
    function snapPose(name) { var o = expand(name); KEYS.forEach(function (k) { pose[k].x = pose[k].t = o[k]; pose[k].v = 0; }); poseName = name; }
    var poseName = 'sit'; snapPose('sit');
    var yaw = new Spring(0, 11, 0.85), runBlend = new Spring(0, 7, 1);
    var hYaw = new Spring(0, 9, 0.7), hPitch = new Spring(0, 9, 0.7), hRoll = new Spring(0, 9, 0.6), hDrop = new Spring(0, 12, 0.7);
    var lookX = new Spring(0, 30, 0.9), lookY = new Spring(0.1, 30, 0.9);
    var headX = new Spring(0, 24, 0.5), headY = new Spring(0, 22, 0.42), headInit = false;
    var flareL = new Spring(0, 10, 0.25), flareR = new Spring(0, 10, 0.25), flareTip = new Spring(0, 6, 0.3), swing = new Spring(0, 8, 0.5), tail = new Spring(0, 9, 0.4);
    var eyeHappy = new Spring(0, 20, 1), pupil = new Spring(1, 12, 0.8), brow = new Spring(0, 10, 0.9), mouth = new Spring(0.62, 10, 0.8), tongue = new Spring(0.72, 10, 0.8);
    var legStretch = new Spring(1, 10, 0.8), bandana = new Spring(0, 13, 0.32), glass = new Spring(0, 16, 0.7), foam = new Spring(0, 4, 1), stretchS = new Spring(0, 22, 0.55), bodyRoll = new Spring(0, 10, 0.8);
    var fluff = { top: new Spring(0, 14, 0.45), left: new Spring(0, 14, 0.45), right: new Spring(0, 14, 0.45), chest: new Spring(0, 14, 0.45) };
    var prevHeadV = 0, pantUntil = -1, rollDeg = 0, blinkT = -1, nextBlink = 2, tailWag = 2.4, tailAmp = 0.35, breathRate = 0.45, breathPh = 0, earBase = 0;
    var particles = [], prints = [], scissors = { x: 0, y: 0, open: 0, vis: 0 };
    var pointer = { x: 0, y: 0, has: false, inForm: false, moved: -10 }, focusInForm = false;
    var lastBeg = -100, begCount = 0, formEnterT = -1;
    var cur = null, curName = 'none', pending = null, nextRandom = 8, lastRandom = '';
    var legs = ['fL', 'fR', 'hL', 'hR'].map(function (n, i) { return { name: n, off: [0, 0.1, 0.5, 0.6][i], stance: true, W: null, Wo: null, cur: null, y: -32, local: null }; });
    var gaitPhase = 0, gaitDir = 1, gaitV = 0;
    var B = null, look = 'pointer', lookOverride = null, headTilt = 0;
    var headPos = { x: 0, y: 0 }, petT = -1, wasPetting = false;

    // ---------------- particles
    function spawn(type, x, y, vx0, vy0, life, r, extra) {
      var p = { type: type, x: x, y: y, vx: vx0, vy: vy0, a: 0, life: life, r: r, rot: rnd() * 6.28, spin: (rnd() - 0.5) * 8 };
      if (extra) for (var k in extra) p[k] = extra[k];
      particles.push(p);
      return p;
    }
    function dropsFrom(cx, cy, n, spread, speed, kind) {
      for (var i = 0; i < n; i++) {
        var a = rnd() * Math.PI * 2, rr = spread * (0.6 + 0.4 * rnd());
        var px = cx + Math.cos(a) * rr * 1.2, py = cy + Math.sin(a) * rr * 0.8;
        var tx = -Math.sin(a), ty = Math.cos(a), sp = speed * (0.6 + 0.6 * rnd()), dirS = rnd() < 0.5 ? -1 : 1;
        spawn(kind || 'drop', px, py, (Math.cos(a) * 0.6 + tx * dirS) * sp, (Math.sin(a) * 0.6 + ty * dirS) * sp - 120, 0.9, kind === 'flake' ? 5 + rnd() * 6 : 2.5 + rnd() * 3);
      }
    }
    function dust(x, n, dir) {
      for (var i = 0; i < n; i++) spawn('dust', x + (rnd() - 0.5) * hpx * 0.5, groundY - 3, (dir || (rnd() - 0.5) * 2) * (40 + rnd() * 140), -10, 0.55, 5 + rnd() * 7);
    }
    function sparkles(n) {
      for (var i = 0; i < n; i++) {
        var a = rnd() * Math.PI * 2, d = hpx * (0.45 + rnd() * 0.35);
        spawn('spark', rx + Math.cos(a) * d, groundY - hpx * 0.55 + Math.sin(a) * d * 0.8, 0, -20, 0.9 + rnd() * 0.4, 6 + rnd() * 6, { delay: rnd() * 0.3 });
      }
    }

    // ---------------- behaviours (each returns true when finished)
    var BEH = {};
    function start(name) {
      cur = BEH[name]; curName = name; cur.t = 0; cur.step = 0; cur.st = 0; cur.done = false;
      if (name !== 'idle') emit('behaviour', { name: name });
      look = 'pointer'; lookOverride = null;
      if (cur.enter) cur.enter();
    }
    function stepTo(b, s) { b.step = s; b.st = 0; }

    BEH.entrance = {
      enter: function () {
        this.base = fixed && fixed.peek != null ? fixed.peek : H;      // the edge it hides behind and peeks over
        rx = homeX - (fixed && fixed.peekDx != null ? fixed.peekDx : 0.17 * W); ry = this.base + 1.35 * hpx; snapPose('sit'); vx = vy = 0;
        this.rootY = new Spring(ry, 13, 0.5); look = 'manual';
        if (reduced) { rx = homeX; ry = groundY; stepTo(this, 9); }
      },
      update: function (dt) {
        var b = this, ph = b.step;
        if (ph === 0 && b.st > 0.5) { b.rootY.set(b.base + 0.614 * hpx, 13, 0.5); stepTo(b, 1); }
        else if (ph === 1) {                                     // peek over the bottom edge and look around
          lookOverride = b.st > 0.45 && b.st < 0.85 ? [-0.9, 0.1] : b.st < 1.25 && b.st >= 0.85 ? [0.9, 0.1] : [0, 0.1];
          if (b.st > 1.35 && b.st < 1.37) blink();
          if (b.st > 1.55) { b.rootY.set(b.base + 1.0 * hpx, 24, 0.9); stepTo(b, 2); }
        } else if (ph === 2 && b.st > 0.24) {                    // launch on a ballistic arc that lands exactly at home
          var yA = groundY - (fixed && fixed.apex != null ? fixed.apex : 0.75) * hpx;   // apex of the arc above the landing spot
          b.g = 13.8 * hpx;
          var tr = Math.sqrt(2 * Math.max(10, ry - yA) / b.g), tf = Math.sqrt(2 * (groundY - yA) / b.g);
          vy = -b.g * tr; vx = (homeX - rx) / (tr + tf); b.v0 = b.g * tr;
          setPose('stretch', 26, 0.75); flareL.v -= 4; flareR.v -= 4; headY.v += -vy / S * 0.02;
          stepTo(b, 3);
        }
        if (ph <= 2) { ry = b.rootY.step(dt); lookOverride = lookOverride || [0, 0.1]; return false; }
        if (ph === 3) {
          vy += b.g * dt; rx += vx * dt; ry += vy * dt;
          var name = b.st < 0.12 || vy < -0.4 * b.v0 ? 'stretch' : vy < 0.25 * b.v0 ? 'tuck' : 'reach';
          if (name !== poseName) setPose(name, name === 'reach' ? 20 : 15, 0.75);
          hYaw.t = 0.22; lookOverride = [0.3, -0.3]; mouth.t = 0.95; tongue.t = 0.95; pupil.t = 1.15;
          if (vy > 0 && ry >= groundY) {
            ry = groundY; rx = homeX; headY.v += vy / S * 0.035; flareL.v -= 2.4; flareR.v -= 2.4; tail.v -= 4; stretchS.x = -0.05;
            emit('land', { x: rx, y: ry, v: vy / hpx });
            setPose('crouch', 32, 0.8); dust(rx, 7); vx = vy = 0; b.squint = 0.28; stepTo(b, 4);
          }
          return false;
        }
        if (ph === 4) {
          if (look === 'manual') { look = 'pointer'; lookOverride = null; }
          hYaw.t = 0; mouth.t = 0.62; tongue.t = 0.72; pupil.t = 1;
          if (b.st > 0.1 && poseName === 'crouch') setPose('stand', 13, 0.45);
          if (b.st > 0.36 && poseName === 'stand') setPose('sit', 9, 0.72);
          return b.st > 1.2;
        }
        if (ph === 9) { snapPose('sit'); return true; }
        return false;
      }
    };

    BEH.idle = {
      enter: function () { setPose('sit', 9, 0.75); tailWag = 2.4; tailAmp = 0.35; earBase = 0; eyeHappy.t = 0; brow.t = 0; pupil.t = 1; mouth.t = 0.62; tongue.t = 0.72; },
      update: function () {
        breathRate = t < pantUntil ? 1.6 : 0.45;
        if (petT >= 0 && t - petT < 2.5) nextRandom = Math.max(nextRandom, t + 3);   // no tricks while being petted
        if (randomOn && !reduced && t > nextRandom) {
          var opts2 = [['zoomies', 0.32], ['scratch', 0.36], ['shake', 0.2], ['tilt', 0.12]].filter(function (o) { return o[0] !== lastRandom; });
          var sum = opts2.reduce(function (a, o) { return a + o[1]; }, 0), r = rnd() * sum, pick = opts2[0][0];
          for (var i = 0; i < opts2.length; i++) { r -= opts2[i][1]; if (r <= 0) { pick = opts2[i][0]; break; } }
          lastRandom = pick; nextRandom = t + 7 + rnd() * 7;
          if (pick === 'tilt') { headTilt = (rnd() < 0.5 ? -1 : 1) * 0.28; this.tiltUntil = t + 1.4; }
          else { start(pick); }
        }
        if (this.tiltUntil && t > this.tiltUntil) { headTilt = 0; this.tiltUntil = 0; }
        return false;
      }
    };

    BEH.zoomies = {
      enter: function () {
        this.laps = rnd() < 0.5 ? [0.8, 0.2, 0.5] : [0.2, 0.8, 0.5]; this.lap = 0; look = 'run';
        setPose('stand', 11, 0.7); this.stop = false;
      },
      update: function (dt) {
        var b = this, VMAX = 3.2 * hpx, ACC = 9 * hpx, BRAKE = 12 * hpx, sp = Math.abs(gaitV) / VMAX;
        if (b.step === 0 && b.st > 0.28) { gaitDir = b.laps[b.lap] * W > rx ? 1 : -1; yaw.set(gaitDir * 1.25, 11, 0.85); stepTo(b, 1); }
        else if (b.step === 1 && b.st > 0.22) { runBlend.set(1, 7, 1); setPose('stand', 11, 0.7); stepTo(b, 2); }
        else if (b.step === 2) {
          var goal = b.laps[b.lap] * W, dist = (goal - rx) * gaitDir, stopD = gaitV * gaitV / (2 * BRAKE);
          if (dist <= stopD + 2 || (pending && b.lap < b.laps.length - 1 && sp > 0.3)) {
            if (pending) b.lap = b.laps.length - 1;              // a request is waiting: this is the last lap
            setPose('brace', 24, 0.7); runBlend.set(0, 16, 1); dust(rx + gaitDir * hpx * 0.2, 5, gaitDir); stepTo(b, 3);
          } else gaitV = Math.min(VMAX, Math.abs(gaitV) + ACC * dt) * gaitDir;
        } else if (b.step === 3) {
          var nv = Math.abs(gaitV) - BRAKE * dt;
          if (nv <= 0) {
            gaitV = 0; b.lap++;
            if (b.lap < b.laps.length && !pending) { gaitDir = -gaitDir; yaw.set(0, 11, 0.85); setPose('stand', 14, 0.6); stepTo(b, 4); }
            else { runBlend.set(0, 7, 1); yaw.set(0, 9, 0.85); setPose('stand', 10, 0.7); stepTo(b, 5); }
          } else gaitV = nv * gaitDir;
        } else if (b.step === 4 && b.st > 0.12) { yaw.set(gaitDir * 1.25, 11, 0.85); stepTo(b, 1); }
        else if (b.step === 5 && b.st > 0.35) {
          if (Math.abs(rx - homeX) > hpx * 0.4) { b.laps = [homeX / W]; b.lap = 0; gaitDir = homeX > rx ? 1 : -1; yaw.set(gaitDir * 1.25, 11, 0.85); stepTo(b, 1); }
          else { setPose('sit', 9, 0.72); breathRate = 1.6; pantUntil = t + 3.5; stepTo(b, 6); }
        } else if (b.step === 6 && b.st > 0.6) return true;
        rx += gaitV * dt;
        return false;
      }
    };

    BEH.shake = {
      enter: function () { setPose('stand', 12, 0.7); look = 'manual'; this.foamy = foam.x > 0.2; earBase = 0; },
      update: function (dt) {
        var b = this;
        if (b.step === 0 && b.st > 0.3) stepTo(b, 1);
        if (b.step === 1) {
          var T = 1.0, u = b.st / T, A = 0.36 * Math.sin(Math.PI * clamp(u * 1.15, 0, 1)) * (u < 1 ? 1 : 0), w = 2 * Math.PI * 5.4 * b.st;
          b.A = A; b.w = w;
          yaw.x = yaw.t = A * Math.sin(w); yaw.v = 0;
          hYaw.x = hYaw.t = clamp(A * 1.5 * Math.sin(w + 0.9), -0.6, 0.6); hYaw.v = 0;
          hRoll.x = hRoll.t = A * 0.8 * Math.sin(w + 0.5); hRoll.v = 0;
          eyeHappy.t = 1; mouth.t = 0.4; tongue.t = 0.3;
          flareL.v += A * 26 * Math.cos(w + 1.6) * dt * 60; flareR.v -= A * 26 * Math.cos(w + 1.6) * dt * 60;
          if (A > 0.08) {
            var n = Math.floor((A / 0.36) * 120 * dt + rnd());
            dropsFrom(rx, groundY - hpx * 0.6, n, hpx * 0.45, 520, 'drop');
            if (b.foamy) { dropsFrom(rx, groundY - hpx * 0.75, n, hpx * 0.45, 420, 'flake'); foam.set(0, 6, 1); }
          }
          if (b.st > T) { hYaw.set(0); hRoll.set(0); yaw.set(0); stepTo(b, 2); if (b.foamy) sparkles(8); }
          return false;
        }
        if (b.step === 2) { eyeHappy.t = b.st < 0.6 ? 1 : 0; mouth.t = 0.7; tongue.t = 0.9; if (b.st > 0.15 && poseName !== 'sit') setPose('sit', 9, 0.72); return b.st > 0.9; }
        return false;
      }
    };

    BEH.scratch = {
      enter: function () { this.side = rnd() < 0.5 ? -1 : 1; look = 'manual'; setPose('sit', 9, 0.75); },
      update: function () {
        var b = this, s = b.side, k = s > 0 ? 'hR' : 'hL', fk = s > 0 ? 'flareR' : 'flareL';
        var lift = { cx: 0, cy: -342 }; lift[k + 'x'] = s * 350; lift[k + 'y'] = -430; lift[k + 'z'] = 40;
        b.stretchK = s > 0 ? 'hindStretchR' : 'hindStretchL';
        if (b.step === 0) { bodyRoll.set(s * 7); if (b.st > 0.1) { setPose('sit', 11, 0.7, lift); stepTo(b, 1); } }
        else if (b.step === 1) { hRoll.set(s * 0.34); hPitch.set(0.05); hDrop.set(60); hYaw.set(s * 0.15); legStretch.set(1.75, 12, 0.8); if (b.st > 0.38) stepTo(b, 2); }
        else if (b.step === 2 || b.step === 4) {                 // two fast scratching bursts
          var dur = b.step === 2 ? 0.75 : 0.6, w = 2 * Math.PI * 9.5 * b.st, o = Math.sin(w);
          pose[k + 'y'].x = pose[k + 'y'].t = -430 + 34 * o; pose[k + 'y'].v = 0;
          pose[k + 'z'].x = pose[k + 'z'].t = 40 + 14 * Math.cos(w); pose[k + 'z'].v = 0;
          eyeHappy.t = 1; mouth.t = 0.85; tongue.t = 1;
          (s > 0 ? flareR : flareL).v += 9 * Math.cos(w) * 0.25;
          hRoll.t = s * (0.32 + 0.04 * o);
          if (b.st > dur) stepTo(b, b.step + 1);
        } else if (b.step === 3) { if (b.st > 0.28) stepTo(b, 4); }
        else if (b.step === 5) { setPose('sit', 10, 0.7); bodyRoll.set(0); hDrop.set(0); hPitch.set(0); eyeHappy.t = 0; legStretch.set(1, 9, 0.8); stepTo(b, 6); }
        else if (b.step === 6) {                                 // a little head shake to finish
          var hw = 2 * Math.PI * 6 * b.st, A = 0.3 * Math.max(0, 1 - b.st / 0.45);
          hYaw.x = hYaw.t = A * Math.sin(hw); hRoll.x = hRoll.t = A * 0.6 * Math.sin(hw + 0.6);
          if (b.st > 0.5) { hYaw.set(0); hRoll.set(0); return true; }
        }
        return false;
      }
    };

    BEH.beg = {
      enter: function () { look = 'viewer'; this.exitT = -1; this.nextPat = 2.2 + rnd(); begCount++; earBase = -0.1; },
      update: function (dt) {
        var b = this, inZone = pointer.inForm || focusInForm;
        if (b.step === 0) { setPose('stand', 14, 0.7); stepTo(b, 1); }
        else if (b.step === 1 && b.st > 0.18) { setPose('beg', 11, 0.68); stepTo(b, 2); }
        else if (b.step === 2) {                                 // pressed on the screen, pleading
          if (b.st > 0.35) glass.t = 1;
          brow.t = 1; pupil.t = 1.38; mouth.t = 0.42; tongue.t = 0.35; tailWag = 3.2; tailAmp = 0.4; breathRate = 0.55;
          lookOverride = [0, -0.12];
          if (b.st > b.nextPat) {                                // pat-pat: one paw lifts off the screen and presses again
            var side = rnd() < 0.5 ? 'fL' : 'fR';
            b.pat = { k: side, t: 0 }; b.nextPat = b.st + 2.4 + rnd() * 1.6; leavePrints(side === 'fL' ? 'L' : 'R');
          }
          if (b.pat) {
            b.pat.t += dt; var q = b.pat.t / 0.34, lift = Math.sin(Math.PI * clamp(q, 0, 1));
            pose[b.pat.k + 'z'].t = 300 - 110 * lift; pose[b.pat.k + 'y'].t = -470 - 30 * lift;
            if (q >= 1) { pose[b.pat.k + 'z'].t = 300; pose[b.pat.k + 'y'].t = -470; glass.v += 3; b.pat = null; }
          }
          if (!inZone) { if (b.exitT < 0) b.exitT = b.st; } else b.exitT = -1;
          if ((b.exitT >= 0 && b.st - b.exitT > 0.45) || b.st > 14 || pending) {
            leavePrints(); glass.t = 0; brow.t = 0; pupil.t = 1; tailWag = 2.4; tailAmp = 0.35;
            setPose('stand', 12, 0.6); stepTo(b, 3);
          }
        } else if (b.step === 3) { if (b.st > 0.25 && poseName !== 'sit') setPose('sit', 9, 0.7); if (b.st > 0.9) { lastBeg = t; return true; } }
        return false;
      }
    };

    BEH.celebrate = {
      enter: function () { look = 'viewer'; this.hops = 0; },
      update: function (dt) {
        var b = this;
        eyeHappy.t = 1; mouth.t = 0.95; tongue.t = 1; tailWag = 5.5; tailAmp = 0.45;
        if (b.step === 0) { setPose('crouch', 22, 0.8); if (b.st > 0.14) { b.g = 16 * hpx; vy = -Math.sqrt(2 * b.g * (b.hops ? 0.18 : 0.32) * hpx); setPose('hop', 22, 0.7); stepTo(b, 1); } }
        else if (b.step === 1) {
          vy += b.g * dt; ry += vy * dt;
          if (vy > 0 && ry >= groundY) {
            emit('land', { x: rx, y: ry, v: vy / hpx });
            ry = groundY; vy = 0; flareL.v -= 2; flareR.v -= 2; dust(rx, 3); setPose('crouch', 28, 0.8);
            if (!b.hops && curName === 'celebrate') { bandana.t = 1; bandana.v = 6; sparkles(10); }
            b.hops++; stepTo(b, b.hops < 2 ? 0 : 2);
          }
        } else if (b.step === 2) { if (b.st > 0.1 && poseName === 'crouch') setPose('sit', 9, 0.65); if (b.st > 1.2) { eyeHappy.t = 0; tailWag = 2.4; tailAmp = 0.35; return true; } }
        return false;
      }
    };

    BEH.hop = { enter: BEH.celebrate.enter, update: BEH.celebrate.update };   // the same happy hops, no bandana

    BEH.bath = {
      enter: function () { look = 'manual'; setPose('stand', 11, 0.7); foam.set(1, 3.2, 1); },
      update: function (dt) {
        var b = this;
        eyeHappy.t = 1; mouth.t = 0.55; tongue.t = 0.5; earBase = -0.2;
        yaw.t = 0.12 * Math.sin(b.t * 2.2); hRoll.t = 0.1 * Math.sin(b.t * 2.2 + 0.6);
        if (rnd() < dt * 14 * foam.x) {
          var a = rnd() * Math.PI * 2;
          spawn('bubble', rx + Math.cos(a) * hpx * 0.4, groundY - hpx * (0.6 + rnd() * 0.5), (rnd() - 0.5) * 30, -(40 + rnd() * 50), 1.4 + rnd(), 5 + rnd() * 9);
        }
        if (b.t > 2.8) { yaw.set(0); hRoll.set(0); start('shake'); }
        return false;
      }
    };

    BEH.haircut = {
      enter: function () {
        look = 'viewer'; ['top', 'left', 'right', 'chest'].forEach(function (k) { fluff[k].set(1, 16, 0.4); });
        this.spots = ['top', 'left', 'right', 'chest']; this.i = 0; pupil.t = 0.85; brow.t = 0.5;
        scissors.vis = 0; scissors.x = rx + hpx * 1.4; scissors.y = groundY - hpx * 1.5;
      },
      update: function (dt) {
        var b = this;
        mouth.t = 0.5; tongue.t = 0.4;
        var pos = { top: [0, -1.18], left: [-0.62, -0.62], right: [0.62, -0.62], chest: [0, -0.42] };
        if (b.step === 0) { if (b.st > 0.55) { stepTo(b, 1); b.from = [scissors.x, scissors.y]; } }
        else if (b.step === 1 || b.step === 2) {                 // fly to the next spot, then snip twice
          var spot = pos[b.spots[b.i]], tx = rx + spot[0] * hpx * 1.05, ty = groundY + spot[1] * hpx;
          scissors.vis = Math.min(1, scissors.vis + dt * 5);
          if (b.step === 1) {
            var u = ease(b.st / 0.32);
            scissors.x = lerp(b.from[0], tx, u); scissors.y = lerp(b.from[1], ty, u) - Math.sin(Math.PI * u) * hpx * 0.15;
            scissors.open = 0.6; if (b.st > 0.32) stepTo(b, 2);
          } else {
            var sn = b.st / 0.16, cyc = Math.floor(sn), fr = sn - cyc;
            scissors.open = cyc < 2 ? 0.6 * Math.abs(Math.cos(Math.PI * fr)) : 0.6;
            if (cyc >= 1 && !b.cut) {
              b.cut = true; var k = b.spots[b.i]; fluff[k].set(0, 18, 0.6);
              for (var i = 0; i < 6; i++) spawn('tuft', tx + (rnd() - 0.5) * hpx * 0.3, ty + (rnd() - 0.5) * hpx * 0.2, (rnd() - 0.5) * 60, -20 - rnd() * 40, 1.3, 7 + rnd() * 7);
            }
            if (sn > 2.2) { b.cut = false; b.i++; b.from = [scissors.x, scissors.y]; if (b.i >= b.spots.length) stepTo(b, 3); else stepTo(b, 1); }
          }
        } else if (b.step === 3) {
          scissors.x += hpx * 4 * dt; scissors.y -= hpx * 3 * dt; scissors.vis = Math.max(0, scissors.vis - dt * 3);
          if (b.st > 0.05 && !b.done) { b.done = true; sparkles(10); pupil.t = 1; brow.t = 0; eyeHappy.t = 1; hPitch.set(-0.08); bandana.t = 1; bandana.v = 6; }
          if (b.st > 1.3) { eyeHappy.t = 0; hPitch.set(0); return true; }
        }
        return false;
      }
    };

    function blink() { if (blinkT < 0) blinkT = 0; }
    function leavePrints(only) {
      var info = rig.bodyInfo; if (!info || !info.paws) return;
      ['L', 'R'].forEach(function (s) {
        if (only && only !== s) return;
        var pw = info.paws[s]; if (!pw) return;
        prints.push({ x: rx + pw.x * S, y: ry + pw.y * S, w: pw.w * S, h: pw.h * S, a: 0 });
      });
    }

    // ---------------- requests and the scheduler
    function request(name) {
      if (reduced && (name === 'bath' || name === 'haircut')) return;
      if (curName === name) return;
      if (curName === 'idle') start(name);
      else if (curName === 'entrance') pending = name;
      else pending = name;
    }
    function maybeBeg() {
      if (curName === 'beg' || pending === 'beg') return;
      var first = begCount === 0;
      if (first || (t - lastBeg > 10 && rnd() < 0.72)) request('beg');
    }

    // ---------------- pointer
    function onMove(e) {
      pointer.x = e.clientX - sRect.left; pointer.y = e.clientY - sRect.top; pointer.has = true; pointer.moved = t;
      var inF = false;
      if (formZone) { var r = formZone.getBoundingClientRect(); inF = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom; }
      if (inF && !pointer.inForm) formEnterT = t;
      if (!inF) formEnterT = -1;
      pointer.inForm = inF;
    }
    function onLeave(e) { if (!e.relatedTarget) { pointer.has = false; pointer.inForm = false; formEnterT = -1; } }
    function onScroll() { var r = stage.getBoundingClientRect(); sRect.left = r.left; sRect.top = r.top; }
    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('mouseout', onLeave);
    window.addEventListener('scroll', onScroll, { passive: true });
    var ro = window.ResizeObserver ? new ResizeObserver(function () { layout(); }) : null;
    if (ro) ro.observe(stage); else window.addEventListener('resize', layout);

    // ---------------- simulation step
    // ---------------- scroll-driven scenes: the page sets a progress 0..1, the dog plays that moment (reversible)
    var scrub = null, scrubCut = {};
    var CUT_SPOTS = ['top', 'left', 'right', 'chest'];
    var CUT_POS = { top: [0, -1.18], left: [-0.62, -0.62], right: [0.62, -0.62], chest: [0, -0.42] };
    function applyScrub() {
      var h = scrub.haircut;
      if (h != null) {
        var p = clamp(h, 0, 1), n = CUT_SPOTS.length, seg = Math.min(n - 1, Math.floor(p * n)), u = p * n - seg;
        CUT_SPOTS.forEach(function (k, i) {
          var cut = p * n > i + 0.62;
          fluff[k].set(cut ? 0 : 1, cut ? 18 : 9, cut ? 0.6 : 0.5);
          if (cut && !scrubCut[k]) {                               // only when scrolling forward: the clipped fur falls
            var q = CUT_POS[k], tx = rx + q[0] * hpx * 1.05, ty = groundY + q[1] * hpx;
            for (var j = 0; j < 7; j++) spawn('tuft', tx + (rnd() - 0.5) * hpx * 0.3, ty + (rnd() - 0.5) * hpx * 0.2, (rnd() - 0.5) * 70, -20 - rnd() * 40, 1.3, 7 + rnd() * 7);
            if (k === 'top') blink();
          }
          scrubCut[k] = cut;
        });
        var cur0 = CUT_POS[CUT_SPOTS[seg]], prev = seg > 0 ? CUT_POS[CUT_SPOTS[seg - 1]] : [1.5, -1.6];
        var tr = ease(u / 0.35);
        scissors.x = rx + lerp(prev[0], cur0[0], tr) * hpx * 1.05;
        scissors.y = groundY + (lerp(prev[1], cur0[1], tr) - Math.sin(Math.PI * tr) * 0.15) * hpx;
        scissors.open = u < 0.35 ? 0.6 : 0.6 * Math.abs(Math.cos(Math.PI * clamp((u - 0.35) / 0.25, 0, 2)));   // two snips per spot
        scissors.vis = clamp(p * 25, 0, 1) * clamp((1 - p) * 25, 0, 1);
        var done = p > 0.97;
        brow.t = done ? 0 : 0.45 * (1 - p); pupil.t = done ? 1 : 0.9; eyeHappy.t = done ? 1 : 0;
        if (done && !scrubCut.sparkled) { sparkles(10); scrubCut.sparkled = true; }
        if (!done) scrubCut.sparkled = false;
      }
    }

    function update(dt) {
      t += dt;
      if (cur) { cur.t += dt; cur.st += dt; if (cur.update(dt)) { cur = null; } }
      if (scrub && (curName === 'idle' || curName === 'entrance')) applyScrub(dt);
      if (!cur) { if (pending) { var p = pending; pending = null; start(p); } else start('idle'); }
      if (curName !== 'beg' && curName !== 'entrance' && formEnterT >= 0 && t - formEnterT > 0.35) { formEnterT = -2; maybeBeg(); }

      // gait (zoomies): paws planted in the world while in stance
      var a = yaw.step(dt); runBlend.step(dt);
      var VMAX = 3.2 * hpx, sp = Math.abs(gaitV) / VMAX, f = 1.7 + 2.1 * sp, duty = 0.44 - 0.1 * sp, vu = Math.abs(gaitV) / S, rootW = rx / S;
      gaitPhase += f * dt;
      var L = vu * duty / f;
      legs.forEach(function (lg) {
        var n = NEUTRAL[lg.name], nr = rot(n[0], n[1], a);
        var p = (gaitPhase + lg.off) % 1, stance = p < duty;
        var land = rootW + nr[0] + gaitDir * (L / 2), landZ = nr[1];
        if (!lg.W || runBlend.x < 0.02) { lg.W = [rootW + nr[0], nr[1]]; lg.Wo = lg.W.slice(); lg.cur = lg.W.slice(); }
        if (stance && !lg.stance) { lg.W = lg.cur.slice(); if (sp > 0.6 && lg.name[0] === 'h' && rnd() < 0.5) spawn('dust', lg.W[0] * S, groundY - 3, -gaitDir * (30 + rnd() * 60), -8, 0.5, 3 + rnd() * 4); }
        if (!stance && lg.stance) lg.Wo = lg.W.slice();
        lg.stance = stance;
        if (stance) { lg.cur = lg.W.slice(); lg.y = -32; }
        else {
          var s = (p - duty) / (1 - duty), rem = (1 - s) * (1 - duty) / f, landNow = land + gaitDir * vu * rem;
          lg.cur = [lerp(lg.Wo[0], landNow, ease(s)), lerp(lg.Wo[1], landZ, ease(s))];
          lg.y = -32 - (50 + 45 * sp) * Math.sin(Math.PI * s);
        }
        var loc = rot(lg.cur[0] - rootW, lg.cur[1], -a);
        lg.local = { x: loc[0], y: lg.y, z: loc[1] };
      });
      if (curName === 'zoomies' && sp > 0.5 && rnd() < dt * 30)
        spawn('drop', rx - gaitDir * hpx * 0.25 + (rnd() - 0.5) * hpx * 0.4, groundY - hpx * (0.55 + rnd() * 0.4), -gaitDir * (40 + rnd() * 160) + gaitV * 0.2, -(150 + rnd() * 260), 0.9, 2.5 + rnd() * 3);

      KEYS.forEach(function (k) { pose[k].step(dt); });
      [hYaw, hPitch, hRoll, hDrop, eyeHappy, pupil, brow, mouth, tongue, bandana, glass, foam, stretchS, bodyRoll, legStretch].forEach(function (s) { s.step(dt); });
      ['top', 'left', 'right', 'chest'].forEach(function (k) { fluff[k].step(dt); });

      // body pose: blend static pose with the gait
      var rb = clamp(runBlend.x, 0, 1), lean = curName === 'zoomies' ? (BEH.zoomies.step === 3 ? -1 : sp * 0.6) : 0;
      var bob = 20 * sp * (0.5 - 0.5 * Math.cos(4 * Math.PI * gaitPhase)), flex = 10 * sp * Math.sin(2 * Math.PI * gaitPhase);
      breathPh += dt * Math.PI * 2 * breathRate;
      B = {
        cx: pose.cx.x, cy: lerp(pose.cy.x, -330 - bob + 5 * lean, rb), cz: lerp(pose.cz.x, 70 + 18 * lean, rb),
        phi: lerp(pose.phi.x, 8 + flex - 6 * lean, rb) * DEG, yaw: a,
        fp: { x: 0, y: 0, z: 0 }, hp: { x: 0, y: 0, z: 0 },
        breath: Math.sin(breathPh) * (breathRate > 1 ? 1.6 : 1), tailUp: 1 - 0.85 * rb * sp,
        hindStretchL: curName === 'scratch' && BEH.scratch.side < 0 ? legStretch.x : 1, hindStretchR: curName === 'scratch' && BEH.scratch.side > 0 ? legStretch.x : 1,
        stretch: stretchS.x, glass: clamp(glass.x, 0, 1.3), bandana: clamp(bandana.x, 0, 1.4), bandanaFlutter: Math.sin(t * 7) * 0.4 + swing.x,
        fluff: { top: clamp(fluff.top.x, 0, 1.3), left: clamp(fluff.left.x, 0, 1.3), right: clamp(fluff.right.x, 0, 1.3), chest: clamp(fluff.chest.x, 0, 1.3) }
      };
      [['fL', 'fpL'], ['fR', 'fpR'], ['hL', 'hpL'], ['hR', 'hpR']].forEach(function (m) {
        var lg = legs[['fL', 'fR', 'hL', 'hR'].indexOf(m[0])];
        var st = { x: pose[m[0] + 'x'].x, y: pose[m[0] + 'y'].x, z: pose[m[0] + 'z'].x };
        B[m[1]] = rb > 0.001 ? { x: lerp(st.x, lg.local.x, rb), y: lerp(st.y, lg.local.y, rb), z: lerp(st.z, lg.local.z, rb) } : st;
      });

      // head follows the neck with lag; look target
      var nl = rot(0, B.cz + 30, a), k = F / (F - nl[1]), nx = nl[0] * k, ny = (B.cy - 100) * k;
      if (!headInit) { headX.x = headX.t = nx; headY.x = headY.t = ny; headInit = true; }
      headX.t = nx; headY.t = ny; headX.step(dt); headY.step(dt);
      var hcx = rx + (headX.x) * S, hcy = ry + (headY.x - 150) * S;
      var lx = 0, ly = 0.1, wantYaw = 0, wantPitch = 0.02;
      if (lookOverride) { lx = lookOverride[0]; ly = lookOverride[1]; wantYaw = lx * 0.25; }
      else if (look === 'pointer' && pointer.has) {
        var dx = (pointer.x - hcx) / (W * 0.45), dy = (pointer.y - hcy) / (H * 0.45);
        wantYaw = clamp(dx, -1, 1) * 0.55; wantPitch = -clamp(dy, -1, 1) * 0.3; lx = clamp(dx * 1.7, -1, 1); ly = clamp(dy * 1.7, -1, 1);
      } else if (look === 'run') { wantYaw = clamp(a, -0.6, 0.6); lx = wantYaw; ly = 0.05; }
      if (look !== 'manual') { hYaw.t = wantYaw + headTilt * 0.2; hPitch.t = wantPitch; if (curName !== 'scratch') hRoll.t = -wantYaw * 0.1 + headTilt; }
      if (curName === 'zoomies') hYaw.t = clamp(a, -0.6, 0.6);
      // petting: a hand moving over the head makes the dog melt (eyes shut, head pushes into the hand, tail goes wild)
      headPos.x = hcx; headPos.y = hcy;
      var near = pointer.has && Math.hypot(pointer.x - hcx, (pointer.y - hcy) * 1.15) < 0.4 * hpx && t - pointer.moved < 0.3;
      if (near && curName === 'idle') { if (petT < 0 || t - petT > 0.8) emit('pet'); petT = t; }
      var petting = curName === 'idle' && petT >= 0 && t - petT < 0.7;
      if (petting) {
        eyeHappy.t = 1; tailWag = 5; tailAmp = 0.45; mouth.t = 0.8; tongue.t = 0.95; earBase = 0.18;
        hPitch.t = -0.12; hRoll.t = 0.12 * Math.sin(t * 2.4); lx = 0; ly = 0;
        if (rnd() < dt * 2.6) spawn('heart', hcx + (rnd() - 0.5) * hpx * 0.5, hcy - hpx * 0.25, (rnd() - 0.5) * 40, -70 - rnd() * 40, 1.3, 9 + rnd() * 5);
        wasPetting = true;
      } else if (wasPetting) { wasPetting = false; eyeHappy.t = 0; tailWag = 2.4; tailAmp = 0.35; mouth.t = 0.62; tongue.t = 0.72; earBase = 0; hPitch.t = 0.02; }
      lookX.t = lx; lookY.t = ly; lookX.step(dt); lookY.step(dt);

      // ears: flap with the head's vertical motion, stream back when running, twitch now and then
      // ears hang on springs: the head's acceleration flings them (they lag when it speeds up, flip up when it stops)
      var accY = dt > 0 ? (headY.v - prevHeadV) / dt : 0; prevHeadV = headY.v;
      var kick = clamp(accY * 0.0018, -60, 60) * dt;
      flareL.v += kick; flareR.v += kick;
      var fT = 0.25 * rb * sp;
      if (curName === 'entrance' && cur && cur.step === 3) fT = clamp(vy * 0.0011 * 180 / hpx, -0.3, 0.95);   // air drag lifts them in free fall
      flareL.t = fT + earBase; flareR.t = fT + earBase; flareL.step(dt); flareR.step(dt);
      flareL.x = clamp(flareL.x, -0.45, 1.0); flareR.x = clamp(flareR.x, -0.45, 1.0); flareTip.t = (flareL.x + flareR.x) / 2; flareTip.step(dt);
      swing.t = curName === 'zoomies' ? clamp(gaitV / VMAX, -1, 1) * 0.55 : clamp(headX.v * 0.0008, -0.4, 0.4); swing.step(dt);
      if (curName === 'idle' && rnd() < dt * 0.25) (rnd() < 0.5 ? flareL : flareR).v += 3;
      // tail
      tail.t = Math.sin(t * Math.PI * 2 * (curName === 'zoomies' && sp > 0.3 ? 5 : tailWag)) * (tailAmp - 0.2 * rb * sp); tail.step(dt);
      // blinks
      if (eyeHappy.x < 0.5 && t > nextBlink && blinkT < 0) { blinkT = 0; nextBlink = t + 2 + rnd() * 3.5; }
      if (blinkT >= 0) { blinkT += dt; if (blinkT > 0.17) blinkT = -1; }
      if (cur && cur.squint) cur.squint -= dt;
      // breath fog on the screen while begging
      // particles
      particles.forEach(function (p) {
        if (p.delay > 0) { p.delay -= dt; return; }
        p.a += dt;
        if (p.type === 'drop' || p.type === 'flake') { p.vy += (p.type === 'flake' ? 900 : 1700) * dt; p.vx *= p.type === 'flake' ? 0.985 : 1; }
        else if (p.type === 'tuft') { p.vy += 240 * dt; p.vx *= 0.97; p.x += Math.sin(p.a * 5 + p.rot) * 20 * dt; }
        else if (p.type === 'dust') { p.vx *= 0.93; }
        else if (p.type === 'bubble') { p.x += Math.sin(p.a * 3 + p.rot) * 12 * dt; }
        else if (p.type === 'heart') { p.x += Math.sin(p.a * 4 + p.rot) * 18 * dt; p.vy *= 0.985; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.spin * dt;
      });
      particles = particles.filter(function (p) { return p.a < p.life && p.y < groundY + 8; });
      prints.forEach(function (p) { p.a += dt; });
      prints = prints.filter(function (p) { return p.a < 1.6; });
      rollDeg += ((curName === 'entrance' && cur && cur.step === 3 ? clamp(vx / (W * 0.25), -1, 1) * 7 : bodyRoll.x) - rollDeg) * Math.min(1, dt * 8);
    }

    // ---------------- render
    var pEls = [], prEls = [];
    function render() {
      if (!B) return;
      P.body = B;
      P.hx = headX.x + 46; P.hy = headY.x - 150 + 595 + hDrop.x;
      P.hyaw = clamp(hYaw.x, -0.6, 0.6); P.hpitch = hPitch.x; P.hroll = hRoll.x;
      P.lookX = lookX.x; P.lookY = lookY.x;
      var u = blinkT >= 0 ? blinkT / 0.17 : -1;
      P.eyeOpen = u < 0 ? 1 : Math.max(0.06, u < 0.4 ? 1 - u / 0.4 : (u - 0.4) / 0.6);
      if (cur && cur.squint > 0) P.eyeOpen = 0.12;
      P.eyeHappy = eyeHappy.x; P.pupil = pupil.x; P.brow = brow.x;
      P.bangs = clamp(fluff.top.x, 0, 1.2);
      var pantK = breathRate > 1 ? 1 : 0;
      P.mouthOpen = clamp(mouth.x + 0.12 * Math.sin(breathPh * 2) * pantK, 0.05, 1); P.tongue = clamp(tongue.x, 0.1, 1);
      P.earL = flareL.x + swing.x; P.earR = flareR.x - swing.x; P.earLb = (flareL.x - flareTip.x) * 1.3 + swing.x * 0.6; P.earRb = (flareR.x - flareTip.x) * 1.3 - swing.x * 0.6;
      P.dt = 1 / 60;
      B.headC = { x: P.hx - 46, y: P.hy - 595, rx: 250, ry: 268 };
      rootG.setAttribute('transform', 'translate(' + rx.toFixed(2) + ',' + ry.toFixed(2) + ') scale(' + S.toFixed(5) + ') rotate(' + rollDeg.toFixed(2) + ' 0 -300)');
      rig.render(P);
      // foam blobs: a foam hat on the head and suds on the back
      var fa = clamp(foam.x, 0, 1.2), fd = '', fh = '';
      if (fa > 0.02) {
        var hc = B.headC;
        [[-150, -220, 62], [-60, -268, 74], [40, -270, 70], [130, -230, 64], [-10, -330, 58], [95, -300, 46], [-115, -290, 44]].forEach(function (q, i) {
          var r = q[2] * fa * (0.85 + 0.15 * Math.sin(t * 3 + i));
          fd += 'M' + (hc.x + q[0] - r).toFixed(1) + ',' + (hc.y + q[1]).toFixed(1) + 'a' + r.toFixed(1) + ',' + r.toFixed(1) + ' 0 1,0 ' + (2 * r).toFixed(1) + ',0a' + r.toFixed(1) + ',' + r.toFixed(1) + ' 0 1,0 ' + (-2 * r).toFixed(1) + ',0Z';
          fh += 'M' + (hc.x + q[0] - r * 0.25 - r * 0.22).toFixed(1) + ',' + (hc.y + q[1] - r * 0.35).toFixed(1) + 'a' + (r * 0.22).toFixed(1) + ',' + (r * 0.22).toFixed(1) + ' 0 1,0 ' + (r * 0.44).toFixed(1) + ',0a' + (r * 0.22).toFixed(1) + ',' + (r * 0.22).toFixed(1) + ' 0 1,0 ' + (-r * 0.44).toFixed(1) + ',0Z';
        });
        var bi = rig.bodyInfo;
        if (bi) [[-0.9, -0.55, 48], [0.85, -0.5, 52], [-0.6, 0.05, 40], [0.7, 0.1, 44]].forEach(function (q) {
          var r = q[2] * fa, x = bi.pelvis.x + q[0] * 170, y = bi.pelvis.y + q[1] * 170;
          fd += 'M' + (x - r).toFixed(1) + ',' + y.toFixed(1) + 'a' + r.toFixed(1) + ',' + r.toFixed(1) + ' 0 1,0 ' + (2 * r).toFixed(1) + ',0a' + r.toFixed(1) + ',' + r.toFixed(1) + ' 0 1,0 ' + (-2 * r).toFixed(1) + ',0Z';
        });
      }
      foamUl.setAttribute('d', fd); foamF.setAttribute('d', fd); foamHl.setAttribute('d', fh);
      // contact shadow
      var h = groundY - ry, vis = ry <= groundY + 1 ? 1 : 0, sh = 1 / (1 + Math.max(0, h) / (1.1 * hpx));
      shadow.setAttribute('cx', rx.toFixed(1)); shadow.setAttribute('cy', (groundY + 2).toFixed(1));
      shadow.setAttribute('rx', (0.62 * hpx * sh * (1 + 0.35 * Math.abs(Math.sin(B.yaw)))).toFixed(1)); shadow.setAttribute('ry', (0.075 * hpx * sh).toFixed(1));
      shadow.setAttribute('opacity', (0.18 * sh * vis).toFixed(3));
      // breath fog in front of the nose while pressed against the screen
      var fogA = clamp(glass.x, 0, 1) * (0.3 + 0.3 * Math.max(0, Math.sin(breathPh)));
      fogEl.setAttribute('cx', (rx + (P.hx - 46) * S).toFixed(1)); fogEl.setAttribute('cy', (ry + (P.hy - 595 + 70) * S).toFixed(1));
      fogEl.setAttribute('rx', (0.42 * hpx).toFixed(1)); fogEl.setAttribute('ry', (0.26 * hpx).toFixed(1)); fogEl.setAttribute('opacity', fogA.toFixed(3));
      // paw prints left on the screen
      while (prEls.length < prints.length) prEls.push(D.el('path', printsG, { fill: '#ffffff', stroke: '#ffffff', 'stroke-width': 1 }));
      prEls.forEach(function (e, i) {
        var p = prints[i];
        if (!p) { e.setAttribute('d', ''); return; }
        var pr = p.w * 0.4, d = '';
        [[0, 0.22, 1.25, 1], [-0.5, -0.28, 0.5, 0.55], [-0.17, -0.5, 0.5, 0.55], [0.17, -0.5, 0.5, 0.55], [0.5, -0.28, 0.5, 0.55]].forEach(function (q) {
          var x = p.x + q[0] * p.w, y = p.y + q[1] * p.h, a1 = pr * q[2], b1 = pr * q[3];
          d += 'M' + (x - a1).toFixed(1) + ',' + y.toFixed(1) + 'a' + a1.toFixed(1) + ',' + b1.toFixed(1) + ' 0 1,0 ' + (2 * a1).toFixed(1) + ',0a' + a1.toFixed(1) + ',' + b1.toFixed(1) + ' 0 1,0 ' + (-2 * a1).toFixed(1) + ',0Z';
        });
        e.setAttribute('d', d); e.setAttribute('opacity', (0.42 * (1 - ease(p.a / 1.6))).toFixed(3));
      });
      // particles
      while (pEls.length < particles.length) pEls.push(D.el('path', partG, {}));
      pEls.forEach(function (e, i) {
        var p = particles[i];
        if (!p || p.delay > 0) { e.setAttribute('d', ''); return; }
        var q = p.a / p.life, r = p.r * hpx / 180, x = p.x, y = p.y, d;
        var circle = function (rr) { return 'M' + (x - rr).toFixed(1) + ',' + y.toFixed(1) + 'a' + rr.toFixed(1) + ',' + rr.toFixed(1) + ' 0 1,0 ' + (2 * rr).toFixed(1) + ',0a' + rr.toFixed(1) + ',' + rr.toFixed(1) + ' 0 1,0 ' + (-2 * rr).toFixed(1) + ',0Z'; };
        if (p.type === 'drop') { d = circle(r); e.setAttribute('fill', '#eef7ff'); e.setAttribute('stroke', '#7fb0dc'); e.setAttribute('stroke-width', 1.5); e.setAttribute('opacity', (1 - q).toFixed(2)); }
        else if (p.type === 'flake') { d = circle(r); e.setAttribute('fill', '#ffffff'); e.setAttribute('stroke', '#a9c9e8'); e.setAttribute('stroke-width', 1.5); e.setAttribute('opacity', (1 - q).toFixed(2)); }
        else if (p.type === 'dust') { d = circle(r * (1 + 2 * q)); e.setAttribute('fill', '#fbf3e4'); e.setAttribute('stroke', '#e3d2b4'); e.setAttribute('stroke-width', 2); e.setAttribute('opacity', (0.9 * (1 - q)).toFixed(2)); }
        else if (p.type === 'bubble') { d = circle(r * (1 + 0.2 * q)); e.setAttribute('fill', 'rgba(255,255,255,0.35)'); e.setAttribute('stroke', '#ffffff'); e.setAttribute('stroke-width', 1.6); e.setAttribute('opacity', (q > 0.85 ? (1 - q) / 0.15 : 1).toFixed(2)); }
        else if (p.type === 'tuft') { d = circle(r) + (function () { var x0 = x, y0 = y, o = ''; x = x0 + r * 0.9; y = y0 + r * 0.25; o += circle(r * 0.75); x = x0 - r * 0.8; y = y0 + r * 0.35; o += circle(r * 0.7); x = x0; y = y0; return o; })(); e.setAttribute('fill', '#fff6e2'); e.setAttribute('stroke', '#4a2519'); e.setAttribute('stroke-width', 2.4); e.setAttribute('opacity', (1 - q * q).toFixed(2)); }
        else if (p.type === 'heart') {
          var hr = r * (q < 0.2 ? q / 0.2 : 1), hs = hr / 10;
          d = 'M' + x.toFixed(1) + ',' + (y + 9 * hs).toFixed(1) + 'C' + (x - 13 * hs).toFixed(1) + ',' + (y + 1 * hs).toFixed(1) + ' ' + (x - 11 * hs).toFixed(1) + ',' + (y - 10 * hs).toFixed(1) + ' ' + x.toFixed(1) + ',' + (y - 4 * hs).toFixed(1) +
              'C' + (x + 11 * hs).toFixed(1) + ',' + (y - 10 * hs).toFixed(1) + ' ' + (x + 13 * hs).toFixed(1) + ',' + (y + 1 * hs).toFixed(1) + ' ' + x.toFixed(1) + ',' + (y + 9 * hs).toFixed(1) + 'Z';
          e.setAttribute('fill', '#ff6b5e'); e.setAttribute('stroke', '#4a2519'); e.setAttribute('stroke-width', 2); e.setAttribute('opacity', (q > 0.7 ? (1 - q) / 0.3 : 1).toFixed(2));
        }
        else if (p.type === 'spark') {
          var sr = r * 1.4 * Math.sin(Math.PI * clamp(q, 0, 1)), c = Math.cos(p.rot * 0.2), s = Math.sin(p.rot * 0.2);
          d = STAR.replace(/(-?[\d.]+),(-?[\d.]+)/g, function (m0, a1, b1) { var px = +a1 * sr, py = +b1 * sr; return (x + px * c - py * s).toFixed(1) + ',' + (y + px * s + py * c).toFixed(1); });
          e.setAttribute('fill', '#ffe58a'); e.setAttribute('stroke', '#e8a83a'); e.setAttribute('stroke-width', 1.2); e.setAttribute('opacity', '1');
        }
        e.setAttribute('d', d);
      });
      // scissors
      if (scissors.vis > 0.01) {
        var sz = hpx / 180, ang = scissors.open * 22;
        scis.setAttribute('opacity', scissors.vis.toFixed(2));
        scis.setAttribute('transform', 'translate(' + scissors.x.toFixed(1) + ',' + scissors.y.toFixed(1) + ') scale(' + (sz * 1.35).toFixed(3) + ') rotate(-35)');
        scisA.setAttribute('transform', 'rotate(' + (-ang) + ')'); scisB.setAttribute('transform', 'rotate(' + ang + ')');
      } else scis.setAttribute('opacity', 0);
    }

    // ---------------- loop
    var last = performance.now(), raf = 0;
    function frame(now) {
      if (destroyed) return;
      var dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (!paused) { var n = Math.max(1, Math.ceil(dt / (1 / 240))); for (var i = 0; i < n; i++) update(dt / n); render(); }   // paused: keep the last frame, no redraw
      raf = requestAnimationFrame(frame);
    }
    if (opts.fluff) ['top', 'left', 'right', 'chest'].forEach(function (k) { fluff[k].x = fluff[k].t = opts.fluff; });
    if (opts.entrance === false) { rx = homeX; ry = groundY; start('idle'); } else start('entrance');
    update(0); render();
    raf = requestAnimationFrame(frame);

    var api = {
      scrub: function (state) {                                   // e.g. { haircut: 0.4 }; null ends scroll-driven mode
        var first = !scrub;
        scrub = state;
        if (first && state && state.haircut != null) { applyScrub(); CUT_SPOTS.forEach(function (k) { fluff[k].x = fluff[k].t; fluff[k].v = 0; }); }   // arrive already shaggy
        if (!state) { scissors.vis = 0; ['top', 'left', 'right', 'chest'].forEach(function (k) { fluff[k].set(0, 14, 0.6); }); scrubCut = {}; }
      },
      play: function (name) {                                     // ask for a behaviour; it waits for the current one to finish
        if (name === 'tilt') { if (curName === 'idle') { headTilt = (rnd() < 0.5 ? -1 : 1) * 0.28; BEH.idle.tiltUntil = t + 1.4; } return; }
        if (!BEH[name] || (reduced && name !== 'beg')) return;
        if (curName === 'idle') start(name); else if (curName !== name) pending = name;
      },
      busy: function () { return curName !== 'idle'; },
      svg: svg,
      place: function (x, y, h, extra) {                          // home spot and sitting height in stage px; place(null) = defaults
        fixed = x == null ? null : { x: x, y: y, h: h || 0 };
        if (fixed && extra) for (var k in extra) fixed[k] = extra[k];
        var wasHome = rx != null && Math.abs(ry - groundY) < 1 && (curName === 'idle' || curName === 'none');
        layout();
        if (wasHome) { rx = homeX; ry = groundY; legs.forEach(function (lg) { lg.W = null; }); }
      },
      metrics: function () { return { W: W, H: H, hpx: hpx, x: rx, y: ry, head: { x: headPos.x, y: headPos.y } }; },
      hit: function (cx, cy) {                                    // which part of the dog is under a viewport point: 'head', 'body' or ''
        var x = cx - sRect.left, y = cy - sRect.top;
        if (Math.hypot(x - headPos.x, (y - headPos.y) * 1.15) < 0.4 * hpx) return 'head';
        if (Math.abs(x - rx) < 0.42 * hpx && y < ry + 4 && y > ry - 0.75 * hpx) return 'body';
        return '';
      },
      set: function (st) {                                        // snap looks: { fluff: 0..1, bandana: 0..1, foam: 0..1 }
        if (st.fluff != null) ['top', 'left', 'right', 'chest'].forEach(function (k) { if (st.snap === false) fluff[k].set(st.fluff, 4, 1); else { fluff[k].x = fluff[k].t = st.fluff; fluff[k].v = 0; } });
        if (st.bandana != null) { bandana.x = bandana.t = st.bandana; bandana.v = 0; }
        if (st.foam != null) { foam.x = foam.t = st.foam; foam.v = 0; }
      },
      notify: function (name) {
        if (name === 'form-focus') { focusInForm = true; if (curName !== 'beg') maybeBeg(); }
        else if (name === 'form-blur') focusInForm = false;
        else if (name === 'form-submit-success') { focusInForm = false; request('celebrate'); }
        else if (name === 'form-error') { headTilt = 0.3; setTimeout(function () { headTilt = 0; }, 1200); }
        else if (name === 'service-bath') request('bath');
        else if (name === 'service-haircut') request('haircut');
      },
      destroy: function () {
        destroyed = true; cancelAnimationFrame(raf);
        window.removeEventListener('pointermove', onMove); document.removeEventListener('mouseout', onLeave); window.removeEventListener('scroll', onScroll);
        if (ro) ro.disconnect(); else window.removeEventListener('resize', layout);
        if (svg.parentNode) svg.parentNode.removeChild(svg);
        if (opts.canvas) opts.canvas.style.display = '';
      },
      debug: {
        pause: function () { paused = true; }, resume: function () { paused = false; last = performance.now(); },
        step: function (ms) { var n = Math.max(1, Math.ceil(ms / (1000 / 240))); for (var i = 0; i < n; i++) update(ms / 1000 / n); render(); },
        trigger: function (name) { if (BEH[name]) { pending = null; start(name); } },
        state: function () { return curName + (cur && cur.step != null ? ':' + cur.step : ''); },
        setPointer: function (x, y) { onMove({ clientX: x, clientY: y }); }
      }
    };
    return api;
  }

  window.PuppyDog.create = create;
})();
