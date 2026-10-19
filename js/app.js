(function () {
  const state = {
    tab: "content", // content | products | saved
    date: null,
    manifest: null,
    content: null,
    products: null,
    brandFilter: "all", // all | OT | FF
    productFilter: "全部",
    search: "",
    panelId: null,
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), 2200);
  }

  function fmtViewsZh(n) {
    if (n == null || n === "") return "";
    const x = Number(n);
    if (Number.isNaN(x)) return String(n);
    if (x >= 10000) return (x / 10000).toFixed(1).replace(/\.0$/, "") + "万";
    if (x >= 1000) return (x / 1000).toFixed(1).replace(/\.0$/, "") + "k";
    return String(Math.round(x));
  }

  function statusClass(s) {
    const u = (s || "").toUpperCase();
    if (u.includes("NEW")) return "";
    if (u.includes("RISING")) return "";
    if (u.includes("WATCH")) return "watch";
    return "keep";
  }

  async function loadManifest() {
    const res = await fetch("data/manifest.json", { cache: "no-store" });
    if (!res.ok) throw new Error("manifest missing");
    state.manifest = await res.json();
    const dates = state.manifest.dates || [];
    state.date = state.manifest.latest || dates[0] || null;
    const sel = $("#date-select");
    sel.innerHTML = dates
      .map((d) => `<option value="${d}">${d}</option>`)
      .join("");
    if (state.date) sel.value = state.date;
  }

  async function loadDay(date) {
    state.date = date;
    const [cRes, pRes] = await Promise.all([
      fetch(`data/${date}/content.json`, { cache: "no-store" }),
      fetch(`data/${date}/products.json`, { cache: "no-store" }),
    ]);
    state.content = cRes.ok ? await cRes.json() : { angles: [], counts: {} };
    state.products = pRes.ok ? await pRes.json() : { products: [], trends: {}, sample: true };
    $("#meta-date").textContent = date;
    const sample = state.products.sample;
    $("#sample-tag").hidden = !sample;
    renderAll();
  }

  function setTab(tab) {
    state.tab = tab;
    $$(".nav-tab").forEach((b) => {
      const on = b.dataset.tab === tab;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    $("#view-content").hidden = tab !== "content";
    $("#view-products").hidden = tab !== "products";
    $("#view-saved").hidden = tab !== "saved";
    if (tab === "saved") renderSaved();
  }

  /* ---------- Content cards ---------- */
  function contentThumb(a) {
    const t = a.thumb || {};
    if (t.url) {
      return `<img src="${esc(t.url)}" alt="" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" />
        <div class="ph ${a.brand === "OT" ? "ot-ph" : "ff-ph"}" style="display:none"><span class="ph-brand">${esc(a.brand)}</span></div>`;
    }
    const ig = (t.platform || "").toLowerCase().includes("instagram");
    return `<div class="ph ${ig ? "ig" : a.brand === "OT" ? "ot-ph" : "ff-ph"}"><span class="ph-label">${esc(t.platform || "REF")}</span><span class="ph-brand">${esc(a.brand)}</span></div>`;
  }

  function platformTagClass(platform) {
    const p = (platform || "").toLowerCase();
    if (p.includes("youtube") || p.includes("yt")) return "yt";
    if (p.includes("instagram") || p.includes("ig")) return "ig";
    return "";
  }

  function filteredAngles() {
    let list = (state.content && state.content.angles) || [];
    if (state.brandFilter !== "all") list = list.filter((a) => a.brand === state.brandFilter);
    const q = state.search.trim().toLowerCase();
    if (q) {
      list = list.filter((a) => {
        const blob = [a.title, a.pain_point, a.top_hook, a.format_name, ...(a.hooks || []).map((h) => h.line)]
          .join(" ")
          .toLowerCase();
        return blob.includes(q);
      });
    }
    return list;
  }

  function renderContent() {
    const grid = $("#content-grid");
    const list = filteredAngles();
    const counts = (state.content && state.content.counts) || {};
    $("#content-count").innerHTML = `显示 <strong>${list.length}</strong> / ${(state.content && state.content.angles && state.content.angles.length) || 0} 条 · OT ${counts.ot || 0} · FF ${counts.ff || 0}`;

    if (!list.length) {
      grid.innerHTML = `<p class="empty visible">当前筛选下暂无角度。</p>`;
      return;
    }

    grid.innerHTML = list
      .map((a) => {
        const fav = BrandIntel.isFavorite("content", a.id);
        const st = (a.status || "RISING").toUpperCase();
        const plat = (a.thumb && a.thumb.platform) || "";
        const views = a.thumb && a.thumb.views;
        return `
      <article class="card" data-id="${esc(a.id)}" data-kind="content" tabindex="0">
        <div class="card-img">
          ${contentThumb(a)}
          ${plat ? `<span class="platform-tag ${platformTagClass(plat)}">${esc(plat)}</span>` : ""}
          ${views != null ? `<span class="views-tag">${fmtViewsZh(views)}</span>` : ""}
          <button type="button" class="star-btn ${fav ? "on" : ""}" data-star data-kind="content" data-id="${esc(a.id)}" aria-label="收藏" title="收藏">★</button>
        </div>
        <div class="card-body">
          <div class="card-top">
            <span class="pill ${a.brand === "OT" ? "ot" : "ff"}">${esc(a.brand_name || a.brand)}</span>
            <span class="status-tag ${statusClass(st)}">${esc(st)}</span>
          </div>
          <h3 class="card-title">${esc(a.title)}</h3>
          <p class="pain">${esc(a.pain_point || "")}</p>
          <p class="hook">${esc(a.top_hook || "")}</p>
          <div class="meta-row">
            ${a.format_name ? `<span>${esc(a.format_name)}</span>` : ""}
            ${a.n != null ? `<span>n=${a.n}</span>` : ""}
            ${a.median_perf_pct != null ? `<span>P${Math.round(a.median_perf_pct)}</span>` : ""}
          </div>
          <div class="card-footer">
            <span class="score">优先 <strong>${a.priority_score != null ? Number(a.priority_score).toFixed(2) : "—"}</strong></span>
            <span class="open-hint">详情 →</span>
          </div>
        </div>
      </article>`;
      })
      .join("");
  }

  function openPanel(id) {
    const a = ((state.content && state.content.angles) || []).find((x) => x.id === id);
    if (!a) return;
    state.panelId = id;
    $("#overlay").classList.add("open");
    $("#panel").classList.add("open");
    $("#panel").setAttribute("aria-hidden", "false");
    const refs = (a.references || [])
      .slice(0, 6)
      .map(
        (r) =>
          `<li><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title || r.url)}</a>
          <span class="ref-meta">${esc(r.platform || "")}${r.views != null ? " · " + fmtViewsZh(r.views) : ""}</span></li>`
      )
      .join("");
    const hooks = (a.hooks || [])
      .map((h) => `<li><strong>${esc(h.hook_type_zh || h.hook_type || "")}</strong> ${esc(h.line)}</li>`)
      .join("");
    const why = (a.why_trending || []).map((w) => `<li>${esc(w)}</li>`).join("");
    const fav = BrandIntel.isFavorite("content", a.id);
    $("#panel-body").innerHTML = `
      <div class="panel-head">
        <span class="pill ${a.brand === "OT" ? "ot" : "ff"}">${esc(a.brand_name || a.brand)}</span>
        <button type="button" class="star-btn text ${fav ? "on" : ""}" data-star data-kind="content" data-id="${esc(a.id)}">${fav ? "★ 已收藏" : "☆ 收藏"}</button>
      </div>
      <h2>${esc(a.title)}</h2>
      <p class="panel-pain">${esc(a.pain_point || "")}</p>
      <h4>钩子草稿</h4>
      <ul class="panel-list">${hooks || `<li>${esc(a.top_hook || "")}</li>`}</ul>
      <h4>为什么在涨</h4>
      <ul class="panel-list muted">${why || "<li>—</li>"}</ul>
      <h4>格式</h4>
      <p class="panel-note">${esc(a.format_name || "")} · ${esc(a.format_execution || "")}</p>
      <h4>合规</h4>
      <p class="panel-note">${esc(a.compliance || "")}</p>
      <h4>参考</h4>
      <ul class="panel-refs">${refs || "<li>无</li>"}</ul>
    `;
  }

  function closePanel() {
    state.panelId = null;
    $("#overlay").classList.remove("open");
    $("#panel").classList.remove("open");
    $("#panel").setAttribute("aria-hidden", "true");
  }

  /* ---------- Products ---------- */
  function filteredProducts() {
    let list = (state.products && state.products.products) || [];
    if (state.productFilter !== "全部") {
      list = list.filter((p) => (p.category || []).includes(state.productFilter));
    }
    return list;
  }

  function trendArrow(t) {
    if (t === "up") return '<span class="trend-arrow up">↑</span>';
    if (t === "down") return '<span class="trend-arrow down">↓</span>';
    return '<span class="trend-arrow flat">→</span>';
  }

  function renderTrends() {
    const trends = (state.products && state.products.trends) || {};
    ["cn", "my"].forEach((region) => {
      const rows = trends[region] || [];
      const el = $("#trends-list-" + region);
      el.innerHTML = rows
        .map((r) => {
          const top = r.rank <= 3 ? "top3" : "";
          return `<div class="trend-row">
            <span class="trend-rank ${top}">${r.rank}</span>
            <span class="trend-keyword" title="${esc(r.keyword)}">${esc(r.keyword)}</span>
            <div class="trend-bar-wrap"><div class="trend-bar" style="width:${Math.max(4, r.interest)}%"></div></div>
            <div class="trend-meta"><span class="trend-score">${r.interest}</span>${trendArrow(r.trend)}</div>
          </div>`;
        })
        .join("");
    });
  }

  function platformClass(p) {
    const map = { Shopee: "shopee", Lazada: "lazada", TikTok: "tiktok", Amazon: "amazon" };
    return map[p] || "";
  }

  function renderProducts() {
    renderTrends();
    const list = filteredProducts();
    const all = (state.products && state.products.products) || [];
    $("#product-count").innerHTML = `显示 <strong>${list.length}</strong> / ${all.length} 款产品`;
    const grid = $("#product-grid");
    if (!list.length) {
      grid.innerHTML = `<p class="empty visible">当前筛选下暂无产品。</p>`;
      return;
    }
    const colors = [
      "linear-gradient(135deg, #0d9488, #134e4a)",
      "linear-gradient(135deg, #0891b2, #164e63)",
      "linear-gradient(135deg, #059669, #064e3b)",
      "linear-gradient(135deg, #0284c8, #0c4a6e)",
      "linear-gradient(135deg, #0f766e, #115e59)",
      "linear-gradient(135deg, #14b8a6, #0f766e)",
    ];
    grid.innerHTML = list
      .map((p, i) => {
        const fav = BrandIntel.isFavorite("product", p.id);
        const cats = (p.category || []).join(" · ");
        const img = p.image
          ? `<img src="${esc(p.image)}" alt="" loading="lazy" onerror="this.parentElement.innerHTML='<div class=placeholder style=background:${colors[i % colors.length]}>🧹</div>'" />`
          : `<div class="placeholder" style="background:${colors[i % colors.length]}">🧹</div>`;
        return `
      <article class="card product-card" data-id="${esc(p.id)}" data-kind="product">
        <div class="card-img">
          ${img}
          <span class="platform-tag ${platformClass(p.platform)}">${esc(p.platform || "")}</span>
          ${p.sample ? `<span class="sample-badge">示例</span>` : ""}
          <button type="button" class="star-btn ${fav ? "on" : ""}" data-star data-kind="product" data-id="${esc(p.id)}" aria-label="收藏">★</button>
        </div>
        <div class="card-body">
          <h3 class="card-title">${esc(p.name)}</h3>
          <p class="price">RM ${p.priceMYR != null ? Number(p.priceMYR).toFixed(2) : "—"}</p>
          <p class="pain">${esc(p.why || "")}</p>
          <p class="hook idea">${esc(p.idea || "")}</p>
          <div class="meta-row"><span>${esc(cats)}</span><span>${esc(p.date || "")}</span></div>
          <div class="card-footer">
            <a class="open-hint" href="${esc(p.url || "#")}" target="_blank" rel="noopener" data-stop>看源站 →</a>
          </div>
        </div>
      </article>`;
      })
      .join("");
  }

  /* ---------- Saved ---------- */
  function renderSaved() {
    const list = BrandIntel.listFavorites();
    const grid = $("#saved-grid");
    $("#saved-count").innerHTML = `已收藏 <strong>${list.length}</strong> 条（本地${hasSupabase() ? " · 可同步 Supabase" : " · 未接 Supabase"}）`;
    if (!list.length) {
      grid.innerHTML = `<p class="empty visible">还没有收藏。在「营销内容」或「产品 / Trending」点 ★ 即可。</p>`;
      return;
    }
    grid.innerHTML = list
      .map((f) => {
        return `
      <article class="card saved-card">
        <div class="card-body">
          <div class="card-top">
            <span class="pill ${f.brand === "OT" ? "ot" : f.brand === "FF" || f.item_kind === "product" ? "ff" : ""}">${esc(f.brand || f.item_kind)}</span>
            <button type="button" class="star-btn on text" data-star data-kind="${esc(f.item_kind)}" data-id="${esc(f.item_id)}">★ 取消</button>
          </div>
          <h3 class="card-title">${esc(f.title || f.item_id)}</h3>
          <div class="meta-row">
            <span>${esc(f.item_kind)}</span>
            <span>${esc((f.created_at || "").slice(0, 10))}</span>
          </div>
        </div>
      </article>`;
      })
      .join("");
  }

  function hasSupabase() {
    const c = window.BRAND_INTEL_CONFIG || {};
    return !!(c.supabaseUrl && c.supabaseAnonKey);
  }

  function findPayload(kind, id) {
    if (kind === "content") {
      const a = ((state.content && state.content.angles) || []).find((x) => x.id === id);
      if (!a) return { item_kind: kind, item_id: id, title: id, brand: "", payload: {} };
      return {
        item_kind: "content",
        item_id: a.id,
        brand: a.brand,
        title: a.title,
        payload: { top_hook: a.top_hook, status: a.status, format_name: a.format_name },
      };
    }
    if (kind === "product") {
      const p = ((state.products && state.products.products) || []).find((x) => x.id === id);
      if (!p) return { item_kind: kind, item_id: id, title: id, brand: "FF", payload: {} };
      return {
        item_kind: "product",
        item_id: p.id,
        brand: "FF",
        title: p.name,
        payload: { priceMYR: p.priceMYR, platform: p.platform, category: p.category },
      };
    }
    return { item_kind: kind, item_id: id, title: id, brand: "", payload: {} };
  }

  async function onStar(kind, id) {
    const payload = findPayload(kind, id);
    const r = await BrandIntel.toggleFavorite(payload);
    if (r.favorited) {
      toast(r.synced ? "已同步到 Supabase" : "已收藏（本地）");
    } else {
      toast(r.synced ? "已取消并同步" : "已取消收藏（本地）");
    }
    renderAll();
    if (state.panelId === id) openPanel(id);
  }

  function renderAll() {
    renderContent();
    renderProducts();
    if (state.tab === "saved") renderSaved();
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function bind() {
    $$(".nav-tab").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tab)));

    $("#date-select").addEventListener("change", (e) => {
      loadDay(e.target.value).catch((err) => toast("加载失败: " + err.message));
    });

    $("#brand-filters").addEventListener("click", (e) => {
      const btn = e.target.closest(".chip");
      if (!btn) return;
      state.brandFilter = btn.dataset.brand;
      $$("#brand-filters .chip").forEach((c) => c.classList.toggle("active", c === btn));
      renderContent();
    });

    $("#product-filters").addEventListener("click", (e) => {
      const btn = e.target.closest(".chip");
      if (!btn) return;
      state.productFilter = btn.dataset.filter;
      $$("#product-filters .chip").forEach((c) => c.classList.toggle("active", c === btn));
      renderProducts();
    });

    $("#search-input").addEventListener("input", (e) => {
      state.search = e.target.value;
      renderContent();
    });

    document.addEventListener("click", (e) => {
      const star = e.target.closest("[data-star]");
      if (star) {
        e.preventDefault();
        e.stopPropagation();
        onStar(star.dataset.kind, star.dataset.id);
        return;
      }
      if (e.target.closest("[data-stop]")) return;
      const card = e.target.closest(".card[data-kind=content]");
      if (card) {
        openPanel(card.dataset.id);
        return;
      }
      if (e.target.id === "overlay" || e.target.closest("[data-close-panel]")) {
        closePanel();
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closePanel();
    });

    // trends mobile tabs
    const tabs = $("#trends-tabs");
    if (tabs) {
      tabs.addEventListener("click", (e) => {
        const btn = e.target.closest(".trends-tab");
        if (!btn) return;
        const region = btn.dataset.region;
        $$(".trends-tab").forEach((t) => {
          const on = t.dataset.region === region;
          t.classList.toggle("active", on);
          t.setAttribute("aria-selected", on ? "true" : "false");
        });
        $$(".trends-panel").forEach((p) => {
          p.classList.toggle("tab-hidden", p.dataset.region !== region);
        });
      });
    }
  }

  async function init() {
    bind();
    setTab("content");
    try {
      await loadManifest();
      if (!state.date) {
        toast("暂无快照数据");
        return;
      }
      await loadDay(state.date);
    } catch (e) {
      console.error(e);
      toast("初始化失败: " + e.message);
    }
  }

  init();
})();
