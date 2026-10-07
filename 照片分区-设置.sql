-- 照片分区（可在后台添加新的照片分区，前台自动生成独立页面）
-- 用法：Supabase → SQL Editor → New query → 粘贴全部 → Run

create table if not exists public.photo_sections (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  name_zh text not null,
  name_en text not null,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.photo_sections enable row level security;

-- 所有人可以看分区
drop policy if exists "public read photo_sections" on public.photo_sections;
create policy "public read photo_sections" on public.photo_sections for select using (true);

-- 只有登录的你（后台）能添加/修改/删除
drop policy if exists "auth manage photo_sections" on public.photo_sections;
create policy "auth manage photo_sections" on public.photo_sections for all to authenticated using (true) with check (true);

-- 预置三个默认分区（已存在则跳过）
insert into public.photo_sections (key, name_zh, name_en, sort) values
  ('instax', '拍立得展示', 'Instax Display', 1),
  ('film', '胶卷相机照片展示', 'Film Camera Pictures', 2),
  ('bjd', 'BJD 展示', 'BJD Display', 3)
on conflict (key) do nothing;
