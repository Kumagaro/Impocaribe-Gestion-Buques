// RF-RED-03 y DT-26: el nombre corto que ven las personas al emparejar, IMPOCARIBE- y los 4 primeros caracteres del
// UUID del servidor. Lo calculan el servidor (identidad, T033) y la app (servidor encontrado, P-01).
export function serverName(serverId: string): string {
  return `IMPOCARIBE-${serverId.slice(0, 4).toUpperCase()}`;
}
