-- Schema of BazarPro, carried over from convex/schema.ts.
--
-- Conventions:
--   * Primary keys are UUIDs. legacy_id keeps the Convex document ID of imported rows,
--     so references and links from emails can be resolved during the import.
--   * Convex stores times as milliseconds; here they are timestamptz.
--   * Amounts in euros are numeric(12,2), percentages numeric(5,2) (no float rounding).
--   * Nested Convex objects with a fixed shape become columns (moderation, logistics);
--     optional settings with many fields stay jsonb (features, notification_prefs).
--   * Arrays of IDs become join tables, so they have foreign keys.

-- Enums, mirroring convex/constants.ts --------------------------------------------------

CREATE TYPE user_status AS ENUM ('notVerified', 'active', 'inactive', 'deleted', 'banned');
CREATE TYPE system_role AS ENUM ('admin', 'user');
CREATE TYPE locale AS ENUM ('de', 'en');
CREATE TYPE product_condition AS ENUM ('new', 'very-good', 'good', 'ok');
CREATE TYPE event_product_status AS ENUM ('announced', 'available', 'sold', 'returned');
CREATE TYPE event_role_kind AS ENUM ('organizer', 'coorganizer', 'seller');
CREATE TYPE event_visibility AS ENUM ('public', 'logged-in', 'approved');
CREATE TYPE event_service AS ENUM ('Parkplatz', 'Skiservice', 'Gastronomie', 'Imbiss', 'Getränke');
CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE offer_status AS ENUM ('pending', 'accepted', 'rejected', 'withdrawn', 'redeemed');
CREATE TYPE offer_close_reason AS ENUM ('sale', 'return', 'removed', 'expired');
CREATE TYPE notice_area AS ENUM ('products', 'sales', 'messages', 'events');
CREATE TYPE purchase_price_source AS ENUM ('list', 'offer', 'negotiated');
CREATE TYPE report_target AS ENUM ('product', 'event', 'question', 'user');
CREATE TYPE report_reason AS ENUM ('illegal', 'fraud', 'offensive', 'personalData', 'spam', 'other');
CREATE TYPE report_status AS ENUM ('open', 'resolved', 'dismissed');
CREATE TYPE moderation_action AS ENUM (
  'hideProduct', 'restoreProduct', 'hideEvent', 'restoreEvent', 'deleteQuestion',
  'banUser', 'unbanUser', 'approveEvent', 'rejectEvent', 'resolveReport', 'dismissReport'
);
CREATE TYPE broadcast_audience AS ENUM ('all', 'accepted', 'pickup');
CREATE TYPE site_page_slug AS ENUM ('imprint', 'privacy', 'terms');
CREATE TYPE start_page AS ENUM ('overview', 'currentEvent');

-- Files (replaces Convex _storage) ------------------------------------------------------

/** Uploaded files; the bytes live in the S3 bucket under storage_key. */
CREATE TABLE files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id text UNIQUE,
  storage_key text NOT NULL UNIQUE,
  content_type text,
  size_bytes bigint,
  sha256 text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Users and authentication --------------------------------------------------------------

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),

  name text,
  image text,
  email text,
  email_verified_at timestamptz,
  phone text,
  phone_verified_at timestamptz,
  is_anonymous boolean,

  first_name text,
  last_name text,
  street text,
  city text,
  zip_code text,
  country text,
  verification_token text,
  is_mail_confirmed boolean,
  status user_status,
  last_login_at timestamptz,
  system_role system_role,

  needs_onboarding boolean,

  check_in_token text UNIQUE,
  check_in_token_expires_at timestamptz,

  -- Walk-in sellers: accounts an organizer creates on site for people without login.
  -- They cannot sign in; contact_email is only used for notifications.
  managed_by_event_id uuid, -- FK added below, events references users
  contact_email text,

  -- Emails the user switched off (false); missing categories are on
  notification_prefs jsonb NOT NULL DEFAULT '{}',
  -- Secret for the unsubscribe link in emails, created with the first such email
  unsubscribe_token text UNIQUE,
  locale locale
);
CREATE INDEX users_email_idx ON users (lower(email));
CREATE INDEX users_system_role_idx ON users (system_role);
CREATE INDEX users_status_idx ON users (status);

/** One row per sign-in method of a user (password, OTP, GitHub, Google). */
CREATE TABLE auth_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id text UNIQUE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_account_id text NOT NULL,
  -- Password hash; imported accounts keep the Lucia scrypt format "salt:hash"
  secret text,
  email_verified text,
  phone_verified text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_account_id)
);
CREATE INDEX auth_accounts_user_idx ON auth_accounts (user_id, provider);

