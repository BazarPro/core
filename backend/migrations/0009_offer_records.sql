-- Who offered what at a bazaar (#169): taken when the team accepts an item on site, so the
-- proof of offers no longer depends on the product. Sellers may delete their items, and the
-- retention cron deletes the records (after the settlement, with fixedSellerData after the
-- end of the year + RETENTION_SELLER_RECORD_YEARS).

CREATE TABLE offer_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  -- NULL once the seller or the retention cron deleted the product
  product_id uuid REFERENCES products (id) ON DELETE SET NULL,
  seller_id uuid NOT NULL REFERENCES users (id),
  title text NOT NULL,
  category_id uuid REFERENCES categories (id) ON DELETE SET NULL,
  category_label text,
  -- Category specific fields, e.g. the frame number
  attributes jsonb,
  price numeric(12, 2) NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, product_id)
);
CREATE INDEX offer_records_seller_idx ON offer_records (event_id, seller_id);

ALTER TABLE purchases
  ADD COLUMN offer_record_id uuid REFERENCES offer_records (id) ON DELETE SET NULL;

-- Backfill; the same as seller_records::backfill_snapshots, which the Convex import runs.
INSERT INTO offer_records (event_id, product_id, seller_id, title, category_id, category_label,
                           attributes, price, accepted_at)
SELECT ep.event_id, p.id, p.vendor_id, p.title, p.category_id, c.label, p.attributes, p.price,
       ep.created_at
FROM event_products ep JOIN products p ON p.id = ep.product_id
LEFT JOIN categories c ON c.id = p.category_id
WHERE ep.status <> 'announced'
ON CONFLICT (event_id, product_id) DO NOTHING;

UPDATE purchases pu SET offer_record_id = r.id
FROM offer_records r
WHERE r.event_id = pu.event_id AND r.product_id = pu.product_id AND pu.offer_record_id IS NULL;

-- Seller details are recorded at the first accepted item now, not at the announcement:
-- sellers of coming bazaars with nothing accepted yet may correct them again.
UPDATE event_sellers s SET seller_snapshot = NULL
FROM events e
WHERE e.id = s.event_id AND e.end_date >= now() AND s.seller_snapshot IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM offer_records r WHERE r.event_id = s.event_id AND r.seller_id = s.user_id)
  AND NOT EXISTS (SELECT 1 FROM purchases pu WHERE pu.event_id = s.event_id AND pu.seller_id = s.user_id);
