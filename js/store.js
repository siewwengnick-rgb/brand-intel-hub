/*
 * 反馈存法（v4，只用 localStorage；Nick 2026-10-20：先不用 Supabase）。
 *   键 brand-intel-feedback / brand-intel-views / brand-intel-who
 * 只追加、不改：
 *   feedback {id, item_id, date, section, kind, brand, title, url, decision, reason, note, who, created_at}
 *     decision: new_product | ad_keyword | shoot | skip；取消某个决定 = 追加一行 cancel_<决定>
 *   views {id, item_id, date, who, seconds, created_at}
 *     打开简报追加一行（seconds 为空），关掉再追加一行（seconds = 看了几秒）
 * 某条现在的决定 = 按时间把 feedback 一行行套上去算出来（deriveDecisions）。
 * 接口全部回 Promise，以后要换后端（例如 Supabase）只换 createStore 里面。
 * 浏览器里挂到 window.BIHStore；Node（测试）里用 require。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BIHStore = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var KEYS = {
    feedback: "brand-intel-feedback",
    views: "brand-intel-views",
    who: "brand-intel-who",
    oldFavorites: "brand-intel-favorites"
  };
  var DECISIONS = ["new_product", "ad_keyword", "shoot", "skip"];
  var REASONS = ["很好", "看过了", "不适合我们", "太难拍", "没新意", "不合规"];
  var UNSIGNED = "未署名";
  var FEEDBACK_FIELDS = ["id", "item_id", "date", "section", "kind", "brand", "title", "url", "decision", "reason", "note", "who", "created_at"];
  var VIEW_FIELDS = ["id", "item_id", "date", "who", "seconds", "created_at"];
  // decisions.json（v3 定的字段 + v4 的原因 / 备注 / 谁）
  var EXPORT_FIELDS = ["id", "section", "kind", "brand", "title", "url", "date", "decision", "decided_at", "reason", "note", "who"];

  function isDecision(d) { return DECISIONS.indexOf(d) >= 0; }
  function isCancel(d) { return typeof d === "string" && d.indexOf("cancel_") === 0 && isDecision(d.slice(7)); }

  function uuid() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      return (c === "x" ? r : (r & 3 | 8)).toString(16);
    });
  }

  function pick(o, fields) {
    var out = {};
    fields.forEach(function (k) { if (o[k] !== undefined) out[k] = o[k]; });
    return out;
  }

  function parse(raw) {
    if (!raw) return null;
    try {
      var v = JSON.parse(raw);
      return Array.isArray(v) ? v : null;
    } catch (e) {
      return null;
    }
  }

  function validFeedback(r) {
    return r && typeof r.item_id === "string" && r.item_id && typeof r.date === "string" && r.date &&
      (isDecision(r.decision) || isCancel(r.decision));
  }

  function byTime(a, b) {
    return String(a.created_at || "").localeCompare(String(b.created_at || ""));
  }

  /**
   * 把 feedback 一行行套上去，算出每条（item_id|date）现在有哪些决定。
   * 出新品 + 投广告可以同时有；跳过和其他决定互斥；cancel_x 拿掉 x。
   * 回传 { "id|date": { decision: lastRow, ... } }
   */
  function deriveDecisions(rows) {
    var state = {};
    (rows || []).filter(validFeedback).slice().sort(byTime).forEach(function (r) {
      var k = r.item_id + "|" + r.date;
      var cur = state[k] || (state[k] = {});
      if (isCancel(r.decision)) {
        delete cur[r.decision.slice(7)];
      } else if (r.decision === "skip") {
        Object.keys(cur).forEach(function (d) { delete cur[d]; });
        cur.skip = r;
      } else {
        delete cur.skip;
        cur[r.decision] = r;
      }
      if (!Object.keys(cur).length) delete state[k];
    });
    return state;
  }

  // 现在有效的决定，一个决定一行，日期新的在前
  function currentDecisions(rows) {
    var st = deriveDecisions(rows);
    var out = [];
    Object.keys(st).forEach(function (k) {
      Object.keys(st[k]).forEach(function (d) { out.push(st[k][d]); });
    });
    return out.sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return byTime(b, a);
    });
  }

  function exportList(rows) {
    return currentDecisions(rows).map(function (r) {
      var o = {
        id: r.item_id, section: r.section, kind: r.kind, brand: r.brand, title: r.title, url: r.url,
        date: r.date, decision: r.decision, decided_at: r.created_at, reason: r.reason, note: r.note, who: r.who
      };
      EXPORT_FIELDS.forEach(function (f) { if (o[f] == null) o[f] = ""; });
      return pick(o, EXPORT_FIELDS);
    });
  }

  function exportJSON(rows) {
    return JSON.stringify(exportList(rows), null, 2) + "\n";
  }

  // v1/v2 的收藏 → feedback（营销 → shoot，其他 → new_product）。Grok 版的 item_id 记录不合格式，跳过
  function migrateFavorites(favs) {
    var out = [];
    (Array.isArray(favs) ? favs : []).forEach(function (f) {
      if (!f || typeof f.id !== "string" || !f.id || typeof f.date !== "string" || !f.date) return;
      out.push({
        id: uuid(), item_id: f.id, date: f.date, section: f.section || "", kind: f.kind || "",
        brand: f.brand || "", title: f.title || "", url: f.url || "",
        decision: f.section === "marketing" || f.kind === "angle" ? "shoot" : "new_product",
        reason: "", note: "从旧收藏迁移", who: UNSIGNED, created_at: f.saved_at || ""
      });
    });
    return out;
  }

  function cleanConfig(cfg) {
    cfg = cfg || {};
    var team = Array.isArray(cfg.team) && cfg.team.length ? cfg.team.map(String).filter(Boolean) : ["Nick", "团队"];
    return { team: team };
  }

  /**
   * opts: { config, storage, now }
   * 接口（全部回 Promise）：
   *   init()            → 第一次用：旧收藏迁过来（只一次）
   *   listFeedback()    → 全部 feedback
   *   addFeedback(row)  → 回传存好的那行（补 id / created_at / who）
   *   listViews(date)   → 那天的 views
   *   addView(row)
   *   clear()           → 清空 feedback
   */
  function createStore(opts) {
    opts = opts || {};
    var cfg = cleanConfig(opts.config);
    var storage = opts.storage;
    var now = opts.now || function () { return new Date().toISOString(); };

    function readList(key) {
      try { return parse(storage.getItem(key)) || []; } catch (e) { return []; }
    }
    function writeList(key, list) {
      try { storage.setItem(key, JSON.stringify(list)); return true; } catch (e) { return false; }
    }

    function stamp(row, fields) {
      var r = pick(row, fields);
      if (!r.id) r.id = uuid();
      if (!r.created_at) r.created_at = now();
      if (!r.who) r.who = UNSIGNED;
      return r;
    }

    function feedbackRow(row) {
      var r = stamp(row, FEEDBACK_FIELDS);
      ["section", "kind", "brand", "title", "url", "reason", "note"].forEach(function (k) { if (r[k] == null) r[k] = ""; });
      if (!validFeedback(r)) throw new Error("bad feedback row");
      return r;
    }

    function viewRow(row) {
      var r = stamp(row, VIEW_FIELDS);
      if (typeof r.seconds !== "number" || !isFinite(r.seconds)) r.seconds = null;
      else r.seconds = Math.max(0, Math.round(r.seconds));
      if (!r.item_id || !r.date) throw new Error("bad view row");
      return r;
    }

    // ---------- localStorage ----------
    var local = {
      init: function () {
        // 第一次（新键还不存在）：旧收藏迁过来，只迁一次，旧键不删
        try {
          if (storage.getItem(KEYS.feedback) === null) {
            writeList(KEYS.feedback, migrateFavorites(parse(storage.getItem(KEYS.oldFavorites))));
          }
        } catch (e) { /* 存不了就算了 */ }
        return Promise.resolve();
      },
      listFeedback: function () { return Promise.resolve(readList(KEYS.feedback).filter(validFeedback)); },
      addFeedback: function (row) {
        var r = feedbackRow(row);
        var all = readList(KEYS.feedback);
        all.push(r);
        return writeList(KEYS.feedback, all) ? Promise.resolve(r) : Promise.reject(new Error("localStorage 写不进去"));
      },
      listViews: function (date) {
        return Promise.resolve(readList(KEYS.views).filter(function (v) { return v && v.date === date; }));
      },
      addView: function (row) {
        var r = viewRow(row);
        var all = readList(KEYS.views);
        all.push(r);
        writeList(KEYS.views, all);
        return Promise.resolve(r);
      },
      clear: function () {
        writeList(KEYS.feedback, []);
        return Promise.resolve();
      }
    };

    var api = local;
    api.mode = "local";
    api.team = cfg.team;
    api.getWho = function () {
      try { return storage.getItem(KEYS.who) || ""; } catch (e) { return ""; }
    };
    api.setWho = function (w) {
      try { storage.setItem(KEYS.who, String(w || "")); } catch (e) { /* ignore */ }
    };
    return api;
  }

  return {
    KEYS: KEYS, DECISIONS: DECISIONS, REASONS: REASONS, UNSIGNED: UNSIGNED,
    FEEDBACK_FIELDS: FEEDBACK_FIELDS, VIEW_FIELDS: VIEW_FIELDS, EXPORT_FIELDS: EXPORT_FIELDS,
    deriveDecisions: deriveDecisions, currentDecisions: currentDecisions,
    exportList: exportList, exportJSON: exportJSON, migrateFavorites: migrateFavorites,
    cleanConfig: cleanConfig, createStore: createStore, uuid: uuid
  };
});
