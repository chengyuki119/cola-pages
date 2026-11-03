-- ═══════════════════════════════════════════════════════════════════
-- 她 20261103 02:40「为什么上传中文英文标签图一直失败」根因修复 SQL
-- 根因（Cola 实测定位）：
--   products 表在今天被重建过（旧数据 4 件商品没了，只剩你刚上架的「瑕疵贴纸款」）。
--   重建后的表缺一批后来加的列（name_en / cover_zh / cover_en / description_en /
--   unit / sku / category / currency / images / variants / weight_oz …），
--   而且缺 anon 的 SELECT 授权和 RLS 策略——所以：
--     · 后台上架/保存商品 → 数据库拒绝写入（42501 permission denied）→「一直失败」
--     · 中英封面/英文名/英文介绍保存不进去 → 前台看不到双语
-- 本脚本全部用 IF NOT EXISTS / DROP POLICY IF EXISTS，重复跑没有副作用，
-- 不会动你已有的任何数据行。整段复制进 Supabase SQL Editor 跑一次即可。
-- ═══════════════════════════════════════════════════════════════════

-- ① 补齐缺失的列（已有的列会自动跳过）
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS images jsonb;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS variants jsonb;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS weight_oz numeric(10,1);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS currency text DEFAULT 'USD' NOT NULL;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS description_en text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS name_en text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS cover_zh text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS cover_en text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS unit text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sku text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS cost numeric;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS display_only boolean DEFAULT false NOT NULL;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sold boolean DEFAULT false NOT NULL;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS stock integer DEFAULT 1;

-- ② 授权（后台登录账号可写，前台访客可读）——「permission denied」就是缺这两条
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON public.products TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.products TO authenticated;

-- ③ RLS 策略（g12 结构迁移同款；RLS 没开也不影响）
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth manage products" ON public.products;
DROP POLICY IF EXISTS "public read products" ON public.products;
CREATE POLICY "auth manage products" ON public.products FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "public read products" ON public.products FOR SELECT TO public USING (true);

-- ④ 自检：全部 true 才算修好（在 SQL Editor 里应输出 expected 全 true）
SELECT
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='name_en')      AS col_name_en,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='cover_zh')    AS col_cover_zh,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='cover_en')    AS col_cover_en,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='description_en') AS col_desc_en,
  EXISTS (SELECT 1 FROM pg_catalog.pg_tables WHERE schemaname='public' AND tablename='products')                                        AS table_ok;
