CREATE TABLE "student_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_groups" (
	"group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "user_groups_group_id_user_id_pk" PRIMARY KEY("group_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "student_groups" ADD CONSTRAINT "student_groups_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_groups" ADD CONSTRAINT "user_groups_group_id_student_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."student_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_groups" ADD CONSTRAINT "user_groups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_groups_group_idx" ON "user_groups" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "user_groups_user_idx" ON "user_groups" USING btree ("user_id");
