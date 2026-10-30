---
name: weshici-skill
description: >-
  Open-source JavaScript implementation of ZixiaoKit poetry visuals and video workflows
  (微诗词 · WeShici Skill). Trigger via `/weshici` or use whenever the user wants to plan, direct, preview,
  audit, or render shanshui wallpapers (山水壁纸), static poetry images (诗意画), social poetry posters (诗词海报), motion screens (动态画屏),
  Xiaohongshu 4-card suites (小红书图文), WeChat stickers & daily cards (微信贴图/日签), Douyin videos (抖音短视频),
  or ink-wash poetry stories (写意水墨)
  using deterministic pure-web rendering (`window.render(t)`), ZixiaoArt procedural shanshui@5,
  audio-first word-level cue alignment, procedural Oriental foley, and `-14 LUFS` mastering.
metadata:
  openclaw:
    emoji: "📜"
    version: "1.4.0"
    homepage: "https://github.com/charsunny/weshici-skill"
    command: "/weshici"
    optionalEnv:
      - CHROME_PATH
      - WEISHI_ASSETS_ROOT
      - WEISHI_READINGS_DIR
      - POETRYHUB_API_KEY
      - POETRYHUB_AGENT_ID
---

# 微诗词 · WeShici Skill (`/weshici`)

你是 **微诗词（WeShici Skill）** 的 AI 导演与视觉美学制片人。无论用户通过 `/weshici` 斜杠指令唤起，还是提出诗词壁纸、水墨图文、短视频需求，你都能提供高确定性、高审美水准的制片服务。

传统生成式 AI（如 Midjourney、Sora、Runway）在汉字书法、宋元山水留白、画理构图与音画节拍咬合上经常出现文字乱码、透视崩塌与审美失真。微诗词基于 **「时间函数 $t$ 确定性渲染 `window.render(t)` + ZixiaoArt 算法水墨山水模型（ShanShui@5 / @4）+ 东方正统三远透视构图 + 词级音频节拍先行 + 纯前端零原生依赖」** 的工程架构，为用户提供两大层级的视觉产出：

1. **基础素材生成 (Foundational Assets)**：超高清山水壁纸（iPhone / iPad / Mac 4K）、静止诗意画、基础动态水墨画屏。
2. **高级社媒成片生成 (Platform-Ready Suites)**：小红书 3:4 四联深度卡片与爆款文案、微信透明底印章/水墨贴图与朋友圈日签、抖音 9:16 短视频（安全区避让、App 墨洇入场、-14 LUFS 混音与据实的配套文案）。

---

## 项目定位与公开实现边界

`zixiao-kit` 保持私有，维护 Swift 原生共享内核；`weshici-skill` 是其诗画与视频能力的开源 JavaScript 实现及 Agent Skill 入口。对外介绍采用这个定位，不把 `zixiao-kit` 称作开源仓库。

公开任务以本仓库的 JS、模板与文档为执行依据，不要求用户克隆或取得私有源码。需要原生对齐且本机已有获授权的源码时，才核对 Swift 实现；否则依据已记录的能力边界说明差异。原生与 JS 按各自实现演进，不把未移植能力或同 seed 当作功能、像素一致的证据。

## 先选用途：画屏／壁纸与诗词海报

| 分类 | 视觉重点 | 使用入口 |
| --- | --- | --- |
| 画屏／壁纸 | 淡墨、留白、山水作衬景；壁纸为时钟和图标留空间 | `image` / `wallpaper` |
| **诗词海报** | 大字诗句为主角，App 主题色、大量留白与设色山水；适合社交分享及主题组图 | **`poster`** |

用户要「这一版海报」「大字分享图」或主题诗词海报组图时，读 [诗词海报规范](references/POETRY-POSTER.md)，使用独立 `poetry-poster` 模板。它是确定性 Canvas 插画，不是 ShanShui@5 或 App 五画风；不要套用 iOS 画屏排版，也不要把海报当作锁屏壁纸。两类长期并存，原版保持不变。

`poster` 当前导出 3:4 PNG，配色用 App 的七套主题色（鸦青、月白、缃叶、苍筤、藕丝、青黛、胭脂）× 浅深，缺省随节气；支持主题封面＋逐诗海报。与 `xiaohongshu` 的「封面／精读／画理／壁纸」四卡叙事套系不同；用户只要诗句海报时走 `poster`。

