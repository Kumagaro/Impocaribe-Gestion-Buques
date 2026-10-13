// Genera el APK de depuración con el wrapper de Gradle del proyecto nativo (gradlew.bat en Windows).
import { spawnSync } from 'node:child_process';

// Ruta explícita: Windows no busca en la carpeta actual si NoDefaultCurrentDirectoryInExePath está definida.
const gradlew = process.platform === 'win32' ? '.\\gradlew.bat' : './gradlew';
const r = spawnSync(gradlew, ['assembleDebug'], { cwd: 'android', stdio: 'inherit', shell: true });
process.exit(r.status ?? 1);
