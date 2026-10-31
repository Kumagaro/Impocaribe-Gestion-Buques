package cu.impocaribe.ordenes.nativo;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** T121 · RF-UPD-05: solo se instala una versión x.y.z más nueva que la instalada (como compareVersions de shared). */
public class AppUpdateTest {
    @Test
    public void comparaPorNumeroNoPorTexto() {
        assertTrue(AppUpdate.compare("1.10.0", "1.9.9") > 0);
        assertTrue(AppUpdate.compare("0.0.1", "0.1.0") < 0);
        assertEquals(0, AppUpdate.compare("2.3.4", "2.3.4"));
    }

    @Test
    public void unaVersionMalFormadaNoSeAcepta() {
        assertThrows(IllegalArgumentException.class, () -> AppUpdate.compare("1.0", "1.0.0"));
        assertThrows(IllegalArgumentException.class, () -> AppUpdate.compare("1.0.0", "1.0.0-beta"));
        assertThrows(IllegalArgumentException.class, () -> AppUpdate.compare(null, "1.0.0"));
    }
}
