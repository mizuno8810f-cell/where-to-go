-- ============================================================
-- ドコイク？ 訪問履歴テーブル + RLS
-- Supabase Dashboard → SQL Editor に貼り付けて実行してください。
-- 何度実行しても安全（IF NOT EXISTS / DROP POLICY IF EXISTS）。
-- ============================================================

-- 1) テーブル
create table if not exists public.station_visits (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  station_id text not null,
  visited_at timestamptz not null default now()
);

-- 集計/取得を速くするインデックス
create index if not exists station_visits_user_idx
  on public.station_visits (user_id);
create index if not exists station_visits_user_station_idx
  on public.station_visits (user_id, station_id);
create index if not exists station_visits_user_time_idx
  on public.station_visits (user_id, visited_at desc);

-- 2) RLS を有効化
alter table public.station_visits enable row level security;

-- 3) ポリシー（自分の行だけ SELECT / INSERT / DELETE。UPDATE は誰にも許可しない）
drop policy if exists "select own visits"  on public.station_visits;
drop policy if exists "insert own visits"  on public.station_visits;
drop policy if exists "delete own visits"  on public.station_visits;

-- 自分(user_id = auth.uid())の行だけ参照可
create policy "select own visits"
  on public.station_visits
  for select
  to authenticated
  using (auth.uid() = user_id);

-- 自分名義でのみ追加可（INSERT時に auth.uid() = user_id を必須化）
create policy "insert own visits"
  on public.station_visits
  for insert
  to authenticated
  with check (auth.uid() = user_id);

-- 自分の行だけ削除可（「記録をリセット」用）。他人の行は削除不可。
create policy "delete own visits"
  on public.station_visits
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- UPDATE ポリシーは作らない
--   → RLS 有効下でポリシー未定義の操作は全拒否。
--     既存レコードの改ざん（日時・駅の書き換え）は誰にもできません。
