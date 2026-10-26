package cu.impocaribe.ordenes.nativo;

import android.content.Context;
import android.database.Cursor;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import net.zetetic.database.sqlcipher.SQLiteDatabase;

/**
 * T118 · DT-03 (decisión del responsable del 2026-10-26): la copia local en SQLCipher (sqlcipher-android), con los
 * mismos canales que la app de escritorio (db.open, db.execute, db.query). La clave es aleatoria (256 bits) y vive en
 * el almacenamiento seguro; sin ella el archivo no se puede leer.
 */
public final class LocalDatabases {
    private static final String KEY_PREFIX = "impocaribe.db-key.";
    /** Un nombre de base es una palabra: nunca una ruta. */
    private static final Pattern NAME = Pattern.compile("^[a-z0-9_-]{1,40}$", Pattern.CASE_INSENSITIVE);

    private final Context context;
    private final SecureStore secure;
    private final Map<Integer, SQLiteDatabase> open = new HashMap<>();
    private int next = 1;

    static {
        System.loadLibrary("sqlcipher");
    }

    public LocalDatabases(Context context, SecureStore secure) {
        this.context = context;
        this.secure = secure;
    }

    /** Abre (o crea) la base con su clave; una clave equivocada falla aquí, no a mitad de una consulta. */
    public synchronized int openDatabase(String name) throws Exception {
        if (!NAME.matcher(name).matches()) throw new IllegalArgumentException("Nombre de base no válido: " + name);
        String key = secure.get(KEY_PREFIX + name);
        if (key == null) {
            byte[] raw = new byte[32];
            new SecureRandom().nextBytes(raw);
            StringBuilder hex = new StringBuilder();
            for (byte b : raw) hex.append(String.format("%02x", b));
            key = hex.toString();
            secure.set(KEY_PREFIX + name, key);
        }
        SQLiteDatabase db = SQLiteDatabase.openOrCreateDatabase(
            context.getDatabasePath(name + ".db").getAbsolutePath(),
            "x'" + key + "'",
            null,
            null
        );
        db.rawQuery("SELECT count(*) FROM sqlite_master", new Object[0]).close();
        int id = next++;
        open.put(id, db);
        return id;
    }

    /** Una o varias sentencias; con parámetros, una sola. */
    public synchronized void execute(int id, String sql, Object[] params) {
        SqlGuard.check(sql);
        SQLiteDatabase db = db(id);
        if (params.length == 0) for (String statement : SqlGuard.statements(sql)) db.execSQL(statement);
        else db.execSQL(sql, params);
    }

    /** Las filas, con sus tipos: enteros, reales, texto, bytes (BLOB) o null. */
    public synchronized List<Map<String, Object>> query(int id, String sql, Object[] params) {
        SqlGuard.check(sql);
        List<Map<String, Object>> rows = new ArrayList<>();
        try (Cursor c = db(id).rawQuery(sql, params)) {
            while (c.moveToNext()) {
                Map<String, Object> row = new LinkedHashMap<>();
                for (int i = 0; i < c.getColumnCount(); i++) row.put(c.getColumnName(i), value(c, i));
                rows.add(row);
            }
        }
        return rows;
    }

    public synchronized void closeAll() {
        for (SQLiteDatabase db : open.values()) db.close();
        open.clear();
    }

    private static Object value(Cursor c, int i) {
        switch (c.getType(i)) {
            case Cursor.FIELD_TYPE_INTEGER:
                return c.getLong(i);
            case Cursor.FIELD_TYPE_FLOAT:
                return c.getDouble(i);
            case Cursor.FIELD_TYPE_BLOB:
                return c.getBlob(i);
            case Cursor.FIELD_TYPE_NULL:
                return null;
            default:
                return c.getString(i);
        }
    }

    private SQLiteDatabase db(int id) {
        SQLiteDatabase db = open.get(id);
        if (db == null) throw new IllegalStateException("La base local no está abierta.");
        return db;
    }
}
