# 主题与诗画：Skill 实验及迁移规则

本入口用于验证主题、绘画和阅读用途的关系。当前是 1080×1440 静态 PNG 实验，现有 App、poster、image、wallpaper 和视频模板不自动采用这些新默认值。

## 使用

```bash
# 三主题 × 浅深 × 山水/花卉/素纸；同诗同种子同排字
node scripts/theme-art-study.mjs examples/theme-art-study.json out/theme-art-validation/round-b-final

# 四首诗 × 题诗/全文 × 浅深，含显式覆盖、素纸与随节气样本
node scripts/theme-art-study.mjs examples/theme-art-reading.json out/theme-art-validation/round-c

# 深色纸面修订：三主题 × 山水/花卉/素纸
node scripts/theme-art-study.mjs examples/theme-art-dark.json out/theme-art-validation/dark-theme-v2

# 首次导入 App 的画屏字体（原文件与许可说明，写入本地缓存）
node scripts/theme-art-fonts.mjs /path/to/wish/fonts
# 七主题浅色、六款书法的浅深对照、全文及自定义字体
node scripts/theme-art-study.mjs examples/theme-art-fonts.json out/theme-art-validation/light-font-v3

# 元素优化：花茎、岸脚、山尖／茅草／枝叶的主题点染
node scripts/theme-art-study.mjs examples/theme-art-elements.json out/theme-art-validation/elements-after

# 山体块面与树冠墨簇试验（显式 painted-v2，不切换默认值）
node scripts/theme-art-study.mjs examples/theme-art-brush.json out/theme-art-validation/brush-after

# 重放已保存的作品；直接使用保存的颜色、请求及诗句框
node scripts/theme-art-study.mjs out/theme-art-validation/round-c/recipes.json out/theme-art-validation/replay-all

# 抽查既有三类视频模板的关键帧；不生成 MP4、不混音
node scripts/theme-art-motion-check.mjs out/theme-art-validation/motion
```

依赖仓库锁定的 npm 包和本机 Chrome。输出原图、按用途和浅深分组的接触表、输入 `manifest.json`、检查记录 `checks.json` 和作品快照 `recipes.json`。

## 单张输入与批量输入

最常用的批量格式是 `cases`，每项独立指定配方：

```json
{
  "cases": [{
    "title": "梅花",
    "author": "王安石",
    "poem": "墙角数枝梅，凌寒独自开。遥知不是雪，为有暗香来。",
    "excerpt": "墙角数枝梅，凌寒独自开。",
    "seed": "study-梅花",
    "date": "2026-10-28",
    "theme": "canglang",
    "appearance": "light",
    "purpose": "reading",
    "artwork": "auto",
    "artPalette": "follow-theme"
  }]
}
```

对照矩阵格式见 `examples/theme-art-study.json`：共同诗句加 `themes`、`appearances`、`artworks` 数组。`theme` 是视觉配色；不复用 poster 中表示组图策划标题的同名字段。

## 解析优先级

| 输入 | 规则 |
| --- | --- |
| 保存快照 | 优先直接加载，绕过下面所有新作默认值；不对快照叠加当前主题 |
| theme | 默认鸦青；七套 App 色板均可，`seasonal` 按 date 解析成具体主题；缺日期时保存北京时间当天 |
| appearance | 显式 light / dark 优先；未指定时以明月、月夜、夜泊、夜静、寒夜作保守夜景提示，否则 light；可手动纠正 |
| artwork | 默认 auto；可显式 shanshui、flowers、none。none 关闭景物，保留文字和纸感 |
| auto 题材 | 梅花/咏梅/梅枝/梅蕊、菊、兰花/幽兰/咏兰进入对应花卉；其余走现有 poetryScene。荷塘默认山水场景；“兰舟”不当兰花。这是有限规则，不声称完整理解诗意 |
| flower | 显式自然、梅、荷、菊、兰优先；未指定时使用识别到的花卉，否则自然。用户要独立荷花时同时设 artwork=flowers、flower=荷 |
| artPalette | 默认 follow-theme；显式七套 id 可锁定墨色与点染色。绘画 paper 始终与界面纸色相同，花瓣原色不取 accent |
| purpose | inscription 题诗画屏：用显式 excerpt，否则用 poem；reading 全文：使用完整 poem（或 fullPoem），不采用 excerpt |
| elementTreatment | 新作默认 refined-v1，修正花茎明暗、景物淡出与深色高亮，并启用局部主题点染；original 保留原处理，供对照；painted-v2 显式试验山体块面与树冠墨簇，尚非默认 |
| font | 独立于主题和题材，默认 source_han_serif；可选下表中的 App 字体 id 或自定义本地文件对象 |

