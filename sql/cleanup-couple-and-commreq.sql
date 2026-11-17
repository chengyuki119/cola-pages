-- ═══ 清理 20261117：情侣模式（Our Little World）+ 定制申请表 全部删除 ═══
-- 她 20261117 15:03 拍板：情侣模式全删；works 页定制申请表单删除。
-- 六张表当时均为 0 行，无数据损失。在 Supabase SQL Editor 整段执行一次即可，可安全重跑。

-- ── 1. 情侣模式：先删函数（带参数签名），再删表（策略/触发器随表一起消失） ──
drop function if exists public.couple_create_space(text);
drop function if exists public.couple_create_invite();
drop function if exists public.couple_accept_invite(text);
drop function if exists public.couple_cancel_invite(text);
drop function if exists public.couple_unbind();
drop function if exists public.couple_member_of(uuid);
drop function if exists public.couple_space_of_mine();
drop function if exists public.couple_members_guard();
drop function if exists public.couple_rows_guard();

drop table if exists public.couple_presence;
drop table if exists public.couple_permissions;
drop table if exists public.couple_invites;
drop table if exists public.couple_members;
drop table if exists public.couple_spaces;

-- ── 2. 定制申请：触发器函数 + 表 ──
drop function if exists public.commission_requests_touch();
drop table if exists public.commission_requests;

-- ── 3. 自检（应全部返回 0） ──
-- select count(*) from pg_tables where schemaname='public' and tablename like 'couple_%';
-- select count(*) from pg_tables where schemaname='public' and tablename='commission_requests';
-- select count(*) from pg_proc where proname like 'couple_%' or proname='commission_requests_touch';
