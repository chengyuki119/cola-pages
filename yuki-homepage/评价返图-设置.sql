-- 评价返图功能设置（新增，跑一次即可）
-- 用法：Supabase → SQL Editor → New query → 粘贴全部 → Run

-- 评价表：所有人可看、可提交；改/删只有后台（你）能做
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  name text,
  content text not null,
  image_url text,
  created_at timestamptz not null default now()
);
alter table public.reviews enable row level security;

drop policy if exists "public read reviews" on public.reviews;
create policy "public read reviews" on public.reviews for select using (true);

drop policy if exists "public insert reviews" on public.reviews;
create policy "public insert reviews" on public.reviews for insert with check (true);

drop policy if exists "auth manage reviews" on public.reviews;
create policy "auth manage reviews" on public.reviews for all to authenticated using (true) with check (true);

-- 评价图片存储桶：公开看图、游客可上传（仅限这个桶）
insert into storage.buckets (id, name, public) values ('reviews', 'reviews', true)
on conflict (id) do nothing;

drop policy if exists "public read review images" on storage.objects;
create policy "public read review images" on storage.objects for select using (bucket_id = 'reviews');

drop policy if exists "public upload review images" on storage.objects;
create policy "public upload review images" on storage.objects for insert to anon with check (bucket_id = 'reviews');

drop policy if exists "auth delete review images" on storage.objects;
create policy "auth delete review images" on storage.objects for delete to authenticated using (bucket_id = 'reviews');
