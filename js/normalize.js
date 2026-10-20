/*
 * 资料加载层：把每日 JSON 统一成 DATA.md 定版格式，并提供筛选 / 排序的纯函数。
 * 浏览器里挂到 window.BIHData；Node（测试）里用 require。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BIHData = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var STATUS_ORDER = { NEW: 0, RISING: 1, WATCH: 2, KEEP: 3 };
  // 旧样本把 status 写在 tags 里，有中文写法
  var STATUS_ALIASES = {
    NEW: "NEW", "新": "NEW", "新增": "NEW",
    RISING: "RISING", "上升": "RISING",
    WATCH: "WATCH", "观察": "WATCH",
    KEEP: "KEEP", "保留": "KEEP"
  };
  var REGIONS = ["cn", "my", "global"];
  var TRENDS_PREFIX = /^\s*[^:：]*\bTrends\s*[:：]\s*/i;
  var INTEREST_RE = /interest\s+(\d+(?:\.\d+)?)\s*\(\s*(up|down|flat)\s*\)/i;
  var MARKETING_SPLIT = /\s*\|\s*(钩子|合规)\s*[:：]\s*/;
  var IDEA_SPLIT = /\s*\|\s*idea\s*[:：]\s*/i;
  var YT_HOST = /^(?:www\.|m\.|music\.)?(?:youtube\.com|youtube-nocookie\.com)$/i;
  var YT_ID = /^[A-Za-z0-9_-]{11}$/;

  // YouTube 链接 → 11 位影片 ID；不是 YouTube 或拿不到 ID 就回 ""
  function youtubeId(url) {
    var m = String(url || "").trim().match(/^https?:\/\/([^\/?#]+)([^?#]*)(\?[^#]*)?/i);
    if (!m) return "";
    var host = m[1].toLowerCase(), path = m[2] || "", query = m[3] || "";
    var id = "";
    if (host === "youtu.be" || host === "www.youtu.be") {
      id = path.split("/")[1] || "";
    } else if (YT_HOST.test(host)) {
      var seg = path.split("/");
      if (seg[1] === "watch") {
        var v = query.match(/[?&]v=([^&]+)/);
        id = v ? v[1] : "";
      } else if (["shorts", "embed", "live", "v"].indexOf(seg[1]) >= 0) {
        id = seg[2] || "";
      }
    }
    return YT_ID.test(id) ? id : "";
  }

  function youtubeThumb(url) {
    var id = youtubeId(url);
    return id ? "https://i.ytimg.com/vi/" + id + "/hqdefault.jpg" : "";
  }

  function has(o, k) {
    return Object.prototype.hasOwnProperty.call(o, k) && o[k] !== undefined && o[k] !== null;
  }

  function slug(s) {
    return String(s == null ? "" : s)
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "");
  }

  // 旧 product 的 tags 第一项是数组（分类）；统一拍平成字符串数组
  function flattenTags(tags) {
    var out = [];
    var nested = null;
    if (!Array.isArray(tags)) return { tags: out, nested: nested };
    tags.forEach(function (t) {
      if (Array.isArray(t)) {
        if (!nested) nested = [];
        t.forEach(function (x) {
          if (x != null && x !== "") {
            nested.push(String(x));
            out.push(String(x));
          }
        });
      } else if (t != null && t !== "") {
        out.push(String(t));
      }
    });
    return { tags: out, nested: nested };
  }

  // 数字或数字字符串 → 数字；空字符串 / 转不了 → null
  function toNum(x) {
    if (typeof x === "number") return isFinite(x) ? x : null;
    if (typeof x === "string" && x.trim() !== "") {
      var n = Number(x.trim());
      return isFinite(n) ? n : null;
    }
    return null;
  }

  // o[k] 是字符串数字就转成数字，转不了就拿掉（o 是自己的拷贝）
  function numField(o, k) {
    if (!has(o, k) || typeof o[k] === "number" && isFinite(o[k])) return;
    var n = toNum(o[k]);
    if (n === null) delete o[k];
    else o[k] = n;
  }

  // 「google_trends」「Google Trends」「google-trends」都认：不分大小写，去空格 / 下划线 / 连字符
  function sourceKey(src) {
    return String(src || "").toLowerCase().replace(/[\s_\-]+/g, "");
  }
  function isTrendsSource(src) {
    return sourceKey(src).indexOf("trends") >= 0;
  }

  // Trends 来源的关键字至少有一个名次 / 热度信号：rank / prev_rank / interest 字段、非空 history、「X Trends:」标题、「interest N (up)」
  function hasRankSignal(it) {
    return toNum(it.rank) !== null || toNum(it.prev_rank) !== null || toNum(it.interest) !== null ||
      (Array.isArray(it.history) && it.history.length > 0) ||
      (typeof it.title === "string" && TRENDS_PREFIX.test(it.title)) ||
      (typeof it.summary === "string" && INTEREST_RE.test(it.summary));
  }

  // 没写 kind 的旧条目：营销 → angle；产品区里 Trends 来源 → keyword（没名次信号的需求分析说明 → note）；其他 → product
  function inferKind(it) {
    if (it.section === "marketing") return "angle";
    if (it.section === "product") {
      if (!isTrendsSource(it.source)) return "product";
      return hasRankSignal(it) ? "keyword" : "note";
    }
    return "";
  }

  function splitMarketingSummary(text) {
    var parts = String(text).split(MARKETING_SPLIT);
    var out = { summary: parts[0].trim(), hook: null, compliance: null };
    for (var i = 1; i + 1 < parts.length; i += 2) {
      var val = parts[i + 1].trim();
      if (parts[i] === "钩子") out.hook = val;
      else if (parts[i] === "合规") out.compliance = val;
    }
    return out;
  }

  /**
   * 单条 normalize。ctx 跨条目共享（关键字名次按文件内顺序、分 region 计）。
   * 新格式条目原样返回内容（浅拷贝）。
   */
  function normalize(item, ctx) {
    ctx = ctx || { rank: {} };
    if (!ctx.rank) ctx.rank = {};
    var it = Object.assign({}, item);

    var flat = flattenTags(it.tags);
    var tagsChanged = !Array.isArray(it.tags) || flat.nested !== null ||
      flat.tags.length !== it.tags.length;
    var tags = flat.tags;

    var kind = has(it, "kind") ? it.kind : inferKind(it);
    it.kind = kind;

    // brand
    var derived = {};
    if (!has(it, "brand") || it.brand === "") {
      var hasOT = tags.indexOf("OT") >= 0;
      var hasFF = tags.indexOf("FF") >= 0;
      if (hasOT && hasFF) it.brand = "BOTH";
      else if (hasOT) it.brand = "OT";
      else if (hasFF) it.brand = "FF";
      else if (it.section === "product") it.brand = "FF";
      else it.brand = "";
      if (hasOT) derived.OT = true;
      if (hasFF) derived.FF = true;
    }

    if (kind === "angle") {
      if (!has(it, "status")) {
        for (var i = 0; i < tags.length; i++) {
          if (STATUS_ALIASES[tags[i]]) {
            it.status = STATUS_ALIASES[tags[i]];
            derived[tags[i]] = true;
            break;
          }
        }
        if (!has(it, "status")) it.status = "";
      } else if (STATUS_ALIASES[String(it.status).toUpperCase()]) {
        it.status = STATUS_ALIASES[String(it.status).toUpperCase()];
      }
      if (typeof it.summary === "string" && MARKETING_SPLIT.test(it.summary)) {
        var sp = splitMarketingSummary(it.summary);
        it.summary = sp.summary;
        if (!has(it, "hook") && sp.hook !== null) it.hook = sp.hook;
        if (!has(it, "compliance") && sp.compliance !== null) it.compliance = sp.compliance;
      }
      if (!has(it, "hook")) it.hook = "";
      if (!has(it, "compliance")) it.compliance = "";
      // 没封面但是 YouTube 链接：用影片 ID 拼 i.ytimg.com 封面
      if (!has(it, "thumb") || it.thumb === "") {
        var yt = youtubeThumb(it.url);
        if (yt) it.thumb = yt;
      }
      numField(it, "views");
    } else if (kind === "keyword") {
      if (typeof it.title === "string" && TRENDS_PREFIX.test(it.title)) {
        it.title = it.title.replace(TRENDS_PREFIX, "").trim();
      }
      if (!has(it, "region")) {
        var reg = "global";
        for (var r = 0; r < REGIONS.length; r++) {
          if (tags.indexOf(REGIONS[r]) >= 0) { reg = REGIONS[r]; break; }
        }
        it.region = reg;
      }
      var m = typeof it.summary === "string" ? it.summary.match(INTEREST_RE) : null;
      if (m) {
        if (!has(it, "interest")) it.interest = Number(m[1]);
        if (!has(it, "trend")) it.trend = m[2].toLowerCase();
        // 旧 summary 只有「relative interest 92 (up)」，拆完就没别的内容了
        if (it.summary.replace(/relative/i, "").replace(INTEREST_RE, "").trim() === "") it.summary = "";
      }
      if (!has(it, "trend")) it.trend = "flat";
      // 字符串名次 / 热度 → 数字，转不了就省略（rank 省略后照旧按文件顺序补）
      numField(it, "rank");
      numField(it, "prev_rank");
      numField(it, "interest");
      ctx.rank[it.region] = (ctx.rank[it.region] || 0) + 1;
      if (!has(it, "rank")) it.rank = ctx.rank[it.region];
    } else if (kind === "product") {
      if (typeof it.summary === "string" && IDEA_SPLIT.test(it.summary)) {
        var ps = it.summary.split(IDEA_SPLIT);
        it.summary = ps[0].trim();
        if (!has(it, "idea")) it.idea = ps.slice(1).join(" ").trim();
      }
      if (!has(it, "platform") && it.source) it.platform = it.source;
      if (!has(it, "category") && flat.nested) it.category = flat.nested;
      // 旧样本把 Grok 的 demo 产品标在 tags 里（"sample"）
      if (!has(it, "sample") && tags.indexOf("sample") >= 0) it.sample = true;
      numField(it, "priceMYR");
    }

    // v3 可选字段：格式不对就拿掉，页面当作「Grok 还没提供」
    if (has(it, "history") && !Array.isArray(it.history)) delete it.history;
    // history 里的字符串名次 / 热度 → 数字（转不了就省略）；有要改的才拷贝，不动传入的对象
    if (Array.isArray(it.history) && it.history.some(function (h) {
      return h && ((has(h, "rank") && typeof h.rank !== "number") || (has(h, "interest") && typeof h.interest !== "number"));
    })) {
      it.history = it.history.map(function (h) {
        if (!h || typeof h !== "object") return h;
        var c = Object.assign({}, h);
        numField(c, "rank");
        numField(c, "interest");
        return c;
      });
    }
    if (has(it, "need_keys") && !Array.isArray(it.need_keys)) {
      if (typeof it.need_keys === "string" && it.need_keys) it.need_keys = [it.need_keys];
      else delete it.need_keys;
    }

    // 从 tags 推出来的品牌 / status 记号，已经变成字段，就从 tags 拿掉
    if (Object.keys(derived).length) {
      tags = tags.filter(function (t) { return !derived[t]; });
      tagsChanged = true;
    }
    if (tagsChanged) it.tags = tags;

    if (!has(it, "id") || it.id === "") it.id = slug((it.section || "") + "-" + (it.title || ""));
    if (!has(it, "title")) it.title = "";
    if (!has(it, "summary")) it.summary = "";
    if (!has(it, "url")) it.url = "";
    if (!has(it, "source")) it.source = "";
    return it;
  }

  function normalizeItems(items) {
    var ctx = { rank: {} };
    var seen = {};
    return (Array.isArray(items) ? items : []).map(function (raw) {
      var it = normalize(raw, ctx);
      // 当天 id 撞了（旧样本 slug 可能重复）就加后缀，保证唯一
      var base = it.id, n = 1;
      while (seen[it.id]) it.id = base + "-" + (++n);
      seen[it.id] = true;
      return it;
    });
  }

  function normalizeFile(json, fallbackDate) {
    var src = Array.isArray(json) ? { items: json } : (json || {});
    return {
      date: src.date || fallbackDate || "",
      built_at_local: src.built_at_local || "",
      note_from_ai: typeof src.note_from_ai === "string" ? src.note_from_ai.trim() : "",
      items: normalizeItems(src.items)
    };
  }

  // ---------- 筛选 / 排序（全页共用） ----------

  function matchBrand(brand, filter) {
    if (!filter || filter === "ALL") return true;
    return brand === filter || brand === "BOTH";
  }

  // 字符串 / 数组 / {OT: "...", FF: "..."} 都拍成一段文字（搜索用）
  function textOf(v) {
    if (v == null) return "";
    if (typeof v === "string" || typeof v === "number") return String(v);
    if (Array.isArray(v)) return v.map(textOf).join(" ");
    if (typeof v === "object") return Object.keys(v).map(function (k) { return textOf(v[k]); }).join(" ");
    return "";
  }

  function matchQuery(it, q) {
    q = String(q || "").trim().toLowerCase();
    if (!q) return true;
    var hay = [
      it.title, it.summary, it.hook, it.need, it.why, it.trend_element, it.idea,
      textOf(it.hooks), textOf(it.tags), textOf(it.pattern), textOf(it.apply)
    ].join(" ").toLowerCase();
    return q.split(/\s+/).every(function (w) { return hay.indexOf(w) >= 0; });
  }

  function filterItems(items, brand, q) {
    return items.filter(function (it) { return matchBrand(it.brand, brand) && matchQuery(it, q); });
  }

  function statusRank(s) {
    return has(STATUS_ORDER, s) ? STATUS_ORDER[s] : 9;
  }

  function sortAngles(list) {
    return list
      .map(function (it, i) { return { it: it, i: i }; })
      .sort(function (a, b) {
        var d = statusRank(a.it.status) - statusRank(b.it.status);
        if (d) return d;
        var va = typeof a.it.views === "number" ? a.it.views : -1;
        var vb = typeof b.it.views === "number" ? b.it.views : -1;
        if (vb !== va) return vb - va;
        return a.i - b.i;
      })
      .map(function (x) { return x.it; });
  }

  // 按 region 分组，没条目的 region 不出现
  function groupKeywords(list) {
    var order = REGIONS.slice();
    list.forEach(function (it) { if (order.indexOf(it.region) < 0) order.push(it.region); });
    return order
      .map(function (reg) {
        var rows = list
          .filter(function (it) { return it.region === reg; })
          .sort(function (a, b) { return (a.rank || 0) - (b.rank || 0); });
        return { region: reg, items: rows };
      })
      .filter(function (g) { return g.items.length > 0; });
  }

  // 较昨天：正数 = 名次上升
  function rankDelta(it) {
    var pr = toNum(it.prev_rank), r = toNum(it.rank);
    if (pr === null || r === null) return null;
    return pr - r;
  }

  return {
    STATUS_ORDER: STATUS_ORDER,
    slug: slug,
    toNum: toNum,
    isTrendsSource: isTrendsSource,
    youtubeId: youtubeId,
    youtubeThumb: youtubeThumb,
    normalize: normalize,
    normalizeItems: normalizeItems,
    normalizeFile: normalizeFile,
    matchBrand: matchBrand,
    matchQuery: matchQuery,
    textOf: textOf,
    filterItems: filterItems,
    sortAngles: sortAngles,
    groupKeywords: groupKeywords,
    rankDelta: rankDelta
  };
});
