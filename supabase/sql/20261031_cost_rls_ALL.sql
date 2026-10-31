-- ══════════════════════════════════════════════════════════════════════════
-- Snow Yuzu · 成本权限 + 全站 RLS（一份跑完）
-- 项目：ukxrvcptwhlwvdanovgd
--
-- 怎么用：
--   1. 打开 https://supabase.com/dashboard/project/ukxrvcptwhlwvdanovgd/sql/new
--   2. 全选本文件内容 → 粘贴进编辑框 → 点右下角 Run（或 Ctrl+Enter）
--   3. 最后会返回一张「自检结果表」，把它截图给柚子看
--
-- 这一份的性质：
--   · 整段一个事务：任何一句报错 → 全部回滚，数据库回到点 Run 之前的样子
--   · 可以重复跑：全是 create or replace / drop policy if exists / if not exists
--   · 不动任何业务数据：没有 update、没有 delete、不改价格、不改订单金额、
--     不改客户资料、不改收款流水、不改 products 表结构
--   · 只改「谁能读、谁能写」的权限与策略
--   · 成本只是「关门」，值一个都没动
--
-- 跑完之后会发生什么（预期行为，不是 bug）：
--   · 网站上任何人（含登录顾客）都无法再读到商品成本
--   · 后台「小铺上架」里的成本照常显示（走管理员专用接口）
--   · 顾客「我的订单」只显示自己的订单（以前是所有人都能看到全部订单）
--   · 顾客收藏、购物车、收货地址只属于自己
--   · 后台订单/客户/优惠券/成本模板照常全部可见可改
-- ══════════════════════════════════════════════════════════════════════════

begin;

-- ──────────────────────────────────────────────────────────────────────────
-- 0) 动手前先留底：把现在的 RLS 策略快照存一张表，只有 service_role 能读
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists public.rls_snapshot_20261031 as
select now() as snapshot_at, schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public';

alter table public.rls_snapshot_20261031 enable row level security;
revoke all on public.rls_snapshot_20261031 from anon, authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- 1) 判权用的三个函数（都用 security definer）
--    为什么必须包一层：RLS 策略里如果要判断「是不是管理员」「这单是不是我的」，
--    被调用的函数自己再去查表时，不能又被同一张表的策略拦住 —— 否则会变成
--    策略调函数 → 函数查表 → 表被策略拦 → 永远 false → 谁都看不到数据。
-- ──────────────────────────────────────────────────────────────────────────

-- 1.1 是不是管理员（包一层，免疫 RLS 递归）
create or replace function public.shop_is_admin_sd()
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select public.shop_is_admin() is true
$fn$;

revoke all on function public.shop_is_admin_sd() from public, anon;
grant execute on function public.shop_is_admin_sd() to authenticated, service_role;

-- 1.2 这一单是不是我的（三路认人：user_id / 客户档案 / 下单邮箱）
--     之所以三路：后台手动开的单可能没绑 user_id，但只要绑了客户档案或留了邮箱，
--     顾客本人也应该能看到自己的订单，不能因为历史数据写法不同就把人挡在外面。
create or replace function public.shop_can_see_order(
  p_user_id uuid,
  p_email text,
  p_customer_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select
    public.shop_is_admin() is true
    or (p_user_id is not null and p_user_id = auth.uid())
    or (coalesce(p_email, '') <> ''
        and lower(p_email) = lower(coalesce(auth.jwt() ->> 'email', '')))
    or (p_customer_id is not null and exists (
          select 1 from public.shop_customers c
          where c.id = p_customer_id
            and (c.user_id = auth.uid()
                 or (coalesce(c.email, '') <> ''
                     and lower(c.email) = lower(coalesce(auth.jwt() ->> 'email', ''))))
        ))
$fn$;

revoke all on function public.shop_can_see_order(uuid, text, uuid) from public, anon;
grant execute on function public.shop_can_see_order(uuid, text, uuid) to authenticated, service_role;

-- 1.3 某个订单号对应的订单是不是我的（给收款流水、订单留言这类「跟着订单走」的表用）
create or replace function public.shop_can_see_order_id(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1
    from public.shop_orders o
    where o.id = p_order_id
      and public.shop_can_see_order(o.user_id, o.email, o.customer_id)
  )
$fn$;

revoke all on function public.shop_can_see_order_id(uuid) from public, anon;
grant execute on function public.shop_can_see_order_id(uuid) to authenticated, service_role;

-- ──────────────────────────────────────────────────────────────────────────
-- 2) 成本关门：products.cost 只有管理员能读
--    Postgres 规定：表级 SELECT 权限包含所有列，单独 revoke 一列是无效的，
--    所以必须「撤表级 SELECT → 再按列逐列授予（cost 除外）」。
-- ──────────────────────────────────────────────────────────────────────────
revoke select on public.products from anon, authenticated;
revoke select on public.products from public;

