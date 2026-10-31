package cu.impocaribe.ordenes.nativo;

import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.os.Build;
import java.io.File;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/**
 * T118 · P-27 y T121: un instalador descargado del servidor solo se abre si es el paquete esperado y está firmado con el
 * mismo certificado que la versión ya instalada (Chrome o Android System WebView de Google, o esta app). Así, aunque el
 * servidor que lo entrega no fuera el de la empresa, no podría hacer instalar otro programa.
 */
public final class ApkTrust {
    private ApkTrust() {}

    @SuppressWarnings("deprecation") // GET_SIGNATURES: la alternativa (GET_SIGNING_CERTIFICATES) es de Android 9.
    private static Set<String> signers(PackageInfo info) {
        Set<String> out = new HashSet<>();
        Signature[] sigs;
        if (Build.VERSION.SDK_INT >= 28 && info.signingInfo != null)
            sigs = info.signingInfo.hasMultipleSigners()
                ? info.signingInfo.getApkContentsSigners()
                : info.signingInfo.getSigningCertificateHistory();
        else sigs = info.signatures;
        if (sigs != null) for (Signature s : sigs) out.add(Arrays.toString(s.toByteArray()));
        return out;
    }

    @SuppressWarnings("deprecation")
    private static int flags() {
        return Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
    }

    /** null si el APK es {@code expectedPackage} con la firma de la versión instalada; si no, el motivo. */
    public static String check(PackageManager pm, File apk, String expectedPackage) {
        PackageInfo archive = pm.getPackageArchiveInfo(apk.getPath(), flags());
        if (archive == null) return "El archivo descargado no es un instalador de Android.";
        if (!expectedPackage.equals(archive.packageName))
            return "El instalador descargado no es el esperado (" + archive.packageName + "): no se instala.";
        if (Build.VERSION.SDK_INT < 28 && archive.signatures == null && archive.applicationInfo != null) {
            // En Android 7 y 8 la firma del archivo se lee indicando su ruta.
            archive.applicationInfo.sourceDir = apk.getPath();
            archive.applicationInfo.publicSourceDir = apk.getPath();
            archive = pm.getPackageArchiveInfo(apk.getPath(), flags());
        }
        try {
            PackageInfo installed = pm.getPackageInfo(expectedPackage, flags());
            Set<String> mine = signers(installed);
            Set<String> theirs = signers(archive);
            if (mine.isEmpty() || theirs.isEmpty() || !mine.containsAll(theirs) && !theirs.containsAll(mine))
                return "El instalador descargado no tiene la firma del fabricante: no se instala.";
            return null;
        } catch (PackageManager.NameNotFoundException e) {
            return "No hay una versión instalada con la que comparar la firma: no se instala.";
        }
    }
}
