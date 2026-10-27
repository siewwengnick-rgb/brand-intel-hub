/* 品牌情报台 v5：左栏模块 + hash 路由；内容沿用 v3 + v4（新品决策 / 拍摄简报 / 待办 + 反馈回路）。集运嵌 live shipment-tracker，不复制货柜资料。纯静态，无框架 */
(function () {
  "use strict";

  var D = window.BIHData;
  var I = window.BIHInsights;
  var S = window.BIHStore;
  var R = window.BIHRouter;
  // window.localStorage 本身可能抛错（Safari 隐私模式等）：pickStorage 包在 try 里，拿不到就用内存
  var picked = S.pickStorage(function () { return window.localStorage; });
  var store = S.createStore({ config: window.BRAND_INTEL_CONFIG, storage: picked.storage, persistent: picked.persistent });

  var state = {
    dates: [],
    date: "",
    items: [],
    note: "",       // 当天文件的 note_from_ai
    missing: false,
    error: "",
    hist: {},
    brand: "ALL",
    q: "",
    span: "week",       // week = 最近 7 个有资料的日期；day = 日期选择器那一天
    platform: "ALL",    // 拍摄简报平台筛选，来自资料里的 source
    showCn: false,      // 中国抖音周销关键字，默认收起
    showOther: false,   // 其他地区关键字，默认收起
    showNoImg: false,   // 没有产品图的条目，默认收起
    viewsByDate: {},
    route: "today",
    booted: false,  // manifest 读完
    ready: false,   // 第一天读完（之前显示「读取中…」）
    scrollKw: "",   // 到新品决策页后滚到这个关键字
    manifest: {},
    histPage: { ready: false, loading: false, views: {} }, // 历史页：每天的 views
    open: {},       // 展开的关键字 id
    fresh: {},      // 这次打开页面才决定的（id|date）：留在原位变淡；之前决定的折到底部
    feedback: [],   // 全部 feedback 行
    dec: {},        // deriveDecisions(feedback)
    views: [],      // 当天 views
    syncError: "",  // 存不进去时的提示
    pending: null,  // 正在选原因：{id, date, decision, reason, note, where}
    confirmClear: false,
    sheet: null     // {id, date}
  };
  var cache = {}; // date -> {items, missing, note}

  var $ = function (id) { return document.getElementById(id); };
  var main = $("main");
  var nav = $("side-nav");
  var sheetEl = $("sheet");
  var panel = sheetEl.querySelector(".panel");

  var REGION_LABEL = { cn: "中国", my: "马来西亚", global: "全球" };
  var SECTION_LABEL = { marketing: "营销", product: "产品" };
  var DECISION_LABEL = { new_product: "出新品", ad_keyword: "投广告", shoot: "安排拍", skip: "跳过" };
  var MISSING = "Grok 还没提供";

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function safeUrl(u) {
    return /^https?:\/\//i.test(String(u || "")) ? String(u) : "";
  }

  function fmtViews(n) {
    if (typeof n !== "number") return "";
    if (n >= 1e8) return trim1(n / 1e8) + "亿";
    if (n >= 1e4) return trim1(n / 1e4) + "万";
    return String(Math.round(n));
  }
  function trim1(x) { return x.toFixed(1).replace(/\.0$/, ""); }

  function fmtPrice(p) {
    return typeof p === "number" ? "RM " + p.toFixed(2) : "";
  }

  // 「Instagram Reels」「YouTube 长视频」→ 占位块上的平台名
  function platformName(src) {
    var s = String(src || "");
    if (/instagram/i.test(s)) return "Instagram";
    if (/tiktok/i.test(s)) return "TikTok";
    if (/youtube/i.test(s)) return "YouTube";
    return s;
  }

  function brandCls(b) { return b ? "b-" + String(b).toLowerCase() : ""; }

  function brandPill(b) {
    if (!b) return "";
    return '<span class="pill ' + esc(brandCls(b)) + '">' + (b === "BOTH" ? "OT+FF" : esc(b)) + "</span>";
  }

  function statusTag(s) {
    return '<span class="st st-' + esc(String(s || "").toLowerCase()) + '">' + esc(s || "") + "</span>";
  }

  function line(msg) { return '<p class="msg">' + esc(msg) + "</p>"; }
  function miss() { return '<span class="miss">' + MISSING + "</span>"; }

  function tagList(arr) {
    return '<div class="tags">' + arr.map(function (t) { return "<em>" + esc(t) + "</em>"; }).join("") + "</div>";
  }

  // 封面：占位块垫底，图片盖在上面；图片坏了就拿掉（见下面 error 监听），不留破图
  function coverInner(img, brand, label) {
    var u = safeUrl(img);
    return '<div class="ph ' + esc(brandCls(brand)) + '"><span>' + esc(label) + "</span></div>" +
      (u ? '<img src="' + esc(u) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">' : "");
  }

  function hitBtn(id, date, title) {
    return '<button type="button" class="hit" data-open="' + esc(id) + '" data-date="' + esc(date) +
      '" aria-label="' + esc(title) + '"></button>';
  }

  function key(id, date) { return id + "|" + date; }

  function who() { return store.getWho() || S.UNSIGNED; }

  // 底部一行小提示，几秒后自己消失
  var toastTimer = 0;
  function toast(msg) {
    var el = $("toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "toast";
      el.className = "toast";
      el.setAttribute("role", "status");
      el.setAttribute("aria-live", "polite");
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 3500);
  }

  // 页面顶部的存储提示（存不了 / 旧记录读不出来）
  function storageWarnings() {
    var h = store.health();
    var out = [];
    if (!h.persistent) out.push("这个浏览器存不了记录，决定不会保留");
    if (h.readFailed.feedback) out.push("这台机上的旧决定读不出来，先不存新的，免得盖掉");
    if (h.readFailed.views) out.push("看过记录读不出来，先不记「已看」");
    return out;
  }

  // ---------- 决定（由 feedback 算出来） ----------

  function decOf(id, date) { return state.dec[key(id, date)] || {}; }
  function hasDec(id, date, d) { return !!decOf(id, date)[d]; }
  function decided(id, date) { return Object.keys(decOf(id, date)).length > 0; }

  // 之前就决定过（不是这次打开才按的）→ 折到底部
  function folded(id, date) {
    return decided(id, date) && !state.fresh[key(id, date)];
  }

  function decBtn(id, date, decision, where, cls) {
    var on = hasDec(id, date, decision);
    var p = state.pending;
    var picking = p && p.id === id && p.date === date && p.decision === decision && p.where === where;
    return '<button type="button" class="dec d-' + decision + (on ? " on" : "") + (picking ? " picking" : "") + (cls ? " " + cls : "") +
      '" data-dec="' + decision + '" data-id="' + esc(id) + '" data-date="' + esc(date) + '" data-where="' + where +
      '" aria-pressed="' + on + '">' + (on ? "✓ " : "") + DECISION_LABEL[decision] + "</button>";
  }

  function decBtns(id, date, list, where, cls) {
    return '<div class="acts">' + list.map(function (d) { return decBtn(id, date, d, where, cls); }).join("") + "</div>";
  }

  // 按下决定后弹出来的那一行：原因 chip + 一句话 + Confirm / Cancel
  function reasonRow(id, date, where) {
    var p = state.pending;
    if (!p || p.id !== id || p.date !== date || p.where !== where) return "";
    return '<div class="reason" role="group" aria-label="选原因">' +
      '<div class="r-head">' + esc(DECISION_LABEL[p.decision]) + " · 为什么？<small>（" + esc(who()) + "）</small></div>" +
      '<div class="r-chips">' + S.REASONS.map(function (r) {
        return '<button type="button" class="rchip' + (p.reason === r ? " on" : "") + '" data-reason="' + esc(r) + '" aria-pressed="' + (p.reason === r) + '">' + esc(r) + "</button>";
      }).join("") + "</div>" +
      '<div class="r-foot"><input type="text" class="r-note" maxlength="500" placeholder="一句话（可选）" value="' + esc(p.note) + '">' +
      '<button type="button" class="btn ok" data-reason-act="confirm"' + (p.reason ? "" : " disabled") + ">Confirm</button>" +
      '<button type="button" class="btn" data-reason-act="cancel">Cancel</button></div>' +
      "</div>";
  }

  // ---------- 资料 ----------

  function fetchJSON(url) {
    return fetch(url, { cache: "no-cache" }).then(function (r) {
      if (!r.ok) {
        var e = new Error("HTTP " + r.status);
        e.status = r.status;
        throw e;
      }
      return r.json();
    });
  }

  // 只把某天读进 cache，不切换页面日期
  function fetchDay(date) {
    if (cache[date]) return Promise.resolve(cache[date]);
    return fetchJSON("data/" + date + ".json")
      .then(function (json) {
        var f = D.normalizeFile(json, date);
        cache[date] = { items: f.items, missing: false, note: f.note_from_ai };
      })
      .catch(function () {
        // 404 / 坏 JSON 都当成这天没有资料
        cache[date] = { items: [], missing: true, note: "" };
      })
      .then(function () { return cache[date]; });
  }

  function loadFeedback() {
    return store.listFeedback().then(function (rows) {
      state.feedback = rows;
      state.dec = S.deriveDecisions(rows);
    }, function () {
      // 读坏了：页面照常用，顶部提示（storageWarnings），store 不会再写这个键
      state.feedback = [];
      state.dec = {};
    });
  }

  function loadViews(date) {
    return store.listViews(date).then(function (rows) {
      if (state.date === date) state.views = rows;
    }).catch(function () { /* 看过数读不到就当 0 */ });
  }

  // 读当天 + 往前 7 天里 manifest 有的日期（算走势、今天变了什么）
  function loadDay(date) {
    state.date = date;
    state.open = {};
    state.pending = null;
    state.views = [];
    hideSheet();
    var win = I.windowDates(date, state.dates);
    var recent = I.recentDates(date, state.dates, I.WINDOW_DAYS);
    var need = {};
    win.concat(recent).concat([date]).forEach(function (d) { if (d) need[d] = true; });
    var list = Object.keys(need);
    return Promise.all(list.map(fetchDay).concat(list.map(function (d) {
      return store.listViews(d).then(function (rows) {
        state.viewsByDate[d] = rows || [];
        if (state.date === date && d === date) state.views = rows || [];
      }).catch(function () {
        if (!state.viewsByDate[d]) state.viewsByDate[d] = [];
      });
    }))).then(function () {
      if (state.date !== date) return;
      var days = {};
      win.forEach(function (d) { if (cache[d] && !cache[d].missing) days[d] = cache[d].items; });
      var day = cache[date] || { items: [], missing: true, note: "" };
      state.items = day.items || [];
      state.note = day.note || "";
      state.missing = !!(day.missing || state.items.length === 0);
      state.hist = I.buildHistory(days, date);
      state.ready = true;
      render();
    });
  }

  function findItem(id, date) {
    var day = cache[date];
    if (!day) return null;
    for (var i = 0; i < day.items.length; i++) if (day.items[i].id === id) return day.items[i];
    return null;
  }

  // 那天资料读不到时，用最后一行 feedback 当作这条的资料
  function findRecord(id, date) {
    var r = null;
    state.feedback.forEach(function (x) { if (x.item_id === id && x.date === date) r = x; });
    return r && { id: r.item_id, section: r.section, kind: r.kind, brand: r.brand, title: r.title, url: r.url, date: r.date };
  }

  // ---------- 列表 ----------

  function filtered(kind) {
    return D.filterItems(state.items.filter(function (it) { return it.kind === kind; }), state.brand, state.q);
  }

  function shownDecisions() {
    return S.currentDecisions(state.feedback).filter(function (r) {
      return r.decision !== "skip" && D.matchBrand(r.brand, state.brand) && D.matchQuery({ title: r.title }, state.q);
    });
  }

  // 近7天 = 截止日期往前数，manifest 里最近 7 个有资料的日期（新的在前）
  function scopeDates() {
    if (!state.date) return [];
    if (state.span === "day") return [state.date];
    var list = I.recentDates(state.date, state.dates, I.WINDOW_DAYS);
    if (list.indexOf(state.date) < 0) list.unshift(state.date);
    return list;
  }

  function itemDate(it) { return (it && it._date) || state.date; }

  // useFilter=false：左栏数字不跟品牌/搜索走
  function collect(kind, useFilter) {
    var out = [];
    scopeDates().forEach(function (d) {
      var day = cache[d];
      if (!day || day.missing) return;
      day.items.forEach(function (it) {
        if (!it || it.kind !== kind) return;
        if (useFilter && (!D.matchBrand(it.brand, state.brand) || !D.matchQuery(it, state.q))) return;
        out.push(Object.assign({}, it, { _date: d }));
      });
    });
    return I.dedupeNewest(out);
  }

  function keywordsOn(date) {
    var day = cache[date];
    if (!day || !day.items) return [];
    return day.items.filter(function (it) { return it.kind === "keyword"; });
  }

  function seenOn(id, date) {
    var rows = state.viewsByDate[date] || [];
    for (var i = 0; i < rows.length; i++) if (rows[i] && rows[i].item_id === id) return true;
    return false;
  }

  // 左栏红数字 = 当前时间范围里还没决定的产品 / 简报。关键字不算（关键字榜不是主入口）
  function pendingCounts() {
    var c = { products: 0, briefs: 0 };
    if (!state.ready) return c;
    collect("product", false).forEach(function (it) {
      if (!I.hasImage(it)) return;
      if (!decided(it.id, itemDate(it))) c.products++;
    });
    collect("angle", false).forEach(function (it) {
      if (!decided(it.id, itemDate(it))) c.briefs++;
    });
    return c;
  }

  function latest() {
    var m = state.manifest || {};
    return m.latest && state.dates.indexOf(m.latest) >= 0 ? m.latest : (state.dates[0] || "");
  }

  // hash 里的日期：最新一天不写
  function dateParam(date) {
    return date && date !== latest() ? date : "";
  }

  var PAGE = {
    today: { sub: "先看有图的产品，再看这几天各平台的拍摄简报。关键字榜收在最下面。", filters: "all" },
    products: { sub: "有图的产品在最上面。马来西亚 Google Trends 上升关键字单独一块：数字是近 7 日同组相对兴趣（0–100），不是搜索量。中国抖音周销关键字默认收起。", filters: "all" },
    briefs: { sub: "默认近 7 个有资料的日期。YouTube 和 Instagram 放在一起，用平台筛选，不必一天一天翻。", filters: "all" },
    todo: { sub: "按过「出新品 / 投广告 / 安排拍」的，全部日期。", filters: "nodate" },
    history: { sub: "每天抓了多少、决定了多少、看了多少。点一行看那天的总览。", filters: "none" },
    data: { sub: "Grok 推送、反馈导出、团队名单。", filters: "none" },
    shipment: { sub: "货柜和空运直接开在这一页。照片、明细都在下面；资料仍在 Shipment Tracker，情报台不另存一份。", filters: "none" }
  };

  // 左栏（只建一次）
  (function buildNav() {
    var group = "";
    nav.innerHTML = R.ROUTES.map(function (r) {
      var head = "";
      if (r.group !== group) { group = r.group; head = '<div class="side-sec">' + esc(group) + "</div>"; }
      return head + '<a class="side-item" href="' + R.href(r.id) + '" data-route="' + r.id + '">' +
        '<span class="ic" aria-hidden="true">' + r.icon + '</span><span class="tx">' + esc(r.label) + "</span>" +
        '<b class="side-badge" hidden></b></a>';
    }).join("");
  })();

  var shownRoute = "";

  function renderShell() {
    var r = R.find(state.route) || R.find(R.DEFAULT);
    var pc = pendingCounts();
    var dp = dateParam(state.date);
    Array.prototype.forEach.call(nav.querySelectorAll("[data-route]"), function (a) {
      var id = a.getAttribute("data-route");
      var on = id === state.route;
      a.classList.toggle("on", on);
      if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
      a.setAttribute("href", R.href(id, dp));
      var badge = a.querySelector(".side-badge");
      var n = pc[id] || 0;
      badge.hidden = !n;
      badge.textContent = n ? String(n) : "";
      badge.setAttribute("aria-label", n ? n + " 条待决定" : "");
    });
    // 手机横向菜单条：换页后把选中的那项滚进来
    if (state.route !== shownRoute) {
      shownRoute = state.route;
      var on = nav.querySelector(".side-item.on");
      var side = nav.parentNode;
      if (on && window.matchMedia("(max-width: 760px)").matches) {
        side.scrollLeft += on.getBoundingClientRect().left - side.getBoundingClientRect().left - 70;
      }
    }
    document.title = r.label + " · 品牌情报台";
    $("pg-title").textContent = r.label;
    var scope = scopeDates();
    var weekOn = state.span !== "day" && (state.route === "today" || state.route === "products" || state.route === "briefs");
    var chip = state.route === "shipment" ? "" :
      state.route === "todo" ? "全部日期" :
      state.route === "history" ? (state.dates.length ? state.dates.length + " 天" : "") :
        weekOn && scope.length > 1 ? (scope[scope.length - 1] + " – " + scope[0] + " · " + scope.length + " 天") :
          state.date ? R.dateLabel(state.date) : "";
    $("pg-date").textContent = chip;
    $("pg-date").hidden = !chip;
    $("pg-sub").textContent = PAGE[r.id].sub;
    var f = PAGE[r.id].filters;
    $("filters").hidden = f === "none";
    $("f-date").hidden = f !== "all";

    var sel = $("date");
    var idx = state.dates.indexOf(state.date);
    sel.value = state.date;
    $("prev").disabled = idx < 0 || idx >= state.dates.length - 1;
    $("next").disabled = idx <= 0;
    Array.prototype.forEach.call(document.querySelectorAll("#brand .chip"), function (b) {
      var on = b.getAttribute("data-brand") === state.brand;
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", on);
    });
    var showSpan = state.route === "today" || state.route === "products" || state.route === "briefs";
    var spanEl = $("span");
    spanEl.hidden = !showSpan;
    Array.prototype.forEach.call(spanEl.querySelectorAll("[data-span]"), function (b) {
      var on = b.getAttribute("data-span") === (state.span === "day" ? "day" : "week");
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", on);
    });
    var plats = $("plats");
    var showPlats = state.route === "briefs" && state.ready;
    plats.hidden = !showPlats;
    if (showPlats) {
      var names = [];
      collect("angle", true).forEach(function (it) {
        var p = platformOf(it);
        if (names.indexOf(p) < 0) names.push(p);
      });
      names.sort(function (a, b) {
        function rank(p) { return p === "YouTube" ? 0 : p === "Instagram" ? 1 : 2; }
        return rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0);
      });
      if (state.platform !== "ALL" && names.indexOf(state.platform) < 0) state.platform = "ALL";
      plats.innerHTML = '<button type="button" class="chip' + (state.platform === "ALL" ? " on" : "") +
        '" data-plat="ALL" aria-pressed="' + (state.platform === "ALL") + '">全部平台</button>' +
        names.map(function (p) {
          var on = state.platform === p;
          return '<button type="button" class="chip' + (on ? " on" : "") + '" data-plat="' + esc(p) +
            '" aria-pressed="' + on + '">' + esc(p) + "</button>";
        }).join("");
    }
  }

  function platformOf(it) {
    return platformName(it && it.source) || "其他";
  }

  // 页面最上面：AI 的话 + 团队今天看了几条
  function topStrip() {
    var html = "";
    if (state.note) html += '<div class="ai-note"><b>AI</b><span>' + esc(state.note) + "</span></div>";
    if (state.span !== "day" || !state.missing) {
      var angles = state.ready ? collect("angle", false) : state.items.filter(function (it) { return it.kind === "angle"; });
      var n = angles.filter(function (it) { return seenOn(it.id, itemDate(it)); }).length;
      var word = state.span === "day" ? "团队今天看了" : "这台机看过";
      html += '<div class="team-bar"><span>' + word + ' <b>' + n + "</b> / " + angles.length + " 条简报</span>" +
        '<span class="sync">记录只存在这台机</span>' +
        (state.syncError ? '<span class="warn">' + esc(state.syncError) + "</span>" : "") + "</div>";
    }
    return html;
  }

  // ===== 页 1 新品决策 =====

  // 今天变了什么：每格可点 → 新品决策里展开那个关键字
  function changeStrip(kws, titled) {
    var s = I.changeSummary(kws, state.hist, state.date);
    var idOf = function (x) {
      for (var i = 0; i < kws.length; i++) if (kws[i].title === x.title && kws[i].region === x.region) return kws[i].id;
      return "";
    };
    var cells = [];
    if (s.newCount) cells.push(["新进榜", "<b>" + s.newCount + "</b> 个", ""]);
    if (s.topRise) cells.push(["升最快", esc(s.topRise.title) + ' <b class="up">▲' + s.topRise.delta + "</b>", idOf(s.topRise)]);
    if (s.streak) cells.push(["连续上升", esc(s.streak.title) + " <b>" + s.streak.days + " 天</b>", idOf(s.streak)]);
    if (s.topDrop) cells.push(["掉最多", esc(s.topDrop.title) + ' <b class="down">▼' + s.topDrop.delta + "</b>", idOf(s.topDrop)]);
    if (!cells.length) return '<p class="note">' + (titled ? "" : "今天变了什么：") + "要有前几天的资料才算，现在只有这一天。</p>";
    var href = R.href("products", dateParam(state.date));
    return '<div class="changes">' + cells.map(function (c) {
      return '<a class="chg" href="' + href + '"' + (c[2] ? ' data-goto-kw="' + esc(c[2]) + '"' : "") + "><i>" + c[0] + "</i><span>" + c[1] + "</span></a>";
    }).join("") + "</div>";
  }

  function sparkline(series) {
    var v = I.sparkValues(series);
    if (!v) return "";
    var W = 72, H = 22, P = 2;
    var min = Math.min.apply(null, v), max = Math.max.apply(null, v);
    var span = max - min || 1;
    var pts = v.map(function (y, i) {
      var x = P + (W - 2 * P) * (i / (v.length - 1));
      var yy = H - P - (H - 2 * P) * (max === min ? 0.5 : (y - min) / span);
      return [Math.round(x * 10) / 10, Math.round(yy * 10) / 10];
    });
    var last = pts[pts.length - 1];
    var cls = v[v.length - 1] > v[0] ? "up" : v[v.length - 1] < v[0] ? "down" : "flat";
    return '<svg class="spark ' + cls + '" viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H + '" aria-label="' + v.length + ' 天走势">' +
      '<polyline points="' + pts.map(function (p) { return p.join(","); }).join(" ") + '"/>' +
      '<circle cx="' + last[0] + '" cy="' + last[1] + '" r="2.2"/></svg>';
  }

  function deltaHtml(d) {
    if (d === null) return "";
    if (d > 0) return '<span class="up">▲' + d + "</span>";
    if (d < 0) return '<span class="down">▼' + (-d) + "</span>";
    return '<span class="flat">=</span>';
  }

  function metricHtml(m) {
    return '<div class="metric"><b>' + esc(m.value) + "</b><span>" + esc(m.label) + "</span>" +
      (m.note ? "<small>" + esc(m.note) + "</small>" : "") + "</div>";
  }

  // 马来西亚 Google Trends（region my）。蝉妈妈 / 淘宝即使误标 my 也不算进来。
  function isMyGoogleTrends(it) {
    if (!it || String(it.region || "").toLowerCase() !== "my") return false;
    var meta = I.indexMeta(it);
    if (meta.family === "douyin_week" || meta.family === "taobao") return false;
    return meta.family === "gtrends" || D.isTrendsSource(it.source);
  }

  // 数字是 interest（同组相对兴趣）。没有指数就不显示数字，也不编一个搜索量。
  function myTrendsLabel(meta) {
    if (!meta || meta.value === null) {
      return "Google Trends 相对兴趣 · 近7日同组 · 没有可比指数 · 不是搜索量";
    }
    return "Google Trends 相对兴趣 · 近7日同组内 0–100 · 不是搜索量";
  }

  function keywordMetricHtml(it) {
    var meta = I.indexMeta(it);
    var series = state.hist[I.keywordKey(it)] || [];
    var spark = sparkline(series);
    var delta = deltaHtml(I.rankDelta(it, series, state.date));
    var extra = "";
    if (delta || spark) {
      extra = "<small>" + (delta ? "名次较昨天 " + delta + (spark ? " · " : "") : "") + (spark ? "近几天走势 " + spark : "") + "</small>";
    }
    var label = isMyGoogleTrends(it) ? myTrendsLabel(meta) : meta.label;
    var numHtml = meta.value === null ? "" : "<b>" + esc(meta.value) + "</b>";
    return '<div class="metric kw-metric">' + numHtml + "<span>" + esc(label) + "</span>" + extra + "</div>";
  }

  function keywordRow(it, prods) {
    var d = state.date;
    var open = !!state.open[it.id];
    var html = '<li class="kw-item' + (decided(it.id, d) ? " decided" : "") + (open ? " open" : "") + '" data-row="' + esc(it.id) + '">' +
      '<div class="kw-row">' +
      '<span class="rk' + (typeof it.rank === "number" && it.rank <= 3 ? " hi" : "") + '">' + esc(it.rank) + "</span>" +
      '<button type="button" class="kw-t" data-expand="' + esc(it.id) + '" aria-expanded="' + open + '">' +
      "<span>" + esc(it.title) + "</span>" +
      (isMyGoogleTrends(it) && it.trend === "up" ? '<em class="rise">上升</em>' : "") +
      '<i aria-hidden="true">' + (open ? "▾" : "▸") + "</i></button>" +
      keywordMetricHtml(it) +
      '<span class="need">' + (it.need ? esc(it.need) : miss()) + "</span>" +
      decBtns(it.id, d, ["new_product", "ad_keyword", "skip"], "main") +
      "</div>" +
      reasonRow(it.id, d, "main");
    if (open) {
      var m = I.matchProducts(it, prods);
      var head = m.how === "exact" ? "满足这个需求的产品" :
        m.how === "loose" ? "名称相近的产品（" + MISSING + " need_keys）" :
          "还没有挂到这个需求的产品（" + MISSING + " need_keys）";
      html += '<div class="kw-more">' +
        "<h4>" + esc(head) + (m.items.length ? " <small>" + m.items.length + "</small>" : "") + "</h4>" +
        (m.items.length ? '<div class="mini-grid">' + m.items.map(miniProduct).join("") + "</div>" : "") +
        "</div>";
    }
    return html + "</li>";
  }

  function keywordBlock(g, prods) {
    return '<section class="kw-block"><h3>' + esc(REGION_LABEL[g.region] || g.region) + " <small>" + g.items.length + "</small></h3>" +
      '<ol class="kw">' + g.items.map(function (it) { return keywordRow(it, prods); }).join("") + "</ol></section>";
  }

  function productCover(it) {
    return '<div class="cover r43">' + coverInner(it.image, it.brand, it.platform || it.source) +
      '<div class="tl">' + brandPill(it.brand) + (it.platform ? '<span class="pill">' + esc(it.platform) + "</span>" : "") + "</div>" +
      (it.sample ? '<span class="sample">示例</span>' : "") +
      "</div>";
  }

  // 产品卡：图、短标题、品牌、一个写清含义的数字
  function productCard(it) {
    var d = itemDate(it);
    var m = I.productMetric(it, keywordsOn(d));
    return '<article class="card' + (decided(it.id, d) ? " decided" : "") + '">' +
      productCover(it) +
      '<div class="body">' +
      '<h3 class="t">' + esc(it.title) + "</h3>" +
      '<div class="src">' + esc(d) + (it.platform ? " · " + esc(it.platform) : "") + "</div>" +
      metricHtml(m) +
      '<div class="sum one">' + esc(it.summary) + "</div>" +
      "</div>" +
      hitBtn(it.id, d, it.title) +
      decBtns(it.id, d, ["new_product", "skip"], "main") +
      reasonRow(it.id, d, "main") +
      "</article>";
  }

  // 关键字展开里的产品小卡：多 idea 一行 +「看源站 ↗」
  function miniProduct(it) {
    var d = state.date;
    var u = safeUrl(it.url);
    return '<article class="card mini">' +
      productCover(it) +
      '<div class="body">' +
      '<h3 class="t">' + esc(it.title) + "</h3>" +
      '<div class="price">' + esc(fmtPrice(it.priceMYR)) + "</div>" +
      '<div class="sum one">' + esc(it.summary) + "</div>" +
      '<div class="idea one">' + (it.idea ? esc(it.idea) : miss()) + "</div>" +
      "</div>" +
      hitBtn(it.id, d, it.title) +
      (u ? '<a class="src-link" href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">看源站 ↗</a>' : "") +
      "</article>";
  }

  function foldedBlock(n, inner) {
    if (!n) return "";
    return '<details class="folded"><summary>已决定 ' + n + " 条</summary>" + inner + "</details>";
  }

  function splitFold(list) {
    return {
      act: list.filter(function (it) { return !folded(it.id, itemDate(it)); }),
      old: list.filter(function (it) { return folded(it.id, itemDate(it)); })
    };
  }

  function rangeLabel() {
    var n = scopeDates().length;
    return state.span === "day" ? "这一天" : "近 " + n + " 天";
  }

  // 全部平台时交错排，第一屏就能同时看到 Instagram 和 YouTube
  function mixByPlatform(list) {
    var groups = {};
    var order = [];
    list.forEach(function (it) {
      var p = platformOf(it);
      if (!groups[p]) { groups[p] = []; order.push(p); }
      groups[p].push(it);
    });
    order.sort(function (a, b) {
      function rank(p) { return p === "Instagram" ? 0 : p === "YouTube" ? 1 : 2; }
      return rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0);
    });
    order.forEach(function (p) { groups[p] = D.sortAngles(groups[p]); });
    var out = [];
    var i = 0;
    var guard = list.length + 2;
    while (out.length < list.length && guard--) {
      var added = false;
      for (var g = 0; g < order.length; g++) {
        var row = groups[order[g]][i];
        if (row) { out.push(row); added = true; }
      }
      if (!added) break;
      i++;
    }
    return out;
  }

  function kwToggle(flag, label, count, when) {
    var open = !!state[flag];
    return '<button type="button" class="bury" data-fold="' + flag + '" aria-expanded="' + open + '">' +
      "<i aria-hidden=\"true\">" + (open ? "▾" : "▸") + "</i><b>" + esc(label) + "</b><small>" + count + " 条 · " + esc(when || state.date) + " · 点开才看</small></button>";
  }

  function keywordListHtml(list) {
    var d = state.date;
    var allProds = state.items.filter(function (it) { return it.kind === "product"; });
    var act = list.filter(function (it) { return !folded(it.id, d); });
    var old = list.filter(function (it) { return folded(it.id, d); });
    var html = '<p class="note">每一行的数字下面写了它是什么、哪一段时间。没有折算指数的不显示数字，也不当成搜索量。</p>' + changeStrip(list);
    var groups = D.groupKeywords(act);
    html += groups.length ? '<div class="kwwrap">' + groups.map(function (g) { return keywordBlock(g, allProds); }).join("") + "</div>"
      : line("这些关键字都决定好了");
    if (old.length) {
      html += foldedBlock(old.length, '<div class="kwwrap">' + D.groupKeywords(old).map(function (g) { return keywordBlock(g, allProds); }).join("") + "</div>");
    }
    return html;
  }

  function myTrendsOf(kws) {
    return I.sortKeywordsRising((kws || []).filter(isMyGoogleTrends));
  }

  // 新品决策页单独一块，不收进「其他地区」。没有这天的马来西亚 Trends 也留着这块，写一句空状态。
  function renderMyTrends(list) {
    var sorted = myTrendsOf(list);
    var d = state.date;
    var allProds = state.items.filter(function (it) { return it.kind === "product"; });
    var act = sorted.filter(function (it) { return !folded(it.id, d); });
    var old = sorted.filter(function (it) { return folded(it.id, d); });
    var dayHas = !state.missing && state.items.some(isMyGoogleTrends);
    var html = '<section class="my-trends" id="my-trends" aria-label="马来西亚 Google Trends 上升关键字">';
    html += '<h2 class="sec">马来西亚 Google Trends 上升关键字 <small>' +
      esc(state.date || "") + " · region my · " + sorted.length + " 条</small></h2>";
    html += '<p class="note">数字是 Google Trends 相对兴趣（同组内 0–100，近 7 日），不是搜索量。上升的排在前面。</p>';
    if (!sorted.length) {
      html += '<p class="msg my-empty">' +
        (dayHas ? "没有符合当前筛选的马来西亚 Google Trends 关键字。" : "这天没有马来西亚 Google Trends 关键字。") +
        "</p></section>";
      return html;
    }
    html += changeStrip(sorted);
    html += act.length
      ? '<ol class="kw">' + act.map(function (it) { return keywordRow(it, allProds); }).join("") + "</ol>"
      : line("这些马来西亚关键字都决定好了");
    if (old.length) {
      html += foldedBlock(old.length, '<ol class="kw">' + old.map(function (it) { return keywordRow(it, allProds); }).join("") + "</ol>");
    }
    return html + "</section>";
  }

  // 关键字榜默认收起。中国区单独标成抖音周销。
  // omitMyTrends：新品决策页的马来西亚 Google Trends 已经在上面单独展开，这里不要再收进去。
  function renderKeywordFolds(kws, opts) {
    var omitMy = opts && opts.omitMyTrends;
    var cn = kws.filter(function (it) { return it.region === "cn"; });
    var other = kws.filter(function (it) {
      return it.region !== "cn" && !(omitMy && isMyGoogleTrends(it));
    });
    var html = kwToggle("showCn", "中国抖音周销关键字 · 蝉妈妈 · 约7天 · 榜首=100 · 不是搜索量 · 不是终身（淘宝月榜在行内另标）", cn.length);
    if (state.showCn) html += cn.length ? keywordListHtml(cn) : line("这天没有中国关键字");
    var otherLabel = omitMy
      ? "其他地区关键字 · 全球 / 美国等 · Google Trends 相对热度 · 不是搜索次数"
      : "其他地区关键字 · Google Trends 相对热度 · 不是搜索次数";
    html += kwToggle("showOther", otherLabel, other.length);
    if (state.showOther) html += other.length ? keywordListHtml(other) : line("这天没有其他地区关键字");
    return html;
  }

  function renderDecide() {
    var prods = collect("product", true);
    var kws = state.missing ? [] : filtered("keyword");
    var notes = state.missing ? [] : filtered("note");
    if (!prods.length && !kws.length && !notes.length) {
      var msg = state.span === "day" && state.missing ? line("这天没有资料") : line("没有符合筛选的内容");
      if (state.span === "day" && state.missing) return msg;
      return msg + renderMyTrends(kws);
    }
    var photos = splitFold(prods.filter(function (it) { return I.hasImage(it); }));
    var noimg = splitFold(prods.filter(function (it) { return !I.hasImage(it); }));
    var html = '<h2 class="sec">有图产品 <small>' + rangeLabel() + " · " + photos.act.length + " 张待看</small></h2>";
    html += photos.act.length ? '<div class="grid">' + photos.act.map(productCard).join("") + "</div>"
      : line(photos.old.length ? "这些有图产品都决定好了" : "这几天没有带图的产品");
    var noimgAll = noimg.act.concat(noimg.old);
    if (noimgAll.length) {
      html += kwToggle("showNoImg", "没有产品图的条目", noimgAll.length, rangeLabel());
      if (state.showNoImg) {
        html += noimg.act.length ? '<div class="grid">' + noimg.act.map(productCard).join("") + "</div>" : line("这些没图的产品都决定好了");
        if (noimg.old.length) html += foldedBlock(noimg.old.length, '<div class="grid">' + noimg.old.map(productCard).join("") + "</div>");
      }
    }
    html += renderMyTrends(kws);
    html += notes.map(function (it) {
      return '<p class="note kw-note"' + (it.summary ? ' title="' + esc(it.summary) + '"' : "") + ">" + esc(it.title || it.summary) + "</p>";
    }).join("");
    html += renderKeywordFolds(kws, { omitMyTrends: true });
    var old = photos.old;
    if (old.length) html += foldedBlock(old.length, '<div class="grid">' + old.map(productCard).join("") + "</div>");
    return html;
  }

  // ===== 页 2 拍摄简报 =====

  function angleCard(it) {
    var d = itemDate(it);
    var views = fmtViews(it.views);
    var dec = decOf(it.id, d);
    var badges = (dec.shoot ? '<span class="badge on">✓ 安排拍</span>' : dec.skip ? '<span class="badge">跳过</span>' : "") +
      (seenOn(it.id, d) ? '<span class="badge seen">已看 ✓</span>' : "");
    return '<article class="card' + (decided(it.id, d) ? " decided" : "") + '">' +
      '<div class="cover">' + coverInner(it.thumb, it.brand, platformOf(it)) +
      '<div class="tl">' + brandPill(it.brand) + statusTag(it.status) + "</div>" +
      (badges ? '<div class="tr-badges">' + badges + "</div>" : "") +
      (views ? '<span class="views">' + esc(views) + " 播放</span>" : "") +
      "</div>" +
      '<div class="body">' +
      '<h3 class="t">' + esc(it.title) + "</h3>" +
      '<div class="why two"><i>为什么推荐</i>' + (it.why ? esc(it.why) : miss()) + "</div>" +
      '<div class="src one">' + esc(d) + " · " + esc(platformOf(it)) + (it.trend_element ? " · " + esc(it.trend_element) : "") + "</div>" +
      "</div>" +
      hitBtn(it.id, d, it.title) +
      "</article>";
  }

  function renderBrief() {
    var all = collect("angle", true);
    if (!all.length) return state.span === "day" && state.missing ? line("这天没有资料") : line("没有符合筛选的内容");
    var list = state.platform === "ALL" ? all : all.filter(function (it) { return platformOf(it) === state.platform; });
    var shown = state.platform === "ALL" ? mixByPlatform(list) : D.sortAngles(list);
    var parts = splitFold(shown);
    var counts = {};
    all.forEach(function (it) {
      var p = platformOf(it);
      counts[p] = (counts[p] || 0) + 1;
    });
    var legend = Object.keys(counts).map(function (p) { return p + " " + counts[p]; }).join(" · ");
    var head = '<p class="note">' + esc(rangeLabel()) + " · " + esc(legend) + " · 封面用资料里的 thumb；YouTube 没给图时用影片封面。</p>";
    return head +
      (parts.act.length ? '<div class="grid">' + parts.act.map(angleCard).join("") + "</div>" : line("这些简报都决定好了")) +
      foldedBlock(parts.old.length, '<div class="grid">' + parts.old.map(angleCard).join("") + "</div>");
  }

  // ===== 今日总览（新页）=====

  function emptyBox(msg) { return '<div class="empty">' + esc(msg) + "</div>"; }

  function kpi(href, k, v, d, na) {
    return '<a class="kpi' + (na ? " na" : "") + '" href="' + href + '"><span class="k">' + esc(k) + "</span>" +
      '<b class="v">' + v + '</b><span class="d">' + esc(d) + "</span></a>";
  }

  function shipHomeLink() {
    return '<a class="ship-link" href="' + R.href("shipment", dateParam(state.date)) + '">' +
      '<span class="ic" aria-hidden="true">📦</span>' +
      '<span class="tx"><b>集运</b><small>货柜 / 空运追踪，不用另开书签</small></span>' +
      '<span class="go">打开 →</span></a>';
  }

  function renderToday() {
    var prods = collect("product", true).filter(function (it) { return I.hasImage(it); });
    var angles = collect("angle", true);
    var kws = state.missing ? [] : filtered("keyword");
    if (!prods.length && !angles.length && !kws.length && state.span === "day" && state.missing) {
      return shipHomeLink() + emptyBox("这天没有资料");
    }
    var openP = prods.filter(function (it) { return !decided(it.id, itemDate(it)); });
    var openA = angles.filter(function (it) { return !decided(it.id, itemDate(it)); });
    var nSeen = angles.filter(function (it) { return seenOn(it.id, itemDate(it)); }).length;
    var platCount = {};
    angles.forEach(function (it) {
      var p = platformOf(it);
      platCount[p] = (platCount[p] || 0) + 1;
    });
    var platText = Object.keys(platCount).map(function (p) { return p + " " + platCount[p]; }).join(" · ");
    var dp = dateParam(state.date);
    var html = state.note ? '<div class="ai-note"><b>AI</b><span>' + esc(state.note) + "</span></div>" : "";
    html += '<div class="kpis">' +
      kpi(R.href("products", dp), "待看产品", String(openP.length), rangeLabel() + " · 有图，还没按出新品 / 跳过") +
      kpi(R.href("briefs", dp), "待看简报", String(openA.length), rangeLabel() + " · 还没按安排拍 / 跳过") +
      kpi(R.href("briefs", dp), "这台机看过", nSeen + "<small> / " + angles.length + "</small>", "打开过的简报") +
      kpi(R.href("briefs", dp), "平台", String(Object.keys(platCount).length || "—"), platText || "这几天没有简报") +
      "</div>" + shipHomeLink();
    var wall = openP.slice(0, 8);
    html += '<div class="sec-head"><h2 class="sec">有图产品 <small>' + esc(rangeLabel()) + "</small></h2>" +
      '<a class="more" href="' + R.href("products", dp) + '">全部产品 →</a></div>' +
      (wall.length ? '<div class="grid">' + wall.map(productCard).join("") + "</div>" : emptyBox("这几天没有还没决定的带图产品"));
    var briefs = mixByPlatform(openA).slice(0, 8);
    html += '<div class="sec-head"><h2 class="sec">拍摄简报 <small>' + esc(rangeLabel()) + " · 各平台</small></h2>" +
      '<a class="more" href="' + R.href("briefs", dp) + '">全部简报 →</a></div>' +
      (briefs.length ? '<div class="grid">' + briefs.map(angleCard).join("") + "</div>" : emptyBox("没有符合筛选的简报"));
    html += renderKeywordFolds(kws);
    return html;
  }

  // ===== 待办（原「已决定」页）=====

  function renderTodo() {
    var shown = shownDecisions();
    var groups = [["new_product", "新品候选"], ["ad_keyword", "广告词"], ["shoot", "待拍清单"]];
    return '<div class="todo-groups">' + groups.map(function (g) {
      var rows = shown.filter(function (r) { return r.decision === g[0]; });
      return '<section class="done"><h2 class="sec">' + g[1] + " <small>" + rows.length + "</small></h2>" +
        (rows.length ? '<div class="tbl-wrap"><table class="tbl">' +
          "<thead><tr><th>日期</th><th>品牌</th><th>标题</th><th>谁决定</th><th>原因</th><th></th></tr></thead><tbody>" +
          rows.map(function (r) {
            return "<tr>" +
              '<td class="num muted">' + esc(r.date) + "</td>" +
              "<td>" + brandPill(r.brand) + "</td>" +
              '<td class="t-title"><button type="button" class="dtitle" data-open="' + esc(r.item_id) + '" data-date="' + esc(r.date) + '">' + esc(r.title) + "</button></td>" +
              "<td>" + esc(r.who || "") + "</td>" +
              "<td>" + esc(r.reason || "") + (r.note ? ' <small class="muted">' + esc(r.note) + "</small>" : "") + "</td>" +
              '<td class="t-act"><button type="button" class="btn ghost" data-undo="' + esc(r.decision) + '" data-id="' + esc(r.item_id) + '" data-date="' + esc(r.date) + '">取消</button></td>' +
              "</tr>";
          }).join("") + "</tbody></table></div>" : '<p class="empty">还没有</p>') +
        "</section>";
    }).join("") + "</div>";
  }

  // ===== 历史（新页）=====

  function loadHistory() {
    var hp = state.histPage;
    hp.loading = true;
    return Promise.all(state.dates.map(function (d) {
      return Promise.all([
        fetchDay(d),
        store.listViews(d).catch(function () { return []; })
      ]).then(function (r) { hp.views[d] = r[1]; });
    })).then(function () {
      hp.loading = false;
      hp.ready = true;
      if (state.route === "history") render();
    });
  }

  function renderHistory() {
    if (!state.dates.length) return emptyBox("还没有任何一天的资料");
    var hp = state.histPage;
    if (!hp.ready) {
      if (!hp.loading) loadHistory();
      return emptyBox("读取中…");
    }
    var rows = state.dates.map(function (d) {
      var day = cache[d];
      var href = R.href("today", dateParam(d));
      if (!day || day.missing) {
        return '<tr data-href="' + href + '" tabindex="0"><td class="num"><a href="' + href + '">' + esc(R.dateLabel(d)) + "</a></td>" +
          '<td colspan="5" class="muted">这天没有资料</td></tr>';
      }
      var st = I.dayStats(day.items, state.dec, hp.views[d], d);
      return '<tr data-href="' + href + '" tabindex="0"' + (d === state.date ? ' class="cur"' : "") + ">" +
        '<td class="num"><a href="' + href + '">' + esc(R.dateLabel(d)) + "</a></td>" +
        '<td class="num">' + st.briefs + "</td>" +
        '<td class="num">' + st.keywords + "</td>" +
        '<td class="num">' + st.products + "</td>" +
        '<td class="num">' + st.decided + ' <small class="muted">/ ' + st.total + "</small></td>" +
        '<td class="num">' + st.viewed + ' <small class="muted">/ ' + st.briefs + "</small></td></tr>";
    }).join("");
    return '<div class="tbl-wrap"><table class="tbl click">' +
      "<thead><tr><th>日期</th><th>简报</th><th>关键字</th><th>产品</th><th>已决定</th><th>看了</th></tr></thead>" +
      "<tbody>" + rows + "</tbody></table></div>" +
      '<p class="note">已决定 = 按过任何决定（含跳过）/ 那天总条数；看了 = 打开过的简报 / 那天简报数（只算这台机）。</p>';
  }

  // ===== 资料与反馈（新页）=====

  function kvRow(k, v) { return '<div class="kvr"><b>' + esc(k) + "</b><span>" + v + "</span></div>"; }

  function renderData() {
    var m = state.manifest || {};
    var all = S.currentDecisions(state.feedback);
    var day = cache[state.date];
    var dayLine = "—";
    if (day && !day.missing) {
      var st = I.dayStats(day.items, {}, [], state.date);
      dayLine = "<b>" + st.total + "</b> 条（简报 " + st.briefs + " · 关键字 " + st.keywords + " · 产品 " + st.products + "）";
    } else if (state.date) {
      dayLine = '<span class="muted">这天没有资料</span>';
    }
    var grok = '<section class="panel-card"><h2 class="sec">Grok 推送</h2>' +
      kvRow("最后推送", m.updated_at_local ? esc(m.updated_at_local) : miss()) +
      kvRow("最新一天", esc(latest() || "—")) +
      kvRow(state.date ? state.date + " 文件" : "这天文件", dayLine) +
      kvRow("共有", state.dates.length + " 天资料") +
      "</section>";

    var fb;
    if (state.confirmClear) {
      fb = '<div class="favbar confirm"><span>清空这台机上全部 ' + state.feedback.length + " 条反馈记录（含跳过），不能恢复。</span>" +
        '<button type="button" class="btn danger" data-act="confirm">Confirm</button>' +
        '<button type="button" class="btn" data-act="cancel">Cancel</button></div>';
    } else {
      fb = '<div class="favbar"><span class="muted">这台机上现在有效的决定 <b>' + all.length + "</b> 条（含跳过）</span>" +
        '<button type="button" class="btn ok" data-act="export"' + (all.length ? "" : " disabled") + ">Export decisions.json</button>" +
        '<button type="button" class="btn" data-act="clear"' + (state.feedback.length ? "" : " disabled") + ">Clear</button></div>" +
        '<p class="note">下载后放回 repo 根目录，Grok 明天就会读。记录只存在这个浏览器里。</p>';
    }
    var feedback = '<section class="panel-card"><h2 class="sec">反馈</h2>' + fb + "</section>";

    var me = store.getWho();
    var team = '<section class="panel-card"><h2 class="sec">团队名单 <small>' + store.team.length + "</small></h2>" +
      '<div class="tags">' + store.team.map(function (n) {
        return "<em" + (n === me ? ' class="me"' : "") + ">" + esc(n) + (n === me ? " · 你" : "") + "</em>";
      }).join("") + "</div>" +
      '<p class="note">名单在 config.js 的 team 改；左栏下面选「你是谁」。</p></section>';

    return '<div class="data-grid">' + grok + feedback + team + "</div>";
  }

  function cssEsc(s) {
    return window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/["\\]/g, "\\$&");
  }

  // 集运：嵌 live Pages。已嵌上就别重画，免得筛选/存储刷新把 iframe 拆掉重载。
  function renderShipment() {
    var src = R.SHIPMENT_URL;
    return '<div class="ship-embed">' +
      '<div class="ship-bar"><span>货柜、包裹和照片都从 Shipment Tracker 读，这里不另存一份。</span>' +
      '<a href="' + esc(src) + '" target="_blank" rel="noopener noreferrer">打开完整集运页 ↗</a></div>' +
      '<div class="ship-stage">' +
      '<p class="ship-wait">正在打开集运追踪…</p>' +
      '<iframe class="ship-frame" title="集运追踪" src="' + esc(src) + '" referrerpolicy="no-referrer"></iframe>' +
      "</div></div>";
  }

  function mountShipment() {
    var frame = main.querySelector(".ship-frame");
    if (!frame || frame.getAttribute("data-bound")) return;
    frame.setAttribute("data-bound", "1");
    frame.addEventListener("load", function () {
      var w = main.querySelector(".ship-wait");
      if (w) w.hidden = true;
    });
  }

  function render() {
    renderShell();
    var r = state.route;
    document.body.classList.toggle("ship-on", r === "shipment");
    if (r === "shipment") {
      if (!main.querySelector(".ship-frame")) {
        main.innerHTML = renderShipment();
        mountShipment();
      }
      return;
    }
    var needsDay = r === "today" || r === "products" || r === "briefs" || r === "history";
    var top = storageWarnings().map(function (w) { return '<p class="note warn store-warn">' + esc(w) + "</p>"; }).join("") +
      (state.syncError ? '<p class="note warn">' + esc(state.syncError) + "</p>" : "");
    if (state.error && needsDay) { main.innerHTML = top + emptyBox(state.error); return; }
    if (!state.ready && needsDay) { main.innerHTML = top + emptyBox("读取中…"); return; }
    var body = r === "today" ? renderToday() :
      r === "products" ? topStrip() + renderDecide() :
        r === "briefs" ? topStrip() + renderBrief() :
          r === "todo" ? renderTodo() :
            r === "history" ? renderHistory() : renderData();
    main.innerHTML = top + body;
    if (state.scrollKw && r === "products") {
      var el = main.querySelector('[data-row="' + cssEsc(state.scrollKw) + '"]');
      state.scrollKw = "";
      if (el) el.scrollIntoView({ block: "center" });
    }
  }

  // ---------- 决定 / 原因 ----------

  function itemFor(id, date) {
    var it = findItem(id, date) || findRecord(id, date);
    if (!it) return null;
    return {
      item_id: it.id, date: date, section: it.section || "", kind: it.kind || "", brand: it.brand || "",
      title: it.title || "", url: it.url || ""
    };
  }

  function addFeedback(row) {
    var item = itemFor(row.item_id, row.date);
    if (!item) return Promise.resolve();
    var full = Object.assign(item, { decision: row.decision, reason: row.reason || "", note: row.note || "", who: who() });
    return store.addFeedback(full).then(function (saved) {
      state.fresh[key(full.item_id, full.date)] = true;
      state.feedback = state.feedback.concat([saved]);
      state.dec = S.deriveDecisions(state.feedback);
      state.syncError = "";
      rerender();
    }).catch(function (e) {
      // 没存进去：不改界面上的决定
      state.syncError = e && e.code === "read_failed" ? "旧决定读不出来，这一下没存（免得盖掉）" : "这一下没存进去，再按一次";
      toast(state.syncError);
      rerender();
    });
  }

  function rerender() {
    render();
    if (state.sheet) renderSheet();
  }

  // 按决定按钮：已经是这个决定 → 取消（不用原因）；不是 → 弹原因行
  function pressDecision(id, date, decision, where) {
    if (hasDec(id, date, decision)) {
      state.pending = null;
      addFeedback({ item_id: id, date: date, decision: "cancel_" + decision });
      return;
    }
    var p = state.pending;
    if (p && p.id === id && p.date === date && p.decision === decision && p.where === where) state.pending = null;
    else state.pending = { id: id, date: date, decision: decision, reason: "", note: "", where: where };
    rerender();
    focusReason();
  }

  function focusReason() {
    var box = (state.pending && state.pending.where === "sheet" ? sheetEl : main).querySelector(".reason .rchip");
    if (box) box.focus({ preventScroll: true });
  }

  function reasonClick(t) {
    var p = state.pending;
    if (!p) return;
    if (t.hasAttribute("data-reason")) {
      p.reason = t.getAttribute("data-reason");
      rerender();
      var b = (p.where === "sheet" ? sheetEl : main).querySelector('.reason [data-reason-act="confirm"]');
      if (b) b.focus({ preventScroll: true });
      return;
    }
    var act = t.getAttribute("data-reason-act");
    state.pending = null;
    if (act === "confirm" && p.reason) {
      addFeedback({ item_id: p.id, date: p.date, decision: p.decision, reason: p.reason, note: p.note.trim() });
    } else {
      rerender();
    }
  }

  function noteInput(e) {
    if (e.target.classList.contains("r-note") && state.pending) state.pending.note = e.target.value;
  }
  main.addEventListener("input", noteInput);
  sheetEl.addEventListener("input", noteInput);

  // ---------- 详情（桌面右侧抽屉 / 手机底部 sheet） ----------

  function sec(label, inner, cls) {
    return '<div class="d-sec' + (cls ? " " + cls : "") + '"><h4>' + esc(label) + "</h4>" + (inner || "<p>" + miss() + "</p>") + "</div>";
  }
  function para(s) { return s ? "<p>" + esc(s) + "</p>" : ""; }

  function bigLink(url, label, cls) {
    var u = safeUrl(url);
    return u
      ? '<a class="bigbtn' + (cls ? " " + cls : "") + '" href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + esc(label) + " ↗</a>"
      : '<span class="bigbtn off' + (cls ? " " + cls : "") + '">没有链接</span>';
  }

  // 字符串 / 数组 / {...} 都显示成段落
  function richText(v) {
    if (v == null || v === "") return "";
    if (typeof v === "string" || typeof v === "number") return "<p>" + esc(v) + "</p>";
    if (Array.isArray(v)) {
      var li = v.map(function (x) { return esc(D.textOf(x)); }).filter(Boolean);
      return li.length ? "<ul>" + li.map(function (x) { return "<li>" + x + "</li>"; }).join("") + "</ul>" : "";
    }
    if (typeof v === "object") {
      return Object.keys(v).filter(function (k) { return v[k] != null && v[k] !== ""; }).map(function (k) {
        return '<div class="kv"><b>' + esc(k) + "</b><span>" + esc(D.textOf(v[k])) + "</span></div>";
      }).join("");
    }
    return "";
  }

  // hooks → [{type, text}]（字符串没有类型）
  function hookRows(it) {
    var rows = [];
    var seen = {};
    function add(type, text) {
      text = String(text || "").trim();
      if (!text || seen[text]) return;
      seen[text] = true;
      rows.push({ type: type, text: text });
    }
    (Array.isArray(it.hooks) ? it.hooks : []).forEach(function (h) {
      if (typeof h === "string") add("", h);
      else if (h && typeof h === "object") add(h.hook_type || h.type || "", h.text || h.hook || h.line || "");
    });
    if (it.hook) add(rows.length ? "" : "主钩子", it.hook);
    return rows;
  }

  // apply → 气泡：[{brand, hook, how}]
  function applyBubbles(it) {
    var a = it.apply;
    var out = [];
    function one(brand, v) {
      if (v == null || v === "") return;
      if (typeof v === "string") out.push({ brand: brand, hook: v, how: "" });
      else if (typeof v === "object" && !Array.isArray(v)) out.push({ brand: brand, hook: String(v.hook || v.text || ""), how: String(v.how || "") });
      else out.push({ brand: brand, hook: D.textOf(v), how: "" });
    }
    if (typeof a === "string" || Array.isArray(a)) one(it.brand === "BOTH" ? "" : it.brand, a);
    else if (a && typeof a === "object") {
      if (a.hook || a.how || a.text) one(it.brand === "BOTH" ? "" : it.brand, a);
      else Object.keys(a).forEach(function (k) { one(k, a[k]); });
    }
    return out.filter(function (b) { return b.hook || b.how; });
  }

  function bubble(b) {
    var cls = /^ot$/i.test(b.brand) ? "b-ot" : /^ff$/i.test(b.brand) ? "b-ff" : "";
    return '<div class="bubble-row">' +
      '<span class="avatar ' + cls + '">' + esc(b.brand || "我们") + "</span>" +
      '<div class="bubble-wrap"><div class="bubble ' + cls + '">' + esc(b.hook || "") + "</div>" +
      (b.how ? '<div class="how"><i>怎么拍</i>' + esc(b.how) + "</div>" : "") +
      "</div></div>";
  }

  function detailAngle(it, date) {
    var views = fmtViews(it.views);
    var kp = I.briefPoints(it);
    var nums = [];
    if (views) nums.push([views, "播放"]);
    if (typeof it.views_per_day === "number") nums.push([fmtViews(it.views_per_day), "每天涨"]);
    var hooks = hookRows(it);
    var bubbles = applyBubbles(it);
    var body =
      '<div class="d-cover hero">' + coverInner(it.thumb, it.brand, platformName(it.source)) +
      '<div class="tl">' + brandPill(it.brand) + statusTag(it.status) + "</div>" +
      (views ? '<div class="hero-views"><b>' + esc(views) + "</b><span>次播放</span></div>" : "") +
      "</div>" +
      '<h2 class="d-title" id="sheet-title">' + esc(it.title) + "</h2>" +
      '<div class="d-sub">' + esc(it.source) + "</div>" +
      // 3 个关键 point
      '<div class="d-sec"><h4>3 个关键 point' + (kp.from === "fallback" ? ' <small class="miss">' + MISSING + " key_points，先从下面摘</small>" : "") + "</h4>" +
      '<div class="kp">' + kp.points.map(function (p, i) {
        return '<div class="kp-card"><span class="kp-n">' + (i + 1) + "</span><b>" + esc(p.head) + "</b><p>" + (p.body ? esc(p.body) : miss()) + "</p></div>";
      }).join("") + "</div></div>" +
      // 为什么推荐
      sec("为什么推荐",
        (nums.length ? '<div class="bignums">' + nums.map(function (n) { return '<div><b>' + esc(n[0]) + "</b><span>" + esc(n[1]) + "</span></div>"; }).join("") + "</div>" : "") +
        (it.trend_element ? '<div class="trend-tags">' + String(it.trend_element).split(/[、,，/]/).filter(Boolean).map(function (t) { return '<span class="ttag">' + esc(t.trim()) + "</span>"; }).join("") + "</div>" : "") +
        "<p>" + (it.why ? esc(it.why) : miss()) + "</p>") +
      // 模式拆解
      sec("模式拆解",
        richText(it.pattern) +
        (hooks.length ? '<div class="hook-table">' + hooks.map(function (h) {
          return '<div class="ht-row"><span class="ht-type">' + (h.type ? esc(h.type) : "—") + '</span><span class="ht-arrow">→</span><span class="ht-text">' + esc(h.text) + "</span></div>";
        }).join("") + "</div>" : "") ||
        "") +
      // 用到我们 brand
      sec("用到我们 brand",
        bubbles.length ? bubbles.map(bubble).join("") :
          (hooks.length ? '<p class="sub">' + MISSING + " apply，先看原片的钩子：</p>" + hooks.map(function (h) { return bubble({ brand: "原片", hook: h.text, how: "" }); }).join("") : "")) +
      // 原片
      sec("原片", '<p class="comp"><i>合规</i>' + (it.compliance ? esc(it.compliance) : miss()) + "</p>" +
        (it.summary ? '<p class="d-sum">' + esc(it.summary) + "</p>" : ""));
    return {
      kind: "拍摄简报 · " + date,
      body: body,
      foot: reasonRow(it.id, date, "sheet") +
        '<div class="foot-row">' + decBtns(it.id, date, ["shoot", "skip"], "sheet", "big") + bigLink(it.url, "打开原片", "half") + "</div>"
    };
  }

  function detailProduct(it, date) {
    return {
      kind: "产品 · " + date,
      body: '<div class="d-cover r43">' + coverInner(it.image, it.brand, it.platform || it.source) + "</div>" +
        '<div class="d-meta">' + (it.platform ? '<span class="pill">' + esc(it.platform) + "</span>" : "") +
        (it.sample ? '<span class="st">示例</span>' : "") + "</div>" +
        '<h2 class="d-title" id="sheet-title">' + esc(it.title) + "</h2>" +
        metricHtml(I.productMetric(it, keywordsOn(date))) +
        sec("摘要", para(it.summary)) +
        sec("可以怎么做", para(it.idea)) +
        sec("分类", Array.isArray(it.category) && it.category.length ? tagList(it.category) : "") +
        (Array.isArray(it.need_keys) && it.need_keys.length ? sec("满足的需求", tagList(it.need_keys)) : ""),
      foot: reasonRow(it.id, date, "sheet") +
        '<div class="foot-row">' + decBtns(it.id, date, ["new_product", "skip"], "sheet", "big") + bigLink(it.url, "看源站", "half") + "</div>"
    };
  }

  // 那天资料读不到时，只用 feedback 里有的东西
  function detailRecord(r) {
    return {
      kind: (SECTION_LABEL[r.section] || r.section) + " · " + r.date,
      body: '<div class="d-cover">' + coverInner(D.youtubeThumb(r.url), r.brand, SECTION_LABEL[r.section] || "") + "</div>" +
        '<div class="d-meta">' + brandPill(r.brand) + "</div>" +
        '<h2 class="d-title" id="sheet-title">' + esc(r.title) + "</h2>",
      foot: bigLink(r.url, r.section === "product" ? "看源站" : "打开原片")
    };
  }

  function renderSheet() {
    var s = state.sheet;
    if (!s) return;
    var it = findItem(s.id, s.date);
    var r = it ? null : findRecord(s.id, s.date);
    var d = it ? (it.kind === "product" ? detailProduct(it, s.date) : it.kind === "angle" ? detailAngle(it, s.date) : null)
      : r ? detailRecord(r) : null;
    if (!d) { hideSheet(); return; }
    var bodyEl = $("sheet-body");
    var top = bodyEl.scrollTop;
    $("sheet-kind").textContent = d.kind;
    bodyEl.innerHTML = d.body;
    bodyEl.scrollTop = top;
    $("sheet-foot").innerHTML = d.foot;
    $("sheet-foot").hidden = !d.foot;
  }

  var lastFocus = null;
  var viewing = null; // {item_id, date, t0}：正在看的简报，关掉时补 seconds

  function startView(id, date) {
    var it = findItem(id, date);
    if (!it || it.kind !== "angle") return;
    viewing = { item_id: id, date: date, t0: Date.now() };
    var me = viewing;
    store.addView({ item_id: id, date: date, who: who() }).then(function (v) {
      if (!state.viewsByDate[date]) state.viewsByDate[date] = [];
      state.viewsByDate[date] = state.viewsByDate[date].concat([v]);
      if (date === state.date) state.views = state.views.concat([v]);
      render();
    }).catch(function () {
      // 没记到：不显示「已看」，关掉时也不补秒数
      if (viewing === me) viewing = null;
      toast("「已看」没记到");
      render();
    });
  }

  function endView() {
    if (!viewing) return;
    var v = viewing;
    viewing = null;
    store.addView({ item_id: v.item_id, date: v.date, who: who(), seconds: (Date.now() - v.t0) / 1000 })
      .then(function (row) {
        if (!state.viewsByDate[v.date]) state.viewsByDate[v.date] = [];
        state.viewsByDate[v.date] = state.viewsByDate[v.date].concat([row]);
        if (v.date === state.date) state.views = state.views.concat([row]);
      })
      .catch(function () { toast("看了几秒没记到"); });
  }

  function openSheet(id, date) {
    if (state.pending && state.pending.where === "sheet") state.pending = null;
    state.sheet = { id: id, date: date };
    renderSheet();
    if (!state.sheet) return;
    $("sheet-body").scrollTop = 0;
    panel.style.transform = "";
    if (sheetEl.hidden) {
      lastFocus = document.activeElement;
      sheetEl.hidden = false;
      document.body.classList.add("lock");
      try { history.pushState({ bihSheet: 1 }, ""); } catch (e) { /* file:// 等环境 */ }
    }
    sheetEl.querySelector(".x").focus({ preventScroll: true });
    startView(id, date);
    // 已决定页点的旧日期：读完再补上完整详情
    if (!cache[date]) {
      fetchDay(date).then(function () {
        if (state.sheet && state.sheet.id === id && state.sheet.date === date) renderSheet();
      });
    }
  }

  function hideSheet() {
    state.sheet = null;
    if (state.pending && state.pending.where === "sheet") state.pending = null;
    endView();
    if (sheetEl.hidden) return;
    sheetEl.hidden = true;
    panel.style.transform = "";
    panel.classList.remove("drag", "snap");
    document.body.classList.remove("lock");
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
    lastFocus = null;
  }

  // 关：有自己推的那一格历史就退一格（手机返回键也能关），否则直接关
  function closeSheet() {
    if (history.state && history.state.bihSheet) history.back();
    else hideSheet();
  }

  window.addEventListener("popstate", function () { if (!sheetEl.hidden) hideSheet(); });
  // 直接关分页 / 切走：把正在看的秒数送出去
  window.addEventListener("pagehide", endView);

  sheetEl.addEventListener("click", function (e) {
    if (e.target.closest("[data-close]")) { closeSheet(); return; }
    var t = e.target.closest("button");
    if (!t) return;
    if (t.hasAttribute("data-dec")) pressDecision(t.getAttribute("data-id"), t.getAttribute("data-date"), t.getAttribute("data-dec"), "sheet");
    else if (t.hasAttribute("data-reason") || t.hasAttribute("data-reason-act")) reasonClick(t);
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !sheetEl.hidden) closeSheet();
    // 原因输入框里按 Enter = Confirm
    if (e.key === "Enter" && e.target.classList && e.target.classList.contains("r-note") && state.pending && state.pending.reason) {
      reasonClick({ hasAttribute: function (a) { return a === "data-reason-act"; }, getAttribute: function () { return "confirm"; } });
    }
  });

  // 手机 sheet：按住顶部把手 / 标题栏往下拉，超过 100px 就关
  (function () {
    var startY = null, dy = 0, pid = null;
    function down(e) {
      if (window.matchMedia("(min-width: 700px)").matches) return;
      if (e.target.closest("button, a")) return;
      startY = e.clientY; dy = 0; pid = e.pointerId;
      panel.classList.remove("snap");
      panel.classList.add("drag");
      try { e.currentTarget.setPointerCapture(pid); } catch (err) { /* ignore */ }
    }
    function move(e) {
      if (startY === null || e.pointerId !== pid) return;
      dy = Math.max(0, e.clientY - startY);
      panel.style.transform = "translateY(" + dy + "px)";
    }
    function up(e) {
      if (startY === null || e.pointerId !== pid) return;
      startY = null;
      panel.classList.remove("drag");
      if (dy > 100) { closeSheet(); return; }
      panel.classList.add("snap");
      panel.style.transform = "";
    }
    [sheetEl.querySelector(".grip"), sheetEl.querySelector(".ph-bar")].forEach(function (h) {
      h.addEventListener("pointerdown", down);
      h.addEventListener("pointermove", move);
      h.addEventListener("pointerup", up);
      h.addEventListener("pointercancel", up);
    });
  })();

  // ---------- 图片：失败就拿掉，露出占位块 ----------

  document.addEventListener("error", function (e) {
    var t = e.target;
    if (t && t.tagName === "IMG" && t.parentNode) t.parentNode.removeChild(t);
  }, true);
  // YouTube 影片不在了会回一张 120×90 的灰图，不算封面
  document.addEventListener("load", function (e) {
    var t = e.target;
    if (t && t.tagName === "IMG" && /ytimg\.com/.test(t.src) && t.naturalWidth > 0 && t.naturalWidth <= 120 && t.parentNode) {
      t.parentNode.removeChild(t);
    }
  }, true);

  // ---------- 页面交互 ----------

  function download(name, text) {
    var blob = new Blob([text], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  // decisions.json = 决定 + 看过记录（DATA.md「反馈怎么回到 Grok」）；任何一边读不出来就不导，免得交出不完整的文件
  function exportFile() {
    Promise.all([store.listFeedback(), store.listViews()]).then(function (r) {
      download("decisions.json", S.exportJSON(r[0], r[1]));
    }, function () {
      toast("记录读不出来，没导出");
      render();
    });
  }

  // 今日总览 / 今天变了什么 → 新品决策，展开那个关键字并滚到它
  function gotoKeyword(id) {
    var it = findItem(id, state.date);
    // 马来西亚 Trends 在新品决策页一直展开，不用打开「其他地区」
    if (!(it && isMyGoogleTrends(it))) {
      if (it && it.region && it.region !== "cn") state.showOther = true;
      else state.showCn = true;
    }
    state.open[id] = true;
    state.scrollKw = id;
    var h = R.href("products", dateParam(state.date));
    if (location.hash === h) render();
    else location.hash = h;
  }

  main.addEventListener("click", function (e) {
    var go = e.target.closest("[data-goto-kw]");
    if (go) { e.preventDefault(); gotoKeyword(go.getAttribute("data-goto-kw")); return; }
    var t = e.target.closest("button, a, input");
    if (t && (t.tagName === "A" || t.tagName === "INPUT")) return; // 看源站 ↗、左栏 / KPI 链接照常；原因输入框
    if (e.target.closest("summary")) return;
    var rowLink = !t && e.target.closest("[data-href]");
    if (rowLink) { location.hash = rowLink.getAttribute("data-href"); return; }
    if (t && t.hasAttribute("data-fold")) {
      var flag = t.getAttribute("data-fold");
      if (flag === "showCn" || flag === "showOther" || flag === "showNoImg") state[flag] = !state[flag];
      render();
      return;
    }
    if (t && t.hasAttribute("data-dec")) {
      pressDecision(t.getAttribute("data-id"), t.getAttribute("data-date"), t.getAttribute("data-dec"), "main");
    } else if (t && (t.hasAttribute("data-reason") || t.hasAttribute("data-reason-act"))) {
      reasonClick(t);
    } else if (t && t.hasAttribute("data-open")) {
      openSheet(t.getAttribute("data-open"), t.getAttribute("data-date"));
    } else if (t && t.hasAttribute("data-undo")) {
      addFeedback({ item_id: t.getAttribute("data-id"), date: t.getAttribute("data-date"), decision: "cancel_" + t.getAttribute("data-undo") });
    } else if (t && t.hasAttribute("data-act")) {
      var act = t.getAttribute("data-act");
      if (act === "export") { exportFile(); return; }
      else if (act === "clear") state.confirmClear = true;
      else if (act === "cancel") state.confirmClear = false;
      else if (act === "confirm") {
        state.confirmClear = false;
        store.clear().then(function () {
          toast("清空了");
        }, function () {
          toast("没清掉：这个浏览器写不进去");
        }).then(loadFeedback).then(render, render);
        return;
      }
      render();
    } else {
      // 点关键字那一行（按钮、原因行以外）→ 展开 / 收起相关产品
      var row = e.target.closest("[data-row]");
      if (!row || e.target.closest(".kw-more, .reason")) return;
      var id = row.getAttribute("data-row");
      state.open[id] = !state.open[id];
      render();
    }
  });

  // 表格里可点的行：键盘 Enter 也能进
  main.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" || !e.target.matches || !e.target.matches("tr[data-goto-kw], tr[data-href]")) return;
    e.preventDefault();
    if (e.target.hasAttribute("data-goto-kw")) gotoKeyword(e.target.getAttribute("data-goto-kw"));
    else location.hash = e.target.getAttribute("data-href");
  });

  $("filters").addEventListener("click", function (e) {
    var spanBtn = e.target.closest("[data-span]");
    if (spanBtn && spanBtn.closest("#span")) {
      state.span = spanBtn.getAttribute("data-span") === "day" ? "day" : "week";
      render();
      return;
    }
    var platBtn = e.target.closest("[data-plat]");
    if (platBtn && platBtn.closest("#plats")) {
      state.platform = platBtn.getAttribute("data-plat") || "ALL";
      render();
    }
  });

  $("brand").addEventListener("click", function (e) {
    var t = e.target.closest("[data-brand]");
    if (!t) return;
    state.brand = t.getAttribute("data-brand");
    render();
  });

  $("q").addEventListener("input", function (e) {
    state.q = e.target.value;
    render();
  });

  // 你是谁（左栏底部）
  (function () {
    var sel = $("who");
    var cur = store.getWho();
    var names = store.team.slice();
    if (cur && names.indexOf(cur) < 0) names.push(cur);
    sel.innerHTML = '<option value="">你是谁？</option>' + names.map(function (n) {
      return '<option value="' + esc(n) + '">' + esc(n) + "</option>";
    }).join("");
    sel.value = cur;
    sel.classList.toggle("unset", !cur);
    sel.addEventListener("change", function () {
      // 存不进去：下拉退回实际存着的名字，免得显示新名字、记录却署旧名
      if (!store.setWho(sel.value)) {
        sel.value = store.getWho();
        toast("「你是谁」没存进去，还是用原来的名字");
      }
      sel.classList.toggle("unset", !sel.value);
      rerender();
    });
  })();

  // ---------- hash 路由 ----------

  // 换日期 = 换 hash（不多一格返回记录），hashchange 再去读那天
  function goDate(d) {
    if (!d || d === state.date) return;
    location.replace(R.href(state.route, dateParam(d)));
  }

  function onHash() {
    var want = R.canonical(location.hash);
    if (location.hash !== want) {
      try { history.replaceState(history.state, "", want); } catch (e) { /* file:// 等环境 */ }
    }
    var p = R.parse(want);
    var changed = p.route !== state.route;
    state.route = p.route;
    if (changed) {
      state.pending = null;
      state.confirmClear = false;
      if (p.route === "history") state.histPage.ready = false;
    }
    if (!sheetEl.hidden) hideSheet();
    if (changed && !state.scrollKw) window.scrollTo(0, 0);
    if (!state.booted) { render(); return; }
    var d = p.date && state.dates.indexOf(p.date) >= 0 ? p.date : latest();
    if (p.date && d !== p.date && d) {
      // 地址栏的日期没有资料：改成实际显示的那天，并说一声
      try { history.replaceState(history.state, "", R.href(p.route, d)); } catch (e) { /* file:// 等环境 */ }
      toast("没有 " + p.date + " 的资料，显示最新一天");
    }
    // 集运不靠当天情报文件，先画出来；换日期的读取结束后再 render 一次（iframe 已在就不重载）
    if (state.route === "shipment") render();
    if (d && d !== state.date) loadDay(d);
    else if (state.route !== "shipment") render();
  }

  window.addEventListener("hashchange", onHash);

  $("date").addEventListener("change", function (e) { goDate(e.target.value); });
  // dates 新的在前：◀ = 前一天（更旧），▶ = 后一天
  $("prev").addEventListener("click", function () {
    var i = state.dates.indexOf(state.date);
    if (i >= 0 && i < state.dates.length - 1) goDate(state.dates[i + 1]);
  });
  $("next").addEventListener("click", function () {
    var i = state.dates.indexOf(state.date);
    if (i > 0) goDate(state.dates[i - 1]);
  });

  // 别的分页改了反馈，这里跟着刷新
  window.addEventListener("storage", function (e) {
    if (e.key === S.KEYS.feedback || e.key === S.KEYS.views) {
      if (state.route === "history") state.histPage.ready = false;
      Promise.all([loadFeedback(), loadViews(state.date)]).then(render);
    }
  });

  // ---------- 启动 ----------

  state.route = R.parse(location.hash).route;
  render();

  Promise.all([
    store.init().then(loadFeedback),
    fetchJSON("data/manifest.json")
  ]).then(function (r) {
    var m = r[1] || {};
    state.manifest = m;
    var dates = (Array.isArray(m.dates) ? m.dates.slice() : []).filter(Boolean);
    dates.sort().reverse();
    state.dates = dates;
    $("date").innerHTML = dates.map(function (d) { return '<option value="' + esc(d) + '">' + esc(d) + "</option>"; }).join("");
    if (!dates.length) { state.missing = true; state.booted = true; state.ready = true; render(); return; }
    state.route = ""; // 让 onHash 当成第一次进这页
    state.booted = true;
    onHash();
  }).catch(function () {
    state.error = "读不到 data/manifest.json";
    state.booted = true;
    state.ready = true;
    onHash();
  });
})();