grant select (
  id,
  name,
  price,
  description,
  description_en,
  tag,
  stock,
  sold,
  image_url,
  images,
  variants,
  display_only,
  weight_oz,
  created_at,
  currency
) on public.products to anon, authenticated;

-- 2.1 管理员读成本的唯一通道（前端后台调这个，不再直读 products.cost）
create or replace function public.shop_product_costs()
returns table (product_id uuid, cost numeric)
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  if public.shop_is_admin() is not true then
    return;   -- 不是管理员：返回空集，不报错，也不给数据
  end if;
  return query select p.id, p.cost from public.products p;
end
$fn$;

revoke all on function public.shop_product_costs() from public, anon;
grant execute on function public.shop_product_costs() to authenticated, service_role;

-- ──────────────────────────────────────────────────────────────────────────
-- 3) 邮件队列 email_log：匿名不能写，只有服务端和受信任接口能写
-- ──────────────────────────────────────────────────────────────────────────
alter table public.email_log enable row level security;

revoke insert, update, delete on public.email_log from anon, authenticated;
revoke all on public.email_log from anon;
grant select on public.email_log to authenticated;
grant all on public.email_log to service_role;

drop policy if exists el_admin_read on public.email_log;
create policy el_admin_read on public.email_log
  for select to authenticated
  using (public.shop_is_admin_sd());

-- 3.1 受信任的入队接口：后台所有邮件（邀请 / 欢迎 / VIP / 优惠券）都走它
create or replace function public.shop_mail_enqueue(
  p_kind text,
  p_to text,
  p_subject text,
  p_body text,
  p_ref text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_id uuid;
begin
  if public.shop_is_admin() is not true then
    raise exception '只有管理员可以投递邮件' using errcode = '42501';
  end if;
  if p_to is null or position('@' in p_to) < 2 then
    raise exception '收件邮箱不合法：%', p_to using errcode = '22023';
  end if;

  insert into public.email_log (kind, to_email, subject, body, status, ref_id)
  values (p_kind, p_to, p_subject, p_body, 'pending', p_ref)
  returning id into v_id;

  return v_id;
end
$fn$;

revoke all on function public.shop_mail_enqueue(text, text, text, text, text) from public, anon;
grant execute on function public.shop_mail_enqueue(text, text, text, text, text) to authenticated, service_role;

-- ──────────────────────────────────────────────────────────────────────────
-- 4) 管理员名单 / 优惠券 / 成本模板：匿名一律不给看
-- ──────────────────────────────────────────────────────────────────────────
alter table public.shop_admins enable row level security;
revoke all on public.shop_admins from anon;
grant select, insert, update, delete on public.shop_admins to authenticated;
drop policy if exists sa_admin_all on public.shop_admins;
create policy sa_admin_all on public.shop_admins
  for all to authenticated
  using (public.shop_is_admin_sd())
  with check (public.shop_is_admin_sd());

alter table public.shop_coupons enable row level security;
revoke all on public.shop_coupons from anon;
grant select, insert, update, delete on public.shop_coupons to authenticated;
drop policy if exists sc_admin_all on public.shop_coupons;
create policy sc_admin_all on public.shop_coupons
  for all to authenticated
  using (public.shop_is_admin_sd())
  with check (public.shop_is_admin_sd());

alter table public.shop_coupon_uses enable row level security;
revoke all on public.shop_coupon_uses from anon;
grant select, insert, update, delete on public.shop_coupon_uses to authenticated;
drop policy if exists scu_owner_read on public.shop_coupon_uses;
create policy scu_owner_read on public.shop_coupon_uses
  for select to authenticated
  using (user_id = auth.uid() or public.shop_is_admin_sd());
drop policy if exists scu_admin_write on public.shop_coupon_uses;
create policy scu_admin_write on public.shop_coupon_uses
  for all to authenticated
  using (public.shop_is_admin_sd())
  with check (public.shop_is_admin_sd());

