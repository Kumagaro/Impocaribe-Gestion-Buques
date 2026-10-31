package cu.impocaribe.ordenes.nativo;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import cu.impocaribe.ordenes.BuildConfig;
import cu.impocaribe.ordenes.R;
import java.util.concurrent.LinkedBlockingQueue;
import org.json.JSONObject;

/**
 * T119 · RF-ALR-01, RNF-02, DT-05 y plan §10.2: el servicio en primer plano que recibe las alertas con la app cerrada.
 * Mantiene su propio WebSocket con el servidor emparejado (el mismo transporte que verifica su identidad, DT-18) y el
 * token de dispositivo, que solo recibe alertas y revocaciones. Muestra el aviso fijo y una notificación por alerta,
 * con solo el tipo y la referencia (RF-ALR-02). Se reconecta solo; se detiene al cerrar sesión o si el servidor
 * revoca el token. Desde Android 7: en 7 la notificación es la clásica (sin canales) y se arranca con startService.
 */
public class AlertService extends Service {
    /** {token, labels}: lo deja la interfaz al iniciar sesión (canal alerts.start) y lo borra al cerrarla. */
    public static final String STORE_KEY = "impocaribe.alerts";
    private static final String CHANNEL_ALERTS = "alertas";
    private static final String CHANNEL_SERVICE = "conexion";
    private static final int ONGOING_ID = 1;

    private volatile boolean running;
    private Thread worker;
    private NativeTransport transport;

    public static void start(Context context) {
        Intent intent = new Intent(context, AlertService.class);
        if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(intent);
        else context.startService(intent);
    }

    public static void stop(Context context) {
        context.stopService(new Intent(context, AlertService.class));
    }

    /** Hay token guardado: el servicio debe estar en marcha (al encender el teléfono, BootReceiver). */
    public static boolean configured(Context context) {
        try {
            return new SecureStore(context).get(STORE_KEY) != null;
        } catch (Exception e) {
            return false;
        }
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        channels();
        ServiceCompat.startForeground(
            this,
            ONGOING_ID,
            ongoing(false),
            Build.VERSION.SDK_INT >= 34 ? ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE : 0
        );
        if (worker == null) {
            running = true;
            worker = new Thread(this::loop, "impocaribe-alertas");
            worker.start();
        }
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        running = false;
        if (worker != null) worker.interrupt();
        if (transport != null) transport.closeAll();
        super.onDestroy();
    }

    private void loop() {
        int failures = 0;
        String token = null;
        while (running) {
            JSONObject config = config();
            if (config == null) break;
            token = config.optString("token");
            try {
                DiscoveryMath.Announcement server = PairedServer.find(this, false);
                if (server != null) {
                    Boolean keep = listen(server, config);
                    if (keep == null) break; // token revocado o inválido
                    if (keep) failures = 0; // estuvo conectado: se vuelve a intentar enseguida
                }
            } catch (InterruptedException e) {
                return;
            } catch (Exception ignored) {
                // Red caída o servidor apagado: se reintenta.
            }
            if (!running) return;
            update(false);
            try {
                Thread.sleep(AlertMessages.backoffMs(++failures));
            } catch (InterruptedException e) {
                return;
            }
        }
        // Sin token o revocado: no hay a quién avisar. Solo se borra el que usó esta conexión: al volver a iniciar
        // sesión, el servidor revoca el anterior mientras la interfaz ya guardó el nuevo.
        if (running) forget(this, token);
        stopSelf();
    }

