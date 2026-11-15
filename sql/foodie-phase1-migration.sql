-- ═══════════════════════════════════════════════════════════════════
-- Snow Yuzu · Foodie Map — Phase 1 Migration · v2（她 20261114 22:58 审查意见修订）
-- 由柚子本人在 Supabase SQL Editor 执行（本文件可安全重复执行）
--
-- v2 相对 v1 的修改：
--   ① 新增执行前自检块：验证 public.shop_is_admin() 存在、SECURITY DEFINER、
--      返回 boolean（REST 只能验证到「存在+返回布尔」，定义检查用 pg_proc 完成）。
--   ② 列级保护升级：不再依赖列级 REVOKE（revoke 对 authenticated 会连管理员一起锁死，
--      且防不住未来策略放宽）。改为 BEFORE 触发器守卫 —— 非管理员对
--      food_restaurants 的 INSERT/DELETE 整体拒绝，UPDATE 时凡涉及
--      yuzu_rating/yuzu_note/yuzu_source/yuzu_updated_at/yuzu_updated_by/
--      is_featured/status 任一列变化即拒绝。数据库层硬保证，不依赖前端。
--   ③ 新增 food_restaurant_submissions 投稿表（Phase 2 用户投稿专用）：
--      用户只能插入 status='pending' 的自己的投稿，正式餐厅表的写权限不对用户放开。
--   ④ 显式 GRANT：anon 只给 SELECT；authenticated 给增删改（RLS 策略收紧行范围）；
--      投稿表按拥有者+管理员隔离。
--   ⑤ 全程幂等（IF NOT EXISTS / DROP IF EXISTS+重建 / ON CONFLICT DO NOTHING），
--      可重复执行；回滚只删 food_ 前缀对象，不触碰任何现有表。
--   ⑥ 现有三表/五地区/11菜系/11类别种子与前台后台代码不变。
-- ═══════════════════════════════════════════════════════════════════

-- ── ⓪ 执行前自检（本块只 SELECT，不修改任何东西；应返回如下结果）──
-- 自检1 应返回 1 行、值为 f（false）→ 函数存在且返回 boolean：
--   select public.shop_is_admin();
-- 自检2 应返回 prosecdef = t（SECURITY DEFINER）且 proconfig 含 search_path 限制：
--   select proname, prosecdef, proconfig from pg_proc where proname = 'shop_is_admin';
-- 两项都符合再继续执行下面的正文。

-- ── 1. food_regions 地区 ────────────────────────────────────────────
create table if not exists public.food_regions (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,          -- 'US' 'JP' 'TW' 'CN' 'CA' …（ISO 3166-1 alpha-2）
  name            text not null,                 -- English name
  name_zh         text not null default '',      -- 简中名
  currency_code   text not null default 'USD',   -- ISO 4217
  timezone_default text not null default 'UTC',  -- IANA 时区
  lang_local      text not null default 'en',    -- 当地主要语言
  map_center_lat  double precision not null default 20,
  map_center_lng  double precision not null default 0,
  map_zoom        int not null default 3,
  enabled         boolean not null default true,
  sort            int not null default 100,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── 2. food_categories 分类（菜系/食品类别）────────────────────────
create table if not exists public.food_categories (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('cuisine','food_type')),
  key        text not null,                      -- 程序用小写键 'chinese' 'hot_pot'
  label_en   text not null,
  label_zh   text not null default '',
  enabled    boolean not null default true,
  sort       int not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kind, key)
);

