CREATE TABLE "chart_settings" (
	"id" text PRIMARY KEY DEFAULT 'global' NOT NULL,
	"configs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "chart_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "chart_settings" ADD CONSTRAINT "chart_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "deny_direct_access" ON "chart_settings" AS PERMISSIVE FOR ALL TO public USING (false) WITH CHECK (false);--> statement-breakpoint
INSERT INTO "chart_settings" ("id", "configs") SELECT 'global', jsonb_build_object('testResults', jsonb_build_object('period', "value")) FROM "app_settings" WHERE "key" = 'chart_default_range' ON CONFLICT ("id") DO NOTHING;
