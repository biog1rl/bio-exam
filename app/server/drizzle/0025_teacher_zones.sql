CREATE TABLE "teacher_topics" (
	"teacher_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"assigned_by" uuid,
	CONSTRAINT "teacher_topics_pkey" PRIMARY KEY("teacher_id","topic_id")
);
--> statement-breakpoint
ALTER TABLE "teacher_topics" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "student_groups" ADD COLUMN "owner_id" uuid;--> statement-breakpoint
ALTER TABLE "teacher_topics" ADD CONSTRAINT "teacher_topics_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_topics" ADD CONSTRAINT "teacher_topics_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_topics" ADD CONSTRAINT "teacher_topics_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_teacher_topics_topic_id" ON "teacher_topics" USING btree ("topic_id");--> statement-breakpoint
ALTER TABLE "student_groups" ADD CONSTRAINT "student_groups_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_student_groups_owner_id" ON "student_groups" USING btree ("owner_id");--> statement-breakpoint
CREATE POLICY "deny_direct_access" ON "teacher_topics" AS PERMISSIVE FOR ALL TO public USING (false) WITH CHECK (false);
--> statement-breakpoint
INSERT INTO "roles" ("key") VALUES ('teacher') ON CONFLICT DO NOTHING;
