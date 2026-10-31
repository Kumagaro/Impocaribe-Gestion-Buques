package cu.impocaribe.ordenes.nativo;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * T118: el mismo filtro que la app de escritorio (packages/desktop/src/native/database.ts). El SQL llega de la interfaz:
 * un fallo en ella no debe poder escribir archivos fuera de la base (ATTACH, VACUUM INTO) ni cambiar el cifrado (PRAGMA
 * key, cipher…). La copia local solo necesita leer y fijar {@code PRAGMA user_version} para sus migraciones.
 */
public final class SqlGuard {
    private SqlGuard() {}

    private static final Pattern FORBIDDEN = Pattern.compile("\\b(ATTACH|DETACH|VACUUM|LOAD_EXTENSION)\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern PRAGMA = Pattern.compile("\\bPRAGMA\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern USER_VERSION = Pattern.compile(
        "^\\s*PRAGMA\\s+user_version\\s*(=\\s*\\d+\\s*)?;?\\s*$",
        Pattern.CASE_INSENSITIVE
    );

    public static void check(String sql) {
        int pragmas = 0;
        Matcher m = PRAGMA.matcher(sql);
        while (m.find()) pragmas++;
        if (FORBIDDEN.matcher(sql).find() || (pragmas > 0 && (pragmas > 1 || !USER_VERSION.matcher(sql).matches())))
            throw new IllegalArgumentException("Sentencia no permitida en la copia local.");
    }

    /** Separa las sentencias por «;» fuera de los textos entre comillas (las migraciones van juntas). */
    static List<String> statements(String sql) {
        List<String> out = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        char quote = 0;
        for (char ch : sql.toCharArray()) {
            if (quote != 0) {
                if (ch == quote) quote = 0;
            } else if (ch == '\'' || ch == '"') quote = ch;
            else if (ch == ';') {
                if (current.toString().trim().length() > 0) out.add(current.toString().trim());
                current.setLength(0);
                continue;
            }
            current.append(ch);
        }
        if (current.toString().trim().length() > 0) out.add(current.toString().trim());
        return out;
    }
}
