import { Button, DimensionChain, cx, useAmountPrivacy } from '@budget/ui';
import { distributionFill, distributionGaps, distributionPass, takeBackPlan } from '@budget/domain';
import { Check, Undo2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { MonthIncome } from '../expected/api';
import { eur } from '../ledger/format';
import { errorText } from '../ledger/labels';
import type { WriteResult } from '../ledger/types';
import { monthLabel } from '../nav/month';
import { AppLink } from '../shell/app-link';
import { coverAll, type BudgetMonthView } from './budget-api';
import { freeCoverCents, isCard, planRows, type PlanRow } from './plan-model';
import { planMonthTerms, planRowState } from './plan-presentation';
import { STAGES } from './labels';
import { usePlanHistory } from './plan-history';
import { useBudgetWrite } from './use-category-writes';
import '../month-close/month-close.css';
import './distribute-flow.css';

/**
 * Guided "Geld verteilen" (#1055, routine PR04): Eingang prüfen → Lücken → Zuweisen → Rest.
 * Every figure comes from the budget read model and the shared domain functions in
 * `@budget/domain` (`distributionGaps`, `distributionFill`, `takeBackPlan`, `distributionPass`);
 * every write is the existing assignment or cover call with its audited undo group.
 */

const STEPS = ['Eingang prüfen', 'Lücken', 'Zuweisen', 'Rest und Zusammenfassung'] as const;

interface Saved {
  step: number;
  reached: number;
  startAssignedCents: number;
  log: string[];
}

type Action =
  | { kind: 'fill'; id: string }
  | { kind: 'fillAll' }
  | { kind: 'take'; id: string }
  | { kind: 'takeAll' }
  | { kind: 'cover' };

const storageKey = (month: string) => `budget.geld-verteilen.${month}`;

function readSaved(month: string): Saved | null {
  try {
    const raw = window.sessionStorage.getItem(storageKey(month));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<Saved>;
    if (
      typeof value.step !== 'number' ||
      typeof value.reached !== 'number' ||
      typeof value.startAssignedCents !== 'number' ||
      !Array.isArray(value.log)
    )
      return null;
    const step = Math.min(4, Math.max(1, Math.trunc(value.step)));
    return {
      step,
      reached: Math.min(4, Math.max(step, Math.trunc(value.reached))),
      startAssignedCents: Math.trunc(value.startAssignedCents),
      log: value.log.filter((entry): entry is string => typeof entry === 'string').slice(-50),
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
  const history = usePlanHistory();
  const s = data.summary;
  const tba = s.toBeAssignedCents;
  const [saved, setSaved] = useState<Saved>(
    () => readSaved(month) ?? { step: 1, reached: 1, startAssignedCents: s.assignedCents, log: [] },
  );
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ action: Action; text: string } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);

  useEffect(() => writeSaved(month, saved), [month, saved]);
  useEffect(() => {
    if (moved.current) heading.current?.focus();
    moved.current = false;
  }, [saved.step]);

  const go = (step: number) => {
    if (busy) return;
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
  const pass = distributionPass(saved.startAssignedCents, s.assignedCents, tba);
  const cashOverspent = gaps.overspent.filter((row) => row.cashOverspentCents > 0);

  const describe = (action: Action): string => {
    switch (action.kind) {
      case 'fill': {
        const item = fill.items.find((i) => i.row.id === action.id);
        return item ? `${item.row.name}: ${eur(item.addCents)} zugewiesen` : 'Zuweisung';
      }
      case 'fillAll':
        return `${eur(fill.totalCents)} nach Plan zugewiesen`;
      case 'take': {
        const move = takeBack.moves.find((m) => m.row.id === action.id);
        return move ? `${move.row.name}: ${eur(move.takeCents)} zurückgenommen` : 'Zurücknahme';
      }
      case 'takeAll':
        return `${eur(takeBack.takenCents)} zurückgenommen`;
      case 'cover':
        return 'Überzogene aus „Zu verteilen“ gedeckt';
    }
  };

  /** Builds the existing write from the current read model, so a retry never reuses stale sums. */
  const operation = (action: Action): (() => Promise<WriteResult>) | null => {
    switch (action.kind) {
      case 'fill':
      case 'fillAll': {
        const items = fill.items.filter((i) => action.kind === 'fillAll' || i.row.id === action.id);
        if (!items.length) return null;
        return () =>
          assign(
            items.map((i) => ({
              categoryId: i.row.id,
              assignedCents: i.row.assignedCents + i.addCents,
            })),
          );
      }
      case 'take':
      case 'takeAll': {
        const moves = takeBack.moves.filter(
          (m) => action.kind === 'takeAll' || m.row.id === action.id,
        );
        if (!moves.length) return null;
        return () =>
          assign(
            moves.map((m) => ({
              categoryId: m.row.id,
              assignedCents: m.row.assignedCents - m.takeCents,
            })),
          );
      }
      case 'cover':
        return cashOverspent.length && tba > 0 ? () => coverAll(month, null) : null;
    }
  };

  const perform = async (action: Action) => {
    const run = operation(action);
    if (busy || !run) return;
    const text = describe(action);
    setBusy(true);
    setFailure(null);
    let caught: unknown = null;
    const done = await write(
      async () => {
        try {
          return await run();
        } catch (error) {
          caught = error;
          throw error;
        }
      },
      () => text,
    );
    setBusy(false);
    if (done) {
      setSaved((prev) => ({ ...prev, log: [...prev.log, text].slice(-50) }));
    } else {
      const reason = caught ? errorText(caught) : 'Unbekannter Fehler.';
      setFailure({ action, text: `${text} – fehlgeschlagen. ${reason}` });
    }
  };

  const undo = () => {
    if (history?.label !== 'Rückgängig' || busy) return;
    history.run();
    setSaved((prev) => ({ ...prev, log: [...prev.log, 'Letzte Änderung rückgängig gemacht'] }));
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
                <dt>Eingegangen im Monat</dt>
                <dd data-testid="distribute-income">{eur(s.incomeCents)}</dd>
              </div>
              {monthIncome && (
                <div>
                  <dt>Erwartete Zahlungen</dt>
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
              Erwartete Einnahmen zählen erst, wenn sie gebucht sind. Sie werden nie als verfügbares
              Geld verteilt.
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
                    Freies Guthaben reicht nicht: es fehlen weiterhin {eur(takeBack.missingCents)}.
                    Geld kommt nur durch Einnahmen oder Umbuchungen auf ein Budget-Konto.
                  </p>
                )}
              </>
            ) : (
              <>
                {cashOverspent.length > 0 && tba > 0 && (
                  <div className="distribute-row-action">
                    <p>
                      {cashOverspent.length} überzogen · {eur(gaps.overspentCents)} zu decken.
                      Decken nimmt das Geld aus „Zu verteilen“.
                    </p>
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void perform({ kind: 'cover' })}
                    >
                      Überzogene aus „Zu verteilen“ decken
                    </Button>
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
            {history?.label === 'Rückgängig' && (
              <Button variant="ghost" disabled={busy} onClick={undo}>
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
                <dd>{eur(pass.assignedInPassCents)}</dd>
              </div>
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
                    <li key={`${index}-${entry}`}>{entry}</li>
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
            <Button variant="ghost" disabled={busy} onClick={() => void perform(failure.action)}>
              Erneut versuchen
            </Button>
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
