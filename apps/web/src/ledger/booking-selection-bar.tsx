import { Button, Select, useAmountPrivacy } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { readBulkSelection, type BulkResult, type BulkSelection } from './api';
import type { BulkSet } from './cache';
import { longDay, nativeCurrency } from './format';
import { FLAG_LABEL, SKIP_REASON_LABEL } from './labels';
import { LEDGER_KEY } from './queries';
import { ErrorNote, LoadingNote } from './states';
import { BOOKING_FLAGS } from './types';
import { MoreHorizontal } from 'lucide-react';

export interface BulkOutcome { action: 'update' | 'delete'; result: BulkResult; submitted?: BulkSelection }
export function BookingSelectionBar({ ids, pending, categories, projects, onApply, onClear, extra, outcome }: {
  ids: string[]; pending: boolean;
  categories: { id: string; name: string }[];
  projects: { id: string; name: string; archivedAt?: string | null }[];
  onApply: (set: BulkSet, facts: BulkSelection) => void;
  onClear: () => void;
  extra: (facts: BulkSelection | undefined) => ReactNode;
  outcome: BulkOutcome | null;
}) {
  useAmountPrivacy();
  const ordered = [...ids].sort(), key = ordered.join('|');
  const query = useQuery({ queryKey: [...LEDGER_KEY, 'bulk-selection', key], enabled: ids.length > 0 && ids.length <= 500,
    queryFn: () => readBulkSelection(ordered),
  });
  const facts = query.data;
  const accounted = facts ? [...facts.items.map((r) => r.id), ...facts.missingIds] : [];
  const complete = !!facts && facts.selectedCount === ids.length && accounted.length === ids.length &&
    new Set(accounted).size === ids.length && accounted.every((id) => ids.includes(id));
  const locked = pending || query.isFetching || !complete || ids.length > 500;
  const bar = useRef<HTMLDivElement>(null), [height, setHeight] = useState(0);
  const visible = ids.length > 0;
  useEffect(() => {
    if (!bar.current || !visible || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => { if (entry) setHeight(Math.ceil(entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height)); });
    observer.observe(bar.current);
    return () => observer.disconnect();
  }, [visible]);
  const apply = (set: BulkSet) => { if (!locked && facts) onApply(set, facts); };
  const result = (outcome && <section className="kbulk-result" aria-label={outcome.action === 'update' ? 'Ergebnis der Sammeländerung' : 'Löschergebnis'}>
      <p role="status">{outcome.result.changed.length} {outcome.action === 'update' ? 'geändert' : 'gelöscht'} · {outcome.result.skipped.length} übersprungen.</p>
      {outcome.result.skipped.length > 0 && <ul>{outcome.result.skipped.map((skip) => {
        const current = skip.booking, row = current ?? outcome.submitted?.items.find((r) => r.id === skip.id);
        return <li key={skip.id}>
          {row ? <><a href={`/konten/buchungen?buchung=${encodeURIComponent(row.id)}&konto=${encodeURIComponent(row.accountId)}`}>{row.description}</a>{!current && ' (Stand bei Auswahl)'} · {longDay(row.date)} · {row.amountCents === null ? 'Betrag nicht verfügbar' : nativeCurrency(row.amountCents, row.currency, true)} · {row.accountName} · </> : 'Buchung nicht mehr verfügbar · '}
          {skip.id}: {SKIP_REASON_LABEL[skip.reason]}
        </li>;
      })}</ul>}
    </section>);
  return <>
    {visible && <>
      <div className="kselection-reserve" style={{ height }} aria-hidden="true" />
      <div ref={bar} className="kbulk kselection-bar" role="group" aria-label="Auswahl bearbeiten" aria-busy={pending || query.isFetching}>
        <div className="kselection-summary">
          <strong>{ids.length} ausgewählt</strong>
          {!complete || !!facts?.missingIds.length ? <span>Summe nicht vollständig verfügbar</span> :
            <span>Summe: {facts!.totals.map((t) => t.cents === null ? `${t.currency}: nicht darstellbar` : nativeCurrency(t.cents, t.currency, true)).join(' · ')}</span>}
          {facts?.missingIds.length ? <span>{facts.missingIds.length} nicht mehr verfügbar: {facts.missingIds.join(', ')}</span> : null}
          <Button variant="ghost" disabled={pending} onClick={onClear}>Auswahl aufheben</Button>
        </div>
        {ids.length > 500 && <p role="alert">Höchstens 500 Buchungen pro Sammeländerung auswählen.</p>}
        {query.isFetching && <LoadingNote what="Ausgewählte Buchungen" />}
        {query.isError && <ErrorNote what="Ausgewählte Buchungen" error={query.error} onRetry={() => void query.refetch()} />}
        <fieldset className="kbulk-controls" disabled={locked}>
          <legend className="sr-only">Sammeländerung</legend>
          <Select className="select-sm" aria-label="Kategorie für die Auswahl setzen" value="" onChange={(e) => {
            if (e.target.value) apply({ categoryId: e.target.value === 'none' ? null : e.target.value });
          }}>
            <option value="">Kategorie setzen …</option><option value="none">ohne Kategorie</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Select className="select-sm" aria-label="Status für die Auswahl setzen" value="" onChange={(e) => {
            if (e.target.value === 'pending' || e.target.value === 'confirmed') apply({ status: e.target.value });
          }}>
            <option value="">Status setzen …</option><option value="pending">Vorgemerkt</option><option value="confirmed">Bestätigt</option>
          </Select>
          <Select className="select-sm" aria-label="Markierung für die Auswahl setzen" value="" onChange={(e) => {
            const value = e.target.value;
            if (value === 'none') apply({ flag: null }); else if (BOOKING_FLAGS.includes(value as typeof BOOKING_FLAGS[number])) apply({ flag: value as typeof BOOKING_FLAGS[number] });
          }}>
            <option value="">Markierung setzen …</option><option value="none">Markierung entfernen</option>
            {BOOKING_FLAGS.map((flag) => <option key={flag} value={flag}>{FLAG_LABEL[flag]}</option>)}
          </Select>
          <Select className="select-sm" aria-label="Projekt für die Auswahl setzen" value="" onChange={(e) => {
            if (e.target.value) apply({ projectId: e.target.value === 'none' ? null : e.target.value });
          }}>
            <option value="">Projekt setzen …</option><option value="none">Projekt entfernen</option>
            {projects.filter((p) => !p.archivedAt).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          <details><summary aria-label="Weitere Aktionen"><MoreHorizontal size={20} strokeWidth={1.5} aria-hidden="true" /></summary><div className="kbulk-controls">{extra(complete ? facts : undefined)}</div></details>
        </fieldset>
        {result}
      </div>
    </>}
    {!visible && result}

  </>;
}
