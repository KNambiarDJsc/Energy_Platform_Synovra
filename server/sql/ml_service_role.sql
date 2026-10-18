-- Database role for the ML service (docs/ML_PLAN.md). Run once per environment, after migrations,
-- as a database administrator. It is safe to run again.
--
--   psql "$ADMIN_DATABASE_URL" -f server/sql/ml_service_role.sql
--
-- Then give the ML service its own login, with a password from your secret store:
--
--   CREATE ROLE synovra_ml_service LOGIN PASSWORD '...' IN ROLE synovra_ml;
--
-- What the role can do:
--   read   the ml_* views only. Not users, costs, evidence, audit or any operational table.
--   write  new model versions, their training records and predictions (INSERT only).
-- It cannot change or delete any row, so it cannot promote its own model to `validated`, edit a
-- prediction after the fact, or alter the human review recorded on one. Promotion is done by an
-- administrator once the deployment gate in docs/ML_PLAN.md has written sign-off.
--
-- Not a migration: creating roles needs privileges the application's own database user should not
-- have, and some managed PostgreSQL services restrict it.

DO $$ BEGIN
  CREATE ROLE synovra_ml NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

GRANT USAGE ON SCHEMA public TO synovra_ml;
GRANT SELECT ON ml_restoration_attempt_features, ml_model_review_flags TO synovra_ml;
GRANT SELECT, INSERT ON model_versions, model_training_records, predictions TO synovra_ml;
