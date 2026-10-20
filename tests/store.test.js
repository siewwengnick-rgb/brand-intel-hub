"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../js/store.js");

function memStorage(init) {
  const m = new Map(init ? Object.entries(init) : []);
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _m: m };
}
let tick = 0;
const clock = () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)).toISOString();
const KW = { item_id: "kw-cn-假词", date: "2026-01-01", section: "product", kind: "keyword", brand: "FF", title: "假词", url: "" };
const ANGLE = { item_id: "ot-fake", date: "2026-01-01", section: "marketing", kind: "angle", brand: "OT", title: "假角度", url: "https://example.com/v" };

test("deriveDecisions：出新品+投广告并存；跳过互斥；cancel_x 拿掉 x；按时间套", () => {
  const rows = [
    { ...KW, decision: "new_product", created_at: "2026-01-01T00:00:01Z" },
    { ...KW, decision: "ad_keyword", created_at: "2026-01-01T00:00:02Z" },
    { ...ANGLE, decision: "skip", created_at: "2026-01-01T00:00:03Z" },
    { ...ANGLE, decision: "shoot", created_at: "2026-01-01T00:00:04Z" },
    { ...KW, decision: "cancel_ad_keyword", created_at: "2026-01-01T00:00:05Z" },
    { ...KW, date: "2026-01-02", decision: "new_product", created_at: "2026-01-01T00:00:06Z" },
    { ...KW, date: "2026-01-02", decision: "skip", created_at: "2026-01-01T00:00:07Z" },
    { item_id: "bad", date: "2026-01-01", decision: "favorite" }
  ];
  const st = S.deriveDecisions(rows.slice().reverse()); // 顺序打乱也按 created_at 套
  assert.deepEqual(Object.keys(st["kw-cn-假词|2026-01-01"]), ["new_product"]);
  assert.deepEqual(Object.keys(st["ot-fake|2026-01-01"]), ["shoot"]);
  assert.deepEqual(Object.keys(st["kw-cn-假词|2026-01-02"]), ["skip"]);
  assert.equal(st["bad|2026-01-01"], undefined);
  const all = S.deriveDecisions([...rows, { ...ANGLE, decision: "cancel_shoot", created_at: "2026-01-01T00:00:09Z" }]);
  assert.equal(all["ot-fake|2026-01-01"], undefined, "全取消就没有这条");
});

test("exportList：decisions.json 字段，跳过也带上，日期新的在前", () => {
  const rows = [
    { ...ANGLE, decision: "shoot", reason: "很好", note: "下周拍", who: "Nick", created_at: "2026-01-01T00:00:01Z" },
    { ...KW, date: "2026-01-02", decision: "skip", reason: "没新意", note: "", who: "团队", created_at: "2026-01-01T00:00:02Z" }
  ];
  const out = S.exportList(rows);
  assert.deepEqual(out.map((r) => r.decision), ["skip", "shoot"]);
  assert.deepEqual(Object.keys(out[0]), S.EXPORT_FIELDS);
  assert.equal(out[1].id, "ot-fake");
  assert.equal(out[1].reason, "很好");
  assert.equal(out[1].decided_at, "2026-01-01T00:00:01Z");
  assert.equal(JSON.parse(S.exportJSON(rows)).decisions.length, 2);
});

test("本地：旧 favorites 迁移一次（营销 → shoot、产品 → new_product），旧键不删", async () => {
  const old = [
    { id: "ot-fake", section: "marketing", kind: "angle", title: "假角度", date: "2026-01-01", saved_at: "2026-01-01T01:00:00Z", brand: "OT" },
    { id: "prod-1", section: "product", kind: "product", title: "假产品", date: "2026-01-02", saved_at: "2026-01-02T01:00:00Z" },
    { item_id: "grok-old", item_kind: "content" }
  ];
  const storage = memStorage({ [S.KEYS.oldFavorites]: JSON.stringify(old) });
  const st = S.createStore({ storage, now: clock });
  assert.equal(st.mode, "local");
  await st.init();
  const rows = await st.listFeedback();
  assert.deepEqual(rows.map((r) => [r.item_id, r.decision]), [["ot-fake", "shoot"], ["prod-1", "new_product"]]);
  assert.ok(storage.getItem(S.KEYS.oldFavorites));
  await st.clear();
  await S.createStore({ storage, now: clock }).init();
  assert.equal((await st.listFeedback()).length, 0, "清空后不会再迁一次");
});

