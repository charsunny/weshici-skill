# Landscape-v3 默认画法验收

分支 `feat/landscape-default` 已整合 `origin/main` 的 `f47ba4c`（含 PR #7）。保留视频 v2 第 4、5 步的 poet-footprint、caption.mjs 事实约束、文档改写、MV 文字布局与中性灰接触表。本轮只推送分支，不创建 PR。

## 默认画法与共用改动

- `resources/vendor/zxart/zxart-compose.js` 和 `zxart-shanshui-v5.js` 将 shanshui@5 缺省处理设为 landscape-v3；显式 original 仍使用旧画法。
- `poetryScene().paintingProcedural()` 共用主导皴法选择：望岳、岱宗、泰山、华山、峭壁、绝壁、千仞用斧劈，其余用披麻；显式 cun 优先。主题实验、media-suite 和三个绘画视频模板统一调用。
- `resources/core/huaping-scene.js` 保留 main 的 motifs 覆盖、诗句避让、旧画法落日遮挡；v3 跳过旧 2.4 倍加墨及落日重画，输出实际景物与天气锚点。`huaping-afterglow.js` 的 v3 雾层强度为旧层的 35%，雨雪范围跟随实际几何。
- media-suite 的小红书封面使用诗句留白区，第 3 张按实际景物与 brushwork 标注皴法、折带石岸；微信日签模糊降至 2px。主题实验花卉仍默认 refined-v1。
- `huaping-video.js`、`footprint.js`、poet-footprint 模板、caption.mjs 与 main 一致。poetry-poster 及 App 未改动。

## 804dbb1 后的三项修正

1. **孤舟钓者的场景优先级**：旧规则先按标题命中冬景或秋景，正文的钓者被盖过。现在正文中的明确垂钓人物、动作，或水域中的孤舟／独舟优先路由 fishing；寒江、雪景本身不触发 fishing，单独的“蓑”也不把“一蓑烟雨”误判为垂钓。《江雪》《渔歌子》《题秋江独钓图》均检查带标题及无标题输入，并验证实际舟锚点与钓者。
2. **苏幕遮的江面**：保留 main 已验收的 seed、depth 构图、1920 画高、mist/sunset 配方及歌词布局，只给该配方设置 `procedural.bankScale: 0.35`，缩小近岸并保留远山与宽阔水面。其他配方默认 1。另外修正 v3 水纹裁切只更新 pts、未更新渲染坐标 p 的问题，避免水纹越过实际水域。
3. **深色可读性**：保持反相方向，在 v3 颜料映射阶段提高普通线条和远景淡染的对比与不透明度，干皴仅小幅加实；保留纸面遮罩和日月颜色。检查清明、寒露、大雪、晚晴和苏幕遮的深色样张，寒露屋舍、舟线、山体层次可辨。

## 本机验收文件

根目录：`/Volumes/XiPass/literature/weshici-skill/out/landscape-default/`。`index.html` 为总索引；原始 PNG 留在 out，不提交 Git。上一版完整样张保存在 `out/landscape-default-804dbb1/`。

| 目录 | 内容 |
| --- | --- |
| `static/` | 13 张原尺寸 PNG、contact.png、checks.json |
| `legacy-static/` | 同 13 个任务显式 original 对照、contact.png、checks.json |
| `video/` | 6 配方 × 浅深色 ×（9 关键帧 + 3 落定相邻帧），144 张原尺寸 PNG、12 张接触表、checks.json |
| `comparison/` | 与 804dbb1 的江雪、壁纸、苏幕遮浅深色、寒露深色及全部深色并排图；旧版在左 |

静态覆盖《山居秋暝》《江雪》3:4、山居深色、iPhone 壁纸、小红书四张、微信日签及微画、《望岳》斧劈，并补充两首垂钓题材。视频覆盖 huaping-motion 的清明／寒露／大雪、ink-story 晚晴、poem-song-mv 苏幕遮，以及 poet-footprint 苏轼足迹，全部浅深色。每组 09–11.png 为相隔 1/30 秒的落定后帧。examples 刷新对应六张九帧 JPEG，统一中性灰底；poet-footprint 继续用既有文件名。

```sh
node scripts/landscape-default-static-check.mjs
node scripts/landscape-default-static-check.mjs out/landscape-default/legacy-static --original
node scripts/landscape-default-motion-check.mjs
node --test tests/*.test.mjs
```

Mac 单测 **77/77 通过**。26 张静态检查通过；12 组视频无页面错误、无文字安全区越界、无模板警告，乱序 seek 后 PNG 哈希一致，落定后相邻帧继续变化。渲染元数据与帧哈希记录在 checks.json，单测日志见 unit-tests.log。测试通过不替代审美验收。

审图确认三项修正均可见；未发现需要回退 original 的模板。静态及壁纸中画面总体偏小、偏淡，按本轮范围保持不变。尚未导出整段成片，本轮交付的是所要求的原尺寸验收帧。

补充诗文来源：[张志和《渔歌子》](https://zh.wikisource.org/zh-hans/漁歌子_(張志和))、[王士祯《题秋江独钓图》](https://m.gushiwen.cn/shiwenv_32c4c7921ebe.aspx)。