摘句每一行必须在原诗中存在；全文超出固定阅读区直接报错，交由调用方明确分篇。此入口不自动分页，也没有动态字体/任意画幅适配。

## 字体选择与自定义

| id | 字体 |
| --- | --- |
| source_han_serif | 思源宋体（已随 skill 提供） |
| shufa_liyu | 漓雨手书 |
| shufa_dongfang | 东方大楷 |
| shufa_xuanzong | 玄宗行楷 |
| shufa_chongxi | 崇羲篆体（建议输入繁体） |
| shufa_yufan | 余繁新语 |
| shufa_liujiang | 流江毛草 |

六款画屏字体核对自本机 `qa-8.0.1/wish/ios/Shared/PHFonts.swift` 的最新未提交工作；主 wish 工作区仍是旧目录。本实验使用对应 `fonts/PaintingFonts/` 与 `fonts/painting-download/` 的原文件，未修改或子集化。导入器复制六个字体及各自许可文件到 `resources/assets/fonts/painting/`（gitignored），无需运行时联网，不把约 92 MB 字库加入代码仓库。

预设例：`"font": "shufa_liyu"`。自定义例：

```json
"font": { "name": "我的楷体", "path": "/本机路径/my-font.ttf" }
```

支持 TTF、OTF、WOFF、WOFF2；相对路径以 skill 仓库根目录为基准。字体影响诗句、标题和署名，不替换印章。文件缺失或加载失败直接报错，不伪装成成功选择；个别缺字按浏览器规则回退思源宋体，`checks.json` 的 `usedFonts` 记录实际字体与字形数。本入口不自动做简繁转换，也不承诺任意字体覆盖全部汉字；崇羲样张显式输入繁体。

竖排按所选字体测量字高、字宽和笔画外伸，保持原诗句框并重新适配字号；不同字体不要求排版数值相同，同字体切换主题不改变排字。全文阅读也可指定书法，默认仍为宋体。字体目前通过 JSON 配方选择，尚无交互式字体上传面板。

## 用途与绘画边界

- 题诗：保留完整绘画构图，复用引擎诗句框与竖排模块。
- 阅读：横排全文，正文在上，独立生成的 1080×440 画幅放在底部，顶部 70px 淡入纸色。检测正文底部与景物之间至少留 48px；正文区域逐像素检查无景物。不会把完整立轴缩小贴到全文背后。
- 实验纸感：禁用引擎背景纸纹，统一加极淡、固定种子的纸层。Worker 的 `paperStrength` 为可选参数，旧调用不传时完全沿用旧纸纹。
- 浅色纸面：鸦青 `#E8EEEB`、月白 `#E5EFF5`、缃叶 `#F3EBD7`、苍筤 `#E6EFE2`、藕丝 `#F1E6EE`、青黛 `#E5EAF3`、胭脂 `#F5E6E2`。与深色一样，仅实验入口采用；保留可见但低饱和的主题底色，不给花朵整体染色。
- 深色纸面：实验入口使用低饱和、可辨识色相的主题深色，不把七套主题都压到近黑。鸦青 `#202E30`、月白 `#263642`、缃叶 `#383022`、苍筤 `#243B30`、藕丝 `#392B36`、青黛 `#23334E`、胭脂 `#402B2B`。纸色同时供页面和绘画使用；原 App 色板文件和花卉原色不变。已保存作品仍使用快照内的颜色。
- 深色山水的反相效果已由用户明确选择保留（de74eca 审图反馈）；后续山水笔法修订不改这项映射。
- 深色山水：refined-v1 去掉旧实验的 1.65 倍整体增亮，近景墨色向纸色收敛；月盘与周围淡云分别处理，避免云形变成高亮实心块。original 继续保留旧增亮用于对照。
- shanshui@5 是此仓库的 Web 快照；nonflowers@2 是现有程序花卉。主题名不是笔法名，`artPalette=canglang` 不能描述为完成青绿设色移植。

## 元素处理与局部点染

山势与笔法联动验证使用 `elementTreatment: "landscape-v3"`。详见 [教材到生成规则的对应说明](LANDSCAPE-BRUSHWORK.md)；包含披麻／斧劈近似、提按与枯湿、结构化种子及多种子审图入口。允许更新山体和景物边界，天气锚点随实际几何更新；不再沿用 painted-v2 的固定轮廓限制。默认处理与 App 不变。

`refined-v1` 通过 Worker 的 `params.element_treatment` 显式启用；现有其他入口不传此参数，仍走 original。此字段和实际点染色随请求保存，不在重放时重新解析。

