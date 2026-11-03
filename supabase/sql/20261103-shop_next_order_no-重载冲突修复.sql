-- ════════════════════════════════════════════════════════════════════════════
-- Snow Yuzu · shop_next_order_no 重载冲突修复（下单报 42725 function is not unique）
-- 文件：supabase/sql/20261103-shop_next_order_no-重载冲突修复.sql
-- 日期：2026-11-03
--
-- 症状（测试号实测复现）：带规格下单 RPC 直接报
--   42725 function public.shop_next_order_no() is not unique
-- 根因：库里 shop_next_order_no 有多个同名不同参的重载（历史版本残留 + 昨天
--   重建时旧版定义又被建回来），shop_place_order 里无参调用 `shop_next_order_no()`
--   时 Postgres 分不清该用哪个 → 直接报错，整个下单链路被卡死。
-- 修法：只删掉已无人调用的老重载 shop_next_order_no(p_test boolean)，
--   保留「无参（统一分配器版，管理员）」和「(p_kind text)（POS 等老调用方在用）」。
--   幂等可重复执行；不动任何数据、不动订单号序列。
-- ════════════════════════════════════════════════════════════════════════════

do $$
declare r record; n int := 0;
begin
  for r in
    select p.oid, pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'shop_next_order_no'
       and pg_get_function_identity_arguments(p.oid) = 'p_test boolean'
  loop
    execute format('drop function public.shop_next_order_no(%s)', r.args);
    n := n + 1;
    raise notice '已删除老重载 shop_next_order_no(%)', r.args;
  end loop;
  if n = 0 then raise notice '没有需要删除的老重载（可能已删过）'; end if;
end $$;

-- ── 自检 1：跑完看剩下的重载列表，应该只剩「(空)」和「p_kind text」两种 ──────
select pg_get_function_identity_arguments(p.oid) as 重载参数,
       p.proname
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'shop_next_order_no'
 order by 1;

-- ── 自检 2：无参调用候选必须恰好 1 个，expected = true 即修复生效 ────────────
select (count(*) = 1)::text as expected
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'shop_next_order_no'
   and (pg_get_function_identity_arguments(p.oid) = ''
        or pg_get_function_identity_arguments(p.oid) like '%default%');
