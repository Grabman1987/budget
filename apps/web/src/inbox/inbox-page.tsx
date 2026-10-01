import { cents, formatDecimal, inboxMinutes, parseAmount } from '@budget/domain';
import {
  Button,
  CircleNumber,
  ClassSwatch,
  RevisionTriangle,
  SectionHead,
  useToast,
  type SwatchKind,
} from '@budget/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { useCallback, useState, type ReactNode } from 'react';
import { BUDGET_KEY } from '../budget/use-category-writes';
import { undoGroup } from '../ledger/api';
import { eur, pluralBookings } from '../ledger/format';
import { errorText } from '../ledger/labels';
import { LEDGER_KEY } from '../ledger/queries';
import { ErrorNote, LoadingNote } from '../ledger/states';
import { KONTEN_POSTEINGANG_META } from '../nav/pages';
import { PageFrame } from '../pages/placeholder-page';
import { AppLink } from '../shell/app-link';
import {
  acceptAll,
  acceptItem,
  dismissItem,
  inboxQuery,
  ruleItem,
  type InboxData,
  type InboxDecision,
  type InboxItem,
} from './inbox-api';

/** Duration of the slide-out of a decided row (design: 12 px to the right over 220 ms). */
const LEAVE_MS = 220;
const SWATCH = new Set<string>(['need', 'want', 'future']);

const reducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Konten › Posteingang: the work list as a revision table, grouped into Baugruppen. */
export function InboxPage() {
  const inbox = useQuery(inboxQuery());
  return (
    <PageFrame meta={KONTEN_POSTEINGANG_META}>
      <section className="kinbox" aria-labelledby="inbox-title">
        {inbox.isPending && <LoadingNote what="Posteingang" />}
        {inbox.isError && (
          <ErrorNote what="Posteingang" error={inbox.error} onRetry={() => void inbox.refetch()} />
        )}
        {inbox.data && <InboxBody data={inbox.data} />}
      </section>
    </PageFrame>
  );
}

/** A, B … Z, AA, AB … */
const letterOf = (i: number): string =>
  i < 26
    ? String.fromCharCode(65 + i)
    : `${String.fromCharCode(64 + Math.floor(i / 26))}${String.fromCharCode(65 + (i % 26))}`;

const before = (text: string, separator: string) => text.split(separator)[0] ?? text;

/** The amount field of a stale value with its "Speichern" button. */
function StaleValueEditor({
  id,
  startCents,
  busy,
  onSave,
  onInvalid,
}: {
  id: string;
  startCents: number;
  busy: boolean;
  onSave: (valueCents: number) => void;
  onInvalid: () => void;
}) {
  const [text, setText] = useState(formatDecimal(cents(startCents)));
  return (
    <>
      <label className="sr-only" htmlFor={`stale-${id}`}>
        Neuer Wert
      </label>
      <input
        className="input input-sm"
        id={`stale-${id}`}
        inputMode="decimal"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <Button
        variant="ghost"
        size="sm"
        disabled={busy}
        onClick={() => {
          const parsed = parseAmount(text);
          if (!parsed.ok || parsed.cents < 0) onInvalid();
          else onSave(parsed.cents);
        }}
      >
        Speichern
      </Button>
    </>
  );
}

