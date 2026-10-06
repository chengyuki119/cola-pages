-- 小铺 + 后台升级设置
-- 用法：Supabase 网页 → 你的项目 → SQL Editor → New query → 粘贴全部 → Run

-- ═══ 商品表 ═══
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price text,
  description text,
  tag text,
  image_url text,
  sold boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.products enable row level security;

-- 所有人可以逛商品
drop policy if exists "public read products" on public.products;
create policy "public read products" on public.products for select using (true);

-- 只有登录的你（后台）能上架/修改/下架
drop policy if exists "auth manage products" on public.products;
create policy "auth manage products" on public.products for all to authenticated using (true) with check (true);

-- ═══ 匿名留言：登录的你（后台）可以回复和删除 ═══
drop policy if exists "auth update questions" on public.questions;
create policy "auth update questions" on public.questions for update to authenticated using (true) with check (true);

drop policy if exists "auth delete questions" on public.questions;
create policy "auth delete questions" on public.questions for delete to authenticated using (true);

-- 联系方式只有登录的你（后台）能看
drop policy if exists "auth read contacts" on public.contacts;
create policy "auth read contacts" on public.contacts for select to authenticated using (true);

-- ═══ 商品图片存储桶（公开看图，只有你能上传）═══
insert into storage.buckets (id, name, public) values ('shop', 'shop', true)
on conflict (id) do nothing;

drop policy if exists "public read shop images" on storage.objects;
create policy "public read shop images" on storage.objects for select using (bucket_id = 'shop');

drop policy if exists "auth upload shop images" on storage.objects;
create policy "auth upload shop images" on storage.objects for insert to authenticated with check (bucket_id = 'shop');

drop policy if exists "auth update shop images" on storage.objects;
create policy "auth update shop images" on storage.objects for update to authenticated using (bucket_id = 'shop');

drop policy if exists "auth delete shop images" on storage.objects;
create policy "auth delete shop images" on storage.objects for delete to authenticated using (bucket_id = 'shop');