test("本地：addFeedback 补 id / created_at / 未署名；坏行拒收；views 按日期", async () => {
  const st = S.createStore({ storage: memStorage(), now: clock });
  await st.init();
  const r = await st.addFeedback({ ...KW, decision: "skip", reason: "没新意" });
  assert.match(r.id, /^[0-9a-f-]{36}$/);
  assert.equal(r.who, S.UNSIGNED);
  assert.equal(r.note, "");
  assert.throws(() => st.addFeedback({ ...KW, decision: "like" }));
  await st.addView({ item_id: "a", date: "2026-01-01", who: "Nick" });
  await st.addView({ item_id: "a", date: "2026-01-01", who: "Nick", seconds: 12.6 });
  await st.addView({ item_id: "b", date: "2026-01-02", who: "Nick" });
  const v = await st.listViews("2026-01-01");
  assert.deepEqual(v.map((x) => x.seconds), [null, 13]);
});

test("身份：存在 localStorage；team 没设定就 Nick + 团队", () => {
  const storage = memStorage();
  const st = S.createStore({ storage });
  assert.deepEqual(st.team, ["Nick", "团队"]);
  assert.equal(st.getWho(), "");
  st.setWho("Nick");
  assert.equal(S.createStore({ storage }).getWho(), "Nick");
  assert.deepEqual(S.createStore({ storage, config: { team: ["A", "B", "C"] } }).team, ["A", "B", "C"]);
  // 就算 config 里有 Supabase 的东西也只用本机（Nick 2026-10-20：先不用 Supabase）
  assert.equal(S.createStore({ storage, config: { supabaseUrl: "https://x.supabase.co", supabaseAnonKey: "k" } }).mode, "local");
});

// ---------- Codex 复审 2026-10-21：存储失败矩阵 / Export 字段 ----------

// 可以指定哪一步抛错的假 storage
function badStorage(init, fail) {
  const m = memStorage(init);
  const calls = { set: 0 };
  return {
    getItem: (k) => { if (fail.get) throw new Error("SecurityError"); return m.getItem(k); },
    setItem: (k, v) => { calls.set++; if (fail.set) throw new Error("QuotaExceededError"); m.setItem(k, v); },
    removeItem: (k) => m._m.delete(k),
    _m: m._m, calls
  };
}
const OLD_ROW = { ...KW, id: "11111111-1111-4111-8111-111111111111", decision: "new_product", reason: "", note: "", who: "Nick", created_at: "2026-01-01T00:00:00Z" };
const OLD_RAW = JSON.stringify([OLD_ROW]);

test("pickStorage：getter 抛错（Safari 隐私模式）→ 内存存储，页面照用，提示不保留", async () => {
  const p = S.pickStorage(() => { throw new Error("SecurityError"); });
  assert.equal(p.persistent, false);
  const st = S.createStore({ storage: p.storage, persistent: p.persistent, now: clock });
  await st.init();
  assert.deepEqual(await st.listFeedback(), []);
  await st.addFeedback({ ...KW, decision: "skip" });
  assert.equal((await st.listFeedback()).length, 1, "这次打开期间还能用");
  assert.equal(st.health().persistent, false);
  assert.equal(st.setWho("Nick"), true);
  // getter 回 null / 不像 storage 的东西也一样
  assert.equal(S.pickStorage(() => null).persistent, false);
  assert.equal(S.pickStorage(() => ({})).persistent, false);
  // 没给 storage 的 createStore 也不炸
  assert.equal(S.createStore({}).health().persistent, false);
});

test("pickStorage：getItem 抛错 → 内存；能读能写 → 原 storage，试写的键清掉", () => {
  assert.equal(S.pickStorage(() => badStorage({}, { get: true })).persistent, false);
  const ok = badStorage({}, {});
  const p = S.pickStorage(() => ok);
  assert.equal(p.storage, ok);
  assert.equal(p.persistent, true);
  assert.equal(ok._m.size, 0, "试写的键不留");
});

