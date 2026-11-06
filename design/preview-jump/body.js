/* PuppyBody — articulated front-view body for the puppy preview.
   Joints live in 3D dog space (x right, y down, z toward the viewer, origin on the ground under the chest)
   and are projected with a weak perspective. Volumes are spheres and tapered limbs, so the body never
   balloons: motion comes from joints, spine angle and leg bends, not from scaling shapes.
   Reading rule for the front view: exactly four legs. The thighs belong to the trunk silhouette (a haunch is a
   bulge of the body, not a leg); the lower hind legs sit behind the trunk and only their paws show. */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var COL = { ol: '#4a2519', fur: '#fff6e2', shade: '#f0dab6', car: '#ebb77c', chest: '#f3dcb8', toe: '#c99d73', pad: '#f6a9ad' };
  var OW = 20, F = 2600;
  var FRONT = { up: 120, lo: 132, r: [48, 42, 40], paw: [46, 32] };
  var HIND = { up: 140, lo: 125, r: [112, 84, 50], paw: [50, 32] };
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

  function PuppyBody(g) {
    var id = 'pb' + Math.floor(Math.random() * 1e9) + '-';
    var defs = el('defs', g);
    var ct = el('clipPath', defs, { id: id + 'trunk' }); this.cTrunk = el('path', ct);
    var ul = function (p) { return el('path', p, { fill: COL.ol, stroke: COL.ol, 'stroke-width': OW * 2, 'stroke-linejoin': 'round' }); };
    var fill = function (p, c) { return el('path', p, { fill: c }); };
    var stroke = function (p, c, w) { return el('path', p, { fill: 'none', stroke: c, 'stroke-width': w, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }); };
    var part = function (p) { var lg = el('g', p); return { ul: ul(lg), f: fill(lg, COL.fur), toes: stroke(lg, COL.toe, 10), pads: fill(lg, COL.pad) }; };
    // back to front: tail, lower hind legs, trunk (+ thighs), hind paws that are forward, front legs, chest bib
    this.tailUl = stroke(g, COL.ol, 2 * (26 + OW)); this.tailF = stroke(g, COL.fur, 52); this.tailTip = stroke(g, COL.car, 52);
    this.hindBack = { L: part(g), R: part(g) };
    this.trunkUl = ul(g); this.trunkF = fill(g, COL.fur);
    var gt = el('g', g, { 'clip-path': 'url(#' + id + 'trunk)' });
    this.belly = fill(gt, COL.shade); this.hipPatch = fill(gt, COL.car);
    this.haunchLines = stroke(g, COL.ol, 11);
    this.hindPawFront = { L: part(g), R: part(g) };
    this.g = g; this.frontG = el('g', g); this.frontUp = false;
    this.front = { L: part(this.frontG), R: part(this.frontG) };
    var gc = this.gc = el('g', g, { 'clip-path': 'url(#' + id + 'trunk)' });
    this.bib = fill(gc, COL.fur);                                // chest fur in front of the leg tops: legs come out from under it
    this.tuft = fill(gc, COL.chest);
    this.bibEdge = stroke(g, COL.ol, 10);
  }

  // B: { cx, cy, cz, phi (rad, 0 = level spine, PI/2 = upright), fp:{x,y,z}, hp:{x,y,z}, stretch, breath, tail, fpL/fpR/hpL/hpR overrides }
  PuppyBody.prototype.solve = function (B) {
    var C = v3(B.cx, B.cy, B.cz);
    var Pl = add(C, v3(0, SPINE * Math.sin(B.phi), -SPINE * Math.cos(B.phi)));
    var J = { C: C, Pl: Pl, neck: add(C, v3(0, -100, 30)) };
    [['L', -1], ['R', 1]].forEach(function (sd) {
      var s = sd[0], sx = sd[1];
      var sh = add(C, v3(70 * sx, 70, 40)), hip = add(Pl, v3(150 * sx, 10, 10));
      var fpT = B['fp' + s] || v3(B.fp.x * sx, B.fp.y, B.fp.z);
      var hpT = B['hp' + s] || v3(B.hp.x * sx, B.hp.y, B.hp.z);
      // elbows point back for a standing leg, and out and down once the paw is raised to the chest
      var up = clamp((sh.y - fpT.y) / 120 + 0.3, 0, 1);
      var fr = ik(sh, fpT, FRONT.up, FRONT.lo, add(sh, v3((70 + 130 * up) * sx, 160 - 40 * up, -170 + 220 * up)));
      var hd = ik(hip, hpT, HIND.up, HIND.lo, add(hip, v3(45 * sx, -120, 260)));   // knee folds toward the viewer
      J['front' + s] = { a: sh, b: fr.mid, c: fr.end, side: sx };
      J['hind' + s] = { a: hip, b: hd.mid, c: hd.end, side: sx };
    });
    return J;
  };

  function paw(P, e, spec, raised) {
    var pw = spec.paw[0] * e.k * (1 + 0.12 * raised), ph = spec.paw[1] * e.k * (1 + 0.55 * raised);
    if (raised < 0.5) {
      P.toes.setAttribute('d', line(e.x - pw * 0.3, e.y + ph * 0.15, e.x - pw * 0.3, e.y + ph * 0.8) + line(e.x + pw * 0.3, e.y + ph * 0.15, e.x + pw * 0.3, e.y + ph * 0.8));
      P.pads.setAttribute('d', '');
    } else {                                                     // raised paw faces the viewer: pink pads
      var pr = pw * 0.36;
      P.toes.setAttribute('d', '');
      P.pads.setAttribute('d', ell(e.x, e.y + ph * 0.22, pr * 1.25, pr) + ell(e.x - pw * 0.5, e.y - ph * 0.28, pr * 0.5, pr * 0.55) +
        ell(e.x - pw * 0.17, e.y - ph * 0.5, pr * 0.5, pr * 0.55) + ell(e.x + pw * 0.17, e.y - ph * 0.5, pr * 0.5, pr * 0.55) +
        ell(e.x + pw * 0.5, e.y - ph * 0.28, pr * 0.5, pr * 0.55));
    }
    return ell(e.x, e.y, pw, ph);
  }
  function setPart(P, d) { P.ul.setAttribute('d', d); P.f.setAttribute('d', d); if (!d) { P.toes.setAttribute('d', ''); P.pads.setAttribute('d', ''); } }

  PuppyBody.prototype.draw = function (B) {
    var J = this.solve(B), self = this;
    var st = B.stretch || 0, br = B.breath || 0;
    var sy = 1 + st, sx = 1 / Math.sqrt(1 + st);                 // area-preserving stretch of the trunk only
    var c = proj(J.C), p = proj(J.Pl);
    var rcx = CHEST_R * c.k * sx * (1 + 0.012 * br), rcy = CHEST_R * c.k * sy * (1 + 0.02 * br);
    var rpx = PELVIS_R * p.k * sx, rpy = PELVIS_R * p.k * sy;
    var dT = ell(c.x, c.y, rcx, rcy) + ell(p.x, p.y, rpx, rpy) + hull(c, Math.min(rcx, rcy), p, Math.min(rpx, rpy));
    var haunch = '';
    ['L', 'R'].forEach(function (s) {
      var jl = J['hind' + s], a = proj(jl.a), b = proj(jl.b), e = proj(jl.c);
      var ra = HIND.r[0] * a.k, rb = HIND.r[1] * b.k, re = HIND.r[2] * e.k;
      dT += ell(a.x, a.y, ra, ra) + hull(a, ra, b, rb) + ell(b.x, b.y, rb, rb);   // thigh is part of the trunk silhouette
      var forward = jl.c.z - jl.a.z > 30;                        // a sitting paw sits in front of the haunch
      var shin = hull(b, rb, e, re);
      if (forward) {
        setPart(self.hindBack[s], shin);
        setPart(self.hindPawFront[s], paw(self.hindPawFront[s], e, HIND, 0));
      } else {
        setPart(self.hindPawFront[s], '');
        setPart(self.hindBack[s], shin + paw(self.hindBack[s], e, HIND, 0));
      }
      var fold = clamp((jl.b.z - jl.a.z - 40) / 120, 0, 1);     // folded thigh: a crease where the haunch meets the belly
      if (fold > 0.3) {
        var inner = jl.side > 0 ? Math.PI : 0;
        haunch += arc(a.x, a.y, ra * 0.98, inner - 1.05 * jl.side, inner + 0.75 * jl.side);
      }
    });
    this.trunkUl.setAttribute('d', dT); this.trunkF.setAttribute('d', dT); this.cTrunk.setAttribute('d', dT);
    this.haunchLines.setAttribute('d', haunch);
    this.belly.setAttribute('d', ell(p.x, p.y + rpy * 0.78, rpx * 0.82, rpy * 0.42));
    this.hipPatch.setAttribute('d', ell(p.x + rpx * 0.78, p.y - rpy * 0.25, rpx * 0.42, rpy * 0.55));
    // tail: from the back of the pelvis, curling up on the right, wagging around its base
    var tb = proj(add(J.Pl, v3(120, -20, -120))), ta = B.tail || 0;
    var tc = { x: tb.x + Math.sin(ta + 0.5) * 95, y: tb.y - Math.cos(ta + 0.5) * 95 };
    var tt = { x: tb.x + Math.sin(ta + 1.0) * 150 + 25, y: tb.y - Math.cos(ta + 1.0) * 150 };
    var dTail = 'M' + f1(tb.x) + ',' + f1(tb.y) + 'Q' + f1(tc.x) + ',' + f1(tc.y) + ' ' + f1(tt.x) + ',' + f1(tt.y);
    this.tailUl.setAttribute('d', dTail); this.tailF.setAttribute('d', dTail);
    this.tailTip.setAttribute('d', 'M' + f1(tc.x * 0.25 + tt.x * 0.75) + ',' + f1(tc.y * 0.25 + tt.y * 0.75) + 'L' + f1(tt.x) + ',' + f1(tt.y));
    // front legs: full limbs in front of the trunk; raised paws go in front of the chest bib as well
    var anyUp = false;
    ['L', 'R'].forEach(function (s) {
      var jl = J['front' + s], a = proj(jl.a), b = proj(jl.b), e = proj(jl.c);
      var ra = FRONT.r[0] * a.k, rb = FRONT.r[1] * b.k, re = FRONT.r[2] * e.k;
      var raised = clamp((jl.b.y - jl.c.y) / 70, 0, 1);
      if (jl.c.y < jl.a.y + 60) anyUp = true;
      var P = self.front[s];
      setPart(P, ell(a.x, a.y, ra, ra) + hull(a, ra, b, rb) + ell(b.x, b.y, rb, rb) + hull(b, rb, e, re) + paw(P, e, FRONT, raised));
    });
    if (anyUp !== this.frontUp) { if (anyUp) this.g.appendChild(this.frontG); else this.g.insertBefore(this.frontG, this.gc); this.frontUp = anyUp; }
    // chest bib over the leg tops, with a fur zigzag edge and a light tuft
    var bx = c.x, by = c.y + rcy * 0.15, brx = rcx * 0.78, bry = rcy * 0.62;
    this.bib.setAttribute('d', ell(bx, by, brx, bry));
    var zz = '';
    for (var i = 0; i <= 8; i++) {
      var ang = (0.28 + 0.44 * i / 8) * Math.PI, rr = i % 2 ? 0.9 : 1.0;
      zz += (i ? 'L' : 'M') + f1(bx + Math.cos(ang) * brx * rr) + ',' + f1(by + Math.sin(ang) * bry * rr);
    }
    this.bibEdge.setAttribute('d', zz);
    var tx = c.x, ty = c.y + rcy * 0.28, tw = rcx * 0.34, th = rcy * 0.42;
    this.tuft.setAttribute('d', 'M' + f1(tx - tw) + ',' + f1(ty - th * 0.2) + 'L' + f1(tx - tw * 0.55) + ',' + f1(ty + th * 0.7) +
      'L' + f1(tx - tw * 0.2) + ',' + f1(ty + th * 0.25) + 'L' + f1(tx) + ',' + f1(ty + th) + 'L' + f1(tx + tw * 0.2) + ',' + f1(ty + th * 0.25) +
      'L' + f1(tx + tw * 0.55) + ',' + f1(ty + th * 0.7) + 'L' + f1(tx + tw) + ',' + f1(ty - th * 0.2) + 'Q' + f1(tx) + ',' + f1(ty + th * 0.1) + ' ' + f1(tx - tw) + ',' + f1(ty - th * 0.2) + 'Z');
    return { neck: proj(J.neck), chest: c, pelvis: p };
  };

  window.PuppyBody = PuppyBody;
})();
