import { useAmountPrivacy, maskMoneyText, TitleBlock, setAmountsHidden } from '@budget/ui';
import { closeEntryMonth, matchesSearch, todayInVienna } from '@budget/domain';
import type { GlobalSearchResult, SearchKind } from '@budget/db';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate, useRouter, useSearch } from '@tanstack/react-router';
import { Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { request } from '../api/http';
import { LEDGER_KEY } from '../ledger/queries';
import { AREAS } from '../nav/areas';
import { REPORTS } from '../nav/reports-catalog';
import { isTyping } from './capture-shortcut';
import { KeyboardShortcuts } from './keyboard-shortcuts';
import { AppLink } from './app-link';
import './global-search.css';

type PaletteItem = Omit<GlobalSearchResult, 'kind'> & {
  kind: SearchKind | 'page' | 'report' | 'action';
};
const LABELS: Record<PaletteItem['kind'], string> = {
  page: 'Seite',
  report: 'Report',
  action: 'Aktion',
  account: 'Konto',
  category: 'Kategorie',
  payee: 'Empfänger',
  contact: 'Kontakt',
  booking: 'Buchung',
};
const PAGES: PaletteItem[] = AREAS.flatMap((area) => [
  { kind: 'page' as const, id: area.to, label: area.label, detail: null },
  ...area.registers.map((r) => ({
    kind: 'page' as const,
    id: r.to,
    label: `${area.label} · ${r.label}`,
    detail: null,
  })),
]);
const COMMANDS: PaletteItem[] = [
  { kind: 'action', id: 'buchung', label: 'Neue Buchung', detail: 'N' },
  { kind: 'action', id: 'posteingang', label: 'Posteingang öffnen', detail: null },
  {
    kind: 'action',
    id: 'monatsabschluss',
    label: 'Monatsabschluss starten',
    detail: 'Zuerst Kontostände prüfen',
  },
  {
    kind: 'action',
    id: 'privacy',
    label: 'Datenschutz-Modus umschalten',
    detail: 'Strg Umschalt H / ⌘ Umschalt H',
  },
];
const STATIC_ITEMS: PaletteItem[] = [
  ...COMMANDS,
  ...PAGES,
  ...REPORTS.map((r) => ({
    kind: 'report' as const,
    id: r.id,
    label: `${r.pos} ${r.name}`,
    detail: null,
  })),
];
// Exact everyday terms lead only to existing functions, never to ledger data.
const SEARCH_TERMS: Record<string, readonly string[]> = {
  'page:/plan/monat': ['budget', 'monatsplanung'],
  'page:/plan/jahr': ['jahresplanung'],
  'report:liquiditaet': ['baby', 'einkommenspause', 'elternzeit', 'karenz', 'liquidität'],
  'page:/plan/sparziele': ['sparen', 'sparziel', 'notgroschen'],
  'page:/vermoegen/schulden': ['dispo', 'kredit', 'tilgung'],
  'report:kosten': ['gebühren', 'bankgebühren', 'zinskosten'],
};
// Only IDs in session memory; dynamic choices are revalidated by the server on opening.
let recent: Pick<PaletteItem, 'kind' | 'id'>[] = [];
const itemKey = (item: Pick<PaletteItem, 'kind' | 'id'>) => `${item.kind}:${item.id}`;
function destination(result: PaletteItem) {
  if (result.kind === 'page') return { to: result.id, search: {} };
  if (result.kind === 'report') return { to: `/reports/${result.id}`, search: {} };
  if (result.kind === 'account')
    return { to: `/konten/${encodeURIComponent(result.id)}`, search: {} };
  if (result.kind === 'contact')
    return { to: `/konten/kontakte/${encodeURIComponent(result.id)}`, search: {} };
  const key =
    result.kind === 'category' ? 'kategorie' : result.kind === 'payee' ? 'empfaenger' : 'buchung';
  return { to: '/konten/buchungen', search: { [key]: result.id } };
}

/** Header entry point; both viewports use the same deep-linkable result page. */
export function GlobalSearch({ mobile = false }: { mobile?: boolean }) {
  const navigate = useNavigate();
  const router = useRouter();
  const location = useLocation();
  const trigger = useRef<HTMLButtonElement>(null);
  const previousPath = useRef(location.pathname);
  const [help, setHelp] = useState(false);
  useEffect(() => {
    if (
      previousPath.current === '/suche' &&
      location.pathname !== '/suche' &&
      window.matchMedia('(max-width: 767px)').matches === mobile
    )
      trigger.current?.focus();
    previousPath.current = location.pathname;
  }, [location.pathname, mobile]);
  const open = () => {
    const focus = () => {
      const input = document.getElementById('search-query') as HTMLInputElement | null;
      input?.focus();
      input?.select();
    };
    const current = router.state.location;
    if (current.pathname === '/suche') focus();
    else
      void navigate({
        to: '/suche',
        search: { von: current.href },
        state: { searchOpenedInApp: true } as never,
      }).then(() => requestAnimationFrame(focus));
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        window.matchMedia('(max-width: 767px)').matches !== mobile ||
        event.defaultPrevented ||
        document.querySelector('dialog[open]')
      )
        return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        open();
      } else if (
        event.key === '?' &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !event.repeat &&
        !isTyping(event.target)
      ) {
        event.preventDefault();
        setHelp(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  return (
    <>
      <button
        ref={trigger}
        id={mobile ? 'global-search-mobile' : 'global-search'}
        type="button"
        className={mobile ? 'icon-btn global-search-trigger' : 'search global-search-launch'}
        aria-label="Suchen"
        aria-keyshortcuts="Control+k Meta+k"
        onClick={open}
      >
        <Search className="icon" size={18} strokeWidth={1.75} aria-hidden="true" />
        {!mobile && (
          <>
            <span>Suchen: Seiten, Reports, Buchungen, Aktionen</span>
            <span className="kbd" aria-hidden="true">
              Strg K
            </span>
          </>
        )}
      </button>
      <KeyboardShortcuts open={help} onClose={() => setHelp(false)} />
    </>
  );
}

export function SearchPage() {
  const search = useSearch({ strict: false }) as { q?: string; von?: string };
  return (
    <section className="search-page">
      <TitleBlock title="Suchen" />
      <nav aria-label="Brotkrumen">
        <SearchBack source={search.von} />
        {' › '}
        <span aria-current="page">Suchen</span>
      </nav>
      <SearchResults />
    </section>
  );
}

function SearchBack({ source }: { source?: string | undefined }) {
  const url = new URL(source ?? '/', 'https://budget.invalid');
  return (
    <AppLink
      className="btn btn-ghost"
      to={url.pathname}
      search={Object.fromEntries(url.searchParams)}
    >
      Zurück zur vorherigen Ansicht
    </AppLink>
  );
}

/** Reuses the existing provider, ranking, privacy and arrow/Enter selection. */
export function SearchResults() {
  const routeSearch = useSearch({ strict: false }) as { q?: string; von?: string };
  const source = new URL(routeSearch.von ?? '/', 'https://budget.invalid');
  const hidden = useAmountPrivacy();
  const input = useRef<HTMLInputElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const router = useRouter();
  const openedInApp = useLocation({
    select: (location) => location.state.searchOpenedInApp === true,
  });
  const leaving = useRef(false);
  const [open, setOpen] = useState(true);
  const [help, setHelp] = useState(false);
  const [value, setValue] = useState(routeSearch.q ?? '');
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const text = value.trim();
  const listId = 'global-search-results';
  // A search opened from inside the app is a history entry of its own: leaving it steps back
  // (like the panels) instead of stacking the source page a second time.
  const close = () => {
    if (!openedInApp) {
      void navigate({
        to: source.pathname,
        search: Object.fromEntries(source.searchParams),
      } as never);
    } else if (!leaving.current) {
      leaving.current = true;
      router.history.back();
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(text), 180);
    return () => window.clearTimeout(timer);
  }, [text]);
  useEffect(() => {
    input.current?.focus();
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.key === 'Escape' &&
        !event.defaultPrevented &&
        open &&
        !help &&
        event.target instanceof Node &&
        container.current?.contains(event.target)
      ) {
        event.preventDefault();
        input.current?.focus();
        setOpen(false);
        close();
        return;
      }
      if (
        event.key === '?' &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !event.repeat &&
        !isTyping(event.target) &&
        !event.defaultPrevented &&
        !document.querySelector('dialog[open]')
      ) {
        event.preventDefault();
        setHelp(true);
        return;
      }
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'k') return;
      if (document.querySelector('dialog[open]') && (!open || help)) return;
      event.preventDefault();
      setOpen(true);
      input.current?.focus();
      input.current?.select();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const history = recent.filter(
    (r) => r.kind !== 'page' && r.kind !== 'report' && r.kind !== 'action',
  );
  const search = useQuery({
    queryKey: [...LEDGER_KEY, 'global-search', query, history],
    queryFn: () =>
      request<{ results: GlobalSearchResult[] }>(
        'GET',
        `/api/search?q=${encodeURIComponent(query)}${history.length ? `&recent=${encodeURIComponent(JSON.stringify(history))}` : ''}`,
      ),
    enabled: open && (text.length === 0 || text.length >= 2) && query === text,
    retry: false,
    gcTime: 0,
  });
  const loading =
    (text.length === 0 || text.length >= 2) &&
    (query !== text || search.isPending || search.isFetching);
  const remote = !loading && query === text && !search.isError ? (search.data?.results ?? []) : [];
  const candidates = [
    ...remote,
    ...STATIC_ITEMS.filter(
      (item) =>
        matchesSearch(`${item.label} ${item.id}`, text) ||
        SEARCH_TERMS[itemKey(item)]?.includes(text.toLocaleLowerCase('de-AT')),
    ),
  ];
  const results = [...new Map(candidates.map((item) => [itemKey(item), item])).values()];
  const preferActions = COMMANDS.some(
    (command) => command.label.toLocaleLowerCase('de-AT') === text.toLocaleLowerCase('de-AT'),
  );
  results.sort((a, b) => {
    if ((a.kind === 'action') !== (b.kind === 'action'))
      return (a.kind === 'action') === preferActions ? -1 : 1;
    const rank = (item: PaletteItem) => {
      const position = recent.findIndex((r) => itemKey(r) === itemKey(item));
      return position < 0 ? recent.length : position;
    };
    return rank(a) - rank(b);
  });
  const hits = results.filter((r) => r.kind !== 'action').length;
  const actions = results.length - hits;
  const index = Math.min(active, results.length - 1);
  useEffect(() => {
    if (open && index >= 0)
      document.getElementById(`${listId}-${index}`)?.scrollIntoView({ block: 'nearest' });
  }, [open, index, listId]);
  const select = (result: PaletteItem) => {
    recent = [
      { kind: result.kind, id: result.id },
      ...recent.filter((r) => itemKey(r) !== itemKey(result)),
    ].slice(0, 8);
    if (result.kind === 'action' && result.id === 'privacy') {
      setAmountsHidden(!hidden);
      input.current?.focus();
      return;
    }
    setOpen(false);
    setActive(0);
    input.current?.blur();
    if (result.kind === 'action') {
      if (result.id === 'privacy') setAmountsHidden(!hidden);
      else if (result.id === 'posteingang')
        void navigate({ to: '/konten/posteingang', search: { von: routeSearch.von } });
      else if (result.id === 'monatsabschluss')
        void navigate({
          to: `/monatsabschluss/${closeEntryMonth(todayInVienna()) ?? todayInVienna().slice(0, 7)}`,
          search: {},
        } as never);
      else
        void navigate({
          to: source.pathname,
          search: { ...Object.fromEntries(source.searchParams), panel: result.id } as never,
          state: { panelOpenedInApp: true } as never,
        });
    } else void navigate(destination(result) as never);
  };

  const field = (
    <div className="global-search is-mobile" ref={container}>
      <label className="global-search-field">
        <span className="sr-only">Suchen</span>
        <Search className="icon" size={18} strokeWidth={1.75} aria-hidden="true" />
        <input
          ref={input}
          id="search-query"
          type="search"
          role="combobox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={open && index >= 0 ? `${listId}-${index}` : undefined}
          aria-keyshortcuts="Control+k Meta+k"
          aria-describedby={open ? `${listId}-status` : undefined}
          placeholder="Suchen: Seiten, Reports, Buchungen, Aktionen"
          autoComplete="off"
          maxLength={200}
          value={value}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setValue(event.target.value);
            void navigate({
              to: '/suche',
              search: { ...routeSearch, q: event.target.value || undefined },
              replace: true,
              state: true as never,
            });
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              setOpen(false);
              close();
              return;
            }
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              setOpen(true);
              if (results.length)
                setActive(
                  (index + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length,
                );
            } else if (event.key === 'Enter' && open && results[index]) {
              event.preventDefault();
              select(results[index]);
            }
          }}
        />
      </label>
      {open && (
        <div className="global-search-popup">
          <div className="global-search-status" id={`${listId}-status`} role="status">
            {loading
              ? 'Suche wird geladen …'
              : search.isError
                ? 'Die Suche ist nicht verfügbar.'
                : results.length === 0
                  ? 'Keine Treffer.'
                  : `${hits} Treffer · ${actions} globale Aktionen · zuletzt verwendet zuerst · ? Tastenkürzel`}
          </div>
          {query === text && search.isError && (
            <button type="button" className="btn btn-ghost" onClick={() => void search.refetch()}>
              Erneut versuchen
            </button>
          )}
          <div id={listId} role="listbox" aria-label="Suchergebnisse" aria-busy={loading}>
            {[preferActions, !preferActions].map((isAction) => (
              <div
                key={String(isAction)}
                role="group"
                aria-label={isAction ? 'Globale Aktionen' : 'Passende Treffer'}
              >
                {results.some((r) => (r.kind === 'action') === isAction) && (
                  <div className="global-search-group" aria-hidden="true">
                    {isAction ? 'Globale Aktionen' : 'Passende Treffer'}
                  </div>
                )}
                {results.map((result, i) =>
                  (result.kind === 'action') === isAction ? (
                    <button
                      key={`${result.kind}-${result.id}`}
                      id={`${listId}-${i}`}
                      type="button"
                      role="option"
                      aria-selected={i === index}
                      tabIndex={-1}
                      className="global-search-result"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => select(result)}
                    >
                      <span className="global-search-kind">{LABELS[result.kind]}</span>
                      <span className="global-search-label">
                        {maskMoneyText(result.label)}
                        {result.detail && <small>{maskMoneyText(result.detail)}</small>}
                      </span>
                    </button>
                  ) : null,
                )}
              </div>
            ))}
          </div>
          <button type="button" className="btn btn-ghost" onClick={() => setHelp(true)}>
            Tastenkürzel anzeigen (?)
          </button>
        </div>
      )}
    </div>
  );
  return (
    <>
      <KeyboardShortcuts open={help} onClose={() => setHelp(false)} />
      {field}
    </>
  );
}
