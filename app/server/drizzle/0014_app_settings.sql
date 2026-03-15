CREATE TABLE IF NOT EXISTS "app_settings" (
  "key" text PRIMARY KEY NOT NULL,
  "value" text NOT NULL
);
--> statement-breakpoint
INSERT INTO "app_settings" ("key", "value")
VALUES ('chart_default_range', 'month')
ON CONFLICT ("key") DO NOTHING;