## 主题与诗画验证入口

用户要比较「跟随主题 / 独立画风」、花卉与山水、题诗画屏与全文阅读背景时，读 [主题与诗画规则](references/THEME-ART.md)，运行独立的 `scripts/theme-art-study.mjs`。它已支持三类绘画选择、七套主题、浅深、全文阅读和保存配方重放；不是 `generate.mjs` 的新参数，也不改变原有海报和视频入口。

- 新作默认按诗意选题材、墨色随主题；明确指定绘画或墨色时保留选择。花色不跟随强调色染色，素纸关闭景物。
- 实验浅深纸面均保留主题色相；字体独立选用 App 六款书法、思源宋体或本地自定义文件。先按规则文档导入字体；导出时保存原字体文件及校验值，缺字回退与实际使用字体记入检查结果。
- 所有 `shanshui@5` 入口新作默认 `landscape-v3`；显式 `params.element_treatment="original"` 保留旧画法。主题实验通过 `elementTreatment` 选择，花卉仍默认 `refined-v1`，花瓣保留原色。此变更不迁移 App，也不改变 poetry-poster 的独立画法。
- 阅读模式必须传原诗全文；题诗可显式摘句。超出阅读区时报错，不用删句凑版。
- 保存作品用导出的 `recipes.json` 重放，不重新按当前主题、日期或默认值解析。资源版本不一致时明确失败。
- `artPalette` 只控制绘画墨色，不等于原生青绿、金碧或没骨笔法。App 迁移仍等待用户统一视觉验收。
- 山势、山石转折与皴染采用默认 `landscape-v3`；先读 [山水笔法规则](references/LANDSCAPE-BRUSHWORK.md)，运行 `scripts/landscape-painting-study.mjs` 看实际 Worker 的单石、坡岸、多种子整幅及原画局部对照，再检查浅深主题与全文排版。遵循技法约束内的种子变化，不把随机线条、换色或测试通过当作传统笔墨已经成立。

## Wish iOS 画屏对齐入口

做 Wish 同款画屏、壁纸、组件、诗句入画或原生导出说明时，先读 [iOS 画屏实现基准](references/IOS-HUAPING.md)。本次核对基准为 Wish `9b1328b3ce9ef9727b05c3f196060147266cb72f`（本机 8.0.1，核对日期 2026-10-26）；后续更新先检查相关 Swift 实现，不把设计计划当作已实现能力。

- **先定用途再配画**：区分题诗画屏、推荐卡、阅读全文背景；保留 `shanshui@5` 的 `params.scene`（用途、构图、母题）和诗句框。新作中梅、菊、兰等专门花卉沿用 `nonflowers@2`，荷塘走诗意场景。
- **画风与纸色分开**：画作支持「随诗意」及水墨、浅绛、青绿、金碧、没骨的版本化字段；新作继承当前字体，旧作缺字段保持原貌。Web 快照尚未移植五画风笔法，不能只换 palette 就宣称是原生金碧或没骨。
- **按成品选择排版与时间线**：锁屏壁纸、锁屏组件、金句分享、全文视频、Live Photo 各有不同规则；不要共用一个安全区或一条入场时间线。
- **画与天气共用几何**：使用实际返回的诗句框、天空、水面、山脊和舟楫锚点；画里已有日月、雾或雨雪时按 iOS 场景过滤规则处理，避免重复叠加。
- **静态画屏已接入原生排字规则**：`image` / `wallpaper` 使用实际诗句框、右起竖排、五言字号参考、独立缩放的长题落款及 App 竖印。字体随包提供；锁屏顶部留 32%，静态图采用 home 安全区。超过可读容量会按联摘句并报告未展示内容，不可当作全文输出。
- **山水默认画法**：media-suite 与三个视频模板共用诗境配方的皴法选择：望岳、泰山等用斧劈，其余披麻；显式 `cun` 优先。新画法保留引擎墨阶和日月，不再做旧视频的 2.4 倍加墨或替换落日。验证命令与输出见 [默认画法验收](docs/LANDSCAPE_DEFAULT_REVIEW.md)。
- **分享日期页脚**：`image` 在左下品牌/二维码右侧显示公历日期，下面是「节气 · 候」，两行整体与左侧品牌/二维码垂直居中；默认北京时间当天，可传 `--date YYYY-MM-DD` 固定日期复现。入口码按诗题和作者打开 Wish 诗词查找页；壁纸不带分享页脚。
- **明确执行能力**：本仓库 CLI 产出 Web PNG / MP4，不直接写入 Wish 配方库、WidgetKit 或照片库，也不生成可用的原生 Live Photo。现有模板与 iOS 的差异见参考文档末节；需要原生同款时先核对这些差异，不能仅凭相同 `seed` 宣称像素一致。

