import { useQuery } from '@tanstack/react-query';
import { formatPercent } from '@budget/domain';
import { rulesQuery } from './use-rule-writes';
import { longDay } from '../ledger/format';
import { AppLink } from '../shell/app-link';

/** Current rolling-year check beside the related report; disabled rules remain previewable. */
export function BookRuleMetric({ code }: { code: 'R17' | 'R19' | 'R21' | 'R22' }) {
  const query = useQuery(rulesQuery());
  const rule = query.data?.rules.find((r) => r.code === code);
  return (
    <p className="vnote" role="status">
      <AppLink to="/einstellungen/regelwerk">
        {code} {rule?.name ?? 'Finanz-Check'}
      </AppLink>
      {' · '}
      {rule?.latest?.valueText ??
        rule?.unavailableReason ??
        (query.isError ? 'nicht verfügbar' : 'wird geladen')}
      {rule?.latest && <> · Stand {longDay(rule.latest.asOf)}</>}
      {rule && !rule.enabled && ' · Vorschau, Regel ausgeschaltet'}
      {code === 'R21' && rule?.latest && (
        <>
          {' '}
          · Netto-Hebel-Exposure{' '}
          {typeof rule.latest.detail?.['exposureBp'] === 'number'
            ? formatPercent(rule.latest.detail['exposureBp'])
            : 'nicht bewertbar'}
        </>
      )}
    </p>
  );
}
