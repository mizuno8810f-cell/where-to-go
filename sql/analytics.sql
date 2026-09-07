-- ============================================================
-- ドコイク？ アクセス集計（ページビュー）テーブル + RLS
-- Supabase Dashboard → SQL Editor に貼り付けて実行してください。
-- 何度実行しても安全（IF NOT EXISTS / DROP POLICY IF EXISTS）。
--
-- 収集する情報は「匿名ユーザーID(uuid)」と「時刻」だけ。氏名・IP・
-- 端末情報などの個人情報は保存しません。event 列で種類を分けます
-- （現在は "page_view" のみ。将来ボタン計測なども足せます）。
-- ============================================================

-- 1) テーブル
create table if not exists public.app_events (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  event      text not null default 'page_view',
  created_at timestamptz not null default now()
);

-- 端末ID（visitor_id）。匿名アカウントは、トークン更新に失敗すると破棄されて
-- 作り直されるため、user_id で人数を数えると水増しになる。localStorage に
-- 持ち続ける乱数IDで数える。既存テーブルにも後から追加できる。
alter table public.app_events add column if not exists visitor_id text;

create index if not exists app_events_time_idx  on public.app_events (created_at);
create index if not exists app_events_visitor_idx on public.app_events (visitor_id);
create index if not exists app_events_event_idx on public.app_events (event, created_at);
create index if not exists app_events_user_idx  on public.app_events (user_id);

-- 2) RLS を有効化
alter table public.app_events enable row level security;

-- 3) ポリシー：自分名義での INSERT のみ許可。
--    SELECT ポリシーは作らない → 一般ユーザーは誰の記録も読めません。
--    集計は Dashboard（service_role が RLS を迂回）や下の SQL で行います。
drop policy if exists "insert own events" on public.app_events;
create policy "insert own events"
  on public.app_events
  for insert
  to authenticated
  with check (auth.uid() = user_id);

-- ============================================================
-- 集計クエリの例（SQL Editor で必要なときに実行）
-- ============================================================

-- ● 総アクセス数（PV）と、ユニーク人数（=匿名ユーザー数）
-- select
--   count(*)                        as page_views,
--   count(distinct user_id)         as unique_users
-- from public.app_events
-- where event = 'page_view';

-- ● 日別のPVとユニーク人数（新しい順）
-- select
--   (created_at at time zone 'Asia/Tokyo')::date as day,
--   count(*)                as page_views,
--   count(distinct user_id) as unique_users
-- from public.app_events
-- where event = 'page_view'
-- group by 1
-- order by 1 desc;

-- ● 直近7日のPV
-- select count(*) as pv_last_7d
-- from public.app_events
-- where event = 'page_view'
--   and created_at >= now() - interval '7 days';

-- ● アプリを開いたことのある端末（匿名ユーザー）の総数
-- select count(*) as total_users from auth.users;

-- ● 「ココイク」で記録された総回数と、記録した人数
-- select
--   count(*)                as total_checkins,
--   count(distinct user_id) as users_who_checked_in
-- from public.station_visits;

-- ● 人気の駅ランキング（ココイク回数トップ20）
-- select station_id, count(*) as checkins
-- from public.station_visits
-- group by station_id
-- order by checkins desc
-- limit 20;

-- ============================================================
-- アプリ内の「統計画面(#stats)」から呼ぶ集計関数
--   security definer で RLS を迂回して集計するが、返すのは合計値だけ。
--   生データ（誰が・いつ）は一切返さないので、匿名キーから呼ばれても安全。
--   このSQLを SQL Editor で1回実行してください（何度でも再実行可）。
-- ============================================================
create or replace function public.get_app_stats()
returns table (
  page_views           bigint,
  unique_users         bigint,
  pv_last_7d           bigint,
  total_users          bigint,
  total_checkins       bigint,
  users_who_checked_in bigint
)
language sql
security definer
set search_path = public
as $$
  select
    (select count(*)                from public.app_events    where event = 'page_view'),
    (select count(distinct coalesce(visitor_id, user_id::text))
       from public.app_events where event = 'page_view'),
    (select count(*)                from public.app_events    where event = 'page_view'
        and created_at >= now() - interval '7 days'),
    (select count(*)                from auth.users),
    (select count(*)                from public.station_visits),
    (select count(distinct user_id) from public.station_visits);
$$;

-- 匿名キー(anon)・ログイン済み(authenticated) から実行できるようにする
grant execute on function public.get_app_stats() to anon, authenticated;

-- ============================================================
-- 統計画面のグラフ用：日別の集計（合計値のみ。生データは返さない）
--   day = JST(Asia/Tokyo)の日付。直近 n_days 日ぶん。
--   このSQLも SQL Editor で1回実行してください。
-- ============================================================
create or replace function public.get_pv_daily(n_days int default 30)
returns table (day date, pv bigint, uniques bigint)
language sql
security definer
set search_path = public
as $$
  select
    (created_at at time zone 'Asia/Tokyo')::date as day,
    count(*)::bigint                              as pv,
    count(distinct coalesce(visitor_id, user_id::text))::bigint as uniques
  from public.app_events
  where event = 'page_view'
    and created_at >= now() - make_interval(days => n_days)
  group by 1
  order by 1;
$$;
grant execute on function public.get_pv_daily(int) to anon, authenticated;

create or replace function public.get_checkins_daily(n_days int default 30)
returns table (day date, checkins bigint, users bigint)
language sql
security definer
set search_path = public
as $$
  select
    (visited_at at time zone 'Asia/Tokyo')::date as day,
    count(*)::bigint                             as checkins,
    count(distinct user_id)::bigint             as users
  from public.station_visits
  where visited_at >= now() - make_interval(days => n_days)
  group by 1
  order by 1;
$$;
grant execute on function public.get_checkins_daily(int) to anon, authenticated;

