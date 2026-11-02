import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { WideDialog } from '@budget/ui';
import { ErrorNote, LoadingNote, EmptyNote } from '../ledger/states';
import { createPortal } from 'react-dom';
import { accountsQuery } from '../ledger/queries';
import { useQuery } from '@tanstack/react-query';
import { standQuery } from './api';
import { longDay } from '../ledger/format';
import { Plus } from 'lucide-react';
import { PageFrame, type PageFrameProps } from '../pages/placeholder-page';
import { PageMenu } from '../nav/page-menu';
import { areaById } from '../nav/areas';
import { AppLink } from '../shell/app-link';
import { AccountFormPanel } from '../ledger/account-form';
import { REDESIGN_ENABLED } from '../shell/redesign-flag';
import './redesign.css';

export const WEALTH_PAGES = [
  { id: 'overview', label: 'Übersicht', to: '/vermoegen' },
  { id: 'positions', label: 'Positionen', to: '/vermoegen/portfolio/positionen' },
  { id: 'savings', label: 'Sparpläne', to: '/vermoegen/portfolio/sparplaene' },
  { id: 'allocation', label: 'Allokation', to: '/vermoegen/portfolio/allokation' },
  { id: 'debts', label: 'Schulden', to: '/vermoegen/schulden' },
] as const;
export type WealthPage = (typeof WEALTH_PAGES)[number]['id'];
import { assetType } from './redesign-filters';
export function useAssetType() {
  const search = useSearch({ strict: false }) as { anlageart?: unknown };
  return assetType(search.anlageart);
}

export function WealthFrame({
  page,
  legacy,
  date,
  controls,
  children,
  ...props
}: PageFrameProps & {
  page: WealthPage;
  legacy?: boolean;
  date?: string | undefined;
  controls?: ReactNode;
}) {
  if (!REDESIGN_ENABLED || legacy) return <PageFrame {...props}>{children}</PageFrame>;
  return (
    <div className="wealth-redesign" data-testid="wealth-redesign">
      <WealthTitle />
      <WealthToolbar page={page} date={date} controls={controls} />
      {children}
    </div>
  );
}

function WealthTitle() {
  const [host, setHost] = useState<Element | null>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setHost(document.querySelector('.topbar-inner')));
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <>
      <h1 className={host ? 'sr-only' : 'wealth-title'}>Vermögen</h1>
      {host &&
        createPortal(
          <span className="wealth-top-title" aria-hidden="true">
            Vermögen
          </span>,
          host,
        )}
    </>
  );
}

