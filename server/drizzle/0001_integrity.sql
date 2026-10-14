-- Lifecycle history and the audit log are append-only. Corrections are new events that carry the
-- previous value; nothing is edited or deleted in place. TRUNCATE is still possible for the
-- demo-mode reset, which only an administrator can run and which is disabled in pilot mode.
CREATE OR REPLACE FUNCTION synovra_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % is not allowed', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER battery_events_append_only
  BEFORE UPDATE OR DELETE ON battery_events
  FOR EACH ROW EXECUTE FUNCTION synovra_append_only();
--> statement-breakpoint
CREATE TRIGGER audit_events_append_only
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION synovra_append_only();
