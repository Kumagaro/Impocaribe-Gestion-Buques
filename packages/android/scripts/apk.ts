// Genera el APK de depuración con el wrapper de Gradle del proyecto nativo (gradlew.bat en Windows).
import { spawnSync } from 'node:child_process';

// Ruta explícita: Windows no busca en la carpeta actual si NoDefaultCurrentDirectoryInExePath está definida.
const gradlew = process.platform === 'win32' ? '.\\gradlew.bat' : './gradlew';
// Los argumentos pasan a Gradle (apk:e2e: -PimpocaribeTlsOff=true, el APK de las pruebas contra el servidor sin TLS).
const r = spawnSync(gradlew, ['assembleDebug', ...process.argv.slice(2)], { cwd: 'android', stdio: 'inherit', shell: true });
process.exit(r.status ?? 1);
