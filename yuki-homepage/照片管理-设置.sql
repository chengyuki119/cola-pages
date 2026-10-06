-- 照片管理（后台可上传照片 / 编辑标题，前台照片页自动显示）
-- 用法：Supabase → SQL Editor → New query → 粘贴全部 → Run

-- ═══ 照片表 ═══
create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  category text not null,            -- instax / film / bjd
  image_url text not null,
  caption_zh text,
  caption_en text,
  sort int not null default 0,      -- 数字小的排前面
  created_at timestamptz not null default now()
);
alter table public.photos enable row level security;

-- 所有人可以看照片
drop policy if exists "public read photos" on public.photos;
create policy "public read photos" on public.photos for select using (true);

-- 只有登录的你（后台）能上传/修改/删除
drop policy if exists "auth manage photos" on public.photos;
create policy "auth manage photos" on public.photos for all to authenticated using (true) with check (true);

-- ═══ 照片存储桶 ═══
insert into storage.buckets (id, name, public) values ('gallery', 'gallery', true)
on conflict (id) do nothing;

drop policy if exists "public read gallery images" on storage.objects;
create policy "public read gallery images" on storage.objects for select using (bucket_id = 'gallery');

drop policy if exists "auth upload gallery images" on storage.objects;
create policy "auth upload gallery images" on storage.objects for insert to authenticated with check (bucket_id = 'gallery');

drop policy if exists "auth update gallery images" on storage.objects;
create policy "auth update gallery images" on storage.objects for update to authenticated using (bucket_id = 'gallery');

drop policy if exists "auth delete gallery images" on storage.objects;
create policy "auth delete gallery images" on storage.objects for delete to authenticated using (bucket_id = 'gallery');
