# 诗词海报 v2：审美升级与 App 主题色

2026-10-27 定。范围只有 `poster`；`image` / `wallpaper` / 小红书 / 微信 / 视频模板后续另起。改完的规则要能移植到 Wish App 的分享海报，所以配色、比例和印的规则写成与平台无关的数据和百分比。

## 1. 基线问题

基线出图：Mac `taste/weshici/shots/baseline/`（芦荻组 7 张 + 白帝城 hero + 山居秋暝 vertical）。

1. **同一片山**：山脊、河道、芦苇都是写死的坐标，`shift` 只上下挪几十像素。芦荻组 7 张是同一个地形。
2. **河像路**：河道是一块平涂浅色 S 形，没有近宽远窄、水岸、波纹或倒影，看起来像一条土路。
3. **米黄与大色块**：`qinglv` / `nuanjin` 的天空是米黄到赭金的渐变；底部压一条 82% 深色渐变。App 第四稿已经退役米黄与品牌金，也不铺大色块。
4. **朱色过量**：标题固定两色（第一行墨、第二行朱），每张都一样，朱占了整行大字。App 规范里朱只占一小方印。
5. **日月抢戏**：日月是半径 139–164px 的平涂圆盘，和主句争第一眼。
6. **假印与混排**：「微詩」是描边文字框；仓库里已有 App 原生竖印 `resources/assets/huaping/jianyang-seal.png`。页眉编号用 Georgia，和宋体混排。
7. **小字过小**：页眉 23px、出处 25px、页脚 22px，在 360px 宽的手机缩略图里只剩 7–8px。
8. 接触表底色 `#e8e2d4` 也是米黄。

## 2. 原则

取自 App 配色第四稿（zixiao-kit `Docs/Design/THEME_PALETTES.md`）：**主角是诗和画，配色不抢戏；底近中性；颜色只在小处；朱只在印。**

海报的「浓色」只放进画里，用矿物设色的山水来承载，不放在页面底色和大字上。字是墨色，页面是纸色，画是主角之一，印是唯一的朱。

## 3. 配色：App 七套主题色 × 浅深

- 从 zixiao-kit `origin/master` 的 `Sources/ZixiaoDesign/Resources/identities/*.json` 取七套第四稿配色（`yaqing`、`moon-white`、`xiang-leaf`、`canglang`、`ousi`、`qingdai`、`rouge`），保存成 `resources/core/app-palettes.json`。取用的槽位是浅深两份的 `paper / ink / surface / muted / rule / accent / secondary / seal`。文件里记下来源路径和 zixiao-kit 提交 SHA。值逐个照搬，不手调近似值。
- manifest 字段：
  - `palette`：七个 id 之一或 `seasonal`，缺省为 `seasonal`。
  - `appearance`：`light` 或 `dark`。缺省时，母题含 `moon` 的取 `dark`，否则取 `light`。
- `seasonal` 按卡片日期所在的节气取季，再映射到配色，与 `ZXPaletteCatalog.palette(for:)` 一致：

  | 季 | 节气区间 | 配色 |
  | --- | --- | --- |
  | 春 | 立春–谷雨 | 苍筤 `canglang` |
  | 夏 | 立夏–芒种 | 胭脂 `rouge` |
  | 长夏 | 夏至–处暑 | 缃叶 `xiang-leaf` |
  | 秋 | 白露–霜降 | 月白 `moon-white` |
  | 冬 | 立冬–大寒 | 青黛 `qingdai` |

  节气复用 `huaping-footer.js` 的 `huapingCalendar`。
- 旧 id 作为兼容别名保留一版，文档里写明已弃用：`qinglv` → 苍筤浅色，`yueye` → 青黛深色，`nuanjin` → 缃叶浅色。
- **画的设色**从每套配色的「来历」推出，每套写一组画色，附一句理由，和配色放在同一份数据里：

  | 配色 | 来历 | 画的设色 |
  | --- | --- | --- |
  | 苍筤 | 石绿 × 赭石 | 青绿：石青石绿山体，赭石坡脚 |
  | 月白 | 花青 × 赭石 | 浅绛：花青远山，赭石近岸 |
  | 缃叶 | 缃 × 绀青 | 缃黄与绀青 |
  | 青黛 | 深色是磁青纸泥金 | 深色：磁青底，泥金勾线 |
  | 胭脂 | 胭脂 × 石绿 | 石绿山，胭脂点景 |
  | 藕丝 | 茄紫 × 柳绿 | 茄紫远山，柳绿近景 |
  | 鸦青 | 黑白主色 | 纯水墨，墨分五色 |

  远近层次由画色与纸色按距离混合得出（远淡近浓的空气透视），不是每一层另配一个颜色。深色模式下纸是深色，远山更接近纸色，近景更亮或用勾线托出来。

## 4. 画面

