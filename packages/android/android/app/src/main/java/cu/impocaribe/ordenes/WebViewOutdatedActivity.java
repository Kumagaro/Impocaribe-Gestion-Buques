package cu.impocaribe.ordenes;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import androidx.core.content.FileProvider;
import cu.impocaribe.ordenes.nativo.Discovery;
import cu.impocaribe.ordenes.nativo.DiscoveryMath;
import cu.impocaribe.ordenes.nativo.NativeTransport;
import cu.impocaribe.ordenes.nativo.SecureStore;
import cu.impocaribe.ordenes.nativo.ServerIdentity;
import cu.impocaribe.ordenes.nativo.WebViewCheck;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import org.json.JSONObject;

/**
 * T118 · P-27 (maqueta T114) y RF-UI-11: el WebView es demasiado antiguo para la interfaz, así que esta pantalla es
 * nativa, con el aspecto del sistema. Busca el servidor (el emparejado o el de la red), pide el instalador del
 * proveedor que corresponde a este Android (T113), lo descarga con su progreso, comprueba su huella y abre la
 * instalación. Sin internet: todo sale del servidor local.
 */
public class WebViewOutdatedActivity extends Activity {
    static final String EXTRA_FOUND = "impocaribe.webview.found";
    private static final String PAIRING_KEY = "impocaribe.pairing";

    private final String provider = WebViewCheck.provider(Build.VERSION.SDK_INT);
    private TextView status;
    private TextView willInstall;
    private ProgressBar bar;
    private Button action;

