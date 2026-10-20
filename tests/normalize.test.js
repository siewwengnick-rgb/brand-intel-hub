// node --test tests/   （资料全是假资料，仿旧样本 / DATA.md 的格式）
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const D = require("../js/normalize.js");

// ---------- 旧样本格式（Grok 第一版字段） ----------
const OLD = [
  {
    date: "2026-01-01", section: "marketing", title: "假角度一：选鞋测试",
    url: "https://example.com/v/1", source: "YouTube 长视频",
    summary: "假痛点一句话。 | 钩子: 假钩子 3 个动作。 | 合规: 假合规提醒。",
    tags: ["OT", "RISING", "comparison", "flatfeet"], brand: "OT", id: "ot-fake_one"
  },
  {
    date: "2026-01-01", section: "marketing", title: "假角度二",
    url: "https://example.com/v/2", source: "Instagram Reels",
    summary: "只有摘要 | 合规: 只有合规",
    tags: ["FF", "保留", "tutorial"]
  },
  {
    date: "2026-01-01", section: "marketing", title: "假角度三", url: "", source: "YouTube",
    summary: "s | 钩子: h", tags: ["FF", "观察"], brand: "FF", id: "ff-three"
  },
  { date: "2026-01-01", section: "product", title: "China Trends: 假关键字甲", url: "", source: "google_trends", summary: "relative interest 100 (up)", tags: ["trends", "cn"] },
  { date: "2026-01-01", section: "product", title: "China Trends: 假关键字乙", url: "", source: "google_trends", summary: "relative interest 76 (down)", tags: ["trends", "cn"] },
  { date: "2026-01-01", section: "product", title: "Malaysia Trends: fake cleaner", url: "", source: "google_trends", summary: "relative interest 55 (flat)", tags: ["trends", "my"] },
  {
    date: "2026-01-01", section: "product", title: "假产品 500ml", url: "https://example.com/p/1",
    source: "Shopee", summary: "假卖点。 | idea: 假点子。",
    tags: [["厨房", "同行"], "Shopee", "sample"], priceMYR: 18.9, id: "ff-demo-x"
  }
];

test("旧 marketing：拆回 summary / hook / compliance，status 从 tags 取", () => {
  const out = D.normalizeItems(OLD);
  const a = out[0];
  assert.equal(a.kind, "angle");
  assert.equal(a.id, "ot-fake_one");
  assert.equal(a.brand, "OT");
  assert.equal(a.status, "RISING");
  assert.equal(a.summary, "假痛点一句话。");
  assert.equal(a.hook, "假钩子 3 个动作。");
  assert.equal(a.compliance, "假合规提醒。");
  assert.deepEqual(a.tags, ["OT", "comparison", "flatfeet"], "brand 原本就有 → OT 留在 tags；RISING 变成字段后拿掉");
});

test("旧 marketing：没 brand / id → 从 tags 取品牌，用 section-title 做 slug；中文 status 映射", () => {
  const b = D.normalizeItems(OLD)[1];
  assert.equal(b.brand, "FF");
  assert.equal(b.status, "KEEP");
  assert.equal(b.id, "marketing-假角度二");
  assert.equal(b.summary, "只有摘要");
  assert.equal(b.hook, "");
  assert.equal(b.compliance, "只有合规");
  assert.deepEqual(b.tags, ["tutorial"]);
  const c = D.normalizeItems(OLD)[2];
  assert.equal(c.status, "WATCH");
  assert.equal(c.hook, "h");
  assert.equal(c.compliance, "");
});

test("旧 google_trends：变 keyword，去前缀、region / interest / trend / rank", () => {
  const out = D.normalizeItems(OLD);
  const [k1, k2, k3] = [out[3], out[4], out[5]];
  assert.equal(k1.kind, "keyword");
  assert.equal(k1.title, "假关键字甲");
  assert.equal(k1.region, "cn");
  assert.equal(k1.interest, 100);
  assert.equal(k1.trend, "up");
  assert.equal(k1.rank, 1);
  assert.equal(k1.brand, "FF");
  assert.equal(k1.summary, "");
  assert.equal(k1.id, "product-假关键字甲");
  assert.equal(k2.rank, 2);
  assert.equal(k2.trend, "down");
  assert.equal(k3.title, "fake cleaner");
  assert.equal(k3.region, "my");
  assert.equal(k3.rank, 1, "名次按 region 各自从 1 算");
  assert.equal(k3.trend, "flat");
  assert.equal(k3.id, "product-fake-cleaner");
});

