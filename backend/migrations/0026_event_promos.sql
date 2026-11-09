-- Texts and choices of the promo page (flyers, posters, social media pictures) of a
-- bazaar, shared by its organizers. Plain JSON: only the app reads it, the bazaar's data
-- stays in `events`.
CREATE TABLE event_promos (
  event_id uuid PRIMARY KEY REFERENCES events (id) ON DELETE CASCADE,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users (id) ON DELETE SET NULL,
  promo jsonb NOT NULL
);
