package cu.impocaribe.ordenes.nativo;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** T118 · RF-UI-11: con un WebView 86 se muestra P-27; con 87 arranca la interfaz (tasks.md, T118). */
public class WebViewCheckTest {
    @Test
    public void ochentaYSeisMuestraP27YOchentaYSieteArranca() {
        assertTrue(WebViewCheck.outdated("86.0.4240.198"));
        assertFalse(WebViewCheck.outdated("87.0.4280.66"));
        assertFalse(WebViewCheck.outdated("119.0.6045.163"));
    }

    @Test
    public void unaVersionQueNoSeEntiendeSeTrataComoAntigua() {
        assertTrue(WebViewCheck.outdated(null));
        assertTrue(WebViewCheck.outdated("desconocida"));
        assertEquals(-1, WebViewCheck.major(""));
    }

    @Test
    public void chromeHastaAndroid9YSystemWebViewDesdeAndroid10() {
        assertEquals("android-webview-chrome", WebViewCheck.provider(24));
        assertEquals("android-webview-chrome", WebViewCheck.provider(28));
        assertEquals("android-webview-system", WebViewCheck.provider(29));
        assertEquals("Chrome 83", WebViewCheck.label("android-webview-chrome", "83.0.4103.106"));
        assertEquals("Android System WebView 86", WebViewCheck.label("android-webview-system", "86.0.4240.185"));
    }

    @Test
    public void laPlataformaSaleDelPaqueteQueUsaElSistema() {
        assertEquals("android-webview-chrome", WebViewCheck.platformOf("com.android.chrome"));
        assertEquals("android-webview-system", WebViewCheck.platformOf("com.google.android.webview"));
        assertEquals(null, WebViewCheck.platformOf("com.otro.navegador"));
        assertEquals("com.android.chrome", WebViewCheck.packageOf("android-webview-chrome"));
        assertEquals("com.google.android.webview", WebViewCheck.packageOf("android-webview-system"));
    }
}