-- ── 3. food_restaurants 餐厅 ────────────────────────────────────────
create table if not exists public.food_restaurants (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,                -- 原始名称（当地语言）
  name_i18n        jsonb not null default '{}'::jsonb,  -- {"zh-Hans":"…","zh-Hant":"…","ja":"…"}
  slug             text not null unique,         -- URL 用，唯一
  description      text not null default '',
  description_i18n jsonb not null default '{}'::jsonb,
  country_code     text not null default '',
  country_name     text not null default '',
  region           text not null default '',
  state_or_province text not null default '',
  city             text not null default '',
  district         text not null default '',
  postal_code      text not null default '',
  address          text not null default '',     -- 当地语言地址
  address_en       text not null default '',     -- 可选英文地址
  latitude         double precision,
  longitude        double precision,
  phone            text not null default '',
  website          text not null default '',
  menu_url         text not null default '',
  cuisine          text[] not null default '{}',
  food_categories  text[] not null default '{}',
  price_level      smallint check (price_level between 1 and 4),
  average_price    numeric(12,2),
  currency_code    text not null default '',
  cover_image      text not null default '',
  images           jsonb not null default '[]'::jsonb,
  hours            jsonb not null default '{}'::jsonb,   -- 当地时间，按 timezone 显示
  timezone         text not null default '',
  parking          text not null default '',
  reservation      text not null default '',
  yuzu_rating      smallint check (yuzu_rating between 1 and 3),
  yuzu_note        text not null default '',
  yuzu_source      text not null default '',
  yuzu_updated_at  timestamptz,
  yuzu_updated_by  text not null default '',
  is_featured      boolean not null default false,
  status           text not null default 'published' check (status in ('published','hidden')),
  source           text not null default 'admin',        -- admin | csv | submissions(Phase 2 审核通过后)
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists food_restaurants_status_idx   on public.food_restaurants (status);
create index if not exists food_restaurants_country_idx  on public.food_restaurants (country_code);
create index if not exists food_restaurants_city_idx     on public.food_restaurants (lower(city));
create index if not exists food_restaurants_yuzu_idx     on public.food_restaurants (yuzu_rating) where yuzu_rating is not null;
create index if not exists food_restaurants_featured_idx on public.food_restaurants (is_featured) where is_featured;
create index if not exists food_restaurants_created_idx  on public.food_restaurants (created_at desc);

-- ── 4. food_restaurant_submissions 用户投稿（Phase 2 用；现在建好表和权限，
--      正式餐厅表不对普通用户放开写入）────────────────────────────────
create table if not exists public.food_restaurant_submissions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid(),        -- 提交人（JWT 注入，前端传值无效）
  user_email   text not null default '',
  payload      jsonb not null default '{}'::jsonb,      -- 投稿内容快照（餐厅字段结构）
  note         text not null default '',                -- 用户留言
  status       text not null default 'pending' check (status in ('pending','approved','rejected','hidden')),
  admin_note   text not null default '',                -- 审核备注（仅管理员可写）
  reviewed_at  timestamptz,
  reviewed_by  text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists food_submissions_user_idx    on public.food_restaurant_submissions (user_id);
create index if not exists food_submissions_status_idx  on public.food_restaurant_submissions (status);

-- ── 5. updated_at 自动维护 ──────────────────────────────────────────
create or replace function public.food_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists food_regions_touch on public.food_regions;
create trigger food_regions_touch before update on public.food_regions
  for each row execute function public.food_touch_updated_at();
drop trigger if exists food_categories_touch on public.food_categories;
create trigger food_categories_touch before update on public.food_categories
  for each row execute function public.food_touch_updated_at();
drop trigger if exists food_restaurants_touch on public.food_restaurants;
create trigger food_restaurants_touch before update on public.food_restaurants
  for each row execute function public.food_touch_updated_at();
drop trigger if exists food_submissions_touch on public.food_restaurant_submissions;
create trigger food_submissions_touch before update on public.food_restaurant_submissions
  for each row execute function public.food_touch_updated_at();

-- ── 6. 餐厅表写守卫（数据库层硬保护，不依赖 RLS 策略与前端）──────────
-- 非管理员：INSERT / DELETE 整体拒绝；UPDATE 时任一「官方字段」变化即拒绝。
-- 这样即使未来为 Phase 2 放宽 RLS，普通用户也碰不到官方评级/精选/状态，
-- 更不可能绕过审核直接往正式餐厅表写数据（投稿一律走 food_restaurant_submissions）。
create or replace function public.food_restaurants_admin_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.shop_is_admin() then
    if tg_op = 'INSERT' or tg_op = 'DELETE' then
      raise exception 'foodie: 只有管理员可以增删正式餐厅（用户投稿请走 food_restaurant_submissions）';
    end if;
    if new.yuzu_rating     is distinct from old.yuzu_rating
       or new.yuzu_note    is distinct from old.yuzu_note
       or new.yuzu_source  is distinct from old.yuzu_source
       or new.yuzu_updated_at is distinct from old.yuzu_updated_at
       or new.yuzu_updated_by is distinct from old.yuzu_updated_by
       or new.is_featured  is distinct from old.is_featured
       or new.status       is distinct from old.status then
      raise exception 'foodie: 官方评级/精选/状态只有管理员可以修改';
    end if;
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists food_restaurants_guard on public.food_restaurants;
create trigger food_restaurants_guard
  before insert or update or delete on public.food_restaurants
  for each row execute function public.food_restaurants_admin_guard();

-- 投稿表守卫：非管理员插入时强制 status='pending'、user_id 锁定为本人；
-- 非管理员不能改 status/admin_note（审核流转只有管理员能做）。
create or replace function public.food_submissions_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.shop_is_admin() then
    if tg_op = 'INSERT' then
      new.status = 'pending';
      new.user_id = auth.uid();
      new.admin_note = '';
      new.reviewed_at = null;
      new.reviewed_by = '';
      return new;
    end if;
    if tg_op = 'UPDATE' then
      if new.status is distinct from old.status
         or new.admin_note is distinct from old.admin_note
         or new.reviewed_at is distinct from old.reviewed_at
         or new.reviewed_by is distinct from old.reviewed_by then
        raise exception 'foodie: 投稿审核状态只有管理员可以修改';
      end if;
    end if;
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists food_submissions_guard on public.food_restaurant_submissions;
create trigger food_submissions_guard
  before insert or update on public.food_restaurant_submissions
  for each row execute function public.food_submissions_guard();

-- ── 7. GRANT（Supabase API 角色权限；行级范围仍由 RLS 收紧）──────────
-- 匿名：只读（地区/分类/已发布餐厅由 RLS 限定）
grant select on public.food_regions, public.food_categories, public.food_restaurants to anon;
grant select on public.food_restaurant_submissions to authenticated; -- 行范围由 RLS 限定（本人+管理员）
grant select on public.food_restaurant_submissions to anon;          -- RLS 会过滤成 0 行，保持 API 一致性
-- 登录用户：地区/分类/餐厅的增删改（RLS：仅管理员策略放行；投稿表限本人+pending）
grant insert, update, delete on public.food_regions, public.food_categories, public.food_restaurants to authenticated;
grant insert, update, delete on public.food_restaurant_submissions to authenticated;

-- ── 8. RLS 权限（任务书 §18）────────────────────────────────────────
alter table public.food_regions     enable row level security;
alter table public.food_categories  enable row level security;
alter table public.food_restaurants enable row level security;
alter table public.food_restaurant_submissions enable row level security;

-- 地区/分类：所有人可读启用的；管理员可写
drop policy if exists "food_regions_public_read" on public.food_regions;
create policy "food_regions_public_read" on public.food_regions
  for select to anon, authenticated using (enabled = true);
drop policy if exists "food_regions_admin_write" on public.food_regions;
create policy "food_regions_admin_write" on public.food_regions
  for all to authenticated using (public.shop_is_admin()) with check (public.shop_is_admin());

drop policy if exists "food_categories_public_read" on public.food_categories;
create policy "food_categories_public_read" on public.food_categories
  for select to anon, authenticated using (enabled = true);
drop policy if exists "food_categories_admin_write" on public.food_categories;
create policy "food_categories_admin_write" on public.food_categories
  for all to authenticated using (public.shop_is_admin()) with check (public.shop_is_admin());

-- 餐厅：公开只读「已发布」；管理员全权（RLS 层）+ 触发器守卫（第 6 节）双保险
drop policy if exists "food_restaurants_public_read" on public.food_restaurants;
create policy "food_restaurants_public_read" on public.food_restaurants
  for select to anon, authenticated using (status = 'published');
drop policy if exists "food_restaurants_admin_write" on public.food_restaurants;
create policy "food_restaurants_admin_write" on public.food_restaurants
  for all to authenticated using (public.shop_is_admin()) with check (public.shop_is_admin());

-- 投稿：本人插入（只能 pending）、本人可见、本人可撤回自己的待审投稿；管理员全权
drop policy if exists "food_submissions_insert" on public.food_restaurant_submissions;
create policy "food_submissions_insert" on public.food_restaurant_submissions
  for insert to authenticated with check (user_id = auth.uid() and status = 'pending');
drop policy if exists "food_submissions_select" on public.food_restaurant_submissions;
create policy "food_submissions_select" on public.food_restaurant_submissions
  for select to authenticated using (user_id = auth.uid() or public.shop_is_admin());
drop policy if exists "food_submissions_admin_update" on public.food_restaurant_submissions;
create policy "food_submissions_admin_update" on public.food_restaurant_submissions
  for update to authenticated using (public.shop_is_admin()) with check (public.shop_is_admin());
drop policy if exists "food_submissions_owner_withdraw" on public.food_restaurant_submissions;
create policy "food_submissions_owner_withdraw" on public.food_restaurant_submissions
  for delete to authenticated using (user_id = auth.uid() and status = 'pending');
drop policy if exists "food_submissions_admin_delete" on public.food_restaurant_submissions;
create policy "food_submissions_admin_delete" on public.food_restaurant_submissions
  for delete to authenticated using (public.shop_is_admin());

-- ── 9. 种子数据：五个首期地区（可随时 INSERT 扩展新国家）────────────
insert into public.food_regions (code, name, name_zh, currency_code, timezone_default, lang_local, map_center_lat, map_center_lng, map_zoom, sort) values
  ('US', 'United States',   '美国',     'USD', 'America/Los_Angeles', 'en', 39.5, -98.0,  4, 10),
  ('JP', 'Japan',           '日本',     'JPY', 'Asia/Tokyo',          'ja', 36.2, 138.2,  5, 20),
  ('TW', 'Taiwan',          '台湾',     'TWD', 'Asia/Taipei',         'zh-Hant', 23.7, 121.0, 7, 30),
  ('CN', 'Mainland China',  '中国大陆', 'CNY', 'Asia/Shanghai',       'zh-Hans', 35.0, 104.0,  4, 40),
  ('CA', 'Canada',          '加拿大',   'CAD', 'America/Toronto',     'en', 56.1, -106.3, 3, 50)
on conflict (code) do nothing;

-- 菜系（任务书 §六 Cuisine 11 类）
insert into public.food_categories (kind, key, label_en, label_zh, sort) values
  ('cuisine','chinese','Chinese','中餐',10),
  ('cuisine','japanese','Japanese','日料',20),
  ('cuisine','korean','Korean','韩餐',30),
  ('cuisine','american','American','美式',40),
  ('cuisine','mexican','Mexican','墨西哥菜',50),
  ('cuisine','thai','Thai','泰国菜',60),
  ('cuisine','italian','Italian','意大利菜',70),
  ('cuisine','vietnamese','Vietnamese','越南菜',80),
  ('cuisine','indian','Indian','印度菜',90),
  ('cuisine','french','French','法餐',100),
  ('cuisine','other','Other','其他',900)
on conflict (kind, key) do nothing;

-- 食品类别（任务书 §六 Food Type 11 类）
insert into public.food_categories (kind, key, label_en, label_zh, sort) values
  ('food_type','hot_pot','Hot Pot','火锅',10),
  ('food_type','bbq','BBQ','烧烤',20),
  ('food_type','sushi','Sushi','寿司',30),
  ('food_type','ramen','Ramen','拉面',40),
  ('food_type','dessert','Dessert','甜品',50),
  ('food_type','bakery','Bakery','烘焙',60),
  ('food_type','cafe','Cafe','咖啡店',70),
  ('food_type','fast_food','Fast Food','快餐',80),
  ('food_type','seafood','Seafood','海鲜',90),
  ('food_type','noodles','Noodles','面食',100),
  ('food_type','other','Other','其他',900)
on conflict (kind, key) do nothing;

-- ═══════════════════════════════════════════════════════════════════
-- 回滚方案（默认注释；只会删除 food_ 前缀对象——四个新表/触发器/守卫函数，
-- 不存在任何非 Foodie 的现有表或函数引用它们，cascade 不会波及其他数据）：
-- drop table if exists public.food_restaurant_submissions cascade;
-- drop table if exists public.food_restaurants cascade;
-- drop table if exists public.food_categories cascade;
-- drop table if exists public.food_regions cascade;
-- drop function if exists public.food_touch_updated_at();
-- drop function if exists public.food_restaurants_admin_guard();
-- drop function if exists public.food_submissions_guard();
-- ═══════════════════════════════════════════════════════════════════
