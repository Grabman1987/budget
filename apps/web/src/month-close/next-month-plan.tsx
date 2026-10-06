import { useState } from 'react';
import { Button, ClassSwatch, CLASS_LABEL, TextInput } from '@budget/ui';
import { addMonths, cents, closePlanProjection, formatDecimal, parseAmount } from '@budget/domain';
import { planRows } from '../budget/plan-model';
import { eur, longDay } from '../ledger/format';
import { monthLabel } from '../nav/month';
import { AllocationBar } from '../reports/allocation-bar';
import { AppLink } from '../shell/app-link';
import type { NextClosePlan } from './api';

export function NextMonthPlan({
  data,
  onApply,
  onDirtyChange,
}: {
  data: NextClosePlan;
  onApply: (items: Array<{ categoryId: string; assignedCents: number }>) => Promise<boolean>;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const previous = addMonths(data.month, -1);
  const rows = planRows(data.budget);
  const history = new Map(data.history.map((h) => [h.categoryId, h]));
  const parsed = Object.entries(draft).map(([categoryId, text]) => ({
    categoryId,
    value: parseAmount(text),
    text,
  }));
  const invalidInput = parsed.some(
    ({ categoryId, value, text }) =>
      text.trim() === '' ||
      !value.ok ||
      value.cents < Math.min(0, rows.find((r) => r.id === categoryId)?.assignedCents ?? 0),
  );
  const values = Object.fromEntries(
    parsed.flatMap(({ categoryId, value }) => (value.ok ? [[categoryId, value.cents]] : [])),
  );
  const items = rows.flatMap((r) =>
    values[r.id] !== undefined && values[r.id] !== r.assignedCents
      ? [{ categoryId: r.id, assignedCents: values[r.id]! }]
      : [],
  );
  const income = data.budget.incomeTargets;
  const projected = (() => {
    try {
      return closePlanProjection(
        data.budget.summary.toBeAssignedCents,
        income?.expectedCents ?? 0,
        rows.map((r) => ({ categoryId: r.id, class: r.cls, assignedCents: r.assignedCents })),
        values,
      );
    } catch (error) {
      if (error instanceof RangeError) return null;
      throw error;
    }
  })();
  const invalid = invalidInput || projected === null;
  const update = (changes: Record<string, string>) => {
    setDraft((old) => ({ ...old, ...changes }));
    onDirtyChange?.(true);
  };
  const suggest = (ids: string[], mode: 'previous' | 'average') =>
    update(
      Object.fromEntries(
        ids.flatMap((id) => {
          const value =
            mode === 'previous' ? (data.previousAssigned[id] ?? 0) : history.get(id)?.averageCents;
          return value == null ? [] : [[id, formatDecimal(cents(Math.max(0, value)))]];
        }),
      ),
    );
  const selection = (ids: string[]) => items.filter((item) => ids.includes(item.categoryId));
  const funded = (ids: string[]) =>
    BigInt(data.budget.summary.toBeAssignedCents) -
      selection(ids).reduce(
        (sum, item) =>
          sum +
          BigInt(item.assignedCents) -
          BigInt(rows.find((r) => r.id === item.categoryId)!.assignedCents),
        0n,
      ) >=
    0n;
  const apply = async (ids: string[]) => {
    const selected = selection(ids);
    if (invalid || !funded(ids) || busy || !selected.length) return;
    setBusy(true);
    if (await onApply(selected)) {
      const remaining = Object.fromEntries(
        Object.entries(draft).filter(([id]) => !ids.includes(id)),
      );
      setDraft(remaining);
      onDirtyChange?.(Object.keys(remaining).length > 0);
    }
    setBusy(false);
  };
  const actions = (ids: string[], all = false) => (
    <div className="close-actions">
      <Button variant="ghost" disabled={busy} onClick={() => suggest(ids, 'previous')}>
        wie Vormonat{all ? ' · alle' : ''}
      </Button>
      <Button
        variant="ghost"
        disabled={busy || !ids.some((id) => history.get(id)?.averageCents != null)}
        onClick={() => suggest(ids, 'average')}
      >
        Durchschnitt{all ? ' · alle' : ''}
      </Button>
      <Button
        disabled={busy || invalid || !funded(ids) || selection(ids).length === 0}
        onClick={() => void apply(ids)}
      >
        Plan übernehmen{all ? ' · alle' : ''}
      </Button>
    </div>
  );
  return (
    <>
      <p>
        Plane {monthLabel(data.month)}. Vorschläge ändern zuerst den Entwurf. „Plan übernehmen“
        speichert die jeweilige Gruppe, „alle“ den ganzen Entwurf. Eine Rücknahme nimmt alle
        Übernahmen dieses Schritts gemeinsam zurück.
      </p>
      <p>
        Erwartete Einnahmen:{' '}
        <AppLink to="/reports/vorschau">
          {income?.expectedCents == null ? 'noch nicht bekannt' : eur(income.expectedCents)}
        </AppLink>
        {income?.source === 'median' ? ' · Schätzung aus drei abgeschlossenen Monaten' : ''}.
        Gehaltstag nach Regel: {longDay(data.payday)} (15. oder letzter Banktag davor). Die
        gespeicherten Zahlungstermine bleiben sichtbar.
      </p>
      <p>
        Erwartete Einnahmen sind eine Vorschau. Verteilt wird vorhandenes Geld; jede Zahlung
        bestätigst du selbst.
      </p>
      <p
        role="status"
        data-testid="close-plan-remaining"
        className={projected && projected.remainingCents < 0 ? 'is-urgent' : ''}
      >
        Noch zu verteilen:{' '}
        {projected ? (
          <AppLink to="/reports/gesamttabelle" search={{ monat: data.month }}>
            {eur(projected.remainingCents)}
          </AppLink>
        ) : (
          'nicht berechenbar'
        )}{' '}
        · Ziel 0,00 €
      </p>
      {invalidInput && (
        <p role="alert">Bitte gültige Beträge eingeben. Neue Pläne dürfen nicht negativ sein.</p>
      )}
      {!projected && <p role="alert">Der Entwurf ist zu groß. Bitte kleinere Beträge eingeben.</p>}
      {projected && projected.remainingCents < 0 && (
        <p>Der Entwurf verteilt mehr Geld, als vorhanden ist. Nimm Zuweisungen zurück.</p>
      )}
      <h3>Bedarf, Wunsch und Zukunft</h3>
      {projected && (
        <>
          <AllocationBar
            data={projected.allocation}
            label="Plan im Verhältnis zum erwarteten Einkommen, Soll 50/30/20"
          />
          <ul className="close-class-totals">
            {(['need', 'want', 'future'] as const).map((cls, i) => (
              <li key={cls}>
                <ClassSwatch kind={cls} />
                {CLASS_LABEL[cls]}:{' '}
                <AppLink to="/reports/budgettreue" search={{ monat: data.month }}>
                  {eur(projected.allocation[`${cls}Cents`])}
                </AppLink>{' '}
                · {income?.expectedCents ? `${projected.allocation.shares[cls]} %` : '–'} · Soll{' '}
                {[50, 30, 20][i]} %
              </li>
            ))}
          </ul>
        </>
      )}
      <p>
        Monatliche Zuweisungen im Verhältnis zum erwarteten Einkommen. Rücklagen für periodische
        Kosten werden hier monatlich geplant. Karten- und Auslagenkategorien zählen nicht zu den
        drei Klassen.
      </p>
      <h3>Wiederkehrende Zahlungen im nächsten Monat</h3>
      <ul className="close-payments">
        {data.payments.map((p) => (
          <li key={`${p.paymentId}:${p.dueDate}`}>
            {longDay(p.dueDate)} · {p.name} ·{' '}
            <AppLink to="/reports/vorschau">{eur(p.amountCents, { sign: true })}</AppLink>
            {p.status === 'missed'
              ? ' · ausgelassen'
              : p.status === 'received'
                ? ' · eingegangen'
                : ''}
          </li>
        ))}
        {!data.payments.length && <li>Keine wiederkehrenden Zahlungen hinterlegt.</li>}
      </ul>
      <h3>Plan je Kategorie</h3>
      <p>
        „wie Vormonat“ übernimmt den bisherigen Plan. Der Durchschnitt verwendet bis zu zwölf
        abgeschlossene Monate; Monate ohne Ausgaben zählen mit. Fehlende Geschichte bleibt offen.
      </p>
      {actions(
        rows.map((r) => r.id),
        true,
      )}
      {data.budget.groups.map((g) => {
        const groupRows = rows.filter((r) => r.groupId === g.id);
        return groupRows.length ? (
          <section key={g.id} aria-label={g.name} className="close-row">
            <h3>{g.name}</h3>
            {actions(groupRows.map((r) => r.id))}
            <table className="close-plan-table">
              <thead>
                <tr>
                  <th scope="col">Kategorie</th>
                  <th scope="col">Plan Vormonat</th>
                  <th scope="col">Ist Vormonat</th>
                  <th scope="col">Ø 12 Monate</th>
                  <th scope="col">Nächster Plan</th>
                </tr>
              </thead>
              <tbody>
                {groupRows.map((r) => {
                  const h = history.get(r.id);
                  const amountLink = (value: number | null | undefined) => (
                    <AppLink to="/reports/kategorien" search={{ monat: previous, kategorie: r.id }}>
                      {value == null ? '–' : eur(value)}
                    </AppLink>
                  );
                  return (
                    <tr key={r.id}>
                      <th scope="row">
                        {r.cls && <ClassSwatch kind={r.cls} />}
                        {r.name}
                      </th>
                      <td data-label="Plan Vormonat">
                        {amountLink(data.previousAssigned[r.id] ?? 0)}
                      </td>
                      <td data-label="Ist Vormonat">{amountLink(h?.actualCents)}</td>
                      <td data-label="Ø 12 Monate">
                        {amountLink(h?.averageCents)}
                        <small>{h?.historyCount ?? 0} Monate</small>
                      </td>
                      <td data-label="Nächster Plan">
                        <TextInput
                          aria-label={`Plan für ${r.name}`}
                          inputMode="decimal"
                          value={draft[r.id] ?? formatDecimal(cents(r.assignedCents))}
                          disabled={busy}
                          onChange={(e) => update({ [r.id]: e.target.value })}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        ) : null;
      })}
      {Object.keys(draft).length > 0 && (
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => {
            setDraft({});
            onDirtyChange?.(false);
          }}
        >
          Entwurf verwerfen
        </Button>
      )}
      {!rows.length && <p>Lege zuerst Kategorien im Plan an.</p>}
    </>
  );
}