alter table public.shop_cost_templates enable row level security;
revoke all on public.shop_cost_templates from anon;
grant select, insert, update, delete on public.shop_cost_templates to authenticated;
drop policy if exists sct_admin_all on public.shop_cost_templates;
create policy sct_admin_all on public.shop_cost_templates
  for all to authenticated
  using (public.shop_is_admin_sd())
  with check (public.shop_is_admin_sd());

-- ──────────────────────────────────────────────────────────────────────────
-- 5) 订单 / 收款 / 留言 / 地址 / 购物车 / 收藏 / 个人资料 / 客户档案
--    规则一句话：本人的数据本人能看，管理员全都能看，匿名一律不给。
-- ──────────────────────────────────────────────────────────────────────────

-- 5.1 订单
alter table public.shop_orders enable row level security;
revoke all on public.shop_orders from anon;
grant select, insert, update, delete on public.shop_orders to authenticated;

drop policy if exists so_read on public.shop_orders;
create policy so_read on public.shop_orders
  for select to authenticated
  using (public.shop_can_see_order(user_id, email, customer_id));

drop policy if exists so_insert on public.shop_orders;
create policy so_insert on public.shop_orders
  for insert to authenticated
  with check (public.shop_is_admin_sd() or user_id = auth.uid());

drop policy if exists so_update on public.shop_orders;
create policy so_update on public.shop_orders
  for update to authenticated
  using (public.shop_can_see_order(user_id, email, customer_id))
  with check (public.shop_can_see_order(user_id, email, customer_id));

drop policy if exists so_delete on public.shop_orders;
create policy so_delete on public.shop_orders
  for delete to authenticated
  using (public.shop_is_admin_sd());

-- 5.2 在线支付流水
alter table public.shop_payments enable row level security;
revoke all on public.shop_payments from anon;
grant select, insert, update, delete on public.shop_payments to authenticated;
drop policy if exists sp_by_order on public.shop_payments;
create policy sp_by_order on public.shop_payments
  for select to authenticated
  using (public.shop_can_see_order_id(order_id));
drop policy if exists sp_admin_write on public.shop_payments;
create policy sp_admin_write on public.shop_payments
  for all to authenticated
  using (public.shop_is_admin_sd())
  with check (public.shop_is_admin_sd());

-- 5.3 手动收款/退款记录
alter table public.shop_order_pay_records enable row level security;
revoke all on public.shop_order_pay_records from anon;
grant select, insert, update, delete on public.shop_order_pay_records to authenticated;
drop policy if exists sopr_by_order on public.shop_order_pay_records;
create policy sopr_by_order on public.shop_order_pay_records
  for select to authenticated
  using (public.shop_can_see_order_id(order_id));
drop policy if exists sopr_admin_write on public.shop_order_pay_records;
create policy sopr_admin_write on public.shop_order_pay_records
  for all to authenticated
  using (public.shop_is_admin_sd())
  with check (public.shop_is_admin_sd());

-- 5.4 订单留言
alter table public.shop_order_msgs enable row level security;
revoke all on public.shop_order_msgs from anon;
grant select, insert, update, delete on public.shop_order_msgs to authenticated;
drop policy if exists som_by_owner on public.shop_order_msgs;
create policy som_by_owner on public.shop_order_msgs
  for all to authenticated
  using (public.shop_is_admin_sd()
         or (user_id is not null and user_id = auth.uid())
         or public.shop_can_see_order_id(order_id))
  with check (public.shop_is_admin_sd()
              or (user_id is not null and user_id = auth.uid()));

-- 5.5 收货地址
alter table public.shop_addresses enable row level security;
revoke all on public.shop_addresses from anon;
grant select, insert, update, delete on public.shop_addresses to authenticated;
drop policy if exists sad_owner on public.shop_addresses;
create policy sad_owner on public.shop_addresses
  for all to authenticated
  using (public.shop_is_admin_sd() or (user_id is not null and user_id = auth.uid()))
  with check (public.shop_is_admin_sd() or (user_id is not null and user_id = auth.uid()));

-- 5.6 购物车
alter table public.shop_carts enable row level security;
revoke all on public.shop_carts from anon;
grant select, insert, update, delete on public.shop_carts to authenticated;
drop policy if exists sca_owner on public.shop_carts;
create policy sca_owner on public.shop_carts
  for all to authenticated
  using (public.shop_is_admin_sd() or (user_id is not null and user_id = auth.uid()))
  with check (public.shop_is_admin_sd() or (user_id is not null and user_id = auth.uid()));

