-- ============================================================
-- Snow Yuzu · 页面封面图管理（她 20261117 02:50 任务书 PART C）
-- 日期：2026-11-17
-- 内容：独立 covers 存储桶 + page_covers 表 + RLS + 存储策略
-- 特性：全部独立新增，不碰 shop/gallery/site/pay 四个现有 bucket，
--      不碰 products / BJD / 色卡 / 餐厅任何图片字段；
--      可安全重复执行（幂等）；文末附自检与回滚
-- ============================================================

-- ── 1. 独立存储桶 covers（公开读，仅管理员可写）──────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('covers', 'covers', true, 10485760,
        array['image/jpeg','image/png','image/webp','image/gif','image/avif'])
on conflict (id) do nothing;

-- ── 2. 封面图表（一个页位一条记录：替换=更新行，删除=软删 is_active）──
create table if not exists public.page_covers (
  id          uuid primary key default gen_random_uuid(),
  page_key    text not null unique,          -- 页位标识（home/shop/works/photos/bjd/color-card/about/foodie）
  title       text not null default '',      -- 备注名（后台列表显示用）
  image_url   text not null default '',      -- 公网 URL（前台 <img>/背景用）
  image_path  text not null default '',      -- bucket 内路径（删除对象用：covers/<path>）
  position    text not null default 'center',-- object-position：center/center top/center bottom 等
  sort        integer not null default 0,
  is_active   boolean not null default true, -- 软删标记：false 后台可见、前台不显示
  updated_by  text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists page_covers_page_key_idx on public.page_covers (page_key);

-- ── 3. RLS：匿名只读启用的行；管理员（服务端 shop_is_admin 判定）读写 ──
alter table public.page_covers enable row level security;

drop policy if exists "pcov_read" on public.page_covers;
create policy "pcov_read" on public.page_covers
  for select using (is_active = true or public.shop_is_admin());

drop policy if exists "pcov_insert" on public.page_covers;
create policy "pcov_insert" on public.page_covers
  for insert to authenticated with check (public.shop_is_admin());

drop policy if exists "pcov_update" on public.page_covers;
create policy "pcov_update" on public.page_covers
  for update to authenticated using (public.shop_is_admin());

drop policy if exists "pcov_delete" on public.page_covers;
create policy "pcov_delete" on public.page_covers
  for delete to authenticated using (public.shop_is_admin());

-- ── 4. covers 桶存储策略：公开读；仅管理员上传/替换/删除 ────────────
drop policy if exists "covers_public_read" on storage.objects;
create policy "covers_public_read" on storage.objects
  for select using (bucket_id = 'covers');

drop policy if exists "covers_admin_insert" on storage.objects;
create policy "covers_admin_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'covers' and public.shop_is_admin());

drop policy if exists "covers_admin_update" on storage.objects;
create policy "covers_admin_update" on storage.objects
  for update to authenticated using (bucket_id = 'covers' and public.shop_is_admin());

drop policy if exists "covers_admin_delete" on storage.objects;
create policy "covers_admin_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'covers' and public.shop_is_admin());

-- ── 5. GRANT ─────────────────────────────────────────────────────
grant select on public.page_covers to anon, authenticated;
grant insert, update, delete on public.page_covers to authenticated;

-- ══════════════ 自检（跑完上面后单独执行）══════════════
-- ① 桶应返回一行 public=t：
select id, public, file_size_limit from storage.buckets where id = 'covers';
-- ② 四条表策略 + 四条桶策略应共 8 行：
select policyname, tablename from pg_policies
where tablename = 'page_covers' or (tablename = 'objects' and policyname like 'covers%');
-- ══════════════ 回滚（仅在你要求撤销时执行）══════════════
-- drop policy if exists "covers_public_read" on storage.objects;
-- drop policy if exists "covers_admin_insert" on storage.objects;
-- drop policy if exists "covers_admin_update" on storage.objects;
-- drop policy if exists "covers_admin_delete" on storage.objects;
-- drop table if exists public.page_covers;
-- delete from storage.buckets where id = 'covers';   -- 桶内对象需先在 Storage 页清空
