"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const I = require("../js/insights.js");

const kw = (title, rank, interest, extra = {}) => ({ kind: "keyword", region: "cn", title, rank, interest, ...extra });

// 假资料：7 天窗口（01-09 ~ 01-15）里有 4 天的文件，01-09 那天之前的不算
const DAYS = {
  "2026-01-08": [kw("旧日子", 1, 99)], // 窗口外，不算
  "2026-01-10": [kw("甲", 5, 40), kw("乙", 1, 90), kw("丙", 3, 60)],
  "2026-01-11": [kw("甲", 4, 50), kw("乙", 1, 92), kw("丙", 2, 70)],
  "2026-01-13": [kw("甲", 3, 60), kw("乙", 2, 85), kw("丙", 2, 75)],
  "2026-01-15": [kw("甲", 1, 100), kw("乙", 4, 70), kw("丁", 2, 80), kw("丙", 3, 72)]
};
const TODAY = "2026-01-15";

test("windowDates：today 往前 7 天，manifest 没有的日期跳过", () => {
  const dates = ["2026-01-16", "2026-01-15", "2026-01-13", "2026-01-11", "2026-01-10", "2026-01-09", "2026-01-08"];
  assert.deepEqual(I.windowDates(TODAY, dates), ["2026-01-15", "2026-01-13", "2026-01-11", "2026-01-10", "2026-01-09"]);
  assert.equal(I.addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(I.addDays("bad", 1), "");
});

test("buildHistory：按 region+关键字串起来，旧→新，窗口外丢掉", () => {
  const h = I.buildHistory(DAYS, TODAY);
  assert.deepEqual(h["cn|甲"].map((p) => p.rank), [5, 4, 3, 1]);
  assert.deepEqual(h["cn|丁"].map((p) => p.date), ["2026-01-15"]);
  assert.equal(h["cn|旧日子"], undefined, "01-08 在 7 天以外");
  // 不同 region 同名不混
  const h2 = I.buildHistory({ [TODAY]: [kw("x", 1, 1), { ...kw("x", 2, 2), region: "my" }] }, TODAY);
  assert.equal(Object.keys(h2).length, 2);
});

test("buildHistory：条目自带 history 就用它（同一天以 history 为准）", () => {
  const today = [kw("戊", 1, 100, { history: [
    { date: "2026-01-12", rank: 6, interest: 30 },
    { date: "2026-01-13", rank: 9, interest: 20 },
    { date: "2026-01-01", rank: 1, interest: 1 } // 窗口外
  ] })];
  const h = I.buildHistory({ "2026-01-13": [kw("戊", 4, 50)], [TODAY]: today }, TODAY);
  assert.deepEqual(h["cn|戊"], [
    { date: "2026-01-12", rank: 6, interest: 30 },
    { date: "2026-01-13", rank: 9, interest: 20 },
    { date: TODAY, rank: 1, interest: 100 }
  ]);
});

// 一天接一天的假资料（01-12 ~ 01-15），用来算「较昨天」「连续上升」
const DAYS_C = {
  "2026-01-12": [kw("甲", 5, 40), kw("乙", 1, 90), kw("丙", 3, 60)],
  "2026-01-13": [kw("甲", 4, 50), kw("乙", 1, 92), kw("丙", 2, 70)],
  "2026-01-14": [kw("甲", 3, 60), kw("乙", 2, 85), kw("丙", 2, 75)],
  "2026-01-15": [kw("甲", 1, 100), kw("乙", 4, 70), kw("丁", 2, 80), kw("丙", 3, 72)]
};

test("较昨天：prev_rank 优先，没有就看历史里真正的昨天；upStreak 连续上升天数", () => {
  const h = I.buildHistory(DAYS_C, TODAY);
  assert.equal(I.rankDelta(kw("甲", 1, 100), h["cn|甲"], TODAY), 2, "昨天 01-14 第 3 → 今天第 1");
  assert.equal(I.rankDelta(kw("甲", 1, 100, { prev_rank: 7 }), h["cn|甲"], TODAY), 6);
  assert.equal(I.rankDelta(kw("丁", 2, 80), h["cn|丁"], TODAY), null);
  assert.equal(I.upStreak(h["cn|甲"], TODAY), 3, "5→4→3→1");
  assert.equal(I.upStreak(h["cn|丙"], TODAY), 0, "2→3 掉了");
  // 名次一样但热度涨也算上升
  assert.equal(I.upStreak([{ date: "2026-01-14", rank: 2, interest: 10 }, { date: TODAY, rank: 2, interest: 20 }], TODAY), 1);
  assert.equal(I.upStreak(h["cn|乙"], "2026-01-16"), 0, "今天没点就是 0");
});

test("日期断档：昨天没资料就没有「较昨天」；连续上升到断档就停", () => {
  // DAYS 只有 01-10 / 01-11 / 01-13 / 01-15：01-14 没有
  const h = I.buildHistory(DAYS, TODAY);
  assert.equal(I.yesterdayPoint(h["cn|甲"], TODAY), null);
  assert.equal(I.rankDelta(kw("甲", 1, 100), h["cn|甲"], TODAY), null, "01-13 不是昨天，不拿来比");
  assert.equal(I.rankDelta(kw("甲", 1, 100, { prev_rank: 7 }), h["cn|甲"], TODAY), 6, "Grok 给的 prev_rank 照用");
  assert.equal(I.upStreak(h["cn|甲"], TODAY), 0, "01-13 → 01-15 隔了一天，不算连续");
  // 中间断一天：只算断档之后的
  const gap = [
    { date: "2026-01-11", rank: 9, interest: null }, { date: "2026-01-12", rank: 7, interest: null },
    { date: "2026-01-14", rank: 5, interest: null }, { date: TODAY, rank: 3, interest: null }
  ];
  assert.equal(I.upStreak(gap, TODAY), 1);
  // 跨月也算相邻
  assert.equal(I.upStreak([{ date: "2026-02-28", rank: 3, interest: null }, { date: "2026-03-01", rank: 1, interest: null }], "2026-03-01"), 1);
  assert.equal(I.rankDelta(kw("x", 1, null), [{ date: "2026-02-28", rank: 4, interest: null }], "2026-03-01"), 3);
  const s = I.changeSummary(DAYS[TODAY], h, TODAY);
  assert.equal(s.newCount, 1, "新进榜看 7 天窗口：丁前几天都没有");
  assert.deepEqual([s.topRise, s.streak, s.topDrop], [null, null, null], "昨天没资料：升最快 / 连续 / 掉最多都不算");
});

test("changeSummary：新进榜 / 升最快 / 连续 ≥3 天 / 掉最多", () => {
  const h = I.buildHistory(DAYS_C, TODAY);
  const s = I.changeSummary(DAYS_C[TODAY], h, TODAY);
  assert.equal(s.newCount, 1, "丁");
  assert.deepEqual([s.topRise.title, s.topRise.delta], ["甲", 2]);
  assert.deepEqual([s.streak.title, s.streak.days], ["甲", 3]);
  assert.deepEqual([s.topDrop.title, s.topDrop.delta], ["乙", 2]);
});

test("changeSummary：只有 1 天资料、没 prev_rank → 四格全空（页面隐藏）", () => {
  const today = [kw("甲", 1, 100), kw("乙", 2, 90)];
  const s = I.changeSummary(today, I.buildHistory({ [TODAY]: today }, TODAY), TODAY);
  assert.deepEqual(s, { newCount: null, topRise: null, streak: null, topDrop: null });
  assert.equal(I.sparkValues(I.buildHistory({ [TODAY]: today }, TODAY)["cn|甲"]), null, "只有 1 天不画 sparkline");
});

test("changeSummary：只靠 prev_rank 也能算；没 prev_rank 的算新进榜", () => {
  const today = [kw("甲", 1, 100, { prev_rank: 4 }), kw("乙", 2, 90, { prev_rank: 1 }), kw("丙", 3, 50)];
  const s = I.changeSummary(today, I.buildHistory({ [TODAY]: today }, TODAY), TODAY);
  assert.equal(s.newCount, 1);
  assert.equal(s.topRise.delta, 3);
  assert.equal(s.topDrop.title, "乙");
  assert.equal(s.streak, null);
});

test("sparkValues：有 interest 用 interest，缺了用名次（反向）", () => {
  assert.deepEqual(I.sparkValues([{ rank: 3, interest: 10 }, { rank: 1, interest: 30 }]), [10, 30]);
  assert.deepEqual(I.sparkValues([{ rank: 3, interest: null }, { rank: 1, interest: 30 }]), [-3, -1]);
});

test("matchProducts：need_keys / related_keywords / tags 精确对上；没有就按名称相近；都没有回空", () => {
  const P = [
    { id: "a", title: "柑橘厨房除油喷雾", need_keys: ["厨房除油"], tags: [] },
    { id: "b", title: "浴室防霉喷雾", tags: ["浴室防霉"] },
    { id: "c", title: "洗衣凝珠", related_keywords: ["Laundry Beads"] },
    { id: "d", title: "地板清洁剂", summary: "电解水 拖地", tags: [], category: ["地板"] }
  ];
  assert.deepEqual(I.matchProducts({ title: "厨房除油" }, P), { items: [P[0]], how: "exact" });
  assert.deepEqual(I.matchProducts({ title: "浴室防霉" }, P).items.map((x) => x.id), ["b"]);
  assert.deepEqual(I.matchProducts("laundry beads", P).items.map((x) => x.id), ["c"], "不分大小写");
  assert.deepEqual(I.matchProducts({ title: "电解水" }, P), { items: [P[3]], how: "loose" });
  assert.deepEqual(I.matchProducts({ title: "玻璃水垢" }, P), { items: [], how: "none" });
  assert.deepEqual(I.matchProducts({ title: "" }, P), { items: [], how: "none" });
});

test("briefPoints：key_points 优先（最多 3 个）；没有就从 why / pattern / apply 各取第一句", () => {
  const kp = I.briefPoints({ key_points: [{ head: "前后对比", body: "3 秒见效" }, "只有标题", { head: "c", body: "d" }, { head: "第四个", body: "不要" }] });
  assert.equal(kp.from, "key_points");
  assert.deepEqual(kp.points, [{ head: "前后对比", body: "3 秒见效" }, { head: "只有标题", body: "" }, { head: "c", body: "d" }]);
  const fb = I.briefPoints({ why: "3 天 18 万观看。评论区都在问。", pattern: "提问式钩子！然后对比", apply: { OT: { hook: "你的鞋垫几年没换了？", how: "手拿旧鞋垫对镜头" } } });
  assert.equal(fb.from, "fallback");
  assert.deepEqual(fb.points.map((p) => p.body), ["3 天 18 万观看。", "提问式钩子！", "你的鞋垫几年没换了？"]);
  const old = I.briefPoints({ summary: "旧摘要一句。第二句", hook: "旧钩子" });
  assert.deepEqual(old.points.map((p) => p.body), ["旧摘要一句。", "钩子：旧钩子", ""], "旧样本：summary / hook 顶上，apply 没有就空");
  assert.equal(I.firstSentence("没有标点的一句"), "没有标点的一句");
  assert.equal(I.firstSentence(""), "");
});

test("dayStats：历史页一行（简报/需求/产品/已决定/看了），跳过也算已决定", () => {
  const D = "2026-01-15";
  const items = [
    { id: "a1", kind: "angle" }, { id: "a2", kind: "angle" },
    { id: "k1", kind: "keyword" }, { id: "k2", kind: "keyword" }, { id: "k3", kind: "keyword" },
    { id: "p1", kind: "product" }
  ];
  const dec = {
    ["a1|" + D]: { shoot: {} },
    ["k1|" + D]: { skip: {} },
    ["k2|" + D]: {},                    // 空的不算
    ["p1|2026-01-14"]: { new_product: {} } // 别天的不算
  };
  const views = [
    { item_id: "a1", date: D }, { item_id: "a1", date: D, seconds: 5 }, // 同一条去重
    { item_id: "a2", date: "2026-01-14" },                            // 别天
    { item_id: "gone", date: D },                                     // 文件里没有这条
    null
  ];
  assert.deepEqual(I.dayStats(items, dec, views, D), { total: 6, briefs: 2, keywords: 3, products: 1, decided: 2, viewed: 1 });
  assert.deepEqual(I.dayStats([], {}, [], D), { total: 0, briefs: 0, keywords: 0, products: 0, decided: 0, viewed: 0 });
  assert.deepEqual(I.dayStats(null, null, null, D).total, 0);
});

test("topKeywords：跨 region 按热度取前 n，热度一样看名次，没热度排后面", () => {
  const list = [
    kw("甲", 3, 60), { ...kw("乙", 1, 90), region: "my" }, kw("丙", 1, 90), kw("丁", 2, null), kw("戊", 5, 75), kw("己", 4, 10)
  ];
  assert.deepEqual(I.topKeywords(list, 5).map((k) => k.title), ["乙", "丙", "戊", "甲", "己"]);
  assert.deepEqual(I.topKeywords(list, 2).map((k) => k.title), ["乙", "丙"]);
  assert.equal(I.topKeywords(list, 10).length, 6);
  assert.deepEqual(I.topKeywords(null, 5), []);
});

test("字符串名次 / 热度（没 normalize 过的 history）也当数字；转不了是 null", () => {
  assert.equal(I.num("12"), 12);
  assert.equal(I.num(" 0.5 "), 0.5);
  assert.equal(I.num(""), null);
  assert.equal(I.num("高"), null);
  assert.equal(I.num(null), null);
  const h = I.buildHistory({ [TODAY]: [kw("戊", "1", "90", { history: [{ date: "2026-01-14", rank: "3", interest: "x" }] })] }, TODAY);
  assert.deepEqual(h["cn|戊"], [{ date: "2026-01-14", rank: 3, interest: null }, { date: TODAY, rank: 1, interest: 90 }]);
  assert.equal(I.rankDelta(kw("戊", "1", "90"), h["cn|戊"], TODAY), 2);
});

test("recentDates：最近 n 个有资料的日期，新的在前，断档也算", () => {
  assert.deepEqual(
    I.recentDates("2026-10-23", ["2026-10-26", "2026-10-23", "2026-10-20", "2026-09-01"], 2),
    ["2026-10-23", "2026-10-20"]
  );
  assert.deepEqual(I.recentDates("2026-10-23", ["2026-10-23"], 7), ["2026-10-23"]);
  assert.deepEqual(I.recentDates("2026-10-23", null, 7), []);
});

test("indexMeta：抖音周销折算写清窗口；Google Trends 不当成搜索次数；占位 0 不给数字", () => {
  const douyin = I.indexMeta({
    source: "chanmama_douyin", region: "cn", interest: 46,
    summary: "热度为周销量折算（榜首=100），非搜索热度"
  });
  assert.equal(douyin.family, "douyin_week");
  assert.equal(douyin.value, 46);
  assert.equal(douyin.label, "抖音周销量折算指数 · 约7天 · 榜首=100");
  assert.equal(/搜索次数|需求指数|终身/.test(douyin.label), false);

  const trends = I.indexMeta({
    source: "google_trends", interest: 10,
    summary: "US 近7日：→平稳；同组相对热度 10",
    url: "https://trends.google.com/trends/explore?date=today%201-m"
  });
  assert.equal(trends.family, "gtrends");
  assert.equal(trends.value, 10);
  assert.match(trends.label, /Google Trends/);
  assert.match(trends.label, /不是搜索次数/);
  assert.equal(/抖音周销/.test(trends.label), false);

  const taobao = I.indexMeta({
    source: "taobao_monthly", interest: 0, region: "cn",
    summary: "淘宝只给累计销量，热度未折算（填 0）"
  });
  assert.equal(taobao.family, "taobao");
  assert.equal(taobao.value, null);
  assert.match(taobao.label, /不是搜索量/);

  const adRank = I.indexMeta({
    source: "chanmama_douyin", interest: 0,
    summary: "投放榜第13，非销量榜，热度记 0"
  });
  assert.equal(adRank.value, null);
  assert.match(adRank.label, /没有折算指数/);

  const empty = I.indexMeta({ source: "chanmama_douyin", summary: "蝉妈妈周榜，这条没给折算" });
  assert.equal(empty.value, null);
  assert.match(empty.label, /没有折算指数/);
});

test("productMetric：只放一个写清来源的数字；没有周销指数就用标价，都不发明", () => {
  const keywords = [
    { title: "香氛洗衣液", source: "chanmama_douyin", interest: 46, summary: "周销折算（榜首=100），非搜索热度" },
    { title: "油烟机清洗剂", source: "taobao_monthly", interest: 0, summary: "热度未折算（填 0）" },
    { title: "laundry detergent", source: "google_trends", interest: 100, summary: "同组相对热度" }
  ];
  const linked = I.productMetric({
    title: "香氛拖地液", need_keys: ["香氛洗衣液", "laundry detergent"], priceMYR: 19.9
  }, keywords);
  assert.equal(linked.kind, "douyin_week");
  assert.equal(linked.value, "46");
  assert.equal(linked.label, "抖音周销量折算指数 · 约7天 · 榜首=100");
  assert.match(linked.note, /香氛洗衣液/);
  assert.equal(/需求指数/.test(linked.label + linked.note), false);

  const priced = I.productMetric({
    title: "无指数产品",
    need_keys: ["油烟机清洗剂", "除霉啫喱"],
    priceMYR: 5.74
  }, keywords.concat([{ title: "除霉啫喱", source: "chanmama_douyin", interest: 0, summary: "热度记 0" }]));
  assert.equal(priced.kind, "price");
  assert.equal(priced.value, "RM 5.74");
  assert.match(priced.label, /参考价/);
  assert.match(priced.label, /不是销量/);

  const bare = I.productMetric({ title: "空", need_keys: [] }, keywords);
  assert.equal(bare.kind, "none");
  assert.equal(bare.value, "—");
});

test("dedupeNewest：同一 id 留先出现的那条", () => {
  const rows = I.dedupeNewest([
    { id: "a", title: "new" },
    { id: "a", title: "old" },
    { id: "b", title: "b" },
    null
  ]);
  assert.deepEqual(rows.map((r) => r.title), ["new", "b"]);
});

test("dayStats：note（需求分析说明）不算条数", () => {
  const items = [{ id: "k1", kind: "keyword" }, { id: "n1", kind: "note" }, { id: "x", kind: "" }];
  assert.deepEqual(I.dayStats(items, {}, [], TODAY), { total: 1, briefs: 0, keywords: 1, products: 0, decided: 0, viewed: 0 });
});
