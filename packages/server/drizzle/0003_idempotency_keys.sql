CREATE TABLE "idempotency_keys" (
	"device_id" text NOT NULL,
	"key" uuid NOT NULL,
	"user_id" uuid,
	"method" text NOT NULL,
	"path" text NOT NULL,
	"request_hash" text NOT NULL,
	"status_code" integer,
	"response" jsonb,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "idempotency_keys_device_id_key_pk" PRIMARY KEY("device_id","key")
);
--> statement-breakpoint
-- La depuración horaria busca por vencimiento (plan §4.2).
CREATE INDEX "idempotency_keys_expires_at" ON "idempotency_keys" ("expires_at");
