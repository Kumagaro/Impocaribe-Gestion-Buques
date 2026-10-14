import type { INestApplication } from '@nestjs/common';

// Puertos que fetch rechaza por norma (Fetch Standard, "bad port"): listen(0) puede elegir alguno y la prueba fallaría.
const FETCH_BAD_PORTS = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95, 101, 102, 103, 104, 109, 110,
  111, 113, 115, 117, 119, 123, 135, 137, 139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532,
  540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993, 995, 1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060, 5061,
  6000, 6566, 6665, 6666, 6667, 6668, 6669, 6679, 6697, 10080,
]);

/** Arranca la app en un puerto libre de 127.0.0.1 que fetch acepte y devuelve la URL base de la API. */
export async function listenForTests(app: INestApplication): Promise<string> {
  for (;;) {
    await app.listen(0, '127.0.0.1');
    const url = await app.getUrl();
    if (!FETCH_BAD_PORTS.has(Number(new URL(url).port))) return url;
    await app.getHttpServer().close();
  }
}
