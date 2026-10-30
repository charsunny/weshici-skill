# Landscape-v3 默认画法候选

基于 `origin/feat/theme-art-validation` 的 `af54960` 创建 `feat/landscape-default`。当前远端 main 为 `03f136a`，尚未包含 PR #7；按用户指定顺序，**本轮未合并 main**。以下样张用于默认画法预验收，不能替代合入视频 v2 后的最终验收。本分支不创建 PR。

## 改动范围

- `zxart-compose.js` 和 `generatePoetryPaintingV5` 的 shanshui@5 缺省处理改为 landscape-v3。显式 original 仍走旧路径，其余生成器缺省不变。
- `poetryScene().paintingProcedural()` 统一选择主导皴法：望岳、岱宗、泰山、华山、峭壁、绝壁、千仞用斧劈，其余用披麻；显式 `cun: "axe" | "hemp"` 优先。主题实验、media-suite、三个视频模板均使用此配方。主题实验的花卉仍默认 refined-v1。
- media-suite 各绘画入口都传完整配方。小红书封面标题用引擎诗句留白区，第 3 张从实际景物与 brushwork 标注披麻／斧劈及折带石岸，石岸引线采样实际墨迹。微信日签的整卡模糊从 12px 降至 2px，保留皴染细节。
- 新画法视频跳过 `finishPainting` 的旧加墨及落日替换，浅深色都保留引擎墨阶、日月和遮挡。旧画法保持原处理。`huaping-video.js` 中的 deepenInk 等旧函数保留，仅新路径不调用。
- 新画法余韵雾层强度为旧层的 35%。涟漪使用实际水域／舟锚点并检查底图像素；雾层沿墨量较多的行放置；雁使用引擎天空范围；雨雪的纵向活动范围由实际 sceneElements 边界经画幅变换后决定，并继续避开诗句框。
- poetry-poster 及其独立画法未修改；App 未迁移。深色反相保持用户已接受的方向。

## 本机验收文件

仓库绝对路径：`/Volumes/XiPass/literature/weshici-skill`。原始 PNG 均在本机 out 中，不提交 Git。

| 目录 | 内容 |
| --- | --- |
| `out/landscape-default/static/` | 11 张原尺寸 PNG、contact.png、checks.json |
| `out/landscape-default/video/` | 5 配方 × 浅深色 ×（9 关键帧 + 3 落定后相邻帧），共 120 张原尺寸 PNG；10 张 sheet.png；checks.json |
| `out/landscape-default/legacy-static/` | 显式 original 的同配方静态对照；用于检查旧路径及视觉变化 |

静态包含 image《山居秋暝》《江雪》3:4、山居深色、iPhone 壁纸 1290×2796、小红书四张、微信日签、微信微画及《望岳》斧劈补充图。视频包含 huaping-motion 的清明、寒露、大雪，ink-story 的晚晴，poem-song-mv 的苏幕遮，全部浅深色。每组末尾 `09–11.png` 为相隔 1/30 秒的余韵帧。`examples/` 刷新对应五张九帧 JPEG，大雪接触表为新增。

```sh
node scripts/landscape-default-static-check.mjs
node scripts/landscape-default-motion-check.mjs
node --test tests/*.test.mjs
```

Mac 单测 69/69 通过。10 组视频无页面错误、无文字安全区越界、无模板警告；乱序 seek 后 PNG 哈希一致，落定后相邻帧仍变化。静态检查确认实际使用 v3、《望岳》用 axe、文字在画幅内。测试通过不等于审美验收通过。

## 审图判断与待整合事项

山石和树冠较同配方 original 更完整，当前未发现必须回退 original 的模板。静态《江雪》仍使用 winterForest，虽返回舟与钓者，视觉上寒林占主导、孤舟不够醒目；视频大雪沿用已明确的 fishing 配方，舟与钓者可见。这个静态构图问题不应被标为通过。

当前主题分支还没有 main 的视频 v2 第 5 步修复，因此《晚晴》的天气语义、部分视频诗句布局及已有配方修正，不能以本轮帧替代 main 集成检查。待 PR #7 合并后：合入 main，保留 main 的 motifs 覆盖、文字避让和原画法太阳遮挡修复，同时保留本分支的新画法分流；重跑上述两份渲染与 Mac 单测，刷新 out 和 examples，再交统一验收。不能直接用本分支覆盖 main 的共用文件。
