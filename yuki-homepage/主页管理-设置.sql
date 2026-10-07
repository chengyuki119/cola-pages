-- ============================================================
-- 主页管理 设置脚本（在 Supabase SQL Editor 里运行一次）
-- 功能：主页文案 / 头像 / 背景图 / 找到我卡片 全部可在后台修改
-- ============================================================

-- 1. 站点设置表（key-value）
create table if not exists public.site_settings (
  key text primary key,
  value text not null default '{}',
  updated_at timestamptz not null default now()
);
alter table public.site_settings enable row level security;

drop policy if exists "public read site_settings" on public.site_settings;
create policy "public read site_settings" on public.site_settings
  for select using (true);

drop policy if exists "auth manage site_settings" on public.site_settings;
create policy "auth manage site_settings" on public.site_settings
  for all to authenticated using (true) with check (true);

-- 2. site 存储桶（放头像 / 背景图）
insert into storage.buckets (id, name, public)
values ('site', 'site', true)
on conflict (id) do nothing;

drop policy if exists "site public read" on storage.objects;
create policy "site public read" on storage.objects
  for select using (bucket_id = 'site');

drop policy if exists "site auth upload" on storage.objects;
create policy "site auth upload" on storage.objects
  for insert to authenticated with check (bucket_id = 'site');

drop policy if exists "site auth update" on storage.objects;
create policy "site auth update" on storage.objects
  for update to authenticated using (bucket_id = 'site') with check (bucket_id = 'site');

drop policy if exists "site auth delete" on storage.objects;
create policy "site auth delete" on storage.objects
  for delete to authenticated using (bucket_id = 'site');
