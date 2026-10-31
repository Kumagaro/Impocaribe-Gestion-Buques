package cu.impocaribe.ordenes.nativo;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;

import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.Test;

/** T118 · DT-20: los mismos cálculos que packages/desktop/src/native/discovery.test.ts. */
public class DiscoveryMathTest {
    private static final String ID = "7f3c2a10-1b2c-4d5e-8f90-abcdef123456";

    @Test
    public void laDifusionDeCadaInterfazSegunSuPrefijo() {
        assertEquals("192.168.1.255", DiscoveryMath.broadcastOf("192.168.1.37", 24));
        assertEquals("10.42.255.255", DiscoveryMath.broadcastOf("10.42.0.5", 16));
    }

    @Test
    public void laSubredSinLaPropia() {
        List<String> list = DiscoveryMath.subnet(Arrays.asList("192.168.1.37"));
        assertEquals(253, list.size());
        assertEquals("192.168.1.1", list.get(0));
        assertEquals("192.168.1.254", list.get(252));
        assertFalse(list.contains("192.168.1.37"));
    }

    @Test
    public void leeLaRespuestaDeLaDifusionConLaDireccionDeQuienResponde() {
        DiscoveryMath.Announcement a = DiscoveryMath.fromBroadcast(
            "{\"serverId\":\"" + ID + "\",\"caFingerprint\":\"AB:CD\",\"version\":\"1.4.0\",\"port\":8443}",
            "192.168.1.20"
        );
        assertEquals("192.168.1.20|8443|" + ID + "|AB:CD|1.4.0", a.address + "|" + a.port + "|" + a.serverId + "|" + a.caFingerprint + "|" + a.version);
        assertNull(DiscoveryMath.fromBroadcast("no es json", "192.168.1.20"));
        assertNull(DiscoveryMath.fromBroadcast("{\"serverId\":\"x\"}", "192.168.1.20"));
    }

    @Test
    public void leeElTxtDeDnsSd() {
        Map<String, String> txt = new HashMap<>();
        txt.put("id", ID);
        txt.put("v", "1.4.0");
        txt.put("fp", "AB:CD");
        DiscoveryMath.Announcement a = DiscoveryMath.fromTxt(txt, "192.168.1.20", 8443);
        assertEquals(ID + "|AB:CD|1.4.0|8443", a.serverId + "|" + a.caFingerprint + "|" + a.version + "|" + a.port);
        txt.remove("fp");
        assertNull(DiscoveryMath.fromTxt(txt, "192.168.1.20", 8443));
    }

    @Test
    public void sinRepetidos() {
        DiscoveryMath.Announcement a = new DiscoveryMath.Announcement("192.168.1.20", 8443, ID, "AB", "1");
        DiscoveryMath.Announcement b = new DiscoveryMath.Announcement("192.168.1.20", 8443, ID, "AB", "1");
        assertEquals(1, DiscoveryMath.unique(Arrays.asList(a, b)).size());
    }
}