- **页面**：纸色平铺，可加极淡纸纹；不要渐变天空，不要深色压条。画与留白之间用雾或淡墨晕开，不留硬边。
- **地形由 seed 生成**：远、中、近 3–4 层山的峰数、主峰位置、高度和起伏，水面或河道的走向与宽窄，地平线高度，全部随 seed 变化。同一组的每张卡片必须是不同的地形。把「seed → 地形参数」写成纯函数，方便测试。
- **构图让位给字**：版式决定文字区，画把留白让出来。
  - `vertical`：竖排主句在右上，主峰与重心放在左侧。
  - `horizontal` / `hero`：主句在上，画占下部约 55–60%。
  - `cover`：主题大字，画可以更满，但不能压字。
- **水要像水**：近宽远窄，有水岸留白、横向波纹和山影或倒影。
- **日月**：半径不超过画宽的 7%。月在深色模式可加淡晕；落日可用印色呼应，但不能比印更抢眼。
- **母题**：保留现有九种（`sun moon reeds maple cottage fortress pine boat heron`），位置跟着地形的锚点走：舟在水上，屋在岸上，故垒在山脊，芦苇在近岸。画法可以提升，芦苇、松、枫要有笔意，不要像剪纸。
- **颗粒与皴线**保留但收细，不要满屏噪点。

## 5. 字与印

- 主句用思源宋体 Bold，其余用 Regular；去掉 Georgia，数字也用宋体。
- **主句单色墨**，取消第二行朱色。层级不超过三层：主句 / 出处与副题 / 页脚。
- 在 1080 宽画布上，出处（诗题 / 作者）不小于 30px，页脚日期和页眉不小于 26px；页眉可以删掉，把主题和编号并进页脚。
- **印**：用 `jianyang-seal.png` 按配色的 `seal` 色着色，或画一方真正的方印或竖印。每张只有一方印。
- **页脚**：「品牌 / 二维码 / 两行日期」整体垂直居中的规则不变。深色模式下二维码放在浅色 `surface` 小方块上，墨色模块，保证能扫。右侧的主题短题保留。
- 接触表底色改为中性灰。

## 6. 不做

- 不接 ShanShui@5，不加 9:16 或视频，不改 `image` / `wallpaper` / 小红书 / 微信模板。
- 不改摘句校验、字数上限、日期和二维码链接规则。

## 7. 交付

- 分支 `feat/poster-v2`，一个 PR，交付后停下等验收。
- 代码：`resources/templates/poetry-poster/{index.html,poster.js,drawing.js}` 和 `resources/core/poetry-poster.js` 改写成正常格式的可读代码（现在每个函数被压成一行），注释保持克制。
- `examples/poster-ludi.json` 改用新字段：芦荻组日期是 2026-10-27，属霜降，即秋季月白，可浅深混用。另加 `examples/poster-palettes.json`：同一首诗 × 七套 × 浅深，共 14 张，作为配色样张。
- 文档：
  - 更新 `references/POETRY-POSTER.md`：配色、`appearance`、`seasonal`、别名和出图检查。
  - 同步 `SKILL.md` 与 `README.md` 里的海报段落，去掉「青绿朱砂 / 黛蓝月夜 / 暖金墨山」的说法。
  - 在 `POETRY-POSTER.md` 末尾加「移植到 App」一节：配色映射表、按画宽百分比给出的版式比例（不写 px）、印与页脚的规则，给 iOS 实现用。
- 测试，补进 `tests/poetry-poster.test.mjs`：
  - `palette` / `appearance` 的校验；
  - 别名映射；
  - `seasonal` 映射，每季至少一个日期，含节气交界日；
  - 同一组不同卡片的地形参数不同。

## 8. 出图验收（每轮都要看）

在 VPS 上运行 `~/review/wss-round.sh <工作树> <轮次名> <jobs.json>`。它会同步工作树到 Mac，用本机 Chrome 截图，把 4×2 接触表拉回 `/tmp/review-view/wss-<轮次名>/`。jobs 格式见 `~/review/wss/jobs-baseline.json`（Mac 端驱动 `shoot.mjs`、`sheet.sh` 的副本也在该目录）（`kind: poster` 填 `manifest` 路径或内联 `input`）。Node 单测在 Mac 上跑：`ssh xistudio 'export PATH=/opt/homebrew/bin:$PATH; cd /Volumes/XiPass/literature/taste/weshici/weshici-skill && node --test tests/'`。VPS 上不跑测试或构建。

至少出三组：

1. 芦荻组 7 张。
2. 配色样张 14 张。
3. 单张：三种版式各一，加长诗题、5 字 hero、两行 8 字。

看什么：

- 360px 缩略图里主句清楚；
- 同一组地形各不相同；
- 没有米黄或金的大面积；
- 朱只出现在印（和落日）；
- 深色模式的二维码能扫；
- 文字不越界；
- 和基线并排看，是不是明显更好。

PR 描述写明最后一轮的轮次名和 Mac 上的原图路径。
