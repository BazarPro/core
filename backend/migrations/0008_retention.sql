-- Deadlines for events, items and old data (#169). A daily cron (modules::retention) moves
-- every event through its phases by end_date; these mark the steps that are done.

ALTER TABLE events
  -- Sold items deleted after the settlement period, with their images, questions and offers
  ADD COLUMN products_purged_at timestamptz,
  -- Images, texts, messages and storage locations deleted; the event is only for its team
  ADD COLUMN content_purged_at timestamptz;

-- A deleted item goes for good; its sale keeps what the settlement needs (#167). Items the
-- sellers deleted before were only archived. Their images are left to the upload cleanup.
DELETE FROM products WHERE archived_at IS NOT NULL;
ALTER TABLE products DROP COLUMN archived_at;
