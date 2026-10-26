package cu.impocaribe.ordenes.nativo;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import cu.impocaribe.ordenes.BuildConfig;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.json.JSONObject;

/**
 * T121 · RF-UPD-05 y plan §10.2: actualiza la app desde el servidor emparejado, como la PC (T117). La interfaz solo
 * dice qué versión: el servidor sale del emparejamiento guardado y su identidad se verifica (DT-18); la versión tiene
 * que ser la publicada y más nueva que la instalada; el APK tiene que traer la huella publicada y ser esta app firmada
 * con la misma clave que la instalada (ApkTrust; Android tampoco instalaría otra firma). Abre el instalador del sistema,
 * que pide la confirmación del usuario.
 */
public final class AppUpdate {
    private AppUpdate() {}

    private static final Pattern SEMVER = Pattern.compile("^(\\d+)\\.(\\d+)\\.(\\d+)$");

    /** Como compareVersions de shared (appVersion.ts): negativo si {@code a} es anterior; error si no es x.y.z. */
    static int compare(String a, String b) {
        Matcher x = SEMVER.matcher(a == null ? "" : a);
        Matcher y = SEMVER.matcher(b == null ? "" : b);
        if (!x.matches() || !y.matches()) throw new IllegalArgumentException("Versión mal formada: " + (x.matches() ? b : a));
        for (int i = 1; i <= 3; i++) {
            int diff = Integer.compare(Integer.parseInt(x.group(i)), Integer.parseInt(y.group(i)));
            if (diff != 0) return diff;
        }
        return 0;
    }

    public interface Progress {
        void update(long received, long total);
    }

    public static void install(Activity activity, String version, Progress progress) throws Exception {
        String current = BuildConfig.VERSION_NAME;
        if (!SEMVER.matcher(version).matches()) throw new IllegalArgumentException("Versión no válida: " + version);
        if (compare(version, current) <= 0)
            throw new IllegalArgumentException("La " + version + " no es más nueva que la instalada (" + current + ").");
        // Desde Android 8 hay que permitir una vez que esta app instale paquetes; se pide antes de descargar.
        if (Build.VERSION.SDK_INT >= 26 && !activity.getPackageManager().canRequestPackageInstalls()) {
            activity.startActivity(
                new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + activity.getPackageName()))
            );
            throw new IllegalStateException("Permita instalar apps de este origen y vuelva a tocar «Actualizar ahora».");
        }
        DiscoveryMath.Announcement server = PairedServer.find(activity, false);
        if (server == null) throw new IllegalStateException("No se encontró el servidor emparejado: no se puede actualizar ahora.");
        ServerIdentity.Expected expected = new ServerIdentity.Expected(server.serverId, server.caFingerprint);
        NativeTransport transport = new NativeTransport((id, e, d) -> {}, BuildConfig.TLS_OFF);
        String base = (BuildConfig.TLS_OFF ? "http" : "https") + "://" + server.address + ":" + server.port + "/api/v1/updates";
        NativeTransport.Result res = transport.http(base + "/check?platform=android&version=" + current, "GET", new HashMap<>(), null, expected);
        JSONObject check = new JSONObject(new String(res.body == null ? new byte[0] : res.body, StandardCharsets.UTF_8));
        String sha256 = check.optString("sha256", "");
        if (res.status != 200 || !version.equals(check.optString("latest")) || !sha256.matches("^[0-9a-fA-F]{64}$"))
            throw new IllegalStateException("La " + version + " no es la versión publicada en el servidor.");
        // Un nombre fijo: nada de lo que dice el servidor forma la ruta.
        File apk = new File(activity.getCacheDir(), "impocaribe.apk");
        transport.download(base + "/android/" + version + "/download", expected, sha256, apk, progress::update);
        String untrusted = ApkTrust.check(activity.getPackageManager(), apk, activity.getPackageName());
        if (untrusted != null) {
            apk.delete();
            throw new IllegalStateException(untrusted);
        }
        Uri uri = FileProvider.getUriForFile(activity, activity.getPackageName() + ".fileprovider", apk);
        activity.startActivity(
            new Intent(Intent.ACTION_VIEW)
                .setDataAndType(uri, "application/vnd.android.package-archive")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK)
        );
    }
}
