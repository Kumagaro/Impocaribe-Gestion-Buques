package cu.impocaribe.ordenes.nativo;

import android.content.pm.PackageInfo;
import android.os.Build;
import android.util.Base64;
import android.view.WindowManager;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import cu.impocaribe.ordenes.BuildConfig;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * T118 · plan §10.2: el puente nativo de la app Android, con los mismos canales que el proceso principal de Electron
 * (NATIVE_CHANNELS, packages/shared/src/domain/nativeBridge.ts). Por Capacitor solo viaja JSON: los bytes van como
 * {@code { $bytes: base64 }} (web/src/platform/capacitor-bridge.ts). Los argumentos llegan de la interfaz: se comprueban.
 */
@CapacitorPlugin(name = "ImpocaribeNative")
public class ImpocaribeNativePlugin extends Plugin {
    private SecureStore secure;
    private LocalDatabases databases;
    private NativeTransport transport;
    private Discovery discovery;

    @Override
    public void load() {
        secure = new SecureStore(getContext());
        databases = new LocalDatabases(getContext(), secure);
        transport = new NativeTransport(this::socketEvent, BuildConfig.TLS_OFF);
        discovery = new Discovery(getContext());
    }

    @Override
    protected void handleOnDestroy() {
        transport.closeAll();
        databases.closeAll();
    }

    private void socketEvent(int id, String event, String data) {
        JSObject e = new JSObject();
        e.put("id", id);
        e.put("event", event);
        if (data != null) e.put("data", data);
        notifyListeners("socket", e);
    }

    @PluginMethod
    public void info(PluginCall call) {
        JSObject info = new JSObject();
        info.put("platform", "android");
        try {
            PackageInfo pkg = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            info.put("appVersion", pkg.versionName);
        } catch (Exception e) {
            info.put("appVersion", "0.0.0");
        }
        // RF-UI-02: el ancho mínimo decide teléfono o tablet, y no cambia al girar.
        info.put("smallestWidthDp", getContext().getResources().getConfiguration().smallestScreenWidthDp);
        info.put("name", Build.MANUFACTURER + " " + Build.MODEL);
        call.resolve(info);
    }

    @PluginMethod
    public void invoke(PluginCall call) {
        String channel = call.getString("channel", "");
        JSArray args = call.getArray("args", new JSArray());
        try {
            Object decoded = decode(args);
            Object value = dispatch(channel, decoded instanceof List ? (List<?>) decoded : new ArrayList<>());
            JSObject out = new JSObject();
            out.put("value", encode(value));
            call.resolve(out);
        } catch (Exception e) {
            call.reject(e.getMessage() == null ? "Error de la parte nativa." : e.getMessage(), e);
        }
    }

    private Object dispatch(String channel, List<?> a) throws Exception {
        switch (channel) {
            case "http": {
                Map<?, ?> init = map(arg(a, 1), "la petición");
                Map<String, String> headers = new HashMap<>();
                Object h = init.get("headers");
                if (h instanceof Map) for (Map.Entry<?, ?> e : ((Map<?, ?>) h).entrySet()) headers.put(String.valueOf(e.getKey()), String.valueOf(e.getValue()));
                Object body = init.get("body");
                byte[] bytes = body instanceof byte[] ? (byte[]) body : body instanceof String ? ((String) body).getBytes("UTF-8") : null;
                NativeTransport.Result r = transport.http(str(arg(a, 0), "la dirección"), str(init.get("method"), "el método"), headers, bytes, server(arg(a, 2)));
                Map<String, Object> out = new HashMap<>();
                out.put("status", r.status);
                List<Object> hs = new ArrayList<>();
                for (String[] pair : r.headers) {
                    List<Object> p = new ArrayList<>();
                    p.add(pair[0]);
                    p.add(pair[1]);
                    hs.add(p);
                }
                out.put("headers", hs);
                out.put("body", r.body);
                return out;
            }
            case "ws.open":
                return transport.open(str(arg(a, 0), "la dirección"), server(arg(a, 1)));
            case "ws.send":
                transport.send(num(arg(a, 0), "el socket"), str(arg(a, 1), "el mensaje"));
                return null;
            case "ws.close":
                transport.close(num(arg(a, 0), "el socket"));
                return null;
            case "discovery.browse":
                return announcements(discovery.browse(num(arg(a, 0), "el plazo")));
            case "discovery.broadcast":
                return announcements(discovery.broadcast(num(arg(a, 0), "el plazo")));
            case "discovery.probe": {
                DiscoveryMath.Announcement found = discovery.probe(
                    str(arg(a, 0), "la dirección"), num(arg(a, 1), "el puerto"), num(arg(a, 2), "el plazo"), BuildConfig.TLS_OFF);
                return found == null ? null : announcement(found);
            }
            case "discovery.subnet":
                return discovery.subnet();
            case "secure.get":
                return secure.get(str(arg(a, 0), "la clave"));
            case "secure.set":
                secure.set(str(arg(a, 0), "la clave"), str(arg(a, 1), "el valor"));
                return null;
            case "secure.remove":
                secure.remove(str(arg(a, 0), "la clave"));
                return null;
            case "db.open":
                return databases.openDatabase(str(arg(a, 0), "el nombre de la base"));
            case "db.execute":
                databases.execute(num(arg(a, 0), "la base"), str(arg(a, 1), "la sentencia"), params(arg(a, 2)));
                return null;
            case "db.query":
                return databases.query(num(arg(a, 0), "la base"), str(arg(a, 1), "la consulta"), params(arg(a, 2)));
            case "secureScreen": {
                // RNF-09: las pantallas de códigos y de firma no se pueden capturar.
                boolean on = Boolean.TRUE.equals(arg(a, 0));
                getActivity().runOnUiThread(() -> {
                    if (on) getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
                    else getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
                });
                return null;
            }
            // shortcut: el PDF a Descargas (RF-ORD-22) y las notificaciones llegan con T119 y T120; la actualización
            // del APK, con T121. Hasta entonces se dice por qué no se puede.
            case "file.save":
            case "notify":
            case "update.install":
                throw new UnsupportedOperationException("Todavía no está disponible en la app Android.");
            default:
                throw new IllegalArgumentException("Canal no permitido: " + channel);
        }
    }

