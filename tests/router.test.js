"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const R = require("../js/router.js");

test("ROUTES：6 个模块，左栏顺序和分组照 v5", () => {
  assert.deepEqual(R.ROUTES.map((r) => r.id), ["today", "products", "briefs", "todo", "history", "data"]);
  assert.deepEqual([...new Set(R.ROUTES.map((r) => r.group))], ["每天", "结果", "设置"]);
  assert.equal(R.DEFAULT, "today");
});

test("parse：hash → 页 + 日期；不认得的页回今日总览", () => {
  assert.deepEqual(R.parse(""), { route: "today", date: "" });
  assert.deepEqual(R.parse("#"), { route: "today", date: "" });
  assert.deepEqual(R.parse("#/products"), { route: "products", date: "" });
  assert.deepEqual(R.parse("#/briefs/"), { route: "briefs", date: "" });
  assert.deepEqual(R.parse("#/TODO"), { route: "todo", date: "" });
  assert.deepEqual(R.parse("#history"), { route: "history", date: "" });
  assert.deepEqual(R.parse("#/nope?d=2026-01-02"), { route: "today", date: "2026-01-02" });
  assert.deepEqual(R.parse("#/today?d=2026-01-02"), { route: "today", date: "2026-01-02" });
  assert.deepEqual(R.parse("#/data?x=1&d=2026-01-02"), { route: "data", date: "2026-01-02" });
});

test("parse：坏日期丢掉（格式不对 / 不存在的日子 / 坏编码）", () => {
  assert.equal(R.parse("#/today?d=2026-1-2").date, "");
  assert.equal(R.parse("#/today?d=2026-02-30").date, "");
  assert.equal(R.parse("#/today?d=%E0%A4%A").date, "");
  assert.equal(R.parse("#/today?d=<script>").date, "");
});

test("href / canonical：来回一致，刷新保持同一页", () => {
  R.ROUTES.forEach((r) => {
    assert.equal(R.parse(R.href(r.id)).route, r.id);
    assert.deepEqual(R.parse(R.href(r.id, "2026-01-02")), { route: r.id, date: "2026-01-02" });
  });
  assert.equal(R.href("bad"), "#/today");
  assert.equal(R.href("todo", "bad"), "#/todo");
  assert.equal(R.canonical(""), "#/today");
  assert.equal(R.canonical("#products"), "#/products");
  assert.equal(R.canonical("#/history?d=2026-02-30"), "#/history");
  assert.equal(R.canonical("#/today?d=2026-01-02"), "#/today?d=2026-01-02");
});

test("dateLabel：日期 + 星期", () => {
  assert.equal(R.dateLabel("2026-10-19"), "2026-10-19 星期一");
  assert.equal(R.dateLabel("2026-01-04"), "2026-01-04 星期日");
  assert.equal(R.dateLabel("bad"), "bad");
});
