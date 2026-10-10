import { StatusMark, type RuleStatus, maskMoneyText, useAmountPrivacy } from '@budget/ui';
import { formatPercent } from '@budget/domain';
import { longDay, eur } from '../ledger/format';
import type { RuleRow, RuleStatusCode } from './api';
import { RULE_FIELDS, thresholdText } from './rules-model';
const STATUS: Record<RuleStatusCode, RuleStatus> = { ok: 'met', warn: 'warning', bad: 'violated' };
export function RuleStatusContent({ rule }: { rule: RuleRow }) {
  useAmountPrivacy();
  const { latest } = rule;
  return (
    <>
      <section className="rw-now" aria-label="Aktueller Stand">
        {latest ? (
          <>
            <p className="rw-now-line">
              <StatusMark status={STATUS[latest.status]} actionNeeded={latest.actionNeeded} />
              <strong>{maskMoneyText(latest.valueText)}</strong>
            </p>
            <p className="rw-now-sub">
              Stand {longDay(latest.asOf)}
              {!rule.enabled && ' · Regel ist ausgeschaltet'}
            </p>
          </>
        ) : (
          <p className="rw-now-sub">
            {rule.unavailableReason
              ? maskMoneyText(`Nicht bewertbar: ${rule.unavailableReason}`)
              : 'Noch nicht bewertbar: Es fehlen Daten für diese Regel.'}
            {!rule.enabled && ' Die Regel ist ausgeschaltet.'}
          </p>
        )}
        <p className="rw-action">
          <span className="rw-action-k">
            {latest?.actionNeeded ? 'Nächster Schritt' : 'Wenn die Regel anschlägt'}
          </span>
          {(latest?.actionNeeded ? latest.actionText : null) ??
            rule.action ??
            'Keine Aktion hinterlegt.'}
        </p>
        <p className="rw-now-sub">Schwelle: {thresholdText(rule.code, rule.params)}</p>
      </section>
      {rule.code === 'R21' && latest && (
        <p className="rw-now-sub">
          Netto-Hebel-Exposure:{' '}
          {typeof latest.detail?.['exposureBp'] === 'number'
            ? formatPercent(latest.detail['exposureBp'])
            : 'nicht bewertbar'}
          .
        </p>
      )}
      {rule.code === 'R18' && latest?.detail?.['aboveAverage'] === true && (
        <p className="rw-now-sub">Überdurchschnittlich (PAW): konfigurierten Richtwert erreicht.</p>
      )}
      {rule.code === 'R22' && Array.isArray(latest?.detail?.['leveraged']) && (
        <p className="rw-now-sub">
          Hebelfonds separat:{' '}
          {latest.detail['leveraged']
            .map(
              (row: { securityId: string; name?: string; terBp: number; valueCents: number }) =>
                `${row.name ?? row.securityId}: ${eur(row.valueCents)} · TER ${row.terBp === 0 ? 'fehlt' : formatPercent(row.terBp)}`,
            )
            .join('; ') || 'keine'}
          .
        </p>
      )}
      {typeof latest?.detail?.['note'] === 'string' && (
        <p className="rw-now-sub">{maskMoneyText(String(latest.detail['note']))}</p>
      )}
      {Array.isArray(latest?.detail?.['strip']) && (
        <p className="rw-now-sub">
          {(latest.detail['strip'] as { month: string; fulfilled: boolean }[])
            .map((r) => `${r.month} ${r.fulfilled ? '✓' : '–'}`)
            .join(' · ')}
        </p>
      )}
      {(RULE_FIELDS[rule.code] ?? []).length === 0 && (
        <p className="rw-now-sub">Diese Regel hat keine Schwelle: Sie gilt immer.</p>
      )}
    </>
  );
}
