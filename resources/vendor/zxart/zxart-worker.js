/*
 * 画屏 · 程序化背景 —— admin 预览用 Web Worker。一个 Worker 只画一张 (原作的 PRNG / Perlin 表 /
 * MEM 都是全局, 必须用干净的 realm), 画完即由调用方 terminate。
 *
 *   postMessage({ generator, seed, variant, params, palette: {paper, ink}, width, height })   // width/height = 像素
 *   ← { ok: true, bitmap: ImageBitmap, ms } | { ok: false, error }
 *
 * 生成: 原作 JS (shan-shui-inf/ 或 nonflowers/, 逐字未改, MIT (c) 2018 Lingdong Huang) + zxart-compose.js
 * (ZixiaoArt @1 构图的 JS 版, 几何与 iOS 逐形状一致)。
 * 渲染: zixiao-kit Sources/ZixiaoArt/Core/ZXArtRenderer.swift (@1 定稿 60efe4b) 的 Canvas 2D 版 ——
 *   aspect-fill; 纸与纸纹逐像素 (最近邻纹素, 按整图坐标取模 512);
 *   相邻同样式的形状并成一条路径一次填描 (非零环绕取并集, 重叠处不重复叠透明度);
 *   滤镜层 (原作 Filter.fade / Filter.wispy, 在输出像素上按原作图层坐标取噪声) 按 multiply / normal 贴回;
 *   雾化层 (远山): 低分辨率离屏 → 按山脊 / 雾底平滑淡出 → 两遍箱式模糊 (r = 3) → 平滑放大贴回。
 * @3: kit 6556ee2 Core/ZXArtRenderer.swift drawWashed / WashSamples; 显式 closed 墨体与开放笔毫,
 *   半分辨率 alpha 源、两档 12 点盘、逻辑坐标噪声、64 行横带; wash / tooth / rim 不作用于 @1/@2。
 * 光栅化 (抗锯齿) 与 Core Graphics 不同, 其余一致。
 */
/* global importScripts, OffscreenCanvas, ZXArtCompose, Filter */
'use strict';

importScripts('zxart-compose.js');
ZXArtCompose.installShims(self);

function css(c) {
  return (
    'rgba(' +
    Math.round(c[0] * 255) +
    ',' +
    Math.round(c[1] * 255) +
    ',' +
    Math.round(c[2] * 255) +
    ',' +
    Math.min(Math.max(c[3], 0), 1) +
    ')'
  );
}

function sameColor(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
}

/** Prepared.sameStyle: 填色、线宽相同, 有线宽时描色也相同。 */
// Separate wash passes accumulate ink; merging their paths would erase that accumulation.
function sameStyle(a, b) {
  if (a.overprint || b.overprint) return false;
  return sameColor(a.fill, b.fill) && a.lineWidth === b.lineWidth && (a.lineWidth > 0 ? sameColor(a.stroke, b.stroke) : true);
}

/** 先填 (非零环绕, 隐式闭合) 后描 (不闭合, 斜接, 平头); 相邻同样式的形状并成一条路径。 */
function drawShapes(ctx, shapes) {
  ctx.lineJoin = 'miter';
  ctx.lineCap = 'butt';
  var start = 0;
  for (var i = 1; i <= shapes.length; i++) {
    if (i < shapes.length && sameStyle(shapes[i - 1], shapes[i])) continue;
    drawRun(ctx, shapes, start, i);
    start = i;
  }
}

function drawRun(ctx, shapes, from, to) {
  var first = shapes[from];
  var stroke = first.lineWidth > 0 ? first.stroke : null;
  if (!first.fill && !stroke) return;
  var any = false;
  ctx.beginPath();
  for (var i = from; i < to; i++) {
    var pts = shapes[i].points;
    if (pts.length < 4) continue;
    ctx.moveTo(pts[0], pts[1]);
    for (var j = 2; j < pts.length; j += 2) ctx.lineTo(pts[j], pts[j + 1]);
    if (shapes[i].closed) ctx.closePath();
    any = true;
  }
  if (!any) return;
  if (first.fill) {
    ctx.fillStyle = css(first.fill);
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = css(stroke);
    ctx.lineWidth = first.lineWidth;
    ctx.stroke();
  }
}

