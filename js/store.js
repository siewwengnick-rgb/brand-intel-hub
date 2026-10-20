/*
 * 反馈存法（v4，只用 localStorage；Nick 2026-10-20：先不用 Supabase）。
 *   键 brand-intel-feedback / brand-intel-views / brand-intel-who
 * 只追加、不改：
 *   feedback {id, item_id, date, section, kind, brand, title, url, decision, reason, note, who, created_at}
 *     decision: new_product | ad_keyword | shoot | skip；取消某个决定 = 追加一行 cancel_<决定>
 *   views {id, item_id, date, who, seconds, created_at}
 *     打开简报追加一行（seconds 为空），关掉再追加一行（seconds = 看了几秒）
 * 某条现在的决定 = 按时间把 feedback 一行行套上去算出来（deriveDecisions）。
 * 存储坏了的规矩（Codex 复审退回 2026-10-21）：
 *   拿不到 localStorage（Safari 隐私模式 getter 抛错等）→ pickStorage 退成内存存储，页面顶部提示；
 *   某个键读出来是坏的 / 读的时候抛错 → 那个键标 readFailed，之后不准写（回失败），免得用空数组盖掉旧记录；
 *   所有写操作回真实成败（失败 = Promise reject / setWho 回 false），不报假成功。
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
  var EXPORT_VIEW_FIELDS = ["id", "date", "who", "seconds"];
  var PROBE_KEY = "brand-intel-probe";

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

  /**
   * views 行 → 导出用的 [{id, date, who, seconds}]，一次打开一行。
   * 打开时记一行（seconds 空）、关掉再记一行（seconds = 几秒）：按时间配对成一行；
   * 没配到关掉的 seconds = null（没正常关掉）。新的日期在前。
   */
  function exportViews(views) {
    var out = [];
    var open = {};
    (Array.isArray(views) ? views : []).filter(function (v) {
      return v && typeof v.item_id === "string" && v.item_id && typeof v.date === "string" && v.date;
    }).slice().sort(byTime).forEach(function (v) {
      var who = v.who || UNSIGNED;
      var k = v.item_id + "|" + v.date + "|" + who;
      var sec = typeof v.seconds === "number" && isFinite(v.seconds) ? v.seconds : null;
      if (sec === null) {
        var row = { id: v.item_id, date: v.date, who: who, seconds: null, t: String(v.created_at || "") };
        out.push(row);
        (open[k] || (open[k] = [])).push(row);
      } else if (open[k] && open[k].length) {
        open[k].pop().seconds = sec;
      } else {
        out.push({ id: v.item_id, date: v.date, who: who, seconds: sec, t: String(v.created_at || "") });
      }
    });
    return out.sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return a.t.localeCompare(b.t);
    }).map(function (r) { return pick(r, EXPORT_VIEW_FIELDS); });
  }

  // decisions.json = {"decisions": [...], "views": [...]}（DATA.md「反馈怎么回到 Grok」）
  function exportJSON(rows, views) {
    return JSON.stringify({ decisions: exportList(rows), views: exportViews(views) }, null, 2) + "\n";
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

  // 存在内存里（拿不到 localStorage 时用；关掉页面就没了）
  function memoryStorage() {
    var m = {};
    return {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
      setItem: function (k, v) { m[k] = String(v); },
      removeItem: function (k) { delete m[k]; }
    };
  }

  /**
   * getter = function () { return window.localStorage; }（读 window.localStorage 本身就可能抛错，所以传函数）
   * 回传 { storage, persistent }：
   *   拿不到 / 读不了 → 内存存储，persistent = false
   *   读得了但写不进（旧 Safari 隐私模式）→ 没旧记录就用内存；有旧记录就照用（看得到旧决定，写会回失败），persistent = false
   */
  function pickStorage(getter) {
    var s = null;
    try {
      s = getter();
      if (!s || typeof s.getItem !== "function" || typeof s.setItem !== "function") throw new Error("no storage");
      s.getItem(KEYS.feedback);
    } catch (e) {
      return { storage: memoryStorage(), persistent: false };
    }
    try {
      s.setItem(PROBE_KEY, "1");
      if (typeof s.removeItem === "function") s.removeItem(PROBE_KEY);
      return { storage: s, persistent: true };
    } catch (e2) {
      var hasOld = false;
      try { hasOld = s.getItem(KEYS.feedback) !== null || s.getItem(KEYS.views) !== null; } catch (e3) { hasOld = false; }
      return { storage: hasOld ? s : memoryStorage(), persistent: false };
    }
  }

  function storeError(code, msg) {
    var e = new Error(msg);
    e.code = code;
    return e;
  }

  /**
   * opts: { config, storage, now, persistent }
   * 接口（回 Promise）：
   *   init()            → 第一次用：旧收藏迁过来（只一次）
   *   listFeedback()    → 全部 feedback（读坏了 → reject，code = "read_failed"）
   *   addFeedback(row)  → 回传存好的那行（补 id / created_at / who）；读坏了 / 写不进 → reject
   *   listViews(date)   → 那天的 views；不给 date → 全部
   *   addView(row)      → 同 addFeedback
   *   clear()           → 清空 feedback；读坏了 / 写不进 → reject
   * 同步：health() → { persistent, readFailed: { feedback, views } }；getWho()；setWho(w) → true / false
   */
  function createStore(opts) {
    opts = opts || {};
    var cfg = cleanConfig(opts.config);
    var storage = opts.storage || memoryStorage();
    var persistent = opts.storage ? opts.persistent !== false : false;
    var now = opts.now || function () { return new Date().toISOString(); };
    var readFailed = { feedback: false, views: false };
    var NAME = { feedback: KEYS.feedback, views: KEYS.views };

    // 回 { ok, list }：键不存在 = ok + 空；抛错 / 不是 JSON 数组 = 读坏了（标 readFailed）
    function readList(name) {
      var raw;
      try { raw = storage.getItem(NAME[name]); } catch (e) { readFailed[name] = true; return { ok: false, list: [] }; }
      if (raw === null || raw === undefined) { readFailed[name] = false; return { ok: true, list: [] }; }
      var list = parse(raw);
      readFailed[name] = !list;
      return list ? { ok: true, list: list } : { ok: false, list: [] };
    }
    function writeList(name, list) {
      try { storage.setItem(NAME[name], JSON.stringify(list)); return true; } catch (e) { return false; }
    }
    // 先读（读坏了就不写，免得用空数组盖掉旧记录）→ 改 → 写
    function update(name, fn) {
      var cur = readList(name);
      if (!cur.ok) return Promise.reject(storeError("read_failed", "旧记录读不出来，不写"));
      return writeList(name, fn(cur.list)) ? Promise.resolve() : Promise.reject(storeError("write_failed", "存不进去"));
    }
    function list(name) {
      var cur = readList(name);
      return cur.ok ? Promise.resolve(cur.list) : Promise.reject(storeError("read_failed", "旧记录读不出来"));
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
        // 第一次（新键还不存在）：旧收藏迁过来，只迁一次，旧键不删。写不进就下次再迁（旧键还在）
        try {
          if (storage.getItem(KEYS.feedback) === null) {
            writeList("feedback", migrateFavorites(parse(storage.getItem(KEYS.oldFavorites))));
          }
        } catch (e) { /* 读不了：listFeedback 会报 */ }
        return Promise.resolve();
      },
      listFeedback: function () {
        return list("feedback").then(function (rows) { return rows.filter(validFeedback); });
      },
      addFeedback: function (row) {
        var r = feedbackRow(row);
        return update("feedback", function (all) { return all.concat([r]); }).then(function () { return r; });
      },
      listViews: function (date) {
        return list("views").then(function (rows) {
          return rows.filter(function (v) { return v && (date === undefined || v.date === date); });
        });
      },
      addView: function (row) {
        var r = viewRow(row);
        return update("views", function (all) { return all.concat([r]); }).then(function () { return r; });
      },
      clear: function () {
        return update("feedback", function () { return []; });
      }
    };

    var api = local;
    api.mode = "local";
    api.team = cfg.team;
    api.persistent = persistent;
    api.health = function () {
      return { persistent: persistent, readFailed: { feedback: readFailed.feedback, views: readFailed.views } };
    };
    api.getWho = function () {
      try { return storage.getItem(KEYS.who) || ""; } catch (e) { return ""; }
    };
    api.setWho = function (w) {
      try { storage.setItem(KEYS.who, String(w || "")); return true; } catch (e) { return false; }
    };
    return api;
  }

  return {
    KEYS: KEYS, DECISIONS: DECISIONS, REASONS: REASONS, UNSIGNED: UNSIGNED,
    FEEDBACK_FIELDS: FEEDBACK_FIELDS, VIEW_FIELDS: VIEW_FIELDS, EXPORT_FIELDS: EXPORT_FIELDS,
    EXPORT_VIEW_FIELDS: EXPORT_VIEW_FIELDS,
    deriveDecisions: deriveDecisions, currentDecisions: currentDecisions,
    exportList: exportList, exportViews: exportViews, exportJSON: exportJSON, migrateFavorites: migrateFavorites,
    cleanConfig: cleanConfig, createStore: createStore, uuid: uuid,
    memoryStorage: memoryStorage, pickStorage: pickStorage
  };
});
