import { useId, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { applyChecklistCredits, outlayIdsUpTo, planContactChecklist } from '@budget/domain';
import type { listContactChecklist } from '@budget/db';
import { request } from '../api/http';
import { useLedgerWrites } from './mutations';
import { eur } from './format';
import './contact-checklist.css';

type Checklist = ReturnType<typeof listContactChecklist>;

export interface ChecklistReceiptBody {
  accountId: string;
  date: string;
  amountCents: number;
  memo?: string | null;
  outlaySplitIds: string[];
  occurrenceIds: string[];
  creditReceiptSplitIds: string[];
  /** Existing payee id or a typed name the server reuses/creates; at most one of both. */
  payeeId?: string;
  payeeName?: string;
  shortfall: 'open' | 'waive';
  /** Per-remainder waiver: only these outlays' remainders are booked as a gift. */
  waiveOutlaySplitIds?: string[];
  surplus: 'credit' | 'gift';
}

/** Open items of a contact for the payment date (#1322). Keyed under the ledger family. */
const checklistQuery = (contactId: string, date: string, ownBookingId?: string) => ({
  queryKey: ['ledger', 'contact-checklist', contactId, date, ownBookingId ?? null],
  retry: false,
  queryFn: () =>
    request<Checklist>(
      'GET',
      `/api/contacts/${encodeURIComponent(contactId)}/checklist?asOf=${encodeURIComponent(date)}${
        ownBookingId ? `&bookingId=${encodeURIComponent(ownBookingId)}` : ''
      }`,
    ),
});

const day = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;
const fullDay = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

/**
 * Allocation list of an inflow from a contact: every open outlay and due contribution is a
 * checkbox row (all ticked at first), "Rest" follows the ticks live, and a rest above or below
 * zero asks how it is handled. The hook owns the selection; `payload` is what the server books.
 */
export function useContactChecklist({
  contactId,
  date,
  receivedCents,
  enabled,
  ownBookingId,
}: {
  contactId: string;
  date: string;
  receivedCents: number;
  enabled: boolean;
  /** Re-split of this existing booking (#1336): contributions only, its own links ticked. */
  ownBookingId?: string;
}) {
  const live = enabled && contactId !== '' && date !== '' && receivedCents > 0;
  const query = useQuery({ ...checklistQuery(contactId, date, ownBookingId), enabled: live });
  // The selection belongs to one contact: another contact starts from the defaults again.
  const [state, setState] = useState({
    contactId,
    unticked: new Set<string>() as ReadonlySet<string>,
    /** Explicit tick of a contribution row; without an entry only the first selectable one is ticked. */
    contributionTicks: new Map<string, boolean>() as ReadonlyMap<string, boolean>,
    shortfall: 'open' as 'open' | 'waive',
    surplus: 'credit' as 'credit' | 'gift',
    /** Outlays whose remainder is taken over as a gift (default: stays open). */
    waived: new Set<string>() as ReadonlySet<string>,
    /** Cutoff of "Alles bis … ausgleichen"; empty = the payment date. */
    cutoff: '',
  });
  const current =
    state.contactId === contactId
      ? state
      : {
          contactId,
          unticked: new Set<string>(),
          contributionTicks: new Map<string, boolean>(),
          shortfall: 'open' as const,
          surplus: 'credit' as const,
          waived: new Set<string>() as ReadonlySet<string>,
          cutoff: '',
        };
  const { unticked, shortfall, surplus } = current;
  const setShortfall = (value: 'open' | 'waive') => setState({ ...current, shortfall: value });
  const setSurplus = (value: 'credit' | 'gift') => setState({ ...current, surplus: value });
  const data = live ? query.data : undefined;
  const contributions = useMemo(() => data?.contributions ?? [], [data]);
  const outlays = useMemo(() => (ownBookingId ? [] : (data?.outlays ?? [])), [data, ownBookingId]);
  const credits = useMemo(() => (ownBookingId ? [] : (data?.credits ?? [])), [data, ownBookingId]);
  const firstContribution = ownBookingId
    ? undefined
    : contributions.find((c) => c.selectable)?.occurrenceId;
  const rows = useMemo(
    () => [
      ...contributions.map((c) => ({
        key: `c:${c.occurrenceId}`,
        id: c.occurrenceId,
        kind: 'contribution' as const,
        label: `${c.name}${c.categoryName ? ` → ${c.categoryName}` : ''}`,
        amountCents: c.amountCents,
        selectable: c.selectable,
        categoryId: c.categoryId,
      })),
      ...outlays.map((o) => ({
        key: `o:${o.splitId}`,
        id: o.splitId,
        kind: 'outlay' as const,
        label: `Auslage ${day(o.date)}${o.categoryName ? ` → ${o.categoryName}` : ''}${o.memo ? ` · ${o.memo}` : ''}`,
        amountCents: o.remainingCents,
        selectable: true,
        categoryId: o.categoryId,
      })),
      ...credits.map((c) => ({
        key: `k:${c.receiptSplitId}`,
        id: c.receiptSplitId,
        kind: 'credit' as const,
        label: `Guthaben${c.categoryName ? ` → ${c.categoryName}` : ''}`,
        amountCents: c.remainingCents,
        selectable: c.usable,
        categoryId: c.categoryId,
      })),
    ],
    [contributions, outlays, credits],
  );
  const isTicked = (row: (typeof rows)[number]) =>
    row.kind === 'contribution'
      ? (current.contributionTicks.get(row.id) ??
        (row.selectable &&
          (row.id === firstContribution ||
            contributions.some((c) => c.occurrenceId === row.id && c.linkedHere))))
      : row.kind === 'credit'
        ? row.selectable && !unticked.has(row.key)
        : !unticked.has(row.key);
  const ticked = rows.filter(isTicked);
  // Credits offset the ticked outlays first (same rule as the server); cash settles the rest.
  const offset = applyChecklistCredits(
    ticked.filter((r) => r.kind === 'outlay'),
    ticked.filter((r) => r.kind === 'credit'),
  );
  const net = new Map(offset.outlays.map((o) => [o.id, o.amountCents]));
  const planned = ticked
    .filter((r) => r.kind !== 'credit')
    .map((r) => ({ ...r, amountCents: net.get(r.id) ?? r.amountCents }))
    .filter((r) => r.amountCents > 0);
  const plan = planContactChecklist(planned, receivedCents);
  const rest = plan.restCents;
  const paidCash = (id: string) => plan.paid.find((p) => p.id === id)?.amountCents ?? 0;
  const applied = (row: (typeof rows)[number]) =>
    row.kind === 'credit'
      ? -(offset.appliedByCredit.get(row.id) ?? 0)
      : paidCash(row.id) + (row.amountCents - (net.get(row.id) ?? row.amountCents));
  // "schenken" only exists for an outlay that falls short and has a category to waive into.
  const shortOutlays = planned.filter((r) => r.kind === 'outlay' && paidCash(r.id) < r.amountCents);
  const canWaive = shortOutlays.length > 0 && shortOutlays.every((r) => r.categoryId);
  const effectiveShortfall = canWaive ? shortfall : 'open';
  // Remainders of single outlays can be taken over one by one (only while "schenken" is off).
  const waivable = effectiveShortfall === 'open' ? shortOutlays.filter((r) => r.categoryId) : [];
  const waiveIds = waivable.filter((r) => current.waived.has(r.id)).map((r) => r.id);
  const cutoff = current.cutoff || date;
  const selectedCents = planned.reduce((sum, r) => sum + r.amountCents, 0);
  const active = rows.length > 0;
  const outlayIds = ticked.filter((r) => r.kind === 'outlay').map((r) => r.id);
  const creditIds = ticked.filter((r) => r.kind === 'credit').map((r) => r.id);
  const occurrenceIds = ticked.filter((r) => r.kind === 'contribution').map((r) => r.id);
  const heading = useId();
  const toggle = (row: (typeof rows)[number]) => {
    if (row.kind === 'contribution')
      return setState({
        ...current,
        contributionTicks: new Map(current.contributionTicks).set(row.id, !isTicked(row)),
      });
    const next = new Set(unticked);
    if (!next.delete(row.key)) next.add(row.key);
    setState({ ...current, unticked: next });
  };
  /** "Alles bis <Datum> ausgleichen": tick every open outlay up to the cutoff, untick later ones. */
  const settleUpTo = () => {
    const keep = new Set(
      outlayIdsUpTo(
        outlays.map((o) => ({ id: o.splitId, date: o.date })),
        cutoff,
      ),
    );
    setState({
      ...current,
      unticked: new Set(outlays.filter((o) => !keep.has(o.splitId)).map((o) => `o:${o.splitId}`)),
    });
  };
  const toggleWaive = (id: string) => {
    const next = new Set(current.waived);
    if (!next.delete(id)) next.add(id);
    setState({ ...current, waived: next });
  };
  const choice = <V extends string>(
    name: string,
    value: V,
    set: (v: V) => void,
    options: ReadonlyArray<readonly [V, string]>,
  ) => (
    <div role="radiogroup" aria-label={name} className="cc-choice">
      {options.map(([v, label]) => (
        <label key={v} className="cc-row">
          <input
            type="radio"
            name={`${heading}-${name}`}
            checked={value === v}
            onChange={() => set(v)}
          />
          <span>{label}</span>
        </label>
      ))}
    </div>
  );
  const view: ReactNode = active ? (
    <fieldset className="cc" aria-labelledby={heading} data-testid="contact-checklist">
      <legend id={heading} className="cc-head">
        <span>Erhalten</span>
        <span className="cc-amount">{eur(receivedCents)}</span>
      </legend>
      {!ownBookingId && outlays.length > 0 && (
        <div className="cc-row cc-cutoff">
          <label className="cc-label" htmlFor={`${heading}-cutoff`}>
            Ausgleichsdatum
          </label>
          <input
            id={`${heading}-cutoff`}
            type="date"
            className="cc-date"
            value={cutoff}
            max={date}
            onChange={(e) => setState({ ...current, cutoff: e.target.value })}
          />
          <button type="button" className="kbtn" onClick={settleUpTo} disabled={cutoff === ''}>
            {`Alles bis ${cutoff ? fullDay(cutoff) : '…'} ausgleichen`}
          </button>
        </div>
      )}
      {rows.map((row) => (
        <label key={row.key} className="cc-row">
          <input
            type="checkbox"
            checked={isTicked(row)}
            disabled={!row.selectable}
            onChange={() => toggle(row)}
          />
          <span className="cc-label">{row.label}</span>
          <span className="cc-amount">
            {eur(row.kind === 'credit' ? -row.amountCents : row.amountCents)}
            {isTicked(row) && (
              <span className="cc-applied" data-testid={`applied-${row.id}`}>
                davon {eur(applied(row))}
              </span>
            )}
          </span>
        </label>
      ))}
      <div className="cc-row cc-selected">
        <span className="cc-label">Ausgewählt (von {eur(receivedCents)} erhalten)</span>
        <span className="cc-amount" data-testid="checklist-selected">
          {eur(selectedCents)}
        </span>
      </div>
      <div className="cc-rest" role="status" aria-live="polite">
        <span>Rest</span>
        <span className="cc-amount" data-testid="checklist-rest">
          {eur(rest)}
        </span>
      </div>
      {ownBookingId && rest > 0 && (
        <p className="cc-hint" role="alert">
          Die Auswahl muss den ganzen Betrag decken. Wähle weitere Zeilen oder erfasse die Zahlung
          neu.
        </p>
      )}
      {!ownBookingId &&
        rest < 0 &&
        choice('Zahlung kleiner als Auswahl', effectiveShortfall, setShortfall, [
          ['open', 'bleibt offen bis nächsten Monat'],
          ...(canWaive ? ([['waive', 'schenken']] as const) : []),
        ] as const)}
      {!ownBookingId &&
        rest < 0 &&
        waivable.map((r) => (
          <label key={r.id} className="cc-row">
            <input
              type="checkbox"
              checked={current.waived.has(r.id)}
              onChange={() => toggleWaive(r.id)}
            />
            <span className="cc-label">
              {`Rest ${eur(r.amountCents - paidCash(r.id))} vom ${day(outlays.find((o) => o.splitId === r.id)?.date ?? date)}: als Geschenk übernehmen, sonst bleibt er offen`}
            </span>
          </label>
        ))}
      {!ownBookingId &&
        rest > 0 &&
        choice('Zahlung größer als Auswahl', surplus, setSurplus, [
          ['credit', 'als Guthaben für nächsten Monat stehen lassen'],
          ['gift', 'als Geschenk an mich buchen'],
        ] as const)}
    </fieldset>
  ) : null;
  return {
    active,
    view,
    loading: live && query.isPending,
    /** Re-split: the ticked contributions, only valid when they cover the whole amount. */
    resplit: { occurrenceIds, restCents: rest, valid: active && rest <= 0 },
    /** Request body for the server; `null` while the list is not shown. */
    payload: (base: {
      accountId: string;
      date: string;
      amountCents: number;
      memo?: string | null;
    }): ChecklistReceiptBody | null =>
      active
        ? {
            ...base,
            outlaySplitIds: outlayIds,
            occurrenceIds,
            creditReceiptSplitIds: creditIds,
            shortfall: effectiveShortfall,
            ...(waiveIds.length ? { waiveOutlaySplitIds: waiveIds } : {}),
            surplus,
          }
        : null,
  };
}

/**
 * "Neu aufteilen" (#1336): an existing inflow of a contact is re-split over the contact's due
 * contributions. Amount, account and date stay; the server refuses locked or settled bookings with
 * the ordinary edit rules and one Undo restores the old splits and links.
 */
export function ContactResplit({
  bookingId,
  contactId,
  date,
  amountCents,
  onDone,
}: {
  bookingId: string;
  contactId: string;
  date: string;
  amountCents: number;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const writes = useLedgerWrites();
  const checklist = useContactChecklist({
    contactId,
    date,
    receivedCents: amountCents,
    enabled: open,
    ownBookingId: bookingId,
  });
  if (!open)
    return (
      <button type="button" className="kbtn" onClick={() => setOpen(true)}>
        Neu aufteilen
      </button>
    );
  return (
    <div className="cc-resplit">
      {checklist.active ? (
        checklist.view
      ) : (
        <p className="cc-hint">
          {checklist.loading ? 'Lädt …' : 'Keine offenen Beiträge dieses Kontakts.'}
        </p>
      )}
      {error && (
        <p className="cc-hint" role="alert">
          {error}
        </p>
      )}
      <div className="cc-actions">
        <button type="button" className="kbtn" onClick={() => setOpen(false)}>
          Abbrechen
        </button>
        <button
          type="button"
          className="kbtn is-primary"
          disabled={!checklist.resplit.valid || writes.resplit.isPending}
          onClick={() => {
            setError(undefined);
            writes.resplit
              .mutateAsync({ contactId, bookingId, occurrenceIds: checklist.resplit.occurrenceIds })
              .then(onDone, (e: unknown) =>
                setError(
                  e instanceof Error ? e.message : 'Die Aufteilung wurde nicht gespeichert.',
                ),
              );
          }}
        >
          Neu aufteilen speichern
        </button>
      </div>
    </div>
  );
}
