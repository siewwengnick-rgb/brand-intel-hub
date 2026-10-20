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
  assert.equal(JSON.parse(S.exportJSON(rows)).length, 2);
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
