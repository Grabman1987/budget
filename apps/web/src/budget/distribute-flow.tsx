import { Button, DimensionChain, cx, useAmountPrivacy } from '@budget/ui';
import {
  coverFromToBeAssigned,
  distributionFill,
  distributionGaps,
  distributionPass,
  passTotals,
  takeBackPlan,
  type PassWrite,
} from '@budget/domain';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Undo2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/http';
import type { MonthIncome } from '../expected/api';
import { undoGroup } from '../ledger/api';
import { eur } from '../ledger/format';
import { errorText } from '../ledger/labels';
import type { WriteResult } from '../ledger/types';
import { monthLabel } from '../nav/month';
import { AppLink } from '../shell/app-link';
import { coverAll, moveMoney, type BudgetMonthView } from './budget-api';
import { freeCoverCents, isCard, planRows, type PlanRow } from './plan-model';
import { planMonthTerms, planRowState } from './plan-presentation';
import { STAGES } from './labels';
import { planHistory, usePlanHistory } from './plan-history';
import { useBudgetWrite } from './use-category-writes';
import '../month-close/month-close.css';
import './distribute-flow.css';

/**
 * Guided "Geld verteilen" (#1055, routine PR04): Eingang prüfen → Lücken → Zuweisen → Rest.
 * Every figure comes from the budget read model and the shared domain functions in
 * `@budget/domain` (`distributionGaps`, `distributionFill`, `coverFromToBeAssigned`,
 * `takeBackPlan`, `distributionPass`, `passTotals`); every write is an existing assignment, move
 * or cover call with its audited undo group.
 */

const STEPS = ['Eingang prüfen', 'Lücken', 'Zuweisen', 'Rest und Zusammenfassung'] as const;

interface LogEntry extends PassWrite {
  text: string;
  groupId?: string;
}

interface Saved {
  month: string;
  /** Start marker of this pass; a stored state of another month or shape is never resumed. */
  startedAt: string;
  step: number;
  reached: number;
  startAssignedCents: number;
  log: LogEntry[];
}

type Action =
  | { kind: 'fill'; id: string }
  | { kind: 'fillAll' }
  | { kind: 'take'; id: string }
  | { kind: 'takeAll' }
  | { kind: 'cover'; id: string }
  | { kind: 'coverAll' }
  | { kind: 'undo' };

const storageKey = (month: string) => `budget.geld-verteilen.${month}`;
const KINDS = new Set(['assign', 'cover', 'take']);

function readSaved(month: string): Saved | null {
  try {
    const raw = window.sessionStorage.getItem(storageKey(month));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<Saved>;
    if (
      value.month !== month ||
      typeof value.startedAt !== 'string' ||
      typeof value.step !== 'number' ||
      typeof value.reached !== 'number' ||
      typeof value.startAssignedCents !== 'number' ||
      !Array.isArray(value.log)
    )
      return null;
    const step = Math.min(4, Math.max(1, Math.trunc(value.step)));
    return {
      month,
      startedAt: value.startedAt,
      step,
      reached: Math.min(4, Math.max(step, Math.trunc(value.reached))),
      startAssignedCents: Math.trunc(value.startAssignedCents),
      log: value.log
        .filter(
          (entry): entry is LogEntry =>
            typeof entry?.text === 'string' &&
            KINDS.has(entry.kind) &&
            Number.isSafeInteger(entry.cents),
        )
        .slice(-50),
    };
  } catch {
    return null;
  }
}

function writeSaved(month: string, saved: Saved | null) {
  try {
    if (saved) window.sessionStorage.setItem(storageKey(month), JSON.stringify(saved));
    else window.sessionStorage.removeItem(storageKey(month));
  } catch {
    // Blocked storage: the flow still works, it just does not resume after a reload.
  }
}

/** Flow-specific wording; everything else uses the shared error text. */
function failureText(error: unknown) {
  if (error instanceof ApiError && error.code === 'plan_preview_changed')
    return 'Der Plan hat sich inzwischen geändert. Die Vorschläge sind neu berechnet – bitte prüfen und erneut bestätigen.';
  return error ? errorText(error) : 'Das hat nicht geklappt. Versuch es noch einmal.';
}

