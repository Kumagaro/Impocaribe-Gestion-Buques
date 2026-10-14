-- T012 · Migración inicial: rol de la aplicación, solo inserción e identificadores uuid v7 (plan §4 y §9, Const. art. IV).

-- Rol con el que trabaja la aplicación (SET ROLE al conectar). Es de todo el servidor PostgreSQL: se crea si no existe.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'impocaribe_app') THEN
    CREATE ROLE impocaribe_app NOLOGIN;
  END IF;
END
$$;
--> statement-breakpoint
-- El rol del usuario de conexión debe poder asumir impocaribe_app.
GRANT impocaribe_app TO CURRENT_USER;
--> statement-breakpoint
-- La app lee y escribe datos, pero nunca cambia el esquema: las migraciones las aplica el dueño.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO impocaribe_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO impocaribe_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO impocaribe_app;
--> statement-breakpoint
-- Trigger de las tablas de solo inserción (audit_log, *_versions, change_log…): rechaza UPDATE y DELETE.
CREATE FUNCTION assert_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'La tabla % es de solo inserción: sus registros no se modifican ni se borran (Const. art. IV).', TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END
$$;
--> statement-breakpoint
-- Identificadores uuid v7, ordenables por tiempo de creación (plan §4): 48 bits de milisegundos + aleatorio.
CREATE FUNCTION uuid_generate_v7() RETURNS uuid LANGUAGE sql VOLATILE AS $$
  SELECT encode(
    set_bit(set_bit(
      overlay(uuid_send(gen_random_uuid())
        placing substring(int8send(floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint) FROM 3)
        FROM 1 FOR 6),
      52, 1), 53, 1),
    'hex')::uuid
$$;
