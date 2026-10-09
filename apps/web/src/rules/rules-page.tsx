import { BookInputForm } from './book-input-form';
import {
  useAmountPrivacy,
  maskMoneyText,
  Button,
  SectionHead,
  Switch,
  StatusMark,
} from '@budget/ui';
import { STAGES, type RuleCode } from '@budget/domain';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ErrorNote, LoadingNote } from '../ledger/states';
import { HEUTE_KEY } from '../heute/api';
import { EINSTELLUNGEN_REGELWERK } from '../nav/pages';
import { PageFrame } from '../pages/placeholder-page';
import { AppLink } from '../shell/app-link';
import { longDay } from '../ledger/format';
import { confirmItem, evaluateRules, patchRule, type ChecklistRow, type RuleRow } from './api';
import { RulePanel } from './rule-panel';
import { RULE_GUIDANCE, ruleGroup, stageRange, thresholdText, type RuleGroup } from './rules-model';
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
 * registered rules with their thresholds. Switches and thresholds save at once; every write is one
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
  const pendingRuleFocus = useRef<{
    targetId: string;
    allowedActiveIds: string[];
  } | null>(null);
  useLayoutEffect(() => {
    const pending = pendingRuleFocus.current;
    if (!pending) return;
    pendingRuleFocus.current = null;
    const active = document.activeElement;
    if (
      active === document.body ||
      !active?.isConnected ||
      pending.allowedActiveIds.includes(active.id)
    ) {
      document.getElementById(pending.targetId)?.focus({ preventScroll: true });
    }
  }, [shown]);

  const flip = async (
    key: string,
    value: boolean,
    run: () => Promise<unknown>,
    focusOnFailure?: { targetId: string; focusedId: string },
  ) => {
    setShown((s) => ({ ...s, [key]: value }));
    const result = await run();
    if (
      result === undefined &&
      focusOnFailure &&
      document.activeElement?.id === focusOnFailure.focusedId
    ) {
      pendingRuleFocus.current = {
        targetId: focusOnFailure.targetId,
        allowedActiveIds: [focusOnFailure.focusedId],
      };
    }
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
  const closePanel = () => {
    const code = panel;
    setPanel(null);
    // A status change moves the row to another group and replaces the original dialog trigger.
    requestAnimationFrame(() =>
      document.getElementById(`rule-settings-${code}`)?.focus({ preventScroll: true }),
    );
  };

  const toggleRule = (r: RuleRow, enabled: boolean) => {
    const switchId = `rule-switch-${r.code}`;
    const targetId = enabled ? switchId : 'rw-disabled-summary';
    const switchHasFocus = document.activeElement?.id === switchId;
    if (switchHasFocus) {
      pendingRuleFocus.current = {
        targetId,
        allowedActiveIds: [switchId],
      };
    }
    void flip(
      r.code,
      enabled,
      () =>
        write(
          () => patchRule(r.code, { enabled }),
          () => `${r.code} ${r.name}: ${onOff(enabled)}`,
        ),
      switchHasFocus ? { targetId: switchId, focusedId: targetId } : undefined,
    );
  };
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

  const grouped = (group: RuleGroup) =>
    book?.rules.filter((r) => ruleGroup(r, shown[r.code] ?? r.enabled) === group) ?? [];
  const list = (rows: RuleRow[]) => (
    <ul className="rw-list rw-rules">
      {rows.map((r) => {
        const enabled = shown[r.code] ?? r.enabled;
        const guidance = RULE_GUIDANCE[r.code as RuleCode];
        const needsAttention = enabled && r.latest?.status !== 'ok';
        return (
          <li key={r.code} data-rule-code={r.code}>
            <div className="rw-rule-copy">
              <strong>
                <span className="rw-pos">{r.code}</span> {r.name}
              </strong>
              <small className="rw-explanation">{guidance.explanation}</small>
              {enabled &&
                (r.latest ? (
                  <div className="rw-rule-result">
                    <StatusMark
                      status={
                        r.latest.status === 'ok'
                          ? 'met'
                          : r.latest.status === 'warn'
                            ? 'warning'
                            : 'violated'
                      }
                      actionNeeded={r.latest.actionNeeded}
                    />
                    <span>Ist: {maskMoneyText(r.latest.valueText)}</span>
                    <small>Stand {longDay(r.latest.asOf)}</small>
                  </div>
                ) : (
                  <small>
                    {maskMoneyText(
                      `Nicht prüfbar: ${r.unavailableReason ?? 'Es fehlen Daten für diese Regel.'}`,
                    )}
                  </small>
                ))}
              {needsAttention && (
                <>
                  <small>Schwelle: {thresholdText(r.code, r.params)}</small>
                  <small>
                    {maskMoneyText(
                      r.latest?.actionText ?? r.action ?? 'Angaben für diese Regel ergänzen.',
                    )}
                  </small>
                  <AppLink className="rw-fix" to={guidance.to}>
                    {guidance.label}
                  </AppLink>
                </>
              )}
            </div>
            <div className="rw-controls">
              <Button
                id={`rule-settings-${r.code}`}
                variant="ghost"
                size="xs"
                aria-label={`Einstellen ${r.code} ${r.name}`}
                onClick={() => setPanel(r.code)}
              >
                Einstellen
              </Button>
              <Switch
                id={`rule-switch-${r.code}`}
                label={`${r.code} ${r.name}`}
                checked={enabled}
                onChange={(on) => toggleRule(r, on)}
              />
            </div>
          </li>
        );
      })}
    </ul>
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
            <section className="rw-sec" aria-labelledby="rl-title">
              <SectionHead
                id="rl-title"
                title={`Regeln (${book.rules.length})`}
                aside={`${active} von ${book.rules.length} aktiv`}
              />
              {(
                [
                  ['violated', 'Verletzt'],
                  ['pending', 'Noch offen'],
                  ['met', 'Eingehalten'],
                ] as const
              ).map(([group, title]) => {
                const rows = grouped(group);
                if (group === 'pending' && rows.length === 0) return null;
                return (
                  <section className="rw-group" key={group} aria-labelledby={`rw-${group}`}>
                    <h3 id={`rw-${group}`}>
                      {title} ({rows.length})
                    </h3>
                    {group === 'pending' && (
                      <p className="rw-now-sub">Warnungen und Regeln, für die noch Daten fehlen.</p>
                    )}
                    {rows.length ? (
                      list(rows)
                    ) : (
                      <p className="rw-now-sub">
                        {group === 'violated'
                          ? 'Keine Regel verletzt.'
                          : 'Noch keine Regel eingehalten.'}
                      </p>
                    )}
                  </section>
                );
              })}
              <details className="rw-group rw-disabled">
                <summary id="rw-disabled-summary">
                  Ausgeschaltet ({grouped('disabled').length})
                </summary>
                {list(grouped('disabled'))}
              </details>
            </section>
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
                              <strong>
                                <span className="rw-pos">{c.code}</span> {c.name}
                              </strong>
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
            <BookInputForm />
          </>
        )}
      </div>
      <RulePanel rule={open ?? null} onClose={closePanel} />
    </PageFrame>
  );
}
