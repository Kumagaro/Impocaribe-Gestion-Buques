package cu.impocaribe.ordenes.nativo;

import org.json.JSONException;
import org.json.JSONObject;

/**
 * T119 · RF-ALR-01, RF-ALR-02 y DT-05: qué hace el servicio de alertas con cada mensaje de su WebSocket. Con el token
 * de dispositivo el servidor solo le manda {@code ready}, {@code alert.created} y las revocaciones (realtime.ts).
 */
public final class AlertMessages {
    private AlertMessages() {}

    /** El servidor cierra con este código si el token no vale: no se reintenta con él. */
    public static final int CLOSE_UNAUTHORIZED = 4401;

    public enum Kind {
        READY,
        NOTIFY,
        STOP,
        IGNORE,
    }

    public static final class Action {
        public final Kind kind;
        public final String id;
        public final String title;
        public final String body;

        Action(Kind kind, String id, String title, String body) {
            this.kind = kind;
            this.id = id;
            this.title = title;
            this.body = body;
        }
    }

    private static final Action IGNORE = new Action(Kind.IGNORE, null, null, null);

    /** {@code labels}: el nombre de cada tipo de alerta (ALERTS de shared), que pasa la interfaz al arrancar el servicio. */
    public static Action read(String text, JSONObject labels) {
        try {
            JSONObject m = new JSONObject(text);
            switch (m.optString("type")) {
                case "ready":
                    return new Action(Kind.READY, null, null, null);
                case "alert.created": {
                    // RF-ALR-02: fuera de la app, solo el tipo y la referencia (el título ya es eso).
                    String label = labels == null ? "" : labels.optString(m.getString("alertType"), "");
                    return new Action(Kind.NOTIFY, m.getString("id"), label.isEmpty() ? "Alerta" : "Alerta: " + label, m.getString("title"));
                }
                case "session.revoked":
                case "device.revoked":
                    return new Action(Kind.STOP, null, null, null);
                default:
                    return IGNORE;
            }
        } catch (JSONException e) {
            return IGNORE;
        }
    }

    /** Espera antes de reintentar tras {@code failures} fallos seguidos: 2, 4, 8, 16 y luego 30 s. */
    public static long backoffMs(int failures) {
        return Math.min(30_000L, 1000L << Math.max(1, Math.min(failures, 5)));
    }
}