    // ---------- conversión entre JSON y Java ----------

    /** JSON → Java: { $bytes } → byte[], objetos → Map, listas → List, null. */
    static Object decode(Object v) throws Exception {
        if (v == null || v == JSONObject.NULL) return null;
        if (v instanceof JSONObject) {
            JSONObject o = (JSONObject) v;
            if (o.length() == 1 && o.has("$bytes")) return Base64.decode(o.getString("$bytes"), Base64.NO_WRAP);
            Map<String, Object> m = new HashMap<>();
            Iterator<String> keys = o.keys();
            while (keys.hasNext()) {
                String k = keys.next();
                m.put(k, decode(o.get(k)));
            }
            return m;
        }
        if (v instanceof JSONArray) {
            JSONArray arr = (JSONArray) v;
            List<Object> l = new ArrayList<>();
            for (int i = 0; i < arr.length(); i++) l.add(decode(arr.get(i)));
            return l;
        }
        return v;
    }

    /** Java → JSON: byte[] → { $bytes }, Map → objeto, List → lista. */
    static Object encode(Object v) throws Exception {
        if (v == null) return JSONObject.NULL;
        if (v instanceof byte[]) {
            JSONObject o = new JSONObject();
            o.put("$bytes", Base64.encodeToString((byte[]) v, Base64.NO_WRAP));
            return o;
        }
        if (v instanceof Map) {
            JSONObject o = new JSONObject();
            for (Map.Entry<?, ?> e : ((Map<?, ?>) v).entrySet()) o.put(String.valueOf(e.getKey()), encode(e.getValue()));
            return o;
        }
        if (v instanceof List) {
            JSONArray arr = new JSONArray();
            for (Object x : (List<?>) v) arr.put(encode(x));
            return arr;
        }
        return v;
    }

    private static Object arg(List<?> a, int i) {
        return i < a.size() ? a.get(i) : null;
    }

    private static String str(Object v, String what) {
        if (!(v instanceof String)) throw new IllegalArgumentException("Falta " + what + ".");
        return (String) v;
    }

    private static int num(Object v, String what) {
        if (!(v instanceof Number)) throw new IllegalArgumentException("Falta " + what + ".");
        return ((Number) v).intValue();
    }

    private static Map<?, ?> map(Object v, String what) {
        if (!(v instanceof Map)) throw new IllegalArgumentException("Falta " + what + ".");
        return (Map<?, ?>) v;
    }

    private static ServerIdentity.Expected server(Object v) {
        if (v == null) return null;
        Map<?, ?> s = map(v, "el servidor esperado");
        return new ServerIdentity.Expected(str(s.get("serverId"), "la identidad del servidor"), str(s.get("caFingerprint"), "la huella"));
    }

    private static Object[] params(Object v) {
        return v instanceof List ? ((List<?>) v).toArray() : new Object[0];
    }

    private static Map<String, Object> announcement(DiscoveryMath.Announcement x) {
        Map<String, Object> m = new HashMap<>();
        m.put("address", x.address);
        m.put("port", x.port);
        m.put("serverId", x.serverId);
        m.put("caFingerprint", x.caFingerprint);
        m.put("version", x.version);
        return m;
    }

    private static List<Object> announcements(List<DiscoveryMath.Announcement> list) {
        List<Object> out = new ArrayList<>();
        for (DiscoveryMath.Announcement x : list) out.add(announcement(x));
        return out;
    }
}
