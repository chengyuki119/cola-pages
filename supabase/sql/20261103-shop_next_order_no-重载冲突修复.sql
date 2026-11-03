-- ════════════════════════════════════════════════════════════════════════════
-- Snow Yuzu · shop_next_order_no 重载冲突修复·第 2 步（终稿）
-- 文件：supabase/sql/20261103-shop_next_order_no-重载冲突修复.sql
-- 日期：2026-11-03
--
-- 背景：上一条只删了最老的 (p_test boolean) 重载，但库里还有
--   ① shop_next_order_no()          ——无参版（统一分配器，前台/后台建单在用）
--   ② shop_next_order_no(p_kind text DEFAULT 'main') ——g12 老版（POS、订单导入在用）
-- ② 带着 DEFAULT，所以无参调用依旧分不清用哪个 → 42725 下单仍然卡死。
-- 修法：②原样重建但去掉 DEFAULT。POS / 订单导入都是显式传参不受影响；
--   无参调用从此唯一命中①。不动数据、不动序列、幂等可重复跑。
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. 再兜一遍底：若有 (p_test boolean) 残留（不管带不带参数名）都删掉 ──────
do $$
declare r record;
begin
  for r in
    select p.oid, pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'shop_next_order_no'
       and pg_get_function_identity_arguments(p.oid) in ('p_test boolean', 'boolean')
  loop
    execute format('drop function public.shop_next_order_no(%s)', r.args);
    raise notice '已删除老重载 shop_next_order_no(%)', r.args;
  end loop;
end $$;

-- ── 2. (p_kind text) 版：先 DROP 再重建（42P13：CREATE OR REPLACE 不能去掉已有 DEFAULT）──
drop function if exists public.shop_next_order_no(text);
create function public.shop_next_order_no(p_kind text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_key text; v_prefix text; v_n int;
BEGIN
  v_key := upper(p_kind); v_prefix := 'SY-';
  IF p_kind = 'test' THEN v_prefix := 'SY-TEST-';
  ELSIF p_kind = 'pos' THEN v_prefix := 'SY-POS-';
  ELSIF p_kind = 'pos_test' THEN v_prefix := 'SY-POS-TEST-'; END IF;
  IF NOT (p_kind IN ('main','test','pos','pos_test')) THEN
    v_key := 'MAIN'; v_prefix := 'SY-';
  END IF;
  PERFORM pg_advisory_xact_lock(920251);
  INSERT INTO public.shop_order_seq(day, last_no) VALUES (v_key, 0) ON CONFLICT (day) DO NOTHING;
  SELECT GREATEST(s.last_no,
    COALESCE((SELECT MAX((substring(o.order_no from '^' || v_prefix || '([0-9]{3,})$'))::int)
      FROM public.shop_orders o WHERE o.order_no ~ ('^' || v_prefix || '[0-9]{3,}$')), 0))
  INTO v_n FROM public.shop_order_seq s WHERE s.day = v_key FOR UPDATE;
  v_n := v_n + 1;
  UPDATE public.shop_order_seq SET last_no = v_n WHERE day = v_key;
  RETURN v_prefix || lpad(v_n::text, 3, '0');
END $function$;

-- 重建后授权（DROP 会把旧授权一并删掉）
grant execute on function public.shop_next_order_no(text) to authenticated, service_role;

-- ── 自检 1：剩下的重载列表，应该恰好两行：「(空)」和「p_kind text」 ──────────
select pg_get_function_identity_arguments(p.oid) as 重载参数
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'shop_next_order_no'
 order by 1;

-- ── 自检 2：能零参调用的候选必须恰好 1 个，expected = true 即修复生效 ─────────
select (count(*) = 1)::text as expected
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'shop_next_order_no'
   and pg_get_function_arguments(p.oid) like '%default%';
