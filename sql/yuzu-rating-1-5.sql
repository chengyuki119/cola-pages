-- ═══ 20261117：柚子评级扩展到 1~5 颗 + 小柚的家 = 五颗柚子 ═══
-- 她 20261117 15:26 指定。原约束 yuzu_rating between 1 and 3，先解绑再重建为 1~5，
-- 然后把「小柚的家」（yuki-home-irvine）评为 5 颗柚子。只动评级约束和这一行的评级值。
-- 在 Supabase SQL Editor 整段执行一次即可，可安全重跑。

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

-- ── 4. 自检：应返回 5 ──
-- select name, yuzu_rating from public.food_restaurants where slug = 'yuki-home-irvine';
