-- ══════════════════════════════════════════════════════════════════════════
-- Snow Yuzu · 管理员邀请邮件 · 最小必要迁移
-- 项目：ukxrvcptwhlwvdanovgd
--
-- 【这份脚本只碰一张表：public.email_log】
--   · 不碰 products / shop_orders / shop_customers / shop_payments
--   · 不碰任何订单金额、收款流水、顾客资料
--   · 不碰上一轮那 15 张表的 RLS（那些已经生效，不用重跑）
--   · 没有任何 update / delete 业务数据
--
-- 它做两件事：
--   1. 给 email_log 补一个 last_error 列 —— Worker 发信失败时就是往这一列写原因，
--      缺了这一列，状态更新会静默失败，页面上永远停在「发送中」。
--   2. 建一个管理员专用的「安全重试」接口 shop_mail_retry()，
--      让失败的信能被重新排队，而不是让前端直接改表。
--
-- 跑法：Supabase → SQL Editor → 整段粘贴 → Run
-- 跑完会返回三张表：列清单、迁移结果、函数确认。请把这三张表贴回来。
-- ══════════════════════════════════════════════════════════════════════════

-- ── A. 迁移前的现场（只读，先看清现在有什么）──────────────────────────────
select '迁移前 email_log 的列' as step, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'email_log'
order by ordinal_position;

-- ══════════════════════════════════════════════════════════════════════════
begin;

-- ── B1. 补 last_error（已经在就跳过，重复跑无害）──────────────────────────
alter table public.email_log add column if not exists last_error text;

-- ── B2. 管理员专用的安全重试接口 ─────────────────────────────────────────
--     规则：只有管理员能调；只把这一封改回「待发送」并清零重试次数；
--           不发邮件、不改收件人、不改正文，改完由 Worker 下一轮真正去发。
create or replace function public.shop_mail_retry(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_n int;
begin
  if public.shop_is_admin() is not true then
    raise exception '只有管理员可以重试发信' using errcode = '42501';
  end if;

  update public.email_log
     set status = 'pending',
         attempts = 0,
         last_error = null,
         sent_at = null
   where id = p_id
     and status in ('failed', 'dead', 'pending', 'sending');

  get diagnostics v_n = row_count;
  return v_n > 0;
end
$fn$;

revoke all on function public.shop_mail_retry(uuid) from public, anon;
grant execute on function public.shop_mail_retry(uuid) to authenticated, service_role;

-- ── B3. 邀请记录用的键（存在就跳过，只是保证读得到）──────────────────────
insert into public.site_settings (key, value)
values ('admin_invites', '[]')
on conflict (key) do nothing;

commit;

-- ══════════════════════════════════════════════════════════════════════════
-- C. 迁移后的自检（只读）
-- ══════════════════════════════════════════════════════════════════════════
select '迁移后 email_log 的列' as step, column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'email_log'
order by ordinal_position;

select 'last_error 是否就位' as item,
       case when exists (select 1 from information_schema.columns
                         where table_schema='public' and table_name='email_log'
                           and column_name='last_error')
            then 'PASS ✅ 已就位' else 'FAIL ❌ 还是缺' end as verdict;

select 'shop_mail_retry 是否就位' as item,
       case when exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                         where n.nspname='public' and p.proname='shop_mail_retry')
            then 'PASS ✅ 已就位' else 'FAIL ❌ 没有' end as verdict;

select 'email_log 现在有几封' as item, count(*)::text || ' 封' as verdict
from public.email_log;

-- ══════════════════════════════════════════════════════════════════════════
-- D. 顺便把「判权函数的真实写法」捞出来（只读，最容易漏看的一段）
--    为什么需要：邀请要新建只读管理员，我必须先看清 shop_admins.role 到底认什么值，
--    否则可能出现「只读管理员拿到全部权限」或「根本进不去」两种坏结果。
-- ══════════════════════════════════════════════════════════════════════════
select p.proname, pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('shop_is_admin', 'shop_is_admin_readonly',
                    'shop_admin_password_pending', 'shop_admin_finish_password',
                    'email_pick_batch')
order by p.proname;

select 'shop_admins 现状' as item, user_id::text, role, created_at
from public.shop_admins;

select '已安装扩展' as item, extname, extversion
from pg_extension
where extname in ('pg_cron', 'pg_net');

-- ══════════════════════════════════════════════════════════════════════════
-- E. 回退（几乎用不到，因为只加了一列和一个函数，不删列也能继续跑）
-- ══════════════════════════════════════════════════════════════════════════
-- begin;
-- drop function if exists public.shop_mail_retry(uuid);
-- commit;