/** Login sessions; the cookie holds the token, the database only its SHA-256. */
CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash bytea NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions (user_id);
CREATE INDEX sessions_expires_idx ON sessions (expires_at);

/** One-time codes for email sign-in and password reset. */
CREATE TABLE verification_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES auth_accounts (id) ON DELETE CASCADE,
  provider text NOT NULL,
  code_hash bytea NOT NULL,
  email_verified text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX verification_codes_account_idx ON verification_codes (account_id);
CREATE INDEX verification_codes_code_idx ON verification_codes (code_hash);

/** Failed sign-in attempts per identifier (email), against guessing codes and passwords. */
CREATE TABLE auth_rate_limits (
  identifier text PRIMARY KEY,
  attempts_left integer NOT NULL,
  last_attempt_at timestamptz NOT NULL
);

/** Sign-in codes the E2E tests read instead of an inbox. */
CREATE TABLE e2e_auth_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX e2e_auth_tokens_email_idx ON e2e_auth_tokens (email);

-- Catalog -------------------------------------------------------------------------------

CREATE TABLE categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id text UNIQUE,
  label text NOT NULL,
  parent_id uuid REFERENCES categories (id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX categories_label_idx ON categories (label);

CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  title text NOT NULL,
  vendor_id uuid NOT NULL REFERENCES users (id),
  description text NOT NULL,
  condition product_condition NOT NULL,
  category_id uuid NOT NULL REFERENCES categories (id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  price numeric(12, 2) NOT NULL,
  ready_for_sale boolean NOT NULL,
  sold boolean NOT NULL,
  -- Category specific extra fields, see convex/categoryFields.ts
  attributes jsonb NOT NULL DEFAULT '{}',
  -- Seller accepts online price offers (only used in events with priceOffers)
  accepts_offers boolean,
  -- Lowest price the cash desk may sell for (events with minimumPrice); never sent to buyers
  minimum_price numeric(12, 2),
  -- Set when an administrator hides the product; the owner still sees it, with the reason
  hidden_at timestamptz,
  hidden_by uuid REFERENCES users (id),
  hidden_reason text,
  CHECK ((hidden_at IS NULL) = (hidden_by IS NULL) AND (hidden_at IS NULL) = (hidden_reason IS NULL))
);
CREATE INDEX products_vendor_idx ON products (vendor_id);
CREATE INDEX products_hidden_idx ON products (hidden_at) WHERE hidden_at IS NOT NULL;

CREATE TABLE product_images (
  product_id uuid NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  position smallint NOT NULL,
  file_id uuid NOT NULL REFERENCES files (id),
  PRIMARY KEY (product_id, position)
);
CREATE INDEX product_images_file_idx ON product_images (file_id);

-- Events --------------------------------------------------------------------------------

CREATE TABLE events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  title text NOT NULL,
  description text NOT NULL,
  cover_image_id uuid REFERENCES files (id),
  map_image_id uuid REFERENCES files (id),
  location text NOT NULL,
  start_date timestamptz NOT NULL,
  end_date timestamptz NOT NULL,
  contact_info text NOT NULL,
  services event_service[] NOT NULL DEFAULT '{}',
  visibility event_visibility NOT NULL,
  is_approved boolean,
  approval_status approval_status,
  approved_at timestamptz,
  approved_by uuid REFERENCES users (id),
  rejected_at timestamptz,
  rejected_by uuid REFERENCES users (id),
  rejection_reason text,
  access_code text,
  vendor_limit integer,
  -- Highest seller number given out, so numbers of sellers who left are not reused
  last_seller_number integer,
  commission numeric(5, 2) NOT NULL,
  -- Unused (see features.intakeFee); kept for imported rows
  sale_fee_fixed numeric(12, 2),
  sale_fee_percentage numeric(5, 2),
  -- eventFeaturesValidator in convex/schema.ts
  features jsonb NOT NULL DEFAULT '{}',
  -- When sellers hand in and pick up their items, and what else they should know
  dropoff_start timestamptz,
  dropoff_end timestamptz,
  pickup_start timestamptz,
  pickup_end timestamptz,
  logistics_note text,
  -- Start/end date the seller reminders were sent for; a moved bazaar gets them again
  reminder_day_before_sent_for timestamptz,
  reminder_pickup_sent_for timestamptz,
  hidden_at timestamptz,
  hidden_by uuid REFERENCES users (id),
  hidden_reason text,
  organizer_id uuid NOT NULL REFERENCES users (id),
  CHECK ((hidden_at IS NULL) = (hidden_by IS NULL) AND (hidden_at IS NULL) = (hidden_reason IS NULL))
);
CREATE INDEX events_organizer_idx ON events (organizer_id);
CREATE INDEX events_approval_status_idx ON events (approval_status);
CREATE INDEX events_start_date_idx ON events (start_date);
CREATE INDEX events_end_date_idx ON events (end_date);
CREATE INDEX events_hidden_idx ON events (hidden_at) WHERE hidden_at IS NOT NULL;

