-- ═══ 20261117 v2：柚子评级扩展到 1~5 颗 + 小柚的家 = 五颗柚子 ═══
-- v1 卡在 food_restaurants_guard 触发器：SQL Editor 里没有登录态，shop_is_admin() = false，
-- 官方评级字段的 update 被拦（P0001「官方评级/精选/状态只有管理员可以修改」）。
-- v2 做法：先临时停掉该触发器 → 改约束和评级 → 恢复触发器。前后台权限逻辑不受影响。
-- 在 Supabase SQL Editor 整段执行一次即可，可安全重跑。

-- ── 0. 临时停用官方字段保护触发器（SQL Editor 无登录态，shop_is_admin() 恒为 false） ──
alter table public.food_restaurants disable trigger food_restaurants_guard;

-- ── 1. 找到并删除 yuzu_rating 上的旧 check 约束（不管它叫什么名字） ──
do $$
declare r record;
begin
  for r in select conname from pg_constraint
           where conrelid = 'public.food_restaurants'::regclass
             and contype = 'c'
             and pg_get_constraintdef(oid) like '%yuzu_rating%'
  loop
    execute format('alter table public.food_restaurants drop constraint %I', r.conname);
  end loop;
end $$;

-- ── 2. 重建为 1~5 ──
alter table public.food_restaurants
  add constraint food_restaurants_yuzu_rating_check check (yuzu_rating between 1 and 5);

-- ── 3. 小柚的家 → 五颗柚子（只改这一行这一个字段） ──
update public.food_restaurants
  set yuzu_rating = 5
  where id = '09a921c5-afdb-4877-bb46-ea072436a1f2';

-- ── 4. 恢复保护触发器（必须执行，否则后台守卫失效） ──
alter table public.food_restaurants enable trigger food_restaurants_guard;

-- ── 5. 自检：应返回 5 ──
-- select name, yuzu_rating from public.food_restaurants where slug = 'yuki-home-irvine';
