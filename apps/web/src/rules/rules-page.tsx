import { useAmountPrivacy, Button, SectionHead, Switch } from '@budget/ui';
import { STAGES } from '@budget/domain';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ErrorNote, LoadingNote } from '../ledger/states';
import { HEUTE_KEY } from '../heute/api';
import { EINSTELLUNGEN_REGELWERK } from '../nav/pages';
import { PageFrame } from '../pages/placeholder-page';
import { confirmItem, evaluateRules, patchRule, type ChecklistRow, type RuleRow } from './api';
import { RulePanel } from './rule-panel';
import { stageRange, thresholdText } from './rules-model';
import {
  RULES_CHECK_KEY,
  RULES_KEY,
  rulesCheckQuery,
  rulesQuery,
  useRuleWrite,
} from './use-rule-writes';

const onOff = (on: boolean) => (on ? 'an' : 'aus');

/**
 * Einstellungen › Regelwerk: the stage checklist (three columns, the current stage marked) and the
 * rules R01 to R16 with their thresholds. Switches and thresholds save at once; every write is one
 * "Rückgängig". The Finanz-Check reads these rules.
 */
export function RulesPage() {
  useAmountPrivacy();
  const rules = useQuery(rulesQuery());
  const check = useQuery(rulesCheckQuery());
  const write = useRuleWrite();
  const qc = useQueryClient();
  const [panel, setPanel] = useState<string | null>(null);
  // What the owner just switched, shown at once while the write is on its way.
  const [shown, setShown] = useState<Record<string, boolean>>({});
  const flip = async (key: string, value: boolean, run: () => Promise<unknown>) => {
    setShown((s) => ({ ...s, [key]: value }));
    await run();
    setShown((s) => {
      const rest = { ...s };
      delete rest[key];
      return rest;
    });
  };

  // The panel shows the newest stored result: derive them once when the page opens.
  useEffect(() => {
    void evaluateRules()
      .then(() =>
        Promise.all([
          qc.invalidateQueries({ queryKey: [...RULES_KEY] }),
          qc.invalidateQueries({ queryKey: [...RULES_CHECK_KEY] }),
          qc.invalidateQueries({ queryKey: HEUTE_KEY }),
        ]),
      )
      .catch(() => undefined);
  }, [qc]);

  const book = rules.data;
  const current = check.data?.stage.stage;
  const active = book?.rules.filter((r) => shown[r.code] ?? r.enabled).length ?? 0;
  const open = book?.rules.find((r) => r.code === panel);

  const toggleRule = (r: RuleRow, enabled: boolean) =>
    void flip(r.code, enabled, () =>
      write(
        () => patchRule(r.code, { enabled }),
        () => `${r.code} ${r.name}: ${onOff(enabled)}`,
      ),
    );
  const toggleItem = (c: ChecklistRow, enabled: boolean) =>
    void flip(c.code, enabled, () =>
      write(
        () => patchRule(c.code, { enabled }),
        () => `${c.name}: ${onOff(enabled)}`,
      ),
    );
  const confirm = (c: ChecklistRow, confirmed: boolean) =>
    void flip(`${c.code}:done`, confirmed, () =>
      write(
        () => confirmItem(c.code, confirmed),
        () => `${c.name}: ${confirmed ? 'erledigt' : 'wieder offen'}`,
      ),
    );

  return (
    <PageFrame meta={EINSTELLUNGEN_REGELWERK}>
      <div className="kview rw">
        {rules.isPending && <LoadingNote what="Regeln" />}
        {rules.isError && (
          <ErrorNote what="Regeln" error={rules.error} onRetry={() => void rules.refetch()} />
        )}
        {book && (
          <>
            <section className="rw-sec" aria-labelledby="stg-title">
              <SectionHead
                id="stg-title"
                title="Stufen"
                aside={
                  current ? `aktuell Stufe ${current} · automatisch nach Nettovermögen` : undefined
                }
              />
              <p className="rw-sub">
                Die Regeln aus I Will Teach You to Be Rich, Get Good with Money, Your Money or Your
                Life und Everyday Millionaires, geordnet nach Vermögensstufe. Der Finanz-Check zeigt
                die Regeln eurer Stufe und die der nächsten. Haltung: Würde statt Scham, keine
                Ausgabe gilt als Fehler.
              </p>
              <div className="rw-stages">
                {STAGES.map((st) => (
                  <div
                    key={st.stage}
                    className={st.stage === current ? 'rw-stage is-cur' : 'rw-stage'}
                    aria-current={st.stage === current ? 'step' : undefined}
                  >
                    <div className="rw-stage-h">
                      <h3>
                        <span className="rw-pos">{st.stage}</span> {st.label}
                      </h3>
                      <small>
                        Stufe {st.stage} · {stageRange(st.stage)}
                      </small>
                    </div>
                    <ul className="rw-list">
                      {book.checklist
                        .filter((c) => c.stage === st.stage)
                        .map((c) => (
                          <li key={c.code}>
                            <span>
                              <strong>{c.name}</strong>
                              <small>
                                {c.source}
                                {c.ruleCode ? (
                                  ` · ${c.ruleCode}`
                                ) : (
                                  <>
                                    {' · '}
                                    <label className="rw-done">
                                      <input
                                        type="checkbox"
                                        checked={shown[`${c.code}:done`] ?? c.confirmedAt !== null}
                                        onChange={(e) => confirm(c, e.target.checked)}
                                      />
                                      erledigt
                                    </label>
                                  </>
                                )}
                              </small>
                            </span>
                            <Switch
                              label={c.name}
                              checked={shown[c.code] ?? c.enabled}
                              onChange={(on) => toggleItem(c, on)}
                            />
                          </li>
                        ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
            <section className="rw-sec" aria-labelledby="rl-title">
              <SectionHead
                id="rl-title"
                title="Regeln R01 bis R16"
                aside={`${active} von ${book.rules.length} aktiv`}
              />
              <ul className="rw-list rw-rules">
                {book.rules.map((r) => (
                  <li key={r.code}>
                    <span>
                      <strong>
                        <span className="rw-pos">{r.code}</span> {r.name}
                      </strong>
                      <small>{thresholdText(r.code, r.params)}</small>
                    </span>
                    <Button
                      variant="ghost"
                      size="xs"
                      aria-label={`Schwelle ${r.code} ${r.name}`}
                      onClick={() => setPanel(r.code)}
                    >
                      Schwelle
                    </Button>
                    <Switch
                      label={`${r.code} ${r.name}`}
                      checked={shown[r.code] ?? r.enabled}
                      onChange={(on) => toggleRule(r, on)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </div>
      <RulePanel rule={open ?? null} onClose={() => setPanel(null)} />
    </PageFrame>
  );
}
