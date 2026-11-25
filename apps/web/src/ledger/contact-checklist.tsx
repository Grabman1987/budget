import { useId, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { applyChecklistCredits, planContactChecklist } from '@budget/domain';
import type { listContactChecklist } from '@budget/db';
import { request } from '../api/http';
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
  shortfall: 'open' | 'waive';
  surplus: 'credit' | 'gift';
}

/** Open items of a contact for the payment date (#1322). Keyed under the ledger family. */
const checklistQuery = (contactId: string, date: string) => ({
  queryKey: ['ledger', 'contact-checklist', contactId, date],
  retry: false,
  queryFn: () =>
    request<Checklist>(
      'GET',
      `/api/contacts/${encodeURIComponent(contactId)}/checklist?asOf=${encodeURIComponent(date)}`,
    ),
});

const day = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;

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
}: {
  contactId: string;
  date: string;
  receivedCents: number;
  enabled: boolean;
}) {
  const live = enabled && contactId !== '' && date !== '' && receivedCents > 0;
  const query = useQuery({ ...checklistQuery(contactId, date), enabled: live });
  // The selection belongs to one contact: another contact starts from the defaults again.
  const [state, setState] = useState({
    contactId,
    unticked: new Set<string>() as ReadonlySet<string>,
    /** v1: one contribution per receipt. `undefined` = the first one, `null` = none. */
    contribution: undefined as string | null | undefined,
    shortfall: 'open' as 'open' | 'waive',
    surplus: 'credit' as 'credit' | 'gift',
  });
  const current =
    state.contactId === contactId
      ? state
      : {
          contactId,
          unticked: new Set<string>(),
          contribution: undefined,
          shortfall: 'open' as const,
          surplus: 'credit' as const,
        };
  const { unticked, shortfall, surplus } = current;
  const setShortfall = (value: 'open' | 'waive') => setState({ ...current, shortfall: value });
  const setSurplus = (value: 'credit' | 'gift') => setState({ ...current, surplus: value });
  const data = live ? query.data : undefined;
  const contributions = useMemo(() => data?.contributions ?? [], [data]);
  const outlays = useMemo(() => data?.outlays ?? [], [data]);
  const credits = useMemo(() => data?.credits ?? [], [data]);
  const picked =
    current.contribution === undefined
      ? contributions.find((c) => c.selectable)?.occurrenceId
      : current.contribution;
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
      ? row.id === picked
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
  const active = rows.length > 0;
  const outlayIds = ticked.filter((r) => r.kind === 'outlay').map((r) => r.id);
  const creditIds = ticked.filter((r) => r.kind === 'credit').map((r) => r.id);
  const occurrenceIds = ticked.filter((r) => r.kind === 'contribution').map((r) => r.id);
  const heading = useId();
  const toggle = (row: (typeof rows)[number]) => {
    if (row.kind === 'contribution')
      return setState({ ...current, contribution: row.id === picked ? null : row.id });
    const next = new Set(unticked);
    if (!next.delete(row.key)) next.add(row.key);
    setState({ ...current, unticked: next });
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
      <div className="cc-rest" role="status" aria-live="polite">
        <span>Rest</span>
        <span className="cc-amount" data-testid="checklist-rest">
          {eur(rest)}
        </span>
      </div>
      {rest < 0 &&
        choice('Zahlung kleiner als Auswahl', effectiveShortfall, setShortfall, [
          ['open', 'bleibt offen bis nächsten Monat'],
          ...(canWaive ? ([['waive', 'schenken']] as const) : []),
        ] as const)}
      {rest > 0 &&
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
            surplus,
          }
        : null,
  };
}
