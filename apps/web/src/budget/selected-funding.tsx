import { Button, FormDialog, maskMoneyText, useAmountPrivacy } from '@budget/ui';
import { todayInVienna } from '@budget/domain';
import { useEffect, useRef, useState } from 'react';
import { ApiError, request } from '../api/http';
import { eur } from '../ledger/format';
import { errorText } from '../ledger/labels';
import { monthLabel } from '../nav/month';
import { useBudgetWrite } from './use-category-writes';

type Mode = 'fund' | 'reset';
type Preview = {
  month: string; mode: Mode; token: string; expiresAt: number; canApply: boolean;
  availableCents: number; deltaCents: number; shortfallCents: number;
  rows: Array<{ categoryId: string; name: string; assignedCents: number; needCents: number;
    proposedCents: number; deltaCents: number; reason: string | null }>;
};
const reasons: Record<string, string> = {
  missing: 'Nicht verfügbar', hidden: 'Ausgeblendet', ineligible: 'Keine zuweisbare Ausgabenkategorie',
  current_month_only: 'Rücksetzen ist nur im aktuellen Monat möglich', no_target: 'Kein Ziel',
  snoozed: 'Ziel diesen Monat ausgesetzt', met: 'Ziel bereits finanziert', unchanged: 'Bereits auf 0',
};

/** The parent keys this component by the exact captured month/selection; no preview survives a scope change. */
export function SelectedFunding({ month, categoryIds }: { month: string; categoryIds: string[] }) {
  useAmountPrivacy();
  const [mode, setMode] = useState<Mode | null>(null);
  const [preview, setPreview] = useState<Preview>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const write = useBudgetWrite();
  useEffect(() => () => controller.current?.abort(), []);
  const close = () => { controller.current?.abort(); setMode(null); setPreview(undefined); setError(''); };
  const load = async (next: Mode) => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setMode(next); setPreview(undefined); setError('');
    try {
      // Read-only POST: keep this transient preview outside financial write notifications/caches.
      const response = await fetch(`/api/budget/${month}/funding-preview`, {
        method: 'POST', credentials: 'same-origin', cache: 'no-store', signal: current.signal,
        headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: next, categoryIds }),
      });
      const payload = await response.json() as Preview & { error?: string; message?: string };
      if (!response.ok) throw new ApiError(response.status, payload.error ?? 'unknown', payload.message);
      if (!current.signal.aborted) setPreview(payload);
    } catch (error) { if (!current.signal.aborted) setError(errorText(error)); }
  };
  const apply = async () => {
    if (busy || !preview?.canApply) return;
    setBusy(true);
    try {
      if (await write(() => request<{ groupId: string }>('POST', `/api/budget/${month}/funding-apply`, {
        token: preview.token,
      }), () => mode === 'fund' ? 'Ausgewählte Ziele finanziert.' : 'Ausgewählte Zuweisungen auf 0 gesetzt.')) close();
      else { setPreview(undefined); setError('Vorschau bitte neu laden. Änderungen wurden nicht übernommen.'); }
    } finally { setBusy(false); }
  };
  const disabled = !categoryIds.length || categoryIds.length > 100;
  return <section className="selected-funding" aria-label="Ausgewählte Zuweisungen prüfen">
    <div className="panel-actions">
      <Button variant="ghost" disabled={disabled} onClick={() => void load('fund')}>Ausgewählte Ziele finanzieren</Button>
      <Button variant="ghost" disabled={disabled || month !== todayInVienna().slice(0, 7)}
        onClick={() => void load('reset')}>Ausgewählte Zuweisungen auf 0 setzen</Button>
    </div>
    {categoryIds.length > 100 && <p className="panel-sub">Bitte höchstens 100 Kategorien auswählen.</p>}
    {mode && <FormDialog open title="Zuweisungsvorschau" onClose={close} beforeClose={() => !busy}>
      <div className="kform selected-funding-preview">
        <p>{monthLabel(month)} · Finanzierung in der bestehenden Reihenfolge der neun Wasserfall-Stufen.</p>
        {!preview && !error && <p role="status">Vorschau wird geladen …</p>}
        {error && <p role="alert">{maskMoneyText(error)}</p>}
        {preview && <>
          <p>Zu verteilen: <span className="insp-amount">{eur(preview.availableCents)}</span> · Änderung: <span className="insp-amount">{eur(preview.deltaCents, { sign: true })}</span></p>
          <div className="selected-funding-scroll" tabIndex={0} role="region" aria-label="Vorgeschlagene Zuweisungen">
            <table>
              <thead><tr><th>Kategorie</th><th>Zugewiesen</th><th>Bedarf</th><th>Vorschlag</th><th>Änderung / Hinweis</th></tr></thead>
              <tbody>{preview.rows.map((row) => <tr key={row.categoryId}>
                <th scope="row">{maskMoneyText(row.name)}</th><td>{eur(row.assignedCents)}</td><td>{eur(row.needCents)}</td>
                <td>{eur(row.proposedCents)}</td><td>{row.reason ? reasons[row.reason] ?? 'Ausgeschlossen' : eur(row.deltaCents, { sign: true })}</td>
              </tr>)}</tbody>
            </table>
          </div>
          {preview.shortfallCents > 0 && <p>Auf verfügbares Geld begrenzt; <span className="insp-amount">{eur(preview.shortfallCents)}</span> fehlen.
            {mode === 'reset' && ' Die genaue Rücksetzung bleibt gesperrt; es wird keine teilweise Rücksetzung gebucht.'}</p>}
          {!preview.canApply && preview.shortfallCents === 0 && <p>Keine Zuweisung erforderlich.</p>}
          <p className="panel-sub">Die Vorschau gilt kurzzeitig für diese Auswahl. Änderungen erfordern eine neue Vorschau; Übernehmen und Rücknahme bleiben eine Gruppe.</p>
        </>}
        <div className="panel-actions">
          <Button disabled={busy || !preview?.canApply} onClick={() => void apply()}>Übernehmen</Button>
          <Button variant="ghost" disabled={busy} onClick={() => void load(mode)}>Vorschau neu laden</Button>
          <Button variant="ghost" disabled={busy} onClick={close}>Abbrechen</Button>
        </div>
      </div>
    </FormDialog>}
  </section>;
}
