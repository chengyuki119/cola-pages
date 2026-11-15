-- ═══════════════════════════════════════════════════════════════════
-- Snow Yuzu · Foodie Map 全球美食地图 — Phase 1 Migration
-- 日期: 2026-11-14 · 由柚子本人在 Supabase SQL Editor 执行
--
-- 内容: food_regions(地区) / food_categories(分类) / food_restaurants(餐厅)
--       + RLS 权限 + 种子数据(五国地区+菜系/食品类别)
-- 原则: 不动任何现有表; 全部新表以 food_ 前缀隔离; 管理员权限复用现有
--       public.shop_is_admin()(Security Definer, 读 shop_admins)。
-- 回滚: 见文件末尾「回滚方案」(注释状态, 需要时取消注释执行)。
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. food_regions 地区 ────────────────────────────────────────────
-- 全球可扩展: 新国家只要 INSERT 一行, 前台/地图/货币/时区全部跟随, 不写死。
create table if not exists public.food_regions (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,          -- 'US' 'JP' 'TW' 'CN' 'CA' …(ISO 3166-1 alpha-2, TW/CN 按任务书区分)
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

-- ── 2. food_categories 分类(菜系/食品类别) ─────────────────────────
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
-- 字段对齐任务书 §14.1; 多语言名称/介绍用 *_i18n jsonb 可扩展结构;
-- 图片 images jsonb 数组(第一张=封面); 营业时间 hours jsonb(当地时间, 按 timezone 显示)。
create table if not exists public.food_restaurants (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,                -- 原始名称(当地语言)
  name_i18n        jsonb not null default '{}'::jsonb,  -- {"zh-Hans":"…","zh-Hant":"…","ja":"…"}
  slug             text not null unique,         -- URL 用, 唯一
  description      text not null default '',     -- 原始语言介绍
  description_i18n jsonb not null default '{}'::jsonb,
  country_code     text not null default '',     -- 关联 food_regions.code(不设外键, 允许先建餐厅后建地区)
  country_name     text not null default '',
  region           text not null default '',     -- 大区/洲(如 California / Kanto)
  state_or_province text not null default '',
  city             text not null default '',
  district         text not null default '',
  postal_code      text not null default '',     -- ZIP / 邮编 / 邮递区号
  address          text not null default '',     -- 当地语言地址
  address_en       text not null default '',     -- 可选英文地址
  latitude         double precision,
  longitude        double precision,
  phone            text not null default '',
  website          text not null default '',
  menu_url         text not null default '',
  cuisine          text[] not null default '{}',         -- food_categories.key(cuisine) 数组
  food_categories  text[] not null default '{}',         -- food_categories.key(food_type) 数组
  price_level      smallint check (price_level between 1 and 4),  -- $ ~ $$$$
  average_price    numeric(12,2),
  currency_code    text not null default '',     -- 价格原始货币(空=跟地区默认)
  cover_image      text not null default '',
  images           jsonb not null default '[]'::jsonb,   -- ["url1","url2",…]
  hours            jsonb not null default '{}'::jsonb,   -- {"mon":[["11:00","14:00"],["17:00","21:30"]],…} 当地时间
  timezone         text not null default '',     -- IANA; 空则回退地区默认
  parking          text not null default '',
  reservation      text not null default '',
  yuzu_rating      smallint check (yuzu_rating between 1 and 3),  -- NULL=未评级; 普通用户不可写(RLS 保证)
  yuzu_note        text not null default '',     -- 官方推荐理由
  yuzu_source      text not null default '',     -- 推荐来源
  yuzu_updated_at  timestamptz,
  yuzu_updated_by  text not null default '',     -- 操作管理员邮箱
  is_featured      boolean not null default false,       -- Editor's Picks 精选
  status           text not null default 'published' check (status in ('published','hidden')),
  source           text not null default 'admin',        -- admin | csv | user(Phase 2)
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists food_restaurants_status_idx   on public.food_restaurants (status);
create index if not exists food_restaurants_country_idx  on public.food_restaurants (country_code);
create index if not exists food_restaurants_city_idx     on public.food_restaurants (lower(city));
create index if not exists food_restaurants_yuzu_idx     on public.food_restaurants (yuzu_rating) where yuzu_rating is not null;
create index if not exists food_restaurants_featured_idx on public.food_restaurants (is_featured) where is_featured;
create index if not exists food_restaurants_created_idx  on public.food_restaurants (created_at desc);

-- updated_at 自动维护
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

-- ── 4. RLS 权限(任务书 §18) ────────────────────────────────────────
alter table public.food_regions     enable row level security;
alter table public.food_categories  enable row level security;
alter table public.food_restaurants enable row level security;

-- 地区/分类: 所有人可读启用的; 管理员可写
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

-- 餐厅: 公开只读「已发布」; 管理员全权(含隐藏)
drop policy if exists "food_restaurants_public_read" on public.food_restaurants;
create policy "food_restaurants_public_read" on public.food_restaurants
  for select to anon, authenticated using (status = 'published');
drop policy if exists "food_restaurants_admin_read" on public.food_restaurants;
create policy "food_restaurants_admin_read" on public.food_restaurants
  for select to authenticated using (public.shop_is_admin());
drop policy if exists "food_restaurants_admin_write" on public.food_restaurants;
create policy "food_restaurants_admin_write" on public.food_restaurants
  for all to authenticated using (public.shop_is_admin()) with check (public.shop_is_admin());
-- 硬红线: yuzu_rating 系列字段只有管理员能改 —— 上面 policy 已保证(非管理员对餐厅
-- 无任何 update 权限), 这里再加一层列级守护: 即使未来放开普通用户评价, 柚子评级也不会外泄。
revoke update (yuzu_rating, yuzu_note, yuzu_source, yuzu_updated_at, yuzu_updated_by, is_featured, status)
  on public.food_restaurants from anon;

-- ── 5. 种子数据: 五个首期地区(可随时 INSERT 扩展新国家) ────────────
insert into public.food_regions (code, name, name_zh, currency_code, timezone_default, lang_local, map_center_lat, map_center_lng, map_zoom, sort) values
  ('US', 'United States',   '美国',     'USD', 'America/Los_Angeles', 'en', 39.5, -98.0,  4, 10),
  ('JP', 'Japan',           '日本',     'JPY', 'Asia/Tokyo',          'ja', 36.2, 138.2,  5, 20),
  ('TW', 'Taiwan',          '台湾',     'TWD', 'Asia/Taipei',         'zh-Hant', 23.7, 121.0, 7, 30),
  ('CN', 'Mainland China',  '中国大陆', 'CNY', 'Asia/Shanghai',       'zh-Hans', 35.0, 104.0,  4, 40),
  ('CA', 'Canada',          '加拿大',   'CAD', 'America/Toronto',     'en', 56.1, -106.3, 3, 50)
on conflict (code) do nothing;

-- 菜系(任务书 §六 Cuisine 11 类)
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

-- 食品类别(任务书 §六 Food Type 11 类)
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
-- 回滚方案(默认注释; 需要整体撤销时取消注释执行):
-- drop table if exists public.food_restaurants cascade;
-- drop table if exists public.food_categories cascade;
-- drop table if exists public.food_regions cascade;
-- drop function if exists public.food_touch_updated_at();
-- ═══════════════════════════════════════════════════════════════════