export function DistributeFlow({
  month,
  data,
  monthIncome,
  assign,
  onIncome,
  onClose,
}: {
  month: string;
  data: BudgetMonthView;
  /** Received and expected income of the month (expected payments); display only. */
  monthIncome?: MonthIncome | undefined;
  /** The Plan page's guarded assignment call (preview basis, conflict refresh). */
  assign: (items: Array<{ categoryId: string; assignedCents: number }>) => Promise<WriteResult>;
  onIncome: () => void;
  /** Leave the flow back to Plan › Monat. */
  onClose: () => void;
}) {
  useAmountPrivacy();
  const write = useBudgetWrite();
  const qc = useQueryClient();
  const history = usePlanHistory();
  const s = data.summary;
  const tba = s.toBeAssignedCents;
  const [saved, setSaved] = useState<Saved>(
    () =>
      readSaved(month) ?? {
        month,
        startedAt: new Date().toISOString(),
        step: 1,
        reached: 1,
        startAssignedCents: s.assignedCents,
        log: [],
      },
  );
  const [busy, setBusy] = useState(false);
  // Synchronous guard against double submits (state updates land a render later).
  const busyRef = useRef(false);
  const [failure, setFailure] = useState<{ action: Action | null; text: string } | null>(null);
  /** The history action of this flow's last write: the flow's undo acts only on that. */
  const [flowAction, setFlowAction] = useState<unknown>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);

  useEffect(() => writeSaved(month, saved), [month, saved]);
  // Leaving the flow inside the app (Plan, another month, another page) ends the pass. A reload
  // does not unmount, so the stored pass resumes; a write still in flight keeps it as well.
  useEffect(
    () => () => {
      if (!busyRef.current) writeSaved(month, null);
    },
    [month],
  );
  useEffect(() => {
    if (moved.current) heading.current?.focus();
    moved.current = false;
  }, [saved.step]);

  const go = (step: number) => {
    if (busyRef.current) return;
    moved.current = true;
    setFailure(null);
    setSaved((prev) => ({ ...prev, step, reached: Math.max(prev.reached, step) }));
  };
  const finish = () => {
    writeSaved(month, null);
    onClose();
  };

  const rows = planRows(data).map((row, index) => ({
    ...row,
    sortOrder: index,
    isCard: isCard(row),
    freeCents: freeCoverCents(row),
  }));
  const gaps = distributionGaps(rows);
  const fill = distributionFill(rows, tba);
  const takeBack = takeBackPlan(rows, -tba);
  const cover = coverFromToBeAssigned(gaps.overspent, tba);
  const pass = distributionPass(tba);
  const totals = passTotals(saved.log, saved.startAssignedCents, s.assignedCents);
  const lastEntry = [...saved.log].reverse().find((entry) => !entry.undone && entry.groupId);
  const canUndo =
    Boolean(lastEntry) &&
    flowAction !== null &&
    history === flowAction &&
    history?.label === 'Rückgängig';

  type Plan = {
    text: string;
    kind: PassWrite['kind'];
    cents: number;
    run: () => Promise<WriteResult & { missingCents?: number }>;
  };
  /** Builds the existing write from the current read model, so a retry never reuses stale sums. */
  const operation = (action: Exclude<Action, { kind: 'undo' }>): Plan | null => {
    switch (action.kind) {
      case 'fill':
      case 'fillAll': {
        const items = fill.items.filter((i) => action.kind === 'fillAll' || i.row.id === action.id);
        if (!items.length) return null;
        const cents = items.reduce((sum, i) => sum + i.addCents, 0);
        return {
          kind: 'assign',
          cents,
          text:
            action.kind === 'fillAll'
              ? `${eur(cents)} nach Plan zugewiesen`
              : `${items[0]!.row.name}: ${eur(cents)} zugewiesen`,
          run: () =>
            assign(
              items.map((i) => ({
                categoryId: i.row.id,
                assignedCents: i.row.assignedCents + i.addCents,
              })),
            ),
        };
      }
      case 'take':
      case 'takeAll': {
        const moves = takeBack.moves.filter(
          (m) => action.kind === 'takeAll' || m.row.id === action.id,
        );
        if (!moves.length) return null;
        const cents = moves.reduce((sum, m) => sum + m.takeCents, 0);
        return {
          kind: 'take',
          cents,
          text:
            action.kind === 'takeAll'
              ? `${eur(cents)} zurückgenommen`
              : `${moves[0]!.row.name}: ${eur(cents)} zurückgenommen`,
          run: () =>
            assign(
              moves.map((m) => ({
                categoryId: m.row.id,
                assignedCents: m.row.assignedCents - m.takeCents,
              })),
            ),
        };
      }
      case 'cover': {
        const item = cover.items.find((i) => i.row.id === action.id);
        if (!item) return null;
        return {
          kind: 'cover',
          cents: item.coverCents,
          text: `${item.row.name}: ${eur(item.coverCents)} aus „Zu verteilen“ gedeckt`,
          run: () => moveMoney(month, null, item.row.id, item.coverCents),
        };
      }
      case 'coverAll':
        // Only offered when "Zu verteilen" covers every overspent row in full.
        if (!cover.coversAll) return null;
        return {
          kind: 'cover',
          cents: cover.totalCents,
          text: `${cover.count} überzogen · ${eur(cover.totalCents)} aus „Zu verteilen“ gedeckt`,
          run: () => coverAll(month, null),
        };
    }
  };

  const perform = async (action: Action) => {
    if (action.kind === 'undo') return undo();
    const plan = operation(action);
    if (busyRef.current || !plan) return;
    busyRef.current = true;
    setBusy(true);
    setFailure(null);
    let caught: unknown = null;
    const done = await write(
      async () => {
        try {
          return await plan.run();
        } catch (error) {
          caught = error;
          throw error;
        }
      },
      () => plan.text,
    );
    busyRef.current = false;
    setBusy(false);
    if (done) {
      setFlowAction(planHistory(qc).snapshot());
      // A capped cover reports what stayed open; the log keeps only what actually moved.
      const cents = Math.max(0, plan.cents - Math.max(0, done.missingCents ?? 0));
      setSaved((prev) => ({
        ...prev,
        log: [
          ...prev.log,
          { text: plan.text, kind: plan.kind, cents, groupId: done.groupId },
        ].slice(-50),
      }));
    } else {
      setFailure({ action, text: `${plan.text} – fehlgeschlagen. ${failureText(caught)}` });
    }
  };

  /** Undoes only this flow's last write (its audit group); the log changes after it resolved. */
  const undo = async () => {
    const entry = lastEntry;
    if (busyRef.current || !entry?.groupId || !canUndo) return;
    busyRef.current = true;
    setBusy(true);
    setFailure(null);
    let caught: unknown = null;
    const done = await write(
      async () => {
        try {
          return await undoGroup(entry.groupId!);
        } catch (error) {
          caught = error;
          throw error;
        }
      },
      () => `Rückgängig gemacht: ${entry.text}`,
    );
    busyRef.current = false;
    setBusy(false);
    setFlowAction(null);
    if (done) {
      setSaved((prev) => ({
        ...prev,
        log: prev.log.map((item) => (item === entry ? { ...item, undone: true } : item)),
      }));
    } else if (caught instanceof ApiError && caught.code === 'undo_refused') {
      setFailure({
        action: null,
        text: 'Rückgängig ist nicht mehr möglich: der Stand hat sich seither geändert. Bitte prüfe die Zahlen.',
      });
    } else {
      setFlowAction(planHistory(qc).snapshot());
      setFailure({
        action: { kind: 'undo' },
        text: `Rückgängig fehlgeschlagen. ${failureText(caught)}`,
      });
    }
  };

  const step = saved.step;
  const done = (n: number) => n < saved.reached || (n === 4 && saved.reached === 4 && step === 4);
  const completed = STEPS.filter((_, i) => done(i + 1)).length;

  return (
    <div className="distribute-flow" data-testid="distribute-flow">
      <nav className="close-breadcrumb" aria-label="Brotkrumen">
        <button type="button" className="distribute-crumb" onClick={finish}>
          Plan › {monthLabel(month)}
        </button>
        {' › '}
        <span aria-current="page">Geld verteilen</span>
      </nav>
      <header className="distribute-head">
        <h2 className="distribute-title">Geld verteilen · {monthLabel(month)}</h2>
        <p>
          Nur Geld, das schon da ist, bekommt einen Job. Dein Fortschritt bleibt in diesem Tab
          gespeichert.
        </p>
      </header>
      <nav className="close-stepper distribute-stepper" aria-label="Geld verteilen">
        <label htmlFor="distribute-progress">
          {completed} von {STEPS.length} Schritten bearbeitet
        </label>
        <progress id="distribute-progress" max={STEPS.length} value={completed} />
        <ol>
          {STEPS.map((title, index) => (
            <li key={title}>
              <button
                type="button"
                disabled={busy}
                aria-current={index + 1 === step ? 'step' : undefined}
                onClick={() => go(index + 1)}
              >
                <span>
                  {index + 1}. {title}
                </span>
                <small>
                  {done(index + 1) ? (
                    <>
                      <Check size={16} strokeWidth={1.75} aria-hidden="true" /> erledigt
                    </>
                  ) : index + 1 === step ? (
                    'aktuell'
                  ) : (
                    'offen'
                  )}
                </small>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <section className="distribute-card" aria-labelledby="distribute-step-title">
        <h3 id="distribute-step-title" ref={heading} tabIndex={-1}>
          {step}. {STEPS[step - 1]}
        </h3>
        <ToBeAssigned cents={tba} />

        {step === 1 && (
          <>
            <DimensionChain
              terms={planMonthTerms(s, onIncome)}
              precision="cent"
              label="Herleitung Zu verteilen"
            />
            <dl className="distribute-facts">
              <div>
                <dt>Gebuchte Einnahmen im Budgetmonat</dt>
                <dd data-testid="distribute-income">{eur(s.incomeCents)}</dd>
              </div>
              {monthIncome && (
                <div>
                  <dt>Davon erwartete Zahlungen (zugeordnet)</dt>
                  <dd data-testid="distribute-expected">
                    erhalten {eur(monthIncome.receivedCents)} von erwartet{' '}
                    {eur(monthIncome.expectedCents)}
                  </dd>
                </div>
              )}
              {s.uncoveredCents !== 0 && (
                <div className="is-negative">
                  <dt>Ungedeckt aus dem Vormonat</dt>
                  <dd data-testid="distribute-uncovered">{eur(s.uncoveredCents)}</dd>
                </div>
              )}
            </dl>
            <p className="distribute-note">
              „Zu verteilen“ rechnet mit den gebuchten Einnahmen. Die Zeile der erwarteten Zahlungen
              zeigt nur, wie weit sie schon eingegangen sind: erwartete Einnahmen zählen erst, wenn
              sie gebucht sind, und werden nie als verfügbares Geld verteilt.
            </p>
            {s.uncoveredCents !== 0 && (
              <p className="distribute-note">
                Barüberziehungen aus dem Vormonat, die nicht gedeckt wurden, mindern „Zu verteilen“
                in diesem Monat.
              </p>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <GapList
              title="Überzogen"
              testId="distribute-overspent"
              empty="Nichts ist überzogen."
              total={gaps.overspentCents}
              rows={gaps.overspent}
              amount={(row) => row.overspentCents}
              label={(row) => planRowState(row).label}
            />
            <GapList
              title="Unterfinanziert"
              testId="distribute-underfunded"
              empty="Alle Ziele sind gedeckt."
              total={gaps.needCents}
              rows={gaps.underfunded}
              amount={(row) => row.needCents}
              label={stageLabel}
            />
            <p className="distribute-note">
              Reihenfolge nach Wasserfall: zuerst Stufe 1, innerhalb einer Stufe wie im Plan.
            </p>
          </>
        )}

        {step === 3 && (
          <div aria-busy={busy}>
            {tba < 0 ? (
              <>
                <p className="distribute-alert" role="note">
                  Zu viel zugewiesen. Nimm Geld aus Kategorien mit freiem Guthaben zurück – zuerst
                  aus den niedrigsten Stufen.
                </p>
                {takeBack.moves.length > 0 ? (
                  <ul className="distribute-list" data-testid="distribute-takeback">
                    {takeBack.moves.map((move) => (
                      <li key={move.row.id}>
                        <span className="distribute-name">{move.row.name}</span>
                        <span className="distribute-meta">frei {eur(move.row.freeCents)}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() => void perform({ kind: 'take', id: move.row.id })}
                        >
                          {eur(move.takeCents)} zurücknehmen
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>Keine Kategorie hat freies Guthaben.</p>
                )}
                {takeBack.moves.length > 1 && (
                  <Button disabled={busy} onClick={() => void perform({ kind: 'takeAll' })}>
                    Alle zurücknehmen · {eur(takeBack.takenCents)}
                  </Button>
                )}
                {takeBack.missingCents > 0 && (
                  <p className="distribute-alert" data-testid="distribute-missing">
                    {takeBack.reason === 'assigned'
                      ? `Zurücknehmen geht nur bis zur Zuweisung dieses Monats: es fehlen weiterhin ${eur(takeBack.missingCents)}. Den Rest musst du bei anderen Kategorien zurücknehmen oder durch eine Einnahme decken.`
                      : `Freies Guthaben reicht nicht: es fehlen weiterhin ${eur(takeBack.missingCents)}. Geld kommt nur durch Einnahmen oder Umbuchungen auf ein Budget-Konto.`}
                  </p>
                )}
              </>
            ) : (
              <>
                {cover.count > 0 && tba > 0 && (
                  <div className="distribute-row-action" data-testid="distribute-cover">
                    <p>
                      {cover.count} überzogen · {eur(cover.totalCents)} zu decken. Decken nimmt das
                      Geld aus „Zu verteilen“.
                    </p>
                    {cover.coversAll ? (
                      <Button
                        variant="ghost"
                        disabled={busy}
                        onClick={() => void perform({ kind: 'coverAll' })}
                      >
                        Alle überzogenen decken · {eur(cover.totalCents)}
                      </Button>
                    ) : (
                      <>
                        <ul className="distribute-list">
                          {cover.items.map((item) => (
                            <li key={item.row.id}>
                              <span className="distribute-name">{item.row.name}</span>
                              <span className="distribute-meta">
                                fehlt {eur(item.row.overspentCents)}
                              </span>
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={busy}
                                aria-label={`${eur(item.coverCents)} an ${item.row.name} aus „Zu verteilen“ decken`}
                                onClick={() => void perform({ kind: 'cover', id: item.row.id })}
                              >
                                {eur(item.coverCents)} decken
                              </Button>
                            </li>
                          ))}
                        </ul>
                        <p className="distribute-alert" data-testid="distribute-uncovered-rest">
                          „Zu verteilen“ reicht nicht für alle: danach bleiben{' '}
                          {eur(cover.uncoveredCents)} ungedeckt. Geld kommt nur durch Einnahmen oder
                          Umbuchungen auf ein Budget-Konto.
                        </p>
                      </>
                    )}
                  </div>
                )}
                {fill.items.length > 0 ? (
                  <>
                    <ul className="distribute-list" data-testid="distribute-fill">
                      {fill.items.map((item) => (
                        <li key={item.row.id}>
                          <span className="distribute-name">{item.row.name}</span>
                          <span className="distribute-meta">fehlt {eur(item.row.needCents)}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            aria-label={`${eur(item.addCents)} an ${item.row.name} zuweisen`}
                            onClick={() => void perform({ kind: 'fill', id: item.row.id })}
                          >
                            <span className="distribute-ghost">+{eur(item.addCents)}</span> zuweisen
                          </Button>
                        </li>
                      ))}
                    </ul>
                    <Button disabled={busy} onClick={() => void perform({ kind: 'fillAll' })}>
                      Alle nach Plan zuweisen · {eur(fill.totalCents)}
                    </Button>
                    {fill.leftCents > 0 && (
                      <p className="distribute-note" data-testid="distribute-left">
                        Danach bleiben {eur(fill.leftCents)} ohne Ziel in „Zu verteilen“.
                      </p>
                    )}
                  </>
                ) : (
                  <p data-testid="distribute-nothing">
                    {tba === 0
                      ? 'Nichts zu verteilen.'
                      : 'Kein Ziel braucht noch Geld. Der Rest bleibt in „Zu verteilen“.'}
                  </p>
                )}
              </>
            )}
            {lastEntry && (
              <Button variant="ghost" disabled={busy || !canUndo} onClick={() => void undo()}>
                <Undo2 size={16} strokeWidth={1.75} aria-hidden="true" /> Letzte Änderung rückgängig
              </Button>
            )}
          </div>
        )}

        {step === 4 && (
          <>
            <dl className="distribute-facts" data-testid="distribute-summary">
              <div>
                <dt>In diesem Durchgang zugewiesen</dt>
                <dd>{eur(totals.assignedCents)}</dd>
              </div>
              {totals.takenBackCents > 0 && (
                <div>
                  <dt>In diesem Durchgang zurückgenommen</dt>
                  <dd>{eur(totals.takenBackCents)}</dd>
                </div>
              )}
              {totals.externalCents !== 0 && (
                <div>
                  <dt>Weitere Änderungen außerhalb dieses Ablaufs</dt>
                  <dd>{eur(totals.externalCents, { sign: true })}</dd>
                </div>
              )}
              <div className={cx(pass.state === 'over' && 'is-negative')}>
                <dt>Zu verteilen jetzt</dt>
                <dd>{eur(pass.remainingCents)}</dd>
              </div>
              <div className={cx(gaps.underfunded.length > 0 && 'is-open')}>
                <dt>Noch unterfinanziert</dt>
                <dd>
                  {gaps.underfunded.length > 0
                    ? `${eur(gaps.needCents)} in ${gaps.underfunded.length} ${gaps.underfunded.length === 1 ? 'Kategorie' : 'Kategorien'}`
                    : 'nichts'}
                </dd>
              </div>
              <div className={cx(gaps.overspent.length > 0 && 'is-negative')}>
                <dt>Noch überzogen</dt>
                <dd>
                  {gaps.overspent.length > 0
                    ? `${eur(gaps.overspentCents)} in ${gaps.overspent.length} ${gaps.overspent.length === 1 ? 'Kategorie' : 'Kategorien'}`
                    : 'nichts'}
                </dd>
              </div>
            </dl>
            <p
              className={cx('distribute-verdict', pass.state === 'over' && 'is-negative')}
              data-testid="distribute-state"
            >
              {pass.state === 'balanced'
                ? 'Jeder Euro hat einen Job.'
                : pass.state === 'left'
                  ? 'Noch nicht alles verteilt. Der Rest bleibt in „Zu verteilen“.'
                  : 'Zu viel zugewiesen: „Zu verteilen“ ist negativ. Nimm Geld zurück oder buche eine Einnahme.'}
            </p>
            {saved.log.length > 0 && (
              <>
                <h4>Änderungen in diesem Durchgang</h4>
                <ol className="distribute-log">
                  {saved.log.map((entry, index) => (
                    <li key={`${index}-${entry.text}`}>
                      {entry.undone ? `${entry.text} (rückgängig gemacht)` : entry.text}
                    </li>
                  ))}
                </ol>
              </>
            )}
            <div className="distribute-links">
              <Button onClick={finish}>Zurück zum Plan</Button>
              <AppLink
                className="btn btn-ghost"
                to="/"
                search={{}}
                onClick={() => writeSaved(month, null)}
              >
                Zu Heute
              </AppLink>
            </div>
          </>
        )}

        {failure && (
          <div className="distribute-failure" role="alert">
            <p>{failure.text}</p>
            {failure.action && (
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => failure.action && void perform(failure.action)}
              >
                Erneut versuchen
              </Button>
            )}
          </div>
        )}
      </section>

      <div className="distribute-footer">
        <Button variant="ghost" disabled={busy || step === 1} onClick={() => go(step - 1)}>
          Zurück
        </Button>
        {step < 4 ? (
          <Button disabled={busy} onClick={() => go(step + 1)}>
            Weiter: {STEPS[step]}
          </Button>
        ) : (
          <Button variant="ghost" disabled={busy} onClick={finish}>
            Ablauf beenden
          </Button>
        )}
      </div>
    </div>
  );
}

const stageLabel = (row: { stage: number | null }) => {
  const stage = row.stage ? STAGES[row.stage - 1] : undefined;
  return stage ? `Stufe ${stage.n} · ${stage.short}` : 'ohne Stufe';
};

function ToBeAssigned({ cents }: { cents: number }) {
  return (
    <p className={cx('distribute-lead', cents > 0 && 'is-positive', cents < 0 && 'is-negative')}>
      <span>{cents < 0 ? 'Zu viel zugewiesen · Zu verteilen' : 'Zu verteilen'}</span>
      <strong data-testid="distribute-tba">{eur(cents)}</strong>
    </p>
  );
}

function GapList<T extends PlanRow>({
  title,
  testId,
  empty,
  total,
  rows,
  amount,
  label,
}: {
  title: string;
  testId: string;
  empty: string;
  total: number;
  rows: T[];
  amount: (row: T) => number;
  label: (row: T) => string;
}) {
  return (
    <section className="distribute-gaps" aria-label={title} data-testid={testId}>
      <h4>
        {title} <span>{rows.length > 0 ? `· ${eur(total)}` : ''}</span>
      </h4>
      {rows.length === 0 ? (
        <p>{empty}</p>
      ) : (
        <ol className="distribute-list">
          {rows.map((row) => (
            <li key={row.id}>
              <span className="distribute-name">{row.name}</span>
              <span className="distribute-meta">{label(row)}</span>
              <span className="distribute-amount">fehlt {eur(amount(row))}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
