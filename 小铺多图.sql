-- 小铺多图：给 products 加 images 列（jsonb 数组）
-- Supabase SQL Editor 运行一次；运行前后台都能用（没跑之前会自动降级只存主图）
alter table products add column if not exists images jsonb;
