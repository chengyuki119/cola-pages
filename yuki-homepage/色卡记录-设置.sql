-- ============================================================
-- 记录本 设置脚本（在 Supabase SQL Editor 里运行一次）
-- 功能：后台「记录本」标签，私人记录（只有登录后能看）
-- ============================================================

create table if not exists public.records (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  content text not null default '',
  amount numeric,
  record_date date not null default current_date,
  created_at timestamptz not null default now()
);
alter table public.records enable row level security;

-- 注意：不建公开读策略，匿名访客看不到这些记录
drop policy if exists "auth manage records" on public.records;
create policy "auth manage records" on public.records
  for all to authenticated using (true) with check (true);
