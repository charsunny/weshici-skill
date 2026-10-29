# 山水基线与 video-v2 合并说明

`fa56bfb` 的笔墨效果已经视觉验收通过。本分支最后一轮只修两个瑕疵：省略压缩曲面上的孤立 S 形皴束；带山体湿染的图层在完整画幅上计算退墨后再分块淡出，消除 64 行分块形成的直边浅带。周围笔迹的随机序列、树石溪流与深色反相保持原样。

## 分支比较范围

核对日期：2026-10-29。远端 `feat/video-v2` 为 `bf7cb06`（第 5 步已完成）；共同祖先为 `8194e650eccac347a72c6e73cf409964b84ca736`。以下列出 **共同祖先到 theme 分支** 的改动，不把 video 分支自己的新增文件误报为 theme 删除。

| 共用路径 | 本分支变化 | 合并时保留 |
| --- | --- | --- |
| `resources/vendor/zxart/zxart-shanshui-v5.js` | 修改：版本化元素处理、山势与皴染、松杂树、石岸溪流、主题点染及笔墨元数据 | `landscape-v3` 显式入口、独立 seed 流、brush / wetInk / paperMask 字段及其坐标变换 |
| `resources/vendor/zxart/zxart-ink.js` | 新增：确定性栅格笔墨、纸纹接触、湿染扩散与退墨 | Worker 必须同时部署、加载此文件；当前内部版本 `terrain-ink-9`，完整复现仍以源码哈希为准 |
| `resources/vendor/zxart/zxart-worker.js` | 修改：加载墨层模块，逐笔叠墨、纸色遮挡、完整湿染栅格化、可选纸纹强度及元数据返回 | `brush` / `wetInk` 不合批；保留山体图层完整染面计算及扩散边距，不恢复分块独立退墨 |
| `resources/vendor/zxart/zxart-compose.js` | 修改：主题强调色、花茎明暗与点染，解析并传递 `element_treatment` | 默认仍为 `original`；新绘画通过显式参数启用，不能把实验参数直接设成所有视频的默认值 |
| `resources/core/huaping-layout.js` | 修改：支持 `fontFamily`、按实际字形计算 `columnWidth`，供书法和自定义字体排版 | 保留 video 已有 `minInscription` 逻辑；不传新参数时继续使用 SongReg 与原列宽 |
| `resources/core/weishi-video-core.js` | 修改：请求透传 `paperStrength`，结果透传可选 `brushwork` | 这两项为增量字段，保留 video 的渲染与回退逻辑 |
| `resources/core/theme-art-study.js` | 新增：主题、画风、字体、用途与配方解析校验 | 独立验证入口，不替换现有视频控制器 |

截至 `bf7cb06`，video 分支分叉后改动的 core 文件是 `resources/core/footprint.js`（新增）、`huaping-scene.js`、`huaping-video.js`，另有视频模板、配方、工作台、脚本、文档、样例和测试。双方在 `resources/core/` 与 `resources/vendor/zxart/` 的改动路径不重叠；全部改动路径的交集只有 `SKILL.md`。`git merge-tree --write-tree` 合并模拟退出码为 0，包含 `SKILL.md` 的自动合并，无文本冲突。未实际合并分支；以后若远端继续推进，须重新核对。

本分支另外新增主题验证模板、脚本、用例、参考文档与测试，并修改 `SKILL.md`、`.gitignore`、`tests/huaping-layout.test.mjs`。本次只推送 `feat/theme-art-validation`，不建 PR、不合并 video 分支。

## 验证和复现

```bash
node tests/zxart-terrain-ink.browser.mjs
node scripts/landscape-painting-study.mjs out/landscape-baseline
node scripts/theme-art-study.mjs examples/theme-art-landscape.json out/landscape-themes
# 更新远端后，分别比较两侧相对共同祖先的改动
base=$(git merge-base HEAD origin/feat/video-v2)
git diff --name-status "$base" HEAD
git diff --name-status "$base" origin/feat/video-v2
```

横向浅带回归检查：同一块湿染，直接绘制与套上尚未进入淡出区的图层相比，`fa56bfb` Worker 的内部最大 RGB 差为 13，修复后为 0。三种子证明图逐字节重复渲染；输出的 `scenes.json`、`sources/` 保存种子、源码和 PNG 校验。验收图片位于忽略的 `out/`，不随源码分支推送。
