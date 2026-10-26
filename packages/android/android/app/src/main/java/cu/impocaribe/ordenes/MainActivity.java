package cu.impocaribe.ordenes;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import cu.impocaribe.ordenes.nativo.ImpocaribeNativePlugin;

/** T118: la interfaz en el WebView, con el puente nativo propio (plan §10.2). */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ImpocaribeNativePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