test("pickStorage：读得了写不进 → 没旧记录用内存；有旧记录照用原 storage（看得到旧决定，写回失败、不盖掉）", async () => {
  const empty = badStorage({}, { set: true });
  const p1 = S.pickStorage(() => empty);
  assert.notEqual(p1.storage, empty);
  assert.equal(p1.persistent, false);

  const withOld = badStorage({ [S.KEYS.feedback]: OLD_RAW }, { set: true });
  const p2 = S.pickStorage(() => withOld);
  assert.equal(p2.storage, withOld);
  assert.equal(p2.persistent, false);
  const st = S.createStore({ storage: p2.storage, persistent: p2.persistent, now: clock });
  await st.init();
  assert.equal((await st.listFeedback()).length, 1, "旧决定看得到");
  await assert.rejects(st.addFeedback({ ...KW, decision: "skip" }), (e) => e.code === "write_failed");
  await assert.rejects(st.addView({ item_id: "a", date: "2026-01-01" }), (e) => e.code === "write_failed");
  await assert.rejects(st.clear(), (e) => e.code === "write_failed");
  assert.equal(st.setWho("Nick"), false, "setWho 也回真实成败");
  assert.equal(withOld._m.get(S.KEYS.feedback), OLD_RAW, "旧记录原封不动");
});

test("读失败：坏 JSON / 不是数组 / 空字符串 → readFailed，不准写，旧资料不被空数组盖掉", async () => {
  for (const bad of ["{坏掉", "{}", "\"x\"", ""]) {
    const storage = memStorage({ [S.KEYS.feedback]: bad, [S.KEYS.views]: bad });
    const st = S.createStore({ storage, now: clock });
    await st.init();
    await assert.rejects(st.listFeedback(), (e) => e.code === "read_failed", JSON.stringify(bad));
    assert.equal(st.health().readFailed.feedback, true);
    await assert.rejects(st.addFeedback({ ...KW, decision: "skip" }), (e) => e.code === "read_failed");
    await assert.rejects(st.clear(), (e) => e.code === "read_failed");
    await assert.rejects(st.listViews("2026-01-01"), (e) => e.code === "read_failed");
    await assert.rejects(st.addView({ item_id: "a", date: "2026-01-01" }), (e) => e.code === "read_failed");
    assert.equal(st.health().readFailed.views, true);
    assert.equal(storage.getItem(S.KEYS.feedback), bad, "feedback 原封不动");
    assert.equal(storage.getItem(S.KEYS.views), bad, "views 原封不动");
  }
});

test("读失败：运行中 getItem 突然抛错 → 一次都不写，旧资料还在", async () => {
  const flaky = badStorage({ [S.KEYS.feedback]: OLD_RAW }, {});
  const st = S.createStore({ storage: flaky, now: clock });
  await st.init();
  const before = flaky.calls.set;
  flaky.getItem = () => { throw new Error("SecurityError"); };
  await assert.rejects(st.listFeedback(), (e) => e.code === "read_failed");
  await assert.rejects(st.addFeedback({ ...KW, decision: "skip" }), (e) => e.code === "read_failed");
  await assert.rejects(st.addView({ item_id: "a", date: "2026-01-01" }), (e) => e.code === "read_failed");
  await assert.rejects(st.clear(), (e) => e.code === "read_failed");
  assert.equal(flaky.calls.set, before, "读不了就一次都不写");
  assert.equal(flaky._m.get(S.KEYS.feedback), OLD_RAW);
  assert.equal(st.getWho(), "", "getWho 读不了回空，不抛");
});

test("读失败只挡那个键；修好后 readFailed 自己消掉", async () => {
  const storage = memStorage({ [S.KEYS.feedback]: OLD_RAW, [S.KEYS.views]: "{坏" });
  const st = S.createStore({ storage, now: clock });
  await st.init();
  await st.addFeedback({ ...KW, decision: "skip" });
  assert.equal((await st.listFeedback()).length, 2, "feedback 照常");
  await assert.rejects(st.addView({ item_id: "a", date: "2026-01-01" }));
  assert.deepEqual(st.health().readFailed, { feedback: false, views: true });
  storage.setItem(S.KEYS.views, "[]");
  await st.addView({ item_id: "a", date: "2026-01-01" });
  assert.deepEqual(st.health().readFailed, { feedback: false, views: false });
});

