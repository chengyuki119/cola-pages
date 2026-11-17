-- ============================================================
-- Foodie Map · 地图引擎升级 · 数据库迁移（她 20261115 地图引擎任务书）
-- 日期：2026-11-16
-- 作用：新建 foodie_map_config 单行配置表
--       存 Google Maps JS API Key + mapId、高德 JS API Key + 安全密钥。
--       这些都是「前端 Key」（靠 HTTP Referrer 白名单 + API 范围限制保护），
--       不含任何服务器端秘密；单独建表而不是塞进 site_settings，
--       是为了让匿名只读边界清晰：本表只放地图显示必需的非敏感配置。
-- 前提：foodie-phase1-migration.sql v2 已执行（shop_is_admin 存在）
-- 特性：可安全重复执行（幂等）；文末附回滚脚本
-- ============================================================

-- ── 0. 执行前自检 ────────────────────────────────────────────────
-- 应返回 1 行且 prosecdef = t：
select proname, prosecdef from pg_proc where proname = 'shop_is_admin';

-- ── 1. 建表（单行配置；前端匿名可读，管理员可写）────────────────
create table if not exists public.foodie_map_config (
  id             uuid primary key default gen_random_uuid(),
  google_key     text not null default '',   -- Google Maps JS API Key
  google_map_id  text not null default '',   -- Google mapId（AdvancedMarkerElement 必需）
  amap_key       text not null default '',   -- 高德 Web端(JS API) Key
  amap_security  text not null default '',   -- 高德安全密钥 securityJsCode
  updated_at     timestamptz not null default now()
);

-- updated_at 自动维护
create or replace function public.foodie_map_config_touch()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists foodie_map_config_touch on public.foodie_map_config;
create trigger foodie_map_config_touch before update on public.foodie_map_config
  for each row execute function public.foodie_map_config_touch();

-- ── 2. GRANT ─────────────────────────────────────────────────────
grant select on public.foodie_map_config to anon;
grant select, insert, update, delete on public.foodie_map_config to authenticated;

-- ── 3. RLS ───────────────────────────────────────────────────────
alter table public.foodie_map_config enable row level security;

-- 所有人可读（前台地图页需要；key 本身就是前端公开的，靠 Referrer 白名单保护）
drop policy if exists "foodie_map_config_public_read" on public.foodie_map_config;
create policy "foodie_map_config_public_read" on public.foodie_map_config
  for select to anon, authenticated using (true);

-- 写操作仅管理员（RLS 层）；普通登录用户不可写
drop policy if exists "foodie_map_config_admin_write" on public.foodie_map_config;
create policy "foodie_map_config_admin_write" on public.foodie_map_config
  for all to authenticated using (public.shop_is_admin()) with check (public.shop_is_admin());

-- ── 4. 预置空行（后台「地图服务」页保存时优先 PATCH 这一行）──────
insert into public.foodie_map_config (id)
values ('00000000-0000-0000-0000-0000000000c1')
on conflict (id) do nothing;

-- ── 执行后自检 ──────────────────────────────────────────────────
-- ① 应返回 1 行（空配置）：
--    select google_key = '' as empty_ok from public.foodie_map_config limit 1;
-- ② 匿名读应返回 1 行空配置（REST：/rest/v1/foodie_map_config?select=*）

-- ── 回滚脚本（仅删除本表，不影响 Foodie 其他数据）────────────────
-- drop table if exists public.foodie_map_config;
-- drop function if exists public.foodie_map_config_touch();
