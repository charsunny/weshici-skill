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

## 2. 微诗核心动效原语（`@weishi/video-core`）

引入 `/resources/core/weishi-video-core.js` 使用本仓库的 Web 原语。以下描述当前 JS 实现；iOS 的准确值与各输出类别规则见 [iOS 画屏实现基准](IOS-HUAPING.md)，两者不能混称逐参数一致。

### 2.1 诗句墨洇入场与落印（`HuapingInkReveal`）
当前 `resources/core/weishi-video-core.js`：
- **单字/单行墨洇（`inkUnitState(t, startTime, index, totalUnits, options)`）**：
  - 单单元时长：`0.25s`，缓动 `easeOut`（三次方）
  - 模糊：`blur(6px → 0px)`
  - 缩放：`scale(1.06 → 1.0)`
  - 不透明度：`opacity(0 → 1)`
  - 单元错开默认 `0.12s`，`maxSpan` 默认 `2.2s`，错开下限 `0.03s`；因此很长文本不保证满足跨度预算。默认还带 `6px` 的 y 位移。原生视频的压缩上限不可仅靠这些默认值实现。
- **朱印落下（`sealStampState(t, stampStartTime)`）**：
  - 触发点由模板传入；Web 默认时长 `0.22s`
  - Web 缩放：`scale(1.18 → 1.0)`，`easeOutBack` 回弹；iOS 是 `0.20s`、`1.15 → 1.0`、三次 ease-out 无回弹。严格同款任务应先修正此差异
  - 同步在 `window.EV` 登记 `{ t: stampStartTime, sfx: 'seal-stamp', gain: -4 }`。
- **视频总时长公式（`computeHuapingDuration(charCount, entryEnd)`）**：
  $$\text{DUR} = \lceil \text{entryEnd} + \text{clamp}(\text{charCount} \times 0.3,\ 6,\ 20) \rceil$$

### 2.2 程序化山水与花鸟接入（`renderZXArt`）
使用仓库内 Web Worker（`/vendor/zxart/zxart-worker.js`）。这是旧 @2 配方的调用示例；新山水/荷塘需要完整 @5 场景配方，见 [选画与复现规则](IOS-HUAPING.md#2-当前选画用途与复现输入)。Web 快照未包含原生五画风笔法，不保证与最新 iOS 逐形状一致：
```js
import { renderZXArt } from '/resources/core/weishi-video-core.js';

const result = await renderZXArt(bgCanvas, {
  generator: 'shanshui@2', // 或 'shanshui@1' | 'nonflowers@1' | 'nonflowers@2'
  seed: 'hanlu-dufu-2026',
  variant: 'distant',
  params: { density: 0.95, quiet_top: 0.32, verse_side: 'left', verse_columns: 4, verse_chars: 10 },
  palette: { paper: '#14181F', ink: '#D2D8E5' },
  width: 1080,
  height: 1920,
});
if (!result.ok) throw new Error('程序化画屏未成功渲染，不能将简化回退图作为成品');
```
- **镜头缓推规范**：全文视频的背景画布随时间缓慢推进 `scale = 1 + 0.02 * (t / DUR)`（最大不超过 `2%`），**文字层与左上角水印保持绝对静止**，避免阅读眩晕。金句视频仅在有余韵或天气时推镜，使用 smooth 曲线；不能把此线性公式套给 Live Photo。

### 2.3 七种时令天气与语义锚点动效（`WeatherStage`）
以下为 Web 模板的天气设计；原生的数量、周期和母题去重见 [天气层规则](IOS-HUAPING.md#4-天气层场景母题与动效预算)。接入时必须用真实 anchors 判断天空、水面与船，不能硬写 `hasBoat: true`。天气取当前纸墨色系，不使用彩色发光粒子：
1. `rain`（细雨）：细斜淡墨线（长 `14–26px`，不透明度 `≤ 0.25`），落入水面区激起椭圆涟漪。
2. `snow`（飞雪）：纸白圆点（半径 `1.5–3.5px`），随正弦微风慢落，触水即融。
3. `mist`（山岚）：贴合远山腰部的多层横向柔雾带，随 `t` 缓慢横移。
4. `geese`（雁阵）：天空带 `5–9` 只「人」字形水墨剪影，双帧振翅，约 8–12 秒横穿天际。
5. `moon`（明月）：天空带一轮淡月带柔和光晕，水面区同步绘制被涟漪打碎的月影。
6. `sunset`（落日）：与朱印同色（`#9B382B` / `#B04A3A`）的半透明圆日（`opacity ≤ 0.48`），缓慢下沉（与 `moon` 互斥）。
7. `lantern`（渔灯）：深色外观下孤舟锚点处的一点暖橘微光，随水波轻晃并带呼吸闪烁。

---

## 3. 拟音（Foley）与广播级响度管线

`scripts/render.mjs` 内置程序化合成器（`resources/core/foley.mjs`），无需外部音频素材即可根据 `window.EV` 生成 48kHz 立体声 WAV 音轨并与配乐/人声混音：
- `qin-harmonic`：古琴泛音（空灵五度泛音衰减，适合开场或转场）
- `ink-drop`：宣纸落墨/水滴泛涟（适合诗句起笔）
- `seal-stamp`：木石印章落纸闷响（适合朱印盖下瞬间）
- `page-turn`：宣纸册页轻翻摩擦声（适合分镜切换）
- `bamboo-chime`：竹林清风泛音（适合节气点亮）

混音管线默认执行 `loudnorm=I=-14:TP=-1.5:LRA=11`，确保导出 MP4 在抖音、视频号、小红书、B 站音量饱满且不爆音。
