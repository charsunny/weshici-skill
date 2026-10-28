# 视频模板 v2：审美升级

2026-10-28 定。范围是四个视频模板：`huaping-motion`、`ink-story`、`poem-song-mv`、`poet-footprint`（`living-promo` 只有风格文档，没有模板，这次不做）。原则沿用诗词海报 v2（`docs/POSTER_V2_PLAN.md`、`references/POETRY-POSTER.md`）：**主角是诗和画，配色不抢戏；底近中性；颜色只在小处；朱只在印。** 本分支基于 `feat/poster-v2`（PR #4）并合入了 `fix/content-honesty`（PR #5），可以直接用 `resources/core/app-palettes.json` 和 `scripts/poem-lookup.mjs`。

## 1. 基线问题

基线关键帧：Mac `taste/weshici/shots/video-baseline/`。每个配方 9 帧，时刻与 `render.mjs --sheet` 相同。仓库 `examples/*.sheet.jpg` 是同一批画面。

**共性**

1. **画几乎看不见**。六个配方都还在用 `shanshui@2`，模板也不检查 `renderZXArt` 的结果。所以画面里只有一两道平滑的土丘，或者淡到看不清的远山，诗和画都不是主角。
2. **米黄与网页语汇**：
   - `ink-story` 是米黄底配粉红太阳；`poet-footprint` 是米黄舆图加方格。
   - 版面用的是网页 UI 的元素：左侧竖线的提示框（`ink-story`、`poem-song-mv`），带阴影的卡片（`poet-footprint`），黑胶唱片和金色声波（`poem-song-mv`）。
3. **信息层太多，小字太小**。一帧里同时有页眉（「微诗 · 寒露 · 蓝灰」）、右上角印、竖排署名、印、日期行、注释段落、「声画同步」之类的术语标签。很多字在 1080 宽的画面上只有 16–20px，手机上读不出来。
4. **后半段不动**。`huaping-motion` 的 9 帧里有 6 帧一模一样：诗句落定以后，一半以上的时长画面完全静止。
5. **入场与 App 不一致**。Web 版的落印有回弹（起始缩放 1.18）。App 的规则是每字 0.25s、错开 0.12s、三次 ease-out，落印 0.2s、1.15→1、无回弹（见 `references/IOS-HUAPING.md` 第 5 节）。

**各模板**

- `huaping-motion`：诗句和画的关系与静态画屏不一致。静态 `image` 用引擎返回的诗句框排字，这里没有。
- `ink-story`：每一联配一个带「第一联 · 声画同步」的提示框，画在底部几乎看不见。
- `poem-song-mv`：深青底配金色唱片和声波，像音乐 App 的播放页；当前句和其他句只差一点透明度。
- `poet-footprint`：底部时间刻度的字互相重叠（「元丰五年 · 前后赤壁赋」被挤断）；站点卡片带阴影；地名和年份太小。

## 2. 共同的改法

1. **画**
   - 全部改用 `shanshui@5`：`poetryScene(text, title).paintingProcedural(seed, options)` 得到完整配方，和 `media-suite` 的做法一样。
   - 检查 `renderZXArt` 的 `ok`，降级画（`fallback`）要报错或明确告警，不能当成功。
   - 画面里山水的面积至少占四成，用引擎返回的诗句框和锚点（天空、水面、山脊、舟）给字留位置。
   - 配方 JSON 里的 `procedural` 升级到 @5。保留 seed；用途、构图、母题由引擎决定。
2. **配色**
   - 用 `app-palettes.json` 的七套 × 浅深，规则同海报：缺省随节气，月夜、寒夜一类题材取深色。
   - 页面纸色平铺，不用米黄，不用渐变大色块。朱只给一方印（和必要时的落日）。
3. **字与层级**
   - 每帧最多三层：诗句（主角），出处，一行语境（可选）。
   - 去掉页眉、角印和术语标签（「声画同步」「逐句同步」「曲意赏析」），注释段落改为可选的一行。
   - 在 1080×1920 上，正文不小于 34px，小字不小于 28px。思源宋体，不混用其他字体。
   - 署名用 `byline`（朝代未知就只写作者），信息来自配方或诗库，不编造。
4. **动**
   - 诗句落定后画面要继续有生命：背景 1→1.02 的缓推（与 App 全文视频一致），加上至少一种依锚点的轻动效（水面涟漪、舟轻晃、一条淡雾漂移、雁阵、雨雪）。
   - 天气只用画里真的有的锚点。没有水就不做涟漪，画里已经有月就不再叠月。
   - 9 帧接触表里，落定后的帧应当看得出在变，但变化必须克制。
