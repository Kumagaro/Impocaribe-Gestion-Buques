package cu.impocaribe.ordenes;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebView;
import cu.impocaribe.ordenes.nativo.WebViewCheck;

/**
 * T118 · RF-UI-11 y DT-15: la puerta de la app. Antes de cargar la interfaz comprueba el WebView: si es anterior a
 * Chromium 87 abre P-27 (nativa); si no, la app (MainActivity). En depuración, el extra
 * {@code impocaribe.webview.version} simula otra versión para probarlo en el emulador.
 */
public class EntryActivity extends Activity {
    static final String EXTRA_SIMULATED = "impocaribe.webview.version";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        String simulated = BuildConfig.DEBUG ? getIntent().getStringExtra(EXTRA_SIMULATED) : null;
        String version = simulated != null ? simulated : currentWebView();
        Intent next = WebViewCheck.outdated(version)
            ? new Intent(this, WebViewOutdatedActivity.class).putExtra(WebViewOutdatedActivity.EXTRA_FOUND, version)
            : new Intent(this, MainActivity.class);
        startActivity(next);
        finish();
    }

    /** La versión del proveedor del WebView que usa el sistema; null si no se sabe. */
    private String currentWebView() {
        if (Build.VERSION.SDK_INT >= 26) {
            PackageInfo p = WebView.getCurrentWebViewPackage();
            return p == null ? null : p.versionName;
        }
        // Android 7: el proveedor es Chrome si está instalado y activo; si no, Android System WebView.
        PackageManager pm = getPackageManager();
        for (String pkg : new String[] { "com.android.chrome", "com.google.android.webview" }) {
            try {
                PackageInfo p = pm.getPackageInfo(pkg, 0);
                if (p.applicationInfo != null && p.applicationInfo.enabled) return p.versionName;
            } catch (PackageManager.NameNotFoundException ignored) {
                // Se prueba el siguiente.
            }
        }
        return null;
    }
}
