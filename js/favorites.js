/**
 * Favorites: localStorage + optional Supabase REST stub.
 * localStorage key: brand-intel-favorites
 */
(function (global) {
  const LS_KEY = "brand-intel-favorites";

  function cfg() {
    return global.BRAND_INTEL_CONFIG || {};
  }

  function loadLocal() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  function saveLocal(list) {
    localStorage.setItem(LS_KEY, JSON.stringify(list));
  }

  function favKey(item) {
    return `${item.item_kind}::${item.item_id}`;
  }

  function isFavorite(itemKind, itemId) {
    return loadLocal().some((f) => f.item_kind === itemKind && f.item_id === itemId);
  }

  function listFavorites() {
    return loadLocal().slice().sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
  }

  async function supabaseUpsert(row) {
    const c = cfg();
    if (!c.supabaseUrl || !c.supabaseAnonKey) return { synced: false };
    const table = c.favoritesTable || "favorites";
    const url = `${c.supabaseUrl.replace(/\/$/, "")}/rest/v1/${table}?on_conflict=user_key,item_kind,item_id`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        apikey: c.supabaseAnonKey,
        Authorization: `Bearer ${c.supabaseAnonKey}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({
        user_key: c.userKey || "nick",
        item_kind: row.item_kind,
        item_id: row.item_id,
        brand: row.brand || null,
        title: row.title || null,
        payload: row.payload || {},
        note: row.note || null,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Supabase ${res.status}: ${text.slice(0, 200)}`);
    }
    return { synced: true };
  }

  async function supabaseDelete(itemKind, itemId) {
    const c = cfg();
    if (!c.supabaseUrl || !c.supabaseAnonKey) return { synced: false };
    const table = c.favoritesTable || "favorites";
    const user = encodeURIComponent(c.userKey || "nick");
    const url =
      `${c.supabaseUrl.replace(/\/$/, "")}/rest/v1/${table}` +
      `?user_key=eq.${user}&item_kind=eq.${encodeURIComponent(itemKind)}&item_id=eq.${encodeURIComponent(itemId)}`;
    const res = await fetch(url, {
      method: "DELETE",
      headers: {
        apikey: c.supabaseAnonKey,
        Authorization: `Bearer ${c.supabaseAnonKey}`,
        Prefer: "return=minimal",
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Supabase delete ${res.status}: ${text.slice(0, 200)}`);
    }
    return { synced: true };
  }

  async function saveFavorite(payload) {
    const row = {
      item_kind: payload.item_kind,
      item_id: String(payload.item_id),
      brand: payload.brand || "",
      title: payload.title || "",
      payload: payload.payload || {},
      note: payload.note || "",
      created_at: new Date().toISOString(),
    };
    const list = loadLocal().filter((f) => favKey(f) !== favKey(row));
    list.push(row);
    saveLocal(list);

    let synced = false;
    try {
      const r = await supabaseUpsert(row);
      synced = !!r.synced;
    } catch (e) {
      console.warn("[BrandIntel] sync failed, kept local", e);
    }
    return { local: true, synced, row };
  }

  async function removeFavorite(itemKind, itemId) {
    const list = loadLocal().filter((f) => !(f.item_kind === itemKind && f.item_id === itemId));
    saveLocal(list);
    let synced = false;
    try {
      const r = await supabaseDelete(itemKind, itemId);
      synced = !!r.synced;
    } catch (e) {
      console.warn("[BrandIntel] unfavorite sync failed, kept local", e);
    }
    return { local: true, synced };
  }

  async function toggleFavorite(payload) {
    if (isFavorite(payload.item_kind, payload.item_id)) {
      const r = await removeFavorite(payload.item_kind, payload.item_id);
      return { favorited: false, ...r };
    }
    const r = await saveFavorite(payload);
    return { favorited: true, ...r };
  }

  global.BrandIntel = {
    LS_KEY,
    loadLocal,
    listFavorites,
    isFavorite,
    saveFavorite,
    removeFavorite,
    toggleFavorite,
  };
})(window);
