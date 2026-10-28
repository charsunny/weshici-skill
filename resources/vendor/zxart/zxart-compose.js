/*
 * 画屏 · 程序化背景 —— 竖幅构图层 (浏览器 / 测试共用, 纯 JS, 无依赖)。
 *
 * 画面本身由原作 JS 生成 (与本文件同目录, 逐字未改, MIT (c) 2018 Lingdong Huang):
 *   shan-shui-inf/  ← https://github.com/LingDong-/shan-shui-inf @ 9f754d2b2e73495db7883d4d4055a7b0903b0454
 *   nonflowers/     ← https://github.com/LingDong-/nonflowers    @ 03b653d220f16c6bed7ea9c7edc852f7e91846cb
 * 许可全文见各目录的 LICENSE, 说明见 NOTICE。
 *
 * 本文件是 zixiao-kit ZixiaoArt @1 (定稿 commit 60efe4b) 里「自己写的那一层」的逐行 JS 版:
 *   - Sources/ZixiaoArt/ShanShui/ShanShuiScene.swift  `compose` (Frame / distant / waterLines / boat / bank)、
 *                                                      `ShanShui.generateTraced` / `layers` / `appendShapes`
 *   - Sources/ZixiaoArt/Flowers/FlowersScene.swift    `applySeason` / `lotus` / `lotusLeaf` / `chrysanthemum` /
 *                                                      `ring` / `petal` / `drawPetals` / `Flowers.generateTraced`
 *   - Sources/ZixiaoArt/Flowers/FlowersCore.swift     `tube` / flowerHead 的 petalSeg
 *   - Sources/ZixiaoArt/ZXArt.swift                   `Palette` / `LayerMist.ridge` / `Trace`
 *   - Sources/ZixiaoArt/ZXArtProcedural.swift         配方参数映射 / 版式 (Frame)
 * 以及 @2 (zixiao-kit feat/zxart-quiet-layout @ 399746d, 给诗留诗句框的构图):
 *   - Sources/ZixiaoArt/ZXArtVerse.swift              `verseLayout` (诗句框)
 *   - Sources/ZixiaoArt/ShanShui/ShanShuiSceneV2.swift `composeV2`
 *   - Sources/ZixiaoArt/Flowers/FlowersScene.swift    `Flowers.Params.placeV2`
 * 以及 @3 (zixiao-kit master @ 6556ee2):
 *   - Core/ZXArtBrush.swift / ZXArtWash.swift / ZXArtRim.swift
 *   - ShanShui/ShanShuiSceneV3.swift / ShanShuiPrimitivesV3.swift / ShanShuiPaintV3.swift
 *   - ShanShui/ShanShuiMountV3.swift / ShanShuiTreesV3.swift / ShanShuiArchV3.swift
 *   - ZXArtProcedural.swift: effectiveGenerator / allowsShanShuiV3 (web 缺省关闭)
 * Brush / WashNoise 同放本文件, worker 与 node:vm 不需额外加载脚本。
 * @3 原作调用与 @2 共用 composeShanShuiV2; 旧轮廓 fit/cull 后才展开画法载荷。
 * 对拍: web/__tests__/huaping-procedural.test.ts 用 kit 的跨平台金标 (procedural-v1.json)、
 * huaping-procedural-v2.test.ts 用 procedural-v2.json 逐项比对多边形数 / 点数 / 坐标和 / 生成后的 PRNG 状态
 * (@2 另比诗句框)。
 * Swift 端的生成器是原作的逐位移植, 构图层只按原作 API 调用生成器; 这里按**同样的调用顺序**
 * (同样的 Math.random 消耗顺序) 直接调原作函数, 所以同一个 seed 出同一张画。
 * 改构图 (两边任何一边) 必须同步改另一边, 并把 generator 升版本 (shanshui@2 …)。
 *
 * 用法 (须在一个「只装了一个原作」的独立 realm 里: Web Worker 或 node:vm):
 *   1. 先 load 本文件, 调 ZXArtCompose.installShims(globalThis)  (window / document / btoa 垫片)
 *   2. 再 load 原作脚本 (shan-shui-inf/0..5 或 nonflowers/main.js)
 *   3. ZXArtCompose.generate(req) → Drawing (与 Swift ZXArt.Drawing 同形, 颜色已映射到调色板)
 * 原作把 PRNG / Perlin 表 / MEM 放在全局, 所以一个 realm 只能生成一次。
 */
