/*
 * ZixiaoArt ShanShui @5 & @4 Procedural Engine (Pure JS port from zixiao-kit 8aedc75)
 *
 * Implements:
 * - Guohua Sanyuan composition (高远 / 深远 / 平远 / 边角)
 * - 15 Classical Poetry Scenes (诗意画卷: retreat, fishing, waterTown, farewell, village, spring,
 *   lotusPond, autumnTravel, winterForest, moonNight, temple, courtyard, historic, desert, ocean)
 * - 48 Scene Motifs
 * - Dual Engine architecture (engine + waterEngine)
 * - LayerFade (山腰云锁 / waist-cloud dissolution via WashNoise.fadeKeep)
 * - Proportional mountain profiling and 3-sided rock facet texturing
 * - Full deterministic reproducible pure-web rendering
 */
(function (root) {
  'use strict';

// ---------------------------------------------------------------- @4 / @5: Core, Entropy, Geometry, PoetryScene & Base Engine

var Brush = (function () {
  if (typeof root !== 'undefined' && root.ZXArtCompose && root.ZXArtCompose.Brush) return root.ZXArtCompose.Brush;
  if (typeof root !== 'undefined' && root.Brush) return root.Brush;
  if (typeof globalThis !== 'undefined' && globalThis.ZXArtCompose && globalThis.ZXArtCompose.Brush) return globalThis.ZXArtCompose.Brush;
  if (typeof globalThis !== 'undefined' && globalThis.Brush) return globalThis.Brush;
  var f = Math.fround;
  function unit(x) { return Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0; }
  function hash(seed, index) {
    var h = seed ^ Math.imul(index, 0x9E3779B9);
    h = Math.imul(h ^ (h >>> 16), 0x7FEB352D);
    h = Math.imul(h ^ (h >>> 15), 0x846CA68B);
    return (h ^ (h >>> 16)) >>> 0;
  }
  function random(seed, index) { return hash(seed, index) / 4294967296; }
  function noise(seed, x) {
    var k = Math.floor(x), t = x - k, u = t * t * (3 - 2 * t);
    var a = random(seed, k >>> 0), b = random(seed, (k + 1) >>> 0);
    return a + (b - a) * u;
  }
  function pressure(profile, s) {
    switch (profile) {
      case 'brush': return (0.45 + 0.55 * Math.min(1, s / 0.08)) * Math.pow(1 - s, 0.65);
      case 'tip': return Math.pow(Math.max(0, Math.sin(Math.PI * s)), 0.7);
      case 'nail': return (0.22 + 0.78 * Math.exp(-s * 12)) * Math.pow(1 - s, 0.35);
      case 'na': return Math.pow(s, 0.7) * (1 - Math.pow(s, 8)) / (Math.pow(0.7 / 8.7, 0.7 / 8) * (8 / 8.7));
      case 'press': return 0.25 + 0.75 * Math.pow(Math.max(0, Math.sin(Math.PI * s)), 0.5);
      case 'rise': return Math.pow(s, 0.6);
      case 'lens': return Math.pow(Math.max(0, Math.sin(Math.PI * s)), 1.6);
      case 'cone': return 1 - s;
      case 'dot': return Math.pow(Math.max(0, Math.sin(Math.PI * s)), 0.35) * (1 - 0.5 * s);
      case 'even': return 1;
      default: return 1;
    }
  }
  function style(s) {
    var defaults = { width: 4, tone: 0.82, dry: 0.4, wet: 0, side: 0, rough: 0.2, profile: 'brush' };
    return Object.assign(defaults, s);
  }
  function curve(input) {
    var points = [], distances = [0];
    for (var i = 0; i < input.length - 1; i++) {
      var a = input[Math.max(0, i - 1)], b = input[i], c = input[i + 1], d = input[Math.min(input.length - 1, i + 2)];
      for (var j = 0; j < 16; j++) {
        var t = j / 16, t2 = t * t, t3 = t2 * t;
        points.push([0, 1, 2].map(function (k) {
          var linear = (c[k] - a[k]) * t;
          var quadratic = (a[k] * 2 - b[k] * 5 + c[k] * 4 - d[k]) * t2;
          var cubic = (-a[k] + b[k] * 3 - c[k] * 3 + d[k]) * t3;
          return (b[k] * 2 + linear + quadratic + cubic) * 0.5;
        }));
      }
    }
    points.push(input[input.length - 1]);
    for (var n = 1; n < points.length; n++) {
      var dx = points[n][0] - points[n - 1][0], dy = points[n][1] - points[n - 1][1];
      distances.push(distances[n - 1] + Math.sqrt(dx * dx + dy * dy));
    }
    var length = distances[distances.length - 1];
    function at(u) {
      var target = u * length, lo = 0, hi = points.length - 1;
      while (lo + 1 < hi) {
        var m = Math.floor((lo + hi) / 2);
        if (distances[m] <= target) lo = m; else hi = m;
      }
      while (hi < points.length - 1 && distances[hi] <= distances[lo]) hi++;
      while (lo > 0 && distances[hi] <= distances[lo]) lo--;
      var span = distances[hi] - distances[lo], t = span > 0 ? (target - distances[lo]) / span : 0;
      var delta = points[hi].map(function (v, k) { return v - points[lo][k]; });
      var norm = Math.sqrt(delta[0] * delta[0] + delta[1] * delta[1]);
      return { point: points[lo].map(function (v, k) { return v + delta[k] * t; }),
        normal: norm > 0 ? [-delta[1] / norm, delta[0] / norm] : [0, 1] };
    }
    return { length: length, at: at, normal: [-(points[points.length - 1][1] - points[0][1]) / length,
      (points[points.length - 1][0] - points[0][0]) / length] };
  }
  function sampleCount(length, step) { return Math.min(599, Math.max(1, Math.ceil(length / step))) + 1; }
  function stroke(centerline, inputStyle, seed, p) {
    var s = style(inputStyle), empty = { body: [], bodyAlphaStart: 0, bodyAlphaEnd: 0, bristles: [] };
    if (p === undefined) p = 1;
    if (!Number.isFinite(s.width) || s.width <= 0 || !Number.isFinite(p) || p <= 0 || centerline.length < 2 ||
        !centerline.every(function (v) { return v.length >= 3 && v.every(Number.isFinite); })) return empty;
    var c = curve(centerline);
    if (!Number.isFinite(c.length) || c.length <= 1e-9) return empty;
    var progress = unit(p), dry = unit(s.dry), tone = unit(s.tone), fade = unit(s.fade == null ? dry * 0.55 : s.fade);
    var gapLength = Number.isFinite(s.gapLength) && s.gapLength > 0 ? s.gapLength : null;
    var reference = gapLength == null ? c.length : gapLength, step = Math.max(0.25, s.width * 0.18);
    var bodyCount = sampleCount(c.length, step), hairCount = sampleCount(reference, gapLength == null ? step : 0.5);
    var bodyLast = Math.floor(progress * (bodyCount - 1)), hairLast = Math.floor(progress * (hairCount - 1));
    var widthScale = s.width * 1.3 + 1, side = Math.min(1, Math.max(-1, Number.isFinite(s.side) ? s.side : 0));
    if (s.darkDirection && s.darkDirection.every(Number.isFinite)) {
      var alignment = c.normal[0] * s.darkDirection[0] + c.normal[1] * s.darkDirection[1];
      if (alignment > 0) side = Math.abs(side); else if (alignment < 0) side = -Math.abs(side);
    }
    function frame(i, count) {
      var u = i / (count - 1), sample = c.at(u);
      var w = s.width * pressure(s.profile, u) * Math.max(0, sample.point[2]) *
        (1 + unit(s.rough) * (noise(seed ^ 0xA511E9B3, u * reference / widthScale) - 0.5) * 2);
      return { point: sample.point, normal: sample.normal, width: Math.max(s.width * 0.04, w) };
    }
    function offset(frame, amount) { return [f(frame.point[0] + frame.normal[0] * amount), f(frame.point[1] + frame.normal[1] * amount)]; }
    var positive = [], negative = [];
    if (bodyLast >= 1) for (var i = 0; i <= bodyLast; i++) {
      var fr = frame(i, bodyCount);
      positive.push(offset(fr, fr.width * 0.5)); negative.push(offset(fr, -fr.width * 0.5));
    }
    var bodyOpacity = tone * Math.pow(1 - dry, 1.6), bodyEnd = bodyLast / (bodyCount - 1);
    var out = { body: positive.concat(negative.reverse()), bodyAlphaStart: f(bodyOpacity),
      bodyAlphaEnd: f(bodyOpacity * (1 - fade * bodyEnd)), bristles: [] };
    var count = s.bristles == null ? Math.trunc(Math.min(56, Math.max(4, Math.round(s.width * 1.1)))) : Math.min(56, Math.max(0, s.bristles));
    if (count <= 0) return out;
    var frames = [];
    for (var h = 0; h <= hairLast; h++) frames.push(frame(h, hairCount));
    for (var j = 0; j < count; j++) {
      var key = hash(seed ^ 0x63D83595, j), off = (j + 0.15 + 0.7 * random(key, 0)) / count - 0.5;
      var load = 1 - dry * (0.15 + 0.85 * Math.abs(off) * 2) * random(key, 1);
      var g = 0.5 + random(key, 2) * 1.6, gapScale = Math.max(6, s.width * 1.4) * g;
      var end = 1 - dry * 0.2 * random(key, 3), sign = side < 0 ? -1 : 1;
      var blend = unit(off * sign * 1.6 + 0.5), sideAlpha = (1 - Math.abs(side)) + Math.abs(side) * blend;
      var runs = [], run = [];
      function flush() { if (run.length >= 2) runs.push(run); run = []; }
      for (var k = 0; k <= hairLast; k++) {
        var u = k / (hairCount - 1), x = u * reference;
        var ink = load - dry * (0.08 + 1.15 * Math.pow(u, 1.25)) + dry *
          ((noise(key ^ 0xB5297A4D, x / gapScale) - 0.5) * 1.15 + (noise(key ^ 0x68E31DA4, x / gapScale * 5.5) - 0.5) * 0.35);
        if (dry === 0 || (u <= end && ink > 0.16)) {
          var jitter = (noise(key ^ 0x1B56C4E9, x / widthScale) - 0.5) * 0.06;
          run.push(offset(frames[k], (off + jitter) * frames[k].width));
        } else flush();
      }
      flush();
      out.bristles.push({ runs: runs, width: f(Math.max(0.12, s.width / count * (0.45 + random(key, 4) * 0.55))),
        alpha: f(tone * sideAlpha * (0.5 + 0.5 * load) * (1 - fade * 0.5)) });
    }
    return out;
  }
  function ring(center, radius, squash, s, seed, sweep) {
    if (sweep === undefined) sweep = 1.86 * Math.PI;
    if (!center.every(Number.isFinite) || !Number.isFinite(radius) || radius <= 0 || !Number.isFinite(squash) || squash <= 0 || !Number.isFinite(sweep) || sweep <= 0) return stroke([], s, seed);
    var span = Math.min(sweep, 2 * Math.PI - 0.001), phase = random(seed, 0) * 2 * Math.PI, points = [];
    for (var i = 0; i <= 96; i++) {
      var a = phase + span * i / 96;
      points.push([center[0] + radius * Math.cos(a), center[1] + radius * squash * Math.sin(a), 1]);
    }
    return stroke(points, s, seed);
  }
  function blot(center, radius, squash, angle, seed) {
    if (!center.every(Number.isFinite) || !Number.isFinite(radius) || radius <= 0 || !Number.isFinite(squash) || squash <= 0 || !Number.isFinite(angle)) return [];
    var points = [];
    for (var i = 0; i < 48; i++) {
      var a = i / 48 * 2 * Math.PI, x = i / 48 * 8, k = Math.floor(x), t = x - k, u = t * t * (3 - 2 * t);
      var n = random(seed, k) + (random(seed, (k + 1) % 8) - random(seed, k)) * u;
      var r = radius * (0.82 + 0.3 * n), px = r * Math.cos(a), py = r * squash * Math.sin(a);
      points.push([f(center[0] + (px * Math.cos(angle) - py * Math.sin(angle))), f(center[1] + (px * Math.sin(angle) + py * Math.cos(angle)))]);
    }
    return points;
  }
  return { hash: hash, random: random, noise: noise, unit: unit, style: style, pressure: pressure, stroke: stroke, ring: ring, blot: blot };
})();

function P(x, y) {
  return { x: +x, y: +y };
}
P.add = function (a, b) { return { x: a.x + b.x, y: a.y + b.y }; };
P.sub = function (a, b) { return { x: a.x - b.x, y: a.y - b.y }; };
P.mul = function (a, s) { return { x: a.x * s, y: a.y * s }; };

function clonePoly(poly) {
  if (!poly) return null;
  var pts = poly.pts || poly.p || [];
  var copiedPts = pts.map(function (pt) { return P(pt.x, pt.y); });
  return {
    p: copiedPts,
    pts: copiedPts,
    fil: poly.fil,
    str: poly.str,
    wid: poly.wid,
    wash: poly.wash,
    tooth: poly.tooth,
    rim: poly.rim,
    fade: poly.fade,
    ...(poly.overprint ? {overprint:true} : {})
  };
}

function toFixed(x, digits) {
  return Number((+x).toFixed(digits === undefined ? 3 : digits));
}

function or0(x) {
  var n = +x;
  if (!Number.isFinite(n) || n === 0) return 0;
  return n | 0;
}

function mapval(value, istart, istop, ostart, ostop) {
  return ostart + (ostop - ostart) * ((value - istart) / (istop - istart));
}

function C(r, g, b, a) {
  return { r: +r, g: +g, b: +b, a: a === undefined ? 1 : +a };
}
C.gray = function (v, a) { return C(v, v, v, a === undefined ? 1 : a); };
C.white = C(255, 255, 255, 1);
C.clear = C(0, 0, 0, 0);
C.ink = function (alpha, digits) { return C.gray(100, toFixed(alpha, digits === undefined ? 3 : digits)); };
C.isWhite = function (c) { return Boolean(c && c.r === 255 && c.g === 255 && c.b === 255 && c.a === 1); };
C.eq = function (a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;
};

function CRect(x, y, width, height) {
  var rx = +x, ry = +y, rw = +width, rh = +height;
  var minX = Math.min(rx, rx + rw);
  var maxX = Math.max(rx, rx + rw);
  var minY = Math.min(ry, ry + rh);
  var maxY = Math.max(ry, ry + rh);
  var w = maxX - minX;
  var h = maxY - minY;
  var isNull = (w <= 0 || h <= 0);
  return {
    x: minX,
    y: minY,
    width: w,
    height: h,
    minX: minX,
    minY: minY,
    maxX: maxX,
    maxY: maxY,
    midX: minX + w * 0.5,
    midY: minY + h * 0.5,
    isNull: isNull,
    insetBy: function (dx, dy) {
      return CRect(minX + dx, minY + dy, w - 2 * dx, h - 2 * dy);
    },
    inset: function (dx, dy) {
      return this.insetBy(dx, dy);
    },
    offsetBy: function (dx, dy) {
      return CRect(minX + dx, minY + dy, w, h);
    },
    offset: function (dx, dy) {
      return this.offsetBy(dx, dy);
    },
    equals: function (other) {
      if (!other) return false;
      return Math.abs(minX - other.minX) < 1e-4 &&
             Math.abs(minY - other.minY) < 1e-4 &&
             Math.abs(w - other.width) < 1e-4 &&
             Math.abs(h - other.height) < 1e-4;
    },
    intersects: function (other) {
      if (!other) return false;
      if (w <= 0 || h <= 0 || other.width <= 0 || other.height <= 0) return false;
      return minX < other.maxX && maxX > other.minX && minY < other.maxY && maxY > other.minY;
    },
    contains: function (other) {
      if (!other) return false;
      if (other.width !== undefined && other.height !== undefined) {
        return other.minX >= minX && other.maxX <= maxX && other.minY >= minY && other.maxY <= maxY;
      }
      return other.x >= minX && other.x <= maxX && other.y >= minY && other.y <= maxY;
    },
    union: function (other) {
      if (!other || other.isNull) return this;
      if (isNull) return other;
      var ux0 = Math.min(minX, other.minX), uy0 = Math.min(minY, other.minY);
      var ux1 = Math.max(maxX, other.maxX), uy1 = Math.max(maxY, other.maxY);
      return CRect(ux0, uy0, ux1 - ux0, uy1 - uy0);
    },
  };
}

function clonePoly(poly) {
  if (!poly) return null;
  var pts = poly.pts || poly.p || [];
  var copied = pts.map(function (pt) { return P(pt.x, pt.y); });
  return {
    p: copied,
    pts: copied,
    fil: poly.fil ? C(poly.fil.r, poly.fil.g, poly.fil.b, poly.fil.a) : null,
    str: poly.str ? C(poly.str.r, poly.str.g, poly.str.b, poly.str.a) : null,
    wid: poly.wid || 0,
    wash: !!poly.wash,
    closed: poly.closed,
    tooth: poly.tooth,
    rim: poly.rim,
    fade: poly.fade,
    ...(poly.overprint ? {overprint:true} : {})
  };
}

function normalizeFade(fade) {
  if (!fade) return null;
  if (fade.floorY !== undefined && fade.depth !== undefined) {
    return {
      floorY: +fade.floorY,
      depth: Math.max(0, +fade.depth),
      minimumKeep: fade.minimumKeep === undefined ? 0.14 : +fade.minimumKeep,
      seed: (fade.seed || 0) >>> 0,
    };
  }
  var top = +fade.top, bottom = +fade.bottom;
  return {
    floorY: bottom,
    depth: Math.max(0, bottom - top),
    minimumKeep: fade.minimumKeep === undefined ? 0.14 : +fade.minimumKeep,
    seed: (fade.seed || 0) >>> 0,
  };
}

// The compose bridge carries a normalized rectangle, not a Swift-style method.
function verseRect(verse, width, height) {
  const r = verse.rect;
  return new CRect(r.x * width, r.y * height, r.width * width, r.height * height);
}

function Part(canv, mist, near, wash, tooth, fade, plain) {
  if (mist && typeof mist === 'object' && ('canv' in mist || 'near' in mist || 'wash' in mist || 'tooth' in mist || 'fade' in mist || 'plain' in mist || 'mist' in mist)) {
    var opts = mist;
    return {
      canv: (opts.canv !== undefined ? opts.canv : canv) || [],
      mist: opts.mist || null,
      near: !!opts.near,
      plain: !!opts.plain,
      wash: opts.wash || null,
      tooth: opts.tooth === undefined ? null : opts.tooth,
      fade: normalizeFade(opts.fade),
    };
  }
  return {
    canv: canv || [],
    mist: mist || null,
    near: !!near,
    plain: !!plain,
    wash: wash || null,
    tooth: tooth === undefined ? null : tooth,
    fade: normalizeFade(fade),
  };
}
Part.near = function (canv, wash, tooth, fade) {
  return Part(canv, null, true, wash, tooth, fade, false);
};

// ---------------------------------------------------------------- Geometry (ZXArtGeometry.swift)

function distanceP(p0, p1) {
  var dx = p0.x - p1.x, dy = p0.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function midPtP(plist) {
  var n = plist.length;
  var ax = 0, ay = 0;
  for (var i = 0; i < n; i++) {
    ax = plist[i].x / n + ax;
    ay = plist[i].y / n + ay;
  }
  return P(ax, ay);
}

function bezmhP(input, w) {
  if (w === undefined) w = 1;
  var pts = input.slice();
  if (pts.length === 2) pts = [pts[0], midPtP([pts[0], pts[1]]), pts[1]];
  var plist = [];
  if (pts.length < 3) return plist;
  for (var j = 0; j < pts.length - 2; j++) {
    var p0 = j === 0 ? pts[j] : midPtP([pts[j], pts[j + 1]]);
    var p1 = pts[j + 1];
    var p2 = j === pts.length - 3 ? pts[j + 2] : midPtP([pts[j + 1], pts[j + 2]]);
    var pl = 20;
    var end = pl + (j === pts.length - 3 ? 1 : 0);
    for (var i = 0; i < end; i++) {
      var t = i / pl;
      var u = Math.pow(1 - t, 2) + 2 * t * (1 - t) * w + t * t;
      plist.push(P(
        (Math.pow(1 - t, 2) * p0.x + 2 * t * (1 - t) * p1.x * w + t * t * p2.x) / u,
        (Math.pow(1 - t, 2) * p0.y + 2 * t * (1 - t) * p1.y * w + t * t * p2.y) / u
      ));
    }
  }
  return plist;
}

function divP(plist, reso) {
  if (!plist || !plist.length) return [];
  var rlist = [];
  var tl = (plist.length - 1) * reso;
  for (var i = 0; i < tl; i += 1) {
    var lastp = plist[Math.floor(i / reso)];
    var nextp = plist[Math.ceil(i / reso)];
    var p = (i % reso) / reso;
    rlist.push(P(lastp.x * (1 - p) + nextp.x * p, lastp.y * (1 - p) + nextp.y * p));
  }
  rlist.push(plist[plist.length - 1]);
  return rlist;
}

function tubifyP(pts, wfun) {
  if (pts && typeof pts === 'object' && !Array.isArray(pts)) {
    wfun = pts.wid;
    pts = pts.pts;
  }
  if (wfun && typeof wfun === 'object' && typeof wfun.wid === 'function') {
    wfun = wfun.wid;
  } else if (typeof wfun === 'number') {
    var fixedW = wfun;
    wfun = function () { return fixedW; };
  } else if (typeof wfun !== 'function') {
    wfun = function () { return 10; };
  }
  var v0 = [], v1 = [];
  var n = pts.length;
  if (n < 2) return [v0, v1];
  for (var i = 1; i < n - 1; i++) {
    var w = wfun(i / n);
    var a1 = Math.atan2(pts[i].y - pts[i - 1].y, pts[i].x - pts[i - 1].x);
    var a2 = Math.atan2(pts[i].y - pts[i + 1].y, pts[i].x - pts[i + 1].x);
    var a = (a1 + a2) / 2;
    if (a < a2) a += Math.PI;
    v0.push(P(pts[i].x + w * Math.cos(a), pts[i].y + w * Math.sin(a)));
    v1.push(P(pts[i].x - w * Math.cos(a), pts[i].y - w * Math.sin(a)));
  }
  var l = n - 1;
  var ang0 = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x) - Math.PI / 2;
  var ang1 = Math.atan2(pts[l].y - pts[l - 1].y, pts[l].x - pts[l - 1].x) - Math.PI / 2;
  var w0 = wfun(0), w1 = wfun(1);
  v0.unshift(P(pts[0].x + w0 * Math.cos(ang0), pts[0].y + w0 * Math.sin(ang0)));
  v1.unshift(P(pts[0].x - w0 * Math.cos(ang0), pts[0].y - w0 * Math.sin(ang0)));
  v0.push(P(pts[l].x + w1 * Math.cos(ang1), pts[l].y + w1 * Math.sin(ang1)));
  v1.push(P(pts[l].x - w1 * Math.cos(ang1), pts[l].y - w1 * Math.sin(ang1)));
  return [v0, v1];
}

function loopNoise(ns) {
  var count = ns.length;
  var dif = ns[count - 1] - ns[0];
  var lo = 100, hi = -100;
  for (var i = 0; i < count; i++) {
    ns[i] += (dif * (count - 1 - i)) / (count - 1);
    if (ns[i] < lo) lo = ns[i];
    if (ns[i] > hi) hi = ns[i];
  }
  for (var j = 0; j < count; j++) ns[j] = mapval(ns[j], lo, hi, 0, 1);
}

function triangulateP(plist, area, convex, optimize) {
  if (area === undefined) area = 100;
  if (convex === undefined) convex = false;
  if (optimize === undefined) optimize = true;
  function lineExpr(pt0, pt1) {
    var den = pt1.x - pt0.x;
    var m = den === 0 ? Infinity : (pt1.y - pt0.y) / den;
    return [m, pt0.y - m * pt0.x];
  }
  function intersect(a0, a1, b0, b1) {
    var le0 = lineExpr(a0, a1), le1 = lineExpr(b0, b1);
    var den = le0[0] - le1[0];
    if (den === 0) return false;
    var x = (le1[1] - le0[1]) / den;
    var y = le0[0] * x + le0[1];
    function onSeg(p0, p1) {
      return Math.min(p0.x, p1.x) <= x && x <= Math.max(p0.x, p1.x) && Math.min(p0.y, p1.y) <= y && y <= Math.max(p0.y, p1.y);
    }
    return onSeg(a0, a1) && onSeg(b0, b1);
  }
  function ptInPoly(pt, pl) {
    var scount = 0;
    for (var i = 0; i < pl.length; i++) {
      var np = pl[i !== pl.length - 1 ? i + 1 : 0];
      if (intersect(pl[i], np, pt, P(pt.x + 999, pt.y + 999))) scount++;
    }
    return scount % 2 === 1;
  }
  function lnInPoly(l0, l1, pl) {
    var ep = 0.01;
    var c0 = P(l0.x * (1 - ep) + l1.x * ep, l0.y * (1 - ep) + l1.y * ep);
    var c1 = P(l0.x * ep + l1.x * (1 - ep), l0.y * ep + l1.y * (1 - ep));
    for (var i = 0; i < pl.length; i++) {
      var np = pl[i !== pl.length - 1 ? i + 1 : 0];
      if (intersect(c0, c1, pl[i], np)) return false;
    }
    return ptInPoly(midPtP([l0, l1]), pl);
  }
  function sidesOf(pl) {
    return pl.map(function (pt, i) {
      var np = pl[i !== pl.length - 1 ? i + 1 : 0];
      return Math.sqrt(Math.pow(np.x - pt.x, 2) + Math.pow(np.y - pt.y, 2));
    });
  }
  function areaOf(pl) {
    var s = sidesOf(pl);
    var a = s[0], b = s[1], c = s[2];
    var h = (a + b + c) / 2;
    return Math.sqrt(h * (h - a) * (h - b) * (h - c));
  }
  function bestEar(pl) {
    var cuts = [];
    for (var i = 0; i < pl.length; i++) {
      var pt = pl[i];
      var lp = pl[i !== 0 ? i - 1 : pl.length - 1];
      var np = pl[i !== pl.length - 1 ? i + 1 : 0];
      var q = pl.slice();
      q.splice(i, 1);
      if (convex || lnInPoly(lp, np, pl)) {
        var c = [[lp, pt, np], q];
        if (!optimize) return c;
        cuts.push(c);
      }
    }
    var best = [pl, []], bestRatio = 0;
    for (var k = 0; k < cuts.length; k++) {
      var c0 = cuts[k];
      var a = areaOf(c0[0]);
      var s = sidesOf(c0[0]);
      var per = s[0] + s[1] + s[2];
      var r = a / per;
      if (r >= bestRatio) { best = c0; bestRatio = r; }
    }
    return best;
  }
  function shatter(pl, a, depth) {
    if (!pl.length) return [];
    if (pl.length < 3 || areaOf(pl) < a || depth > 48) return [pl];
    var slist = sidesOf(pl);
    var ind = 0;
    for (var i = 0; i < slist.length; i++) if (slist[i] > slist[ind]) ind = i;
    var nind = (ind + 1) % pl.length;
    var lind = (ind + 2) % pl.length;
    var mid = midPtP([pl[ind], pl[nind]]);
    return shatter([pl[ind], mid, pl[lind]], a, depth + 1).concat(shatter([pl[lind], pl[nind], mid], a, depth + 1));
  }
  var out = [], rest = plist.slice();
  while (true) {
    if (rest.length <= 3) {
      return out.concat(shatter(rest, area, 0));
    }
    var cut = bestEar(rest);
    out = out.concat(shatter(cut[0], area, 0));
    rest = cut[1];
  }
}

// ---------------------------------------------------------------- Entropy (ZXArtRandom.swift)

function encodeSeedBase64(s) {
  var str = String(s);
  if (typeof btoa === 'function') {
    try {
      return btoa(unescape(encodeURIComponent(str)));
    } catch (_) {}
  }
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(str, 'utf8').toString('base64');
  }
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  var encoded = '';
  var u8 = unescape(encodeURIComponent(str));
  for (var i = 0; i < u8.length; i += 3) {
    var b0 = u8.charCodeAt(i);
    var b1 = i + 1 < u8.length ? u8.charCodeAt(i + 1) : NaN;
    var b2 = i + 2 < u8.length ? u8.charCodeAt(i + 2) : NaN;
    encoded += chars.charAt(b0 >> 2);
    encoded += chars.charAt(((b0 & 3) << 4) | (isNaN(b1) ? 0 : (b1 >> 4)));
    encoded += isNaN(b1) ? '=' : chars.charAt(((b1 & 15) << 2) | (isNaN(b2) ? 0 : (b2 >> 6)));
    encoded += isNaN(b2) ? '=' : chars.charAt(b2 & 63);
  }
  return encoded;
}

function EntropyV5(seedString) {
  var b64 = encodeSeedBase64(seedString);
  var tm = 0;
  for (var i = 0; i < b64.length; i++) tm += b64.charCodeAt(i);
  if (tm === 0) tm = 1234;
  this.state = (tm % 4294967296) >>> 0;
  this.perlin = null;
}

EntropyV5.prototype.random = function () {
  // UInt64(state) * 1664525 + 1013904223 mod 2^32
  this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0;
  return this.state / 4294967296;
};

EntropyV5.prototype.noise = function (x, y, z) {
  if (y === undefined) y = 0;
  if (z === undefined) z = 0;
  if (!this.perlin) {
    var entries = new Float64Array(4096);
    for (var k = 0; k < 4096; k++) entries[k] = this.random();
    this.perlin = entries;
  }
  var p = this.perlin;
  var xx = x < 0 ? -x : x;
  var yy = y < 0 ? -y : y;
  var zz = z < 0 ? -z : z;
  var xi = Math.floor(xx), yi = Math.floor(yy), zi = Math.floor(zz);
  var xf = xx - xi, yf = yy - yi, zf = zz - zi;
  var r = 0, ampl = 0.5;
  function scaledCosine(t) { return 0.5 * (1.0 - Math.cos(t * Math.PI)); }
  for (var o = 0; o < 4; o++) {
    var of = xi + (yi << 4) + (zi << 8);
    var rxf = scaledCosine(xf), ryf = scaledCosine(yf);
    var n1 = p[of & 4095];
    n1 += rxf * (p[(of + 1) & 4095] - n1);
    var n2 = p[(of + 16) & 4095];
    n2 += rxf * (p[(of + 16 + 1) & 4095] - n2);
    n1 += ryf * (n2 - n1);
    of += 256;
    n2 = p[of & 4095];
    n2 += rxf * (p[(of + 1) & 4095] - n2);
    var n3 = p[(of + 16) & 4095];
    n3 += rxf * (p[(of + 16 + 1) & 4095] - n3);
    n2 += ryf * (n3 - n2);
    n1 += scaledCosine(zf) * (n2 - n1);
    r += n1 * ampl;
    ampl *= 0.5;
    xi <<= 1; xf *= 2;
    yi <<= 1; yf *= 2;
    zi <<= 1; zf *= 2;
    if (xf >= 1.0) { xi += 1; xf -= 1; }
    if (yf >= 1.0) { yi += 1; yf -= 1; }
    if (zf >= 1.0) { zi += 1; zf -= 1; }
  }
  return r;
};

EntropyV5.prototype.normRand = function (m, M) {
  return mapval(this.random(), 0, 1, m, M);
};

EntropyV5.prototype.choice = function (arr) {
  return arr[Math.floor(arr.length * this.random())];
};
EntropyV5.prototype.randChoice = EntropyV5.prototype.choice;

EntropyV5.prototype.wtrand = function (weight) {
  var x = this.random(), y = this.random();
  return y < weight(x) ? x : this.wtrand(weight);
};

EntropyV5.prototype.randGaussian = function () {
  return this.wtrand(function (x) { return Math.pow(Math.E, -24 * Math.pow(x - 0.5, 2)); }) * 2 - 1;
};

// ---------------------------------------------------------------- ShanShuiEngineV5 Base

function ShanShuiEngineV5(seedString) {
  this.e = new EntropyV5(seedString);
  this.planmtx = {};
  this.memXmin = 0;
  this.memXmax = 0;
  this.cwid = 512;
  this.drawTowers = true;
  this.recordsAnchors = true;
  this.snowLight = 1.0;
  this.anchorLog = [];
  this.anchorPieces = [];
}

ShanShuiEngineV5.sinFun = function (x) { return Math.sin(x * Math.PI); };
ShanShuiEngineV5.blobFun = function (x) {
  return x <= 1 ? Math.pow(Math.sin(x * Math.PI), 0.5) : -Math.pow(Math.sin((x + 1) * Math.PI), 0.5);
};
ShanShuiEngineV5.fun02 = function (x) {
  return x <= 1 ? Math.pow(Math.sin(x * Math.PI) * x, 0.5) : -Math.pow(Math.sin((x - 2) * Math.PI * (x - 2)), 0.5);
};
ShanShuiEngineV5.one = function () { return 1; };

ShanShuiEngineV5.prototype.r = function () { return this.e.random(); };
ShanShuiEngineV5.prototype.n = function (x, y, z) {
  return this.e.noise(x, y === undefined ? 0 : y, z === undefined ? 0 : z);
};
ShanShuiEngineV5.prototype.wtrand = function (weight) { return this.e.wtrand(weight); };
ShanShuiEngineV5.prototype.randGaussian = function () { return this.e.randGaussian(); };
ShanShuiEngineV5.prototype.normRand = function (m, M) { return this.e.normRand(m, M); };
ShanShuiEngineV5.prototype.choice = function (arr) { return this.e.choice(arr); };
ShanShuiEngineV5.prototype.randChoice = function (arr) { return this.e.choice(arr); };

ShanShuiEngineV5.prototype.poly = function (plist, a, b, c, d, e) {
  var xof = 0, yof = 0, fil = C.clear, str = null, wid = 0, wash = false;
  if (a && typeof a === 'object' && !('r' in a)) {
    xof = a.xof || 0;
    yof = a.yof || 0;
    fil = a.fil === undefined ? C.clear : a.fil;
    str = a.str === undefined ? null : a.str;
    wid = a.wid || 0;
    wash = !!a.wash;
  } else {
    xof = a || 0;
    yof = b || 0;
    fil = c === undefined ? C.clear : c;
    str = d === undefined ? null : d;
    wid = e || 0;
  }
  var pts = (xof === 0 && yof === 0)
    ? plist.map(function (pt) { return P(pt.x, pt.y); })
    : plist.map(function (pt) { return P(pt.x + xof, pt.y + yof); });
  return { p: pts, pts: pts, fil: fil, str: str, wid: wid, wash: wash };
};

ShanShuiEngineV5.prototype.stroke = function (ptlist, opts) {
  opts = opts || {};
  var xof = opts.xof || 0, yof = opts.yof || 0;
  var wid = opts.wid === undefined ? 2 : opts.wid;
  var col = opts.col === undefined ? C(200, 200, 200, 0.9) : opts.col;
  var noi = opts.noi === undefined ? 0.5 : opts.noi;
  var out = opts.out === undefined ? 1 : opts.out;
  var fun = opts.fun || ShanShuiEngineV5.sinFun;
  if (!ptlist || !ptlist.length) return [];
  var n0 = this.r() * 10;
  var cnt = ptlist.length;
  var v0 = [], v1 = [];
  if (cnt > 2) {
    for (var i = 1; i < cnt - 1; i++) {
      var w = wid * fun(i / cnt);
      w = w * (1 - noi) + w * noi * this.n(i * 0.5, n0);
      var a1 = Math.atan2(ptlist[i].y - ptlist[i - 1].y, ptlist[i].x - ptlist[i - 1].x);
      var a2 = Math.atan2(ptlist[i].y - ptlist[i + 1].y, ptlist[i].x - ptlist[i + 1].x);
      var a = (a1 + a2) / 2;
      if (a < a2) a += Math.PI;
      v0.push(P(ptlist[i].x + w * Math.cos(a), ptlist[i].y + w * Math.sin(a)));
      v1.push(P(ptlist[i].x - w * Math.cos(a), ptlist[i].y - w * Math.sin(a)));
    }
  }
  var vtx = [ptlist[0]].concat(v0, [ptlist[cnt - 1]], v1.slice().reverse(), [ptlist[0]]);
  return [this.poly(vtx, { xof: xof, yof: yof, fil: col, str: col, wid: out })];
};

ShanShuiEngineV5.prototype.blobPoints = function (x, y, opts) {
  opts = opts || {};
  var len = opts.len === undefined ? 20 : opts.len;
  var wid = opts.wid === undefined ? 5 : opts.wid;
  var ang = opts.ang === undefined ? 0 : opts.ang;
  var noi = opts.noi === undefined ? 0.5 : opts.noi;
  var fun = opts.fun || ShanShuiEngineV5.blobFun;
  var reso = 20.0;
  var lalist = [];
  for (var i = 0; i <= 20; i++) {
    var p = (i / reso) * 2;
    var xo = len / 2 - Math.abs(p - 1) * len;
    var yo = (fun(p) * wid) / 2;
    lalist.push([Math.sqrt(xo * xo + yo * yo), Math.atan2(yo, xo)]);
  }
  var nslist = [];
  var n0 = this.r() * 10;
  for (var j = 0; j <= 20; j++) nslist.push(this.n(j * 0.05, n0));
  loopNoise(nslist);
  var plist = [];
  for (var k = 0; k < lalist.length; k++) {
    var ns = nslist[k] * noi + (1 - noi);
    plist.push(P(
      x + Math.cos(lalist[k][1] + ang) * lalist[k][0] * ns,
      y + Math.sin(lalist[k][1] + ang) * lalist[k][0] * ns
    ));
  }
  return plist;
};

ShanShuiEngineV5.prototype.blob = function (x, y, opts) {
  opts = opts || {};
  var col = opts.col === undefined ? C(200, 200, 200, 0.9) : opts.col;
  return [this.poly(this.blobPoints(x, y, opts), { fil: col, str: col, wid: 0 })];
};

ShanShuiEngineV5.prototype.texture = function (ptlist, opts) {
  opts = opts || {};
  var self = this;
  var xof = opts.xof || 0, yof = opts.yof || 0;
  var tex = opts.tex === undefined ? 400 : opts.tex;
  var wid = opts.wid === undefined ? 1.5 : opts.wid;
  var len = opts.len === undefined ? 0.2 : opts.len;
  var sha = opts.sha === undefined ? 0 : opts.sha;
  var noi = opts.noi || function (v) { return 30 / v; };
  var colF = opts.col || function () { return C.ink(self.r() * 0.3); };
  var disF = opts.dis || function () {
    if (self.r() > 0.5) return (1.0 / 3) * self.r();
    return (1.0 * 2) / 3 + (1.0 / 3) * self.r();
  };
  var reso0 = ptlist.length, reso1 = ptlist[0].length;
  var texlist = [];
  for (var i = 0; i < tex; i += 1) {
    var mid = or0(disF() * reso1);
    var hlen = Math.floor(this.r() * (reso1 * len));
    var start = Math.min(Math.max(mid - hlen, 0), reso1);
    var end = Math.min(Math.max(mid + hlen, 0), reso1);
    var layer = (i / tex) * (reso0 - 1);
    var row = [];
    if (start < end) {
      var lf = Math.floor(layer), lc = Math.ceil(layer);
      var p = layer - lf;
      for (var j = start; j < end; j++) {
        var x = ptlist[lf][j].x * p + ptlist[lc][j].x * (1 - p);
        var y = ptlist[lf][j].y * p + ptlist[lc][j].y * (1 - p);
        var nx = noi(layer + 1) * (this.n(x, j * 0.5) - 0.5);
        var ny = noi(layer + 1) * (this.n(y, j * 0.5) - 0.5);
        row.push(P(x + nx, y + ny));
      }
    }
    texlist.push(row);
  }
  var canv = [];
  function off(l) { return l.map(function (pt) { return P(pt.x + xof, pt.y + yof); }); }
  if (sha !== 0) {
    for (var j0 = 0; j0 < texlist.length; j0 += 2) {
      canv = canv.concat(this.stroke(off(texlist[j0]), { wid: sha, col: C.gray(100, 0.1) }));
    }
  }
  var step = 1 + Math.trunc(sha);
  for (var j1 = Math.trunc(sha); j1 < texlist.length; j1 += step) {
    var c = colF(j1 / texlist.length);
    canv = canv.concat(this.stroke(off(texlist[j1]), { wid: wid, col: c }));
  }
  return canv;
};

ShanShuiEngineV5.prototype.foot = function (ptlist, xof, yof) {
  xof = xof || 0; yof = yof || 0;
  var ftlist = [];
  var span = 10;
  var ni = 0;
  var count = ptlist.length;
  if (count > 2) {
    for (var i = 0; i < count - 2; i++) {
      if (i !== ni) continue;
      ni = Math.min(ni + this.e.choice([1, 2]), count - 1);
      var a = [], b = [];
      var row = ptlist[i];
      var limit = Math.min(row.length / 8, 10);
      for (var j = 0; j < limit; j += 1) {
        var jj = Math.trunc(j);
        a.push(P(row[jj].x + this.n(j * 0.1, i) * 10, row[jj].y));
        b.push(P(row[row.length - 1 - jj].x - this.n(j * 0.1, i) * 10, row[row.length - 1 - jj].y));
      }
      a.reverse(); b.reverse();
      for (var k = 0; k < span; k++) {
        var p = k / span;
        var x1 = row[0].x * (1 - p) + ptlist[ni][0].x * p;
        var y1 = row[0].y * (1 - p) + ptlist[ni][0].y * p;
        var x2 = row[row.length - 1].x * (1 - p) + ptlist[ni][row.length - 1].x * p;
        var y2 = row[row.length - 1].y * (1 - p) + ptlist[ni][row.length - 1].y * p;
        var vib = -1.7 * (p - 1) * Math.pow(p, 1.0 / 5);
        y1 += vib * 5 + this.n(xof * 0.05, i) * 5;
        y2 += vib * 5 + this.n(xof * 0.05, i) * 5;
        a.push(P(x1, y1));
        b.push(P(x2, y2));
      }
      ftlist.push(a);
      ftlist.push(b);
    }
  }
  var canv = [];
  for (var m = 0; m < ftlist.length; m++) {
    canv.push(this.poly(ftlist[m], { xof: xof, yof: yof, fil: C.white, str: null }));
  }
  for (var m2 = 0; m2 < ftlist.length; m2++) {
    var c = C.ink(0.1 + this.r() * 0.1);
    canv = canv.concat(this.stroke(ftlist[m2].map(function (pt) { return P(pt.x + xof, pt.y + yof); }), { wid: 1, col: c }));
  }
  return canv;
};

ShanShuiEngineV5.prototype.distMount = function (xoff, yoff, seed, hei, len, seg) {
  if (typeof hei === 'object' && hei !== null) {
    len = hei.len;
    seg = hei.seg;
    hei = hei.hei;
  }
  if (seed === undefined) seed = 0;
  if (hei === undefined) hei = 300;
  if (len === undefined) len = 2000;
  if (seg === undefined) seg = 5;
  var self = this;
  var canv = [];
  var span = 10.0;
  var ptlist = [];
  for (var i = 0; i < len / span / seg; i += 1) {
    var row = [];
    for (var j = 0; j < seg + 1; j += 1) {
      var k = i * seg + j;
      row.push(P(xoff + k * span, yoff - hei * this.n(k * 0.05, seed) * Math.pow(Math.sin((Math.PI * k) / (len / span)), 0.5)));
    }
    for (var j2 = 0; j2 < seg / 2 + 1; j2 += 1) {
      var k2 = i * seg + j2 * 2;
      row.unshift(P(xoff + k2 * span, yoff + 24 * this.n(k2 * 0.05, 2, seed) * Math.pow(Math.sin((Math.PI * k2) / (len / span)), 1)));
    }
    ptlist.push(row);
  }
  function getCol(x, y) {
    var c = or0(self.n(x * 0.02, y * 0.02, yoff) * 55 + 200);
    return C(c, c, c, 1);
  }
  for (var r = 0; r < ptlist.length; r++) {
    var row0 = ptlist[r];
    var p = this.poly(row0, { fil: getCol(row0[row0.length - 1].x, row0[row0.length - 1].y), str: null, wid: 1, wash: true });
    canv.push(p);
    var T = triangulateP(row0, 100, true, false);
    for (var ti = 0; ti < T.length; ti++) {
      var t = T[ti];
      var m = midPtP(t);
      var co = getCol(m.x, m.y);
      canv.push(this.poly(t, { fil: co, str: co, wid: 1, wash: true }));
    }
  }
  return canv;
};

ShanShuiEngineV5.prototype.rock = function (xoff, yoff, seed, hei, wid, tex, sha) {
  if (typeof hei === 'object' && hei !== null) {
    wid = hei.wid;
    tex = hei.tex;
    sha = hei.sha;
    hei = hei.hei;
  }
  if (seed === undefined) seed = 0;
  if (hei === undefined) hei = 80;
  if (wid === undefined) wid = 100;
  if (tex === undefined) tex = 40;
  if (sha === undefined) sha = 10;
  var self = this;
  var canv = [];
  var reso0 = 10, reso1 = 50;
  var ptlist = [];
  for (var i = 0; i < reso0; i++) {
    var nslist = [];
    for (var j = 0; j < reso1; j++) nslist.push(this.n(i, j * 0.2, seed));
    loopNoise(nslist);
    var row = [];
    for (var j2 = 0; j2 < reso1; j2++) {
      var a = (j2 / reso1) * Math.PI * 2 - Math.PI / 2;
      var hc = hei * Math.cos(a), ws = wid * Math.sin(a);
      var l = (wid * hei) / Math.sqrt(hc * hc + ws * ws);
      l *= 0.7 + 0.3 * nslist[j2];
      var p = 1 - i / reso0;
      var nx = Math.cos(a) * l * p;
      var ny = -Math.sin(a) * l * p;
      if (Math.PI < a || a < 0) ny *= 0.2;
      ny += hei * (i / reso0) * 0.2;
      row.push(P(nx, ny));
    }
    ptlist.push(row);
  }
  canv.push(this.poly(ptlist[0].concat([P(0, 0)]), { xof: xoff, yof: yoff, fil: C.white, str: null }));
  canv = canv.concat(this.stroke(ptlist[0].map(function (pt) { return P(pt.x + xoff, pt.y + yoff); }), { wid: 3, col: C.ink(0.3), noi: 1 }));
  canv = canv.concat(this.texture(ptlist, {
    xof: xoff, yof: yoff, tex: tex, wid: 3, sha: sha,
    col: function () { return C(180, 180, 180, toFixed(0.3 + self.r() * 0.3, 3)); },
    dis: function () { return self.r() > 0.5 ? 0.15 + 0.15 * self.r() : 0.85 - 0.15 * self.r(); }
  }));
  return canv;
};

ShanShuiEngineV5.prototype.tree02 = function (x, y, opts) {
  opts = opts || {};
  var hei = opts.hei === undefined ? 16 : opts.hei;
  var wid = opts.wid === undefined ? 8 : opts.wid;
  var clu = opts.clu === undefined ? 5 : opts.clu;
  var col = opts.col === undefined ? C.ink(0.5) : opts.col;
  var canv = [];
  for (var i = 0; i < clu; i += 1) {
    var bx = x + this.e.randGaussian() * clu * 4;
    var by = y + this.e.randGaussian() * clu * 4;
    var bw = this.r() * wid * 0.75 + wid * 0.5;
    var bl = this.r() * hei * 0.75 + hei * 0.5;
    canv = canv.concat(this.blob(bx, by, { len: bl, wid: bw, ang: Math.PI / 2, col: col, fun: ShanShuiEngineV5.fun02 }));
  }
  return canv;
};

ShanShuiEngineV5.prototype.box = function (xoff, yoff, opts) {
  opts = opts || {};
  var hei = opts.hei === undefined ? 20 : opts.hei;
  var wid = opts.wid === undefined ? 120 : opts.wid;
  var rot = opts.rot === undefined ? 0.7 : opts.rot;
  var per = opts.per === undefined ? 4 : opts.per;
  var tra = opts.tra === undefined ? true : opts.tra;
  var bot = opts.bot === undefined ? true : opts.bot;
  var wei = opts.wei === undefined ? 3 : opts.wei;
  var dec = opts.dec || function () { return []; };
  var mid = -wid * 0.5 + wid * rot;
  var bmid = -wid * 0.5 + wid * (1 - rot);
  var ptlist = [];
  ptlist.push(divP([P(-wid * 0.5, -hei), P(-wid * 0.5, 0)], 5));
  ptlist.push(divP([P(wid * 0.5, -hei), P(wid * 0.5, 0)], 5));
  if (bot) {
    ptlist.push(divP([P(-wid * 0.5, 0), P(mid, per)], 5));
    ptlist.push(divP([P(wid * 0.5, 0), P(mid, per)], 5));
  }
  ptlist.push(divP([P(mid, -hei), P(mid, per)], 5));
  if (tra) {
    if (bot) {
      ptlist.push(divP([P(-wid * 0.5, 0), P(bmid, -per)], 5));
      ptlist.push(divP([P(wid * 0.5, 0), P(bmid, -per)], 5));
    }
    ptlist.push(divP([P(bmid, -hei), P(bmid, -per)], 5));
  }
  var surf = (rot < 0.5 ? 1.0 : 0.0) * 2 - 1;
  ptlist = ptlist.concat(dec({ pul: P(surf * wid * 0.5, -hei), pur: P(mid, -hei + per), pdl: P(surf * wid * 0.5, 0), pdr: P(mid, per) }));
  var polist = [P(-wid * 0.5, -hei), P(wid * 0.5, -hei), P(wid * 0.5, 0), P(mid, per), P(-wid * 0.5, 0)];
  var canv = [];
  if (!tra) canv.push(this.poly(polist, { xof: xoff, yof: yoff, fil: C.white, str: null }));
  for (var i = 0; i < ptlist.length; i++) {
    canv = canv.concat(this.stroke(ptlist[i].map(function (pt) { return P(pt.x + xoff, pt.y + yoff); }), { wid: wei, col: C.ink(0.4), noi: 1, fun: ShanShuiEngineV5.one }));
  }
  return canv;
};

ShanShuiEngineV5.prototype.deco = function (style, a, hsp, vsp) {
  if (!hsp) hsp = [1, 3];
  if (!vsp) vsp = [1, 2];
  var plist = [];
  var dl = divP([a.pul, a.pdl], vsp[1]);
  var dr = divP([a.pur, a.pdr], vsp[1]);
  var du = divP([a.pul, a.pur], hsp[1]);
  var dd = divP([a.pdl, a.pdr], hsp[1]);
  if (style === 1 || style === 3) {
    var mlu = du[hsp[0]], mru = du[du.length - 1 - hsp[0]];
    var mld = dd[hsp[0]], mrd = dd[du.length - 1 - hsp[0]];
    for (var i = vsp[0]; i < dl.length - vsp[0]; i += vsp[0]) {
      var mml = divP([mlu, mld], vsp[1])[i];
      var mmr = divP([mru, mrd], vsp[1])[i];
      if (style === 1) {
        plist.push(divP([mml, dl[i]], 5));
        plist.push(divP([mmr, dr[i]], 5));
      } else {
        var mmu = divP([mlu, mru], vsp[1])[i];
        var mmd = divP([mld, mrd], vsp[1])[i];
        plist.push(divP([mml, mmr], 5));
        plist.push(divP([mmu, mmd], 5));
      }
    }
    plist.push(divP([mlu, mld], 5));
    plist.push(divP([mru, mrd], 5));
  } else if (style === 2) {
    for (var j = hsp[0]; j < du.length - hsp[0]; j += hsp[0]) {
      plist.push(divP([du[j], dd[j]], 5));
    }
  }
  return plist;
};

ShanShuiEngineV5.prototype.rail = function (xoff, yoff, seed, opts) {
  opts = opts || {};
  var hei = opts.hei === undefined ? 20 : opts.hei;
  var wid = opts.wid === undefined ? 180 : opts.wid;
  var rot = opts.rot === undefined ? 0.7 : opts.rot;
  var per = opts.per === undefined ? 4 : opts.per;
  var seg = opts.seg === undefined ? 4 : opts.seg;
  var wei = opts.wei === undefined ? 1 : opts.wei;
  var tra = opts.tra === undefined ? true : opts.tra;
  var fro = opts.fro === undefined ? true : opts.fro;
  var mid = -wid * 0.5 + wid * rot;
  var bmid = -wid * 0.5 + wid * (1 - rot);
  var ptlist = [];
  if (fro) {
    ptlist.push(divP([P(-wid * 0.5, 0), P(mid, per)], seg));
    ptlist.push(divP([P(mid, per), P(wid * 0.5, 0)], seg));
  }
  if (tra) {
    ptlist.push(divP([P(-wid * 0.5, 0), P(bmid, -per)], seg));
    ptlist.push(divP([P(bmid, -per), P(wid * 0.5, 0)], seg));
  }
  if (fro) {
    ptlist.push(divP([P(-wid * 0.5, -hei), P(mid, -hei + per)], seg));
    ptlist.push(divP([P(mid, -hei + per), P(wid * 0.5, -hei)], seg));
  }
  if (tra) {
    ptlist.push(divP([P(-wid * 0.5, -hei), P(bmid, -hei - per)], seg));
    ptlist.push(divP([P(bmid, -hei - per), P(wid * 0.5, -hei)], seg));
  }
  if (tra) {
    var open = Math.floor(this.r() * ptlist.length);
    ptlist[open] = ptlist[open].slice(0, -1);
    ptlist[open] = ptlist[open].slice(0, -1);
  }
  var canv = [];
  var L = ptlist.length;
  for (var i = 0; i < L / 2; i++) {
    for (var j = 0; j < ptlist[i].length; j++) {
      ptlist[i][j].y += (this.n(i, j * 0.5, seed) - 0.5) * hei;
      var pi2 = (Math.trunc(L / 2) + i) % L;
      var pj = j % ptlist[pi2].length;
      ptlist[pi2][pj].y += (this.n(i + 0.5, j * 0.5, seed) - 0.5) * hei;
      var ln = divP([ptlist[i][j], ptlist[pi2][pj]], 2);
      ln[0].x += (this.r() - 0.5) * hei * 0.5;
      canv.push(this.poly(ln, { xof: xoff, yof: yoff, fil: null, str: C.ink(0.5), wid: 2 }));
    }
  }
  for (var k = 0; k < ptlist.length; k++) {
    canv = canv.concat(this.stroke(ptlist[k].map(function (pt) { return P(pt.x + xoff, pt.y + yoff); }), { wid: wei, col: C.ink(0.5), noi: 0.5, fun: ShanShuiEngineV5.one }));
  }
  return canv;
};

ShanShuiEngineV5.prototype.roof = function (xoff, yoff, opts) {
  opts = opts || {};
  var hei = opts.hei === undefined ? 20 : opts.hei;
  var wid = opts.wid === undefined ? 120 : opts.wid;
  var rot = opts.rot === undefined ? 0.7 : opts.rot;
  var per = opts.per === undefined ? 4 : opts.per;
  var cor = opts.cor === undefined ? 5 : opts.cor;
  var wei = opts.wei === undefined ? 3 : opts.wei;
  function opf(l) { return rot < 0.5 ? l.map(function (pt) { return P(-pt.x, pt.y); }) : l; }
  var rrot = rot < 0.5 ? 1 - rot : rot;
  var mid = -wid * 0.5 + wid * rrot;
  var quat = (mid + wid * 0.5) * 0.5 - mid;
  var ptlist = [
    divP(opf([P(-wid * 0.5 + quat, -hei - per / 2), P(-wid * 0.5 + quat * 0.5, -hei / 2 - per / 4), P(-wid * 0.5 - cor, 0)]), 5),
    divP(opf([P(mid + quat, -hei), P((mid + quat + wid * 0.5) / 2, -hei / 2), P(wid * 0.5 + cor, 0)]), 5),
    divP(opf([P(mid + quat, -hei), P(mid + quat / 2, -hei / 2 + per / 2), P(mid + cor, per)]), 5),
    divP(opf([P(-wid * 0.5 - cor, 0), P(mid + cor, per)]), 5),
    divP(opf([P(wid * 0.5 + cor, 0), P(mid + cor, per)]), 5),
    divP(opf([P(-wid * 0.5 + quat, -hei - per / 2), P(mid + quat, -hei)]), 5),
  ];
  var polist = opf([P(-wid * 0.5, 0), P(-wid * 0.5 + quat, -hei - per / 2), P(mid + quat, -hei), P(wid * 0.5, 0), P(mid, per)]);
  var canv = [this.poly(polist, { xof: xoff, yof: yoff, fil: C.white, str: null })];
  for (var i = 0; i < ptlist.length; i++) {
    canv = canv.concat(this.stroke(ptlist[i].map(function (pt) { return P(pt.x + xoff, pt.y + yoff); }), { wid: wei, col: C.ink(0.4), noi: 1, fun: ShanShuiEngineV5.one }));
  }
  return canv;
};

ShanShuiEngineV5.prototype.pagroof = function (xoff, yoff, opts) {
  opts = opts || {};
  var hei = opts.hei === undefined ? 20 : opts.hei;
  var wid = opts.wid === undefined ? 120 : opts.wid;
  var per = opts.per === undefined ? 4 : opts.per;
  var cor = opts.cor === undefined ? 10 : opts.cor;
  var sid = opts.sid === undefined ? 4 : opts.sid;
  var wei = opts.wei === undefined ? 3 : opts.wei;
  var ptlist = [], polist = [P(0, -hei)], canv = [];
  for (var i = 0; i < sid; i++) {
    var t = (i * 1.0) / (sid - 1) - 0.5;
    var fx = wid * t, fy = per * (1 - Math.abs(t) * 2), fxx = (wid + cor) * t;
    if (i > 0) ptlist.push([ptlist[ptlist.length - 1][2], P(fxx, fy)]);
    ptlist.push([P(0, -hei), P(fx * 0.5, (-hei + fy) * 0.5), P(fxx, fy)]);
    polist.push(P(fxx, fy));
  }
  canv.push(this.poly(polist, { xof: xoff, yof: yoff, fil: C.white, str: null }));
  for (var k = 0; k < ptlist.length; k++) {
    canv = canv.concat(this.stroke(divP(ptlist[k], 5).map(function (pt) { return P(pt.x + xoff, pt.y + yoff); }), { wid: wei, col: C.ink(0.4), noi: 1, fun: ShanShuiEngineV5.one }));
  }
  return canv;
};

ShanShuiEngineV5.prototype.arch02 = function (xoff, yoff, seed, opts) {
  opts = opts || {};
  var self = this;
  var hei = opts.hei === undefined ? 10 : opts.hei;
  var wid = opts.wid === undefined ? 50 : opts.wid;
  var rot = opts.rot === undefined ? 0.3 : opts.rot;
  var per = opts.per === undefined ? 5 : opts.per;
  var sto = opts.sto === undefined ? 3 : opts.sto;
  var sty = opts.sty === undefined ? 1 : opts.sty;
  var rai = !!opts.rai;
  var canv = [], hoff = 0;
  var hsps = [[0, 0], [1, 5], [1, 5], [1, 4]];
  var vsps = [[0, 0], [1, 2], [1, 2], [1, 3]];
  for (var i = 0; i < sto; i += 1) {
    canv = canv.concat(this.box(xoff, yoff - hoff, {
      hei: hei, wid: wid * Math.pow(0.85, i), rot: rot, per: per, tra: false, wei: 1.5,
      dec: function (a) { return self.deco(sty, a, hsps[sty], vsps[sty]); }
    }));
    if (rai) {
      canv = canv.concat(this.rail(xoff, yoff - hoff, i * 0.2, { hei: hei / 2, wid: wid * Math.pow(0.85, i) * 1.1, rot: rot, per: per, wei: 0.5, tra: false }));
    }
    if (sto === 1) this.r();
    canv = canv.concat(this.roof(xoff, yoff - hoff - hei, { hei: hei, wid: wid * Math.pow(0.9, i), rot: rot, per: per, wei: 1.5 }));
    hoff += hei * 1.5;
  }
  return canv;
};

ShanShuiEngineV5.prototype.arch03 = function (xoff, yoff, seed, opts) {
  opts = opts || {};
  var self = this;
  var hei = opts.hei === undefined ? 10 : opts.hei;
  var wid = opts.wid === undefined ? 50 : opts.wid;
  var rot = opts.rot === undefined ? 0.7 : opts.rot;
  var per = opts.per === undefined ? 5 : opts.per;
  var sto = opts.sto === undefined ? 7 : opts.sto;
  var canv = [], hoff = 0;
  for (var i = 0; i < sto; i += 1) {
    canv = canv.concat(this.box(xoff, yoff - hoff, {
      hei: hei, wid: wid * Math.pow(0.85, i), rot: rot, per: per / 2, tra: false, wei: 1.5,
      dec: function (a) { return self.deco(1, a, [1, 4], [1, 2]); }
    }));
    canv = canv.concat(this.rail(xoff, yoff - hoff, i * 0.2, { hei: hei / 2, wid: wid * Math.pow(0.85, i) * 1.1, rot: rot, per: per / 2, seg: 5, wei: 0.5, tra: false }));
    canv = canv.concat(this.pagroof(xoff, yoff - hoff - hei, { hei: hei * 1.5, wid: wid * Math.pow(0.9, i), rot: rot, per: per, wei: 1.5 }));
    hoff += hei * 1.5;
  }
  return canv;
};

ShanShuiEngineV5.prototype.arch04 = function (xoff, yoff, seed, opts) {
  opts = opts || {};
  var hei = opts.hei === undefined ? 15 : opts.hei;
  var wid = opts.wid === undefined ? 30 : opts.wid;
  var rot = opts.rot === undefined ? 0.7 : opts.rot;
  var per = opts.per === undefined ? 5 : opts.per;
  var sto = opts.sto === undefined ? 2 : opts.sto;
  var canv = [], hoff = 0;
  for (var i = 0; i < sto; i += 1) {
    canv = canv.concat(this.box(xoff, yoff - hoff, { hei: hei, wid: wid * Math.pow(0.85, i), rot: rot, per: per / 2, tra: true, wei: 1.5 }));
    canv = canv.concat(this.rail(xoff, yoff - hoff, i * 0.2, { hei: hei / 3, wid: wid * Math.pow(0.85, i) * 1.2, rot: rot, per: per / 2, seg: 3, wei: 0.5, tra: true }));
    canv = canv.concat(this.pagroof(xoff, yoff - hoff - hei, { hei: hei, wid: wid * Math.pow(0.9, i), rot: rot, per: per, wei: 1.5 }));
    hoff += hei * 1.2;
  }
  return canv;
};

ShanShuiEngineV5.prototype.transmissionTower01 = function (xoff, yoff, seed, hei, wid) {
  if (hei === undefined) hei = 100;
  if (wid === undefined) wid = 20;
  var self = this, canv = [];
  function quick(pl) {
    return self.stroke(divP(pl, 5).map(function (pt) { return P(pt.x + xoff, pt.y + yoff); }), { wid: 1, col: C.ink(0.4), fun: function () { return 0.5; } });
  }
  var p00 = P(-wid * 0.05, -hei), p01 = P(wid * 0.05, -hei);
  var p10 = P(-wid * 0.1, -hei * 0.9), p11 = P(wid * 0.1, -hei * 0.9);
  var p20 = P(-wid * 0.2, -hei * 0.5), p21 = P(wid * 0.2, -hei * 0.5);
  var p30 = P(-wid * 0.5, 0), p31 = P(wid * 0.5, 0);
  var bch = [[0.7, -0.85], [1, -0.675], [0.7, -0.5]];
  for (var i = 0; i < bch.length; i++) {
    var b = bch[i];
    canv = canv.concat(quick([P(-b[0] * wid, b[1] * hei), P(b[0] * wid, b[1] * hei)]));
    canv = canv.concat(quick([P(-b[0] * wid, b[1] * hei), P(0, (b[1] - 0.05) * hei)]));
    canv = canv.concat(quick([P(b[0] * wid, b[1] * hei), P(0, (b[1] - 0.05) * hei)]));
    canv = canv.concat(quick([P(-b[0] * wid, b[1] * hei), P(-b[0] * wid, (b[1] + 0.1) * hei)]));
    canv = canv.concat(quick([P(b[0] * wid, b[1] * hei), P(b[0] * wid, (b[1] + 0.1) * hei)]));
  }
  var l10 = divP([p00, p10, p20, p30], 5);
  var l11 = divP([p01, p11, p21, p31], 5);
  for (var j = 0; j < l10.length - 1; j++) {
    canv = canv.concat(quick([l10[j], l11[j + 1]]));
    canv = canv.concat(quick([l11[j], l10[j + 1]]));
  }
  canv = canv.concat(quick([p00, p01]), quick([p10, p11]), quick([p20, p21]), quick([p00, p10, p20, p30]), quick([p01, p11, p21, p31]));
  return canv;
};

ShanShuiEngineV5.prototype.mountain = function (xoff, yoff, seed, opts) {
  opts = opts || {};
  var self = this;
  var hei = opts.hei === undefined ? 100 + this.r() * 400 : opts.hei;
  var wid = opts.wid === undefined ? 400 + this.r() * 200 : opts.wid;
  var tex = opts.tex === undefined ? 200 : opts.tex;
  var veg = opts.veg === undefined ? true : opts.veg;
  var architecture = opts.architecture === undefined ? true : opts.architecture;
  var profile = opts.profile || null;
  var canv = [], ptlist = [];
  var h = hei, w = wid, reso0 = 10, reso1 = 50, hoff = 0;
  for (var j = 0; j < reso0; j++) {
    hoff += (this.r() * yoff) / 100;
    var row = [];
    for (var i = 0; i < reso1; i++) {
      var u = i / (profile == null ? reso1 : reso1 - 1);
      var x = (u - 0.5) * Math.PI;
      var y = profile
        ? profile.elevation(u) * (0.91 + 0.18 * this.n(u * 5 + 10, j * 0.15, seed))
        : Math.cos(x) * this.n(x + 10, j * 0.15, seed);
      var p = 1 - j / reso0;
      var breadth = profile == null ? p : 0.92 + 0.08 * p;
      row.push(P((x / Math.PI) * w * breadth, -y * h * p + hoff));
    }
    ptlist.push(row);
  }
  function vegetate(treeFunc, growth, proof, kind) {
    var veglist = [];
    for (var ii = 0; ii < ptlist.length; ii++) {
      for (var jj = 0; jj < ptlist[ii].length; jj++) {
        if (growth(ii, jj)) veglist.push(ptlist[ii][jj]);
      }
    }
    for (var k = 0; k < veglist.length; k++) {
      if (proof(veglist, k)) {
        var piece = treeFunc(veglist[k].x, veglist[k].y);
        canv = canv.concat(piece);
        if (kind) self.noteAnchor(kind, piece);
      }
    }
  }
  var always = function () { return true; };
  vegetate(function (x, y) {
    return self.tree02(x + xoff, y + yoff - 5, { clu: 2, col: C.ink(self.n(0.01 * x, 0.01 * y) * 0.5 * 0.3 + 0.5) });
  }, function (i, j) {
    var ns = self.n(j * 0.1, seed);
    return i === 0 && ns * ns * ns < 0.1 && Math.abs(ptlist[i][j].y) / h > 0.2;
  }, always, { type: 'tree', role: 'tree02' });

  canv.push(this.poly(ptlist[0].concat([P(0, reso0 * 4)]), { xof: xoff, yof: yoff, fil: C.white, str: null }));
  canv = canv.concat(this.stroke(ptlist[0].map(function (pt) { return P(pt.x + xoff, pt.y + yoff); }), { wid: 3, col: C.ink(0.3), noi: 1 }));
  canv = canv.concat(this.foot(ptlist, xoff, yoff));
  var sha = this.e.choice([0, 0, 0, 0, 5]);
  canv = canv.concat(this.texture(ptlist, { xof: xoff, yof: yoff, tex: tex, len: profile ? profile.textureLength : 0.2, sha: sha }));

  vegetate(function (x, y) {
    return self.tree02(x + xoff, y + yoff, { col: C.ink(self.n(0.01 * x, 0.01 * y) * 0.5 * 0.3 + 0.5) });
  }, function (i, j) {
    var ns = self.n(i * 0.1, j * 0.1, seed + 2);
    return ns * ns * ns < 0.1 && Math.abs(ptlist[i][j].y) / h > 0.5;
  }, always, { type: 'tree', role: 'tree02' });

  if (architecture) {
    vegetate(function (x, y) {
      var tt = self.e.choice([0, 0, 1, 1, 1, 2]);
      if (tt === 1) {
        var bw = self.e.normRand(40, 70);
        var sto = self.e.choice([1, 2, 2, 3]);
        var rot = self.r();
        var sty = self.e.choice([1, 2, 3]);
        var house = self.arch02(x + xoff, y + yoff, seed, { wid: bw, rot: rot, sto: sto, sty: sty });
        self.noteAnchor({ type: 'building', role: 'house' }, house);
        return house;
      } else if (tt === 2) {
        var pavilion = self.arch04(x + xoff, y + yoff, seed, { sto: self.e.choice([1, 1, 1, 2, 2]) });
        self.noteAnchor({ type: 'building', role: 'pavilion' }, pavilion);
        return pavilion;
      }
      return [];
    }, function (i, j) {
      var ns = self.n(i * 0.2, j * 0.05, seed + 10);
      return i !== 0 && (j === 1 || j === ptlist[i].length - 2) && ns * ns * ns * ns < 0.008;
    }, always);

    vegetate(function (x, y) {
      var sto = self.e.choice([5, 7]);
      var bw = 40 + self.r() * 20;
      return self.arch03(x + xoff, y + yoff, seed, { wid: bw, sto: sto });
    }, function (i, j) {
      return i === 1 && Math.abs(j - ptlist[i].length / 2) < 1 && self.r() < 0.02;
    }, always, { type: 'building', role: 'pagoda' });

    vegetate(function (x, y) {
      var t = self.transmissionTower01(x + xoff, y + yoff, seed);
      return self.drawTowers ? t : [];
    }, function (i, j) {
      var ns = self.n(i * 0.2, j * 0.05, seed + 20 * Math.PI);
      return i % 2 === 0 && (j === 1 || j === ptlist[i].length - 2) && ns * ns * ns * ns < 0.002;
    }, always);
  }

  vegetate(function (x, y) {
    var rw = 20 + self.r() * 20;
    var rh = 20 + self.r() * 20;
    return self.rock(x + xoff, y + yoff, seed, rh, rw, 40, 2);
  }, function (i, j) {
    return (j === 0 || j === ptlist[i].length - 1) && self.r() < 0.1;
  }, always);

  return canv;
};

ShanShuiEngineV5.prototype.backgroundPaper = function () {
  var side = 512;
  var shade = new Uint8Array(side * side);
  function put(x, y, v) {
    if (x >= 0 && x < side && y >= 0 && y < side) shade[y * side + x] = v;
  }
  for (var i = 0; i <= side / 2; i++) {
    for (var j = 0; j <= side / 2; j++) {
      var c = 245 + this.n(i * 0.1, j * 0.1) * 10;
      c -= this.r() * 20;
      var v = Math.min(Math.max(Math.round(255 - c), 0), 255);
      put(i, j, v); put(side - i, j, v); put(i, side - j, v); put(side - i, side - j, v);
    }
  }
  return { shade: shade, texel: 1, strength: 1 };
};

ShanShuiEngineV5.prototype.noteAnchor = function (kind, canv) {
  if (!this.anchorLog || !canv || !canv.length) return;
  this.anchorLog.push({ kind: kind, canv: canv });
};

ShanShuiEngineV5.prototype.noted = function (kind, canv) {
  if (this.anchorLog && canv && canv.length) {
    this.anchorPieces.push({ kind: kind, canv: canv });
  }
  return canv;
};

function buildAnchorsV5(pieces, W, H, boats) {
  var out = { ridges: [], water: null, boats: boats || [], figures: [], trees: [], buildings: [], sky: { x: [0, 1], y: [0, 0.38] } };
  if (!(W > 0 && H > 0)) return out;
  var wMinX = Infinity, wMaxX = -Infinity, wMinY = Infinity, wMaxY = -Infinity;
  function extent(canv) {
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (var i = 0; i < canv.length; i++) {
      var pts = canv[i].p;
      for (var j = 0; j < pts.length; j++) {
        var v = pts[j];
        if (Number.isFinite(v.x) && Number.isFinite(v.y)) {
          if (v.x < minX) minX = v.x;
          if (v.x > maxX) maxX = v.x;
          if (v.y < minY) minY = v.y;
          if (v.y > maxY) maxY = v.y;
        }
      }
    }
    if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
    return { minX: minX, maxX: maxX, minY: minY, maxY: maxY };
  }
  function placement(e) {
    var x = (e.minX + e.maxX) / 2 / W, base = e.maxY / H;
    if (x < 0 || x > 1 || base < 0 || base > 1) return null;
    var top = Math.min(Math.max(e.minY / H, 0), base);
    return { x: x, base: base, top: top, width: Math.min((e.maxX - e.minX) / W, 1) };
  }
  for (var i = 0; i < pieces.length; i++) {
    var piece = pieces[i];
    var k = piece.kind || {};
    var e = extent(piece.canv || []);
    if (!e) continue;
    if (k.type === 'water' || k === 'water') {
      wMinX = Math.min(wMinX, e.minX); wMaxX = Math.max(wMaxX, e.maxX);
      wMinY = Math.min(wMinY, e.minY); wMaxY = Math.max(wMaxY, e.maxY);
    } else if (k.type === 'tree') {
      var pt = placement(e);
      if (pt) out.trees.push({ kind: k.role || 'tree03', x: pt.x, baseY: pt.base, topY: pt.top, width: pt.width });
    } else if (k.type === 'building') {
      var pb = placement(e);
      if (pb) out.buildings.push({ kind: k.role || 'house', x: pb.x, baseY: pb.base, roofY: pb.top, width: pb.width });
    }
  }
  if (Number.isFinite(wMinX)) {
    out.water = {
      x: [Math.min(Math.max(wMinX / W, 0), 1), Math.min(Math.max(wMaxX / W, 0), 1)],
      y: [Math.min(Math.max(wMinY / H, 0), 1), Math.min(Math.max(wMaxY / H, 0), 1)],
    };
  }
  return out;
}

// ---------------------------------------------------------------- PaintingTreeScale

var PaintingTreeScale = {
  multiplier: function (seed, motif, instance) {
    var hash = 2166136261 >>> 0;
    var bytes = new TextEncoder().encode('tree-size-v1:' + seed + ':' + motif + ':' + instance);
    for (var i = 0; i < bytes.length; i++) {
      hash = Math.imul((hash ^ bytes[i]) >>> 0, 16777619) >>> 0;
    }
    return 0.5 + 0.5 * (hash / 4294967295);
  },
};

// ---------------------------------------------------------------- ZXArtPoetryScene (ZXArtPoetryScene.swift)

var POETRY_SCENE_MAP = {
  retreat: '山居林泉',
  fishing: '江行渔隐',
  waterTown: '江南水乡',
  farewell: '折柳送别',
  village: '田园村居',
  spring: '春日花事',
  lotusPond: '荷塘夏景',
  autumnTravel: '秋江羁旅',
  winterForest: '冬雪寒林',
  moonNight: '月夜怀人',
  temple: '山寺访僧',
  courtyard: '庭院闺思',
  historic: '登高怀古',
  desert: '边塞大漠',
  ocean: '海天江潮',
};

var POETRY_SCENE_FROM_RAW = {};
Object.keys(POETRY_SCENE_MAP).forEach(function (k) {
  POETRY_SCENE_FROM_RAW[POETRY_SCENE_MAP[k]] = k;
  POETRY_SCENE_FROM_RAW[k] = k;
});

function resolvePoetrySceneKey(variant) {
  if (!variant) return 'retreat';
  if (POETRY_SCENE_FROM_RAW[variant]) return POETRY_SCENE_FROM_RAW[variant];
  var legacy = {
    '高山': 'retreat',
    '江岸': 'waterTown',
    '远山': 'fishing',
    alpine: 'retreat',
    riverbank: 'waterTown',
    distant: 'fishing',
  };
  return legacy[variant] || null;
}

var SCENE_MOTIF_ORDER = [
  'oldTree', 'bareTree', 'layeredTree', 'pine', 'bamboo', 'willow', 'reeds', 'grass', 'maple', 'vine', 'blossom', 'lotus',
  'bridge', 'house', 'hut', 'pavilion', 'pagoda', 'templeGate', 'courtyard', 'window', 'curtain', 'terrace', 'ruins', 'cityGate',
  'fence', 'fields', 'path', 'boat', 'sail', 'mooredBoat', 'angler', 'traveler', 'horse', 'egret', 'crow', 'swallow', 'dragonfly', 'butterfly',
  'stream', 'waterfall', 'dunes', 'beaconSmoke', 'cookingSmoke', 'mist', 'moon', 'crescent', 'sunrise', 'sunset', 'stars', 'snow', 'afterRain', 'rain', 'waves', 'reef'
];

function canonicalMotifs(motifs) {
  var selected = {};
  (motifs || []).forEach(function (m) { selected[m] = true; });
  return SCENE_MOTIF_ORDER.filter(function (m) { return Boolean(selected[m]); });
}

function defaultMotifsForScene(sceneKey) {
  switch (sceneKey) {
    case 'retreat': return ['pine', 'bamboo', 'stream', 'hut'];
    case 'fishing': return ['boat', 'angler', 'reeds'];
    case 'waterTown': return ['bridge', 'willow', 'house', 'mooredBoat'];
    case 'farewell': return ['willow', 'pavilion', 'path', 'traveler', 'mooredBoat'];
    case 'village': return ['fields', 'fence', 'house', 'path'];
    case 'spring': return ['blossom', 'layeredTree', 'path'];
    case 'lotusPond': return ['lotus', 'willow', 'dragonfly'];
    case 'autumnTravel': return ['bareTree', 'vine', 'path', 'crow', 'traveler'];
    case 'winterForest': return ['bareTree', 'oldTree', 'house', 'snow'];
    case 'moonNight': return ['window', 'moon', 'boat'];
    case 'temple': return ['templeGate', 'pagoda', 'bamboo', 'path'];
    case 'courtyard': return ['courtyard', 'window', 'curtain', 'willow'];
    case 'historic': return ['terrace', 'traveler'];
    case 'desert': return ['dunes'];
    case 'ocean': return ['waves', 'reef'];
    default: return ['pine', 'bamboo', 'stream', 'hut'];
  }
}

function resolveSceneOptionsForPainting(options, scene, seed) {
  options = options || {};
  var rawMotifs = Array.isArray(options.motifs) && options.motifs.length
    ? options.motifs.slice()
    : defaultMotifsForScene(scene).slice();
  var purpose = options.purpose || 'inscription-v1';
  if (rawMotifs.indexOf('crescent') >= 0) {
    rawMotifs = rawMotifs.filter(function (m) { return m !== 'moon'; });
  }
  if (rawMotifs.indexOf('moon') >= 0 || rawMotifs.indexOf('crescent') >= 0) {
    rawMotifs = rawMotifs.filter(function (m) { return m !== 'sunrise' && m !== 'sunset'; });
  } else if (rawMotifs.indexOf('sunset') >= 0) {
    rawMotifs = rawMotifs.filter(function (m) { return m !== 'sunrise'; });
  }
  var composition = options.composition || null;
  if (!composition) {
    var hash = 2166136261 >>> 0;
    var seedStr = String(seed || '');
    for (var i = 0; i < seedStr.length; i++) {
      var cCode = seedStr.charCodeAt(i);
      if (cCode < 128) {
        hash = Math.imul(hash ^ cCode, 16777619) >>> 0;
      } else {
        var u8 = unescape(encodeURIComponent(seedStr.charAt(i)));
        for (var j = 0; j < u8.length; j++) {
          hash = Math.imul(hash ^ u8.charCodeAt(j), 16777619) >>> 0;
        }
      }
    }
    var candidates;
    if (['fishing', 'waterTown', 'farewell', 'lotusPond', 'ocean', 'desert'].indexOf(scene) >= 0) {
      candidates = ['oppositeBank', 'corner', 'depth', 'oppositeBank'];
    } else if (['retreat', 'temple', 'historic'].indexOf(scene) >= 0) {
      candidates = ['depth', 'corner'];
    } else {
      candidates = ['corner', 'oppositeBank', 'depth'];
    }
    composition = candidates[hash % candidates.length];
  }
  var canon = canonicalMotifs(rawMotifs);
  return {
    motifs: rawMotifs,
    canonicalMotifs: canon,
    purpose: purpose,
    composition: composition,
    lotusState: options.lotusState || options.lotus_state || 'flowering',
    donkey: Boolean(options.donkey),
  };
}

function poetryScene(text, title) {
  title = String(title || '');
  text = String(text || '');
  var tuneNames = ['天净沙', '鹊桥仙', '雨霖铃', '蝶恋花', '浣溪沙', '水调歌头', '西江月', '卜算子', '如梦令', '鹧鸪天', '清平乐', '临江仙'];
  var cleanTitle = title;
  for (var ti = 0; ti < tuneNames.length; ti++) cleanTitle = cleanTitle.split(tuneNames[ti]).join('');
  var body = text + '\n' + cleanTitle;
  var moonWords = ['正月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月', '腊月', '岁月', '年月'];
  var moonText = body;
  for (var mi = 0; mi < moonWords.length; mi++) moonText = moonText.split(moonWords[mi]).join('');
  var rules = [
    ['desert', ['大漠', '沙漠', '塞外', '边塞', '关山月', '玉门关', '出塞', '凉州', '燕然']],
    ['ocean', ['海上', '沧海', '观海', '海潮', '江潮', '潮头', '碣石', '海天']],
    ['courtyard', ['庭院', '帘幕', '帘卷', '深闺', '楼头', '玉阶', '画堂', '梧桐', '芭蕉']],
    ['temple', ['古寺', '山寺', '禅院', '禅房', '访僧', '寺后', '僧舍', '寺钟']],
    ['historic', ['怀古', '幽州台', '古台', '故垒', '故国', '登楼', '城阙', '登高', '登鹳雀楼']],
    ['lotusPond', ['荷', '莲叶', '采莲', '小池', '菡萏', '芙蕖']],
    ['farewell', ['送别', '送元', '送友', '送孟', '折柳', '渭城', '阳关', '长亭', '劳劳亭']],
    ['winterForest', ['江雪', '寒江雪', '风雪', '积雪', '白雪', '寒林', '暮雪', '宿芙蓉山']],
    ['autumnTravel', ['秋思', '羁旅', '古道', '枯藤', '昏鸦', '秋江', '枫桥', '客愁', '秋浦']],
    ['village', ['田园', '村居', '归园田居', '田家', '墟里', '炊烟', '稻', '麦', '桑麻', '农家', '柴门']],
    ['fishing', ['渔', '钓', '蓑', '箬笠', '泛舟', '行舟', '泊舟', '独舟', '独钓']],
    ['waterTown', ['小桥', '水村', '江南', '流水人家', '水乡', '乌衣巷', '秦淮']],
    ['retreat', ['山居', '竹里', '幽篁', '松间', '清泉', '瀑', '溪', '山中', '空山', '隐居']],
    ['spring', ['寻花', '花满', '桃花', '杏花', '春日', '春游', '春色', '芳菲', '踏青']],
    ['moonNight', ['月', '思乡', '静夜', '夜思', '夜泊', '相思']],
  ];
  var titleRules = [
    ['retreat', ['山居', '竹里', '山中', '寻隐']], ['fishing', ['渔歌', '渔父', '垂钓', '泛舟']],
    ['waterTown', ['江南春', '水乡']], ['farewell', ['送元', '送友', '送别', '送孟', '劳劳亭']],
    ['village', ['归园田居', '村居', '田家', '田园']], ['spring', ['寻花', '春日', '春游']],
    ['lotusPond', ['小池', '采莲', '荷塘', '晓出净慈寺']], ['autumnTravel', ['秋思', '枫桥夜泊', '秋浦']],
    ['winterForest', ['江雪', '逢雪', '寒林', '暮雪']], ['moonNight', ['静夜思', '夜思']],
    ['temple', ['寺', '访僧', '禅院']], ['courtyard', ['庭院', '闺思']],
    ['historic', ['怀古', '幽州台', '登楼', '登高', '登鹳雀楼']],
    ['desert', ['使至塞上', '出塞', '凉州', '边塞']], ['ocean', ['观沧海', '观海', '江潮']],
  ];
  function containsAny(str, words) {
    for (var i = 0; i < words.length; i++) if (str.indexOf(words[i]) >= 0) return true;
    return false;
  }
  var selected = null;
  for (var i = 0; i < titleRules.length; i++) {
    if (containsAny(cleanTitle, titleRules[i][1])) { selected = titleRules[i]; break; }
  }
  if (!selected) {
    for (var j = 0; j < rules.length; j++) {
      var src = rules[j][0] === 'moonNight' ? moonText : body;
      if (containsAny(src, rules[j][1])) { selected = rules[j]; break; }
    }
  }
  var scene = selected ? selected[0] : 'retreat';
  var motifs = defaultMotifsForScene(scene).slice();
  function has(words) { return containsAny(body, words); }
  function add(motif, words) { if (has(words)) motifs.push(motif); }
  add('pine', ['松']); add('bamboo', ['竹', '篁']); add('willow', ['柳']);
  add('reeds', ['芦', '荻', '蒹葭']); add('maple', ['枫']); add('vine', ['藤']);
  add('blossom', ['桃花', '杏花', '梅', '花满']); add('lotus', ['荷', '莲叶', '菡萏']);
  add('house', ['人家', '村舍', '农舍', '柴门']);
  add('hut', ['茅屋', '茅舍', '草堂']);
  add('oldTree', ['老树', '古木', '古树']);
  add('pagoda', ['塔']); add('boat', ['舟', '船']);
  var pavilionText = body.split('月亭').join('').split('亭亭').join('');
  if (pavilionText.indexOf('亭') >= 0) motifs.push('pavilion');
  add('waterfall', ['瀑']); add('stream', ['溪', '泉', '长河', '流水', '春水', '溪水']); add('bridge', ['小桥', '枫桥', '石桥']);
  add('sail', ['帆']); add('mooredBoat', ['泊', '系舟', '系船']); add('angler', ['钓']);
  add('egret', ['鹭']); add('crow', ['鸦']); add('swallow', ['燕子', '双燕']);
  add('dragonfly', ['蜻蜓']); add('butterfly', ['蝶']); add('horse', ['马', '驴']);
  add('traveler', ['归人', '行人', '游子']); add('window', ['窗']); add('curtain', ['帘']); add('stars', ['星', '银河', '天河']);

  var afterRain = has(['雨后', '新雨', '雨歇', '雨霁', '雨过', '初霁']);
  if (afterRain) motifs.push('afterRain');
  else if (has(['雨', '霖'])) motifs.push('rain');
  if (has(['雪'])) {
    motifs.push('snow');
    motifs = motifs.filter(function (m) { return m !== 'rain'; });
  }
  if (has(['炊烟', '墟里烟', '村烟'])) motifs.push('cookingSmoke');
  if (has(['孤烟', '烽烟', '烽火'])) motifs.push(scene === 'desert' ? 'beaconSmoke' : 'mist');
  if (has(['雾', '岚', '烟雨', '烟波'])) motifs.push('mist');

  if (moonText.indexOf('月') >= 0) {
    var phase = has(['残月', '新月', '晓月', '月落']) ? 'crescent' : 'moon';
    motifs = motifs.filter(function (m) { return m !== 'moon' && m !== 'crescent' && m !== 'sunrise' && m !== 'sunset'; });
    motifs.push(phase);
  } else if (has(['日出', '初日', '朝日', '旭日'])) motifs.push('sunrise');
  else if (has(['夕', '落日', '斜阳', '晚', '暮'])) motifs.push('sunset');

  if (scene === 'autumnTravel' && motifs.indexOf('oldTree') >= 0) {
    motifs = motifs.filter(function (m) { return m !== 'bareTree'; });
  }
  var lotusState = has(['残荷', '枯荷', '留得']) ? 'spent' : (has(['小荷才露尖尖角', '小荷', '初荷']) ? 'young' : 'flowering');
  if (lotusState === 'spent' && !has(['蜻蜓'])) {
    motifs = motifs.filter(function (m) { return m !== 'dragonfly'; });
  }
  var canon = canonicalMotifs(motifs);
  var donkey = has(['驴']) ? true : null;
  var matched = selected ? selected[1].filter(function (t) { return body.indexOf(t) >= 0; }) : [];
  return {
    scene: scene,
    variant: POETRY_SCENE_MAP[scene],
    options: {
      motifs: canon,
      canonicalMotifs: canon,
      purpose: null,
      composition: null,
      lotusState: lotusState,
      donkey: donkey,
    },
    matched: matched,
    paintingProcedural: function (seed, opts) {
      opts = opts || {};
      var resolved = resolveSceneOptionsForPainting({
        motifs: canon,
        purpose: opts.purpose || null,
        composition: opts.composition || null,
        lotusState: lotusState,
        donkey: donkey,
      }, scene, String(seed || 'weishi-2026'));
      var qTop = resolved.purpose === 'recommendation-v1' ? 0.22 : (resolved.purpose === 'reading-v1' ? 0.12 : 0.18);
      return {
        generator: 'shanshui@5',
        seed: String(seed || 'weishi-2026'),
        variant: POETRY_SCENE_MAP[scene],
        params: {
          quiet_top: opts.quietTop === undefined ? qTop : opts.quietTop,
          verse_side: opts.verseSide === undefined ? 'right' : opts.verseSide,
          verse_columns: opts.verseColumns === undefined ? null : opts.verseColumns,
          verse_chars: opts.verseChars === undefined ? null : opts.verseChars,
          scene: {
            motifs: resolved.motifs,
            purpose: resolved.purpose,
            composition: resolved.composition,
            lotus_state: resolved.lotusState,
            donkey: resolved.donkey || null,
          },
        },
      };
    },
    procedural: function (seed, opts) {
      opts = opts || {};
      return {
        generator: opts.generator || 'shanshui@4',
        seed: String(seed || 'weishi-2026'),
        variant: POETRY_SCENE_MAP[scene],
        params: {
          quiet_top: opts.quietTop === undefined ? 0.18 : opts.quietTop,
          verse_side: opts.verseSide === undefined ? 'right' : opts.verseSide,
          verse_columns: opts.verseColumns === undefined ? null : opts.verseColumns,
          verse_chars: opts.verseChars === undefined ? null : opts.verseChars,
          scene: {
            motifs: canon,
            purpose: opts.purpose || null,
            composition: opts.composition || null,
            lotus_state: lotusState,
            donkey: donkey,
          },
        },
      };
    },
  };
}

// ---------------------------------------------------------------- Shape Append for @4 & @5

function mixed(c, other, amount) {
  var t = Math.min(Math.max(amount, 0), 1);
  return [c[0] + (other[0] - c[0]) * t, c[1] + (other[1] - c[1]) * t, c[2] + (other[2] - c[2]) * t, c[3]];
}

function opacity(c, a) {
  return [c[0], c[1], c[2], c[3] * a];
}

function normalizePalette(pal) {
  if (!pal) return { paper: [247, 244, 238, 1], ink: [38, 38, 38, 1], wash: [140, 140, 136, 1], isDark: false };
  function toArr(c, def) {
    if (!c) return def;
    if (Array.isArray(c)) return c;
    if (typeof c === 'object') return [c.r !== undefined ? c.r : 0, c.g !== undefined ? c.g : 0, c.b !== undefined ? c.b : 0, c.a !== undefined ? c.a : 1];
    return def;
  }
  var paper = toArr(pal.paper, [247, 244, 238, 1]);
  var ink = toArr(pal.ink, [38, 38, 38, 1]);
  var wash = pal.wash ? toArr(pal.wash, [140, 140, 136, 1]) : mixed(ink, paper, 0.6);
  return { paper: paper, ink: ink, wash: wash, isDark: Boolean(pal.isDark) };
}

function appendShapesV4(canv, palette, into, washContrast) {
  palette = normalizePalette(palette);
  if (washContrast === undefined) washContrast = 0.4;
  function mapColor(c, isWash) {
    if (!c || !(c.a > 0)) return null;
    var gray = (c.r + c.g + c.b) / 3;
    if (isWash) gray = 227 + (gray - 227) * washContrast;
    var a = Math.min(c.a, 1);
    return isWash
      ? opacity(mixed(palette.wash, palette.paper, (gray - 200) / 55), a)
      : opacity(mixed(palette.ink, palette.paper, gray / 255), a);
  }
  for (var i = 0; i < canv.length; i++) {
    var p = canv[i];
    if (!p.p || p.p.length < 2) continue;
    var fill = mapColor(p.fil, p.wash);
    var stroke = p.wid > 0 ? mapColor(p.str, p.wash) : null;
    if (!fill && !stroke) continue;
    var pts = new Float32Array(p.p.length * 2);
    var valid = true;
    for (var j = 0; j < p.p.length; j++) {
      var x = Math.fround(p.p[j].x), y = Math.fround(p.p[j].y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) { valid = false; break; }
      pts[j * 2] = x;
      pts[j * 2 + 1] = y;
    }
    if (!valid) continue;
    into.push({ points: pts, fill: fill, stroke: stroke, lineWidth: Math.fround(p.wid || 0), closed: false });
  }
}

function appendPaintingShapesV5(canv, motif, palette, into) {
  if (into === undefined && Array.isArray(palette)) {
    into = palette;
    palette = motif;
    motif = null;
  }
  var sunColor = [0.67, 0.25, 0.20, 1];
  for (var i = 0; i < canv.length; i++) {
    var polygon = canv[i];
    var start = into.length;
    appendShapesV4([polygon], palette, into, 0.4);
    for (var j = start; j < into.length; j++) {
      if (polygon.overprint) into[j].overprint = true;
      if (polygon.fil && polygon.fil.r > polygon.fil.g + 50 && (motif === 'sunset' || motif === 'sunrise')) {
        into[j].fill = opacity(sunColor, palette.isDark ? 0.48 : 0.38);
      } else if ((motif === 'moon' || motif === 'crescent') && palette.isDark && C.isWhite(polygon.fil)) {
        into[j].fill = opacity(palette.ink, 0.52);
      }
    }
  }
}


// Study-only point colour: select small existing ink marks, retaining geometry and paper cutouts.
function tintPaintingDetailsV5(shapes, detail, palette, structural = false) {
  if (!detail || !palette.accent) return;
  const { motif, bounds:b } = detail;
  const mountain = ['mainMountain', 'guestMountain'].includes(motif);
  const roof = ['house', 'hut', 'pavilion', 'templeGate', 'pagoda'].includes(motif);
  const tree = ['pine', 'oldTree', 'bareTree', 'layeredTree', 'willow', 'bamboo', 'blossom', 'maple'].includes(motif);
  if (!mountain && !roof && !tree) return;
  const accent = roof ? (palette.secondary || palette.accent) : palette.accent;
  shapes.forEach((shape, index) => {
    // Sparse colour on alternate fine marks leaves the main ink structure legible.
    if (index % 3 !== 0) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < shape.points.length; i += 2) {
      x0 = Math.min(x0, shape.points[i]); x1 = Math.max(x1, shape.points[i]);
      y0 = Math.min(y0, shape.points[i + 1]); y1 = Math.max(y1, shape.points[i + 1]);
    }
    const y = ((y0 + y1) / 2 - b.minY) / b.height;
    // A narrow wash strip can have tiny area but span a whole cliff. V3 only tints small marks.
    if (structural && mountain && ((x1-x0) > b.width*.12 || (y1-y0) > b.height*.075)) return;
    if (y > (mountain ? 0.36 : roof ? 0.53 : 0.88)
        || (x1 - x0) * (y1 - y0) > b.width * b.height * 0.045) return;
    for (const key of ['fill', 'stroke']) {
      const color = shape[key];
      if (!color || color[3] < 0.04) continue;
      const distance = color.slice(0, 3).reduce((sum, v, i) => sum + Math.abs(v - palette.paper[i]), 0);
      if (distance < 0.12) continue;
      const amount = mountain ? 0.85 : roof ? 0.8 : 0.7;
      shape[key] = color.map((v, i) => i < 3 ? v * (1 - amount) + accent[i] * amount : Math.max(v, roof ? 0.3 : 0.26));
    }
  });
}


// Versioned brush streams need order-sensitive seeds; the legacy entropy sums Base64 characters.
// Leave legacy output intact and mix the full string only for the new structural treatment.
function landscapeBrushEngineV5(seed) {
  let hash=2166136261;
  for (const ch of String(seed)) hash=Math.imul(hash^ch.codePointAt(0),16777619)>>>0;
  hash=Math.imul(hash^(hash>>>16),0x85ebca6b)>>>0;
  hash=Math.imul(hash^(hash>>>13),0xc2b2ae35)>>>0;
  const engine=new ShanShuiEngineV5(seed);
  engine.e.state=(hash^(hash>>>16))>>>0;
  return engine;
}

// shanshui@5 painting path: brush vocabulary, landforms, water, waterfall, details, masonry, dwellings, architecture.

class PaintingMountainProfile {
  constructor(requested = null, aspect = null, random = Math.random) {
    if (requested && typeof requested === 'object' && !Array.isArray(requested)) {
      const opts = requested;
      requested = opts.form !== undefined ? opts.form : null;
      aspect = opts.aspect !== undefined ? opts.aspect : null;
      random = opts.random || Math.random;
    }
    const allCases = PaintingMountainProfile.Form;
    const choice = Math.min(allCases.length - 1, Math.trunc(random() * allCases.length));
    if (typeof requested === 'number') {
      requested = allCases[requested] || null;
    }
    this.form = requested != null ? requested : allCases[choice];

    const between = (lo, hi) => lo + (hi - lo) * random();
    let control, widths, heights, curves;
    switch (this.form) {
      case 'monumental':
        control = [
          P(0, 0), P(0.12, 0.14), P(0.24, 0.22), P(0.30, 0.77),
          P(0.40, 0.96), P(0.47, 1), P(0.59, 0.93), P(0.66, 0.98),
          P(0.72, 0.76), P(0.78, 0.70), P(0.85, 0.17), P(1, 0)
        ];
        widths = [310, 370]; heights = [370, 470]; curves = [0.35, 0.60];
        this.textureLength = 0.10;
        break;
      case 'leaning':
        control = [
          P(0, 0), P(0.10, 0.12), P(0.23, 0.28), P(0.28, 0.57),
          P(0.43, 0.64), P(0.49, 0.82), P(0.66, 1), P(0.76, 0.96),
          P(0.80, 0.72), P(0.88, 0.25), P(1, 0)
        ];
        widths = [300, 350]; heights = [350, 460]; curves = [0.30, 0.60];
        this.textureLength = 0.13;
        break;
      case 'rounded':
        control = [
          P(0, 0), P(0.16, 0.18), P(0.28, 0.60), P(0.41, 0.90),
          P(0.54, 1), P(0.67, 0.86), P(0.82, 0.55), P(0.93, 0.18), P(1, 0)
        ];
        widths = [360, 440]; heights = [270, 360]; curves = [0.85, 1];
        this.textureLength = 0.18;
        break;
      case 'folded':
        control = [
          P(0, 0), P(0.10, 0.18), P(0.18, 0.61), P(0.26, 0.65),
          P(0.33, 0.47), P(0.42, 0.82), P(0.49, 1), P(0.59, 0.93),
          P(0.66, 0.53), P(0.77, 0.68), P(0.84, 0.48), P(1, 0)
        ];
        widths = [330, 400]; heights = [330, 430]; curves = [0.15, 0.40];
        this.textureLength = 0.08;
        break;
      case 'clustered':
        control = [
          P(0, 0), P(0.12, 0.35), P(0.18, 0.65), P(0.27, 0.73),
          P(0.34, 0.48), P(0.42, 0.53), P(0.46, 0.91), P(0.55, 1),
          P(0.60, 0.85), P(0.64, 0.60), P(0.70, 0.62), P(0.78, 0.84),
          P(0.86, 0.77), P(0.92, 0.35), P(1, 0)
        ];
        widths = [350, 430]; heights = [350, 460]; curves = [0.40, 0.70];
        this.textureLength = 0.11;
        break;
      case 'longRidge':
      default:
        control = [
          P(0, 0), P(0.12, 0.38), P(0.22, 0.52), P(0.34, 0.44),
          P(0.45, 0.80), P(0.54, 0.91), P(0.64, 1), P(0.75, 0.82),
          P(0.85, 0.76), P(0.94, 0.28), P(1, 0)
        ];
        widths = [430, 520]; heights = [240, 330]; curves = [0.70, 1];
        this.textureLength = 0.15;
        break;
    }

    // Move the entire crest and vary each shoulder without scrambling the mountain's anatomy.
    const bias = between(-0.08, 0.08);
    let knots = control.map((p, i) => {
      if (i <= 0 || i >= control.length - 1) return p;
      const nx = p.x + bias * Math.sin(p.x * Math.PI) + between(-0.008, 0.008);
      const ny = p.y === 1 ? 1 : Math.min(0.99, Math.max(0, p.y + between(-0.075, 0.075)));
      return P(nx, ny);
    });
    if (random() < 0.5) {
      knots = knots.slice().reverse().map(p => P(1 - p.x, p.y));
    }
    this.ridge = knots;
    this.width = between(widths[0], widths[1]);
    const naturalHeight = between(heights[0], heights[1]);
    if (aspect != null) {
      this.height = this.width * aspect;
    } else {
      this.height = naturalHeight;
    }
    this.curvature = between(curves[0], curves[1]);
  }

  // Shape-preserving cubic interpolation: no extra peaks or overshoot between ridge knots.
  elevation(position) {
    const ridge = this.ridge;
    const x = Math.min(1, Math.max(0, position));
    let firstIdx = ridge.findIndex(p => p.x > x);
    if (firstIdx === -1) firstIdx = ridge.length - 1;
    const i = Math.min(ridge.length - 2, Math.max(0, firstIdx - 1));

    const slope = (k) => (ridge[k + 1].y - ridge[k].y) / (ridge[k + 1].x - ridge[k].x);
    const tangent = (k) => {
      if (k === 0) return slope(0);
      if (k === ridge.length - 1) return slope(k - 1);
      const a = slope(k - 1), b = slope(k);
      if (a * b <= 0) return 0;
      const left = ridge[k].x - ridge[k - 1].x, right = ridge[k + 1].x - ridge[k].x;
      const w1 = 2 * right + left, w2 = right + 2 * left;
      return (w1 + w2) / (w1 / a + w2 / b);
    };

    const a = ridge[i], b = ridge[i + 1], span = b.x - a.x, t = (x - a.x) / span;
    const t2 = t * t, t3 = t2 * t;
    const smooth = (2 * t3 - 3 * t2 + 1) * a.y + (t3 - 2 * t2 + t) * span * tangent(i)
      + (-2 * t3 + 3 * t2) * b.y + (t3 - t2) * span * tangent(i + 1);
    return Math.max(0, smooth * this.curvature + (a.y + (b.y - a.y) * t) * (1 - this.curvature));
  }

  elevationAt(position) {
    return this.elevation(position);
  }
}

PaintingMountainProfile.Form = ['monumental', 'leaning', 'rounded', 'folded', 'clustered', 'longRidge'];
PaintingMountainProfile.Form.allCases = PaintingMountainProfile.Form;
PaintingMountainProfile.Form.monumental = 'monumental';
PaintingMountainProfile.Form.leaning = 'leaning';
PaintingMountainProfile.Form.rounded = 'rounded';
PaintingMountainProfile.Form.folded = 'folded';
PaintingMountainProfile.Form.clustered = 'clustered';
PaintingMountainProfile.Form.longRidge = 'longRidge';

const PaintingWaterKind = {
  lake: 'lake',
  pond: 'pond',
  river: 'river',
  sea: 'sea',
  allCases: ['lake', 'pond', 'river', 'sea']
};

class PaintingWaterChannel {
  constructor(width, height, phase, broad, bend = null, opening = 1) {
    if (width && typeof width === 'object') {
      const opts = width;
      this.width = opts.width;
      this.height = opts.height;
      this.phase = opts.phase;
      this.broad = Boolean(opts.broad);
      this.bend = opts.bend !== undefined ? opts.bend : null;
      this.opening = opts.opening !== undefined ? opts.opening : 1;
    } else {
      this.width = width;
      this.height = height;
      this.phase = phase;
      this.broad = Boolean(broad);
      this.bend = bend !== undefined ? bend : null;
      this.opening = opening !== undefined ? opening : 1;
    }
  }

  point(t, across) {
    if (across && typeof across === 'object') across = across.across;
    const half = this.width * this.opening * (this.broad ? 0.035 + 0.39 * Math.pow(t, 0.85) : 0.02 + 0.10 * Math.pow(t, 0.9));
    const sway = this.width * (this.bend != null ? this.bend : (this.broad ? 0.11 : 0.23)) * Math.sin(t * Math.PI * 2 + this.phase);
    const center = Math.min(this.width - half - this.width * 0.025, Math.max(half + this.width * 0.025, this.width * 0.5 + sway));
    return P(center + half * across, this.height * t);
  }

  get left() {
    const res = [];
    for (let i = 0; i <= 40; i++) res.push(this.point(i / 40, -1));
    return res;
  }

  get right() {
    const res = [];
    for (let i = 0; i <= 40; i++) res.push(this.point(i / 40, 1));
    return res;
  }
}

ShanShuiEngineV5.InkDepth = { far: 'far', middle: 'middle', near: 'near' };
ShanShuiEngineV5.BankStyle = { shoal: 'shoal', cliff: 'cliff', headland: 'headland' };
ShanShuiEngineV5.PaintingMountainProfile = PaintingMountainProfile;
ShanShuiEngineV5.PaintingWaterKind = PaintingWaterKind;
ShanShuiEngineV5.PaintingWaterChannel = PaintingWaterChannel;

Object.assign(ShanShuiEngineV5.prototype, {
  // =========================================================================
  // 1. ShanShuiPaintingBrush.swift
  // =========================================================================

  inkSeed() {
    return Math.trunc(this.r() * 4294967295) >>> 0;
  },

  /// Keep unpainted paper intact; deepen loaded strokes more than pale washes.
  paintingInk(source, depth) {
    if (depth && typeof depth === 'object') depth = depth.depth;
    const factor = depth === 'near' ? 1.42 : (depth === 'middle' ? 0.65 : 0.36);
    return source.map(poly => {
      const p = clonePoly(poly);
      if (p.fil && !C.isWhite(p.fil)) {
        p.fil = C(p.fil.r, p.fil.g, p.fil.b, Math.min(0.94, p.fil.a * factor));
      }
      if (p.str && !C.isWhite(p.str)) {
        p.str = C(p.str.r, p.str.g, p.str.b, Math.min(0.94, p.str.a * factor));
      }
      return p;
    });
  },

  /// Loaded centre, irregular pressure, split hairs and a drying tail.
  inkLine(points, width = 1.5, tone = 0.65, dry = 0.28, profile = 'brush') {
    if (width && typeof width === 'object') {
      const opts = width;
      width = opts.width !== undefined ? opts.width : 1.5;
      tone = opts.tone !== undefined ? opts.tone : 0.65;
      dry = opts.dry !== undefined ? opts.dry : 0.28;
      profile = opts.profile !== undefined ? opts.profile : 'brush';
    }
    if (!points || points.length <= 1) return [];
    const seed = this.inkSeed();
    const path = points.map((p, index) => [
      p.x, p.y, 0.78 + 0.22 * Math.sin(index * 0.73 + 0.5)
    ]);
    const style = {
      width,
      tone,
      dry,
      side: 0.45,
      bristles: width > 3 ? 3 : 1,
      rough: 0.32,
      fade: 0.22,
      profile
    };
    const stroke = Brush.stroke(path, style, seed);
    const result = [];
    if (stroke.body.length > 2) {
      const bodyPts = stroke.body.map(pt => Array.isArray(pt) ? P(pt[0], pt[1]) : P(pt.x, pt.y));
      result.push(this.poly(this.inkSimplified(bodyPts), {
        fil: C.gray(0, (stroke.bodyAlphaStart + stroke.bodyAlphaEnd) / 2),
        str: null
      }));
    }
    for (const hair of stroke.bristles) {
      for (const run of hair.runs) {
        const runPts = run.map(pt => Array.isArray(pt) ? P(pt[0], pt[1]) : P(pt.x, pt.y));
        result.push(this.poly(this.inkSimplified(runPts), {
          fil: null,
          str: C.gray(0, hair.alpha),
          wid: hair.width
        }));
      }
    }
    return result;
  },

  /// Error-bounded simplification in asset units (subpixel after placement).
  /// Pressure extrema and broken-hair endpoints survive; oversampled straight runs do not.
  inkSimplified(points, tolerance = 0.08) {
    if (tolerance && typeof tolerance === 'object') {
      tolerance = tolerance.tolerance !== undefined ? tolerance.tolerance : 0.08;
    }
    if (!points || points.length <= 3) return points;
    const keep = new Set([0, points.length - 1]);
    const work = [[0, points.length - 1]];
    while (work.length > 0) {
      const [lo, hi] = work.pop();
      if (hi <= lo + 1) continue;
      const a = points[lo], b = points[hi], dx = b.x - a.x, dy = b.y - a.y;
      const length = dx * dx + dy * dy;
      let maximum = tolerance * tolerance;
      let selected = null;
      for (let i = lo + 1; i < hi; i++) {
        const p = points[i];
        const t = length > 0 ? Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length)) : 0;
        const ex = p.x - a.x - dx * t, ey = p.y - a.y - dy * t, distance = ex * ex + ey * ey;
        if (distance > maximum) {
          maximum = distance;
          selected = i;
        }
      }
      if (selected !== null) {
        keep.add(selected);
        work.push([lo, selected]);
        work.push([selected, hi]);
      }
    }
    return Array.from(keep).sort((a, b) => a - b).map(i => points[i]);
  },

  /// Architectural corners retain their joints; a single spline would round them into icons.
  inkEdges(points, width = 1.5, tone = 0.65, dry = 0.35) {
    if (width && typeof width === 'object') {
      const opts = width;
      width = opts.width !== undefined ? opts.width : 1.5;
      tone = opts.tone !== undefined ? opts.tone : 0.65;
      dry = opts.dry !== undefined ? opts.dry : 0.35;
    }
    const out = [];
    for (let i = 0; i < points.length - 1; i++) {
      out.push(...this.inkLine([points[i], points[i + 1]], width, tone, dry));
    }
    return out;
  },

  inkBlot(x, y, radius, squash = 0.65, angle = 0, tone = 0.55) {
    if (radius && typeof radius === 'object') {
      const opts = radius;
      radius = opts.radius;
      squash = opts.squash !== undefined ? opts.squash : 0.65;
      angle = opts.angle !== undefined ? opts.angle : 0;
      tone = opts.tone !== undefined ? opts.tone : 0.55;
    } else if (squash && typeof squash === 'object') {
      const opts = squash;
      squash = opts.squash !== undefined ? opts.squash : 0.65;
      angle = opts.angle !== undefined ? opts.angle : 0;
      tone = opts.tone !== undefined ? opts.tone : 0.55;
    }
    const points = Brush.blot([x, y], radius, squash, angle, this.inkSeed());
    const pts = points.map(pt => Array.isArray(pt) ? P(pt[0], pt[1]) : P(pt.x, pt.y));
    return [this.poly(this.inkSimplified(pts), { fil: C.gray(0, tone), str: null })];
  },

  inkCurve(points, steps = 6) {
    if (steps && typeof steps === 'object') {
      steps = steps.steps !== undefined ? steps.steps : 6;
    }
    if (!points || points.length <= 2) return points;
    const result = [];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[Math.max(0, i - 1)], b = points[i];
      const c = points[i + 1], d = points[Math.min(points.length - 1, i + 2)];
      for (let k = 0; k < steps; k++) {
        const t = k / steps, t2 = t * t, t3 = t2 * t;
        const q = (pa, pb, pc, pd) =>
          0.5 * (2 * pb + (-pa + pc) * t + (2 * pa - 5 * pb + 4 * pc - pd) * t2 + (-pa + 3 * pb - 3 * pc + pd) * t3);
        result.push(P(q(a.x, b.x, c.x, d.x), q(a.y, b.y, c.y, d.y)));
      }
    }
    result.push(points[points.length - 1]);
    return result;
  },

  /// Faceted rock masses, broken hemp-fibre texture and clustered moss dots.
  paintingRock(width = 125, height = 70, tone = 1) {
    if (width && typeof width === 'object') {
      const opts = width;
      width = opts.width !== undefined ? opts.width : 125;
      height = opts.height !== undefined ? opts.height : 70;
      tone = opts.tone !== undefined ? opts.tone : 1;
    }
    const form = Math.trunc(this.r() * 65536) % 3;
    const canvas = [];
    if (form === 2) {
      canvas.push(...this.paintingStone(width * 0.38, width, 0, height * 0.93, 'cliff', 0));
      canvas.push(...this.paintingStone(0, width * 0.68, height * 0.43, height, 'cliff', 2));
    } else {
      const top = form === 0 ? height * 0.30 : 0;
      canvas.push(...this.paintingStone(0, width, top, height, 'cliff', 1));
    }
    return canvas.map(p => {
      const q = clonePoly(p);
      if (q.fil && !C.isWhite(q.fil)) {
        q.fil = C(q.fil.r, q.fil.g, q.fil.b, q.fil.a * tone);
      }
      if (q.str) {
        q.str = C(q.str.r, q.str.g, q.str.b, q.str.a * tone);
      }
      return q;
    });
  },

  paintingBank(style = 'headland') {
    if (style && typeof style === 'object') {
      style = style.style !== undefined ? style.style : 'headland';
    }
    return this.paintingSlope(style);
  },

  paintingMountain(form = null, terraced = false, aspect = null) {
    if (form && typeof form === 'object' && !(form instanceof PaintingMountainProfile)) {
      const opts = form;
      form = opts.form !== undefined ? opts.form : null;
      terraced = opts.terraced !== undefined ? opts.terraced : false;
      aspect = opts.aspect !== undefined ? opts.aspect : null;
    }
    const profile = form instanceof PaintingMountainProfile
      ? form
      : new PaintingMountainProfile(form, aspect, () => this.r());
    const original = this.paintingMassif(profile, terraced);
    return this.landscapeSeed ? this.paintingLandscapeMassif(profile, terraced) : original;
  },

  /// Cloud at the foot of a peak (山腰云锁), painted by leaving paper: stacked paper-coloured
  /// bands with billowing upper edges, thin near the waist and solid at the foot, so the peak
  /// rises out of cloud instead of standing on the bank.
  paintingCloud(peak) {
    if (peak && peak.over) peak = peak.over;
    else if (peak && peak.peak) peak = peak.peak;
    const minX = peak.minX !== undefined ? peak.minX : peak.x;
    const maxX = peak.maxX !== undefined ? peak.maxX : peak.x + peak.width;
    const maxY = peak.maxY !== undefined ? peak.maxY : peak.y + peak.height;
    const c = [];
    const top = maxY - peak.height * (0.36 + this.r() * 0.08);
    const bottom = maxY + peak.height * 0.04;
    const x0 = minX - peak.width * 0.08;
    const x1 = maxX + peak.width * 0.08;
    const bands = 6;
    for (let k = 0; k < bands; k++) {
      const t = k / (bands - 1);
      const y = top + (bottom - top) * t * 0.82;
      const phase = this.r() * 6;
      const freq = 0.035 + this.r() * 0.03;
      const edge = [];
      for (let i = 0; i <= 60; i++) {
        const u = i / 60, x = x0 + (x1 - x0) * u;
        const billow = Math.abs(Math.sin(x * freq + phase)) * (5 + 6 * (1 - t));
        // The band thins to nothing at both ends, so no straight edge cuts the hills behind.
        const taper = Math.pow(Math.sin(u * Math.PI), 0.6);
        const rise = (bottom - y) * (1 - taper);
        edge.push(P(x, y + rise - billow * taper + 4 * (this.n(x * 0.02, k) - 0.5)));
      }
      const alpha = k === bands - 1 ? 0.85 : 0.22 + 0.10 * t;
      c.push(this.poly([...edge, P(x1, bottom), P(x0, bottom)], { fil: C(255, 255, 255, alpha), str: null }));
    }
    return c;
  },

  /// The far bank (对岸) of a river scene, in the manner of Ni Zan: low rounded hills on one
  /// side flattening into a level shore, distant trees as small upright dabs along the crest,
  /// a broken shore line. Pale, because it sits across the water.
  paintingFarShore() {
    const c = [];
    const flip = this.r() < 0.5;
    const humps = 2 + Math.trunc(this.r() * 2);
    const tops = [];
    for (let k = 0; k < humps; k++) {
      tops.push({
        x: 0.10 + 0.16 * k + this.r() * 0.06,
        h: 18 + this.r() * 16 - k * 4,
        w: 0.10 + this.r() * 0.05
      });
    }
    const ridge = [];
    for (let i = 0; i <= 100; i++) {
      const t = i / 100, u = flip ? 1 - t : t;
      let y = 0.0;
      for (const top of tops) {
        y = Math.max(y, top.h * Math.exp(-Math.pow(Math.abs(u - top.x) / top.w, 2)));
      }
      const shelf = 4 * (this.n(t * 7, 3) - 0.5);
      ridge.push(P(t * 300, 56 - y - (u < 0.75 ? 3 : 3 * (1 - (u - 0.75) / 0.25)) + shelf));
    }
    // The body thins to nothing at both ends, so the far bank fades out instead of being cut.
    const base = ridge.map((p, i) => {
      const env = Math.pow(Math.sin((i / 100) * Math.PI), 0.45);
      return P(p.x, p.y + Math.max(0.3, (60 - p.y) * env));
    });
    const baseRev = base.slice().reverse();
    c.push(this.poly([...ridge, ...baseRev], { fil: C.white, str: null }));
    c.push(this.poly([...ridge, ...baseRev], { fil: C.gray(0, 0.10), str: null }));
    c.push(...this.inkLine(ridge, 0.8, 0.30, 0.5));
    // Hemp-fibre texture, sparse, on the hill faces only.
    for (let s = 0; s < 26; s++) {
      const i = Math.trunc(this.r() * 100), p = ridge[i];
      if (56 - p.y <= 10) continue;
      const len = 4 + this.r() * (56 - p.y) * 0.5;
      c.push(...this.inkLine([P(p.x, p.y + 2), P(p.x - 1, p.y + 2 + len)], 0.5, 0.16, 0.6));
    }
    // Distant trees: clustered upright dabs riding the crest (远树无枝).
    const treeGroups = 5 + Math.trunc(this.r() * 4);
    for (let g = 0; g < treeGroups; g++) {
      const i = 5 + Math.trunc(this.r() * 90), p = ridge[i];
      const count = 2 + Math.trunc(this.r() * 3);
      for (let k = 0; k < count; k++) {
        const x = p.x + k * (2.2 + this.r()) - 2;
        const height = 4 + this.r() * 5;
        c.push(...this.inkBlot(x, p.y - height * 0.45, height * 0.5, 0.45, 1.5708, 0.30 + this.r() * 0.2));
        c.push(...this.inkLine([P(x, p.y), P(x, p.y - height * 0.3)], 0.45, 0.4));
      }
    }
    // Broken shore line at the water.
    let x = 20 + this.r() * 20;
    while (x < 260) {
      const run = 18 + this.r() * 40;
      c.push(...this.inkLine([P(x, 60), P(Math.min(300, x + run), 60 + (this.r() - 0.5))], 0.6, 0.22, 0.55));
      x += run + 8 + this.r() * 20;
    }
    return c;
  },

  /// Distant range: a few peaks of unequal height (one leads, the others fall away), with a
  /// readable crest and a body that the mist layer dissolves downward. Not a full-width band.
  paintingDistant(index = 0) {
    if (index && typeof index === 'object') index = index.index || 0;
    const phase = this.r() * 12;
    const peaks = 2 + Math.trunc(this.r() * 2.5);
    const tops = [];
    for (let k = 0; k < peaks; k++) {
      const lead = k === 0;
      tops.push({
        x: 0.18 + 0.64 * (k + this.r() * 0.6) / peaks,
        h: lead ? 52 + this.r() * 18 : 22 + this.r() * 22,
        w: lead ? 0.16 + this.r() * 0.06 : 0.10 + this.r() * 0.08
      });
    }
    const ridge = [];
    for (let i = 0; i <= 120; i++) {
      const t = i / 120;
      let y = 0.0;
      for (const top of tops) {
        const d = Math.abs(t - top.x) / top.w;
        y = Math.max(y, top.h * Math.exp(-Math.pow(d, 1.6)));
      }
      const foot = Math.pow(Math.max(0, Math.sin(t * Math.PI)), 0.35);
      const wobble = 4 * (this.n(t * 9 + phase, index * 2) - 0.5);
      ridge.push(P(t * 360, 80 - Math.max(1.5, (y + wobble) * foot)));
    }
    const c = [this.poly([...ridge, P(360, 95), P(0, 95)], { fil: C.gray(0, 0.11 + index * 0.04), str: null })];
    c.push(...this.inkLine(ridge, 0.7, 0.18 + index * 0.06, 0.55));
    return c;
  },

  // =========================================================================
  // 2. ShanShuiPaintingLandforms.swift
  // =========================================================================

  /// A bank (坡石) as landscape painters build it: one main stone, lower companions in front
  /// and sometimes a back stone peeking over.
  paintingSlope(style = 'headland') {
    if (style && typeof style === 'object') style = style.style || 'headland';
    const width = 280 + this.r() * 50;
    const height = style === 'shoal' ? 30 + this.r() * 12 : (style === 'cliff' ? 84 + this.r() * 24 : 64 + this.r() * 24);
    const flip = this.r() < 0.5;
    const stones = [];
    const mainWidth = width * (style === 'shoal' ? 0.58 + this.r() * 0.16 : 0.46 + this.r() * 0.16);
    const mainX = width * (0.02 + this.r() * 0.08);
    const main = { x0: mainX, x1: mainX + mainWidth, top: height * (0.10 + this.r() * 0.06), floor: height, rank: 1 };
    if (style !== 'shoal' || this.r() < 0.4) {
      // The back stone rises behind the main one, offset to the gentle side.
      const w = mainWidth * (0.45 + this.r() * 0.25);
      const x = mainX + mainWidth * (0.30 + this.r() * 0.40);
      stones.push({
        x0: x,
        x1: Math.min(width, x + w),
        top: 0,
        floor: height * (0.55 + this.r() * 0.15),
        rank: 0
      });
    }
    stones.push(main);
    let x = main.x1 - mainWidth * (0.22 + this.r() * 0.16);
    const frontCount = 1 + Math.trunc(this.r() * 2.4);
    for (let k = 0; k < frontCount; k++) {
      const w = width * (0.20 + this.r() * 0.14) * (k === 0 ? 1 : 0.7);
      if (x + w > width + 1) break;
      const top = height * (0.36 + this.r() * 0.22 + k * 0.12);
      stones.push({
        x0: x,
        x1: Math.min(width, x + w),
        top,
        floor: height * (0.97 + this.r() * 0.03),
        rank: 2
      });
      x += w * (0.55 + this.r() * 0.30);
    }

    let c = [];
    for (const stone of stones) {
      c.push(...this.paintingStone(stone.x0, stone.x1, stone.top, stone.floor, style, stone.rank));
    }
    if (flip) {
      c = c.map(poly => {
        const p = clonePoly(poly);
        p.p = p.p.map(pt => P(width - pt.x, pt.y));
        if (this.landscapeSeed) p.pts = p.p;
        return p;
      });
    }
    return this.landscapeSeed ? this.paintingLandscapeBank(style) : c;
  },

  paintingStone(x0, x1, top, floor, style, rank) {
    if (x0 && typeof x0 === 'object') {
      const opts = x0;
      x0 = opts.x0; x1 = opts.x1; top = opts.top; floor = opts.floor;
      style = opts.style; rank = opts.rank;
    }
    const w = x1 - x0, h = floor - top;
    const cliff = style === 'cliff', shoal = style === 'shoal';
    const gentleLeft = this.r() < 0.5;
    const rise = cliff ? 0.14 + this.r() * 0.10 : (shoal ? 0.30 + this.r() * 0.16 : 0.18 + this.r() * 0.14);
    const fall = cliff ? 0.08 + this.r() * 0.06 : (shoal ? 0.10 + this.r() * 0.08 : 0.08 + this.r() * 0.08);
    const tilt = h * (cliff ? 0.06 + this.r() * 0.12 : 0.04 + this.r() * 0.10);
    const left = gentleLeft ? rise : fall, right = gentleLeft ? fall : rise;
    const keys = [
      P(x0, floor - h * 0.04),
      P(x0 + w * left * 0.45, top + h * (cliff ? 0.30 : 0.42) + h * this.r() * 0.12),
      P(x0 + w * left, top + h * this.r() * 0.06 + (gentleLeft ? tilt : 0))
    ];
    const bumps = cliff ? 1 + Math.trunc(this.r() * 2) : 1 + Math.trunc(this.r() * 3);
    for (let k = 1; k <= bumps; k++) {
      const u = left + (1 - left - right) * k / (bumps + 1);
      const lean = gentleLeft ? tilt * (1 - k / (bumps + 1)) : tilt * k / (bumps + 1);
      keys.push(P(
        x0 + w * (u + (this.r() - 0.5) * 0.06),
        top + lean + h * this.r() * (cliff ? 0.05 : shoal ? 0.14 : 0.16)
      ));
    }
    keys.push(
      P(x1 - w * right, top + h * (0.03 + this.r() * 0.10) + (gentleLeft ? 0 : tilt)),
      P(x1 - w * right * 0.35, top + h * (cliff ? 0.30 : 0.45) + h * this.r() * 0.15),
      P(x1, floor - h * 0.02)
    );
    const crest = cliff ? this._densify(keys, 3) : this.inkCurve(keys, 8);
    const ridge = (x) => {
      for (let i = 0; i < crest.length - 1; i++) {
        const a = crest[i], b = crest[i + 1];
        if (x >= Math.min(a.x, b.x) && x <= Math.max(a.x, b.x)) {
          return Math.abs(b.x - a.x) < 0.001 ? Math.min(a.y, b.y) : a.y + (b.y - a.y) * (x - a.x) / (b.x - a.x);
        }
      }
      return floor;
    };
    const base = this.inkCurve([crest[crest.length - 1], P(x0 + w * 0.70, floor + 1.5), P(x0 + w * 0.30, floor + 0.5), crest[0]], 8);
    const c = [this.poly([...crest, ...base], { fil: C.white, str: null })];

    // The fold where the lit top turns into the face, roughly parallel to the crest.
    const drop = h * (shoal ? 0.38 + this.r() * 0.12 : cliff ? 0.16 + this.r() * 0.08 : 0.22 + this.r() * 0.10);
    const foldSpan = shoal ? 0.30 + this.r() * 0.20 : 0.40 + this.r() * 0.25;
    const foldFrom = gentleLeft ? x0 + w * (1 - right - foldSpan) : x0 + w * left * 0.6;
    const foldTo = gentleLeft ? x0 + w * (1 - right * 0.6) : foldFrom + w * foldSpan;
    const fold = [];
    for (let i = 0; i <= 20; i++) {
      const x = foldFrom + (foldTo - foldFrom) * i / 20;
      const wobble = (this.n(x * 0.05, rank + 7) - 0.5) * h * 0.08;
      fold.push(P(x, Math.min(floor - 2, ridge(x) + drop + wobble)));
    }
    fold.push(P(foldTo + w * 0.04, Math.min(floor - 1, ridge(foldTo) + drop + h * (cliff ? 0.30 : 0.18))));

    const faceTop = (x) => {
      if (x < foldFrom || x > foldTo) return Math.min(floor, ridge(x) + drop * 1.1);
      const i = Math.min(19, Math.trunc((x - foldFrom) / Math.max(0.001, foldTo - foldFrom) * 20));
      return fold[i].y;
    };

    // Wash on the face: strongest just under the fold, fading toward the foot.
    const washTone = (cliff ? 0.10 : 0.075) + rank * 0.012;
    const washEdge = (t) => {
      const pts = [];
      for (let j = 0; j <= 28; j++) {
        const u = j / 28, x = x0 + w * (0.04 + u * 0.92);
        const y = faceTop(x);
        const taper = Math.pow(Math.sin(u * Math.PI), 0.5);
        pts.push(P(x, y + Math.max(0, floor - y) * t * taper));
      }
      return pts;
    };
    for (let band = 0; band < 14; band++) {
      const t = band / 14;
      c.push(this.poly([...washEdge(t), ...washEdge((band + 1) / 14).reverse()], {
        fil: C.gray(0, washTone * Math.pow(1 - t, 1.6)),
        str: null
      }));
    }

    // Texture hangs from the fold. The shaded side (the steep one) carries more strokes.
    const shadeLeft = !gentleLeft;
    const groups = cliff ? 3 + Math.trunc(this.r() * 3) : 2 + Math.trunc(this.r() * 3);
    for (let g = 0; g < groups; g++) {
      let u = (g + 0.3 + this.r() * 0.5) / groups;
      u = shadeLeft ? Math.pow(u, 1.4) : 1 - Math.pow(1 - u, 1.4);
      const gx = x0 + w * (0.08 + u * 0.84);
      if (cliff) {
        const sy = faceTop(gx) + 1;
        const reach = (floor - sy) * (0.55 + this.r() * 0.40);
        if (reach <= 4) continue;
        const dir = shadeLeft ? -1.0 : 1.0;
        const lean = reach * (0.30 + this.r() * 0.45) * dir;
        const edge = [P(gx, sy), P(gx + lean * 0.55, sy + reach * 0.5), P(gx + lean, sy + reach)];
        const breadth = w * (0.05 + this.r() * 0.06) * dir;
        const plane = [
          ...edge,
          ...edge.slice().reverse().map(pt => P(pt.x + breadth * (0.4 + 0.6 * (pt.y - sy) / reach), pt.y))
        ];
        c.push(this.poly(plane, { fil: C.gray(0, 0.06 + this.r() * 0.05), str: null }));
        c.push(...this._slopeStroke(edge, 1.2 + this.r() * 0.6, 0.55 + this.r() * 0.12, [0.9, 1, 0.7, 0.4, 0.05], 0.5));
        c.push(...this._slopeStroke(
          [P(gx + breadth * 0.3, sy + reach * 0.08), P(gx + breadth * 0.5 + lean * 0.7, sy + reach * 0.78)],
          4 + this.r() * 4,
          0.32 + this.r() * 0.12,
          [1.1, 0.8, 0.5, 0.2, 0.02],
          0.78
        ));
      } else if (shoal) {
        const kCount = 2 + Math.trunc(this.r() * 2);
        for (let k = 0; k < kCount; k++) {
          const sy = faceTop(gx) + 2 + k * h * 0.13;
          if (sy >= floor - 2) break;
          const run = w * (0.08 + this.r() * 0.08);
          c.push(...this._slopeStroke(
            [P(gx, sy), P(gx + run, sy + 0.5), P(gx + run + 2, Math.min(floor - 1, sy + h * 0.10))],
            0.9 + this.r() * 0.5,
            0.34 + this.r() * 0.14,
            [0.4, 0.9, 0.8, 0.5, 0.08],
            0.62
          ));
        }
      } else {
        const lean = (gx < x0 + w / 2 ? -1.0 : 1.0) * (0.10 + this.r() * 0.20);
        const kCount = 3 + Math.trunc(this.r() * 4);
        for (let k = 0; k < kCount; k++) {
          const sx = gx + k * (2.2 + this.r() * 1.2);
          const sy = faceTop(sx) + this.r() * 2;
          const reach = (floor - sy) * (0.25 + this.r() * 0.45);
          if (reach <= 3) continue;
          c.push(...this._slopeStroke(
            this.inkCurve([P(sx, sy), P(sx + reach * lean * 0.3, sy + reach * 0.5), P(sx + reach * lean, sy + reach)]),
            0.7 + this.r() * 0.6,
            0.30 + this.r() * 0.16,
            [0.6, 1, 0.8, 0.45, 0.05],
            0.62
          ));
        }
      }
    }

    // Contour last: two or three long runs, loaded at the turns, lifted along the top.
    const tone = 0.60 + rank * 0.08;
    const n1 = Math.trunc(crest.length / 3) + Math.trunc(this.r() * Math.trunc(crest.length / 6));
    const n2 = Math.trunc((crest.length * 2) / 3) + Math.trunc(this.r() * Math.trunc(crest.length / 6));
    const runs = [
      crest.slice(0, Math.min(crest.length - 1, n1 + 1) + 1),
      crest.slice(n1, Math.min(crest.length - 1, n2 + 1) + 1),
      crest.slice(n2)
    ];
    for (let i = 0; i < runs.length; i++) {
      const run = runs[i];
      if (run.length > 1) {
        c.push(...this._slopeStroke(
          run,
          (cliff ? 2.3 : 1.9) * (rank === 0 ? 0.8 : 1),
          tone,
          i === 1 ? [0.5, 0.35, 0.45, 0.6, 0.3] : [0.35, 1.0, 0.75, 0.5, 0.15],
          0.40
        ));
      }
    }
    c.push(...this._slopeStroke(fold, 1.3, tone - 0.10, [0.15, 0.7, 0.5, 0.8, 0.1], 0.5));

    // 点苔: dark horizontal dabs in clusters on the crest and its turns.
    const mossClusters = rank === 0 ? 1 : 1 + Math.trunc(this.r() * 2);
    for (let m = 0; m < mossClusters; m++) {
      const cx = x0 + w * (0.12 + this.r() * 0.76);
      const mossDots = 3 + Math.trunc(this.r() * 4);
      for (let k = 0; k < mossDots; k++) {
        const mx = cx + k * (2.6 + this.r() * 1.4) - 6;
        if (mx <= x0 + 2 || mx >= x1 - 2) continue;
        const my = ridge(mx) + this.r() * 1.5;
        c.push(...this._slopeStroke(
          [P(mx, my), P(mx + 2.2 + this.r() * 1.4, my - 0.4)],
          1.6 + this.r() * 0.6,
          0.86 + this.r() * 0.08,
          [0.5, 1, 1, 0.8, 0.15],
          0.22
        ));
      }
    }
    // The foot of front stones opens into water or ground with a few level strokes.
    if (rank > 0) {
      const footStrokes = 1 + Math.trunc(this.r() * 2);
      for (let k = 0; k < footStrokes; k++) {
        const sx = x0 + w * (0.10 + k * 0.40 + this.r() * 0.15);
        const sy = floor + 1 + k * 1.8;
        c.push(...this._slopeStroke(
          [P(sx, sy), P(sx + w * 0.12, sy - 0.6), P(sx + w * 0.24, sy)],
          1.1,
          0.38,
          [0.1, 0.6, 0.5, 0.3, 0.05]
        ));
      }
    }
    return this.landscapeSeed ? this.paintingLandscapeStone(crest, floor, rank) : c;
  },

  paintingLandscapeBank(style) {
    const b=landscapeBrushEngineV5('bank-structure:'+this.landscapeSeed+':'+style+':'+this.e.state);
    b.landscapeSeed=this.landscapeSeed;
    const height=style==='shoal'?40:90;
    const stones=[
      [30,145,.02,.78,0],[125,235,.22,.93,1],
      [0,100,.37,1,1],[75,180,.56,1.08,2],[175,310,.65,1.05,2],
      [10,50,.89,1.09,2],[285,335,.90,1.08,2]
    ].map(([x0,x1,top,floor,rank])=>[x0+(b.r()-.5)*15,x1+(b.r()-.5)*15,
      height*(top+(b.r()-.5)*.09),height*floor,rank]);
    const c=[];
    for(const [x0,x1,top,floor,rank] of stones) {
      const rock=b.paintingStone(x0,x1,top,floor,style,rank);
      // The long bank descends into the water; subsidiary stones interrupt its foot.
      for(const poly of rock) {
        poly.p=poly.p.map(p=>{
          const u=(p.x-x0)/(x1-x0),v=(p.y-top)/(floor-top);
          return P(p.x,p.y+(floor-top)*.50*u*Math.max(0,1-v));
        });
        poly.pts=poly.p;
      }
      c.push(...rock);
    }
    if(b.r()<.5) for(const poly of c) {
      poly.p=poly.p.map(p=>P(335-p.x,p.y));poly.pts=poly.p;
    }
    return c;
  },

  paintingLandscapeWash(at,u,v,rx,ry,ink) {
    rx=Math.min(rx,u*.85,(1-u)*.85);
    ry=Math.min(ry,v*.85,(1-v)*.85);
    const edge=Array.from({length:24},(_,j)=>{
      const angle=j/24*Math.PI*2;
      return {x:Math.cos(angle)*rx*(.84+this.r()*.32),y:Math.sin(angle)*ry*(.84+this.r()*.32)};
    });
    const c=[];
    for(let pass=0;pass<24;pass++) {
      const scale=1.15-pass*.038;
      const points=edge.map(p=>at(Math.max(.01,Math.min(.99,u+p.x*scale)),Math.max(.01,Math.min(.98,v+p.y*scale))));
      c.push({...this.poly(points,{fil:C.gray(0,ink*(.4+pass/23)*1.18/21.6),str:null}),overprint:true});
    }
    return c;
  },

  paintingLandscapeStone(crest, floor, rank) {
    const b=landscapeBrushEngineV5('stone-v3:'+this.landscapeSeed+':'+crest[0].x+':'+floor+':'+rank);
    const c=[];
    const x0=crest[0].x,x1=crest[crest.length-1].x;
    const top=Math.min(...crest.map(p=>p.y)),height=floor-top,width=x1-x0;
    // Replace the old slab mask as well as its texture: unequal ledges meet a sloping toe.
    const shoulders=[[0,.62],[.12,.27],[.29,.31],[.41,.07],[.61,.13],[.73,.36],[.89,.40],[1,.72]];
    crest=b._densify(shoulders.map(([u,v],i)=>P(x0+width*u,
      top+height*(v+(i>0&&i<7?(b.r()-.5)*.16:0)))),2.5);
    c.push(b.poly([...crest,P(x1-width*.07,floor-height*.05),P(x0+width*.48,floor),
      P(x0+width*.04,floor-height*.13)],{fil:C.white,str:null}));
    const ridge=x=>{
      for(let i=0;i<crest.length-1;i++) if(x>=crest[i].x && x<=crest[i+1].x) {
        const a=crest[i],z=crest[i+1];
        return a.y+(z.y-a.y)*(x-a.x)/Math.max(.001,z.x-a.x);
      }
      return floor;
    };
    const face=(u,v)=>{
      const x=x0+(x1-x0)*u,top=ridge(x),height=floor-top;
      return P(x,top+height*(.16+.84*v));
    };
    const inside=p=>{
      const x=Math.max(x0+.2,Math.min(x1-.2,p.x));
      return P(x,Math.max(ridge(x)+.3,Math.min(floor-.3,p.y)));
    };
    const washes=[];
    // A faint connected front plane binds the folds; the top ledge remains unpainted.
    for(let pass=0;pass<12;pass++) {
      const upper=[],lower=[];
      for(let j=0;j<=32;j++) {
        const u=.025+j/32*.95,taper=Math.pow(Math.sin(Math.PI*j/32),.45);
        const top=.16+.045*Math.sin(u*17)+pass*.012;
        upper.push(face(u,top));
        lower.push(face(u,top+(.78-pass*.025)*taper));
      }
      washes.push({...b.poly([...upper,...lower.reverse()],{fil:C.gray(0,.006),str:null}),overprint:true});
    }
    // Folded bands: a light horizontal tip turns into a loaded side stroke at the same corner.
    for(let k=0;k<crest.length-2;k+=12) {
      if(b.r()<.25)continue;
      c.push(...b.paintingBrushStroke(crest.slice(k,k+10),
        {width:1.2+b.r()*.8,ink:.55,moisture:.42,pressure:[.1,.7,.4,.7,.05]}));
    }
    const bands=x1-x0>150?3:x1-x0>75?2:1;
    for(let band=0;band<bands;band++) {
      const u=.06+band*.62/bands+b.r()*.10,v=.04+b.r()*.22;
      const start=face(u,v),corner=inside(P(start.x+(x1-x0)*(.14+b.r()*.05),start.y+1));
      const drop=(floor-corner.y)*(.55+b.r()*.25);
      const route=[start,P(corner.x-(x1-x0)*.04,corner.y-1),corner,
        inside(P(corner.x-2,corner.y+drop*.55)),inside(P(corner.x+drop*.20,corner.y+drop))];
      c.push(...b.paintingBrushStroke(route,{width:4+b.r()*3,ink:.65+b.r()*.15,moisture:.25,
        oblique:1,pressure:[.13,.18,.25,1,.65,.02]}));
      for(let j=0;j<5;j++) {
        const dx=2+j*(1+b.r()),dy=b.r()*drop*.25;
        const points=[inside(P(corner.x+dx,corner.y+dy)),
          inside(P(corner.x+dx-1,corner.y+drop*.40)),inside(P(corner.x+dx+drop*.20,corner.y+drop*(.60+b.r()*.30)))];
        c.push(...b.paintingBrushStroke(points,{width:4+b.r()*5,ink:.20+b.r()*.25,
          moisture:.20,pressure:[.15,.9,.55,.25,.02]}));
      }
      // Dilute ink spreads out from the turning seam, never as isolated oval patches.
      const washWidth=12+b.r()*12;
      for(let pass=0;pass<24;pass++) {
        const spread=washWidth*(1-pass/25);
        const left=b.inkCurve(route.slice(2),5);
        const right=left.map((p,j)=>inside(P(p.x+spread*Math.sin(Math.PI*j/(left.length-1)),p.y)));
        washes.push({...b.poly([...left,...right.reverse()],{fil:C.gray(0,.012),str:null}),overprint:true});
      }
    }
    c.push(...washes);
    // Two ink values, clustered at ledges and the foot rather than distributed over the face.
    for(let group=0;group<3;group++) {
      const u=.12+group*.31+b.r()*.07;
      for(let j=0;j<4+Math.floor(b.r()*4);j++) {
        const x=x0+(x1-x0)*u+j*(1.5+b.r()*2),y=group===1?floor-1:ridge(x)+b.r()*2;
        c.push(...b.paintingBrushStroke([P(x,y),P(x+2+b.r()*3,y-.3)],
          {width:1.8+b.r(),ink:group===0?.45:.85,moisture:.55,pressure:[.2,1,.7,.1]}));
      }
    }
    return c;
  },

  _densify(points, step) {
    const out = [];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1];
      const count = Math.max(1, Math.trunc(Math.hypot(b.x - a.x, b.y - a.y) / step));
      for (let k = 0; k < count; k++) {
        out.push(P.add(a, P.mul(P.sub(b, a), k / count)));
      }
    }
    out.push(points[points.length - 1]);
    return out;
  },

  paintingRootMoss(root) {
    const c = [];
    const count = 3 + Math.trunc(this.r() * 5);
    for (let k = 0; k < count; k++) {
      const p = P.add(root, P(-7 + k * 2.7, 1 + this.r() * 1.5));
      c.push(...this._slopeStroke(
        [p, P.add(p, P(2.5 + this.r(), -0.4))],
        1.6,
        0.88,
        [0.4, 1, 0.9, 0.5, 0.1],
        0.25
      ));
    }
    return c;
  },

  /// Pressure belongs to the long gesture, not to each short polygon edge.
  _slopeStroke(points, width, tone, pressures, dry = 0.42) {
    const samples = [];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1];
      const steps = Math.max(4, Math.trunc(Math.hypot(b.x - a.x, b.y - a.y) / 2));
      for (let k = 0; k < steps; k++) {
        samples.push(P.add(a, P.mul(P.sub(b, a), k / steps)));
      }
    }
    samples.push(points[points.length - 1]);

    const denom = Math.max(1, samples.length - 1);
    const pLast = pressures.length - 1;
    const path = samples.map((p, index) => {
      const t = (index / denom) * pLast;
      const i = Math.min(pressures.length - 2, Math.trunc(t));
      const f = t - i;
      return [p.x, p.y, pressures[i] * (1 - f) + pressures[i + 1] * f];
    });
    const stroke = Brush.stroke(path, {
      width,
      tone,
      dry,
      side: 0.2,
      bristles: width > 4 ? 7 : 3,
      rough: 0.25,
      fade: 0.42,
      profile: 'even'
    }, this.inkSeed());
    const bodyPts = stroke.body.map(pt => Array.isArray(pt) ? P(pt[0], pt[1]) : P(pt.x, pt.y));
    const c = [this.poly(bodyPts, {
      fil: C.gray(0, tone * (dry > 0.6 ? 0.32 : 0.78)),
      str: null
    })];
    for (const hair of stroke.bristles) {
      for (const run of hair.runs) {
        const runPts = run.map(pt => Array.isArray(pt) ? P(pt[0], pt[1]) : P(pt.x, pt.y));
        c.push(this.poly(runPts, {
          fil: null,
          str: C.gray(0, hair.alpha),
          wid: hair.width
        }));
      }
    }
    return c;
  },

  // Pressure, side loading and broken ink deposits are independent of the path.
  // These are geometric approximations of Brushstrokes, PDF pp. 43–45, not fluid simulation.
  paintingBrushStroke(path, { width=2, ink=.6, moisture=.3, oblique=0, pressure=[.15,1,.8,.4,.02] } = {}) {
    if (path.length < 2) return [];
    const points = this._densify(this.inkCurve(path, 4), 1.2), frames=[];
    for (let i=0;i<points.length;i++) {
      const a=points[Math.max(0,i-1)],z=points[Math.min(points.length-1,i+1)];
      const length=Math.hypot(z.x-a.x,z.y-a.y)||1, t=i/(points.length-1);
      const f=t*(pressure.length-1), k=Math.min(pressure.length-2,Math.floor(f));
      const p=pressure[k]+(pressure[k+1]-pressure[k])*(f-k);
      frames.push({p:points[i],nx:-(z.y-a.y)/length,ny:(z.x-a.x)/length,
        radius:width*p*.5*(.88+this.n(i*.23,width+moisture)*.24),t});
    }
    const ribbon=(from,to,alpha,start=0,end=frames.length) => {
      const left=[],right=[];
      for(let i=start;i<end;i++) {
        const f=frames[i], shift=oblique*.35*f.radius;
        const edgeTaper=moisture<.3 ? Math.min(1,(i-start+1)/2,(end-i)/2) : 1;
        const at=u=>P(f.p.x+f.nx*(f.radius*u*edgeTaper+shift),f.p.y+f.ny*(f.radius*u*edgeTaper+shift));
        left.push(at(from));right.push(at(to));
      }
      return this.poly([...left,...right.reverse()],{fil:C.gray(0,alpha),str:null});
    };
    const c=[];
    if(moisture>.35) {
      // A soft low-ink edge surrounding a loaded interior.
      c.push(ribbon(-1.28,1.28,ink*moisture*.08));
      c.push(ribbon(-1.1,1.1,ink*moisture*.12));
    }
    // Dry ink breaks into unequal connected deposits, not evenly spaced parallel hairs.
    // Transparent omissions expose earlier ink and paper without painting either over.
    if(moisture<.3) {
      c.push(ribbon(-.8,.8,ink*.08));
      const strands=width<3?1:6;
      for(let strand=0;strand<strands;strand++) {
        let start=Math.floor(this.r()*3);
        while(start<frames.length-2) {
          const end=Math.min(frames.length,start+6+Math.floor(this.r()*20));
          const centre=strands===1?(this.r()-.5)*.25:-.8+strand*.30+(this.r()-.5)*.40;
          const span=strands===1?.55+this.r()*.35:.08+this.r()*.18;
          c.push(ribbon(Math.max(-1,centre-span),Math.min(1,centre+span),
            ink*(.30+this.r()*.60)*(1-start/frames.length*.35),start,end));
          start=end-1+Math.floor(this.r()*4);
        }
      }
    } else {
      c.push(ribbon(-1,1,ink*.48));
      // Side-loaded ink has one dark edge; upright strokes carry ink nearer their centre.
      for(let k=0;k<5;k++) {
        const u=-1+k*.4;
        const load=oblique ? (oblique>0?k+1:5-k)/5 : 1-Math.abs(u+.2)*.6;
        let start=0;
        while(start<frames.length-1) {
          const end=Math.min(frames.length,start+5+Math.floor(this.r()*9));
          const offset=(this.r()-.5)*.08;
          c.push(ribbon(Math.max(-1,u+offset),Math.min(1,u+.43+offset),
            ink*(.18+.45*load)*(.65+this.r()*.35),start,end));
          start=end-1;
        }
      }
    }
    return c;
  },

  // A linked spine of rock shoulders: contour, shaded planes and cun share one surface.
  // Museum references and the limits of this procedural study: references/LANDSCAPE-BRUSHWORK.md.
  paintingLandscapeMassif(profile, terraced) {
    const b = landscapeBrushEngineV5('landscape-v3:' + this.landscapeSeed + ':' + profile.width + ':' + profile.form);
    const w = 360, h = 360*Math.max(.95,Math.min(1.5,profile.height/profile.width));
    const method = this.landscapeTechnique || 'hemp';
    const flip = profile.form === 'leaning' || profile.form === 'clustered';
    const point = (x, y) => P((flip ? 1 - x : x) * w, y * h);
    // Successive shoulders turn across the slope; subordinate rocks buttress the main peak.
    const peakX=.43+b.r()*.10;
    // Overlapping ledges descend around a turning spine. No face spans the full mountain.
    const rocks = [
      [peakX,.02,.60,.48], [.22,.24,.38,.40], [.76,.34,.30,.35],
      [.49,.43,.60,.43], [.17,.65,.34,.29], [.77,.66,.38,.29],
      [.43,.75,.50,.27], [.14,.88,.27,.15], [.76,.88,.39,.15]
    ];
    const surfaces = rocks.map(([cx, y, rw, rh], index) => {
      cx += (b.r() - .5) * .07;
      y += index ? (b.r()-.5)*.035 : 0;
      rw *= .88+b.r()*.24;
      rh *= .90+b.r()*.18;
      const ridgeForms=[
        [[-.50,.60],[-.41,.38],[-.29,.34],[-.23,.17],[-.08,.19],[.06,0],[.17,.025],[.25,.13],[.39,.23],[.50,.48]],
        [[-.50,.48],[-.41,.28],[-.29,.27],[-.23,.08],[-.08,.04],[.06,.09],[.17,0],[.25,.03],[.39,.34],[.50,.52]],
        [[-.50,.58],[-.41,.42],[-.29,.13],[-.23,.10],[-.08,0],[.06,.04],[.17,.22],[.25,.19],[.39,.39],[.50,.45]]
      ];
      // Subordinate shoulders have broad ledges or off-centre summits, not miniature main peaks.
      if(index>0) ridgeForms.push(
        [[-.50,.64],[-.41,.28],[-.29,.22],[-.23,.12],[-.08,.13],[.06,.10],[.17,.15],[.25,.28],[.39,.32],[.50,.62]],
        [[-.50,.72],[-.41,.45],[-.29,.43],[-.23,.37],[-.08,.30],[.06,.24],[.17,0],[.25,.03],[.39,.38],[.50,.56]]
      );
      let crest = ridgeForms[Math.floor(b.r()*ridgeForms.length)].map(([u,v], k) =>
        P(cx + rw * u, y + rh * (v + (k > 0 && k < 9 ? (b.r() - .5) * .11 : 0))));
      if (terraced && index === 0) for (let k = 2; k < 7; k++) crest[k].y = y + rh * .08;
      if (method === 'hemp' && !terraced) crest = b.inkCurve(crest,2);
      const lean=(index%2 ? -.19 : .14) + (b.r()-.5)*.12;
      // Each shoulder has its own leaning plane, turning back towards the shared foot.
      const at = (u, v) => {
        const i = Math.min(crest.length - 2, Math.floor(u * (crest.length - 1)));
        const t = u * (crest.length - 1) - i;
        const start = P(crest[i].x * (1-t) + crest[i+1].x*t, crest[i].y*(1-t)+crest[i+1].y*t);
        const drift = rw * (lean*Math.sin(v*Math.PI*.85) - .12*v*v);
        const tooth=(b.n(u*30+index*11,v*19)-.5)*.009;
        // A shoulder tapers into an uneven toe. A flat v=1 floor produced the old cut-off edge.
        const foot=Math.max(start.y+rh*.025,y+rh*(.66+.34*Math.pow(Math.sin(Math.PI*u),.7)+.025*Math.sin(u*13+index)));
        return point(start.x + drift + (u - .5) * rw * .24 * v + rw*tooth,
          start.y + (foot - start.y) * v + rh*tooth*.5);
      };
      return { at, crest, index, rw, rh };
    });
    // The first polygon supplies the actual outer ridge used by weather/scene anchors.
    const envelope = [];
    for (let k = 0; k <= 110; k++) {
      const x = k / 110; let y = 1.01;
      for (const s of surfaces) {
        const c = s.crest;
        for (let i = 0; i < c.length - 1; i++) if (x >= c[i].x && x <= c[i+1].x) {
          y = Math.min(y, c[i].y + (c[i+1].y-c[i].y)*(x-c[i].x)/(c[i+1].x-c[i].x));
        }
      }
      envelope.push(point(x, y));
    }
    if (flip) envelope.reverse();
    const c = [b.poly([...envelope, P(w,h*1.02), P(0,h*1.02)], { fil:C.clear, str:null })];
    const patch = (s, u0, u1, v0, v1, tone, gray=0) => {
      // Tiny overlap prevents antialias seams between adjacent wash bands.
      u0=Math.max(0,u0-.0008);u1=Math.min(1,u1+.0008);
      v0=Math.max(0,v0-.0008);v1=Math.min(1,v1+.0008);
      const pts = [], steps=Math.max(2,Math.ceil((u1-u0)*80));
      for (let i=0; i<=steps; i++) pts.push(s.at(u0+(u1-u0)*i/steps, v0));
      for (let i=1; i<=10; i++) pts.push(s.at(u1, v0+(v1-v0)*i/10));
      for (let i=1; i<=steps; i++) pts.push(s.at(u1-(u1-u0)*i/steps, v1));
      for (let i=1; i<10; i++) pts.push(s.at(u0, v1-(v1-v0)*i/10));
      c.push({...b.poly(pts, { fil:C.gray(gray,tone), str:null }),overprint:true});
    };
    const dry = (points, width, alpha) => c.push(...b.paintingBrushStroke(points,
      {width,ink:alpha,moisture:.22,pressure:[.2+b.r()*.3,.6+b.r()*.4,.25+b.r()*.5,.45+b.r()*.5,.02]}));
    for (const s of surfaces) {
      // Opaque paper masks the preceding rock, then thin wet layers build its body.
      patch(s,0,1,0,1,.94,255);
      const washes=[];
      // The lit plane remains paper; deposits gather beyond the main fold on the shaded flank.
      for(let k=0;k<5;k++) {
        washes.push(...b.paintingLandscapeWash(s.at,.64+b.r()*.23,.25+b.r()*.50,
          .08+b.r()*.12,.12+b.r()*.18,.025+b.r()*.020));
      }
      for (let k=0;k<9;k++) if (k!==3 && k!==7) {
        const pts=[];
        for(let j=0;j<=5;j++) pts.push(s.at((k+j/5)/9,.006));
        c.push(...b.paintingBrushStroke(pts, {width:1.2+b.r()*1.2,ink:.35+b.r()*.2,moisture:.43}));
      }
      // Ribs wrap over the shoulder before descending along its flanks. The same route
      // carries contour, wash and nested cun, so texture cannot float independently of form.
      const routes=[{root:.50+b.r()*.16,weight:1},{root:.19+b.r()*.09,weight:.22}].map(({root,weight})=>{
        const side=1,offset=(b.r()-.5)*.06,length=.72+b.r()*.20;
        const path=b.inkCurve([P(root-side*.12,.10),P(root-side*.04,.025),
          P(root+side*.04,.28),P(root+side*.07,.60),P(root+side*.12,length)],5);
        return {side,weight,path:path.map(p=>P(p.x+offset,p.y))};
      });
      const along=(r,t)=>{
        const f=Math.max(0,Math.min(1,t))*(r.path.length-1),i=Math.min(r.path.length-2,Math.floor(f));
        return P(r.path[i].x+(r.path[i+1].x-r.path[i].x)*(f-i),
          r.path[i].y+(r.path[i+1].y-r.path[i].y)*(f-i));
      };
      const onFace=(u,v)=>s.at(Math.max(.015,Math.min(.985,u)),Math.max(.005,Math.min(.985,v)));
      for(const r of routes) {
        for(let wash=0;wash<24;wash++) {
          const edge=side=>Array.from({length:28},(_,j)=>{
            const t=j/27,p=along(r,t);
            const spread=side*r.side*(.30-wash*.011)*Math.pow(Math.sin(Math.PI*t),.65);
            return onFace(p.x+spread,p.y);
          });
          washes.push({...b.poly([...edge(0),...edge(1).reverse()],{fil:C.gray(0,.0083*r.weight),str:null}),overprint:true});
        }
        for(let segment=0;segment<3;segment++) {
          const begin=segment*.32,finish=Math.min(1,begin+.24+b.r()*.06);
          dry(Array.from({length:9},(_,j)=>{const p=along(r,begin+(finish-begin)*j/8);return onFace(p.x,p.y);}),
            1.8+b.r()*1.5,(.64+b.r()*.18)*r.weight);
        }
        for(let group=0;group<(r.weight===1?5:1);group++) {
          const uOffset=.015+group*(.035+b.r()*.012),vOffset=.02+group*.025+b.r()*.035;
          const count=3+Math.floor(b.r()*3);
          for(let k=0;k<count;k++) {
            const start=b.r()*.70,end=Math.min(1,start+.14+b.r()*.26);
            const du=uOffset+(k-count*.5)*.016+(b.r()-.5)*.02,dv=vOffset+b.r()*.035;
            const pts=[],phase=b.r()*6.28;
            for(let j=0;j<10;j++) {
              const t=start+(end-start)*j/9,p=along(r,t);
              pts.push(onFace(p.x+du+.018*Math.sin(j*.9+phase),p.y+dv));
            }
            if(method==='axe') {
              const p=along(r,start),reach=.15+b.r()*.30;
              const cut=[onFace(p.x+du,p.y+dv),onFace(p.x+du+r.side*.05,p.y+dv+reach*.3),
                onFace(p.x+du+r.side*.16,p.y+dv+reach)];
              c.push(...b.paintingBrushStroke(cut,{width:4+b.r()*8,ink:(.35+b.r()*.30)*r.weight,
                moisture:.35+b.r()*.13,oblique:r.side,pressure:[.95,.80,.55,.22,.01]}));
            } else {
              if(k===0)c.push(...b.paintingBrushStroke(pts,{width:7+b.r()*8,ink:(.10+b.r()*.12)*r.weight,
                moisture:.65,oblique:r.side*.5,pressure:[.1,1,.7,.4,.01]}));
              dry(pts,2.8+b.r()*2.7,(.35+b.r()*.25)*r.weight);
            }
          }
        }
      }
      // Dilute ink unites the cun after drawing; moss is the final, darkest accent.
      c.push(...washes);
      // Moss is grouped on ledges, never an evenly spaced dotted border.
      for(let group=0;group<3;group++) {
        const root=.12+b.r()*.70;
        for(let j=0;j<5+b.r()*7;j++) {
          const p=s.at(Math.min(.98,root+b.r()*.12),b.r()*.035);
          c.push(...b.inkBlot(p.x,p.y,.8+b.r()*1.4,.5,-.2,group===0?.35:.70));
        }
      }
      if(s.index===1 || s.index===5 || s.index===8) {
        for(let tree=0;tree<5;tree++) {
          const base=s.at(.25+tree*.065,.025),height=9+b.r()*17,lean=(b.r()-.5)*5;
          c.push(...b.paintingBrushStroke([base,P(base.x+lean*.3,base.y-height*.55),P(base.x+lean,base.y-height)],
            {width:.8+b.r()*.5,ink:.65,moisture:.4,pressure:[1,.7,.4,.01]}));
          for(let tier=0;tier<7;tier++) {
            const t=.20+tier*.10,p=P(base.x+lean*t,base.y-height*t),span=(1-t)*(2+b.r()*3);
            c.push(...b.paintingBrushStroke([P(p.x-span,p.y-1),P(p.x+span,p.y)],
              {width:1.2+b.r(),ink:.55+b.r()*.25,moisture:.55,pressure:[.2,1,.7,.05]}));
          }
        }
      }
    }
    return c;
  },

  paintingLandscapePine() {
    const b=landscapeBrushEngineV5('pine-structure:'+this.landscapeSeed+':'+this.e.state),c=[];
    const direction=b.r()<.5?-1:1,root=P(66,178);
    const joints=[root,P(66-direction*5,149),P(66+direction*12,117),
      P(66+direction*4,87),P(66+direction*(23+b.r()*13),57),P(66+direction*17,21)];
    const spine=b.inkCurve(joints,6),at=t=>spine[Math.min(spine.length-1,Math.floor(t*(spine.length-1)))];
    const crowns=[];
    const branch=(points,width,tone)=>{
      c.push(...b.paintingBrushStroke(points,{width,ink:tone,moisture:.42,
        pressure:[1,.86,.65,.4,.03]}));
      if(width>4)c.push(...b.paintingBrushStroke(points.map(p=>P(p.x-width*.15,p.y)),
        {width:width*.25,ink:.4,moisture:.22,pressure:[.7,1,.6,.5,.02]}));
    };
    // Main limbs rise, bend and fork. Crowns sit at twig ends, not on horizontal shelves.
    for(let k=0;k<7;k++) {
      const t=.26+k*.09+b.r()*.035,origin=at(t),side=k%3===0?-direction:direction;
      const reach=(22+b.r()*24)*(1.2-t*.45),rise=8+b.r()*20;
      const elbow=P(origin.x+side*reach*.45,origin.y+4-b.r()*10);
      const tip=P(origin.x+side*reach,origin.y-rise);
      branch([origin,elbow,P(tip.x-side*6,tip.y+5),tip],4.5*(1-t*.65),.8);
      for(let j=0;j<2+(k%2);j++) {
        const u=.35+j*.20,from=P(elbow.x+(tip.x-elbow.x)*u,elbow.y+(tip.y-elbow.y)*u);
        const end=P(from.x+side*(5+b.r()*13),from.y-7-b.r()*12);
        branch([from,P(from.x+side*3,end.y+4),end],1.6,.72);
        crowns.push([end,10+b.r()*10,5+b.r()*6,k%3===0?.55:.85]);
      }
      crowns.push([tip,13+b.r()*12,7+b.r()*5,.85]);
    }
    // Roots and bark remain attached to the same known planting point.
    const left=[],right=[];
    for(let i=0;i<spine.length;i++) {
      const t=i/(spine.length-1),p=spine[i],radius=4.5*Math.pow(1-t,.8);
      left.push(P(p.x-radius,p.y));right.push(P(p.x+radius,p.y));
    }
    c.push(b.poly([...left,...right.slice().reverse()],{fil:C.white,str:null}));
    c.push(...b.paintingBrushStroke(left,{width:1.5,ink:.78,moisture:.24}));
    c.push(...b.paintingBrushStroke(right,{width:2.7,ink:.86,moisture:.26}));
    c.push(...b.paintingBrushStroke(spine,{width:5,ink:.38,moisture:.5,pressure:[1,.8,.6,.3,0]}));
    for(let k=0;k<34;k++) {
      const t=.04+b.r()*.78,p=at(t),radius=3.5*(1-t);
      c.push(...b.paintingBrushStroke([P(p.x-radius,p.y-2),P(p.x+radius*.5,p.y),P(p.x-radius*.3,p.y+3)],
        {width:1.0+b.r(),ink:.8,moisture:.26}));
    }
    for(const dx of [-13,-5,12]) branch([P(root.x,root.y-10),P(root.x+dx*.5,root.y),P(root.x+dx,root.y+3)],2.6,.8);
    crowns.push([at(1),24,10,.9]);
    for(const [p,w,h,tone] of crowns) {
      // Small overlapping needle groups form a broken, dark canopy with open gaps.
      const groups=5+Math.floor(b.r()*4);
      for(let g=0;g<groups;g++) {
        const cx=p.x+(b.r()-.5)*w,cy=p.y+(b.r()-.6)*h,tilt=(b.r()-.5)*.8;
        for(let needle=0;needle<4;needle++) {
          const angle=-Math.PI+needle/3*Math.PI+tilt,reach=3+b.r()*4;
          const tip=P(cx+Math.cos(angle)*reach,cy+Math.sin(angle)*reach);
          c.push(...b.paintingBrushStroke([P(cx,cy),tip],
            {width:.75+b.r()*.65,ink:tone,moisture:.45,pressure:[.7,1,.2,.01]}));
        }
        c.push(...b.inkBlot(cx,cy,2.8+b.r()*1.7,.45,tilt,tone*.85));
        c.push(...b.paintingBrushStroke([P(cx-3,cy-2),P(cx+2,cy-3),P(cx+5,cy-2)],
          {width:2+b.r()*1.5,ink:tone*.7,moisture:.4,pressure:[.1,1,.7,.01]}));
      }
    }
    return c;
  },

  paintingLandscapeCrown(x,y,width,height,pine) {
    const b = landscapeBrushEngineV5('foliage-v3:'+this.landscapeSeed+':'+[x,y,width,height,pine].join(':'));
    const c=[];
    // Pine-leaf dots converge towards a twig; broad leaves use upright grouped dabs (PDF p. 40).
    for (const [u,v,scale] of [[-.28,.03,.85],[.04,-.24,1],[.32,.10,.60]]) {
      const cx=x+width*(u+(b.r()-.5)*.14),cy=y+height*(v+(b.r()-.5)*.25);
      const count=10;
      for(let i=0;i<count;i++) {
        if(pine) {
          const angle=-Math.PI*(.90+b.r()*.12)+Math.PI*.94*(i+b.r())/count;
          const radius=height*(.30+b.r()*.48)*scale;
          const tip=P(cx+Math.cos(angle)*radius*1.45,cy+Math.sin(angle)*radius);
          c.push(...b.paintingBrushStroke([tip,P((tip.x+cx)*.5,(tip.y+cy)*.5-1),P(cx,cy)],
            {width:1.4+b.r()*1.2,ink:.70+b.r()*.25,moisture:.4,pressure:[.05,.7,1,.65,.02]}));
        } else {
          const px=cx+(b.r()-.5)*width*.35*scale,py=cy+(b.r()-.5)*height*.65;
          c.push(...b.paintingBrushStroke([P(px,py),P(px+height*.1,py+height*.20),P(px,py+height*.30)],
            {width:width*(.035+b.r()*.04),ink:.4+b.r()*.35,moisture:.55,pressure:[.1,1,.9,.6,.1]}));
        }
      }
    }
    return c;
  },

  paintingStudyBounds(source) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const poly of source) for (const p of poly.p) {
      x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
    }
    return { x0, y0, x1, y1, mask:this.poly([P(x0, y0), P(x1, y1)], { fil:C.clear, str:null }) };
  },

  paintingStudyMassif(source, ridge, width, height) {
    const brush = new ShanShuiEngineV5('mass-v2:' + this.paintedStudySeed + ':' + width + ':' + height);
    const bounds = this.paintingStudyBounds(source);
    const top = (x) => {
      const index = ridge.findIndex(p => p.x >= x);
      if (index <= 0) return ridge[0].y;
      const a = ridge[index - 1], b = ridge[index];
      return a.y + (b.y - a.y) * (x - a.x) / Math.max(.001, b.x - a.x);
    };
    const inside = p => {
      const x = Math.max(0, Math.min(width, p.x));
      return P(x, Math.max(top(x) + .5, Math.min(height + 1, p.y)));
    };
    const c = [source[0], bounds.mask];
    // A continuous pale body, with open ridges between overlapping shaded faces.
    const contour = t => ridge.map(p => P(p.x, p.y + (height + 1 - p.y) * t));
    for (let band = 0; band < 18; band++) {
      const t = band / 18;
      c.push(brush.poly([...contour(t), ...contour((band + 1) / 18).reverse()], {
        fil:C.gray(0, .11 + .10 * Math.sin(t * Math.PI)), str:null
      }));
    }
    for (let face = 0; face < 5; face++) {
      const u = [.16, .31, .48, .65, .80][face] + (brush.r() - .5) * .07;
      const x = width * u, y = top(x) + height * (.035 + (face % 3) * .06);
      const depth = (height - y) * (.48 + brush.r() * .34);
      if (depth < height * .15) continue;
      const side = u < .5 ? -1 : 1;
      const path = brush.inkCurve([P(x, y), P(x + side * width * .015, y + depth * .28),
        P(x + side * width * .065, y + depth * .60), P(x + side * width * .14, y + depth)], 10);
      const span = width * (.11 + brush.r() * .06);
      const edge = t => path.map((p, i) => {
        const v = i / (path.length - 1);
        const swell = Math.pow(Math.sin(v * Math.PI), .65);
        return inside(P(p.x + span * t * swell, p.y + depth * .04 * t));
      });
      // Broad damp washes carry the volume; feather the outer edge across narrow bands.
      for (let band = 0; band < 14; band++) {
        const t = band / 14;
        c.push(brush.poly([...edge(t), ...edge((band + 1) / 14).reverse()], {
          fil:C.gray(0, .30 * Math.pow(1 - t, 1.15)), str:null
        }));
      }
      // Broken, variable-width dry marks follow the face instead of spanning the whole mountain.
      for (let group = 0; group < 7; group++) {
        const at = 1 + group * 4 + Math.trunc(brush.r() * 4);
        const root = path[Math.min(at, path.length - 1)];
        const reach = height * (.035 + brush.r() * .055);
        const marks = 4 + Math.trunc(brush.r() * 4);
        for (let mark = 0; mark < marks; mark++) {
          const dx = span * (.04 + brush.r() * .6), dy = (brush.r() - .5) * reach;
          const start = inside(P(root.x + dx, root.y + dy));
          const bend = side * (.05 + brush.r() * .3);
          const points = [start, inside(P(start.x + reach * bend, start.y + reach * .35)),
            inside(P(start.x + reach * bend * .6, start.y + reach * .65)),
            inside(P(start.x + reach * bend * 1.6, start.y + reach))];
          c.push(...brush._slopeStroke(brush.inkCurve(points, 3), 3 + brush.r() * 5, .14 + brush.r() * .16,
            [.1, .9, .65, .45, .02], .86));
        }
        if (group % 2 === 0) {
          c.push(...brush.inkBlot(root.x + span * .12, root.y, width * (.005 + brush.r() * .005),
            .4, -.2, .35 + brush.r() * .15));
        }
      }
    }
    // Broken contour: stronger at turns, with lifted gaps on the lit shoulders.
    for (let i = 0; i < ridge.length - 2; i += 9) {
      const run = ridge.slice(i, Math.min(ridge.length, i + 7));
      c.push(...brush._slopeStroke(run, 1.5 + brush.r() * 1.4, .30 + brush.r() * .13,
        [.1, .75, .65, .4, .02], .65));
    }
    return c.map((poly, index) => {
      if (index < 2) return poly;
      const p = clonePoly(poly);
      p.p = p.pts = p.p.map(inside);
      return p;
    });
  },

  paintingStudyCrown(source, x, y, width, height, pine) {
    const brush = new ShanShuiEngineV5('crown-v2:' + this.paintedStudySeed + ':' + [x, y, width, height, pine].join(':'));
    const b = this.paintingStudyBounds(source);
    const c = [b.mask];
    // Unequal grouped dabs leave gaps between foliage shelves; avoid radial fans of identical needles.
    const count = pine ? 8 : 10;
    for (let k = 0; k < count; k++) {
      const t = k / (count - 1);
      const px = x + (t - .5) * width * .72 + (brush.r() - .5) * width * .16;
      const py = y - height * (.08 + .38 * Math.sin(t * Math.PI)) + (brush.r() - .5) * height * .8;
      const radius = width * (.08 + brush.r() * .09);
      c.push(...brush.inkBlot(px, py, radius * 1.5, .45, -.15, .10));
      c.push(...brush.inkBlot(px, py, radius, pine ? .58 : .75, -.3 + brush.r() * .6, .42 + brush.r() * .23));
      if (pine && k % 3 === 0) {
        c.push(...brush.inkLine([P(px - radius * .5, py + 1), P(px, py - height * .38)],
          1.1, .42, .45));
      }
    }
    return c.map((poly, index) => {
      if (index === 0) return poly;
      const p = clonePoly(poly);
      p.p = p.pts = p.p.map(pt => P(Math.max(b.x0, Math.min(b.x1, pt.x)), Math.max(b.y0, Math.min(b.y1, pt.y))));
      return p;
    });
  },

  paintingMassif(profile, terraced = false) {
    if (terraced && typeof terraced === 'object') {
      terraced = Boolean(terraced.terraced);
    }
    const width = Math.max(profile.height * 0.62, profile.width);
    const height = profile.height;
    let ridge = [];
    for (let i = 0; i <= 90; i++) {
      const t = i / 90;
      const elevation = profile.elevation(t);
      const grain = (this.n(t * 34, 4) - 0.5) * 9 * Math.sin(t * Math.PI);
      ridge.push(P(width * t, height * (1 - elevation) + grain));
    }
    if (terraced && ridge.length > 0) {
      let summit = Infinity;
      for (const p of ridge) if (p.y < summit) summit = p.y;
      if (Number.isFinite(summit)) {
        const level = summit + height * 0.055;
        const cut = [];
        for (let i = 0; i < ridge.length - 1; i++) {
          const a = ridge[i], b = ridge[i + 1];
          cut.push(P(a.x, Math.max(a.y, level)));
          if ((a.y < level) !== (b.y < level)) {
            cut.push(P(a.x + (b.x - a.x) * (level - a.y) / (b.y - a.y), level));
          }
        }
        cut.push(ridge[ridge.length - 1]);
        ridge = cut;
      }
    }
    const ridgeY = (x) => {
      for (let i = 0; i < ridge.length - 1; i++) {
        const a = ridge[i], b = ridge[i + 1];
        if (a.x <= x && x <= b.x) {
          return a.y + (b.y - a.y) * (x - a.x) / Math.max(0.001, b.x - a.x);
        }
      }
      return height;
    };
    const outline = [...ridge, P(width * 0.88, height + 8), P(width * 0.12, height + 8)];
    const c = [this.poly(outline, { fil: C.white, str: null })];
    // First dilute wash follows the whole mountain face.
    const contour = (t) => ridge.map(p => P(p.x, p.y + (height + 1 - p.y) * t));
    for (let band = 0; band < 24; band++) {
      const t = band / 24;
      const tone = 0.012 + 0.042 * Math.pow(Math.sin(t * Math.PI), 1.3);
      c.push(this.poly([...contour(t), ...contour((band + 1) / 24).reverse()], {
        fil: C.gray(0, tone),
        str: null
      }));
    }
    // Three long contour gestures retain shoulders.
    const r1 = Math.trunc(ridge.length / 3);
    const r2 = Math.trunc((ridge.length * 2) / 3);
    for (const [lo, hi] of [[0, r1], [r1, r2], [r2, ridge.length - 1]]) {
      c.push(...this._slopeStroke(ridge.slice(lo, hi + 1), 2.1, 0.67, [0.25, 0.8, 0.45, 0.9, 0.2], 0.42));
    }
    // Structural ribs begin at unequal summits/shoulders and open toward the broad foot.
    const ribCount = 3 + Math.trunc(this.r() * 65536) % 3;
    for (let k = 0; k < ribCount; k++) {
      const u = 0.17 + k * 0.66 / (ribCount - 1) + (this.r() - 0.5) * 0.04;
      const x = width * u, y = ridgeY(x) + height * (0.025 + this.r() * 0.025);
      const available = height - y;
      if (available <= height * 0.20) continue;
      const outward = (u - 0.5) * width * (0.28 + this.r() * 0.18);
      const controls = [
        P(x, y),
        P(x + outward * 0.25 - width * 0.025, y + available * 0.27),
        P(x + outward * 0.65 + width * 0.035, y + available * 0.52),
        P(x + outward, y + available * (0.88 + this.r() * 0.10))
      ];
      const rib = this.inkCurve(controls, 10);
      const inside = (p) => P(p.x, Math.max(ridgeY(p.x) + 1, Math.min(height + 1, p.y)));
      // Adjacent narrow wash strips fade away from the valley edge.
      const shadowWidth = width * (0.16 + this.r() * 0.07);
      const ribEdge = (t) => rib.map((p, i) => {
        const v = i / (rib.length - 1);
        const spread = shadowWidth * Math.pow(Math.sin(v * Math.PI), 0.6);
        return inside(P.add(p, P(spread * t, available * 0.06 * t)));
      });
      for (let band = 0; band < 12; band++) {
        const t = band / 12;
        c.push(this.poly([...ribEdge(t), ...ribEdge((band + 1) / 12).reverse()], {
          fil: C.gray(0, 0.19 * Math.pow(1 - t, 1.4)),
          str: null
        }));
      }
      c.push(...this._slopeStroke(
        rib.slice(0, Math.trunc((rib.length * 3) / 4)).map(inside),
        1.6,
        0.49,
        [0.25, 0.75, 0.5, 0.65, 0.05],
        0.56
      ));
      // 披麻 / 解索: long, overlapping bundles on the valley face.
      for (let bundle = 0; bundle < 3; bundle++) {
        const start = 2 + bundle * 7;
        const strandCount = 8 + Math.trunc(this.r() * 5);
        for (let strand = 0; strand < strandCount; strand++) {
          const offset = 2.5 + strand * (2.4 + this.r() * 1.6);
          const stagger = Math.trunc(this.r() * 5) - 2;
          const length = 9 + Math.trunc(this.r() * 7);
          const line = [];
          for (let j = 0; j <= length; j++) {
            const index = Math.max(0, Math.min(rib.length - 1, start + j + stagger));
            const p = rib[index];
            const t = j / length;
            const loosen = Math.sin(t * Math.PI * 1.5 + strand * 0.35) * (2 + t * 3);
            line.push(inside(P.add(p, P(offset + loosen + t * strand * 0.6, strand * 1.2))));
          }
          c.push(...this._slopeStroke(
            line,
            strand % 5 === 0 ? 2.7 : 1.0 + this.r() * 0.65,
            0.37 + this.r() * 0.15,
            [0.3, 0.9, 0.65, 0.7, 0.04],
            0.58
          ));
        }
      }
      // A second, broad wash settles in the lower valley.
      const lowerEdge = (t) => rib.map((p, i) => {
        const v = i / (rib.length - 1);
        const swell = Math.pow(Math.sin(v * Math.PI), 0.8) * (0.35 + v);
        return inside(P.add(p, P(width * 0.13 * t * swell, available * 0.10 * t)));
      });
      for (let band = 0; band < 16; band++) {
        const t = band / 16;
        c.push(this.poly([...lowerEdge(t), ...lowerEdge((band + 1) / 16).reverse()], {
          fil: C.gray(0, 0.09 * Math.pow(1 - t, 1.5)),
          str: null
        }));
      }
      for (let cluster = 0; cluster < 2 + (k % 2); cluster++) {
        const at = 4 + cluster * 8 + Math.trunc(this.r() * 3);
        const dotCount = 3 + Math.trunc(this.r() * 4);
        for (let j = 0; j < dotCount; j++) {
          const p = inside(P.add(rib[Math.min(rib.length - 1, at + Math.trunc(j / 3))], P(j * 2.2 - 4, 0)));
          c.push(...this._slopeStroke(
            [p, P.add(p, P(2.4 + this.r() * 1.8, -0.6))],
            1.7,
            0.80 + this.r() * 0.1,
            [0.2, 1, 0.85, 0.4, 0.05],
            0.30
          ));
        }
      }
      // Smaller shoulders turn each broad face.
      {
        const center = P.add(rib[8 + Math.trunc(this.r() * 12)], P(-width * (0.07 + this.r() * 0.04), 0));
        const rx = width * (0.055 + this.r() * 0.025), ry = height * (0.025 + this.r() * 0.02);
        const cap = this.inkCurve([
          P.add(center, P(-rx, ry * 1.2)),
          P.add(center, P(-rx * 0.60, ry * 0.12)),
          P.add(center, P(-rx * 0.17, -ry * 0.18)),
          P.add(center, P(rx * 0.3, ry * 0.05)),
          P.add(center, P(rx * 0.8, ry * 0.7)),
          P.add(center, P(rx * 0.95, ry * 2))
        ]).map(inside);
        c.push(...this._slopeStroke(cap, 1.5, 0.52, [0.15, 0.7, 0.5, 0.8, 0.08], 0.48));
        const capEdge = (t) => cap.map((p, i) => {
          const u = i / (cap.length - 1);
          return inside(P.add(p, P(rx * t * 0.45, ry * 2.5 * t * Math.sin(u * Math.PI))));
        });
        for (let band = 0; band < 9; band++) {
          const t = band / 9;
          c.push(this.poly([...capEdge(t), ...capEdge((band + 1) / 9).reverse()], {
            fil: C.gray(0, 0.08 * Math.pow(1 - t, 1.5)),
            str: null
          }));
        }
        const capStrands = 4 + Math.trunc(this.r() * 3);
        for (let strand = 0; strand < capStrands; strand++) {
          const p = P.add(cap[Math.trunc(cap.length / 2) + strand], P(0, 2));
          const reach = available * (0.10 + this.r() * 0.13);
          const path = this.inkCurve([p, P.add(p, P(reach * 0.10, reach * 0.45)), P.add(p, P(reach * 0.40, reach))]);
          c.push(...this._slopeStroke(
            path.map(inside),
            strand === 0 ? 3 : 0.85,
            0.34 + this.r() * 0.1,
            [0.5, 0.85, 0.55, 0.3, 0.03],
            0.64
          ));
        }
      }
      // One side ridge forks from this rib.
      const fork = rib[Math.trunc(rib.length / 3)];
      const branch = this.inkCurve([
        fork,
        P.add(fork, P(-width * 0.055, available * 0.10)),
        P.add(fork, P(-width * 0.09, available * 0.31))
      ]);
      c.push(...this._slopeStroke(branch.map(inside), 1.1, 0.42, [0.2, 0.7, 0.6, 0.25, 0.05], 0.58));
    }
    // 矾头: short, rounded facets gather on the actual crest.
    for (let summit = 1; summit < profile.ridge.length - 1; summit++) {
      const p = profile.ridge[summit];
      if (!(p.y >= profile.ridge[summit - 1].y && p.y >= profile.ridge[summit + 1].y && (!terraced || p.y < 0.91))) {
        continue;
      }
      const facetCount = 2 + Math.trunc(this.r() * 3);
      for (let k = 0; k < facetCount; k++) {
        const x = width * p.x + (k - 1) * width * 0.027;
        const rx = width * (0.032 + this.r() * 0.018), ry = height * (0.022 + this.r() * 0.014);
        const top = ridgeY(x) + ry * (0.6 + k * 0.35);
        const cap = this.inkCurve([
          P(x - rx, top + ry),
          P(x - rx * 0.65, top),
          P(x + rx * 0.15, top - ry * 0.15),
          P(x + rx, top + ry * 0.6)
        ]);
        const clipped = cap.map(pt => P(pt.x, Math.max(ridgeY(pt.x) + 1, pt.y)));
        c.push(...this._slopeStroke(clipped, 1.7, 0.56, [0.2, 0.7, 0.5, 0.65, 0.1], 0.45));
        for (let j = 0; j < 4; j++) {
          const sx = x + j * rx * 0.15;
          const sy = Math.max(ridgeY(sx) + 2, top + ry * 0.15);
          c.push(...this._slopeStroke(
            this.inkCurve([P(sx, sy), P(sx + rx * 0.2, sy + ry * 0.65), P(sx + rx * 0.4, sy + ry * 1.4)]),
            1.0,
            0.44,
            [0.3, 0.8, 0.6, 0.3, 0.05],
            0.58
          ));
        }
      }
    }
    // Groves gather on a few shoulders, with broad intervals of bare ridge.
    let minRidgeY = Infinity;
    for (const p of ridge) if (p.y < minRidgeY) minRidgeY = p.y;
    if (!Number.isFinite(minRidgeY)) minRidgeY = 0;
    const groveCount = 2 + Math.trunc(this.r() * 3);
    for (let g = 0; g < groveCount; g++) {
      const u = 0.12 + this.r() * 0.76;
      const trees = 2 + Math.trunc(this.r() * 5);
      for (let j = 0; j < trees; j++) {
        const x = width * (u + j * 0.008);
        const y = ridgeY(x), treeH = 3 + this.r() * 6;
        if (terraced && y < minRidgeY + height * 0.06) continue;
        c.push(...this.inkLine([P(x, y + 1), P(x - 0.5, y - treeH)], 0.9, 0.7));
        c.push(...this.inkLine([P(x - 2, y - treeH * 0.5), P(x + 1.5, y - treeH * 0.7)], 2.0, 0.72 + this.r() * 0.13, 0.28, 'lens'));
      }
    }
    if (this.paintedStudySeed) return this.paintingStudyMassif(c, ridge, width, height);
    // Preserve bearing silhouette at index 0; simplify interior fibres within 0.16 asset units.
    return c.map((polygon, index) => {
      if (index === 0) return polygon;
      const p = clonePoly(polygon);
      p.p = this.inkSimplified(p.p, 0.16);
      return p;
    });
  },

  /// A path appears by reserved paper between broken banks, opening toward the viewer.
  paintingFootpath() {
    const left = this.inkCurve([P(38, 0), P(60, 24), P(32, 61), P(43, 100), P(5, 145)]);
    const right = this.inkCurve([P(41, 0), P(65, 24), P(43, 61), P(64, 100), P(37, 145)]);
    const c = [this.poly([...left, ...right.slice().reverse()], { fil: C.white, str: null })];
    for (const edge of [left, right]) {
      for (let start = 0; start < edge.length - 4; start += 6) {
        c.push(...this.inkLine(edge.slice(start, start + 4), 0.85, 0.36, 0.65));
      }
    }
    return c;
  },

  // =========================================================================
  // 3. ShanShuiPaintingWater.swift
  // =========================================================================

  paintingChannel(widthOrChannel, height, river = false, phase = null) {
    let channel;
    if (widthOrChannel instanceof PaintingWaterChannel || (widthOrChannel && typeof widthOrChannel.point === 'function')) {
      channel = widthOrChannel;
    } else if (widthOrChannel && typeof widthOrChannel === 'object') {
      if ('broad' in widthOrChannel) {
        channel = new PaintingWaterChannel(widthOrChannel);
      } else {
        const w = widthOrChannel.width;
        const h = widthOrChannel.height;
        const rev = Boolean(widthOrChannel.river);
        const ph = widthOrChannel.phase != null ? widthOrChannel.phase : this.r() * Math.PI * 2;
        channel = new PaintingWaterChannel(w, h, ph, rev);
      }
    } else {
      if (river && typeof river === 'object') {
        const opts = river;
        river = Boolean(opts.river);
        phase = opts.phase !== undefined ? opts.phase : null;
      }
      channel = new PaintingWaterChannel(
        widthOrChannel,
        height,
        phase != null ? phase : this.r() * Math.PI * 2,
        river
      );
    }

    const width = channel.width;
    const chHeight = channel.height;
    const left = channel.left, right = channel.right;
    const c = [this.poly([...left, ...right.slice().reverse()], { fil: C.white, str: null })];
    for (const [bank, side] of [[left, -1.0], [right, 1.0]]) {
      const outer = bank.map((p, i) =>
        P(p.x + side * width * (0.008 + (i / 40) * 0.032), p.y + chHeight * 0.015)
      );
      c.push(this.poly([...bank, ...outer.reverse()], { fil: C.gray(0, 0.075), str: null }));
      let start = 0;
      while (start < 38) {
        const length = 4 + Math.trunc(this.r() * 5);
        c.push(...this.inkLine(
          bank.slice(start, Math.min(start + length, 40) + 1),
          0.95 + this.r() * 0.55,
          0.45 + this.r() * 0.14,
          0.42
        ));
        start += length + 2 + Math.trunc(this.r() * 3);
      }
    }
    // 远水无波: a few short, broken ripples gather near us.
    const rippleCount = 3 + Math.trunc(this.r() * 3);
    for (let k = 0; k < rippleCount; k++) {
      const t = 0.48 + this.r() * 0.46;
      const lane = -0.70 + this.r() * 0.85;
      const a = channel.point(t, lane);
      const b = channel.point(t, Math.min(0.85, lane + 0.25 + this.r() * 0.30));
      c.push(...this.inkLine(
        [a, P((a.x + b.x) / 2, a.y + Math.min(0.8, chHeight * 0.009)), b],
        0.75 + t * 0.4,
        0.35 + t * 0.12,
        0.40
      ));
    }
    if (!channel.broad) {
      for (const t of [0.42, 0.76]) {
        if (this.r() < 0.65) {
          const side = this.r() < 0.5 ? -1.0 : 1.0;
          const p = channel.point(t, side), size = Math.min(width * 0.045, chHeight * 0.10);
          const stone = [
            P(p.x - size, p.y),
            P(p.x - size * 0.5, p.y - size * 0.55),
            P(p.x + size * 0.6, p.y - size * 0.4),
            P(p.x + size, p.y)
          ];
          c.push(this.poly(stone, { fil: C.white, str: null }));
          c.push(...this.inkLine(stone, 0.9, 0.55, 0.5));
          c.push(...this.inkLine([P(p.x - size * 1.2, p.y + 1), P(p.x + size * 1.4, p.y + 1)], 0.55, 0.30));
        }
      }
    }
    return c;
  },

  paintingSurface(kind, width = 320, height = 140) {
    if (kind && typeof kind === 'object') {
      const opts = kind;
      kind = opts.kind || 'lake';
      width = opts.width !== undefined ? opts.width : 320;
      height = opts.height !== undefined ? opts.height : 140;
    } else if (width && typeof width === 'object') {
      const opts = width;
      width = opts.width !== undefined ? opts.width : 320;
      height = opts.height !== undefined ? opts.height : 140;
    }
    if (kind === 'sea') return this.paintingSea(width, height);
    const c = [];
    const rows = kind === 'sea' ? 12 : (kind === 'pond' ? 6 : 8);
    for (let row = 0; row < rows; row++) {
      const t = (row + 1) / (rows + 1);
      const y = height * (0.04 + 0.90 * Math.pow(t, 1.55)) + (this.r() - 0.5) * height * 0.03;
      const count = kind === 'sea' ? 3 : (this.r() < 0.25 + 0.75 * t ? (this.r() < t ? 2 : 1) : 0);
      for (let group = 0; group < count; group++) {
        const span = width * (0.10 + 0.24 * t) * (0.7 + this.r() * 0.55);
        const x = ((group + 0.12 + this.r() * 0.48) / count) * (width - span);
        const amplitude = kind === 'sea' ? height * (0.002 + 0.022 * t * t) : height * 0.003;
        const points = [];
        for (let i = 0; i <= 14; i++) {
          const u = i / 14;
          const lift = kind === 'sea' ? Math.sin(u * Math.PI * 2) + 0.35 * Math.sin(u * Math.PI * 4) : Math.sin(u * Math.PI);
          points.push(P(x + span * u, y + amplitude * lift));
        }
        if (kind === 'sea' ? row % 3 === 1 : (t > 0.6 && this.r() < 0.4)) {
          c.push(...this.inkLine(points, 2.5 + t * 3, 0.035 + t * 0.025, 0.45));
        }
        c.push(...this.inkLine(points, 0.55 + t * 0.55, 0.12 + t * (kind === 'sea' ? 0.26 : 0.15), 0.55));
        if (kind === 'sea' && row > 5) {
          c.push(...this.inkLine(
            points.slice(3, points.length - 2).map(p => P(p.x - span * 0.025, p.y + 2 + t * 3)),
            0.65,
            0.20,
            0.62
          ));
        }
      }
    }
    if (kind === 'sea') {
      for (const [a, b] of [[0.03, 0.32], [0.39, 0.68], [0.73, 0.97]]) {
        c.push(...this.inkLine([P(width * a, 0), P(width * b, 0.5)], 0.7, 0.18, 0.65));
      }
    }
    if (kind === 'river') {
      for (const side of [0.0, 0.74]) {
        c.push(...this.inkLine(
          this.inkCurve([
            P(width * side, height * 0.68),
            P(width * (side + 0.08), height * 0.64),
            P(width * (side + 0.20), height * 0.69)
          ]),
          1.0,
          0.20,
          0.65
        ));
      }
    }
    if (kind === 'pond') {
      for (const [x, y, radius] of [
        [width * 0.26, height * 0.44, width * 0.075],
        [width * 0.65, height * 0.76, width * 0.10]
      ]) {
        for (const [start, end] of [[0.10, 0.77], [1.14, 1.75]]) {
          const arc = [];
          for (let i = 0; i <= 16; i++) {
            const angle = (start + (end - start) * (i / 16)) * Math.PI;
            arc.push(P(x + radius * Math.cos(angle), y + radius * 0.16 * Math.sin(angle)));
          }
          c.push(...this.inkLine(arc, 0.7, 0.30, 0.5));
        }
      }
    }
    return c;
  },

  /// Groups of linked crests and turning currents, separated by untouched water.
  paintingSea(width, height) {
    if (width && typeof width === 'object') {
      height = width.height;
      width = width.width;
    }
    const c = [];
    for (let group = 0; group < 9; group++) {
      const t = group / 8;
      const position = 0.08 + this.r() * 0.56;
      const y = height * (0.10 + 0.76 * Math.pow(t, 1.4));
      const span = width * (0.18 + 0.25 * t) * (0.7 + this.r() * 0.4);
      const x = Math.min(width - span - 1, width * position);
      const rise = height * (0.012 + 0.065 * t);
      const turn = 0.32 + this.r() * 0.35;
      const echoCount = 2 + Math.trunc(t * 3);
      for (let echo = 0; echo < echoCount; echo++) {
        const offset = echo * Math.min(1.2 + t * 1.6, height * 0.018);
        const path = [];
        for (let i = 0; i <= 28; i++) {
          const u = i / 28;
          const crest = Math.exp(-Math.pow((u - turn) / 0.19, 2));
          const wake = Math.sin(u * Math.PI * 2.5) * 0.18;
          path.push(P(
            x + span * u - offset * 0.9,
            y - rise * (crest + wake) + offset * (0.3 + 0.7 * Math.sin(u * Math.PI))
          ));
        }
        c.push(...this.inkLine(
          path,
          echo === 0 ? 0.9 + t * 0.7 : 0.55,
          echo === 0 ? 0.20 + t * 0.24 : 0.14 + t * 0.12,
          0.57
        ));
      }
      if (t > 0.5) {
        const curl = this.inkCurve([
          P(x + span * turn, y - rise),
          P(x + span * turn - rise * 0.40, y - rise * 1.16),
          P(x + span * turn - rise * 0.65, y - rise * 0.62),
          P(x + span * turn - rise * 0.2, y - rise * 0.5)
        ]);
        c.push(...this.inkLine(curl, 0.65, 0.32, 0.5));
      }
    }
    return c;
  },

  paintingReflection(width, height) {
    if (width && typeof width === 'object') {
      height = width.height;
      width = width.width;
    }
    const c = [];
    const count = Math.max(3, Math.min(13, Math.trunc(height / 3)));
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      const span = width * (0.22 + 0.65 * t) * (0.6 + this.r() * 0.4);
      const x = width / 2 - span / 2 + (this.r() - 0.5) * width * 0.12;
      const y = height * t;
      c.push(...this.inkLine(
        [P(x, y), P(x + span * 0.45, y + 0.5), P(x + span, y - 0.3)],
        1.3 + this.r() * 1.7,
        0.10 * (1 - t * 0.65),
        0.5
      ));
    }
    return c;
  },

  paintingRiverRibbon() {
    const width = 340.0, height = 65.0;
    const phase = this.r() * 5, bend = 0.08 + this.r() * 0.14, opening = 18 + this.r() * 16;
    const middle = [];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      middle.push(P(width * t, height * (0.48 + bend * Math.sin(t * Math.PI * 1.5 + phase))));
    }
    const far = middle.map((p, i) => P(p.x, p.y - opening * 0.42 * Math.pow(1 - i / 40, 0.7)));
    const near = middle.map((p, i) => P(p.x, p.y + opening * 0.58 * Math.pow(1 - i / 40, 0.7)));
    const c = [this.poly([...far, ...near.slice().reverse()], { fil: C.white, str: null })];
    for (const [bank, side] of [[far, -1.0], [near, 1.0]]) {
      const outer = bank.map(p => P(p.x, p.y + side * 2));
      c.push(this.poly([...bank, ...outer.reverse()], { fil: C.gray(0, 0.055), str: null }));
      for (let start = 0; start < 36; start += 7) {
        c.push(...this.inkLine(bank.slice(start, start + 5), 0.8, 0.32, 0.6));
      }
    }
    for (let start = 2; start < 32; start += 5) {
      const p = middle[start], length = 12 + this.r() * 20;
      c.push(...this.inkLine([P(p.x, p.y - 1), P(p.x + length * 0.5, p.y), P(p.x + length, p.y - 0.3)], 0.65, 0.27, 0.6));
    }
    return c;
  },

  // =========================================================================
  // 4. ShanShuiPaintingWaterfall.swift
  // =========================================================================

  paintingWaterfall() {
    const form = Math.trunc(this.r() * 65536) % 3, tiers = form === 2 ? 2 : 1;
    const gap = form === 1 ? 24 + this.r() * 10 : 13 + this.r() * 7;
    const height = form === 1 ? 153.0 : (form === 2 ? 205.0 : 183.0);
    const bend = tiers === 2 ? 14 + this.r() * 12 : (this.r() - 0.5) * 9;
    const center = tiers === 2
      ? [P(58, 10), P(57, height * 0.40), P(58 + bend, height * 0.51), P(59 + bend, height)]
      : [P(58, 10), P(59 + bend, height)];
    const left = center.map(p => P.sub(p, P(gap / 2, 0)));
    const right = center.map(p => P.add(p, P(gap / 2, 0)));
    const c = [];
    for (const side of [-1.0, 1.0]) {
      const edge = side < 0 ? left : right;
      const first = edge[0], last = edge[edge.length - 1];
      const outer = [
        P(first.x + side * (26 + this.r() * 10), side < 0 ? 5 : 18),
        P(first.x + side * (39 + this.r() * 12), height * 0.34),
        P(last.x + side * 30, height * 0.71),
        P(last.x + side * 37, height + 9)
      ];
      c.push(this.poly([...edge, ...outer.slice().reverse()], { fil: C.white, str: null }));
      for (let j = 0; j < edge.length - 1; j++) {
        const a = edge[j], b = edge[j + 1];
        c.push(this.poly(
          [a, b, P.add(b, P(side * 12, 0)), P.add(a, P(side * 18, 7))],
          { fil: C.gray(0, 0.14 + this.r() * 0.08), str: null }
        ));
        c.push(...this.inkLine(
          [P.add(a, P(side * 2, 3)), P.add(P.mul(P.add(a, b), 0.5), P(side * 5, 0)), P.add(b, P(side * 9, -4))],
          7 + this.r() * 5,
          0.84,
          0.48,
          'cone'
        ));
      }
      for (let j = 0; j < 3; j++) {
        const t = 0.10 + j * 0.27;
        const p = P.add(P.add(first, P.mul(P.sub(last, first), t)), P(side * (13 + this.r() * 8), 0));
        const reach = height * (0.16 + this.r() * 0.12);
        c.push(...this.inkLine(
          [p, P.add(p, P(side * 8, reach * 0.45)), P.add(p, P(side * 16, reach))],
          3 + this.r() * 3,
          0.56,
          0.63,
          'cone'
        ));
        c.push(...this.inkLine(
          [P.add(p, P(side * 5, 3)), P.add(p, P(side * 16, reach * 0.75))],
          0.9,
          0.50,
          0.6
        ));
      }
      c.push(...this.inkEdges(outer, 1.6, 0.64, 0.42));
      c.push(...this.inkEdges(edge, 1.4, 0.75, 0.35));
      c.push(...this.inkEdges([outer[0], P(first.x + side * 12, outer[0].y - 2), first], 1.8, 0.72, 0.4));
    }
    // No grey strip in the fall: a few dilute vertical streaks on paper.
    const water = [...left, ...right.slice().reverse()];
    c.push(this.poly(water, { fil: C.white, str: null }));
    for (const offset of [-gap * 0.26, gap * 0.18]) {
      const line = center.map(p => P.add(p, P(offset, 0)));
      c.push(...this.inkLine(this.inkCurve(line), 0.65, 0.16, 0.50));
    }
    if (tiers === 2) {
      c.push(...this.inkLine(
        [P.add(left[1], P(-2, 6)), P.add(center[2], P(0, -3)), P.add(right[2], P(4, -2))],
        1.0,
        0.35,
        0.55
      ));
    }
    const foot = center[center.length - 1];
    // Spray opens the cliff foot: soft paper blotches.
    for (let k = 0; k < 8; k++) {
      const x = foot.x + (this.r() - 0.5) * 43, y = height - 1 + this.r() * 13;
      const blots = this.inkBlot(x, y, 7 + this.r() * 6, 0.45, 0, 0.04).map(p => {
        const q = clonePoly(p);
        q.fil = C(255, 255, 255, 0.65);
        return q;
      });
      c.push(...blots);
    }
    const outlet = P(foot.x + 19, height + 50);
    const l = this.inkCurve([P.add(foot, P(-14, 9)), P.add(foot, P(-21, 24)), P.add(outlet, P(-10, 0))]);
    const rr = this.inkCurve([P.add(foot, P(17, 9)), P.add(foot, P(9, 29)), P.add(outlet, P(11, 0))]);
    for (const edge of [l, rr]) {
      c.push(...this.inkLine(edge, 1.1, 0.48, 0.45));
    }
    for (const [dx, dy] of [[-10.0, 18.0], [4, 24], [9, 39]]) {
      c.push(...this.inkLine([P.add(foot, P(dx, dy)), P.add(foot, P(dx + 8, dy - 0.3))], 0.65, 0.24, 0.45));
    }
    return { canvas: c, outlet };
  },

  // =========================================================================
  // 5. ShanShuiPaintingDetails.swift
  // =========================================================================

  /// Straight joinery: vertical mullions, square lattice, or ice-crack tracery.
  paintingWindow(embedded = false) {
    if (embedded && typeof embedded === 'object') {
      embedded = Boolean(embedded.embedded);
    }
    const form = Math.trunc(this.r() * 4096) % 3;
    const w = [44.0, 56, 62][form], h = 52.0;
    const frame = [P(0, 0), P(w, 0), P(w, h), P(0, h), P(0, 0)];
    const c = [
      this.poly(frame, { fil: C.white, str: null }),
      this.poly(frame, { fil: C.gray(0, embedded ? 0.045 : 0.065), str: null })
    ];
    c.push(...this.inkEdges(frame, 1.8, 0.72, 0.30));
    c.push(...this.inkEdges([P(3, 3), P(w - 3, 3), P(w - 3, h - 3), P(3, h - 3), P(3, 3)], 0.7, 0.48, 0.35));
    if (form < 2) {
      const spacing = form === 0 ? 8.0 : 12.0;
      for (let x = 10.0; x < w - 5; x += spacing) {
        c.push(...this.inkLine([P(x, 4), P(x, h - 4)], 0.8, 0.61, 0.3));
      }
      for (const y of (form === 0 ? [37.0] : [16.0, 28, 40])) {
        c.push(...this.inkLine([P(4, y), P(w - 4, y)], 0.8, 0.56, 0.3));
      }
    } else {
      const a = P(19, 17), b = P(41, 13), d = P(35, 34), e = P(15, 37);
      for (const line of [
        [P(4, 9), a, b, P(48, 4)],
        [P(4, 28), a, e, P(10, 48)],
        [a, d, b, P(58, 24)],
        [e, d, P(49, 48)],
        [d, P(58, 39)]
      ]) {
        c.push(...this.inkEdges(line, 0.85, 0.58, 0.32));
      }
    }
    c.push(...this.inkLine([P(-2, h + 2), P(w + 2, h + 2)], 1.6, 0.66, 0.33));
    return c;
  },

  /// Bamboo blind: horizontal slats bound by two tapes, with a rolled lower edge.
  paintingCurtain(width = 54, height = 77) {
    if (width && typeof width === 'object') {
      const opts = width;
      width = opts.width !== undefined ? opts.width : 54;
      height = opts.height !== undefined ? opts.height : 77;
    }
    const form = Math.trunc(this.r() * 4096) % 5;
    const w = 54.0, drop = [15.0, 28, 41, 54, 67][form];
    const blind = [P(0, 0), P(w, 0), P(w, drop), P(0, drop)];
    const c = [this.poly(blind, { fil: C.white, str: null })];
    for (let y = 3.0; y <= drop - 1; y += 3) {
      c.push(...this.inkLine([P(1, y), P(w - 1, y)], 0.7, 0.34 + this.r() * 0.12, 0.43));
    }
    for (const x of [13.0, 41]) {
      c.push(...this.inkLine([P(x, 0), P(x, drop)], 1.1, 0.53, 0.32));
    }
    c.push(...this.inkEdges([P(0, drop), P(0, 0), P(w, 0), P(w, drop)], 0.9, 0.55, 0.35));
    const roll = [P(0, drop), P(w, drop), P(w, drop + 4), P(0, drop + 4), P(0, drop)];
    c.push(...this.inkEdges(roll, 1.4, 0.65, 0.3));
    c.push(...this.inkLine([P(-3, -2), P(w + 3, -2)], 2, 0.73));
    c.push(...this.inkLine([P(w - 6, 1), P(w - 6, 75)], 0.55, 0.48, 0.4));
    c.push(...this.inkLine([P(w - 8, 75), P(w - 4, 75)], 1.1, 0.6));
    const sx = width / 54, sy = height / 77, sw = Math.min(sx, sy);
    return c.map(p => {
      const q = clonePoly(p);
      q.p = p.p.map(pt => P(pt.x * sx, pt.y * sy));
      q.wid *= sw;
      return q;
    });
  },

  /// Paddy fields as the farmer sees them across the slope: curved bund lines (田埂).
  paintingFields() {
    const c = [];
    const rows = 5;
    const phase = this.r() * 3;
    for (let k = 0; k < rows; k++) {
      const t = k / (rows - 1);
      const y = 14 + 86 * Math.pow(t, 1.3);
      const bow = 4 + 8 * t;
      const bund = [];
      for (let i = 0; i <= 24; i++) {
        const u = i / 24;
        bund.push(P(10 + 150 * u, y + bow * Math.sin(u * Math.PI + phase * 0.2) - 6 * u + 2 * this.n(u * 4, k)));
      }
      c.push(...this.inkLine(bund, 0.6 + t * 0.7, 0.20 + t * 0.15, 0.5));
      const seedlings = 4 + Math.trunc(t * 10);
      for (let s = 0; s < seedlings; s++) {
        const i = 1 + Math.trunc(this.r() * 22), p = bund[i];
        const dy = 3 + this.r() * (6 + 10 * t);
        c.push(...this.inkLine([P(p.x, p.y + dy), P(p.x - 0.4, p.y + dy - 1.5 - 2 * t)], 0.45 + 0.3 * t, 0.18 + 0.12 * t, 0.5));
      }
    }
    return c;
  },

  /// Long sand crests: paper on the windward face, a dry veil below the lee edge.
  paintingDunes(far = false) {
    if (far && typeof far === 'object') {
      far = Boolean(far.far);
    }
    const c = [];
    const count = far ? 2 + Math.trunc(this.r() * 2) : 2 + Math.trunc(this.r() * 65536) % 3;
    for (let k = 0; k < count; k++) {
      const depth = k / Math.max(1, count - 1);
      const x0 = -20 - depth * 18 + this.r() * 22, span = 300 + this.r() * 75;
      const base = (far ? 8.0 : 22.0) + k * (far ? 7 : 29);
      const rise = far ? 5 + this.r() * 5 : 17 + this.r() * 18;
      const bias = 0.28 + this.r() * 0.40;
      const crest = this.inkCurve([
        P(x0, base + rise * 0.30),
        P(x0 + span * bias, base - rise),
        P(x0 + span * (bias + (1 - bias) * 0.5), base - rise * 0.32),
        P(x0 + span, base + rise * 0.12)
      ], 20);
      if (far) {
        c.push(...this.inkLine(crest, 0.65, 0.18 + depth * 0.04, 0.48));
        continue;
      }
      const edge = (t) => crest.map((p, i) => {
        const u = i / (crest.length - 1);
        return P.add(p, P(-rise * 0.25 * t, rise * 0.90 * t * Math.pow(Math.sin(u * Math.PI), 0.5)));
      });
      for (let band = 0; band < 14; band++) {
        const t = band / 14;
        c.push(this.poly([...edge(t), ...edge((band + 1) / 14).reverse()], {
          fil: C.gray(0, (0.06 + depth * 0.025) * Math.pow(1 - t, 1.8)),
          str: null
        }));
      }
      c.push(...this.inkLine(crest, 0.8 + depth * 0.35, 0.25 + depth * 0.13, 0.38));
      const sweeps = 4 + Math.trunc(this.r() * 4);
      for (let s = 0; s < sweeps; s++) {
        const start = 8 + Math.trunc(this.r() * 27);
        const length = 9 + Math.trunc(this.r() * 12);
        const offset = 3 + this.r() * rise * 0.35;
        const sweep = crest.slice(start, Math.min(crest.length, start + length)).map(p => P.add(p, P(-offset * 0.7, offset)));
        c.push(...this.inkLine(sweep, 3 + this.r() * 5, 0.14 + depth * 0.08, 0.78));
      }
    }
    return c;
  },

  paintingSmoke(beacon = false) {
    if (beacon && typeof beacon === 'object') {
      beacon = Boolean(beacon.beacon);
    }
    const c = [];
    if (beacon) {
      const segments = 8;
      for (let k = 0; k < segments; k++) {
        const t0 = k / segments, t1 = (k + 1) / segments;
        const y0 = 130 - t0 * 130, y1 = 130 - t1 * 130;
        const w0 = 1.6 + 2.6 * t0, w1 = 1.6 + 2.6 * t1;
        const sway = Math.sin(t1 * 2.5) * 0.5;
        c.push(this.poly([P(30 - w0, y0), P(30 + sway - w1, y1), P(30 + sway + w1, y1), P(30 + w0, y0)], {
          fil: C.gray(0, 0.058 * (1 - t0 * 0.94)),
          str: null
        }));
      }
      c.push(...this.inkLine([P(30, 130), P(30, 70), P(30.4, 40)], 0.45, 0.09, 0.75));
      return c;
    }
    for (let k = 0; k < 4; k++) {
      const line = [];
      for (let i = 0; i <= 24; i++) {
        const t = i / 24;
        line.push(P(30 + Math.sin(t * 5.5 + k * 0.4) * (3 + 10 * t) + k * 1.2, 130 - t * 130));
      }
      c.push(...this.inkLine(line, 1.6 + k * 0.8, 0.05, 0.4, 'rise'));
    }
    return c;
  },

  /// A clump of reeds leaning one way in the wind.
  paintingReeds() {
    const c = [];
    const wind = this.r() < 0.5 ? -1.0 : 1.0;
    const stems = 9 + Math.trunc(this.r() * 6);
    for (let k = 0; k < stems; k++) {
      const root = P(30 + (this.r() - 0.5) * 34 + k * 1.5, 112 + this.r() * 4);
      const height = 55 + this.r() * 50;
      const bend = wind * (8 + this.r() * 18) * height / 100;
      const tip = P(root.x + bend, root.y - height);
      const stem = this.inkCurve([root, P(root.x + bend * 0.25, root.y - height * 0.5), tip]);
      c.push(...this.inkLine(stem, 0.7 + this.r() * 0.5, 0.42 + this.r() * 0.25, 0.35));
      const leafCount = 1 + Math.trunc(this.r() * 2);
      for (let l = 0; l < leafCount; l++) {
        const t = 0.25 + this.r() * 0.45;
        const i = Math.min(stem.length - 1, Math.trunc(t * (stem.length - 1)));
        const base = stem[i], length = 18 + this.r() * 22;
        const leaf = this.inkCurve([
          base,
          P(base.x + wind * length * 0.5, base.y - length * 0.35),
          P(base.x + wind * length, base.y - length * 0.05 + this.r() * 8)
        ]);
        c.push(...this.inkLine(leaf, 1.8 + this.r() * 1.4, 0.40 + this.r() * 0.3, 0.2, 'lens'));
      }
      if (this.r() < 0.75) {
        c.push(...this.inkBlot(
          tip.x + wind * 2.5,
          tip.y + 3,
          3 + this.r() * 2,
          0.35,
          wind * 1.1,
          0.16 + this.r() * 0.12
        ));
      }
    }
    return c;
  },

  paintingLongRiver() {
    return this.paintingRiverRibbon();
  },

  paintingBeacon() {
    const top = [P(18, 8), P(45, 8), P(51, 13), P(13, 13)];
    const front = [P(13, 13), P(51, 13), P(59, 44), P(5, 44)];
    const c = [
      this.poly(front, { fil: C.white, str: null }),
      this.poly(top, { fil: C.white, str: null })
    ];
    c.push(...this.inkLine([...top, top[0]], 1.3, 0.70, 0.45));
    c.push(...this.inkLine([P(13, 13), P(5, 44), P(59, 44), P(51, 13)], 1.5, 0.62, 0.5));
    for (const y of [21.0, 29, 37]) {
      c.push(...this.inkLine([P(16, y), P(40 + this.r() * 8, y + 1)], 2.2, 0.22, 0.8));
    }
    c.push(...this.inkLine([P(46, 15), P(52, 41)], 4, 0.38, 0.7));
    c.push(...this.inkLine([P(0, 45), P(30, 46), P(65, 45)], 0.9, 0.35, 0.6));
    return c;
  },

  // =========================================================================
  // 6. ShanShuiPaintingMasonry.swift
  // =========================================================================

  paintingRuins() {
    const count = 2 + Math.trunc(this.r() * 65536) % 3;
    const c = [];
    let x = 0.0;
    for (let k = 0; k < count; k++) {
      const width = 39 + this.r() * 27, height = k === 0 ? 48 + this.r() * 18 : 20 + this.r() * 34;
      const top = 75 - height, peak = 0.17 + this.r() * 0.17;
      let crest = [
        P(x, top + 3 + this.r() * 5),
        P(x + width * 0.12, top + this.r() * 3),
        P(x + width * 0.23, top + 3 + this.r() * 2),
        P(x + width * 0.29, top + this.r() * 2),
        P(x + width * (0.40 + this.r() * 0.12), top + 2 + this.r() * 4),
        P(x + width * 0.60, top + height * (0.28 + this.r() * 0.12)),
        P(x + width * 0.67, top + height * 0.26),
        P(x + width * 0.75, top + height * (0.52 + this.r() * 0.10)),
        P(x + width * 0.86, top + height * 0.68),
        P(x + width, top + height * (0.72 + this.r() * 0.12))
      ];
      if (this.r() < 0.5) {
        crest = crest.slice().reverse().map(p => P(x + width - (p.x - x), p.y));
      }
      const head = (px) => {
        for (let i = 0; i < crest.length - 1; i++) {
          const a = crest[i], b = crest[i + 1];
          if (px >= a.x && px <= b.x) {
            return a.y + (b.y - a.y) * (px - a.x) / Math.max(0.01, b.x - a.x);
          }
        }
        return 75;
      };
      c.push(this.poly([...crest, P(x + width, 75), P(x, 75)], { fil: C.white, str: null }));
      const back = crest.map(p => P.add(p, P(3, -2)));
      c.push(this.poly([...crest, ...back.reverse()], { fil: C.gray(0, 0.10), str: null }));
      c.push(...this.inkEdges(crest, 1.6, 0.68, 0.45));
      c.push(...this.inkLine([crest[0], P(x, 75)], 1.2, 0.60, 0.5));
      c.push(...this.inkLine([crest[crest.length - 1], P(x + width, 75)], 1.1, 0.57, 0.5));
      // Mortar ends at the broken profile.
      const maxRow = Math.trunc(height / 6);
      for (let row = 1; row < maxRow; row++) {
        const y = 75 - row * 6;
        const inside = [];
        for (let px = x + 2; px <= x + width - 2; px += 2) {
          if (head(px) < y - 1) inside.push(px);
        }
        if (inside.length > 0) {
          const l = inside[0], rr = inside[inside.length - 1];
          if (rr - l > 6) {
            const start = l + this.r() * (rr - l) * 0.2;
            const end = rr - this.r() * (rr - l) * 0.2;
            c.push(...this.inkLine([P(start, y), P(end, y + 0.3)], 0.65, 0.33, 0.5));
            for (let joint = l + (row % 2 === 0 ? 4 : 10); joint < rr - 2; joint += 14) {
              c.push(...this.inkLine([P(joint, y), P(joint, Math.min(74, y + 5.5))], 0.6, 0.30, 0.5));
            }
          }
        }
      }
      for (const u of [peak, 0.72]) {
        const root = P(x + width * u, head(x + width * u));
        for (let j = 0; j < 4; j++) {
          const dx = j * 4 - 6;
          c.push(...this.inkLine(
            this.inkCurve([root, P.add(root, P(dx * 0.3, -4)), P.add(root, P(dx, -7 - this.r() * 6))]),
            0.8,
            0.64,
            0.4,
            'cone'
          ));
        }
      }
      const rubble = 2 + (k % 2);
      for (let r = 0; r < rubble; r++) {
        const p = P(x + width + 2 + this.r() * 9, 73 + this.r() * 4);
        c.push(...this.inkEdges(
          [P.add(p, P(-4, 0)), P.add(p, P(-3, -3)), P.add(p, P(3, -2)), P.add(p, P(5, 1))],
          0.7,
          0.47,
          0.5
        ));
      }
      c.push(...this.inkLine([P(x - 2, 77), P(x + width * 0.7, 77)], 0.8, 0.3, 0.6));
      x += width + 10 + this.r() * 15;
    }
    return c;
  },

  paintingCityGate() {
    const form = Math.trunc(this.r() * 65536) % 3;
    const w = [150.0, 187, 226][form], center = w / 2;
    const doubleEave = form !== 0, foot = 112.0, towerW = form === 2 ? 100.0 : 83.0;
    const c = [];
    const tower = [
      P(center - towerW / 2, 32), P(center + towerW / 2, 32),
      P(center + towerW / 2, 64), P(center - towerW / 2, 64)
    ];
    c.push(this.poly(tower, { fil: C.white, str: null }));
    for (const fraction of [-0.5, -0.25, 0, 0.25, 0.5]) {
      const x = center + towerW * fraction;
      c.push(...this.inkLine([P(x, 32), P(x, 64)], 1.4, 0.72, 0.3));
    }
    c.push(...this.inkLine([P(center - towerW / 2, 55), P(center + towerW / 2, 55)], 1.3, 0.6));
    c.push(...this.paintingHipGableRoof(towerW + 25, 29).map(p => {
      const q = clonePoly(p);
      q.p = p.p.map(pt => P(pt.x + center - (towerW + 25) / 2, pt.y + 3));
      return q;
    }));
    if (doubleEave) {
      const upperW = towerW * 0.67;
      const upper = [
        P(center - upperW / 2, 4), P(center + upperW / 2, 4),
        P(center + upperW / 2, 20), P(center - upperW / 2, 20)
      ];
      c.push(this.poly(upper, { fil: C.white, str: null }));
      c.push(...this.inkEdges([...upper, upper[0]], 1, 0.59));
      for (const x of [center - upperW / 4, center, center + upperW / 4]) {
        c.push(...this.inkLine([P(x, 6), P(x, 18)], 1.5, 0.64));
      }
      c.push(...this.paintingHipGableRoof(upperW + 23, 23).map(p => {
        const q = clonePoly(p);
        q.p = p.p.map(pt => P(pt.x + center - (upperW + 23) / 2, pt.y - 20));
        return q;
      }));
    }
    // Flat-topped merlons with gaps.
    const top = [P(0, 68)];
    const merlons = Math.trunc(w / 16), unit = w / merlons;
    for (let k = 0; k < merlons; k++) {
      const x = k * unit;
      top.push(P(x, 62), P(x + unit * 0.56, 62), P(x + unit * 0.56, 68), P(x + unit, 68));
    }
    const wall = [...top, P(w + 3, foot), P(-3, foot)];
    c.push(this.poly(wall, { fil: C.white, str: null }));
    c.push(...this.inkEdges(top, 1.2, 0.66, 0.35));
    c.push(...this.inkEdges([P(0, 68), P(-3, foot), P(w + 3, foot), P(w, 68)], 1.2, 0.58, 0.4));
    c.push(...this.paintingArchDoor(center - 15, foot, 30, 36, 0.45));
    for (const side of [-1.0, 1.0]) {
      for (let k = 0; k < 4; k++) {
        const y = 78 + k * 8;
        const x = center + side * (27 + this.r() * 13);
        c.push(...this.inkLine([P(x, y), P(x + side * (18 + this.r() * 20), y)], 0.65, 0.28, 0.5));
        c.push(...this.inkLine([P(x, y), P(x, y + 5)], 0.6, 0.26, 0.5));
      }
    }
    return c;
  },

  // =========================================================================
  // 7. ShanShuiPaintingDwellings.swift
  // =========================================================================

  /// 瓦屋: one to three bays, a visible gable and a short return wall.
  paintingHouse(reservingWindow = false, maxBays = 3) {
    if (reservingWindow && typeof reservingWindow === 'object') {
      const opts = reservingWindow;
      reservingWindow = Boolean(opts.reservingWindow);
      maxBays = opts.maxBays !== undefined ? opts.maxBays : 3;
    }
    const bays = Math.max(reservingWindow ? 2 : 1, Math.min(maxBays, 1 + Math.trunc(this.r() * 65536) % 3));
    const w = 38.0 * bays + 10, d = 21 + this.r() * 12;
    const eave = 33.0, foot = 70 + this.r() * 5, rise = 10.0;
    const front = [P(0, eave), P(w, eave), P(w, foot), P(0, foot)];
    const side = [P(w, eave), P(w + d, eave - rise), P(w + d, foot - rise), P(w, foot)];
    const c = [
      this.poly(side, { fil: C.white, str: null }),
      this.poly(front, { fil: C.white, str: null }),
      this.poly(side, { fil: C.gray(0, 0.055), str: null })
    ];
    c.push(...this.inkEdges([P(0, eave), P(0, foot), P(w, foot), P(w + d, foot - rise), P(w + d, eave - rise)], 1.1, 0.63, 0.32));
    c.push(...this.inkLine([P(w, eave), P(w, foot)], 1.2, 0.64, 0.3));
    const door = reservingWindow ? bays - 1 : Math.trunc(this.r() * bays) % bays;
    for (let k = 0; k < bays; k++) {
      if (reservingWindow && k === 0) continue;
      const x = 5 + k * 38;
      if (k === door) {
        const open = this.r() < 0.65;
        const opening = [P(x + 6, 43), P(x + 26, 43), P(x + 26, foot), P(x + 6, foot)];
        c.push(this.poly(opening, { fil: C.gray(0, open ? 0.44 : 0.045), str: null }));
        c.push(...this.inkEdges([...opening, opening[0]], 0.85, 0.63, 0.3));
        if (!open) {
          c.push(...this.inkLine([P(x + 16, 44), P(x + 16, foot)], 0.8, 0.7));
        }
      } else {
        const frame = [P(x + 7, 44), P(x + 26, 44), P(x + 26, 59), P(x + 7, 59), P(x + 7, 44)];
        c.push(...this.inkEdges(frame, 1.0, 0.63, 0.3));
        for (const dx of [12.0, 17, 22]) {
          c.push(...this.inkLine([P(x + dx, 45), P(x + dx, 58)], 0.6, 0.49, 0.35));
        }
      }
    }
    if (this.r() < 0.65) {
      c.push(...this.inkEdges([P(w + 7, 44), P(w + d - 6, 39), P(w + d - 6, 51), P(w + 7, 56), P(w + 7, 44)], 0.8, 0.52, 0.35));
    }
    const ridgeL = P(d * 0.55, 4), ridgeR = P(w + d * 0.55, 4);
    const roof = [ridgeL, ridgeR, P(w + 7, eave + 1), P(-9, eave + 1)];
    const gable = [ridgeR, P(w + d + 7, eave - rise), P(w + 7, eave + 1)];
    c.push(
      this.poly(gable, { fil: C.white, str: null }),
      this.poly(roof, { fil: C.white, str: null }),
      this.poly(roof, { fil: C.gray(0, 0.065), str: null })
    );
    c.push(...this.inkLine([P(ridgeL.x - 3, 1), ridgeL, ridgeR, P(ridgeR.x + 3, 1)], 1.7, 0.78, 0.3));
    c.push(...this.inkLine([ridgeL, P(-9, eave + 1)], 1.1, 0.64));
    c.push(...this.inkEdges([ridgeR, P(w + d + 7, eave - rise), P(w + 7, eave + 1), ridgeR], 1.1, 0.7));
    c.push(...this.inkLine([P(-12, eave - 1), P(-6, eave + 2), P(w + 7, eave + 2), P(w + d + 9, eave - rise - 1)], 2.1, 0.85, 0.28));
    const tiles = 9 + bays * 4;
    for (let k = 1; k < tiles; k++) {
      const t = k / tiles;
      c.push(...this.inkLine([P(ridgeL.x + w * t, 6), P(-8 + (w + 15) * t, eave)], 0.55, 0.40, 0.48));
    }
    c.push(...this.inkEdges([P(-3, foot + 3), P(w + 3, foot + 3), P(w + d + 3, foot - rise + 2)], 1.2, 0.55, 0.45));
    return c;
  },

  /// 茅舍: a single low earthen room, an open grass shelter, or a lean-to porch.
  paintingHut() {
    const form = Math.trunc(this.r() * 65536) % 3;
    const w = form === 2 ? 104.0 : 78.0;
    const roofY = form === 1 ? 30.0 : 39.0, foot = 72.0;
    const peakL = P(24, form === 2 ? 12 : 3), peakR = P(w - 27, 5);
    const roof = [peakL, peakR, P(w + 9, roofY + 1), P(-7, roofY + 2)];
    const c = [];
    if (form !== 1) {
      const end = form === 2 ? w * 0.61 : w - 7;
      const wall = [P(8, roofY), P(end, roofY), P(end, foot), P(8, foot)];
      c.push(this.poly(wall, { fil: C.white, str: null }));
      c.push(...this.inkEdges([P(8, roofY), P(8, foot), P(end, foot), P(end, roofY)], 1.2, 0.58, 0.45));
      const x = form === 2 ? 27.0 : 40.0;
      c.push(this.poly([P(x, roofY + 8), P(x + 17, roofY + 8), P(x + 17, foot), P(x, foot)], { fil: C.gray(0, 0.45), str: null }));
      if (form === 0) {
        c.push(...this.inkEdges([P(17, 48), P(29, 48), P(29, 58), P(17, 58), P(17, 48)], 1, 0.53));
      }
    }
    for (const x of (form === 1 ? [9.0, 28, w - 25, w - 7] : [w - 5])) {
      c.push(...this.inkLine([P(x, roofY - 1), P(x + 0.6, foot)], 1.5, 0.7, 0.35));
    }
    if (form === 1) {
      c.push(...this.inkLine([P(10, 60), P(29, 60)], 1.6, 0.65));
      c.push(...this.inkLine([P(w - 26, 60), P(w - 7, 60)], 1.6, 0.65));
    }
    c.push(
      this.poly(roof, { fil: C.white, str: null }),
      this.poly(roof, { fil: C.gray(0, 0.06), str: null })
    );
    c.push(...this.inkEdges([P(-7, roofY + 1), peakL, peakR, P(w + 9, roofY)], 1.5, 0.64, 0.5));
    c.push(...this.inkLine([P(-8, roofY + 2), P(w * 0.38, roofY + 4), P(w + 9, roofY + 1)], 2.5, 0.67, 0.52));
    for (let k = 0; k < 29; k++) {
      const t = k / 28;
      const x = -9 + (w + 20) * t;
      const top = P.add(peakL, P.mul(P.sub(peakR, peakL), t));
      const end = P(x, roofY + 2 + this.r() * 5);
      c.push(...this.inkLine(
        [P.add(top, P(0, this.r() * 6)), P.add(P.mul(P.add(top, end), 0.5), P(1, 0)), end],
        0.7 + this.r() * 0.6,
        0.33 + this.r() * 0.22,
        0.58
      ));
    }
    for (const x of [3.0, w * 0.4, w - 9]) {
      c.push(...this.inkLine([P(x, foot + 1), P(x + 12, foot + 1)], 0.9, 0.35, 0.55));
    }
    return c;
  },

  // =========================================================================
  // 8. ShanShuiPaintingArchitecture.swift
  // =========================================================================

  /// Four/six-sided pointed roofs and a small hip-and-gable pavilion.
  paintingPavilion() {
    const form = Math.trunc(this.r() * 65536) % 3;
    const span = form === 1 ? 72.0 : 64.0, mid = span / 2;
    const top = 33.0, foot = 83.0;
    const columns = form === 1 ? [0.0, 13, 27, span - 27, span - 13, span] : [0.0, 17, span - 17, span];
    const c = [];
    for (let i = 0; i < columns.length; i++) {
      const x = columns[i];
      const back = i > 0 && i < columns.length - 1;
      c.push(...this.inkLine([P(x, top), P(x, back ? foot - 5 : foot)], back ? 1.4 : 2.2, back ? 0.55 : 0.8, 0.3));
    }
    for (const [a, b] of [[0.0, 17.0], [span - 17, span]]) {
      c.push(...this.inkEdges([P(a, 69), P(b, 66), P(b, 77)], 1.1, 0.66, 0.32));
      c.push(...this.inkLine([P(a, 77), P(b, 74)], 1.4, 0.7));
    }
    if (form === 2) {
      c.push(...this.paintingHipGableRoof(span + 26, 24).map(p => {
        const q = clonePoly(p);
        q.p = p.p.map(pt => P(pt.x - 13, pt.y + 8));
        return q;
      }));
    } else {
      const apex = P(mid, 6), left = P(-13, 31), right = P(span + 13, 31);
      const front = P(mid, 34);
      const outline = [left, P(mid - 20, 23), apex, P(mid + 20, 23), right, front, left];
      c.push(this.poly(outline, { fil: C.white, str: null }));
      c.push(this.poly([apex, right, front], { fil: C.gray(0, 0.075), str: null }));
      c.push(...this.inkLine(this.inkCurve(outline.slice(0, 5)), 1.5, 0.72, 0.32));
      c.push(...this.inkEdges([left, front, right], 2.2, 0.84, 0.3));
      c.push(...this.inkLine([apex, P(mid, 22), front], 1.2, 0.6, 0.35));
      if (form === 1) {
        for (const x of [mid - 24, mid + 24]) {
          c.push(...this.inkLine([apex, P(mid + (x - mid) * 0.55, 23), P(x, 33)], 0.7, 0.44));
        }
      }
      c.push(...this.inkLine([P(mid, 4), P(mid, 6)], 1.5, 0.8));
    }
    c.push(...this.inkEdges([P(-6, foot + 1), P(span + 6, foot + 1), P(span + 10, foot + 5), P(-10, foot + 5)], 1.2, 0.63, 0.4));
    return c;
  },

  /// 歇山: a short ridge, exposed triangular gable, and the lower hipped skirt continuing around it.
  paintingHipGableRoof(w, h) {
    if (w && typeof w === 'object') {
      h = w.height;
      w = w.width;
    }
    const a = P(w * 0.23, 2), b = P(w * 0.70, 2);
    const left = P(0, h - 3), frontR = P(w * 0.81, h + 2), backR = P(w, h - 7);
    const gableL = P(w * 0.60, h * 0.52), gableR = P(w * 0.81, h * 0.48);
    const front = [a, b, gableL, frontR, left];
    const side = [b, gableR, backR, frontR, gableL];
    const c = [
      this.poly(front, { fil: C.white, str: null }),
      this.poly(side, { fil: C.white, str: null }),
      this.poly(front, { fil: C.gray(0, 0.07), str: null }),
      this.poly(side, { fil: C.gray(0, 0.11), str: null }),
      this.poly([b, gableR, gableL], { fil: C.white, str: null })
    ];
    c.push(...this.inkEdges([gableL, b, gableR, gableL], 1.1, 0.67, 0.3));
    c.push(...this.inkLine([P(a.x - 3, 0), a, b, P(b.x + 3, 0)], 1.8, 0.8, 0.28));
    c.push(...this.inkLine([a, P(w * 0.14, h * 0.64), left], 1.2, 0.66));
    c.push(...this.inkLine([gableR, P(w * 0.90, h * 0.78), backR], 1.2, 0.65));
    c.push(...this.inkLine([P(-3, h - 6), left, P(w * 0.43, h + 3), frontR], 2.4, 0.85, 0.28));
    c.push(...this.inkLine([frontR, P(w * 0.92, h - 2), P(w + 3, h - 10)], 2.1, 0.8, 0.3));
    c.push(...this.inkLine([gableL, frontR], 1, 0.6));
    for (let k = 1; k < 12; k++) {
      const t = k / 12;
      const start = P.add(a, P.mul(P.sub(b, a), t));
      const end = P.add(left, P.mul(P.sub(frontR, left), t));
      c.push(...this.inkLine([P.add(start, P(0, 3)), P.sub(end, P(0, 2))], 0.55, 0.38, 0.5));
    }
    return c;
  },

  /// Round-headed masonry opening. Its feet remain at the same ground level as the wall.
  paintingArchDoor(x, foot, width, height, tone = 0.48) {
    if (x && typeof x === 'object') {
      const opts = x;
      x = opts.x;
      foot = opts.foot;
      width = opts.width;
      height = opts.height;
      tone = opts.tone !== undefined ? opts.tone : 0.48;
    }
    const radius = width / 2, spring = foot - height + radius;
    const arc = [];
    for (let i = 0; i <= 16; i++) {
      const a = Math.PI + (i / 16) * Math.PI;
      arc.push(P(x + radius + Math.cos(a) * radius, spring + Math.sin(a) * radius));
    }
    const edge = [P(x, foot), ...arc, P(x + width, foot)];
    const c = [this.poly(edge, { fil: C.gray(0, tone), str: null })];
    c.push(...this.inkLine(edge, 1.2, 0.70, 0.3));
    return c;
  },

  paintingTempleGate() {
    const doors = this.r() < 0.48 ? 1 : 3;
    const wallSpan = 16 + (Math.trunc(this.r() * 65536) % 3) * 13;
    const bodyW = doors === 1 ? 64.0 : 118.0, h = 80.0;
    const c = [];
    for (const [l, rr] of [[-wallSpan, 4.0], [bodyW - 4, bodyW + wallSpan]]) {
      const wall = [P(l, 55), P(rr, 55), P(rr, h), P(l, h)];
      c.push(this.poly(wall, { fil: C.white, str: null }));
      c.push(...this.inkEdges([P(l, h), P(l, 55), P(rr, 55), P(rr, h)], 1, 0.5));
      c.push(...this.inkLine([P(l - 3, 53), P(rr + 3, 53)], 2.3, 0.78));
    }
    const wall = [P(0, 33), P(bodyW, 33), P(bodyW, h), P(0, h)];
    c.push(this.poly(wall, { fil: C.white, str: null }));
    c.push(...this.inkEdges([P(0, 33), P(0, h), P(bodyW, h), P(bodyW, 33)], 1.3, 0.68));
    c.push(...this.paintingArchDoor(bodyW / 2 - 12, h, 24, 35));
    if (doors === 3) {
      for (const x of [12.0, bodyW - 30]) {
        c.push(...this.paintingArchDoor(x, h, 18, 28, 0.36));
      }
    }
    c.push(...this.paintingHipGableRoof(bodyW + 22, 31).map(p => {
      const q = clonePoly(p);
      q.p = p.p.map(pt => P(pt.x - 11, pt.y));
      return q;
    }));
    for (let k = 0; k < 3; k++) {
      const inset = k * 4;
      c.push(...this.inkLine([P(-5 - inset, h + 3 + k * 4), P(bodyW + 5 + inset, h + 3 + k * 4)], 1.1, 0.60 - k * 0.09, 0.4));
    }
    return c;
  },

  paintingPagoda() {
    const levels = [5, 7, 9, 13][Math.trunc(this.r() * 65536) % 4];
    const dense = levels === 13 || (levels >= 7 && this.r() < 0.45);
    const pitch = dense ? 12.0 : 24.0;
    const bottom = 22 + (levels - 1) * pitch + (dense ? 28 : 23);
    const c = [];
    for (let k = levels - 1; k >= 0; k--) {
      const t = k / (levels - 1), y = 22 + k * pitch;
      const half = 11 + 20 * Math.pow(t, 0.8), wallHalf = half * 0.70;
      const floor = k === levels - 1 ? bottom : y + pitch;
      const wall = [P(50 - wallHalf, y), P(50 + wallHalf, y), P(50 + wallHalf, floor), P(50 - wallHalf, floor)];
      c.push(this.poly(wall, { fil: C.white, str: null }));
      c.push(this.poly([P(50 + wallHalf * 0.25, y), wall[1], wall[2], P(50 + wallHalf * 0.25, floor)], { fil: C.gray(0, 0.08), str: null }));
      c.push(...this.inkEdges([wall[0], wall[3], wall[2], wall[1]], 0.9, 0.59, 0.3));
      if (!dense || k === levels - 1) {
        c.push(...this.paintingArchDoor(47, floor - 3, 6, dense ? 17 : 12, 0.48));
      }
      const roof = [
        P(50 - half - 5, y + 2), P(50 - half * 0.66, y - 2),
        P(50 - half * 0.48, y - 6), P(50 + half * 0.48, y - 6),
        P(50 + half * 0.66, y - 2), P(50 + half + 5, y + 2)
      ];
      c.push(this.poly(roof, { fil: C.white, str: null }));
      c.push(this.poly(roof, { fil: C.gray(0, 0.12), str: null }));
      c.push(...this.inkEdges(roof, 0.8, 0.58, 0.35));
      c.push(...this.inkLine([P(50 - half - 5, y), P(50, y + 4), P(50 + half + 5, y)], 1.7, 0.8, 0.3));
    }
    c.push(...this.inkLine([P(50, 0), P(50, 16)], 1.3, 0.8));
    for (const y of [4.0, 8, 12]) {
      c.push(...this.inkLine([P(47.5, y), P(52.5, y)], 1.2, 0.72));
    }
    c.push(...this.inkLine([P(24, bottom + 3), P(76, bottom + 3)], 1.6, 0.65));
    return c;
  }
});


// ═══════════════════════════════════════════════════════════════════════════
//  Part 03 — Painting Flora, Boats, Bridges, Atmosphere, Assets & Scene V4
//  Ported from ZixiaoArt/ShanShui:
//    1. ShanShuiPaintingBoats.swift
//    2. ShanShuiPaintingBridge.swift
//    3. ShanShuiPaintingBamboo.swift
//    4. ShanShuiPaintingOldTrees.swift
//    5. ShanShuiPaintingPlants.swift
//    6. ShanShuiPaintingSpring.swift
//    7. ShanShuiPaintingFlowers.swift
//    8. ShanShuiPaintingAtmosphere.swift
//    9. ShanShuiPaintingAssets.swift
//   10. ShanShuiSceneAssets.swift
//   11. ShanShuiSceneV4.swift
// ═══════════════════════════════════════════════════════════════════════════

// ─── Dual-Signature Compatibility Helpers for Cross-Module Calls ──────────

function _fnTakesOptsAt(fn, argIndex) {
  if (typeof fn !== "function") return false;
  if (fn._takesOptsCache && fn._takesOptsCache[argIndex] !== undefined) {
    return fn._takesOptsCache[argIndex];
  }
  const src = Function.prototype.toString.call(fn);
  const openIdx = src.indexOf("(");
  let result = false;
  if (openIdx !== -1) {
    let depth = 0;
    let closeIdx = -1;
    for (let i = openIdx; i < src.length; i++) {
      const ch = src[i];
      if (ch === "(" || ch === "{" || ch === "[") depth++;
      else if (ch === ")" || ch === "}" || ch === "]") {
        depth--;
        if (depth === 0 && ch === ")") {
          closeIdx = i;
          break;
        }
      }
    }
    if (closeIdx !== -1) {
      const paramStr = src.slice(openIdx + 1, closeIdx);
      const params = [];
      let cur = "";
      let d = 0;
      for (let i = 0; i < paramStr.length; i++) {
        const ch = paramStr[i];
        if (ch === "(" || ch === "{" || ch === "[") d++;
        else if (ch === ")" || ch === "}" || ch === "]") d--;
        if (ch === "," && d === 0) {
          params.push(cur.trim());
          cur = "";
        } else {
          cur += ch;
        }
      }
      if (cur.trim()) params.push(cur.trim());
      const p = params[argIndex] || "";
      const lhs = p.split("=")[0].trim();
      if (lhs.startsWith("{") || /^(opts|options|params|cfg|spec|args)$/i.test(lhs)) {
        result = true;
      }
    }
  }
  if (!fn._takesOptsCache) fn._takesOptsCache = {};
  fn._takesOptsCache[argIndex] = result;
  return result;
}

function _wrapDualMethod(proto, name, leadingCount, paramNames, defaults) {
  const orig = proto[name];
  if (typeof orig !== "function" || orig._isDualWrapped) return;
  const origTakesOpts = _fnTakesOptsAt(orig, leadingCount);
  const wrapped = function (...args) {
    const leading = args.slice(0, leadingCount);
    const rest = args.slice(leadingCount);
    const firstRest = rest[0];
    const calledWithOpts =
      firstRest !== null &&
      typeof firstRest === "object" &&
      !Array.isArray(firstRest) &&
      !(typeof firstRest.x === "number" && typeof firstRest.y === "number") &&
      !(typeof firstRest.r === "number" && typeof firstRest.g === "number" && typeof firstRest.b === "number");

    if (origTakesOpts) {
      if (calledWithOpts) {
        return orig.call(this, ...leading, firstRest);
      }
      const opts = {};
      for (let i = 0; i < paramNames.length; i++) {
        const val = rest[i] !== undefined ? rest[i] : defaults[i];
        if (val !== undefined) opts[paramNames[i]] = val;
      }
      return orig.call(this, ...leading, opts);
    } else {
      if (calledWithOpts) {
        const pos = paramNames.map((k, i) => (firstRest[k] !== undefined ? firstRest[k] : defaults[i]));
        return orig.call(this, ...leading, ...pos);
      }
      const pos = paramNames.map((_, i) => (rest[i] !== undefined ? rest[i] : defaults[i]));
      return orig.call(this, ...leading, ...pos);
    }
  };
  wrapped._isDualWrapped = true;
  proto[name] = wrapped;
}

function _ensurePart2DualSignatures() {
  const proto = ShanShuiEngineV5.prototype;
  _wrapDualMethod(proto, "paintingInk", 1, ["digits"], [3]);
  _wrapDualMethod(proto, "inkCurve", 1, ["resolution"], [8]);
  _wrapDualMethod(proto, "inkLine", 1, ["width", "tone", "dry", "profile"], [1.6, 0.72, 0.14, "brush"]);
  _wrapDualMethod(proto, "inkEdges", 1, ["width", "tone", "dry"], [1.4, 0.78, 0.18]);
  _wrapDualMethod(proto, "inkBlot", 2, ["width", "height", "tone", "wash", "dry"], [18, 8, 0.76, true, 0.22]);
  _wrapDualMethod(proto, "paintingStone", 2, ["width", "height", "tone"], [16, 7.5, 0.72]);
  _wrapDualMethod(proto, "paintingChannel", 0, ["topY", "bottomY", "leftTop", "rightTop", "leftBottom", "rightBottom"], [-62, 62, -26, 20, -48, 44]);
  _wrapDualMethod(proto, "paintingSurface", 1, ["washTone", "edgeTone", "width", "dry"], [0.06, 0.78, 1.35, 0.16]);
  _wrapDualMethod(proto, "paintingWindow", 2, ["width", "height", "circular", "warm"], [16, 12, false, false]);
  _wrapDualMethod(proto, "paintingMoon", 0, ["crescent"], [false]);
  _wrapDualMethod(proto, "paintingBird", 0, ["swallow", "count"], [false, 2]);
  _wrapDualMethod(proto, "paintingPerson", 0, ["hat", "pose", "facingLeft"], [true, "standing", false]);
  _wrapDualMethod(proto, "paintingHorse", 0, ["pose", "facingLeft", "donkey"], ["standing", false, false]);
  _wrapDualMethod(proto, "paintingWater", 0, ["stream"], [false]);
  _wrapDualMethod(proto, "paintingRock", 0, ["width", "height", "detail"], [undefined, undefined, undefined]);
  _wrapDualMethod(proto, "paintingWaterfall", 0, ["height", "width"], [undefined, undefined]);
}
_ensurePart2DualSignatures();

// ─── Legacy ShanShuiTrees & ShanShuiArch Helpers (Required by SceneAssets) ─

if (!ShanShuiEngineV5.fun07) {
  ShanShuiEngineV5.fun07 = (x) =>
    x <= 1 ? 2.75 * x * Math.pow(1 - x, 1 / 1.8) : 2.75 * (x - 2) * Math.pow(x - 1, 1 / 1.8);
}
if (!ShanShuiEngineV5.sin1) {
  ShanShuiEngineV5.sin1 = () => Math.sin(1);
}

if (!ShanShuiEngineV5.prototype.tree01) {
  ShanShuiEngineV5.prototype.tree01 = function (x, y, opts = {}) {
    const { hei = 50, wid = 3, col = C.ink(0.5) } =
      typeof opts === "number" ? { hei: opts, wid: arguments[3] ?? 3, col: arguments[4] ?? C.ink(0.5) } : opts;
    const reso = 10.0;
    const nslist = [];
    for (let i = 0; i < 10; i++) nslist.push([this.n(i * 0.5), this.n(i * 0.5, 0.5)]);
    const canv = [];
    const line1 = [], line2 = [];
    for (let i = 0; i < 10; i++) {
      const fi = i;
      const nx = x;
      const ny = y - (fi * hei) / reso;
      if (fi >= reso / 4) {
        let j = 0.0;
        while (j < (reso - fi) / 5) {
          const bx = nx + (this.r() - 0.5) * wid * 1.2 * (reso - fi);
          const by = ny + (this.r() - 0.5) * wid;
          const len = this.r() * 20 * (reso - fi) * 0.2 + 10;
          const bw = this.r() * 6 + 3;
          const ang = ((this.r() - 0.5) * Math.PI) / 6;
          const c = C(col.r, col.g, col.b, toFixed(this.r() * 0.2 + col.a, 1));
          canv.push(...this.blob(bx, by, { len, wid: bw, ang, col: c }));
          j += 1;
        }
      }
      line1.push(P(nx + (nslist[i][0] - 0.5) * wid - wid / 2, ny));
      line2.push(P(nx + (nslist[i][1] - 0.5) * wid + wid / 2, ny));
    }
    canv.push(this.poly(line1, { fil: null, str: col, wid: 1.5 }));
    canv.push(this.poly(line2, { fil: null, str: col, wid: 1.5 }));
    return canv;
  };
}

if (!ShanShuiEngineV5.prototype.tree03) {
  ShanShuiEngineV5.prototype.tree03 = function (x, y, opts = {}) {
    const { hei = 50, wid = 5, ben = () => 0, col = C.ink(0.5) } =
      typeof opts === "number"
        ? { hei: opts, wid: arguments[3] ?? 5, ben: arguments[4] ?? (() => 0), col: arguments[5] ?? C.ink(0.5) }
        : opts;
    const reso = 10.0;
    const nslist = [];
    for (let i = 0; i < 10; i++) nslist.push([this.n(i * 0.5), this.n(i * 0.5, 0.5)]);
    const canv = [];
    const blobs = [];
    const line1 = [], line2 = [];
    for (let i = 0; i < 10; i++) {
      const fi = i;
      const nx = x + ben(fi / reso) * 100;
      const ny = y - (fi * hei) / reso;
      if (fi >= reso / 5) {
        let j = 0.0;
        while (j < (reso - fi) * 2) {
          const shapeV = Math.log(50 * ((reso - fi) / reso) + 1) / 3.95;
          const ox = this.r() * wid * 2 * shapeV;
          const bx = nx + ox * this.e.choice([-1.0, 1.0]);
          const by = ny + (this.r() - 0.5) * wid * 2;
          const bw = this.r() * 6 + 3;
          const ang = ((this.r() - 0.5) * Math.PI) / 6;
          const c = C(col.r, col.g, col.b, toFixed(this.r() * 0.2 + col.a, 3));
          blobs.push(...this.blob(bx, by, { len: ox * 2, wid: bw, ang, col: c }));
          j += 1;
        }
      }
      line1.push(P(nx + (((nslist[i][0] - 0.5) * wid - wid / 2) * (reso - fi)) / reso, ny));
      line2.push(P(nx + (((nslist[i][1] - 0.5) * wid + wid / 2) * (reso - fi)) / reso, ny));
    }
    canv.push(this.poly(line1.concat(line2.slice().reverse()), { fil: C.white, str: col, wid: 1.5 }));
    canv.push(...blobs);
    return canv;
  };
}

if (!ShanShuiEngineV5.prototype.branch) {
  ShanShuiEngineV5.prototype.branch = function (opts = {}) {
    const { hei = 300, wid = 6, ang: angIn = 0, det = 10, ben = Math.PI * 0.2 } =
      typeof opts === "number"
        ? {
            hei: opts,
            wid: arguments[1] ?? 6,
            ang: arguments[2] ?? 0,
            det: arguments[3] ?? 10,
            ben: arguments[4] ?? Math.PI * 0.2,
          }
        : opts;
    let nx = 0.0, ny = 0.0;
    const tlist = [P(nx, ny)];
    let a0 = 0.0;
    const g = 3.0;
    for (let k = 0; k < 3; k++) {
      const mag = ben / 2 + (this.r() * ben) / 2;
      a0 += mag * this.e.choice([-1.0, 1.0]);
      nx += (Math.cos(a0) * hei) / g;
      ny -= (Math.sin(a0) * hei) / g;
      tlist.push(P(nx, ny));
    }
    const ta = Math.atan2(tlist[tlist.length - 1].y, tlist[tlist.length - 1].x);
    for (let i = 0; i < tlist.length; i++) {
      const a = Math.atan2(tlist[i].y, tlist[i].x);
      const d = Math.sqrt(tlist[i].x * tlist[i].x + tlist[i].y * tlist[i].y);
      tlist[i] = P(d * Math.cos(a - ta + angIn), d * Math.sin(a - ta + angIn));
    }
    const tr1 = [], tr2 = [];
    const span = det;
    const tl = (tlist.length - 1) * span;
    let lx = 0.0, ly = 0.0;
    let i = 0.0;
    while (i < tl) {
      const lastp = tlist[Math.floor(i / span)];
      const nextp = tlist[Math.ceil(i / span)];
      const p = (i % span) / span;
      const px = lastp.x * (1 - p) + nextp.x * p;
      const py = lastp.y * (1 - p) + nextp.y * p;
      const ang = Math.atan2(py - ly, px - lx);
      const woff = ((this.n(i * 0.3) - 0.5) * wid * hei) / 80;
      let b = 0.0;
      if (p === 0) b = this.r() * wid;
      const nw = wid * (((tl - i) / tl) * 0.5 + 0.5);
      tr1.push(P(px + Math.cos(ang + Math.PI / 2) * (nw + woff + b), py + Math.sin(ang + Math.PI / 2) * (nw + woff + b)));
      tr2.push(P(px + Math.cos(ang - Math.PI / 2) * (nw - woff + b), py + Math.sin(ang - Math.PI / 2) * (nw - woff + b)));
      lx = px;
      ly = py;
      i += 1;
    }
    return [tr1, tr2];
  };
}

if (!ShanShuiEngineV5.prototype.twig) {
  ShanShuiEngineV5.prototype.twig = function (tx, ty, dep, opts = {}) {
    const { dir = 1, sca = 1, wid = 1, ang = 0, lea = [true, 12] } =
      typeof opts === "number"
        ? {
            dir: opts,
            sca: arguments[4] ?? 1,
            wid: arguments[5] ?? 1,
            ang: arguments[6] ?? 0,
            lea: arguments[7] ?? [true, 12],
          }
        : opts;
    const canv = [];
    const twlist = [];
    const tl = 10;
    const hs = this.r() * 0.5 + 0.5;
    this.e.choice([0]);
    const a0 = ((this.r() * Math.PI) / 6) * dir + ang;
    for (let i = 0; i < tl; i++) {
      const fi = i;
      const tf = -1 / Math.pow(fi / tl + 1, 5) + 1;
      const mx = dir * tf * 50 * sca * hs;
      const my = -fi * 5 * sca;
      const a = Math.atan2(my, mx);
      const d = Math.pow(mx * mx + my * my, 0.5);
      const nx = Math.cos(a + a0) * d;
      const ny = Math.sin(a + a0) * d;
      twlist.push(P(nx + tx, ny + ty));
      if ((i === Math.trunc(tl / 3) || i === Math.trunc((tl * 2) / 3)) && dep > 0) {
        const ndir = dir * this.e.choice([-1.0, 1.0]);
        canv.push(...this.twig(nx + tx, ny + ty, dep - 1, { dir: ndir, sca: sca * 0.8, wid, ang, lea }));
      }
      if (i === tl - 1 && lea[0]) {
        for (let j = 0; j < 5; j++) {
          const dj = (j - 2.5) * 5;
          const bx = nx + tx + Math.cos(ang) * dj * wid;
          const by = ny + ty + (Math.sin(ang) * dj - lea[1] / (dep + 1)) * wid;
          const bw = (6 + 3 * this.r()) * wid;
          const bl = (15 + 12 * this.r()) * wid;
          const ba = ang / 2 + Math.PI / 2 + Math.PI * 0.2 * (this.r() - 0.5);
          canv.push(
            ...this.blob(bx, by, {
              len: bl,
              wid: bw,
              ang: ba,
              col: C.ink(0.5 + dep * 0.2),
              fun: ShanShuiEngineV5.fun02,
            })
          );
        }
      }
    }
    canv.push(...this.stroke(twlist, { wid: 1, col: C.ink(0.5), fun: (x) => Math.cos((x * Math.PI) / 2) }));
    return canv;
  };
}

if (!ShanShuiEngineV5.prototype.bark) {
  ShanShuiEngineV5.prototype.bark = function (x, y, wid, ang) {
    const len = 10 + 10 * this.r();
    const noi = 0.5;
    const reso = 20.0;
    const lalist = [];
    for (let i = 0; i <= 20; i++) {
      const p = (i / reso) * 2;
      const xo = len / 2 - Math.abs(p - 1) * len;
      const yo = (ShanShuiEngineV5.blobFun(p) * wid) / 2;
      lalist.push([Math.sqrt(xo * xo + yo * yo), Math.atan2(yo, xo)]);
    }
    const nslist = [];
    const n0 = this.r() * 10;
    for (let i = 0; i <= 20; i++) nslist.push(this.n(i * 0.05, n0));
    loopNoise(nslist);
    const brk = [];
    for (let i = 0; i < lalist.length; i++) {
      const ns = nslist[i] * noi + (1 - noi);
      brk.push(P(x + Math.cos(lalist[i][1] + ang) * lalist[i][0] * ns, y + Math.sin(lalist[i][1] + ang) * lalist[i][0] * ns));
    }
    const fr = this.r();
    return this.stroke(brk, {
      wid: 0.8,
      col: C.ink(0.4),
      noi: 0,
      out: 0,
      fun: (t) => Math.sin((t + fr) * Math.PI * 3),
    });
  };
}

if (!ShanShuiEngineV5.prototype.barkify) {
  ShanShuiEngineV5.prototype.barkify = function (x, y, trlist) {
    const canv = [];
    const t0 = trlist[0], t1 = trlist[1];
    if (t0.length > 3) {
      for (let i = 2; i < t0.length - 1; i++) {
        const a0 = Math.atan2(t0[i].y - t0[i - 1].y, t0[i].x - t0[i - 1].x);
        const a1 = Math.atan2(t1[i].y - t1[i - 1].y, t1[i].x - t1[i - 1].x);
        const p = this.r();
        const nx = t0[i].x * (1 - p) + t1[i].x * p;
        const ny = t0[i].y * (1 - p) + t1[i].y * p;
        if (this.r() < 0.2) {
          canv.push(
            ...this.blob(nx + x, ny + y, {
              len: 15,
              wid: 6 - Math.abs(p - 0.5) * 10,
              ang: (a0 + a1) / 2,
              col: C.ink(0.6),
              noi: 1,
            })
          );
        } else {
          canv.push(...this.bark(nx + x, ny + y, 5 - Math.abs(p - 0.5) * 10, (a0 + a1) / 2));
        }
        if (this.r() < 0.05) {
          const jl = this.r() * 2 + 2;
          const xya = this.e.choice([
            [t0[i].x, t0[i].y, a0],
            [t1[i].x, t1[i].y, a1],
          ]);
          let j = 0.0;
          while (j < jl) {
            const bx = xya[0] + x + Math.cos(xya[2]) * (j - jl / 2) * 4;
            const by = xya[1] + y + Math.sin(xya[2]) * (j - jl / 2) * 4;
            canv.push(
              ...this.blob(bx, by, {
                len: 4 + 6 * this.r(),
                wid: 4,
                ang: a0 + Math.PI / 2,
                col: C.ink(0.6),
              })
            );
            j += 1;
          }
        }
      }
    }
    const n0c = t0.length, n1c = t1.length;
    const source = (k) => (k < n0c ? [0, k] : [1, n1c - 1 - (k - n0c)]);
    const total = n0c + n1c;
    const groups = [[]];
    for (let k = 0; k < total; k++) {
      if (this.r() < 0.5) groups.push([]);
      else groups[groups.length - 1].push(k);
    }
    for (let gi = 0; gi < groups.length; gi++) {
      const g = groups[gi];
      const pts = g.map((k) => {
        const s = source(k);
        return trlist[s[0]][s[1]];
      });
      const rg = divP(pts, 4);
      for (let j = 0; j < rg.length; j++) {
        rg[j].x += (this.n(gi, j * 0.1, 1) - 0.5) * (15 + 5 * this.e.randGaussian());
        rg[j].y += (this.n(gi, j * 0.1, 2) - 0.5) * (15 + 5 * this.e.randGaussian());
      }
      if (g.length > 0 && rg.length > 0) {
        const last = g[g.length - 1];
        const s = source(last);
        trlist[s[0]][s[1]] = rg[rg.length - 1];
      }
      canv.push(...this.stroke(rg.map((pt) => P(pt.x + x, pt.y + y)), { wid: 1.5, col: C.ink(0.7), out: 0 }));
    }
    return canv;
  };
}

if (!ShanShuiEngineV5.prototype.tree04) {
  ShanShuiEngineV5.prototype.tree04 = function (x, y, opts = {}) {
    const { hei = 300, wid = 6, col = C.ink(0.5) } =
      typeof opts === "number" ? { hei: opts, wid: arguments[3] ?? 6, col: arguments[4] ?? C.ink(0.5) } : opts;
    const canv = [], txcanv = [], twcanv = [];
    const tr = this.branch({ hei, wid, ang: -Math.PI / 2 });
    txcanv.push(...this.barkify(x, y, tr));
    const trlist = tr[0].concat(tr[1].slice().reverse());
    const trmlist = [];
    const L = trlist.length;
    for (let i = 0; i < trlist.length; i++) {
      const fi = i;
      if ((fi >= L * 0.3 && fi <= L * 0.7 && this.r() < 0.1) || fi === L / 2 - 1) {
        const ba = Math.PI * 0.2 - Math.PI * 1.4 * (fi > L / 2 ? 1 : 0);
        const br = this.branch({ hei: hei * (this.r() + 1) * 0.3, wid: wid * 0.5, ang: ba });
        br[0].shift();
        br[1].shift();
        const o = trlist[i];
        const copy = [br[0].map((pt) => P(pt.x + o.x, pt.y + o.y)), br[1].map((pt) => P(pt.x + o.x, pt.y + o.y))];
        txcanv.push(...this.barkify(x, y, copy));
        for (let j = 0; j < br[0].length; j++) {
          if (this.r() < 0.2 || j === br[0].length - 1) {
            twcanv.push(
              ...this.twig(br[0][j].x + o.x + x, br[0][j].y + o.y + y, 1, {
                dir: ba > -Math.PI / 2 ? 1 : -1,
                sca: (0.5 * hei) / 300,
                wid: hei / 300,
                ang: ba > -Math.PI / 2 ? ba : ba + Math.PI,
              })
            );
          }
        }
        const bl = br[0].concat(br[1].slice().reverse());
        for (const pt of bl) trmlist.push(P(pt.x + o.x, pt.y + o.y));
      } else {
        trmlist.push(trlist[i]);
      }
    }
    canv.push(this.poly(trmlist, { xof: x, yof: y, fil: C.white, str: col, wid: 0 }));
    trmlist.shift();
    trmlist.pop();
    const sc = C.ink(0.4 + this.r() * 0.1);
    canv.push(
      ...this.stroke(
        trmlist.map((pt) => P(pt.x + x, pt.y + y)),
        { wid: 2.5, col: sc, noi: 0.9, out: 0, fun: ShanShuiEngineV5.sin1 }
      )
    );
    canv.push(...txcanv, ...twcanv);
    return canv;
  };
}

if (!ShanShuiEngineV5.prototype.tree05) {
  ShanShuiEngineV5.prototype.tree05 = function (x, y, opts = {}) {
    const { hei = 300, wid = 5, col = C.ink(0.5) } =
      typeof opts === "number" ? { hei: opts, wid: arguments[3] ?? 5, col: arguments[4] ?? C.ink(0.5) } : opts;
    const canv = [], txcanv = [], twcanv = [];
    const tr = this.branch({ hei, wid, ang: -Math.PI / 2, ben: 0 });
    txcanv.push(...this.barkify(x, y, tr));
    const trlist = tr[0].concat(tr[1].slice().reverse());
    const trmlist = [];
    const L = trlist.length;
    for (let i = 0; i < trlist.length; i++) {
      const fi = i;
      const p = Math.abs(fi - L * 0.5) / (L * 0.5);
      if ((fi >= L * 0.2 && fi <= L * 0.8 && i % 3 === 0 && this.r() > p) || fi === L / 2 - 1) {
        const bar = this.r() * 0.2;
        const ba = -bar * Math.PI - (1 - bar * 2) * Math.PI * (fi > L / 2 ? 1 : 0);
        const br = this.branch({ hei: hei * (0.3 * p - this.r() * 0.05), wid: wid * 0.5, ang: ba, ben: 0.5 });
        br[0].shift();
        br[1].shift();
        const o = trlist[i];
        for (let j = 0; j < br[0].length; j++) {
          if (j % 20 === 0 || j === br[0].length - 1) {
            twcanv.push(
              ...this.twig(br[0][j].x + o.x + x, br[0][j].y + o.y + y, 0, {
                dir: ba > -Math.PI / 2 ? 1 : -1,
                sca: (0.2 * hei) / 300,
                wid: hei / 300,
                ang: ba > -Math.PI / 2 ? ba : ba + Math.PI,
                lea: [true, 5],
              })
            );
          }
        }
        const bl = br[0].concat(br[1].slice().reverse());
        for (const pt of bl) trmlist.push(P(pt.x + o.x, pt.y + o.y));
      } else {
        trmlist.push(trlist[i]);
      }
    }
    canv.push(this.poly(trmlist, { xof: x, yof: y, fil: C.white, str: col, wid: 0 }));
    trmlist.shift();
    trmlist.pop();
    const sc = C.ink(0.4 + this.r() * 0.1);
    canv.push(
      ...this.stroke(
        trmlist.map((pt) => P(pt.x + x, pt.y + y)),
        { wid: 2.5, col: sc, noi: 0.9, out: 0, fun: ShanShuiEngineV5.sin1 }
      )
    );
    canv.push(...txcanv, ...twcanv);
    return canv;
  };
}

if (!ShanShuiEngineV5.prototype.tree06) {
  ShanShuiEngineV5.prototype.tree06 = function (x, y, opts = {}) {
    const { hei = 100, wid = 6, col = C.ink(0.5) } =
      typeof opts === "number" ? { hei: opts, wid: arguments[3] ?? 6, col: arguments[4] ?? C.ink(0.5) } : opts;
    const canv = [], txcanv = [], twcanv = [];
    const fracTree = (xoff, yoff, dep, fOpts = {}) => {
      const { hei: fHei = 300, wid: fWid = 5, ang: fAng = 0, ben: fBen = Math.PI * 0.2 } = fOpts;
      const tr = this.branch({ hei: fHei, wid: fWid, ang: fAng, det: fHei / 20, ben: fBen });
      txcanv.push(...this.barkify(xoff, yoff, tr));
      const trlist = tr[0].concat(tr[1].slice().reverse());
      const trmlist = [];
      const L = trlist.length;
      const half = or0(L / 2);
      for (let i = 0; i < trlist.length; i++) {
        const fi = i;
        if (((this.r() < 0.025 && fi >= L * 0.2 && fi <= L * 0.8) || fi === half - 1 || fi === half + 1) && dep > 0) {
          const bar = 0.02 + this.r() * 0.08;
          const ba = bar * Math.PI - bar * 2 * Math.PI * (fi > L / 2 ? 1 : 0);
          const o = trlist[i];
          const brlist = fracTree(o.x + xoff, o.y + yoff, dep - 1, {
            hei: fHei * (0.7 + this.r() * 0.2),
            wid: fWid * 0.6,
            ang: fAng + ba,
            ben: 0.55,
          });
          for (let j = 0; j < brlist.length; j++) {
            if (this.r() < 0.03) {
              twcanv.push(
                ...this.twig(brlist[j].x + o.x + xoff, brlist[j].y + o.y + yoff, 2, {
                  dir: ba > 0 ? 1 : -1,
                  sca: 0.3,
                  ang: ba * (this.r() * 0.5 + 0.75),
                  lea: [false, 0],
                })
              );
            }
          }
          for (const pt of brlist) trmlist.push(P(pt.x + o.x, pt.y + o.y));
        } else {
          trmlist.push(trlist[i]);
        }
      }
      return trmlist;
    };

    const trmlist = fracTree(x, y, 3, { hei, wid, ang: -Math.PI / 2, ben: 0 });
    canv.push(this.poly(trmlist, { xof: x, yof: y, fil: C.white, str: col, wid: 0 }));
    trmlist.shift();
    trmlist.pop();
    const sc = C.ink(0.4 + this.r() * 0.1);
    canv.push(
      ...this.stroke(
        trmlist.map((pt) => P(pt.x + x, pt.y + y)),
        { wid: 2.5, col: sc, noi: 0.9, out: 0, fun: ShanShuiEngineV5.sin1 }
      )
    );
    canv.push(...txcanv, ...twcanv);
    return canv;
  };
}

if (!ShanShuiEngineV5.prototype.tree07) {
  ShanShuiEngineV5.prototype.tree07 = function (x, y, opts = {}) {
    const { hei = 60, wid = 4, ben = (t) => Math.sqrt(t) * 0.2, col = C.ink(1) } =
      typeof opts === "number"
        ? { hei: opts, wid: arguments[3] ?? 4, ben: arguments[4] ?? ((t) => Math.sqrt(t) * 0.2), col: arguments[5] ?? C.ink(1) }
        : opts;
    const reso = 10.0;
    const nslist = [];
    for (let i = 0; i < 10; i++) nslist.push([this.n(i * 0.5), this.n(i * 0.5, 0.5)]);
    const canv = [];
    const line1 = [], line2 = [];
    let T = [];
    for (let i = 0; i < 10; i++) {
      const fi = i;
      const nx = x + ben(fi / reso) * 100;
      const ny = y - (fi * hei) / reso;
      if (fi >= reso / 4) {
        const bx = nx + (this.r() - 0.5) * wid * 1.2 * (reso - fi) * 0.5;
        const by = ny + (this.r() - 0.5) * wid * 0.5;
        const bl = this.r() * 50 + 20;
        const bw = this.r() * 12 + 12;
        const ba = (-this.r() * Math.PI) / 6;
        const bpl = this.blobPoints(bx, by, { len: bl, wid: bw, ang: ba, fun: ShanShuiEngineV5.fun07 });
        T.push(...triangulateP(bpl, 50, true, false));
      }
      line1.push(P(nx + (nslist[i][0] - 0.5) * wid - wid / 2, ny));
      line2.push(P(nx + (nslist[i][1] - 0.5) * wid + wid / 2, ny));
    }
    T = triangulateP(line1.concat(line2.slice().reverse()), 50, true, true).concat(T);
    for (const t of T) {
      const m = midPtP(t);
      const c = or0(this.n(m.x * 0.02, m.y * 0.02) * 200 + 50);
      const co = C.gray(c, 0.8);
      canv.push(this.poly(t, { fil: co, str: co, wid: 0 }));
    }
    return canv;
  };
}

if (!ShanShuiEngineV5.prototype.tree08) {
  ShanShuiEngineV5.prototype.tree08 = function (x, y, opts = {}) {
    const { hei = 80, wid = 1, col = C.ink(0.5) } =
      typeof opts === "number" ? { hei: opts, wid: arguments[3] ?? 1, col: arguments[4] ?? C.ink(0.5) } : opts;
    const canv = [], twcanv = [];
    const ang = this.e.normRand(-1, 1) * Math.PI * 0.2;
    const tr = this.branch({ hei, wid, ang: -Math.PI / 2 + ang, det: hei / 20, ben: Math.PI * 0.2 });
    const trlist = tr[0].concat(tr[1].slice().reverse());
    const fracTree = (xoff, yoff, dep, fOpts = {}) => {
      const { ang: fAng = -Math.PI / 2, len = 15, ben = 0 } = fOpts;
      const fun = dep === 0 ? (t) => Math.cos(0.5 * Math.PI * t) : () => 1;
      const spt = P(xoff, yoff);
      const ept = P(xoff + Math.cos(fAng) * len, yoff + Math.sin(fAng) * len);
      const bsign = this.e.choice([1.0, -1.0]);
      const trm = divP([P(xoff, yoff), P(xoff + len, yoff)], 10);
      const tc = trm.length;
      for (let i = 0; i < trm.length; i++) trm[i].y += bsign * Math.sin((i / tc) * Math.PI) * 2;
      for (let i = 0; i < trm.length; i++) {
        const d = distanceP(trm[i], spt);
        const a = Math.atan2(trm[i].y - spt.y, trm[i].x - spt.x);
        trm[i] = P(spt.x + d * Math.cos(a + fAng), spt.y + d * Math.sin(a + fAng));
      }
      const tcanv = this.stroke(trm, { wid: 0.8, col: C.ink(0.5), fun });
      if (dep !== 0) {
        const nben = ben + this.e.choice([-1.0, 1.0]) * Math.PI * 0.001 * dep * dep;
        if (this.r() < 0.5) {
          const c1 = [this.e.normRand(-1, 0.5), this.e.normRand(0.5, 1)];
          const a1 = fAng + ben + Math.PI * this.e.choice(c1) * 0.2;
          const l1 = len * this.e.normRand(0.8, 0.9);
          tcanv.push(...fracTree(ept.x, ept.y, dep - 1, { ang: a1, len: l1, ben: nben }));
          const c2 = [this.e.normRand(-1, -0.5), this.e.normRand(0.5, 1)];
          const a2 = fAng + ben + Math.PI * this.e.choice(c2) * 0.2;
          const l2 = len * this.e.normRand(0.8, 0.9);
          tcanv.push(...fracTree(ept.x, ept.y, dep - 1, { ang: a2, len: l2, ben: nben }));
        } else {
          tcanv.push(...fracTree(ept.x, ept.y, dep - 1, { ang: fAng + ben, len: len * this.e.normRand(0.8, 0.9), ben: nben }));
        }
      }
      return tcanv;
    };

    for (let i = 0; i < trlist.length; i++) {
      if (this.r() < 0.2) {
        const dep = Math.floor(4 * this.r());
        const a = -Math.PI / 2 - ang * this.r();
        twcanv.push(...fracTree(x + trlist[i].x, y + trlist[i].y, dep, { ang: a }));
      } else if (i === Math.trunc(trlist.length / 2)) {
        twcanv.push(...fracTree(x + trlist[i].x, y + trlist[i].y, 3, { ang: -Math.PI / 2 + ang }));
      }
    }
    canv.push(this.poly(trlist, { xof: x, yof: y, fil: C.white, str: col, wid: 0 }));
    const sc = C.ink(0.6 + this.r() * 0.1);
    canv.push(
      ...this.stroke(
        trlist.map((pt) => P(pt.x + x, pt.y + y)),
        { wid: 2.5, col: sc, noi: 0.9, out: 0, fun: ShanShuiEngineV5.sin1 }
      )
    );
    canv.push(...twcanv);
    return canv;
  };
}

if (!ShanShuiEngineV5.prototype.hut) {
  ShanShuiEngineV5.prototype.hut = function (x, y, opts = {}) {
    const { hei = 40, wid = 80, tex = 300 } = opts;
    const canv = [];
    let ptlist = [];
    const reso = [10, 10];
    for (let i = 0; i < reso[0]; i++) {
      ptlist.push([]);
      const heir = hei + hei * 0.2 * this.r();
      for (let j = 0; j < reso[1]; j++) {
        const nx = wid * (i / (reso[0] - 1) - 0.5) * Math.pow(j / (reso[1] - 1), 0.7);
        const ny = heir * (j / (reso[1] - 1));
        ptlist[ptlist.length - 1].push(P(nx, ny));
      }
    }
    canv.push(
      this.poly(
        ptlist[0].slice(0, -1).concat(ptlist[ptlist.length - 1].slice(0, -1).reverse()),
        { xof: x, yof: y, fil: C.white, str: null }
      )
    );
    canv.push(this.poly([P(-wid * 0.5, 0), P(wid * 0.5, 0)], { xof: x, yof: y, fil: null, str: C.ink(0.5), wid: 2 }));
    canv.push(
      ...this.texture(ptlist, {
        xof: x,
        yof: y,
        tex,
        wid: 1,
        len: 0.25,
        col: (u) => C.ink(0.8 + this.r() * 0.2),
        dis: () => this.wtrand((a) => a * a),
        noi: () => 5,
      })
    );
    return canv;
  };
}

if (!ShanShuiEngineV5.prototype.arch01) {
  ShanShuiEngineV5.prototype.arch01 = function (x, y, seed = 0, opts = {}) {
    const { hei = 70, wid = 180, per = 5 } = opts;
    const canv = [];
    const p = 0.4 + this.r() * 0.2;
    const h0 = hei * p;
    const h1 = hei * (1 - p);
    canv.push(...this.hut(x, y - hei, { hei: h0, wid }));
    canv.push(
      ...this.box(x, y, {
        hei: h1,
        wid: (wid * 2) / 3,
        per,
        bot: false,
      })
    );
    canv.push(...this.rail(x, y, seed, { tra: true, fro: false, hei: 10, wid, per, seg: (3 + this.r() * 3) | 0 }));
    const mcnt = this.e.randChoice([0, 1, 1, 2]);
    if (mcnt === 1) {
      canv.push(...this.man(x + this.e.normRand(-wid / 3, wid / 3), y, { fli: this.e.randChoice([true, false]), sca: 0.42 }));
    } else if (mcnt === 2) {
      const mpos0 = this.e.normRand(-wid / 4, -wid / 10);
      const mpos1 = this.e.normRand(wid / 10, wid / 4);
      canv.push(...this.man(x + mpos0, y, { fli: false, sca: 0.42 }));
      canv.push(...this.man(x + mpos1, y, { fli: true, sca: 0.42 }));
    }
    canv.push(...this.rail(x, y, seed, { tra: false, fro: true, hei: 10, wid, per, seg: (3 + this.r() * 3) | 0 }));
    return canv;
  };
}

if (!ShanShuiEngineV5.prototype.tranpoly) {
  ShanShuiEngineV5.prototype.tranpoly = function (p0, p1, ptlist) {
    const plist = ptlist.map((pt) => P(-pt.x, pt.y));
    const ang = Math.atan2(p1.y - p0.y, p1.x - p0.x) - Math.PI / 2;
    const scl = distanceP(p0, p1);
    return plist.map((pt) => {
      const d = distanceP(pt, P(0, 0));
      const a = Math.atan2(pt.y, pt.x);
      return P(p0.x + d * scl * Math.cos(ang + a), p0.y + d * scl * Math.sin(ang + a));
    });
  };
}

if (!ShanShuiEngineV5.prototype.flipper) {
  ShanShuiEngineV5.prototype.flipper = function (plist) {
    return plist.map((pt) => P(-pt.x, pt.y));
  };
}

if (!ShanShuiEngineV5.prototype.hat01) {
  ShanShuiEngineV5.prototype.hat01 = function (p0, p1, fli = false) {
    const canv = [];
    const seed = this.r();
    const f = fli ? (pts) => this.flipper(pts) : (pts) => pts;
    const qlist1 = [];
    const pts = this.tranpoly(
      p0,
      p1,
      f([P(-0.3, 0.5), P(0.3, 0.8), P(0.2, 1), P(0, 1.1), P(-0.3, 1.15), P(-0.55, 1), P(-0.65, 0.5)])
    );
    canv.push(this.poly(pts, { fil: C.ink(0.8), str: C.ink(0.8), wid: 1 }));
    for (let i = 0; i < 10; i++) {
      const fi = i;
      qlist1.push([
        P(-0.3 - (this.n(fi * 0.2, seed) * fi) * 0.1, 0.5 - (fi * 0.3) / 10),
        P(0.6 + (this.n(fi * 0.2, seed) * fi) * 0.1, 0.8 - (fi * 0.3) / 10),
      ]);
    }
    for (const q of qlist1) {
      canv.push(this.poly(this.tranpoly(p0, p1, f(q)), { str: C.ink(0.7), wid: 1 }));
    }
    return canv;
  };
}

if (!ShanShuiEngineV5.prototype.hat02) {
  ShanShuiEngineV5.prototype.hat02 = function (p0, p1, fli = false) {
    const f = fli ? (pts) => this.flipper(pts) : (pts) => pts;
    const pts = this.tranpoly(
      p0,
      p1,
      f([P(-0.3, 0.5), P(-1.1, 0.5), P(-1.2, 0.6), P(-1.1, 0.7), P(-0.3, 0.8), P(0.3, 0.8), P(1.0, 0.7), P(1.3, 0.6), P(1.2, 0.5), P(0.3, 0.5)])
    );
    return [this.poly(pts, { fil: C.ink(0.8), str: C.ink(0.8), wid: 1 })];
  };
}

if (!ShanShuiEngineV5.prototype.stick01) {
  ShanShuiEngineV5.prototype.stick01 = function (p0, p1, fli = false) {
    const f = fli ? (pts) => this.flipper(pts) : (pts) => pts;
    const seed = this.r();
    const qlist1 = [];
    const l = 3;
    for (let i = 0; i < 15; i++) {
      const fi = i;
      qlist1.push(P(-0.3 + Math.sin((fi / 15) * Math.PI) * 0.1 + this.n(fi * 0.1, seed) * 0.05, 0.5 - (fi / 15) * l));
    }
    return [this.poly(this.tranpoly(p0, p1, f(qlist1)), { str: C.ink(0.5), wid: 1 })];
  };
}

if (!ShanShuiEngineV5.prototype.man) {
  ShanShuiEngineV5.prototype.man = function (x, y, opts = {}) {
    const {
      fli = true,
      sca = 0.5,
      ang = [0, -Math.PI / 2, this.e.normRand(0, 0), (Math.PI / 4) * this.r(), ((Math.PI * 3) / 4) * this.r(), (Math.PI * 3) / 4, -Math.PI / 4, (-Math.PI * 3) / 4, (-Math.PI / 4) * this.r()],
      ite = 0,
      hat = 1,
      len: lenIn = [0, 30, 20, 30, 30, 30, 30, 30, 30],
    } = opts;
    const len = lenIn.map((v) => v * sca);
    const canv = [];
    const sct = {
      0: { 1: { 2: {}, 5: { 6: {} }, 7: { 8: {} } }, 3: { 4: {} } },
    };
    const toGlobal = (v) => P((fli ? -1 : 1) * v.x + x, v.y + y);
    const pts = new Array(9).fill(P(0, 0));
    const walk = (par, tree) => {
      for (const kStr of Object.keys(tree)) {
        const k = Number(kStr);
        let a = 0;
        let cur = k;
        while (true) {
          a += ang[cur];
          if (cur === 0) break;
          // find parent
          if (cur === 1 || cur === 3) cur = 0;
          else if (cur === 2 || cur === 5 || cur === 7) cur = 1;
          else if (cur === 6) cur = 5;
          else if (cur === 8) cur = 7;
          else if (cur === 4) cur = 3;
          else break;
        }
        pts[k] = P(pts[par].x + len[k] * Math.cos(a), pts[par].y + len[k] * Math.sin(a));
        walk(k, tree[k]);
      }
    };
    walk(0, sct[0]);
    const gpts = pts.map(toGlobal);
    if (ite === 1) canv.push(...this.stick01(gpts[6], gpts[8], fli));
    canv.push(this.poly([gpts[1], gpts[5], gpts[6]], { str: C.ink(0.5), wid: 1.5 }));
    canv.push(this.poly([gpts[1], gpts[7], gpts[8]], { str: C.ink(0.5), wid: 1.5 }));
    const body = tubifyP([gpts[0], gpts[1], gpts[3], gpts[4]], (t) => Math.sin(t * Math.PI) * 8 * sca);
    canv.push(this.poly(body[0].concat(body[1].slice().reverse()), { fil: C.white, str: C.ink(0.6), wid: 1.5 }));
    const sleeve = tubifyP([gpts[1], gpts[5], gpts[6]], (t) => Math.sin(t * Math.PI) * 6 * sca);
    canv.push(this.poly(sleeve[0].concat(sleeve[1].slice().reverse()), { fil: C.white, str: C.ink(0.6), wid: 1.5 }));
    const head = this.tranpoly(
      gpts[1],
      gpts[2],
      (fli ? (p) => this.flipper(p) : (p) => p)([
        P(-0.3, 0.2),
        P(-0.4, 0.5),
        P(-0.3, 0.8),
        P(0, 0.9),
        P(0.3, 0.8),
        P(0.35, 0.5),
        P(0.3, 0.2),
      ])
    );
    canv.push(this.poly(head, { fil: C.white, str: C.ink(0.6), wid: 1.5 }));
    if (hat === 1) canv.push(...this.hat01(gpts[1], gpts[2], fli));
    else if (hat === 2) canv.push(...this.hat02(gpts[1], gpts[2], fli));
    return canv;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════
//  1. ShanShuiPaintingBoats.swift — 舟楫 (乌篷 / 芦舟 / 渔舟 / 缆桩)
// ═══════════════════════════════════════════════════════════════════════════

function PaintingBoatForm(hull, covered) {
  return { hull, covered };
}

Object.assign(ShanShuiEngineV5.prototype, {
  paintingBoatForm(kind) {
    const hull = Math.trunc(this.r() * 65536) % 3;
    return PaintingBoatForm(hull, kind === "mooredBoat" ? this.r() < 0.5 : hull !== 0);
  },

  paintingBoat(kind, mooring = true) {
    const spec = this.paintingBoatForm(kind);
    const form = spec.hull;
    const w = [116.0, 146.0, 172.0][form];
    const depth = [9.0, 13.0, 11.0][form];
    const covered = spec.covered;
    const rail = this.inkCurve([P(0, 85), P(w * 0.23, 93), P(w * 0.70, 94), P(w, 82)]);
    const bottom = this.inkCurve([
      P(w, 82),
      P(w * 0.82, 96 + depth * 0.45),
      P(w * 0.30, 95 + depth),
      P(w * 0.08, 96),
      P(0, 85),
    ]);
    const hull = rail.concat(bottom.slice(1));
    let c = [this.poly(hull, { fil: C.white, str: null })];
    c.push(...this.inkLine(rail, 1.5, 0.78, 0.32));
    c.push(...this.inkLine(bottom, 1.7, 0.77, 0.4));
    c.push(...this.inkLine(
      this.inkCurve([P(5, 88), P(w * 0.27, 96), P(w * 0.72, 97), P(w - 5, 87)]),
      0.65,
      0.47,
      0.45
    ));
    for (const t of [0.19, 0.77]) {
      c.push(...this.inkLine([P(w * t, 94), P(w * t + 9, 96)], 1.0, 0.57, 0.35));
    }
    const canopy = (kind === "boat" || kind === "mooredBoat") ? covered : (kind === "angler" && form === 2);
    if (canopy) {
      const x = kind === "angler" ? w * 0.14 : w * 0.35;
      const length = form === 1 ? w * 0.35 : w * 0.29;
      const height = form === 1 ? 23.0 : 18.0;
      const cover = this.inkCurve([
        P(x, 93),
        P(x + 5, 93 - height * 0.75),
        P(x + 15, 93 - height),
        P(x + length - 10, 93 - height),
        P(x + length, 93),
      ]);
      c.push(this.poly(cover, { fil: C.white, str: null }));
      c.push(...this.inkLine(cover, 1.1, 0.65, 0.36));
      for (let k = 0; k < 4; k++) {
        const dx = (Number(k) * (length - 15)) / 4;
        c.push(...this.inkLine(
          this.inkCurve([P(x + dx + 2, 93), P(x + dx + 5, 93 - height * 0.7), P(x + dx + 14, 93 - height)]),
          0.65,
          0.47,
          0.4
        ));
      }
      const mouth = this.inkCurve([
        P(x + length - 17, 93),
        P(x + length - 14, 93 - height * 0.70),
        P(x + length - 9, 93 - height * 0.77),
        P(x + length - 2, 93),
      ]);
      c.push(this.poly(mouth, { fil: C.gray(0, 0.34), str: null }));
    }
    if (kind === "angler") {
      const seated = form !== 1;
      const scale = 0.72;
      const personX = w * (form === 2 ? 0.61 : 0.32);
      const foot = seated ? 34.0 : 44.0;
      const position = (p) => P(personX + (p.x - 44) * scale, 93 + (p.y - foot) * scale);
      const personPolys = this.paintingPerson(true, seated ? 3 : 1, false).map((p) => {
        const q = clonePoly(p);
        q.p = p.p.map(position);
        q.pts = q.p;
        q.wid *= scale;
        return q;
      });
      c.push(...personPolys);
      for (let k = 0; k < 4; k++) {
        c.push(...this.inkLine(
          [position(P(39 + Number(k) * 2, 14)), position(P(34 + Number(k) * 3, seated ? 27 : 33))],
          0.9,
          0.56,
          0.58
        ));
      }
      const hand = position(P(55, 24));
      const tip = P(w + 10, form === 1 ? 43 : 53);
      c.push(...this.inkLine(this.inkCurve([hand, P((hand.x + tip.x) / 2, tip.y - 3), tip]), 0.85, 0.73, 0.32));
      c.push(...this.inkLine(this.inkCurve([tip, P(tip.x + 4, 78), P(tip.x + 2, 108)]), 0.45, 0.43, 0.38));
    } else if (kind === "sail") {
      const mast = w * 0.43;
      const sailH = [79.0, 52.0, 92.0][form];
      const sailW = [43.0, 40.0, 57.0][form];
      const top = 78 - sailH;
      c.push(...this.inkLine([P(mast, 94), P(mast - 1, top - 7)], 1.6, 0.78, 0.32));
      const luff = (t) => P(mast - 9 + t * 3, top + sailH * t);
      const leech = (t) => P(mast + sailW * (0.52 + 0.48 * Math.sin(t * Math.PI * 0.85)), top - 5 + sailH * t);
      const panels = form === 1 ? 5 : 7;
      const edge = [];
      for (let i = 0; i <= panels; i++) {
        edge.push(leech(Number(i) / Number(panels)));
      }
      const sail = [luff(0)].concat(edge, [luff(1), luff(0)]);
      c.push(this.poly(sail, { fil: C.white, str: null }));
      c.push(...this.inkEdges(sail, 0.9, 0.58, 0.35));
      for (let k = 0; k <= panels; k++) {
        const t = Number(k) / Number(panels);
        c.push(...this.inkLine([luff(t), leech(t)], 0.85, 0.62, 0.32));
      }
      c.push(...this.inkLine([leech(1), P(w * 0.83, 92)], 0.55, 0.45, 0.4));
    } else if (form === 0 || (kind === "boat" && this.r() < 0.4)) {
      const px = w * 0.23;
      const scale = 0.53;
      const personPolys = this.paintingPerson(true, form === 0 ? 1 : 3, false).map((p) => {
        const q = clonePoly(p);
        q.p = p.p.map((pt) => P(px + (pt.x - 44) * scale, 92 + (pt.y - (form === 0 ? 44 : 34)) * scale));
        q.pts = q.p;
        q.wid *= scale;
        return q;
      });
      c.push(...personPolys);
      c.push(...this.inkLine([P(px + 4, 80), P(px - 15, 109)], 1.0, 0.63));
    }
    if (kind === "mooredBoat" && mooring) {
      c.push(...this.paintingMooring(P(0, 85), P(-24, 83), 1.0));
      c.push(...this.inkLine([P(-34, 84), P(-22, 85), P(-12, 83)], 0.85, 0.38, 0.5));
    }
    for (const [start, end, y] of [[0.15, 0.54, 111.0], [0.53, 0.91, 115.0]]) {
      c.push(...this.inkLine([P(w * start, y), P(w * end, y)], 0.7, 0.29, 0.5));
    }
    return c;
  },

  paintingMooring(bow, postFoot, size = 1.0) {
    const knot = P(postFoot.x, postFoot.y - 10 * size);
    let c = this.inkLine([P(postFoot.x, postFoot.y - 15 * size), postFoot], 2 * size, 0.78, 0.3);
    c.push(...this.inkLine(
      this.inkCurve([bow, P((bow.x + knot.x) * 0.5, (bow.y + knot.y) * 0.5 + 4 * size), knot]),
      0.7 * size,
      0.60,
      0.3
    ));
    c.push(...this.inkLine([P(knot.x - 2 * size, knot.y), P(knot.x + 2 * size, knot.y + size)], 1.1 * size, 0.75));
    return c;
  },
});

// ═══════════════════════════════════════════════════════════════════════════
//  2. ShanShuiPaintingBridge.swift — 水乡长桥与倒影
// ═══════════════════════════════════════════════════════════════════════════

class PaintingBridge {
  constructor(kind, width, rise, railing, pedestrian) {
    this.kind = kind; // 'arch' | 'slab' | 'timber'
    this.width = width;
    this.rise = rise;
    this.railing = railing;
    this.pedestrian = pedestrian;
  }
  get deck() {
    const pts = [];
    for (let i = 0; i <= 36; i++) {
      const t = Number(i) / 36;
      pts.push(P(this.width * t, this.kind === 'arch' ? 54 - Math.sin(t * Math.PI) * (this.rise + 4) : 42 + t));
    }
    return pts;
  }
  get arch() {
    const pts = [];
    for (let i = 0; i <= 36; i++) {
      const t = Number(i) / 36;
      pts.push(P(this.width * (0.10 + 0.80 * t), 60 - Math.sin(t * Math.PI) * this.rise));
    }
    return pts;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  3. ShanShuiPaintingBamboo.swift — 墨竹与青草
// ═══════════════════════════════════════════════════════════════════════════

Object.assign(ShanShuiEngineV5.prototype, {
  paintingBamboo() {
    let c = [];
    const form = Math.trunc(this.r() * 65536) % 3;
    const stalks = 3 + (Math.trunc(this.r() * 65536) % 3);
    const wind = form === 1 ? -24.0 : form === 2 ? 24.0 : 0.0;
    for (let k = 0; k < stalks; k++) {
      const far = k === 0;
      const x = 20 + (Number(k) * 80) / Number(stalks - 1);
      const height = 104 + this.r() * 59;
      const lean = wind + (this.r() - 0.5) * 20;
      const tone = far ? 0.30 : 0.60 + this.r() * 0.18;
      const joints = 5 + (k % 2);
      const point = (t) => P(x + lean * t, 175 - height * t);
      for (let j = 0; j < joints; j++) {
        const t = Number(j) / Number(joints);
        const next = Number(j + 1) / Number(joints);
        c.push(...this.inkLine([point(t + 0.006), point(next - 0.005)], far ? 1.6 : 2.4, tone, 0.28, "even"));
        if (j > 0) {
          const p = point(t);
          c.push(...this.inkLine([P(p.x - 2.5, p.y + 0.5), P(p.x, p.y - 0.4), P(p.x + 2.6, p.y + 0.4)], 0.9, Math.min(0.90, tone + 0.18), 0.25));
        }
      }
      const clusters = far ? 2 : 3 + (k % 2);
      for (let q = 0; q < clusters; q++) {
        const t = 0.36 + (Number(q) * 0.56) / Number(Math.max(1, clusters - 1));
        const base = point(t);
        const side = (q % 2 === k % 2) ? -1.0 : 1.0;
        const end = P(base.x + side * (14 + this.r() * 10), base.y - 4 - this.r() * 7);
        c.push(...this.inkLine([base, end], 0.65, tone, 0.25));
        const bCount = (q % 2 === 0) ? 3 : 4;
        for (let b = 0; b < bCount; b++) {
          const root = P(end.x + side * Number(b) * 1.3, end.y + Number(b) * 0.4);
          const a = -0.45 + Number(b) * 0.51 + (this.r() - 0.5) * 0.16;
          const length = 13 + this.r() * 10;
          const tip = P(root.x + side * Math.cos(a) * length, root.y + Math.sin(a) * length + wind * 0.09);
          c.push(...this.inkLine([root, P((root.x + tip.x) / 2, (root.y + tip.y) / 2 + 1.2), tip], 2.4 + this.r() * 1.3, tone + 0.05, 0.18, "lens"));
        }
      }
    }
    return c;
  },

  paintingGrass() {
    let c = [];
    const count = 2 + (Math.trunc(this.r() * 65536) % 4);
    for (let k = 0; k < count; k++) {
      const root = P(10 + Number(k) * (19 + this.r() * 8), 22 + this.r() * 4);
      const jCount = 4 + Math.trunc(this.r() * 3);
      for (let j = 0; j < jCount; j++) {
        const spread = (Number(j) - 2) * (2 + this.r() * 2);
        const tip = P(root.x + spread, root.y - 5 - this.r() * 11);
        c.push(...this.inkLine(this.inkCurve([root, P(root.x + spread * 0.3, root.y - 5), tip]), 1.5 + this.r(), 0.55 + this.r() * 0.3, 0.35, "cone"));
      }
      c.push(...this.inkLine([P(root.x - 4, root.y + 1), P(root.x + 5, root.y)], 1.6, 0.75, 0.45));
    }
    return c;
  },

  paintingPineNeedles(x, y, width, height) {
    let c = [];
    const clusters = 3 + Math.trunc(this.r() * 3);
    for (let k = 0; k < clusters; k++) {
      const p = P(
        x - width * 0.30 + (Number(k) * width * 0.60) / Number(clusters - 1),
        y + (this.r() - 0.4) * height * 0.6
      );
      const radius = 7 + this.r() * 7;
      const start = -Math.PI * (0.92 + this.r() * 0.12);
      const spread = (k % 3 === 0) ? Math.PI * 1.4 : Math.PI * 0.95;
      for (let j = 0; j < 13; j++) {
        const a = start + (Number(j) / 12) * spread;
        const end = P(p.x + Math.cos(a) * radius * (0.8 + this.r() * 0.2), p.y + Math.sin(a) * radius * (0.8 + this.r() * 0.2));
        c.push(...this.inkLine([end, p], 0.62 + this.r() * 0.28, 0.52 + this.r() * 0.3, 0.3));
      }
      c.push(...this.inkBlot(p.x, p.y, 1.0, 0.5, 0, 0.8));
    }
    if (this.landscapeSeed) return this.paintingLandscapeCrown(x, y, width, height, true);
    return this.paintedStudySeed ? this.paintingStudyCrown(c, x, y, width, height, true) : c;
  },
});

// ═══════════════════════════════════════════════════════════════════════════
//  4. ShanShuiPaintingOldTrees.swift — 寒林古木 (蟹爪枝 / 老藤 / 宿鸟)
// ═══════════════════════════════════════════════════════════════════════════

Object.assign(ShanShuiEngineV5.prototype, {
  paintingWoodyTree(old) {
    const root = old ? P(65, 175) : P(66, 178);
    const form = Math.trunc(this.r() * 65536) % 3;
    const direction = this.r() < 0.5 ? -1.0 : 1.0;
    const lean = direction * (form === 1 ? 43 + this.r() * 16 : 12 + this.r() * 17);
    const height = 135 + this.r() * 22;
    const girth = old ? 19 + this.r() * 7 : 8 + this.r() * 3;
    const joints = [
      root,
      P(root.x - direction * 5, root.y - height * 0.20),
      P(root.x + direction * (old ? 14 : 6), root.y - height * 0.43),
      P(root.x + lean * 0.45 - direction * 6, root.y - height * 0.66),
      P(root.x + lean * 0.78, root.y - height * 0.84),
      P(root.x + lean, root.y - height),
    ];
    const spine = this.inkCurve(joints, 10);
    const at = (t) => spine[Math.min(spine.length - 1, Math.max(0, Math.trunc(t * (spine.length - 1))))];

    const branchStroke = (path, width, tone) => {
      const left = [];
      const right = [];
      for (let i = 0; i < path.length; i++) {
        const t = path.length > 1 ? Number(i) / Number(path.length - 1) : 0;
        const pNext = path[Math.min(i + 1, path.length - 1)];
        const pPrev = path[Math.max(0, i - 1)];
        const delta = P(pNext.x - pPrev.x, pNext.y - pPrev.y);
        const length = Math.max(0.001, Math.hypot(delta.x, delta.y));
        const pressure = Math.pow(1 - t, 0.85) * (0.94 + 0.06 * Math.sin(t * 19));
        const offset = P(
          (-delta.y * (width * pressure * 0.5)) / length,
          (delta.x * (width * pressure * 0.5)) / length
        );
        left.push(P(path[i].x + offset.x, path[i].y + offset.y));
        right.push(P(path[i].x - offset.x, path[i].y - offset.y));
      }
      let marks = [this.poly(left.concat(right.reverse()), { fil: C.gray(0, tone), str: null })];
      if (width > 2.5) {
        const split = path.slice(2, Math.trunc(path.length / 2));
        if (split.length > 1) {
          marks.push(...this.inkLine(split, width * 0.13, 0.22, 0.65, "cone"));
        }
      }
      return marks;
    };

    const terminals = (tip, side, pale) => {
      let tips = [];
      const count = 2 + Math.trunc(this.r() * 2);
      for (let j = 0; j < count; j++) {
        const spread = count > 1 ? Number(j) / Number(count - 1) : 0;
        const origin = tip;
        const reach = 2.5 + this.r() * 2 + spread;
        let end, bend;
        if (form === 0) {
          bend = P(origin.x + side * reach * (0.5 + spread * 0.5), origin.y - 1.5 + spread);
          end = P(bend.x - side * (0.5 + this.r() * 1.5), bend.y + 2 + this.r() * 2);
        } else {
          bend = P(origin.x + side * (spread - 0.15) * reach, origin.y - reach * 0.55);
          end = P(bend.x + side * (spread - 0.4) * 3, bend.y - 2 - this.r() * 3);
        }
        tips.push(...branchStroke(this.inkCurve([origin, bend, end]), 0.45 + this.r() * 0.25, pale));
      }
      return tips;
    };

    let c = [];
    let frontBranches = [];
    const perches = [];
    const branches = form === 2 ? 6 : 5;
    for (let k = 0; k < branches; k++) {
      const t = 0.30 + (Number(k) * 0.60) / Number(branches - 1);
      const from = at(t);
      const side = (k === 1 || k === 4) ? -direction : direction;
      const sparse = side !== direction;
      const reach = (32 + this.r() * 20) * (sparse ? 0.66 : 1.0) * (1.14 - t * 0.42);
      const rise = (form === 0 ? 14.0 : 26.0) + this.r() * 13;
      const elbow = P(from.x + side * reach * 0.55, from.y - rise * 0.55);
      const tip = P(from.x + side * reach, from.y - rise);
      const limb = this.inkCurve([from, P(from.x + side * reach * 0.22, from.y - rise * 0.12), elbow, tip]);
      const foreground = k === 0 || k === 3;
      let branch = branchStroke(limb, (old ? 6.5 : 3.8) * (1 - t * 0.55), foreground ? 0.77 : 0.61);
      perches.push(elbow);
      const forks = sparse ? 1 : 2;
      for (let j = 0; j < forks; j++) {
        const u = 0.40 + Number(j) * 0.23;
        const origin = limb[Math.trunc(u * (limb.length - 1))];
        const length = 12 + this.r() * 10;
        const end = P(
          origin.x + side * length * (j % 2 === 0 ? 0.60 : 0.95),
          origin.y - length * (j % 2 === 0 ? 1.05 : 0.30)
        );
        const secondary = this.inkCurve([origin, P(origin.x + (end.x - origin.x) * 0.48 - side * 2, origin.y + (end.y - origin.y) * 0.48 + 1), end]);
        branch.push(...branchStroke(secondary, 1.5 + this.r() * 0.7, foreground ? 0.61 : 0.50));
        const twigRoot = secondary[Math.trunc(secondary.length / 2)];
        const twigEnd = P(twigRoot.x + side * (5 + this.r() * 6), twigRoot.y - 4 - this.r() * 7);
        branch.push(...branchStroke(
          this.inkCurve([twigRoot, P((twigRoot.x + twigEnd.x) / 2 + side * 1.5, (twigRoot.y + twigEnd.y) / 2 + 1), twigEnd]),
          0.8 + this.r() * 0.3,
          0.46
        ));
        branch.push(...terminals(twigEnd, side, 0.37));
        branch.push(...terminals(end, side, 0.43));
      }
      branch.push(...terminals(tip, side, 0.43));
      if (foreground) frontBranches.push(...branch);
      else c.push(...branch);
    }

    const crown = at(1);
    for (const side of [-direction, direction]) {
      const end = P(crown.x + side * (7 + this.r() * 6), crown.y - 6 - this.r() * 5);
      c.push(...branchStroke(this.inkCurve([at(0.92), crown, end]), 1.4, 0.50));
      c.push(...terminals(end, side, 0.39));
    }

    const left = spine.map((p, i) => {
      const t = spine.length > 1 ? Number(i) / Number(spine.length - 1) : 0;
      return P(p.x - girth * 0.5 * Math.pow(1 - t, 0.8), p.y);
    });
    const right = spine.map((p, i) => {
      const t = spine.length > 1 ? Number(i) / Number(spine.length - 1) : 0;
      return P(p.x + girth * 0.5 * Math.pow(1 - t, 0.8), p.y);
    });
    c.push(this.poly(left.concat(right.slice().reverse()), { fil: C.white, str: null }));
    c.push(...this.inkLine(left, old ? 2.4 : 1.6, 0.78, 0.4));
    c.push(...this.inkLine(right.slice().reverse(), old ? 3.5 : 2.0, 0.88, 0.36));
    for (let k = 0; k < 4; k++) {
      const start = 0.08 + Number(k) * 0.19;
      const run = [];
      for (let j = 0; j <= 10; j++) {
        const t = start + Number(j) * 0.012;
        const pt = at(t);
        run.push(P(pt.x + girth * (0.14 + 0.1 * Math.sin(t * 20)), pt.y));
      }
      c.push(...this.inkLine(run, old ? 2.0 : 0.8, 0.5, 0.65));
    }
    if (old) {
      for (const t of [0.26, 0.54, 0.73]) {
        const pt = at(t);
        const p = P(pt.x - girth * 0.12, pt.y);
        const radius = girth * (1 - t) * 0.24;
        const knot = [];
        for (let i = 0; i <= 20; i++) {
          const a = (Number(i) * Math.PI) / 10;
          knot.push(P(p.x + Math.cos(a) * radius, p.y + Math.sin(a) * radius * 1.7));
        }
        c.push(...this.inkLine(knot, 1.2, 0.72, 0.42));
        c.push(...this.inkLine([P(p.x, p.y - radius), P(p.x + 0.5, p.y + radius)], 1.2, 0.85));
      }
    }
    for (const dx of [-15.0, -6.0, 12.0]) {
      c.push(...this.inkLine(
        this.inkCurve([P(root.x + dx * 0.15, root.y - 13), P(root.x + dx * 0.5, root.y - 1), P(root.x + dx, root.y + 3)]),
        old ? 3.4 : 2.0,
        0.76,
        0.42,
        "cone"
      ));
    }
    c.push(...frontBranches);

    let vine = [];
    for (let k = 0; k < 4; k++) {
      const start = 0.13 + Number(k) * 0.17;
      const wrap = [];
      for (let j = 0; j <= 18; j++) {
        const u = Number(j) / 18;
        const t = start + u * 0.13;
        const pt = at(t);
        wrap.push(P(pt.x + Math.cos(u * Math.PI) * girth * (1 - t) * 0.70, pt.y));
      }
      vine.push(...this.inkLine(wrap, 1.0, 0.72, 0.35));
    }
    const perchesPrefix = perches.slice(0, form === 2 ? 2 : 1);
    for (const perch of perchesPrefix) {
      const drop = Math.min(58 + this.r() * 15, root.y - perch.y - 4);
      const loop = this.inkCurve([
        P(perch.x - 7, perch.y + 4),
        P(perch.x - 3, perch.y - 4),
        P(perch.x + 5, perch.y - 2),
        P(perch.x + 9, perch.y + 17),
        P(perch.x + 3, perch.y + 37),
        P(perch.x + 11, perch.y + drop),
      ]);
      vine.push(...this.inkLine(loop, 0.9, 0.68, 0.4));
      for (const p of loop.slice(0, 15)) {
        if (this.r() < 0.2) {
          vine.push(...this.inkLine([p, P(p.x + 3, p.y + 2)], 2.0, 0.8, 0.14, "lens"));
        }
      }
    }
    return { canvas: c, vine, perches };
  },
});

// ═══════════════════════════════════════════════════════════════════════════
//  5. ShanShuiPaintingPlants.swift — 草木与荷塘 (松 / 柳 / 枫 / 枯木 / 荷叶)
// ═══════════════════════════════════════════════════════════════════════════

Object.assign(ShanShuiEngineV5.prototype, {
  paintingLeaves(x, y, width, height, needles = false, flowering = false, style = "dots") {
    if (needles) return this.paintingPineNeedles(x, y, width, height);
    let c = [];
    for (let i = 0; i < 6; i++) {
      c.push(...this.inkBlot(
        x + (this.r() - 0.5) * width * 0.65,
        y + (this.r() - 0.5) * height * 0.6,
        width * (0.18 + this.r() * 0.1),
        (height / width) * 0.65,
        (this.r() - 0.5) * 0.4,
        0.08 + this.r() * 0.06
      ));
    }
    const count = needles ? 24 : 32;
    for (let i = 0; i < count; i++) {
      const a = this.r() * 2 * Math.PI;
      const rad = Math.sqrt(this.r());
      const px = x + (Math.cos(a) * width * rad) / 2;
      const py = y + (Math.sin(a) * height * rad) / 2;
      if (needles) {
        for (let k = 0; k < 3; k++) {
          const angle = -Math.PI * (0.12 + Number(k) * 0.25 + this.r() * 0.16);
          c.push(...this.inkLine(
            [P(px + Math.cos(angle) * (3 + this.r() * 4), py + Math.sin(angle) * (3 + this.r() * 4)), P(px, py)],
            0.55 + this.r() * 0.45,
            0.45 + this.r() * 0.35,
            0.30
          ));
        }
      } else if (flowering) {
        const open = this.r() < 0.75;
        c.push(...this.inkBlot(
          px,
          py,
          open ? 1.9 + this.r() * 1.1 : 1.0 + this.r() * 0.5,
          0.8 + this.r() * 0.2,
          this.r() * 3,
          open ? 0.08 + this.r() * 0.08 : 0.30
        ));
        if (open) {
          c.push(...this.inkBlot(px + 0.2, py + 0.1, 0.45, 0.9, 0, 0.70));
        }
      } else if (style === "flat") {
        c.push(...this.inkBlot(
          px,
          py,
          2.2 + this.r() * 2.2,
          0.28 + this.r() * 0.12,
          (this.r() - 0.5) * 0.25,
          0.40 + this.r() * 0.35
        ));
      } else if (style === "ge") {
        if (this.r() < 0.6) {
          for (let k = 0; k < 3; k++) {
            const ang = -Math.PI / 2 + (Number(k) - 1) * 0.75 + (this.r() - 0.5) * 0.3;
            c.push(...this.inkLine(
              [P(px, py), P(px + Math.cos(ang) * (3 + this.r() * 2), py - Math.sin(ang) * -(3 + this.r() * 2))],
              1.4 + this.r() * 0.8,
              0.45 + this.r() * 0.35,
              0.15,
              "lens"
            ));
          }
        }
      } else {
        c.push(...this.inkBlot(
          px,
          py,
          1.3 + this.r() * 2.7,
          0.35 + this.r() * 0.45,
          -0.8 + this.r() * 1.5,
          0.42 + this.r() * 0.4
        ));
      }
    }
    if (this.landscapeSeed && !flowering) return this.paintingLandscapeCrown(x, y, width, height, false);
    return this.paintedStudySeed && !flowering ? this.paintingStudyCrown(c, x, y, width, height, false) : c;
  },

  paintingTree(kind) {
    if (kind === "oldTree" || kind === "bareTree") return this.paintingWoodyTree(kind === "oldTree").canvas;
    if (kind === "blossom") return this.paintingFloweringTree();
    const bare = kind === "bareTree";
    const pine = kind === "pine";
    const willow = kind === "willow";
    const flowering = kind === "blossom";
    const leaf = kind === "layeredTree" ? "flat" : kind === "maple" ? "ge" : "dots";

    const leaning = !willow && this.r() < 0.3;
    const twin = !pine && !willow && this.r() < 0.3;
    const breadth = 0.75 + this.r() * 0.6;
    const height = (pine ? 132.0 : 150.0) * (leaning ? 0.85 : 1.0) + this.r() * 20;
    const lean = (this.r() - 0.5) * (willow ? 60.0 : pine ? 65.0 : 28.0) + (leaning ? (this.r() < 0.5 ? -1.0 : 1.0) * 55.0 : 0.0);
    const joints = [P(66, 178)];
    const segments = 5;
    for (let k = 1; k <= segments; k++) {
      const t = Number(k) / Number(segments);
      const wander = (this.r() - 0.5) * (pine || bare ? 16 : 10);
      joints.push(P(66 + lean * Math.pow(t, willow ? 0.7 : 1.3) + wander * (1 - t * 0.5), 178 - height * t));
    }
    const spine = this.inkCurve(joints);
    const spinePoint = (t) => spine[Math.min(spine.length - 1, Math.max(0, Math.trunc(t * (spine.length - 1))))];

    let c = [];
    const limbs = willow ? 4 : pine ? 4 + Math.trunc(this.r() * 3) : 5 + Math.trunc(this.r() * 3);
    let side = this.r() < 0.5 ? -1.0 : 1.0;
    const tips = [];
    for (let k = 0; k < limbs; k++) {
      const t = (pine ? 0.30 : 0.38) + (0.55 * (Number(k) + this.r() * 0.5)) / Number(limbs);
      const origin = spinePoint(t);
      if (this.r() < 0.7) side = -side;
      const span = (pine ? 40 + this.r() * 30 : 26 + this.r() * 24) * (1.1 - t * 0.6) * breadth;
      const rise = pine ? -2 + this.r() * 6 : bare ? 14 + this.r() * 14 : 10 + this.r() * 16;
      const joint = P(origin.x + side * span * 0.5, origin.y - rise * 0.6);
      let tip = P(origin.x + side * span, origin.y - rise);
      if (bare) tip = P(tip.x + side * 4, tip.y + 6 + this.r() * 6);
      if (pine) tip = P(tip.x, tip.y + 3 + this.r() * 3);
      c.push(...this.inkLine(this.inkCurve([origin, joint, tip]), Math.max(1.2, 3.6 - t * 2.4), 0.72, bare ? 0.45 : 0.3));
      const twigCount = 2 + Math.trunc(this.r() * 2);
      for (let j = 0; j < twigCount; j++) {
        const u = 0.45 + this.r() * 0.5;
        const from = P(origin.x + (tip.x - origin.x) * u, origin.y + (tip.y - origin.y) * u);
        const to = P(from.x + side * (5 + this.r() * 9), from.y - (pine ? this.r() * 3 : 6 + this.r() * 8) + (bare ? 3 : 0));
        c.push(...this.inkLine([from, to], 0.8, 0.6, 0.45));
        if (!pine) tips.push([to, side]);
      }
      tips.push([tip, side]);
    }

    if (!bare && !willow) {
      if (pine) {
        for (const [p] of tips) {
          if (this.r() < 0.94) {
            c.push(...this.paintingLeaves(p.x, p.y - 2, 40 + this.r() * 16, 13 + this.r() * 5, true));
          }
        }
        const top = spine[spine.length - 1];
        c.push(...this.paintingLeaves(top.x, top.y + 4, 54, 16, true));
      } else {
        const center = spinePoint(0.78);
        for (const [p] of tips) {
          const q = P(p.x + (center.x - p.x) * 0.15, p.y + (center.y - p.y) * 0.15);
          c.push(...this.paintingLeaves(
            q.x,
            q.y - 3,
            (26 + this.r() * 14) * breadth,
            leaf === "flat" ? 12 + this.r() * 6 : 20 + this.r() * 10,
            false,
            flowering,
            leaf
          ));
        }
        c.push(...this.paintingLeaves(
          center.x,
          center.y - 18,
          40 * breadth,
          leaf === "flat" ? 16 : 30,
          false,
          flowering,
          leaf
        ));
      }
    }

    c.push(...this.inkLine(spine, pine ? 10.5 : 6.6, 0.85, 0.42, "cone"));
    if (twin) {
      const fork = spinePoint(0.22);
      const sideFork = lean >= 0 ? -1.0 : 1.0;
      const stem = this.inkCurve([fork, P(fork.x + sideFork * 10, fork.y - 40), P(fork.x + sideFork * 16, fork.y - 90)]);
      c.push(...this.inkLine(stem, 4.4, 0.8, 0.45, "cone"));
      if (!bare) {
        const stemTop = stem[stem.length - 1];
        c.push(...this.paintingLeaves(stemTop.x, stemTop.y - 6, 34 * breadth, leaf === "flat" ? 14 : 24, false, flowering, leaf));
      }
    }
    for (const offset of [-2.0, 1.5]) {
      c.push(...this.inkLine(spine.map((pt) => P(pt.x + offset, pt.y + 1)), 0.7, 0.52, 0.72));
    }
    if (pine) {
      for (let k = 0; k < 15; k++) {
        const t = 0.06 + Number(k) * 0.048;
        const p = spinePoint(t);
        const radius = 2.7 * (1 - t * 0.6);
        const scale = [
          P(p.x - radius, p.y - 2),
          P(p.x - radius * 0.8, p.y + 2),
          P(p.x, p.y + 4),
          P(p.x + radius, p.y + 1),
          P(p.x + radius * 0.7, p.y - 2),
        ];
        c.push(...this.inkLine(scale, 0.9, 0.75, 0.38));
      }
    }
    for (const [dx, dy] of [[-13.0, 4.0], [9.0, 4.0], [-6.0, 6.0]]) {
      c.push(...this.inkLine([P(65, 167), P(65 + dx * 0.4, 177), P(65 + dx, 178 + dy)], 2.3, 0.6));
    }
    if (willow) {
      const crown = spinePoint(0.9);
      for (let k = 0; k < 18; k++) {
        const x = crown.x - 48 + Number(k) * 5.6 + (this.r() - 0.5) * 5;
        const y = crown.y - 6 + Math.pow((Number(k) - 9) / 9, 2) * 26 + this.r() * 5;
        const len = 55 + this.r() * 48;
        const line = this.inkCurve([P(x, y), P(x - 9, y + len * 0.42), P(x - 5, y + len)]);
        c.push(...this.inkLine(line, 0.75, 0.48, 0.15));
        const blotCount = 6 + Math.trunc(this.r() * 5);
        for (let b = 0; b < blotCount; b++) {
          const t = 0.06 + this.r() * 0.91;
          c.push(...this.inkBlot(
            x - 6 + Math.sin(t * 4) * 2,
            y + t * len,
            1.5 + this.r() * 1.5,
            0.25,
            -0.7 - this.r() * 0.5,
            0.32 + this.r() * 0.3
          ));
        }
      }
    }
    return this.landscapeSeed && pine ? this.paintingLandscapePine() : c;
  },

  paintingLotus() {
    return this.paintingLotusDrawing().canvas;
  },
});

// ═══════════════════════════════════════════════════════════════════════════
//  6. ShanShuiPaintingSpring.swift — 清泉石上流
// ═══════════════════════════════════════════════════════════════════════════

Object.assign(ShanShuiEngineV5.prototype, {
  paintingRockyStream() {
    const lean = this.r() < 0.5 ? -1.0 : 1.0;
    const bends = [
      P(60, 0),
      P(60 + lean * (14 + this.r() * 8), 48),
      P(60 - lean * (9 + this.r() * 12), 105),
      P(60 + lean * 12, 151),
      P(60, 205),
    ];
    const center = this.inkCurve(bends, 10);
    const edge = (side) => center.map((p) => {
      const t = p.y / 205;
      return P(p.x + side * (3 + t * 8), p.y);
    });
    let c = [this.poly(edge(-1).concat(edge(1).reverse()), { fil: C.white, str: null })];
    if(this.landscapeSeed) for(const side of [-1,1]) {
      const bank=edge(side);
      for(let k=0;k<bank.length-2;k+=8) c.push(...this.paintingBrushStroke(bank.slice(k,k+6),
        {width:1.2,ink:.35,moisture:.45,pressure:[.1,.7,.4,.05]}));
    }
    const count = 3 + (Math.trunc(this.r() * 65536) % 2);
    for (let k = 0; k < count; k++) {
      const t = Number(k) / Number(count);
      const index = Math.min(center.length - 1, Math.trunc(t * (center.length - 1)));
      const p = center[index];
      const gap = 4 + t * 8;
      for (const side of [-1.0, 1.0]) {
        const breadth = 16 + t * 22 + this.r() * 10;
        const inner = p.x + side * gap;
        const x0 = side < 0 ? inner - breadth : inner;
        c.push(...this.paintingStone(
          x0,
          x0 + breadth,
          p.y + (side < 0 ? 0 : 5 + this.r() * 10),
          Math.min(205, p.y + 43 + t * 16 + this.r() * 13),
          "cliff",
          1
        ));
      }
      if (k > 0) {
        const side = k % 2 === 0 ? -1.0 : 1.0;
        const x = p.x + side * gap * 0.4;
        const lip = [P(x - gap * 0.7, p.y + 31), P(x, p.y + 29), P(x + gap * 0.6, p.y + 30)];
        c.push(...this.inkLine(lip, 1.2, 0.55, 0.48));
        for (let j = 0; j < 2; j++) {
          const start = P(x + Number(j) * 3, p.y + 32);
          c.push(...this.inkLine([start, P(start.x - 1, start.y + 5 + t * 4)], 0.7, 0.25, 0.5));
        }
        c.push(...this.inkLine([P(p.x - gap * 0.5, p.y + 43), P(p.x + gap * 0.4, p.y + 44)], 0.8, 0.36, 0.48));
      }
    }
    for (let j = 0; j < 3; j++) {
      const y = 187 + Number(j) * 6;
      c.push(...this.inkLine([P(51 - Number(j) * 2, y), P(62 + Number(j) * 3, y + 0.4)], 0.75, 0.29, 0.55));
    }
    return c;
  },
});

// ═══════════════════════════════════════════════════════════════════════════
//  7. ShanShuiPaintingFlowers.swift — 繁花盛开与荷叶姿态
// ═══════════════════════════════════════════════════════════════════════════

Object.assign(ShanShuiEngineV5.prototype, {
  paintingFloweringTree() {
    const plum = this.r() < 0.5;
    const branches = 3 + (Math.trunc(this.r() * 65536) % 3);
    const lean = (this.r() - 0.5) * 65;
    const trunk = this.inkCurve([
      P(66, 178),
      P(62, 149),
      P(73, 119),
      P(61 + lean * 0.4, 84),
      P(66 + lean, 30),
    ]);
    let c = this.inkLine(trunk, plum ? 7.5 : 5.0, 0.82, 0.4, "cone");
    c.push(...this.inkLine(trunk.map((pt) => P(pt.x - 1.5, pt.y)), 1.1, 0.4, 0.65));
    for (let k = 0; k < branches; k++) {
      const t = 0.32 + Number(k) * 0.14;
      const origin = trunk[Math.trunc(t * (trunk.length - 1))];
      const side = k % 2 === 0 ? -1.0 : 1.0;
      const elbow = P(origin.x + side * (18 + this.r() * 13), origin.y - 17 - this.r() * 14);
      const end = P(elbow.x + side * (13 + this.r() * 17), elbow.y - 16 - this.r() * 18);
      const limb = this.inkCurve([origin, elbow, end]);
      c.push(...this.inkLine(limb, 3.6 - Number(k) * 0.45, 0.8, 0.38, "cone"));
      for (let j = 0; j < 3; j++) {
        const from = limb[Math.trunc(((Number(j) + 1) * (limb.length - 1)) / 4)];
        const tip = P(from.x + side * (j === 1 ? -8 : 11), from.y - 12 - this.r() * 14);
        const twig = this.inkCurve([from, P(from.x + side * 4, from.y - 9), tip]);
        c.push(...this.inkLine(twig, 1.0, 0.67, 0.35));
        const flowers = plum ? 2 + Math.trunc(this.r() * 2) : 4 + Math.trunc(this.r() * 3);
        for (let f = 0; f < flowers; f++) {
          const u = Number(f + 1) / Number(flowers + 1);
          const branch = twig[Math.trunc(u * (twig.length - 1))];
          const p = P(branch.x + (f % 2 === 0 ? -3 : 3), branch.y - 1);
          if (this.r() < 0.23) {
            c.push(...this.inkBlot(p.x, p.y, 1.4, 0.8, 0, 0.65));
          } else {
            const radius = plum ? 1.4 + this.r() * 0.5 : 1.6 + this.r() * 0.7;
            for (let petal = 0; petal < 5; petal++) {
              const a = Number(petal) * Math.PI * 0.4;
              const center = P(p.x + Math.cos(a) * radius, p.y + Math.sin(a) * radius);
              const ring = [];
              for (let i = 0; i <= 8; i++) {
                const angle = (Number(i) * Math.PI) / 4;
                ring.push(P(center.x + Math.cos(angle) * radius * 0.72, center.y + Math.sin(angle) * radius * 0.72));
              }
              c.push(this.poly(ring, { fil: C.white, str: null }));
              c.push(...this.inkLine(ring, 0.55, plum ? 0.56 : 0.42, 0.25));
            }
            c.push(...this.inkBlot(p.x, p.y, 0.6, 1.0, 0, 0.8));
          }
        }
      }
    }
    for (const dx of [-8.0, 10.0]) {
      c.push(...this.inkLine([P(66, 169), P(66 + dx * 0.4, 177), P(66 + dx, 180)], 2.0, 0.7));
    }
    return c;
  },

  paintingLotusDrawing(stage = null) {
    const STAGES = ["young", "flowering", "spent"];
    const choice = Math.trunc(this.r() * 65536) % 3;
    stage = stage ?? STAGES[choice];
    const form = Math.trunc(this.r() * 65536) % 3;
    const count = stage === "young" ? 3 : 3 + (Math.trunc(this.r() * 65536) % (stage === "spent" ? 2 : 3));
    let c = [];
    for (let k = 0; k < count; k++) {
      const x = 25 + (Number(k) * 112) / Number(count - 1) + (this.r() - 0.5) * 10;
      const y = 67 + this.r() * 48;
      const rx = stage === "young" ? 13 + this.r() * 10 : 23 + this.r() * 15;
      const ry = stage === "young" ? 6 + this.r() * 6 : stage === "spent" ? 9 + this.r() * 8 : 12 + this.r() * 10;
      const tilt = (this.r() - 0.5) * 0.35;
      const phase = this.r() * 6;
      const placed = (p) => P(x + p.x * Math.cos(tilt) - p.y * Math.sin(tilt), y + p.x * Math.sin(tilt) + p.y * Math.cos(tilt));
      const stalk = stage === "spent" && k === 1
        ? [P(x + 2, 152), P(x - 5, y + 24), P(x + 0.6, y + 3)]
        : [P(x + 2, 150 + this.r() * 4), P(x + 0.6, y + 3)];
      c.push(...this.inkLine(stalk, 1.3 + this.r() * 0.6, 0.68, 0.28, "even"));
      for (let sy = y + 15; sy < 146; sy += 9) {
        c.push(...this.inkLine([P(x + 1, sy), P(x + (Math.trunc(sy) % 2 === 0 ? 2.8 : -0.8), sy - 0.8)], 0.8, 0.74, 0.2));
      }
      if (stage === "young" && k === 0) {
        const rolled = this.inkCurve([P(x, y + 6), P(x - 5, y - 6), P(x + 2, y - 31), P(x + 7, y - 4), P(x, y + 6)]);
        c.push(this.poly(rolled, { fil: C.gray(0, 0.48), str: null }));
        c.push(...this.inkLine([P(x + 2, y - 29), P(x + 1, y + 3)], 0.7, 0.8));
        continue;
      }
      const edge = [];
      for (let i = 0; i <= 64; i++) {
        const a = (Number(i) * Math.PI) / 32;
        let wave = 1 + 0.055 * Math.sin(a * 7 + phase) + 0.035 * Math.cos(a * 11);
        if (stage === "spent") {
          const tear = Math.abs(Math.atan2(Math.sin(a - phase), Math.cos(a - phase)));
          if (tear < 0.30) wave *= 0.35 + tear * 2;
          wave += 0.09 * Math.sin(a * 13 + phase);
        }
        edge.push(placed(P(Math.cos(a) * rx * wave, Math.sin(a) * ry * wave)));
      }
      const tone = stage === "spent" ? 0.16 + this.r() * 0.18 : 0.48 + (Number(k) / Number(count)) * 0.28 + this.r() * 0.12;
      c.push(this.poly(edge, { fil: C.white, str: null }));
      c.push(this.poly(edge, { fil: C.gray(0, tone), str: null }));
      const fold = this.inkCurve([
        placed(P(-rx * 0.92, -ry * 0.2)),
        placed(P(-rx * 0.2, -ry * 0.45)),
        placed(P(rx * 0.40, -ry * 0.08)),
        placed(P(rx * 0.92, -ry * 0.24)),
      ]);
      const foldRev = fold.slice().reverse().map((pt) => P(pt.x, pt.y + 0.75));
      c.push(this.poly(fold.concat(foldRev), { fil: C.white, str: null }));
      c.push(...this.inkLine(fold, 1.8, Math.min(0.88, tone + 0.18), 0.4));
      if (stage === "spent") {
        c.push(...this.inkLine(edge.slice(6, 29), 1.5, 0.68, 0.6));
        c.push(...this.inkLine(edge.slice(39, 60), 2.2, 0.75, 0.55));
        for (const j of [11, 20, 27]) {
          const p = edge[j];
          c.push(...this.inkLine([p, P(p.x + 3, p.y + 8 + this.r() * 10), P(p.x + 7, p.y + 5 + this.r() * 7)], 0.9, 0.60, 0.6));
        }
      }
      const center = placed(P(0, ry * 0.12));
      for (let j = 0; j < 7; j++) {
        const a = (Number(j) * Math.PI) / 3.5 + 0.25;
        const tip = placed(P(Math.cos(a) * rx * 0.83, Math.sin(a) * ry * 0.85));
        c.push(this.poly([center, tip, P(tip.x + 0.2, tip.y + 0.25), P(center.x + 0.5, center.y + 0.3)], {
          fil: stage === "spent" ? C.gray(0, 0.40) : C(255, 255, 255, 0.65),
          str: null,
        }));
      }
      for (let i = 0; i < 7; i++) {
        const p = placed(P((this.r() - 0.5) * rx * 1.25, (this.r() - 0.5) * ry));
        c.push(...this.inkBlot(p.x, p.y, rx * (0.15 + this.r() * 0.15), (ry / rx) * 0.65, 0, 0.12));
      }
    }
    const fx = 69 + this.r() * 24;
    const fy = 37 + this.r() * 6;
    c.unshift(...this.inkLine([P(fx + 1, 153), P(fx, fy + 12)], 1.3, 0.65, 0.28));
    let flowerTip;
    if (stage === "spent") {
      flowerTip = P(fx, fy - 7);
      const pod = this.inkCurve([P(fx - 11, fy), P(fx - 5, fy + 8), P(fx, fy + 12), P(fx + 7, fy + 6), P(fx + 12, fy - 3)]);
      c.push(this.poly(pod, { fil: C.white, str: null }));
      c.push(...this.inkLine(pod, 1.2, 0.72, 0.50));
      const rim = [];
      for (let j = 0; j <= 24; j++) {
        const a = (Number(j) * Math.PI) / 12;
        rim.push(P(fx + Math.cos(a) * 12, fy - 2 + Math.sin(a) * 5));
      }
      c.push(this.poly(rim, { fil: C.gray(0, 0.18), str: null }));
      c.push(...this.inkLine(rim, 1.0, 0.68, 0.45));
      for (const dx of [-6.0, 0.0, 5.0]) {
        c.push(...this.inkBlot(fx + dx, fy - 2 + this.r() * 2, 1.0, 0.6, 0, 0.85));
      }
    } else if (stage === "young" || form === 0) {
      flowerTip = P(fx, fy - 18);
      const bud = this.inkCurve([P(fx, fy + 12), P(fx - 6, fy + 2), flowerTip, P(fx + 7, fy + 2), P(fx, fy + 12)]);
      c.push(this.poly(bud, { fil: C.white, str: null }));
      c.push(...this.inkLine(bud, 0.9, 0.7, 0.25));
      c.push(...this.inkLine([flowerTip, P(fx + 2, fy + 7)], 0.55, 0.5));
    } else {
      flowerTip = P(fx, fy - 19);
      for (const dx of [-16.0, 14.0, -8.0, 7.0, 0.0]) {
        const petalTip = P(fx + dx, fy - (dx === 0 ? 19 : 10));
        const petal = this.inkCurve([P(fx, fy + 12), P(fx + dx - 6, fy), petalTip, P(fx + dx + 6, fy + 3), P(fx, fy + 12)]);
        c.push(this.poly(petal, { fil: C.white, str: null }));
        c.push(...this.inkLine(petal, 0.65, 0.62, 0.25));
      }
    }
    for (const x of [7.0, 78.0, 133.0]) {
      c.push(...this.inkLine([P(x, 156 + this.r() * 4), P(x + 23 + this.r() * 12, 156)], 0.65, 0.2, 0.5));
    }
    return { stage, canvas: c, flowerTip };
  },
});

// ═══════════════════════════════════════════════════════════════════════════
//  8. ShanShuiPaintingAtmosphere.swift — 烟云日月星霜
// ═══════════════════════════════════════════════════════════════════════════

Object.assign(ShanShuiEngineV5.prototype, {
  paintingAtmosphere(motif) {
    switch (motif) {
      case "moon":
      case "crescent":
        return this.paintingMoon(motif === "crescent");
      case "sunrise":
      case "sunset": {
        const radius = 24.0;
        let c = this.sceneEllipse(40, 40, radius, radius, C(171, 64, 51, 0.70), 0);
        const form = Math.trunc(this.r() * 65536) % 3;
        if (form > 0) {
          const y = form === 1 ? 58.0 : 51.0;
          const edge = this.inkCurve([P(12, y + 2), P(49, y - 1), P(59, y + 1), P(70, y - 2)]);
          c.push(this.poly(edge.concat([P(72, 68), P(12, 68)]), { fil: C.white, str: null }));
          c.push(...this.inkLine(edge, 1.2, 0.12, 0.68));
        }
        return c;
      }
      case "stars": {
        let c = [];
        const count = 4 + (Math.trunc(this.r() * 65536) % 6);
        for (let k = 0; k < count; k++) {
          const x = 8 + (Number(k) / Number(count)) * 170 + this.r() * 9;
          const y = 8 + this.r() * 65;
          c.push(...this.inkBlot(x, y, 0.7 + this.r() * 0.65, 0.9, 0, 0.35 + this.r() * 0.25));
        }
        return c;
      }
      case "rain": {
        const form = Math.trunc(this.r() * 65536) % 3;
        const slant = [4.0, 9.0, 15.0][form];
        let c = [];
        const count = 17 + form * 11;
        for (let i = 0; i < count; i++) {
          const x = 18 + this.r() * 160;
          const y = this.r() * 105;
          const length = 6 + this.r() * 13;
          c.push(...this.inkLine([P(x, y), P(x - (slant * length) / 18, y + length)], 0.55 + this.r() * 0.25, 0.13 + this.r() * 0.12, 0.42));
        }
        return c;
      }
      case "snow": {
        let c = [];
        const count = 10 + Math.trunc(this.r() * 14);
        for (let i = 0; i < count; i++) {
          const x = this.r() * 180;
          const y = this.r() * 110;
          const radius = 0.8 + this.r() * 1.3;
          c.push(...this.sceneEllipse(x, y, radius, radius * 0.85, C.white, 0.08));
        }
        return c;
      }
      case "waterfall":
        return this.paintingWaterfall().canvas;
      default:
        return this.paintingLegacy(this.sceneAsset(motif));
    }
  },
});


//  9. ShanShuiPaintingAssets.swift — 写意母题分发与笔墨转换器
// ═══════════════════════════════════════════════════════════════════════════
//  9. ShanShuiPaintingAssets.swift — 写意母题分发与笔墨转换器
// ═══════════════════════════════════════════════════════════════════════════

Object.assign(ShanShuiEngineV5.prototype, {
  paintingAsset(motif) {
    _ensurePart2DualSignatures();
    switch (motif) {
      case 'pine':
      case 'oldTree':
      case 'bareTree':
      case 'layeredTree':
      case 'willow':
      case 'blossom':
      case 'maple':
        return this.paintingTree(motif);
      case 'bamboo':
        return this.paintingBamboo();
      case 'lotus':
        return this.paintingLotus();
      case 'bridge':
        return this.paintingBridge();
      case 'house':
        return this.paintingHouse();
      case 'hut':
        return this.paintingHut();
      case 'pavilion':
        return this.paintingPavilion();
      case 'templeGate':
        return this.paintingTempleGate();
      case 'pagoda':
        return this.paintingPagoda();
      case 'path':
        return this.paintingFootpath();
      case 'courtyard':
        return this.paintingCourtyard();
      case 'window':
        return this.paintingWindow();
      case 'curtain':
        return this.paintingCurtain();
      case 'fields':
        return this.paintingFields();
      case 'dunes':
        return this.paintingDunes();
      case 'beaconSmoke':
      case 'cookingSmoke':
        return this.paintingSmoke(motif === 'beaconSmoke');
      case 'reeds':
        return this.paintingReeds();
      case 'grass':
        return this.paintingGrass();
      case 'moon':
      case 'crescent':
      case 'sunrise':
      case 'sunset':
      case 'stars':
      case 'waterfall':
      case 'rain':
      case 'snow':
        return this.paintingAtmosphere(motif);
      case 'vine':
        return this.paintingVine();
      case 'horse':
        return this.paintingHorse();
      case 'terrace':
        return this.paintingTerrace();
      case 'ruins':
        return this.paintingRuins();
      case 'cityGate':
        return this.paintingCityGate();
      case 'fence':
        return this.paintingFence();
      case 'boat':
      case 'angler':
      case 'mooredBoat':
      case 'sail':
        return this.paintingBoat(motif);
      case 'traveler':
        return this.paintingPerson();
      case 'egret':
        return this.paintingEgret();
      case 'crow':
      case 'swallow':
        return this.paintingBird(motif === 'swallow');
      case 'waves':
      case 'stream':
        return this.paintingWater(motif === 'stream');
      case 'reef':
        return this.paintingRock();
      case 'mist':
      case 'afterRain':
        return this.paintingDistant(0);
      default:
        return this.paintingLegacy(this.sceneAsset(motif));
    }
  },

  paintingLegacy(source, textured = false) {
    if (textured && typeof textured === 'object') {
      textured = textured.textured ?? false;
    }
    const out = [];
    for (const polyItem of source) {
      let p = {
        pts: polyItem.pts.slice(),
        fil: polyItem.fil,
        str: polyItem.str,
        wid: polyItem.wid,
        wash: polyItem.wash,
        tooth: polyItem.tooth,
        rim: polyItem.rim,
        fade: polyItem.fade
      };
      const originalFill = p.fil;
      const filled = Boolean(originalFill && originalFill.a > 0);
      if (originalFill && !C.isWhite(originalFill) && originalFill.a > 0) {
        p.fil = C.gray(0, Math.min(0.85, originalFill.a * (1 - originalFill.r / 255) * 1.25));
      }
      const stroke = p.str;
      p.str = null;
      out.push(p);
      if (originalFill && C.isWhite(originalFill)) {
        out.push(...this.inkSurface(p.pts, textured));
      }
      if ((!filled || (originalFill && C.isWhite(originalFill))) && stroke && stroke.a > 0 && stroke.r < 250 && p.wid > 0) {
        out.push(...this.inkLine(p.pts, Math.max(0.45, p.wid * 1.2), Math.min(0.8, stroke.a * (1 - stroke.r / 255) * 1.4), 0.40));
      }
    }
    return out;
  },

  inkSurface(points, textured = false, shadowWash = true) {
    if (typeof textured === 'object' && textured !== null) {
      shadowWash = textured.shadowWash ?? true;
      textured = textured.textured ?? false;
    }
    if (!points || points.length < 3) return [];
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of points) {
      if (p.x < x0) x0 = p.x;
      if (p.x > x1) x1 = p.x;
      if (p.y < y0) y0 = p.y;
      if (p.y > y1) y1 = p.y;
    }
    if (x1 - x0 <= 25 || y1 - y0 <= 15) return [];

    const result = [this.poly(points, { fil: C.gray(0, textured ? 0.05 : 0.03), str: null })];
    if (!textured) return result;

    const w = x1 - x0;
    const h = y1 - y0;

    function inside(p) {
      let res = false;
      let prev = points[points.length - 1];
      for (const curr of points) {
        if ((curr.y > p.y) !== (prev.y > p.y) &&
            p.x < ((prev.x - curr.x) * (p.y - curr.y)) / (prev.y - curr.y) + curr.x) {
          res = !res;
        }
        prev = curr;
      }
      return res;
    }

    const self = this;
    function shade(x, y) {
      const u = (x - x0) / w;
      const v = (y - y0) / h;
      const base = 0.55 * u + 0.75 * v - 0.25 + 0.5 * (self.n(x * 0.05, y * 0.05, 7) - 0.5);
      return Math.min(1, Math.max(0, base));
    }

    const shadow = points.map(p => {
      const pull = 1 - Math.min(1, shade(p.x, p.y) * 1.6);
      return P(p.x + (x1 - p.x) * pull * 0.55, p.y + (y1 - p.y) * pull * 0.45);
    });
    if (shadowWash) {
      result.push(this.poly(shadow, { fil: C.gray(0, 0.10), str: null }));
    }

    const count = Math.min(900, Math.max(50, Math.trunc((w * h) / 45)));
    for (let k = 0; k < count; k++) {
      const x = x0 + this.r() * w;
      const y = y0 + this.r() * h;
      const s = shade(x, y);
      const length = Math.min(22, h * (0.05 + this.r() * 0.10));
      const lean = -1 - this.r() * 3;
      const end = P(x + lean, y + length);
      const keep = this.r() < 0.12 + 0.88 * s;
      if (!keep || !inside(P(x, y)) || !inside(end)) continue;
      const moisture = 0.5 + 0.8 * this.n(x * 0.04, y * 0.04);
      result.push(...this.inkLine(
        [P(x, y), P(x + lean * 0.5, y + length * 0.45), end],
        0.45 + this.r() * 0.9,
        (0.08 + 0.42 * s) * moisture * (this.snowLight ?? 1.0),
        0.55 + 0.25 * (1 - s)
      ));
    }

    const tops = [];
    for (let i = 0; i < points.length; i++) {
      if (points[i].y < y0 + h * 0.4) tops.push(i);
    }
    if (tops.length > 0) {
      const clusters = Math.max(1, Math.min(5, Math.trunc(w / 55)));
      for (let c = 0; c < clusters; c++) {
        const p = points[tops[Math.trunc(this.r() * tops.length) % tops.length]];
        const dots = 2 + Math.trunc(this.r() * 2);
        for (let k = 0; k < dots; k++) {
          const x = p.x + (k - 1) * (1.6 + this.r() * 1.4);
          const y = p.y + 0.3 + this.r() * 1.0;
          result.push(...this.inkBlot(
            x, y,
            0.55 + this.r() * 0.5,
            0.38 + this.r() * 0.2,
            0.42 + this.r() * 0.28,
            false,
            0.18
          ));
        }
      }
    }
    return result;
  },

  paintingVine() {
    const tree = this.paintingWoodyTree(true);
    return this.paintingInk(tree.canvas, 3).concat(tree.vine);
  },

  paintingHorse(pose = null, facingLeft = null, donkey = false) {
    if (typeof pose === 'object' && pose !== null) {
      facingLeft = pose.facingLeft ?? null;
      donkey = pose.donkey ?? false;
      pose = pose.pose ?? null;
    }
    if (typeof pose === 'string') {
      pose = pose === 'grazing' ? 2 : pose === 'trotting' ? 1 : 0;
    }
    const actualPose = pose !== null ? pose : Math.trunc(this.r() * 3);
    const flip = facingLeft !== null ? facingLeft : (this.r() < 0.5);
    const tone = 0.48 + this.r() * 0.23;
    const headY = actualPose === 2 ? 62.0 : (actualPose === 1 ? 21.0 : 36.0);
    const outline = this.inkCurve([
      P(23, 35), P(27, 28), P(35, 25), P(48, 29), P(65, 28),
      P(73, 25), P(83, headY - 12), P(92, headY - 7), P(101, headY + 4),
      P(99, headY + 9), P(94, headY + 9), P(86, headY + 1),
      P(81, 44), P(73, 48), P(59, 51), P(43, 48), P(29, 47), P(23, 35)
    ]);
    let c = [
      this.poly(outline, { fil: C.white, str: null }),
      this.poly(outline, { fil: C.gray(0, 0.025 + this.r() * 0.055), str: null }),
      ...this.inkLine(outline, 1.05, tone, 0.43)
    ];

    const lines = [
      [P(29, 30), P(35, 33), P(32, 43)],
      [P(73, 29), P(69, 36), P(73, 45)],
      [P(48, 35), P(51, 43)],
      [P(55, 35), P(58, 44)]
    ];
    for (const line of lines) {
      c.push(...this.inkLine(this.inkCurve(line), 0.65, tone * 0.55, 0.55));
    }
    c.push(...this.inkLine(this.inkCurve([P(73, 25), P(81, headY - 12), P(87, headY - 9)]), 2.1, tone, 0.60));
    c.push(...this.inkLine([P(86, headY - 9), P(84, headY - (donkey ? 27 : 17)), P(89, headY - 10)], 1.0, 0.8));
    c.push(...this.inkLine([P(91, headY - 6), P(92, headY - (donkey ? 24 : 13))], 0.8, 0.7));
    c.push(...this.inkBlot(94, headY, 0.7, 0.65, 0.8));

    const legs = [
      [P(36, 46), P(42, 57), P(37, 66), P(42, 80)],
      [P(76, 45), P(79, 62), P(77, 80)],
      [P(29, 44), P(34, 55), P(27, 65), P(actualPose === 1 ? 18 : 26, 80)],
      actualPose === 1
        ? [P(70, 46), P(78, 59), P(88, 63), P(84, 70)]
        : [P(70, 46), P(72, 62), P(actualPose === 2 ? 65 : 71, 80)]
    ];
    for (let i = 0; i < legs.length; i++) {
      const leg = legs[i];
      c.push(...this.inkLine(leg, i < 2 ? 1 : 1.5, i < 2 ? tone * 0.6 : tone, 0.37));
      const foot = leg[leg.length - 1];
      c.push(...this.inkLine([P(foot.x - 1, foot.y), P(foot.x + 2, foot.y)], 1.6, tone));
    }
    c.push(...this.inkLine(this.inkCurve([P(24, 31), P(18, 39), P(17, 56), P(13, 67)]), 2.3, tone, 0.6));
    if (actualPose === 1 || this.r() < 0.45) {
      c.push(...this.inkLine([P(43, 28), P(44, 34), P(61, 35), P(64, 28)], 1.6, tone));
      c.push(...this.inkLine([P(51, 35), P(50, 50)], 0.7, tone * 0.8));
    }
    if (donkey) {
      c = c.map(poly => {
        const next = { ...poly };
        next.pts = poly.pts.map(p => P(p.x < 75 ? 75 - (75 - p.x) * 0.78 : p.x, p.y));
        return next;
      });
    }
    if (flip) {
      c = c.map(poly => {
        const next = { ...poly };
        next.pts = poly.pts.map(p => P(112 - p.x, p.y));
        return next;
      });
    }
    return c;
  },

  paintingMoon(crescent = false) {
    if (typeof crescent === 'object' && crescent !== null) {
      crescent = crescent.crescent ?? false;
    }
    const c = [];
    const form = Math.trunc(this.r() * 65536) % 3;
    for (let k = 0; k < 2 + form; k++) {
      const y = 25 + k * 13;
      const x = k % 2 === 0 ? 7.0 : 31.0;
      for (let wash = 0; wash < 7; wash++) {
        const spread = wash * 1.6;
        const edge = this.inkCurve([
          P(x - spread, y),
          P(x + 16, y - 6 - spread),
          P(x + 36, y - 2 - spread),
          P(x + 61 + spread, y + 2)
        ]);
        const bottom = this.inkCurve([
          P(x + 61 + spread, y + 4 + spread),
          P(x + 30, y + 5 + spread),
          P(x - spread, y + 2)
        ]);
        c.push(this.poly(edge.concat(bottom), { fil: C.gray(0, 0.010 + (6 - wash) * 0.002), str: null }));
      }
    }
    if (crescent) {
      const fullness = [0.18, 0.36, 0.55][form];
      const outer = [];
      for (let i = 0; i <= 40; i++) {
        const a = (i / 40) * Math.PI;
        outer.push(P(42 + Math.sin(a) * 23, 40 - Math.cos(a) * 23));
      }
      const inner = [];
      for (let i = 40; i >= 0; i--) {
        const a = (i / 40) * Math.PI;
        inner.push(P(42 + Math.sin(a) * 23 * (1 - fullness), 40 - Math.cos(a) * 23));
      }
      c.push(this.poly(outer.concat(inner), { fil: C.white, str: C.gray(0, 0.19), wid: 0.6 }));
    } else {
      c.push(...this.sceneEllipse(42, 40, 21, 21, C.white, 0));
    }
    return c;
  },

  paintingTerrace(width = 120, requestedHeight = null) {
    if (typeof width === 'object' && width !== null) {
      requestedHeight = width.height ?? null;
      width = width.width ?? 120;
    }
    const form = Math.trunc(this.r() * 65536) % 3;
    const w = width;
    const h = requestedHeight ?? (14 + Math.floor(this.r() * 6) * 3);
    const face = [P(w * 0.10, 0), P(w * 0.90, 0), P(w, h), P(0, h)];
    const c = [
      this.poly(face, { fil: C.white, str: null }),
      this.poly(face, { fil: C.gray(0, 0.075), str: null }),
      ...this.inkEdges([face[3], face[0], face[1], face[2]], Math.min(1.4, h * 0.14), 0.66, 0.4),
      ...this.inkLine([P(0, h), P(w, h)], Math.min(1.4, h * 0.12), 0.57, 0.5)
    ];
    for (let k = 1; k <= 2; k++) {
      const y = (h * k) / 3;
      const inset = w * 0.1 * (1 - y / h);
      c.push(...this.inkLine([P(inset + 2, y), P(w - inset - 2, y)], Math.min(0.6, h * 0.07), 0.30, 0.5));
    }
    const chips = form + 1;
    for (let k = 0; k < chips; k++) {
      const x = w * (0.2 + k * 0.23);
      c.push(...this.inkEdges([P(x, 0), P(x + w * 0.025, h * 0.24), P(x + w * 0.07, h * 0.28)], Math.min(0.8, h * 0.1), 0.4, 0.55));
    }
    return c;
  },

  paintingFence() {
    const form = Math.trunc(this.r() * 65536) % 3;
    const posts = [7, 10, 13][form];
    const spacing = [13.0, 9, 8][form];
    const gap = form === 2 ? 6 : -1;
    const c = [];
    for (let k = 0; k < posts; k++) {
      if (k === gap) continue;
      const x = 4 + k * spacing;
      c.push(...this.inkLine([P(x, 2 + this.r() * 4), P(x, 30)], 1.1 + this.r() * 0.4, 0.50 + this.r() * 0.15, 0.4));
    }
    for (const y of [11.0, 21]) {
      for (let k = 0; k < posts - 1; k++) {
        if (k === gap || k + 1 === gap) continue;
        const x = 4 + k * spacing;
        c.push(...this.inkLine([P(x, y), P(x + spacing * 0.5, y + 0.6), P(x + spacing, y)], 1.0, 0.5, 0.4));
      }
    }
    return c;
  },

  paintingCourtyard() {
    const form = Math.trunc(this.r() * 65536) % 3;
    const w = [178.0, 215, 244][form];
    const foot = 82.0;
    const wall = [P(0, 20), P(w, 20), P(w, foot), P(0, foot)];
    const c = [this.poly(wall, { fil: C.white, str: null })];
    if (form !== 0) {
      const end = [P(w, 20), P(w + 20, 12), P(w + 20, 74), P(w, foot)];
      c.push(
        this.poly(end, { fil: C.white, str: null }),
        this.poly(end, { fil: C.gray(0, 0.055), str: null }),
        ...this.inkEdges([P(w, foot), P(w + 20, 74), P(w + 20, 12)], 0.9, 0.53),
        ...this.inkLine([P(w, 18), P(w + 23, 9)], 2.5, 0.79)
      );
    }
    c.push(
      ...this.inkEdges([P(0, 20), P(0, foot), P(w, foot), P(w, 20)], 1.05, 0.57, 0.38),
      ...this.inkLine([P(-4, 19), P(w + 4, 19)], 3.6, 0.84, 0.25),
      ...this.inkLine([P(-2, 14), P(w + 2, 14)], 1.3, 0.65, 0.35)
    );
    for (let x = 1.0; x < w; x += 6) {
      c.push(...this.inkLine([P(x, 14), P(x + 1.5, 18)], 0.7, 0.58, 0.3));
    }
    const cx = w * 0.66;
    if (form === 1) {
      const opening = [P(cx - 18, 37), P(cx + 18, 37), P(cx + 18, foot), P(cx - 18, foot)];
      c.push(
        this.poly(opening, { fil: C.gray(0, 0.10), str: null }),
        ...this.inkEdges(opening, 1.6, 0.63, 0.32),
        ...this.inkLine([P(cx - 22, 34), P(cx + 22, 34)], 2.2, 0.75)
      );
    } else {
      const radius = form === 0 ? 23.0 : 27.0;
      const ring = [];
      for (let i = 0; i <= 48; i++) {
        const a = (i / 48) * 2 * Math.PI;
        ring.push(P(cx + Math.cos(a) * radius, foot - radius + Math.sin(a) * radius));
      }
      c.push(
        this.poly(ring, { fil: C.gray(0, 0.06), str: null }),
        ...this.inkLine(ring, 1.6, 0.64, 0.32),
        ...this.inkLine([P(cx - radius * 0.68, foot - 7), P(cx + radius * 0.68, foot - 7)], 0.6, 0.24)
      );
    }
    if (form === 2) {
      const win = this.paintingWindow({ embedded: true });
      for (const p of win) {
        const q = { ...p };
        q.pts = p.pts.map(pt => P(w * 0.85 + pt.x * 0.32, 36 + pt.y * 0.32));
        q.wid *= 0.32;
        c.push(q);
      }
    }
    for (const x of [10.0, w * 0.37, w - 21]) {
      c.push(...this.inkLine([P(x, foot - 3), P(x + 12, foot - 3)], 0.7, 0.2, 0.6));
    }
    return c;
  },

  paintingBridgePlan() {
    const kinds = ['arch', 'slab', 'beam'];
    const kind = kinds[Math.trunc(this.r() * 65536) % 3];
    return new PaintingBridge(kind, 140 + this.r() * 32, 24 + this.r() * 13, this.r() < 0.5, this.r() < 0.3);
  },

  paintingBridge(specification = null) {
    const bridge = specification ?? this.paintingBridgePlan();
    const w = bridge.width;
    const floor = 60.0;
    const c = [];
    if (bridge.kind === 'arch') {
      const top = bridge.deck;
      const arch = bridge.arch;
      const face = top.concat([P(w, floor)]).concat(arch.slice().reverse()).concat([P(0, floor)]);
      c.push(
        this.poly(face, { fil: C.white, str: null }),
        this.poly(face, { fil: C.gray(0, 0.045), str: null }),
        ...this.inkLine(top, 1.9, 0.72, 0.45),
        ...this.inkLine(arch, 2.0, 0.78, 0.40)
      );
      for (let k = 1; k < 10; k++) {
        const t = k / 10;
        const x = w * (0.10 + t * 0.80);
        const y = floor - Math.sin(t * Math.PI) * bridge.rise;
        c.push(...this.inkLine([P(x, y), P(x + (x - w / 2) * 0.04, y - 5)], 0.65, 0.35, 0.5));
      }
    } else {
      const deckY = 42.0;
      const thick = bridge.kind === 'slab' ? 6.0 : 3.5;
      const deck = [
        P(0, deckY), P(w * 0.48, deckY - 1), P(w, deckY + 1),
        P(w, deckY + thick), P(w * 0.49, deckY + thick - 1), P(0, deckY + thick)
      ];
      c.push(
        this.poly(deck, { fil: C.white, str: null }),
        this.poly(deck, { fil: C.gray(0, 0.04), str: null }),
        ...this.inkLine(deck.slice(0, 3), 1.9, 0.76, 0.25),
        ...this.inkLine(deck.slice(3), 2.1, 0.80, 0.28)
      );
      const piers = bridge.kind === 'slab' ? [w * 0.19, w * 0.79] : [w * 0.13, w * 0.86];
      for (const x of piers) {
        if (bridge.kind === 'slab') {
          const pier = [P(x - 3, deckY + thick), P(x + 3, deckY + thick), P(x + 3, floor), P(x - 3, floor)];
          c.push(
            this.poly(pier, { fil: C.gray(0, 0.16), str: null }),
            ...this.inkLine([P(x - 3, deckY + thick), P(x - 3, floor)], 1.5, 0.70, 0.3),
            ...this.inkLine([P(x + 3, deckY + thick), P(x + 3, floor)], 1.0, 0.50, 0.35)
          );
        } else {
          c.push(...this.inkLine([P(x, deckY + 2), P(x + 0.4, floor + 1)], 2.5, 0.82, 0.23));
        }
      }
    }
    if (bridge.railing) {
      const deck = bridge.deck;
      c.push(...this.inkLine(deck.slice(3, 34).map(p => P(p.x, p.y - 6)), 1.15, 0.62, 0.32));
      for (const i of [5, 18, 31]) {
        const p = deck[i];
        c.push(...this.inkLine([P(p.x, p.y - 6.5), P(p.x, p.y + 0.5)], 1.1, 0.67, 0.3));
      }
    }
    if (bridge.pedestrian) {
      const foot = bridge.deck[21];
      const person = this.paintingPerson({ pose: 0 });
      for (const poly of person) {
        const q = { ...poly };
        q.pts = poly.pts.map(pt => P(foot.x + (pt.x - 44) * 0.5, foot.y + (pt.y - 44) * 0.5));
        q.wid *= 0.5;
        c.push(q);
      }
    }
    return c;
  },

  paintingBridgeReflection(bridge) {
    const c = [];
    if (bridge.kind === 'arch') {
      const reflected = bridge.arch.map(p => P(p.x, 120 - p.y));
      for (let start = 1; start < reflected.length - 4; start += 7) {
        c.push(...this.inkLine(reflected.slice(start, start + 5), 0.85, 0.22, 0.65));
      }
    } else {
      const piers = bridge.kind === 'slab' ? [0.19, 0.79] : [0.13, 0.86];
      for (const u of piers) {
        const x = bridge.width * u;
        for (let k = 0; k < 3; k++) {
          const y = 62 + k * 5.5;
          c.push(...this.inkLine(
            [P(x - 0.8, y), P(x + 0.9, y + 2.2), P(x - 0.4, y + 3.6)],
            bridge.kind === 'slab' ? 2.4 : 1.4,
            0.30 - k * 0.07,
            0.5
          ));
        }
      }
    }
    for (const [x, y, length] of [[0.24, 65.0, 0.23], [0.44, 71, 0.30], [0.18, 82, 0.38]]) {
      c.push(...this.inkLine(
        [P(bridge.width * x, y), P(bridge.width * (x + length * 0.5), y + 0.5), P(bridge.width * (x + length), y)],
        0.8, 0.33, 0.5
      ));
    }
    return c;
  },

  paintingPerson(hat = false, pose = null, facingLeft = null) {
    if (typeof hat === 'object' && hat !== null) {
      pose = hat.pose ?? null;
      facingLeft = hat.facingLeft ?? null;
      hat = hat.hat ?? false;
    }
    if (typeof pose === 'string') {
      pose = pose === 'seated' ? 3 : pose === 'carrying' ? 2 : pose === 'folded' ? 1 : 0;
    }
    const actualPose = pose !== null ? pose : Math.trunc(this.r() * 4);
    const flip = facingLeft !== null ? facingLeft : (this.r() < 0.5);
    const tone = 0.58 + this.r() * 0.22;
    const hx = actualPose === 0 ? 46.0 : 43.0;
    let c = [...this.inkBlot(hx, 7, 2.6, 0.90, tone)];
    if (hat || this.r() < 0.45) {
      c.push(...this.inkLine([P(hx - 7, 7), P(hx, 2), P(hx + 7, 8), P(hx - 7, 7)], 0.85, tone));
    }
    const seated = actualPose === 3;
    const hem = seated ? 29.0 : 37.0;
    const back = this.inkCurve([P(hx - 1, 12), P(39, 19), P(seated ? 36 : 34, hem - 3), P(43, hem)]);
    const front = this.inkCurve([P(hx + 1, 12), P(48, 20), P(seated ? 56 : 49, hem - 3), P(seated ? 55 : 46, hem)]);
    c.push(
      this.poly(back.concat(front.slice().reverse()), { fil: C.white, str: null }),
      ...this.inkLine(back, 1.25, tone, 0.14, 'cone'),
      ...this.inkLine(front, 1.0, tone * 0.8, 0.14, 'cone'),
      ...this.inkLine([P(42, 22), P(39, hem - 3), P(46, hem)], 0.8, tone * 0.7, 0.14, 'cone')
    );
    const sleeve = actualPose === 1
      ? [P(40, 17), P(43, 24), P(51, 22), P(46, 18)]
      : [P(45, 16), P(48, 23), P(55, 24)];
    c.push(...this.inkLine(sleeve, 1.5, tone, 0.14, 'cone'));
    if (actualPose === 0) {
      c.push(...this.inkLine([P(54, 23), P(58, 44)], 0.65, tone));
    } else if (actualPose === 2) {
      c.push(
        ...this.inkLine([P(28, 18), P(59, 13)], 0.9, tone),
        ...this.inkLine([P(29, 18), P(28, 29)], 0.55, tone),
        ...this.inkLine([P(24, 28), P(23, 35), P(33, 35), P(32, 28), P(24, 28)], 1.2, tone)
      );
    }
    const feet = seated
      ? [[P(51, 27), P(59, 30), P(59, 34), P(63, 34)]]
      : [
          [P(40, 36), P(actualPose === 0 ? 34 : 41, 43), P(actualPose === 0 ? 30 : 38, 44)],
          [P(47, 36), P(49, 43), P(53, 44)]
        ];
    for (const foot of feet) {
      c.push(...this.inkLine(foot, 1.1, tone, 0.4));
    }
    if (flip) {
      c = c.map(poly => {
        const next = { ...poly };
        next.pts = poly.pts.map(p => P(88 - p.x, p.y));
        return next;
      });
    }
    return c;
  },

  paintingEgret() {
    let c = [...this.inkLine([P(23, 36), P(17, 40), P(5, 46)], 6.5, 0.5, 0.12, 'lens')];
    c.push(...this.inkLine(this.inkCurve([P(24, 37), P(33, 31), P(26, 21), P(30, 9), P(37, 8)]), 2.0, 0.65));
    c.push(...this.inkLine([P(36, 8), P(49, 10)], 0.8, 0.85));
    c.push(...this.inkLine([P(15, 43), P(14, 63), P(8, 68)], 0.8, 0.65));
    c.push(...this.inkLine([P(19, 43), P(23, 61), P(31, 63)], 0.8, 0.65));
    return c;
  },

  paintingBird(swallow = false, count = null) {
    if (typeof swallow === 'object' && swallow !== null) {
      count = swallow.count ?? null;
      swallow = swallow.swallow ?? false;
    }
    const actualCount = count !== null ? count : (swallow ? (this.r() < 0.25 ? 1 : 2) : 2 + Math.trunc(this.r() * 4));
    const c = [];
    for (let i = 0; i < actualCount; i++) {
      const x = i * (swallow ? 37 : 23) + this.r() * 8;
      const y = this.r() * 24 + (i % 2) * 12;
      const scale = 0.55 + this.r() * 0.45;
      const beat = Math.trunc(this.r() * 3);
      const lift = beat === 0 ? -13.0 : (beat === 1 ? 7.0 : -3.0);
      let bird = [...this.inkLine([P(0, -3), P(2, 3), P(0, 7)], swallow ? 2 : 3.6, 0.86, 0.14, 'cone')];
      const span = swallow ? 22.0 : 16.0;
      bird.push(...this.inkLine([P(0, 0), P(-span * 0.5, lift * 0.3 - 2), P(-span, lift)], swallow ? 2.3 : 3.3, 0.86, 0.14, 'cone'));
      bird.push(...this.inkLine([P(1, 1), P(span * 0.55, lift * 0.4 - 3), P(span * 0.9, lift - 4)], swallow ? 2 : 3, 0.78, 0.14, 'cone'));
      if (swallow) {
        bird.push(...this.inkLine([P(1, 5), P(-6, 18)], 1.2, 0.86, 0.14, 'cone'));
        bird.push(...this.inkLine([P(1, 5), P(8, 17)], 1.2, 0.86, 0.14, 'cone'));
      } else {
        bird.push(...this.inkLine([P(0, 5), P(-3, 11)], 2.2, 0.8, 0.14, 'cone'));
      }
      for (const poly of bird) {
        const next = { ...poly };
        next.pts = poly.pts.map(p => P(x + p.x * scale, y + p.y * scale));
        next.wid *= scale;
        c.push(next);
      }
    }
    return c;
  },

  paintingPerchedCrow() {
    const flip = this.r() < 0.5 ? -1.0 : 1.0;
    const attitude = Math.trunc(this.r() * 3);
    const headY = attitude === 0 ? -8.0 : (attitude === 1 ? -10.0 : -7.0);
    const headX = attitude === 2 ? 4.0 : 2.5;
    const c = [];
    for (const x of [-1.5, 1.0]) {
      c.push(...this.inkLine([P(x, -1), P(x + 0.5, 0), P(x + 1.5, 0)], 0.7, 0.85, 0.2));
    }
    const tailY = attitude === 1 ? 3.5 : 1.0;
    c.push(...this.inkLine([P(-2, -4), P(-5.5, -1), P(-10, tailY)], 3.5, 0.92, 0.18, 'cone'));
    c.push(...this.inkBlot(-0.7, -4.8, 5.1, 0.92, 0.92, false, 0.22));
    c.push(...this.inkBlot(headX, headY, 2.8, 0.95, 0.94, false, 0.22));
    c.push(this.poly([P(headX + 2, headY - 0.6), P(headX + 6, headY + 0.7), P(headX + 2, headY + 1.1)], { fil: C.gray(0, 0.94), str: null }));
    return c.map(poly => {
      const next = { ...poly };
      next.pts = poly.pts.map(p => P(p.x * flip, p.y));
      return next;
    });
  },

  paintingWater(stream = false) {
    return stream ? this.paintingChannel(-62, 62, -26, 20, -48, 44) : this.paintingSurface('lake');
  },

  paintingGrass() {
    const c = [];
    const count = 2 + (Math.trunc(this.r() * 65536) % 4);
    for (let k = 0; k < count; k++) {
      const root = P(10 + k * (19 + this.r() * 8), 22 + this.r() * 4);
      const blades = 4 + Math.trunc(this.r() * 3);
      for (let j = 0; j < blades; j++) {
        const spread = (j - 2) * (2 + this.r() * 2);
        const tip = P(root.x + spread, root.y - 5 - this.r() * 11);
        c.push(...this.inkLine(this.inkCurve([root, P(root.x + spread * 0.3, root.y - 5), tip]), 1.5 + this.r(), 0.55 + this.r() * 0.3, 0.35, 'cone'));
      }
      c.push(...this.inkLine([P(root.x - 4, root.y + 1), P(root.x + 5, root.y)], 1.6, 0.75, 0.45));
    }
    return c;
  },

  // ═════════════════════════════════════════════════════════════════════════
  //  10. ShanShuiSceneAssets.swift — 几何母题与辅助元素
  // ═════════════════════════════════════════════════════════════════════════

  sceneLine(points, width = 1.2, tone = 0.6) {
    return this.stroke(divP(points, 5), {
      wid: width,
      col: C.ink(tone),
      noi: 0.35,
      out: 0
    });
  },

  sceneEllipse(x, y, rx, ry, fill = null, tone = 0.5) {
    const points = [];
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40) * 2 * Math.PI;
      points.push(P(x + Math.cos(a) * rx, y + Math.sin(a) * ry));
    }
    return [this.poly(points, { fil: fill, str: C.ink(tone), wid: 0.7 })];
  },

  scenePine() {
    let c = [...this.sceneLine([P(35, 100), P(43, 76), P(40, 53), P(56, 24), P(65, 3)], 4, 0.72)];
    for (const [x, y, direction] of [[43.0, 73.0, -1.0], [42, 51, 1], [55, 29, -1], [64, 7, 1]]) {
      const tip = P(x + direction * (28 + this.r() * 15), y - 12);
      c.push(...this.sceneLine([P(x, y + 12), P(x + direction * 15, y - 4), tip], 2.4));
      for (let i = 0; i < 4; i++) {
        const bx = tip.x + (i - 2) * 7;
        for (let k = 0; k < 9; k++) {
          const a = -Math.PI * (0.12 + k * 0.09);
          c.push(...this.sceneLine([P(bx, tip.y + 4), P(bx + Math.cos(a) * (12 + this.r() * 8), tip.y + Math.sin(a) * 12)], 0.65, 0.62));
        }
      }
    }
    return c;
  },

  sceneBamboo() {
    const c = [];
    for (let k = 0; k < 4; k++) {
      const x = k * 17 + 12;
      const bend = (k - 1) * 8;
      const height = 80 + this.r() * 40;
      c.push(...this.sceneLine([P(x, 110), P(x + bend * 0.5, 110 - height * 0.5), P(x + bend, 110 - height)], 2.0));
      for (let j = 1; j <= 5; j++) {
        const y = 110 - (height * j) / 6;
        const tx = x + (bend * j) / 6;
        c.push(...this.sceneLine([P(tx - 2, y), P(tx + 2, y - 0.8)], 1.1, 0.9));
        if (j % 2 === k % 2) {
          for (let leaf = 0; leaf < 5; leaf++) {
            const dir = (j + k) % 2 === 0 ? 1.0 : -1.0;
            const dx = dir * (14 + leaf * 4);
            const dy = (leaf - 2) * 6 - 8;
            c.push(...this.blob(tx + dx * 0.5, y + dy * 0.5, {
              len: Math.hypot(dx, dy),
              wid: 3,
              ang: Math.atan2(dy, dx),
              col: C.ink(0.62 + this.r() * 0.18)
            }));
          }
        }
      }
    }
    return c;
  },

  sceneWillow() {
    let c = [...this.sceneLine([P(45, 120), P(48, 83), P(42, 53), P(58, 23)], 4.5, 0.65)];
    for (let k = 0; k < 9; k++) {
      const x = 8 + k * 10;
      const start = P(47, 52);
      const crest = P(x, 12 + Math.abs(x - 50) * 0.15);
      c.push(...this.sceneLine([start, P((start.x + x) / 2, 20), crest], 1.3));
      const bottom = 65 + this.r() * 40;
      const strand = [];
      for (let i = 0; i <= 16; i++) {
        const t = i / 16;
        strand.push(P(x + Math.sin(t * 2.0) * 8, crest.y + t * bottom));
      }
      c.push(...this.sceneLine(strand, 0.8, 0.55));
      for (let i = 3; i <= 15; i += 2) {
        const p = strand[i];
        c.push(...this.blob(p.x - 2, p.y + 2, { len: 8, wid: 2, ang: 1.0, col: C.ink(0.45) }));
      }
    }
    return c;
  },

  sceneGrass(reeds = false) {
    const c = [];
    for (let k = 0; k < 12; k++) {
      const x = k * 7;
      const tip = P(x + (this.r() - 0.5) * 25, 10 + this.r() * 55);
      c.push(...this.sceneLine([P(x, 100), P(x + 4, 55), tip], 0.8, 0.55));
      c.push(...this.sceneLine([P(x, 85), P(x - 10, 62), P(x - 16, 64)], 1.2, 0.45));
      if (reeds) {
        c.push(...this.blob(tip.x, tip.y - 4, { len: 15, wid: 3.8, ang: -1.4, col: C.ink(0.38) }));
      }
    }
    return c;
  },

  sceneBlossom(maple = false) {
    const c = [...this.sceneBareTree()];
    const branchPoints = [];
    for (const poly of c) {
      for (const pt of poly.pts) branchPoints.push(pt);
    }
    if (branchPoints.length === 0) return c;
    for (let k = 0; k < 32; k++) {
      const p = branchPoints[Math.trunc(this.r() * branchPoints.length) % branchPoints.length];
      if (maple) {
        const leaf = [];
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * 2 * Math.PI;
          const radius = i % 2 === 0 ? 4.8 : 2.0;
          leaf.push(P(p.x + Math.cos(a) * radius, p.y + Math.sin(a) * radius));
        }
        c.push(this.poly(leaf, { fil: C.ink(0.38), str: C.ink(0.45), wid: 0.3 }));
      } else {
        for (let j = 0; j < 5; j++) {
          const a = (j / 5) * 2 * Math.PI;
          c.push(...this.sceneEllipse(p.x + Math.cos(a) * 2.8, p.y + Math.sin(a) * 2.8, 2.6, 2.0, C.white, 0.35));
        }
        c.push(...this.blob(p.x, p.y, { len: 1.5, wid: 1.5, col: C.ink(0.8) }));
      }
      if (k % 4 === 0) {
        c.push(...this.sceneLine([p, P(p.x + 6, p.y - 7)], 0.5));
      }
    }
    return c;
  },

  sceneVine() {
    const c = [];
    for (let strand = 0; strand < 3; strand++) {
      const line = [];
      for (let i = 0; i <= 50; i++) {
        const t = i / 50;
        line.push(P(35 + strand * 12 + Math.sin(t * 14) * (5 + t * 9), t * 110));
      }
      c.push(...this.sceneLine(line, 0.8));
    }
    return c;
  },

  sceneLotus() {
    const c = [];
    for (const [x, y, rx, ry] of [[26.0, 79.0, 25.0, 9.0], [73, 92, 30, 10], [58, 47, 20, 8]]) {
      const leaf = [];
      for (let i = 0; i <= 36; i++) {
        const a = 0.3 + (i / 36) * 5.6;
        leaf.push(P(x + Math.cos(a) * rx, y + Math.sin(a) * ry));
      }
      leaf.push(P(x, y));
      c.push(this.poly(leaf, { fil: C.ink(0.15), str: C.ink(0.45), wid: 0.7 }));
      for (let j = 0; j < 7; j++) {
        const a = 0.4 + j * 0.8;
        c.push(...this.sceneLine([P(x, y), P(x + Math.cos(a) * rx * 0.9, y + Math.sin(a) * ry * 0.9)], 0.35, 0.3));
      }
      c.push(...this.sceneLine([P(x, y), P(x - 3, 112)], 0.8, 0.42));
    }
    c.push(...this.sceneLine([P(38, 105), P(41, 66), P(39, 29)], 1.1));
    for (let k = -3; k <= 3; k++) {
      const x = 39 + k * 4;
      c.push(...this.sceneLine([P(39, 32), P(x - 6, 22), P(x, 4 + Math.abs(k) * 3), P(x + 6, 22), P(39, 32)], 0.7, 0.5));
    }
    return c;
  },

  sceneBridge() {
    const top = [];
    for (let i = 0; i <= 40; i++) {
      const x = i * 3;
      top.push(P(x, 30 - Math.sin((i / 40) * Math.PI) * 21));
    }
    const arch = [];
    for (let i = 40; i >= 0; i--) {
      const x = i * 3;
      arch.push(P(x, 43 - Math.sin((i / 40) * Math.PI) * 21));
    }
    const c = [this.poly(top.concat(arch), { fil: C.white, str: C.ink(0.6), wid: 1.0 })];
    c.push(...this.sceneLine(top.map(p => P(p.x, p.y - 8)), 0.9));
    for (let i = 0; i <= 40; i += 5) {
      const p = top[i];
      c.push(...this.sceneLine([P(p.x, p.y - 10), P(p.x, p.y + 1)], 1));
    }
    for (let i = 3; i < 38; i += 6) {
      c.push(...this.sceneLine([top[i], arch[40 - i]], 0.45, 0.3));
    }
    return c;
  },

  sceneGate(temple = false) {
    const c = [this.poly([P(0, 100), P(0, 55), P(105, 55), P(105, 100)], { fil: C.white, str: C.ink(0.55), wid: 1 })];
    c.push(...this.sceneLine([P(35, 100), P(35, 69), P(41, 62), P(60, 62), P(67, 69), P(67, 100)], 1.5));
    c.push(...this.roof(51, 32, { hei: 19, wid: 115, rot: 0.5, per: 0.5 }));
    c.push(...this.box(51, 55, { hei: 23, wid: 83, rot: 0.5, per: 0.5, tra: false }));
    c.push(...this.roof(51, 28, { hei: 20, wid: 110, rot: 0.5, per: 0.5 }));
    if (temple) {
      c.push(...this.roof(51, 7, { hei: 15, wid: 72, rot: 0.5, per: 0.5 }));
    } else {
      for (let k = 0; k < 8; k++) {
        c.push(...this.sceneLine([P(k * 15, 55), P(k * 15, 49), P(k * 15 + 8, 49)], 0.9));
      }
    }
    return c;
  },

  sceneCourtyard() {
    const c = [this.poly([P(0, 100), P(0, 43), P(40, 43), P(40, 23), P(100, 23), P(100, 100)], { fil: C.white, str: C.ink(0.4), wid: 1 })];
    c.push(...this.sceneLine([P(0, 43), P(40, 43), P(40, 23), P(100, 23)], 2.2));
    c.push(...this.sceneLine([P(0, 48), P(44, 48), P(44, 28), P(100, 28)], 0.7));
    c.push(...this.sceneLine([P(57, 100), P(57, 67), P(65, 58), P(76, 58), P(84, 67), P(84, 100)], 1));
    for (let k = 0; k < 5; k++) {
      c.push(...this.sceneLine([P(6 + k * 8, 70), P(10 + k * 8, 70)], 0.6, 0.22));
    }
    return c;
  },

  sceneWindow() {
    const c = [...this.sceneLine([P(5, 100), P(5, 4), P(85, 4), P(85, 100)], 2.8, 0.65)];
    c.push(...this.sceneLine([P(11, 100), P(11, 10), P(79, 10), P(79, 100)], 0.8));
    for (const x of [28.0, 45, 62]) {
      c.push(...this.sceneLine([P(x, 12), P(x, 97)], 0.65, 0.38));
    }
    for (const y of [31.0, 53, 75, 97]) {
      c.push(...this.sceneLine([P(12, y), P(78, y)], 0.65, 0.38));
    }
    return c;
  },

  sceneCurtain() {
    const c = [];
    for (let k = 0; k < 10; k++) {
      const x = k * 8;
      c.push(...this.sceneLine([P(x, 0), P(x + 2, 38), P(x + Math.sin(k) * 4 + 12, 85 + Math.cos(k) * 5)], 0.55, 0.25));
    }
    c.push(...this.sceneLine([P(0, 0), P(75, 0)], 1.8));
    return c;
  },

  sceneTerrace() {
    const c = [];
    for (let k = 0; k < 4; k++) {
      const inset = k * 7;
      const y = 100 - k * 8;
      c.push(...this.sceneLine([P(inset, y), P(120 - inset, y), P(120 - inset, y - 7), P(inset + 5, y - 7)], 1.5, 0.52));
    }
    c.push(...this.arch04(60, 69, { hei: 18, wid: 70, sto: 1 }));
    return c;
  },

  sceneRuins() {
    const edge = [P(0, 100), P(0, 58), P(20, 58), P(20, 68), P(28, 68), P(28, 52), P(45, 52), P(45, 75), P(70, 75), P(70, 100)];
    const c = [this.poly(edge, { fil: C.white, str: C.ink(0.45), wid: 1 })];
    for (let k = 0; k < 10; k++) {
      const x = this.r() * 65;
      const y = 76 + this.r() * 20;
      c.push(...this.sceneLine([P(x, y), P(x + 7, y)], 0.6, 0.3));
    }
    c.push(...this.rock(78, 100, 3, { hei: 12, wid: 18 }));
    return c;
  },

  sceneFence() {
    const c = [];
    for (let k = 0; k < 13; k++) {
      const x = k * 8;
      c.push(...this.sceneLine([P(x + 3, 100), P(x, 74 + this.r() * 6)], 1.3, 0.55));
    }
    for (const y of [83.0, 94]) {
      c.push(...this.sceneLine([P(0, y), P(105, y + 2)], 1.3, 0.5));
    }
    return c;
  },

  sceneFields() {
    const c = [];
    for (let k = 0; k < 5; k++) {
      const y = 20 + k * 16;
      const half = 22 + k * 10;
      c.push(...this.sceneLine([P(60 - half, y), P(55, y - 5), P(60 + half, y)], 1.3, 0.4));
    }
    for (let k = -3; k <= 3; k++) {
      c.push(...this.sceneLine([P(55 + k * 5, 15), P(60 + k * 19, 86)], 0.65, 0.28));
    }
    return c;
  },

  scenePath() {
    const left = [];
    for (let i = 0; i <= 50; i++) {
      const t = i / 50;
      left.push(P(44 + Math.sin(t * 7) * (3 + t * 19), t * 100));
    }
    const right = [];
    for (let i = 0; i <= 50; i++) {
      const t = i / 50;
      right.push(P(46 + Math.sin(t * 7) * (3 + t * 19) + t * 22, t * 100));
    }
    return this.sceneLine(left, 1.0, 0.3).concat(this.sceneLine(right, 0.8, 0.25));
  },

  sceneBareTree() {
    let c = [...this.sceneLine([P(49, 110), P(43, 84), P(48, 61), P(43, 38), P(51, 8)], 4.2, 0.65)];
    for (let k = 0; k < 7; k++) {
      const side = k % 2 === 0 ? -1.0 : 1.0;
      const y = 82 - k * 10;
      const length = 25 + this.r() * 15;
      const start = P(46, y);
      const joint = P(46 + side * length * 0.45, y - 12);
      const tip = P(46 + side * length, y - 33);
      c.push(...this.sceneLine([start, joint, tip], 1.5 - k * 0.1, 0.58));
      c.push(...this.sceneLine([joint, P(joint.x - side * 4, joint.y - 16), P(joint.x + side * 4, joint.y - 25)], 0.65, 0.55));
      c.push(...this.sceneLine([tip, P(tip.x + side * 9, tip.y - 6)], 0.55, 0.45));
    }
    return c;
  },

  sceneBoat(kind) {
    let c = [this.poly([P(0, 80), P(18, 91), P(90, 91), P(110, 80), P(80, 85), P(20, 85)], { fil: C.white, str: C.ink(0.7), wid: 1 })];
    c.push(...this.sceneLine([P(10, 82), P(100, 82)], 0.8, 0.45));
    if (kind === 'sail') {
      c.push(...this.sceneLine([P(53, 85), P(53, 2)], 1.2));
      c.push(this.poly([P(51, 5), P(20, 58), P(51, 63)], { fil: C.white, str: C.ink(0.5), wid: 0.8 }));
      for (const y of [25.0, 38, 51]) {
        c.push(...this.sceneLine([P(51, y), P(51 - y * 0.45, y - 2)], 0.6, 0.3));
      }
    } else if (kind === 'angler') {
      c.push(...this.man(36, 83, { sca: 0.6, hat: 'hat02', len: [0, 30, 20, 28, 18, 25, 20, 20, 15] }));
      c.push(...this.sceneLine([P(37, 64), P(88, 32), P(128, 23)], 0.8, 0.7));
      c.push(...this.sceneLine([P(128, 23), P(131, 60), P(130, 99)], 0.4, 0.4));
    } else if (kind === 'mooredBoat') {
      c.push(...this.sceneLine([P(1, 81), P(-20, 68), P(-20, 54)], 0.6));
    } else {
      c.push(...this.man(36, 83, { sca: 0.6, hat: 'hat02', ite: 'stick01' }));
    }
    return c;
  },

  sceneHorse() {
    const outline = [
      P(20, 52), P(29, 43), P(45, 40), P(65, 43), P(74, 39),
      P(80, 26), P(83, 16), P(88, 11), P(95, 14), P(101, 24), P(98, 29),
      P(91, 26), P(86, 39), P(83, 54), P(73, 63), P(55, 66), P(34, 64)
    ];
    const body = [];
    for (let i = 0; i < outline.length; i++) {
      const p0 = outline[(i + outline.length - 1) % outline.length];
      const p1 = outline[i];
      const p2 = outline[(i + 1) % outline.length];
      const p3 = outline[(i + 2) % outline.length];
      for (let step = 0; step < 6; step++) {
        const t = step / 6;
        const t2 = t * t;
        const t3 = t2 * t;
        function coordinate(a, b, c, d) {
          return 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        }
        body.push(P(coordinate(p0.x, p1.x, p2.x, p3.x), coordinate(p0.y, p1.y, p2.y, p3.y)));
      }
    }
    const c = [this.poly(body, { fil: C.ink(0.25), str: C.ink(0.7), wid: 1 })];
    for (const line of [[P(31, 60), P(26, 83), P(20, 99)], [P(41, 61), P(47, 82), P(47, 99)], [P(69, 62), P(65, 83), P(60, 99)], [P(78, 59), P(85, 80), P(82, 98)]]) {
      c.push(...this.sceneLine(line, 2.0, 0.7));
    }
    c.push(...this.sceneLine([P(21, 51), P(12, 56), P(10, 80), P(4, 87)], 2.1));
    c.push(...this.sceneLine([P(87, 13), P(84, 26), P(78, 41)], 2.6));
    c.push(...this.sceneLine([P(89, 9), P(88, 0), P(93, 8)], 0.9));
    return c;
  },

  sceneEgret() {
    const c = [...this.sceneEllipse(43, 56, 18, 8, C.white, 0.7)];
    c.push(...this.sceneLine([P(54, 54), P(66, 39), P(59, 24), P(64, 11), P(74, 10), P(87, 13)], 2.4, 0.65));
    c.push(...this.sceneLine([P(43, 63), P(43, 86), P(34, 99)], 0.9));
    c.push(...this.sceneLine([P(49, 62), P(51, 84), P(54, 99)], 0.9));
    return c;
  },

  sceneBird(swallow = false) {
    if (swallow) {
      return this.sceneLine([P(0, 0), P(17, 13), P(30, 16), P(43, 7), P(62, 0)], 2.2, 0.75)
        .concat(this.sceneLine([P(29, 14), P(24, 29), P(34, 21), P(43, 29), P(34, 13)], 1.4, 0.7));
    }
    let c = [...this.blob(30, 35, { len: 25, wid: 15, ang: 0.4, col: C.ink(0.85) })];
    c.push(...this.blob(44, 24, { len: 11, wid: 10, col: C.ink(0.85) }));
    c.push(...this.sceneLine([P(46, 23), P(57, 26)], 1.3));
    c.push(...this.sceneLine([P(20, 38), P(9, 49)], 3));
    c.push(...this.sceneLine([P(29, 39), P(30, 51), P(37, 52)], 0.8));
    return c;
  },

  sceneDragonfly() {
    const c = [...this.sceneLine([P(50, 20), P(48, 70)], 1.2, 0.7)];
    for (const [x, y] of [[4.0, 20.0], [90, 24], [13, 45], [84, 49]]) {
      c.push(...this.sceneEllipse((x + 48) / 2, (y + 37) / 2, Math.abs(x - 48) / 2, 3, C.white, 0.4));
    }
    return c;
  },

  sceneButterfly() {
    const c = [];
    for (const [x, y, a] of [[33.0, 25.0, -0.7], [65, 25, 0.7], [37, 49, 0.4], [61, 49, -0.4]]) {
      c.push(...this.blob(x, y, { len: 35, wid: 21, ang: a, col: C.ink(0.35) }));
    }
    c.push(...this.sceneLine([P(49, 25), P(49, 65)], 2));
    return c;
  },

  sceneStream() {
    const c = [];
    for (const offset of [0.0, 16]) {
      const line = [];
      for (let i = 0; i <= 35; i++) {
        const t = i / 35;
        line.push(P(45 + Math.sin(t * 8) * (8 + t * 16) + offset * t, t * 100));
      }
      c.push(...this.sceneLine(line, 1, 0.4));
    }
    for (let k = 1; k < 8; k++) {
      const y = k * 13;
      const x = 45 + Math.sin((y / 100) * 8) * (8 + y * 0.16);
      c.push(...this.sceneLine([P(x + 4, y), P(x + 10, y + 1)], 0.7, 0.28));
    }
    return c;
  },

  sceneWaterfall() {
    const c = [];
    for (let k = 0; k < 8; k++) {
      const x = 40 + k * 3;
      const pts = [];
      for (let i = 0; i <= 24; i++) {
        const t = i / 24;
        pts.push(P(x + Math.sin(t * 9 + k) * 1.5, t * 100));
      }
      c.push(...this.sceneLine(pts, k === 0 || k === 7 ? 1.6 : 0.5, k === 0 || k === 7 ? 0.6 : 0.18));
    }
    c.push(...this.sceneEllipse(50, 105, 22, 3, null, 0.24));
    return c;
  },

  sceneDunes() {
    const c = [];
    for (let row = 0; row < 3; row++) {
      const y = 28 + row * 27;
      const points = [];
      for (let i = 0; i <= 60; i++) {
        const x = i * 3;
        points.push(P(x, y - Math.sin((i / 60) * Math.PI + row * 0.7) * 20));
      }
      c.push(...this.sceneLine(points, 1.6, 0.28 + row * 0.10));
      for (let j = 1; j <= 5; j++) {
        c.push(...this.sceneLine(points.map(p => P(p.x, p.y + j * 1.8)), 0.4, 0.04));
      }
    }
    return c;
  },

  sceneSmoke(beacon = false) {
    const c = [];
    for (let k = 0; k < 5; k++) {
      const points = [];
      for (let i = 0; i <= 35; i++) {
        const t = i / 35;
        const dx = beacon ? Math.sin(t * 3) * 2 : Math.sin(t * 10) * 7 + t * 16;
        points.push(P(30 + dx + k * (1 - t) * 1.5, 100 - t * 100));
      }
      c.push(...this.sceneLine(points, beacon ? 1.0 : 0.7, 0.12 + k * 0.015));
    }
    return c;
  },

  sceneMist() {
    const c = [];
    for (let k = 0; k < 7; k++) {
      c.push(...this.sceneEllipse(60 + Math.sin(k) * 20, 30 + k * 2, 65, 5, C(255, 255, 255, 0.2), 0));
    }
    return c;
  },

  sceneCelestial(kind) {
    if (kind === 'crescent') {
      const outer = [];
      for (let i = 0; i <= 40; i++) {
        const a = (i / 40) * Math.PI;
        outer.push(P(40 + Math.sin(a) * 25, 35 - Math.cos(a) * 25));
      }
      const inner = [];
      for (let i = 40; i >= 0; i--) {
        const a = (i / 40) * Math.PI;
        inner.push(P(40 + Math.sin(a) * 13, 35 - Math.cos(a) * 25));
      }
      return [this.poly(outer.concat(inner), { fil: C.ink(0.25), str: C.ink(0.28), wid: 0.4 })];
    }
    return this.sceneEllipse(40, 40, 25, 25, kind === 'moon' ? C.white : C.ink(0.28), kind === 'moon' ? 0.2 : 0.1);
  },

  sceneStars() {
    const c = [];
    for (let i = 0; i < 9; i++) {
      c.push(...this.sceneEllipse(this.r() * 100, this.r() * 65, 0.5 + this.r(), 0.5 + this.r(), C.ink(0.4), 0));
    }
    return c;
  },

  sceneSnowGround() {
    const c = [];
    for (let k = 0; k < 5; k++) {
      c.push(...this.sceneLine([P(0, k * 10), P(30, k * 10 - 3), P(70, k * 10 + 1), P(110, k * 10)], 1.2, 0.15));
    }
    return c;
  },

  sceneWaves() {
    const c = [];
    for (let row = 0; row < 7; row++) {
      const y = row * 14;
      const pts = [];
      for (let i = 0; i <= 70; i++) {
        const x = i * 3;
        pts.push(P(x, y + Math.sin(x * 0.045 + row * 1.5) * (1 + row * 0.7)));
      }
      c.push(...this.sceneLine(pts, 0.5 + row * 0.12, 0.12 + row * 0.035));
    }
    return c;
  },

  sceneAsset(motif) {
    switch (motif) {
      case 'oldTree': return this.tree06(0, 0, { hei: 120, wid: 4 });
      case 'bareTree': return this.sceneBareTree();
      case 'layeredTree': return this.tree05(0, 0, { hei: 150, wid: 4 });
      case 'pine': return this.scenePine();
      case 'bamboo': return this.sceneBamboo();
      case 'willow': return this.sceneWillow();
      case 'reeds':
      case 'grass': return this.sceneGrass(motif === 'reeds');
      case 'maple': return this.sceneBlossom(true);
      case 'vine': return this.sceneVine();
      case 'blossom': return this.sceneBlossom(false);
      case 'lotus': return this.sceneLotus();
      case 'bridge': return this.sceneBridge();
      case 'house': return this.arch02(50, 90, { wid: 100, rot: 0.35, sto: 1, sty: 2 });
      case 'hut': return this.arch01(50, 100, { hei: 55, wid: 110, per: 0.5 });
      case 'pavilion': return this.arch04(50, 100, { hei: 23, wid: 80, sto: 1 });
      case 'pagoda': return this.arch03(50, 100, { hei: 14, wid: 50, sto: 5 });
      case 'templeGate': return this.sceneGate(true);
      case 'cityGate': return this.sceneGate(false);
      case 'courtyard': return this.sceneCourtyard();
      case 'window': return this.sceneWindow();
      case 'curtain': return this.sceneCurtain();
      case 'terrace': return this.sceneTerrace();
      case 'ruins': return this.sceneRuins();
      case 'fence': return this.sceneFence();
      case 'fields': return this.sceneFields();
      case 'path': return this.scenePath();
      case 'boat':
      case 'mooredBoat':
      case 'sail':
      case 'angler': return this.sceneBoat(motif);
      case 'traveler':
        return this.man(40, 100, { sca: 0.9 }).concat(this.sceneLine([P(58, 54), P(63, 102)], 1));
      case 'horse': return this.sceneHorse();
      case 'egret': return this.sceneEgret();
      case 'crow':
      case 'swallow': return this.sceneBird(motif === 'swallow');
      case 'dragonfly': return this.sceneDragonfly();
      case 'butterfly': return this.sceneButterfly();
      case 'stream': return this.sceneStream();
      case 'waterfall': return this.sceneWaterfall();
      case 'dunes': return this.sceneDunes();
      case 'beaconSmoke':
      case 'cookingSmoke': return this.sceneSmoke(motif === 'beaconSmoke');
      case 'mist':
      case 'afterRain': return this.sceneMist();
      case 'moon':
      case 'crescent':
      case 'sunrise':
      case 'sunset': return this.sceneCelestial(motif);
      case 'stars': return this.sceneStars();
      case 'snow': return this.sceneSnowGround();
      case 'waves': return this.sceneWaves();
      case 'reef': return this.rock(50, 100, 4, { hei: 45, wid: 100, sha: 2 });
      case 'rain': return [];
      default: return [];
    }
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  11. ShanShuiSceneV4.swift — 诗意景物生成器（shanshui@4 引擎）
// ═══════════════════════════════════════════════════════════════════════════

class SceneStageV4 {
  constructor(seed, width, height, palette, verse, quietTop) {
    this.w = width;
    this.h = height;
    this.palette = palette;
    this.verse = verse ? verseRect(verse, width, height).inset(-8, -8) : new CRect(0, 0, 0, 0);
    this.engine = new ShanShuiEngineV5('poetry-scene-v1:' + (seed ? (seed.string || seed) : ''));
    this.engine.drawTowers = false;
    this.engine.anchorLog = [];
    this.parts = [];
    this.elements = [];
    this.placed = new Set();
    this.celestialLayers = [];
    this.boats = [];

    const pad = Math.min(width, height) * 0.045;
    const top = Math.max(pad, quietTop * height);
    const side = verse ? verse.side : 'right';

    switch (side) {
      case 'right':
        this.art = new CRect(pad, top, Math.max(60, this.verse.minX - pad * 2), height - top - pad);
        break;
      case 'left':
        this.art = new CRect(this.verse.maxX + pad, top, Math.max(60, width - this.verse.maxX - pad * 2), height - top - pad);
        break;
      case 'top':
      default:
        if (width > height * 1.3) {
          this.art = new CRect(this.verse.maxX + pad, pad, Math.max(60, width - this.verse.maxX - pad * 2), height - 2 * pad);
        } else {
          const s = Math.max(top, this.verse.maxY + pad);
          this.art = new CRect(pad, s, width - 2 * pad, Math.max(60, height - s - pad));
        }
        break;
    }

    const bottomTop = Math.max(this.verse.maxY + pad, height * 0.75);
    if (width <= height * 1.3 && bottomTop < height - pad - 40) {
      this.foreground = new CRect(pad, bottomTop, width - 2 * pad, height - bottomTop - pad);
    } else {
      this.foreground = new CRect(this.art.minX, this.art.minY + this.art.height * 0.72, this.art.width, this.art.height * 0.28);
    }
  }

  slot(x, y, width, height, front = false) {
    const box = front ? this.foreground : this.art;
    return new CRect(
      box.minX + x * box.width,
      box.minY + y * box.height,
      width * box.width,
      height * box.height
    );
  }

  add(motif, box, repeatable = false) {
    if (!repeatable && this.placed.has(motif)) return false;
    const raw = this.engine.sceneAsset(motif);
    const object = this.fitted(raw, box);
    if (!object) return false;

    const actual = object.bounds;
    this.support(motif, actual);
    this.parts.push(Part.near(object.canv));
    this.elements.push({
      motif,
      bounds: {
        x: actual.minX / this.w,
        y: actual.minY / this.h,
        width: actual.width / this.w,
        height: actual.height / this.h
      }
    });

    if (motif === 'moon' || motif === 'sunrise' || motif === 'sunset') {
      this.celestialLayers.push({ layer: this.parts.length - 1, motif });
    }

    if (motif === 'boat' || motif === 'mooredBoat' || motif === 'angler' || motif === 'sail') {
      const hull = object.canv[0];
      if (hull && hull.pts.length > 0) {
        let minX = Infinity, maxX = -Infinity, bottom = -Infinity;
        for (const p of hull.pts) {
          if (p.x < minX) minX = p.x;
          if (p.x > maxX) maxX = p.x;
          if (p.y > bottom) bottom = p.y;
        }
        this.boats.push({
          x: (minX + maxX) / 2 / this.w,
          y: bottom / this.h,
          length: (maxX - minX) / this.w,
          flipped: false
        });
      }
    }

    this.placed.add(motif);
    return true;
  }

  support(motif, bounds) {
    const grounded = new Set([
      'oldTree', 'bareTree', 'layeredTree', 'pine', 'bamboo', 'willow',
      'blossom', 'maple', 'house', 'hut', 'pavilion', 'pagoda', 'templeGate', 'cityGate',
      'courtyard', 'terrace', 'ruins', 'traveler', 'horse'
    ]);
    if (!grounded.has(motif)) return;

    const spread = Math.min(bounds.width * 0.68 + 4, this.art.width * 0.43);
    const x0 = Math.max(this.art.minX, bounds.midX - spread);
    const x1 = Math.min(this.w - 8, bounds.midX + spread);
    const y = bounds.maxY;
    const depth = Math.min(9, Math.max(2, bounds.height * 0.045));
    const lines = [];

    for (let k = 0; k < 3; k++) {
      const points = [];
      for (let i = 0; i <= 24; i++) {
        const t = i / 24;
        points.push(P(
          x0 + t * (x1 - x0),
          y + depth * k * 0.4 + Math.sin(t * Math.PI) * depth * 0.3 + Math.sin(t * 9) * depth * 0.12
        ));
      }
      const box = new CRect(x0, y, x1 - x0, depth * 1.2);
      if (box.maxY >= this.h - 2 || box.intersects(this.verse)) continue;
      lines.push(...this.engine.sceneLine(points, k === 0 ? 0.75 : 0.4, k === 0 ? 0.3 : 0.12));
    }
    if (lines.length > 0) {
      this.parts.push(Part.near(lines));
    }
  }

  fitted(raw, box) {
    if (!raw) return null;
    raw = (Array.isArray(raw) ? raw.flat(Infinity) : [raw]).filter(Boolean);
    if (raw.length === 0 || box.width <= 0 || box.height <= 0) return null;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const poly of raw) {
      const pts = poly.pts || poly.p || [];
      for (const p of pts) {
        if (p.x < x0) x0 = p.x;
        if (p.x > x1) x1 = p.x;
        if (p.y < y0) y0 = p.y;
        if (p.y > y1) y1 = p.y;
      }
    }
    if (x1 <= x0 || y1 <= y0) return null;

    const scale = Math.min(box.width / (x1 - x0), box.height / (y1 - y0));
    const dx = box.midX - ((x0 + x1) / 2) * scale;
    const dy = box.maxY - y1 * scale;

    const transformed = raw.map(poly => {
      const pts = poly.pts || poly.p || [];
      const newPts = pts.map(p => P(p.x * scale + dx, p.y * scale + dy));
      return {
        ...poly,
        p: newPts,
        pts: newPts,
        wid: (poly.wid || 0) * scale
      };
    });

    const actual = new CRect(x0 * scale + dx, y0 * scale + dy, (x1 - x0) * scale, (y1 - y0) * scale);
    if (actual.intersects(this.verse)) return null;
    if (!new CRect(0, 0, this.w, this.h).inset(-1, -1).contains(actual)) return null;
    return { canv: transformed, bounds: actual };
  }

  hills(main = false) {
    for (let k = 0; k < 2; k++) {
      const raw = this.engine.distMount(0, 100, k * 12 + this.engine.r(), { hei: 65 + k * 20, len: 400 });
      const object = this.fitted(raw, this.slot(0, 0.02 + k * 0.08, 1, 0.28));
      if (object) {
        const lightened = object.canv.map(poly => ({ ...poly, wash: true }));
        this.parts.push(new Part(lightened, {
          depth: object.bounds.height * 1.3,
          blur: 1,
          peak: 0.65,
          floorY: object.bounds.maxY - 1,
          floorDepth: object.bounds.height * 0.5
        }));
      }
    }
    if (main) {
      const raw = this.engine.mountain(0, 100, this.engine.r() * 100, { hei: 380, wid: 230, tex: 90, veg: false });
      const object = this.fitted(raw, this.slot(0.02, 0.05, 0.78, 0.63));
      if (object) {
        this.parts.push(new Part(object.canv));
      }
      this.engine.anchorLog = [];
    }
  }

  water() {
    const raw = this.engine.sceneAsset('waves');
    let object = this.fitted(raw, this.slot(0, 0.78, 1, 0.17));
    if (object) this.parts.push(Part.near(object.canv));
    object = this.fitted(raw, this.slot(0, 0.24, 1, 0.63, true));
    if (object) this.parts.push(Part.near(object.canv));
  }

  ground(scene) {
    if (scene === 'desert' || scene === 'ocean' || scene === 'moonNight') return;
    const y = (scene === 'waterTown' || scene === 'farewell' || scene === 'village') ? 0.66 : 0.80;
    const bank = this.slot(0, y, 1, 0.15);
    const points = [];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      points.push(P(
        bank.minX + t * bank.width,
        bank.minY + Math.sin(t * Math.PI * 1.5) * bank.height * 0.2 + t * bank.height * 0.15
      ));
    }
    const base = points.concat([P(bank.maxX, bank.maxY), P(bank.minX, bank.maxY)]);
    const fill = this.engine.poly(base, { fil: C.gray(241, 0.45), str: null });
    const line = this.engine.sceneLine(points, 0.9, 0.35);
    this.parts.push(Part.near([fill].concat(line)));
    const stones = this.engine.rock(0, 50, 4, { hei: 24, wid: 70, sha: 2 });
    const object = this.fitted(stones, this.slot(0.07, y - 0.02, 0.24, 0.10));
    if (object) this.parts.push(Part.near(object.canv));
  }

  compose(scene, options = {}) {
    const chosen = new Set(options.motifs || defaultMotifsForScene(scene));
    const include = (motif, box) => {
      if (chosen.has(motif)) this.add(motif, box);
    };

    if (scene !== 'desert' && scene !== 'ocean' && scene !== 'courtyard') {
      this.hills(scene === 'retreat' || scene === 'temple' || scene === 'historic');
    }
    this.ground(scene);
    if (scene === 'fishing' || scene === 'waterTown' || scene === 'farewell' || scene === 'lotusPond' || scene === 'moonNight' || scene === 'ocean') {
      this.water();
    }

    switch (scene) {
      case 'retreat':
        include('pine', this.slot(0.5, 0.44, 0.47, 0.38));
        include('bamboo', this.slot(0.02, 0.51, 0.38, 0.31));
        include('hut', this.slot(0.47, 0.69, 0.48, 0.17));
        include('stream', this.slot(0.35, 0.56, 0.20, 0.4));
        break;
      case 'fishing':
        if (chosen.has('angler')) this.add('angler', this.slot(0.10, 0.58, 0.85, 0.2));
        else if (chosen.has('sail')) this.add('sail', this.slot(0.16, 0.47, 0.7, 0.29));
        else include('boat', this.slot(0.14, 0.62, 0.75, 0.15));
        include('reeds', this.slot(0.03, 0.15, 0.27, 0.8, true));
        break;
      case 'waterTown':
        include('house', this.slot(0.40, 0.45, 0.58, 0.2));
        if (chosen.has('house')) this.add('house', this.slot(0.68, 0.43, 0.3, 0.12), true);
        include('willow', this.slot(0.01, 0.18, 0.45, 0.49));
        include('bridge', this.slot(0.17, 0.1, 0.70, 0.34, true));
        include('mooredBoat', this.slot(0.5, 0.58, 0.37, 0.2, true));
        break;
      case 'farewell':
        include('willow', this.slot(0.02, 0.10, 0.59, 0.56));
        include('pavilion', this.slot(0.60, 0.46, 0.38, 0.22));
        include('traveler', this.slot(0.57, 0.64, 0.10, 0.12));
        if (chosen.has('traveler')) this.add('traveler', this.slot(0.74, 0.65, 0.08, 0.1), true);
        include('path', this.slot(0.05, 0, 0.28, 0.8, true));
        include('mooredBoat', this.slot(0.42, 0.48, 0.49, 0.28, true));
        break;
      case 'village':
        include('house', this.slot(0.30, 0.4, 0.57, 0.22));
        if (chosen.has('house')) this.add('house', this.slot(0.02, 0.47, 0.4, 0.17), true);
        include('fields', this.slot(0.05, 0.0, 0.9, 0.92, true));
        include('fence', this.slot(0.05, 0.63, 0.85, 0.12));
        include('path', this.slot(0.65, 0.62, 0.24, 0.34));
        break;
      case 'spring':
        include('blossom', this.slot(0.02, 0.17, 0.72, 0.62));
        include('layeredTree', this.slot(0.65, 0.46, 0.32, 0.32));
        include('path', this.slot(0.2, 0.02, 0.48, 0.9, true));
        break;
      case 'lotusPond':
        include('lotus', this.slot(0.02, 0.35, 0.92, 0.47));
        include('willow', this.slot(0.70, 0.08, 0.27, 0.39));
        include('dragonfly', this.slot(0.24, 0.33, 0.18, 0.08));
        break;
      case 'autumnTravel':
        include('bareTree', this.slot(0.03, 0.13, 0.68, 0.66));
        include('vine', this.slot(0.18, 0.21, 0.30, 0.35));
        include('crow', this.slot(0.12, 0.23, 0.13, 0.08));
        include('path', this.slot(0.05, 0, 0.52, 0.95, true));
        include('traveler', this.slot(0.47, 0.68, 0.12, 0.12));
        include('horse', this.slot(0.66, 0.22, 0.25, 0.58, true));
        include('bridge', this.slot(0.01, 0.08, 0.42, 0.29, true));
        include('stream', this.slot(0.02, 0.36, 0.35, 0.55, true));
        break;
      case 'winterForest':
        include('oldTree', this.slot(0.02, 0.30, 0.48, 0.5));
        include('bareTree', this.slot(0.40, 0.12, 0.33, 0.57));
        if (chosen.has('bareTree')) this.add('bareTree', this.slot(0.71, 0.2, 0.22, 0.38), true);
        include('house', this.slot(0.58, 0.65, 0.39, 0.15));
        include('snow', this.slot(0, 0.1, 1, 0.8, true));
        break;
      case 'moonNight':
        include('window', this.slot(0.58, 0.35, 0.39, 0.44));
        include('boat', this.slot(0.08, 0.65, 0.5, 0.14, true));
        break;
      case 'temple':
        include('templeGate', this.slot(0.32, 0.42, 0.65, 0.29));
        include('pagoda', this.slot(0.03, 0.12, 0.28, 0.37));
        include('bamboo', this.slot(0.03, 0.52, 0.26, 0.3));
        include('path', this.slot(0.15, 0, 0.45, 0.95, true));
        break;
      case 'courtyard':
        include('courtyard', this.slot(0, 0.36, 1, 0.49));
        include('window', this.slot(0.07, 0.45, 0.32, 0.27));
        include('curtain', this.slot(0.09, 0.46, 0.27, 0.23));
        include('willow', this.slot(0.64, 0.06, 0.34, 0.55));
        break;
      case 'historic':
        include('cityGate', this.slot(0.52, 0.4, 0.45, 0.24));
        include('terrace', this.slot(0.02, 0.05, 0.65, 0.56, true));
        include('ruins', this.slot(0.67, 0.48, 0.3, 0.31, true));
        include('traveler', this.slot(0.30, 0.65, 0.10, 0.12));
        break;
      case 'desert':
        include('dunes', this.slot(0, 0.4, 1, 0.44));
        if (chosen.has('dunes')) this.add('dunes', this.slot(0, 0.2, 1, 0.75, true), true);
        break;
      case 'ocean':
        include('waves', this.slot(0, 0.35, 1, 0.54));
        include('reef', this.slot(0.68, 0.35, 0.29, 0.5, true));
        break;
    }

    const canon = canonicalMotifs(Array.from(chosen));
    for (const motif of canon) {
      if (this.placed.has(motif)) continue;
      if (motif === 'boat' && (chosen.has('angler') || chosen.has('mooredBoat') || chosen.has('sail'))) continue;
      if (motif === 'moon' && chosen.has('crescent')) continue;
      if ((motif === 'sunrise' || motif === 'sunset') && (chosen.has('moon') || chosen.has('crescent'))) continue;

      switch (motif) {
        case 'moon':
        case 'crescent':
        case 'sunrise':
        case 'sunset':
          this.add(motif, this.slot(0.55, 0.04, 0.24, 0.16));
          break;
        case 'stars':
          this.add(motif, this.slot(0.05, 0.0, 0.85, 0.18));
          break;
        case 'cookingSmoke':
          this.add(motif, this.slot(0.56, 0.25, 0.15, 0.24));
          break;
        case 'beaconSmoke':
          this.add(motif, this.slot(0.28, 0.22, 0.06, 0.4));
          break;
        case 'egret':
          this.add(motif, this.slot(0.7, 0.58, 0.13, 0.17));
          break;
        case 'crow':
        case 'swallow':
        case 'dragonfly':
        case 'butterfly':
          this.add(motif, this.slot(0.48, 0.32, 0.17, 0.12));
          break;
        case 'waterfall':
          this.add(motif, this.slot(0.15, 0.34, 0.18, 0.45));
          break;
        case 'stream':
          this.add(motif, this.slot(0.60, 0.02, 0.22, 0.88, true));
          break;
        case 'mist':
        case 'afterRain':
          this.add(motif, this.slot(0.02, 0.42, 0.96, 0.10));
          break;
        case 'rain':
          break;
        case 'snow':
          this.add(motif, this.slot(0, 0.2, 1, 0.65, true));
          break;
        case 'path':
          this.add(motif, this.slot(0.1, 0.1, 0.4, 0.8, true));
          break;
        case 'reeds':
        case 'grass':
          this.add(motif, this.slot(0.03, 0.1, 0.20, 0.8, true));
          break;
        case 'horse':
          this.add(motif, this.slot(0.60, 0.25, 0.28, 0.62, true));
          break;
        case 'traveler':
          this.add(motif, this.slot(0.38, 0.66, 0.1, 0.12));
          break;
        default:
          this.add(motif, this.slot(0.03, 0.44, 0.43, 0.36));
          break;
      }
    }
  }
}

function generatePoetrySceneV4(req, palette) {
  const seed = req.seed || 'seed';
  const width = req.width || 420;
  const height = req.height || 420;
  const ratio = height / width;
  const w = 420 * Math.max(1, 1 / ratio);
  const h = 420 * Math.max(1, ratio);
  const quietTop = req.quietTop ?? 0.08;
  const verse = req.verse || null;
  const sceneRaw = req.scene || 'retreat';
  const sceneValue = typeof sceneRaw === 'object' && sceneRaw !== null ? sceneRaw.scene : sceneRaw;
  const scene = POETRY_SCENE_FROM_RAW[sceneValue] || sceneValue;
  const options = req.options || {};

  const stage = new SceneStageV4(seed, w, h, palette, verse, quietTop);
  stage.compose(scene, options);

  const layers = [];
  const nearSpans = [];

  for (let index = 0; index < stage.parts.length; index++) {
    const part = stage.parts[index];
    const shapes = [];
    appendShapesV4(part.canv, palette, shapes);

    const record = stage.celestialLayers.find(r => r.layer === index);
    if (record) {
      for (let i = 0; i < shapes.length; i++) {
        if (record.motif === 'sunset' || record.motif === 'sunrise') {
          shapes[i].fill = [171 / 255, 64 / 255, 51 / 255, palette.isDark ? 0.48 : 0.34];
        } else if (record.motif === 'moon' && palette.isDark) {
          shapes[i].fill = opacity(palette.ink, 0.48);
        }
      }
    }

    if (part.near) {
      nearSpans.push({ layer: layers.length, range: [0, shapes.length] });
    }

    if (part.mist) {
      layers.push({
        shapes,
        mist: {
          depth: part.mist.depth,
          blur: part.mist.blur,
          peakOpacity: part.mist.peak,
          floorY: part.mist.floorY,
          floorDepth: part.mist.floorDepth
        }
      });
    } else {
      layers.push({ shapes });
    }
  }

  const paper = stage.engine.backgroundPaper();
  paper.tint = palette.ink;
  paper.strength *= 0.45;

  const drawing = {
    width: w,
    height: h,
    background: palette.paper,
    paper,
    layers,
    verse,
    nearSpans,
    sceneElements: stage.elements,
    ...(stage.engine.landscapeSeed ? {brushwork:{version:'landscape-v3', technique:stage.engine.landscapeTechnique}} : {}),
    anchors: buildAnchorsV5(stage.engine.anchorPieces, w, h, stage.boats) || {
      boats: stage.boats,
      sky: { y: [0, 0.38] }
    }
  };

  const trace = {
    logicalWidth: w,
    logicalHeight: h,
    polygons: []
  };
  for (const part of stage.parts) {
    for (const poly of part.canv) {
      trace.polygons.push(poly.p.map(p => ({ x: p.x, y: p.y })));
    }
  }

  return { drawing, trace };
}

Object.assign(globalThis, {
  SceneStageV4,
  generatePoetrySceneV4
});


// ═══════════════════════════════════════════════════════════════════════════
//  12. ShanShuiSceneV5.swift — 国画三远与写意画卷生成器（shanshui@5 引擎）
// ═══════════════════════════════════════════════════════════════════════════

function multiplierV5(seed, motif, instance) {
  let hash = 2166136261 >>> 0;
  const str = seed + ':' + motif + ':' + instance;
  for (let i = 0; i < str.length; i++) {
    hash = Math.imul(hash ^ str.charCodeAt(i), 16777619) >>> 0;
  }
  return 0.5 + 0.5 * (hash / 4294967295);
}

class PaintingStageV5 {
  constructor(seed, width, height, palette, verse, quietTop, options = {}) {
    this.w = width;
    this.h = height;
    this.palette = palette;
    this.seed = typeof seed === 'object' && seed !== null ? (seed.string || seed.seed || 'seed') : String(seed || 'seed');
    this.selectedMotifs = new Set(options.motifs || []);
    this.lotusState = options.lotusState || 'flowering';
    this.donkey = Boolean(options.donkey);

    let layoutHash = 2166136261 >>> 0;
    const lStr = 'painting-layout-v1:' + this.seed;
    for (let i = 0; i < lStr.length; i++) {
      layoutHash = Math.imul(layoutHash ^ lStr.charCodeAt(i), 16777619) >>> 0;
    }
    this.layoutVariant = layoutHash % 4;

    this.purpose = options.purpose || 'inscription';
    this.composition = options.composition || 'corner';

    if (this.purpose === 'reading' || !verse) {
      this.verse = new CRect(0, 0, 0, 0);
    } else {
      this.verse = verseRect(verse, width, height).inset(-8, -8);
    }

    this.engine = new ShanShuiEngineV5('poetry-painting-v1:' + this.seed);
    this.waterEngine = new ShanShuiEngineV5('poetry-water-v1:' + this.seed);
    this.engine.drawTowers = false;
    this.engine.anchorLog = [];

    const pad = Math.min(width, height) * 0.045;
    const top = Math.max(pad, quietTop * height);
    this.contentTop = top;
    const footer = this.purpose === 'recommendation' ? height * 0.87 : height - pad;
    this.footer = footer;

    if (!this.verse.isNull && width <= height * 1.3 && this.verse.maxY < height * 0.82) {
      this.bandTop = this.verse.maxY + pad * 0.4;
    } else {
      this.bandTop = null;
    }

    let left, available;
    const verseSide = verse ? verse.side : 'right';
    if (this.purpose === 'reading') {
      left = pad;
      available = width - 2 * pad;
    } else if (verseSide === 'right') {
      left = pad;
      available = Math.max(60, this.verse.minX - 2 * pad);
    } else if (verseSide === 'left' || width > height * 1.3) {
      left = this.verse.maxX + pad;
      available = Math.max(60, width - left - pad);
    } else {
      left = pad;
      available = width - 2 * pad;
    }

    const start = (verseSide === 'top' && this.purpose !== 'reading' && width <= height * 1.3)
      ? Math.max(top, this.verse.maxY + pad)
      : top;
    const high = Math.max(60, footer - start);

    switch (this.composition) {
      case 'corner': {
        const inset = this.purpose === 'reading' ? available * 0.15 : 0;
        this.art = new CRect(left + (verseSide === 'left' ? inset : 0), start + high * 0.08, available - inset, high * 0.87);
        break;
      }
      case 'oppositeBank': {
        this.art = new CRect(left, start, available, high * 0.70);
        break;
      }
      case 'depth':
      default: {
        this.art = new CRect(left, start, available, high * 0.96);
        break;
      }
    }

    const low = this.purpose === 'reading' ? height * 0.66 : Math.max(this.verse.maxY + pad, height * 0.58);
    if (width <= height * 1.3 && footer - low > 28) {
      this.foreground = new CRect(pad, low, width - 2 * pad, footer - low);
    } else {
      this.foreground = new CRect(this.art.minX, this.art.minY + this.art.height * 0.72, this.art.width, this.art.height * 0.28);
    }

    this.parts = [];
    this.elements = [];
    this.placed = new Set();
    this.paintedTrees = {};
    this.treePerches = {};
    this.treeVines = {};
    this.treeRoots = {};
    this.celestialLayers = [];
    this.boats = [];
    this.mountainRidges = [];
    this.summitLedge = null;
    this.houseWindowFrame = null;
    this.lotusFlowerTip = null;
    this.streamInlet = null;
    this.terrainLayerEnd = 0;
    this.historicGroundNeeded = false;
    this.structure = 'level';
    this.currentScene = 'retreat';
    this.bankSurface = null;
    this.preparedGround = null;
    this.groundInBand = false;
    this.pinned = false;
  }

  lowerBand(fraction = 0.55) {
    const pad = Math.min(this.w, this.h) * 0.045;
    if (this.bandTop !== null && this.footer - this.bandTop > 20) {
      return new CRect(pad, this.bandTop, this.w - 2 * pad, this.footer - this.bandTop);
    }
    const top = this.art.minY + this.art.height * fraction;
    return new CRect(this.art.minX, top, this.art.width, Math.max(20, this.footer - top));
  }

  slot(x, y, width, height, front = false) {
    const box = front ? this.foreground : this.art;
    const r = new CRect(
      box.minX + x * box.width,
      box.minY + y * box.height,
      width * box.width,
      height * box.height
    );
    if (!front && !this.verse.isNull && r.minY >= this.verse.maxY) {
      const pad = Math.min(this.w, this.h) * 0.045;
      const band = new CRect(pad, 0, this.w - 2 * pad, this.h);
      const u0 = (r.minX - this.art.minX) / this.art.width;
      const u1 = (r.maxX - this.art.minX) / this.art.width;
      return new CRect(band.minX + u0 * band.width, r.minY, (u1 - u0) * band.width, r.height);
    }
    return r;
  }

  leadTreeSlot() {
    const xs = [0.0, 0.40, 0.02, 0.02];
    const widths = [0.98, 0.56, 0.80, 0.94];
    const heights = [0.94, 0.70, 0.90, 0.82];
    return this.slot(xs[this.layoutVariant], 0.06, widths[this.layoutVariant], heights[this.layoutVariant]);
  }

  add(motif, box, repeatable = false, source = null) {
    if (!repeatable && this.placed.has(motif)) return false;
    let raw;
    let woodyTree = null;
    let lotus = null;
    const reserveWindow = (motif === 'house' && this.currentScene === 'moonNight' && this.selectedMotifs.has('window'));

    if (source) {
      raw = source;
    } else if (motif === 'oldTree' || motif === 'bareTree') {
      const tree = this.engine.paintingWoodyTree(motif === 'oldTree');
      woodyTree = tree;
      raw = tree.canvas;
    } else if (motif === 'lotus') {
      const drawing = this.engine.paintingLotusDrawing(this.lotusState);
      lotus = drawing;
      raw = drawing.canvas;
    } else if (motif === 'horse' && this.donkey) {
      raw = this.engine.paintingHorse({ donkey: true });
    } else if (reserveWindow) {
      raw = this.engine.paintingHouse({ reservingWindow: true });
    } else if (motif === 'mooredBoat') {
      raw = this.engine.paintingBoat('mooredBoat', false);
    } else if (motif === 'stream') {
      raw = this.currentScene === 'desert'
        ? this.waterEngine.paintingLongRiver()
        : this.currentScene === 'retreat'
          ? this.waterEngine.paintingRockyStream()
          : this.waterEngine.paintingChannel(box.width, box.height);
    } else if (motif === 'curtain') {
      raw = this.engine.paintingCurtain(box.width, box.height);
    } else if (motif === 'window' && this.currentScene === 'courtyard') {
      raw = this.engine.paintingWindow({ embedded: true });
    } else {
      raw = this.engine.paintingAsset(motif);
    }

    if (this.groundInBand && (motif === 'path' || motif === 'fields')) {
      const bankElem = this.elements.find(e => e.motif === 'groundBank');
      if (bankElem) {
        const b = new CRect(bankElem.bounds.x * this.w, bankElem.bounds.y * this.h, bankElem.bounds.width * this.w, bankElem.bounds.height * this.h);
        box = motif === 'path'
          ? new CRect(b.minX + b.width * 0.30, b.minY + b.height * 0.25, b.width * 0.22, b.height * 0.70)
          : new CRect(b.minX + b.width * 0.48, b.minY + b.height * 0.18, b.width * 0.46, b.height * 0.55);
      }
    }

    const scaled = this.pinned ? box : this.scaledSlot(motif, box);
    const placement = motif === 'window' ? this.groundedSlot(motif, scaled) : scaled;
    let object = this.fitted(raw, placement);
    if (!object) return false;

    if (motif !== 'window' && !this.pinned) {
      const landed = this.groundedSlot(motif, object.bounds);
      if (!landed.equals(object.bounds)) {
        const moved = this.fitted(raw, landed);
        if (!moved) return false;
        object = moved;
      }
    }

    const trees = new Set(['pine', 'oldTree', 'bareTree', 'layeredTree', 'willow', 'blossom', 'maple']);
    let plantedRoot = null;

    if (trees.has(motif) && this.bankSurface) {
      const points = [];
      for (const poly of raw) {
        for (const pt of poly.pts) points.push(pt);
      }
      let minX = Infinity, maxX = -Infinity, minY = Infinity;
      for (const p of points) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
      }
      const root = motif === 'oldTree' ? P(65, 175) : P(66, 178);
      const scale = object.bounds.width / (maxX - minX);
      const rootX = object.bounds.minX + (root.x - minX) * scale;
      const rootY = object.bounds.minY + (root.y - minY) * scale;
      const end = this.bankSurface.x0 + this.bankSurface.step * (this.bankSurface.heights.length - 1);
      let desiredRoot = rootX;

      if (this.currentScene === 'autumnTravel' && motif === 'oldTree' && this.h > this.w) {
        const left = this.verse.midX > this.w / 2;
        const room = left ? object.bounds.minX - this.art.minX : this.art.maxX - object.bounds.maxX;
        const shift = Math.min(Math.max(0, room - 3), object.bounds.width * 0.8);
        desiredRoot += left ? -shift : shift;
      }

      const landedX = this.supportedBankX(Math.min(end - 1, Math.max(this.bankSurface.x0 + 1, desiredRoot)));
      const foot = this.bankFoot(landedX - 0.5, landedX + 0.5);
      if (foot !== null) {
        const landed = object.bounds.offset(landedX - rootX, foot - rootY);
        const moved = this.fitted(raw, landed);
        if (moved) {
          object = moved;
          plantedRoot = P(landedX, foot);
        }
      }
    }

    if (motif === 'traveler' || motif === 'horse') {
      const cleared = this.clearFigureGround(object.bounds);
      if (!cleared.equals(object.bounds)) {
        const moved = this.fitted(raw, cleared);
        if (moved) object = moved;
      }
    }

    // Rebuilt landforms can move a hut onto a tree's stem. Keep the trunk legible behind it.
    if (this.engine.landscapeSeed && ['house','hut','pavilion','templeGate','pagoda'].includes(motif)) {
      const cleared = this.clearFigureGround(object.bounds, true);
      if (!cleared.equals(object.bounds)) object = this.fitted(raw, cleared) || object;
    }

    if (['moon', 'crescent', 'sunrise', 'sunset'].includes(motif) && (this.mountainRidges.length > 0 || Object.keys(this.paintedTrees).length > 0)) {
      const sky = this.openSky(object.bounds);
      if (!sky) return false;
      const moved = this.fitted(raw, sky);
      if (!moved) return false;
      object = moved;
    }

    const accents = new Set([
      'pine', 'oldTree', 'bareTree', 'layeredTree', 'willow', 'bamboo',
      'blossom', 'maple', 'house', 'hut', 'pavilion', 'templeGate', 'pagoda', 'boat', 'angler',
      'mooredBoat', 'traveler', 'horse', 'bridge', 'reeds'
    ]);
    if (accents.has(motif)) {
      object.canv = this.engine.paintingInk(object.canv, this.engine.landscapeSeed ? 'middle' : 1);
    }

    const actual = object.bounds;
    if (reserveWindow) {
      const points = [];
      for (const poly of raw) {
        for (const pt of poly.pts) points.push(pt);
      }
      let minX = Infinity, maxX = -Infinity, minY = Infinity;
      for (const p of points) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
      }
      const scale = actual.width / (maxX - minX);
      this.houseWindowFrame = new CRect(
        actual.minX + (12 - minX) * scale,
        actual.minY + (44 - minY) * scale,
        19 * scale,
        15 * scale
      );
    }

    if (motif === 'mooredBoat' && object.canv[0] && object.canv[0].pts[0]) {
      const bow = object.canv[0].pts[0];
      object.canv.push(...this.mooring(bow, actual));
    }

    if (trees.has(motif)) {
      this.paintedTrees[motif] = object.canv;
    }

    if (woodyTree) {
      const points = [];
      for (const poly of raw) {
        for (const pt of poly.pts) points.push(pt);
      }
      let minX = Infinity, maxX = -Infinity, minY = Infinity;
      for (const p of points) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
      }
      const scale = actual.width / (maxX - minX);
      const moved = pt => P(actual.minX + (pt.x - minX) * scale, actual.minY + (pt.y - minY) * scale);
      this.treePerches[motif] = woodyTree.perches.map(moved);
      this.treeVines[motif] = woodyTree.vine.map(poly => {
        const next = { ...poly };
        next.pts = poly.pts.map(moved);
        next.wid *= scale;
        return next;
      });
    }

    if (lotus) {
      const points = [];
      for (const poly of raw) {
        for (const pt of poly.pts) points.push(pt);
      }
      let minX = Infinity, maxX = -Infinity, minY = Infinity;
      for (const p of points) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
      }
      const scale = actual.width / (maxX - minX);
      this.lotusFlowerTip = P(
        actual.minX + (lotus.flowerTip.x - minX) * scale,
        actual.minY + (lotus.flowerTip.y - minY) * scale
      );
    }

    if (motif === 'stream') {
      this.engine.noted('water', object.canv);
      if (object.canv[0] && object.canv[0].pts.length >= 2) {
        const bank = object.canv[0].pts;
        const left = bank[0], right = bank[bank.length - 1];
        this.streamInlet = P((left.x + right.x) / 2, (left.y + right.y) / 2);
      }
    }

    this.support(motif, actual, plantedRoot);
    if (plantedRoot) {
      this.treeRoots[motif] = plantedRoot;
      this.parts.push(Part.near(this.engine.paintingRootMoss(plantedRoot)));
    }

    if (['mist', 'afterRain', 'dunes'].includes(motif)) {
      this.parts.push(new Part(object.canv, {
        depth: actual.height * 4,
        blur: motif === 'dunes' ? 0.4 : 0.7,
        peak: 0.95,
        floorY: actual.maxY,
        floorDepth: actual.height * (motif === 'dunes' ? 0.28 : 0.8)
      }));
    } else {
      this.parts.push(Part.near(object.canv));
    }

    if (['refined-v1', 'painted-v2', 'landscape-v3'].includes(this.elementTreatment)) {
      this.parts[this.parts.length - 1].detail = { motif, bounds:actual };
    }

    this.elements.push({
      motif,
      bounds: {
        x: actual.minX / this.w,
        y: actual.minY / this.h,
        width: actual.width / this.w,
        height: actual.height / this.h
      }
    });

    if (['moon', 'crescent', 'sunrise', 'sunset'].includes(motif)) {
      this.celestialLayers.push({ layer: this.parts.length - 1, motif });
    }

    if (motif === 'house') {
      const points = [];
      for (const poly of raw) {
        for (const pt of poly.pts) points.push(pt);
      }
      let minX = Infinity, maxX = -Infinity, minY = Infinity;
      for (const p of points) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
      }
      const scale = actual.width / (maxX - minX);
      const doorPoly = raw.find(p => p.pts.length === 4 && p.fil && Math.abs(p.pts[0].y - 43) < 0.01 && Math.abs(p.pts[1].x - p.pts[0].x - 20) < 0.01);
      const eavesPoly = raw.length > 1 ? raw[1] : null;

      for (const [name, polygon] of [['houseDoor', doorPoly], ['houseEaves', eavesPoly]]) {
        if (!polygon) continue;
        let px0 = Infinity, px1 = -Infinity, py0 = Infinity, py1 = -Infinity;
        for (const pt of polygon.pts) {
          if (pt.x < px0) px0 = pt.x;
          if (pt.x > px1) px1 = pt.x;
          if (pt.y < py0) py0 = pt.y;
          if (pt.y > py1) py1 = pt.y;
        }
        this.elements.push({
          motif: name,
          bounds: {
            x: (actual.minX + (px0 - minX) * scale) / this.w,
            y: (actual.minY + (py0 - minY) * scale) / this.h,
            width: ((px1 - px0) * scale) / this.w,
            height: ((py1 - py0) * scale) / this.h
          }
        });
      }
    }

    if (['boat', 'mooredBoat', 'angler', 'sail'].includes(motif)) {
      const hull = object.canv[0];
      if (hull && hull.pts.length > 0) {
        let minX = Infinity, maxX = -Infinity, bottom = -Infinity;
        for (const p of hull.pts) {
          if (p.x < minX) minX = p.x;
          if (p.x > maxX) maxX = p.x;
          if (p.y > bottom) bottom = p.y;
        }
        this.boats.push({
          x: (minX + maxX) / 2 / this.w,
          y: bottom / this.h,
          length: (maxX - minX) / this.w,
          flipped: false
        });
      }
    }

    this.placed.add(motif);
    return true;
  }

  mooring(bow, boat) {
    if (!this.bankSurface) return [];
    const size = Math.max(0.28, Math.min(0.8, boat.width / 100));
    const buildings = this.elements
      .filter(e => ['house', 'hut', 'pavilion', 'templeGate'].includes(e.motif))
      .map(e => new CRect(e.bounds.x * this.w, e.bounds.y * this.h, e.bounds.width * this.w, e.bounds.height * this.h));

    const desired = boat.minX - boat.width * 0.12;
    const candidates = [desired, desired - boat.width * 0.3, desired + boat.width * 0.3];
    for (const b of buildings) {
      candidates.push(b.minX - 4, b.maxX + 4);
    }
    candidates.sort((a, b) => Math.abs(a - desired) - Math.abs(b - desired));

    for (const candidate of candidates) {
      const x = this.supportedBankX(candidate);
      const y = this.bankFoot(x - size, x + size);
      if (y === null) continue;
      const foot = P(x, y);
      const post = new CRect(x - 1.2 * size, y - 15 * size, 2.4 * size, 15 * size);
      if (post.intersects(this.verse) || buildings.some(b => b.intersects(post.inset(-1, -1)))) continue;

      const knot = P(foot.x, foot.y - 10 * size);
      const sag = P((bow.x + knot.x) * 0.5, (bow.y + knot.y) * 0.5 + 4 * size);
      const rope = new CRect(
        Math.min(bow.x, knot.x),
        Math.min(bow.y, knot.y),
        Math.abs(bow.x - knot.x),
        Math.max(bow.y, knot.y, sag.y) - Math.min(bow.y, knot.y)
      ).inset(-size, -size);
      if (rope.intersects(this.verse)) continue;

      for (const [name, bounds] of [['mooringPost', post], ['mooringRope', rope]]) {
        this.elements.push({
          motif: name,
          bounds: {
            x: bounds.minX / this.w,
            y: bounds.minY / this.h,
            width: bounds.width / this.w,
            height: bounds.height / this.h
          }
        });
      }
      return this.engine.paintingMooring(bow, foot, size);
    }
    return [];
  }

  scaledSlot(motif, requested) {
    let maxWidth = requested.width, maxHeight = requested.height;
    switch (motif) {
      case 'house':
      case 'hut':
      case 'pavilion':
      case 'templeGate':
      case 'cityGate':
      case 'terrace':
      case 'ruins': {
        const close = this.currentScene === 'moonNight';
        const village = this.currentScene === 'village';
        maxWidth = Math.min(maxWidth, this.art.width * (close ? 0.65 : (village ? 0.48 : 0.30)));
        maxHeight = Math.min(maxHeight, this.art.height * (close ? 0.24 : (village ? 0.20 : 0.14)));
        if (this.bankSurface) {
          const width = this.bankSurface.step * (this.bankSurface.heights.length - 1);
          maxWidth = Math.min(maxWidth, width * (close ? 0.7 : 0.46));
        }
        const main = this.elements.find(e => e.motif === 'mainMountain');
        if (main) {
          maxHeight = Math.min(maxHeight, main.bounds.height * this.h * 0.075);
        }
        break;
      }
      case 'pagoda': {
        maxWidth = Math.min(maxWidth, this.art.width * 0.14);
        maxHeight = Math.min(maxHeight, this.art.height * 0.25);
        const main = this.elements.find(e => e.motif === 'mainMountain');
        if (main) {
          maxHeight = Math.min(maxHeight, main.bounds.height * this.h * 0.15);
        }
        break;
      }
      case 'pine':
      case 'oldTree':
      case 'bareTree':
      case 'layeredTree':
      case 'willow':
      case 'blossom':
      case 'maple': {
        const mountainScene = ['retreat', 'temple', 'historic'].includes(this.currentScene);
        if (this.currentScene === 'retreat' && this.preparedGround) {
          maxWidth = Math.min(maxWidth, this.preparedGround.bounds.width * 0.38);
        }
        maxHeight = Math.min(maxHeight, Math.min(
          this.art.height * (mountainScene ? 0.52 : 0.82),
          this.art.width * (mountainScene ? 1.05 : 1.75)
        ));
        const main = this.elements.find(e => e.motif === 'mainMountain');
        if (main) {
          const lead = (motif === 'pine' && this.currentScene === 'retreat');
          maxHeight = Math.min(maxHeight, main.bounds.height * this.h * (lead ? 0.55 : 0.28));
        }
        break;
      }
      case 'traveler':
      case 'horse': {
        const treeElem = this.elements.find(e => ['oldTree', 'bareTree', 'willow', 'blossom', 'layeredTree'].includes(e.motif));
        const treeHeight = treeElem ? treeElem.bounds.height * this.h : null;
        const personHeight = Math.min(this.art.width * 0.14, treeHeight !== null ? (treeHeight / 5) : (this.art.width * 0.10));
        maxHeight = Math.min(maxHeight, personHeight * (motif === 'horse' ? 1.18 : 1));
        break;
      }
      case 'bamboo': {
        maxHeight = Math.min(maxHeight, this.art.height * 0.34);
        const main = this.elements.find(e => e.motif === 'mainMountain');
        if (main) {
          maxHeight = Math.min(maxHeight, main.bounds.height * this.h * 0.26);
        }
        break;
      }
      default:
        break;
    }

    switch (motif) {
      case 'pine':
      case 'oldTree':
      case 'bareTree':
      case 'layeredTree':
      case 'willow':
      case 'blossom':
      case 'maple':
      case 'bamboo': {
        const instance = this.elements.filter(e => e.motif === motif).length;
        const scale = 0.72 + 0.28 * multiplierV5(this.seed, motif, instance);
        maxWidth *= scale;
        maxHeight *= scale;
        break;
      }
      default:
        break;
    }

    return new CRect(requested.midX - maxWidth / 2, requested.maxY - maxHeight, maxWidth, maxHeight);
  }

  bankFoot(x0, x1) {
    if (!this.bankSurface) return null;
    const s = this.bankSurface;
    const first = Math.max(0, Math.floor((x0 - s.x0) / s.step));
    const last = Math.min(s.heights.length - 1, Math.ceil((x1 - s.x0) / s.step));
    if (first > last) return null;
    let max = -Infinity;
    for (let i = first; i <= last; i++) {
      if (Number.isFinite(s.heights[i]) && s.heights[i] > max) {
        max = s.heights[i];
      }
    }
    return Number.isFinite(max) ? max : null;
  }

  supportedBankX(desired) {
    if (!this.bankSurface) return desired;
    const s = this.bankSurface;
    const i = Math.min(s.heights.length - 1, Math.max(0, Math.round((desired - s.x0) / s.step)));
    if (Number.isFinite(s.heights[i])) return desired;
    let nearest = null, minDist = Infinity;
    for (let idx = 0; idx < s.heights.length; idx++) {
      if (Number.isFinite(s.heights[idx])) {
        const d = Math.abs(idx - i);
        if (d < minDist) {
          minDist = d;
          nearest = idx;
        }
      }
    }
    return nearest !== null ? s.x0 + nearest * s.step : desired;
  }

  placeAtFoot(motif, along, height, aspect) {
    const mainElem = this.elements.find(e => e.motif === 'mainMountain');
    if (!mainElem || !this.bankSurface) return;
    const peak = new CRect(mainElem.bounds.x * this.w, mainElem.bounds.y * this.h, mainElem.bounds.width * this.w, mainElem.bounds.height * this.h);
    const bh = peak.height * height;
    const bw = bh * aspect;
    const surface = this.bankSurface;
    const bankEnd = surface.x0 + surface.step * (surface.heights.length - 1);
    const cx = this.supportedBankX(Math.min(Math.max(peak.minX + peak.width * along, surface.x0 + bw * 0.5), bankEnd - bw * 0.5));

    const alternatives = [];
    for (let i = 0; i < surface.heights.length; i++) {
      const x = surface.x0 + i * surface.step;
      if (x >= surface.x0 + bw / 2 && x <= bankEnd - bw / 2) {
        alternatives.push(x);
      }
    }
    alternatives.sort((a, b) => Math.abs(a - cx) - Math.abs(b - cx));

    const raw = this.engine.paintingAsset(motif);
    const stems = [];
    if (motif === 'pavilion') {
      for (const tree of Object.values(this.paintedTrees)) {
        let top = Infinity, bottom = -Infinity;
        for (const poly of tree) {
          for (const pt of poly.pts) {
            if (pt.y < top) top = pt.y;
            if (pt.y > bottom) bottom = pt.y;
          }
        }
        if (Number.isFinite(top) && Number.isFinite(bottom)) {
          let sumX = 0, count = 0;
          for (const poly of tree) {
            for (const pt of poly.pts) {
              if (pt.y > bottom - (bottom - top) * 0.12) {
                sumX += pt.x;
                count++;
              }
            }
          }
          if (count > 0) stems.push(sumX / count);
        }
      }
    }

    for (const x of [cx, ...alternatives]) {
      if (!stems.every(s => Math.abs(x - s) > bw * 0.58)) continue;
      const foot = this.bankFoot(x - bw * 0.4, x + bw * 0.4);
      if (foot === null || foot < peak.midY) continue;
      this.pinned = true;
      const landed = this.add(motif, new CRect(x - bw / 2, foot - bh, bw, bh), false, raw);
      this.pinned = false;
      if (landed) return;
    }
  }

  groundedSlot(motif, requested) {
    if (motif === 'window' && this.currentScene === 'moonNight' && this.houseWindowFrame) {
      return this.houseWindowFrame;
    }
    const rooted = new Set([
      'oldTree', 'bareTree', 'layeredTree', 'pine', 'bamboo', 'willow',
      'blossom', 'maple', 'house', 'hut', 'pavilion', 'pagoda', 'templeGate', 'cityGate', 'terrace', 'ruins', 'fence', 'traveler', 'horse'
    ]);
    if (!rooted.has(motif) || !this.bankSurface) return requested;

    const building = ['house', 'hut', 'pavilion', 'pagoda', 'templeGate', 'cityGate', 'terrace', 'ruins'].includes(motif);
    const broadBase = building || motif === 'bamboo';
    const surface = this.bankSurface;
    const endX = surface.x0 + surface.step * (surface.heights.length - 1);
    const radius = Math.min((endX - surface.x0) * 0.45, broadBase ? requested.width * 0.36 : Math.min(8, requested.width * 0.1));
    const low = Math.max(surface.x0 + radius, this.art.minX + requested.width / 2);
    const high = Math.min(endX - radius, this.art.maxX - requested.width / 2);
    const fraction = Math.min(Math.max((requested.midX - this.art.minX) / this.art.width, 0), 1);
    let desired = surface.x0 + radius + fraction * Math.max(0, endX - surface.x0 - 2 * radius);

    if (motif === 'house') {
      const prevElem = this.elements.find(e => e.motif === 'house');
      if (prevElem && desired > prevElem.bounds.x * this.w + (prevElem.bounds.width * this.w) / 2) {
        desired = Math.max(desired, (prevElem.bounds.x + prevElem.bounds.width) * this.w + requested.width * 0.18);
      }
    }

    const center = low <= high ? Math.min(Math.max(desired, low), high) : Math.min(Math.max(desired, surface.x0 + radius), endX - radius);
    let req = new CRect(this.supportedBankX(center) - requested.width / 2, requested.minY, requested.width, requested.height);
    const position = (req.midX - surface.x0) / surface.step;
    if (position < 0 || position > surface.heights.length - 1) return req;

    const lo = Math.floor(position), hi = Math.min(lo + 1, surface.heights.length - 1);
    let y = Math.min(surface.heights[lo], surface.heights[hi]);
    if (broadBase) {
      const first = Math.max(0, Math.floor((req.midX - req.width * 0.36 - surface.x0) / surface.step));
      const last = Math.min(surface.heights.length - 1, Math.ceil((req.midX + req.width * 0.36 - surface.x0) / surface.step));
      if (first <= last) {
        let max = -Infinity;
        for (let i = first; i <= last; i++) {
          if (Number.isFinite(surface.heights[i]) && surface.heights[i] > max) max = surface.heights[i];
        }
        if (Number.isFinite(max)) y = max;
      }
    }
    if (!Number.isFinite(y)) return req;

    let landed = new CRect(req.minX, y - req.height, req.width, req.height);
    if (landed.intersects(this.verse)) {
      const left = this.verse.minX - landed.width - 2, right = this.verse.maxX + 2;
      if (left >= surface.x0 && left + landed.width <= endX) landed = new CRect(left, landed.minY, landed.width, landed.height);
      else if (right + landed.width <= endX) landed = new CRect(right, landed.minY, landed.width, landed.height);
      if (landed.minX !== req.minX) {
        const foot = this.bankFoot(landed.midX - radius, landed.midX + radius);
        if (foot !== null) landed = new CRect(landed.minX, foot - landed.height, landed.width, landed.height);
      }
    }
    return landed;
  }

  clearFigureGround(requested, treeClearance = false) {
    if (!this.bankSurface) return requested;
    const surface = this.bankSurface;
    const endX = surface.x0 + surface.step * (surface.heights.length - 1);
    const occupied = this.elements
      .filter(e => ['house', 'hut', 'pavilion', 'templeGate', 'pagoda', 'terrace', 'ruins', 'cityGate', 'traveler', 'horse'].includes(e.motif))
      .map(e => new CRect(e.bounds.x * this.w, e.bounds.y * this.h, e.bounds.width * this.w, e.bounds.height * this.h));

    if (treeClearance) for (const [motif,root] of Object.entries(this.treeRoots)) {
      const tree = this.elements.find(e=>e.motif===motif);
      if (!tree) continue;
      const top=(tree.bounds.y+tree.bounds.height*.3)*this.h;
      const radius=Math.max(3,tree.bounds.width*this.w*.08);
      occupied.push(new CRect(root.x-radius,top,radius*2,Math.max(1,root.y-top)));
    }

    if (!occupied.some(b => b.intersects(requested))) return requested;

    const xs = [surface.x0 + 1, endX - requested.width - 1];
    for (const obst of occupied) {
      xs.push(obst.minX - requested.width - 3, obst.maxX + 3);
    }
    xs.sort((a, b) => Math.abs(a - requested.minX) - Math.abs(b - requested.minX));

    for (const x of xs) {
      if (x < surface.x0 || x + requested.width > endX) continue;
      const foot = this.bankFoot(x, x + requested.width);
      if (foot === null) continue;
      const candidate = new CRect(x, foot - requested.height, requested.width, requested.height);
      if (!candidate.intersects(this.verse) && !occupied.some(b => b.intersects(candidate))) {
        return candidate;
      }
    }
    return requested;
  }

  recordBank(object) {
    const count = 64;
    const x0 = object.bounds.minX;
    const step = object.bounds.width / 63;
    if (step <= 0) return;
    const heights = new Array(count).fill(Infinity);

    for (const poly of object.canv) {
      for (let j = 0; j < poly.pts.length - 1; j++) {
        const a = poly.pts[j], b = poly.pts[j + 1];
        const lo = Math.max(0, Math.ceil((Math.min(a.x, b.x) - x0) / step));
        const hi = Math.min(count - 1, Math.floor((Math.max(a.x, b.x) - x0) / step));
        if (lo > hi) continue;
        for (let i = lo; i <= hi; i++) {
          const x = x0 + i * step;
          const t = Math.abs(b.x - a.x) < 0.0001 ? 0 : (x - a.x) / (b.x - a.x);
          heights[i] = Math.min(heights[i], a.y + (b.y - a.y) * t);
        }
      }
    }

    this.bankSurface = { x0, step, heights };
    const r = object.bounds;
    this.elements.push({
      motif: 'groundBank',
      bounds: {
        x: r.minX / this.w,
        y: r.minY / this.h,
        width: r.width / this.w,
        height: r.height / this.h
      }
    });
  }

  support(motif, bounds, root = null) {
    const rooted = new Set([
      'oldTree', 'bareTree', 'layeredTree', 'pine', 'bamboo', 'willow',
      'blossom', 'maple', 'house', 'hut', 'pavilion', 'pagoda', 'templeGate', 'cityGate',
      'courtyard', 'terrace', 'ruins'
    ]);
    if (!rooted.has(motif) || this.currentScene === 'courtyard') return;

    const buildings = new Set(['house', 'hut', 'pavilion', 'pagoda', 'templeGate', 'cityGate', 'terrace', 'ruins']);
    const isBuilding = buildings.has(motif);
    const height = isBuilding ? Math.max(2, bounds.height * 0.18) : Math.min(24, Math.max(5, bounds.height * 0.13));
    const spread = isBuilding ? bounds.width * 0.12 : 4;
    const width = root === null ? bounds.width : Math.max(8, bounds.width * 0.38);
    const box = new CRect(
      (root ? root.x : bounds.midX) - width / 2 - spread,
      (root ? root.y : bounds.maxY) - height * 0.35,
      width + 2 * spread,
      height
    );
    const rock = this.fitted(this.engine.paintingRock(125, 24, 0.7), box);
    if (rock) {
      this.parts.push(Part.near(rock.canv));
    }
  }

  fitted(raw, box) {
    if (!raw) return null;
    raw = (Array.isArray(raw) ? raw.flat(Infinity) : [raw]).filter(Boolean);
    const top = Math.max(box.minY, this.contentTop);
    const bottom = Math.min(box.maxY, this.footer);
    const actualBox = new CRect(box.minX, top, box.width, bottom - top);
    if (actualBox.width <= 0 || actualBox.height <= 0) return null;

    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const poly of raw) {
      const pts = poly.pts || poly.p || [];
      for (const p of pts) {
        if (p.x < x0) x0 = p.x;
        if (p.x > x1) x1 = p.x;
        if (p.y < y0) y0 = p.y;
        if (p.y > y1) y1 = p.y;
      }
    }
    if (x1 <= x0 || y1 <= y0) return null;

    const scale = Math.min(actualBox.width / (x1 - x0), actualBox.height / (y1 - y0));
    const dx = actualBox.midX - ((x0 + x1) / 2) * scale;
    const dy = actualBox.maxY - y1 * scale;

    const transformed = raw.map(poly => {
      const pts = poly.pts || poly.p || [];
      const newPts = pts.map(p => P(p.x * scale + dx, p.y * scale + dy));
      return {
        ...poly,
        p: newPts,
        pts: newPts,
        wid: (poly.wid || 0) * scale
      };
    });

    const actual = new CRect(x0 * scale + dx, y0 * scale + dy, (x1 - x0) * scale, (y1 - y0) * scale);
    if (actual.intersects(this.verse)) return null;
    if (!new CRect(0, 0, this.w, this.h).inset(-1, -1).contains(actual)) return null;
    return { canv: transformed, bounds: actual };
  }

  hills(main = false) {
    const side = this.engine.r() < 0.5;
    const ranges = (this.currentScene === 'historic' || this.structure === 'corner' || this.structure === 'high')
      ? 1
      : (this.layoutVariant === 1 ? 3 : 2);

    for (let k = 0; k < ranges; k++) {
      const raw = this.engine.paintingDistant(k);
      const width = 0.58 + this.engine.r() * 0.16;
      const x = ((k === 0) === side) ? 1 - width : 0.0;
      let box;
      if (!main && (this.structure === 'deep' || this.structure === 'level')) {
        box = this.slot(x, 0.015 + (k * 0.14) / ranges, width, ranges === 3 ? 0.12 : 0.15);
      } else if (this.structure === 'deep') {
        box = this.slot(0.40 - k * 0.17, 0.02 + k * 0.19, 0.54 + k * 0.10, 0.30);
      } else if (this.structure === 'corner') {
        box = this.slot(side ? 0.28 : 0.02, 0.0, 0.70, 0.08);
      } else {
        box = this.slot(x, 0.06 + k * 0.10, width, 0.24);
      }

      const object = this.fitted(raw, box);
      if (object) {
        this.parts.push(new Part(object.canv, {
          depth: object.bounds.height * 1.1,
          blur: 0.35,
          peak: 0.95,
          floorY: object.bounds.maxY,
          floorDepth: object.bounds.height * 0.7
        }));
        this.engine.noted('ridge', object.canv);
        const r = object.bounds;
        this.elements.push({
          motif: 'farMountain',
          bounds: { x: r.minX / this.w, y: r.minY / this.h, width: r.width / this.w, height: r.height / this.h }
        });
      }
    }

    let peakBox = this.slot(0.01, 0.01, 0.98, 0.88);
    if (this.preparedGround) {
      const foot = this.preparedGround.bounds.minY + this.preparedGround.bounds.height * 0.58;
      peakBox = new CRect(peakBox.minX, peakBox.minY, peakBox.width, Math.max(40, foot - peakBox.minY));
    }

    if (main) {
      const deep = this.structure === 'deep';
      const separated = this.engine.landscapeSeed && !deep;
      const guestBox = new CRect(
        peakBox.minX + peakBox.width * (deep ? 0.34 : 0.48),
        peakBox.minY + peakBox.height * (deep ? 0.02 : separated ? 0.16 : 0.28),
        peakBox.width * (deep ? 0.65 : 0.51),
        peakBox.height * (deep ? 0.50 : 0.62)
      );
      const guest = this.fitted(this.engine.paintingMountain('folded', false, deep ? 1.55 : null), guestBox);
      if (guest) {
        const r = guest.bounds;
        this.elements.push({
          motif: 'guestMountain',
          bounds: { x: r.minX / this.w, y: r.minY / this.h, width: r.width / this.w, height: r.height / this.h }
        });
        if (guest.canv[0]) {
          this.mountainRidges.push(guest.canv[0].pts.slice(0, -2));
        }
        const guestInk = this.engine.paintingInk(guest.canv, 2);
        const fade = { top:r.minY + r.height * 0.55, bottom:r.maxY, seed:this.engine.inkSeed() };
        const part = ['refined-v1', 'painted-v2', 'landscape-v3'].includes(this.elementTreatment)
          ? new Part(guestInk, { near:true, fade }) : new Part(guestInk, null, fade);
        if (['refined-v1', 'painted-v2', 'landscape-v3'].includes(this.elementTreatment)) part.detail = { motif:'guestMountain', bounds:r };
        this.parts.push(part);
      }
      peakBox = new CRect(peakBox.minX, peakBox.minY, peakBox.width * (deep ? 0.86 : separated ? 0.82 : 0.98), peakBox.height);
    }

    if (this.currentScene === 'historic') {
      const headroom = this.art.height * 0.04;
      peakBox = new CRect(peakBox.minX, peakBox.minY + headroom, peakBox.width, peakBox.height - headroom);
    }

    const forms = ['monumental', 'leaning', 'folded', 'clustered'];
    const aspect = this.h > this.w
      ? [1.60, 1.42, 1.60, 1.52][this.layoutVariant]
      : [1.15, 0.92, 1.30, 1.05][this.layoutVariant];

    if (main) {
      const object = this.fitted(this.engine.paintingMountain(forms[this.layoutVariant], this.currentScene === 'historic', aspect), peakBox);
      if (object) {
        const r = object.bounds;
        if (object.canv[0]) {
          const ridge = object.canv[0].pts.slice(0, -2);
          this.mountainRidges.push(ridge);
          if (this.currentScene === 'historic') {
            let top = Infinity;
            for (const p of ridge) {
              if (p.y < top) top = p.y;
            }
            if (Number.isFinite(top)) {
              const runs = [];
              let run = [];
              for (const p of ridge) {
                if (Math.abs(p.y - top) < 0.001) run.push(p);
                else if (run.length > 0) { runs.push(run); run = []; }
              }
              if (run.length > 0) runs.push(run);
              let ledge = [];
              let maxSpan = -Infinity;
              for (const cand of runs) {
                const span = cand[cand.length - 1].x - cand[0].x;
                if (span > maxSpan) {
                  maxSpan = span;
                  ledge = cand;
                }
              }
              if (ledge.length >= 2) {
                this.summitLedge = new CRect(ledge[0].x, top, ledge[ledge.length - 1].x - ledge[0].x, 1);
              }
            }
          }
        }
        const fade = { top:r.maxY - r.height * 0.42, bottom:r.maxY - r.height * 0.04, seed:this.engine.inkSeed() };
        const part = ['refined-v1', 'painted-v2', 'landscape-v3'].includes(this.elementTreatment)
          ? new Part(object.canv, { near:true, fade }) : new Part(object.canv, null, fade);
        if (['refined-v1', 'painted-v2', 'landscape-v3'].includes(this.elementTreatment)) part.detail = { motif:'mainMountain', bounds:r };
        this.parts.push(part);
        this.engine.noted('ridge', object.canv);
        this.elements.push({
          motif: 'mainMountain',
          bounds: { x: r.minX / this.w, y: r.minY / this.h, width: r.width / this.w, height: r.height / this.h }
        });
      }
    }
  }

  water() {
    let kind = 'lake';
    if (this.currentScene === 'waterTown' || this.currentScene === 'farewell' || this.currentScene === 'fishing') kind = 'river';
    else if (this.currentScene === 'lotusPond') kind = 'pond';
    else if (this.currentScene === 'ocean') kind = 'sea';

    const upper = this.slot(0, 0.45, 1, 0.52);
    const lower = this.slot(0, 0.10, 1, 0.86, true);
    const whole = upper.union(lower);

    const raw = this.waterEngine.paintingSurface(kind, whole.width, whole.height).map(poly => {
      const q = { ...poly };
      q.pts = poly.pts.map(pt => P(pt.x + whole.minX, pt.y + whole.minY));
      return q;
    });

    const top = new CRect(upper.minX, upper.minY, upper.width, Math.max(0, Math.min(lower.minY, upper.maxY) - upper.minY));
    for (const box of [top, lower]) {
      if (box.height <= 0) continue;
      const clipped = this.clipWater(raw, box);
      if (clipped.length === 0) continue;
      this.parts.push(Part.near(clipped));
      this.engine.noted('water', clipped);
      this.elements.push({
        motif: kind === 'sea' ? 'waves' : kind + 'Water',
        bounds: { x: box.minX / this.w, y: box.minY / this.h, width: box.width / this.w, height: box.height / this.h }
      });
    }
    this.placed.add('waves');
  }

  clipWater(raw, box) {
    const result = [];
    for (const poly of raw) {
      let points = poly.pts.slice();
      for (let edge = 0; edge < 4; edge++) {
        function distance(p) {
          switch (edge) {
            case 0: return p.x - box.minX;
            case 1: return box.maxX - p.x;
            case 2: return p.y - box.minY;
            default: return box.maxY - p.y;
          }
        }
        if (points.length === 0) break;
        let previous = points[points.length - 1];
        const clipped = [];
        for (const p of points) {
          const a = distance(previous), b = distance(p);
          if ((a >= 0) !== (b >= 0)) {
            const t = a / (a - b);
            clipped.push(P(previous.x + (p.x - previous.x) * t, previous.y + (p.y - previous.y) * t));
          }
          if (b >= 0) clipped.push(p);
          previous = p;
        }
        points = clipped;
      }
      if (points.length > 2) {
        result.push({ ...poly, pts: points });
      }
    }
    return result;
  }

  layWater(raw, box, motif) {
    const object = this.fitted(raw, box);
    if (!object) return;
    this.parts.push(Part.near(object.canv));
    this.engine.noted('water', object.canv);
    const r = object.bounds;
    this.elements.push({
      motif,
      bounds: { x: r.minX / this.w, y: r.minY / this.h, width: r.width / this.w, height: r.height / this.h }
    });
  }

  treeCrows() {
    const treeElem = this.elements.find(e => ['oldTree', 'bareTree'].includes(e.motif));
    if (!treeElem) return;
    const b = new CRect(treeElem.bounds.x * this.w, treeElem.bounds.y * this.h, treeElem.bounds.width * this.w, treeElem.bounds.height * this.h);
    const treeMotif = this.paintedTrees.oldTree ? 'oldTree' : 'bareTree';
    const candidates = this.treePerches[treeMotif] || [];
    const perches = this.engine.r() < 0.5 ? [0.23] : [0.23, 0.77];

    for (const fraction of perches) {
      const target = P(b.minX + b.width * fraction, b.minY + b.height * 0.38);
      let nearest = null, minDist = Infinity;
      for (const pt of candidates) {
        const dx = pt.x - target.x, dy = pt.y - target.y;
        const d = dx * dx + dy * dy;
        if (d < minDist) { minDist = d; nearest = pt; }
      }
      if (!nearest) continue;
      const scale = (b.height * 0.036) / 17;
      const bird = this.engine.paintingPerchedCrow().map(poly => {
        const next = { ...poly };
        next.pts = poly.pts.map(p => P(nearest.x + p.x * scale, nearest.y + p.y * scale));
        next.wid *= scale;
        return next;
      });
      this.parts.push(Part.near(bird));
    }

    this.add(
      'crow',
      new CRect(
        Math.max(1, b.minX - b.width * 0.2),
        Math.max(this.contentTop, b.minY - b.height * 0.12),
        Math.min(b.width * 0.5, Math.min(this.w, this.h) * 0.11),
        Math.min(b.height * 0.06, Math.min(this.w, this.h) * 0.035)
      ),
      false,
      this.engine.paintingBird(false, 2 + Math.trunc(this.engine.r() * 2))
    );
  }

  journeyPersonHeight() {
    const bankElem = this.elements.find(e => e.motif === 'groundBank');
    if (!bankElem) return this.art.width * 0.08;
    const treeElem = this.elements.find(e => ['oldTree', 'bareTree'].includes(e.motif));
    const treeHeight = (treeElem ? treeElem.bounds.height : 0.16) * this.h;
    let height = Math.min(bankElem.bounds.width * this.w * 0.078, treeHeight * 0.20);
    const bridgeElem = this.elements.find(e => e.motif === 'bridge');
    if (bridgeElem) {
      height = Math.min(height, (bridgeElem.bounds.width * this.w) / 4.8);
    }
    return height;
  }

  journey() {
    const bankElem = this.elements.find(e => e.motif === 'groundBank');
    if (!bankElem) return;
    const b = new CRect(bankElem.bounds.x * this.w, bankElem.bounds.y * this.h, bankElem.bounds.width * this.w, bankElem.bounds.height * this.h);
    const personH = this.journeyPersonHeight();
    const horseH = personH * 1.18;
    const x = b.minX + b.width * 0.65;
    const pose = Math.trunc(this.engine.r() * 2);
    const horse = this.engine.paintingHorse(pose, false, this.donkey);
    const person = this.engine.paintingPerson(false, 0, false);
    const horseW = personH * 1.7, personW = personH * 0.75;
    const crest = this.bankFoot(x, x + horseW + personW);
    if (crest === null) return;
    const foot = Math.min(b.maxY - 2, Math.max(crest + 3, b.minY + b.height * 0.78));

    const right = x + horseW + personW + personH * 0.30;
    const farX = b.minX + b.width * 0.88;
    const farY = this.bankFoot(farX - 1, farX + 1) ?? (b.minY + b.height * 0.5);
    const center = this.engine.inkCurve([
      P(farX, farY + 1),
      P(right + personH * 0.15, foot - personH * 0.35),
      P(right, foot),
      P(x - personH * 0.25, foot),
      P(b.minX + b.width * 0.47, Math.min(b.maxY + b.height * 0.12, this.footer - personH * 0.34 - 2))
    ]);

    const upper = center.map((p, i) => {
      const t = i / (center.length - 1);
      return P(p.x, p.y - personH * (0.035 + 0.32 * Math.pow(t, 1.3)));
    });
    const lower = center.map((p, i) => {
      const t = i / (center.length - 1);
      return P(p.x, p.y + personH * (0.035 + 0.28 * Math.pow(t, 1.3)));
    });

    const road = [
      this.engine.poly(upper.concat(lower.slice().reverse()), { fil: C.white, str: null }),
      ...this.engine.inkLine(upper.slice(0, 13), 1.0, 0.52, 0.42),
      ...this.engine.inkLine(upper.slice(-10), 1.3, 0.54, 0.45),
      ...this.engine.inkLine(lower.slice(0, 13), 1.0, 0.52, 0.42),
      ...this.engine.inkLine(lower.slice(-10), 1.3, 0.54, 0.45)
    ];

    const lip = upper.map((p, i) => P(p.x + 0.5, p.y - 0.8 - (i / upper.length) * 1.8));
    road.push(this.engine.poly(upper.concat(lip.slice().reverse()), { fil: C.gray(0, 0.045), str: null }));
    this.parts.push(Part.near(road));

    const roadPoints = upper.concat(lower);
    let rx0 = Infinity, rx1 = -Infinity, ry0 = Infinity, ry1 = -Infinity;
    for (const p of roadPoints) {
      if (p.x < rx0) rx0 = p.x;
      if (p.x > rx1) rx1 = p.x;
      if (p.y < ry0) ry0 = p.y;
      if (p.y > ry1) ry1 = p.y;
    }
    this.elements.push({
      motif: 'path',
      bounds: { x: rx0 / this.w, y: ry0 / this.h, width: (rx1 - rx0) / this.w, height: (ry1 - ry0) / this.h }
    });
    this.placed.add('path');

    this.pinned = true;
    const horsePlaced = this.add('horse', new CRect(x, foot - horseH, horseW, horseH), false, horse);
    const personPlaced = this.add('traveler', new CRect(x + horseW + personH * 0.24, foot - personH, personW, personH), false, person);
    this.pinned = false;

    if (!horsePlaced || !personPlaced) return;
    const hb = this.elements.filter(e => e.motif === 'horse').pop();
    const pb = this.elements.filter(e => e.motif === 'traveler').pop();
    if (!hb || !pb) return;

    const self = this;
    function anchor(rawCanv, bRect, p) {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity;
      for (const poly of rawCanv) {
        for (const pt of poly.pts) {
          if (pt.x < x0) x0 = pt.x;
          if (pt.x > x1) x1 = pt.x;
          if (pt.y < y0) y0 = pt.y;
        }
      }
      const scale = (bRect.width * self.w) / (x1 - x0);
      return P(bRect.x * self.w + (p.x - x0) * scale, bRect.y * self.h + (p.y - y0) * scale);
    }

    const muzzle = anchor(horse, hb.bounds, P(99, pose === 1 ? 28 : 43));
    const hand = anchor(person, pb.bounds, P(54, 24));
    const rein = this.engine.inkCurve([muzzle, P((muzzle.x + hand.x) / 2, Math.max(muzzle.y, hand.y) + personH * 0.22), hand]);
    this.parts.push(Part.near(this.engine.inkLine(rein, 0.32, 0.58, 0.4)));
  }

  crossing(river = false) {
    const bankElem = this.elements.find(e => e.motif === 'groundBank');
    if (!bankElem) return;
    const b = new CRect(bankElem.bounds.x * this.w, bankElem.bounds.y * this.h, bankElem.bounds.width * this.w, bankElem.bounds.height * this.h);
    const width = b.width * 0.40;
    const waterTop = this.bandTop === null ? this.art.minY : this.verse.maxY + 4;
    const startY = Math.max(b.minY + b.height * 0.18, waterTop);
    const box = new CRect(
      b.minX + b.width * (river ? [0.20, 0.38, 0.28, 0.46][this.layoutVariant] : 0.025),
      startY,
      width,
      Math.min(b.maxY - startY + b.height * 0.12, this.footer - startY - 2)
    );
    const phase = this.waterEngine.r() * 1.6 - 0.8;
    const channel = new PaintingWaterChannel(width, box.height, phase, true);

    const self = this;
    function place(rawCanv, x, y, scale = 1, motif) {
      const canvas = rawCanv.map(poly => {
        const p = { ...poly };
        p.pts = poly.pts.map(pt => P(x + pt.x * scale, y + pt.y * scale));
        p.wid *= scale;
        return p;
      });
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const poly of canvas) {
        for (const pt of poly.pts) {
          if (pt.x < x0) x0 = pt.x;
          if (pt.x > x1) x1 = pt.x;
          if (pt.y < y0) y0 = pt.y;
          if (pt.y > y1) y1 = pt.y;
        }
      }
      if (!Number.isFinite(x0)) return;
      self.parts.push(Part.near(canvas));
      if (motif !== 'bridge') self.engine.noted('water', canvas);
      self.elements.push({
        motif,
        bounds: { x: x0 / self.w, y: y0 / self.h, width: (x1 - x0) / self.w, height: (y1 - y0) / self.h }
      });
    }

    const bridge = this.engine.paintingBridgePlan();
    const reflectionDepth = bridge.kind === 'arch' ? Math.max(24, bridge.rise + 2) : 24;
    function spanScale(t) {
      return ((channel.point(t, 1).x - channel.point(t, -1).x) * 1.16) / bridge.width;
    }

    let crossingT = 0.64;
    while (crossingT > 0.32 && box.minY + box.height * crossingT + reflectionDepth * spanScale(crossingT) > this.footer - 1) {
      crossingT -= 0.04;
    }

    const left = channel.point(crossingT, -1), right = channel.point(crossingT, 1);
    const scale = spanScale(crossingT);
    let waterY = box.minY;

    if (river) {
      const houseX = b.minX + b.width * 0.83;
      const houseFoot = this.bankFoot(houseX - b.width * 0.069, houseX + b.width * 0.069);
      if (houseFoot !== null) {
        const deckY = bridge.kind === 'arch' ? 54.0 : 42.0;
        const aligned = houseFoot + (60 - deckY) * scale - left.y;
        waterY = Math.max(waterTop, Math.min(waterY, aligned));
      }
    }

    place(this.waterEngine.paintingChannel(channel), box.minX, waterY, 1, river ? 'riverChannel' : 'stream');
    this.placed.add('stream');

    const x = box.minX + (left.x + right.x) / 2 - (bridge.width * scale) / 2;
    const y = waterY + left.y - 60 * scale;
    place(this.engine.paintingBridge(bridge), x, y, scale, 'bridge');
    this.placed.add('bridge');
    place(this.engine.paintingBridgeReflection(bridge), x, y, scale, 'bridgeReflection');

    const landing = bridge.kind === 'arch' ? 54.0 : 42.0;
    const joins = [];
    for (const [end, s] of [[0.0, -1.0], [bridge.width, 1.0]]) {
      joins.push(...this.engine.inkLine(
        [P(end - s * 2, landing + 1), P(end + s * 8, landing + 1), P(end + s * 18, landing - 3)],
        1.0, 0.48, 0.6
      ));
    }
    this.parts.push(Part.near(joins.map(poly => {
      const p = { ...poly };
      p.pts = poly.pts.map(pt => P(x + pt.x * scale, y + pt.y * scale));
      p.wid *= scale;
      return p;
    })));
  }

  openSky(requested) {
    const self = this;
    function clearsRidges(rect) {
      const clearance = rect.inset(-3, -3);
      for (const tree of self.elements) {
        if (self.paintedTrees[tree.motif]) {
          const crown = new CRect(tree.bounds.x * self.w, tree.bounds.y * self.h, tree.bounds.width * self.w, tree.bounds.height * self.h);
          if (crown.intersects(clearance)) return false;
        }
      }
      for (const ridge of self.mountainRidges) {
        for (let j = 0; j < ridge.length - 1; j++) {
          const a = ridge[j], b = ridge[j + 1];
          const left = Math.max(clearance.minX, Math.min(a.x, b.x));
          const right = Math.min(clearance.maxX, Math.max(a.x, b.x));
          if (left > right) continue;
          const dx = b.x - a.x;
          const y0 = Math.abs(dx) < 0.001 ? Math.min(a.y, b.y) : a.y + ((b.y - a.y) * (left - a.x)) / dx;
          const y1 = Math.abs(dx) < 0.001 ? Math.min(a.y, b.y) : a.y + ((b.y - a.y) * (right - a.x)) / dx;
          if (clearance.maxY >= Math.min(y0, y1)) return false;
        }
      }
      return true;
    }

    if (clearsRidges(requested)) return requested;
    const pad = Math.min(this.w, this.h) * 0.045;

    for (const scale of [1.0, 0.8, 0.6]) {
      const width = requested.width * scale, height = requested.height * scale;
      const skyTop = Math.max(pad, this.art.minY);
      const sky = new CRect(this.art.minX, skyTop, this.art.width, Math.max(height, Math.min(this.footer, this.art.minY + this.art.height * 0.55) - skyTop));
      const candidates = [];
      for (let row = 0; row <= 16; row++) {
        for (let col = 0; col <= 16; col++) {
          const x = sky.minX + (Math.max(0, sky.width - width) * col) / 16;
          const y = sky.minY + (Math.max(0, sky.height - height) * row) / 16;
          const rect = new CRect(x, y, width, height);
          if (!rect.intersects(this.verse) && clearsRidges(rect)) {
            candidates.push(rect);
          }
        }
      }
      if (candidates.length > 0) {
        let best = candidates[0];
        let bestDist = Math.hypot(best.midX - requested.midX, best.midY - requested.midY);
        for (let i = 1; i < candidates.length; i++) {
          const d = Math.hypot(candidates[i].midX - requested.midX, candidates[i].midY - requested.midY);
          if (d < bestDist) {
            bestDist = d;
            best = candidates[i];
          }
        }
        return best;
      }
    }
    return null;
  }

  celestialSlot(motif) {
    const sun = motif === 'sunset' || motif === 'sunrise';
    const fraction = multiplierV5(this.seed, motif, 0) * 2 - 1;
    const x = this.structure === 'high' ? 0.73 : 0.24 + fraction * 0.49;
    const y = sun ? (this.structure === 'corner' ? 0.31 : 0.23) : 0.04 + fraction * 0.14;
    return this.slot(x, y, sun ? 0.13 : 0.18, sun ? 0.10 : 0.14);
  }

  mountainStreamSlot() {
    const bankElem = this.elements.find(e => e.motif === 'groundBank');
    if (!bankElem) return this.slot(0.27, 0.67, 0.30, 0.30);
    const obstacles = this.elements
      .filter(e => ['pine', 'bamboo', 'hut', 'pavilion'].includes(e.motif))
      .map(e => e.bounds)
      .sort((a, b) => a.x - b.x);

    const gaps = [];
    let cursor = bankElem.bounds.x + 0.002;
    for (const obst of obstacles) {
      if (obst.x > cursor) gaps.push([cursor, obst.x]);
      cursor = Math.max(cursor, obst.x + obst.width);
    }
    gaps.push([cursor, bankElem.bounds.x + bankElem.bounds.width - 0.002]);

    const viable = gaps.filter(g => g[1] - g[0] > 0.004);
    let gap = viable.length > 0 ? viable[0] : [bankElem.bounds.x + bankElem.bounds.width * 0.35, bankElem.bounds.x + bankElem.bounds.width * 0.55];
    for (let i = 1; i < viable.length; i++) {
      if (viable[i][1] - viable[i][0] > gap[1] - gap[0]) gap = viable[i];
    }

    const nearElem = this.elements.find(e => e.motif === 'nearBank') || bankElem;
    const bottom = Math.max(bankElem.bounds.y + bankElem.bounds.height, nearElem.bounds.y + nearElem.bounds.height) * this.h;
    const mid = ((gap[0] + gap[1]) * this.w) / 2;
    const sourceY = this.currentScene === 'retreat'
      ? Math.max(bankElem.bounds.y * this.h, (this.bankFoot(mid - 2, mid + 2) ?? (bankElem.bounds.y * this.h)) - (bottom - bankElem.bounds.y * this.h) * 0.18)
      : bankElem.bounds.y * this.h;

    return new CRect(gap[0] * this.w, sourceY, (gap[1] - gap[0]) * this.w, Math.max(12, bottom - sourceY));
  }

  mountainWaterfall() {
    if (!this.streamInlet) {
      this.add('stream', this.mountainStreamSlot());
    }
    if (!this.streamInlet) return;
    const inlet = this.streamInlet;
    const mountainElem = this.elements.find(e => e.motif === 'mainMountain');
    const m = mountainElem ? new CRect(mountainElem.bounds.x * this.w, mountainElem.bounds.y * this.h, mountainElem.bounds.width * this.w, mountainElem.bounds.height * this.h) : this.art;
    const outlet = P(m.minX + m.width * 0.73, Math.min(inlet.y - 8, m.minY + m.height * 0.78));

    const fall = this.engine.paintingWaterfall();
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const poly of fall.canvas) {
      for (const pt of poly.pts) {
        if (pt.x < x0) x0 = pt.x;
        if (pt.x > x1) x1 = pt.x;
        if (pt.y < y0) y0 = pt.y;
        if (pt.y > y1) y1 = pt.y;
      }
    }
    const scale = Math.min((m.height * 0.48) / (y1 - y0), (m.width * 0.42) / (x1 - x0));
    const raw = fall.canvas.map(poly => {
      const p = { ...poly };
      p.pts = poly.pts.map(pt => P(outlet.x + (pt.x - fall.outlet.x) * scale, outlet.y + (pt.y - fall.outlet.y) * scale));
      p.wid *= scale;
      return p;
    });

    const box = new CRect(
      outlet.x + (x0 - fall.outlet.x) * scale,
      outlet.y + (y0 - fall.outlet.y) * scale,
      (x1 - x0) * scale,
      (y1 - y0) * scale
    );

    this.pinned = true;
    const added = this.add('waterfall', box, false, raw);
    this.pinned = false;
    if (!added) return;

    const layer = this.parts.pop();
    const center = this.engine.inkCurve([
      outlet,
      P(outlet.x + 5, outlet.y + (inlet.y - outlet.y) * 0.45),
      P(inlet.x - 8, inlet.y - 7),
      inlet
    ]);

    const left = center.map((p, i) => {
      const t = i / (center.length - 1);
      return P(p.x - (10 * scale * (1 - t) + 1.3 * t), p.y);
    });
    const right = center.map((p, i) => {
      const t = i / (center.length - 1);
      return P(p.x + (11 * scale * (1 - t) + 1.3 * t), p.y);
    });

    const runoff = [
      this.engine.poly(left.concat(right.slice().reverse()), { fil: C.white, str: null }),
      ...this.engine.inkLine(left, 0.65, 0.42, 0.48),
      ...this.engine.inkLine(right, 0.65, 0.42, 0.48)
    ];

    this.parts.splice(this.terrainLayerEnd, 0, Part.near(runoff), layer);
    this.celestialLayers = this.celestialLayers.map(c => ({
      layer: c.layer >= this.terrainLayerEnd ? c.layer + 2 : c.layer,
      motif: c.motif
    }));

    const allPts = left.concat(right);
    let rx0 = Infinity, rx1 = -Infinity, ry0 = Infinity, ry1 = -Infinity;
    for (const p of allPts) {
      if (p.x < rx0) rx0 = p.x;
      if (p.x > rx1) rx1 = p.x;
      if (p.y < ry0) ry0 = p.y;
      if (p.y > ry1) ry1 = p.y;
    }
    this.elements.push({
      motif: 'waterfallRunoff',
      bounds: { x: rx0 / this.w, y: ry0 / this.h, width: (rx1 - rx0) / this.w, height: (ry1 - ry0) / this.h }
    });
  }

  waterDetails() {
    if (this.currentScene === 'retreat') {
      const streamElem = this.elements.find(e => e.motif === 'stream');
      if (streamElem) {
        const box = new CRect(
          (streamElem.bounds.x + streamElem.bounds.width / 2 - streamElem.bounds.width) * this.w,
          (streamElem.bounds.y + streamElem.bounds.height) * this.h,
          streamElem.bounds.width * this.w * 2,
          this.h * 0.018
        );
        const pool = this.fitted(this.waterEngine.paintingSurface('pond', box.width, box.height), box);
        if (pool) this.parts.push(Part.near(pool.canv));
      }
    }

    for (const boat of this.boats) {
      const box = new CRect(
        (boat.x - boat.length * 0.60) * this.w,
        boat.y * this.h,
        boat.length * this.w * 1.2,
        Math.max(5, boat.length * this.w * 0.12)
      );
      const raw = this.waterEngine.paintingSurface('pond', box.width, box.height);
      const wake = this.fitted(raw, box);
      if (wake) this.parts.push(Part.near(wake.canv));
    }

    if (this.currentScene === 'moonNight') {
      const lightElem = this.elements.find(e => ['moon', 'crescent', 'sunrise', 'sunset'].includes(e.motif));
      if (lightElem) {
        const x = (lightElem.bounds.x + lightElem.bounds.width / 2) * this.w - this.foreground.width * 0.07;
        const width = this.foreground.width * 0.14;
        let top = this.foreground.minY + this.foreground.height * 0.26;
        for (const bank of this.elements.filter(e => ['nearBank', 'groundBank'].includes(e.motif))) {
          if (x < (bank.bounds.x + bank.bounds.width) * this.w && x + width > bank.bounds.x * this.w) {
            top = Math.max(top, (bank.bounds.y + bank.bounds.height) * this.h + 1);
          }
        }
        const height = Math.min(this.foreground.height * 0.60, this.foreground.maxY - top);
        if (height >= 6) {
          const box = new CRect(x, top, width, height);
          const reflection = this.fitted(this.waterEngine.paintingReflection(box.width, box.height), box);
          if (reflection) {
            this.parts.push(Part.near(reflection.canv));
            const r = reflection.bounds;
            this.elements.push({
              motif: 'waterReflection',
              bounds: { x: r.minX / this.w, y: r.minY / this.h, width: r.width / this.w, height: r.height / this.h }
            });
          }
        }
      }
    }
  }

  ground(scene, prepareOnly = false) {
    if (scene === 'desert' || scene === 'ocean' || scene === 'courtyard') return;
    const narrow = scene === 'fishing' || scene === 'lotusPond';
    let box;
    if (this.composition === 'oppositeBank') {
      box = this.slot(0.01, 0.63, narrow ? 0.42 : 1, 0.14);
    } else {
      box = narrow ? this.slot(0.01, 0.67, 0.34, 0.25) : this.slot(0, 0.65, 1, 0.22);
    }

    if (this.bandTop !== null) {
      const pad = Math.min(this.w, this.h) * 0.045;
      const bottom = Math.min(this.foreground.maxY, this.h - pad);
      const width = (this.w - 2 * pad) * (narrow ? 0.5 : 1);
      const x = (this.verse.minX > this.w / 2 || narrow) ? pad : this.w - pad - width;
      box = new CRect(x, this.bandTop, width, Math.max(20, Math.min(bottom - this.bandTop, this.h * [0.17, 0.21, 0.14, 0.19][this.layoutVariant])));
      this.groundInBand = true;
    }

    if (scene === 'historic') {
      box = new CRect(box.minX, box.maxY - box.height * 0.35, box.width, box.height * 0.35);
    }

    if (prepareOnly) {
      const style = (scene === 'retreat' || scene === 'temple') ? 'cliff' : (scene === 'historic' || this.structure === 'corner' ? 'headland' : 'shoal');
      if (!narrow && scene !== 'historic') {
        const canvas = [];
        let bounds = new CRect(0, 0, 0, 0);
        let hasBounds = false;
        const split = (scene === 'waterTown' || scene === 'autumnTravel' || this.selectedMotifs.has('bridge'));

        if (!split) {
          const joining = new CRect(box.minX, box.minY + box.height * 0.60, box.width, box.height * 0.40);
          const earth = this.fitted(this.engine.paintingBank('shoal'), joining);
          if (earth) {
            canvas.push(...earth.canv);
            bounds = earth.bounds;
            hasBounds = true;
          }
        }

        for (let side = 0; side < 2; side++) {
          const leftWidth = [0.61, 0.43, 0.54, 0.48][this.layoutVariant];
          const rightWidth = split ? [0.28, 0.47, 0.36, 0.43][this.layoutVariant] : [0.46, 0.55, 0.38, 0.50][this.layoutVariant];
          const depth = split ? [0.12, 0.38, 0.06, 0.27][this.layoutVariant] : [0.48, 0.18, 0.60, 0.35][this.layoutVariant];
          const reach = new CRect(
            side === 0 ? box.minX : box.maxX - box.width * rightWidth,
            box.minY + box.height * (side === 0 ? 0 : depth),
            box.width * (side === 0 ? leftWidth : rightWidth),
            box.height * (side === 0 ? 0.84 : 1 - depth)
          );
          const groundObj = this.fitted(this.engine.paintingBank(style), reach);
          if (groundObj) {
            const dx = side === 0 ? box.minX - groundObj.bounds.minX : box.maxX - groundObj.bounds.maxX;
            const movedCanv = groundObj.canv.map(poly => {
              const p = { ...poly };
              p.pts = poly.pts.map(pt => P(pt.x + dx, pt.y));
              return p;
            });
            const movedBounds = groundObj.bounds.offset(dx, 0);
            canvas.push(...movedCanv);
            bounds = hasBounds ? bounds.union(movedBounds) : movedBounds;
            hasBounds = true;
          }
        }
        this.preparedGround = hasBounds ? { canv: canvas, bounds } : null;
      } else {
        this.preparedGround = this.fitted(this.engine.paintingBank(style), box);
      }
      if (this.preparedGround && (scene !== 'historic' || this.historicGroundNeeded)) {
        this.recordBank(this.preparedGround);
      }
      return;
    }

    if (scene === 'historic') {
      const band = this.lowerBand(0.74);
      const hBox = new CRect(band.minX, band.minY + band.height * 0.20, band.width * 0.90, band.height * 0.20);
      const earth = this.fitted(this.waterEngine.paintingDistant(0), hBox);
      if (earth) {
        const canv = earth.canv.map(poly => {
          const p = { ...poly };
          p.pts = poly.pts.map(pt => P(hBox.minX + ((pt.x - earth.bounds.minX) * hBox.width) / earth.bounds.width, pt.y));
          return p;
        });
        this.parts.push(new Part(this.engine.paintingInk(canv, 2), {
          depth: earth.bounds.height,
          blur: 0.45,
          peak: 0.85,
          floorY: earth.bounds.maxY,
          floorDepth: earth.bounds.height * 0.9
        }));
      }
      if (!this.historicGroundNeeded) return;
    }

    if (this.preparedGround) {
      const b = this.preparedGround.bounds;
      const canvas = this.engine.paintingInk(this.preparedGround.canv, this.engine.landscapeSeed ? 'near' : (scene === 'historic' ? 3 : 1));
      if (this.groundInBand) {
        this.parts.push(new Part(canvas, null, {
          top: b.minY + b.height * 0.60,
          bottom: b.maxY + b.height * 0.08,
          seed: this.engine.inkSeed()
        }, true));
      } else {
        this.parts.push(Part.near(canvas));
      }
    }

    if (scene !== 'historic' && !narrow && !this.groundInBand && this.structure !== 'level') {
      const object = this.fitted(this.engine.paintingBank(), this.slot(0.0, 0.52, 0.40, 0.48, true));
      if (object) {
        this.parts.push(Part.near(object.canv));
        const r = object.bounds;
        this.elements.push({
          motif: 'nearBank',
          bounds: { x: r.minX / this.w, y: r.minY / this.h, width: r.width / this.w, height: r.height / this.h }
        });
      }
    }
  }

  compose(scene, options = {}) {
    this.currentScene = scene;
    const chosen = new Set(options.motifs || defaultMotifsForScene(scene));
    this.historicGroundNeeded = chosen.has('ruins') || chosen.has('cityGate');

    if (['retreat', 'temple', 'historic'].includes(scene)) {
      this.structure = this.composition === 'depth' ? 'deep' : 'high';
    } else {
      switch (this.composition) {
        case 'corner': this.structure = 'corner'; break;
        case 'depth': this.structure = 'deep'; break;
        case 'oppositeBank': default: this.structure = 'level'; break;
      }
    }

    if (scene === 'winterForest') this.engine.snowLight = 0.45;
    this.ground(scene, true);

    const include = (motif, box) => {
      if (chosen.has(motif)) this.add(motif, box);
    };

    if (scene !== 'desert' && scene !== 'ocean' && scene !== 'courtyard') {
      this.hills(scene === 'retreat' || scene === 'temple' || scene === 'historic');
    }
    if (['fishing', 'waterTown', 'farewell', 'lotusPond', 'moonNight'].includes(scene)) {
      this.water();
    }

    for (const motif of ['mist', 'afterRain']) {
      if (chosen.has(motif)) {
        if (!['retreat', 'temple', 'historic'].includes(scene) && this.elements.some(e => e.motif === 'farMountain')) {
          const range = this.elements.find(e => e.motif === 'farMountain');
          this.elements.push({ motif, bounds: range.bounds });
          this.placed.add(motif);
          continue;
        }
        const y = ['retreat', 'temple', 'historic'].includes(scene) ? 0.58 : 0.16;
        this.add(motif, this.slot(0.02, y, 0.96, 0.07));
      }
    }

    const farShoreScenes = new Set(['fishing', 'waterTown', 'farewell', 'village', 'spring', 'lotusPond', 'autumnTravel', 'winterForest', 'moonNight']);
    if (farShoreScenes.has(scene) && (this.structure === 'level' || this.structure === 'deep')) {
      const shore = this.fitted(this.engine.paintingFarShore(), this.slot(0, this.composition === 'oppositeBank' ? 0.24 : 0.30, 1, 0.16));
      if (shore) {
        this.parts.push(['refined-v1', 'painted-v2', 'landscape-v3'].includes(this.elementTreatment) ? new Part(shore.canv, { fade:{
          top:shore.bounds.maxY - shore.bounds.height * 0.65, bottom:shore.bounds.maxY, seed:17
        } }) : new Part(shore.canv));
        this.elements.push({
          motif: 'farShore',
          bounds: { x: shore.bounds.minX / this.w, y: shore.bounds.minY / this.h, width: shore.bounds.width / this.w, height: shore.bounds.height / this.h }
        });
      }
    }

    this.terrainLayerEnd = this.parts.length;
    this.ground(scene, false);

    switch (scene) {
      case 'retreat':
        include('pine', this.leadTreeSlot());
        include('bamboo', this.slot(0.70, 0.55, 0.28, 0.29));
        if (chosen.has('hut')) this.placeAtFoot('hut', 0.72, 0.10, 1.7);
        if (chosen.has('pavilion')) {
          this.placeAtFoot('pavilion', [0.36, 0.68, 0.30, 0.62][this.layoutVariant], 0.20, 1.16);
        }
        include('stream', this.mountainStreamSlot());
        break;
      case 'fishing':
        if (chosen.has('angler')) {
          this.add('angler', this.slot(
            [0.08, 0.40, 0.18, 0.32][this.layoutVariant],
            [0.48, 0.61, 0.36, 0.55][this.layoutVariant],
            [0.82, 0.58, 0.72, 0.64][this.layoutVariant],
            0.20
          ));
        } else if (chosen.has('sail')) {
          this.add('sail', this.slot(0.16, 0.47, 0.7, 0.29));
        } else {
          include('boat', this.slot(0.14, 0.62, 0.75, 0.15));
        }
        if (chosen.has('reeds')) {
          const bankElem = this.elements.find(e => e.motif === 'groundBank');
          if (bankElem) {
            const b = new CRect(bankElem.bounds.x * this.w, bankElem.bounds.y * this.h, bankElem.bounds.width * this.w, bankElem.bounds.height * this.h);
            const reedH = Math.max(b.height * 2.4, this.h * 0.10);
            const towardWater = this.verse.isNull || this.verse.minX > this.w / 2;
            this.add('reeds', new CRect(
              towardWater ? b.maxX - b.width * 0.30 : b.minX - b.width * 0.05,
              b.maxY - reedH,
              b.width * 0.35,
              reedH
            ));
          } else {
            include('reeds', this.slot(0.03, 0.15, 0.27, 0.8, true));
          }
        }
        break;
      case 'waterTown':
        if (chosen.has('bridge')) this.crossing(true);
        if (chosen.has('house')) {
          const bankElem = this.elements.find(e => e.motif === 'groundBank');
          if (bankElem) {
            const width = bankElem.bounds.width * this.w * 0.23;
            const height = bankElem.bounds.width * this.w * 0.10;
            this.pinned = true;
            for (const fraction of [0.83, 0.89, 0.77, 0.71]) {
              const x = this.supportedBankX((bankElem.bounds.x + bankElem.bounds.width * fraction) * this.w);
              const foot = this.bankFoot(x - width * 0.3, x + width * 0.3);
              if (foot !== null && this.add('house', new CRect(x - width / 2, foot - height, width, height))) break;
            }
            this.pinned = false;
          }
        }
        include('pavilion', this.slot(0.62, 0.54, 0.32, 0.25));
        include('willow', this.leadTreeSlot());
        if (chosen.has('mooredBoat')) this.placeBoatOnWater('mooredBoat');
        break;
      case 'farewell':
        include('pavilion', this.slot(0.33, 0.60, 0.29, 0.16));
        include('willow', this.leadTreeSlot());
        if (chosen.has('traveler')) {
          const bankElem = this.elements.find(e => e.motif === 'groundBank');
          if (bankElem) {
            const willowElem = this.elements.find(e => e.motif === 'willow');
            const size = Math.min(this.art.width * 0.043, (willowElem ? willowElem.bounds.height : 1) * this.h * 0.22);
            for (const fraction of [0.68, 0.74]) {
              const x = this.supportedBankX((bankElem.bounds.x + bankElem.bounds.width * fraction) * this.w);
              const foot = this.bankFoot(x - size * 0.2, x + size * 0.2);
              if (foot !== null) {
                this.pinned = true;
                this.add('traveler', new CRect(x - size * 0.3, foot - size, size * 0.6, size), true);
                this.pinned = false;
              }
            }
          }
        }
        include('path', this.slot(0.05, 0, 0.28, 0.8, true));
        if (chosen.has('mooredBoat')) this.placeBoatOnWater('mooredBoat');
        break;
      case 'village':
        this.add(chosen.has('pine') ? 'pine' : 'layeredTree', this.leadTreeSlot());
        include(chosen.has('hut') ? 'hut' : 'house', this.slot(0.39, 0.56, 0.44, 0.18));
        if (chosen.has('cookingSmoke')) {
          const homeElem = this.elements.find(e => ['house', 'hut'].includes(e.motif));
          if (homeElem) {
            const smokeH = homeElem.bounds.height * this.h * 1.8;
            this.add('cookingSmoke', new CRect(
              (homeElem.bounds.x + homeElem.bounds.width * 0.5) * this.w,
              (homeElem.bounds.y + homeElem.bounds.height * 0.15) * this.h - smokeH,
              homeElem.bounds.width * this.w * 0.3,
              smokeH
            ));
          }
        }
        include('fields', this.slot(0.05, 0.0, 0.9, 0.92, true));
        if (chosen.has('fence')) {
          const homeElem = this.elements.find(e => ['house', 'hut'].includes(e.motif));
          if (homeElem) {
            const hb = new CRect(homeElem.bounds.x * this.w, homeElem.bounds.y * this.h, homeElem.bounds.width * this.w, homeElem.bounds.height * this.h);
            const fh = hb.height * 0.42, fw = hb.width * 1.1;
            this.pinned = true;
            this.add('fence', new CRect(hb.minX - fw * 0.85, hb.maxY + hb.height * 0.06 - fh, fw, fh));
            this.pinned = false;
          }
        }
        include('path', this.slot(0.65, 0.62, 0.24, 0.34));
        break;
      case 'spring':
        include('blossom', this.leadTreeSlot());
        include('layeredTree', this.slot(0.65, 0.34, 0.32, 0.47));
        include('path', this.slot(0.2, 0.02, 0.48, 0.9, true));
        break;
      case 'lotusPond':
        include('lotus', this.slot(
          [0.0, 0.38, 0.14, 0.30][this.layoutVariant],
          0.05,
          [0.58, 0.60, 0.72, 0.64][this.layoutVariant],
          0.90,
          true
        ));
        include('willow', this.slot(0.61, 0.03, 0.37, 0.59));
        if (chosen.has('stream')) {
          const bankElem = this.elements.find(e => e.motif === 'groundBank');
          if (bankElem) {
            const inlet = new CRect(
              (bankElem.bounds.x + bankElem.bounds.width) * this.w - this.art.width * 0.03,
              (bankElem.bounds.y + bankElem.bounds.height) * this.h,
              this.art.width * 0.42,
              this.art.width * 0.08
            );
            this.layWater(this.waterEngine.paintingSurface('pond', inlet.width, inlet.height), inlet, 'stream');
            this.placed.add('stream');
          }
        }
        if (chosen.has('dragonfly') && this.lotusFlowerTip) {
          const lotusElem = this.elements.find(e => e.motif === 'lotus');
          if (lotusElem) {
            const size = lotusElem.bounds.width * this.w * 0.12;
            this.add('dragonfly', new CRect(
              this.lotusFlowerTip.x - size / 2,
              this.lotusFlowerTip.y - size * 0.48,
              size,
              size * 0.5
            ));
          }
        }
        break;
      case 'autumnTravel':
        if (chosen.has('bridge')) this.crossing(false);
        this.add('oldTree', this.leadTreeSlot());
        this.placed.add('bareTree');
        if (chosen.has('vine')) {
          const vineCanv = this.treeVines.oldTree || this.treeVines.bareTree;
          if (vineCanv) {
            let vx0 = Infinity, vx1 = -Infinity, vy0 = Infinity, vy1 = -Infinity;
            for (const poly of vineCanv) {
              for (const pt of poly.pts) {
                if (pt.x < vx0) vx0 = pt.x;
                if (pt.x > vx1) vx1 = pt.x;
                if (pt.y < vy0) vy0 = pt.y;
                if (pt.y > vy1) vy1 = pt.y;
              }
            }
            if (Number.isFinite(vx0)) {
              this.add('vine', new CRect(vx0, vy0, vx1 - vx0, vy1 - vy0), false, vineCanv);
            }
          }
        }
        if (chosen.has('crow')) this.treeCrows();
        if (chosen.has('house')) {
          const bankElem = this.elements.find(e => e.motif === 'groundBank');
          if (bankElem) {
            const personH = this.journeyPersonHeight();
            const raw = this.engine.paintingHouse(2);
            let hx0 = Infinity, hx1 = -Infinity, hy0 = Infinity, hy1 = -Infinity;
            for (const poly of raw) {
              for (const pt of poly.pts) {
                if (pt.x < hx0) hx0 = pt.x;
                if (pt.x > hx1) hx1 = pt.x;
                if (pt.y < hy0) hy0 = pt.y;
                if (pt.y > hy1) hy1 = pt.y;
              }
            }
            const front = raw[1].pts;
            let ey0 = Infinity, ey1 = -Infinity;
            for (const pt of front) {
              if (pt.y < ey0) ey0 = pt.y;
              if (pt.y > ey1) ey1 = pt.y;
            }
            const eaveHeight = ey1 - ey0;
            const scale = (personH * 1.35) / eaveHeight;
            const height = (hy1 - hy0) * scale;
            const width = (hx1 - hx0) * scale;
            const bridgeElem = this.elements.find(e => e.motif === 'bridge');
            const leftReach = [0.61, 0.43, 0.54, 0.48][this.layoutVariant];
            const limit = (bankElem.bounds.x + bankElem.bounds.width * leftReach) * this.w - width * 0.52;
            const bridgeMaxX = bridgeElem ? (bridgeElem.bounds.x + bridgeElem.bounds.width) * this.w : (bankElem.bounds.x + bankElem.bounds.width * 0.26) * this.w;
            const desired = Math.max(bankElem.bounds.x * this.w + width * 0.52, Math.min(limit, bridgeMaxX + width * 0.58));

            const root = this.treeRoots.oldTree;
            const treeElem = this.elements.find(e => e.motif === 'oldTree');
            const treeWidth = treeElem ? treeElem.bounds.width : 0;
            const clearance = width * 0.52 + treeWidth * this.w * 0.025;
            const alternatives = [];

            if (this.bankSurface) {
              const low = bankElem.bounds.x * this.w + width * 0.52;
              const high = (bankElem.bounds.x + bankElem.bounds.width) * this.w - width * 0.52;
              for (let i = 0; i < this.bankSurface.heights.length; i++) {
                if (Number.isFinite(this.bankSurface.heights[i])) {
                  const x = this.bankSurface.x0 + i * this.bankSurface.step;
                  if (x > low && x < high) alternatives.push(x);
                }
              }
              alternatives.sort((a, b) => Math.abs(a - desired) - Math.abs(b - desired));
            }

            const origFoot = this.bankFoot(desired - width * 0.36, desired + width * 0.36);
            for (const x of [desired, ...alternatives]) {
              if (root && Math.abs(x - root.x) < clearance) continue;
              const foot = this.bankFoot(x - width * 0.36, x + width * 0.36);
              if (foot === null) continue;
              if (origFoot !== null && foot > origFoot + height * 0.25) continue;
              this.pinned = true;
              const landed = this.add('house', new CRect(x - width / 2, foot - height, width, height), false, raw);
              this.pinned = false;
              if (landed) break;
            }
          }
        }
        if (chosen.has('horse') && chosen.has('traveler')) {
          this.journey();
        } else {
          include('path', this.slot(0.05, 0, 0.52, 0.95, true));
          include('traveler', this.slot(0.50, 0.30, 0.045, 0.16, true));
          include('horse', this.slot(0.555, 0.33, 0.10, 0.13, true));
        }
        if (!chosen.has('bridge')) include('stream', this.mountainStreamSlot());
        break;
      case 'winterForest':
        include('oldTree', this.leadTreeSlot());
        include('bareTree', this.slot(0.59, 0.22, 0.36, 0.56));
        if (chosen.has('bareTree')) this.add('bareTree', this.slot(0.40, 0.27, 0.20, 0.43), true);
        include('house', this.slot(0.61, 0.73, 0.28, 0.10));
        if (chosen.has('snow')) {
          const bankElem = this.elements.find(e => e.motif === 'groundBank');
          if (bankElem) {
            this.elements.push({ motif: 'snow', bounds: bankElem.bounds });
          }
          this.add('snow', this.slot(0.04, 0.12, 0.90, 0.52));
        }
        break;
      case 'moonNight':
        this.add('house', this.slot(0.23, 0.55, 0.65, 0.26));
        include('window', this.slot(0.43, 0.67, 0.14, 0.14));
        include('boat', this.slot(0.78, 0.55, 0.20, 0.18, true));
        break;
      case 'temple':
        if (chosen.has('pagoda')) this.placeAtFoot('pagoda', 0.32, 0.24, 0.42);
        if (chosen.has('templeGate')) this.placeAtFoot('templeGate', 0.62, 0.12, 1.8);
        include('bamboo', this.slot(0.01, 0.50, 0.40, 0.32));
        include('path', this.slot(0.15, 0, 0.45, 0.95, true));
        break;
      case 'courtyard': {
        const band = this.lowerBand(0.45);
        let wallBox = new CRect(
          band.minX + band.width * [0.0, 0.12, 0.26, 0.05][this.layoutVariant],
          band.minY + band.height * [0.02, 0.15, 0.06, 0.23][this.layoutVariant],
          band.width * [0.64, 0.52, 0.70, 0.58][this.layoutVariant],
          band.height * [0.76, 0.64, 0.80, 0.58][this.layoutVariant]
        );
        if (this.layoutVariant !== 0) {
          wallBox = new CRect(this.art.minX, this.art.minY + this.art.height * 0.44, this.art.width * 0.96, this.art.height * 0.20);
        }
        const wall = this.fitted(this.engine.paintingCourtyard(), wallBox);
        if (wall) {
          const willowW = this.art.width * [0.98, 0.62, 0.70, 0.80][this.layoutVariant];
          const rootY = wall.bounds.minY + wall.bounds.height * 0.67;
          const x = Math.min(Math.max(this.art.minX, wall.bounds.minX + wall.bounds.width * [0.18, 0.62, 0.34, 0.77][this.layoutVariant] - willowW / 2), this.art.maxX - willowW);

          const rearWidth = Math.min(this.art.width * 0.40, wall.bounds.width * 0.44);
          const rearX = wall.bounds.minX + wall.bounds.width * [0.48, 0.08, 0.46, 0.12][this.layoutVariant];
          const rear = new CRect(
            Math.min(this.art.maxX - rearWidth, Math.max(this.art.minX, rearX)),
            wall.bounds.minY + wall.bounds.height * 0.30 - rearWidth * 0.7,
            rearWidth,
            rearWidth * 0.7
          );
          const roof = this.fitted(this.engine.paintingHouse(), rear);
          if (roof) {
            this.parts.push(new Part(this.engine.paintingInk(roof.canv, 2)));
            const b = roof.bounds;
            this.elements.push({
              motif: 'courtyardRearHall',
              bounds: { x: b.minX / this.w, y: b.minY / this.h, width: b.width / this.w, height: b.height / this.h }
            });
          }

          this.pinned = true;
          include('willow', new CRect(x, this.art.minY, willowW, rootY - this.art.minY));
          if (this.layoutVariant === 2 && chosen.has('willow')) {
            this.add('willow', new CRect(
              this.art.maxX - this.art.width * 0.38,
              this.art.minY + this.art.height * 0.25,
              this.art.width * 0.38,
              rootY - this.art.minY - this.art.height * 0.25
            ), true);
          }
          this.pinned = false;

          const r = wall.bounds;
          if (chosen.has('pavilion')) {
            const pWidth = Math.min(this.art.width * 0.42, r.width * 0.32);
            const pHeight = pWidth / 1.16;
            const low = Math.max(r.minX, this.art.minX) + pWidth / 2;
            const high = Math.min(r.maxX, this.art.maxX) - pWidth / 2;
            const stem = (this.paintedTrees.willow || []).flatMap(p => p.pts).filter(pt => pt.y > rootY - r.height * 0.10);
            const stemX = stem.length === 0 ? x + willowW / 2 : stem.reduce((acc, pt) => acc + pt.x, 0) / stem.length;
            const center = high >= low ? (Math.abs(high - stemX) < Math.abs(low - stemX) ? high : low) : r.midX;
            const base = r.minY + r.height * 0.28;
            this.pinned = true;
            this.add('pavilion', new CRect(center - pWidth / 2, base - pHeight, pWidth, pHeight));
            this.pinned = false;
          }

          this.parts.push(new Part(wall.canv, null, {
            top: r.minY + r.height * 0.76,
            bottom: r.maxY,
            seed: this.engine.inkSeed()
          }, true));
          this.elements.push({
            motif: 'courtyard',
            bounds: { x: r.minX / this.w, y: r.minY / this.h, width: r.width / this.w, height: r.height / this.h }
          });
          this.placed.add('courtyard');

          const near = new CRect(r.minX + r.width * 0.20, r.minY + r.height * 0.34, r.width * 0.12, r.height * 0.23);
          include('window', near);
          include('curtain', near.inset(near.width * 0.12, near.height * 0.10));

          for (let step = 0; step < 3; step++) {
            const sy = Math.min(this.footer - 2, r.maxY + step * r.height * 0.055);
            const half = r.width * (0.10 + step * 0.025);
            this.parts.push(Part.near(this.engine.inkLine(
              [P(r.minX + r.width * 0.64 - half, sy), P(r.minX + r.width * 0.64 + half, sy)],
              0.8, 0.48, 0.55
            )));
          }

          const rock = this.fitted(this.engine.paintingRock(60, 75, 1.1), new CRect(
            r.maxX - r.width * 0.08,
            r.maxY - r.height * 0.62,
            r.width * 0.20,
            r.height * 0.65
          ));
          if (rock) this.parts.push(Part.near(rock.canv));
        }
        break;
      }
      case 'historic':
        if (this.summitLedge) {
          const ledge = this.summitLedge;
          const left = ledge.minX + ledge.width * 0.12, right = ledge.maxX - ledge.width * 0.12;
          const depth = Math.max(0.8, ledge.width * 0.08);
          if (chosen.has('terrace')) {
            const rim = this.engine.paintingTerrace(right - left, depth).map(poly => {
              const p = { ...poly };
              p.pts = poly.pts.map(pt => P(pt.x + left, pt.y + ledge.minY));
              return p;
            });
            this.parts.push(new Part(rim));
            this.elements.push({
              motif: 'terrace',
              bounds: { x: left / this.w, y: ledge.minY / this.h, width: (right - left) / this.w, height: depth / this.h }
            });
            this.placed.add('terrace');
          }
          if (chosen.has('traveler')) {
            const mainElem = this.elements.find(e => e.motif === 'mainMountain');
            const mountainHeight = mainElem ? mainElem.bounds.height * this.h : this.art.height;
            const pHeight = Math.min(Math.min(this.art.height * 0.028, ledge.width * 0.65), mountainHeight * 0.04);
            const pBox = new CRect(ledge.midX - pHeight * 0.25, ledge.minY - pHeight, pHeight * 0.5, pHeight);
            const person = this.fitted(this.engine.paintingAsset('traveler'), pBox);
            if (person) {
              this.parts.push(new Part(person.canv));
              const b = person.bounds;
              this.elements.push({
                motif: 'traveler',
                bounds: { x: b.minX / this.w, y: b.minY / this.h, width: b.width / this.w, height: b.height / this.h }
              });
              this.placed.add('traveler');
            }
          }
        }
        include('ruins', this.slot(0.08, 0.62, 0.20, 0.12));
        include('cityGate', this.slot(0.65, 0.58, 0.24, 0.16));
        break;
      case 'desert':
        this.desert(chosen);
        break;
      case 'ocean':
        this.ocean(chosen);
        break;
    }

    const canon = canonicalMotifs(Array.from(chosen));
    for (const motif of canon) {
      if (this.placed.has(motif)) continue;
      if (motif === 'boat' && (chosen.has('angler') || chosen.has('mooredBoat') || chosen.has('sail'))) continue;
      if (motif === 'moon' && chosen.has('crescent')) continue;
      if ((motif === 'sunrise' || motif === 'sunset') && (chosen.has('moon') || chosen.has('crescent'))) continue;

      switch (motif) {
        case 'moon':
        case 'crescent':
        case 'sunrise':
        case 'sunset':
          this.add(motif, this.celestialSlot(motif));
          break;
        case 'stars':
          this.add(motif, this.slot(0.05, 0.0, 0.85, 0.18));
          break;
        case 'boat':
        case 'angler':
        case 'mooredBoat':
        case 'sail':
          this.placeBoatOnWater(motif);
          break;
        case 'cookingSmoke':
          this.roofSmoke();
          break;
        case 'beaconSmoke':
          this.add(motif, this.slot(0.28, 0.22, 0.06, 0.4));
          break;
        case 'egret': {
          const bankElem = this.elements.find(e => e.motif === 'groundBank');
          if (bankElem) {
            const size = Math.min(this.art.width * 0.09, bankElem.bounds.width * this.w * 0.12);
            this.add(motif, new CRect(
              (bankElem.bounds.x + bankElem.bounds.width) * this.w - size,
              (bankElem.bounds.y + bankElem.bounds.height) * this.h - size * 1.6,
              size,
              size * 1.6
            ));
          }
          break;
        }
        case 'butterfly': {
          const treeElem = this.elements.find(e => ['blossom', 'willow', 'layeredTree'].includes(e.motif));
          if (treeElem) {
            const size = Math.max(5, treeElem.bounds.width * this.w * 0.07);
            this.add(motif, new CRect(
              (treeElem.bounds.x + treeElem.bounds.width) * this.w - size * 0.5,
              (treeElem.bounds.y + treeElem.bounds.height * 0.30) * this.h,
              size,
              size * 0.8
            ));
          } else {
            this.add(motif, this.slot(0.48, 0.32, 0.04, 0.03));
          }
          break;
        }
        case 'crow':
        case 'swallow':
        case 'dragonfly':
          this.add(motif, this.slot(0.30, 0.18, 0.07, 0.04));
          break;
        case 'waterfall':
          this.mountainWaterfall();
          break;
        case 'stream': {
          if (this.currentScene === 'fishing') {
            const river = this.elements.find(e => e.motif === 'riverWater');
            if (river) {
              this.elements.push({ motif: 'stream', bounds: river.bounds });
              this.placed.add('stream');
            }
          } else {
            this.add(motif, this.slot(0.60, 0.02, 0.22, 0.88, true));
          }
          break;
        }
        case 'mist':
        case 'afterRain':
          this.add(motif, this.slot(0.02, 0.42, 0.96, 0.10));
          break;
        case 'rain':
          break;
        case 'snow':
          this.add(motif, this.slot(0.04, 0.12, 0.90, 0.52));
          break;
        case 'path':
          this.add(motif, this.slot(0.1, 0.1, 0.4, 0.8, true));
          break;
        case 'reeds':
        case 'grass':
          this.add(motif, this.slot(0.03, 0.1, 0.20, 0.8, true));
          break;
        case 'bridge':
          this.crossing(false);
          break;
        case 'horse':
          this.add(motif, this.slot(0.60, 0.25, 0.28, 0.62, true));
          break;
        case 'traveler':
          this.add(motif, this.slot(0.38, 0.66, 0.1, 0.12));
          break;
        default:
          this.add(motif, this.slot(0.01, 0.23, 0.48, 0.59));
          break;
      }
    }

    this.completeSelection(canon);
    this.waterDetails();
  }

  openPlane(raw, top, motif) {
    const band = this.lowerBand();
    const boxes = [
      new CRect(this.art.minX, top, this.art.width, Math.max(0, band.minY - top)),
      new CRect(band.minX, Math.max(top, band.minY), band.width, Math.max(0, this.footer - Math.max(top, band.minY)))
    ];
    for (const box of boxes) {
      if (box.height <= 0) continue;
      const canvas = this.clipWater(raw, box);
      if (canvas.length === 0) continue;
      this.parts.push(Part.near(canvas));
      this.engine.noted('water', canvas);
      this.elements.push({
        motif,
        bounds: { x: box.minX / this.w, y: box.minY / this.h, width: box.width / this.w, height: box.height / this.h }
      });
    }
  }

  desert(chosen) {
    const band = this.lowerBand(0.45);
    const horizon = this.art.minY + this.art.height * [0.44, 0.60, 0.50, 0.68][this.layoutVariant];
    const far = this.fitted(this.engine.paintingDunes(true), new CRect(this.art.minX, horizon, this.art.width, this.art.height * 0.045));
    if (far) {
      this.parts.push(Part.near(far.canv));
      const b = far.bounds;
      this.elements.push({
        motif: 'farDunes',
        bounds: { x: b.minX / this.w, y: b.minY / this.h, width: b.width / this.w, height: b.height / this.h }
      });
    }

    const sand = [];
    const upperBox = new CRect(this.art.minX, horizon + this.h * 0.015, this.art.width, Math.min(this.h * 0.16, this.footer - horizon));
    const dunes = this.fitted(this.engine.paintingDunes(false), upperBox);
    if (dunes) {
      sand.push(...dunes.canv);
      this.parts.push(Part.near(this.engine.paintingInk(dunes.canv, 2)));
    }

    for (let reach = 0; reach < 2; reach++) {
      const left = reach === 0;
      const width = band.width * (left ? [0.72, 0.50, 0.84, 0.56][this.layoutVariant] : 0.68);
      const top = left ? band.minY : band.minY + band.height * 0.36;
      const box = new CRect(left ? band.minX : band.maxX - width, top, width, this.footer - top);
      const reachDunes = this.fitted(this.engine.paintingDunes(false), box);
      if (reachDunes) {
        sand.push(...reachDunes.canv);
        this.parts.push(Part.near(this.engine.paintingInk(reachDunes.canv, 1)));
        const b = reachDunes.bounds;
        this.elements.push({
          motif: 'dunes',
          bounds: { x: b.minX / this.w, y: b.minY / this.h, width: b.width / this.w, height: b.height / this.h }
        });
      }
    }
    this.placed.add('dunes');

    const channel = new PaintingWaterChannel(
      this.art.width * 0.96,
      this.footer - horizon,
      [0.2, 2.4, 4.1, 5.2][this.layoutVariant],
      true,
      0.32,
      0.45
    );

    if (chosen.has('stream')) {
      const river = this.waterEngine.paintingChannel(channel).map(poly => {
        const p = { ...poly };
        p.pts = poly.pts.map(pt => P(pt.x + this.art.minX, pt.y + horizon));
        return p;
      });
      this.openPlane(river, horizon, 'stream');
      this.placed.add('stream');
    }

    if (chosen.has('sunset')) {
      const size = Math.min(this.w, this.h) * [0.12, 0.095, 0.14, 0.11][this.layoutVariant];
      const x = this.art.minX + this.art.width * [0.74, 0.26, 0.62, 0.32][this.layoutVariant];
      this.add(
        'sunset',
        new CRect(x - size / 2, horizon - size * 0.90, size, size),
        false,
        this.engine.sceneEllipse(40, 40, 24, 24, C(171, 64, 51, 0.70), 0)
      );
    }

    if (chosen.has('beaconSmoke')) {
      const width = this.art.width * 0.11;
      const preferred = this.art.minX + this.art.width * [0.12, 0.78, 0.18, 0.80][this.layoutVariant];
      const sandPoints = [];
      for (const poly of sand) {
        for (const pt of poly.pts) sandPoints.push(pt);
      }
      const footings = [];
      for (let idx = 0; idx <= 24; idx++) {
        const x = this.art.minX + width * 0.6 + ((this.art.width - width * 1.2) * idx) / 24;
        let minY = Infinity;
        for (const pt of sandPoints) {
          if (Math.abs(pt.x - x) < width * 0.25 && pt.y < minY) minY = pt.y;
        }
        if (!Number.isFinite(minY)) continue;
        const t = Math.min(1, Math.max(0, (minY - horizon) / channel.height));
        const left = this.art.minX + channel.point(t, -1).x;
        const right = this.art.minX + channel.point(t, 1).x;
        if (!chosen.has('stream') || x + width * 0.7 < left || x - width * 0.7 > right) {
          footings.push({ x, y: minY });
        }
      }

      let footing = { x: preferred, y: horizon + this.h * 0.10 };
      if (footings.length > 0) {
        footing = footings[0];
        let bestDist = Math.abs(footing.x - preferred);
        for (let i = 1; i < footings.length; i++) {
          const d = Math.abs(footings[i].x - preferred);
          if (d < bestDist) { bestDist = d; footing = footings[i]; }
        }
      }

      const x = footing.x, base = footing.y;
      const box = new CRect(x - width / 2, base - width * 0.70, width, width * 0.70);
      const tower = this.fitted(this.engine.paintingBeacon(), box);
      if (tower) {
        this.parts.push(Part.near(tower.canv));
        const b = tower.bounds;
        this.elements.push({
          motif: 'beaconTower',
          bounds: { x: b.minX / this.w, y: b.minY / this.h, width: b.width / this.w, height: b.height / this.h }
        });
        const top = Math.max(this.art.minY, b.minY - this.h * 0.27);
        this.add(
          'beaconSmoke',
          new CRect(b.midX - width * 0.22, top, width * 0.44, b.minY - top + 2),
          false,
          this.engine.paintingInk(this.engine.paintingSmoke(true), 1)
        );
      }
    }
  }

  ocean(chosen) {
    const moonSize = Math.min(this.art.width * [0.42, 0.34, 0.48, 0.38][this.layoutVariant], this.h * 0.30);
    const horizon = Math.max(
      this.contentTop + moonSize * 1.10,
      this.art.minY + this.art.height * [0.14, 0.33, 0.23, 0.43][this.layoutVariant]
    );

    this.parts.push(Part.near(this.engine.inkLine(
      [P(this.art.minX, horizon), P(this.art.minX + this.art.width * 0.45, horizon + 0.3), P(this.art.maxX, horizon - 0.2)],
      0.7, 0.35, 0.5
    )));

    const light = chosen.has('moon') ? 'moon' : (chosen.has('sunrise') ? 'sunrise' : null);
    if (light) {
      const size = moonSize;
      const x = this.art.minX + this.art.width * [0.28, 0.68, 0.48, 0.72][this.layoutVariant];
      this.add(light, new CRect(x - size / 2, horizon - size * 1.10, size, size));
      const path = new CRect(x - this.art.width * 0.14, horizon + 2, this.art.width * 0.28, Math.max(6, this.footer - horizon - 8));
      const reflection = this.fitted(this.waterEngine.paintingReflection(path.width, path.height), path);
      if (reflection) {
        this.parts.push(Part.near(this.engine.paintingInk(reflection.canv, 1)));
        const b = reflection.bounds;
        this.elements.push({
          motif: 'moonReflection',
          bounds: { x: b.minX / this.w, y: b.minY / this.h, width: b.width / this.w, height: b.height / this.h }
        });
      }
    }

    const near = this.lowerBand(0.62);
    const top = horizon + (near.minY - horizon) * 0.20;
    const raw = this.waterEngine.paintingSurface('sea', near.width, this.footer - top).map(poly => {
      const p = { ...poly };
      p.pts = poly.pts.map(pt => P(pt.x + near.minX, pt.y + top));
      return p;
    });
    this.openPlane(this.engine.paintingInk(raw, 1), top, 'waves');
    this.placed.add('waves');

    if (chosen.has('reef')) {
      const width = near.width * [0.45, 0.58, 0.38, 0.52][this.layoutVariant];
      const box = new CRect(
        near.minX + near.width * [0.55, 0.0, 0.46, 0.08][this.layoutVariant],
        near.minY + near.height * [0.24, 0.10, 0.42, 0.30][this.layoutVariant],
        width,
        near.height * 0.58
      );
      const rock = this.fitted(this.engine.paintingRock(120, 55, 1.3), box);
      if (rock) {
        this.parts.push(Part.near(rock.canv));
        this.placed.add('reef');
        const b = rock.bounds;
        this.elements.push({
          motif: 'reef',
          bounds: { x: b.minX / this.w, y: b.minY / this.h, width: b.width / this.w, height: b.height / this.h }
        });
      }
    }
  }

  placeBoatOnWater(motif) {
    const streamElem = this.elements.find(e => e.motif === 'stream');
    if (streamElem && this.currentScene === 'retreat') {
      const width = Math.min(this.art.width * 0.32, streamElem.bounds.width * this.w * 0.9);
      const height = motif === 'sail' ? width * 0.85 : width * 0.40;
      this.add(motif, new CRect(
        (streamElem.bounds.x + streamElem.bounds.width / 2) * this.w - width / 2,
        (streamElem.bounds.y + streamElem.bounds.height) * this.h - height,
        width,
        height
      ));
    } else {
      if (!this.elements.some(e => ['riverWater', 'lakeWater', 'pondWater', 'waves'].includes(e.motif))) {
        this.water();
      }
      const band = this.lowerBand();
      const bankElem = this.elements.find(e => e.motif === 'groundBank');
      const width = Math.min(this.art.width * 0.40, band.width * 0.22);
      const height = motif === 'sail' ? width * 0.85 : width * 0.40;
      let bottom = Math.min(this.footer - 3, ((bankElem ? bankElem.bounds.y + bankElem.bounds.height : 0.8) * this.h) + height * 0.50);
      let left = band.minX + band.width * 0.65;
      const pavilionElem = this.elements.find(e => e.motif === 'pavilion');
      if (pavilionElem) {
        bottom = Math.min(this.footer - 3, Math.max(bottom, (pavilionElem.bounds.y + pavilionElem.bounds.height) * this.h + height * 1.45));
        left = Math.min(band.maxX - width, Math.max(band.minX, (pavilionElem.bounds.x + pavilionElem.bounds.width) * this.w + width * 0.18));
      }
      this.add(motif, new CRect(left, bottom - height, width, height));
    }
  }

  roofSmoke() {
    if (!this.elements.some(e => ['house', 'hut'].includes(e.motif))) {
      this.add('hut', this.slot(0.35, 0.55, 0.4, 0.20));
    }
    const homeElem = this.elements.find(e => ['house', 'hut'].includes(e.motif));
    if (!homeElem) return;
    const height = Math.min(homeElem.bounds.height * this.h * 1.8, this.art.height * 0.25);
    this.add('cookingSmoke', new CRect(
      (homeElem.bounds.x + homeElem.bounds.width * 0.42) * this.w,
      (homeElem.bounds.y + homeElem.bounds.height * 0.16) * this.h - height,
      homeElem.bounds.width * this.w * 0.25,
      height
    ));
  }

  completeSelection(motifs) {
    for (const motif of motifs) {
      if (this.elements.some(e => e.motif === motif)) continue;
      let alias = [];
      switch (motif) {
        case 'boat': alias = ['angler', 'mooredBoat', 'sail']; break;
        case 'stream': alias = ['riverChannel']; break;
        case 'bareTree': if (this.currentScene === 'autumnTravel') alias = ['oldTree']; break;
        default: break;
      }
      const host = this.elements.find(e => alias.includes(e.motif));
      if (host) {
        this.elements.push({ motif, bounds: host.bounds });
        this.placed.add(motif);
        continue;
      }

      if (motif === 'cookingSmoke') { this.roofSmoke(); continue; }
      if (motif === 'vine') {
        if (Object.keys(this.treeVines).length === 0) {
          this.add('oldTree', this.slot(0, 0.12, 0.65, 0.70));
        }
        const vineCanv = this.treeVines.oldTree || this.treeVines.bareTree;
        if (vineCanv) {
          let vx0 = Infinity, vx1 = -Infinity, vy0 = Infinity, vy1 = -Infinity;
          for (const poly of vineCanv) {
            for (const pt of poly.pts) {
              if (pt.x < vx0) vx0 = pt.x;
              if (pt.x > vx1) vx1 = pt.x;
              if (pt.y < vy0) vy0 = pt.y;
              if (pt.y > vy1) vy1 = pt.y;
            }
          }
          if (Number.isFinite(vx0)) {
            this.pinned = true;
            this.add('vine', new CRect(vx0, vy0, vx1 - vx0, vy1 - vy0), false, vineCanv);
            this.pinned = false;
          }
        }
        continue;
      }

      if (['boat', 'angler', 'mooredBoat', 'sail'].includes(motif)) {
        this.placeBoatOnWater(motif);
        continue;
      }
      if (motif === 'waterfall') { this.mountainWaterfall(); continue; }
      if (motif === 'bridge') { this.crossing(false); continue; }

      if (['moon', 'crescent', 'sunrise', 'sunset'].includes(motif)) {
        for (const factor of [1.0, 0.8, 0.6]) {
          const box = this.celestialSlot(motif);
          if (this.add(motif, new CRect(box.minX, box.minY, box.width * factor, box.height * factor))) break;
        }
        continue;
      }

      this.placed.delete(motif);
      for (const factor of [1.0, 0.82, 0.65]) {
        let done = false;
        for (const x of [0.48, 0.06, 0.68]) {
          const box = this.slot(x, 0.38, 0.30 * factor, 0.40 * factor);
          if (this.add(motif, box)) { done = true; break; }
        }
        if (done) break;
      }
    }
  }
}

function generatePoetryPaintingV5(req, palette) {
  const seed = req.seed || 'seed';
  const width = req.width || 420;
  const height = req.height || 420;
  const ratio = height / width;
  const w = 420 * Math.max(1, 1 / ratio);
  const h = 420 * Math.max(1, ratio);
  const quietTop = req.quietTop ?? 0.08;
  const verse = req.verse || null;
  const scene = POETRY_SCENE_FROM_RAW[req.scene] || req.scene || 'retreat';
  const options = resolveSceneOptionsForPainting(req.options, scene, typeof seed === 'object' ? (seed.string || seed.seed) : seed);

  const stage = new PaintingStageV5(seed, w, h, palette, verse, quietTop, options);
  stage.elementTreatment = req.elementTreatment;
  if (req.elementTreatment === 'painted-v2') stage.engine.paintedStudySeed = String(seed);
  if (req.elementTreatment === 'landscape-v3') {
    stage.engine.landscapeSeed = String(seed);
    stage.waterEngine.landscapeSeed = String(seed);
    stage.engine.landscapeTechnique = req.options?.cun === 'axe' ? 'axe' : 'hemp';
  }
  stage.compose(scene, options);

  const layers = [];
  const nearSpans = [];

  for (let index = 0; index < stage.parts.length; index++) {
    const part = stage.parts[index];
    const shapes = [];
    const record = stage.celestialLayers.find(r => r.layer === index);
    appendPaintingShapesV5(part.canv, ['refined-v1', 'painted-v2', 'landscape-v3'].includes(req.elementTreatment) ? record?.motif : 'scene', palette, shapes);
    // Night ink stays subordinate to type; preserve celestial colour and atmospheric distance.
    if (['refined-v1', 'painted-v2', 'landscape-v3'].includes(req.elementTreatment) && palette.isDark && !record && !part.mist) {
      for (const shape of shapes) {
        for (const key of ['fill', 'stroke']) {
          if (shape[key]) shape[key] = shape[key].map((v, channel) => channel < 3
            ? palette.paper[channel] + (v - palette.paper[channel]) * 0.72 : v);
        }
      }
    }
    if (['refined-v1', 'painted-v2', 'landscape-v3'].includes(req.elementTreatment)) tintPaintingDetailsV5(shapes, part.detail, palette, req.elementTreatment === 'landscape-v3');
    if (record && !['refined-v1', 'painted-v2', 'landscape-v3'].includes(req.elementTreatment)) {
      for (let i = 0; i < shapes.length; i++) {
        if (record.motif === 'sunset' || record.motif === 'sunrise') {
          shapes[i].fill = [171 / 255, 64 / 255, 51 / 255, palette.isDark ? 0.48 : 0.34];
        } else if (record.motif === 'moon' && palette.isDark) {
          shapes[i].fill = opacity(palette.ink, 0.48);
        }
      }
    }

    if (part.near) {
      nearSpans.push({ layer: layers.length, range: [0, shapes.length] });
    }

    if (part.mist) {
      layers.push({
        shapes,
        mist: {
          depth: part.mist.depth,
          blur: part.mist.blur,
          peakOpacity: part.mist.peak,
          floorY: part.mist.floorY,
          floorDepth: part.mist.floorDepth
        }
      });
    } else if (part.fade) {
      layers.push({
        shapes,
        // V5 stores floorY/depth; the Web WashNoise renderer consumes top/bottom.
        // Keep the original path stable and repair the bridge only for the versioned study treatment.
        fade: ['refined-v1', 'painted-v2', 'landscape-v3'].includes(req.elementTreatment)
          ? { top:part.fade.floorY - part.fade.depth, bottom:part.fade.floorY, seed:part.fade.seed }
          : normalizeFade(part.fade)
      });
    } else {
      layers.push({ shapes });
    }
  }

  // Apply the existing paper-edge raster treatment only to the new layered rock washes.
  if(stage.engine.landscapeSeed) for(const layer of layers) {
    if(layer.shapes.some(shape=>shape.overprint)) {
      layer.wash={bleed:.12,rim:.08,grain:.45,fullResolution:true};
      layer.tooth=.20;
    }
  }

  const paper = stage.engine.backgroundPaper();
  paper.tint = palette.ink;
  paper.strength *= 0.45;

  const drawing = {
    width: w,
    height: h,
    background: palette.paper,
    paper,
    layers,
    verse,
    nearSpans,
    sceneElements: stage.elements,
    ...(stage.engine.landscapeSeed ? {brushwork:{version:'landscape-v3', technique:stage.engine.landscapeTechnique}} : {}),
    anchors: buildAnchorsV5(stage.engine.anchorPieces, w, h, stage.boats) || {
      boats: stage.boats,
      sky: { y: [0, 0.38] }
    }
  };

  const trace = {
    logicalWidth: w,
    logicalHeight: h,
    polygons: []
  };
  for (const part of stage.parts) {
    for (const poly of part.canv) {
      trace.polygons.push(poly.p.map(p => ({ x: p.x, y: p.y })));
    }
  }

  return { drawing, trace };
}

Object.assign(globalThis, {
  PaintingStageV5,
  generatePoetryPaintingV5
});



  root.ShanShuiEngineV5 = ShanShuiEngineV5;
  root.PaintingStageV5 = PaintingStageV5;
  root.SceneStageV4 = SceneStageV4;
  root.generatePoetryPaintingV5 = generatePoetryPaintingV5;
  root.generatePoetrySceneV4 = generatePoetrySceneV4;
  root.poetryScene = poetryScene;
  root.canonicalMotifs = canonicalMotifs;
  root.defaultMotifsForScene = defaultMotifsForScene;
  root.resolveSceneOptionsForPainting = resolveSceneOptionsForPainting;
  root.POETRY_SCENE_MAP = POETRY_SCENE_MAP;
})(typeof self !== 'undefined' ? self : globalThis);
