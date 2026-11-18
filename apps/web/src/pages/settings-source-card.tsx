import { Button } from '@budget/ui';
import { ChevronDown, type LucideIcon } from 'lucide-react';
import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

const states = {
  unavailable: { label: 'Dienst nicht erreichbar', severity: 1 },
  failed: { label: 'Abruf fehlgeschlagen', severity: 1 },
  expired: { label: 'Einwilligung abgelaufen', severity: 2 },
  unmapped: { label: 'Konto nicht zugeordnet', severity: 3 },
  partial: { label: 'Teilweise abgerufen', severity: 4 },
  pending: { label: 'Freigabe offen', severity: 5 },
  paused: { label: 'Pausiert', severity: 0 },
  unconfigured: { label: 'Nicht eingerichtet', severity: 0 },
  waiting: { label: 'Erster Abruf offen', severity: 0 },
  loading: { label: 'Wird geladen', severity: 0 },
  running: { label: 'Abruf läuft', severity: 0 },
  stale: { label: 'Abruf ausständig', severity: 0 },
  connected: { label: 'Verbunden', severity: 0 },
} as const;

export type SourceState = keyof typeof states;

export function sourceSeverity(state: SourceState) {
  return states[state].severity;
}

export function sourceStateLabel(state: SourceState) {
  return states[state].label;
}

