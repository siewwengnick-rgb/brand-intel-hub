# 给 AI 的规矩（Codex 及其他 agent）

- **改任何 UI 之前，先读 `DESIGN.md`**（颜色、4 级字号、今日总览顺序都在里面），再读 `Nick的常识规则.md`（Nick 的原话纠正，优先级最高）。
- 产品背景在 `PRODUCT.md`；资料格式在 `DATA.md`。
- 不要改 `data/*.json` 和 `data/manifest.json` 的格式（Grok 每天 21:00 推送），读取逻辑要兼容旧字段。
- 改完跑 `node --test tests/`，并用 390×844 截图看今日总览首屏。
