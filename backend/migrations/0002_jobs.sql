-- Background work (replaces ctx.scheduler and convex/crons.ts).
--
-- A job is inserted in the same transaction as the mutation that schedules it, so it
-- exists exactly when the mutation committed. Workers on any number of instances claim
-- due jobs with FOR UPDATE SKIP LOCKED.

CREATE TABLE jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  run_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  -- Set while a worker runs the job; a stale lock (crashed worker) is taken over
  locked_until timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX jobs_due_idx ON jobs (run_at);

/** Last scheduled time each cron job ran for; the row lock makes it run once per slot. */
CREATE TABLE cron_runs (
  name text PRIMARY KEY,
  last_slot timestamptz NOT NULL
);
