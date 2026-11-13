import { Button, DimensionChain, cx, useAmountPrivacy } from '@budget/ui';
import {
  assignedDelta,
  coverFromToBeAssigned,
  distributionFill,
  distributionGaps,
  distributionPass,
  passTotals,
  pendingApplied,
  takeBackPlan,
  type IntendedAssignment,
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
import { budgetQuery, coverAll, type BudgetMonthView } from './budget-api';
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
  id: string;
  text: string;
  groupId?: string;
  /** Stored before the write is sent; resolved on its answer or reconciled on reopen. */
  pending?: boolean;
  /** The absolute assignments the write intends (reconciliation of a pending entry). */
  items: IntendedAssignment[];
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

const isItem = (item: unknown): item is IntendedAssignment =>
  typeof (item as IntendedAssignment)?.categoryId === 'string' &&
  Number.isSafeInteger((item as IntendedAssignment)?.assignedCents);

function readSaved(month: string): Saved | null {
  try {
    const raw = window.sessionStorage.getItem(storageKey(month));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<Saved>;
    if (
      value.month !== month ||
      typeof value.startedAt !== 'string' ||
      Number.isNaN(Date.parse(value.startedAt)) ||
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
            typeof entry?.id === 'string' &&
            typeof entry.text === 'string' &&
            KINDS.has(entry.kind) &&
            Number.isSafeInteger(entry.cents) &&
            Array.isArray(entry.items) &&
            entry.items.every(isItem),
        )
        .slice(-50),
    };
  } catch {
    return null;
  }
}

/** Writes or clears this pass only; a stored pass with another start marker is left alone. */
function writeSaved(month: string, saved: Saved | null, startedAt?: string) {
  try {
    const raw = window.sessionStorage.getItem(storageKey(month));
    const owner = raw ? (JSON.parse(raw) as Partial<Saved>).startedAt : undefined;
    const mine = saved?.startedAt ?? startedAt;
    if (owner && mine && owner !== mine) return;
    if (saved) window.sessionStorage.setItem(storageKey(month), JSON.stringify(saved));
    else window.sessionStorage.removeItem(storageKey(month));
  } catch {
    // Blocked storage: the flow still works, it just does not resume after a reload.
  }
}

/**
 * A write still in flight when the pass was left (reload) counts only if the read model shows
 * exactly its intended assignments; otherwise it is dropped from the pass.
 */
