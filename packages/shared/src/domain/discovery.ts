// T034 y T115 · DT-20: lo que comparten el anuncio del servidor y la búsqueda de las apps (DNS-SD y difusión UDP).

export const SERVICE_TYPE = '_impocaribe._tcp.local';
export const BROADCAST_PORT = 47800;
/** La sonda que envían las apps por difusión; a cualquier otra cosa el servidor no responde. */
export const BROADCAST_PROBE = 'IMPOCARIBE-DISCOVER/1';
