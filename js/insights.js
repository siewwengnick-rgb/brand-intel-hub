/*
 * 新品决策页要的计算（纯函数，可测）：
 * - 关键字 7 天走势（从历史文件算，或用条目自带的 history）
 * - 「今天变了什么」：新进榜 / 升最快 / 连续上升 / 掉最多
 * - 关键字 ↔ 产品匹配
 * 浏览器里挂到 window.BIHInsights；Node（测试）里用 require。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BIHInsights = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var WINDOW_DAYS = 7;

  function norm(s) {
    return String(s == null ? "" : s).trim().toLowerCase();
  }

  // 同一个关键字跨天对得上：region + 关键字本身
  function keywordKey(it) {
    return norm(it.region || "global") + "|" + norm(it.title);
  }

  // "2026-10-19" 往前 n 天
  function addDays(date, n) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ""));
    if (!m) return "";
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + n));
    return d.toISOString().slice(0, 10);
  }

  // 以 today 结尾的 7 天里，manifest 有的日期（新的在前）
  function windowDates(today, dates) {
    var from = addDays(today, -(WINDOW_DAYS - 1));
    return (dates || []).filter(function (d) { return d <= today && d >= from; })
      .sort().reverse();
  }

  // 数字或数字字符串（Grok 有时写 "3"）→ 数字；空字符串 / 转不了 → null
  function num(x) {
    if (typeof x === "number") return isFinite(x) ? x : null;
    if (typeof x === "string" && x.trim() !== "") {
      var n = Number(x.trim());
      return isFinite(n) ? n : null;
    }
    return null;
  }

  /**
   * days: { "YYYY-MM-DD": [normalized items] }（读不到的日期不放）
   * 回传 { key: [{date, rank, interest}]（旧→新） }，只含 today 往前 7 天。
   * 条目自带 history 的，以它为准（同一天两边都有时用 history 的）。
   */
  function buildHistory(days, today) {
    var from = addDays(today, -(WINDOW_DAYS - 1));
    var map = {};
    function put(key, p) {
      if (!p || !p.date || p.date > today || p.date < from) return;
      var byDate = map[key] || (map[key] = {});
      if (!byDate[p.date] || p.fromHistory) byDate[p.date] = p;
    }
    Object.keys(days || {}).forEach(function (date) {
      (days[date] || []).forEach(function (it) {
        if (it.kind !== "keyword") return;
        var key = keywordKey(it);
        put(key, { date: date, rank: num(it.rank), interest: num(it.interest) });
        if (date === today && Array.isArray(it.history)) {
          it.history.forEach(function (h) {
            if (h && typeof h.date === "string") {
              put(key, { date: h.date, rank: num(h.rank), interest: num(h.interest), fromHistory: true });
            }
          });
        }
      });
    });
    var out = {};
    Object.keys(map).forEach(function (key) {
      out[key] = Object.keys(map[key]).sort().map(function (d) {
        var p = map[key][d];
        return { date: p.date, rank: p.rank, interest: p.interest };
      });
    });
    return out;
  }

  // 今天以前最近的一个点
  function prevPoint(series, today) {
    var prev = null;
    (series || []).forEach(function (p) { if (p.date < today) prev = p; });
    return prev;
  }

  // 真正的昨天（today 前一天）那个点；昨天没资料就是 null（断档不拿更早的日子顶）
  function yesterdayPoint(series, today) {
    var y = addDays(today, -1);
    var hit = null;
    (series || []).forEach(function (p) { if (p.date === y) hit = p; });
    return hit;
  }

  // 较昨天：正数 = 名次上升。prev_rank 字段（Grok 给的前一天名次）优先，没有就看历史里昨天那个点
  function rankDelta(it, series, today) {
    var r = num(it.rank);
    if (r === null) return null;
    var pr = num(it.prev_rank);
    if (pr === null) {
      var p = yesterdayPoint(series, today);
      pr = p ? p.rank : null;
    }
    return pr === null ? null : pr - r;
  }

  // 一步算「上升」：名次变好，或名次一样但热度变高
  function rose(a, b) {
    if (a.rank !== null && b.rank !== null && b.rank !== a.rank) return b.rank < a.rank;
    return a.interest !== null && b.interest !== null && b.interest > a.interest;
  }

  // 到 today 为止连续上升几天（今天要有点；日期要一天接一天，中间断一天就停在那里）
  function upStreak(series, today) {
    var s = (series || []).filter(function (p) { return p.date <= today; });
    if (!s.length || s[s.length - 1].date !== today) return 0;
    var n = 0;
    for (var i = s.length - 1; i > 0; i--) {
      if (s[i - 1].date !== addDays(s[i].date, -1)) break;
      if (rose(s[i - 1], s[i])) n++;
      else break;
    }
    return n;
  }

  // 有 interest 就画 interest，不然画名次（反过来，名次小在上）
  function sparkValues(series) {
    var s = series || [];
    if (s.length < 2) return null;
    if (s.every(function (p) { return p.interest !== null; })) return s.map(function (p) { return p.interest; });
    if (s.every(function (p) { return p.rank !== null; })) return s.map(function (p) { return -p.rank; });
    return null;
  }

  /**
   * 「今天变了什么」。keywords = 今天的 keyword 条目，hist = buildHistory 的结果。
   * 每格没资料就是 null（页面隐藏那一格）。
   */
  function changeSummary(keywords, hist, today) {
    var baseline = false;
    var rows = (keywords || []).map(function (it) {
      var series = hist[keywordKey(it)] || [];
      var prev = prevPoint(series, today);
      if (prev || num(it.prev_rank) !== null) baseline = true;
      return { it: it, series: series, delta: rankDelta(it, series, today), hasPrev: !!prev || num(it.prev_rank) !== null };
    });
    // 只要有任何一天的比较基准（前一天的文件 / prev_rank / history），没前一名次的就算新进榜
    Object.keys(hist || {}).forEach(function (k) {
      if (hist[k].some(function (p) { return p.date < today; })) baseline = true;
    });
    var out = { newCount: null, topRise: null, streak: null, topDrop: null };
    if (!rows.length) return out;
    if (baseline) {
      var n = rows.filter(function (r) { return !r.hasPrev; }).length;
      out.newCount = n > 0 ? n : null;
    }
    rows.forEach(function (r) {
      if (r.delta !== null && r.delta > 0 && (!out.topRise || r.delta > out.topRise.delta)) {
        out.topRise = { title: r.it.title, region: r.it.region, delta: r.delta };
      }
      if (r.delta !== null && r.delta < 0 && (!out.topDrop || r.delta < -out.topDrop.delta)) {
        out.topDrop = { title: r.it.title, region: r.it.region, delta: -r.delta };
      }
      var days = upStreak(r.series, today);
      if (days >= 3 && (!out.streak || days > out.streak.days ||
        (days === out.streak.days && (num(r.it.interest) || 0) > (num(out.streak.interest) || 0)))) {
        out.streak = { title: r.it.title, region: r.it.region, days: days, interest: r.it.interest };
      }
    });
    return out;
  }

  /**
   * 满足这个关键字的产品。
   * 1) 产品的 need_keys / related_keywords / tags 里有这个关键字 → how = "exact"
   * 2) 都没有：名称 / 摘要 / 分类里含这个关键字 → how = "loose"
   */
  function matchProducts(keyword, products) {
    var k = norm(keyword && keyword.title !== undefined ? keyword.title : keyword);
    if (!k) return { items: [], how: "none" };
    function inList(arr) {
      return Array.isArray(arr) && arr.some(function (x) { return norm(x) === k; });
    }
    var exact = (products || []).filter(function (p) {
      return inList(p.need_keys) || inList(p.related_keywords) || inList(p.tags);
    });
    if (exact.length) return { items: exact, how: "exact" };
    var loose = (products || []).filter(function (p) {
      var hay = [p.title, p.summary, p.idea, Array.isArray(p.category) ? p.category.join(" ") : ""].join(" ").toLowerCase();
      return hay.indexOf(k) >= 0;
    });
    return loose.length ? { items: loose, how: "loose" } : { items: [], how: "none" };
  }

  // ---------- 简报：3 个关键 point ----------

  function plain(v) {
    if (v == null) return "";
    if (typeof v === "string" || typeof v === "number") return String(v);
    if (Array.isArray(v)) return v.map(plain).filter(Boolean).join(" ");
    if (typeof v === "object") {
      if (v.hook || v.text || v.how) return [v.hook || v.text, v.how].filter(Boolean).map(String).join(" ");
      return Object.keys(v).map(function (k) { return plain(v[k]); }).filter(Boolean).join(" ");
    }
    return "";
  }

  // 第一句（到 。！？；或换行为止，标点留着）
  function firstSentence(v) {
    var t = plain(v).trim();
    if (!t) return "";
    var first = t.split(/\r?\n/)[0];
    var m = first.match(/^.*?[。！？!?；;]/);
    return (m ? m[0] : first).trim();
  }

  /**
   * 简报最上面的 3 张小卡。key_points 有就用（最多 3 个，{head, body} 或字符串）；
   * 没有就从 why / pattern / apply 各取第一句（缺的再用 summary / hook 顶）。
   * 回传 { points: [{head, body}], from: "key_points" | "fallback" }，body 空 = Grok 还没提供
   */
  function briefPoints(it) {
    var kp = Array.isArray(it.key_points) ? it.key_points : [];
    var pts = kp.map(function (p) {
      if (typeof p === "string") return { head: p.trim(), body: "" };
      if (p && typeof p === "object") return { head: String(p.head || p.title || "").trim(), body: String(p.body || p.text || "").trim() };
      return null;
    }).filter(function (p) { return p && (p.head || p.body); }).slice(0, 3);
    if (pts.length) return { points: pts, from: "key_points" };
    return {
      points: [
        { head: "为什么火", body: firstSentence(it.why) || firstSentence(it.summary) },
        { head: "怎么拍", body: firstSentence(it.pattern) || (it.hook ? "钩子：" + it.hook : "") },
        { head: "怎么用到我们", body: firstSentence(it.apply) }
      ],
      from: "fallback"
    };
  }

  // ---------- v5：今日总览 / 历史 ----------

  /**
   * 一天的数量（历史页一行、今日总览 KPI 用）。
   * decisions = store.deriveDecisions(feedback) 的结果（键 "id|date"），跳过也算已决定。
   * viewed = 那天 views 里、还在那天文件中的条目（去重）。
   */
  function dayStats(items, decisions, views, date) {
    var out = { total: 0, briefs: 0, keywords: 0, products: 0, decided: 0, viewed: 0 };
    var ids = {};
    (items || []).forEach(function (it) {
      // 只算能决定的三种；note（需求分析说明）等不算条数
      if (!it || (it.kind !== "angle" && it.kind !== "keyword" && it.kind !== "product")) return;
      out.total++;
      if (it.kind === "angle") out.briefs++;
      else if (it.kind === "keyword") out.keywords++;
      else out.products++;
      ids[it.id] = true;
      var d = decisions && decisions[it.id + "|" + date];
      if (d && Object.keys(d).length) out.decided++;
    });
    var seen = {};
    (views || []).forEach(function (v) {
      if (v && v.date === date && ids[v.item_id]) seen[v.item_id] = true;
    });
    out.viewed = Object.keys(seen).length;
    return out;
  }

  // 需求榜前 n 个（跨 region）：热度高的在前，热度一样看名次
  function topKeywords(list, n) {
    return (list || [])
      .map(function (it, i) { return { it: it, i: i }; })
      .sort(function (a, b) {
        var ia = num(a.it.interest), ib = num(b.it.interest);
        if (ia !== ib) return (ib === null ? -Infinity : ib) - (ia === null ? -Infinity : ia);
        var ra = num(a.it.rank), rb = num(b.it.rank);
        if (ra !== rb) return (ra === null ? Infinity : ra) - (rb === null ? Infinity : rb);
        return a.i - b.i;
      })
      .slice(0, n)
      .map(function (x) { return x.it; });
  }

  return {
    WINDOW_DAYS: WINDOW_DAYS,
    dayStats: dayStats,
    topKeywords: topKeywords,
    firstSentence: firstSentence,
    briefPoints: briefPoints,
    keywordKey: keywordKey,
    addDays: addDays,
    windowDates: windowDates,
    buildHistory: buildHistory,
    prevPoint: prevPoint,
    yesterdayPoint: yesterdayPoint,
    num: num,
    rankDelta: rankDelta,
    upStreak: upStreak,
    sparkValues: sparkValues,
    changeSummary: changeSummary,
    matchProducts: matchProducts
  };
});
