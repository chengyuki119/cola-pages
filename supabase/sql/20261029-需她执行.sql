-- ═══════════════════════════════════════════════════════════════
-- Snow Yuzu 2026-10-29 · 需要你亲自在 Supabase SQL Editor 跑的变更
-- 每段可单独跑；跑完告诉 Cola 验证
-- ═══════════════════════════════════════════════════════════════

-- ── ① 买家读取自己订单收款台账的只读 RPC（定金/尾款入口用）
-- 安全性：security definer 但内置校验 auth.uid() 必须是订单本人；
-- 只返回 kind/amount/verified/paid_at，不暴露 method/txn_ref/note。
create or replace function public.shop_my_order_pays(p_order_id uuid)
returns table (kind text, amount numeric, verified boolean, paid_at timestamptz)
language sql stable security definer set search_path = public as $$
  select r.kind, r.amount, r.verified, r.paid_at
  from shop_order_pay_records r
  where r.order_id = p_order_id
    and exists (
      select 1 from shop_orders o
      where o.id = p_order_id and o.user_id = auth.uid()
    )
  order by r.created_at asc;
$$;
grant execute on function public.shop_my_order_pays(uuid) to authenticated;
revoke execute on function public.shop_my_order_pays(uuid) from anon;

-- ── ② 【暂不跑】买家可见 admin_note 的隐私修复（等 Cola 通知再执行）
-- 现状：买家 REST 读自己订单时能看到 admin_note（管理员机密备注）。
-- 前台 UI 从不显示它，但网络包里有。修法 = 买家端订单读取改走安全 RPC，
-- 需要同步改前端；Cola 前端就绪后会通知你跑精简列版本，别提前跑这段。

-- create or replace function public.shop_my_orders()
-- returns table (...) -- 精简列版本待 Cola 提供
-- $$;
