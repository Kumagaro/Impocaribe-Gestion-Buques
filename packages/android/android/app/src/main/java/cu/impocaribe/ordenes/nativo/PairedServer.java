package cu.impocaribe.ordenes.nativo;

import android.content.Context;
import cu.impocaribe.ordenes.BuildConfig;
import java.util.List;
import org.json.JSONObject;

/**
 * T118 y T119 · DT-18: el servidor emparejado, buscado desde la parte nativa (P-27 y el servicio de alertas) sin la
 * interfaz: primero en su última dirección y, si no responde, anunciado en la red con la misma identidad. La identidad
 * y la huella son siempre las guardadas al emparejar (la interfaz las guarda en {@code impocaribe.pairing}).
 */
public final class PairedServer {
    private PairedServer() {}

    public static final String PAIRING_KEY = "impocaribe.pairing";

    /** Con {@code anyIfUnpaired}, sin emparejamiento vale el primero que se anuncie (solo P-27, que no puede emparejar). */
    public static DiscoveryMath.Announcement find(Context context, boolean anyIfUnpaired) throws Exception {
        Discovery discovery = new Discovery(context);
        String pairedId = null;
        String pairedFp = null;
        try {
            String raw = new SecureStore(context).get(PAIRING_KEY);
            if (raw != null) {
                JSONObject p = new JSONObject(raw);
                pairedId = p.getString("serverId");
                pairedFp = p.getString("caFingerprint");
                JSONObject last = p.optJSONObject("lastAddress");
                if (last != null) {
                    DiscoveryMath.Announcement a = discovery.probe(last.getString("address"), last.getInt("port"), 2000, BuildConfig.TLS_OFF);
                    if (a != null && a.serverId.equals(pairedId)) return paired(a, pairedId, pairedFp);
                }
            }
        } catch (Exception ignored) {
            // Sin emparejamiento guardado: se busca en la red.
        }
        if (pairedId == null && !anyIfUnpaired) return null;
        List<DiscoveryMath.Announcement> found = discovery.broadcast(1500);
        if (found.isEmpty()) found = discovery.browse(3000);
        for (DiscoveryMath.Announcement a : found) {
            if (pairedId == null) return a;
            if (a.serverId.equals(pairedId)) return paired(a, pairedId, pairedFp);
        }
        return null;
    }

    /** La dirección es la anunciada, pero la identidad y la huella, las del emparejamiento guardado. */
    private static DiscoveryMath.Announcement paired(DiscoveryMath.Announcement a, String id, String fp) {
        return new DiscoveryMath.Announcement(a.address, a.port, id, fp, a.version);
    }
}