- 山水在已放置景物的范围内筛选少量细笔：山体上段用 accent，屋顶上半部用 secondary，树冠与枝干细笔用 accent。保留大面积纸色遮罩和主要墨骨，不给整幅画加色罩。
- 被选中的笔触仅部分混入主题色；最低不透明度限制为 0.26（屋顶 0.30），极淡的底层晕染不加重。深色点染使用主题深色配色。
- 花茎纠正原来超范围的明暗插值，草本主茎收窄接向分枝；一侧少量混入 accent。花瓣层不改色，不把梅花染绿。
- 山脚与远岸使用有效的淡出参数，减轻截断感；保留同种子的山水几何、诗句框、景物与天气锚点。

这是 Web 细部修订，不是植物解剖或完整青绿笔法重写。点染位置按景物范围与细笔大小筛选，不承诺所有种子的每片叶子、每根茅草都可独立设色。原图位于 `elements-before`，新版位于 `elements-after`，验收页顶部提供局部放大与全部浅深对照。

## 山体与树冠笔触试验

`elementTreatment=painted-v2` 在 refined-v1 的主题点染、深色与淡出处理之上，替换山体内部笔触和松树／一般阔叶树的叶簇。花卉生成器保持 refined-v1 的处理；柳枝、竹叶和开花树并未重写。

试验先用旧生成过程固定构图所需的随机序列与外形边界，再用独立种子生成块面和墨簇；因此更换笔触不移动题字、景物范围或天气锚点。山体采用连续淡染、阴面分区、较短且不均匀的皴笔与断续轮廓；松冠减少放射状细针，保留少量提示线。这个过渡实现仍计算原笔触以保持布局，不宣称已经优化生成耗时。

当前四张固定浅深样本用于比较方向。山势沿用旧轮廓，仍可能偏柱状；墨簇仍可见程序化形状。默认保留 refined-v1，用户验收前不自动替换其他配方或 App。后续应继续从山势、山石转折、皴染关系与树冠疏密改进，不把添加噪点、提高细节数量或整体模糊等同于传统笔法。

技法参考：[亚洲艺术博物馆《Brushstrokes》](https://education.asianart.org/wp-content/uploads/sites/6/2019/09/Brushstrokes.pdf) 对线、墨与干湿用笔的说明；[大都会博物馆《夏山图》](https://www.metmuseum.org/art/collection/search/39915) 对皴笔与墨染配合的说明。这里是据此选择的程序试验方向，不是对某一名家笔法的完整复原。

## 保存与复现

每个快照采用 `weshici-theme-art@1`，保存实际主题和日期、颜色、绘画墨色、题材、完整绘画请求、诗句框、种子、尺寸和用途。集合保存浏览器版本、渲染代码/字体/印章的 SHA-256 与输出 PNG 校验值。

有字体配置的作品另保存字体名称、id、SHA-256 与相对路径；原字体文件复制到输出目录的 `fonts/`，已有许可旁文件一并复制。自定义字体可在原文件旁放置 `<文件名>.LICENSE.txt`。重放时从配方旁的 `fonts/` 加载并校验实际字节，不依赖原机器上的文件路径或字体安装状态。保留作品时应保存整个输出目录，不能只取 `recipes.json`。

重放不依赖当前 palette 色值或当日节气，使用快照内的实际值。引擎、模板、字体或浏览器版本不一致时报错；不能用相同 seed 宣称跨版本像素一致。此机制用于复现与审计，不是任意旧版本的兼容渲染器。若要永久保留作品，应同时存 PNG 和匹配版本的源码/资源。

## App 迁移映射（验收后实施）

| Skill 概念 | App 建议映射 |
| --- | --- |
| theme / colors | ZXIdentity / ZXTheme 的纸、墨、强调、印色；保留现有 UI 槽语义 |
| appearance | 当前系统浅深或用户显式选择；保存作品时固定实际模式 |
| artwork + generator | 诗意题材路由到 ZXArt.Procedural；独立花卉不受主题强制改成山水 |
| artPalette / artColors | 独立的绘画调色偏好；与原生 PaintingStyle 字段分开，不能直接当作同一种枚举 |
| purpose | 原生 inscription / reading 等用途；重新按屏幕、字号、安全区布局，不照搬 Web 像素 |
| snapshot | 保存解析后的作品配方与引擎版本；旧作保持，主题变化只影响新作 |
| none | 纯阅读纸底；区别于“无字、有画”的纯壁纸 |

建议 UI 入口为「跟随主题 / 自选画风 / 素纸」，进入自选后才暴露题材/画风；不要求普通用户同时理解多个配色字段。原生端还需独立做动态字体、辅助功能、不同设备及跨渲染器审图。

已知限制与本轮实测结果见 `docs/THEME_ART_FINAL_REVIEW.md`。用户统一验收前不把这些实验规则迁入 App。
