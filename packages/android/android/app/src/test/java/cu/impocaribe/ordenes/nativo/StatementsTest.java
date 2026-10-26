package cu.impocaribe.ordenes.nativo;

import static org.junit.Assert.assertEquals;

import java.util.Arrays;
import org.junit.Test;

/** T118: las migraciones de la copia local van varias sentencias juntas; se separan sin romper los textos. */
public class StatementsTest {
    @Test
    public void separaPorPuntoYComaFueraDeLasComillas() {
        assertEquals(
            Arrays.asList(
                "CREATE TABLE t (v TEXT DEFAULT 'a;b')",
                "INSERT INTO t VALUES ('x; \"y\"')",
                "CREATE INDEX i ON t (v)"
            ),
            SqlGuard.statements(
                "CREATE TABLE t (v TEXT DEFAULT 'a;b');\nINSERT INTO t VALUES ('x; \"y\"');; CREATE INDEX i ON t (v);  "
            )
        );
    }
}
