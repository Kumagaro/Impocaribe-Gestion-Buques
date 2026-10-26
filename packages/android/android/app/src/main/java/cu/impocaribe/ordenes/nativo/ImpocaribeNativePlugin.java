package cu.impocaribe.ordenes.nativo;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.PowerManager;
import android.provider.Settings;
import android.content.pm.PackageInfo;
import android.os.Build;
import android.util.Base64;
import android.view.WindowManager;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.PermissionState;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import cu.impocaribe.ordenes.QrScanActivity;
import cu.impocaribe.ordenes.BuildConfig;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * T118 · plan §10.2: el puente nativo de la app Android, con los mismos canales que el proceso principal de Electron
 * (NATIVE_CHANNELS, packages/shared/src/domain/nativeBridge.ts). Por Capacitor solo viaja JSON: los bytes van como
 * {@code { $bytes: base64 }} (web/src/platform/capacitor-bridge.ts). Los argumentos llegan de la interfaz: se comprueban.
 */
@CapacitorPlugin(
    name = "ImpocaribeNative",
    permissions = {
        @Permission(strings = { Manifest.permission.CAMERA }, alias = "camera"),
        @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notifications"),
        // T120: solo hasta Android 9 (desde 10 Descargas no pide permiso; el manifiesto lo limita).
        @Permission(strings = { Manifest.permission.WRITE_EXTERNAL_STORAGE }, alias = "storage"),
    }
)
public class ImpocaribeNativePlugin extends Plugin {
    private SecureStore secure;
    private LocalDatabases databases;
    private NativeTransport transport;
    private Discovery discovery;
    /**
     * Capacitor atiende todos los métodos del plugin en un solo hilo: una sonda de la subred (3 s) frenaría todo lo
     * demás. Lo que espera a la red va a su propio hilo; el resto, en orden por uno solo (los mensajes de un WebSocket y
     * las sentencias de una transacción no pueden cambiar de orden).
     */
    private final ExecutorService ordered = Executors.newSingleThreadExecutor();
    private final ExecutorService network = Executors.newCachedThreadPool();

    @Override
    public void load() {
        secure = new SecureStore(getContext());
        databases = new LocalDatabases(getContext(), secure);
        transport = new NativeTransport(this::socketEvent, BuildConfig.TLS_OFF);
        discovery = new Discovery(getContext());
    }

    @Override
    protected void handleOnDestroy() {
        ordered.shutdown();
        network.shutdown();
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
        // Solo la compilación de prueba sin TLS (-PimpocaribeTlsOff=true): la interfaz habla con http://.
        if (BuildConfig.TLS_OFF) info.put("plainHttp", true);
        call.resolve(info);
    }

