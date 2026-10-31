package cu.impocaribe.ordenes.nativo;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertThrows;

import java.io.InputStream;
import java.security.cert.CertificateException;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.util.Date;
import org.junit.Test;

/**
 * T118 · DT-18: la misma verificación que shared/src/node/server-identity.test.ts, con los mismos certificados de
 * prueba (shared/test-certs, añadidos a los recursos de prueba en build.gradle).
 */
public class ServerIdentityTest {
    private static final String ID = "7f3c2a10-1b2c-4d5e-8f90-abcdef123456";
    private static final Date NOW = new Date();

    private static X509Certificate cert(String name) throws Exception {
        try (InputStream in = ServerIdentityTest.class.getClassLoader().getResourceAsStream(name)) {
            return (X509Certificate) CertificateFactory.getInstance("X.509").generateCertificate(in);
        }
    }

    private static ServerIdentity.Expected paired() throws Exception {
        return new ServerIdentity.Expected(ID, ServerIdentity.sha256(cert("ca.crt").getEncoded()));
    }

    @Test
    public void aceptaAlServidorEmparejadoSinMirarLaIp() throws Exception {
        assertNull(ServerIdentity.verify(new X509Certificate[] { cert("server.crt"), cert("ca.crt") }, paired(), NOW));
    }

    @Test
    public void laHuellaSePuedeEscribirConDosPuntosYEnMayusculas() throws Exception {
        String hex = ServerIdentity.sha256(cert("ca.crt").getEncoded()).toUpperCase();
        StringBuilder colons = new StringBuilder();
        for (int i = 0; i < hex.length(); i += 2) colons.append(i == 0 ? "" : ":").append(hex, i, i + 2);
        assertNull(
            ServerIdentity.verify(
                new X509Certificate[] { cert("server.crt"), cert("ca.crt") },
                new ServerIdentity.Expected(ID, colons.toString()),
                NOW
            )
        );
    }

    @Test
    public void rechazaAUnIntrusoConOtraCa() throws Exception {
        assertEquals(
            "La autoridad de certificación no es la de este servidor: puede ser un equipo intruso.",
            ServerIdentity.verify(new X509Certificate[] { cert("intruder.crt"), cert("rogue-ca.crt") }, paired(), NOW)
        );
    }

    @Test
    public void rechazaAOtroServidorDeLaMismaCa() throws Exception {
        assertEquals(
            "El certificado no corresponde al servidor emparejado.",
            ServerIdentity.verify(new X509Certificate[] { cert("other-identity.crt"), cert("ca.crt") }, paired(), NOW)
        );
    }

    @Test
    public void rechazaUnCertificadoVencido() throws Exception {
        Date later = new Date(cert("server.crt").getNotAfter().getTime() + 1000);
        assertEquals(
            "El certificado del servidor está vencido o todavía no es válido.",
            ServerIdentity.verify(new X509Certificate[] { cert("server.crt"), cert("ca.crt") }, paired(), later)
        );
    }

    @Test
    public void elGestorDeConfianzaLanzaElMotivo() throws Exception {
        CertificateException e = assertThrows(
            CertificateException.class,
            () -> ServerIdentity.trustManager(paired())
                .checkServerTrusted(new X509Certificate[] { cert("intruder.crt"), cert("rogue-ca.crt") }, "ECDHE_ECDSA")
        );
        assertEquals("La autoridad de certificación no es la de este servidor: puede ser un equipo intruso.", e.getMessage());
    }
}
