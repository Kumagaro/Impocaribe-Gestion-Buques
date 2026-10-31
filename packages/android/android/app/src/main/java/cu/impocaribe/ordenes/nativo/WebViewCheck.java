package cu.impocaribe.ordenes.nativo;

/**
 * T118 · RF-UI-11 y DT-15: el navegador interno (WebView) tiene que ser Chromium 87 o posterior; si no, la app muestra
 * P-27 antes de cargar la interfaz y ofrece el instalador del servidor local. En Android 7 a 9 el proveedor del WebView
 * suele ser Chrome; desde Android 10, Android System WebView (plan §10.2).
 */
public final class WebViewCheck {
    private WebViewCheck() {}

    public static final int MIN_MAJOR = 87;

    /** La versión mayor de «119.0.6045.163»; -1 si no se sabe (se trata como antigua). */
    public static int major(String versionName) {
        if (versionName == null) return -1;
        try {
            return Integer.parseInt(versionName.trim().split("\\.")[0]);
        } catch (NumberFormatException e) {
            return -1;
        }
    }

    public static boolean outdated(String versionName) {
        return major(versionName) < MIN_MAJOR;
    }

    public static final String CHROME = "com.android.chrome";
    public static final String SYSTEM_WEBVIEW = "com.google.android.webview";

    /** La plataforma publicada (T113) del proveedor que usa el sistema, por su paquete; null si no es ninguno de los dos. */
    public static String platformOf(String packageName) {
        if (CHROME.equals(packageName)) return "android-webview-chrome";
        if (SYSTEM_WEBVIEW.equals(packageName)) return "android-webview-system";
        return null;
    }

    /** El paquete que tiene que traer el instalador de esa plataforma (y cuya firma se compara, ApkTrust). */
    public static String packageOf(String platform) {
        return "android-webview-chrome".equals(platform) ? CHROME : SYSTEM_WEBVIEW;
    }

    /** Sin saber el proveedor: el que suele traer cada Android. */
    public static String provider(int sdk) {
        return sdk <= 28 ? "android-webview-chrome" : "android-webview-system";
    }

    /** «Chrome 83» o «Android System WebView 83», para P-27. */
    public static String label(String platform, String versionName) {
        String name = "android-webview-chrome".equals(platform) ? "Chrome" : "Android System WebView";
        int m = major(versionName);
        return m < 0 ? name + " (versión desconocida)" : name + " " + m;
    }
}