function WealthToolbar({
  page,
  date,
  controls,
}: {
  page: WealthPage;
  date?: string | undefined;
  controls?: ReactNode;
}) {
  const [valuePicker, setValuePicker] = useState(false);
  const stand = useQuery(standQuery());
  const accounts = useQuery({ ...accountsQuery(), enabled: !date || valuePicker });
  const asOf = date ?? accounts.data?.asOf;
  const art = useAssetType();
  const captureSearch = useSearch({ strict: false }) as {
    fokus?: string;
    produkt?: string;
    handel?: string;
    sparplan?: string;
  };
  const capturing =
    captureSearch.produkt === 'neu' || !!captureSearch.handel || captureSearch.sparplan === 'neu';
  const navigate = useNavigate();
  const menu = useRef<HTMLDetailsElement>(null);
  const toolbar = useRef<HTMLDivElement>(null);
  const focusInvestment = () =>
    requestAnimationFrame(() => menu.current?.querySelector('summary')?.focus());
  const [account, setAccount] = useState(false);
  const wasCapturing = useRef(capturing);
  const returnToMenu = useRef(capturing && captureSearch.fokus === 'investment');
  useEffect(() => {
    if (capturing && captureSearch.fokus === 'investment') returnToMenu.current = true;
    const closing = wasCapturing.current && !capturing && returnToMenu.current;
    wasCapturing.current = capturing;
    if (!closing) return;
    returnToMenu.current = false;
    const frame = requestAnimationFrame(() => {
      if (!document.querySelector('dialog[open]')) menu.current?.querySelector('summary')?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [capturing, captureSearch.fokus]);
  useEffect(() => {
    const element = toolbar.current;
    const toggle = (event: Event) => {
      if (!(event.target instanceof HTMLDetailsElement) || !event.target.open) return;
      for (const sibling of element?.querySelectorAll<HTMLDetailsElement>('details[open]') ?? []) {
        if (sibling !== event.target) sibling.open = false;
      }
    };
    element?.addEventListener('toggle', toggle, true);
    const close = (event: Event) => {
      const target = menu.current;
      if (!target?.open) return;
      if (event instanceof KeyboardEvent && event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault();
        target.open = false;
        target.querySelector('summary')?.focus();
      } else if (
        event instanceof PointerEvent &&
        event.target instanceof Node &&
        !target.contains(event.target)
      )
        target.open = false;
    };
    document.addEventListener('keydown', close);
    document.addEventListener('pointerdown', close);
    return () => {
      element?.removeEventListener('toggle', toggle, true);
      document.removeEventListener('keydown', close);
      document.removeEventListener('pointerdown', close);
    };
  }, []);
  const choice = (children: ReactNode, to: string, search: Record<string, unknown> = {}) => (
    <AppLink
      to={to}
      search={(prev) => ({
        zeitraum: prev['zeitraum'],
        anlageart: art,
        fokus: 'investment',
        ...search,
      })}
      onClick={() => {
        if (menu.current) menu.current.open = false;
      }}
    >
      {children}
    </AppLink>
  );
  return (
    <>
      <div className="wealth-toolbar" ref={toolbar}>
        <PageMenu area={{ ...areaById('vermoegen'), registers: WEALTH_PAGES }} current={page} />
        {['positions', 'savings', 'allocation'].includes(page) && (
          <label className="wealth-art">
            <span className="sr-only">Anlageart</span>
            <select
              aria-label="Anlageart"
              value={art}
              onChange={(event) =>
                void navigate({
                  to: '.',
                  search: ((prev: Record<string, unknown>) => ({
                    ...prev,
                    anlageart: event.target.value,
                  })) as never,
                  replace: true,
                })
              }
            >
              <option value="alle">Alle</option>
              <option value="wertpapiere">Wertpapiere</option>
              <option value="krypto">Krypto</option>
              <option value="p2p">P2P</option>
            </select>
          </label>
        )}
        <div className="wealth-toolbar-spacer" />
        {controls}
        <span className="wealth-stand" role="status">
          Stand {asOf ? longDay(asOf) : '—'} · Kurse{' '}
          {stand.data?.priceAt
            ? new Intl.DateTimeFormat('de-AT', { hour: '2-digit', minute: '2-digit' }).format(
                new Date(stand.data.priceAt),
              )
            : '—'}
        </span>
        <details className="area-page-menu wealth-investment" ref={menu}>
          <summary>
            <Plus size={16} aria-hidden="true" />
            <span className="wealth-investment-label" aria-hidden="true">
              Investment
            </span>
            <span className="sr-only">Investment</span>
          </summary>
          <nav aria-label="Investment hinzufügen">
            {choice('Wertpapier anlegen', '/vermoegen/portfolio/positionen', {
              produkt: 'neu',
              anlageart: 'wertpapiere',
            })}
            {choice('Krypto anlegen', '/vermoegen/portfolio/positionen', {
              produkt: 'neu',
              anlageart: 'krypto',
            })}
            <button
              type="button"
              onClick={() => {
                if (menu.current) menu.current.open = false;
                setAccount(true);
              }}
            >
              P2P-Konto anlegen
            </button>
            {choice('Handel erfassen', '/vermoegen/portfolio/positionen', { handel: 'neu' })}
            {choice('Sparplan anlegen', '/vermoegen/portfolio/sparplaene', { sparplan: 'neu' })}
            <button
              type="button"
              onClick={() => {
                if (menu.current) menu.current.open = false;
                setValuePicker(true);
              }}
            >
              Wert aktualisieren
            </button>
          </nav>
        </details>
      </div>
      <AccountFormPanel
        open={account}
        onClose={() => {
          setAccount(false);
          focusInvestment();
        }}
      />
      {valuePicker && (
        <WideDialog
          open
          onClose={() => {
            setValuePicker(false);
            focusInvestment();
          }}
          title="Wert aktualisieren"
        >
          <p>Für welches manuell bewertete Konto möchtest du einen Wert eintragen?</p>
          {accounts.isPending && <LoadingNote what="Konten" />}
          {accounts.isError && (
            <ErrorNote
              what="Konten"
              error={accounts.error}
              onRetry={() => void accounts.refetch()}
            />
          )}
          <ul>
            {accounts.data?.accounts
              .filter(
                (row) =>
                  !row.closedAt && !row.hasHoldings && ['p2p', 'other_asset'].includes(row.type),
              )
              .map((row) => (
                <li key={row.id}>
                  <AppLink
                    to={`/konten/${encodeURIComponent(row.id)}`}
                    search={{ pruefen: 'value' }}
                    onClick={() => setValuePicker(false)}
                  >
                    {row.name} →
                  </AppLink>
                </li>
              ))}
          </ul>
          {accounts.isSuccess &&
            !accounts.data.accounts.some(
              (row) =>
                !row.closedAt && !row.hasHoldings && ['p2p', 'other_asset'].includes(row.type),
            ) && (
              <EmptyNote>
                Keine manuell bewerteten Konten. Wertpapier- und Kryptokurse trägst du direkt im
                Instrument ein.
              </EmptyNote>
            )}
        </WideDialog>
      )}
    </>
  );
}

/** Cached values remain dated during a background read; errors keep their own retry controls. */
export function WealthReadStatus({
  fetching,
  paused,
  date,
}: {
  fetching: boolean;
  paused?: boolean;
  date?: string | undefined;
}) {
  return (
    <p className="vnote" role="status">
      {paused
        ? 'Offline · letzter verfügbarer Stand'
        : fetching
          ? 'Stand wird aktualisiert'
          : 'Datenstand'}
      {date ? ` · ${date}` : ' · noch nicht verfügbar'}
    </p>
  );
}