function reconcile(saved: Saved | null, data: BudgetMonthView): Saved | null {
  if (!saved || !saved.log.some((entry) => entry.pending)) return saved;
  const assigned = new Map(data.summary.envelopes.map((e) => [e.categoryId, e.assignedCents]));
  return {
    ...saved,
    log: saved.log.flatMap((entry) => {
      if (!entry.pending) return [entry];
      if (!pendingApplied(entry.items, (id) => assigned.get(id))) return [];
      // Counted, but its audit group is unknown: the flow's undo does not offer it.
      return [
        {
          id: entry.id,
          text: entry.text,
          kind: entry.kind,
          cents: entry.cents,
          items: entry.items,
        },
      ];
    }),
  };
}

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;

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
      reconcile(readSaved(month), data) ?? {
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

  const startedAt = saved.startedAt;
  const mounted = useRef(true);
  useEffect(() => writeSaved(month, saved), [month, saved]);
  // Leaving the flow inside the app (Plan, another month, another page) ends the pass. A reload
  // does not unmount, so the stored pass resumes; a write still in flight keeps it as well and
  // clears it when its answer arrives (see `perform`).
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (!busyRef.current) writeSaved(month, null, startedAt);
    };
  }, [month, startedAt]);
  // "Rückgängig" in the toast undid the flow's last write: it leaves the pass as well.
  // The toast's undo first clears the action, then offers "Wiederholen" once the undo landed.
  const seenHistory = useRef(history);
  const toastUndo = useRef(false);
  useEffect(() => {
    const previous = seenHistory.current;
    seenHistory.current = history;
    if (history === null) {
      toastUndo.current = flowAction !== null && previous === flowAction;
      return;
    }
    const undone = toastUndo.current && history.label === 'Wiederholen';
    toastUndo.current = false;
    if (!undone) return;
    setFlowAction(null);
    setSaved((prev) => {
      const last = [...prev.log].reverse().find((entry) => !entry.undone && entry.groupId);
      return last
        ? {
            ...prev,
            log: prev.log.map((entry) => (entry === last ? { ...entry, undone: true } : entry)),
          }
        : prev;
    });
  }, [history, flowAction]);
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
    writeSaved(month, null, startedAt);
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
  const settled = saved.log.filter((entry) => !entry.pending);
  const totals = passTotals(settled, saved.startAssignedCents, s.assignedCents);
  const lastEntry = [...settled].reverse().find((entry) => !entry.undone && entry.groupId);
  const canUndo =
    Boolean(lastEntry) &&
    flowAction !== null &&
    history === flowAction &&
    history?.label === 'Rückgängig';

  type Plan = {
    text: string;
    kind: PassWrite['kind'];
    cents: number;
    /** Intended absolute assignments (pending reconciliation). */
    items: IntendedAssignment[];
    /** Cover-all: measure the moved amount on these rows in the refetched read model. */
    measure?: string[];
    run: () => Promise<WriteResult>;
  };
  /** Builds the existing write from the current read model, so a retry never reuses stale sums. */
  const operation = (action: Exclude<Action, { kind: 'undo' }>): Plan | null => {
    switch (action.kind) {
      case 'fill':
      case 'fillAll': {
        const items = fill.items.filter((i) => action.kind === 'fillAll' || i.row.id === action.id);
        if (!items.length) return null;
        const cents = items.reduce((sum, i) => sum + i.addCents, 0);
        const intended = items.map((i) => ({
          categoryId: i.row.id,
          assignedCents: i.row.assignedCents + i.addCents,
        }));
        return {
          kind: 'assign',
          cents,
          items: intended,
          text:
            action.kind === 'fillAll'
              ? `${eur(cents)} nach Plan zugewiesen`
              : `${items[0]!.row.name}: ${eur(cents)} zugewiesen`,
          run: () => assign(intended),
        };
      }
      case 'take':
      case 'takeAll': {
        const moves = takeBack.moves.filter(
          (m) => action.kind === 'takeAll' || m.row.id === action.id,
        );
        if (!moves.length) return null;
        const cents = moves.reduce((sum, m) => sum + m.takeCents, 0);
        const intended = moves.map((m) => ({
          categoryId: m.row.id,
          assignedCents: m.row.assignedCents - m.takeCents,
        }));
        return {
          kind: 'take',
          cents,
          items: intended,
          text:
            action.kind === 'takeAll'
              ? `${eur(cents)} zurückgenommen`
              : `${moves[0]!.row.name}: ${eur(cents)} zurückgenommen`,
          run: () => assign(intended),
        };
      }
      case 'cover': {
        const item = cover.items.find((i) => i.row.id === action.id);
        if (!item) return null;
        // Moving from "Zu verteilen" is an assignment (same repo write as a move from null), so the
        // capped cover uses the guarded assignment with the current preview basis: a stale
        // "Zu verteilen" is refused with 409 instead of overdrawing it.
        const intended = [
          { categoryId: item.row.id, assignedCents: item.row.assignedCents + item.coverCents },
        ];
        return {
          kind: 'cover',
          cents: item.coverCents,
          items: intended,
          text: `${item.row.name}: ${eur(item.coverCents)} aus „Zu verteilen“ gedeckt`,
          run: () => assign(intended),
        };
      }
      case 'coverAll':
        // Only offered when "Zu verteilen" covers every overspent row in full.
        if (!cover.coversAll) return null;
        return {
          kind: 'cover',
          cents: cover.totalCents,
          items: gaps.overspent.map((row) => ({
            categoryId: row.id,
            assignedCents: row.assignedCents + row.overspentCents,
          })),
          measure: gaps.overspent.map((row) => row.id),
          text: `${cover.count} überzogen aus „Zu verteilen“ gedeckt`,
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
    // Stored before the request leaves, so a reload mid-write can reconcile it on reopen.
    const id = newId();
    const pendingEntry: LogEntry = {
      id,
      text: plan.text,
      kind: plan.kind,
      cents: plan.cents,
      items: plan.items,
      pending: true,
    };
    const withPending = { ...saved, log: [...saved.log, pendingEntry].slice(-50) };
    writeSaved(month, withPending);
    setSaved(withPending);
    const before = data.summary.envelopes;
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
    let cents: number | null = plan.cents;
    if (done && plan.measure) {
      // Cover-all may stop at the server's cap: log what the refetched read model shows moved.
      try {
        const fresh = await qc.fetchQuery({ ...budgetQuery(month), staleTime: 0 });
        cents = assignedDelta(before, fresh.summary.envelopes, plan.measure);
      } catch {
        cents = null; // stays pending; the next open reconciles it against the read model
      }
    }
    busyRef.current = false;
    if (!mounted.current) {
      // The flow was left in the app while this write ran: the pass ends now.
      writeSaved(month, null, startedAt);
      return;
    }
    setBusy(false);
    const settle = (log: LogEntry[]) =>
      done
        ? log.map((entry) =>
            entry.id !== id
              ? entry
              : cents === null
                ? entry
                : {
                    id,
                    text: plan.measure ? `${eur(cents)} · ${plan.text}` : plan.text,
                    kind: plan.kind,
                    cents,
                    items: plan.items,
                    groupId: done.groupId,
                  },
          )
        : log.filter((entry) => entry.id !== id);
    setSaved((prev) => ({ ...prev, log: settle(prev.log) }));
    if (done) setFlowAction(planHistory(qc).snapshot());
    else setFailure({ action, text: `${plan.text} – fehlgeschlagen. ${failureText(caught)}` });
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
                  <dt>Erwartete Zahlungen (Einnahmen-Übersicht)</dt>
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
                onClick={() => writeSaved(month, null, startedAt)}
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
