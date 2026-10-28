# 主题与诗画：Skill 实验及迁移规则

本入口用于验证主题、绘画和阅读用途的关系。当前是 1080×1440 静态 PNG 实验，现有 App、poster、image、wallpaper 和视频模板不自动采用这些新默认值。

## 使用

```bash
# 三主题 × 浅深 × 山水/花卉/素纸；同诗同种子同排字
node scripts/theme-art-study.mjs examples/theme-art-study.json out/theme-art-validation/round-b-final

# 四首诗 × 题诗/全文 × 浅深，含显式覆盖、素纸与随节气样本
node scripts/theme-art-study.mjs examples/theme-art-reading.json out/theme-art-validation/round-c

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
| artPalette | 默认 follow-theme，只取主题的 ink；显式七套 id 可锁定墨色。绘画 paper 始终与界面纸色相同，花卉原色不取 accent |
| purpose | inscription 题诗画屏：用显式 excerpt，否则用 poem；reading 全文：使用完整 poem（或 fullPoem），不采用 excerpt |

摘句每一行必须在原诗中存在；全文超出固定阅读区直接报错，交由调用方明确分篇。此入口不自动分页，也没有动态字体/任意画幅适配。

## 用途与绘画边界

- 题诗：保留完整绘画构图，复用引擎诗句框与竖排模块。
- 阅读：横排全文，正文在上，独立生成的 1080×440 画幅放在底部，顶部 70px 淡入纸色。检测正文底部与景物之间至少留 48px；正文区域逐像素检查无景物。不会把完整立轴缩小贴到全文背后。
- 实验纸感：禁用引擎背景纸纹，统一加极淡、固定种子的纸层。Worker 的 `paperStrength` 为可选参数，旧调用不传时完全沿用旧纸纹。
- 深色山水：在独立实验模板中沿用现有 deepenInk 算法，以 1.65 倍增益加强离纸色足够远的笔迹；不改变花卉原色，也不作用于原视频模板。
- shanshui@5 是此仓库的 Web 快照；nonflowers@2 是现有程序花卉。主题名不是笔法名，`artPalette=canglang` 不能描述为完成青绿设色移植。

## 保存与复现

每个快照采用 `weshici-theme-art@1`，保存实际主题和日期、颜色、绘画墨色、题材、完整绘画请求、诗句框、种子、尺寸和用途。集合保存浏览器版本、渲染代码/字体/印章的 SHA-256 与输出 PNG 校验值。

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
