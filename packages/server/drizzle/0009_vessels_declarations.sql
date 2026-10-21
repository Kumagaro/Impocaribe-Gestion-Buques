CREATE TYPE "public"."allocation_change_kind" AS ENUM('assign', 'partial_assign', 'edit', 'expire_release', 'void_release', 'surplus_assign');--> statement-breakpoint
CREATE TYPE "public"."declaration_version_kind" AS ENUM('create', 'edit', 'reactivate', 'expire');--> statement-breakpoint
CREATE TYPE "public"."surplus_kind" AS ENUM('allocate', 'transfer', 'loss');--> statement-breakpoint
CREATE TYPE "public"."vessel_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TABLE "allocation_changes" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"allocation_id" uuid NOT NULL,
	"previous_tons" numeric(12, 3) NOT NULL,
	"new_tons" numeric(12, 3) NOT NULL,
	"kind" "allocation_change_kind" NOT NULL,
	"reason" text,
	"created_by" uuid,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "allocations" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"declaration_id" uuid NOT NULL,
	"vessel_id" uuid NOT NULL,
	"allocated_tons" numeric(12, 3) NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "allocations_declaration_vessel" UNIQUE("declaration_id","vessel_id"),
	CONSTRAINT "allocations_tons_nonnegative" CHECK ("allocations"."allocated_tons" >= 0)
);
--> statement-breakpoint
CREATE TABLE "customs_declaration_versions" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"declaration_id" uuid NOT NULL,
	"version_no" integer NOT NULL,
	"brand" text NOT NULL,
	"total_tons" numeric(12, 3),
	"kind" "declaration_version_kind" NOT NULL,
	"reason" text,
	"created_by" uuid,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "customs_declaration_versions_no" UNIQUE("declaration_id","version_no"),
	CONSTRAINT "customs_declaration_versions_total_positive" CHECK ("customs_declaration_versions"."total_tons" IS NULL OR "customs_declaration_versions"."total_tons" > 0),
	CONSTRAINT "customs_declaration_versions_reason" CHECK ("customs_declaration_versions"."kind" = 'create' OR "customs_declaration_versions"."reason" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "customs_declarations" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"number" char(5) NOT NULL,
	"client_id" uuid NOT NULL,
	"declaration_date" date NOT NULL,
	"current_version_id" uuid,
	"deadline_start_date" date NOT NULL,
	"expired_at" timestamp with time zone,
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "customs_declarations_number_unique" UNIQUE("number"),
	CONSTRAINT "customs_declarations_number_digits" CHECK ("customs_declarations"."number" ~ '^[0-9]{5}$')
);
--> statement-breakpoint
CREATE TABLE "vessel_surplus_dispositions" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"vessel_id" uuid NOT NULL,
	"tons" numeric(12, 3) NOT NULL,
	"kind" "surplus_kind" NOT NULL,
	"target_vessel_id" uuid,
	"target_allocation_id" uuid,
	"reason" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "vessel_surplus_dispositions_tons_positive" CHECK ("vessel_surplus_dispositions"."tons" > 0),
	CONSTRAINT "vessel_surplus_dispositions_target" CHECK (("vessel_surplus_dispositions"."kind" = 'transfer') = ("vessel_surplus_dispositions"."target_vessel_id" IS NOT NULL) AND ("vessel_surplus_dispositions"."kind" = 'allocate') = ("vessel_surplus_dispositions"."target_allocation_id" IS NOT NULL)),
	CONSTRAINT "vessel_surplus_dispositions_other_vessel" CHECK ("vessel_surplus_dispositions"."target_vessel_id" IS DISTINCT FROM "vessel_surplus_dispositions"."vessel_id")
);
--> statement-breakpoint
CREATE TABLE "vessels" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"manifest" text NOT NULL,
	"bl" text NOT NULL,
	"port" text NOT NULL,
	"internal_buyer" text NOT NULL,
	"eta_date" date,
	"arrival_date" date,
	"voyage_no" integer,
	"total_tons" numeric(12, 3) NOT NULL,
	"last_order_seq" integer DEFAULT 0 NOT NULL,
	"status" "vessel_status" DEFAULT 'open' NOT NULL,
	"closed_at" timestamp with time zone,
	"closed_by" uuid,
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "vessels_total_positive" CHECK ("vessels"."total_tons" > 0),
	CONSTRAINT "vessels_arrival_voyage" CHECK (("vessels"."arrival_date" IS NULL) = ("vessels"."voyage_no" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "allocation_changes" ADD CONSTRAINT "allocation_changes_allocation_id_allocations_id_fk" FOREIGN KEY ("allocation_id") REFERENCES "public"."allocations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocation_changes" ADD CONSTRAINT "allocation_changes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_declaration_id_customs_declarations_id_fk" FOREIGN KEY ("declaration_id") REFERENCES "public"."customs_declarations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_vessel_id_vessels_id_fk" FOREIGN KEY ("vessel_id") REFERENCES "public"."vessels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customs_declaration_versions" ADD CONSTRAINT "customs_declaration_versions_declaration_id_customs_declarations_id_fk" FOREIGN KEY ("declaration_id") REFERENCES "public"."customs_declarations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customs_declaration_versions" ADD CONSTRAINT "customs_declaration_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customs_declarations" ADD CONSTRAINT "customs_declarations_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vessel_surplus_dispositions" ADD CONSTRAINT "vessel_surplus_dispositions_vessel_id_vessels_id_fk" FOREIGN KEY ("vessel_id") REFERENCES "public"."vessels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vessel_surplus_dispositions" ADD CONSTRAINT "vessel_surplus_dispositions_target_vessel_id_vessels_id_fk" FOREIGN KEY ("target_vessel_id") REFERENCES "public"."vessels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vessel_surplus_dispositions" ADD CONSTRAINT "vessel_surplus_dispositions_target_allocation_id_allocations_id_fk" FOREIGN KEY ("target_allocation_id") REFERENCES "public"."allocations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vessel_surplus_dispositions" ADD CONSTRAINT "vessel_surplus_dispositions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vessels" ADD CONSTRAINT "vessels_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Const. art. VI y RF-BUQ-03: un viaje por código, año de arribo real y número.
CREATE UNIQUE INDEX "vessels_numbering" ON "vessels" ("code", (extract(year FROM "arrival_date")), "voyage_no")
  WHERE "arrival_date" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "customs_declarations" ADD CONSTRAINT "customs_declarations_current_version_fk"
  FOREIGN KEY ("current_version_id") REFERENCES "customs_declaration_versions"("id") DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
-- D13 · RF-DM-04: el número, el cliente y la fecha de una DM no cambian nunca.
CREATE FUNCTION assert_declaration_fixed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.number <> OLD.number OR NEW.client_id <> OLD.client_id OR NEW.declaration_date <> OLD.declaration_date THEN
    RAISE EXCEPTION 'El número, el cliente y la fecha de una DM no cambian (D13).' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER customs_declarations_fixed BEFORE UPDATE ON "customs_declarations"
  FOR EACH ROW EXECUTE FUNCTION assert_declaration_fixed();--> statement-breakpoint
-- Const. art. III: las versiones, los cambios de asignación y los destinos del sobrante son de solo inserción.
CREATE TRIGGER customs_declaration_versions_append_only BEFORE UPDATE OR DELETE ON "customs_declaration_versions"
  FOR EACH ROW EXECUTE FUNCTION assert_append_only();--> statement-breakpoint
CREATE TRIGGER allocation_changes_append_only BEFORE UPDATE OR DELETE ON "allocation_changes"
  FOR EACH ROW EXECUTE FUNCTION assert_append_only();--> statement-breakpoint
CREATE TRIGGER vessel_surplus_dispositions_append_only BEFORE UPDATE OR DELETE ON "vessel_surplus_dispositions"
  FOR EACH ROW EXECUTE FUNCTION assert_append_only();--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON "customs_declaration_versions", "allocation_changes", "vessel_surplus_dispositions"
  FROM impocaribe_app;--> statement-breakpoint
REVOKE DELETE, TRUNCATE ON "vessels", "customs_declarations", "allocations" FROM impocaribe_app;--> statement-breakpoint
-- Plan §4.3: los saldos se calculan, no se guardan (Const. art. I). Lo cargado sale de las órdenes oficiales vigentes;
-- hasta que existan (F6, que redefine esta vista con las mismas columnas) es 0.
CREATE VIEW v_allocation_balance AS
SELECT a.id AS allocation_id, a.declaration_id, a.vessel_id, a.allocated_tons,
       0::numeric(12,3) AS loaded_tons,
       a.allocated_tons AS balance_tons
FROM allocations a;--> statement-breakpoint
CREATE VIEW v_declaration_balance AS
SELECT d.id AS declaration_id, v.total_tons,
       COALESCE(sum(b.allocated_tons), 0)::numeric(12,3) AS allocated_tons,
       COALESCE(sum(b.loaded_tons), 0)::numeric(12,3) AS loaded_tons,
       (v.total_tons - COALESCE(sum(b.loaded_tons), 0))::numeric(12,3) AS balance_tons,
       (v.total_tons - COALESCE(sum(b.allocated_tons), 0))::numeric(12,3) AS pending_allocation_tons
FROM customs_declarations d
JOIN customs_declaration_versions v ON v.id = d.current_version_id
LEFT JOIN v_allocation_balance b ON b.declaration_id = d.id
GROUP BY d.id, v.total_tons;--> statement-breakpoint
CREATE VIEW v_vessel_balance AS
WITH alloc AS (
  SELECT vessel_id, sum(allocated_tons) AS allocated, sum(loaded_tons) AS loaded
  FROM v_allocation_balance GROUP BY vessel_id
), outgoing AS (
  SELECT vessel_id,
         sum(tons) FILTER (WHERE kind IN ('transfer', 'loss')) AS disposed_out,
         sum(tons) FILTER (WHERE kind = 'allocate') AS allocated_as_disposition
  FROM vessel_surplus_dispositions GROUP BY vessel_id
)
SELECT s.id AS vessel_id, s.total_tons,
       COALESCE(a.allocated, 0)::numeric(12,3) AS allocated_tons,
       COALESCE(a.loaded, 0)::numeric(12,3) AS loaded_tons,
       (s.total_tons - COALESCE(a.allocated, 0) - COALESCE(o.disposed_out, 0))::numeric(12,3) AS free_tons,
       (s.total_tons - COALESCE(a.loaded, 0))::numeric(12,3) AS remaining_tons,
       COALESCE(o.disposed_out, 0)::numeric(12,3) AS disposed_out_tons,
       (s.total_tons - COALESCE(a.loaded, 0) - COALESCE(o.disposed_out, 0))::numeric(12,3) AS surplus_tons,
       (s.total_tons - COALESCE(a.loaded, 0) - COALESCE(o.disposed_out, 0)
          - COALESCE(o.allocated_as_disposition, 0))::numeric(12,3) AS unresolved_surplus_tons
FROM vessels s
LEFT JOIN alloc a ON a.vessel_id = s.id
LEFT JOIN outgoing o ON o.vessel_id = s.id;
