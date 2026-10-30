# 微诗视频工作台 · 确定性渲染技术规范（TECHNIQUE.md）

> 每一帧画面都必须是时间 $t$（秒）的**纯函数**。不论正放、倒放、跳帧截图还是由 6 个 Headless Chrome 进程分段并行渲染，同一个 $t$ 必须产出像素级完全一致的画面。

---

## 1. 页面标准全局契约（Window Contract）

所有微诗视频场景 HTML 必须在 `window` 上暴露以下 5 个属性/方法：

```js
// 1. 视频总时长（秒）
window.DUR = 18;

// 2. 异步资源就绪标志（字体 document.fonts.ready、ZixiaoArt Worker 位图、图片预加载完成后置为 true）
window.READY = false;

// 3. 确定性帧渲染纯函数：给定 t ∈ [0, window.DUR]，更新 DOM / Canvas 状态
window.render = function (t) {
  // 严禁在此函数中使用 Math.random()、Date.now()、requestAnimationFrame 累加状态或 CSS transition
};

// 4. 声明式音效触发点（供 render.mjs 自动合成东方拟音 Foley）
window.EV = [
  { t: 0.3, sfx: 'qin-harmonic', gain: -8 },
  { t: 0.4, sfx: 'ink-drop', gain: -10 },
  { t: 2.8, sfx: 'seal-stamp', gain: -4 },
];

// 5. 可读文本快照函数（供 readcheck.mjs 自动审计字幕/诗句停留时长）
window.TEXTS = function (t) {
  // 返回当前时刻可见（opacity >= 0.5）的文本块数组：[{ id: 'verse-1', text: '戍鼓断人行，秋边一雁声' }]
  return [];
};
```

### 三条铁律
1. **禁用 CSS `transition` 与 `animation`**：Headless Chrome 跳帧调用 `window.render(t)` 时，基于真实流逝时间的 CSS 过渡会彻底失步。所有位移、缩放、模糊、透明度必须由 `t` 算出并直接写入 `element.style`。
2. **禁用无种子随机数**：凡涉及雨滴、雪花、水纹、雁阵、纸纹噪点，一律使用 `core/weishi-video-core.js` 提供的 `mulberry32(seed)`。
3. **子 `<video>` 帧同步**：若页面内嵌真机录屏 `<video>`，在 `window.render(t)` 中设置 `video.currentTime` 后，导出器 `render.mjs` 会自动等待所有可见 `<video>` 的 `seeked` 事件完成后再截帧。

---

## 2. 微诗核心动效原语

视频模板（`huaping-motion`、`ink-story`）共用 `resources/core/` 下的模块。纯函数都可在 Node 下单测（`tests/huaping-video.test.mjs`）；iOS 的准确值与各输出类别规则见 [iOS 画屏实现基准](IOS-HUAPING.md)。

| 模块 | 内容 |
|---|---|
| `huaping-video.js` | 纯函数：App 配色解析、署名、字号下限、安全区、入场与落印、时长、天气与余韵计划、画面放置与像素处理、叙事与歌词时间线 |
| `huaping-scene.js` | 浏览器端画面管线：载入配方、生成 @5 画、9:16 放置、诗句框上提与清线、余韵取样 |
| `huaping-afterglow.js` | 天气与余韵的画布绘制（只用墨、纸色与朱砂落日） |
| `cinnabar-sun.js` | 海报 v2 的朱砂落日，海报与视频共用 |
| `huaping-video.css` | 视频模板共用的纸、画层与 huaping 排字样式 |
| `weishi-video-core.js` | 旧的公共原语（缓动、PRNG、`renderZXArt` 桥接等） |

### 2.1 诗句墨洇入场与落印（HuapingInkReveal）

- `inkRevealPlan({ count })`：0.3s 起，每字 0.25s、错开 0.12s；题款 0.18s；最后一字后 0.3s 落印，持续 0.2s。分享视频最晚 3.0s 落定，长诗压缩错开（下限 0.03s）。
- `inkGlyphState(t, t0, unit, pt)`：三次 ease-out，模糊 6pt→0（`pt` 把 pt 换成像素）、scale 1.06→1、透明度 0→1，无位移。
- `sealState(t, t0)`：0.2s、scale 1.15→1、三次 ease-out，无回弹。旧 `sealStampState` 已改为同一数值。
- `videoDuration(字数, 入场结束)`：$\text{DUR} = \lceil \text{入场结束} + \text{clamp}(\text{字数} \times 0.3,\ 6,\ 20) \rceil$；有朗读时模板另取录音时长的较大者。
- `pushScale(t, DUR)`：背景 1→1.02 线性缓推，文字层不缩放。
- 叙事与歌词：`storyTimeline`（ink-story，按朗读的逐行起始时间）与 `songTimeline`（按歌词时间戳）。朗读库只有逐行时间，没有词级时间。

### 2.2 程序化山水接入（ShanShui@5）

```js
import { planPainting, applyPalette, paintFrame } from '/resources/core/huaping-scene.js';

const painting = planPainting({ poem, title, procedural: recipe.procedural, params, verseColumns, verseChars });
const palette = applyPalette(palettes, recipe, params, painting);
const frame = await paintFrame(canvas, painting, palette, { width: 1080, height: 1920 });
// frame.verse：上提并裁出安全区的诗句框；frame.anchors：映射到画面坐标的锚点
```

- `planPainting` 调用 `poetryScene(诗, 题).paintingProcedural(seed, …)` 得到完整 @5 配方；配方可写 `scene` / `composition` / `motifs` 覆盖并在 `procedural.note` 说明理由。
- `paintFrame` 内部调用 `renderZXArt`，`ok: false`（降级画）直接抛错。画在较矮画布上生成（候选高度取墨量最大者，或配方 `artHeight`），不缩放地下置；诗句框经空白纸面上提到约 11%，框内残留发丝线淡回纸色。浅色画墨色加实；引擎的粉色落日换成朱砂落日，并按引擎原落日露出的范围裁剪。
- 不改 `resources/vendor/zxart/` 下的引擎。

### 2.3 天气与余韵

- `pickWeather({ text, title, term, motifs })`：先按诗文与诗题、再按节气补一种，最多两种，雨雪互斥、日月互斥；再按画里实有的母题过滤（雨要有雨母题，雪要有雪，画里有月不叠月、有日不叠日，@5 不另加雾）。
- `afterglowPlan`：涟漪只落在空白水面与船边（按画面像素取样确认，不进天空、不压船身，近小远大），一带淡雾放在山最密的那几行。
- 天气取纸墨色，不用彩色发光粒子；渔灯不做（朱只在印与落日）。

---

## 3. 拟音（Foley）与广播级响度管线

`scripts/render.mjs` 内置程序化合成器（`resources/core/foley.mjs`），无需外部音频素材即可根据 `window.EV` 生成 48kHz 立体声 WAV 音轨并与配乐/人声混音：
- `qin-harmonic`：古琴泛音（空灵五度泛音衰减，适合开场或转场）
- `ink-drop`：宣纸落墨/水滴泛涟（适合诗句起笔）
- `seal-stamp`：木石印章落纸闷响（适合朱印盖下瞬间）
- `page-turn`：宣纸册页轻翻摩擦声（适合分镜切换）
- `bamboo-chime`：竹林清风泛音（适合节气点亮）

混音管线默认执行 `loudnorm=I=-14:TP=-1.5:LRA=11`，确保导出 MP4 在抖音、视频号、小红书、B 站音量饱满且不爆音。