-- 5.7 收藏
alter table public.shop_favorites enable row level security;
revoke all on public.shop_favorites from anon;
grant select, insert, update, delete on public.shop_favorites to authenticated;
drop policy if exists sfav_owner on public.shop_favorites;
create policy sfav_owner on public.shop_favorites
  for all to authenticated
  using (public.shop_is_admin_sd() or (user_id is not null and user_id = auth.uid()))
  with check (public.shop_is_admin_sd() or (user_id is not null and user_id = auth.uid()));

-- 5.8 顾客个人资料（id = 登录用户 id）
alter table public.shop_profiles enable row level security;
revoke all on public.shop_profiles from anon;
grant select, insert, update, delete on public.shop_profiles to authenticated;
drop policy if exists spr_owner on public.shop_profiles;
create policy spr_owner on public.shop_profiles
  for all to authenticated
  using (public.shop_is_admin_sd() or id = auth.uid())
  with check (public.shop_is_admin_sd() or id = auth.uid());

-- 5.9 客户档案（后台新增/合并走 RPC shop_customer_save，是 definer，不受这条限制）
alter table public.shop_customers enable row level security;
revoke all on public.shop_customers from anon;
grant select, insert, update, delete on public.shop_customers to authenticated;
drop policy if exists scus_self_read on public.shop_customers;
create policy scus_self_read on public.shop_customers
  for select to authenticated
  using (public.shop_is_admin_sd()
         or (user_id is not null and user_id = auth.uid())
         or (coalesce(email, '') <> ''
             and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))));
drop policy if exists scus_admin_write on public.shop_customers;
create policy scus_admin_write on public.shop_customers
  for all to authenticated
  using (public.shop_is_admin_sd())
  with check (public.shop_is_admin_sd());

-- ══════════════════════════════════════════════════════════════════════════
-- 6) 自检：跑完把这张表的结果发给柚子（每行都是数据库现场查的真实状态）
-- ══════════════════════════════════════════════════════════════════════════
select item, expect, actual, verdict from (
  select 1 as n, '匿名能读 products.cost？' as item, '不能' as expect,
    case when has_column_privilege('anon', 'public.products', 'cost', 'select') then '能 ❌' else '不能 ✅' end as actual,
    case when has_column_privilege('anon', 'public.products', 'cost', 'select') then 'FAIL' else 'PASS' end as verdict
  union all select 2, '普通顾客能读 products.cost？', '不能',
    case when has_column_privilege('authenticated', 'public.products', 'cost', 'select') then '能 ❌' else '不能 ✅' end,
    case when has_column_privilege('authenticated', 'public.products', 'cost', 'select') then 'FAIL' else 'PASS' end
  union all select 3, '匿名能读商品名/价格（商城要能用）？', '能',
    case when has_column_privilege('anon', 'public.products', 'name', 'select')
              and has_column_privilege('anon', 'public.products', 'price', 'select') then '能 ✅' else '不能 ❌' end,
    case when has_column_privilege('anon', 'public.products', 'name', 'select')
              and has_column_privilege('anon', 'public.products', 'price', 'select') then 'PASS' else 'FAIL' end
  union all select 4, '匿名还有 products 表级 SELECT（有=能 select=*）？', '没有',
    case when has_table_privilege('anon', 'public.products', 'select') then '还有 ❌' else '已撤 ✅' end,
    case when has_table_privilege('anon', 'public.products', 'select') then 'FAIL' else 'PASS' end
  union all select 5, '匿名能往 email_log 插数据？', '不能',
    case when has_table_privilege('anon', 'public.email_log', 'insert') then '能 ❌' else '不能 ✅' end,
    case when has_table_privilege('anon', 'public.email_log', 'insert') then 'FAIL' else 'PASS' end
  union all select 6, '匿名能读 shop_orders？', '不能',
    case when has_table_privilege('anon', 'public.shop_orders', 'select') then '能 ❌' else '不能 ✅' end,
    case when has_table_privilege('anon', 'public.shop_orders', 'select') then 'FAIL' else 'PASS' end
  union all select 7, '匿名能读 shop_customers（客户档案）？', '不能',
    case when has_table_privilege('anon', 'public.shop_customers', 'select') then '能 ❌' else '不能 ✅' end,
    case when has_table_privilege('anon', 'public.shop_customers', 'select') then 'FAIL' else 'PASS' end
  union all select 8, '匿名能读 shop_admins？', '不能',
    case when has_table_privilege('anon', 'public.shop_admins', 'select') then '能 ❌' else '不能 ✅' end,
    case when has_table_privilege('anon', 'public.shop_admins', 'select') then 'FAIL' else 'PASS' end
  union all select 9, '匿名能读 shop_cost_templates（成本模板）？', '不能',
    case when has_table_privilege('anon', 'public.shop_cost_templates', 'select') then '能 ❌' else '不能 ✅' end,
    case when has_table_privilege('anon', 'public.shop_cost_templates', 'select') then 'FAIL' else 'PASS' end
) t
order by n;

