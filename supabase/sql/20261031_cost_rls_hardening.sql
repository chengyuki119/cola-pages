-- ══════════════════════════════════════════════════════════════════════════
-- Snow Yuzu · 补丁：把 5 个判权函数的默认执行权收回（1 分钟，6 句）
--
-- 为什么还要补这一刀：
--   PostgreSQL 建函数时会自动把 EXECUTE 授给 PUBLIC（也就是"所有人"）。
--   主脚本里我只 revoke 了 anon，所以匿名仍然"能调到" shop_product_costs，
--   只是函数内部判断"你不是管理员 → 返回空集"，数据一点没漏 ——
--   实测证据：匿名调 shop_mail_enqueue 被内部拦下，返回
--   {"code":"42501","message":"只有管理员可以投递邮件"}，说明内部检查是真的在工作。
--   但权限层面不该留这道虚掩的门，所以补一句 revoke ... from public。
--
-- 执行方式：和主脚本一样 —— 复制全文 → Supabase SQL Editor → Run
-- 影响：只改"谁能调这几个函数"，不动数据、不动策略、不影响商城
-- ══════════════════════════════════════════════════════════════════════════

begin;

revoke all on function public.shop_is_admin_sd()                             from public, anon;
revoke all on function public.shop_can_see_order(uuid, text, uuid)           from public, anon;
revoke all on function public.shop_can_see_order_id(uuid)                    from public, anon;
revoke all on function public.shop_product_costs()                           from public, anon;
revoke all on function public.shop_mail_enqueue(text, text, text, text, text) from public, anon;

-- 管理员/服务端照常可用（重复授权是幂等的）
grant execute on function public.shop_is_admin_sd()                              to authenticated, service_role;
grant execute on function public.shop_can_see_order(uuid, text, uuid)            to authenticated, service_role;
grant execute on function public.shop_can_see_order_id(uuid)                     to authenticated, service_role;
grant execute on function public.shop_product_costs()                            to authenticated, service_role;
grant execute on function public.shop_mail_enqueue(text, text, text, text, text) to authenticated, service_role;

-- 自检：anon 这五列应该全是 can_execute = false
select p.proname as function_name,
       has_function_privilege('anon', p.oid, 'execute') as anon_can_execute,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can_execute,
       case when has_function_privilege('anon', p.oid, 'execute') then 'FAIL ❌' else 'PASS ✅' end as verdict
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('shop_is_admin_sd', 'shop_can_see_order', 'shop_can_see_order_id',
                    'shop_product_costs', 'shop_mail_enqueue')
order by p.proname;

commit;
