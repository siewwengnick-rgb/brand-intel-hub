# OT / FF 品牌情报台

一个链接、一套系统：左栏模块，每个模块一页（网址带 `#/today` 这类 hash，刷新留在同一页）。每个决定都要选原因，存起来给 AI 学口味。纯静态（HTML + CSS + JS，不用框架、不用 build），可直接挂 GitHub Pages / Vercel。

## 怎么看

左栏（手机上变成顶部可横向滑的菜单条）；最下面选 **你是谁**（第一次选一下，之后记住；没选记成「未署名」）。每页最上面是标题 + 日期 + 一行说明，下面一行 ◀ 日期 ▶｜品牌 全部 / OT / FF｜搜索，往下滑会钉在顶上。

- 每天（日期旁边可切 **近7天** / **这一天**。近7天 = 截止日往前，资料里最近 7 个有文件的日期）
  - **🏠 今日总览**（`#/today`，默认页）：先是有图的产品，再是这几天各平台的拍摄简报。中国抖音周销关键字收在最下面，默认不展开。
  - **📈 新品决策**（`#/products`）：一进页就是有图的产品卡（照片、短标题、OT/FF、一个写清含义的数字）。抖音周销折算写成「抖音周销量折算指数 · 约7天 · 榜首=100」，不是搜索量。关键字榜要自己点开。左栏红数字 = 还没决定的产品，不含关键字。
  - **🎬 拍摄简报**（`#/briefs`）：默认近 7 天，YouTube / Instagram 等平台可以筛选，卡片带封面。点开是一份简报：3 个关键 point、为什么推荐、模式拆解、用到我们 brand、原片合规；底部一直有 **安排拍 / 跳过 / 打开原片 ↗**。
- 运营
  - **📦 集运**（`#/shipment`）：在情报台里打开 [Shipment Tracker](https://siewwengnick-rgb.github.io/shipment-tracker/)。货柜、包裹、证据照片仍以那个 Pages 仓库为准（`shipments.json` + `evidence/`），这里不复制一份。今日总览也有一条「集运」入口。右上角可以另开完整集运页。
- 结果
  - **✅ 待办**（`#/todo`）：新品候选｜广告词｜待拍清单，全部日期，每行可以取消。
  - **🗂 历史**（`#/history`）：每天一行（简报、需求、产品、已决定、看了），点一行看那天的今日总览。
- 设置
  - **🔗 资料与反馈**（`#/data`）：Grok 最后推送时间、这天文件几条、**Export decisions.json**、Clear、团队名单。

**按任何决定都会弹一行原因**：很好 / 看过了 / 不适合我们 / 太难拍 / 没新意 / 不合规，可加一句话，按 Confirm 才记。跳过也要原因。打开简报会记一笔「看过」，顶部显示「团队今天看了 N / M 条简报」。

Grok 还没给的字段（`need`、`why`、`pattern`、`apply`、`key_points` …）页面会写「Grok 还没提供」。

本地预览：

```
python -m http.server 8765
```

打开 http://127.0.0.1:8765/ （直接双击 index.html 读不到资料，要用 http server）。

## 名单（你是谁）

复制 `config.example.js` 成 `config.js`，改 `team`。没有 `config.js` 就是 Nick + 团队。`config.js` 不进 repo。

## Grok Bot 每天推什么

只推两样，不改网站文件，格式见 [DATA.md](./DATA.md)：

1. `data/YYYY-MM-DD.json`
2. `data/manifest.json`（日期加进 `dates`，`latest` 改成今天）

旧字段的文件（如 `data/2026-10-19.json`）网站加载时会自动转换（`js/normalize.js`），不用改源文件。

## 反馈存在哪、怎么交给 Grok

现在只存在这个浏览器里（`localStorage`：`brand-intel-feedback`、`brand-intel-views`），换浏览器或清缓存会不见；「团队今天看了」也只算这台机。

1. 「资料与反馈」页 → **Export decisions.json**，下载 `decisions.json`（每条现在有效的决定：`id, section, kind, brand, title, url, date, decision, decided_at, reason, note, who`，跳过的也在里面）
2. 交给 Grok Bot（放进 repo 根目录或直接贴给它）

**Clear** 会清空这个浏览器里的全部决定记录（要再按 Confirm）。v1/v2 的旧收藏第一次打开时会自动转成决定（营销 → 安排拍，产品 → 出新品）。

## 测试

```
node --test tests/
```
