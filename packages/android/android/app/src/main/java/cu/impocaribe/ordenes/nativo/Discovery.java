package cu.impocaribe.ordenes.nativo;

import android.content.Context;
import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;
import android.net.wifi.WifiManager;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InterfaceAddress;
import java.net.NetworkInterface;
import java.net.SocketTimeoutException;
import java.nio.charset.StandardCharsets;
import java.security.cert.X509Certificate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import javax.net.ssl.SSLContext;
import javax.net.ssl.X509TrustManager;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import org.json.JSONObject;

/**
 * T118 · DT-20, RF-RED-02 y plan §10.2: la búsqueda del servidor en Android. DNS-SD con NsdManager (con MulticastLock,
 * sin él muchos teléfonos descartan la multidifusión), difusión UDP al puerto 47800, la sonda a /api/v1/discovery y la
 * subred /24. Lo anunciado no prueba nada: la identidad se comprueba al conectar (DT-18).
 */
public final class Discovery {
    static final String SERVICE_TYPE = "_impocaribe._tcp";
    static final int BROADCAST_PORT = 47800;
    static final String BROADCAST_PROBE = "IMPOCARIBE-DISCOVER/1";

    private final Context context;

    public Discovery(Context context) {
        this.context = context.getApplicationContext();
    }

    /** DNS-SD durante {@code timeoutMs}: cada instancia encontrada se resuelve (una a una, como pide NsdManager). */
    public List<DiscoveryMath.Announcement> browse(int timeoutMs) throws InterruptedException {
        NsdManager nsd = (NsdManager) context.getSystemService(Context.NSD_SERVICE);
        WifiManager wifi = (WifiManager) context.getSystemService(Context.WIFI_SERVICE);
        WifiManager.MulticastLock lock = wifi.createMulticastLock("impocaribe.descubrimiento");
        lock.setReferenceCounted(false);
        lock.acquire();
        List<DiscoveryMath.Announcement> found = Collections.synchronizedList(new ArrayList<>());
        List<NsdServiceInfo> pending = Collections.synchronizedList(new ArrayList<>());
        NsdManager.DiscoveryListener listener = new NsdManager.DiscoveryListener() {
            @Override public void onServiceFound(NsdServiceInfo info) { pending.add(info); }
            @Override public void onServiceLost(NsdServiceInfo info) {}
            @Override public void onDiscoveryStarted(String type) {}
            @Override public void onDiscoveryStopped(String type) {}
            @Override public void onStartDiscoveryFailed(String type, int code) {}
            @Override public void onStopDiscoveryFailed(String type, int code) {}
        };
        try {
            nsd.discoverServices(SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, listener);
            long until = System.currentTimeMillis() + timeoutMs;
            while (System.currentTimeMillis() < until) {
                NsdServiceInfo next = pending.isEmpty() ? null : pending.remove(0);
                if (next == null) {
                    Thread.sleep(50);
                    continue;
                }
                DiscoveryMath.Announcement a = resolve(nsd, next, until - System.currentTimeMillis());
                if (a != null) found.add(a);
            }
        } finally {
            try {
                nsd.stopServiceDiscovery(listener);
            } catch (IllegalArgumentException ignored) {
                // No llegó a arrancar.
            }
            lock.release();
        }
        return DiscoveryMath.unique(found);
    }

    @SuppressWarnings("deprecation") // resolveService: la alternativa nueva es de Android 14; esta va desde Android 7.
    private static DiscoveryMath.Announcement resolve(NsdManager nsd, NsdServiceInfo info, long waitMs)
        throws InterruptedException {
        final DiscoveryMath.Announcement[] out = { null };
        final Object done = new Object();
        nsd.resolveService(info, new NsdManager.ResolveListener() {
            @Override
            public void onResolveFailed(NsdServiceInfo i, int code) {
                synchronized (done) { done.notifyAll(); }
            }

            @Override
            public void onServiceResolved(NsdServiceInfo i) {
                Map<String, String> txt = new HashMap<>();
                for (Map.Entry<String, byte[]> e : i.getAttributes().entrySet())
                    txt.put(e.getKey(), e.getValue() == null ? null : new String(e.getValue(), StandardCharsets.UTF_8));
                InetAddress host = i.getHost();
                out[0] = DiscoveryMath.fromTxt(txt, host == null ? null : host.getHostAddress(), i.getPort());
                synchronized (done) { done.notifyAll(); }
            }
        });
        synchronized (done) {
            if (out[0] == null) done.wait(Math.max(1, waitMs));
        }
        return out[0];
    }

