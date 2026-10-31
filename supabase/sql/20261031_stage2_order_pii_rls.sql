-- ══════════════════════════════════════════════════════════════════════
-- Snow Yuzu · 阶段二：订单 / 客户 / 收货 / 购物车 的 RLS（真正锁住顾客隐私）
-- 项目：ukxrvcptwhlwvdanovgd
-- ⚠ 先跑阶段一（20261031_stage1_cost_rls.sql）并确认通过，再跑这一份。
-- ⚠ 这一份会改变「顾客能看到哪些订单」，跑完必须当场验证两件事：
--     ① 你自己的管理员账号还能看到全部订单
--     ② 一个普通顾客登录后只能看到自己的订单
--    验证不通过就用文件末尾的回退段，一条命令退回原样。
-- 前提：阶段一已经建好 public.shop_is_admin_sd()
-- ══════════════════════════════════════════════════════════════════════

begin;

-- ── 1) 订单：本人可见；管理员全可见
alter table public.shop_orders enable row level security;
revoke all on public.shop_orders from anon;
grant select, insert, update, delete on public.shop_orders to authenticated;
drop policy if exists so_self_read on public.shop_orders;
create policy so_self_read on public.shop_orders
  for select to authenticated
  using (user_id = auth.uid() or public.shop_is_admin_sd());
drop policy if exists so_self_write on public.shop_orders;
create policy so_self_write on public.shop_orders
  for update to authenticated
  using (user_id = auth.uid() or public.shop_is_admin_sd())
  with check (user_id = auth.uid() or public.shop_is_admin_sd());
drop policy if exists so_admin_insert on public.shop_orders;
create policy so_admin_insert on public.shop_orders
  for insert to authenticated
  with check (user_id = auth.uid() or public.shop_is_admin_sd());
drop policy if exists so_admin_delete on public.shop_orders;
create policy so_admin_delete on public.shop_orders
  for delete to authenticated
  using (public.shop_is_admin_sd());

-- ── 2) 收款流水 / 手动收款记录：跟着订单走
alter table public.shop_payments enable row level security;
revoke all on public.shop_payments from anon;
grant select, insert, update, delete on public.shop_payments to authenticated;
drop policy if exists sp_by_order on public.shop_payments;
create policy sp_by_order on public.shop_payments
  for all to authenticated
  using (public.shop_is_admin_sd() or exists (
    select 1 from public.shop_orders o
    where o.id = shop_payments.order_id and o.user_id = auth.uid()))
  with check (public.shop_is_admin_sd());

alter table public.shop_order_pay_records enable row level security;
revoke all on public.shop_order_pay_records from anon;
grant select, insert, update, delete on public.shop_order_pay_records to authenticated;
drop policy if exists sopr_by_order on public.shop_order_pay_records;
create policy sopr_by_order on public.shop_order_pay_records
  for all to authenticated
  using (public.shop_is_admin_sd() or exists (
    select 1 from public.shop_orders o
    where o.id = shop_order_pay_records.order_id and o.user_id = auth.uid()))
  with check (public.shop_is_admin_sd());

-- ── 3) 订单留言：本人 + 管理员
alter table public.shop_order_msgs enable row level security;
revoke all on public.shop_order_msgs from anon;
grant select, insert, update, delete on public.shop_order_msgs to authenticated;
drop policy if exists som_by_owner on public.shop_order_msgs;
create policy som_by_owner on public.shop_order_msgs
  for all to authenticated
  using (public.shop_is_admin_sd() or user_id = auth.uid())
  with check (public.shop_is_admin_sd() or user_id = auth.uid());

-- ── 4) 收货地址：本人
alter table public.shop_addresses enable row level security;
revoke all on public.shop_addresses from anon;
grant select, insert, update, delete on public.shop_addresses to authenticated;
drop policy if exists sad_owner on public.shop_addresses;
create policy sad_owner on public.shop_addresses
  for all to authenticated
  using (public.shop_is_admin_sd() or user_id = auth.uid())
  with check (public.shop_is_admin_sd() or user_id = auth.uid());

