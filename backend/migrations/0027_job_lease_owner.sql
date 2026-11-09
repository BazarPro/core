-- The worker that holds a job's lock (#142). It renews `locked_until` while the job runs
-- and only it may finish the job, so a job taken over after a lost lock runs once.
ALTER TABLE jobs ADD COLUMN locked_by uuid;
