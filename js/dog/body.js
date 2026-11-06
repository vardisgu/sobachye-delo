/* PuppyBody — articulated body for the puppy rig.
   Joints live in 3D dog space (x right, y down, z toward the viewer, origin on the ground under the chest)
   and are projected with a weak perspective. Volumes are spheres and tapered limbs, so the body never
   balloons: motion comes from joints, spine angle and leg bends, not from scaling shapes.
   B.yaw turns the whole body around the vertical axis (0 = facing the viewer, +PI/2 = facing screen-right).
   Reading rule: exactly four legs. Thighs belong to the trunk silhouette (a haunch is a bulge of the body);
   each limb is drawn behind the trunk, in front of it, or in front of the chest bib depending on its depth. */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var COL = { ol: '#4a2519', fur: '#fff6e2', shade: '#f0dab6', car: '#ebb77c', chest: '#f3dcb8', toe: '#c99d73', pad: '#f6a9ad' };
  var OW = 20, F = 2600;
  var FRONT = { up: 120, lo: 132, r: [60, 47, 43], paw: [48, 33] };
  var HIND = { up: 140, lo: 100, r: [112, 66, 50, 45], paw: [54, 34], hock: [0, -68, -36] };   // r: hip, knee, hock, ankle
  var CHEST_R = 175, PELVIS_R = 180, SPINE = 190;

  function el(tag, parent, attrs) {
    var e = document.createElementNS(NS, tag);
    if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function f1(v) { return Math.round(v * 10) / 10; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function v3(x, y, z) { return { x: x, y: y, z: z }; }
  function add(a, b) { return v3(a.x + b.x, a.y + b.y, a.z + b.z); }
  function sub(a, b) { return v3(a.x - b.x, a.y - b.y, a.z - b.z); }
  function mul(a, s) { return v3(a.x * s, a.y * s, a.z * s); }
  function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
  function len(a) { return Math.sqrt(dot(a, a)); }
  function proj(p) { var k = F / (F - p.z); return { x: p.x * k, y: p.y * k, k: k, z: p.z }; }

  // two-bone IK: the middle joint bends toward `pole`; an unreachable target leaves the limb straight
  function ik(a, t, l1, l2, pole) {
    var d = sub(t, a), dist = len(d);
    var dc = clamp(dist, Math.abs(l1 - l2) + 1, l1 + l2 - 0.5);
    var dir = dist > 1e-6 ? mul(d, 1 / dist) : v3(0, 1, 0);
    var ca = clamp((l1 * l1 + dc * dc - l2 * l2) / (2 * l1 * dc), -1, 1), sa = Math.sqrt(1 - ca * ca);
    var pv = sub(pole, a), n = sub(pv, mul(dir, dot(pv, dir))), nl = len(n);
    n = nl > 1e-6 ? mul(n, 1 / nl) : v3(0, 0, 1);
    return { mid: add(a, add(mul(dir, l1 * ca), mul(n, l1 * sa))), end: add(a, mul(dir, dc)) };
  }

  // every closed shape is wound the same way, so several sub-paths in one path union cleanly (nonzero rule)
  function ell(cx, cy, rx, ry) {
    return 'M' + f1(cx - rx) + ',' + f1(cy) + 'a' + f1(rx) + ',' + f1(ry) + ' 0 1,0 ' + f1(2 * rx) + ',0' +
      'a' + f1(rx) + ',' + f1(ry) + ' 0 1,0 ' + f1(-2 * rx) + ',0Z';
  }
  function hull(a, ra, b, rb) {
    var dx = b.x - a.x, dy = b.y - a.y, D = Math.sqrt(dx * dx + dy * dy);
    if (D <= Math.abs(ra - rb) + 0.5) return '';
    var th = Math.atan2(dy, dx), al = Math.acos(clamp((ra - rb) / D, -1, 1));
    var p = [[a.x + ra * Math.cos(th + al), a.y + ra * Math.sin(th + al)], [b.x + rb * Math.cos(th + al), b.y + rb * Math.sin(th + al)],
      [b.x + rb * Math.cos(th - al), b.y + rb * Math.sin(th - al)], [a.x + ra * Math.cos(th - al), a.y + ra * Math.sin(th - al)]];
    var area = 0;
    for (var i = 0; i < 4; i++) { var q = p[(i + 1) % 4]; area += p[i][0] * q[1] - q[0] * p[i][1]; }
    if (area > 0) p.reverse();                                   // match the ellipses' winding
    return 'M' + p.map(function (q) { return f1(q[0]) + ',' + f1(q[1]); }).join('L') + 'Z';
  }
  function line(ax, ay, bx, by) { return 'M' + f1(ax) + ',' + f1(ay) + 'L' + f1(bx) + ',' + f1(by); }
  function arc(cx, cy, r, a0, a1) {
    var s = '';
    for (var i = 0; i <= 10; i++) { var a = a0 + (a1 - a0) * i / 10; s += (i ? 'L' : 'M') + f1(cx + r * Math.cos(a)) + ',' + f1(cy + r * Math.sin(a)); }
    return s;
  }

  function PuppyBody(g, overG) {
    var id = 'pb' + Math.floor(Math.random() * 1e9) + '-';
    var defs = el('defs', g);
    var ct = el('clipPath', defs, { id: id + 'trunk' }); this.cTrunk = el('path', ct);
    var ul = function (p) { return el('path', p, { fill: COL.ol, stroke: COL.ol, 'stroke-width': OW * 2, 'stroke-linejoin': 'round' }); };
    var fill = function (p, c) { return el('path', p, { fill: c }); };
    var stroke = function (p, c, w) { return el('path', p, { fill: 'none', stroke: c, 'stroke-width': w, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }); };
    // back to front: overgrown fluff, tail, back layer, trunk (+ thighs), front layer, chest bib, bandana, top layer (over the face)
    this.fluffUl = ul(g); this.fluffCarUl = ul(g); this.fluffF = fill(g, COL.fur); this.fluffCarF = fill(g, COL.car);   // underlays first: one outline around both
    this.tailUl = stroke(g, COL.ol, 2 * (26 + OW)); this.tailF = stroke(g, COL.fur, 52); this.tailTip = stroke(g, COL.car, 52);
    this.layer = { back: el('g', g) };
    this.trunkUl = ul(g); this.trunkF = fill(g, COL.fur);
    var gt = el('g', g, { 'clip-path': 'url(#' + id + 'trunk)' });
    this.belly = fill(gt, COL.shade); this.hipPatch = fill(gt, COL.car);
    this.haunchLines = stroke(g, COL.ol, 11);
    this.layer.front = el('g', g);
    var gc = el('g', g, { 'clip-path': 'url(#' + id + 'trunk)' });
    this.bib = fill(gc, COL.fur);                                // chest fur in front of the leg tops: legs come out from under it
    this.tuft = fill(gc, COL.chest);
    this.bibEdge = stroke(g, COL.ol, 10);
    var gb = this.bandanaG = el('g', g);
    var cb = el('clipPath', defs, { id: id + 'band' }); this.cBand = el('path', cb);
    this.bandUl = ul(gb); this.bandF = fill(gb, '#e8664f');
    this.bandDots = fill(el('g', gb, { 'clip-path': 'url(#' + id + 'band)' }), '#fff3ea');
    this.layer.top = el('g', overG || g);
    var self = this;
    this.parts = {};
    ['frontL', 'frontR', 'hindLegL', 'hindLegR', 'hindPawL', 'hindPawR'].forEach(function (n) {
      var pg = el('g', self.layer.back);
      var m = el('mask', defs, { id: id + 'm' + n, maskUnits: 'userSpaceOnUse', x: -4000, y: -4000, width: 8000, height: 8000 });
      el('rect', m, { x: -4000, y: -4000, width: 8000, height: 8000, fill: '#fff' });
      var hole = el('ellipse', el('g', m, { 'clip-path': 'url(#' + id + 'trunk)' }), { fill: '#000', rx: 0, ry: 0 });
      var part = { g: pg, ul: ul(pg), f: fill(pg, COL.fur), toes: stroke(pg, COL.toe, 10), pads: fill(pg, COL.pad), hole: hole, layer: 'back', z: 0 };
      part.ul.setAttribute('mask', 'url(#' + id + 'm' + n + ')');
      self.parts[n] = part;
    });
  }

  // B: { cx, cy, cz, phi, yaw, fp:{x,y,z}, hp:{x,y,z} (mirrored), or fpL/fpR/hpL/hpR, stretch, breath, tail }
  // all positions are in the body's own frame (before yaw); +z is the dog's forward
  PuppyBody.prototype.solve = function (B) {
    var yaw = B.yaw || 0, cyw = Math.cos(yaw), syw = Math.sin(yaw);
    function R(p) { return v3(p.x * cyw + p.z * syw, p.y, -p.x * syw + p.z * cyw); }
    var C = v3(B.cx, B.cy, B.cz);
    var Pl = add(C, v3(0, SPINE * Math.sin(B.phi), -SPINE * Math.cos(B.phi)));
    var J = { yaw: yaw, R: R, C: R(C), Pl: R(Pl), Cl: C, Pll: Pl, neck: R(add(C, v3(0, -100, 30))) };
    [['L', -1], ['R', 1]].forEach(function (sd) {
      var s = sd[0], sx = sd[1];
      var sh = add(C, v3(70 * sx, 70, 40)), hip = add(Pl, v3(150 * sx, 10, 10));
      var fpT = B['fp' + s] || v3(B.fp.x * sx, B.fp.y, B.fp.z);
      var hpT = B['hp' + s] || v3(B.hp.x * sx, B.hp.y, B.hp.z);
      // elbows point back for a standing leg, and out and down once the paw is raised to the chest
      var up = clamp((sh.y - fpT.y) / 120 + 0.3, 0, 1);
      var fr = ik(sh, fpT, FRONT.up, FRONT.lo, add(sh, v3((70 + 130 * up) * sx, 160 - 40 * up, -170 + 220 * up)));
      var hockT = add(hpT, v3(HIND.hock[0], HIND.hock[1], HIND.hock[2]));       // hock sits above and behind the paw
      var hs = B['hindStretch' + s] || 1;                          // cartoon stretch: lets a short hind leg reach the ear
      var hd = ik(hip, hockT, HIND.up * hs, HIND.lo * hs, add(hip, v3(45 * sx, -120, 260)));   // knee folds forward (toward the viewer in front view)
      var foot = add(hd.end, sub(hpT, hockT));
      J['front' + s] = { a: R(sh), b: R(fr.mid), c: R(fr.end), side: sx, raised: fr.end.y < sh.y + 60 };
      J['hind' + s] = { a: R(hip), b: R(hd.mid), h: R(hd.end), c: R(foot), side: sx, fwd: foot.z - hip.z };
    });
    return J;
  };

  function paw(P, e, spec, raised, yaw, glass) {
    var gl = glass || 0;
    var pw = spec.paw[0] * e.k * (1 + 0.12 * raised) * (1 + 0.42 * gl), ph = spec.paw[1] * e.k * (1 + 0.55 * raised) * (1 + 0.62 * gl);
    if (raised < 0.5) {
      var sh = Math.sin(yaw) * pw * 0.35;                        // toes sit at the front of the paw when seen from the side
      P.toes.setAttribute('d', line(e.x - pw * 0.3 * Math.abs(Math.cos(yaw)) + sh, e.y + ph * 0.15, e.x - pw * 0.3 * Math.abs(Math.cos(yaw)) + sh, e.y + ph * 0.8) +
        line(e.x + pw * 0.3 * Math.abs(Math.cos(yaw)) + sh, e.y + ph * 0.15, e.x + pw * 0.3 * Math.abs(Math.cos(yaw)) + sh, e.y + ph * 0.8));
      P.pads.setAttribute('d', '');
    } else {                                                     // raised paw faces the viewer: pink pads
      var pr = pw * (0.36 + 0.05 * gl);
      P.toes.setAttribute('d', '');
      P.pads.setAttribute('d', ell(e.x, e.y + ph * 0.22, pr * 1.25, pr) + ell(e.x - pw * 0.5, e.y - ph * 0.28, pr * 0.5, pr * 0.55) +
        ell(e.x - pw * 0.17, e.y - ph * 0.5, pr * 0.5, pr * 0.55) + ell(e.x + pw * 0.17, e.y - ph * 0.5, pr * 0.5, pr * 0.55) +
        ell(e.x + pw * 0.5, e.y - ph * 0.28, pr * 0.5, pr * 0.55));
    }
    P.lastPaw = { x: e.x, y: e.y, w: pw, h: ph };
    return ell(e.x, e.y, pw, ph);
  }
  function setPart(P, d, layer, z, hole) {
    if (hole) { P.hole.setAttribute('cx', f1(hole.x)); P.hole.setAttribute('cy', f1(hole.y)); P.hole.setAttribute('rx', f1(hole.r)); P.hole.setAttribute('ry', f1(hole.r)); }
    else P.hole.setAttribute('rx', 0);
    P.ul.setAttribute('d', d); P.f.setAttribute('d', d);
    if (!d) { P.toes.setAttribute('d', ''); P.pads.setAttribute('d', ''); }
    P.layer = layer; P.z = z;
  }

  PuppyBody.prototype.draw = function (B) {
    var J = this.solve(B), self = this, yaw = J.yaw, side = Math.abs(Math.sin(yaw));
    var st = B.stretch || 0, br = B.breath || 0;
    var sy = 1 + st, sx = 1 / Math.sqrt(1 + st);                 // area-preserving stretch of the trunk only
    var c = proj(J.C), p = proj(J.Pl), tz = (J.C.z + J.Pl.z) / 2;
    var rcx = CHEST_R * c.k * sx * (1 + 0.012 * br), rcy = CHEST_R * c.k * sy * (1 + 0.02 * br);
    var rpx = PELVIS_R * p.k * sx, rpy = PELVIS_R * p.k * sy;
    var dT = ell(c.x, c.y, rcx, rcy) + ell(p.x, p.y, rpx, rpy) + hull(c, Math.min(rcx, rcy), p, Math.min(rpx, rpy));
    var haunch = '';
    ['L', 'R'].forEach(function (s) {
      var jl = J['hind' + s], a = proj(jl.a), b = proj(jl.b), h = proj(jl.h), e = proj(jl.c);
      var ra = HIND.r[0] * a.k, rb = HIND.r[1] * b.k, rh = HIND.r[2] * h.k, re = HIND.r[3] * e.k;
      dT += ell(a.x, a.y, ra, ra) + hull(a, ra, b, rb) + ell(b.x, b.y, rb, rb);   // thigh is part of the trunk silhouette
      var shin = hull(b, rb, h, rh) + ell(h.x, h.y, rh, rh) + hull(h, rh, e, re), legZ = (jl.b.z + jl.c.z) / 2;
      var knee = { x: b.x, y: b.y, r: (rb + OW) * 1.15 };          // the shin grows out of the haunch without a seam
      var pawD = paw(self.parts['hindPaw' + s], e, HIND, 0, yaw);
      if (jl.c.y < jl.a.y - 120) {                               // paw raised high (scratching an ear): leg goes over the head layer
        setPart(self.parts['hindLeg' + s], shin + pawD, 'top', legZ, knee);
        paw(self.parts['hindLeg' + s], e, HIND, 0, yaw);
        setPart(self.parts['hindPaw' + s], '', 'back', 0);
      } else if (side > 0.55 && legZ > tz) {                     // side view, near leg: whole lower leg in front
        setPart(self.parts['hindLeg' + s], shin + pawD, 'front', legZ, knee);
        paw(self.parts['hindLeg' + s], e, HIND, 0, yaw);
        setPart(self.parts['hindPaw' + s], '', 'back', 0);
      } else {                                                   // shin hides behind the haunch; a forward paw shows in front of it
        setPart(self.parts['hindLeg' + s], shin, 'back', legZ);
        if (jl.fwd > 30 && jl.c.z > tz) setPart(self.parts['hindPaw' + s], pawD, 'front', jl.c.z);
        else { setPart(self.parts['hindLeg' + s], shin + pawD, 'back', legZ); paw(self.parts['hindLeg' + s], e, HIND, 0, yaw); setPart(self.parts['hindPaw' + s], '', 'back', 0); }
      }
      var fold = clamp((jl.fwd - 40) / 120, 0, 1) * (1 - side);  // folded thigh seen from the front: crease against the belly
      if (fold > 0.3) {
        var inner = jl.side > 0 ? Math.PI : 0;
        haunch += arc(a.x, a.y, ra * 0.98, inner - 1.05 * jl.side, inner + 0.75 * jl.side);
      }
    });
    this.trunkUl.setAttribute('d', dT); this.trunkF.setAttribute('d', dT); this.cTrunk.setAttribute('d', dT);
    this.haunchLines.setAttribute('d', haunch);
    this.belly.setAttribute('d', ell(p.x, p.y + rpy * 0.78, rpx * 0.82, rpy * 0.42));
    var hp = proj(J.R(add(J.Pll, v3(130, -45, -30))));
    this.hipPatch.setAttribute('d', ell(hp.x, hp.y, rpx * 0.42, rpy * 0.55));
    // tail in 3D: from the back of the pelvis, up and curling to the right, wagging sideways
    var W = B.tail || 0, tu = B.tailUp == null ? 1 : B.tailUp, tb0 = add(J.Pll, v3(35, -70, -150));   // tailUp 0 = streaming straight back
    var tb = proj(J.R(tb0)), tc = proj(J.R(add(tb0, v3(Math.sin(W) * 45, -95 * tu - 40 * (1 - tu), -45 * tu - 95 * (1 - tu))))),
      tt = proj(J.R(add(tb0, v3(Math.sin(W) * 95 + 25 * tu, -150 * tu - 70 * (1 - tu), -55 * tu - 175 * (1 - tu)))));
    var dTail = 'M' + f1(tb.x) + ',' + f1(tb.y) + 'Q' + f1(tc.x) + ',' + f1(tc.y) + ' ' + f1(tt.x) + ',' + f1(tt.y);
    this.tailUl.setAttribute('d', dTail); this.tailF.setAttribute('d', dTail);
    this.tailTip.setAttribute('d', 'M' + f1(tc.x * 0.25 + tt.x * 0.75) + ',' + f1(tc.y * 0.25 + tt.y * 0.75) + 'L' + f1(tt.x) + ',' + f1(tt.y));
    // front legs
    ['L', 'R'].forEach(function (s) {
      var jl = J['front' + s], a = proj(jl.a), b = proj(jl.b), e = proj(jl.c);
      var ra = FRONT.r[0] * a.k, rb = FRONT.r[1] * b.k, re = FRONT.r[2] * e.k;
      var raised = clamp((jl.b.y - jl.c.y) / 70, 0, 1), P = self.parts['front' + s];
      var z = (jl.b.z + jl.c.z) / 2;
      var d = ell(a.x, a.y, ra, ra) + hull(a, ra, b, rb) + ell(b.x, b.y, rb, rb) + hull(b, rb, e, re) + paw(P, e, FRONT, raised, yaw, B.glass);
      var top = jl.raised && side < 0.55;
      setPart(P, d, top ? 'top' : z > tz - 10 ? 'front' : 'back', z, top ? null : { x: a.x, y: a.y + ra * 0.15, r: (ra + OW) * 1.2 });
    });
    // re-stack parts: each layer holds its parts sorted far to near
    ['back', 'front', 'top'].forEach(function (ln) {
      Object.keys(self.parts).map(function (k) { return self.parts[k]; }).filter(function (P) { return P.layer === ln; })
        .sort(function (u, v) { return u.z - v.z; }).forEach(function (P) { self.layer[ln].appendChild(P.g); });
    });
    // chest bib on the front of the chest, with a fur zigzag edge and a light tuft
    var bf = proj(J.R(add(J.Cl, v3(0, 26, 105))));
    var bx = bf.x, by = bf.y, brx = rcx * 0.78 * (0.45 + 0.55 * Math.abs(Math.cos(yaw))), bry = rcy * 0.62;
    this.bib.setAttribute('d', ell(bx, by, brx, bry));
    var zz = '';
    for (var i = 0; i <= 8; i++) {
      var ang = (0.28 + 0.44 * i / 8) * Math.PI, rr = i % 2 ? 0.9 : 1.0;
      zz += (i ? 'L' : 'M') + f1(bx + Math.cos(ang) * brx * rr) + ',' + f1(by + Math.sin(ang) * bry * rr);
    }
    this.bibEdge.setAttribute('d', side < 0.75 ? zz : '');
    var tx = bx, ty = by + rcy * 0.13, tw = rcx * 0.34 * (0.45 + 0.55 * Math.abs(Math.cos(yaw))), th = rcy * 0.42;
    this.tuft.setAttribute('d', 'M' + f1(tx - tw) + ',' + f1(ty - th * 0.2) + 'L' + f1(tx - tw * 0.55) + ',' + f1(ty + th * 0.7) +
      'L' + f1(tx - tw * 0.2) + ',' + f1(ty + th * 0.25) + 'L' + f1(tx) + ',' + f1(ty + th) + 'L' + f1(tx + tw * 0.2) + ',' + f1(ty + th * 0.25) +
      'L' + f1(tx + tw * 0.55) + ',' + f1(ty + th * 0.7) + 'L' + f1(tx + tw) + ',' + f1(ty - th * 0.2) + 'Q' + f1(tx) + ',' + f1(ty + th * 0.1) + ' ' + f1(tx - tw) + ',' + f1(ty - th * 0.2) + 'Z');
    // overgrown coat (haircut scene): a shaggy fringe of pointed, slightly drooping strands around head and trunk
    var fl = B.fluff, fd = '', fc = '';
    if (fl && (fl.top + fl.left + fl.right + fl.chest) > 0.01) {
      var fringe = function (cx0, cy0, rx0, ry0, a0, a1, n, amt, len) {
        if (amt < 0.02) return '';
        var L = len * amt, sgn = a1 > a0 ? 1 : -1;
        var P2 = function (a, r) { return [cx0 + Math.cos(a) * (rx0 + r), cy0 + Math.sin(a) * (ry0 + r)]; };
        var d = 'M' + f1(cx0 + Math.cos(a0) * rx0 * 0.8) + ',' + f1(cy0 + Math.sin(a0) * ry0 * 0.8);
        var v0 = P2(a0, 0); d += 'L' + f1(v0[0]) + ',' + f1(v0[1]);
        for (var i = 0; i < n; i++) {                              // each tuft: bulges out, curls to a soft point, dips back in
          var av1 = a0 + (a1 - a0) * (i + 1) / n, at = a0 + (a1 - a0) * (i + 0.62) / n;
          var tl = L * (0.7 + 0.45 * (((i * 53) % 5) / 4)), droop = tl * 0.3;
          var tip = P2(at, tl); tip[1] += droop;
          var c1 = P2(a0 + (a1 - a0) * (i + 0.15) / n, tl * 0.85);
          var c2 = P2(a0 + (a1 - a0) * (i + 0.9) / n, tl * 0.1);
          var v1 = P2(av1, 0);
          d += 'Q' + f1(c1[0]) + ',' + f1(c1[1]) + ' ' + f1(tip[0]) + ',' + f1(tip[1]) + 'Q' + f1(c2[0]) + ',' + f1(c2[1]) + ' ' + f1(v1[0]) + ',' + f1(v1[1]);
        }
        for (var k = n; k >= 0; k--) { var ai = a0 + (a1 - a0) * k / n; d += 'L' + f1(cx0 + Math.cos(ai) * rx0 * 0.8) + ',' + f1(cy0 + Math.sin(ai) * ry0 * 0.8); }
        return d + 'Z';
      };
      var hc = B.headC;
      if (hc) {                                                    // head and ears: caramel strands
        fc += fringe(hc.x, hc.y, hc.rx * 0.97, hc.ry * 0.97, -2.95, -0.2, 11, fl.top, 62);
        fc += fringe(hc.x, hc.y, hc.rx * 1.45, hc.ry * 0.95, 2.45, 3.45, 4, fl.left, 62);
        fc += fringe(hc.x, hc.y, hc.rx * 1.45, hc.ry * 0.95, -0.3, 0.7, 4, fl.right, 62);
      }
      fd += fringe(c.x, c.y, rcx, rcy, 1.75, 3.3, 5, fl.left, 66) + fringe(p.x, p.y, rpx, rpy, 2.3, 3.25, 4, fl.left, 66);
      fd += fringe(c.x, c.y, rcx, rcy, -0.15, 1.4, 5, fl.right, 66) + fringe(p.x, p.y, rpx, rpy, -0.1, 0.85, 4, fl.right, 66);
      fd += fringe(c.x, c.y + rcy * 0.2, rcx * 0.75, rcy * 0.85, 1.2, 1.95, 4, fl.chest, 58);
    }
    this.fluffUl.setAttribute('d', fd); this.fluffF.setAttribute('d', fd);
    this.fluffCarUl.setAttribute('d', fc); this.fluffCarF.setAttribute('d', fc);
    // bandana (after grooming): a triangle tied under the chin, pops in with scale
    var bs = B.bandana || 0;
    if (bs > 0.01) {
      var NL = add(J.Cl, v3(0, -100, 30)), fx = B.bandanaFlutter || 0;
      var tl = proj(J.R(add(NL, v3(-128, 62, 28)))), tr = proj(J.R(add(NL, v3(128, 62, 28)))), tip = proj(J.R(add(NL, v3(fx * 22, 200, 82))));
      var tcx = (tl.x + tr.x) / 2, tcy = (tl.y + tr.y) / 2;
      var sc = function (q) { return { x: tcx + (q.x - tcx) * bs, y: tcy + (q.y - tcy) * bs }; };
      var A = sc(tl), Bq = sc(tr), T = sc(tip);
      var dB = 'M' + f1(A.x) + ',' + f1(A.y) + 'Q' + f1(tcx) + ',' + f1(tcy + 24 * bs) + ' ' + f1(Bq.x) + ',' + f1(Bq.y) +
        'Q' + f1((Bq.x + T.x) / 2 + 10 * bs) + ',' + f1((Bq.y + T.y) / 2) + ' ' + f1(T.x) + ',' + f1(T.y) +
        'Q' + f1((A.x + T.x) / 2 - 10 * bs) + ',' + f1((A.y + T.y) / 2) + ' ' + f1(A.x) + ',' + f1(A.y) + 'Z';
      this.bandUl.setAttribute('d', dB); this.bandF.setAttribute('d', dB); this.cBand.setAttribute('d', dB);
      var dots = '', dr = 11 * bs;
      [[0.3, 0.25], [0.7, 0.25], [0.5, 0.5], [0.25, 0.55], [0.75, 0.55], [0.5, 0.78]].forEach(function (q) {
        var x = A.x + (Bq.x - A.x) * q[0], y = A.y + (T.y - A.y) * q[1] + (Bq.y - A.y) * q[0];
        dots += ell(x, y, dr, dr);
      });
      this.bandDots.setAttribute('d', dots);
    } else { this.bandUl.setAttribute('d', ''); this.bandF.setAttribute('d', ''); this.bandDots.setAttribute('d', ''); }
    return { neck: proj(J.neck), chest: c, pelvis: p, paws: { L: this.parts.frontL.lastPaw, R: this.parts.frontR.lastPaw } };
  };

  window.PuppyBody = PuppyBody;
})();