const dateFormat = new Intl.DateTimeFormat('de-AT', {
  timeZone: 'Europe/Vienna',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function sourceDate(value: string | null | undefined) {
  if (value === undefined) return 'Nicht verfügbar';
  return value ? registerDate(value) : 'noch kein erfolgreicher Abruf';
}

export function registerDate(value: string) {
  return dateFormat.format(new Date(value)).replace(',', '');
}

export type SourceRow = {
  id: string;
  title: string;
  icon: LucideIcon;
  scope: string;
  state: SourceState;
  impact?: string | undefined;
  date?: string | null | undefined;
  next?: string | null | undefined;
  action?: ReactNode;
  secondaryAction?: ReactNode;
  detailAction?: { label: string; target?: string | undefined } | undefined;
  initiallyOpen?: boolean;
  content?: (setupOpen: boolean) => ReactNode;
  children: ReactNode;
};

export function sourceReadState(
  query: { isPending: boolean; isError: boolean; isFetching: boolean; refetch: () => unknown },
  source: SourceRow,
): SourceRow {
  if (query.isPending)
    return {
      ...source,
      state: 'loading',
      impact: undefined,
      action: (
        <Button variant="ghost" disabled aria-busy="true">
          Wird geladen …
        </Button>
      ),
      detailAction: undefined,
    };
  if (query.isError) {
    return {
      ...source,
      state: 'unavailable',
      impact: 'Der Stand kann veraltet sein.',
      detailAction: undefined,
      action: (
        <Button
          variant="ghost"
          disabled={query.isFetching}
          aria-busy={query.isFetching}
          onClick={() => void query.refetch()}
        >
          {query.isFetching ? 'Lädt …' : 'Erneut versuchen'}
        </Button>
      ),
    };
  }
  return source;
}

function SourceMark({ tone }: { tone: 'good' | 'act' | 'neutral' }) {
  return <span className="settings-source-mark" data-tone={tone} aria-hidden="true" />;
}

export function SettingsSourceCard({
  id,
  title,
  icon: Icon,
  scope,
  state,
  impact,
  date,
  next,
  action,
  secondaryAction,
  detailAction,
  initiallyOpen = false,
  content,
  children,
}: SourceRow) {
  const [open, setOpen] = useState(initiallyOpen);
  const [focusRequest, setFocusRequest] = useState<{ target?: string | undefined }>();
  const body = useRef<HTMLDivElement>(null);
  const section = useRef<HTMLElement>(null);
  const bodyId = useId();
  const detailsName = `${title}: Einrichtung und Details`;
  useLayoutEffect(() => {
    if (!focusRequest || !open || !body.current) return;
    const control = focusRequest.target
      ? section.current?.querySelector<HTMLElement>(focusRequest.target)
      : null;
    (control ?? body.current).focus();
    setFocusRequest(undefined);
  }, [focusRequest, open]);

  return (
    <li>
      <section ref={section} className="settings-source-card" id={id} aria-label={title}>
        <div className="settings-source-head">
          <div className="settings-source-name">
            <span className="sr-only">Quelle</span>
            <strong>
              <Icon size={20} strokeWidth={1.5} aria-hidden="true" />
              {title}
            </strong>
          </div>
          <small className="settings-source-scope">{scope}</small>
          <div className="settings-source-state">
            <span className="sr-only">Zustand</span>
            <span className="settings-source-status" data-state={state}>
              <SourceMark
                tone={sourceSeverity(state) ? 'act' : state === 'connected' ? 'good' : 'neutral'}
              />
              {states[state].label}
            </span>
          </div>
          {impact && <p className="settings-source-impact">{impact}</p>}
          <dl className="settings-source-time" aria-label="Zeit">
            <div>
              <dt>Letzter Erfolg</dt>
              <dd>
                {date ? (
                  <time dateTime={date}>{registerDate(date)}</time>
                ) : state === 'loading' ? (
                  'Wird geladen …'
                ) : date === null ? (
                  'noch kein erfolgreicher Abruf'
                ) : (
                  'Nicht verfügbar'
                )}
              </dd>
            </div>
            {next ? (
              <div>
                <dt>Nächster Abruf</dt>
                <dd>
                  <time dateTime={next}>{registerDate(next)}</time>
                </dd>
              </div>
            ) : (
              <div>
                <dt>Nächster Abruf</dt>
                <dd className="settings-source-no-schedule">kein Zeitplan</dd>
              </div>
            )}
          </dl>
          <div className="settings-source-action">
            <span className="sr-only">Aktion</span>
            {detailAction ? (
              <Button
                variant={state === 'unconfigured' ? 'ghost' : 'primary'}
                onClick={() => {
                  const control = detailAction.target
                    ? Array.from(
                        section.current?.querySelectorAll<HTMLElement>(detailAction.target) ?? [],
                      ).find((element) => !element.closest('[hidden]'))
                    : null;
                  if (control && !control.closest('[hidden]')) {
                    if (
                      control instanceof HTMLButtonElement ||
                      control instanceof HTMLAnchorElement
                    )
                      control.click();
                    else control.focus();
                    return;
                  }
                  setOpen(true);
                  setFocusRequest(detailAction);
                }}
              >
                {detailAction.label}
              </Button>
            ) : (
              action
            )}
            {secondaryAction}
          </div>
          <Button
            id={`${id}-details`}
            className="settings-source-toggle"
            variant="ghost"
            aria-label={detailsName}
            aria-expanded={open}
            aria-controls={`${bodyId} ${bodyId}-parts`}
            onClick={() => setOpen(!open)}
          >
            <span className="settings-source-setup-label">Einrichtung</span>
            <ChevronDown size={20} strokeWidth={1.5} aria-hidden="true" />
          </Button>
        </div>
        <div id={`${bodyId}-parts`} className="settings-source-content">
          {content?.(open)}
        </div>
        {/* Keep edits mounted; native details leaves hidden selects noninteractive in WebKit. */}
        <div
          ref={body}
          id={bodyId}
          className="settings-source-details"
          role="group"
          aria-label={detailsName}
          tabIndex={-1}
          hidden={!open}
        >
          <div>{children}</div>
        </div>
      </section>
    </li>
  );
}

export function SourceRegister({ sources }: { sources: SourceRow[] }) {
  const register = useRef<HTMLElement>(null);
  const followedAnchor = useRef(false);
  const sorted = [...sources].sort((a, b) => {
    // Healthy and in-progress rows follow everything that needs attention.
    return (
      (sourceSeverity(a.state) || (a.state === 'unconfigured' ? 101 : 100)) -
      (sourceSeverity(b.state) || (b.state === 'unconfigured' ? 101 : 100))
    );
  });
  const problems = sorted.filter((source) => sourceSeverity(source.state));
  const loading = sources.some(({ state }) => state === 'loading');
  useLayoutEffect(() => {
    if (loading || followedAnchor.current) return;
    const target = document.getElementById(window.location.hash.slice(1));
    if (!target || !register.current?.contains(target) || target.closest('[hidden]')) return;
    // Source reads can reorder rows after the router's initial fragment scroll.
    target.scrollIntoView?.({ block: 'center' });
    followedAnchor.current = true;
  }, [loading]);
  const running = sources.some(({ state }) => state === 'running');
  const allCurrent = sources.every(({ state }) => state === 'connected');
  const latest = sources
    .flatMap(({ date }) => (date ? [date] : []))
    .sort()
    .at(-1);
  return (
    <section ref={register} className="settings-source-register" aria-label="Quellenregister">
      <div className="settings-source-summary">
        <p role="status">
          <SourceMark
            tone={loading ? 'neutral' : problems.length ? 'act' : running ? 'neutral' : 'good'}
          />
          {loading
            ? 'Wird geladen'
            : problems.length
              ? `${problems.length} von ${sources.length} Quellen brauchen dich`
              : running
                ? 'Abruf läuft'
                : allCurrent
                  ? `Alle ${sources.length} Quellen aktuell`
                  : 'Keine Quelle braucht dich'}
          {!loading && !running && !problems.length && latest && (
            <>
              {' '}
              – letzter Abruf <time dateTime={latest}>{registerDate(latest)}</time>
            </>
          )}
        </p>
        {!loading && problems.length > 0 && (
          <ul aria-label="Betroffene Quellen">
            {problems.map(({ id, title }) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  onClick={(event) => {
                    const toggle = document.getElementById(`${id}-details`);
                    if (!toggle) return;
                    event.preventDefault();
                    if (toggle.getAttribute('aria-expanded') === 'false') toggle.click();
                    toggle.focus();
                  }}
                >
                  {title}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
      {/* Safari drops list semantics when list markers are suppressed. */}
      {/* eslint-disable-next-line jsx-a11y/no-redundant-roles */}
      <ul className="settings-source-list" role="list" aria-label="Quellen">
        {sorted.map((source) => (
          <SettingsSourceCard key={source.id} {...source} />
        ))}
      </ul>
    </section>
  );
}
