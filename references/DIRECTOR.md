# 微诗视频工作台 · 导演手册（DIRECTOR.md）

> 本手册定义 AI Agent（或人类创作者）使用微诗视频工作台（`tools/video-studio`）企划、执导、质检与导出视频的标准工作流。
> 结合 [`TECHNIQUE.md`](./TECHNIQUE.md)（确定性渲染技术规范）与 [`styles/<slug>/STYLE.md`](./styles/)（五大东方美学风格母版）使用。

---

## 1. 角色分工：用户给「拍什么」，导演定「怎么拍」

### 1.1 启动前需要确认的 5 个输入（Brief）
如果用户只给了一句话（例如「帮杜甫《月夜忆舍弟》做个寒露竖屏视频」或「给 8.0 画屏系列做个 30 秒宣传片」），先从仓库资产中补齐上下文，仅对缺失项做极简确认：

1. **内容主体（Subject）**：具体诗作（标题、作者、正文、题解/夹注）、节气/主题或产品功能点。
2. **风格母版（Style Slug）**：从微诗五大母版中选定其一（或混搭）：
   - `huaping-motion`（动态画屏 · 每日一诗 / 节气金句，12–24s）
   - `ink-story`（写意水墨 · 诗题页与逐联题跋，按朗读出字，20–60s）
   - `poet-footprint`（诗人行迹 · 淡墨舆图与站点题跋，20–60s）
   - `poem-song-mv`（一曲诗词 · 当前唱句为主角，节拍驱动水面，20–60s）
   - `living-promo`（活体实机 · 产品与专题宣发，30–60s）
3. **画幅比例（Aspect Ratio）**：四个视频模板只做 `9:16`（`1080×1920`），文字避开右侧 140px、底部 380px 的平台控件区。`3:4` / `1:1` 用静态 `image` / `poster`。
4. **声音策略（Audio Mode）**：
   - `silent`：无声导出（供平台曲库配乐）
   - `bgm+foley`：内置配乐 + `window.EV` 程序化拟音（古琴泛音、落墨、落印、翻页）
   - `voice+bgm+foley`：朗读库人声 + 配乐（整体压低，不做动态闪避）+ 拟音。朗读库只有逐行起始时间，`ink-story` 按它出字；`huaping-motion` 仍用 App 的固定入场
5. **色彩与外观（Palette & Appearance）**：App 七套主题色（`resources/core/app-palettes.json`：`yaqing` 鸦青、`moon-white` 月白、`xiang-leaf` 缃叶、`canglang` 苍筤、`ousi` 藕丝、`qingdai` 青黛、`rouge` 胭脂）× `light` / `dark`。缺省 `seasonal`，按配方 `term` 或 `date` 的节气取色；月夜题材缺省深色。诗中没有节气时写明所选配色与理由。

---

## 2. 导演分镜企划单（`TREATMENT.md`）

在编写复杂的长视频（`ink-story`、`poet-footprint`、`living-promo`）代码前，先在输出目录生成简明的 `TREATMENT.md`：

1. **Logline（一句话主旨）**：全片要立住的那口气（如：「寒露夜色下，孤舟渔火与南飞秋雁衬出杜甫乱世思乡的沉郁顿挫」）。
2. **Visual Motif & Weather（核心意象与天气）**：天气由模板按诗与画里实有的母题选（最多 2 种，雨×雪互斥、月×落日互斥，见 `TECHNIQUE.md` §2.3），只用纸墨色；不做渔灯。
3. **Shot List & Timing（分镜与时间线表）**：
   - 明确每一幕的起止秒数 `[t0, t1]`、画面构图、文字内容、入场方式（逐字墨洇 / 按行墨洇 / 书法题跋）及音效触发点 `window.EV`。
   - **时长红线**：每段文字的停留必须满足 `readcheck` 标准（至少 `0.22s/字` 且单段 `≥ 1.5s`）；金句视频总长另按 `ceil(入场结束 + clamp(字数 × 0.3s, 6s, 20s))`。

---

## 3. 两阶段质量把关（Two-Checkpoint Workflow）

遵循 `lemo-opuscar` 的高效迭代原则，**绝不盲目跑完几分钟全量视频才发现排版溢出**：

### Checkpoint 1：关键帧接触表检视（Contact Sheet）
写好场景 HTML 后，先用 `--sheet-only` 秒级生成九宫格/十宫格关键帧接触表（`*.sheet.jpg`），并运行自动字幕时长审计：
```sh
node tools/video-studio/bin/readcheck.mjs --scene <path>
node tools/video-studio/bin/render.mjs --scene <path> --sheet-only
```
使用 `view_file` 检视接触表，重点排查：
- 诗句/题跋是否压住画的实处或进入平台控件区（右侧 140px、底部 380px）？
- 浅色/深色模式下正文对比度是否 ≥ 4.5:1？
- 印章（朱印）是否在诗句落定后才盖下？

### Checkpoint 2：多进程全量导出与音画合成
确认接触表无误后，开启多 Worker 并行导出完整 MP4（自动混入 `window.EV` 拟音与 `-14 LUFS` 响度标准化）：
```sh
node tools/video-studio/bin/render.mjs --scene <path> --workers 4 --sheet
```
最后如需发布至微诗社区，调用 `poetryhub-skill`：
```sh
./poetryhub-skill/scripts/poetryhub.mjs publish-video --poem-id "$POEM_ID" --video-file out/video.mp4 --thumbnail out/cover.jpg
```
