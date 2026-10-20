/*
 * v5 左栏菜单 + hash 路由（纯函数，可测）。
 *   #/today  #/products  #/briefs  #/todo  #/history  #/data
 *   可带日期：#/today?d=2026-10-19（不带 = 最新一天）
 * 浏览器里挂到 window.BIHRouter；Node（测试）里用 require。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BIHRouter = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // 左栏从上到下（验收单 v5「模块」）
  var ROUTES = [
    { id: "today", label: "今日总览", icon: "🏠", group: "每天" },
    { id: "products", label: "新品决策", icon: "📈", group: "每天" },
    { id: "briefs", label: "拍摄简报", icon: "🎬", group: "每天" },
    { id: "todo", label: "待办", icon: "✅", group: "结果" },
    { id: "history", label: "历史", icon: "🗂", group: "结果" },
    { id: "data", label: "资料与反馈", icon: "🔗", group: "设置" }
  ];
  var DEFAULT = "today";
  var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  var WEEK = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];

  function find(id) {
    for (var i = 0; i < ROUTES.length; i++) if (ROUTES[i].id === id) return ROUTES[i];
    return null;
  }

  function validDate(d) {
    if (!DATE_RE.test(String(d || ""))) return false;
    var t = new Date(d + "T00:00:00Z");
    return !isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d;
  }

  /** "#/products?d=2026-10-19" → { route: "products", date: "2026-10-19" }；不认得的页 → today，坏日期 → "" */
  function parse(hash) {
    var h = String(hash || "").replace(/^#/, "").replace(/^\/+/, "");
    var q = h.indexOf("?");
    var path = (q >= 0 ? h.slice(0, q) : h).split("/")[0].trim().toLowerCase();
    var query = q >= 0 ? h.slice(q + 1) : "";
    var date = "";
    query.split("&").forEach(function (kv) {
      var p = kv.split("=");
      if (p[0] === "d") {
        var v = "";
        try { v = decodeURIComponent(p[1] || ""); } catch (e) { v = ""; }
        if (validDate(v)) date = v;
      }
    });
    return { route: find(path) ? path : DEFAULT, date: date };
  }

  function href(route, date) {
    var r = find(route) ? route : DEFAULT;
    return "#/" + r + (validDate(date) ? "?d=" + date : "");
  }

  // 现在的 hash 规范化后该长什么样（不一样就 replaceState 成这个）
  function canonical(hash) {
    var p = parse(hash);
    return href(p.route, p.date);
  }

  // "2026-10-19" → "2026-10-19 星期一"
  function dateLabel(d) {
    if (!validDate(d)) return String(d || "");
    return d + " " + WEEK[new Date(d + "T00:00:00Z").getUTCDay()];
  }

  return {
    ROUTES: ROUTES, DEFAULT: DEFAULT,
    find: find, parse: parse, href: href, canonical: canonical,
    validDate: validDate, dateLabel: dateLabel
  };
});
