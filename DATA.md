# 每日资料格式（Grok Bot → 本 repo）— 定版 2026-10-19

Grok Bot 每天抓完只做两件事，**不改任何网站文件**：

1. 写一个文件 `data/YYYY-MM-DD.json`（日期 = Asia/Kuala_Lumpur 当天）
2. 更新 `data/manifest.json`：把日期加进 `dates`（新的在前），`latest` 改成今天

## 文件结构

```json
{
  "date": "2026-10-20",
  "built_at_local": "2026-10-20 21:05:00 +0800",
  "items": [ ... ]
}
```

每条 item 的**共用字段**（必填）：

| 字段 | 值 |
|---|---|
| `id` | 当天内唯一，稳定（同一个角度/关键字隔天同名）。例 `ot-supportive_footwear`、`kw-cn-泡沫清洁剂`、`prod-shopee-12345` |
| `section` | `marketing` 或 `product` |
| `kind` | marketing → `angle`；product → `keyword` 或 `product`（见下） |
| `brand` | `OT` / `FF` / `BOTH` |
| `title` | 一行标题，不超过 40 字 |
| `summary` | 一句话：为什么值得看（不要把钩子、合规塞进来，那些有自己的字段） |
| `url` | 来源链接，没有就 `""` |
| `source` | 平台或来源名：`YouTube` / `Instagram` / `TikTok` / `google_trends` / `Shopee` / `Lazada` … |
| `tags` | 字符串数组，关键字、分类都放这里 |

### kind = `angle`（营销内容角度）额外字段

| 字段 | 值 |
|---|---|
| `status` | `NEW` / `RISING` / `KEEP` / `WATCH` |
| `hook` | 一句最好的钩子 |
| `hooks` | 可选，数组，更多钩子草稿 |
| `compliance` | 一行合规提醒，没有就 `""` |
| `views` | 可选，参考影片播放数（数字） |
| `thumb` | **封面图 URL，能拿到就一定给**（网站是卡片墙，没图就只剩色块）。YouTube 可省（网站自己从 url 推）；Instagram / TikTok 必须给 |
| `why` | **为什么推荐**，一句，要带数据或 trending 元素：例「3 天 18 万次观看，评论区都在问哪里买」「前后对比这个拍法本周 IG 清洁类前 5 有 3 条」 |
| `trend_element` | 在 trending 的元素，几个字：例「前后对比」「15 秒解压」「家长视角」 |
| `views_per_day` | 可选，每天平均观看数（数字），有就给 |
| `pattern` | **模式拆解**，2–3 句：钩子类型、格式、节奏、为什么有效 |
| `apply` | **用到我们 brand**，给 OT 或 FF 一句可以直接拍的钩子 + 一句怎么拍。品牌是 BOTH 时两个都给 |

| `key_points` | **3 个关键 point**，数组，每个 `{"head": "≤12 字粗体", "body": "一句说明"}`。网站简报最显眼的位置就是这三张 |

这五样（why / trend_element / pattern / apply / key_points）是 content creator 真正要看的，比 summary 重要。

## 文件顶层可选字段

| 字段 | 值 |
|---|---|
| `note_from_ai` | 一句话：「根据你们上次的反馈，这次…」。Grok 抓之前先读 repo 里的 `decisions.json`（谁对哪条按了什么、原因是什么、谁看了哪条），调整这次挑什么、怎么写，然后在这里说一句调了什么。页面会显示在最上面 |

## 反馈怎么回到 Grok（先简单做：不用数据库）

网站的决定存在看的人的浏览器里，按「Export」会下载 `decisions.json`，放到 repo 根目录（覆盖）。格式：

```json
{"decisions": [
  {"id":"ot-supportive_footwear","section":"marketing","kind":"angle","brand":"OT","title":"…","url":"…",
   "date":"2026-10-20","decision":"shoot","decided_at":"2026-10-20T09:12:00+08:00","reason":"很好","note":"","who":"Nick"},
  {"id":"kw-cn-泡沫清洁剂","section":"product","kind":"keyword","brand":"FF","title":"泡沫清洁剂","url":"",
   "date":"2026-10-20","decision":"new_product","decided_at":"…","reason":"","note":"看看能不能做 500ml 版","who":"Nick"}],
 "views": [
  {"id":"ot-supportive_footwear","date":"2026-10-20","who":"Nick","seconds":42},
  {"id":"ot-foot_pain_hook","date":"2026-10-20","who":"团队","seconds":null}]}
```