    /** Las direcciones IPv4 de la red local y su prefijo. */
    static List<InterfaceAddress> lan() throws Exception {
        List<InterfaceAddress> out = new ArrayList<>();
        for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
            if (!ni.isUp() || ni.isLoopback()) continue;
            for (InterfaceAddress ia : ni.getInterfaceAddresses())
                if (ia.getAddress() instanceof Inet4Address) out.add(ia);
        }
        return out;
    }

    /** Difusión UDP al puerto 47800 en cada interfaz y a la general; el servidor responde con su anuncio. */
    public List<DiscoveryMath.Announcement> broadcast(int timeoutMs) throws Exception {
        Set<String> targets = new LinkedHashSet<>();
        for (InterfaceAddress ia : lan())
            targets.add(DiscoveryMath.broadcastOf(ia.getAddress().getHostAddress(), ia.getNetworkPrefixLength()));
        targets.add("255.255.255.255");
        List<DiscoveryMath.Announcement> found = new ArrayList<>();
        try (DatagramSocket socket = new DatagramSocket()) {
            socket.setBroadcast(true);
            byte[] probe = BROADCAST_PROBE.getBytes(StandardCharsets.UTF_8);
            for (String t : targets) {
                try {
                    socket.send(new DatagramPacket(probe, probe.length, InetAddress.getByName(t), BROADCAST_PORT));
                } catch (Exception ignored) {
                    // Una interfaz que no deja difundir: se sigue con las demás.
                }
            }
            long until = System.currentTimeMillis() + timeoutMs;
            byte[] buf = new byte[2048];
            while (System.currentTimeMillis() < until) {
                socket.setSoTimeout((int) Math.max(1, until - System.currentTimeMillis()));
                DatagramPacket p = new DatagramPacket(buf, buf.length);
                try {
                    socket.receive(p);
                } catch (SocketTimeoutException e) {
                    break;
                }
                DiscoveryMath.Announcement a = DiscoveryMath.fromBroadcast(
                    new String(p.getData(), 0, p.getLength(), StandardCharsets.UTF_8),
                    p.getAddress().getHostAddress()
                );
                if (a != null) found.add(a);
            }
        }
        return DiscoveryMath.unique(found);
    }

    /**
     * GET /api/v1/discovery. Sin verificar la cadena: solo se lee el anuncio, que no prueba nada; la identidad se
     * comprueba al conectar (DT-18). {@code https} salvo en las pruebas contra un servidor sin TLS.
     */
    /** Un solo cliente para todas las sondas (sus conexiones e hilos se comparten): la /24 son 254 a la vez. */
    private static OkHttpClient probeClient;

    private static synchronized OkHttpClient probeClient() throws Exception {
        if (probeClient == null) {
            X509TrustManager readOnly = new X509TrustManager() {
                @Override public void checkClientTrusted(X509Certificate[] c, String a) {}
                @Override public void checkServerTrusted(X509Certificate[] c, String a) {}
                @Override public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; }
            };
            SSLContext tls = SSLContext.getInstance("TLS");
            tls.init(null, new X509TrustManager[] { readOnly }, null);
            probeClient = new OkHttpClient.Builder()
                .sslSocketFactory(tls.getSocketFactory(), readOnly)
                .hostnameVerifier((h, s) -> true)
                .build();
        }
        return probeClient;
    }

    public DiscoveryMath.Announcement probe(String address, int port, int timeoutMs, boolean plain) {
        try {
            OkHttpClient client = probeClient().newBuilder().callTimeout(timeoutMs, TimeUnit.MILLISECONDS).build();
            String url = (plain ? "http" : "https") + "://" + address + ":" + port + "/api/v1/discovery";
            try (Response res = client.newCall(new Request.Builder().url(url).build()).execute()) {
                if (res.code() != 200 || res.body() == null) return null;
                JSONObject o = new JSONObject(res.body().string());
                if (!o.has("serverId") || !o.has("caFingerprint")) return null;
                return new DiscoveryMath.Announcement(address, port, o.getString("serverId"), o.getString("caFingerprint"), o.optString("version", ""));
            }
        } catch (Exception e) {
            return null;
        }
    }

    /** Las direcciones de la /24 de cada interfaz, sin la propia. */
    public List<String> subnet() throws Exception {
        List<String> own = new ArrayList<>();
        for (InterfaceAddress ia : lan()) own.add(ia.getAddress().getHostAddress());
        return DiscoveryMath.subnet(own);
    }
}
