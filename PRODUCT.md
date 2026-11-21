# Product

<!-- impeccable:product-schema 1 -->

## Platform

web（纯静态 HTML + CSS + JS，无框架、无 build；GitHub Pages 正式版，Vercel 做预览）

## Users

- **Nick（老板）**：每天早上用手机打开，先看「今天有什么值得决定的新品」和「集运到哪了」，几分钟内看完、按决定。电脑上会细看新品决策页。
- **团队 / content creator**：看拍摄简报页，按「安排拍 / 跳过」。

## Product Purpose

OT（Orthotech）/ FF（Foamfresh）的品牌情报台：Grok 每天 21:00 推当天的产品、拍摄简报、关键字（data/*.json + manifest），人看完按决定并选原因，决定导出给 AI 学口味。集运从 Shipment Tracker 读，不另存。

成功 = Nick 打开 5 秒内看到：几个产品待决定、几条简报待看、货柜现在在哪；不用滑就能开始按决定。

## Positioning

不是通用 BI 看板：每条资料都要落到「出新品 / 安排拍 / 跳过 + 原因」这个决定上，决定再回流给 AI。

## Constraints

- 数据管线不能动：data/YYYY-MM-DD.json 与 data/manifest.json 由 Grok 推送，页面读取逻辑必须兼容旧字段（js/normalize.js）。
- 可按的东西 ≥ 44×44；手机上不要底部 tab bar（Nick 定过）。
- 深色保留（Nick：「我对你现在的颜色是 OK 的」）。
- Nick 的原话与纠正记在 `Nick的常识规则.md`，优先级高于本文件。