ALTER TABLE users
  ADD CONSTRAINT users_managed_by_event_fk
  FOREIGN KEY (managed_by_event_id) REFERENCES events (id) ON DELETE SET NULL;

CREATE TABLE event_categories (
  event_id uuid NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  position smallint NOT NULL,
  category_id uuid NOT NULL REFERENCES categories (id),
  PRIMARY KEY (event_id, position),
  UNIQUE (event_id, category_id)
);

CREATE TABLE event_location_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id text UNIQUE,
  event_id uuid NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  label text NOT NULL
);
CREATE INDEX event_location_categories_event_idx ON event_location_categories (event_id);

CREATE TABLE event_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  event_id uuid NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  status event_product_status NOT NULL,
  discount_percent numeric(5, 2),
  location_category_id uuid REFERENCES event_location_categories (id) ON DELETE SET NULL,
  -- Only visible to organizers, e.g. the hook number on the key board
  internal_note text,
  UNIQUE (event_id, product_id)
);
CREATE INDEX event_products_product_idx ON event_products (product_id);

CREATE TABLE event_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id text UNIQUE,
  event_id uuid NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role event_role_kind NOT NULL,
  UNIQUE (event_id, user_id, role)
);
CREATE INDEX event_roles_event_role_idx ON event_roles (event_id, role);
CREATE INDEX event_roles_user_role_idx ON event_roles (user_id, role);

CREATE TABLE event_sellers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  event_id uuid NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id),
  total_fee numeric(12, 2) NOT NULL,
  commission_fee numeric(12, 2) NOT NULL,
  -- Unused; kept for imported rows
  sale_fee_fixed numeric(12, 2),
  sale_fee_percentage numeric(5, 2),
  payout_amount numeric(12, 2) NOT NULL,
  payout_received boolean NOT NULL,
  -- Short seller number of this event (1, 2, …) for labels, sorting and pay-out
  number integer,
  -- Intake fee kept at payout (total in €) and for how many items; set when paid out
  intake_fee numeric(12, 2),
  intake_fee_items integer,
  -- The seller confirmed to sell as a private person (feature privateSellersOnly)
  private_seller_confirmed_at timestamptz,
  -- Name and address at the first registered item (feature fixedSellerData). Kept when
  -- the account is deleted, so the record of who offered what stays complete.
  seller_snapshot jsonb,
  UNIQUE (event_id, user_id),
  UNIQUE (event_id, number)
);
CREATE INDEX event_sellers_user_idx ON event_sellers (user_id);

/** Messages of an organizer to the sellers of their bazaar */
CREATE TABLE event_broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id text UNIQUE,
  event_id uuid NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES users (id),
  subject text NOT NULL,
  body text NOT NULL,
  audience broadcast_audience NOT NULL,
  -- Sent regardless of the sellers' email settings; at most one per day
  important boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX event_broadcasts_event_idx ON event_broadcasts (event_id, created_at);

CREATE TABLE event_broadcast_recipients (
  broadcast_id uuid NOT NULL REFERENCES event_broadcasts (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  PRIMARY KEY (broadcast_id, user_id)
);
CREATE INDEX event_broadcast_recipients_user_idx ON event_broadcast_recipients (user_id);

-- Sales ---------------------------------------------------------------------------------

CREATE TABLE product_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id text UNIQUE,
  event_id uuid NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  event_product_id uuid NOT NULL REFERENCES event_products (id) ON DELETE CASCADE,
  buyer_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  amount numeric(12, 2) NOT NULL,
  message text,
  status offer_status NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  -- Set when the offer was closed by a sale, return or removal, not by the seller
  closed_by offer_close_reason,
  -- Status before that closing, restored when the sale or return is undone
  closed_from_status offer_status CHECK (closed_from_status IN ('pending', 'accepted'))
);
CREATE INDEX product_offers_event_product_idx ON product_offers (event_product_id);
CREATE INDEX product_offers_product_idx ON product_offers (product_id);
CREATE INDEX product_offers_buyer_idx ON product_offers (buyer_id);
CREATE INDEX product_offers_status_idx ON product_offers (status);