    private int dp(int v) {
        return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics());
    }

    private TextView text(String s, int sp, int color) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        t.setLineSpacing(0, 1.2f);
        return t;
    }

    private LinearLayout row(String key, TextView value) {
        LinearLayout r = new LinearLayout(this);
        r.setOrientation(LinearLayout.HORIZONTAL);
        TextView k = text(key, 14, 0xFF5F6368);
        k.setMinWidth(dp(110));
        r.addView(k);
        value.setTypeface(Typeface.MONOSPACE);
        r.addView(value);
        return r;
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        String found = getIntent().getStringExtra(EXTRA_FOUND);

        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(dp(22), dp(28), dp(22), dp(28));
        box.setBackgroundColor(0xFFFAFAFA);

        TextView title = text("Hay que actualizar un componente de Android", 20, 0xFF202124);
        title.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        box.addView(title);
        box.addView(space(14));
        box.addView(
            text(
                "Órdenes de Carga usa el navegador interno de Android (WebView), y el de este teléfono es demasiado "
                    + "antiguo. El servidor de la empresa tiene la actualización: no hace falta internet.",
                14,
                0xFF3C4043
            )
        );
        box.addView(space(14));
        box.addView(row("Encontrada", text(WebViewCheck.label(provider, found), 14, 0xFF202124)));
        box.addView(row("Mínima", text(WebViewCheck.label(provider, String.valueOf(WebViewCheck.MIN_MAJOR)), 14, 0xFF202124)));
        willInstall = text("se busca en el servidor", 14, 0xFF202124);
        box.addView(row("Se instalará", willInstall));
        box.addView(space(14));
        box.addView(text("Android le pedirá permitir instalar apps de este origen la primera vez.", 12, 0xFF5F6368));
        box.addView(space(14));
        bar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        bar.setVisibility(View.GONE);
        box.addView(bar);
        status = text("", 13, 0xFF5F6368);
        box.addView(status);
        // Como en la maqueta: el botón abajo, al alcance del pulgar.
        View push = new View(this);
        push.setLayoutParams(new LinearLayout.LayoutParams(1, 0, 1f));
        box.addView(push);
        box.addView(space(18));
        action = new Button(this);
        action.setText("DESCARGAR E INSTALAR");
        action.setTextColor(Color.WHITE);
        action.setBackgroundColor(0xFF1A73E8);
        action.setOnClickListener(v -> start());
        box.addView(action, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(48)));

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.addView(box);
        setContentView(scroll);
    }

    private View space(int h) {
        View v = new View(this);
        v.setLayoutParams(new LinearLayout.LayoutParams(1, dp(h)));
        return v;
    }

    private void ui(Runnable r) {
        runOnUiThread(r);
    }

    private void fail(String message) {
        ui(() -> {
            bar.setVisibility(View.GONE);
            status.setText(message);
            action.setEnabled(true);
            action.setText("VOLVER A INTENTARLO");
        });
    }

    private void start() {
        action.setEnabled(false);
        action.setText("BUSCANDO EL SERVIDOR…");
        status.setText("");
        new Thread(this::run, "impocaribe-p27").start();
    }

    /** Busca el servidor, pide el instalador publicado, lo descarga con su huella y abre la instalación. */
    private void run() {
        try {
            DiscoveryMath.Announcement server = findServer();
            if (server == null) {
                fail(
                    "No se encontró el servidor. Compruebe que el teléfono está en la red de la empresa o pida ayuda "
                        + "al responsable."
                );
                return;
            }
            ServerIdentity.Expected expected = new ServerIdentity.Expected(server.serverId, server.caFingerprint);
            NativeTransport transport = new NativeTransport((id, e, d) -> {}, BuildConfig.TLS_OFF);
            String base = (BuildConfig.TLS_OFF ? "http" : "https") + "://" + server.address + ":" + server.port;
            NativeTransport.Result res = transport.http(
                base + "/api/v1/updates/check?platform=" + provider + "&version=0.0.0",
                "GET",
                new HashMap<>(),
                null,
                expected
            );
            JSONObject check = new JSONObject(new String(res.body == null ? new byte[0] : res.body, StandardCharsets.UTF_8));
            if (res.status != 200 || check.isNull("latest") || check.isNull("downloadUrl")) {
                fail("El servidor no tiene este instalador. Pida al responsable que lo publique en Versiones de la app.");
                return;
            }
            String latest = check.getString("latest");
            ui(() -> {
                willInstall.setText(WebViewCheck.label(provider, latest));
                action.setText("DESCARGANDO…");
                bar.setVisibility(View.VISIBLE);
            });
            File apk = new File(getCacheDir(), provider + "-" + latest + ".apk");
            transport.download(base + check.getString("downloadUrl"), expected, check.getString("sha256"), apk, (got, total) ->
                ui(() -> {
                    bar.setMax(100);
                    bar.setProgress(total > 0 ? (int) (got * 100 / total) : 0);
                    status.setText(String.format("%.1f de %.1f MB", got / 1048576.0, total / 1048576.0).replace('.', ','));
                })
            );
            ui(() -> install(apk));
        } catch (Exception e) {
            fail(e.getMessage() == null ? "No se pudo descargar la actualización." : e.getMessage());
        }
    }

    /** El emparejado (por su última dirección) y, si no responde, el que se anuncie en la red. */
    private DiscoveryMath.Announcement findServer() throws Exception {
        Discovery discovery = new Discovery(this);
        try {
            String raw = new SecureStore(this).get(PAIRING_KEY);
            if (raw != null) {
                JSONObject p = new JSONObject(raw);
                JSONObject last = p.optJSONObject("lastAddress");
                if (last != null) {
                    DiscoveryMath.Announcement a = discovery.probe(last.getString("address"), last.getInt("port"), 2000, BuildConfig.TLS_OFF);
                    if (a != null && a.serverId.equals(p.getString("serverId"))) return a;
                }
            }
        } catch (Exception ignored) {
            // Sin emparejamiento guardado: se busca en la red.
        }
        List<DiscoveryMath.Announcement> found = discovery.broadcast(1500);
        if (found.isEmpty()) found = discovery.browse(3000);
        return found.isEmpty() ? null : found.get(0);
    }

    private void install(File apk) {
        bar.setVisibility(View.GONE);
        action.setEnabled(true);
        action.setText("INSTALAR");
        action.setOnClickListener(v -> install(apk));
        // Desde Android 8, la primera vez hay que permitir que esta app instale paquetes.
        if (Build.VERSION.SDK_INT >= 26 && !getPackageManager().canRequestPackageInstalls()) {
            status.setText("Permita instalar apps de este origen y vuelva a tocar Instalar.");
            startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getPackageName())));
            return;
        }
        Uri uri = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", apk);
        startActivity(
            new Intent(Intent.ACTION_VIEW)
                .setDataAndType(uri, "application/vnd.android.package-archive")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK)
        );
        status.setText("Cuando termine la instalación, vuelva a abrir Órdenes de Carga.");
        status.setGravity(Gravity.START);
    }
}
