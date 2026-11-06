/* PuppyDog v0 (prototype: static rig) */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var PI = Math.PI;

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function sat(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function f1(v) { return Math.round(v * 10) / 10; }

  var COL = {
    ol: '#4a2519', fur: '#fff6e2', furShade: '#f3dab4', car: '#ebb77c', carHead: '#efc287', carShade: '#dda266',
    chest: '#f6dfbd', eye: '#3e1d18', nose: '#33170f', blush: '#f7b3a3', tongue: '#f5948f', tongueDark: '#dc6b60',
    mouth: '#4a2519', pad: '#f6a9ad', padDark: '#f2919a', toe: '#cfa47a', white: '#ffffff'
  };
  var OW = 20; // outline width (du)

  /* ---------- path builders ---------- */
  function crClosed(xs, ys, n, k, sh) {
    var s = 'M' + f1(xs[0]) + ',' + f1(ys[0]);
    for (var i = 0; i < n; i++) {
      var a = i === 0 ? n - 1 : i - 1, b = i, c = (i + 1) % n, d = (i + 2) % n;
      var kb = sh ? k * (1 - sh[b]) : k, kc = sh ? k * (1 - sh[c]) : k;
      s += 'C' + f1(xs[b] + (xs[c] - xs[a]) * kb) + ',' + f1(ys[b] + (ys[c] - ys[a]) * kb) + ' ' +
        f1(xs[c] - (xs[d] - xs[b]) * kc) + ',' + f1(ys[c] - (ys[d] - ys[b]) * kc) + ' ' + f1(xs[c]) + ',' + f1(ys[c]);
    }
    return s + 'Z';
  }
  function crOpen(xs, ys, n, k) {
    var s = 'M' + f1(xs[0]) + ',' + f1(ys[0]);
    for (var i = 0; i < n - 1; i++) {
      var a = i === 0 ? 0 : i - 1, b = i, c = i + 1, d = i + 2 >= n ? n - 1 : i + 2;
      s += 'C' + f1(xs[b] + (xs[c] - xs[a]) * k) + ',' + f1(ys[b] + (ys[c] - ys[a]) * k) + ' ' +
        f1(xs[c] - (xs[d] - xs[b]) * k) + ',' + f1(ys[c] - (ys[d] - ys[b]) * k) + ' ' + f1(xs[c]) + ',' + f1(ys[c]);
    }
    return s;
  }
  // sub-range of a closed CR loop, from fractional index u0 to u1 (u1 > u0, may exceed n to wrap)
  var _bz = new Float64Array(8);
  function bezSub(p, t0, t1) { // p: [x0,y0,x1,y1,x2,y2,x3,y3] in place -> sub-curve [t0,t1]
    // split at t1 keep left
    splitLeft(p, t1);
    if (t1 > 1e-6) splitRight(p, t0 / t1);
  }
  function splitLeft(p, t) {
    var x01 = lerp(p[0], p[2], t), y01 = lerp(p[1], p[3], t), x12 = lerp(p[2], p[4], t), y12 = lerp(p[3], p[5], t),
      x23 = lerp(p[4], p[6], t), y23 = lerp(p[5], p[7], t), xa = lerp(x01, x12, t), ya = lerp(y01, y12, t),
      xb = lerp(x12, x23, t), yb = lerp(y12, y23, t), xm = lerp(xa, xb, t), ym = lerp(ya, yb, t);
    p[2] = x01; p[3] = y01; p[4] = xa; p[5] = ya; p[6] = xm; p[7] = ym;
  }
  function splitRight(p, t) {
    var x01 = lerp(p[0], p[2], t), y01 = lerp(p[1], p[3], t), x12 = lerp(p[2], p[4], t), y12 = lerp(p[3], p[5], t),
      x23 = lerp(p[4], p[6], t), y23 = lerp(p[5], p[7], t), xa = lerp(x01, x12, t), ya = lerp(y01, y12, t),
      xb = lerp(x12, x23, t), yb = lerp(y12, y23, t), xm = lerp(xa, xb, t), ym = lerp(ya, yb, t);
    p[0] = xm; p[1] = ym; p[2] = xb; p[3] = yb; p[4] = x23; p[5] = y23;
  }
  function crSeg(xs, ys, n, i, k, sh, out) {
    var a = (i - 1 + n) % n, b = i % n, c = (i + 1) % n, d = (i + 2) % n;
    var kb = sh ? k * (1 - sh[b]) : k, kc = sh ? k * (1 - sh[c]) : k;
    out[0] = xs[b]; out[1] = ys[b];
    out[2] = xs[b] + (xs[c] - xs[a]) * kb; out[3] = ys[b] + (ys[c] - ys[a]) * kb;
    out[4] = xs[c] - (xs[d] - xs[b]) * kc; out[5] = ys[c] - (ys[d] - ys[b]) * kc;
    out[6] = xs[c]; out[7] = ys[c];
  }
  function crSub(xs, ys, n, u0, u1, k, sh) {
    var s = '', first = true;
    var i0 = Math.floor(u0), i1 = Math.ceil(u1) - 1;
    for (var i = i0; i <= i1; i++) {
      crSeg(xs, ys, n, ((i % n) + n) % n, k, sh, _bz);
      var t0 = i === i0 ? u0 - i0 : 0, t1 = i === i1 ? u1 - i : 1;
      if (t0 > 0 || t1 < 1) bezSub(_bz, t0, t1);
      if (first) { s += 'M' + f1(_bz[0]) + ',' + f1(_bz[1]); first = false; }
      s += 'C' + f1(_bz[2]) + ',' + f1(_bz[3]) + ' ' + f1(_bz[4]) + ',' + f1(_bz[5]) + ' ' + f1(_bz[6]) + ',' + f1(_bz[7]);
    }
    return s;
  }
  var KAP = 0.5522847;
  function ellPath(cx, cy, ux, uy, vx, vy) {
    return 'M' + f1(cx + ux) + ',' + f1(cy + uy) +
      'C' + f1(cx + ux + KAP * vx) + ',' + f1(cy + uy + KAP * vy) + ' ' + f1(cx + vx + KAP * ux) + ',' + f1(cy + vy + KAP * uy) + ' ' + f1(cx + vx) + ',' + f1(cy + vy) +
      'C' + f1(cx + vx - KAP * ux) + ',' + f1(cy + vy - KAP * uy) + ' ' + f1(cx - ux + KAP * vx) + ',' + f1(cy - uy + KAP * vy) + ' ' + f1(cx - ux) + ',' + f1(cy - uy) +
      'C' + f1(cx - ux - KAP * vx) + ',' + f1(cy - uy - KAP * vy) + ' ' + f1(cx - vx - KAP * ux) + ',' + f1(cy - vy - KAP * uy) + ' ' + f1(cx - vx) + ',' + f1(cy - vy) +
      'C' + f1(cx - vx + KAP * ux) + ',' + f1(cy - vy + KAP * uy) + ' ' + f1(cx + ux - KAP * vx) + ',' + f1(cy + uy - KAP * vy) + ' ' + f1(cx + ux) + ',' + f1(cy + uy) + 'Z';
  }

  /* ---------- 2D affine ---------- */
  function mat() { return new Float64Array([1, 0, 0, 1, 0, 0]); }
  function mTRS(o, px, py, tx, ty, r, sx, sy) {
    var c = Math.cos(r), s = Math.sin(r);
    o[0] = c * sx; o[1] = s * sx; o[2] = -s * sy; o[3] = c * sy;
    o[4] = px + tx - (o[0] * px + o[2] * py); o[5] = py + ty - (o[1] * px + o[3] * py);
    return o;
  }
  function mMul(o, m, n) {
    var a = m[0] * n[0] + m[2] * n[1], b = m[1] * n[0] + m[3] * n[1], c = m[0] * n[2] + m[2] * n[3], d = m[1] * n[2] + m[3] * n[3],
      e = m[0] * n[4] + m[2] * n[5] + m[4], f = m[1] * n[4] + m[3] * n[5] + m[5];
    o[0] = a; o[1] = b; o[2] = c; o[3] = d; o[4] = e; o[5] = f; return o;
  }
  function mx(m, x, y) { return m[0] * x + m[2] * y + m[4]; }
  function my(m, x, y) { return m[1] * x + m[3] * y + m[5]; }

  /* ---------- shape buffers ---------- */
  function Shape(pts) {
    this.n = pts.length; this.bx = new Float64Array(this.n); this.by = new Float64Array(this.n);
    this.xs = new Float64Array(this.n); this.ys = new Float64Array(this.n);
    for (var i = 0; i < this.n; i++) { this.bx[i] = pts[i][0]; this.by[i] = pts[i][1]; }
  }
  Shape.prototype.xform = function (m) {
    for (var i = 0; i < this.n; i++) { var x = this.xs[i], y = this.ys[i]; this.xs[i] = mx(m, x, y); this.ys[i] = my(m, x, y); }
  };
  Shape.prototype.reset = function () { this.xs.set(this.bx); this.ys.set(this.by); };

  function mirrorPts(pts) { return pts.map(function (p) { return [-p[0], p[1]]; }); }

  /* ---------- art data: head (head-local, origin = head centre at eye line) ---------- */
  var HEAD_HALF = [[0, -273], [95, -265], [172, -232], [212, -180], [228, -110], [231, -30], [236, 40], [252, 100], [250, 145], [218, 188], [150, 222]];
  var HEAD_PTS = HEAD_HALF.concat([[0, 240]]).concat(mirrorPts(HEAD_HALF.slice(1)).reverse());
  // indices: 0 top, 1..10 right side, 11 bottom, 12..21 left side (12 = (-150,222) ... 21 = (-95,-265))
  var EAR_L = [[-189, -216], [-225, -221], [-273, -205], [-318, -171], [-363, -135], [-397, -98], [-416, -53], [-421, 0], [-412, 50],
    [-393, 90], [-360, 124], [-315, 141], [-278, 136], [-250, 122], [-200, 70], [-192, -20], [-182, -110], [-168, -180]];
  var EAR_PIVOT = [-200, -190];
  var PATCH_L = [[-62, -330], [-66, -262], [-58, -200], [-50, -130], [-46, -70], [-45, -20], [-48, 15], [-62, 45], [-90, 60], [-122, 64],
    [-160, 62], [-200, 75], [-240, 100], [-290, 130], [-340, 60], [-340, -330]];
  var PATCH_SH = null;
  var NOSE = [[-43, -6], [-30, -23], [0, -29], [30, -23], [43, -6], [36, 14], [17, 29], [0, 33], [-17, 29], [-36, 14]];
  var MOUTH_W = [[-86, 99], [-64, 114], [-40, 119], [-17, 112], [0, 101], [17, 112], [40, 119], [64, 114], [86, 99]];
  var MOUTH_O = [[-41, 117], [-20, 110], [0, 103], [20, 110], [41, 117], [37, 142], [21, 162], [0, 168], [-21, 162], [-37, 142]];
  var TONGUE = [[-37, 121], [0, 118], [37, 121], [41, 150], [35, 181], [17, 200], [0, 205], [-17, 200], [-35, 181], [-41, 150]];
  var EYE = { x: 121, y: 5, r: 41 };
  // hanging tongue, tongue-local (root at the mouth centre, +y down); top edge hides under the upper-lip line
  var TONGUE2 = [[-28, -4], [-31, 16], [-30, 44], [-25, 68], [-14, 83], [0, 87], [14, 83], [25, 68], [30, 44], [31, 16], [28, -4], [0, -12]];

  /* ---------- art data: body, 3/4 sit (dog space: ref - (512,965)) ---------- */
  var TORSO_3Q = [[-152, -392], [-207, -366], [-213, -340], [-224, -316], [-236, -297], [-213, -291], [-220, -266], [-224, -243], [-208, -231],
    [-205, -170], [-196, -100], [-182, -45], [-150, -26], [-60, -22], [10, -18], [138, -5], [218, 7], [288, -5], [324, -40], [336, -95], [331, -150],
    [316, -200], [293, -250], [268, -297], [243, -335], [222, -368], [238, -386], [206, -408], [130, -420], [-42, -420]];
  var TORSO_SH = null;
  var HAUNCH_R = [[273, -190], [233, -192], [193, -180], [168, -155], [153, -115], [145, -65], [148, -15], [188, 3], [248, 3], [298, -10],
    [326, -45], [336, -95], [330, -150], [308, -180]];
  var HAUNCH_L = [[-207, -180], [-230, -165], [-244, -125], [-242, -80], [-227, -53], [-202, -33], [-172, -35], [-172, -165]];
  var TAIL = [[318, -170], [340, -205], [360, -222], [393, -223], [413, -197], [418, -155], [406, -115], [378, -89], [343, -77], [318, -85], [300, -120]];
  var TAIL_TIP = [[322, -140], [348, -152], [358, -128], [372, -150], [382, -122], [402, -134], [440, -80], [320, -50]];
  var CHEST = [[-114, -353], [-72, -347], [-32, -349], [8, -353], [48, -360], [36, -335], [18, -337], [8, -305], [-7, -315], [-22, -297],
    [-42, -310], [-62, -290], [-77, -315], [-97, -325], [-107, -340]];
  var BACKPATCH = [[193, -372], [185, -350], [176, -325], [168, -275], [178, -235], [208, -210], [268, -195], [323, -165], [360, -265], [258, -420]];

  /* ---------- scene ---------- */
  function el(tag, parent, attrs) {
    var e = document.createElementNS(NS, tag);
    if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  var uid = 0;
  function Scene(root) {
    var id = 'pd' + (++uid) + '-';
    this.id = id;
    var defs = el('defs', root);
    var S = this;
    function clip(name) { var c = el('clipPath', defs, { id: id + name }); S['c_' + name] = el('path', c); return 'url(#' + id + name + ')'; }
    var cHead = clip('head'), cTorso = clip('torso'), cEarL = clip('earL'), cEarR = clip('earR'), cTail = clip('tail'), cHaunchR = clip('haunchR');
    function ul(p) { return el('path', p, { fill: COL.ol, stroke: COL.ol, 'stroke-width': OW * 2, 'stroke-linejoin': 'round' }); }
    function fill(p, c, extra) { var e = el('path', p, { fill: c }); if (extra) for (var k in extra) e.setAttribute(k, extra[k]); return e; }
    function line(p, c, w) { return el('path', p, { fill: 'none', stroke: c || COL.ol, 'stroke-width': w || OW, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }); }
    var g = this.front = el('g', root);
    this.bodyG = el('g', g);                              // articulated body (body.js) draws here, behind ears and head
    // tail (own group, behind)
    this.tailUl = ul(g); this.tailF = fill(g, COL.fur);
    var gt = el('g', g, { 'clip-path': cTail }); this.tailTip = fill(gt, COL.car);
    // body underlay group
    this.ulHaunchL = ul(g); this.ulTorso = ul(g); this.ulHaunchR = ul(g); this.ulLegL = ul(g); this.ulLegR = ul(g); this.ulHead = ul(g);
    this.haunchLF = fill(g, COL.furShade);
    this.torsoF = fill(g, COL.fur);
    var gtc = el('g', g, { 'clip-path': cTorso });
    this.backPatch = fill(gtc, COL.car); this.chest = fill(gtc, COL.chest); this.gapShade = fill(gtc, COL.furShade);
    this.furAcc = line(gtc, COL.furShade, 14);
    this.haunchRF = fill(g, COL.fur);
    var ghr = el('g', g, { 'clip-path': cHaunchR }); this.haunchRPatch = fill(ghr, COL.car); this.hindAcc = line(ghr, COL.furShade, 12);
    this.legLF = fill(g, COL.fur); this.legRF = fill(g, COL.fur);
    this.bodyLines = line(g); this.toes = line(g, COL.toe, 13);
    // ears
    this.earLUl = ul(g); this.earRUl = ul(g);
    this.earLF = fill(g, COL.car); this.earRF = fill(g, COL.car);
    var gel = el('g', g, { 'clip-path': cEarL }); this.earLSh = fill(gel, COL.carShade);
    var ger = el('g', g, { 'clip-path': cEarR }); this.earRSh = fill(ger, COL.carShade);
    // head
    this.headF = fill(g, COL.fur);
    var gh = el('g', g, { 'clip-path': cHead });
    this.patchL = fill(gh, COL.carHead); this.patchR = fill(gh, COL.carHead);
    this.blushL = fill(gh, COL.blush, { opacity: 0.45 }); this.blushR = fill(gh, COL.blush, { opacity: 0.45 });
    this.tongueShadow = fill(gh, '#e9cba0', { opacity: 0.9 });  // soft shadow the hanging tongue casts on the chin
    this.headLines = line(g);
    // face
    this.mouthO = fill(g, '#5a2420');                       // mouth cavity: dark red-brown, not outline colour
    var cMouth = clip('mouth');
    var gm = el('g', g, { 'clip-path': cMouth }); this.tongueF = fill(gm, COL.tongue); this.tongueD = fill(gm, COL.tongueDark);
    this.tongueGroove = line(gm, '#d9707a', 7); this.tongueHL = fill(gm, '#fcc9c6');
    this.tongueOl = line(g, COL.ol, 8);                     // own thin outline separates the tongue from the chin
    this.mouthW = line(g, COL.ol, 15);
    this.nose = fill(g, COL.nose);
    this.eyeL = fill(g, '#4b2219'); this.eyeR = fill(g, '#4b2219');   // iris
    var cEyeL = clip('eyeL'), cEyeR = clip('eyeR');
    var geL = el('g', g, { 'clip-path': cEyeL }); this.rimL = fill(geL, '#8c5138'); this.pupL = fill(geL, '#170705');
    var geR = el('g', g, { 'clip-path': cEyeR }); this.rimR = fill(geR, '#8c5138'); this.pupR = fill(geR, '#170705');
    this.hlL = fill(g, COL.white); this.hlR = fill(g, COL.white);
    this.hl2L = fill(g, COL.white); this.hl2R = fill(g, COL.white);
    this.hl3L = fill(g, COL.white); this.hl3R = fill(g, COL.white);    // extra sparkle for pleading eyes
    this.happyL = line(g, COL.ol, 15); this.happyR = line(g, COL.ol, 15); // closed happy eyes ^ ^
    this.browL = line(g, COL.ol, 11); this.browR = line(g, COL.ol, 11);   // worried brows for begging
    var gbg = el('g', g, { 'clip-path': cHead });                // overgrown bangs (haircut scene), over the eyes
    this.bangsF = fill(gbg, COL.carHead); this.bangsLines = line(gbg, COL.carShade, 9); this.bangsEdge = line(gbg, COL.ol, 13);
    this.overG = el('g', g);                                    // in front of the face: paws pressed on the screen
  }

  /* ---------- rig ---------- */
  function Rig(scene) {
    this.s = scene;
    this.head = new Shape(HEAD_PTS); this.earL = new Shape(EAR_L); this.earR = new Shape(mirrorPts(EAR_L));
    this.patchL = new Shape(PATCH_L); this.patchR = new Shape(mirrorPts(PATCH_L));
    this.nose = new Shape(NOSE); this.mw = new Shape(MOUTH_W); this.mo = new Shape(MOUTH_O); this.tongue = new Shape(TONGUE);
    this.torso = new Shape(TORSO_3Q); this.haunchR = new Shape(HAUNCH_R); this.haunchL = new Shape(HAUNCH_L);
    this.tail = new Shape(TAIL); this.tailTip = new Shape(TAIL_TIP); this.chest = new Shape(CHEST); this.backPatch = new Shape(BACKPATCH);
    this.mHead = mat(); this.mTmp = mat();
  }
  // face projection: head-local front-view point -> rotated point (yaw, pitch)
  var FACE = { rx: 250, ry: 285, y0: -5, zc: 205 };
  function faceZ(x, y) {
    var u = x / FACE.rx, w = (y - FACE.y0) / FACE.ry, q = 1 - u * u - w * w;
    return q > 0 ? FACE.zc * Math.sqrt(q) : 0;
  }
  Rig.prototype.projShape = function (sh, yaw, pitch, bump) {
    var cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    for (var i = 0; i < sh.n; i++) {
      var x = sh.xs[i], y = sh.ys[i], z = faceZ(x, y) + (bump || 0);
      var x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
      var y1 = (y - FACE.y0) * cp - z1 * sp + FACE.y0;
      sh.xs[i] = x1; sh.ys[i] = y1;
    }
  };
  Rig.prototype.projPt = function (x, y, yaw, pitch, bump, out) {
    var cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    var z = faceZ(x, y) + (bump || 0);
    var x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
    out[0] = x1; out[1] = (y - FACE.y0) * cp - z1 * sp + FACE.y0; out[2] = z1;
  };

  var _p = new Float64Array(3);
  Rig.prototype.render = function (P) {
    var S = this.s, m = this.mHead;
    var yaw = P.hyaw, pitch = P.hpitch;
    // head matrix: head-local -> dog space
    var hx = -46 + P.hx, hy = -595 + P.hy;
    mTRS(m, 0, 220, hx, hy, P.hroll, 1, 1);
    // --- head outline with subtle turn deformation
    var H = this.head; H.reset();
    var cyaw = Math.cos(yaw);
    for (var i = 0; i < H.n; i++) {
      var x = H.xs[i], y = H.ys[i];
      var lower = clamp((y + 40) / 200, 0, 1), upper = clamp(-y / 250, 0, 1);
      var side = x / 250;
      // turn side (sign(x)==sign(yaw)) lower cheek bulges, the back of the cranium extends
      var dx = yaw * (18 * lower * Math.max(0, side * Math.sign(yaw) ) * Math.sign(yaw) / Math.max(1e-6, Math.abs(Math.sign(yaw))) );
      dx = 0;
      x = x * (0.985 + 0.015 * cyaw) + yaw * (22 * lower * (side > 0 === yaw > 0 ? 1 : 0.2) - 30 * upper * (1 - Math.abs(side)) );
      H.xs[i] = x;
    }
    H.xform(m);
    var dHead = crClosed(H.xs, H.ys, H.n, 1 / 6);
    S.headF.setAttribute('d', dHead); S.ulHead.setAttribute('d', dHead); S.c_head.setAttribute('d', dHead);
    S.headLines.setAttribute('d', crSub(H.xs, H.ys, H.n, 3.5, 8.6, 1 / 6) + crSub(H.xs, H.ys, H.n, 13.4, 18.5, 1 / 6));
    // --- ears
    this.ear(this.earL, 1, P.earL, P.earLb, yaw, m, S.earLF, S.earLUl, S.c_earL, S.earLSh);
    this.ear(this.earR, -1, P.earR, P.earRb, yaw, m, S.earRF, S.earRUl, S.c_earR, S.earRSh);
    // --- patches
    var pl = this.patchL; pl.reset(); this.projShape(pl, yaw, pitch, 0); pl.xform(m);
    S.patchL.setAttribute('d', crClosed(pl.xs, pl.ys, pl.n, 1 / 6));
    var pr = this.patchR; pr.reset(); this.projShape(pr, yaw, pitch, 0); pr.xform(m);
    S.patchR.setAttribute('d', crClosed(pr.xs, pr.ys, pr.n, 1 / 6));
    // --- eyes
    this.eye(-1, P, m, S.eyeL, S.hlL); this.eye(1, P, m, S.eyeR, S.hlR);
    // blush
    this.blob(-160, 92, 40, 22, yaw, pitch, m, S.blushL); this.blob(160, 92, 40, 22, yaw, pitch, m, S.blushR);
    // --- nose
    var nz = this.nose; nz.reset();
    this.projPt(0, 42, yaw, pitch, 38, _p); var ncx = _p[0], ncy = _p[1];
    var nsx = 0.92 + 0.08 * cyaw;
    for (i = 0; i < nz.n; i++) { nz.xs[i] = ncx + nz.xs[i] * nsx; nz.ys[i] = ncy + nz.ys[i]; }
    nz.xform(m); S.nose.setAttribute('d', crClosed(nz.xs, nz.ys, nz.n, 1 / 6));
    // --- mouth
    var open = P.mouthOpen, tg = P.tongue;
    var mw = this.mw; mw.reset(); this.projShape(mw, yaw, pitch, 30); mw.xform(m);
    S.mouthW.setAttribute('d', crOpen(mw.xs, mw.ys, mw.n, 1 / 6));
    var mo = this.mo; mo.reset();
    for (i = 0; i < mo.n; i++) mo.xs[i] *= 1.3;                 // cavity wider than the tongue: dark shows on both sides
    for (i = 5; i < 10; i++) mo.ys[i] = 117 + (mo.ys[i] - 117) * open;
    this.projShape(mo, yaw, pitch, 30); mo.xform(m);
    var dmo = crClosed(mo.xs, mo.ys, mo.n, 1 / 6);
    S.mouthO.setAttribute('d', dmo);
    // --- tongue: a soft pendulum hanging out of the mouth in dog space, not a decal painted onto the face
    this.projPt(0, 118, yaw, pitch, 36, _p);
    var trx = mx(m, _p[0], _p[1]), trY = my(m, _p[0], _p[1]);
    var T = this.tg || (this.tg = { a: 0, v: 0, px: 0, py: 0, vx: 0, vy: 0, ax: 0, ay: 0, init: false });
    var fdt = P.dt || 0;
    if (!T.init || fdt <= 0) { T.px = trx; T.py = trY; T.vx = T.vy = T.ax = T.ay = 0; T.init = true; }
    else {
      var tvx = (trx - T.px) / fdt, tvy = (trY - T.py) / fdt;
      T.ax = T.ax * 0.5 + ((tvx - T.vx) / fdt) * 0.5; T.ay = T.ay * 0.5 + ((tvy - T.vy) / fdt) * 0.5;
      T.vx = tvx; T.vy = tvy; T.px = trx; T.py = trY;
      var Lp = 90, G = 24000, ns = Math.max(1, Math.ceil(fdt * 240)), hstep = fdt / ns;
      for (var k = 0; k < ns; k++) {   // root acceleration swings the tip; gravity pulls it back to hanging straight down
        var acc = -((G - T.ay) / Lp) * Math.sin(T.a) + (T.ax / Lp) * Math.cos(T.a) - 6.5 * T.v;
        T.v += acc * hstep; T.a = clamp(T.a + T.v * hstep, -0.75, 0.75);
      }
    }
    var len = 0.78 + 0.38 * tg, fsx = 0.86 + 0.14 * Math.cos(yaw);
    var to = this.tongue2 || (this.tongue2 = { xs: new Float64Array(TONGUE2.length), ys: new Float64Array(TONGUE2.length), n: TONGUE2.length });
    function tp(lx, ly, out) {                                 // tongue-local -> dog space; the tip swings more than the root
      var b = T.a * (0.15 + 0.85 * clamp(ly / 88, 0, 1)), c = Math.cos(b), s = Math.sin(b);
      out[0] = trx + lx * c - ly * s; out[1] = trY + lx * s + ly * c;
    }
    for (i = 0; i < to.n; i++) {
      tp(TONGUE2[i][0] * fsx, TONGUE2[i][1] > 0 ? TONGUE2[i][1] * len : TONGUE2[i][1], _p);
      to.xs[i] = _p[0]; to.ys[i] = _p[1];
    }
    var dto = crClosed(to.xs, to.ys, to.n, 1 / 6);
    S.tongueF.setAttribute('d', dto); S.tongueD.setAttribute('d', ''); S.tongueOl.setAttribute('d', dto);
    S.c_mouth.setAttribute('d', dto);
    var q0 = [0, 0], q1 = [0, 0], q2 = [0, 0];
    tp(0, 14, q0); tp(1, 40 * len, q1); tp(0, 62 * len, q2);
    S.tongueGroove.setAttribute('d', 'M' + f1(q0[0]) + ',' + f1(q0[1]) + 'Q' + f1(q1[0]) + ',' + f1(q1[1]) + ' ' + f1(q2[0]) + ',' + f1(q2[1]));
    tp(-15 * fsx, 34 * len, q1);
    S.tongueHL.setAttribute('d', ellPath(q1[0], q1[1], 7, 0, 0, 10));
    tp(4, 60 * len, q2);                                       // shadow on the chin, offset down-right
    S.tongueShadow.setAttribute('d', ellPath(q2[0] + 9, q2[1] + 14, 34 * fsx, 0, 0, 22));
    // --- body
    // --- bangs: pointed strands falling over the top of the eyes; shrink upward as they are cut
    var bg = clamp(P.bangs || 0, 0, 1.2);
    if (bg > 0.02) {
      var self = this, hp = function (x, y) { self.projPt(x, y, yaw, pitch, 6, _p); return [mx(m, _p[0], _p[1]), my(m, _p[0], _p[1])]; };
      var yb = lerp(-175, 5, bg), bk = Math.min(1, bg), dB = '', edge, q, i;
      for (i = 0; i <= 14; i++) { var th = Math.PI * (1 + i / 14); q = hp(Math.cos(th) * 270, -10 + Math.sin(th) * 300); dB += (i ? 'L' : 'M') + f1(q[0]) + ',' + f1(q[1]); }
      var prev = hp(262, yb - 40);
      dB += 'L' + f1(prev[0]) + ',' + f1(prev[1]); edge = 'M' + f1(prev[0]) + ',' + f1(prev[1]);
      for (i = 0; i < 8; i++) {                                    // strands hang down, each curving to a soft point
        var xv0 = 262 - 524 * i / 8, xv1 = 262 - 524 * (i + 1) / 8, lean = (i % 2 ? 9 : -12);
        var tl = (i % 3 === 1 ? 24 : 36) + ((i * 37) % 4) * 5, xt = (xv0 + xv1) / 2 + lean;
        var tip = hp(xt, yb + tl * bk), c1 = hp(xv0 - 4, yb + tl * 0.75 * bk), c2 = hp(xt - lean * 0.3, yb - 10 * bk), val = hp(xv1, yb - 26 * bk);
        var seg = 'Q' + f1(c1[0]) + ',' + f1(c1[1]) + ' ' + f1(tip[0]) + ',' + f1(tip[1]) + 'Q' + f1(c2[0]) + ',' + f1(c2[1]) + ' ' + f1(val[0]) + ',' + f1(val[1]);
        dB += seg; edge += seg; prev = val;
      }
      S.bangsF.setAttribute('d', dB + 'Z'); S.bangsEdge.setAttribute('d', edge);
      var strands = '';
      [-150, -75, 0, 75, 150].forEach(function (x) { var a1 = hp(x * 0.8, -210), a2 = hp(x, yb - 6); strands += 'M' + f1(a1[0]) + ',' + f1(a1[1]) + 'L' + f1(a2[0]) + ',' + f1(a2[1]); });
      S.bangsLines.setAttribute('d', strands);
    } else { S.bangsF.setAttribute('d', ''); S.bangsEdge.setAttribute('d', ''); S.bangsLines.setAttribute('d', ''); }
    this.body(P);
  };
  Rig.prototype.blob = function (x, y, rx, ry, yaw, pitch, m, elx) {
    this.projPt(x, y, yaw, pitch, 0, _p);
    var cx = _p[0], cy = _p[1];
    var fs = Math.cos(clamp(yaw + Math.atan2(x, faceZ(x, y) + 1), -1.5, 1.5)) / Math.cos(Math.atan2(x, faceZ(x, y) + 1));
    var ux = rx * fs, vy = ry;
    elx.setAttribute('d', ellPath(mx(m, cx, cy), my(m, cx, cy), m[0] * ux, m[1] * ux, m[2] * vy, m[3] * vy));
  };
  Rig.prototype.eye = function (side, P, m, eEl, hEl) {
    var ex = side * EYE.x, ey = EYE.y, yaw = P.hyaw, pitch = P.hpitch, S = this.s, L = side < 0;
    this.projPt(ex, ey, yaw, pitch, 0, _p);
    var cx = _p[0], cy = _p[1];                               // the eye itself stays put on the face
    var lon = Math.atan2(ex, faceZ(ex, ey) + 1);
    var fs = Math.cos(clamp(yaw + lon, -1.5, 1.5)) / Math.cos(lon);
    var sq = clamp(0.55 + 0.45 * fs, 0.5, 1.08);
    var r = EYE.r, rx = r * sq, ry = r * P.eyeOpen;
    var X = mx(m, cx, cy), Y = my(m, cx, cy);
    // worried brows (inner ends raised) for the pleading look
    var bw = P.brow || 0, bEl = S[L ? 'browL' : 'browR'];
    if (bw > 0.02) {
      var ox = cx + side * r * 0.95 * sq, oy = cy - r * 1.3, ix = cx - side * r * 0.1 * sq, iy = cy - r * 1.3 - r * 0.55 * bw;
      bEl.setAttribute('d', 'M' + f1(mx(m, ox, oy)) + ',' + f1(my(m, ox, oy)) + 'Q' + f1(mx(m, (ox + ix) / 2, (oy + iy) / 2 - r * 0.12)) + ',' + f1(my(m, (ox + ix) / 2, (oy + iy) / 2 - r * 0.12)) + ' ' + f1(mx(m, ix, iy)) + ',' + f1(my(m, ix, iy)));
      bEl.setAttribute('opacity', Math.min(1, bw * 1.6).toFixed(2));
    } else bEl.setAttribute('d', '');
    // closed happy eyes: an upward arc replaces the eye
    var hEye = S[L ? 'happyL' : 'happyR'];
    if ((P.eyeHappy || 0) > 0.5) {
      ['c_eyeL', 'rimL', 'pupL', 'hl2L', 'hl3L'].forEach(function (k) { S[L ? k : k.replace('L', 'R')].setAttribute('d', ''); });
      eEl.setAttribute('d', ''); hEl.setAttribute('d', '');
      var ax = cx - r * 0.85 * sq, ay = cy + r * 0.25, qx = cx, qy = cy - r * 0.95, bx2 = cx + r * 0.85 * sq;
      hEye.setAttribute('d', 'M' + f1(mx(m, ax, ay)) + ',' + f1(my(m, ax, ay)) + 'Q' + f1(mx(m, qx, qy)) + ',' + f1(my(m, qx, qy)) + ' ' + f1(mx(m, bx2, ay)) + ',' + f1(my(m, bx2, ay)));
      return;
    }
    hEye.setAttribute('d', '');
    var dEye = ellPath(X, Y, m[0] * rx, m[1] * rx, m[2] * ry, m[3] * ry);
    eEl.setAttribute('d', dEye); S[L ? 'c_eyeL' : 'c_eyeR'].setAttribute('d', dEye);
    // reflected-light crescent at the bottom of the iris, then the pupil moving inside the eye toward the gaze
    var rmx = cx + P.lookX * r * 0.18 * sq, rmy = cy + r * 0.62;
    S[L ? 'rimL' : 'rimR'].setAttribute('d', ellPath(mx(m, rmx, rmy), my(m, rmx, rmy), m[0] * r * 0.78 * sq, m[1] * r * 0.78 * sq, m[2] * r * 0.5, m[3] * r * 0.5));
    var pr = r * 0.6 * (P.pupil || 1);
    var ppx = cx + P.lookX * r * 0.36 * sq, ppy = cy + P.lookY * r * 0.32;
    S[L ? 'pupL' : 'pupR'].setAttribute('d', ellPath(mx(m, ppx, ppy), my(m, ppx, ppy), m[0] * pr * sq, m[1] * pr * sq, m[2] * pr, m[3] * pr));
    // highlights stay with the light source, so the pupil slides under them like a wet sphere
    var on = P.eyeOpen > 0.4;
    var hx = cx - r * 0.34 * sq + P.lookX * 2.5, hy = cy - r * 0.36 * P.eyeOpen, hr = r * 0.27;
    hEl.setAttribute('d', on ? ellPath(mx(m, hx, hy), my(m, hx, hy), hr, 0, 0, hr) : '');
    var h2x = cx + r * 0.36 * sq + P.lookX * 1.5, h2y = cy + r * 0.3 * P.eyeOpen, h2r = r * 0.12;
    S[L ? 'hl2L' : 'hl2R'].setAttribute('d', on ? ellPath(mx(m, h2x, h2y), my(m, h2x, h2y), h2r, 0, 0, h2r) : '');
    var big = (P.pupil || 1) > 1.15, h3x = ppx - pr * 0.42 * sq, h3y = ppy + pr * 0.4, h3r = r * 0.085;
    S[L ? 'hl3L' : 'hl3R'].setAttribute('d', on && big ? ellPath(mx(m, h3x, h3y), my(m, h3x, h3y), h3r, 0, 0, h3r) : '');
  };
  Rig.prototype.ear = function (sh, side, a1, a2, yaw, m, fEl, uEl, cEl, shEl) {
    sh.reset();
    var px = side * EAR_PIVOT[0] * -1, py = EAR_PIVOT[1];
    px = side === 1 ? EAR_PIVOT[0] : -EAR_PIVOT[0];
    // the ear on the side the head turns toward tucks behind, the other swings out
    var turn = yaw * (side === 1 ? 1 : -1); // >0 means this ear is on the far side? (left ear, yaw>0 -> face turns right -> left ear is near)
    var rootShift = yaw * 12;
    var base = (a1 || 0) - turn * 0.12;
    var bend = (a2 || 0);
    var sxs = 1 - Math.max(0, -turn) * 0.25;
    for (var i = 0; i < sh.n; i++) {
      var dx = sh.xs[i] - px, dy = sh.ys[i] - py;
      var d = Math.sqrt(dx * dx + dy * dy), s = clamp(d / 330, 0, 1);
      var ang = (base + bend * s * s) * side;
      var c = Math.cos(ang), sn = Math.sin(ang);
      var nx = dx * c - dy * sn, ny = dx * sn + dy * c;
      sh.xs[i] = px + nx * sxs + rootShift; sh.ys[i] = py + ny;
    }
    sh.xform(m);
    var d = crClosed(sh.xs, sh.ys, sh.n, 1 / 6);
    fEl.setAttribute('d', d); uEl.setAttribute('d', d); cEl.setAttribute('d', d);
    // shade: crescent near the inner-bottom of the ear
    var i0 = 11, i1 = 13;
    var sx = (sh.xs[i0] + sh.xs[i1]) / 2, sy = (sh.ys[i0] + sh.ys[i1]) / 2;
    shEl.setAttribute('d', ellPath(sx, sy - 6, 70, -18 * side, 22 * side * 0.3, 40));
  };
  Rig.prototype.body = function (P) {
    if (P.body && window.PuppyBody) { if (!this.bodyR) this.bodyR = new window.PuppyBody(this.s.bodyG, this.s.overG); this.bodyInfo = this.bodyR.draw(P.body); return; }
    this.bodyOld(P);
  };
  Rig.prototype.bodyOld = function (P) {
    var S = this.s;
    var t = this.torso; t.reset();
    var dT = crClosed(t.xs, t.ys, t.n, 1 / 6);
    S.torsoF.setAttribute('d', dT); S.ulTorso.setAttribute('d', dT); S.c_torso.setAttribute('d', dT);
    var hr = this.haunchR; hr.reset(); var dHR = crClosed(hr.xs, hr.ys, hr.n, 1 / 6);
    S.haunchRF.setAttribute('d', dHR); S.ulHaunchR.setAttribute('d', dHR); S.c_haunchR.setAttribute('d', dHR);
    var hl = this.haunchL; hl.reset(); var dHL = crClosed(hl.xs, hl.ys, hl.n, 1 / 6);
    S.haunchLF.setAttribute('d', dHL); S.ulHaunchL.setAttribute('d', dHL);
    var tl = this.tail; tl.reset(); var dTl = crClosed(tl.xs, tl.ys, tl.n, 1 / 6);
    S.tailF.setAttribute('d', dTl); S.tailUl.setAttribute('d', dTl); S.c_tail.setAttribute('d', dTl);
    var tt = this.tailTip; tt.reset(); S.tailTip.setAttribute('d', crClosed(tt.xs, tt.ys, tt.n, 0.08));
    var ch = this.chest; ch.reset(); S.chest.setAttribute('d', crClosed(ch.xs, ch.ys, ch.n, 0.1));
    var bp = this.backPatch; bp.reset(); S.backPatch.setAttribute('d', crClosed(bp.xs, bp.ys, bp.n, 1 / 6));
    S.haunchRPatch.setAttribute('d', 'M150,-230 L360,-230 L360,-150 C330,-165 260,-185 150,-180Z');
    S.gapShade.setAttribute('d', ellPath(-30, -40, 42, 0, 0, 70));
    S.furAcc.setAttribute('d', 'M-142,-180 C-130,-160 -115,-140 -100,-118');
    S.hindAcc.setAttribute('d', 'M160,-72 C185,-80 215,-78 236,-66');
    // legs: tubes
    var dL = legPath(-132, -280, -128, 0, 72, 34), dR = legPath(73, -210, 68, 8, 68, 34);
    S.legLF.setAttribute('d', dL); S.ulLegL.setAttribute('d', dL);
    S.legRF.setAttribute('d', dR); S.ulLegR.setAttribute('d', dR);
    // inner lines
    var lines = '';
    lines += 'M' + (-205) + ',' + (-232) + 'C-203,-160 -200,-90 -197,-40';           // left leg outer edge
    lines += 'M-94,-122 C-76,-108 -60,-95 -57,-82 L-57,-35';                         // left leg inner edge
    lines += 'M3,-140 L3,-55';                                                       // right leg inner edge
    lines += crSub(hr.xs, hr.ys, hr.n, 0.0, 6.2, 1 / 6);                              // thigh line
    S.bodyLines.setAttribute('d', lines);
    S.toes.setAttribute('d', 'M-169,-42 L-169,-20 M-129,-38 L-129,-15 M33,-28 L33,-5 M78,-24 L78,0 M178,-48 L176,-22 M228,-38 L226,-12');
  };
  function legPath(sx, sy, bx, by, hw, r) {
    // column with rounded flat bottom
    var dx = bx - sx, dy = by - sy, L = Math.sqrt(dx * dx + dy * dy), ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
    var pts = [
      [sx + nx * hw, sy + ny * hw],
      [sx + dx * 0.5 + nx * hw * 1.01, sy + dy * 0.5 + ny * hw * 1.01],
      [bx - ux * r + nx * hw, by - uy * r + ny * hw],
      [bx + nx * (hw - r * 0.55) - ux * r * 0.18, by + ny * (hw - r * 0.55) - uy * r * 0.18],
      [bx + nx * hw * 0.35, by + ny * hw * 0.35],
      [bx - nx * hw * 0.35, by - ny * hw * 0.35],
      [bx - nx * (hw - r * 0.55) - ux * r * 0.18, by - ny * (hw - r * 0.55) - uy * r * 0.18],
      [bx - ux * r - nx * hw, by - uy * r - ny * hw],
      [sx + dx * 0.5 - nx * hw * 1.01, sy + dy * 0.5 - ny * hw * 1.01],
      [sx - nx * hw, sy - ny * hw],
      [sx - ux * hw * 0.5, sy - uy * hw * 0.5]
    ];
    var xs = new Float64Array(pts.length), ys = new Float64Array(pts.length);
    for (var i = 0; i < pts.length; i++) { xs[i] = pts[i][0]; ys[i] = pts[i][1]; }
    return crClosed(xs, ys, pts.length, 1 / 6);
  }

  function defaultPose() {
    return { hx: 0, hy: 0, hyaw: -0.12, hpitch: 0, hroll: 0, eyeOpen: 1, lookX: 0, lookY: 0, mouthOpen: 0.8, tongue: 0.8,
      earL: 0, earLb: 0, earR: 0, earRb: 0 };
  }

  window.PuppyDog = {
    _dev: { Scene: Scene, Rig: Rig, defaultPose: defaultPose, el: el }
  };
})();