CREATE TABLE purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  product_id uuid NOT NULL REFERENCES products (id),
  event_id uuid NOT NULL REFERENCES events (id),
  seller_id uuid NOT NULL REFERENCES users (id),
  total_amount numeric(12, 2) NOT NULL,
  commission_amount numeric(12, 2) NOT NULL,
  payout_amount numeric(12, 2) NOT NULL,
  payout_status boolean NOT NULL,
  payout_date timestamptz NOT NULL,
  discount_percent numeric(5, 2),
  -- Product price before discount/offer/negotiation; older rows only have discount_percent
  list_price numeric(12, 2),
  price_source purchase_price_source,
  offer_id uuid REFERENCES product_offers (id) ON DELETE SET NULL
);
CREATE INDEX purchases_event_seller_idx ON purchases (event_id, seller_id);
CREATE INDEX purchases_seller_idx ON purchases (seller_id);
CREATE INDEX purchases_product_idx ON purchases (product_id);

CREATE TABLE product_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id text UNIQUE,
  event_id uuid NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  asker_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  question text NOT NULL,
  answer text,
  answered_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  answered_at timestamptz
);
CREATE INDEX product_questions_product_idx ON product_questions (product_id);
CREATE INDEX product_questions_asker_idx ON product_questions (asker_id);

/** Red markers in the menu: one per notification the user has not looked at yet. */
CREATE TABLE unread_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  area notice_area NOT NULL,
  -- Bazaar the notice is about, so its page can clear just its own (messages)
  event_id uuid REFERENCES events (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX unread_notices_user_area_idx ON unread_notices (user_id, area);

-- Platform ------------------------------------------------------------------------------

/** Totals for the admin overview, counted hourly instead of on every view; one row. */
CREATE TABLE platform_stats (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  users bigint NOT NULL,
  products bigint NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE feature_flags (
  key text PRIMARY KEY,
  value boolean NOT NULL,
  description text
);

/** Contact form messages */
CREATE TABLE contact_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id text UNIQUE,
  name text NOT NULL,
  email text NOT NULL,
  message text NOT NULL,
  accepted_privacy_policy boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  handled_at timestamptz,
  handled_by uuid REFERENCES users (id) ON DELETE SET NULL
);
CREATE INDEX contact_messages_handled_idx ON contact_messages (handled_at);

CREATE TABLE reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id text UNIQUE,
  target_type report_target NOT NULL,
  -- Polymorphic: products, events, product_questions or users
  target_id uuid NOT NULL,
  reason report_reason NOT NULL,
  details text NOT NULL,
  reporter_id uuid REFERENCES users (id) ON DELETE SET NULL,
  reporter_email text,
  status report_status NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES users (id) ON DELETE SET NULL,
  resolution_note text
);
CREATE INDEX reports_status_idx ON reports (status);
CREATE INDEX reports_target_idx ON reports (target_type, target_id);
CREATE INDEX reports_created_idx ON reports (created_at);

CREATE TABLE moderation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id text UNIQUE,
  admin_id uuid NOT NULL REFERENCES users (id),
  action moderation_action NOT NULL,
  target_type report_target NOT NULL,
  target_id uuid NOT NULL,
  target_label text NOT NULL,
  reason text,
  report_id uuid REFERENCES reports (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX moderation_log_target_idx ON moderation_log (target_type, target_id);

/** Legal pages maintained by admins; the latest text per slug. */
CREATE TABLE site_pages (
  slug site_page_slug PRIMARY KEY,
  title text NOT NULL,
  markdown text NOT NULL,
  version integer NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by uuid NOT NULL REFERENCES users (id)
);

/** Every saved version of a legal page, e.g. to know which terms a user accepted. */
CREATE TABLE site_page_versions (
  slug site_page_slug NOT NULL,
  version integer NOT NULL,
  title text NOT NULL,
  markdown text NOT NULL,
  created_at timestamptz NOT NULL,
  created_by uuid NOT NULL REFERENCES users (id),
  PRIMARY KEY (slug, version)
);

/** Settings of this instance that admins change in the dashboard; one row. */
CREATE TABLE site_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  name text,
  contact_email text,
  logo_id uuid REFERENCES files (id),
  -- Web analytics; unset values fall back to PLAUSIBLE_* of the web server
  plausible_enabled boolean,
  plausible_domain text,
  plausible_api_host text,
  start_page start_page,
  updated_at timestamptz NOT NULL,
  updated_by uuid NOT NULL REFERENCES users (id)
);