/** Uint8ClampedArray 的写入: 夹到 0…255, 四舍六入五成双。 */
function clampedByte(v) {
  if (!(v > 0)) return 0;
  if (v >= 255) return 255;
  var f = Math.floor(v);
  var d = v - f;
  if (d > 0.5) return f + 1;
  if (d < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}

function bounds(shapes) {
  var minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  shapes.forEach(function (sh) {
    for (var j = 0; j < sh.points.length; j += 2) {
      var x = sh.points[j],
        y = sh.points[j + 1];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  });
  return isFinite(minX) ? { minX: minX, minY: minY, maxX: maxX, maxY: maxY } : null;
}

/** PaperGround: 底色 + 纸纹逐像素 (纹素 = floor((x + 0.5 − ox) / texelPx) mod 512)。 */
function fillGround(ctx, drawing, pw, ph, s, ox, oy) {
  var bg = drawing.background;
  var img = ctx.createImageData(pw, ph);
  var px = img.data;
  var side = 512;
  var paper = drawing.paper;
  var tile = null;
  if (paper && paper.shade && paper.shade.length === side * side) {
    tile = new Uint8Array(side * side * 3);
    var pr = bg[0] * 255,
      pg = bg[1] * 255,
      pb = bg[2] * 255;
    var tr = paper.tint[0] * 255,
      tg = paper.tint[1] * 255,
      tb = paper.tint[2] * 255;
    for (var i = 0; i < side * side; i++) {
      var t = Math.min(1, (paper.shade[i] / 255) * paper.strength);
      tile[i * 3] = Math.round(pr + (tr - pr) * t);
      tile[i * 3 + 1] = Math.round(pg + (tg - pg) * t);
      tile[i * 3 + 2] = Math.round(pb + (tb - pb) * t);
    }
  }
  var b0 = Math.round(bg[0] * 255),
    b1 = Math.round(bg[1] * 255),
    b2 = Math.round(bg[2] * 255);
  var texelPx = s * (paper ? paper.texel : 1);
  var txs = new Int32Array(pw);
  for (var x = 0; x < pw; x++) {
    var tx = Math.floor((x + 0.5 - ox) / texelPx) % side;
    txs[x] = tx < 0 ? tx + side : tx;
  }
  for (var y = 0; y < ph; y++) {
    var ty = Math.floor((y + 0.5 - oy) / texelPx) % side;
    if (ty < 0) ty += side;
    var row = y * pw * 4;
    for (x = 0; x < pw; x++) {
      var q = row + x * 4;
      if (tile) {
        var k = (ty * side + txs[x]) * 3;
        px[q] = tile[k];
        px[q + 1] = tile[k + 1];
        px[q + 2] = tile[k + 2];
      } else {
        px[q] = b0;
        px[q + 1] = b1;
        px[q + 2] = b2;
      }
      px[q + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function drawFiltered(ctx, layer, pw, ph, s, ox, oy) {
  var bb = bounds(layer.shapes);
  if (!bb) return;
  var pad = 4;
  var x0 = Math.max(0, Math.floor(bb.minX * s + ox - pad));
  var y0 = Math.max(0, Math.floor(bb.minY * s + oy - pad));
  var x1 = Math.min(pw, Math.ceil(bb.maxX * s + ox + pad));
  var y1 = Math.min(ph, Math.ceil(bb.maxY * s + oy + pad));
  var bw = x1 - x0,
    bh = y1 - y0;
  if (bw < 1 || bh < 1) return;
  var off = new OffscreenCanvas(bw, bh);
  var octx = off.getContext('2d');
  octx.setTransform(s, 0, 0, s, ox - x0, oy - y0);
  drawShapes(octx, layer.shapes);
  octx.setTransform(1, 0, 0, 1, 0, 0);

  var img = octx.getImageData(0, 0, bw, bh);
  var pix = img.data;
  var f = layer.filter;
  var doFade = f.passes.indexOf('fade') >= 0;
  var doWispy = f.passes.indexOf('wispy') >= 0;
  // 像素左上角 → 画布单位 → 原作图层像素坐标 (Swift: ax / bx / by)
  var ax = (1 / s) * f.scale;
  var bx = ((x0 - ox) / s) * f.scale + f.offsetX;
  var by = ((y0 - oy) / s) * f.scale + f.offsetY;
  for (var py = 0; py < bh; py++) {
    var ly = py * ax + by;
    for (var pxi = 0; pxi < bw; pxi++) {
      var q = (py * bw + pxi) * 4;
      var a = pix[q + 3];
      if (a === 0) continue;
      var lx = pxi * ax + bx;
      var r = pix[q],
        g = pix[q + 1],
        b = pix[q + 2];
      var out;
      if (doFade) {
        out = Filter.fade(lx, ly, r, g, b, a);
        a = clampedByte(out[3]);
      }
      if (doWispy) {
        out = Filter.wispy(lx, ly, r, g, b, a);
        g = out[1];
        b = out[2];
        a = out[3];
      }
      pix[q] = clampedByte(r);
      pix[q + 1] = clampedByte(g);
      pix[q + 2] = clampedByte(b);
      pix[q + 3] = clampedByte(a);
    }
  }
  octx.putImageData(img, 0, 0);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = layer.blend === 'multiply' ? 'multiply' : 'source-over';
  ctx.globalAlpha = layer.opacity;
  ctx.drawImage(off, x0, y0);
  ctx.restore();
}

/** LayerMist.ridgeY(at:) —— 山脊线性插值。 */
function ridgeY(mist, x) {
  var ridge = mist.ridge;
  if (!ridge || ridge.length === 0) return Infinity;
  var f = (x - mist.ridgeX0) / mist.ridgeStep;
  var i = Math.floor(f);
  if (i < 0) return ridge[0];
  if (i >= ridge.length - 1) return ridge[ridge.length - 1];
  var a = ridge[i],
    b = ridge[i + 1];
  if (!isFinite(a)) return b;
  if (!isFinite(b)) return a;
  return a + (b - a) * (f - i);
}

/** LayerMist.keep: 山脊以下 depth 内平滑淡出 × 雾底平滑淡出 × 峰顶不透明度。 */
function mistKeep(mist, y, ry) {
  function smooth(t) {
    var u = Math.min(Math.max(t, 0), 1);
    return u * u * (3 - 2 * u);
  }
  var a = 1 - smooth((y - ry) / Math.max(mist.depth, 1e-6));
  var b = isFinite(mist.floorY) ? 1 - smooth((y - (mist.floorY - mist.floorDepth)) / Math.max(mist.floorDepth, 1e-6)) : 1;
  return mist.peakOpacity * a * b;
}

/** 预乘 RGBA 的箱式模糊 (先横后竖, 边缘按透明; 整数运算, 同 Swift boxBlur)。 */
function boxBlur(pix, w, h, r) {
  if (!(r > 0) || w <= 0 || h <= 0) return;
  var n = 2 * r + 1;
  var half = Math.floor(n / 2);
  var line = new Int32Array(Math.max(w, h) * 4);
  var x, y, c, k, acc, add, sub;
  for (y = 0; y < h; y++) {
    var row = y * w * 4;
    for (var i = 0; i < w * 4; i++) line[i] = pix[row + i];
    for (c = 0; c < 4; c++) {
      acc = 0;
      for (k = 0; k <= Math.min(r, w - 1); k++) acc += line[k * 4 + c];
      for (x = 0; x < w; x++) {
        pix[row + x * 4 + c] = Math.trunc((acc + half) / n);
        add = x + r + 1;
        sub = x - r;
        if (add < w) acc += line[add * 4 + c];
        if (sub >= 0) acc -= line[sub * 4 + c];
      }
    }
  }
  for (x = 0; x < w; x++) {
    for (y = 0; y < h; y++) for (c = 0; c < 4; c++) line[y * 4 + c] = pix[(y * w + x) * 4 + c];
    for (c = 0; c < 4; c++) {
      acc = 0;
      for (k = 0; k <= Math.min(r, h - 1); k++) acc += line[k * 4 + c];
      for (y = 0; y < h; y++) {
        pix[(y * w + x) * 4 + c] = Math.trunc((acc + half) / n);
        add = y + r + 1;
        sub = y - r;
        if (add < h) acc += line[add * 4 + c];
        if (sub >= 0) acc -= line[sub * 4 + c];
      }
    }
  }
}

/** 雾化层 (远山): 低分辨率离屏 → 按山脊深度淡出 → 两遍箱式模糊 → 平滑放大贴回 (Swift drawMisted, ppu = 1)。 */
function drawMisted(ctx, layer, pw, ph, s, ox, oy, grid) {
  var bb = bounds(layer.shapes);
  if (!bb) return;
  var mist = layer.mist;
  var radius = 3;
  var unit = Math.max(1, Math.round((mist.blur * s) / radius));
  var blurCtx = (2 * radius + 2) * unit;
  var lbx0 = bb.minX * s + ox - blurCtx,
    lby0 = bb.minY * s + oy - blurCtx;
  var lbx1 = bb.maxX * s + ox + blurCtx,
    lby1 = bb.maxY * s + oy + blurCtx;
  var nx0 = Math.max(-blurCtx, lbx0),
    ny0 = Math.max(-blurCtx, lby0);
  var nx1 = Math.min(pw + blurCtx, lbx1),
    ny1 = Math.min(ph + blurCtx, lby1);
  if (!(nx1 > nx0) || !(ny1 > ny0)) return;
  // @3 洗墨源 / 色带的局部原点各异, 雾的低分辨率格点仍锚在整幅原点。
  var gridX = grid ? grid.x : 0, gridY = grid ? grid.y : 0;
  var gx0 = Math.floor((nx0 + gridX) / unit),
    gx1 = Math.ceil((nx1 + gridX) / unit);
  var gy0 = Math.floor((ny0 + gridY) / unit),
    gy1 = Math.ceil((ny1 + gridY) / unit);
  var lw = gx1 - gx0,
    lh = gy1 - gy0;
  if (lw <= 0 || lh <= 0) return;
  var bxo = gx0 * unit - gridX,
    byo = gy0 * unit - gridY;
  var off = new OffscreenCanvas(lw, lh);
  var octx = off.getContext('2d');
  octx.setTransform(s / unit, 0, 0, s / unit, (ox - bxo) / unit, (oy - byo) / unit);
  drawShapes(octx, layer.shapes);
  octx.setTransform(1, 0, 0, 1, 0, 0);
  var img = octx.getImageData(0, 0, lw, lh);
  var pix = img.data;
  // Canvas 给的是非预乘; Swift 在预乘缓冲上做 (四个通道同乘 k 再模糊)。
  var pre = new Uint8ClampedArray(pix.length);
  var ridgeCol = new Float64Array(lw);
  for (var x = 0; x < lw; x++) ridgeCol[x] = ridgeY(mist, ((gx0 + x + 0.5) * unit - gridX - ox) / s);
  for (var y = 0; y < lh; y++) {
    var ly = ((gy0 + y + 0.5) * unit - gridY - oy) / s;
    for (x = 0; x < lw; x++) {
      var q = (y * lw + x) * 4;
      var A = pix[q + 3];
      if (A === 0) continue;
      var kk = mistKeep(mist, ly, ridgeCol[x]);
      var af = A / 255;
      pre[q] = Math.round(pix[q] * af * kk);
      pre[q + 1] = Math.round(pix[q + 1] * af * kk);
      pre[q + 2] = Math.round(pix[q + 2] * af * kk);
      pre[q + 3] = Math.round(A * kk);
    }
  }
  boxBlur(pre, lw, lh, radius);
  boxBlur(pre, lw, lh, radius);
  for (var i = 0; i < pix.length; i += 4) {
    var a = pre[i + 3];
    if (a === 0) {
      pix[i] = pix[i + 1] = pix[i + 2] = pix[i + 3] = 0;
      continue;
    }
    pix[i] = Math.round((pre[i] * 255) / a);
    pix[i + 1] = Math.round((pre[i + 1] * 255) / a);
    pix[i + 2] = Math.round((pre[i + 2] * 255) / a);
    pix[i + 3] = a;
  }
  octx.putImageData(img, 0, 0);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = layer.blend === 'multiply' ? 'multiply' : 'source-over';
  ctx.globalAlpha = layer.opacity;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(off, bxo, byo, lw * unit, lh * unit);
  ctx.restore();
}

/** ZXArtRenderer.drawWashed / WashSamples (kit 6556ee2).
 * 持久源是半分辨率的一字节 alpha; Canvas 无 alphaOnly, 只在提取时短暂使用 RGBA。
 * 颜色按固定 64 行横带重画, 每带扩两行及采样 halo, 最后只贴核心区。
 */
function washSamples(data, width, height, channels, x0, y0) {
  function pixel(x, y) {
    if (x < 0 || y < 0 || x >= width || y >= height) return [0, 0, 0, 0];
    var i = (y * width + x) * channels;
    if (channels === 1) return [data[i] / 255, 0, 0, 0];
    // getImageData 是直 alpha, Swift 的 WashSamples 读预乘 RGBA。
    var a = data[i + 3] / 255;
    return [data[i] / 255 * a, data[i + 1] / 255 * a, data[i + 2] / 255 * a, a];
  }
  return function (x, y) {
    var fx = Math.floor(x), fy = Math.floor(y), ix = fx - x0, iy = fy - y0, tx = x - fx, ty = y - fy;
    var a = pixel(ix, iy), b = pixel(ix + 1, iy), c = pixel(ix, iy + 1), d = pixel(ix + 1, iy + 1);
    return a.map(function (v, k) { return (v * (1 - tx) + b[k] * tx) * (1 - ty) + (c[k] * (1 - tx) + d[k] * tx) * ty; });
  };
}

function drawWashed(ctx, layer, drawing, pw, ph, s, ox, oy) {
  var bb = bounds(layer.shapes);
  if (!bb || !(s > 0)) return;
  var noise = ZXArtCompose.WashNoise, unitClamp = ZXArtCompose.Brush.unit, wash = layer.wash;
  var bleed = wash && Number.isFinite(wash.bleed) ? Math.max(0, wash.bleed) : 0;
  var rim = wash && Number.isFinite(wash.rim) ? Math.max(0, wash.rim) : 0;
  var grain = unitClamp(wash ? wash.grain : 0), unit = wash && !wash.fullResolution ? 2 : 1, logicalUnit = unit / s;
  var support = 1.73 * bleed + 3 * logicalUnit, strokePad = 0;
  layer.shapes.forEach(function (shape) { strokePad = Math.max(strokePad, shape.lineWidth * 5); });
  var pad = (support + strokePad) * s;
  var minX = Math.max(bb.minX * s + ox - pad, -2 * unit), minY = Math.max(bb.minY * s + oy - pad, -2 * unit);
  var maxX = Math.min(bb.maxX * s + ox + pad, pw + 2 * unit), maxY = Math.min(bb.maxY * s + oy + pad, ph + 2 * unit);
  if (!(maxX > minX && maxY > minY)) return;
  var x0 = Math.floor(minX / unit), x1 = Math.ceil(maxX / unit), y0 = Math.floor(minY / unit), y1 = Math.ceil(maxY / unit);
  var halo = Math.ceil(support / logicalUnit), sx0 = x0 - halo, sy0 = y0 - halo;
  var sw = x1 - x0 + 2 * halo, sh = y1 - y0 + 2 * halo;
  var base = Object.assign({}, layer, { blend: 'normal', opacity: 1, wash: null, tooth: null });
  function raster(gx, gy, width, height) {
    var off = new OffscreenCanvas(width, height), octx = off.getContext('2d', { willReadFrequently: true });
    var scale = s / unit, tx = ox / unit - gx, ty = oy / unit - gy;
    if (base.filter) drawFiltered(octx, base, width, height, scale, tx, ty);
    else if (base.mist) drawMisted(octx, base, width, height, scale, tx, ty, { x: gx, y: gy });
    else { octx.setTransform(scale, 0, 0, scale, tx, ty); drawShapes(octx, base.shapes); }
    var pixels = octx.getImageData(0, 0, width, height).data;
    off.width = off.height = 1;
    return pixels;
  }
  var alphaSample = null;
  if (wash) {
    var pixels = raster(sx0, sy0, sw, sh), alpha = new Uint8Array(sw * sh);
    for (var i = 0; i < alpha.length; i++) alpha[i] = pixels[i * 4 + 3];
    pixels = null;
    alphaSample = washSamples(alpha, sw, sh, 1, sx0, sy0);
  }
  var width = x1 - x0;
  for (var start = y0; start < y1; start += 64) {
    var end = Math.min(start + 64, y1), top = start - 2, rows = end + 2 - top;
    var colorTop = top - halo, colorRows = rows + 2 * halo;
    var colors = washSamples(raster(sx0, colorTop, sw, colorRows), sw, colorRows, 4, sx0, colorTop);
    var output = new OffscreenCanvas(width, rows), outctx = output.getContext('2d'), image = outctx.createImageData(width, rows);
    for (var row = 0; row < rows; row++) {
      var gy = top + row, ly = ((gy + 0.5) * unit - oy) / s;
      for (var column = 0; column < width; column++) {
        var gx = x0 + column, lx = ((gx + 0.5) * unit - ox) / s;
        var originalColor = colors(gx, gy), color = originalColor, opacity = originalColor[3];
        if (alphaSample) {
          var original = alphaSample(gx, gy)[0], displacement = noise.displacement(lx, ly, bleed);
          var qx = gx + displacement[0] / logicalUnit, qy = gy + displacement[1] / logicalUnit;
          var a = 0, b = 0, inner = [0, 0, 0, 0], outer = [0, 0, 0, 0];
          for (var j = 0; j < noise.disk.length; j++) {
            var point = noise.disk[j], ir = 0.5 * bleed / logicalUnit, or = 1.35 * bleed / logicalUnit;
            var ax = qx + point[0] * ir, ay = qy + point[1] * ir, bx = qx + point[0] * or, by = qy + point[1] * or;
            a += alphaSample(ax, ay)[0] / 12; b += alphaSample(bx, by)[0] / 12;
            var ci = colors(ax, ay), co = colors(bx, by);
            for (var k = 0; k < 4; k++) { inner[k] += ci[k] / 12; outer[k] += co[k] / 12; }
          }
          var nz = noise.fbm(lx, ly, 0x94D049BB);
          opacity = (original * 0.28 + a * 0.72) * (0.86 + 0.22 * nz) + Math.max(0, a - b) * rim * (0.8 + 0.5 * nz) + b * 0.1;
          opacity *= 1 + grain * (noise.value(lx * 2.3, ly * 2.3, 0x369DEA0F) - 0.5) * 0.3;
          color = originalColor.map(function (v, k) { return v * 0.28 + inner[k] * 0.72 + outer[k] * 0.1; });
        }
        opacity = unitClamp(opacity) * noise.tooth(layer.tooth, drawing.paper, lx, ly);
        if (layer.rim) opacity *= noise.rimKeep(layer.rim, lx, ly);
        if (layer.fade) opacity *= noise.fadeKeep(layer.fade, lx, ly);
        var index = (row * width + column) * 4, gain = color[3] > 0 ? opacity / color[3] : 0;
        var alphaByte = Math.round(opacity * 255);
        // Swift 写回的是预乘 byte; Canvas putImageData 需要反预乘。
        for (var channel = 0; channel < 3; channel++) {
          var premultiplied = Math.round(unitClamp(color[channel] * gain) * 255);
          image.data[index + channel] = alphaByte > 0 ? Math.round(premultiplied * 255 / alphaByte) : 0;
        }
        image.data[index + 3] = alphaByte;
      }
    }
    outctx.putImageData(image, 0, 0);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = layer.blend === 'multiply' ? 'multiply' : 'source-over'; ctx.globalAlpha = layer.opacity;
    ctx.beginPath(); ctx.rect(x0 * unit, start * unit, width * unit, (end - start) * unit); ctx.clip();
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'low';
    ctx.drawImage(output, x0 * unit, top * unit, width * unit, rows * unit); ctx.restore();
    output.width = output.height = 1;
  }
}

function render(drawing, pw, ph) {
  var canvas = new OffscreenCanvas(pw, ph);
  var ctx = canvas.getContext('2d');
  var s = Math.max(pw / drawing.width, ph / drawing.height);
  var ox = pw / 2 - (drawing.width * s) / 2;
  var oy = ph / 2 - (drawing.height * s) / 2;
  fillGround(ctx, drawing, pw, ph, s, ox, oy);
  drawing.layers.forEach(function (layer) {
    if (layer.wash || layer.tooth != null || layer.rim || layer.fade) {
      drawWashed(ctx, layer, drawing, pw, ph, s, ox, oy);
      return;
    }
    if (layer.filter) {
      drawFiltered(ctx, layer, pw, ph, s, ox, oy);
      return;
    }
    if (layer.mist) {
      drawMisted(ctx, layer, pw, ph, s, ox, oy);
      return;
    }
    ctx.save();
    ctx.globalCompositeOperation = layer.blend === 'multiply' ? 'multiply' : 'source-over';
    ctx.globalAlpha = layer.opacity;
    ctx.setTransform(s, 0, 0, s, ox, oy);
    drawShapes(ctx, layer.shapes);
    ctx.restore();
  });
  return canvas.transferToImageBitmap();
}

self.onmessage = function (event) {
  var req = event.data || {};
  var t0 = Date.now();
  try {
    var scripts = ZXArtCompose.SCRIPTS[req.generator];
    if (!scripts) throw new Error('unknown generator ' + req.generator);
    importScripts.apply(self, scripts);
    var pw = Math.max(1, Math.round(req.width));
    var ph = Math.max(1, Math.round(req.height));
    var drawing = ZXArtCompose.generate({
      generator: req.generator,
      allowsShanShuiV3: req.allowsShanShuiV3 === true,
      seed: req.seed,
      variant: req.variant,
      scene: req.scene,
      params: req.params,
      palette: req.palette,
      width: pw,
      height: ph,
      loadPaperScript: function () {
        importScripts(ZXArtCompose.SHANSHUI_PAPER_SCRIPT);
      },
    });
    // Optional study control; existing callers retain the engine's original texture strength.
    if (req.paperStrength !== undefined) {
      if (!Number.isFinite(req.paperStrength) || req.paperStrength < 0 || req.paperStrength > 1) throw new Error('paperStrength must be between 0 and 1');
      if (drawing.paper) drawing.paper.strength *= req.paperStrength;
    }
    var bitmap = render(drawing, pw, ph);
    self.postMessage({
      ok: true,
      bitmap: bitmap,
      ms: Date.now() - t0,
      verse: drawing.verse || null,
      anchors: drawing.anchors || null,
      sceneElements: drawing.sceneElements || null,
      ...(drawing.brushwork ? {brushwork:drawing.brushwork} : {})
    }, [bitmap]);
  } catch (error) {
    self.postMessage({ ok: false, error: String((error && error.message) || error) });
  }
};
