package cu.impocaribe.ordenes.nativo;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * T118 · plan §9: el almacenamiento seguro de la app Android. Cada valor (emparejamiento, sesión, clave de la copia
 * local) se cifra con AES-256-GCM con una clave que vive en el Android Keystore y nunca sale de él; en las preferencias
 * de la app solo queda el texto cifrado.
 */
public final class SecureStore {
    private static final String KEYSTORE = "AndroidKeyStore";
    private static final String ALIAS = "impocaribe.almacenamiento";
    private static final int IV = 12;
    private final SharedPreferences prefs;

    public SecureStore(Context context) {
        prefs = context.getSharedPreferences("impocaribe.seguro", Context.MODE_PRIVATE);
    }

    private static SecretKey key() throws Exception {
        KeyStore ks = KeyStore.getInstance(KEYSTORE);
        ks.load(null);
        if (ks.containsAlias(ALIAS)) return ((KeyStore.SecretKeyEntry) ks.getEntry(ALIAS, null)).getSecretKey();
        KeyGenerator gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE);
        gen.init(
            new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
        );
        return gen.generateKey();
    }

    public synchronized String get(String name) throws Exception {
        String stored = prefs.getString(name, null);
        if (stored == null) return null;
        ByteBuffer data = ByteBuffer.wrap(Base64.decode(stored, Base64.NO_WRAP));
        byte[] iv = new byte[IV];
        data.get(iv);
        byte[] sealed = new byte[data.remaining()];
        data.get(sealed);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, iv));
        return new String(cipher.doFinal(sealed), StandardCharsets.UTF_8);
    }

    public synchronized void set(String name, String value) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key());
        byte[] sealed = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
        byte[] iv = cipher.getIV();
        byte[] out = ByteBuffer.allocate(iv.length + sealed.length).put(iv).put(sealed).array();
        prefs.edit().putString(name, Base64.encodeToString(out, Base64.NO_WRAP)).commit();
    }

    public synchronized void remove(String name) {
        prefs.edit().remove(name).commit();
    }
}
