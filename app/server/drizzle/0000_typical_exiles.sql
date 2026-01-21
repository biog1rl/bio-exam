CREATE TYPE "public"."link_target" AS ENUM('_self', '_blank');--> statement-breakpoint
CREATE TABLE "invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"consumed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "rbac_page_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pattern" text NOT NULL,
	"domain" text NOT NULL,
	"action" text NOT NULL,
	"exact" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "rbac_role_grants" (
	"role_key" text NOT NULL,
	"domain" text NOT NULL,
	"action" text NOT NULL,
	"allow" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "rbac_role_grants_role_key_domain_action_pk" PRIMARY KEY("role_key","domain","action")
);
--> statement-breakpoint
CREATE TABLE "rbac_user_grants" (
	"user_id" uuid NOT NULL,
	"domain" text NOT NULL,
	"action" text NOT NULL,
	"allow" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "rbac_user_grants_user_id_domain_action_pk" PRIMARY KEY("user_id","domain","action")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"key" text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sidebar_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"icon" text NOT NULL,
	"target" "link_target" DEFAULT '_self' NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" uuid NOT NULL,
	"role_key" text NOT NULL,
	CONSTRAINT "user_roles_user_id_role_key_pk" PRIMARY KEY("user_id","role_key")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"login" text,
	"first_name" text,
	"last_name" text,
	"name" text,
	"avatar" text,
	"avatar_cropped" text,
	"avatar_color" text,
	"initials" text,
	"password_hash" text,
	"is_active" boolean DEFAULT false NOT NULL,
	"invited_at" timestamp,
	"activated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" uuid,
	"position" text,
	"birthdate" date,
	"telegram" text,
	"phone" text,
	"email" text,
	"show_in_team" boolean DEFAULT false NOT NULL,
	"avatar_crop_x" real,
	"avatar_crop_y" real,
	"avatar_crop_zoom" real,
	"avatar_crop_rotation" real,
	"avatar_crop_view_x" real,
	"avatar_crop_view_y" real
);
--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rbac_page_rules" ADD CONSTRAINT "rbac_page_rules_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rbac_role_grants" ADD CONSTRAINT "rbac_role_grants_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rbac_user_grants" ADD CONSTRAINT "rbac_user_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rbac_user_grants" ADD CONSTRAINT "rbac_user_grants_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_key_roles_key_fk" FOREIGN KEY ("role_key") REFERENCES "public"."roles"("key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invites_token_uniq" ON "invites" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sidebar_items_order_idx" ON "sidebar_items" USING btree ("order");--> statement-breakpoint
CREATE UNIQUE INDEX "users_login_uniq" ON "users" USING btree ("login");