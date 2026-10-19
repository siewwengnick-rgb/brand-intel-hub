-- Brand Intel Hub — Supabase schema
-- Designed so AI agents can SELECT favorites + latest snapshots for briefings.
-- Agents: prefer latest daily_snapshots by biz_date DESC; join favorites where user_key='nick'.

-- Daily content / product payloads (JSON mirrors data/YYYY-MM-DD/*.json)
create table if not exists public.daily_snapshots (
  id uuid primary key default gen_random_uuid(),
  biz_date date not null,
  kind text not null check (kind in ('content', 'products')),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (biz_date, kind)
);

comment on table public.daily_snapshots is
  'OT/FF brand intel daily snapshots. kind=content|products. Agents: SELECT * FROM daily_snapshots WHERE biz_date = (SELECT max(biz_date) FROM daily_snapshots) ORDER BY kind;';

create index if not exists daily_snapshots_biz_date_idx on public.daily_snapshots (biz_date desc);
create index if not exists daily_snapshots_kind_idx on public.daily_snapshots (kind);

-- Nick favorites (starred cards). Unique per user + item.
create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_key text not null default 'nick',
  item_kind text not null check (item_kind in ('content', 'product', 'trend')),
  item_id text not null,
  brand text,
  title text,
  payload jsonb not null default '{}'::jsonb,
  note text,
  created_at timestamptz not null default now(),
  unique (user_key, item_kind, item_id)
);

comment on table public.favorites is
  'Starred items from brand-intel-hub. Agents briefing Nick: SELECT item_kind, item_id, brand, title, note, payload, created_at FROM favorites WHERE user_key = ''nick'' ORDER BY created_at DESC;';

create index if not exists favorites_user_created_idx on public.favorites (user_key, created_at desc);
create index if not exists favorites_brand_idx on public.favorites (brand);
create index if not exists favorites_kind_idx on public.favorites (item_kind);

-- Optional clickstream / feedback for agents
create table if not exists public.feedback_events (
  id uuid primary key default gen_random_uuid(),
  user_key text not null default 'nick',
  event_type text not null, -- favorite | unfavorite | open | note
  item_kind text,
  item_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.feedback_events is
  'Optional analytics. Agents may aggregate recent events for what Nick engaged with.';

create index if not exists feedback_events_user_created_idx
  on public.feedback_events (user_key, created_at desc);

-- RLS stubs (enable when wiring auth; for anon key + service role decide carefully)
-- alter table public.favorites enable row level security;
-- create policy "nick favorites" on public.favorites for all using (user_key = 'nick') with check (user_key = 'nick');