`decisions`：每条现在有效的决定（取消掉的不在里面）。
`decision`：`shoot`（安排拍）/ `new_product`（出新品）/ `ad_keyword`（投广告）/ `skip`（跳过）。
`reason`：很好 / 看过了 / 不适合我们 / 太难拍 / 没新意 / 不合规。
`views`：谁打开过哪条简报，一次打开一行；`seconds` = 看了几秒，`null` = 没正常关掉（例如直接关了分页）。
**Grok 读 `views` 要容忍 `seconds` 是 `null`**：别当 0 算进平均，也别因此报错或跳过整份文件；统计「看了几秒」只算有数字的行，「打开过几次」两种行都算。

Grok Bot 每天抓之前先读 repo 里的 `decisions.json`（最近 14 天）：`skip` 原因多的方向少抓，`shoot` / `new_product` 多的方向多抓；没人看的 section 在 `note_from_ai` 里提一句。

### kind = `keyword`（热搜关键字 / Google Trends）额外字段

| 字段 | 值 |
|---|---|
| `region` | `cn` / `my` / `global` |
| `rank` | 当天名次，数字 |
| `interest` | 0–100 相对热度 |
| `trend` | `up` / `down` / `flat` |
| `prev_rank` | 可选，前一天名次，没有就省略 |
| `need` | **这个词背后的需求**，一句：例「租屋族要不用刷的厨房除油」「家长担心孩子书包太重伤脊椎」。这是 Nick 决定出不出新品的依据 |
| `history` | 可选，`[{date, rank, interest}]` 最近 7 天，有就给（网站也会自己从历史文件算） |

`title` 就放关键字本身，不要加「China Trends:」前缀。

### kind = `note`（需求榜下面的一句说明，可选）

像「MY：foam cleaner 近周兴趣抬升；aircond cleaner 回落」这种趋势观察，不是关键字也不是产品，就用 `kind: "note"`，只要 `title` + `summary`，网站显示成需求榜底下一行灰字。不要把它塞进 product。

### kind = `product`（trending 产品）额外字段

| 字段 | 值 |
|---|---|
| `platform` | `Shopee` / `Lazada` / `TikTok` / `Amazon` / `Taobao` … |
| `priceMYR` | 数字，没有就省略 |
| `image` | 产品图 URL，能拿到就一定给（卡片要显示） |
| `category` | 字符串数组 |
| `idea` | 可选，一句「可以怎么做」 |
| `need_keys` | 这个产品满足的是哪几个关键字（填当天 keyword 的 `title`，数组）。网站用它把产品挂在需求下面 |

## 例子

```json
{"id":"ot-supportive_footwear","section":"marketing","kind":"angle","brand":"OT",
 "title":"怎么选一双“有支撑”的鞋","summary":"买鞋只看好看或软，走久了累，不知道支撑怎么判断",
 "url":"https://www.youtube.com/watch?v=xxxx","source":"YouTube",
 "tags":["comparison","flatfeet","best walking shoes"],
 "status":"RISING","hook":"选鞋 3 个动作测试：扭、压、按。","compliance":"对比鞋型/结构，不点名贬低品牌；不承诺功效","views":182000}

{"id":"kw-cn-泡沫清洁剂","section":"product","kind":"keyword","brand":"FF",
 "title":"泡沫清洁剂","summary":"连续三天第一","url":"","source":"google_trends",
 "tags":["trends"],"region":"cn","rank":1,"interest":100,"trend":"up","prev_rank":1}

{"id":"prod-shopee-98765","section":"product","kind":"product","brand":"FF",
 "title":"厨房除油泡沫 500ml","summary":"本周 Shopee 清洁类销量升最快","url":"https://shopee.com.my/...",
 "source":"Shopee","tags":["kitchen","foam"],"platform":"Shopee","priceMYR":18.9,
 "category":["厨房","泡沫"],"idea":"对比我们的 Ultra Bubble 去油速度"}
```

## 规矩

- 只写这一个文件 + manifest；`data/YYYY-MM-DD/` 子目录那种旧格式不要再写。
- 不发群。抓完最多在聊天回一句「已推 2026-10-20，N 条」。
- 格式有想加的字段，先在聊天里说，Claude Code 改了这份文件再加。
- 真实顾客资料（姓名、电话、订单）永远不进这个 repo。