test("旧 product：idea 拆出来，platform=source，tags 里的数组变 category，默认 FF", () => {
  const p = D.normalizeItems(OLD)[6];
  assert.equal(p.kind, "product");
  assert.equal(p.brand, "FF");
  assert.equal(p.summary, "假卖点。");
  assert.equal(p.idea, "假点子。");
  assert.equal(p.platform, "Shopee");
  assert.deepEqual(p.category, ["厨房", "同行"]);
  assert.deepEqual(p.tags, ["厨房", "同行", "Shopee", "sample"]);
  assert.equal(p.priceMYR, 18.9);
});

test("normalizeItems：同一天 slug 撞了加后缀", () => {
  const out = D.normalizeItems([
    { section: "marketing", title: "同名", summary: "", tags: [] },
    { section: "marketing", title: "同名", summary: "", tags: [] }
  ]);
  assert.equal(out[0].id, "marketing-同名");
  assert.equal(out[1].id, "marketing-同名-2");
});

// ---------- 新格式（DATA.md 定版）：原样通过 ----------
const NEW = [
  {
    id: "ot-fake_angle", section: "marketing", kind: "angle", brand: "OT",
    title: "假标题", summary: "假摘要", url: "https://example.com/v", source: "YouTube",
    tags: ["comparison"], status: "RISING", hook: "假钩子", hooks: ["草稿一", "草稿二"],
    compliance: "假合规", views: 182000
  },
  {
    id: "kw-cn-假词", section: "product", kind: "keyword", brand: "FF",
    title: "假词", summary: "连续三天第一", url: "", source: "google_trends",
    tags: ["trends"], region: "cn", rank: 1, interest: 100, trend: "up", prev_rank: 3
  },
  {
    id: "prod-shopee-1", section: "product", kind: "product", brand: "FF",
    title: "假产品", summary: "假卖点", url: "https://example.com/p", source: "Shopee",
    tags: ["kitchen"], platform: "Shopee", priceMYR: 18.9, category: ["厨房"], idea: "假点子"
  },
  {
    id: "both-1", section: "marketing", kind: "angle", brand: "BOTH",
    title: "两品牌", summary: "s", url: "", source: "TikTok", tags: [], status: "NEW",
    hook: "", compliance: ""
  }
];

test("新格式：normalize 后与原条目完全相同", () => {
  const out = D.normalizeItems(NEW);
  assert.equal(out.length, NEW.length);
  out.forEach((it, i) => assert.deepEqual(it, NEW[i]));
});

test("新格式：不改动传入的对象", () => {
  const copy = JSON.parse(JSON.stringify(NEW));
  D.normalizeItems(NEW);
  assert.deepEqual(NEW, copy);
});

test("normalizeFile：接受 {date, items} 或纯数组", () => {
  const f = D.normalizeFile({ date: "2026-01-02", built_at_local: "x", items: NEW });
  assert.equal(f.date, "2026-01-02");
  assert.equal(f.items.length, 4);
  const g = D.normalizeFile(NEW, "2026-01-03");
  assert.equal(g.date, "2026-01-03");
  assert.equal(D.normalizeFile(null, "d").items.length, 0);
});

// ---------- 筛选 / 排序 ----------

test("品牌筛选：BOTH 在 OT、FF 下都出现", () => {
  const items = D.normalizeItems(NEW);
  assert.equal(D.filterItems(items, "ALL", "").length, 4);
  assert.deepEqual(D.filterItems(items, "OT", "").map((x) => x.id), ["ot-fake_angle", "both-1"]);
  assert.deepEqual(D.filterItems(items, "FF", "").map((x) => x.id), ["kw-cn-假词", "prod-shopee-1", "both-1"]);
});

test("搜索：标题 / summary / tags / hook 都能搜到，不分大小写", () => {
  const items = D.normalizeItems(NEW);
  assert.deepEqual(D.filterItems(items, "ALL", "假钩子").map((x) => x.id), ["ot-fake_angle"]);
  assert.deepEqual(D.filterItems(items, "ALL", "KITCHEN").map((x) => x.id), ["prod-shopee-1"]);
  assert.deepEqual(D.filterItems(items, "ALL", "连续三天").map((x) => x.id), ["kw-cn-假词"]);
  assert.deepEqual(D.filterItems(items, "ALL", "两品牌").map((x) => x.id), ["both-1"]);
  assert.equal(D.filterItems(items, "OT", "假产品").length, 0, "品牌和搜索同时生效");
});

