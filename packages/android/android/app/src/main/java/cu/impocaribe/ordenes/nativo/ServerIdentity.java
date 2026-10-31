package cu.impocaribe.ordenes.nativo;

import java.security.MessageDigest;
import java.security.cert.CertificateException;
import java.security.cert.X509Certificate;
import java.util.Collection;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import javax.net.ssl.X509TrustManager;

/**
 * T118 · DT-18 y RF-RED-03: la identidad del servidor, igual que shared/src/node/server-identity.ts (escritorio y
 * pruebas). Nunca compara la IP: la cadena tiene que traer la CA emparejada (por su huella SHA-256), el certificado del
 * servidor firmado por ella, vigente, y con el nombre {@code <identidad>.impocaribe}.
 */
public final class ServerIdentity {
    private ServerIdentity() {}

    /** Lo que el dispositivo aprendió al emparejarse (o lo que anuncia el servidor mientras se empareja). */
    public static final class Expected {
        public final String serverId;
        public final String caFingerprint;

        public Expected(String serverId, String caFingerprint) {
            this.serverId = serverId;
            this.caFingerprint = caFingerprint;
        }

        String key() {
            return serverId + "|" + normalize(caFingerprint);
        }
    }

    static String normalize(String fingerprint) {
        return fingerprint.replace(":", "").toLowerCase(Locale.ROOT);
    }

    static String sha256(byte[] data) throws Exception {
        StringBuilder hex = new StringBuilder();
        for (byte b : MessageDigest.getInstance("SHA-256").digest(data)) hex.append(String.format("%02x", b));
        return hex.toString();
    }

    /** null si la cadena es la del servidor esperado; si no, el motivo, en las palabras de la app de escritorio. */
    public static String verify(X509Certificate[] chain, Expected server, Date now) {
        if (chain == null || chain.length == 0) return "El servidor no presentó su certificado.";
        X509Certificate leaf = chain[0];
        X509Certificate ca = null;
        try {
            for (X509Certificate c : chain)
                if (sha256(c.getEncoded()).equals(normalize(server.caFingerprint))) ca = c;
            if (ca == null || !leaf.getIssuerX500Principal().equals(ca.getSubjectX500Principal()))
                return "La autoridad de certificación no es la de este servidor: puede ser un equipo intruso.";
            leaf.verify(ca.getPublicKey());
        } catch (Exception e) {
            return "La autoridad de certificación no es la de este servidor: puede ser un equipo intruso.";
        }
        try {
            leaf.checkValidity(now);
        } catch (Exception e) {
            return "El certificado del servidor está vencido o todavía no es válido.";
        }
        String name = server.serverId + ".impocaribe";
        try {
            Collection<List<?>> names = leaf.getSubjectAlternativeNames();
            if (names != null)
                for (List<?> n : names)
                    if (n.size() > 1 && Integer.valueOf(2).equals(n.get(0)) && name.equals(n.get(1))) return null;
        } catch (Exception ignored) {
            // Cae al rechazo de abajo.
        }
        return "El certificado no corresponde al servidor emparejado.";
    }

    /** El gestor de confianza de OkHttp: solo deja pasar la cadena del servidor esperado (DT-19). */
    public static X509TrustManager trustManager(Expected server) {
        return new X509TrustManager() {
            @Override
            public void checkClientTrusted(X509Certificate[] chain, String authType) throws CertificateException {
                throw new CertificateException("La app no acepta clientes.");
            }

            @Override
            public void checkServerTrusted(X509Certificate[] chain, String authType) throws CertificateException {
                String reason = verify(chain, server, new Date());
                if (reason != null) throw new CertificateException(reason);
            }

            @Override
            public X509Certificate[] getAcceptedIssuers() {
                return new X509Certificate[0];
            }
        };
    }
}
