-- ══════════════════════════════════════════════════════════════════════
-- Snow Yuzu · 阶段一：成本权限（products.cost）+ 后台/邮件/优惠券表 RLS
-- 项目：ukxrvcptwhlwvdanovgd
-- 执行位置：Supabase 控制台 → 左侧 SQL Editor → New query → 整段粘贴 → Run
-- 特性：
--   · 整段包在一个事务里：任何一步报错 → 全部回滚，不会留下半成品
--   · 幂等：重复跑不会报错（create or replace / drop policy if exists）
--   · 不动任何业务数据：不 update、不 delete、不改价格、不改订单
--   · 不动 products 的表结构：只调「谁能读哪一列」的权限
-- 跑完会返回一张「自检结果表」，把每一项的实际状态打出来
-- ══════════════════════════════════════════════════════════════════════

begin;

-- ── 0) 先留一份现有 RLS 策略快照（万一要回退，能查到原来长什么样）
create table if not exists public.rls_snapshot_20261031 as
select now() as snapshot_at, schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public';
alter table public.rls_snapshot_20261031 enable row level security;
revoke all on public.rls_snapshot_20261031 from anon, authenticated;  -- 只有 service_role 能看

-- ── 1) 管理员判定包一层 definer
--    原因：RLS 策略里如果要判断「是不是管理员」，调用的函数本身不能再被 RLS 拦住，
--    否则会出现「策略调函数 → 函数查表 → 表被策略拦 → 永远返回 false → 谁都看不到」。
create or replace function public.shop_is_admin_sd()
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select public.shop_is_admin() is true
$fn$;
revoke all on function public.shop_is_admin_sd() from anon;
grant execute on function public.shop_is_admin_sd() to authenticated, service_role;

-- ── 2) products.cost 关门：匿名和普通顾客都不能再读成本
--    Postgres 规则：表级 SELECT 权限含所有列，只 revoke 单列是无效的，
--    所以必须「撤表级 → 按列重新授予（除 cost 外全部）」。
revoke select on public.products from anon, authenticated;
grant select (
  id, name, price, description, description_en, tag, stock, sold,
  image_url, images, variants, display_only, weight_oz, created_at, currency
) on public.products to anon, authenticated;

-- ── 3) 管理员读成本的唯一通道（前端后台调它，不再直读 products.cost）
create or replace function public.shop_product_costs()
returns table (product_id uuid, cost numeric)
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  if public.shop_is_admin() is not true then
    return;   -- 非管理员：返回空集，不报错也不给数据
  end if;
  return query select p.id, p.cost from public.products p;
end
$fn$;
revoke all on function public.shop_product_costs() from anon;
grant execute on function public.shop_product_costs() to authenticated, service_role;

-- ── 4) email_log：只允许服务端（service_role）和受信任 RPC 写入
alter table public.email_log enable row level security;
revoke insert, update, delete on public.email_log from anon, authenticated;
grant select on public.email_log to authenticated;
drop policy if exists el_admin_read on public.email_log;
create policy el_admin_read on public.email_log
  for select to authenticated
  using (public.shop_is_admin_sd());

-- ── 4b) 受信任的入队接口：后台邮件统一走它（管理员邀请 / 后续欢迎信 / 优惠券信）
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
declare v_id uuid;
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
revoke all on function public.shop_mail_enqueue(text, text, text, text, text) from anon;
grant execute on function public.shop_mail_enqueue(text, text, text, text, text) to authenticated, service_role;

-- ── 5) shop_admins：管理员名单，匿名一律不给看
alter table public.shop_admins enable row level security;
revoke all on public.shop_admins from anon;
grant select, insert, update, delete on public.shop_admins to authenticated;
drop policy if exists sa_admin_all on public.shop_admins;
create policy sa_admin_all on public.shop_admins
  for all to authenticated
  using (public.shop_is_admin_sd())
  with check (public.shop_is_admin_sd());

-- ── 6) 优惠券：匿名不可读；管理员可管；顾客只能看到自己的使用记录
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

-- ── 7) 成本模板：里面有物料成本明细，按成本同级别保护
alter table public.shop_cost_templates enable row level security;
revoke all on public.shop_cost_templates from anon;
grant select, insert, update, delete on public.shop_cost_templates to authenticated;
drop policy if exists sct_admin_all on public.shop_cost_templates;
create policy sct_admin_all on public.shop_cost_templates
  for all to authenticated
  using (public.shop_is_admin_sd())
  with check (public.shop_is_admin_sd());

