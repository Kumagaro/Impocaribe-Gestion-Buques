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
        PackageInfo provider = currentProvider();
        String version = simulated != null ? simulated : provider == null ? null : provider.versionName;
        Intent next = WebViewCheck.outdated(version)
            ? new Intent(this, WebViewOutdatedActivity.class)
                .putExtra(WebViewOutdatedActivity.EXTRA_FOUND, version)
                .putExtra(WebViewOutdatedActivity.EXTRA_PACKAGE, provider == null ? null : provider.packageName)
            : new Intent(this, MainActivity.class);
        startActivity(next);
        finish();
    }

    /** El proveedor del WebView que usa el sistema (paquete y versión); null si no se sabe. */
    private PackageInfo currentProvider() {
        if (Build.VERSION.SDK_INT >= 26) return WebView.getCurrentWebViewPackage();
        // Android 7: el proveedor es Chrome si está instalado y activo; si no, Android System WebView.
        PackageManager pm = getPackageManager();
        for (String pkg : new String[] { "com.android.chrome", "com.google.android.webview" }) {
            try {
                PackageInfo p = pm.getPackageInfo(pkg, 0);
                if (p.applicationInfo != null && p.applicationInfo.enabled) return p;
            } catch (PackageManager.NameNotFoundException ignored) {
                // Se prueba el siguiente.
            }
        }
        return null;
    }
}
