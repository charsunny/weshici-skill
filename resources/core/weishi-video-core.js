/**
 * @weishi/video-core — 微诗视频工作台核心确定性运行时
 *
 * 对齐规范：
 * - docs/HUAPING_MOTION_PLAN.md（天气点缀、HuapingInkReveal 墨洇与落印、HuapingVideoTiming 时长公式）
 * - docs/THEME_PALETTES.md & ios/Shared/Huaping/mood-palettes.json（传统色与情绪色板）
 * - tools/video-studio/TECHNIQUE.md（window.DUR / render(t) / READY / EV / TEXTS(t) 契约）
 */

// ============================================================================
// 1. 确定性数学、缓动与伪随机数 (PRNG)
// ============================================================================

export const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const inv = (a, b, v) => clamp((v - a) / (b - a), 0, 1);

export const easeOut = (t) => 1 - Math.pow(1 - clamp(t), 3);
export const easeIn = (t) => Math.pow(clamp(t), 3);
export const easeInOut = (t) => {
  const x = clamp(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
export const easeOutBack = (t) => {
  const x = clamp(t);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};
export const spring = (t) => {
  const x = clamp(t);
  return 1 - Math.exp(-6 * x) * Math.cos(8 * x);
};

/** 幕包络：入场 [t0, t0+fadeIn]，退场 [t1-fadeOut, t1] */
export function sceneAlpha(t, t0, t1, fadeIn = 0.6, fadeOut = 0.6) {
  if (t < t0 || t > t1) return 0;
  const a = fadeIn > 0 ? easeInOut(inv(t0, t0 + fadeIn, t)) : 1;
  const b = fadeOut > 0 ? 1 - easeInOut(inv(t1 - fadeOut, t1, t)) : 1;
  return a * b;
}

/** 字符串转 32 位整数种子 */
export function hashSeed(str) {
  const s = String(str || 'weishi');
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 确定性 PRNG (Mulberry32) */
export function mulberry32(seedInput) {
  let a = typeof seedInput === 'number' ? seedInput >>> 0 : hashSeed(seedInput);
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ============================================================================
// 2. 微诗传统色与情绪配色库 (对齐 mood-palettes.json & THEME_PALETTES.md)
// ============================================================================

export const PALETTES = {
  yaqing: {
    id: 'yaqing',
    name: '鸦青',
    inkName: '苍黑',
    light: { paper: '#F4F5F3', ink: '#181C1E', wash: '#8E999E', accent: '#000000', seal: '#9B382B' },
    dark: { paper: '#121E21', ink: '#EBF0F2', wash: '#3A4E54', accent: '#F2F2F2', seal: '#EE9C88' },
  },
  yuebai: {
    id: 'yuebai',
    name: '月白',
    inkName: '黛蓝',
    light: { paper: '#DCECEF', ink: '#425066', wash: '#9DB8C3', accent: '#3F6A80', seal: '#9B382B' },
    dark: { paper: '#141D1F', ink: '#CDE5EA', wash: '#3B5C6C', accent: '#619AB8', seal: '#B04A3A' },
  },
  lanhui: {
    id: 'lanhui',
    name: '蓝灰',
    inkName: '玄青',
    light: { paper: '#E3E7F0', ink: '#3D3B4F', wash: '#A8B3C8', accent: '#50658B', seal: '#9B382B' },
    dark: { paper: '#14181F', ink: '#D2D8E5', wash: '#424E66', accent: '#6F84AC', seal: '#B04A3A' },
  },
  ouhe: {
    id: 'ouhe',
    name: '藕荷',
    inkName: '黛紫',
    light: { paper: '#F2E1E6', ink: '#574266', wash: '#CEA5B2', accent: '#984B65', seal: '#9B382B' },
    dark: { paper: '#1F1418', ink: '#E8CFD7', wash: '#6C404F', accent: '#B96C86', seal: '#B04A3A' },
  },
  xiangse: {
    id: 'xiangse',
    name: '缃色',
    inkName: '紫檀',
    light: { paper: '#F5EDD6', ink: '#4C221B', wash: '#CCB39C', accent: '#8E5C46', seal: '#9B382B' },
    dark: { paper: '#1F1C14', ink: '#EAE2CD', wash: '#6C4C3B', accent: '#B87B61', seal: '#B04A3A' },
  },
  huanglu: {
    id: 'huanglu',
    name: '黄栌',
    inkName: '紫檀',
    light: { paper: '#F7E5CF', ink: '#4C221B', wash: '#CBAD97', accent: '#8A5A44', seal: '#9B382B' },
    dark: { paper: '#1F1A14', ink: '#EADDCD', wash: '#6C4A3B', accent: '#B87B61', seal: '#B04A3A' },
  },
  qiuxiang: {
    id: 'qiuxiang',
    name: '秋香',
    inkName: '玄青',
    light: { paper: '#F0EBD3', ink: '#3D3B4F', wash: '#C0B597', accent: '#79633C', seal: '#9B382B' },
    dark: { paper: '#1F1D14', ink: '#EAE5CD', wash: '#6C5B3B', accent: '#B89861', seal: '#B04A3A' },
  },
  zhuqing: {
    id: 'zhuqing',
    name: '竹青',
    inkName: '黛绿',
    light: { paper: '#E9EEE5', ink: '#426666', wash: '#AEBBA4', accent: '#566E42', seal: '#9B382B' },
    dark: { paper: '#191F14', ink: '#DBE2D4', wash: '#526442', accent: '#8AA970', seal: '#B04A3A' },
  },
  yaluanqing: {
    id: 'yaluanqing',
    name: '鸭卵青',
    inkName: '苍黛',
    light: { paper: '#E3F0EA', ink: '#50616D', wash: '#A3BDB6', accent: '#447169', seal: '#9B382B' },
    dark: { paper: '#141F1A', ink: '#D1E6DD', wash: '#42645C', accent: '#689B8F', seal: '#B04A3A' },
  },
};

export function resolvePalette(id = 'yaqing', scheme = 'light') {
  const entry = PALETTES[id] || PALETTES.yaqing;
  const mode = scheme === 'dark' ? 'dark' : 'light';
  return {
    id: entry.id,
    name: entry.name,
    inkName: entry.inkName,
    scheme: mode,
    ...entry[mode],
  };
}

export function hexToRgb(hex) {
  const clean = String(hex || '#000000').replace('#', '');
  const n = parseInt(clean.length === 3 ? clean.replace(/(.)/g, '$1$1') : clean.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgba(hex, alpha = 1) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1).toFixed(3)})`;
}

// ============================================================================
// 3. HuapingInkReveal 诗句墨洇与落印时间函数 (对齐 HUAPING_MOTION_PLAN.md §4 & §6)
// ============================================================================

/**
 * 计算单字或单行的墨洇状态：
 * - 每单元时长 0.25s ease-out（blur 6px->0, scale 1.06->1, opacity 0->1）
 * - 单元错开默认 0.12s（若传入 maxSpan 则自动压缩错开以保证按时完成）
 */
export function inkUnitState(t, startTime, index, totalUnits = 1, options = {}) {
  const unitDur = options.unitDuration ?? 0.25;
  const defaultStagger = options.stagger ?? 0.12;
  const maxSpan = options.maxSpan ?? 2.2;
  const rawStagger = totalUnits > 1 ? Math.min(defaultStagger, Math.max(0.03, (maxSpan - unitDur) / (totalUnits - 1))) : 0;
  const t0 = startTime + index * rawStagger;
  const p = easeOut(inv(t0, t0 + unitDur, t));
  const blur = (1 - p) * 6;
  const scale = lerp(1.06, 1.0, p);
  const y = (1 - p) * (options.offsetY ?? 6);
  return {
    progress: p,
    opacity: p,
    blur,
    scale,
    y,
    doneTime: startTime + Math.max(0, totalUnits - 1) * rawStagger + unitDur,
    style: `opacity:${p.toFixed(3)};transform:translateY(${y.toFixed(1)}px) scale(${scale.toFixed(3)});filter:blur(${blur.toFixed(2)}px)`,
  };
}

/**
 * 落印状态（HuapingInkReveal）：0.2s 内从 scale 1.15 落到 1.0，三次 ease-out，无回弹。
 * 新模板用 huaping-video.js 的 sealState；此处保留给尚未改写的模板，数值与之相同。
 */
export function sealStampState(t, stampStartTime, duration = 0.2) {
  const p = easeOut(inv(stampStartTime, stampStartTime + duration, t));
  const scale = 1 + 0.15 * (1 - p);
  return {
    progress: p,
    opacity: p,
    scale,
    style: `opacity:${p.toFixed(3)};transform:scale(${scale.toFixed(3)})`,
  };
}

/**
 * 视频总时长公式（对齐 HuapingVideoTiming）：
 * ceil(入场结束 + clamp(正文字数 * 0.3, 6, 20))
 */
export function computeHuapingDuration(charCount, entryEnd = 2.6) {
  const hold = clamp(charCount * 0.3, 6, 20);
  return Math.ceil(entryEnd + hold);
}

// ============================================================================
// 4. ZixiaoArt 程序化山水/花鸟 Web Worker 桥接
// ============================================================================

/**
 * 调用 /vendor/zxart/zxart-worker.js 生成与 iOS 逐形状对齐的程序化画屏并绘制到目标 Canvas
 */
export function renderZXArt(canvas, req, workerUrl = '/vendor/zxart/zxart-worker.js') {
  return new Promise((resolve) => {
    const width = Math.max(1, Math.round(req.width || canvas.width || 1080));
    const height = Math.max(1, Math.round(req.height || canvas.height || 1920));
    canvas.width = width;
    canvas.height = height;

    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    try {
      const worker = new Worker(workerUrl);
      const timer = setTimeout(() => {
        worker.terminate();
        drawFallbackShanShui(canvas, req);
        finish({ ok: false, fallback: true, error: 'timeout' });
      }, 15000);

      worker.onmessage = (ev) => {
        clearTimeout(timer);
        worker.terminate();
        const data = ev.data || {};
        if (data.ok && data.bitmap) {
          const ctx = canvas.getContext('2d');
          ctx.clearRect(0, 0, width, height);
          ctx.drawImage(data.bitmap, 0, 0, width, height);
          // Canvas 2D may defer the draw; read one pixel back so it lands before the bitmap is released.
          ctx.getImageData(0, 0, 1, 1);
          if (typeof data.bitmap.close === 'function') data.bitmap.close();
          finish({
            ok: true,
            ms: data.ms,
            verse: data.verse,
            anchors: data.anchors,
            sceneElements: data.sceneElements,
            ...(data.brushwork ? {brushwork:data.brushwork} : {}),
          });
        } else {
          drawFallbackShanShui(canvas, req);
          finish({ ok: false, fallback: true, error: data.error });
        }
      };

      worker.onerror = (err) => {
        clearTimeout(timer);
        worker.terminate();
        drawFallbackShanShui(canvas, req);
        finish({ ok: false, fallback: true, error: String(err?.message || err) });
      };

      const variantMap = {
        distant: '远山',
        riverbank: '江岸',
        alpine: '高山',
        misty: '江岸',
        retreat: '山居林泉',
        fishing: '寒江独钓',
        waterTown: '江南水乡',
        farewell: '长亭送别',
        village: '田园村舍',
        spring: '春江花月',
        lotusPond: '荷塘清趣',
        autumnTravel: '秋山行旅',
        winterForest: '冬雪寒林',
        moonNight: '松风明月',
        temple: '古寺钟鸣',
        courtyard: '庭院深幽',
        historic: '故国怀古',
        desert: '边塞大漠',
        ocean: '沧海烟波',
      };
      const rawVar = req.variant || req.scene || '山居林泉';
      const normVariant = variantMap[rawVar] || rawVar;

      const generator = req.generator || 'shanshui@5';
      worker.postMessage({
        generator,
        seed: String(req.seed || 'weishi-2026'),
        variant: normVariant,
        scene: req.scene || normVariant,
        params: req.params || { density: 0.9, quiet_top: 0.32, verse_side: 'left', verse_columns: 4, verse_chars: 10 },
        palette: req.palette || { paper: '#DCECEF', ink: '#425066' },
        paperStrength: req.paperStrength,
        width,
        height,
      });
    } catch (e) {
      drawFallbackShanShui(canvas, req);
      finish({ ok: false, fallback: true, error: String(e) });
    }
  });
}

/** 离线或 Worker 异常时的确定性层峦山水兜底绘制 */
export function drawFallbackShanShui(canvas, req) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const paper = req?.palette?.paper || '#DCECEF';
  const ink = req?.palette?.ink || '#425066';
  const rand = mulberry32(req?.seed || 'fallback');

  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, w, h);

  const layers = [
    { yBase: 0.46, amp: 0.07, alpha: 0.14, freq: 2.2 },
    { yBase: 0.54, amp: 0.08, alpha: 0.22, freq: 3.1 },
    { yBase: 0.63, amp: 0.06, alpha: 0.34, freq: 3.8 },
    { yBase: 0.73, amp: 0.04, alpha: 0.48, freq: 4.5 },
  ];

  layers.forEach((layer, idx) => {
    const phase = rand() * Math.PI * 2;
    const phase2 = rand() * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 8) {
      const nx = x / w;
      const ridge =
        layer.yBase +
        Math.sin(nx * layer.freq * Math.PI + phase) * layer.amp +
        Math.cos(nx * layer.freq * 2.3 * Math.PI + phase2) * (layer.amp * 0.42);
      ctx.lineTo(x, ridge * h);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, (layer.yBase - layer.amp) * h, 0, h);
    grad.addColorStop(0, rgba(ink, layer.alpha));
    grad.addColorStop(0.55, rgba(ink, layer.alpha * 0.35));
    grad.addColorStop(1, rgba(paper, 0.05));
    ctx.fillStyle = grad;
    ctx.fill();
  });
}

// ============================================================================
// 5. 时令天气选择与确定性绘制 (对齐 HUAPING_MOTION_PLAN.md §3.2 & §3.3)
// ============================================================================

/**
 * 纯函数：根据诗文、标题、节气、深浅色选出最多 2 种天气 + 渔灯
 */
export function chooseWeather({ text = '', title = '', term = '', scheme = 'light', hasBoat = true } = {}) {
  const full = `${title} ${text}`;
  const picked = [];

  const add = (k) => {
    if (picked.includes(k) || picked.length >= 2) return;
    if ((k === 'rain' && picked.includes('snow')) || (k === 'snow' && picked.includes('rain'))) return;
    if ((k === 'moon' && picked.includes('sunset')) || (k === 'sunset' && picked.includes('moon'))) return;
    picked.push(k);
  };

  if (/[雨霖梅雨]/.test(full)) add('rain');
  if (/[雪霜冰寒]/.test(full) && /雪/.test(full)) add('snow');
  if (/[月婵娟玉盘蟾]/.test(full)) add('moon');
  if (/[夕斜阳落日暮晚残阳]/.test(full)) add('sunset');
  if (/[雁鸿]/.test(full)) add('geese');
  if (/[烟岚雾靄]/.test(full)) add('mist');

  if (picked.length === 0 && term) {
    if (['清明', '谷雨', '雨水'].includes(term)) add('rain');
    else if (['小雪', '大雪', '冬至', '小寒', '大寒'].includes(term)) add('snow');
    else if (['白露', '秋分', '寒露', '霜降'].includes(term)) {
      add('geese');
      add('mist');
    }
  }

  if (picked.length === 0) add('mist');
  if (scheme === 'dark' && !picked.includes('sunset') && !picked.includes('moon') && picked.length < 2) {
    add('moon');
  }

  // 渔灯：深色外观 + 有船，不占「最多两种」名额（HUAPING_MOTION_PLAN §3.2）
  if (scheme === 'dark' && hasBoat) {
    picked.push('lantern');
  }

  return picked;
}

/**
 * 确定性绘制天气与水面余韵层（只用墨色、纸白与朱砂印色）
 */
export function drawWeather(ctx, { width, height, t, seed = 'weather', kinds = ['mist'], palette, boatAnchor = null }) {
  ctx.clearRect(0, 0, width, height);
  const ink = palette?.ink || '#3D3B4F';
  const paper = palette?.paper || '#F4F5F3';
  const seal = palette?.seal || '#9B382B';
  const isDark = palette?.scheme === 'dark';

  // 1. 明月 + 水中碎月影
  if (kinds.includes('moon')) {
    const mx = width * 0.76;
    const my = height * 0.19 - Math.min(18, t * 1.4);
    const mr = Math.round(width * 0.048);
    const moonColor = isDark ? '#F2EFE6' : '#FFFFFF';

    const halo = ctx.createRadialGradient(mx, my, mr * 0.5, mx, my, mr * 3.2);
    halo.addColorStop(0, rgba(moonColor, isDark ? 0.32 : 0.45));
    halo.addColorStop(0.5, rgba(moonColor, isDark ? 0.10 : 0.15));
    halo.addColorStop(1, rgba(moonColor, 0));
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(mx, my, mr * 3.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = rgba(moonColor, isDark ? 0.88 : 0.92);
    ctx.beginPath();
    ctx.arc(mx, my, mr, 0, Math.PI * 2);
    ctx.fill();

    // 水中碎月影
    const waterY = height * 0.78;
    for (let i = 0; i < 9; i++) {
      const ry = waterY + i * 14;
      const sway = Math.sin(t * 2.1 + i * 0.9) * 10;
      const rw = (mr * 1.15) * (1 - i * 0.07) + Math.cos(t * 1.7 + i) * 6;
      ctx.strokeStyle = rgba(moonColor, (isDark ? 0.26 : 0.35) * (1 - i * 0.08));
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(mx + sway - rw * 0.5, ry);
      ctx.lineTo(mx + sway + rw * 0.5, ry);
      ctx.stroke();
    }
  }

  // 2. 落日（朱砂圆，透明度 <= 0.45，缓慢下沉）
  if (kinds.includes('sunset')) {
    const sx = width * 0.73;
    const sy = height * 0.23 + Math.min(28, t * 1.6);
    const sr = Math.round(width * 0.056);
    const sunGrad = ctx.createRadialGradient(sx, sy, sr * 0.2, sx, sy, sr * 2.2);
    sunGrad.addColorStop(0, rgba(seal, 0.44));
    sunGrad.addColorStop(0.55, rgba(seal, 0.22));
    sunGrad.addColorStop(1, rgba(seal, 0));
    ctx.fillStyle = sunGrad;
    ctx.beginPath();
    ctx.arc(sx, sy, sr * 2.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = rgba(seal, 0.42);
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fill();
  }

  // 3. 山岚（贴山腰缓慢横移的柔雾带）
  if (kinds.includes('mist')) {
    const mistBands = [
      { y: 0.44, h: 0.09, speed: 18, alpha: isDark ? 0.14 : 0.26 },
      { y: 0.56, h: 0.11, speed: -14, alpha: isDark ? 0.12 : 0.22 },
      { y: 0.67, h: 0.08, speed: 11, alpha: isDark ? 0.10 : 0.18 },
    ];
    mistBands.forEach((b, i) => {
      const cy = height * b.y;
      const bh = height * b.h;
      const dx = Math.sin(t * 0.35 + i * 1.7) * 45 + ((t * b.speed) % (width * 0.4));
      const g = ctx.createRadialGradient(width * 0.5 + dx * 0.5, cy, bh * 0.1, width * 0.5 + dx * 0.5, cy, width * 0.65);
      g.addColorStop(0, rgba(paper, b.alpha));
      g.addColorStop(0.6, rgba(paper, b.alpha * 0.45));
      g.addColorStop(1, rgba(paper, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, cy - bh, width, bh * 2);
    });
  }

  // 4. 雁阵（天空带 7 只「人」字形水墨剪影，双帧开合振翅）
  if (kinds.includes('geese')) {
    const cycle = (t % 14) / 14;
    const leaderX = lerp(width * 0.88, width * 0.18, cycle);
    const leaderY = lerp(height * 0.24, height * 0.16, cycle) + Math.sin(t * 1.2) * 6;
    const count = 7;

    ctx.strokeStyle = rgba(ink, isDark ? 0.72 : 0.62);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';

    for (let i = 0; i < count; i++) {
      const arm = i % 2 === 0 ? 1 : -1;
      const rank = Math.ceil(i / 2);
      const gx = leaderX + rank * 24 + (arm < 0 ? 6 : 0);
      const gy = leaderY + arm * rank * 11 + Math.sin(t * 3.2 + i * 0.7) * 2.5;
      const span = 9 - rank * 0.6;
      const flap = Math.sin(t * 6.5 + i * 0.85) * 4.2;

      ctx.beginPath();
      ctx.moveTo(gx - span, gy - flap);
      ctx.quadraticCurveTo(gx - span * 0.4, gy - 3, gx, gy);
      ctx.quadraticCurveTo(gx + span * 0.4, gy - 3, gx + span, gy - flap);
      ctx.stroke();
    }
  }

  // 5. 细雨 + 水面涟漪（细斜淡墨线，长 16-28px，透明度 <= 0.25）
  if (kinds.includes('rain')) {
    const rand = mulberry32(`${seed}-rain`);
    const dropCount = 48;
    ctx.strokeStyle = rgba(ink, isDark ? 0.24 : 0.22);
    ctx.lineWidth = 1.35;
    ctx.lineCap = 'round';

    for (let i = 0; i < dropCount; i++) {
      const x0 = rand() * (width + 160);
      const y0 = rand() * height;
      const speed = 680 + rand() * 260;
      const len = 18 + rand() * 14;
      const dy = (y0 + t * speed) % height;
      const dx = x0 - dy * 0.18;
      ctx.beginPath();
      ctx.moveTo(dx, dy);
      ctx.lineTo(dx - len * 0.18, dy + len);
      ctx.stroke();
    }

    // 雨落水纹带激起涟漪
    const rRand = mulberry32(`${seed}-ripples`);
    for (let i = 0; i < 8; i++) {
      const rx = width * (0.15 + rRand() * 0.7);
      const ry = height * (0.72 + rRand() * 0.18);
      const period = 1.8 + rRand() * 0.9;
      const phase = ((t + rRand() * period) % period) / period;
      const radX = lerp(4, 38, phase);
      const radY = radX * 0.26;
      ctx.strokeStyle = rgba(ink, (1 - phase) * 0.24);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(rx, ry, radX, radY, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // 6. 飞雪（纸白圆点，慢落、左右微飘，落水即融）
  if (kinds.includes('snow')) {
    const rand = mulberry32(`${seed}-snow`);
    const flakeCount = 56;
    const snowColor = isDark ? '#EDF2F5' : '#FFFFFF';
    const waterLine = height * 0.79;

    for (let i = 0; i < flakeCount; i++) {
      const x0 = rand() * width;
      const y0 = rand() * waterLine;
      const r = 1.6 + rand() * 2.4;
      const speed = 42 + rand() * 36;
      const swayAmp = 14 + rand() * 18;
      const swayFreq = 0.8 + rand() * 0.9;
      const phase = rand() * Math.PI * 2;
      const y = (y0 + t * speed) % waterLine;
      const x = (x0 + Math.sin(t * swayFreq + phase) * swayAmp + width) % width;
      const fadeNearWater = clamp((waterLine - y) / 60, 0, 1);

      ctx.fillStyle = rgba(snowColor, (0.45 + rand() * 0.4) * fadeNearWater);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 7. 渔灯（深色外观下水面孤舟处一点暖光与水波倒影，不重复画船体）
  if (kinds.includes('lantern')) {
    const bx = (boatAnchor?.x ?? 0.61) * width + Math.sin(t * 1.1) * 4;
    const by = (boatAnchor?.y ?? 0.74) * height + Math.cos(t * 1.5) * 2;
    const flicker = 0.84 + 0.16 * Math.sin(t * 5.2) * Math.cos(t * 3.1);
    const lanternColor = '#F0A858';

    ctx.save();
    ctx.translate(bx, by);

    // 船头暖光渔灯
    const glow = ctx.createRadialGradient(0, 0, 1, 0, 0, 32 * flicker);
    glow.addColorStop(0, rgba('#FFE8BF', 0.95 * flicker));
    glow.addColorStop(0.35, rgba(lanternColor, 0.46 * flicker));
    glow.addColorStop(1, rgba(lanternColor, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, 32 * flicker, 0, Math.PI * 2);
    ctx.fill();

    // 水面暖光倒影与微澜
    ctx.strokeStyle = rgba(lanternColor, 0.28 * flicker);
    ctx.lineWidth = 1.5;
    for (let k = 1; k <= 3; k++) {
      const rw = 10 + k * 8 + Math.sin(t * 2.4 + k) * 3;
      ctx.beginPath();
      ctx.moveTo(-rw * 0.5, 8 + k * 5);
      ctx.lineTo(rw * 0.5, 8 + k * 5);
      ctx.stroke();
    }
    ctx.restore();
  }
}
