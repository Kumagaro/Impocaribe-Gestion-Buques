CREATE TYPE "public"."session_kind" AS ENUM('app', 'device');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('apoderada', 'operador', 'lectura');--> statement-breakpoint
CREATE TABLE "recovery_attempts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"at" timestamp with time zone NOT NULL,
	"success" boolean NOT NULL,
	"device_id" text
);
--> statement-breakpoint
CREATE TABLE "recovery_codes" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"user_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"invalidated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"kind" "session_kind" NOT NULL,
	"device_id" text NOT NULL,
	"device_label" text NOT NULL,
	"platform" text NOT NULL,
	"keep_signed_in" boolean NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "sessions_platform" CHECK ("sessions"."platform" IN ('windows', 'android'))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"username" text NOT NULL,
	"full_name" text NOT NULL,
	"national_id" char(11) NOT NULL,
	"phone" text NOT NULL,
	"role" "user_role" NOT NULL,
	"password_hash" text NOT NULL,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"failed_logins" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_national_id_unique" UNIQUE("national_id"),
	CONSTRAINT "users_username_format" CHECK ("users"."username" ~ '^[a-z0-9._]{3,30}$'),
	CONSTRAINT "users_national_id_digits" CHECK ("users"."national_id" ~ '^[0-9]{11}$'),
	CONSTRAINT "users_phone_digits" CHECK ("users"."phone" ~ '^[0-9]{8}$')
);
--> statement-breakpoint
ALTER TABLE "recovery_attempts" ADD CONSTRAINT "recovery_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_codes" ADD CONSTRAINT "recovery_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recovery_attempts_user_at" ON "recovery_attempts" USING btree ("user_id","at");--> statement-breakpoint
CREATE INDEX "recovery_codes_user_id" ON "recovery_codes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id" ON "sessions" USING btree ("user_id");--> statement-breakpoint
-- RF-USR-03 y Const. art. IV.3: los usuarios no se borran, solo se desactivan.
REVOKE DELETE, TRUNCATE ON "users" FROM impocaribe_app;