    /**
     * Una conexión hasta que se cierre. Devuelve true si llegó a estar autenticada, false si no, y null si el servidor
     * rechazó el token o lo revocó (no se reintenta).
     */
    private Boolean listen(DiscoveryMath.Announcement server, JSONObject config) throws Exception {
        LinkedBlockingQueue<String[]> events = new LinkedBlockingQueue<>();
        transport = new NativeTransport((id, event, data) -> events.add(new String[] { event, data }), BuildConfig.TLS_OFF);
        String url = (BuildConfig.TLS_OFF ? "ws" : "wss") + "://" + server.address + ":" + server.port + "/api/v1/ws";
        int socket = transport.open(url, new ServerIdentity.Expected(server.serverId, server.caFingerprint));
        JSONObject labels = config.optJSONObject("labels");
        boolean ready = false;
        try {
            while (running) {
                String[] e = events.take();
                switch (e[0]) {
                    case "open":
                        transport.send(socket, new JSONObject().put("type", "auth").put("token", config.getString("token")).toString());
                        break;
                    case "message": {
                        AlertMessages.Action a = AlertMessages.read(e[1], labels);
                        if (a.kind == AlertMessages.Kind.READY) {
                            ready = true;
                            update(true);
                        } else if (a.kind == AlertMessages.Kind.NOTIFY) alert(a);
                        else if (a.kind == AlertMessages.Kind.STOP) return null;
                        break;
                    }
                    case "close":
                        return String.valueOf(AlertMessages.CLOSE_UNAUTHORIZED).equals(e[1]) ? null : ready;
                    default:
                        break;
                }
            }
            return ready;
        } finally {
            transport.closeAll();
        }
    }

    private JSONObject config() {
        try {
            String raw = new SecureStore(this).get(STORE_KEY);
            return raw == null ? null : new JSONObject(raw);
        } catch (Exception e) {
            return null;
        }
    }

    /** Borra el token (si es {@code token}, o cualquiera con null) y las notificaciones: cerrar sesión o token revocado. */
    public static synchronized void forget(Context context, String token) {
        SecureStore store = new SecureStore(context);
        try {
            String raw = store.get(STORE_KEY);
            if (raw != null && token != null && !token.equals(new JSONObject(raw).optString("token"))) return;
        } catch (Exception ignored) {
            // Ilegible: se borra igual.
        }
        store.remove(STORE_KEY);
        context.getSystemService(NotificationManager.class).cancelAll();
    }

    private void channels() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = getSystemService(NotificationManager.class);
        nm.createNotificationChannel(new NotificationChannel(CHANNEL_ALERTS, "Alertas", NotificationManager.IMPORTANCE_HIGH));
        NotificationChannel service = new NotificationChannel(CHANNEL_SERVICE, "Conexión con el servidor", NotificationManager.IMPORTANCE_MIN);
        service.setShowBadge(false);
        nm.createNotificationChannel(service);
    }

    /** Tocar una notificación abre la app (o la trae al frente). */
    private PendingIntent open() {
        Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (launch != null) launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
        return PendingIntent.getActivity(this, 0, launch, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    /** El aviso fijo dice si de verdad está conectado: «conectado» solo cuando el servidor aceptó el token. */
    private Notification ongoing(boolean connected) {
        return new NotificationCompat.Builder(this, CHANNEL_SERVICE)
            .setSmallIcon(R.drawable.ic_stat_impocaribe)
            .setContentTitle(connected ? "Impocaribe conectado" : "Impocaribe sin conexión")
            .setContentText(connected ? "Recibe las alertas aunque la app esté cerrada." : "Buscando el servidor…")
            .setContentIntent(open())
            .setOngoing(true)
            .setShowWhen(false)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .build();
    }

    private void update(boolean connected) {
        getSystemService(NotificationManager.class).notify(ONGOING_ID, ongoing(connected));
    }

    private void alert(AlertMessages.Action a) {
        Notification n = new NotificationCompat.Builder(this, CHANNEL_ALERTS)
            .setSmallIcon(R.drawable.ic_stat_impocaribe)
            .setContentTitle(a.title)
            .setContentText(a.body)
            .setContentIntent(open())
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .build();
        // Una por alerta: si llegara dos veces, la segunda reemplaza a la primera.
        getSystemService(NotificationManager.class).notify(a.id, ONGOING_ID + 1, n);
    }
}
