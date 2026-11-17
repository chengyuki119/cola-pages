-- ═══ 清理 20261117 v2：情侣模式（Our Little World）+ 定制申请表 全部删除 ═══
-- v2 修正：必须先删表再删函数——RLS 策略和触发器依赖这些函数，
-- 先删函数会报 2BP01（dependent objects）。表删掉时策略/触发器随之消失，之后再删函数就干净了。
-- 六张表均为 0 行，无数据损失。整段执行一次即可，可安全重跑。

-- ── 1. 先删表（RLS 策略、触发器随表一起消失） ──
drop table if exists public.couple_presence;
drop table if exists public.couple_permissions;
drop table if exists public.couple_invites;
drop table if exists public.couple_members;
drop table if exists public.couple_spaces;
drop table if exists public.commission_requests;

-- ── 2. 再删函数（此时已无依赖） ──
drop function if exists public.couple_create_space(text);
drop function if exists public.couple_create_invite();
drop function if exists public.couple_accept_invite(text);
drop function if exists public.couple_cancel_invite(text);
drop function if exists public.couple_unbind();
drop function if exists public.couple_member_of(uuid);
drop function if exists public.couple_space_of_mine();
drop function if exists public.couple_members_guard();
drop function if exists public.couple_rows_guard();
drop function if exists public.commission_requests_touch();

-- ── 3. 自检（应全部返回 0） ──
-- select count(*) from pg_tables where schemaname='public' and (tablename like 'couple_%' or tablename='commission_requests');
-- select count(*) from pg_proc where proname like 'couple_%' or proname='commission_requests_touch';
