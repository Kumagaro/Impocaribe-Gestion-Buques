package cu.impocaribe.ordenes.nativo;

import static org.junit.Assert.assertEquals;

import org.json.JSONObject;
import org.junit.Test;

/** T119 · RF-ALR-01, 02 y DT-05: lo que hace el servicio con cada mensaje del WebSocket de alertas. */
public class AlertMessagesTest {
    private static final JSONObject LABELS = new JSONObject();

    static {
        try {
            LABELS.put("AL-01", "Orden pendiente de total");
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    @Test
    public void unaAlertaSaleConSuTipoYSuReferencia() {
        AlertMessages.Action a = AlertMessages.read(
            "{\"type\":\"alert.created\",\"id\":\"9b1d\",\"alertType\":\"AL-01\",\"title\":\"DM 00437 pendiente de total\"}",
            LABELS
        );
        assertEquals(AlertMessages.Kind.NOTIFY, a.kind);
        assertEquals("9b1d", a.id);
        assertEquals("Alerta: Orden pendiente de total", a.title);
        assertEquals("DM 00437 pendiente de total", a.body);
    }

    @Test
    public void unTipoSinNombreSaleComoAlerta() {
        AlertMessages.Action a = AlertMessages.read(
            "{\"type\":\"alert.created\",\"id\":\"x\",\"alertType\":\"AL-99\",\"title\":\"DM 1\"}",
            LABELS
        );
        assertEquals("Alerta", a.title);
    }

    @Test
    public void lasRevocacionesDetienenElServicioYLoDemasSeIgnora() {
        assertEquals(AlertMessages.Kind.READY, AlertMessages.read("{\"type\":\"ready\"}", LABELS).kind);
        assertEquals(AlertMessages.Kind.STOP, AlertMessages.read("{\"type\":\"session.revoked\"}", LABELS).kind);
        assertEquals(AlertMessages.Kind.STOP, AlertMessages.read("{\"type\":\"device.revoked\"}", LABELS).kind);
        assertEquals(AlertMessages.Kind.IGNORE, AlertMessages.read("{\"type\":\"sync.available\",\"seq\":3}", LABELS).kind);
        assertEquals(AlertMessages.Kind.IGNORE, AlertMessages.read("no es JSON", LABELS).kind);
        assertEquals(AlertMessages.Kind.IGNORE, AlertMessages.read("{\"type\":\"alert.created\"}", LABELS).kind);
    }

    @Test
    public void esperaCadaVezMasHastaTreintaSegundos() {
        assertEquals(2_000, AlertMessages.backoffMs(1));
        assertEquals(4_000, AlertMessages.backoffMs(2));
        assertEquals(16_000, AlertMessages.backoffMs(4));
        assertEquals(30_000, AlertMessages.backoffMs(5));
        assertEquals(30_000, AlertMessages.backoffMs(40));
    }
}
