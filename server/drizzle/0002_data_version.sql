CREATE TABLE IF NOT EXISTS "data_version" (
	"id" integer PRIMARY KEY NOT NULL,
	"version" bigint NOT NULL,
	CONSTRAINT "data_version_single_row_ck" CHECK ("data_version"."id" = 1)
);
--> statement-breakpoint
INSERT INTO "data_version" ("id", "version") VALUES (1, 0) ON CONFLICT DO NOTHING;
