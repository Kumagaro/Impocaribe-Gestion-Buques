CREATE TYPE "public"."release_platform" AS ENUM('windows', 'android', 'android-webview-chrome', 'android-webview-system');--> statement-breakpoint
CREATE TABLE "app_releases" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"platform" "release_platform" NOT NULL,
	"version" text NOT NULL,
	"file_id" uuid NOT NULL,
	"sha256" char(64) NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"is_min_supported" boolean DEFAULT false NOT NULL,
	"published_by" uuid,
	"published_at" timestamp with time zone NOT NULL,
	CONSTRAINT "app_releases_platform_version" UNIQUE("platform","version")
);
--> statement-breakpoint
ALTER TABLE "app_releases" ADD CONSTRAINT "app_releases_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_releases" ADD CONSTRAINT "app_releases_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "app_releases_one_min" ON "app_releases" USING btree ("platform") WHERE "app_releases"."is_min_supported";--> statement-breakpoint
-- Historia: una versión publicada no se borra (los dispositivos pueden tenerla instalada).
REVOKE DELETE, TRUNCATE ON "app_releases" FROM impocaribe_app;