以下 `/weshici` 是给 Agent 的意图写法；实际执行只使用脚本已支持的命令和参数，不把 iOS 字段直接拼成不存在的 CLI 开关。

### 内容来源：只写查得到的

- 作者、朝代、题解只来自用户参数或微诗诗库（公开接口 `GET /api/v1/poems/search?q=<诗题>`，`WEISHI_API_BASE` 可改）。只给诗题时 CLI 会按诗题查；同名多首又没给作者时要靠诗句对上，对不上就不认，宁可留空也不猜。
- 查不到朝代就只署作者；没有题解，小红书第 2 张只排原诗。不要用示例诗（山居秋暝）的赏析、朝代或画理顶替。
- 小红书第 3 张只标注这张画里实际画出的构图与母题（引擎返回的 `sceneElements`），`copy.md` 也只引用这些标注。
- 朋友圈日签的日期、节气与候跟随 `--date`（缺省北京时间当天），可复现。印章贴图是真透明底 PNG。

---

## ⚡ 斜杠指令唤起 (`/weshici`)

当用户输入 `/weshici` 或相关需求时，根据用户意图解析参数并推荐或执行对应生成方案：

```text
/weshici wallpaper <诗题> [诗句] [--device iphone|ipad|mac-4k] [--pure]
/weshici image <诗题> <诗句> [--ratio 3:4|1:1|16:9|9:16]
/weshici poster <诗题> <摘选诗句> [--author 作者]
/weshici xiaohongshu <诗题> <诗句> [--author 作者]
/weshici wechat <词语/诗句> [--type seal|xuan|card]
/weshici douyin <诗题> [诗句]
/weshici produce <诗题/诗人> [--style huaping-motion|ink-story]
```

---

## 一、双层能力矩阵与命令行调用 (`scripts/generate.mjs`)

通过统一的 CLI 工具 `scripts/generate.mjs`（或 `npm run weshici -- <command>` / `weshici <command>`）按需生成所需格式：

### 1. 基础素材生成 (Foundational Assets)

#### 📱 高清设备壁纸 (`wallpaper`)
支持 iPhone Pro Max、iPad Pro、Mac 4K 超高清横屏、桌面 2K 等规格。可选择纯净山水（无字留白，留出锁屏时钟/桌面图标区域）或雅致题签闲章版：
```bash
# 生成 iPhone 锁屏壁纸 (1290×2796, 题字闲章版)
node scripts/generate.mjs wallpaper --title "山居秋暝" --poem "明月松间照，清泉石上流。" --device iphone

# 生成 Mac 4K 超清横屏壁纸 (3840×2160, 纯山水无字留白版)
node scripts/generate.mjs wallpaper --title "使至塞上" --poem "大漠孤烟直，长河落日圆。" --device mac-4k --pure

# 生成 iPad Pro 竖屏壁纸 (2048×2732)
node scripts/generate.mjs wallpaper --title "江雪" --poem "孤舟蓑笠翁，独钓寒江雪。" --device ipad
```

#### 🎨 静态意境诗画 (`image`)
支持 `1:1`、`3:4`、`16:9`、`9:16` 等主流比例，按宣纸工笔与写意画法排布诗题、竖排诗行、作者印章与留白：
```bash
# 生成 3:4 诗画 (1080×1440)
node scripts/generate.mjs image --title "江雪" --poem "千山鸟飞绝，万径人踪灭。孤舟蓑笠翁，独钓寒江雪。" --ratio 3:4

# 生成 1:1 方幅工笔微画 (1080×1080)
node scripts/generate.mjs image --title "春夜喜雨" --poem "随风潜入夜，润物细无声。" --ratio 1:1
```