test("营销排序：NEW > RISING > WATCH > KEEP，再按 views 降序", () => {
  const list = [
    { id: "k", status: "KEEP", views: 9e6 },
    { id: "w", status: "WATCH" },
    { id: "r1", status: "RISING", views: 10 },
    { id: "r2", status: "RISING", views: 500 },
    { id: "n", status: "NEW" },
    { id: "r3", status: "RISING" }
  ];
  assert.deepEqual(D.sortAngles(list).map((x) => x.id), ["n", "r2", "r1", "r3", "w", "k"]);
});

test("关键字按 region 分组，没资料的 region 不出现；较昨天", () => {
  const groups = D.groupKeywords([
    { region: "my", rank: 2 }, { region: "my", rank: 1 }, { region: "global", rank: 1 }
  ]);
  assert.deepEqual(groups.map((g) => g.region), ["my", "global"]);
  assert.deepEqual(groups[0].items.map((x) => x.rank), [1, 2]);
  assert.equal(D.rankDelta({ rank: 1, prev_rank: 3 }), 2);
  assert.equal(D.rankDelta({ rank: 4, prev_rank: 1 }), -3);
  assert.equal(D.rankDelta({ rank: 1 }), null);
});

// ---------- v2：封面图 ----------

test("youtubeId：watch / youtu.be / shorts / embed / m.，别的站回空", () => {
  const id = "AbCdEfGhI_-";
  assert.equal(D.youtubeId("https://www.youtube.com/watch?v=" + id), id);
  assert.equal(D.youtubeId("https://www.youtube.com/watch?feature=share&v=" + id + "&t=30"), id);
  assert.equal(D.youtubeId("https://youtu.be/" + id + "?si=x"), id);
  assert.equal(D.youtubeId("https://www.youtube.com/shorts/" + id), id);
  assert.equal(D.youtubeId("https://m.youtube.com/watch?v=" + id), id);
  assert.equal(D.youtubeId("https://www.youtube.com/embed/" + id), id);
  assert.equal(D.youtubeId("https://www.instagram.com/p/AbCdEfGhI_-/"), "");
  assert.equal(D.youtubeId("https://notyoutube.com/watch?v=" + id), "");
  assert.equal(D.youtubeId("https://www.youtube.com/watch?v=short"), "", "ID 不是 11 位不算");
  assert.equal(D.youtubeId("javascript:alert(1)//youtube.com/watch?v=" + id), "");
  assert.equal(D.youtubeId(""), "");
  assert.equal(D.youtubeId(undefined), "");
});

test("旧 marketing：没 thumb 的 YouTube 条目从 url 推封面；Instagram 不推", () => {
  const out = D.normalizeItems([
    { section: "marketing", title: "假 YT", url: "https://www.youtube.com/watch?v=AAAAAAAAAA1", source: "YouTube 长视频", summary: "s | 钩子: h", tags: ["OT", "RISING"] },
    { section: "marketing", title: "假 Shorts", url: "https://youtube.com/shorts/BBBBBBBBBB2", source: "YouTube Shorts", summary: "s", tags: ["FF", "NEW"] },
    { section: "marketing", title: "假 IG", url: "https://www.instagram.com/p/CCCCCCCCCC3/", source: "Instagram Reels", summary: "s", tags: ["OT", "保留"] }
  ]);
  assert.equal(out[0].thumb, "https://i.ytimg.com/vi/AAAAAAAAAA1/hqdefault.jpg");
  assert.equal(out[1].thumb, "https://i.ytimg.com/vi/BBBBBBBBBB2/hqdefault.jpg");
  assert.equal("thumb" in out[2], false);
});