test("写失败：addFeedback / addView / clear 都回失败，不回假成功；读回来没有多出东西", async () => {
  const storage = badStorage({ [S.KEYS.feedback]: OLD_RAW, [S.KEYS.views]: "[]" }, {});
  const st = S.createStore({ storage, now: clock });
  await st.init();
  storage.setItem = () => { throw new Error("QuotaExceededError"); };
  await assert.rejects(st.addFeedback({ ...KW, decision: "skip" }), (e) => e.code === "write_failed");
  await assert.rejects(st.addView({ item_id: "a", date: "2026-01-01", who: "Nick" }), (e) => e.code === "write_failed");
  await assert.rejects(st.clear(), (e) => e.code === "write_failed");
  assert.equal(st.setWho("Nick"), false);
  assert.equal((await st.listFeedback()).length, 1);
  assert.deepEqual(await st.listViews("2026-01-01"), []);
});

test("listViews() 不给日期 = 全部", async () => {
  const st = S.createStore({ storage: memStorage(), now: clock });
  await st.addView({ item_id: "a", date: "2026-01-01" });
  await st.addView({ item_id: "b", date: "2026-01-02" });
  assert.equal((await st.listViews()).length, 2);
  assert.equal((await st.listViews("2026-01-02")).length, 1);
});

test("Export：decisions.json = {decisions, views}，字段齐；views 打开 / 关掉配成一行", () => {
  const rows = [{ ...ANGLE, decision: "shoot", reason: "很好", note: "下周拍", who: "Nick", created_at: "2026-01-01T00:00:01Z" }];
  const views = [
    { id: "v1", item_id: "ot-fake", date: "2026-01-01", who: "Nick", seconds: null, created_at: "2026-01-01T01:00:00Z" },
    { id: "v2", item_id: "ot-fake", date: "2026-01-01", who: "Nick", seconds: 42, created_at: "2026-01-01T01:00:42Z" },
    { id: "v3", item_id: "ot-fake", date: "2026-01-01", who: "团队", seconds: null, created_at: "2026-01-01T02:00:00Z" }, // 没正常关掉
    { id: "v4", item_id: "ot-two", date: "2026-01-02", who: "", seconds: null, created_at: "2026-01-02T01:00:00Z" },
    { id: "v5", item_id: "ot-two", date: "2026-01-02", who: "", seconds: 5, created_at: "2026-01-02T01:00:05Z" },
    { id: "v6", item_id: "ot-lone", date: "2026-01-02", who: "Nick", seconds: 9, created_at: "2026-01-02T03:00:00Z" }, // 只有关掉那行
    null, { item_id: "", date: "2026-01-01" }
  ];
  const out = JSON.parse(S.exportJSON(rows, views));
  assert.deepEqual(Object.keys(out), ["decisions", "views"]);
  assert.equal(out.decisions.length, 1);
  assert.deepEqual(Object.keys(out.decisions[0]), S.EXPORT_FIELDS);
  assert.deepEqual(S.EXPORT_VIEW_FIELDS, ["id", "date", "who", "seconds"]);
  out.views.forEach((v) => assert.deepEqual(Object.keys(v), S.EXPORT_VIEW_FIELDS));
  assert.deepEqual(out.views, [
    { id: "ot-two", date: "2026-01-02", who: S.UNSIGNED, seconds: 5 },
    { id: "ot-lone", date: "2026-01-02", who: "Nick", seconds: 9 },
    { id: "ot-fake", date: "2026-01-01", who: "Nick", seconds: 42 },
    { id: "ot-fake", date: "2026-01-01", who: "团队", seconds: null }
  ]);
  // 没有 views 也是完整结构
  assert.deepEqual(JSON.parse(S.exportJSON([], undefined)), { decisions: [], views: [] });
});

test("Export：从 store 读出来的 views（addView 存的）原样导得出来", async () => {
  const st = S.createStore({ storage: memStorage(), now: clock });
  await st.addFeedback({ ...ANGLE, decision: "shoot", who: "Nick" });
  await st.addView({ item_id: "ot-fake", date: "2026-01-01", who: "Nick" });
  await st.addView({ item_id: "ot-fake", date: "2026-01-01", who: "Nick", seconds: 7.4 });
  const out = JSON.parse(S.exportJSON(await st.listFeedback(), await st.listViews()));
  assert.deepEqual(out.views, [{ id: "ot-fake", date: "2026-01-01", who: "Nick", seconds: 7 }]);
  assert.equal(out.decisions[0].decision, "shoot");
});
