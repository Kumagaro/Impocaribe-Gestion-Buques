// T023 · Estructura (plan §7.2, ui-spec §1.1): pestañas, pasos, vista dividida, tabla de datos y la navegación de cada
// clase de dispositivo (barra inferior en teléfono, riel en tablet y menú lateral en escritorio).
import { m } from 'motion/react';
import { useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useReducedMotionPreference } from '../motion/MotionProvider';
import { listItem } from '../motion/presets';
import { useTouch } from './device';

// ---------- Tabs (patrón de pestañas de ARIA con activación automática) ----------

export interface Tab {
  id: string;
  label: string;
  content: ReactNode;
}

export function Tabs({
  label,
  tabs,
  value,
  onChange,
}: {
  label: string;
  tabs: Tab[];
  value: string;
  onChange: (id: string) => void;
}) {
  const base = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const index = Math.max(
    0,
    tabs.findIndex((t) => t.id === value),
  );
  const go = (i: number) => {
    const n = (i + tabs.length) % tabs.length;
    const tab = tabs[n];
    if (!tab) return;
    onChange(tab.id);
    refs.current[n]?.focus();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const target = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (target === undefined) return;
    e.preventDefault();
    go(target);
  };
  const active = tabs[index];
  const touch = useTouch() || undefined;
  return (
    <div className="ui-tabs">
      <div role="tablist" aria-label={label} className="ui-tabs__list" onKeyDown={onKeyDown}>
        {tabs.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            id={`${base}-tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={i === index}
            aria-controls={`${base}-panel`}
            tabIndex={i === index ? 0 : -1}
            data-touch={touch}
            onClick={() => onChange(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {active && (
        <div
          id={`${base}-panel`}
          role="tabpanel"
          aria-labelledby={`${base}-tab-${active.id}`}
          tabIndex={0}
          className="ui-tabs__panel"
        >
          {active.content}
        </div>
      )}
    </div>
  );
}

// ---------- Stepper (formularios por pasos en teléfono, MOV-10) ----------

export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="ui-stepper">
      {steps.map((s, i) => {
        const state = i < current ? 'done' : i === current ? 'now' : 'todo';
        return (
          <li key={s} data-state={state} aria-current={state === 'now' ? 'step' : undefined}>
            <i aria-hidden="true" />
            {s}
          </li>
        );
      })}
    </ol>
  );
}

// ---------- SplitView (tablet: lista a la izquierda, detalle a la derecha) ----------

export function SplitView({
  listLabel,
  list,
  detailLabel,
  detail,
}: {
  listLabel: string;
  list: ReactNode;
  detailLabel: string;
  detail: ReactNode;
}) {
  return (
    <div className="ui-split">
      <section aria-label={listLabel} className="ui-split__list">
        {list}
      </section>
      <section aria-label={detailLabel} className="ui-split__detail">
        {detail}
      </section>
    </div>
  );
}

// ---------- DataTable ----------

export const VIRTUALIZE_ABOVE = 100;
const ROW_PX = { touch: 48, desktop: 36 };
const OVERSCAN = 5;

export interface Column<R> {
  key: string;
  header: string;
  cell: (row: R) => ReactNode;
  sortable?: boolean;
  sortValue?: (row: R) => string | number;
  align?: 'start' | 'end';
}

type Sort = { key: string; dir: 'ascending' | 'descending' } | null;

export function DataTable<R extends { id: string }>({
  caption,
  columns,
  rows,
  onRowClick,
  empty = 'Sin datos.',
  viewportHeight = 480,
}: {
  caption: string;
  columns: Column<R>[];
  rows: R[];
  onRowClick?: (row: R) => void;
  empty?: ReactNode;
  /** Alto visible de la tabla virtualizada, en px. */
  viewportHeight?: number;
}) {
  const reduced = useReducedMotionPreference();
  const touch = useTouch();
  const [sort, setSort] = useState<Sort>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const value = col.sortValue;
    const sign = sort.dir === 'ascending' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const [x, y] = [value(a), value(b)];
      return sign * (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'es'));
    });
  }, [rows, columns, sort]);

  // Por encima del umbral solo se pintan las filas visibles; sin animaciones, que con tantas filas no aportan (RNF-15).
  const virtual = rows.length > VIRTUALIZE_ABOVE;
  const rowPx = touch ? ROW_PX.touch : ROW_PX.desktop;
  const start = virtual ? Math.max(0, Math.floor(scrollTop / rowPx) - OVERSCAN) : 0;
  const end = virtual
    ? Math.min(sorted.length, Math.ceil((scrollTop + viewportHeight) / rowPx) + OVERSCAN)
    : sorted.length;
  const visible = sorted.slice(start, end);
  const enter = listItem(reduced);

  const toggle = (key: string) =>
    setSort((s) => ({ key, dir: s?.key === key && s.dir === 'ascending' ? 'descending' : 'ascending' }));

  return (
    <div
      className="ui-table-scroll"
      style={virtual ? { maxHeight: viewportHeight, overflowY: 'auto' } : undefined}
      onScroll={virtual ? (e) => setScrollTop(e.currentTarget.scrollTop) : undefined}
    >
      <table
        className="ui-table"
        data-virtual={virtual}
        aria-rowcount={rows.length + 1}
        data-touch={touch || undefined}
      >
        <caption className="ui-visually-hidden">{caption}</caption>
        <thead>
          <tr aria-rowindex={1}>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                data-align={c.align}
                aria-sort={c.sortable ? (sort?.key === c.key ? sort.dir : 'none') : undefined}
              >
                {c.sortable ? (
                  <button type="button" className="ui-table__sort" onClick={() => toggle(c.key)}>
                    {c.header}
                  </button>
                ) : (
                  c.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {virtual && start > 0 && <tr aria-hidden="true" style={{ height: start * rowPx }} />}
          {visible.map((row, i) => {
            const rowProps = {
              'aria-rowindex': start + i + 2,
              tabIndex: onRowClick ? 0 : undefined,
              className: onRowClick ? 'ui-table__row--action' : undefined,
              onClick: onRowClick ? () => onRowClick(row) : undefined,
              onKeyDown: onRowClick
                ? (e: KeyboardEvent) => {
                    if (e.key === 'Enter') onRowClick(row);
                  }
                : undefined,
            };
            const cells = columns.map((c) => (
              <td key={c.key} data-align={c.align}>
                {c.cell(row)}
              </td>
            ));
            if (virtual) {
              return (
                <tr key={row.id} {...rowProps} style={{ height: rowPx }}>
                  {cells}
                </tr>
              );
            }
            return (
              <m.tr key={row.id} {...rowProps} data-motion={reduced ? 'static' : 'enter'} {...enter}>
                {cells}
              </m.tr>
            );
          })}
          {virtual && end < sorted.length && (
            <tr aria-hidden="true" style={{ height: (sorted.length - end) * rowPx }} />
          )}
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="ui-table__empty">
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ---------- Navegación (ui-spec §1.1) ----------

export interface NavItem {
  id: string;
  label: string;
  icon: ReactNode;
  /** Alertas abiertas visibles para el rol. */
  badge?: number;
  /** Atajo de escritorio, como "Ctrl+2". */
  shortcut?: string;
  group?: string;
}

export interface NavProps {
  items: NavItem[];
  current: string;
  onNavigate: (id: string) => void;
}

const navName = (item: NavItem) => (item.badge ? `${item.label}, ${item.badge} abiertas` : undefined);

function NavButton({
  item,
  current,
  onNavigate,
  showShortcut,
}: {
  item: NavItem;
  current: string;
  onNavigate: (id: string) => void;
  showShortcut?: boolean;
}) {
  return (
    <button
      type="button"
      className="ui-nav__item"
      aria-current={item.id === current ? 'page' : undefined}
      aria-label={navName(item)}
      // aria-keyshortcuts no admite secuencias como "G T": esas solo se muestran.
      aria-keyshortcuts={
        showShortcut && item.shortcut && !item.shortcut.includes(' ')
          ? item.shortcut.replace('Ctrl', 'Control')
          : undefined
      }
      data-touch={useTouch() || undefined}
      onClick={() => onNavigate(item.id)}
    >
      <span className="ui-nav__icon" aria-hidden="true">
        {item.icon}
        {item.badge ? <span className="ui-nav__badge">{item.badge}</span> : null}
      </span>
      <span className="ui-nav__label">{item.label}</span>
      {showShortcut && item.shortcut && <kbd>{item.shortcut}</kbd>}
    </button>
  );
}

/** Teléfono: barra inferior. La acción principal ("Nueva orden") solo se pasa si el rol la permite. */
export function NavBar({
  items,
  current,
  onNavigate,
  primary,
}: NavProps & { primary?: { label: string; icon: ReactNode; onClick: () => void } }) {
  const half = Math.ceil(items.length / 2);
  const buttons = items.map((it) => <NavButton key={it.id} item={it} current={current} onNavigate={onNavigate} />);
  return (
    <nav aria-label="Principal" className="ui-navbar">
      {buttons.slice(0, half)}
      {primary && (
        <button
          type="button"
          className="ui-navbar__primary"
          aria-label={primary.label}
          title={primary.label}
          onClick={primary.onClick}
        >
          {primary.icon}
        </button>
      )}
      {buttons.slice(half)}
    </nav>
  );
}

/** Tablet: riel lateral. */
export function NavRail({
  items,
  current,
  onNavigate,
  primary,
}: NavProps & { primary?: { label: string; icon: ReactNode; onClick: () => void } }) {
  return (
    <nav aria-label="Principal" className="ui-navrail">
      {primary && (
        <button type="button" className="ui-navrail__primary" onClick={primary.onClick}>
          {primary.icon}
          <span>{primary.label}</span>
        </button>
      )}
      {items.map((it) => (
        <NavButton key={it.id} item={it} current={current} onNavigate={onNavigate} />
      ))}
    </nav>
  );
}

/** Escritorio: menú lateral por grupos, con el atajo de cada entrada. */
export function Sidebar({
  items,
  current,
  onNavigate,
  header,
  footer,
}: NavProps & { header?: ReactNode; footer?: ReactNode }) {
  return (
    <nav aria-label="Principal" className="ui-sidebar">
      {header}
      {items.map((it, i) => (
        <SidebarEntry
          key={it.id}
          item={it}
          groupStart={it.group !== undefined && it.group !== items[i - 1]?.group}
          current={current}
          onNavigate={onNavigate}
        />
      ))}
      {footer && <div className="ui-sidebar__foot">{footer}</div>}
    </nav>
  );
}

function SidebarEntry({
  item,
  groupStart,
  current,
  onNavigate,
}: {
  item: NavItem;
  groupStart: boolean;
  current: string;
  onNavigate: (id: string) => void;
}) {
  return (
    <>
      {groupStart && <div className="ui-sidebar__group">{item.group}</div>}
      <NavButton item={item} current={current} onNavigate={onNavigate} showShortcut />
    </>
  );
}