5. **时间线**：逐字墨洇和落印按 App 的数值改（见第 1 节第 5 条），落印去掉回弹。有朗读音频时，仍按词级时间戳驱动出字。
6. **安全区**：9:16 抖音的右侧 140px、底部 380px 是平台控件区。诗句和出处不进这两块，画可以铺满。

## 3. 各模板目标

- **`huaping-motion`（动态画屏）**：要和静态 `image` 是同一幅画、同一套排字。复用 `huaping-layout.js` 的诗句框排字，加上上面的入场和余韵。成片看起来就是「会动的画屏」。
- **`ink-story`（写意水墨叙事）**：
  - 画是主角；每联诗句以题跋方式落在画的留白处，联与联之间用墨晕转场（保留现有的转场思路）。
  - 去掉提示框。序章只留诗题和署名。
- **`poem-song-mv`（一曲诗词）**：
  - 保留「音乐」的身份，但用水墨的语言：当前句大而实，其他句淡而小或不显示；节拍驱动的是水面涟漪或远山呼吸，不是 UI 声波。
  - 去掉唱片和金色提示框。
- **`poet-footprint`（诗人行迹）**：
  - 舆图放在纸色上，行迹线用印色（全片唯一的朱）；站点是题跋式文字块，不加阴影卡片。
  - 时间刻度不能重叠，长标注要换行或缩写。地名和年份不小于 28px。

## 4. 不做

- 不改音频管线（`audio-cue` 的时间戳、混音、`-14 LUFS`）和 `render.mjs` 的渲染协议（`window.DUR / READY / render(t) / EV / TEXTS`）。
- 不新增模板，不做 16:9 版本。

## 5. 分步交付（每步一个提交，做完停下等验收）

1. **基础 + `huaping-motion`**
   - 共用部分：@5 配方与 fallback 检查、配色接入、字号阶梯与 byline、入场与落印时间函数、余韵动效。共用代码放进 `resources/core/`。
   - 改写 `huaping-motion`，更新它的两个配方（`hanlu-dufu`、`qingming-dumu`）。
2. **`ink-story`**：改写模板，更新两个配方（`wanqing-dufu-story`、`sushi-yufu`）。
3. **`poem-song-mv`**：改写模板，更新配方 `sumuzhe-fanzhongyan-mv`。
4. **`poet-footprint`**：改写模板，修好时间刻度的重叠。
5. **收尾**
   - 同步风格文档 `references/styles/*/STYLE.md`、`references/TECHNIQUE.md` 的相关段落，以及 `SKILL.md` / `README.md` 的描述。
   - 更新 `examples/*.sheet.jpg`：用新的 9 帧接触表替换，可以用 Mac 上 `sheet.sh` 的产物，压成 JPEG。
   - `readcheck` 的停留时长红线照旧，如有改动要同步。

## 6. 出图验收

在 VPS 上运行 `~/review/wss-round.sh <工作树> <轮次名> <jobs.json>`。视频关键帧用 `{"kind":"frames","template":"huaping-motion","recipe":"hanlu-dufu","prefix":"hm-hanlu"}`，可选 `times`（秒）、`width`、`height`、`query`。驱动会按 `render.mjs --sheet` 的 9 个时刻调用 `window.render(t)` 截图。基线的 jobs 在 `~/review/wss/jobs-video-baseline.json`。

**每步至少看**

- 该模板全部配方的 9 帧接触表；
- 落定后 3 个相邻时刻（间隔 0.5s），确认余韵在动、但不晃眼；
- 一张原图细看字号与安全区。

**看什么**

- 缩略图里诗句清楚，画是主角之一；
- 没有米黄、渐变大色块和网页 UI 元素；
- 朱只在印；
- 落定后画面在缓慢变化；
- 文字不进安全区、不越界、不重叠；
- 和基线并排看，明显更好。

单测在 Mac 上跑：`ssh xistudio 'export PATH=/opt/homebrew/bin:$PATH; cd /Volumes/XiPass/literature/taste/weshici/weshici-skill && node --test tests/'`，新增的纯函数（时间函数、布局计算）要补测试。

**MP4 成片**：`render.mjs` 依赖 puppeteer，Mac 上没装，这轮只验关键帧。PR 里要写明没有渲染过 MP4。
