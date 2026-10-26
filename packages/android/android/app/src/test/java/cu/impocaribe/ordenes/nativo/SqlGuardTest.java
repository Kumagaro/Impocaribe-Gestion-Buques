package cu.impocaribe.ordenes.nativo;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;

import org.junit.Test;

/** T118: los mismos casos que packages/desktop/src/native/database.test.ts. */
public class SqlGuardTest {
    private static final String[] REJECTED = {
        "ATTACH DATABASE 'C:/Windows/x.db' AS x",
        "DETACH DATABASE x",
        "VACUUM INTO '/sdcard/copia.db'",
        "SELECT load_extension('evil')",
        "PRAGMA key = 'otra'",
        "PRAGMA cipher_compatibility = 3",
        "PRAGMA user_version = 4; PRAGMA journal_mode = DELETE",
    };
    private static final String[] ALLOWED = {
        "PRAGMA user_version",
        "PRAGMA user_version = 12",
        "SELECT * FROM orden WHERE numero = ?",
    };

    @Test
    public void rechazaLoQuePodriaSalirDeLaBaseOCambiarElCifrado() {
        for (String sql : REJECTED) {
            IllegalArgumentException e = assertThrows(sql, IllegalArgumentException.class, () -> SqlGuard.check(sql));
            assertEquals("Sentencia no permitida en la copia local.", e.getMessage());
        }
    }

    @Test
    public void dejaPasarLaVersionYLasConsultas() {
        for (String sql : ALLOWED) SqlGuard.check(sql);
    }
}
