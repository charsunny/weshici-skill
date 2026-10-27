# 诗词海报 · poster

用于大字诗句、社交分享封面、同一主题的诗词组图。延续用户认可的「青绿朱砂／黛蓝月夜／暖金墨山」方向：字体清晰、色块明确、前中后景有深浅，缩略图仍能看清主句。背景与壁纸继续用 `image` / `wallpaper`；Wish 同款要求读 IOS-HUAPING.md。

## 视觉与内容

- 主句是第一阅读层级，一张摘选 1—2 行。长诗先选择完整诗句或有意义的分行，不静默截断，也不把摘句标为全文。
- 配色与诗意相配，母题按内容选：月夜、枫叶、舟楫、芦荻、茅屋、故垒等。不要每张都机械放上日月和全部元素。
- 落款写真实诗题、作者；品牌／二维码／两行日期保持垂直居中。诗句二维码使用现有 `weshici://poem/lookup`，封面二维码打开微诗官网。
- 主题组图共用日期、主题与编号，可做一张封面＋逐诗海报；数量以任务和诗单为准，不固定七张。`subtitle` 是短副题，引用原诗时核对原文，编辑文案不能冒充诗句。
- 本模板为独立的确定性 Canvas 绘图，非 AI 生图，非 ShanShui@5 输出。只实现 3:4 静态 PNG；不声称已经适配抖音 9:16 控件、自动生成视频或验证传播效果。

## 命令

在 skill 根目录运行，需要 Node.js、Chrome 与 `npm install` 安装的依赖。

```bash
# 单张海报；--poem 用标点或换行明确分为一至两行
node scripts/generate.mjs poster --title "山居秋暝" --author "王维" --poem "明月松间照，清泉石上流" --palette yueye --layout vertical --date 2026-10-27 --out out/poster-shanju

# 完整组图；此示例为 2026-10-27 的芦荻主题存档，不代表运行当天
node scripts/generate.mjs poster --manifest examples/poster-ludi.json --out out/poster-ludi
```

`--out` 是目录。输出顺序编号的 PNG，组图额外生成 `contact-sheet.png`，并保存 `manifest.json`。不传日期时用北京时间当天；给定日期与种子、相同字体和浏览器环境可复现。

## Manifest

```json
{
  "theme": "山间明月",
  "date": "2026-10-27",
  "cards": [
    {
      "layout": "cover",
      "title": "山间明月",
      "lines": ["山间明月"],
      "subtitle": "与诗相伴的一轮月色",
      "palette": "yueye",
      "motifs": ["moon", "pine"]
    },
    {
      "title": "山居秋暝",
      "author": "王维",
      "poem": "明月松间照，清泉石上流。",
      "lines": ["明月松间照", "清泉石上流"],
      "layout": "vertical",
      "palette": "yueye",
      "motifs": ["moon", "pine"],
      "caption": "松风明月"
    }
  ]
}
```

| 字段 | 规则 |
| --- | --- |
| `theme`、`date` | 全组主题（最多 16 字）、YYYY-MM-DD 日期 |
| `title`、`author` | 诗题最多 32 字、作者最多 12 字；封面可省略作者 |
| `lines` | 1—2 行，每行最多 8 字；封面 1 行、最多 4 字。更长主题可放在 `title`、`subtitle` 中，封面主标题另选短题 |
| `poem` | 可附完整原文；渲染前会检查主句是否出自原文，组图建议保留以便核验 |
| `layout` | `horizontal`（默认）、`vertical`、`hero`（每行最多 5 字）、`cover` |
| `palette` | `qinglv` 青绿朱砂（默认）、`yueye` 黛蓝月夜、`nuanjin` 暖金墨山 |
| `motifs` | `sun`、`moon`、`reeds`、`maple`、`cottage`、`fortress`、`pine`、`boat`、`heron`；日月二选一，空数组可只保留山水。省略时为日／月＋松树＋舟楫 |
| `subtitle`、`caption` | 可选副题最多 28 字（支持换行）、页脚短题最多 8 字 |
| `seed` | 可选固定种子；省略时从日期、主题、序号与诗题确定 |

## Wish 今日主题组图

用户要求「今日推荐」时，读取公开 `https://www.weshici.com/api/v1/home/recommendations`，确认 `data.issue_date` 与 `data.theme`（`title`、`picks[].poem`），记录实际期次。每首从 `title`、`author.name`、`paragraphs` 取诗题、作者和原文。不要把本地样例、过期缓存或模型另选的诗称为今日推荐；接口不可用时明确缺失，不自动套用芦荻样例。

按实际诗单编写 manifest；封面突出主题，各诗选一组适合放大的摘句，并选择对应配色和母题。接口中的赏析是辅助信息，摘句以诗的原文核验；存疑的组诗序号和朝代标注不要直接照搬。

## 出图检查

CLI 检查脚本／资源错误和文字越界。导出后查看并排图，必要时看单张：主句在手机缩略图中是否清楚，长题是否挤压，画面母题是否符合诗意，二维码与日期是否清晰且居中。发现问题修改对应卡片的排版、摘句或画面元素，再导出检查。
