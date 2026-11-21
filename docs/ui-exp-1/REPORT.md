# UI 实验 1：今日总览手机版（2026-11-22）

分支 `ui-exp-1`，只改外观与今日总览的排法；`data/*.json`、`manifest.json`、`js/normalize.js / insights.js / store.js / router.js` 都没动，`node --test tests/` 67/67 通过。

## 流程（照新 UI 规矩走）

1. **impeccable context**：没有 PRODUCT.md / DESIGN.md，判定为「已有视觉系统，属于细修」。→ 补 `PRODUCT.md`（产品事实）和 `DESIGN.md`（照现有深色骨架整理：1 个主色、4 级字号、手机优先），并在 `CLAUDE.md` / `AGENTS.md` 写「改 UI 前先读 DESIGN.md」。
2. **impeccable shape**：只用来定 DESIGN.md 的方向（保留现有风格，修层次 / 字量 / 手机可读性），不换风格。
3. **impeccable critique**（390×844 截线上版首屏 + 整页）找出问题 → 改代码。
   注：这个环境不能开子 agent，critique 的 A（设计审）和 B（detector）在同一个上下文里跑，属于 impeccable 说的「降级运行」；A 先看截图下判断，之后才跑 detector。
4. **impeccable detect**：改前 5 条（4 warning + 1 advisory），改后 0 warning，剩 22 条 advisory（零碎圆角 / 彩色底上的文字色，未写进 DESIGN.md 刻度）。
5. **web-design-guidelines**：逐条对照，修了一批（见下）。
6. **make-interfaces-feel-better**：最后修细节。

## critique 找到的 5 个问题 → 改法

| # | 问题（改前） | 改法 |
|---|---|---|
| 1 | 首屏被页说明 + 两行筛选 + 10 行 AI 长段 + 4 张 KPI 卡占满，**今日亮点（产品）在首屏外** | 今日页手机上去掉页说明；筛选压成一行可左右滑；4 张 KPI 卡换成一行两个大数字（产品待决定 / 简报待看）；AI 说明折叠成一行。产品卡回到首屏内。 |
| 2 | **集运只有一行「打开 →」**，看不到货到哪；点进去是浅色 iframe，配色跳 | 今日页加「集运摘要」：只读 Shipment Tracker 的 `shipments.json`，显示运输中 / 已到马 / 仓库待发三个数 + 最多 3 行运输中（同批多票合并「×3 票」，右边写预计到港 / 落地时间）。读不到就退回原来的一行入口。 |
| 3 | 字号 18 种（10–28px 混用），重点不突出 | 收成 4 级变量：22 / 16 / 14 / 12（`--fs-display/title/body/meta`），手机正文从 13px 升到 14px；关键数字用 22px 粗体。 |
| 4 | 产品卡太吵：价格套蓝框，「参考价·马币标价·不是销量 / 资料里没有抖音周销折算指数」每张卡重复；来源平台在图上和卡里写两次 | 价格去框，数字当主角，说明一行淡字；卡上不再重复「没有周销指数」；卡里只写日期（平台已在图上）。 |
| 5 | 彩色粗左边框（KPI 卡、简报小标题、菜单选中条）、渐变 logo（白字对比 2.5:1）——detector 判为 AI 模板味 | 全部拿掉：菜单选中用底色，手机上用底部 2px 线；logo 改实色。 |

另外：手机菜单条去掉 logo 和「每天 / 运营」分组字，多露 1–2 个菜单项；集运页顶部说明从两句缩成一行。

## 各 Skill 抓到什么

- **impeccable critique**：上面 5 点；核心是「信息层级反了：说明和统计在前，Nick 要看的产品和集运在后」。
- **impeccable detect**：side-tab（3px 彩色左边框 ×4）、logo 白字配橙色渐变对比度 2.5:1。全部修掉。加了 DESIGN.md 之后还会报不在刻度里的圆角 / 颜色（22 条 advisory），留着当以后统一的清单。
- **web-design-guidelines**：缺 `color-scheme: dark`、缺 `touch-action: manipulation`（手机双击延迟）、没有 `prefers-reduced-motion`、标题没有 `text-wrap: balance`。已全部补上。另记：图片没写 width/height（但外层有固定比例框，不会跳版），日期格式手写没用 `Intl`（中文单语，暂不改）。
- **make-interfaces-feel-better**：按钮 / chip 没有按下回馈 → 加 scale(0.97)；深色底没开字体平滑 → 加；浅色商品图边缘糊进卡片 → 加 1px 极淡内描边。

## 要 Nick 拍板

1. 首页顺序：「数字 → 集运 → 今日亮点」可以吗？还是集运放到亮点后面？
2. 菜单的 emoji 图标（🏠📈🎬📦…）要不要换成统一线条图标？impeccable 把 emoji 当图标列为不建议，但这是你看惯的，先没动。
3. 集运页仍是嵌入的浅色 Shipment Tracker（另一个 repo），要不要把那边也改成同一套深色？
4. 满意就合并到 main（GitHub Pages 才会更新）；不满意直接截图圈出来，按 UI 模板发。