test("已有 thumb 不覆盖；空字符串 thumb 才补；product 不推 thumb", () => {
  const [a, b, p] = D.normalizeItems([
    { id: "a", section: "marketing", kind: "angle", brand: "OT", title: "a", summary: "", url: "https://youtu.be/DDDDDDDDDD4", source: "YouTube", tags: [], status: "NEW", hook: "", compliance: "", thumb: "https://example.com/own.jpg" },
    { id: "b", section: "marketing", kind: "angle", brand: "OT", title: "b", summary: "", url: "https://youtu.be/EEEEEEEEEE5", source: "YouTube", tags: [], status: "NEW", hook: "", compliance: "", thumb: "" },
    { id: "p", section: "product", kind: "product", brand: "FF", title: "p", summary: "", url: "https://youtu.be/FFFFFFFFFF6", source: "TikTok", tags: [], platform: "TikTok" }
  ]);
  assert.equal(a.thumb, "https://example.com/own.jpg");
  assert.equal(b.thumb, "https://i.ytimg.com/vi/EEEEEEEEEE5/hqdefault.jpg");
  assert.equal("thumb" in p, false);
});

test("旧 product：tags 里的 sample → sample: true；新格式没 sample 不加", () => {
  const out = D.normalizeItems(OLD);
  assert.equal(out[6].sample, true);
  const n = D.normalizeItems(NEW);
  assert.equal("sample" in n[2], false);
});

// ---------- v3：新字段 ----------

test("v3 新字段原样通过；格式不对的 history / need_keys 拿掉或补成数组", () => {
  const good = [
    { id: "a", section: "marketing", kind: "angle", brand: "OT", title: "a", summary: "", url: "", source: "TikTok", tags: [], status: "NEW", hook: "", compliance: "",
      why: "假原因", trend_element: "前后对比", views_per_day: 1200, pattern: "假模式", apply: { OT: "假钩子", FF: "假钩子二" }, thumb: "https://example.com/t.jpg" },
    { id: "k", section: "product", kind: "keyword", brand: "FF", title: "假词", summary: "", url: "", source: "google_trends", tags: [], region: "cn", rank: 1, interest: 90, trend: "up",
      need: "假需求", history: [{ date: "2026-01-01", rank: 2, interest: 80 }] },
    { id: "p", section: "product", kind: "product", brand: "FF", title: "p", summary: "", url: "", source: "Shopee", tags: [], platform: "Shopee", need_keys: ["假词"] }
  ];
  D.normalizeItems(good).forEach((it, i) => assert.deepEqual(it, good[i]));
  const [k, p] = D.normalizeItems([
    { ...good[1], history: "坏" },
    { ...good[2], need_keys: "假词" }
  ]);
  assert.equal("history" in k, false);
  assert.deepEqual(p.need_keys, ["假词"]);
});

test("搜索也搜 need / why / pattern / apply", () => {
  const items = [
    { id: "k", title: "x", need: "租屋族要免刷除油", brand: "FF" },
    { id: "a", title: "y", why: "评论区都在问哪里买", apply: { OT: "鞋垫三秒测试" }, brand: "OT" }
  ];
  assert.deepEqual(D.filterItems(items, "ALL", "租屋族").map((x) => x.id), ["k"]);
  assert.deepEqual(D.filterItems(items, "ALL", "哪里买").map((x) => x.id), ["a"]);
  assert.deepEqual(D.filterItems(items, "ALL", "三秒").map((x) => x.id), ["a"]);
});

test("normalizeFile：带出文件顶层 note_from_ai（没有就空字符串）", () => {
  assert.equal(D.normalizeFile({ date: "2026-01-01", note_from_ai: " 根据反馈，这次少抓开箱 ", items: [] }).note_from_ai, "根据反馈，这次少抓开箱");
  assert.equal(D.normalizeFile({ items: [] }).note_from_ai, "");
  assert.equal(D.normalizeFile({ note_from_ai: 3, items: [] }).note_from_ai, "");
});

// ---------- Codex 复审 2026-10-21：source 写法 / 字符串数字 / 需求分析说明 ----------

test("source 不分大小写、去空格 / 下划线 / 连字符：Google Trends 也认成 keyword", () => {
  ["google_trends", "Google Trends", "GOOGLE-TRENDS", " google trends ", "GoogleTrends", "Trends"].forEach((source) => {
    const [k] = D.normalizeItems([{ section: "product", title: "Malaysia Trends: fake spray", source, summary: "relative interest 40 (up)", tags: ["trends", "my"] }]);
    assert.equal(k.kind, "keyword", source);
    assert.equal(k.title, "fake spray", source);
    assert.equal(k.interest, 40, source);
  });
  // 不是 Trends 来源的照旧是产品
  ["Shopee", "TikTok", "Amazon"].forEach((source) => {
    assert.equal(D.normalizeItems([{ section: "product", title: "假产品", source }])[0].kind, "product", source);
  });
  assert.equal(D.isTrendsSource("Google  Trends"), true);
  assert.equal(D.isTrendsSource("Lazada"), false);
});

