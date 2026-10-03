import {
  cents,
  formatDecimal,
  parseAmount,
  payslipInput,
  payrollTotals,
  type CapturedPayslip,
  type PayslipInput,
} from '@budget/domain';
import { AmountInput, Button, DetailPanel, DimensionChain } from '@budget/ui';
import { useBlocker } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { request } from '../api/http';
import { useBudgetWrite } from '../budget/use-category-writes';
import { eur } from '../ledger/format';
import type { PayrollData } from './payroll-projects-api';

export function PayslipPanel({
  initial,
  month,
  candidates,
  onClose,
}: {
  initial?: CapturedPayslip;
  month: string;
  candidates: PayrollData['candidates'];
  onClose: () => void;
}) {
  const original: PayslipInput = initial ?? {
    month,
    kind: 'regular' as const,
    specialType: null,
    grossCents: 0,
    svCents: 0,
    taxCents: 0,
    netCents: 0,
    bookingId: null,
    receiptId: null,
    lines: [],
  };
  const [header, setHeader] = useState<PayslipInput>(original);
  const [amounts, setAmounts] = useState({
    grossCents: formatDecimal(cents(original.grossCents)),
    svCents: formatDecimal(cents(original.svCents)),
    taxCents: formatDecimal(cents(original.taxCents)),
    netCents: formatDecimal(cents(original.netCents)),
  });
  const [lines, setLines] = useState(
    original.lines.map((l) => ({ ...l, amount: formatDecimal(cents(l.amountCents)) })),
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const dirty = useRef(false),
    saving = useRef(false);
  const write = useBudgetWrite();
  const blocker = useBlocker({
    shouldBlockFn: () => dirty.current || saving.current,
    withResolver: true,
    enableBeforeUnload: () => dirty.current || saving.current,
  });
  useEffect(() => {
    if (blocker.status !== 'blocked') return;
    if (!saving.current && window.confirm('Ungespeicherte Änderungen verwerfen?'))
      blocker.proceed();
    else blocker.reset();
  }, [blocker]);
  const close = () =>
    !saving.current && (!dirty.current || window.confirm('Ungespeicherte Änderungen verwerfen?'));
  const parsed = Object.fromEntries(
    Object.entries(amounts).map(([key, value]) => {
      const p = parseAmount(value);
      return [key, p.ok ? p.cents : null];
    }),
  );
  const draft = {
    ...header,
    ...parsed,
    lines: lines.map((l) => {
      const p = parseAmount(l.amount);
      return { section: l.section, label: l.label, amountCents: p.ok ? p.cents : null };
    }),
  };
  const valid = payslipInput.safeParse(draft);
  const control = payrollTotals([
    {
      ...original,
      ...draft,
      grossCents: parsed['grossCents'] ?? 0,
      svCents: parsed['svCents'] ?? 0,
      taxCents: parsed['taxCents'] ?? 0,
      netCents: parsed['netCents'] ?? 0,
      lines: draft.lines.map((l) => ({ ...l, amountCents: l.amountCents ?? 0 })),
    } as PayslipInput,
  ]);
  const save = async () => {
    if (!valid.success) {
      setError(
        valid.error.issues.find((issue) => issue.code === 'custom')?.message ??
          'Bitte gültige Beträge, Monat und Bezeichnungen eingeben. Aufrollungen mit Vorzeichen erfassen.',
      );
      return;
    }
    saving.current = true;
    setBusy(true);
    setError('');
    const result = await write(
      () =>
        request<{ groupId: string }>(
          initial ? 'PUT' : 'POST',
          initial ? `/api/payslips/${encodeURIComponent(initial.id)}` : '/api/payslips',
          valid.data,
        ),
      () => 'Gehaltszettel gespeichert.',
    );
    saving.current = false;
    setBusy(false);
    if (result) {
      dirty.current = false;
      onClose();
    }
  };
  const remove = async () => {
    if (!initial || !window.confirm('Gehaltszettel entfernen? Die Buchung bleibt bestehen.'))
      return;
    saving.current = true;
    setBusy(true);
    const result = await write(
      () =>
        request<{ groupId: string }>('DELETE', `/api/payslips/${encodeURIComponent(initial.id)}`),
      () => 'Gehaltszettel entfernt.',
    );
    saving.current = false;
    setBusy(false);
    if (result) {
      dirty.current = false;
      onClose();
    }
  };
  return (
    <DetailPanel
      open
      onClose={onClose}
      beforeClose={close}
      title={initial ? 'Gehaltszettel bearbeiten' : 'Gehaltszettel hinzufügen'}
    >
      <form
        className="pp-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        onChange={() => {
          dirty.current = true;
        }}
      >
        <fieldset disabled={busy}>
          <legend>1 Bezüge</legend>
          <label>
            Monat
            <input
              type="month"
              required
              value={header.month}
              onChange={(e) => setHeader({ ...header, month: e.target.value })}
            />
          </label>
          <label>
            Art
            <select
              value={header.kind === 'regular' ? 'regular' : (header.specialType ?? 'other')}
              onChange={(e) =>
                setHeader({
                  ...header,
                  kind: e.target.value === 'regular' ? 'regular' : 'special',
                  specialType:
                    e.target.value === 'regular'
                      ? null
                      : (e.target.value as 'salary13' | 'salary14' | 'other'),
                })
              }
            >
              <option value="regular">Laufendes Gehalt</option>
              <option value="salary13">13. Gehalt</option>
              <option value="salary14">14. Gehalt</option>
              <option value="other">Sonstige Sonderzahlung</option>
            </select>
          </label>
          <AmountInput
            label="Brutto ohne zusätzliche Bezüge"
            value={amounts.grossCents}
            onChange={(v) => {
              dirty.current = true;
              setAmounts({ ...amounts, grossCents: v });
            }}
          />
          <p className="vnote">
            Zusätzliche Bezüge und steuerfreie Erstattungen unten getrennt ergänzen. Telearbeit,
            Fahrgeld und Reisespesen sind Erstattungen. Steuer auf Fahrgeld bleibt in der
            Lohnsteuer.
          </p>
        </fieldset>
        <fieldset disabled={busy}>
          <legend>2 Abzüge</legend>
          <AmountInput
            label="SV-DN"
            value={amounts.svCents}
            onChange={(v) => {
              dirty.current = true;
              setAmounts({ ...amounts, svCents: v });
            }}
          />
          <AmountInput
            label="Lohnsteuer"
            value={amounts.taxCents}
            onChange={(v) => {
              dirty.current = true;
              setAmounts({ ...amounts, taxCents: v });
            }}
          />
          <p className="vnote">
            SV und Lohnsteuer laut Zettel erfassen. Erstattungen aus Aufrollungen mit negativem
            Vorzeichen eingeben; Nachzahlungen mit positivem Vorzeichen.
          </p>
          {lines.map((l, i) => (
            <div className="pp-line" key={i}>
              <label>
                Bezeichnung {i + 1}
                <input
                  value={l.label}
                  maxLength={160}
                  onChange={(e) =>
                    setLines(lines.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
                  }
                />
              </label>
              <label>
                Zeilentyp {i + 1}
                <select
                  value={l.section}
                  onChange={(e) =>
                    setLines(
                      lines.map((x, j) =>
                        j === i
                          ? {
                              ...x,
                              section: e.target.value as PayslipInput['lines'][number]['section'],
                            }
                          : x,
                      ),
                    )
                  }
                >
                  <option value="earning">Zusätzlicher Bezug</option>
                  <option value="deduction">Sonstiger Abzug</option>
                  <option value="reimbursement">Steuerfreie Erstattung</option>
                  <option value="tax_adjustment">Lohnsteuer-Aufrollung (mit Vorzeichen)</option>
                  <option value="sv_adjustment">SV-Aufrollung (mit Vorzeichen)</option>
                </select>
              </label>
              <AmountInput
                label={`Betrag Zeile ${i + 1}`}
                value={l.amount}
                onChange={(v) => {
                  dirty.current = true;
                  setLines(lines.map((x, j) => (j === i ? { ...x, amount: v } : x)));
                }}
              />
              <Button
                variant="ghost"
                onClick={() => {
                  dirty.current = true;
                  setLines(lines.filter((_x, j) => j !== i));
                }}
              >
                Zeile {i + 1} entfernen
              </Button>
            </div>
          ))}
          <Button
            variant="ghost"
            disabled={lines.length >= 40}
            onClick={() => {
              dirty.current = true;
              setLines([
                ...lines,
                { label: '', section: 'deduction', amountCents: 0, amount: '0,00' },
              ]);
            }}
          >
            Zeile hinzufügen
          </Button>
        </fieldset>
        <fieldset disabled={busy}>
          <legend>3 Kontrolle</legend>
          <AmountInput
            label="Auszahlung laut Zettel"
            value={amounts.netCents}
            onChange={(v) => {
              dirty.current = true;
              setAmounts({ ...amounts, netCents: v });
            }}
          />
          <DimensionChain
            precision="cent"
            label="Kontrolle Gehaltszettel"
            terms={[
              { label: 'Brutto inkl. Zusätze', value: cents(control.grossCents) },
              { op: '-', label: 'Abzüge', value: cents(control.deductionsCents) },
              {
                op: '+',
                label: 'Steuerfreie Erstattungen',
                value: cents(control.reimbursementsCents),
              },
              {
                op: '=',
                label: 'Rechnerische Auszahlung',
                value: cents(control.calculatedNetCents),
                result: true,
              },
            ]}
          />
          <p role="status">
            Differenz zur erfassten Auszahlung: {eur(control.calculatedNetCents - control.netCents)}
          </p>
          <label>
            Gehaltsbuchung
            <select
              value={header.bookingId ?? ''}
              onChange={(e) => setHeader({ ...header, bookingId: e.target.value || null })}
            >
              <option value="">Später verknüpfen</option>
              {candidates.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.date} · {eur(b.amountCents)} · {b.id.slice(0, 8)}
                </option>
              ))}
              {header.bookingId && !candidates.some((b) => b.id === header.bookingId) && (
                <option value={header.bookingId}>Bisherige Verknüpfung nicht verfügbar</option>
              )}
            </select>
          </label>
          <p className="vnote">
            Eine kombinierte Auszahlung kann mit mehreren Zetteln verknüpft sein. Die Auswahl zeigt
            den Gehaltsanteil ohne steuerfreie Erstattungen. Belegablage folgt später.
          </p>
        </fieldset>
        {error && (
          <p className="pp-warning" role="alert">
            {error}
          </p>
        )}
        <div className="panel-actions">
          <Button type="submit" disabled={busy}>
            {busy ? 'Wird gespeichert …' : 'Speichern'}
          </Button>
          {initial && (
            <Button variant="ghost" disabled={busy} onClick={() => void remove()}>
              Entfernen
            </Button>
          )}
        </div>
      </form>
    </DetailPanel>
  );
}
