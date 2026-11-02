import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
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
export const ASSET_TYPES = ['alle', 'wertpapiere', 'krypto', 'p2p'] as const;
export type AssetType = (typeof ASSET_TYPES)[number];
export const assetType = (value: unknown): AssetType =>
  ASSET_TYPES.includes(value as AssetType) ? (value as AssetType) : 'alle';
export const matchesAsset = (kind: string, art: AssetType) =>
  art === 'alle' ||
  (art === 'krypto'
    ? kind === 'crypto'
    : art === 'p2p'
      ? kind === 'p2p'
      : kind !== 'crypto' && kind !== 'p2p');
export function useAssetType() {
  const search = useSearch({ strict: false }) as { anlageart?: unknown };
  return assetType(search.anlageart);
}

export function WealthFrame({ page, children, ...props }: PageFrameProps & { page: WealthPage }) {
  if (!REDESIGN_ENABLED) return <PageFrame {...props}>{children}</PageFrame>;
  return (
    <div className="wealth-redesign" data-testid="wealth-redesign">
      <PageFrame {...props} title="Vermögen" pageNavigation={<WealthToolbar page={page} />}>
        {children}
      </PageFrame>
    </div>
  );
}

function WealthToolbar({ page }: { page: WealthPage }) {
  const art = useAssetType();
  const navigate = useNavigate();
  const menu = useRef<HTMLDetailsElement>(null);
  const [account, setAccount] = useState(false);
  useEffect(() => {
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
      document.removeEventListener('keydown', close);
      document.removeEventListener('pointerdown', close);
    };
  }, []);
  const choice = (children: ReactNode, to: string, search: Record<string, unknown> = {}) => (
    <AppLink
      to={to}
      search={(prev) => ({ zeitraum: prev['zeitraum'], anlageart: art, ...search })}
      onClick={() => {
        if (menu.current) menu.current.open = false;
      }}
    >
      {children}
    </AppLink>
  );
  return (
    <>
      <div className="wealth-toolbar">
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
        <details className="area-page-menu wealth-investment" ref={menu}>
          <summary>
            <Plus size={16} aria-hidden="true" /> Investment
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
            {choice('Wert aktualisieren', '/konten', {})}
          </nav>
        </details>
      </div>
      <AccountFormPanel open={account} onClose={() => setAccount(false)} />
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
