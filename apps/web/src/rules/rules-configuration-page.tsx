import { SectionHead, Switch, maskMoneyText, useAmountPrivacy } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useState } from 'react';
import { ErrorNote, LoadingNote } from '../ledger/states';
import { PageFrame } from '../pages/placeholder-page';
import { AppLink } from '../shell/app-link';
import { RELOCATED_PAGES, SETTINGS_DESTINATIONS } from '../settings/navigation';
import { BookInputForm } from './book-input-form';
import { patchRule } from './api';
import { RulePanel } from './rule-panel';
import { RULE_FIELDS, thresholdText } from './rules-model';
import { rulesQuery, useRuleWrite } from './use-rule-writes';

/** Configuration reads existing rules; opening settings never evaluates or writes them. */
export function RulesConfigurationPage() {
  useAmountPrivacy();
  const query = useQuery(rulesQuery());
  const write = useRuleWrite();
  const [pending, setPending] = useState<string>();
  const change = async (code: string, name: string, enabled: boolean) => {
    if (pending) return;
    setPending(code);
    try {
      await write(() => patchRule(code, { enabled }), () => `${name}: ${enabled ? 'aktiviert' : 'ausgeschaltet'}.`);
    } finally { setPending(undefined); }
  };
  return <PageFrame meta={RELOCATED_PAGES.rules}>
    <div className="kview rw">
      <nav aria-label="Regeln und Automatik"><AppLink to="/einstellungen/regeln-automatik">Zur Übersicht</AppLink></nav>
      <p>Hier stellst du Schwellen und Aktivierung ein. Die Ergebnisse zeigt der <AppLink to={SETTINGS_DESTINATIONS.check}>Finanz-Check</AppLink>.</p>
      {query.isPending && <LoadingNote what="Regeln" />}
      {query.isError && <ErrorNote what="Regeln" error={query.error} onRetry={() => void query.refetch()} />}
      {query.data && <>
        <section className="rw-sec" aria-labelledby="configuration-rules-title">
          <SectionHead id="configuration-rules-title" title="Regeln" />
          <ul className="rw-list rw-rules">
            {query.data.rules.map((rule) => <li key={rule.code}>
              <div className="rw-rule-copy"><strong>{maskMoneyText(rule.name)} <small>{rule.code}</small></strong><small>Schwelle: {maskMoneyText(thresholdText(rule.code, rule.params))}</small></div>
              <div className="rw-controls">
                {(RULE_FIELDS[rule.code] ?? []).length > 0 && <AppLink className="btn btn-ghost" to={`${SETTINGS_DESTINATIONS.rules}/${rule.code}`}>Schwellen bearbeiten</AppLink>}
                <Switch label={`${maskMoneyText(rule.name)} aktivieren`} checked={rule.enabled} disabled={pending !== undefined} onChange={(enabled) => void change(rule.code, rule.name, enabled)} />
              </div>
            </li>)}
          </ul>
        </section>
        <details className="wealth-details"><summary>Weitere Prüfungen aktivieren</summary>
          <ul className="rw-list">
            {query.data.checklist.map((item) => <li key={item.code}>
              <span><strong>{maskMoneyText(item.name)}</strong><small>{item.code}</small></span>
              <Switch label={`${maskMoneyText(item.name)} aktivieren`} checked={item.enabled} disabled={pending !== undefined} onChange={(enabled) => void change(item.code, item.name, enabled)} />
            </li>)}
          </ul>
        </details>
        <BookInputForm />
      </>}
    </div>
  </PageFrame>;
}

export function RuleConfigurationDetailPage() {
  const { code } = useParams({ strict: false }) as { code: string };
  const query = useQuery(rulesQuery());
  const navigate = useNavigate();
  const rule = query.isSuccess && !query.isError ? query.data.rules.find((entry) => entry.code === code) : undefined;
  return <PageFrame meta={RELOCATED_PAGES.rules}>
    <AppLink to={SETTINGS_DESTINATIONS.rules}>Zurück zu den Regeln</AppLink>
    {query.isPending && <LoadingNote what="Regel" />}
    {query.isError && <ErrorNote what="Regel" error={query.error} onRetry={() => void query.refetch()} />}
    {query.isSuccess && !rule && <p role="status">Diese Regel ist nicht verfügbar.</p>}
    <RulePanel rule={rule ?? null} onClose={() => void navigate({ to: SETTINGS_DESTINATIONS.rules })} />
  </PageFrame>;
}
