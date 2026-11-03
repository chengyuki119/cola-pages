-- ═══════════════════════════════════════════════════════════
--  她 20261102：商品名称支持双语输入
--  给 products 加 name_en 列（幂等，可重复执行）。数据零改动。
--  跑之前：后台已可正常保存中文名（英文名会先存不了并提示，
--  跑完这一句后英文名立即生效，不用再动代码）。
-- ═══════════════════════════════════════════════════════════
alter table public.products add column if not exists name_en text;

-- 验证（结果区应能看到 name_en）：
select column_name from information_schema.columns
where table_name = 'products' and column_name = 'name_en';