test("Trends 来源但没有名次 / 热度信号 → note（不当产品）；有 rank 字段的还是 keyword", () => {
  const out = D.normalizeItems([
    { section: "product", title: "MY：假词甲 / 假词乙 近周兴趣抬升", source: "Google Trends", summary: "假词甲 近7日均约 37 vs 前7日约 15 | idea: 假点子", url: "https://example.com/t" },
    { section: "product", title: "假词丙", source: "Google Trends", rank: "2" },
    { section: "product", title: "假词丁", source: "google_trends", interest: 30 }
  ]);
  assert.deepEqual(out.map((x) => x.kind), ["note", "keyword", "keyword"]);
  assert.equal(out[0].title, "MY：假词甲 / 假词乙 近周兴趣抬升");
  assert.equal(out[1].rank, 2);
});

test("真资料 data/2026-10-20.json：「MY：foam cleaner …」那条是 note，不在产品里；其余 Trends 都是 keyword", () => {
  const file = D.normalizeFile(require("../data/2026-10-20.json"), "2026-10-20");
  const mine = file.items.filter((it) => /^MY：foam cleaner/.test(it.title));
  assert.equal(mine.length, 1);
  assert.equal(mine[0].kind, "note");
  assert.equal(file.items.filter((it) => it.kind === "product" && D.isTrendsSource(it.source)).length, 0, "Trends 来源一条都不当产品");
  const raw = require("../data/2026-10-20.json").items;
  const trendsRaw = raw.filter((it) => D.isTrendsSource(it.source)).length;
  assert.equal(file.items.filter((it) => it.kind === "keyword").length, trendsRaw - 1);
});

test("字符串 rank / prev_rank / interest 转数字，转不了就省略（rank 省略后按顺序补）", () => {
  const input = [
    { section: "product", kind: "keyword", title: "甲", source: "google_trends", region: "cn", rank: "3", prev_rank: " 5 ", interest: "88.5", trend: "up" },
    { section: "product", kind: "keyword", title: "乙", source: "google_trends", region: "cn", rank: "abc", prev_rank: "", interest: "高", trend: "up" },
    { section: "product", kind: "keyword", title: "丙", source: "google_trends", region: "cn", rank: 1, interest: 50, trend: "up",
      history: [{ date: "2026-01-01", rank: "4", interest: "x" }, { date: "2026-01-02", rank: 2, interest: 60 }] }
  ];
  const copy = JSON.parse(JSON.stringify(input));
  const [a, b, c] = D.normalizeItems(input);
  assert.equal(a.rank, 3);
  assert.equal(a.prev_rank, 5);
  assert.equal(a.interest, 88.5);
  assert.equal(b.rank, 2, "转不了 → 当作没给，按文件顺序补名次");
  assert.equal("prev_rank" in b, false);
  assert.equal("interest" in b, false);
  assert.deepEqual(c.history, [{ date: "2026-01-01", rank: 4 }, { date: "2026-01-02", rank: 2, interest: 60 }]);
  assert.deepEqual(input, copy, "不改传入的对象");
  assert.equal(D.rankDelta({ rank: "1", prev_rank: "3" }), 2);
  assert.equal(D.rankDelta({ rank: "", prev_rank: 3 }), null);
});

test("同类数字字段：views / priceMYR 空字符串不当 0", () => {
  const [ang, prod] = D.normalizeItems([
    { section: "marketing", title: "a", source: "TikTok", views: "" },
    { section: "product", title: "p", source: "Shopee", priceMYR: "" }
  ]);
  assert.equal("views" in ang, false);
  assert.equal("priceMYR" in prod, false);
  const [ang2, prod2] = D.normalizeItems([
    { section: "marketing", title: "a", source: "TikTok", views: "1200" },
    { section: "product", title: "p", source: "Shopee", priceMYR: "18.90" }
  ]);
  assert.equal(ang2.views, 1200);
  assert.equal(prod2.priceMYR, 18.9);
  assert.equal(D.toNum("  "), null);
  assert.equal(D.toNum("0"), 0);
  assert.equal(D.toNum(true), null);
});
