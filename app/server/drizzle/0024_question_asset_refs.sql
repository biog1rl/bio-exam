CREATE TABLE "question_asset_refs" (
	"question_id" uuid NOT NULL,
	"asset_key" text NOT NULL,
	CONSTRAINT "question_asset_refs_pkey" PRIMARY KEY("question_id","asset_key")
);
--> statement-breakpoint
ALTER TABLE "question_asset_refs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "assets_indexed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "question_asset_refs" ADD CONSTRAINT "question_asset_refs_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_question_asset_refs_asset_key" ON "question_asset_refs" USING btree ("asset_key");--> statement-breakpoint
CREATE POLICY "deny_direct_access" ON "question_asset_refs" AS PERMISSIVE FOR ALL TO public USING (false) WITH CHECK (false);