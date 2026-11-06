import { SettingsReadStamp } from '../pages/settings-read-stamp';
import { useState } from 'react';
import { Switch } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { ErrorNote, LoadingNote } from '../ledger/states';
import { AppLink } from '../shell/app-link';
import { patchRule } from './api';
import { rulesQuery, useRuleWrite } from './use-rule-writes';
import { RULE_FIELDS, thresholdText } from './rules-model';

/** Compact settings overview. It uses the same registered rules and audited writer as Finanz-Check. */
export function SettingsRuleList() {
  const query = useQuery(rulesQuery());
  const write = useRuleWrite();
  const [busy, setBusy] = useState(false);
  return (
    <section className="settings-rule-list" aria-labelledby="settings-rule-list-title">
      <div className="settings-primary-head">
        <h2 id="settings-rule-list-title">Regelwerk</h2>
      </div>
      {query.isPending && <LoadingNote what="Regeln" />}
      {query.isError && (
        <ErrorNote what="Regeln" error={query.error} onRetry={() => void query.refetch()} />
      )}
      {query.data && (
        <div className="settings-surface">
          {query.data.rules.map((rule) => (
            <div key={rule.code} className="settings-row" data-settings-rule-code={rule.code}>
              <div>
                <strong>{rule.name}</strong>
                <small>{thresholdText(rule.code, rule.params)}</small>
              </div>
              <div className="settings-row-actions">
                {(RULE_FIELDS[rule.code] ?? []).length > 0 && (
                  <AppLink
                    className="btn btn-ghost"
                    aria-label={`Schwellen bearbeiten ${rule.code} ${rule.name}`}
                    to={`/einstellungen/regelwerk/${rule.code}`}
                    search={(previous) => ({ monat: previous['monat'], bearbeiten: true })}
                    state={{ panelOpenedInApp: true, ruleDetailOpenedInApp: true }}
                  >
                    Schwellen
                  </AppLink>
                )}
                <AppLink
                  className="btn btn-ghost"
                  aria-label={`Einstellen ${rule.code} ${rule.name}`}
                  to={`/einstellungen/regelwerk/${rule.code}`}
                  search={(previous) => ({ monat: previous['monat'] })}
                  state={{ ruleDetailOpenedInApp: true }}
                >
                  Einstellen
                </AppLink>
                <Switch
                  label={`${rule.code} ${rule.name}`}
                  disabled={busy}
                  checked={rule.enabled}
                  onChange={(enabled) => {
                    setBusy(true);
                    void write(
                      () => patchRule(rule.code, { enabled }),
                      () => `${rule.code} ${rule.name}: ${enabled ? 'an' : 'aus'}`,
                    ).finally(() => setBusy(false));
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
      <SettingsReadStamp at={query.dataUpdatedAt} label="Regelwerk" />
    </section>
  );
}
