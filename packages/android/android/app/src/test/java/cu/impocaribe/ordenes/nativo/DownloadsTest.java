package cu.impocaribe.ordenes.nativo;

import static org.junit.Assert.assertEquals;

import java.io.File;
import java.nio.file.Files;
import org.junit.Test;

/** T120 · RF-ORD-22: el nombre que propone el servidor no elige carpeta ni pisa un archivo que ya está en Descargas. */
public class DownloadsTest {
    @Test
    public void elNombreNoTraeCarpetasNiCaracteresProhibidos() {
        assertEquals("ORD-00437-v2.pdf", Downloads.safeName("ORD-00437-v2.pdf"));
        assertEquals("passwd", Downloads.safeName("../../etc/passwd"));
        assertEquals("orden.pdf", Downloads.safeName("C:\\temp\\orden.pdf"));
        assertEquals("a_b_.pdf", Downloads.safeName("a:b?.pdf"));
        assertEquals("documento", Downloads.safeName("carpeta/"));
        assertEquals("documento.pdf", Downloads.safeName(".pdf"));
    }

    @Test
    public void unoQueYaExisteRecibeUnNumero() throws Exception {
        File dir = Files.createTempDirectory("descargas").toFile();
        assertEquals("orden.pdf", Downloads.unique(dir, "orden.pdf").getName());
        assertEquals(true, new File(dir, "orden.pdf").createNewFile());
        assertEquals("orden (1).pdf", Downloads.unique(dir, "orden.pdf").getName());
        assertEquals(true, new File(dir, "orden (1).pdf").createNewFile());
        assertEquals("orden (2).pdf", Downloads.unique(dir, "orden.pdf").getName());
    }

    @Test
    public void elTipoSaleDeLaExtension() {
        assertEquals("application/pdf", Downloads.mime("Orden.PDF"));
        assertEquals("application/octet-stream", Downloads.mime("datos.bin"));
    }
}
