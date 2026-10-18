-- T043 · plan §5.9 y §6.4: avisos para el WebSocket. NOTIFY se entrega solo al confirmar la transacción, así que el
-- aviso nunca llega antes que el dato, y cubre a cualquier escritor (API y tareas programadas) sin tocar su código.
CREATE FUNCTION notify_sync() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.epoch IS DISTINCT FROM OLD.epoch THEN
    PERFORM pg_notify('impocaribe_epoch', NEW.epoch::text);
  ELSIF NEW.last_seq IS DISTINCT FROM OLD.last_seq THEN
    PERFORM pg_notify('impocaribe_sync', NEW.last_seq::text);
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE TRIGGER sync_state_notify AFTER UPDATE ON "sync_state"
  FOR EACH ROW EXECUTE FUNCTION notify_sync();
--> statement-breakpoint
-- RF-AUT-08: una sesión revocada (cierre, cambio de rol, desactivación, contraseña nueva) se cierra en su dispositivo.
CREATE FUNCTION notify_session_revoked() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('impocaribe_session', NEW.id::text);
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE TRIGGER sessions_revoked_notify AFTER UPDATE OF revoked_at ON "sessions"
  FOR EACH ROW WHEN (OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL)
  EXECUTE FUNCTION notify_session_revoked();
--> statement-breakpoint
-- RF-RED-05: un dispositivo revocado borra su copia local y su credencial.
CREATE FUNCTION notify_device_revoked() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('impocaribe_device', NEW.id);
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE TRIGGER devices_revoked_notify AFTER UPDATE OF revoked_at ON "devices"
  FOR EACH ROW WHEN (OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL)
  EXECUTE FUNCTION notify_device_revoked();
