# Supabase — Brand Intel Hub

## Why
GitHub Pages can host the UI and daily JSON snapshots. **Favorites must live in a database** so agents (雷达 / 转化 / 私人助理) can read what Nick starred.

## Setup (when ready)
1. Create a Supabase project.
2. Run `schema.sql` in the SQL editor.
3. Copy project URL + anon (or service) key into `../config.js` from `../config.example.js`.
4. Do **not** commit `config.js`.

## Agent queries (briefing)

```sql
-- Latest snapshots
select kind, biz_date, payload
from daily_snapshots
where biz_date = (select max(biz_date) from daily_snapshots)
order by kind;

-- Nick's favorites
select item_kind, item_id, brand, title, note, payload, created_at
from favorites
where user_key = 'nick'
order by created_at desc
limit 50;
```

## Local fallback
Until Supabase is configured, the UI stores favorites in `localStorage` key `brand-intel-favorites` and calls `window.BrandIntel.saveFavorite` which no-ops sync (toast: 已收藏（本地）).

## Pushing snapshots (optional later)
A small Railway or Supabase Edge Function can upsert `daily_snapshots` after `build_snapshot.py` runs. Not required for the static preview.
