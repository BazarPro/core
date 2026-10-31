-- The parameters (and the cause) of a refused offline action's error code, so the app
-- shows the reason in its language. error_message stays the German text for rows from
-- before and for logs.
ALTER TABLE offline_actions ADD COLUMN error_params jsonb, ADD COLUMN error_cause jsonb;