    @PluginMethod
    public void invoke(PluginCall call) {
        String channel = call.getString("channel", "");
        // T118 · P-01: el QR abre la cámara (con su permiso) y responde al volver; no pasa por dispatch.
        if ("qr.scan".equals(channel)) {
            if (getPermissionState("camera") == PermissionState.GRANTED) scan(call);
            else requestPermissionForAlias("camera", call, "cameraPermission");
            return;
        }
        // T119: el servicio de alertas; antes, el permiso de notificaciones (Android 13 o superior).
        if ("alerts.start".equals(channel)) {
            if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED)
                requestPermissionForAlias("notifications", call, "notificationsPermission");
            else startAlerts(call);
            return;
        }
        // T120: hasta Android 9, guardar en Descargas pide el permiso de almacenamiento la primera vez.
        if ("file.save".equals(channel) && Build.VERSION.SDK_INT < 29 && getPermissionState("storage") != PermissionState.GRANTED) {
            requestPermissionForAlias("storage", call, "storagePermission");
            return;
        }
        run(call, channel);
    }

    @PermissionCallback
    private void storagePermission(PluginCall call) {
        if (getPermissionState("storage") == PermissionState.GRANTED) run(call, "file.save");
        else call.reject("Sin permiso para guardar en Descargas: permítalo en los ajustes de la app.");
    }

    private void run(PluginCall call, String channel) {
        JSArray args = call.getArray("args", new JSArray());
        boolean waitsForNetwork = channel.equals("http") || channel.startsWith("discovery.");
        (waitsForNetwork ? network : ordered).execute(() -> {
            try {
                Object decoded = decode(args);
                Object value = dispatch(channel, decoded instanceof List ? (List<?>) decoded : new ArrayList<>());
                JSObject out = new JSObject();
                out.put("value", encode(value));
                call.resolve(out);
            } catch (Exception e) {
                call.reject(e.getMessage() == null ? "Error de la parte nativa." : e.getMessage(), e);
            }
        });
    }

    @PermissionCallback
    private void cameraPermission(PluginCall call) {
        if (getPermissionState("camera") == PermissionState.GRANTED) scan(call);
        else call.reject("Sin permiso para usar la cámara: empareje con el código o escriba la dirección a mano.");
    }

    /** Sin permiso el servicio arranca igual (Android lo deja): las alertas se ven en la app y el contador. */
    @PermissionCallback
    private void notificationsPermission(PluginCall call) {
        startAlerts(call);
    }

    /**
     * T119 · DT-05: args = [labels, token?]. Con token (el de una sesión nueva), lo guarda y reinicia el servicio con
     * él; sin token, sigue con el guardado. Responde si el servicio quedó en marcha: false = no hay token, que la
     * interfaz pida uno (pedirlo en cada arranque solo llenaría la bitácora).
     */
    private void startAlerts(PluginCall call) {
        try {
            List<?> a = (List<?>) decode(call.getArray("args", new JSArray()));
            Map<?, ?> labels = map(arg(a, 0), "los nombres de las alertas");
            Object token = arg(a, 1);
            String stored = null;
            String raw = secure.get(AlertService.STORE_KEY);
            if (raw != null) stored = new JSONObject(raw).optString("token", null);
            String use = token instanceof String ? (String) token : stored;
            JSObject out = new JSObject();
            if (use == null) {
                out.put("value", false);
                call.resolve(out);
                return;
            }
            secure.set(AlertService.STORE_KEY, new JSONObject().put("token", use).put("labels", new JSONObject(labels)).toString());
            Context context = getContext();
            if (token instanceof String) AlertService.stop(context);
            AlertService.start(context);
            askBatteryExclusion();
            out.put("value", true);
            call.resolve(out);
        } catch (Exception e) {
            call.reject(e.getMessage() == null ? "No se pudo arrancar el servicio de alertas." : e.getMessage(), e);
        }
    }

    /**
     * Plan §10.2 y R-01: sin la exclusión de la optimización de batería, Android puede dormir el servicio. Se pide una
     * sola vez; si el usuario no la da, la guía de instalación explica cómo hacerlo por marca.
     */
    private void askBatteryExclusion() {
        Context context = getContext();
        PowerManager power = context.getSystemService(PowerManager.class);
        if (power.isIgnoringBatteryOptimizations(context.getPackageName())) return;
        android.content.SharedPreferences prefs = context.getSharedPreferences("impocaribe.native", Context.MODE_PRIVATE);
        if (prefs.getBoolean("batteryAsked", false)) return;
        prefs.edit().putBoolean("batteryAsked", true).apply();
        getActivity().startActivity(
            new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + context.getPackageName()))
        );
    }

    private void scan(PluginCall call) {
        startActivityForResult(call, new Intent(getContext(), QrScanActivity.class), "qrResult");
    }

    /** El texto del QR, o null si se canceló. */
    @ActivityCallback
    private void qrResult(PluginCall call, ActivityResult result) {
        JSObject out = new JSObject();
        Intent data = result.getData();
        String text = result.getResultCode() == Activity.RESULT_OK && data != null ? data.getStringExtra(QrScanActivity.EXTRA_TEXT) : null;
        out.put("value", text == null ? JSONObject.NULL : text);
        call.resolve(out);
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
            case "alerts.stop":
                // RF-AUT-08: al cerrar sesión, sin token ni avisos de esa sesión.
                AlertService.stop(getContext());
                AlertService.forget(getContext(), null);
                return null;
            case "notify":
                // T119: en Android las notifica el servicio de alertas, también con la app abierta; si la interfaz
                // también lo hiciera, cada alerta saldría dos veces.
                return null;
            case "file.save": {
                Object data = arg(a, 1);
                if (!(data instanceof byte[])) throw new IllegalArgumentException("Falta el contenido del archivo.");
                Downloads.save(getContext(), str(arg(a, 0), "el nombre"), (byte[]) data);
                return null;
            }
            // shortcut: la actualización del APK llega con T121; hasta entonces se dice por qué no se puede.
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
