-- ═══════════════════════════════════════════════════════════
--  她 20261102：商品双语（英文名 + 中英封面）
--  幂等可重复执行，数据零改动。跑完后后台立即生效：
--    · 英文名 / 中文封面 / English 封面 可以保存
--    · 英文页显示英文名+英文封面，中文页显示中文
--  ═══════════════════════════════════════════════════════════
alter table public.products add column if not exists name_en text;
alter table public.products add column if not exists cover_zh text;
alter table public.products add column if not exists cover_en text;

-- 验证（结果区应有三行）：
select column_name from information_schema.columns
where table_name = 'products' and column_name in ('name_en','cover_zh','cover_en');
