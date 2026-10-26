// T115 · DT-19 y DT-18: todas las peticiones HTTP y los WebSocket de la app de escritorio salen del proceso principal,
// con el transporte de @impocaribe/shared/node, que solo entrega la conexión si la cadena del certificado es la del
// servidor esperado (el emparejado, o el anunciado mientras se empareja). Sin servidor esperado no sale nada por HTTPS.
import { createNodeSocket, createNodeTransport, type NodeSocket, type PairedServer } from '@impocaribe/shared/node';
import type { NativeRequest, NativeResponse, NativeServer, NativeSocketEvent } from '@impocaribe/shared';

const NO_SERVER = 'No se sabe qué servidor debe responder: empareje este equipo de nuevo.';
const paired = (s: NativeServer): PairedServer => ({ identity: s.serverId, caFingerprint: s.caFingerprint });
const keyOf = (s: NativeServer) => `${s.serverId}|${s.caFingerprint}`;

export class NativeTransport {
  private readonly transports = new Map<string, ReturnType<typeof createNodeTransport>>();
  private readonly socketFactories = new Map<string, ReturnType<typeof createNodeSocket>>();
  private readonly sockets = new Map<number, NodeSocket>();
  private next = 1;

  constructor(
    private readonly emit: (id: number, event: NativeSocketEvent, data?: string) => void,
    private readonly now: () => Date = () => new Date(),
    /** Solo las pruebas contra un servidor sin TLS (IMPOCARIBE_TLS=off) usan http://. */
    private readonly allowPlainHttp = false,
  ) {}

  async http(url: string, init: NativeRequest, server?: NativeServer): Promise<NativeResponse> {
    // Una copia propia: fetch no acepta vistas sobre un buffer compartido.
    const body = init.body === null ? undefined : typeof init.body === 'string' ? init.body : new Uint8Array(init.body);
    let res: Response;
    if (url.startsWith('http://')) {
      if (!this.allowPlainHttp) throw new Error('La app solo habla con el servidor por HTTPS.');
      res = await fetch(url, { method: init.method, headers: init.headers, ...(body ? { body } : {}) });
    } else {
      if (!server) throw new Error(NO_SERVER);
      let send = this.transports.get(keyOf(server));
      if (!send) {
        send = createNodeTransport(paired(server), this.now);
        this.transports.set(keyOf(server), send);
      }
      res = await send(url, { method: init.method, headers: init.headers, ...(body ? { body } : {}) });
    }
    const bytes = res.status === 204 ? null : new Uint8Array(await res.arrayBuffer());
    return { status: res.status, headers: [...res.headers.entries()], body: bytes && bytes.length ? bytes : null };
  }

  /** Abre un WebSocket y devuelve su número; sus eventos salen por `emit`. */
  open(url: string, server?: NativeServer): number {
    if (!server) throw new Error(NO_SERVER);
    let factory = this.socketFactories.get(keyOf(server));
    if (!factory) {
      factory = createNodeSocket(paired(server), this.now);
      this.socketFactories.set(keyOf(server), factory);
    }
    const id = this.next++;
    const socket = factory(url);
    this.sockets.set(id, socket);
    for (const event of ['open', 'message', 'error'] as const) socket.on(event, (data) => this.emit(id, event, data));
    socket.on('close', (data) => {
      this.sockets.delete(id);
      this.emit(id, 'close', data);
    });
    return id;
  }

  send(id: number, data: string): void {
    this.sockets.get(id)?.send(data);
  }

  close(id: number): void {
    this.sockets.get(id)?.close();
  }

  closeAll(): void {
    for (const s of this.sockets.values()) s.close();
    this.sockets.clear();
  }
}