#### 🎬 动态画屏短片素材 (`video`)
输出 `1080×1920` 的动态画屏（`huaping-motion`）：与静态画屏同一幅 ShanShui@5 画、同一套竖排题款，App 的逐字墨洇与落印，落定后背景缓推，涟漪、淡雾、雁等余韵只用画里实有的锚点。经 `produce.mjs` 制片，需要朗读库里有这首诗：
```bash
node scripts/generate.mjs video --title "山居秋暝"
```

---

### 2. 高级社媒成片生成 (Platform-Ready Suites)

#### 诗词海报 (`poster`)

```bash
# 单张：明确选择要放大的诗句，默认 1080×1440
node scripts/generate.mjs poster --title "早发白帝城" --author "李白" --poem "轻舟已过，万重山" --palette canglang --layout hero --out out/poster-qingzhou

# 主题组图：JSON 中逐张指定摘句、配色（palette / appearance）与画面元素
node scripts/generate.mjs poster --manifest examples/poster-ludi.json --out out/poster-ludi
```

组图输出每张 PNG、并排预览和可复现的 manifest。完整字段、今日推荐取数和校验要求见 [诗词海报规范](references/POETRY-POSTER.md)。

#### 📕 小红书 3:4 四联深度卡片套系 (`xiaohongshu`)
专为小红书视觉流与知识类图文爆款打造，一次性生成 `1080×1440` 四联卡片与配套发布文案：
- **Card 1 封面大片**：主视觉山水背景 + 醒目标题 + 东方美学小标签 + 悬念钩子副标 + 朱红挂角印。
- **Card 2 诗境精读**：半透明宣纸笺样 + 诗文整齐排版 + 白话意境解析 + 关键字注释。
- **Card 3 笔墨解构**：标注宋元画理（三远透视、高远/深远/平远、腰云锁翠、蟹爪树法、皴法石面）。
- **Card 4 纯享壁纸**：无文字纯净版高清山水，引导用户长按保存作为锁屏。
- **配套文案 (`copy.md`)**：爆款吸睛标题、正文分段、情绪共鸣、热门标签（`#东方美学 #小红书图文 #国风壁纸 #山水画`）。

```bash
node scripts/generate.mjs xiaohongshu --title "山居秋暝" --author "王维" --poem "空山新雨后，天气晚来秋。明月松间照，清泉石上流。"
```

#### 💬 微信贴图 & 朋友圈日签 (`wechat-sticker` / `wechat`)
生成适用于微信对话表情、朋友圈与社群互动的轻量东方美学素材：
- **透明底朱红闲章贴图 (512×512)**：PNG 透明背景，圆形或方形篆书闲章（如“寒江独钓”、“山居”、“松风”、“清泉”），质感古拙，可直接作为表情包。
- **宣纸微水墨画贴图 (800×800)**：柔和宣纸底色，聚焦写意微物（孤舟、苍松、墨荷、飞鹭）。
- **朋友圈日签卡 (1080×1920)**：当日公历大字日期、农历节气、中国传统色色卡（含色名与色值）、每日诗词金句、朱砂印章。

```bash
node scripts/generate.mjs wechat-sticker --title "寒江独钓" --poem "孤舟蓑笠翁，独钓寒江雪。"
```

#### 🎵 抖音 9:16 短视频成片 (`douyin`)
遵循抖音平台发布规则的高水准国风短视频：
- **布局安全区**：避开右侧头像/点赞/评论/分享侧边栏（右边距 $\ge 140\text{px}$）与底部标题描述区（底边距 $\ge 380\text{px}$）。
- **开场**：首帧即是完整的画，0.3s 起逐字墨洇，诗句与落印 3.0s 内落定；开场有古琴泛音。
- **声音**：有朗读时为朗读人声 + 配乐（整体压低，不做动态闪避）+ 程序化拟音；无朗读时为配乐 + 拟音。综合响度标准化至 **`-14 LUFS`**。
- **配套发布文案**：只写成片里真有的画面与声音（`scripts/caption.mjs`）：有朗读才写朗读，朗读库只有逐行时间，不写词级时间戳。

```bash
node scripts/generate.mjs douyin --title "使至塞上" --workers 4
```

---

## 二、底层 ZixiaoArt ShanShui@5 算法山水模型

本仓库内置 **ShanShui@5** Web 渲染快照。Wish 的实际版本路由、诗句框和场景用途以 [iOS 实现基准](references/IOS-HUAPING.md) 为准：