-- 6.1 每张表的 RLS 开关 + 策略条数（一眼看出有没有漏网）
select t.tablename,
       (select relrowsecurity from pg_class c where c.oid = ('public.' || t.tablename)::regclass) as rls_on,
       (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = t.tablename) as policies
from (values
  ('products'), ('email_log'), ('shop_admins'), ('shop_coupons'), ('shop_coupon_uses'),
  ('shop_cost_templates'), ('shop_orders'), ('shop_payments'), ('shop_order_pay_records'),
  ('shop_order_msgs'), ('shop_addresses'), ('shop_carts'), ('shop_favorites'),
  ('shop_profiles'), ('shop_customers')
) as t(tablename)
order by t.tablename;

-- 6.2 四个判权函数是否都建好了
select p.proname as function_name,
       pg_get_function_identity_arguments(p.oid) as args,
       case when p.prosecdef then 'security definer ✅' else '⚠ 不是 definer' end as security
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('shop_is_admin_sd', 'shop_can_see_order', 'shop_can_see_order_id',
                    'shop_product_costs', 'shop_mail_enqueue')
order by p.proname;

commit;

-- ══════════════════════════════════════════════════════════════════════════
-- 7) 回退（只有出问题时才用：整段选中 → Run，立刻退回现在的样子）
--    回退不会删任何数据，只是把「谁能读」放开回原样。
-- ══════════════════════════════════════════════════════════════════════════
-- begin;
-- grant select on public.products to anon, authenticated;
-- drop policy if exists el_admin_read on public.email_log;
-- drop policy if exists sa_admin_all on public.shop_admins;
-- drop policy if exists sc_admin_all on public.shop_coupons;
-- drop policy if exists scu_owner_read on public.shop_coupon_uses;
-- drop policy if exists scu_admin_write on public.shop_coupon_uses;
-- drop policy if exists sct_admin_all on public.shop_cost_templates;
-- drop policy if exists so_read on public.shop_orders;
-- drop policy if exists so_insert on public.shop_orders;
-- drop policy if exists so_update on public.shop_orders;
-- drop policy if exists so_delete on public.shop_orders;
-- drop policy if exists sp_by_order on public.shop_payments;
-- drop policy if exists sp_admin_write on public.shop_payments;
-- drop policy if exists sopr_by_order on public.shop_order_pay_records;
-- drop policy if exists sopr_admin_write on public.shop_order_pay_records;
-- drop policy if exists som_by_owner on public.shop_order_msgs;
-- drop policy if exists sad_owner on public.shop_addresses;
-- drop policy if exists sca_owner on public.shop_carts;
-- drop policy if exists sfav_owner on public.shop_favorites;
-- drop policy if exists spr_owner on public.shop_profiles;
-- drop policy if exists scus_self_read on public.shop_customers;
-- drop policy if exists scus_admin_write on public.shop_customers;
-- alter table public.email_log disable row level security;
-- alter table public.shop_admins disable row level security;
-- alter table public.shop_coupons disable row level security;
-- alter table public.shop_coupon_uses disable row level security;
-- alter table public.shop_cost_templates disable row level security;
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
--   public.shop_favorites, public.shop_profiles, public.shop_customers,
--   public.shop_admins, public.shop_coupons, public.shop_coupon_uses,
--   public.shop_cost_templates, public.email_log to anon, authenticated;
-- drop function if exists public.shop_can_see_order_id(uuid);
-- drop function if exists public.shop_can_see_order(uuid, text, uuid);
-- drop function if exists public.shop_product_costs();
-- drop function if exists public.shop_mail_enqueue(text, text, text, text, text);
-- drop function if exists public.shop_is_admin_sd();
-- commit;