-- ── 5) 购物车：本人
alter table public.shop_carts enable row level security;
revoke all on public.shop_carts from anon;
grant select, insert, update, delete on public.shop_carts to authenticated;
drop policy if exists sca_owner on public.shop_carts;
create policy sca_owner on public.shop_carts
  for all to authenticated
  using (public.shop_is_admin_sd() or user_id = auth.uid())
  with check (public.shop_is_admin_sd() or user_id = auth.uid());

-- ── 6) 收藏：本人
alter table public.shop_favorites enable row level security;
revoke all on public.shop_favorites from anon;
grant select, insert, update, delete on public.shop_favorites to authenticated;
drop policy if exists sfav_owner on public.shop_favorites;
create policy sfav_owner on public.shop_favorites
  for all to authenticated
  using (public.shop_is_admin_sd() or user_id = auth.uid())
  with check (public.shop_is_admin_sd() or user_id = auth.uid());

-- ── 7) 顾客资料：本人（id = auth.uid()）
alter table public.shop_profiles enable row level security;
revoke all on public.shop_profiles from anon;
grant select, insert, update, delete on public.shop_profiles to authenticated;
drop policy if exists spr_owner on public.shop_profiles;
create policy spr_owner on public.shop_profiles
  for all to authenticated
  using (public.shop_is_admin_sd() or id = auth.uid())
  with check (public.shop_is_admin_sd() or id = auth.uid());

-- ── 8) 客户档案：本人（按 user_id 或邮箱）+ 管理员
--    后台新增/合并客户走 RPC shop_customer_save（definer），不受这条限制。
alter table public.shop_customers enable row level security;
revoke all on public.shop_customers from anon;
grant select, insert, update, delete on public.shop_customers to authenticated;
drop policy if exists scu_self on public.shop_customers;
create policy scu_self on public.shop_customers
  for select to authenticated
  using (public.shop_is_admin_sd()
         or user_id = auth.uid()
         or lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));
drop policy if exists scu_admin_write on public.shop_customers;
create policy scu_admin_write on public.shop_customers
  for all to authenticated
  using (public.shop_is_admin_sd())
  with check (public.shop_is_admin_sd());

-- ══════════════════════════════════════════════════════════════════════
-- 自检
-- ══════════════════════════════════════════════════════════════════════
select tablename,
       (select relrowsecurity from pg_class c
         where c.oid = ('public.' || tablename)::regclass) as rls_on,
       (select count(*) from pg_policies p
         where p.schemaname = 'public' and p.tablename = t.tablename) as policies,
       has_table_privilege('anon', 'public.' || tablename, 'select') as anon_can_select
from (values ('shop_orders'), ('shop_payments'), ('shop_order_pay_records'),
             ('shop_order_msgs'), ('shop_addresses'), ('shop_carts'),
             ('shop_favorites'), ('shop_profiles'), ('shop_customers')) as t(tablename);

commit;

-- ══════════════════════════════════════════════════════════════════════
-- 回退（验证不通过时整段 Run，立刻退回「谁都能读」的原状）
-- ══════════════════════════════════════════════════════════════════════
-- begin;
-- alter table public.shop_orders disable row level security;
-- alter table public.shop_payments disable row level security;
-- alter table public.shop_order_pay_records disable row level security;
-- alter table public.shop_order_msgs disable row level security;
-- alter table public.shop_addresses disable row level security;
-- alter table public.shop_carts disable row level security;
-- alter table public.shop_favorites disable row level security;
-- alter table public.shop_profiles disable row level security;
-- alter table public.shop_customers disable row level security;
-- grant all on public.shop_orders, public.shop_payments, public.shop_order_pay_records,
--   public.shop_order_msgs, public.shop_addresses, public.shop_carts,
--   public.shop_favorites, public.shop_profiles, public.shop_customers to anon, authenticated;
-- commit;
