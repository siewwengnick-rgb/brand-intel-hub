---
name: 品牌情报台 Brand Intel Hub
colors:
  bg: "#0b0f17"
  surface: "#141a25"
  surface-raised: "#1b2231"
  rail: "#0f141d"
  text: "#e8ecf2"
  text-muted: "#8c95a5"
  line: "rgba(232, 236, 242, 0.08)"
  primary: "#4f9cf9"
  brand-ot: "#4f9cf9"
  brand-ff: "#f08a24"
  positive: "#3fb950"
  negative: "#f0605a"
  highlight: "#f5c451"
  on-color: "#ffffff"
  on-positive: "#06210d"
  on-highlight: "#241a00"
typography:
  display:
    fontFamily: "-apple-system, PingFang SC, Microsoft YaHei, Noto Sans SC, sans-serif"
    fontSize: 22px
    fontWeight: 700
    lineHeight: 1.2
  title:
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1.35
  body:
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
  meta:
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.4
rounded:
  control: 10px
  card: 12px
  pill: 22px
  small: 8px
  sheet: 16px
spacing:
  page-x-mobile: 16px
  page-x-desktop: 24px
  gap: 10px
components:
  button-decision:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    height: 44px
  chip-on:
    backgroundColor: "{colors.text}"
    textColor: "{colors.bg}"
    rounded: "{rounded.pill}"
    height: 44px
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
---

# Design System: 品牌情报台

> **任何 AI / 任何人改 UI 之前先读完这份。** Nick 的原话纠正在 `Nick的常识规则.md`，冲突时以那份为准。

## Overview

工作台（Operate 模式），不是营销页。深色、安静、信息先行：Nick 早上用手机扫一眼就知道今天要决定什么、货到哪了。设计的工作是把**一个关键数字**推到最前面，其余的往后放、变淡、或折起来。

三条硬规矩：
1. **一眼先看到关键信息**：今日总览首屏 = 待决定数字 + 集运状态 + 今日亮点（有图产品）开头。说明文字、AI 抓取说明、关键字榜都不准挤到它们前面。
2. **字少、轻重拉开**：重要的大而醒目（display 22px），次要的小而淡（meta 12px，text-muted），能藏的折叠（`<details>`）。
3. **全系统一套颜色**：只有一个主色 primary（蓝 #4f9cf9）。不抄参考站配色，不要霓虹 / 赛博风 / 渐变字 / 发光。

## Colors

### Primary
- **primary #4f9cf9**：唯一主色。只用于：可按的链接文字、选中状态、焦点框、「全部 →」这类入口。不拿来做装饰底色或大色块。

### Brand tags（不是主题色）
- **brand-ot #4f9cf9 / brand-ff #f08a24**：只出现在 OT / FF 品牌小标签、品牌筛选 chip 选中态、无图占位块。OT 恰好与主色同值，这是历史沿用，不要再为 FF 扩一套橙色 UI。

### Semantic
- on-color #fff / on-positive #06210d / on-highlight #241a00：彩色底上的文字色。
- positive #3fb950（上升、已安排）、negative #f0605a（下降、未处理数红点）、highlight #f5c451（原因 chip 选中、示例标记）。只表达状态。

### Neutral
- bg #0b0f17 → surface #141a25（卡片）→ surface-raised #1b2231（按钮、选中项）；rail #0f141d（菜单）。
- text #e8ecf2 主文字；text-muted #8c95a5 次要文字（在 surface 上对比度约 6:1）。

### Named Rules
- **一屏只有一个蓝**：同一视口里主色只给「下一步最该按的」和当前选中项。
- **不新增颜色**：需要区分就用字重、字号、明暗，不要再加色。

## Typography

一个系统字体族（PingFang SC / 微软雅黑 / Noto Sans SC）。**只有 4 级字号**，CSS 变量在 `css/app.css :root`：

| 级别 | 变量 | 尺寸 | 用在 |
|---|---|---|---|
| display | `--fs-display` | 22px | 页标题、首屏关键数字（待决定数、集运数） |
| title | `--fs-title` | 16px | 区块标题、集运标题、价格、搜索框（≥16px 防 iOS 放大） |
| body | `--fs-body` | 14px | 正文、卡片标题、按钮 |
| meta | `--fs-meta` | 12px | 日期、来源、说明、标签 |

### Named Rules
- **不准写死 px 字号**，只用这 4 个变量。要更醒目先加粗（600/700），不要加第 5 级。
- 数字一律 `font-variant-numeric: tabular-nums`。

## Layout

- 手机优先（390 宽验收）。≤760px：左栏变顶部横向菜单条（不显示 logo 和分组字）；筛选只占一行，左右滑。
- 今日总览顺序固定：**数字行 → 集运摘要 → AI 抓取说明（折叠）→ 今日亮点（产品卡）→ 拍摄简报 → 关键字（折叠）**。
- 卡片网格：桌面 4 列 → 平板 3 列 → 手机 2 列。

## Elevation & Depth

扁平。层级靠底色深浅（bg → surface → raised）和 1px line 边框，不用大阴影；只有底部 sheet 有一层阴影。

## Shapes

控件 10px、卡片 12px、chip 22px（胶囊）。嵌套元素内圆角 = 外圆角 − 内边距。

## Components

### Buttons（决定按钮）
44px 高，surface-raised 底；按下 scale(0.97)。选中：出新品 / 安排拍 = positive 底，跳过 = 描边。

### Chips
44px 胶囊。选中 = 白底黑字；品牌 chip 选中用品牌色。

### Cards
surface 底 + 1px line + 12px 圆角。产品卡：封面图（4:3）→ 标题 2 行 → 日期 → 价格（title 级数字 + 一行淡说明，不套框）→ 一行摘要 → 决定按钮。

### 今日数字行（focus）
两个 display 级数字 + 一行 meta，**不是 KPI 卡片墙**。每个数字可点，跳到对应页。

### 集运摘要（ship-card）
读 Shipment Tracker 的 `shipments.json`（只读）。三个数（运输中 / 已到马 / 仓库待发）+ 最多 3 行运输中（同批多票合并「×3 票」），右侧写预计到港/落地时间。读不到就退回一行入口，不能报错挡住页面。

## Do's and Don'ts

### Do:
- 先问「Nick 早上第一眼要看什么」，把它放到首屏最大。
- 次要说明折叠或删掉；同一句话不要在页标题、说明、卡片里重复三次。
- 改完用 390×844 截图看首屏，再交。

### Don't:
- 不要 KPI 卡片墙、彩色粗左边框、渐变字、霓虹发光、玻璃拟态。
- 不要新增主色或照抄参考站配色。
- 不要动 data/*.json 的格式与读取逻辑。
- 不要在手机上加底部 tab bar（Nick 否过）。