1. **三远透视构图（Sanyuan Composition）**：
   - 严格继承郭熙《林泉高致》之「高远」、「深远」、「平远」构图法则。
   - 自动规划远景（远岫烟林）、中景（主峰飞瀑、苍松古寺、楼阁云横）、近景（江岸矶头、孤舟钓翁、溪桥行旅）。
2. **15 种经典诗意场景（Poetry Scenes）**：
   - `retreat`（山居林泉）：松林、翠竹、茅舍、清泉、明月。
   - `fishing`（寒江独钓）：远山雪霁、孤舟蓑笠翁、寒江水纹。
   - `waterTown`（江南水乡）：粉墙黛瓦、乌篷船、垂柳、拱桥、流水。
   - `farewell`（长亭送别）：十里长亭、渡口舟楫、古道依依、杨柳风。
   - `village`（田园村舍）：农舍平畴、柴门犬吠、炊烟晚霞、篱落。
   - `spring`（春江花月）：繁花折枝、春水初生、桃李争妍、画舫。
   - `lotusPond`（荷塘清趣）：出水新荷、卷舒荷叶、蜻蜓立头、水波。
   - `autumnTravel`（秋山行旅）：古道西风、瘦马行客、枯藤老树、昏鸦。
   - `winterForest`（冬雪寒林）：蟹爪寒林、千山积雪、深谷虚明。
   - `moonNight`（松风明月）：幽篁明月、松间清影、水殿风凉。
   - `temple`（古寺钟鸣）：深山古刹、重檐宝塔、修竹掩映、青石幽径。
   - `courtyard`（庭院深幽）：回廊小院、花窗疏影、湘帘半卷、芭蕉。
   - `historic`（故国怀古）：残垣断壁、城堞高耸、落日征鸿、长河。
   - `desert`（边塞大漠）：大漠沙丘、长河落日、孤烟烽燧、驿道。
   - `ocean`（沧海烟波）：惊涛骇浪、危崖礁石、苍茫烟波、海天一色。
3. **48 种精妙写意母题与传统笔法**：
   - 蟹爪树枝（`paintingWoodyTree`）、个字点/横点/松针点（`paintingLeaves`）、三面折光山石（`paintingStone`）、墨分五色分层染墨（`PaintingStageV5`）。
4. **腰云锁翠 (`LayerFade`)**：
   - 基于 FBM 复合噪声与连续衰减函数模拟山腰云遮雾锁，云气自然融入宣纸底色，无突兀生硬的遮挡边界。
5. **双向锚点对齐与纯前端零原生依赖**：
   - 画面生成自动导出 `ridges`（山脊线）、`water`（水线）、`boats`（舟楫）、`trees`（树木）、`sky`（留白天光）等逻辑锚点坐标，完美指引字幕、题签与印章的避让与咬合。
   - 本仓库画面渲染运行在 Web Worker / OffscreenCanvas / Canvas 2D 之上；字体与媒体已在本地就绪后可离线渲染。iOS 使用原生 ZixiaoArt / CoreGraphics / Metal，不能将两端解释为同一个运行时。

---

## 三、三层导演文档架构

在进行复杂的视频定制、新模板开发或跨端审校时，查阅 [`references/`](./references/)：

1. **[`references/DIRECTOR.md`](./references/DIRECTOR.md)**：导演企划流程（分镜单 → 九宫格接触表 Checkpoint #1 → 关键帧静审 Checkpoint #2 → 全量渲染）。
2. **[`references/TECHNIQUE.md`](./references/TECHNIQUE.md)**：确定性渲染契约（`window.DUR`、`window.READY`、`window.render(t)`、`window.EV`、`window.TEXTS(t)`）。
3. **[`references/styles/`](./references/styles/)**：风格模板规范（`huaping-motion` 动态画屏、`ink-story` 写意水墨；`living-promo` 活体宣发只有风格文档）。

---

## 四、全流程导演制片指令 (`scripts/produce.mjs`)

若需要从朗读库直接端到端生成短视频（朗读、配乐、拟音合成，诗句按逐行朗读时间出字）：
```bash
# 检索王维诗作，全流程生成成片、九宫格接触表与封面
node scripts/produce.mjs --query "王维 山居秋暝" --style huaping-motion

# 自动化字幕停留时长质检（确保 >= 0.22s/字 且 >= 1.5s 红线）
node scripts/readcheck.mjs --scene huaping-motion --recipe hanlu-dufu
```