-- ══════════════════════════════════════════════════════════════════════
-- 自检：跑完把这张表的结果截图给我（每一行都是现场查出来的真实状态）
-- ══════════════════════════════════════════════════════════════════════
select item, expect, actual, verdict from (
  select 1 as n, 'products.cost 匿名可读？' as item, '不可读' as expect,
    case when has_column_privilege('anon', 'public.products', 'cost', 'select')
         then '仍可读 ❌' else '不可读 ✅' end as actual,
    case when has_column_privilege('anon', 'public.products', 'cost', 'select')
         then 'FAIL' else 'PASS' end as verdict
  union all
  select 2, 'products.cost 普通顾客可读？', '不可读',
    case when has_column_privilege('authenticated', 'public.products', 'cost', 'select')
         then '仍可读 ❌' else '不可读 ✅' end,
    case when has_column_privilege('authenticated', 'public.products', 'cost', 'select')
         then 'FAIL' else 'PASS' end
  union all
  select 3, 'products.name 匿名可读？（商城要能卖货）', '可读',
    case when has_column_privilege('anon', 'public.products', 'name', 'select')
         then '可读 ✅' else '不可读 ❌' end,
    case when has_column_privilege('anon', 'public.products', 'name', 'select')
         then 'PASS' else 'FAIL' end
  union all
  select 4, 'products 匿名是否还有表级 SELECT（有=能 select=*）', '没有',
    case when has_table_privilege('anon', 'public.products', 'select')
         then '仍有 ❌' else '已撤 ✅' end,
    case when has_table_privilege('anon', 'public.products', 'select')
         then 'FAIL' else 'PASS' end
  union all
  select 5, 'email_log 匿名可插？', '不可插',
    case when has_table_privilege('anon', 'public.email_log', 'insert')
         then '仍可插 ❌' else '不可插 ✅' end,
    case when has_table_privilege('anon', 'public.email_log', 'insert')
         then 'FAIL' else 'PASS' end
  union all
  select 6, 'email_log 已开 RLS？', '已开',
    case when (select relrowsecurity from pg_class where oid = 'public.email_log'::regclass)
         then '已开 ✅' else '未开 ❌' end,
    case when (select relrowsecurity from pg_class where oid = 'public.email_log'::regclass)
         then 'PASS' else 'FAIL' end
  union all
  select 7, 'shop_admins 已开 RLS？', '已开',
    case when (select relrowsecurity from pg_class where oid = 'public.shop_admins'::regclass)
         then '已开 ✅' else '未开 ❌' end,
    case when (select relrowsecurity from pg_class where oid = 'public.shop_admins'::regclass)
         then 'PASS' else 'FAIL' end
  union all
  select 8, 'shop_coupons 已开 RLS？', '已开',
    case when (select relrowsecurity from pg_class where oid = 'public.shop_coupons'::regclass)
         then '已开 ✅' else '未开 ❌' end,
    case when (select relrowsecurity from pg_class where oid = 'public.shop_coupons'::regclass)
         then 'PASS' else 'FAIL' end
  union all
  select 9, 'shop_cost_templates 已开 RLS？', '已开',
    case when (select relrowsecurity from pg_class where oid = 'public.shop_cost_templates'::regclass)
         then '已开 ✅' else '未开 ❌' end,
    case when (select relrowsecurity from pg_class where oid = 'public.shop_cost_templates'::regclass)
         then 'PASS' else 'FAIL' end
  union all
  select 10, '管理员成本接口是否已建？', '已建',
    case when exists (select 1 from pg_proc where proname = 'shop_product_costs')
         then '已建 ✅' else '没有 ❌' end,
    case when exists (select 1 from pg_proc where proname = 'shop_product_costs')
         then 'PASS' else 'FAIL' end
  union all
  select 11, '邮件入队接口是否已建？', '已建',
    case when exists (select 1 from pg_proc where proname = 'shop_mail_enqueue')
         then '已建 ✅' else '没有 ❌' end,
    case when exists (select 1 from pg_proc where proname = 'shop_mail_enqueue')
         then 'PASS' else 'FAIL' end
  union all
  select 12, '管理员判定包装函数是否已建？', '已建',
    case when exists (select 1 from pg_proc where proname = 'shop_is_admin_sd')
         then '已建 ✅' else '没有 ❌' end,
    case when exists (select 1 from pg_proc where proname = 'shop_is_admin_sd')
         then 'PASS' else 'FAIL' end
) t
order by n;

commit;

-- ══════════════════════════════════════════════════════════════════════
-- 回退（只有出问题时才用；整段复制，单独 Run）
-- ══════════════════════════════════════════════════════════════════════
-- begin;
-- grant select on public.products to anon, authenticated;          -- 恢复成本可读
-- drop policy if exists el_admin_read on public.email_log;
-- drop policy if exists sa_admin_all on public.shop_admins;
-- drop policy if exists sc_admin_all on public.shop_coupons;
-- drop policy if exists scu_owner_read on public.shop_coupon_uses;
-- drop policy if exists scu_admin_write on public.shop_coupon_uses;
-- drop policy if exists sct_admin_all on public.shop_cost_templates;
-- alter table public.email_log disable row level security;
-- alter table public.shop_admins disable row level security;
-- alter table public.shop_coupons disable row level security;
-- alter table public.shop_coupon_uses disable row level security;
-- alter table public.shop_cost_templates disable row level security;
-- grant insert, update, delete on public.email_log to anon, authenticated;
-- drop function if exists public.shop_product_costs();
-- drop function if exists public.shop_mail_enqueue(text, text, text, text, text);
-- drop function if exists public.shop_is_admin_sd();
-- commit;
