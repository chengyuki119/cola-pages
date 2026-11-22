-- Roll back the 2026-11-22 transfer-sticker merge using the durable private snapshot.
-- Run only if no sticker orders have been placed since the merge. This restores all 11
-- original product rows and each original cost-row parent association. It does not touch
-- Storage objects, orders, payments, or the backup table/private-note schema.
BEGIN;
DO $rollback$
DECLARE
  b public.shop_sticker_merge_backup%ROWTYPE;
BEGIN
  SELECT * INTO b
  FROM public.shop_sticker_merge_backup
  WHERE run_key='sticker-series-merge-20261122';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The pre-merge snapshot was not found; refusing to run rollback.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.shop_orders o
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(o.items)='array' THEN o.items ELSE '[]'::jsonb END
    ) AS i(value)
    WHERE i.value->>'sku' IN (
      SELECT v.value->>'sku'
      FROM jsonb_array_elements(b.products_snapshot) p(value)
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(p.value->'variants')='array' THEN p.value->'variants' ELSE '[]'::jsonb END
      ) v(value)
    )
  ) THEN
    RAISE EXCEPTION 'Sticker orders exist after the merge; rollback could break live order-to-product matching. Stop for manual review.';
  END IF;

  -- Restore original parent rows first so cost foreign keys can be reassigned safely.
  INSERT INTO public.products
  SELECT (jsonb_populate_record(NULL::public.products, p.value)).*
  FROM jsonb_array_elements(b.products_snapshot) AS p(value)
  ON CONFLICT (id) DO UPDATE SET
    name=EXCLUDED.name,
    price=EXCLUDED.price,
    description=EXCLUDED.description,
    tag=EXCLUDED.tag,
    image_url=EXCLUDED.image_url,
    sold=EXCLUDED.sold,
    stock=EXCLUDED.stock,
    cost=EXCLUDED.cost,
    display_only=EXCLUDED.display_only,
    created_at=EXCLUDED.created_at,
    images=EXCLUDED.images,
    variants=EXCLUDED.variants,
    weight_oz=EXCLUDED.weight_oz,
    currency=EXCLUDED.currency,
    description_en=EXCLUDED.description_en,
    name_en=EXCLUDED.name_en,
    cover_zh=EXCLUDED.cover_zh,
    cover_en=EXCLUDED.cover_en,
    unit=EXCLUDED.unit,
    sku=EXCLUDED.sku,
    category=EXCLUDED.category,
    name_raw=EXCLUDED.name_raw,
    name_match=EXCLUDED.name_match;

  UPDATE public.shop_variant_costs c
  SET product_id=(x.value->>'product_id')::uuid,
      cost=(x.value->>'cost')::numeric,
      updated_at=(x.value->>'updated_at')::timestamptz
  FROM jsonb_array_elements(b.costs_snapshot) AS x(value)
  WHERE c.variant_sku=x.value->>'variant_sku';

  UPDATE public.shop_variant_private_notes n
  SET product_id=(x.value->>'product_id')::uuid,
      updated_at=now()
  FROM jsonb_array_elements(b.costs_snapshot) AS x(value)
  WHERE n.variant_sku=x.value->>'variant_sku'
    AND n.merge_key='sticker-series-merge-20261122';
END
$rollback$;
COMMIT;
