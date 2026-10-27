// T025 · Elementos globales de ui-spec §1.2, compartidos por las tres presentaciones de AppShell.
import { powerNotice } from '@impocaribe/shared';
import { CircleUserRound, Monitor, Moon, Search, Sun } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { AnimatedIcon } from '../motion/AnimatedIcon';
import { IconButton } from '../ui/controls';
import { UpdateBand } from '../screens/updates/UpdateParts';
import { OfflineBanner } from '../ui/presentation';
import type { ThemePreference } from '../ui/tokens';

export interface ShellStatus {
  online: boolean;
  /** Fecha y hora de los datos de la copia local, ya formateadas. */
  asOf: string;
  pendingDrafts: number;
  syncing: boolean;
  /** Energía de la PC servidor (AL-20, T132): null si va con corriente. */
  power: { percent: number | null; protected: boolean } | null;
  alerts: number;
  /** RF-CON-10: minutos que la hora del dispositivo difiere de la del servidor, si son más de 5. */
  clockSkewMinutes?: number | null;
}

/** Banda de conexión y aviso de energía del servidor. */
export function ShellBands({ status }: { status: ShellStatus }) {
  const { power } = status;
  const powerText =
    power &&
    (power.protected
      ? 'Servidor en modo protegido por batería baja: solo consulta'
      : powerNotice({ onBattery: true, percent: power.percent }));
  return (
    <>
      <OfflineBanner online={status.online} asOf={status.asOf} pendingDrafts={status.pendingDrafts} />
      <UpdateBand />
      {status.clockSkewMinutes != null && (
        <div role="status" className="ui-band" data-tone="warn">
          La hora de este dispositivo difiere {status.clockSkewMinutes} min de la del servidor. Ajústela: las fechas y
          plazos siempre usan la hora del servidor.
        </div>
      )}
      {powerText && (
        <div role="status" aria-label={powerText} className="ui-band" data-tone={power?.protected ? 'bad' : 'warn'}>
          {powerText}
        </div>
      )}
    </>
  );
}

/** Indicador de sincronización: gira mientras llegan cambios; al tocarlo abre el Diagnóstico de red. */
export function SyncIndicator({ syncing, onClick }: { syncing: boolean; onClick: () => void }) {
  return (
    <IconButton
      label={syncing ? 'Sincronizando' : 'Datos al día'}
      icon={syncing ? <AnimatedIcon name="sync" state="spin" /> : <AnimatedIcon name="check" state="idle" />}
      onClick={onClick}
    />
  );
}

/** Contador de alertas abiertas; la campana se agita cuando llega una nueva. */
export function AlertsButton({ count, onClick }: { count: number; onClick: () => void }) {
  const last = useRef(count);
  const rose = count > last.current;
  useEffect(() => {
    last.current = count;
  });
  return (
    <span className="app-alerts">
      <IconButton
        label={count > 0 ? `Alertas, ${count} abiertas` : 'Alertas'}
        icon={<AnimatedIcon key={count} name="bell" state={rose ? 'ring' : 'idle'} />}
        onClick={onClick}
      />
      {count > 0 && (
        <span className="ui-nav__badge" aria-hidden="true">
          {count}
        </span>
      )}
    </span>
  );
}

/** TAB: el perfil (P-05), con el nombre de quien entró como etiqueta accesible. */
export function ProfileButton({ name, onClick }: { name: string; onClick: () => void }) {
  return (
    <IconButton label={`Perfil de ${name}`} icon={<CircleUserRound size={20} aria-hidden="true" />} onClick={onClick} />
  );
}

export function SearchButton({ onClick }: { onClick: () => void }) {
  return <IconButton label="Buscar" icon={<Search size={20} aria-hidden="true" />} onClick={onClick} />;
}

const THEME = {
  system: { label: 'del sistema', icon: Monitor },
  light: { label: 'claro', icon: Sun },
  dark: { label: 'oscuro', icon: Moon },
} as const;

export function ThemeButton({ theme, onClick }: { theme: ThemePreference; onClick: () => void }) {
  const { label, icon: Icon } = THEME[theme];
  return <IconButton label={`Tema: ${label}`} icon={<Icon size={20} aria-hidden="true" />} onClick={onClick} />;
}