(function (root) {
  'use strict';

  // ---------------------------------------------------------------- @3: ZXArtBrush / Wash / Rim (kit 6556ee2)
  // 无 Entropy / Perlin / Math.random。Double 计算, 在 Swift Float 的存储点 fround。
  var Brush = (function () {
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
        default: throw new Error('unknown brush profile ' + profile);
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

  var WashNoise = {
    value: function (x, y, seed) {
      var ix = Math.floor(x), iy = Math.floor(y), tx = x - ix, ty = y - iy;
      var u = tx * tx * (3 - 2 * tx), v = ty * ty * (3 - 2 * ty);
      function at(dx, dy) { return Brush.random(Brush.hash(seed, (iy + dy) >>> 0), (ix + dx) >>> 0); }
      var a = at(0, 0), b = at(1, 0), c = at(0, 1), d = at(1, 1);
      return (a + (b - a) * u) + ((c + (d - c) * u) - (a + (b - a) * u)) * v;
    },
    fbm: function (x, y, seed) {
      return (this.value(x * 0.035, y * 0.035, seed) * 4 + this.value(x * 0.079, y * 0.079, seed ^ 0x68E31DA4) * 2 + this.value(x * 0.173, y * 0.173, seed ^ 0xB5297A4D)) / 7;
    },
    disk: [[-0.16,-0.12],[0.34,-0.08],[-0.53,0.20],[0.03,0.46],[0.52,0.39],[-0.38,-0.60],
      [0.17,-0.57],[0.75,-0.40],[-0.85,-0.20],[-0.46,0.75],[0.08,0.91],[0.91,0.03]],
    displacement: function (x, y, bleed) {
      return [(this.fbm(x, y, 0xA511E9B3) - 0.5) * 0.7 + (this.value(x * 0.8, y * 0.8, 0x63D83595) - 0.5) * 0.06,
        (this.fbm(x, y, 0x9E3779B9) - 0.5) * 0.7 + (this.value(x * 0.8, y * 0.8, 0x1B56C4E9) - 0.5) * 0.06].map(function (v) { return v * bleed; });
    },
    tooth: function (amount, paper, x, y) {
      var strength = Brush.unit(amount == null ? 0 : amount);
      if (strength <= 0) return 1;
      var shade;
      if (paper && paper.shade.length === 512 * 512 && Number.isFinite(paper.texel) && paper.texel > 0) {
        function wrap(q) { return ((Math.floor(q / paper.texel) % 512) + 512) % 512; }
        shade = Math.min(1, paper.shade[wrap(y) * 512 + wrap(x)] / 255 * Math.max(0, paper.strength) * 5);
      } else shade = this.value(x * 1.7, y * 1.7, 0xD1B54A35);
      return 1 - strength * shade;
    },
    rimKeep: function (rim, x, y) {
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(rim.width) || rim.width <= 0 ||
          !Number.isFinite(rim.power) || rim.power <= 0 || !Number.isFinite(rim.ridgeX0) || !Number.isFinite(rim.ridgeStep) || rim.ridgeStep <= 0 || !rim.ridge.length) return 0;
      var q = (x - rim.ridgeX0) / rim.ridgeStep;
      var i = Math.floor(q), top;
      if (i < 0) top = rim.ridge[0];
      else if (i >= rim.ridge.length - 1) top = rim.ridge[rim.ridge.length - 1];
      else {
        var a = rim.ridge[i], b = rim.ridge[i + 1], t = q - i;
        top = !Number.isFinite(a) ? b : !Number.isFinite(b) ? a : a + (b - a) * t;
      }
      if (!Number.isFinite(top) || y < top) return 0;
      var fog = this.fbm(x * 0.23, y * 2.4, rim.seed ^ 0xC2B2AE35), u = Brush.unit((fog - 0.4) / 0.26);
      return Brush.unit(rim.peakOpacity) * Math.pow(1 + (y - top) / rim.width, -rim.power) * u * u * (3 - 2 * u);
    },
    fadeKeep: function (fade, x, y) {
      if (!Number.isFinite(x) || !Number.isFinite(y) || !(fade.bottom > fade.top)) return 1;
      var span = fade.bottom - fade.top;
      var seed = (fade.seed >>> 0);
      var billow = (this.fbm(x * 0.9, 3.7, seed) - 0.5) * span * 0.55 + Math.abs(Math.sin(x * 0.045 + (seed % 97))) * span * 0.18;
      var t = Brush.unit((y - (fade.top + billow)) / (span * 0.75));
      return 1 - t * t * (3 - 2 * t);
    },
  };

  // 相对旧首点保存载荷: shifted / placed 只移动骨架, 载荷无需重算。
  function pathV3(points, origin, style, seed, keepsFill) {
    return { relative: points.map(function (p) { return [p[0] - origin[0], p[1] - origin[1], 1]; }),
      style: style, seed: seed, keepsFill: keepsFill, rings: [] };
  }
  function coordinateSeedV3(p) { return p.every(Number.isFinite) ? Brush.hash(Math.floor(p[0] * 1024) >>> 0, Math.floor(p[1] * 1024) >>> 0) : 0; }
  function profileV3(fun) {
    var a = fun(0), b = fun(0.5), c = fun(1), q1 = fun(0.25), q3 = fun(0.75);
    if (Math.min(b, q1, q3) < -0.02) return 'nail';
    if (Math.abs(a - b) < 0.02 && Math.abs(b - c) < 0.02 && Math.abs(q1 - b) < 0.02 && Math.abs(q3 - b) < 0.02) return 'even';
    if (Math.abs(a) < 0.02 && Math.abs(c) < 0.02 && b > 0.5) return 'lens';
    if (a > c + 0.2) return 'brush';
    if (c > a + 0.2) return 'rise';
    return 'nail';
  }
  function cunCenterlineV3(points, seed) {
    if (points.length <= 1) return points;
    var lengths = [0], result = [];
    for (var i = 1; i < points.length; i++) {
      var dx = points[i][0] - points[i - 1][0], dy = points[i][1] - points[i - 1][1];
      lengths.push(lengths[i - 1] + Math.sqrt(dx * dx + dy * dy));
    }
    var total = lengths[lengths.length - 1], length = Math.min(total, 9 + 17 * Brush.random(seed, 70));
    var start = (total - length) * Brush.random(seed, 71), end = start + length;
    for (var j = 1; j < points.length; j++) {
      var a = lengths[j - 1], b = lengths[j];
      if (!(b > a && b >= start && a <= end)) continue;
      function at(d) {
        var t = (d - a) / (b - a);
        return [points[j - 1][0] + (points[j][0] - points[j - 1][0]) * t, points[j - 1][1] + (points[j][1] - points[j - 1][1]) * t];
      }
      if (!result.length) result.push(at(Math.max(start, a)));
      result.push(at(Math.min(end, b)));
    }
    return result;
  }

  /** 只在 @3 安装。原作函数照调, 不加 r(); 旧 poly 是唯一的布局输入。 */
  function installPaintV3(g, canvOf) {
    var context = null, texture = null, water = null;
    var originalPoly = g.poly, originalStroke = g.stroke, originalTexture = g.texture, originalWater = g.water;
    var restores = [];
    function wrap(owner, name, kind) {
      var original = owner[name];
      owner[name] = function () {
        var previous = context;
        context = { kind: kind, outline: null };
        try { return original.apply(this, arguments); } finally { context = previous; }
      };
      restores.push(function () { owner[name] = original; });
    }
    ['mountain', 'flatMount', 'rock'].forEach(function (name) { wrap(g.Mount, name, name); });
    ['tree01', 'tree03'].forEach(function (name) { wrap(g.Tree, name, name); });
    var originalBoat = g.Arch.boat01;
    g.Arch.boat01 = function (x, y, seed, args) {
      var str = originalBoat.apply(this, arguments), canv = canvOf(str), last = canv[canv.length - 1];
      if (last && last.paintV3 && last.paintV3.kind === 'stroke') {
        var path = last.paintV3.path, scale = args && args.sca !== undefined ? args.sca : 1;
        var base = Math.floor(seed * 4294967296) >>> 0, origin = last.p[0];
        for (var k = 0; k < 2; k++) path.rings.push({ relativeCenter: [x - origin[0] + k * 24 * scale, y - origin[1] + (12 + k * 4) * scale],
          radius: (14 + k * 6) * scale, seed: Brush.hash(base, k) });
      }
      return str;
    };
    g.poly = function (points, args) {
      var str = originalPoly(points, args), poly = canvOf(str)[0];
      if (!poly || !poly.p.length) return str;
      var color = parseCss(poly.s), origin = poly.p[0];
      // 这三类原作的主表面恰为 50 个网格点 + 1 个山脚点; foot / 岸沿仍是普通白底。
      if (context && ['mountain', 'flatMount', 'rock'].indexOf(context.kind) >= 0 && poly.f === 'white' && poly.s === 'none') {
        if (points.length === 51) { poly.paintV3 = { kind: 'surface' }; context.outline = 'brush'; }
        else if (context.kind === 'flatMount') context.outline = 'nail';
      }
      if (color && color[3] > 0 && color[0] < 250 && poly.w > 0) {
        var trunk = context && (context.kind === 'tree01' || context.kind === 'tree03') && poly.w === 1.5;
        var style = Brush.style({ width: poly.w * (trunk ? 1.4 : 1), tone: color[3] * (1 - color[0] / 255), dry: 0.4,
          wet: trunk ? 0.25 : 0.2, side: trunk ? 0.75 : 0.6, darkDirection: [1, trunk ? 0.15 : 0.35], profile: trunk ? 'press' : 'nail' });
        var line = poly.p;
        if (trunk && context.kind === 'tree03') {
          line = poly.p.slice(0, 10).map(function (p, i) { var q = poly.p[19 - i]; return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; });
        }
        poly.paintV3 = { kind: 'stroke', path: pathV3(line, origin, style, coordinateSeedV3(origin), true) };
      }
      return str;
    };
    g.stroke = function (points, args) {
      args = args || {};
      // n0 is the original stroke's first random draw. Observe, never advance it ourselves.
      var random = g.Math.random, n0;
      g.Math.random = function () { var value = random(); if (n0 === undefined) n0 = value * 10; return value; };
      var str;
      try { str = originalStroke(points, args); } finally { g.Math.random = random; }
      var tex = texture, index = tex ? tex.call++ : 0, waterIndex = water ? ++water.call : 0;
      var poly = canvOf(str)[0];
      if (!poly) return str; // 空皴仍占原 texture 的序号, 但不取 n0。
      var seed = Math.floor(n0 / 10 * 4294967296) >>> 0;
      var profile = profileV3(args.fun || function (x) { return Math.sin(x * Math.PI); }), dry = 0.42;
      var color = parseCss(args.col === undefined ? 'rgba(200,200,200,0.9)' : args.col);
      if (tex) {
        var sha = tex.sha, shadeCalls = sha !== 0 ? Math.ceil(tex.rows / 2) : 0;
        var j = index < shadeCalls ? index * 2 : sha + (index - shadeCalls) * (1 + sha);
        profile = 'tip'; dry = index < shadeCalls ? 0.8 : 0.6 + 0.2 * (j % 7) / 6;
      } else if (water) { profile = 'brush'; dry = 0.7; color = [100, 100, 100, color[3] * 0.2]; }
      else if (context && context.outline) { profile = context.outline; context.outline = null; }
      var width = args.wid === undefined ? 2 : args.wid, noi = args.noi === undefined ? 0.5 : args.noi;
      var style = Brush.style({ width: Math.max(0.25, width * 1.65), tone: Brush.unit(color[3] * (1 - color[0] / 255)),
        dry: dry, wet: 0.28, side: 0.72, darkDirection: [1, 0.35], rough: noi * 0.32, profile: profile });
      var line = tex ? cunCenterlineV3(points, seed) : points;
      var xof = args.xof === undefined ? 0 : args.xof, yof = args.yof === undefined ? 0 : args.yof;
      poly.paintV3 = water && waterIndex > 3 ? { kind: 'omit' } : { kind: 'stroke', path: pathV3(line.map(function (p) {
        return [p[0] + xof, p[1] + yof];
      }), poly.p[0], style, seed, false) };
      return str;
    };
    g.texture = function (points, args) {
      args = args || {};
      var previous = texture;
      texture = { call: 0, rows: Math.ceil(args.tex === undefined ? 400 : args.tex), sha: args.sha === undefined ? 0 : args.sha };
      try { return originalTexture(points, args); } finally { texture = previous; }
    };
    g.water = function () {
      var previous = water; water = { call: 0 };
      try { return originalWater.apply(this, arguments); } finally { water = previous; }
    };
    return function () {
      g.poly = originalPoly; g.stroke = originalStroke; g.texture = originalTexture; g.water = originalWater;
      g.Arch.boat01 = originalBoat;
      restores.forEach(function (restore) { restore(); });
    };
  }

  function composeV3(req, env) {
    var restore = installPaintV3(env.g, env.canvOf);
    try { return composeShanShuiV2(req, env); } finally { restore(); }
  }

  function floatShapeV3(points, fill, stroke, width, closed) {
    return { points: new Float32Array(points.reduce(function (a, p) { a.push(p[0], p[1]); return a; }, [])),
      fill: fill, stroke: stroke, lineWidth: Math.fround(width), closed: closed };
  }
  function brushShapesV3(stroke, palette) {
    var shapes = [], alpha = Math.fround(stroke.bodyAlphaStart + stroke.bodyAlphaEnd) * 0.5;
    if (stroke.body.length >= 3) shapes.push(floatShapeV3(stroke.body, opacity(palette.ink, alpha), null, 0, true));
    stroke.bristles.forEach(function (hair) { hair.runs.forEach(function (run) {
      if (run.length >= 2) shapes.push(floatShapeV3(run, null, opacity(palette.ink, hair.alpha), hair.width, false));
    }); });
    return shapes;
  }
  function clearsVerseV3(shape, rect, padding) {
    var pts = shape.points, n = pts.length / 2;
    if (!n || !pts.every(Number.isFinite)) return false;
    var xmin = rect.x - padding, xmax = rect.x + rect.width + padding;
    var ymin = rect.y - padding, ymax = rect.y + rect.height + padding;
    function crosses(i, j) {
      var lo = 0, hi = 1;
      for (var axis = 0; axis < 2; axis++) {
        var start = pts[i * 2 + axis], delta = Math.fround(pts[j * 2 + axis] - start);
        var min = axis === 0 ? xmin : ymin, max = axis === 0 ? xmax : ymax;
        if (Math.abs(delta) < 1e-12) { if (start < min || start > max) return false; }
        else {
          var t0 = (min - start) / delta, t1 = (max - start) / delta;
          lo = Math.max(lo, Math.min(t0, t1)); hi = Math.min(hi, Math.max(t0, t1));
          if (lo > hi) return false;
        }
      }
      return true;
    }
    for (var i = 0; i < n - 1; i++) if (crosses(i, i + 1)) return false;
    if ((shape.closed || shape.fill) && crosses(n - 1, 0)) return false;
    if (shape.fill) {
      var x = rect.x + rect.width / 2, y = rect.y + rect.height / 2, inside = false;
      for (var j = 0, previous = n - 1; j < n; previous = j++) {
        var ax = pts[previous * 2], ay = pts[previous * 2 + 1], bx = pts[j * 2], by = pts[j * 2 + 1];
        if ((ay > y) !== (by > y) && x < ax + (bx - ax) * (y - ay) / (by - ay)) inside = !inside;
      }
      if (inside) return false;
    }
    return true;
  }

  /** ShanShuiPaintV3.layersV3: 布局完成后才展开 Brush; 白底是遮挡 / flush 边界。 */
  function layersV3(parts, palette, W, H, verse, appendShapes) {
    var result = [], inkBlend = palette.isDark ? 'normal' : 'multiply', verseBox = scaledRect(verse.rect, W, H);
    function append(shapes, options) {
      var layer = Object.assign({ blend: 'normal', opacity: 1, filter: null, mist: null }, options);
      layer.shapes = shapes.filter(function (shape) { return clearsVerseV3(shape, verseBox, Math.max(4, shape.lineWidth * 5)); });
      if (layer.shapes.length) result.push(layer);
    }
    function nativeShapes(polys, contrast) {
      var shapes = []; appendShapes(polys, shapes, contrast);
      shapes.forEach(function (s) { s.points = new Float32Array(s.points); s.lineWidth = Math.fround(s.lineWidth); s.closed = false; });
      return shapes;
    }
    parts.forEach(function (part, partIndex) {
      if (part.mist) {
        var shapes = nativeShapes(part.canv, 0.4), rd = mistRidge(shapes, 2);
        append(shapes, { mist: { depth: part.mist.depth, blur: part.mist.blur, peakOpacity: part.mist.peak,
          ridge: rd.ridge, ridgeX0: rd.x0, ridgeStep: 2, floorY: part.mist.floorY, floorDepth: part.mist.floorDepth },
          wash: { bleed: 1.2, rim: 0.15, grain: 0.06 } });
        return;
      }
      var whites = [], native = [], strokes = [], styles = [], surfaceIndex = 0;
      function flushWhites() { append(whites); whites = []; }
      function flushPaint() {
        append(native, { blend: inkBlend, tooth: 0.18 });
        var wet = [], dry = [];
        strokes.forEach(function (stroke, i) {
          Array.prototype.push.apply(dry, brushShapesV3(stroke, palette));
          var amount = Brush.unit(styles[i].wet);
          if (amount > 0 && stroke.body.length >= 3) {
            var alpha = Math.fround(stroke.bodyAlphaStart + stroke.bodyAlphaEnd) * 0.5 * amount;
            wet.push(floatShapeV3(stroke.body, opacity(palette.ink, alpha), null, 0, true));
          }
        });
        append(wet, { blend: inkBlend, wash: { bleed: 1.8, rim: 0.3, grain: 0.1 } });
        append(dry, { blend: inkBlend, tooth: 0.24 });
        native = []; strokes = []; styles = [];
      }
      function surface(shapes, index) {
        var rd = mistRidge(shapes, 2), seed = Brush.hash(partIndex, index);
        append(shapes, { blend: inkBlend, rim: { width: 16, power: 2.4, peakOpacity: 0.62, ridge: rd.ridge,
          ridgeX0: rd.x0, ridgeStep: 2, seed: seed }, wash: { bleed: 1.5, rim: 0.28, grain: 0.1 } });
        var moss = [];
        for (var i = 4; i < rd.ridge.length; i += 13) {
          var x = rd.x0 + i * 2, y = rd.ridge[i];
          if (!Number.isFinite(y) || x < 0 || x > W || Brush.random(seed, i) <= 0.58) continue;
          for (var k = 0; k < 3; k++) {
            var s = Brush.hash(seed, i * 3 + k), center = [x + (Brush.random(s, 0) - 0.5) * 8, y + 2 + Brush.random(s, 1) * 4];
            moss.push(floatShapeV3(Brush.blot(center, 0.9 + Brush.random(s, 2), 0.55, -0.3, s), opacity(palette.ink, 0.4), null, 0, true));
          }
        }
        append(moss, { blend: inkBlend, tooth: 0.22 });
      }
      part.canv.forEach(function (poly) {
        var paint = poly.paintV3;
        if (paint && paint.kind === 'omit') return;
        if (paint && paint.kind === 'surface') {
          flushPaint(); whites = whites.concat(nativeShapes([poly], 1)); flushWhites();
          surface(nativeShapes([Object.assign({}, poly, { f: 'rgba(0,0,0,1)' })], 1), surfaceIndex++);
        } else if (paint && paint.kind === 'stroke') {
          var path = paint.path, origin = poly.p[0];
          if (!origin) return;
          if (path.keepsFill) {
            var fill = Object.assign({}, poly, { s: null, w: 0 });
            if (fill.f === 'white') { flushPaint(); whites = whites.concat(nativeShapes([fill], 1)); }
            else native = native.concat(nativeShapes([fill], 1));
          }
          flushWhites();
          var line = path.relative.map(function (p) { return [p[0] + origin[0], p[1] + origin[1], p[2]]; });
          strokes.push(Brush.stroke(line, path.style, path.seed)); styles.push(path.style);
          path.rings.forEach(function (ring) {
            var style = Brush.style({ width: 0.85, tone: 0.16, dry: 0.65, side: 0.3, profile: 'brush' });
            strokes.push(Brush.ring([ring.relativeCenter[0] + origin[0], ring.relativeCenter[1] + origin[1]], ring.radius, 0.22, style, ring.seed)); styles.push(style);
          });
        } else if (poly.f === 'white') { flushPaint(); whites = whites.concat(nativeShapes([poly], 1)); }
        else { flushWhites(); native = native.concat(nativeShapes([poly], 1)); }
      });
      flushWhites(); flushPaint();
    });
    return result;
  }

  // ---------------------------------------------------------------- 垫片

  var hooks = { onFillRect: null };

  function fakeContext(canvas) {
    var ctx = {
      canvas: canvas,
      globalCompositeOperation: 'source-over',
      fillStyle: '',
      strokeStyle: '',
      beginPath: function () {},
      moveTo: function () {},
      lineTo: function () {},
      fill: function () {},
      stroke: function () {},
      fillText: function () {},
      drawImage: function () {},
      fillRect: function (x, y) {
        if (hooks.onFillRect) hooks.onFillRect(this.fillStyle, x, y);
      },
      getImageData: function () {
        return { data: [] };
      },
      putImageData: function () {},
    };
    return ctx;
  }

  function fakeElement() {
    var el = {
      width: 300,
      height: 150,
      style: {},
      innerHTML: '',
      value: '',
      children: [],
      setAttribute: function () {},
      addEventListener: function () {},
      appendChild: function (c) {
        this.children.push(c);
        return c;
      },
      removeChild: function () {},
      scrollTo: function () {},
      toDataURL: function () {
        return '';
      },
    };
    var ctx = fakeContext(el);
    el.getContext = function () {
      return ctx;
    };
    return el;
  }

  /** 原作期待浏览器页面: window / document / btoa。在 Worker / vm 里补上最小替身。 */
  function installShims(g) {
    if (!g.window) g.window = g;
    if (!g.self) g.self = g;
    if (!g.location) g.location = { href: 'http://localhost/' };
    var nativeBtoa = g.btoa;
    // btoa 只收 Latin-1; 超出时原作会抛异常, ZixiaoArt (Swift) 退回 UTF-8 字节 —— 这里同样处理。
    g.btoa = function (s) {
      try {
        return nativeBtoa(s);
      } catch {
        var bytes = new TextEncoder().encode(s);
        var bin = '';
        for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        return nativeBtoa(bin);
      }
    };
    var body = fakeElement();
    g.document = {
      body: body,
      getElementById: function () {
        return fakeElement();
      },
      getElementsByTagName: function () {
        return [body];
      },
      createElement: function () {
        return fakeElement();
      },
      addEventListener: function () {},
    };
    if (!g.console) g.console = { log: function () {}, warn: function () {}, error: function () {} };
    // 原作到处 console.log (种子、参数); 预览里静音。
    g.console = { log: function () {}, warn: g.console.warn, error: g.console.error };
  }

  // ---------------------------------------------------------------- 颜色

  function hexToRgb(hex) {
    var h = String(hex || '').replace('#', '');
    var r = parseInt(h.slice(0, 2), 16) / 255;
    var gg = parseInt(h.slice(2, 4), 16) / 255;
    var b = parseInt(h.slice(4, 6), 16) / 255;
    return [r || 0, gg || 0, b || 0, 1];
  }

  function mixed(c, other, amount) {
    var t = Math.min(Math.max(amount, 0), 1);
    return [c[0] + (other[0] - c[0]) * t, c[1] + (other[1] - c[1]) * t, c[2] + (other[2] - c[2]) * t, c[3]];
  }

  function opacity(c, a) {
    return [c[0], c[1], c[2], c[3] * a];
  }

  function compositedOver(c, base) {
    var a = c[3];
    return [c[0] * a + base[0] * (1 - a), c[1] * a + base[1] * (1 - a), c[2] * a + base[2] * (1 - a), 1];
  }

  function luminance(c) {
    function lin(v) {
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    }
    return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  }

  /**
   * 配方调色: paper / ink 取 style.palette; wash (淡墨, 远山) 缺省 = ink 以 40% 叠在 paper 上
   * (契约规定; Swift 的 Palette 缺省是 22%, 配方侧由 ZXArt.Procedural 传 40%)。
   */
  function makePalette(p) {
    var paper = hexToRgb(p.paper);
    var ink = hexToRgb(p.ink);
    var washAlpha = typeof p.washAlpha === 'number' ? p.washAlpha : 0.4;
    var wash = compositedOver(opacity(ink, washAlpha), paper);
    return { paper: paper, ink: ink, wash: wash, isDark: luminance(paper) < luminance(ink),
      ...(p.accent ? { accent:hexToRgb(p.accent) } : {}),
      ...(p.secondary ? { secondary:hexToRgb(p.secondary) } : {}) };
  }

  /** CSS 颜色串 → [r,g,b,a] (0…255, a 0…1); "none" / 不认识 → null。 */
  function parseCss(s) {
    if (s === undefined || s === null) return null;
    var str = String(s).trim();
    if (str === 'none' || str === '') return null;
    if (str === 'white') return [255, 255, 255, 1];
    if (str === 'black') return [0, 0, 0, 1];
    var m = /^rgba?\(\s*([-\d.eE+]+)\s*,\s*([-\d.eE+]+)\s*,\s*([-\d.eE+]+)\s*(?:,\s*([-\d.eE+]+)\s*)?\)$/.exec(str);
    if (!m) return null;
    return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]];
  }

  // ---------------------------------------------------------------- 迹 (跨平台对拍)

  /** ZXArt.Trace: 生成器原始输出的多边形数 / 点数 / 坐标和 (只计有限点)。 */
  function newTrace() {
    return { polys: 0, points: 0, sumX: 0, sumY: 0, prngAfter: 0, transform: [] };
  }
  function traceAdd(t, pts) {
    t.polys += 1;
    for (var i = 0; i < pts.length; i++) {
      var x = +pts[i][0];
      var y = +pts[i][1];
      if (isFinite(x) && isFinite(y)) {
        t.points += 1;
        t.sumX += x;
        t.sumY += y;
      }
    }
  }

  // ---------------------------------------------------------------- 山水 (shan-shui-inf)

  var SHANSHUI_VARIANTS = { 高山: 'alpine', 江岸: 'riverbank', 远山: 'distant' };

  /** SSColor.ink(alpha): "rgba(100,100,100," + alpha.toFixed(3) + ")" */
  function inkCss(alpha) {
    return 'rgba(100,100,100,' + alpha.toFixed(3) + ')';
  }

  /** LayerMist.ridge(of:step:) —— 每列最高点 (Float32 顶点, 同 Swift)。 */
  function mistRidge(shapes, step) {
    var f = Math.fround;
    var minX = Infinity,
      maxX = -Infinity;
    shapes.forEach(function (sh) {
      for (var i = 0; i < sh.points.length; i += 2) {
        var x = f(sh.points[i]);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    });
    if (!isFinite(minX) || !(step > 0)) return { ridge: [], x0: 0 };
    var x0 = Math.floor(minX / step) * step;
    var n = Math.ceil((maxX - x0) / step) + 1;
    var r = new Float32Array(n).fill(Infinity);
    shapes.forEach(function (sh) {
      var pts = sh.points;
      var m = pts.length / 2;
      if (m < 2) return;
      for (var k = 0; k < m; k++) {
        var k1 = (k + 1) % m;
        var ax = f(pts[k * 2]),
          ay = f(pts[k * 2 + 1]),
          bx = f(pts[k1 * 2]),
          by = f(pts[k1 * 2 + 1]);
        var lo = Math.min(ax, bx),
          hi = Math.max(ax, bx);
        var i = Math.ceil((lo - x0) / step);
        var i1 = Math.floor((hi - x0) / step);
        while (i <= i1) {
          var x = f(x0 + i * step);
          var t = hi > lo ? f(f(x - ax) / f(bx - ax)) : 0;
          var y = hi > lo ? f(ay + f(f(by - ay) * t)) : Math.min(ay, by);
          if (i >= 0 && i < n && y < r[i]) r[i] = y;
          i += 1;
        }
      }
    });
    return { ridge: r, x0: x0 };
  }

  // ---------------------------------------------------------------- @2: 诗句框 (ZXArtVerse.swift)

  var VERSE_SIDES = ['left', 'right', 'top'];

  /**
   * ZXArt.verseLayout —— @2 的诗句框 (单位坐标, 左上为原点), 逐行对照 Swift。
   * frame: 'portrait' | 'wide' | 'square'; aspect = 宽 / 高; quietTop 已夹到 0…0.5。
   */
  function verseLayout(side, frame, aspect, quietTop, columns, chars) {
    var n = Math.min(Math.max(typeof columns === 'number' ? columns : 2, 1), 4);
    var c = Math.min(Math.max(typeof chars === 'number' ? chars : 7, 4), 10);
    var a = Math.max(aspect, 0.01);
    var colW = n + (n - 1) * 0.62 + 1.6;
    var colH = (c - 1) * 1.18 + 1.44;
    var rowH = n * 1.82 + 1.43;
    var rowW = c * 1.14;
    function clamp(v, lo, hi) {
      return Math.min(Math.max(v, lo), hi);
    }
    var r, fs, pad, w, h, top;
    var vertical = side !== 'top';
    if (frame === 'portrait' && vertical) {
      pad = 0.02;
      fs = Math.min(0.075, 0.4 / colW);
      w = clamp(fs * colW + 2 * pad, 0.26, 0.44);
      top = quietTop + 0.02;
      h = clamp((fs * colH + 2 * pad) * a, 0.12, 0.8 - top);
      r = { x: side === 'right' ? 0.95 - w : 0.05, y: top, width: w, height: h };
    } else if (frame === 'portrait') {
      fs = Math.min(0.075, 0.84 / rowW);
      top = quietTop + 0.01;
      h = clamp((fs * rowH + 0.04) * a, 0.08, 0.3);
      r = { x: 0.06, y: top, width: 0.88, height: h };
    } else if (frame === 'square' && vertical) {
      pad = 0.03;
      fs = Math.min(0.08, 0.4 / colW);
      w = clamp(fs * colW + 2 * pad, 0.3, 0.46);
      h = clamp((0.08 * colH + 2 * pad) * a, 0.3, 0.88);
      r = { x: side === 'right' ? 0.95 - w : 0.05, y: 0.06, width: w, height: h };
    } else if (frame === 'square') {
      fs = Math.min(0.075, 0.84 / rowW);
      h = clamp((fs * rowH + 0.06) * a, 0.2, 0.46);
      r = { x: 0.06, y: 0.06, width: 0.88, height: h };
    } else if (vertical) {
      fs = Math.min(0.13, 0.84 / colH);
      w = clamp((fs * colW + 0.12) / a, 0.3, 0.46);
      r = { x: side === 'right' ? 0.96 - w : 0.04, y: 0.06, width: w, height: 0.88 };
    } else {
      fs = Math.min(0.13, 0.84 / rowH);
      w = clamp((fs * rowW + 0.12) / a, 0.34, 0.46);
      r = { x: 0.04, y: 0.06, width: w, height: 0.88 };
    }
    return { side: side, vertical: vertical, rect: r };
  }

  /** 版式 (ZXArt.Frame): 高/宽 ≥ 1.3 竖幅, 宽/高 > 1.3 横幅, 其余方幅。 */
  function frameOf(width, height) {
    var w = Math.max(width, 1);
    var h = Math.max(height, 1);
    return h / w >= 1.3 ? 'portrait' : w / h > 1.3 ? 'wide' : 'square';
  }

  function scaledRect(r, W, H) {
    return { x: r.x * W, y: r.y * H, width: r.width * W, height: r.height * H };
  }

  /** Drawing.setVerse: quietRect = 竖幅: 时钟区; 方幅 / 横幅: 诗句框。 */
  function verseQuietRect(verse, W, H, quietTop) {
    return H >= W * 1.3
      ? { x: 0, y: 0, width: W, height: Math.min(Math.max(quietTop, 0), 0.5) * H }
      : scaledRect(verse.rect, W, H);
  }

  /**
   * shanshui@2 构图 —— ShanShuiSceneV2.swift `composeV2` 逐行对照 (随机数消耗顺序相同)。
   * env: generateShanShui 里的工具 (原作函数的记录器 canvOf、shifted / top / bottom / placed / flatMountNoDec)。
   */
  function composeShanShuiV2(req, env) {
    var g = env.g;
    var W = env.W;
    var H = env.H;
    var canvOf = env.canvOf;
    var shifted = env.shifted;
    var placed = env.placed;
    var r = function () {
      return Math.random();
    };
    var PI = Math.PI;
    var verse = req.verse;
    var d = Math.min(Math.max(req.density, 0), 1);
    var q = Math.min(Math.max(req.quietTop, 0), 0.5) * H;
    var wide = W > H * 1.3;
    var portrait = H >= W * 1.3;
    var texScale = 0.7 + 0.6 * d;
    var vx0 = verse.rect.x * W;
    var vx1 = (verse.rect.x + verse.rect.width) * W;
    var vy1 = (verse.rect.y + verse.rect.height) * H;
    var gap = 0.03 * Math.min(W, H);
    var s = verse.side === 'right' ? -1 : verse.side === 'left' ? 1 : wide ? 1 : 0;
    var topY = s === 0 ? vy1 + gap : portrait ? q : 0.04 * H;
    var R = H - topY;
    var ax0 = s > 0 ? vx1 + gap : 0;
    var ax1 = s < 0 ? vx0 - gap : W;
    var aw = ax1 - ax0;
    var ey1 = s === 0 ? topY : vy1 + gap;
    var ex0 = vx0 - gap;
    var ex1 = vx1 + gap;
    var roomBelow = s === 0 || ey1 < H - 0.15 * R;

    function blocked(x, y) {
      if (!(y < ey1)) return false;
      if (s < 0) return x > ex0;
      if (s > 0) return x < ex1;
      return x > ex0 && x < ex1;
    }
    function fy(f) {
      return topY + f * R;
    }
    function span(y0) {
      return s !== 0 && y0 < ey1 ? [ax0, ax1] : [0, W];
    }
    function fit(canv) {
      if (s === 0) return canv;
      var over = 0;
      canv.forEach(function (p) {
        p.p.forEach(function (v) {
          if (isFinite(v[0]) && isFinite(v[1]) && v[1] < ey1) {
            over = s < 0 ? Math.max(over, v[0] - ex0) : Math.max(over, ex1 - v[0]);
          }
        });
      });
      if (!(over > 0)) return canv;
      return shifted(canv, s < 0 ? -over : over, 0);
    }
    function part(canv, mist) {
      return { canv: canv, mist: mist || null };
    }
    function mountain(x, y, seed, args) {
      return canvOf(g.Mount.mountain(x, y, seed, args));
    }
    var parts = [];

    function distant(y, hei, peak) {
      if (peak === undefined) peak = 0.9;
      var sp = span(y - hei);
      var sa = sp[0];
      var sb = sp[1];
      var xa = sa > 0 ? sa : -0.1 * W;
      var xb = sb < W ? sb : 1.1 * W;
      var len = Math.max(Math.floor((xb - xa) / 50) * 50, 100);
      var start = sa > 0 ? xb - len : xa;
      var c = canvOf(g.Mount.distMount(start, y, r() * 100, { hei: hei, len: len }));
      if (sa > 0 || sb < W) {
        var lt = Math.min(0.4 * len, 140);
        var end = sa > 0 ? start : start + len;
        c = c.map(function (poly) {
          return {
            p: poly.p.map(function (v) {
              var t = Math.min(Math.max(Math.abs(v[0] - end) / lt, 0), 1);
              var f = t * t * (3 - 2 * t);
              return [v[0], y + (v[1] - y) * f];
            }),
            f: poly.f,
            s: poly.s,
            w: poly.w,
            wash: poly.wash,
          };
        });
      }
      return part(c, { depth: hei * 1.1, blur: 1.2, peak: peak, floorY: y + 8, floorDepth: hei * 0.55 });
    }
    function waterLines(y0, y1, count) {
      var c = [];
      for (var k = 0; k < count; k++) {
        var t = count === 1 ? 0.5 : k / (count - 1);
        var y = y0 + (y1 - y0) * t + (r() - 0.5) * 10;
        var sp = span(y - 25);
        var w = sp[1] - sp[0];
        var x = sp[0] + w * (0.35 + 0.3 * r());
        c = c.concat(canvOf(g.water(x, y, k * 2, { hei: 2, len: w * (0.3 + 0.2 * r()), clu: 3 + Math.floor(3 * d) })));
      }
      return c;
    }
    function boat(y, sca) {
      var sp = span(y - 30);
      var x = sp[0] + (sp[1] - sp[0]) * (0.25 + 0.5 * r());
      return canvOf(g.Arch.boat01(x, y, r(), { sca: sca, fli: g.randChoice([true, false]) }));
    }
    /** 近岸 (同 @1)。 */
    function bank(cx, y, wid, inward) {
      var c = canvOf(
        env.flatMountNoDec(cx, y, 2 * r() * PI, { hei: 90, wid: wid, tex: 70 * texScale, cho: 0.5 + r() * 0.2 }),
      );
      var t = env.top(c);
      if (t === null) return c;
      var ground = t + 14;
      var species = r() < 0.5 ? 1 : 3;
      var count = 2 + Math.floor(r() * (1 + 2 * d));
      var tx0 = cx + inward * wid * (0.06 + 0.06 * r());
      for (var k = 0; k < count; k++) {
        var tx = tx0 + inward * k * (9 + 7 * r());
        var ht = (species === 1 ? 55 : 70) * (0.75 + 0.5 * r());
        if (species === 1) {
          c = c.concat(canvOf(g.Tree.tree01(tx, ground + 4 * r(), { hei: ht, wid: 2 + 2 * r(), col: inkCss(0.45 + 0.15 * r()) })));
        } else {
          var bc = r() * 0.08;
          c = c.concat(
            canvOf(
              g.Tree.tree03(tx, ground + 4 * r(), {
                hei: ht,
                ben: (function (bcv) {
                  return function (x) {
                    return Math.pow(x * bcv, 1);
                  };
                })(bc),
                col: inkCss(0.35 + 0.1 * r()),
              }),
            ),
          );
        }
      }
      var rocks = 1 + (r() < 0.4 ? 1 : 0);
      for (k = 0; k < rocks; k++) {
        var rx = cx + inward * wid * (0.26 + 0.08 * k + 0.05 * r());
        c = c.concat(canvOf(g.Mount.rock(rx, ground + 6, r() * 100, { hei: 10 + 8 * r(), wid: 14 + 10 * r(), sha: 2 })));
      }
      return c;
    }

    var m = s !== 0 ? s : r() < 0.5 ? -1 : 1;
    var bw = s !== 0 ? aw : W;
    function mx(f) {
      return m < 0 ? f * bw : W - f * bw;
    }
    function ox(f) {
      if (roomBelow) return m < 0 ? W - f * W : f * W;
      return m < 0 ? ax1 - f * aw : ax0 + f * aw;
    }

    var variant = SHANSHUI_VARIANTS[req.variant];
    if (!variant) throw new Error('unknown shanshui variant ' + req.variant);
    var k, hei, wid, bx, b;
    if (variant === 'alpine') {
      parts.push(distant(fy(0.2), 60));
      var backCount = d < 0.25 ? 0 : d < 0.7 ? 1 : 2;
      var backs = [];
      var lowFirst = s !== 0 && roomBelow;
      for (k = 0; k < backCount; k++) {
        if ((k === 0) !== lowFirst) {
          bx = mx(0.12 + 0.08 * r());
          hei = (0.5 + 0.15 * r()) * R;
          wid = (0.6 + 0.2 * r()) * bw;
          b = mountain(bx, fy(0.6), r() * 100, { hei: hei, wid: wid, tex: 150 * texScale });
          backs = backs.concat(fit(placed(b, fy(0.12 + 0.08 * r()))));
        } else {
          bx = ox(0.2 + 0.08 * r());
          b = mountain(bx, fy(0.75), r() * 100, { hei: 0.3 * R, wid: 0.55 * bw, tex: 120 * texScale });
          backs = backs.concat(fit(placed(b, Math.max(fy(0.3 + 0.08 * r()), roomBelow ? ey1 + 0.02 * R : 0))));
        }
      }
      parts.push(part(backs));
      var cx = mx(0.45 + 0.1 * r());
      hei = (0.9 + 0.2 * r()) * R;
      wid = (0.95 + 0.25 * r()) * bw;
      var m0 = mountain(cx, fy(0.75), r() * 100, { hei: hei, wid: wid, tex: 220 * texScale });
      var main = fit(placed(m0, fy(0.03 + 0.05 * r())));
      var mb = env.bottom(main);
      var base = Math.min(mb === null ? fy(0.8) : mb, H - 0.12 * R);
      parts.push(part(waterLines(base - 0.02 * R, H - 0.03 * R, 2 + Math.floor(3 * d))));
      parts.push(part(main));
      if (d > 0.2) parts.push(part(boat(fy(0.9 + 0.06 * r()), 0.6)));
    } else if (variant === 'riverbank') {
      parts.push(distant(fy(0.16), 55));
      hei = (0.55 + 0.15 * r()) * R;
      var m1 = mountain(mx(0.3), fy(0.45), r() * 100, { hei: hei, wid: s !== 0 ? 1.2 * aw : 0.8 * W, tex: 160 * texScale });
      parts.push(part(fit(placed(m1, fy(0.1 + 0.08 * r())))));
      if (d > 0.45) {
        var m2 = mountain(ox(0.08), fy(0.5), r() * 100, { hei: 0.35 * R, wid: 0.55 * bw, tex: 100 * texScale, veg: true });
        parts.push(part(fit(placed(m2, Math.max(fy(0.3 + 0.06 * r()), roomBelow ? ey1 + 0.02 * R : 0)))));
      }
      parts.push(part(waterLines(fy(0.55), fy(0.74), 2 + Math.floor(2 * d))));
      if (d > 0.2) parts.push(part(boat(fy(0.64), 0.55)));
      var bwid = (0.75 + 0.15 * r()) * bw;
      if (roomBelow) parts.push(part(bank(m < 0 ? W : 0, fy(0.95), bwid, m)));
      else parts.push(part(bank(m < 0 ? 0 : W, fy(0.95), bwid, -m)));
    } else {
      var rows = d < 0.4 ? 2 : 3;
      var below = s !== 0 && H - ey1 > 0.3 * R;
      var waterTop = fy(0.62);
      var lastY = 0;
      for (k = 0; k < rows; k++) {
        if (below && k > 0) {
          hei = (80 + 35 * k) * 0.7;
          var y = Math.max(k === 1 ? 0 : lastY + 0.06 * R, ey1 + hei + 0.01 * R);
          lastY = y;
          parts.push(distant(y, hei, 0.5 + 0.22 * k));
          waterTop = Math.max(waterTop, y + 0.04 * R);
        } else {
          parts.push(distant(fy(0.14 + 0.13 * k), 80 + 35 * k, 0.5 + 0.22 * k));
        }
      }
      parts.push(part(waterLines(waterTop, Math.max(fy(0.92), waterTop + 0.05 * R), 2 + Math.floor(2 * d))));
      if (d > 0.15) parts.push(part(boat(Math.max(fy(0.72 + 0.1 * r()), waterTop + 0.03 * R), 0.5)));
      if (d > 0.5) parts.push(part(bank(m < 0 ? 0 : W, fy(0.97), 0.7 * bw, -m)));
    }

    // 兜底: 仍有点落在禁区里的笔画整笔去掉。
    return parts.map(function (pt) {
      return {
        canv: pt.canv.filter(function (poly) {
          return !poly.p.some(function (v) {
            return isFinite(v[0]) && isFinite(v[1]) && blocked(v[0], v[1]);
          });
        }),
        mist: pt.mist,
      };
    });
  }

  function generateShanShui(req, palette) {
    var g = root;
    var W, H;
    var aspect = req.width > 0 && req.height > 0 ? req.height / req.width : 2;
    var SHORT = 420; // ZXArt.ShanShui.logicalShortSide
    if (aspect >= 1) {
      W = SHORT;
      H = SHORT * aspect;
    } else {
      H = SHORT;
      W = SHORT / aspect;
    }

    // 记录器: poly() 返回一个记号, 最终字符串里记号的先后 = 原作的绘制先后 (同对拍 harness)。
    var polys = [];
    var washDepth = 0;
    g.poly = function (plist, args) {
      args = args != undefined ? args : {};
      var xof = args.xof != undefined ? args.xof : 0;
      var yof = args.yof != undefined ? args.yof : 0;
      var fil = args.fil != undefined ? args.fil : 'rgba(0,0,0,0)';
      var str = args.str != undefined ? args.str : fil;
      var wid = args.wid != undefined ? args.wid : 0;
      var id = polys.length;
      polys.push({
        p: plist.map(function (v) {
          return [v[0] + xof, v[1] + yof];
        }),
        f: fil,
        s: str,
        w: wid,
        wash: washDepth > 0,
      });
      return '\u0001' + id + '\u0002';
    };
    // 远山的灰走淡墨映射 (Swift: SSPoly.wash)。
    var origDist = g.Mount.distMount;
    g.Mount.distMount = function () {
      washDepth += 1;
      try {
        return origDist.apply(this, arguments);
      } finally {
        washDepth -= 1;
      }
    };
    // 不画电塔 (原作彩蛋); 照常调用以保持随机数消耗 (Swift: drawTowers = false)。
    var origTower = g.Arch.transmissionTower01;
    g.Arch.transmissionTower01 = function () {
      origTower.apply(this, arguments);
      return '';
    };
    // flatMount(dec: false): 不调原作的 flatDec (不取它的随机数)。
    var origFlatDec = g.Mount.flatDec;
    function flatMountNoDec(x, y, seed, args) {
      g.Mount.flatDec = function () {
        return '';
      };
      try {
        return g.Mount.flatMount(x, y, seed, args);
      } finally {
        g.Mount.flatDec = origFlatDec;
      }
    }

    function canvOf(str) {
      if (typeof str !== 'string') return [];
      var out = [];
      var re = /\u0001(\d+)\u0002/g;
      var m;
      while ((m = re.exec(str))) out.push(polys[+m[1]]);
      return out;
    }
    function shifted(canv, dx, dy) {
      return canv.map(function (q) {
        return {
          p: q.p.map(function (v) {
            return [v[0] + dx, v[1] + dy];
          }),
          f: q.f,
          s: q.s,
          w: q.w,
          wash: q.wash,
          paintV3: q.paintV3,
        };
      });
    }
    function top(canv) {
      var t = Infinity;
      canv.forEach(function (q) {
        q.p.forEach(function (v) {
          if (isFinite(v[1]) && v[1] < t) t = v[1];
        });
      });
      return isFinite(t) ? t : null;
    }
    function bottom(canv) {
      var b = -Infinity;
      canv.forEach(function (q) {
        q.p.forEach(function (v) {
          if (isFinite(v[1]) && v[1] > b) b = v[1];
        });
      });
      return isFinite(b) ? b : null;
    }
    function placed(canv, topY) {
      var t = top(canv);
      return t === null ? canv : shifted(canv, 0, topY - t);
    }

    // @2 (shanshui@2): 给诗留一块诗句框的构图 (composeV2); @1 的构图原样 (下方 else 分支)。
    var parts;
    if (req.verse) {
      parts = (req.v3 ? composeV3 : composeShanShuiV2)(req, { g: g, W: W, H: H, canvOf: canvOf, shifted: shifted, top: top, bottom: bottom,
        placed: placed, flatMountNoDec: flatMountNoDec });
    } else {
      // ---- compose @1 (ShanShuiScene.swift `compose`, zixiao-kit 60efe4b) ----
      var r = function () {
        return Math.random();
      };
      var PI = Math.PI;
      var d = Math.min(Math.max(req.density, 0), 1);
      var q = Math.min(Math.max(req.quietTop, 0), 0.5) * H;
      var wide = W > H * 1.3;
      var fr = wide ? { x0: 0.42 * W, x1: W, top: q, bottom: H } : { x0: 0, x1: W, top: q, bottom: H };
      var frW = fr.x1 - fr.x0;
      var R = fr.bottom - fr.top;
      function fx(f) {
        return fr.x0 + f * frW;
      }
      function fy(f) {
        return fr.top + f * R;
      }
      var texScale = 0.7 + 0.6 * d;
      parts = [];

      function part(canv, mist) {
        return { canv: canv, mist: mist || null };
      }
      function mountain(x, y, seed, args) {
        return canvOf(g.Mount.mountain(x, y, seed, args));
      }
      /** 远山: 一条横贯画框的远山, 渲染时雾化。 */
      function distant(y, hei, xa, xb, peak) {
        if (peak === undefined) peak = 0.9;
        var len = Math.ceil((xb - xa + 300) / 50) * 50;
        var c = canvOf(g.Mount.distMount(xa - 150 + (r() - 0.5) * 60, y, r() * 100, { hei: hei, len: len }));
        return part(c, { depth: hei * 1.1, blur: 1.2, peak: peak, floorY: y + 8, floorDepth: hei * 0.55 });
      }
      function waterLines(y0, y1, count, xa, xb) {
        var c = [];
        var span = xb - xa;
        for (var k = 0; k < count; k++) {
          var t = count === 1 ? 0.5 : k / (count - 1);
          var y = y0 + (y1 - y0) * t + (r() - 0.5) * 10;
          var x = xa + span * (0.2 + 0.6 * r());
          c = c.concat(canvOf(g.water(x, y, k * 2, { hei: 2, len: span * (0.4 + 0.3 * r()), clu: 3 + Math.floor(3 * d) })));
        }
        return c;
      }
      function boat(x, y, sca) {
        return canvOf(g.Arch.boat01(x, y, r(), { sca: sca, fli: g.randChoice([true, false]) }));
      }
      /** 近岸: 平岸 (不带 flatDec) + 一丛同种的树 (2–4 棵) + 一两块石。 */
      function bank(cx, y, wid, inward) {
        var c = canvOf(
          flatMountNoDec(cx, y, 2 * r() * PI, { hei: 90, wid: wid, tex: 70 * texScale, cho: 0.5 + r() * 0.2 }),
        );
        var t = top(c);
        if (t === null) return c;
        var ground = t + 14;
        var species = r() < 0.5 ? 1 : 3;
        var count = 2 + Math.floor(r() * (1 + 2 * d));
        var tx0 = cx + inward * wid * (0.06 + 0.06 * r());
        for (var k = 0; k < count; k++) {
          var tx = tx0 + inward * k * (9 + 7 * r());
          var ht = (species === 1 ? 55 : 70) * (0.75 + 0.5 * r());
          if (species === 1) {
            c = c.concat(canvOf(g.Tree.tree01(tx, ground + 4 * r(), { hei: ht, wid: 2 + 2 * r(), col: inkCss(0.45 + 0.15 * r()) })));
          } else {
            var bc = r() * 0.08;
            c = c.concat(
              canvOf(
                g.Tree.tree03(tx, ground + 4 * r(), {
                  hei: ht,
                  ben: (function (bcv) {
                    return function (x) {
                      return Math.pow(x * bcv, 1);
                    };
                  })(bc),
                  col: inkCss(0.35 + 0.1 * r()),
                }),
              ),
            );
          }
        }
        var rocks = 1 + (r() < 0.4 ? 1 : 0);
        for (k = 0; k < rocks; k++) {
          var rx = cx + inward * wid * (0.26 + 0.08 * k + 0.05 * r());
          c = c.concat(canvOf(g.Mount.rock(rx, ground + 6, r() * 100, { hei: 10 + 8 * r(), wid: 14 + 10 * r(), sha: 2 })));
        }
        return c;
      }

      var variant = SHANSHUI_VARIANTS[req.variant];
      if (!variant) throw new Error('unknown shanshui variant ' + req.variant);
      var side, k;
      if (variant === 'alpine') {
        parts.push(distant(fy(0.22), 70, wide ? 0.45 * W : 0, W));
        side = wide ? 1 : r() < 0.5 ? -1 : 1;
        var backCount = d < 0.25 ? 0 : d < 0.7 ? 1 : 2;
        var backs = [];
        for (k = 0; k < backCount; k++) {
          var sgn = k === 0 ? side : -side;
          var bx = wide ? fx(0.5 + sgn * (0.28 + 0.08 * r())) : fx(0.5 + sgn * (0.3 + 0.1 * r()));
          var m = mountain(bx, fy(0.6), r() * 100, {
            hei: (0.55 + 0.15 * r()) * R,
            wid: (0.7 + 0.2 * r()) * (wide ? 0.8 * frW : frW),
            tex: 150 * texScale,
          });
          backs = backs.concat(placed(m, fy(0.14 + 0.08 * r())));
        }
        parts.push(part(backs));
        var mx = wide ? fx(0.55 + 0.08 * r()) : fx(0.5 - side * (0.05 + 0.08 * r()));
        var mainM = mountain(mx, fy(0.75), r() * 100, {
          hei: (0.95 + 0.2 * r()) * R,
          wid: (1.0 + 0.25 * r()) * (wide ? 0.75 * frW : frW),
          tex: 220 * texScale,
        });
        var main = placed(mainM, fy(0.04 + 0.05 * r()));
        var mb = bottom(main);
        var base = Math.min(mb === null ? fy(0.8) : mb, H - 0.12 * R);
        parts.push(part(waterLines(base - 0.02 * R, H - 0.03 * R, 2 + Math.floor(3 * d), fr.x0, fr.x1)));
        parts.push(part(main));
        if (d > 0.2) {
          var by = fy(0.9 + 0.06 * r());
          parts.push(part(boat(fx(0.12 + 0.6 * r()), by, 0.6)));
        }
      } else if (variant === 'riverbank') {
        parts.push(distant(fy(0.16), 60, wide ? 0.45 * W : 0, W));
        side = wide ? 1 : r() < 0.5 ? -1 : 1;
        var m1 = mountain(fx(0.5 + side * 0.34), fy(0.45), r() * 100, {
          hei: (0.55 + 0.15 * r()) * R,
          wid: 0.8 * frW,
          tex: 160 * texScale,
        });
        parts.push(part(placed(m1, fy(0.1 + 0.08 * r()))));
        if (d > 0.45) {
          var m2 = mountain(fx(0.5 - side * 0.42), fy(0.5), r() * 100, {
            hei: 0.35 * R,
            wid: 0.55 * frW,
            tex: 100 * texScale,
            veg: true,
          });
          parts.push(part(placed(m2, fy(0.3 + 0.06 * r()))));
        }
        parts.push(part(waterLines(fy(0.55), fy(0.74), 2 + Math.floor(2 * d), fr.x0, fr.x1)));
        if (d > 0.2) parts.push(part(boat(fx(0.5 - side * (0.05 + 0.2 * r())), fy(0.64), 0.55)));
        var bw = (0.75 + 0.15 * r()) * frW;
        parts.push(part(bank(fx(0.5 - side * 0.5), fy(0.95), bw, side)));
      } else {
        var rows = d < 0.4 ? 2 : 3;
        for (k = 0; k < rows; k++) {
          parts.push(distant(fy(0.14 + 0.13 * k), 80 + 35 * k, wide ? 0.4 * W : 0, W, 0.5 + 0.22 * k));
        }
        parts.push(part(waterLines(fy(0.62), fy(0.92), 2 + Math.floor(2 * d), fr.x0, fr.x1)));
        if (d > 0.15) {
          var bxx = fx(0.15 + 0.6 * r());
          parts.push(part(boat(bxx, fy(0.72 + 0.1 * r()), 0.5)));
        }
        if (d > 0.5) {
          side = wide ? 1 : r() < 0.5 ? -1 : 1;
          parts.push(part(bank(fx(0.5 + side * 0.5), fy(0.97), 0.7 * frW, -side)));
        }
      }

    }

    var trace = newTrace();
    trace.prngAfter = g.Prng.s;
    parts.forEach(function (pt) {
      pt.canv.forEach(function (p) {
        traceAdd(trace, p.p);
      });
    });

    // 纸纹: 原作最后一个 <script> (13-paper.js), 在构图之后跑 (同 Swift: compose 之后 backgroundPaper)。
    var paper = null;
    if (req.paperTexture !== false && typeof req.loadPaperScript === 'function') {
      var shade = new Uint8Array(512 * 512);
      hooks.onFillRect = function (style, x, y) {
        var c = parseCss(style);
        if (!c || x < 0 || x >= 512 || y < 0 || y >= 512) return;
        // fillStyle = rgb(c.toFixed(0), …) → 纹素 = 往墨色偏 255 - c。
        shade[y * 512 + x] = Math.min(Math.max(255 - c[0], 0), 255);
      };
      try {
        req.loadPaperScript();
      } finally {
        hooks.onFillRect = null;
      }
      paper = { shade: shade, texel: 1, strength: 1, tint: palette.ink };
    }

    // SSPoly → Shape: 灰阶映射到调色板, 透明填充 / 零线宽丢掉。washContrast: 远山灰围绕 227 压缩。
    function appendShapes(canv, into, washContrast) {
      function map(c, wash) {
        if (!c || !(c[3] > 0)) return null;
        var gray = (c[0] + c[1] + c[2]) / 3;
        if (wash) gray = 227 + (gray - 227) * washContrast;
        var a = Math.min(c[3], 1);
        return wash
          ? opacity(mixed(palette.wash, palette.paper, (gray - 200) / 55), a)
          : opacity(mixed(palette.ink, palette.paper, gray / 255), a);
      }
      canv.forEach(function (p) {
        if (p.p.length < 2) return;
        var fill = map(parseCss(p.f), p.wash);
        var stroke = p.w > 0 ? map(parseCss(p.s), p.wash) : null;
        if (!fill && !stroke) return;
        var pts = new Float64Array(p.p.length * 2);
        for (var i = 0; i < p.p.length; i++) {
          var x = +p.p[i][0];
          var y = +p.p[i][1];
          if (!isFinite(x) || !isFinite(y)) return;
          pts[i * 2] = x;
          pts[i * 2 + 1] = y;
        }
        into.push({ points: pts, fill: fill, stroke: stroke, lineWidth: +p.w });
      });
    }
    // 构图各部分 → 图层: 远山各成一个雾化层, 其余按先后并进普通层 (ShanShui.layers)。
    var layers = [];
    var current = [];
    if (!req.v3) parts.forEach(function (pt) {
      if (pt.mist) {
        if (current.length) {
          layers.push({ blend: 'normal', opacity: 1, filter: null, mist: null, shapes: current });
          current = [];
        }
        var shapes = [];
        appendShapes(pt.canv, shapes, 0.4);
        var rd = mistRidge(shapes, 2);
        layers.push({
          blend: 'normal',
          opacity: 1,
          filter: null,
          mist: {
            depth: pt.mist.depth,
            blur: pt.mist.blur,
            peakOpacity: pt.mist.peak,
            ridge: rd.ridge,
            ridgeX0: rd.x0,
            ridgeStep: 2,
            floorY: pt.mist.floorY,
            floorDepth: pt.mist.floorDepth,
          },
          shapes: shapes,
        });
      } else {
        appendShapes(pt.canv, current, 1);
      }
    });
    if (current.length) layers.push({ blend: 'normal', opacity: 1, filter: null, mist: null, shapes: current });

    if (req.v3) layers = layersV3(parts, palette, W, H, req.verse, appendShapes);

    return {
      width: W,
      height: H,
      background: palette.paper,
      paper: paper,
      layers: layers,
      quietRect: req.verse
        ? verseQuietRect(req.verse, W, H, req.quietTop)
        : W > H * 1.3
          ? { x: 0, y: 0, width: 0.42 * W, height: H }
          : { x: 0, y: 0, width: W, height: req.quietTop * H },
      verse: req.verse || null,
      verseRect: req.verse ? scaledRect(req.verse.rect, W, H) : null,
      trace: trace,
    };
  }

  // ---------------------------------------------------------------- 花 (nonflowers)

  var FLOWER_SEASONS = { 自然: 'none', 梅: 'plum', 荷: 'lotus', 菊: 'chrysanthemum', 兰: 'orchid' };

  /**
   * 季节预设 —— FlowersScene.swift `applySeason` 逐行对照 (随机数消耗顺序相同)。
   * state: { woody, childBranchColor, form: 'original' | 'lotus' | 'chrysanthemum', petalSeg }
   */
  function applySeason(season, P, state, density) {
    var g = root;
    var PI = Math.PI;
    var u = function () {
      return Math.random();
    };
    function range(a, b) {
      return a + (b - a) * u();
    }
    // density 0…1 (0.5 = 常态) → 数量倍率 0.6…1.4
    var dk = 0.6 + 0.8 * Math.min(Math.max(density, 0), 1);
    var h, bh;
    switch (season) {
      case 'none':
        return;
      case 'plum':
        state.woody = true;
        state.petalSeg = 12;
        P.leafChance = 0;
        P.flowerChance = range(0.05, 0.08) * dk;
        P.flowerPetal = 5;
        P.flowerLength = range(9, 13);
        P.flowerWidth = range(9, 12);
        P.flowerShape = function (x) {
          return Math.pow(Math.sin(PI * x), 0.35);
        };
        h = range(340, 358);
        P.flowerColor = { min: [h, range(0.25, 0.45), 0.95, 0.95], max: [(h + 8) % 360, 0.05, 1, 0.9] };
        P.flowerOpenCurve = function (x, op) {
          return x < 0.15 ? 0 : 10 - x * g.mapval(op, 0, 1, 16, 20) * 1.0;
        };
        P.innerLength = range(3, 5);
        P.innerColor = { min: [48, 0.7, 0.85, 1], max: [52, 0.5, 0.95, 0.9] };
        bh = range(15, 30);
        P.branchColor = { min: [bh, 0.4, 0.22, 1], max: [bh, 0.4, 0.22, 1] };
        state.childBranchColor = { min: [bh, 0.35, 0.3, 1], max: [bh, 0.35, 0.3, 1] };
        P.branchWidth = range(1.0, 1.3);
        P.branchDepth = 3;
        P.branchFork = Math.floor(range(5, 7));
        P.branchTwist = 4;
        return;
      case 'lotus':
        state.woody = false;
        state.form = 'lotus';
        state.petalSeg = 16;
        P.stemLength = range(400, 460);
        P.stemWidth = range(3.2, 4.2);
        P.stemCount = u() < 0.55 * dk ? 2 : 1;
        P.flowerPetal = Math.floor(range(8, 10));
        P.flowerLength = range(62, 74);
        P.flowerWidth = range(22, 27);
        P.flowerShape = function (x) {
          return Math.pow(Math.sin(PI * x), 0.55) * (1 - 0.35 * x) + 0.08 * Math.sin(PI * x);
        };
        h = range(335, 350);
        P.flowerColor = { min: [h, 0.06, 1, 0.92], max: [(h + 6) % 360, 0.55, 0.93, 0.96] };
        P.innerLength = range(9, 12);
        P.innerColor = { min: [52, 0.75, 0.9, 1], max: [58, 0.5, 0.95, 1] };
        P.leafChance = u() < 0.5 * dk ? 2 : 1;
        P.leafLength = range(120, 150);
        P.leafColor = { min: [range(95, 110), 0.35, 0.38, 0.95], max: [range(80, 95), 0.25, 0.62, 0.95] };
        return;
      case 'chrysanthemum':
        state.woody = false;
        state.form = 'chrysanthemum';
        state.petalSeg = 14;
        P.stemCount = u() < 0.5 * dk ? 3 : 2;
        P.stemLength = range(340, 420);
        P.stemWidth = range(2.6, 3.4);
        P.flowerPetal = Math.floor(range(28, 34) * (0.8 + 0.25 * dk));
        P.flowerLength = range(44, 52);
        P.flowerWidth = range(2.8, 3.6);
        P.flowerShape = function (x) {
          return Math.pow(Math.sin(PI * x), 0.6) * (1 - 0.25 * x);
        };
        h = range(36, 50);
        P.flowerColor = { min: [h - 6, 0.9, 0.78, 1], max: [h + 6, 0.6, 1, 0.92] };
        P.innerLength = range(5, 7);
        P.innerColor = { min: [35, 0.8, 0.6, 1], max: [42, 0.7, 0.75, 1] };
        P.leafChance = Math.floor(range(3, 4.99) * dk);
        P.leafLength = range(44, 54);
        P.leafWidth = range(12, 15);
        P.leafShape = function (x) {
          var t = (x * 3.5) % 1;
          var tri = 1 - Math.abs(t * 2 - 1);
          return Math.pow(Math.sin(PI * x), 0.7) * Math.min(1, x * 6) * (0.5 + 0.5 * Math.pow(tri, 0.8));
        };
        P.leafType = [2, 3, 4];
        P.leafColor = { min: [range(95, 115), 0.4, 0.28, 0.95], max: [range(80, 95), 0.35, 0.48, 0.95] };
        return;
      case 'orchid':
        state.woody = false;
        state.petalSeg = 16;
        P.stemCount = u() < 0.5 ? 1 : 2;
        P.stemLength = range(230, 300);
        P.stemWidth = range(2, 3);
        P.stemBend = range(6, 10);
        P.sheathLength = 0;
        P.shootCount = range(3, 5);
        P.shootLength = range(30, 60);
        P.flowerPetal = u() < 0.5 ? 5 : 6;
        P.flowerLength = range(18, 24);
        P.flowerWidth = range(7, 9);
        P.flowerShape = function (x) {
          return Math.pow(Math.sin(PI * x), 0.5);
        };
        P.flowerColor = { min: [range(70, 90), 0.3, 0.9, 0.95], max: [60, 0.08, 1, 0.9] };
        P.innerLength = range(5, 7);
        P.innerColor = { min: [320, 0.45, 0.55, 1], max: [330, 0.3, 0.7, 1] };
        P.leafPosition = 1;
        P.leafChance = range(0.08, 0.1) * dk;
        P.leafLength = range(85, 100);
        P.leafWidth = range(4.5, 6);
        P.leafShape = function (x) {
          return Math.pow(Math.sin(PI * x), 0.5);
        };
        P.leafType = [1, 2];
        P.leafColor = { min: [range(95, 115), 0.4, 0.35, 0.95], max: [range(80, 95), 0.3, 0.6, 0.95] };
        return;
      default:
        throw new Error('unknown flower season ' + season);
    }
  }

  /**
   * 荷 / 菊的自定株型 (FlowersScene.swift `lotus` / `lotusLeaf` / `chrysanthemum` / `ring` / `petal` /
   * `drawPetals` / `curve` / `flatRot`, FlowersCore.swift `tube`)。只调原作的 leaf / polygon / stroke /
   * tubify / hsv / lerpHue / mapval / normRand / v3 原语。
   */
  function customForms(lay0, lay1, state) {
    var g = root;
    var PI = Math.PI;
    var v3 = g.v3;
    var r = function () {
      return Math.random();
    };
    var normRand = g.normRand;
    var mapval = g.mapval;

    /** stem() 的绘制部分 (给定中心线); clampShade 把明暗参数夹到 ≤ 1。 */
    function tube(ctx, P, xof, yof, wid, col, clampShade) {
      var LR = g.tubify({ pts: P, wid: wid });
      var L = LR[0],
        Rr = LR[1];
      var wseg = 4;
      for (var i = 1; i < P.length; i++) {
        for (var j = 1; j < wseg; j++) {
          var m = (j - 1) / (wseg - 1);
          var n = j / (wseg - 1);
          var p = i / (P.length - 1);
          var p0 = v3.lerp(L[i - 1], Rr[i - 1], m);
          var p1 = v3.lerp(L[i], Rr[i], m);
          var p2 = v3.lerp(L[i - 1], Rr[i - 1], n);
          var p3 = v3.lerp(L[i], Rr[i], n);
          var lt = state.refined ? n : clampShade ? Math.min(n / p, 1) : n / p;
          var nz = state.refined ? mapval(g.Noise.noise(p * 2, 0), 0, 1, 0.76, 1) : g.Noise.noise(p * 10, m * 10, n * 10);
          var h = g.lerpHue(col.min[0], col.max[0], lt) * (state.refined ? 1 : mapval(nz, 0, 1, 0.5, 1));
          var s = mapval(lt, 0, 1, col.max[1], col.min[1]) * mapval(nz, 0, 1, 0.5, 1);
          var v = mapval(lt, 0, 1, col.min[2], col.max[2]) * mapval(nz, 0, 1, 0.5, 1);
          var a = mapval(lt, 0, 1, col.min[3], col.max[3]);
          g.polygon({ ctx: ctx, pts: [p0, p1, p3, p2], xof: xof, yof: yof, fil: true, str: true, col: g.hsv(h, s, v, a), stem:state.refined, accent:state.refined && j === 1 });
        }
      }
      g.stroke({ ctx: ctx, pts: L, xof: xof, yof: yof, col: g.rgba(0, 0, 0, 0.5) });
      g.stroke({ ctx: ctx, pts: Rr, xof: xof, yof: yof, col: g.rgba(0, 0, 0, 0.5) });
    }

    function curve(a, c, b, n) {
      var out = [];
      for (var i = 0; i <= n; i++) {
        var t = i / n,
          u = 1 - t;
        out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1], 0]);
      }
      return out;
    }
    function flatRot(psi, twist, tilt) {
      return [-psi, PI / 2 + tilt, PI / 2 + twist];
    }
    function ring(axis, count, len, wid, open, curl, phase) {
      var out = [];
      for (var k = 0; k < count; k++) {
        var th = ((k + phase) / count) * 2 * PI + normRand(-0.08, 0.08);
        var rot = [axis[0], axis[1], axis[2] + th];
        var l = len * normRand(0.88, 1.12);
        var o = open * normRand(0.9, 1.1);
        var mid = v3.roteuler(v3.roteuler([0, 0, 1], [o + curl * 0.5, 0, 0]), rot);
        out.push({ rot: rot, len: l, wid: wid, open: o, curl: curl, depth: mid[2] });
      }
      return out;
    }
    function petal(p, x, y, col, shape) {
      var w = p.wid,
        o = p.open,
        c = p.curl;
      g.leaf({
        ctx: lay1,
        flo: true,
        xof: x,
        yof: y,
        rot: p.rot,
        seg: state.petalSeg || 40,
        len: p.len,
        wid: function (xx) {
          return shape(xx) * w;
        },
        vei: [0],
        col: col,
        cof: function (xx) {
          return xx;
        },
        ben: function (xx) {
          return [xx < 0.15 ? o / 0.15 : c / 0.85, 0, 0];
        },
      });
    }
    function drawPetals(petals, x, y, col, shape) {
      var order = petals.map(function (_, i) {
        return i;
      });
      order.sort(function (a, b) {
        var da = petals[a].depth,
          db = petals[b].depth;
        if (da !== db) return da > db ? -1 : 1;
        return a - b;
      });
      order.forEach(function (i) {
        petal(petals[i], x, y, col, shape);
      });
    }
    function sub(a, b) {
      return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    }
    function mag(v) {
      return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
    }
    function sinShape(x) {
      return Math.sin(PI * x);
    }

    function lotusLeaf(ctx, cx, cy, R, tilt, roll, col, seed) {
      var nPhi = 30,
        nRho = 5;
      var rot = [tilt, 0, roll];
      function local(rho, phi) {
        var wave = 0.07 * R * Math.sin(phi * 5 + seed) * rho * rho;
        var bowl = 0.12 * R * rho * rho;
        return v3.roteuler([R * rho * Math.cos(phi), -(bowl + wave), R * rho * Math.sin(phi)], rot);
      }
      var grid = [];
      var i, j;
      for (i = 0; i <= nRho; i++) {
        var rho = i / nRho;
        var row = [];
        for (j = 0; j < nPhi; j++) row.push(local(rho, (j / nPhi) * 2 * PI));
        grid.push(row);
      }
      var quads = [];
      for (i = 0; i < nRho; i++) {
        for (j = 0; j < nPhi; j++) {
          var j1 = (j + 1) % nPhi;
          var qd = [grid[i][j], grid[i + 1][j], grid[i + 1][j1], grid[i][j1]];
          quads.push({ pts: qd, depth: (qd[0][2] + qd[1][2] + qd[2][2] + qd[3][2]) / 4 });
        }
      }
      var order = quads.map(function (_, k) {
        return k;
      });
      order.sort(function (a, b) {
        var da = quads[a].depth,
          db = quads[b].depth;
        if (da !== db) return da > db ? -1 : 1;
        return a - b;
      });
      order.forEach(function (qi) {
        var qq = quads[qi].pts;
        var nrm = v3.cross(sub(qq[1], qq[0]), sub(qq[3], qq[0]));
        var lt = mapval(Math.abs(v3.ang(nrm, [0, -1, 0])), 0, PI, 1, 0);
        if (isNaN(lt)) lt = 0.5;
        lt = Math.min(Math.max(lt + normRand(-0.04, 0.04), 0), 1);
        var h = g.lerpHue(col.min[0], col.max[0], lt);
        var c = g.hsv(
          h,
          mapval(lt, 0, 1, col.min[1], col.max[1]),
          mapval(lt, 0, 1, col.min[2], col.max[2]),
          mapval(lt, 0, 1, col.min[3], col.max[3]),
        );
        g.polygon({ ctx: ctx, pts: qq, xof: cx, yof: cy, col: c, fil: true, str: true });
      });
      for (j = 0; j < nPhi; j += 2) {
        var pts = [];
        for (i = 0; i <= nRho; i++) pts.push(grid[i][j]);
        g.polygon({ ctx: ctx, pts: pts, xof: cx, yof: cy, col: g.hsv(0, 0, 0, normRand(0.2, 0.4)), fil: false, str: true });
      }
      var rim = grid[nRho].concat([grid[nRho][0]]);
      g.polygon({ ctx: ctx, pts: rim, xof: cx, yof: cy, col: g.rgba(120, 100, 0, 0.35), fil: false, str: true });
    }

    function lotus(P) {
      var x0 = 600,
        y0 = 840;
      var side = r() < 0.5 ? -1 : 1;
      var stemCol = { min: [95, 0.3, 0.45, 1], max: [85, 0.25, 0.6, 1] };
      var leaves = Math.trunc(P.leafChance);
      for (var k = 0; k < leaves; k++) {
        var R = P.leafLength * (k === 0 ? 1 : 0.72) * normRand(0.92, 1.08);
        var cx = x0 - side * (k === 0 ? normRand(70, 130) : -normRand(90, 150));
        var cy = y0 - (k === 0 ? normRand(150, 210) : normRand(60, 110));
        var base = [x0 + normRand(-12, 12), y0];
        var ctrl = [(base[0] + cx) / 2 + normRand(-30, 30), (base[1] + cy) / 2];
        var stalk0 = curve([0, 0], [ctrl[0] - base[0], ctrl[1] - base[1]], [cx - base[0], cy - base[1]], 24);
        tube(lay0, stalk0, base[0], base[1], function () {
          return P.stemWidth * 0.8;
        }, stemCol, true);
        var tilt = normRand(0.38, 0.62);
        var roll = normRand(-0.18, 0.18);
        lotusLeaf(lay0, cx, cy, R, tilt, roll, P.leafColor, r() * 10);
      }
      var dir, axis, petals;
      if (P.stemCount >= 2) {
        var tx = x0 - side * normRand(50, 90),
          ty = y0 - P.stemLength * normRand(0.55, 0.7);
        var stalk1 = curve([0, 0], [normRand(-20, 20), (ty - y0) * 0.5], [tx - x0, ty - y0], 30);
        tube(lay0, stalk1, x0, y0, function (x) {
          return P.stemWidth * (1 - 0.3 * x);
        }, stemCol, true);
        dir = sub(stalk1[stalk1.length - 1], stalk1[stalk1.length - 3]);
        axis = v3.toeuler([dir[0], dir[1], -0.25 * mag(dir)]);
        petals = ring(axis, 5, P.flowerLength * 0.62, P.flowerWidth * 0.8, 0.16, -0.12, 0);
        var bud = { min: P.flowerColor.min.slice(), max: P.flowerColor.max.slice() };
        bud.min[1] = 0.2;
        bud.max[1] = 0.62;
        drawPetals(petals, tx, ty, bud, P.flowerShape);
      }
      var fx = x0 + side * normRand(20, 60),
        fy = y0 - P.stemLength;
      var stalk = curve([0, 0], [side * normRand(-30, 10), -P.stemLength * 0.5], [fx - x0, fy - y0], 40);
      tube(lay0, stalk, x0, y0, function (x) {
        return P.stemWidth * (1.1 - 0.35 * x);
      }, stemCol, true);
      dir = sub(stalk[stalk.length - 1], stalk[stalk.length - 3]);
      axis = v3.toeuler([dir[0], dir[1], -0.55 * mag(dir)]);
      var n = Math.trunc(P.flowerPetal);
      var outer = ring(axis, n, P.flowerLength, P.flowerWidth, 0.95, -0.3, 0);
      var inner = ring(axis, Math.max(5, n - 3), P.flowerLength * 0.8, P.flowerWidth * 0.9, 0.5, -0.3, 0.5);
      var front = function (p) {
        return p.depth > 0;
      };
      var back = function (p) {
        return p.depth <= 0;
      };
      drawPetals(outer.filter(front), fx, fy, P.flowerColor, P.flowerShape);
      drawPetals(inner.filter(front), fx, fy, P.flowerColor, P.flowerShape);
      var stamens = ring(axis, 12, P.innerLength, 2.2, 0.5, 0.2, 0.25);
      drawPetals(stamens, fx, fy, P.innerColor, sinShape);
      drawPetals(inner.filter(back), fx, fy, P.flowerColor, P.flowerShape);
      drawPetals(outer.filter(back), fx, fy, P.flowerColor, P.flowerShape);
    }

    function chrysanthemum(P) {
      var x0 = 600,
        y0 = 840;
      var n = Math.trunc(P.stemCount);
      var stemCol = { min: [95, 0.28, 0.4, 1], max: [85, 0.22, 0.55, 1] };
      var tips = [];
      var stalks = [];
      var tallest = Math.floor(r() * n);
      var lean0 = normRand(-0.12, 0.12);
      var i, k;
      for (i = 0; i < n; i++) {
        var t = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
        var lean = i === tallest ? lean0 * 0.5 : lean0 + t * normRand(0.25, 0.4);
        var len = P.stemLength * (i === tallest ? 1 : normRand(0.62, 0.84));
        var end = [Math.sin(lean) * len, -Math.cos(lean) * len];
        var ctrl = [end[0] * 0.25 + normRand(-25, 25), end[1] * 0.55];
        var pts = curve([0, 0], ctrl, end, 40);
        stalks.push(pts);
        tips.push({ x: x0 + end[0], y: y0 + end[1] });
      }
      stalks.forEach(function (pts) {
        tube(lay0, pts, x0, y0, function (x) {
          return P.stemWidth * (1.05 - 0.35 * x);
        }, stemCol, true);
      });
      stalks.forEach(function (pts, si) {
        var count = Math.trunc(P.leafChance);
        for (k = 0; k < count; k++) {
          var f = 0.12 + (0.55 * (k + normRand(0, 0.5))) / Math.max(count, 1);
          var idx = Math.min(pts.length - 2, Math.max(1, Math.trunc(f * (pts.length - 1))));
          var p = pts[idx],
            q = pts[idx + 1];
          var along = Math.atan2(q[1] - p[1], q[0] - p[0]);
          var sgn = (k + si) % 2 === 0 ? 1 : -1;
          var psi = along + sgn * normRand(0.6, 0.95);
          var xof = x0 + p[0],
            yof = y0 + p[1];
          var twist = normRand(-0.25, 0.25);
          var tilt = normRand(-0.35, 0.35);
          var rot = flatRot(psi, twist, tilt);
          var llen = P.leafLength * normRand(0.8, 1.15) * (1 - 0.35 * f);
          var lw = P.leafWidth * (1 - 0.3 * f);
          var shape = P.leafShape;
          var droop = sgn * normRand(0.4, 0.9);
          var cup = normRand(-0.6, 0.6);
          g.leaf({
            ctx: lay0,
            xof: xof,
            yof: yof,
            rot: rot,
            len: llen,
            seg: 24,
            wid: (function (sh, w) {
              return function (x) {
                return sh(x) * w;
              };
            })(shape, lw),
            vei: P.leafType,
            col: P.leafColor,
            ben: (function (cu, dr) {
              return function (x) {
                return [cu * (0.5 - x), dr * x * 2, 0];
              };
            })(cup, droop),
          });
        }
      });
      tips.forEach(function (tip) {
        var axis = [normRand(-0.5, 0.5), normRand(-0.4, 0.4), 0];
        var N = Math.trunc(P.flowerPetal);
        var L = P.flowerLength * normRand(0.9, 1.1);
        var w = P.flowerWidth;
        var r1 = ring(axis, N, L, w, 1.55, 0.55, 0);
        var r2 = ring(axis, N, L * 0.84, w, 1.15, 0.25, 0.5);
        var r3 = ring(axis, Math.max(12, Math.floor((N * 3) / 4)), L * 0.64, w * 0.95, 0.72, -0.2, 0.25);
        var r4 = ring(axis, Math.max(10, Math.floor(N / 2)), L * 0.44, w * 0.9, 0.32, -0.55, 0.75);
        [r1, r2, r3, r4].forEach(function (petals) {
          drawPetals(petals, tip.x, tip.y, P.flowerColor, P.flowerShape);
        });
        var core = ring(axis, 8, P.innerLength, 2, 0.3, -0.2, 0);
        drawPetals(core, tip.x, tip.y, P.innerColor, sinShape);
      });
    }

    return { lotus: lotus, chrysanthemum: chrysanthemum };
  }

  /**
   * nonflowers@2 的摆放 → [k, tx, ty] —— FlowersScene.swift `Flowers.Params.placeV2` 逐行对照。
   * pts: 原作 1200² 坐标的顶点 (扁平 [x0, y0, x1, y1, …], 已夹到 0…1199)。
   */
  function placeFlowersV2(verse, layout, W, H, quietTop, xmin, xmax, ymin, ymax, pts) {
    var bw = Math.max(xmax - xmin, 1);
    var bh = Math.max(ymax - ymin, 1);
    var vx0 = verse.rect.x * W;
    var vx1 = (verse.rect.x + verse.rect.width) * W;
    var vy1 = (verse.rect.y + verse.rect.height) * H;
    var gap = 0.03 * Math.min(W, H);
    var portrait = layout === 'portrait';
    var bottom = portrait ? 0.965 * H : 0.95 * H;
    var yTop = portrait ? quietTop * H + 0.04 * H : 0.05 * H;
    var right = (vx0 + vx1) / 2 > W / 2;
    function fitted(x0, y0, x1, y1) {
      var kk = Math.min(Math.max(x1 - x0, 0) / bw, Math.max(y1 - y0, 0) / bh, 2.4);
      return [kk, (x0 + x1) / 2 - ((xmin + xmax) / 2) * kk, y1 - ymax * kk];
    }
    if (layout === 'widget') {
      return right ? fitted(0.05 * W, yTop, vx0 - gap, bottom) : fitted(vx1 + gap, yTop, 0.95 * W, bottom);
    }
    if (verse.side === 'top') return fitted(0.06 * W, vy1 + gap, 0.94 * W, bottom);
    var xl = 0.05 * W;
    var xr = 0.95 * W;
    var ey = vy1 + gap;
    var mid = right ? (xl + vx0 - gap) / 2 : (vx1 + gap + xr) / 2;
    function place(kk) {
      var ty = bottom - ymax * kk;
      var hiMax = -Infinity;
      var hiMin = Infinity;
      for (var i = 0; i < pts.length; i += 2) {
        if (pts[i + 1] * kk + ty < ey) {
          if (pts[i] > hiMax) hiMax = pts[i];
          if (pts[i] < hiMin) hiMin = pts[i];
        }
      }
      var lo = xl - xmin * kk;
      var hi = xr - xmax * kk;
      if (right && isFinite(hiMax)) hi = Math.min(hi, vx0 - gap - hiMax * kk);
      if (!right && isFinite(hiMin)) lo = Math.max(lo, vx1 + gap - hiMin * kk);
      if (!(lo <= hi)) return null;
      return Math.min(Math.max(mid - ((xmin + xmax) / 2) * kk, lo), hi);
    }
    var kmax = Math.min((xr - xl) / bw, (bottom - yTop) / bh, 2.4);
    var k = kmax;
    var tx = place(kmax);
    if (tx === null) {
      var a = 0;
      var b = kmax;
      for (var it = 0; it < 30; it++) {
        var c = (a + b) / 2;
        if (place(c) !== null) a = c;
        else b = c;
      }
      k = a;
      tx = place(a);
    }
    return [k, tx === null ? mid - ((xmin + xmax) / 2) * k : tx, bottom - ymax * k];
  }

  function generateFlowers(req, palette) {
    var g = root;
    var aspect = req.width > 0 && req.height > 0 ? req.width / req.height : 1;
    var SHORT = 600; // ZXArt.Flowers.logicalShortSide
    var W, H;
    if (aspect >= 1) {
      H = SHORT;
      W = SHORT * aspect;
    } else {
      W = SHORT;
      H = SHORT / aspect;
    }
    // ZXArt.Frame (ZXArtProcedural.swift): 高/宽 ≥ 1.3 竖幅, 宽/高 > 1.3 横幅, 其余方幅。
    var pw = Math.max(req.width, 1),
      ph = Math.max(req.height, 1);
    var layout = ph / pw >= 1.3 ? 'portrait' : pw / ph > 1.3 ? 'widget' : 'square';
    var season = FLOWER_SEASONS[req.variant];
    if (!season) throw new Error('unknown nonflowers variant ' + req.variant);

    // 图层: woody / herbal 里 Layer.empty 依次建 lay0 (枝叶) 与 lay1 (花)。
    var created = [];
    var origEmpty = g.Layer.empty;
    g.Layer.empty = function (w, h) {
      var ctx = origEmpty.call(this, w, h);
      created.push(ctx);
      return ctx;
    };
    // 滤镜 / 定界 / 贴图交给渲染器 (它们不取随机数)。
    g.Layer.filter = function () {};
    g.Layer.bound = function () {
      return { xmin: 0, xmax: 0, ymin: 0, ymax: 0 };
    };
    g.Layer.blit = function () {};
    g.vizParams = function () {};

    var polys = [];
    // Versioned study treatment: retain original centerlines and random draws, correct only stem shading.
    var stemPaint = null;
    if (['refined-v1', 'painted-v2'].includes(req.elementTreatment)) {
      var originalStem = g.stem;
      g.stem = function (args) {
        var previous = stemPaint;
        if (!state.woody) {
          // The original herb has a violet main stalk and yellow shoots with an abrupt width step.
          // Keep the centerline, taper its tip into the shoots, and give the connected stems one local colour.
          var primary = !args.col, width = args.wid;
          args = Object.assign({}, args, { col:{ min:[95, 0.22, 0.48, 1], max:[85, 0.18, 0.62, 1] } });
          if (primary && width) args.wid = function (t) { return width(t) * (1 - t * t) + 2 * t * t; };
        }
        stemPaint = { index:0, segments:args.seg || 40,
          color:args.col || { min:[250, 0.2, 0.4, 1], max:[250, 0.3, 0.6, 1] } };
        try { return originalStem(args); } finally { stemPaint = previous; }
      };
    }
    g.polygon = function (args) {
      args = args != undefined ? args : {};
      var xof = args.xof != undefined ? args.xof : 0;
      var yof = args.yof != undefined ? args.yof : 0;
      var pts = args.pts != undefined ? args.pts : [];
      var col = args.col != undefined ? args.col : 'black';
      var fil = args.fil != undefined ? args.fil : true;
      var str = args.str != undefined ? args.str : !fil;
      if (stemPaint && fil && pts.length === 4) {
        // The source uses n / p, extrapolating far past 1 near the base. Shade across the tube,
        // with slow longitudinal variation, instead of clipping overexposed rectangles afterwards.
        var n = (stemPaint.index % 3 + 1) / 3;
        var t = (Math.floor(stemPaint.index++ / 3) + 1) / stemPaint.segments;
        var lo = stemPaint.color.min, hi = stemPaint.color.max;
        var value = (lo[2] + (hi[2] - lo[2]) * n) * (0.88 + 0.12 * g.Noise.noise(t * 2, 0));
        if (palette.isDark) value = Math.max(value, 0.42 + 0.08 * n);
        col = g.hsv(g.lerpHue(lo[0], hi[0], n), Math.min(1, lo[1] + (hi[1] - lo[1]) * n),
          Math.min(1, value), Math.min(1, lo[3] + (hi[3] - lo[3]) * n));
      }
      var layer = created.indexOf(args.ctx);
      polys.push({
        p: pts.map(function (v) {
          return [v[0] + xof, v[1] + yof];
        }),
        c: col,
        fil: !!fil,
        str: !!str,
        stem: !!stemPaint || !!args.stem,
        accent: (!!stemPaint && fil && pts.length === 4 && (stemPaint.index % 3 === 1)) || !!args.accent,
        layer: layer === 1 ? 1 : 0,
      });
    };

    // 原网页的随机序列: 背景纸 → 画布纸 (当纸纹) → 抛硬币 (木本 / 草本) → genParams。
    g.paper({ col: [1, 0.99, 0.9], tex: 10, spr: 0 });
    var shade = new Uint8Array(512 * 512);
    hooks.onFillRect = function (style, x, y) {
      var c = parseCss(style);
      if (!c || x < 0 || x >= 512 || y < 0 || y >= 512) return;
      // 原作 rgba(c·0.98, c·0.91, c·0.74); 斑点 rgba(c·0.7, c·0.5, c·0.2)。反推 c 再按 Swift 的规则取纹素。
      var spot = c[2] < c[0] * 0.5;
      var cc = spot ? (c[0] + 0.5) / 0.7 : (c[0] + 0.5) / 0.98;
      var v = spot ? Math.floor(Math.min(255, 38 + Math.max(0, 255 - cc))) : Math.round(255 - cc);
      shade[y * 512 + x] = Math.min(Math.max(v, 0), 255);
    };
    try {
      g.paper({ col: [0.98, 0.91, 0.74], tex: 20, spr: 1 });
    } finally {
      hooks.onFillRect = null;
    }
    var state = { woody: Math.random() <= 0.5, childBranchColor: null, form: 'original', petalSeg: null };
    state.refined = ['refined-v1', 'painted-v2'].includes(req.elementTreatment);
    var PAR = g.genParams();
    applySeason(season, PAR, state, req.density);
    if (typeof req.hue === 'number' && isFinite(req.hue)) {
      var dh = PAR.flowerColor.max[0] - PAR.flowerColor.min[0];
      PAR.flowerColor.min[0] = ((req.hue % 360) + 360) % 360;
      PAR.flowerColor.max[0] = (((req.hue + Math.max(-30, Math.min(30, dh))) % 360) + 360) % 360;
    }
    // 梅: 子枝换色 (原作子枝不传 col, 用缺省淡黄) —— 包一层只给「没带 col 的调用」补色。
    if (state.childBranchColor) {
      var origBranch = g.branch;
      var childColor = state.childBranchColor;
      g.branch = function (args) {
        if (args && args.col === undefined) args.col = childColor;
        return origBranch.call(this, args);
      };
    }
    // 预设的花瓣分段 (Swift flowerHead: 瓣 seg = petalSeg, 蕊 seg = max(4, petalSeg / 2))。
    // 原作 woody / herbal 画花头的 leaf 调用不带 seg; 按 col 认出是瓣还是蕊。
    if (state.petalSeg) {
      var origLeaf = g.leaf;
      var petalSeg = state.petalSeg;
      g.leaf = function (args) {
        if (args && args.flo && args.seg === undefined) {
          if (args.col === PAR.innerColor) args.seg = Math.max(4, Math.floor(petalSeg / 2));
          else if (args.col === PAR.flowerColor) args.seg = petalSeg;
        }
        return origLeaf.call(this, args);
      };
    }
    if (state.form === 'lotus' || state.form === 'chrysanthemum') {
      var lay0 = g.Layer.empty(1200);
      var lay1 = g.Layer.empty(1200);
      customForms(lay0, lay1, state)[state.form](PAR);
    } else if (state.woody) g.woody({ PAR: PAR });
    else g.herbal({ PAR: PAR });

    var trace = newTrace();
    trace.prngAfter = g.Prng.s;
    polys.forEach(function (p) {
      traceAdd(trace, p.p);
    });

    // 原作 Layer.bound: 1200² 图层内有像素的范围 (这里按多边形顶点, 同 Swift)。
    var xmin = Infinity,
      xmax = -Infinity,
      ymin = Infinity,
      ymax = -Infinity;
    polys.forEach(function (p) {
      p.p.forEach(function (v) {
        if (!isFinite(v[0]) || !isFinite(v[1])) return;
        var x = Math.min(Math.max(v[0], 0), 1199);
        var y = Math.min(Math.max(v[1], 0), 1199);
        if (x < xmin) xmin = x;
        if (x > xmax) xmax = x;
        if (y < ymin) ymin = y;
        if (y > ymax) ymax = y;
      });
    });
    if (!isFinite(xmin)) {
      xmin = 500;
      xmax = 700;
      ymin = 500;
      ymax = 840;
    }
    var bw = Math.max(xmax - xmin, 1);
    var bhh = Math.max(ymax - ymin, 1);
    var region, topY, k, tx, ty;
    if (req.verse) {
      // @2 (nonflowers@2): 绕开诗句框摆放 (Flowers.Params.placeV2)
      var pts = [];
      polys.forEach(function (p) {
        p.p.forEach(function (v) {
          if (!isFinite(v[0]) || !isFinite(v[1])) return;
          pts.push(Math.min(Math.max(v[0], 0), 1199), Math.min(Math.max(v[1], 0), 1199));
        });
      });
      var placedV2 = placeFlowersV2(req.verse, layout, W, H, req.quietTop, xmin, xmax, ymin, ymax, pts);
      k = placedV2[0];
      tx = placedV2[1];
      ty = placedV2[2];
    } else {
      if (layout === 'widget') region = { x: 0.5 * W, y: 0.05 * H, width: 0.46 * W, height: 0.91 * H };
      else if (layout === 'portrait') {
        topY = req.quietTop * H + 0.04 * H;
        region = { x: 0.06 * W, y: topY, width: 0.88 * W, height: 0.965 * H - topY };
      } else {
        topY = Math.max(0.08 * H, req.quietTop * H + 0.03 * H);
        region = { x: 0.08 * W, y: topY, width: 0.84 * W, height: 0.94 * H - topY };
      }
      k = Math.min(region.width / bw, region.height / bhh, 2.4);
      tx = region.x + region.width / 2 - ((xmin + xmax) / 2) * k;
      ty = region.y + region.height - ymax * k;
    }
    trace.transform = [k, tx, ty];

    var dark = palette.isDark;
    function color(c) {
      var a = Math.min(Math.max(c[3], 0), 1);
      if (c[0] <= 0 && c[1] <= 0 && c[2] <= 0) return opacity(palette.ink, a);
      if (dark && c[0] === 120 && c[1] === 100 && c[2] === 0) return opacity(palette.ink, a * 0.8);
      return [
        Math.min(Math.max(c[0], 0), 255) / 255,
        Math.min(Math.max(c[1], 0), 255) / 255,
        Math.min(Math.max(c[2], 0), 255) / 255,
        a,
      ];
    }
    var shapes0 = [],
      shapes1 = [];
    polys.forEach(function (p) {
      if (p.p.length < 2) return;
      var pts = new Float64Array(p.p.length * 2);
      for (var i = 0; i < p.p.length; i++) {
        var x = p.p[i][0] * k + tx;
        var y = p.p[i][1] * k + ty;
        if (!isFinite(x) || !isFinite(y)) return;
        pts[i * 2] = x;
        pts[i * 2 + 1] = y;
      }
      var parsed = parseCss(p.c) || [0, 0, 0, 1];
      var c = color(parsed);
      if (p.stem && palette.isDark && parsed[0] === 0 && parsed[1] === 0 && parsed[2] === 0) {
        c = opacity(palette.ink, parsed[3] * 0.4);
      }
      if (p.accent && palette.accent && p.layer === 0) {
        c = c.map(function (v, channel) { return channel < 3 ? v * 0.65 + palette.accent[channel] * 0.35 : v; });
      }
      var s = { points: pts, fill: p.fil ? c : null, stroke: p.str ? c : null, lineWidth: k };
      if (p.layer === 0) shapes0.push(s);
      else shapes1.push(s);
    });
    var filterBase = { scale: 1 / k, offsetX: -tx / k, offsetY: -ty / k };
    return {
      width: W,
      height: H,
      background: palette.paper,
      paper:
        req.paperTexture === false ? null : { shade: shade, texel: 1, strength: dark ? 0.6 : 1, tint: palette.ink },
      layers: [
        {
          blend: dark ? 'normal' : 'multiply',
          opacity: 1,
          filter: Object.assign({ passes: ['fade', 'wispy'] }, filterBase),
          mist: null,
          shapes: shapes0,
        },
        {
          blend: 'normal',
          opacity: 1,
          filter: Object.assign({ passes: ['wispy'] }, filterBase),
          mist: null,
          shapes: shapes1,
        },
      ],
      quietRect: req.verse
        ? verseQuietRect(req.verse, W, H, req.quietTop)
        : layout === 'widget'
          ? { x: 0, y: 0, width: 0.48 * W, height: H }
          : { x: 0, y: 0, width: W, height: req.quietTop * H },
      verse: req.verse || null,
      verseRect: req.verse ? scaledRect(req.verse.rect, W, H) : null,
      trace: trace,
    };
  }

  // ---------------------------------------------------------------- 入口

  /**
   * 配方参数 → 引擎参数 (ZXArtProcedural.swift `traced`, 改了就要升版本):
   *   density 0.5…1.5 (缺省 1) → 引擎 density − 0.5, 夹到 0…1 (1.0 ≡ 引擎 0.5)
   *   quiet_top 缺省 0.32, 夹到 0…0.5
   *   hue 0…360 (仅花; 缺省 = 原作 / 预设的花色)
   */
  function engineParams(params) {
    params = params || {};
    var density = typeof params.density === 'number' ? params.density : 1;
    var quietTop = typeof params.quiet_top === 'number' ? params.quiet_top : 0.32;
    return {
      density: Math.min(Math.max(density - 0.5, 0), 1),
      quietTop: Math.min(Math.max(quietTop, 0), 0.5),
      hue: typeof params.hue === 'number' ? params.hue : null,
      // @2: verse_side 缺省 right; 认不出 → null (generate 抛错, 调用方回退纸纹)
      verseSide:
        params.verse_side === undefined || params.verse_side === null
          ? 'right'
          : VERSE_SIDES.indexOf(params.verse_side) >= 0
            ? params.verse_side
            : null,
      verseColumns: typeof params.verse_columns === 'number' ? params.verse_columns : null,
      verseChars: typeof params.verse_chars === 'number' ? params.verse_chars : null,
    };
  }

  /** @2 / shanshui@3 / @4 / @5: 诗句框 (ZXArt.Procedural.verseLayout(pixelSize:))。@1 → null。 */
  function verseLayoutFor(generator, params, width, height) {
    if (!(/@2$/.test(String(generator)) || generator === 'shanshui@3' || generator === 'shanshui@4' || generator === 'shanshui@5') || !(width >= 1) || !(height >= 1)) return null;
    var ep = engineParams(params);
    if (!ep.verseSide) return null;
    return verseLayout(ep.verseSide, frameOf(width, height), width / height, ep.quietTop, ep.verseColumns, ep.verseChars);
  }

  /**
   * req: { generator: 'shanshui@1' | 'nonflowers@1' | 'shanshui@2' | 'nonflowers@2' | 'shanshui@3', seed, variant, params, palette: {paper, ink},
   *        allowsShanShuiV3? (web 缺省 false), width, height (像素; 决定长宽比与版式), paperTexture?, loadPaperScript? (山水纸纹: 同步载入 13-paper.js) }
   * → Drawing { width, height, background, paper, layers[{blend, opacity, filter, mist, shapes}], quietRect,
 *             verse ({side, vertical, rect (单位坐标)} | null, @2 / @3), verseRect (逻辑坐标 | null), trace }
   */
  function effectiveGenerator(generator, allowsShanShuiV3) {
    return generator === 'shanshui@3' && allowsShanShuiV3 !== true ? 'shanshui@2' : generator;
  }

  function generate(req) {
    var generator = effectiveGenerator(req.generator, req.allowsShanShuiV3);
    var palette = makePalette(req.palette || {});
    var ep = engineParams(req.params);
    var elementTreatment = (req.params && req.params.element_treatment) || 'original';
    if (!['original', 'refined-v1', 'painted-v2'].includes(elementTreatment)) throw new Error('unknown element_treatment');
    var base = {
      width: req.width,
      height: req.height,
      v3: generator === 'shanshui@3',
      variant: req.variant,
      density: ep.density,
      quietTop: ep.quietTop,
      hue: ep.hue,
      paperTexture: req.paperTexture,
      loadPaperScript: req.loadPaperScript,
      elementTreatment: elementTreatment,
    };
    if (generator === 'shanshui@2' || generator === 'nonflowers@2' || generator === 'shanshui@3') {
      base.verse = verseLayoutFor(generator, req.params, req.width, req.height);
      if (!base.verse) throw new Error('unknown verse_side ' + (req.params || {}).verse_side);
    }
    if (generator === 'shanshui@5') {
      var verse5 = verseLayoutFor(generator, req.params, req.width, req.height);
      var req5 = {
        elementTreatment: elementTreatment,
        seed: String(req.seed),
        width: req.width,
        height: req.height,
        scene: req.scene || req.variant || 'retreat',
        options: (req.params && req.params.scene) || req.options || {},
        quietTop: ep.quietTop,
        verse: verse5,
      };
      var fn5 = typeof globalThis.generatePoetryPaintingV5 === 'function' ? globalThis.generatePoetryPaintingV5 : root.generatePoetryPaintingV5;
      if (typeof fn5 !== 'function') throw new Error('shanshui@5 generator not loaded');
      var res5 = fn5(req5, palette);
      var drawing5 = res5.drawing;
      drawing5.trace = res5.trace;
      return drawing5;
    }
    if (generator === 'shanshui@4') {
      var verse4 = verseLayoutFor(generator, req.params, req.width, req.height);
      var req4 = {
        seed: String(req.seed),
        width: req.width,
        height: req.height,
        scene: req.scene || req.variant || 'retreat',
        options: (req.params && req.params.scene) || req.options || {},
        quietTop: ep.quietTop,
        verse: verse4,
      };
      var fn4 = typeof globalThis.generatePoetrySceneV4 === 'function' ? globalThis.generatePoetrySceneV4 : root.generatePoetrySceneV4;
      if (typeof fn4 !== 'function') throw new Error('shanshui@4 generator not loaded');
      var res4 = fn4(req4, palette);
      var drawing4 = res4.drawing;
      drawing4.trace = res4.trace;
      return drawing4;
    }
    root.Math.seed(String(req.seed));
    if (generator === 'shanshui@1' || generator === 'shanshui@2' || generator === 'shanshui@3') return generateShanShui(base, palette);
    if (generator === 'nonflowers@1' || generator === 'nonflowers@2') return generateFlowers(base, palette);
    throw new Error('unknown generator ' + req.generator);
  }

  root.ZXArtCompose = {
    Brush: Brush,
    WashNoise: WashNoise,
    clearsVerseV3: clearsVerseV3,
    effectiveGenerator: effectiveGenerator,
    installShims: installShims,
    generate: generate,
    engineParams: engineParams,
    verseLayoutFor: verseLayoutFor,
    makePalette: makePalette,
    parseCss: parseCss,
    poetryScene: function (text, title) {
      var fn = typeof globalThis.poetryScene === 'function' ? globalThis.poetryScene : root.poetryScene;
      return typeof fn === 'function' ? fn(text, title) : null;
    },
    SCRIPTS: {
      'shanshui@5': ['zxart-shanshui-v5.js'],
      'shanshui@4': ['zxart-shanshui-v5.js'],
      'shanshui@3': [
        'shan-shui-inf/0-prng.js', 'shan-shui-inf/1-seed.js', 'shan-shui-inf/2-perlin.js',
        'shan-shui-inf/3-polytools.js', 'shan-shui-inf/4-util.js', 'shan-shui-inf/5-generators.js',
      ],
      'shanshui@2': [
        'shan-shui-inf/0-prng.js',
        'shan-shui-inf/1-seed.js',
        'shan-shui-inf/2-perlin.js',
        'shan-shui-inf/3-polytools.js',
        'shan-shui-inf/4-util.js',
        'shan-shui-inf/5-generators.js',
      ],
      'shanshui@1': [
        'shan-shui-inf/0-prng.js',
        'shan-shui-inf/1-seed.js',
        'shan-shui-inf/2-perlin.js',
        'shan-shui-inf/3-polytools.js',
        'shan-shui-inf/4-util.js',
        'shan-shui-inf/5-generators.js',
      ],
      'nonflowers@1': ['nonflowers/main.js'],
      'nonflowers@2': ['nonflowers/main.js'],
    },
    SHANSHUI_PAPER_SCRIPT: 'shan-shui-inf/13-paper.js',
  };
})(typeof self !== 'undefined' ? self : globalThis);
