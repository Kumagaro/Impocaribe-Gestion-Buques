package cu.impocaribe.ordenes.nativo;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import javax.net.ssl.SSLContext;
import javax.net.ssl.X509TrustManager;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;

/**
 * T118 · DT-19 y DT-18: todas las peticiones HTTP y los WebSocket de la app Android salen de aquí, con OkHttp y un
 * gestor de confianza que solo acepta la cadena del servidor esperado (el emparejado, o el anunciado mientras se
 * empareja). La IP no cuenta: el nombre del certificado lo comprueba ServerIdentity. Sin servidor esperado no sale
 * nada por HTTPS.
 */
public final class NativeTransport {
    public interface SocketEvents {
        void emit(int id, String event, String data);
    }

    public static final class Result {
        public final int status;
        public final List<String[]> headers;
        public final byte[] body;

        Result(int status, List<String[]> headers, byte[] body) {
            this.status = status;
            this.headers = headers;
            this.body = body;
        }
    }

    static final String NO_SERVER = "No se sabe qué servidor debe responder: empareje este equipo de nuevo.";

    private final Map<String, OkHttpClient> clients = new HashMap<>();
    private final Map<Integer, WebSocket> sockets = new HashMap<>();
    private final SocketEvents events;
    /** Solo las pruebas contra un servidor sin TLS (las compilaciones de depuración) usan http://. */
    private final boolean allowPlainHttp;
    private int next = 1;

    public NativeTransport(SocketEvents events, boolean allowPlainHttp) {
        this.events = events;
        this.allowPlainHttp = allowPlainHttp;
    }

    private synchronized OkHttpClient client(String url, ServerIdentity.Expected server) throws Exception {
        if (url.startsWith("http://") || url.startsWith("ws://")) {
            if (!allowPlainHttp) throw new IllegalStateException("La app solo habla con el servidor por HTTPS.");
            return clients.computeIfAbsent("", k -> new OkHttpClient.Builder().pingInterval(25, TimeUnit.SECONDS).build());
        }
        if (server == null) throw new IllegalStateException(NO_SERVER);
        OkHttpClient c = clients.get(server.key());
        if (c == null) {
            X509TrustManager trust = ServerIdentity.trustManager(server);
            SSLContext tls = SSLContext.getInstance("TLS");
            tls.init(null, new X509TrustManager[] { trust }, null);
            c = new OkHttpClient.Builder()
                .sslSocketFactory(tls.getSocketFactory(), trust)
                // El nombre que vale es el de la identidad (<id>.impocaribe), no el de la IP: lo comprobó el gestor.
                .hostnameVerifier((host, session) -> true)
                .connectTimeout(10, TimeUnit.SECONDS)
                .readTimeout(120, TimeUnit.SECONDS)
                .pingInterval(25, TimeUnit.SECONDS)
                .build();
            clients.put(server.key(), c);
        }
        return c;
    }

    public Result http(String url, String method, Map<String, String> headers, byte[] body, ServerIdentity.Expected server)
        throws Exception {
        Request.Builder req = new Request.Builder().url(url);
        for (Map.Entry<String, String> h : headers.entrySet()) req.header(h.getKey(), h.getValue());
        String type = headers.getOrDefault("Content-Type", null);
        RequestBody payload = body == null
            ? (method.equals("GET") || method.equals("HEAD") ? null : RequestBody.create(new byte[0], null))
            : RequestBody.create(body, type == null ? null : MediaType.parse(type));
        req.method(method, payload);
        try (Response res = client(url, server).newCall(req.build()).execute()) {
            List<String[]> out = new ArrayList<>();
            for (String name : res.headers().names()) out.add(new String[] { name.toLowerCase(), res.header(name) });
            byte[] bytes = res.body() == null ? null : res.body().bytes();
            return new Result(res.code(), out, bytes == null || bytes.length == 0 ? null : bytes);
        }
    }

    /** Abre un WebSocket y devuelve su número; sus eventos salen por {@code events}. */
    public synchronized int open(String url, ServerIdentity.Expected server) throws Exception {
        int id = next++;
        WebSocket ws = client(url, server).newWebSocket(
            new Request.Builder().url(url).build(),
            new WebSocketListener() {
                @Override
                public void onOpen(WebSocket socket, Response response) {
                    events.emit(id, "open", null);
                }

                @Override
                public void onMessage(WebSocket socket, String text) {
                    events.emit(id, "message", text);
                }

                @Override
                public void onClosed(WebSocket socket, int code, String reason) {
                    forget(id);
                    events.emit(id, "close", String.valueOf(code));
                }

                @Override
                public void onFailure(WebSocket socket, Throwable t, Response response) {
                    forget(id);
                    events.emit(id, "error", t.getMessage());
                    events.emit(id, "close", null);
                }
            }
        );
        sockets.put(id, ws);
        return id;
    }

    private synchronized void forget(int id) {
        sockets.remove(id);
    }

    public synchronized void send(int id, String data) {
        WebSocket ws = sockets.get(id);
        if (ws != null) ws.send(data);
    }

    public synchronized void close(int id) {
        WebSocket ws = sockets.get(id);
        if (ws != null) ws.close(1000, null);
    }

    public synchronized void closeAll() {
        for (WebSocket ws : sockets.values()) ws.close(1001, null);
        sockets.clear();
    }
}
