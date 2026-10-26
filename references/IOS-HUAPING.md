# Wish iOS 画屏实现基准

核对日期：2026-10-26。源码：`charsunny/wish` 本机 8.0.1 已提交版本 [`9b1328b3ce9ef9727b05c3f196060147266cb72f`](https://github.com/charsunny/wish/tree/9b1328b3ce9ef9727b05c3f196060147266cb72f)，及 ZixiaoArt [`01293ad`](https://github.com/charsunny/zixiao-kit/tree/01293ad) 的五画风实现（[Wish 合并 PR](https://github.com/charsunny/wish/pull/96)、[依赖合并 PR](https://github.com/charsunny/zixiao-kit/pull/13)）。这里记录可从代码确认的行为，不代表真机导出或跨端像素一致性已验收。

日期页脚补充基准：Wish [`2f795984`](https://github.com/charsunny/wish/commit/2f795984d3260a6915b1828496bc8b585273e892)，二维码右侧新增公历日期，节气/候在下一行；静图与视频共用且日期纳入缓存键。

阅读路径：生成画屏看 1–3；动效和视频看 4–6；组件看 7；执行本 skill 前看 8。下文源码链接固定到这次提交；将来升级须记录新 SHA 并重新检查实现与测试，不能只改日期。

## 1. 三类配方与执行范围

| 数据 | 用途 | 不能混用的地方 |
|---|---|---|
| iOS `HuapingRecipe` | 诗句、样式、背景、适用画布、日期与个人编辑 | 是 App / 服务端笺样契约，不是视频分镜 |
| `ZXArt.Procedural` | `generator`、`seed`、`variant`、`params` | 只是背景配方，不包含字体、署名或导出权限 |
| 本 skill `resources/recipes/*.json` | Web 模板、朗读、分镜和渲染参数 | 不能直接当作 iOS feed 或 pins 导入 |

[iOS 配方源码](https://github.com/charsunny/wish/blob/9b1328b3ce9ef9727b05c3f196060147266cb72f/ios/Shared/Huaping/HuapingRecipe.swift) 的关键契约：

- 外层 JSON 使用明确的 `CodingKeys`，如 `style.painting_style`、`params.quiet_top`；`params.scene` 由 ZixiaoArt 自己编码（当前 `paintingStyle` 为 camelCase），不要对整棵对象盲目改键名。背景来源是 `procedural / ai / photo / none`；布局是 `vertical / horizontal / corner / centered`；字体回退是 `serif / serifBold / kai`；纸纹是 `xuan / plain / none`。
- `style.palette` 包含 `paper / ink / accent / seal`，可选 `overlay / wash`；缺省 wash 是墨色 40% 叠纸色。`style.font` 是本机字体 PostScript 名，字体不可用或缺字时按当前简繁字形覆盖与 `face` 回退；不改写已存的字体选择。
- 程序化背景保留 `params.scene`；保存或编辑时不能只保留 generator 和 seed，把用途、构图、母题丢掉。
- 未知核心枚举或非法主色使该份配方跳过，不连累 feed；未知 target 只丢该项。程序化对象缺失、损坏或不支持则保留配方，背景回退纸和纸纹；不能静默换成另一幅“看起来差不多”的画。
- feed 日期与有效期使用上海日历。目标包括 `wallpaper`、`widget.small / medium / large`、`accessory.rectangular / inline`。

## 2. 当前选画、用途与复现输入

以 [HuapingProceduralRules.swift](https://github.com/charsunny/wish/blob/9b1328b3ce9ef9727b05c3f196060147266cb72f/ios/Shared/Huaping/HuapingProceduralRules.swift) 的执行函数为准，文件中旧的“@2”注释不能代替路由判断：

1. 新建作品使用 `creationProcedural`：专门花卉（荷除外）继续 `nonflowers@2`；山水和荷塘使用 `sceneProcedural`，调用 `ZXArt.poetryScene` 后生成 `shanshui@5`。
2. 显示已有作品时，`drawableProcedural` 先验证支持性，再调用 `currentPainting`。受支持的旧 `shanshui@…` 升级成当前诗意画；已经是 @5 且 `scene.purpose`、`scene.composition` 都存在则保留原配方。不要强行重选已有构图。
3. 升级保留原 seed、已有诗句侧边/列数/字数提示和 density/hue；旧 variant 若是已知诗意场景，优先保留该场景。非山水生成器原样返回。
4. `sceneProcedural` 缺省用途是 inscription；recommendation 固定右栏，其余用途按稳定 seed 选左右。题诗 + 锁屏均保留至少 `0.32` 的 `quiet_top`，包括两栏短诗和已经完整配置的 @5 配方。完整用途与构图值从配方或当前 ZixiaoArt 取得，不由自然语言猜枚举。
5. `verse_columns` 限 1–8、`verse_chars` 限 1–16；seed 限 64 字符。`withVerse` 会更新诗句框提示。复现应保存完整 procedural、palette、画布像素尺寸、文字与字体，而不是只保存诗题。

本仓库 Web 引擎已有 `poetryScene(text, title).paintingProcedural(seed, options)`，返回 `params.scene`；其用途线格式为 `inscription-v1 / recommendation-v1 / reading-v1`。调用这个函数取得完整配方，避免手写一份只有 `scene: 'retreat'` 的请求而丢失母题和构图。先核对目标端支持性，不把 Swift 枚举简写直接当 JSON 值。

编辑依据 [HuapingEditing.swift](https://github.com/charsunny/wish/blob/9b1328b3ce9ef9727b05c3f196060147266cb72f/ios/PoetryHub/Views/Huaping/HuapingEditing.swift)：山水 / 照片 / 尺素可切换；照片与 AI 图不走“换一幅”；个人修改先 fork 为我的笺样，勿修改公共原稿。版式可按 `wallpaper_compositions[target]` 分别保存，换目标不应覆盖另一目标的构图。

### 五种画风与「随诗意」

[HuapingMoodPalette.swift](https://github.com/charsunny/wish/blob/9b1328b3ce9ef9727b05c3f196060147266cb72f/ios/Shared/Huaping/HuapingMoodPalette.swift) 与 [画风规范](https://github.com/charsunny/wish/blob/9b1328b3ce9ef9727b05c3f196060147266cb72f/docs/PAINTING_STYLES.md) 是当前依据：

| `style.painting_style` | 产品含义与原生绘制 |
|---|---|
| `poetic-v1` | 随诗意；解析为下列前三种之一，不读取当前日期或随机数 |
| `shuimo-v1` | 水墨；保留墨线，移除天空日月的额外彩色处理 |
| `qianjiang-v1` | 浅绛；岩土薄赭、远山花青，保留细笔与轮廓 |
| `qinglv-v1` | 青绿；石青石绿山体和草木，坡岸保留赭色，保留墨线 |
| `jinbi-v1` | 金碧；较厚青绿矿物设色、坡岸偏矿物绿，主要山脊与局部屋脊点金，不描闭合金框 |
| `mogu-v1` | 没骨；山石草木去轮廓、干笔化淡彩、叠染晕边，小建筑与人物保留结构 |

画风改变材质与笔法，不新增随机数；固定 seed、构图和尺寸时山水位置与留白不变。金碧与没骨不能用整图滤镜或只换纸色来冒充。专门花卉沿用自身笔法。

`poetic-v1` 按诗句 + 题目 + 节气字段 + 标签依次匹配：雪/寒/冬/月/夜/禅/寂 → 水墨；秋/夕阳/落日/枯/暮/怀古 → 浅绛；春/夏/青/绿/碧/翠/柳/荷 → 青绿；无命中 → 水墨。优先级固定，金碧与没骨只由用户显式选择，避免旧 `poetic-v1` 作品随新画风改变。

- 新作默认「随诗意」；缺少或无法识别 `painting_style` 的旧作保留原纸墨，不批量重写旧配方。`withPaintingStyle` 同时更新纸墨；绘制时把解析值放入 @5 的 `SceneOptions.paintingStyle`。
- 版本值连同实际场景、纸墨淡墨与尺寸进入缓存；缺字段的旧缓存规范串不增加占位字段。保存原始配方与派生的绘制配方要区分，不能把两者未转换的参数直接比较。
- UI 主题与画作独立。主题水墨沿用旧 ID `yaqing`，浅绛 ID `qianjiang`；两者免费，青绿/金碧/没骨走当前 Standard 权益。切 UI 主题不改保存作品。UI「随节气」与画作「随诗意」不是同一选择器。
- 纸色中的月白、藕荷等仍可单独选择；不要把旧情绪色表的条目当成五种画风实现。
- 新建画屏继承用户当前卡片字体，现存配方字体不被全局选择覆盖；春风楷为免费字体。字体预览按简繁覆盖选择真实可用字体，不能一律改成思源宋体。

## 3. 诗句入画、壁纸尺寸与安全区

[JianyangView.swift](https://github.com/charsunny/wish/blob/9b1328b3ce9ef9727b05c3f196060147266cb72f/ios/Shared/Huaping/JianyangView.swift) 的 `verseBox / versePlan`：

- 从实际 `drawableProcedural.verseLayout(pixelSize:)` 取诗句框；水平内缩框宽 4%、垂直内缩框高 3%。壁纸 / 缩略图再夹进安全区的上下沿；桌面组件与画布边至少隔按比例折算的 8pt。
- 竖框竖排，横框居中横排。简繁或 locale 改变时重建文字层，防止沿用旧字形。字号太小则从末尾去掉一联，不能把字压进画里或退回整幅居中。必须说明实际保留的诗句，不能把裁短后的输出称为全文。
- 图片和纯纸走相应普通排版；不要假造其不存在的程序化锚点。锁屏组件走独立文字布局。

[JianyangCanvas.swift](https://github.com/charsunny/wish/blob/9b1328b3ce9ef9727b05c3f196060147266cb72f/ios/Shared/Huaping/JianyangCanvas.swift) 定义：

| 画布 | 规则 |
|---|---|
| 锁屏壁纸 | 上 32%、下 12% 留给系统界面；普通版心左右各 8% |
| 主屏壁纸 | 上 10%、下 16% 留白；普通版心左右各 8% |
| 当前设备 | 导出采用承载编辑器窗口的屏幕尺寸和 scale；无窗口参考值 1179×2556 @3x |
| `duoOuter` | 1398×2034 |
| `duoInner` | 2670×1878；文字、署名、印章放在同一侧 46% 宽区域，避开折线 |

尺寸是当前代码的导出规格，不据此推断设备型号或硬件能力。[HuapingWallpaperCanvas.swift](https://github.com/charsunny/wish/blob/9b1328b3ce9ef9727b05c3f196060147266cb72f/ios/PoetryHub/Views/Huaping/HuapingWallpaperCanvas.swift) 的 Duo 实况验收开关仍为 false；不能承诺其锁屏 Live Photo 可用。导出开始后冻结画布和配方，批量重试只处理失败目标。

本 skill 的 `--device iphone` 是固定 1290×2796 预设，不是自动读取 iOS 当前窗口。Duo 也尚无现成 CLI 参数。

### 展览页与导出画面的区别

[HuapingExhibitionCard.swift](https://github.com/charsunny/wish/blob/9b1328b3ce9ef9727b05c3f196060147266cb72f/ios/PoetryHub/Views/Huaping/HuapingExhibitionCard.swift) 的卡片正面是画、背面是可滚动的原诗；点击翻面、左右滑动换画。两面共用尺寸和 44pt 页脚，显示页码与操作提示，并给右侧分享/详情入口留位。不要把这些浏览控件烘焙进壁纸导出。

[HuapingThemeExhibition.swift](https://github.com/charsunny/wish/blob/9b1328b3ce9ef9727b05c3f196060147266cb72f/ios/PoetryHub/Views/Huaping/HuapingThemeExhibition.swift) 按主题保存当前画作位置；主题导航属于页面，选画属于展览。宽屏按阅读视口分栏显示目录与画作，不能把网页模板的固定 9:16 构图描述成 App 所有屏幕的展示方式。

## 4. 天气层、场景母题与动效预算

[HuapingWeather.swift](https://github.com/charsunny/wish/blob/9b1328b3ce9ef9727b05c3f196060147266cb72f/ios/Shared/Huaping/HuapingWeather.swift)：先按诗文和标题命中，再按节气补一种；最多两种，优先级 `rain > snow > moon > sunset > geese > mist`。雨雪互斥、日月互斥；月份和“岁月”等不触发月亮。渔灯只看深色外观且有船，不占天气名额。

[HuapingWeatherPlan.swift](https://github.com/charsunny/wish/blob/9b1328b3ce9ef9727b05c3f196060147266cb72f/ios/PoetryHub/Views/Huaping/HuapingWeatherPlan.swift) 还要按实际画面过滤：

- 花卉不加此天气层；没有 anchors 就不造天气。照片 / AI / 纯纸无这套程序化天气。
- @4/@5 的 `scene` 已有 moon/crescent 时不再叠月；已有 sunset/sunrise 时不再叠落日；不再叠加 mist。
- 雨须有 rain 且无 afterRain；雪须有 snow。雪景不在淡远山轮廓重复画硬雪沿。日月、涟漪、渔灯分别依天空、水面、船的真实锚点定位，避开诗句框。
- 画面有水才做水面效果；新版实况优先使用 `drawing.anchors.water`，不套老山水的固定水线。

| 强度 | 雨滴数 | 雪片数 | 涟漪数 | 雁阵 |
|---|---:|---:|---:|---|
| home | 42 | 44 | 5 | 24–36 秒周期 |
| detail | 12 | 8 | 0 | 固定小雁阵；慢雨雪，日月/雁不横穿 |
| video | 84 | 88 | 8 | 14–16 秒周期 |

这些是 iOS 计划参数，pt 与输出像素须按画布比例转换，不能照抄成所有分辨率的 CSS 像素。[HuapingMotionBudget.swift](https://github.com/charsunny/wish/blob/9b1328b3ce9ef9727b05c3f196060147266cb72f/ios/PoetryHub/Views/Huaping/HuapingMotionBudget.swift) 在减弱动态、低电量、serious/critical 过热或滚动时停背景；滚动停止 0.5 秒后恢复。此为 App 交互规则，不让离线导出读取当前机器电量来改变帧。

## 5. 三种入场不能混为一个预设

基础函数见 [HuapingInkReveal.swift](https://github.com/charsunny/wish/blob/9b1328b3ce9ef9727b05c3f196060147266cb72f/ios/Shared/Huaping/HuapingInkReveal.swift)：每字 0.25s，错开 0.12s，三次 ease-out；模糊 6pt→0、scale 1.06→1、opacity 0→1。最后一字结束后 0.3s 落印，持续 0.2s、scale 1.15→1，同样三次 ease-out，**无回弹**。App 逐字时间线不受视频压缩上限控制；今日页日期/题签/诗句起点分别为 0 / 0.15 / 0.7s，按日期或诗 id 记已播；减弱动态或 VoiceOver 时直接完整显示。

| 输出 | 入场 | 构图与背景 |
|---|---|---|
| 金句分享视频 | 0.3s 开始；诗句（含落印）压缩进预算，夹注、解析、题签各 0.18s，全部最晚 3.0s 落定 | 保持原笺样；首帧完整成画；有余韵或天气才作至多 2% smooth 推镜 |
| 全文详情视频 | 标题、作者、正文按单元；0.4s 开始，单元 0.25s、间隔默认 0.3s，压缩跨度最多 2.1s，最晚 2.5s 落定 | 1080×1920、30fps；背景线性 1→1.02，文字不动；不淡出回纸 |
| Live Photo | 作画段 + 余韵段，封面独立为完成画 | 不套“首帧完整成画”的分享视频规则；见第 6 节 |

[金句时间线与布局](https://github.com/charsunny/wish/blob/9b1328b3ce9ef9727b05c3f196060147266cb72f/ios/PoetryHub/Views/Huaping/HuapingQuoteVideo.swift)：

- 支持 1:1 / 3:4 / 16:9 分享构图。平台底部 20%、右侧 15% 遮挡是**提示**，不为平台按钮移动原诗栏。
- 先按原笺样排字，再给统一页脚预留空间；若诗栏下沿越过页脚上沿减 8pt，则缩短诗栏框并重新拟合，保留版式。页脚左右各 4% 宽、底距 5% 宽，高为 `min(30%宽, 30%高)`；有落款时在页脚左侧另留 23% 画宽给品牌/入口码。补充文字只排页脚，放不下先省解析，再省夹注，不压进诗栏。
- 解析仅取已有译文或赏析首句，约 24 字；夹注取已有注释，正文约 36 字。缺字段就省略，不编造为“诗库已有内容”。
- 天气时钟持续推进；余韵以 2.4s 周期循环，不能在文字落定或余韵换轮时重置天气。

[全文布局](https://github.com/charsunny/wish/blob/9b1328b3ce9ef9727b05c3f196060147266cb72f/ios/PoetryHub/Views/Huaping/HuapingDetailVideo.swift)：安全框 x=15%、y=8%、宽=70%、高=72%；整段至多缩到 0.8 倍，仍放不下报“一屏放不下”，不能删诗冒充全文。

两种分享视频共用 [HuapingVideoTiming.swift](https://github.com/charsunny/wish/blob/9b1328b3ce9ef9727b05c3f196060147266cb72f/ios/PoetryHub/Views/Huaping/HuapingVideoTiming.swift)：`hold = clamp(正文无标点字数 × 0.3, 6, 20)`；`duration = ceil(实际入场结束 + hold)`，30fps。署名不计阅读字数；朗读版还需容纳真实音频，不以这个静默阅读公式截断朗读。

## 6. 实况壁纸与分享导出

[HuapingLivePhotoMaker.swift](https://github.com/charsunny/wish/blob/9b1328b3ce9ef9727b05c3f196060147266cb72f/ios/PoetryHub/Views/Huaping/HuapingLivePhotoMaker.swift) 的默认规格：30fps、作画 1.2s + 余韵 2.4s、hold=0；视频长边上限 1920、尺寸取偶数，封面保留目标壁纸像素。山水默认 C：局部涟漪、船轻晃、一条淡雾；花卉是枝梢摆动与落瓣。整片水面横波 amplitude=0，不能改成全画面扭曲后还称原生实况同款。

Live Photo 是配对 HEIC（失败回退 JPEG）+ MOV，共享 asset identifier、照片 MakerApple `17` 与视频内容标识，并写 still-image-time 等元数据。still marker 位于作画中段（`drawEndFrame / 2`）。普通 MP4、GIF 或 PNG+MP4 不是 Live Photo；本仓库目前没有原生配对导出命令。含字视频缓存键包含当前简繁脚本；无字循环用 `scriptnone`，不因切换简繁重复生成。缓存还包含实际绘制键、规格及渲染版本，不能只按 poem id 复用旧视频。

[HuapingShareExportOptions.swift](https://github.com/charsunny/wish/blob/9b1328b3ce9ef9727b05c3f196060147266cb72f/ios/PoetryHub/Views/Huaping/HuapingShareExportOptions.swift)：视频的 720p / 1080p 表示**短边**；清晰度、字体与去落款服从 App entitlement。不要把 skill 的固定分辨率或音频混音策略称为 iOS 会员规则。`-14 LUFS` 与程序化拟音是本 skill 的社媒制作管线，不能据此声称 iOS 原生导出也带这些音轨。

## 7. 桌面与锁屏组件

[HuapingArt.swift](https://github.com/charsunny/wish/blob/9b1328b3ce9ef9727b05c3f196060147266cb72f/ios/Shared/Huaping/HuapingArt.swift)：App Group `Huaping/art` 共享画库；缓存键由实际 drawable procedural、纸/墨/淡墨和尺寸决定，非 `updated_at`。默认 LRU 80MB，保护今日及我的笺样。不可跨系统比较 JPEG 字节来证明绘制一致。

组件先找精确尺寸，再找 device profile 与同构图参考尺寸；小/中号可在预算内补一张（像素上限 `1100×520`，每次 timeline 预算 1）。大号缺图先纸纹并留请求给 App；组件不绘制整屏壁纸。

最新 [JianyangWidgetView.swift](https://github.com/charsunny/wish/blob/9b1328b3ce9ef9727b05c3f196060147266cb72f/ios/Shared/Huaping/JianyangWidgetView.swift)：锁屏 `showsLockScreenDate` 默认 false；inline 显示一行诗，rectangular 把前两句用换行分开并显示署名。不要沿用旧截图强加日期或把两句用逗号挤在同一行。

## 8. 本仓库 Web 能力与验收边界

v1.3.1 已将静态图和壁纸的排字落到运行时：按返回的诗句框内缩 4% / 3%，使用 1.18 字距、0.62 栏距、常规宋体、独立题跋和原生竖印，并区分 home 与锁屏安全区。长标题超过 8 字另起栏、超过 18 字分两栏；Web 对多栏题跋额外限制可用宽度并将题跋间隔收至 0.45em，避免越界。字体与印章随包提供。`image` 页脚使用北京时间的公历日期（`yyyy年M月d日`）在上、节气/候在下，与二维码右侧对齐；`--date` 可固定日期，默认在本次渲染开始时取当天。iOS 静态分享及分享视频的同一题签也加入了日期，成品缓存键按日期区分。以下差异仍不能称为完整原生移植：

| 位置 | 当前行为 / 使用注意 |
|---|---|
| `resources/vendor/zxart/zxart-shanshui-v5.js` | 尚未移植上述五画风的材质、点金与没骨笔法；传入画风字段或换 palette 不等于实现该画风 |
| `scripts/generate.mjs` | 固定设备预设；模板补齐题诗用途、母题、构图和诗句列数/字数；不导出 iOS recipe、Widget 或 Live Photo。静态摘句超容量会报告未展示诗句 |
| `resources/templates/media-suite/index.html` / `resources/core/huaping-layout.js` | `image` / `wallpaper` 已使用真实诗句框与原生排字比例；仍是 DOM 字形度量，仅提供内置宋体，不含 App 所有字体/简繁转换；`image` 已包含品牌、诗词查找入口码及两行日期/节气页脚，尚无夹注与解析页脚内容，也不宣称像素一致。其他社媒模板不沿用这套版式 |
| `resources/templates/huaping-motion/index.html` | 自有 0.35s 起点及入场预算，detail/quote 尚未逐项实现第 5 节；现有示例多为 @2 |
| `resources/core/weishi-video-core.js` | 实际函数叫 `inkUnitState`；默认还有 y 位移、最小错开与压缩；`sealStampState` 为 0.22s、1.18 起始缩放与回弹，不能称 iOS 等值实现 |
| `WeatherStage` | Web 自有天气实现；生成严格同款前须接入真实 anchors 和 @5 母题去重，不能假设画里总有船 |
| `renderZXArt` | 返回 `ok / fallback / verse / anchors`；fallback 是简化山水。必须检查结果，降级画不能算 @5 成功验收 |

执行顺序：确定输出类别和目标尺寸 → 保留/生成完整场景配方 → 依实际诗句框排字 → 按母题和几何选天气 → 使用该类别时间线 → 检查首帧、落定帧、尾帧与文字溢出。普通 Web 风格创作可继续使用现有 CLI；用户明确要求原生同款时，先修正涉及的模板差异或走 iOS 原生导出，并如实报告完成范围。

修改运行时才运行相应行为测试与截图；仅改说明时检查链接、字段和示例可用性。原生行为可对照 `ios/PoetryHubTests/` 的 `HuapingArtTests`、`HuapingEditingTests`、`ThemePaletteTests`、 `HuapingVerseInArtTests`、`HuapingWeatherTests`、`HuapingInkRevealTests`、`HuapingQuoteVideoTests`、`HuapingDetailVideoTests`、`HuapingLivePhotoTests`、`HuapingWidgetTests`；没有运行就不能写成已通过。
