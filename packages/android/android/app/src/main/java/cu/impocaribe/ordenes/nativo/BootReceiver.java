package cu.impocaribe.ordenes.nativo;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * T119 · plan §10.2: al encender el teléfono, o tras actualizar la app (T121), el servicio de alertas vuelve a
 * arrancar si había una sesión con alertas, sin abrir la app.
 */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        boolean ours = Intent.ACTION_BOOT_COMPLETED.equals(action) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action);
        if (ours && AlertService.configured(context)) AlertService.start(context);
    }
}
