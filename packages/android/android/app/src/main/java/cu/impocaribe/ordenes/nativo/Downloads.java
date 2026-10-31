package cu.impocaribe.ordenes.nativo;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import androidx.core.app.NotificationCompat;
import androidx.core.content.FileProvider;
import cu.impocaribe.ordenes.R;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/**
 * T120 · RF-ORD-22 y plan §10.2: en Android el PDF va a Descargas, y una notificación lo abre al tocarla y ofrece
 * «Compartir» (FileProvider en Android 7 a 9; MediaStore desde Android 10, que no pide permiso).
 */
public final class Downloads {
    private Downloads() {}

    private static final String CHANNEL = "descargas";

    /** El nombre que propone el servidor, sin carpetas ni caracteres que Android no admite en un archivo. */
    static String safeName(String name) {
        String base = name.substring(Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\')) + 1);
        base = base.replaceAll("[:*?\"<>|\\p{Cntrl}]", "_").trim();
        return base.isEmpty() || base.startsWith(".") ? "documento" + base : base;
    }

    static String mime(String name) {
        return name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/octet-stream";
    }

    /** Guarda en Descargas y avisa. Desde Android 10, si ya existe uno con ese nombre, el sistema le pone «(1)». */
    public static void save(Context context, String requested, byte[] data) throws Exception {
        String name = safeName(requested);
        Uri uri;
        if (Build.VERSION.SDK_INT >= 29) {
            ContentResolver resolver = context.getContentResolver();
            ContentValues values = new ContentValues();
            values.put(MediaStore.Downloads.DISPLAY_NAME, name);
            values.put(MediaStore.Downloads.MIME_TYPE, mime(name));
            values.put(MediaStore.Downloads.IS_PENDING, 1);
            uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (uri == null) throw new IllegalStateException("Android no dejó guardar en Descargas.");
            try (OutputStream out = resolver.openOutputStream(uri)) {
                out.write(data);
            } catch (Exception e) {
                resolver.delete(uri, null, null);
                throw e;
            }
            values.clear();
            values.put(MediaStore.Downloads.IS_PENDING, 0);
            resolver.update(uri, values, null, null);
            // El nombre que quedó (el sistema añade «(1)» si ya había uno igual).
            try (android.database.Cursor c = resolver.query(uri, new String[] { MediaStore.Downloads.DISPLAY_NAME }, null, null, null)) {
                if (c != null && c.moveToFirst()) name = c.getString(0);
            }
        } else {
            File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
            if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("No se encontró la carpeta Descargas.");
            File file = unique(dir, name);
            try (OutputStream out = new FileOutputStream(file)) {
                out.write(data);
            }
            MediaScannerConnection.scanFile(context, new String[] { file.getPath() }, new String[] { mime(name) }, null);
            name = file.getName();
            uri = FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", file);
        }
        notifySaved(context, uri, name);
    }

    /** «orden.pdf», «orden (1).pdf», «orden (2).pdf»… sin pisar uno que ya esté. */
    static File unique(File dir, String name) {
        File f = new File(dir, name);
        int dot = name.lastIndexOf('.');
        String stem = dot > 0 ? name.substring(0, dot) : name;
        String ext = dot > 0 ? name.substring(dot) : "";
        for (int i = 1; f.exists(); i++) f = new File(dir, stem + " (" + i + ")" + ext);
        return f;
    }

    private static void notifySaved(Context context, Uri uri, String name) {
        NotificationManager nm = context.getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= 26)
            nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Archivos guardados", NotificationManager.IMPORTANCE_DEFAULT));
        String type = mime(name);
        Intent view = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, type).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        Intent send = new Intent(Intent.ACTION_SEND).setType(type).putExtra(Intent.EXTRA_STREAM, uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        send.setClipData(ClipData.newRawUri(name, uri));
        Intent share = Intent.createChooser(send, "Compartir " + name);
        int id = name.hashCode();
        int flags = PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT;
        nm.notify(
            "descarga",
            id,
            new NotificationCompat.Builder(context, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_impocaribe)
                .setContentTitle("Guardado en Descargas")
                .setContentText(name)
                .setContentIntent(PendingIntent.getActivity(context, id, view, flags))
                .addAction(0, "Compartir", PendingIntent.getActivity(context, id + 1, share, flags))
                .setAutoCancel(true)
                .build()
        );
    }
}
