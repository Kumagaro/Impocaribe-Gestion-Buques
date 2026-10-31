// T107 · plan §10.4 (2): mientras se restaura, el servidor rechaza las peticiones con 503 RESTORE_IN_PROGRESS (salvo
// estado y descubrimiento) y las tareas en segundo plano no corren.
import { Injectable } from '@nestjs/common';

@Injectable()
export class Maintenance {
  active = false;
}
