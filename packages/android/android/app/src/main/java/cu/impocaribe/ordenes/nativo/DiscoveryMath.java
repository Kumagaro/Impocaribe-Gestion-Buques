package cu.impocaribe.ordenes.nativo;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.json.JSONObject;

/**
 * T118 · DT-20: los cálculos del descubrimiento, sin red (los mismos que packages/desktop/src/native/discovery.ts):
 * las direcciones de la /24, la difusión de cada interfaz y la lectura de lo que anuncia el servidor.
 */
public final class DiscoveryMath {
    private DiscoveryMath() {}

    /** Lo que anuncia un servidor: no prueba nada (la identidad se comprueba al conectar, DT-18). */
    public static final class Announcement {
        public final String address;
        public final int port;
        public final String serverId;
        public final String caFingerprint;
        public final String version;

        public Announcement(String address, int port, String serverId, String caFingerprint, String version) {
            this.address = address;
            this.port = port;
            this.serverId = serverId;
            this.caFingerprint = caFingerprint;
            this.version = version;
        }

        String key() {
            return serverId + "@" + address + ":" + port;
        }
    }

    static int toInt(String ip) {
        String[] p = ip.split("\\.");
        return (Integer.parseInt(p[0]) << 24) | (Integer.parseInt(p[1]) << 16) | (Integer.parseInt(p[2]) << 8) | Integer.parseInt(p[3]);
    }

    static String toIp(int n) {
        return ((n >>> 24) & 255) + "." + ((n >>> 16) & 255) + "." + ((n >>> 8) & 255) + "." + (n & 255);
    }

    /** La dirección de difusión de una interfaz con su prefijo (/24, /16…). */
    public static String broadcastOf(String address, int prefix) {
        int mask = prefix == 0 ? 0 : -1 << (32 - prefix);
        return toIp(toInt(address) | ~mask);
    }

    /** Las direcciones de la /24 de cada interfaz, sin la propia, para buscar una a una. */
    public static List<String> subnet(List<String> addresses) {
        Set<String> out = new LinkedHashSet<>();
        for (String own : addresses) {
            int base = toInt(own) & 0xffffff00;
            for (int host = 1; host < 255; host++) {
                String ip = toIp(base | host);
                if (!ip.equals(own)) out.add(ip);
            }
        }
        return new ArrayList<>(out);
    }

    /** La respuesta a la difusión UDP; null si no es de un servidor. */
    public static Announcement fromBroadcast(String text, String from) {
        try {
            JSONObject o = new JSONObject(text);
            if (!o.has("serverId") || !o.has("caFingerprint") || !o.has("port")) return null;
            return new Announcement(from, o.getInt("port"), o.getString("serverId"), o.getString("caFingerprint"), o.optString("version", ""));
        } catch (Exception e) {
            return null;
        }
    }

    /** El TXT de DNS-SD (id, v, fp) de una instancia resuelta; null si le falta la identidad o la huella. */
    public static Announcement fromTxt(Map<String, String> txt, String address, int port) {
        String id = txt.get("id");
        String fp = txt.get("fp");
        if (id == null || fp == null || address == null) return null;
        String v = txt.get("v");
        return new Announcement(address, port, id, fp, v == null ? "" : v);
    }

    /** Sin repetidos (el mismo servidor por dos vías o dos interfaces). */
    public static List<Announcement> unique(List<Announcement> list) {
        Map<String, Announcement> seen = new java.util.LinkedHashMap<>();
        for (Announcement a : list) seen.put(a.key(), a);
        return new ArrayList<>(seen.values());
    }
}
