-- 评价返图功能设置（合成版：建表 + rating 评分 + 权限 + 存储桶）
-- 用法：Supabase → SQL Editor → New query → 粘贴全部 → Run
-- 已有表/数据也不会被破坏，重复跑安全。

-- 1) 建表（如果还没建过；含 rating 字段）
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  name text,
  content text not null,
  rating int default 5,
  image_url text,
  created_at timestamptz not null default now()
);

-- 2) 已有表的话补 rating 字段 + 老数据补 5 星
alter table public.reviews add column if not exists rating int;
update public.reviews set rating = 5 where rating is null;
alter table public.reviews alter column rating set default 5;

-- 3) 限制 1~5
alter table public.reviews drop constraint if exists reviews_rating_range;
alter table public.reviews add constraint reviews_rating_range check (rating between 1 and 5);

-- 4) 权限：所有人可看、可提交；改/删只有你能做
alter table public.reviews enable row level security;

drop policy if exists "public read reviews" on public.reviews;
create policy "public read reviews" on public.reviews for select using (true);

drop policy if exists "public insert reviews" on public.reviews;
create policy "public insert reviews" on public.reviews for insert to anon with check (true);

drop policy if exists "auth manage reviews" on public.reviews;
create policy "auth manage reviews" on public.reviews for all to authenticated using (true) with check (true);

-- 5) 评价图片存储桶：公开看图、游客可上传（仅限这个桶）
insert into storage.buckets (id, name, public) values ('reviews', 'reviews', true)
on conflict (id) do nothing;

drop policy if exists "public read review images" on storage.objects;
create policy "public read review images" on storage.objects for select using (bucket_id = 'reviews');

drop policy if exists "public upload review images" on storage.objects;
create policy "public upload review images" on storage.objects for insert to anon with check (bucket_id = 'reviews');

drop policy if exists "auth delete review images" on storage.objects;
create policy "auth delete review images" on storage.objects for delete to authenticated using (bucket_id = 'reviews');
