import { coverShortfall, overspentEnvelopes, todayInVienna } from '@budget/domain';
import { Button, useAmountPrivacy } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { budgetQuery, coverAll } from '../budget/budget-api';
import { useCover } from '../budget/cover-choice';
import {
  coverSource,
  coverSourceLabel,
  freeCoverCents,
  isCard,
  planRows,
  type PlanRow,
} from '../budget/plan-model';
import { useBudgetWrite } from '../budget/use-category-writes';
import { eur } from '../ledger/format';
import { AppLink } from './app-link';

/**
 * Global status chip of the shell: how many envelopes of the current month are overspent and what
 * is needed to cover them. Same figures as Plan (`overspentEnvelopes`, `coverShortfall`); hidden
 * at 0 and while unknown. Opens a popover (bottom sheet on the phone) with the cover work.
 */
export function OverspentChip({ compact = false }: { compact?: boolean }) {
  useAmountPrivacy();
  const month = todayInVienna().slice(0, 7);
  const query = useQuery(budgetQuery(month));
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const write = useBudgetWrite();
  const nameOf = (cid: string) => query.data?.categories.find((c) => c.id === cid)?.name;
  const cover = useCover(month, nameOf);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      button.current?.focus();
    };
    const onOutside = (e: PointerEvent) => {
      if (
        e.target instanceof Node &&
        !root.current?.contains(e.target) &&
        !pop.current?.contains(e.target)
      )
        setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onOutside);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onOutside);
    };
  }, [open]);

  const data = query.data;
  if (!data) return null;
  const rows = planRows(data);
  const over = overspentEnvelopes({ envelopes: rows });
  if (over.length === 0) return null;
  const total = rows.reduce((sum, r) => sum + r.overspentCents, 0);
  const tba = data.summary.toBeAssignedCents;
  const pool = rows
    .filter((r) => !isCard(r) && freeCoverCents(r) > 0)
    .sort((a, b) => freeCoverCents(b) - freeCoverCents(a));
  const missing = coverShortfall(
    total,
    pool.map(freeCoverCents),
    tba,
    data.budgetMoney?.coverCapCents,
  );
  const noun = over.length === 1 ? 'Envelope' : 'Envelopes';
  const label = `${over.length} ${noun} überzogen, ${eur(total)} zu decken – Überziehungen prüfen`;
  const canCover = pool.length > 0 || tba > 0;
  const rowCover = (r: PlanRow) => {
    const source = coverSource(rows, r);
    return void cover(r, source ? source.id : null);
  };
  const all = () =>
    void write(
      () => coverAll(month),
      (res) =>
        `${res.coveredCount} gedeckt, ${res.openCount} offen · ${eur(res.missingCents)} fehlen${res.openCount > 0 ? ' · auf freies Geld begrenzt' : ''}`,
    );

  // The phone sheet is fixed to the screen; a portal keeps it above the tab bar and FAB.
  const inShell = (node: ReactNode) => (compact ? createPortal(node, document.body) : node);
  return (
    <div className="overspent-chip" ref={root}>
      <button
        ref={button}
        type="button"
        className="overspent-chip-btn"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        aria-haspopup="dialog"
        onClick={() => setOpen(!open)}
      >
        <AlertTriangle size={16} strokeWidth={1.75} aria-hidden="true" />
        <span aria-hidden="true">
          {compact ? over.length : `${over.length} überzogen · ${eur(total)}`}
        </span>
      </button>
      {open &&
        inShell(
          <div
            ref={pop}
            id={id}
            className="overspent-pop"
            role="dialog"
            aria-label="Überzogene Envelopes"
          >
            <h2 className="overspent-title">
              {over.length} {noun} überzogen · {eur(total)} zu decken
            </h2>
            <ul className="overspent-list">
              {over.map((r) => (
                <li key={r.categoryId} data-overspent-row={r.categoryId}>
                  <span>
                    {nameOf(r.categoryId)} · {eur(-r.availableCents)}
                  </span>
                  {canCover && (
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`${nameOf(r.categoryId)} decken`}
                      onClick={() => rowCover(rows.find((x) => x.id === r.categoryId)!)}
                    >
                      Decken
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            {missing > 0 ? (
              <p className="overspent-missing" role="note">
                Es fehlen {eur(missing)} – Geld kommt nur durch Einnahmen oder Umbuchungen auf ein
                Budget-Konto.
              </p>
            ) : (
              <>
                <p className="panel-sub">Quellen, größtes Guthaben zuerst:</p>
                <ul className="overspent-sources">
                  {pool.slice(0, 3).map((r) => (
                    <li key={r.id}>{coverSourceLabel(r)}</li>
                  ))}
                  {tba > 0 && <li>Zu verteilen · {eur(tba)}</li>}
                </ul>
                <Button variant="alert" onClick={all}>
                  Alle decken
                </Button>
              </>
            )}
            {missing > 0 && (
              <AppLink
                className="btn btn-ghost"
                to="/plan/monat"
                search={{ monat: month, ansicht: 'triage' }}
                onClick={() => setOpen(false)}
              >
                Im Detail lösen
              </AppLink>
            )}
          </div>,
        )}
    </div>
  );
}
