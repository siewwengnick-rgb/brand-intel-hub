# OT / FF 品牌情报台 (Brand Intel Hub)

一个链接、两个分栏、按日期留存、可收藏。

| 分栏 | 内容 |
|------|------|
| **营销内容** | Orthotech + Foamfresh 内容角度（来自 content-angles-radar） |
| **产品 / Trending** | 清洁热搜榜 + 新品卡片（来自 foamfresh-radar） |
| **已收藏** | ★ 收藏列表（localStorage；可选同步 Supabase） |

## 本地预览

```bash
cd /workspace/brand-intel-hub
python3 -m http.server 8765
# 打开 http://127.0.0.1:8765/
```

或直接用浏览器打开 `index.html`（部分环境 `fetch` 本地 JSON 需 http server）。

## 每日快照

```bash
python3 build_snapshot.py              # 今天（Asia/Kuala_Lumpur）
python3 build_snapshot.py --date 2026-10-19
```

写出：

- `data/YYYY-MM-DD/content.json`
- `data/YYYY-MM-DD/products.json`
- `data/manifest.json`（日期列表）

## 收藏 / Supabase

1. 复制 `config.example.js` → `config.js`，填入 `supabaseUrl` + `supabaseAnonKey`
2. 在 Supabase SQL 编辑器跑 `supabase/schema.sql`
3. 未配置时：收藏只写 `localStorage` 键 `brand-intel-favorites`，toast「已收藏（本地）」

Agent 读收藏：见 `supabase/README.md`。

## 架构说明

- **静态展示 + 按天 JSON**：适合 GitHub Pages
- **收藏 / 反馈写回**：需要 Supabase（或 Railway 后端）；纯 Pages 做不到让助手看见你的 ★
- **不迁移 CRM**：本仓只服务情报浏览与 Nick 反馈

## 合规提醒

- OT：支撑 / 舒适 / 分散压力；禁治疗矫正脊柱侧弯话术
- FF：禁 99.9% / 未验证抗菌 / 混剂示范

## Daily data (handoff)

See [DATA.md](./DATA.md). After the initial push, website UI is maintained by Claude Code; Grok Bot only pushes `data/YYYY-MM-DD.json`.