function InboxBody({ data }: { data: InboxData }) {
  const qc = useQueryClient();
  const toast = useToast();
  // A decided row slides out first (`leaving`), then drops out of the list (`gone`) until the
  // refetch confirms it; an undo brings it back.
  const [leaving, setLeaving] = useState<ReadonlySet<string>>(new Set());
  const [gone, setGone] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const settle = useCallback(
    () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: LEDGER_KEY }),
        qc.invalidateQueries({ queryKey: BUDGET_KEY }),
      ]),
    [qc],
  );

  const undo = useCallback(
    (decision: InboxDecision) => {
      void undoGroup(decision.groupId).then(
        () => {
          setGone((prev) => new Set([...prev].filter((id) => !decision.resolvedIds.includes(id))));
          void settle();
          toast.show({ message: 'Rückgängig gemacht.' });
        },
        (error: unknown) => toast.show({ message: errorText(error) }),
      );
    },
    [settle, toast],
  );

  const decide = useCallback(
    async <D extends InboxDecision>(run: () => Promise<D>, message: (decision: D) => string) => {
      if (busy) return;
      setBusy(true);
      try {
        const decision = await run();
        const ids = decision.resolvedIds;
        setLeaving((prev) => new Set([...prev, ...ids]));
        toast.show({
          message: message(decision),
          actionLabel: 'Rückgängig',
          onAction: () => undo(decision),
        });
        await new Promise((resolve) => setTimeout(resolve, reducedMotion() ? 0 : LEAVE_MS));
        setGone((prev) => new Set([...prev, ...ids]));
        setLeaving((prev) => new Set([...prev].filter((id) => !ids.includes(id))));
        await settle();
      } catch (error) {
        toast.show({ message: errorText(error) });
      } finally {
        setBusy(false);
      }
    },
    [busy, settle, toast, undo],
  );

  const groups = data.groups
    .map((g) => ({ ...g, items: g.items.filter((i) => !gone.has(i.id)) }))
    .filter((g) => g.items.length > 0);
  const open = groups.reduce((n, g) => n + g.items.length, 0);
  const acceptable = groups.find((g) => g.id === 'uncat')?.items.filter((i) => i.suggestion) ?? [];
  let letter = 0;

  const ghost = (label: string, run: () => void) => (
    <Button variant="ghost" size="sm" disabled={busy} onClick={run}>
      {label}
    </Button>
  );
  const dismiss = (item: InboxItem, label: string) =>
    ghost(
      label,
      () =>
        void decide(
          () => dismissItem(item.id),
          () => 'Erledigt, ohne Änderung.',
        ),
    );

  const actions = (item: InboxItem): ReactNode => {
    switch (item.group) {
      case 'over':
        return (
          <AppLink className="btn btn-alert btn-sm" to="/plan/monat">
            Im Plan decken
          </AppLink>
        );
      case 'uncat': {
        const { suggestion } = item;
        if (!suggestion)
          return (
            <AppLink
              className="btn btn-ghost btn-sm"
              to="/konten/buchungen"
              search={{ kategorie: 'none' }}
            >
              Kategorie wählen
            </AppLink>
          );
        const payee = before(item.title, ' · ');
        return (
          <>
            {ghost(
              'Übernehmen',
              () =>
                void decide(
                  () => acceptItem(item.id),
                  () => `${payee} → ${suggestion.categoryName}`,
                ),
            )}
            {item.canRule &&
              ghost(
                'Immer so zuordnen',
                () =>
                  void decide(
                    () => ruleItem(item.id),
                    (d) =>
                      `Regel angelegt: ${payee} → ${suggestion.categoryName}. ${pluralBookings(d.applied)} zugeordnet.`,
                  ),
              )}
          </>
        );
      }
      case 'version': {
        const { version } = item;
        if (!version) return dismiss(item, 'Ignorieren');
        return (
          <>
            {ghost(
              version.label,
              () =>
                void decide(
                  () => acceptItem(item.id),
                  () =>
                    `${before(item.title, ':')}: ${eur(version.amountCents)} als neue Version gespeichert.`,
                ),
            )}
            {dismiss(item, 'Ignorieren')}
          </>
        );
      }
      case 'stale': {
        const { value } = item;
        if (!value) return dismiss(item, 'Erledigt');
        return (
          <StaleValueEditor
            id={item.id}
            startCents={value.valueCents}
            busy={busy}
            onInvalid={() =>
              toast.show({ message: 'Bitte einen Betrag eingeben, z. B. 4.230,00.' })
            }
            onSave={(valueCents) =>
              void decide(
                () => acceptItem(item.id, { valueCents }),
                () => `${before(item.title, ':')}: Wert ${eur(valueCents)} gespeichert.`,
              )
            }
          />
        );
      }
      default:
        return dismiss(item, 'Erledigt');
    }
  };

  const what = (item: InboxItem) => {
    const { suggestion } = item;
    return (
      <>
        <strong>{item.title}</strong>
        <span>
          {item.detail}
          {item.group === 'uncat' && (
            <>
              {' · '}
              {suggestion ? (
                <>
                  Vorschlag:{' '}
                  <span className="kcat">
                    {suggestion.categoryClass && SWATCH.has(suggestion.categoryClass) && (
                      <ClassSwatch kind={suggestion.categoryClass as SwatchKind} />
                    )}
                    {suggestion.categoryName}
                  </span>
                </>
              ) : (
                'kein Vorschlag'
              )}
            </>
          )}
        </span>
      </>
    );
  };

  return (
    <>
      <SectionHead
        id="inbox-title"
        title="Posteingang"
        aside={open > 0 ? `${open} offen · etwa ${inboxMinutes(open)} Minuten` : undefined}
      />
      {open === 0 ? (
        <div className="rev-empty">
          <CheckCircle2 className="icon" size={18} strokeWidth={1.75} aria-hidden="true" />
          <div>
            <strong>Posteingang leer.</strong>
            <br />
            Alles entschieden, bis zum nächsten Bank-Abruf.
          </div>
        </div>
      ) : (
        <table className="rev-table kinbox-table">
          <caption className="sr-only">Offene Entscheidungen nach Typ</caption>
          <thead>
            <tr>
              <th className="tech" scope="col">
                Rev.
              </th>
              <th className="tech" scope="col">
                Änderung
              </th>
              <th className="tech kact-head" scope="col">
                Aktion
              </th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => [
              <tr className="kgroup" key={`g-${g.id}`}>
                <td className="kc-pos">
                  <CircleNumber n={g.no} size="sm" />
                </td>
                <td colSpan={2}>
                  <span className="grp-title">{g.title}</span>
                  <span className="grp-sub">{g.sub}</span>
                  <span className="kgcount" aria-label={`${g.items.length} offen`}>
                    {g.items.length}
                  </span>
                  {g.id === 'uncat' && acceptable.length > 1 && (
                    <Button
                      variant="ghost"
                      size="xs"
                      disabled={busy}
                      onClick={() =>
                        void decide(
                          () => acceptAll(),
                          (d) => `${pluralBookings(d.resolvedIds.length)} zugeordnet.`,
                        )
                      }
                    >
                      Alle {acceptable.length} übernehmen
                    </Button>
                  )}
                </td>
              </tr>,
              ...g.items.map((item) => {
                const l = letterOf(letter++);
                return (
                  <tr
                    key={item.id}
                    className={`rev-row${item.urgent ? ' is-urgent' : ''}${leaving.has(item.id) ? ' is-leaving' : ''}`}
                    data-inbox-row={item.id}
                  >
                    <td className="rev-mark">
                      <RevisionTriangle letter={l} urgent={item.urgent} />
                    </td>
                    <td className="rev-what">{what(item)}</td>
                    <td className="rev-act kact">{actions(item)}</td>
                  </tr>
                );
              }),
            ])}
          </tbody>
        </table>
      )}
    </>
  );
}
