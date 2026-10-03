import { addDays, addMonths, lastDayOfMonth, monthOf, monthsBetween } from '../date';
import { cents, formatEuro, MINUS } from '../money';
import { mulDivRound, ratioBp } from '../wealth/int';
import { formatPercent as pc } from './format';
import { resolveParams, type RuleCode, type RuleParams } from './params';
import type { BookRuleInputs, RuleEvaluation, RuleInputs, RuleStatus } from './types';

/** Calendar-year window (start exclusive, end inclusive), clamped at leap/month ends. */
export function bookWindow(asOf: string, months = 12): { from: string; to: string } {
  const month = addMonths(monthOf(asOf), -months);
  const anniversary = `${month}-${asOf.slice(8)}`;
  return {
    from: addDays(anniversary > lastDayOfMonth(month) ? lastDayOfMonth(month) : anniversary, 1),
    to: asOf,
  };
}

const fullMonths = (i: RuleInputs, n = 12) =>
  monthsBetween(addMonths(i.refMonth, 1 - n), i.refMonth);
const eur = (n: number) => formatEuro(cents(n), { cents: false });
const sum = <T>(rows: ReadonlyArray<T>, pick: (row: T) => number) =>
  rows.reduce((a, r) => a + pick(r), 0);
const datedSum = (i: RuleInputs, rows: ReadonlyArray<{ day: string; cents: number }>) => {
  const w = bookWindow(i.asOf);
  return sum(
    rows.filter((r) => r.day >= w.from && r.day <= w.to),
    (r) => r.cents,
  );
};
const gross = (i: RuleInputs, b: BookRuleInputs) => {
  const w = bookWindow(i.asOf);
  return sum(
    b.payslips.filter((r) => r.day >= w.from && r.day <= w.to),
    (r) => r.grossCents,
  );
};
const meets = (n: number, target: number, min: number): RuleStatus =>
  n >= target ? 'ok' : n >= min ? 'warn' : 'bad';
const over = (n: number, max: number, distance: number): RuleStatus =>
  n <= max ? 'ok' : n <= max + distance ? 'warn' : 'bad';
const result = (
  status: RuleStatus,
  valueText: string,
  action: string,
  detail: Record<string, unknown>,
): RuleEvaluation => ({
  status,
  valueText,
  actionNeeded: status !== 'ok',
  actionText: status === 'ok' ? null : action,
  detail,
});
const funds = (b: BookRuleInputs, exclude: boolean) =>
  b.positions.filter(
    (r) =>
      (r.kind === 'etf' || r.kind === 'fund') &&
      r.valueCents > 0 &&
      (!exclude || r.leverageFactor <= 10),
  );
const ageMonths = (birth: string, day: string) => {
  const [by, bm] = birth.split('-').map(Number) as [number, number];
  const [y, m] = day.split('-').map(Number) as [number, number];
  return (y - by) * 12 + m - bm;
};

/** Null evaluations carry their explanation separately: no invented ok/warn/bad result is stored. */
export function bookUnavailableReason(
  code: RuleCode,
  params: unknown,
  i: RuleInputs,
): string | null {
  if (!['R17', 'R18', 'R19', 'R20', 'R21', 'R22'].includes(code)) return null;
  const b = i.books;
  if (!b) return 'Quelldaten für die Buchregeln fehlen.';
  const p = resolveParams(code, params);
  if (code === 'R17' || code === 'R18') {
    const missing = fullMonths(i).filter(
      (m) => !b.payslips.some((s) => s.month === m && s.day <= i.asOf),
    );
    if (missing.length) return `Gehaltszettel fehlen im Fenster: ${missing.join(', ')}.`;
    if (gross(i, b) <= 0) return 'Kein positives Bruttoeinkommen im Fenster.';
    if (b.flowUnavailableReason) return b.flowUnavailableReason;
    if (code === 'R17' && p['includeEmployerPension'] === true) {
      const w = bookWindow(i.asOf);
      const months = monthsBetween(monthOf(w.from), monthOf(w.to));
      const missingPension = months.filter((m) => !b.employerPension.some((r) => r.month === m));
      if (missingPension.length)
        return `Arbeitgeberbeitrag fehlt im Fenster: ${missingPension.join(', ')}. Auch 0 bitte ausdrücklich erfassen.`;
    }
    if (code === 'R18') {
      if (!b.birthMonth) return 'Geburtsmonat und Jahr fehlen in Einstellungen › Regelwerk.';
      if (ageMonths(b.birthMonth, i.asOf) < Number(p['minAge']) * 12)
        return 'Alter liegt unter dem konfigurierten Mindestalter.';
    }
  }
  if (code === 'R19' && fullMonths(i, 24).some((m) => !b.assignments.some((r) => r.month === m)))
    return 'Für den Vergleich fehlen 24 abgeschlossene Budgetmonate.';
  if (code === 'R19') {
    const previous = b.assignments.filter((r) => fullMonths(i, 24).slice(0, 12).includes(r.month));
    if (sum(previous, (r) => r.incomeCents) <= 0)
      return 'Positive Einkommensbasis im Vorjahresfenster fehlt.';
  }
  if (code === 'R20') {
    if (fullMonths(i)[0]! < b.firstMonth)
      return 'Es fehlen zwölf abgeschlossene Monate der Anlagehistorie.';
    if (b.flowUnavailableReason) return b.flowUnavailableReason;
  }
  if (code === 'R21' && b.investmentValueCents <= 0) return 'Positiver Investmentwert fehlt.';
  if (code === 'R22') {
    const rows = funds(b, p['excludeLeveraged'] === true);
    const total = sum(rows, (r) => r.valueCents);
    if (total <= 0) return 'Keine bewertbaren ETF- oder Fondspositionen im Kostenfenster.';
    const unknown = rows.filter((r) => r.terBp === 0);
    const count = new Set(unknown.map((r) => r.securityId)).size;
    if (!rows.some((r) => r.terBp > 0))
      return `TER fehlt bei ${count} Wertpapieren; keine bekannte TER für die Gewichtung.`;
    // Compare exactly, so rounding cannot hide a share just above the limit.
    if (
      BigInt(sum(unknown, (r) => r.valueCents)) * 100n >
      BigInt(total) * BigInt(Number(p['maxUnknownSharePct']))
    )
      return `TER fehlt bei ${count} Wertpapieren; unbekannter Fondswert über ${String(p['maxUnknownSharePct'])} %.`;
  }
  return null;
}

export function evaluateBookRule(
  code: RuleCode,
  params: unknown,
  i: RuleInputs,
): RuleEvaluation | null {
  if (bookUnavailableReason(code, params, i)) return null;
  const b = i.books;
  if (!b) return null;
  switch (code) {
    case 'R17': {
      const p = resolveParams(code, params) as RuleParams<'R17'>;
      const grossCents = gross(i, b);
      const ownCents = datedSum(i, b.investmentFlows);
      // Monthly contributions accrue evenly over calendar days, including leap February.
      const w = bookWindow(i.asOf);
      const employerCents = p.includeEmployerPension
        ? sum(b.employerPension, (r) => {
            const first = `${r.month}-01`,
              last = lastDayOfMonth(r.month);
            const from = first > w.from ? first : w.from,
              to = last < w.to ? last : w.to;
            if (to < from) return 0;
            const days = (Date.parse(to) - Date.parse(from)) / 86_400_000 + 1;
            return mulDivRound(r.cents, days, Number(last.slice(8)));
          })
        : 0;
      const quote = ratioBp(ownCents + employerCents, grossCents);
      const ownBp = ratioBp(ownCents, grossCents);
      const missingCents = Math.max(
        0,
        mulDivRound(grossCents, p.targetBp, 10_000) - ownCents - employerCents,
      );
      const raw = meets(quote, p.targetBp, p.minBp);
      return result(
        raw === 'bad' && p.maxSeverity === 'warn' ? 'warn' : raw,
        `${pc(quote)} (eigene ${pc(ownBp)})`,
        `Sparplan um ${eur(mulDivRound(missingCents, 1, 12))} im Monat erhöhen, um ${pc(p.targetBp)} zu erreichen.`,
        { ...w, grossCents, ownCents, employerCents, ownBp, quoteBp: quote, missingCents },
      );
    }
    case 'R18': {
      const p = resolveParams(code, params) as RuleParams<'R18'>;
      const income =
        gross(i, b) +
        datedSum(i, b.sideIncome) +
        (p.includeCapitalIncome ? datedSum(i, b.capitalIncome) : 0);
      const expectedCents = mulDivRound(income, ageMonths(b.birthMonth!, i.asOf), 120);
      if (expectedCents <= 0) return null;
      const indexX100 = mulDivRound(b.netWorthCents, 100, expectedCents);
      const index = `${indexX100 < 0 ? MINUS : ''}${Math.trunc(Math.abs(indexX100) / 100)},${String(Math.abs(indexX100) % 100).padStart(2, '0')}`;
      const note =
        'Richtwert aus US-Daten der 1990er; bei schwankendem Einkommen eingeschränkt. Erbschaften lassen sich nicht herausrechnen; ohne Pensionsansprüche und Pensionskassen-Guthaben.';
      return result(
        indexX100 >= p.okFromX100 ? 'ok' : 'warn',
        `Index ${index} (Soll ${eur(expectedCents)}, Ist ${eur(b.netWorthCents)})`,
        `Abstand zum Richtwert: ${eur(Math.max(0, expectedCents - b.netWorthCents))}. Sparquote R17 oder Einkommen prüfen.`,
        {
          expectedCents,
          actualCents: b.netWorthCents,
          indexX100,
          belowLowerBenchmark: indexX100 < p.warnFromX100,
          aboveAverage: indexX100 >= p.aboveAverageX100,
          note,
        },
      );
    }
    case 'R19': {
      const p = resolveParams(code, params) as RuleParams<'R19'>;
      const months = fullMonths(i, 24);
      const prev = b.assignments.filter((r) => months.slice(0, 12).includes(r.month));
      const cur = b.assignments.filter((r) => months.slice(12).includes(r.month));
      const previousIncome = sum(prev, (r) => r.incomeCents);
      const deltaIncome = sum(cur, (r) => r.incomeCents) - previousIncome;
      const growthBp = ratioBp(deltaIncome, previousIncome);
      if (deltaIncome <= 0 || growthBp < p.minGrowthBp)
        return result('ok', 'kein Einkommenszuwachs', '', { growthBp, applicable: false });
      const deltaFuture = sum(cur, (r) => r.futureCents) - sum(prev, (r) => r.futureCents);
      const rateBp = ratioBp(deltaFuture, deltaIncome);
      const missing = Math.max(0, mulDivRound(deltaIncome, p.targetBp, 10_000) - deltaFuture);
      return result(
        meets(rateBp, p.targetBp, p.minBp),
        pc(rateBp),
        `Von der Erhöhung mehr für Zukunft zuweisen: ${eur(mulDivRound(missing, 1, 12))} im Monat bis ${pc(p.targetBp)}.`,
        {
          growthBp,
          deltaIncomeCents: deltaIncome,
          deltaFutureCents: deltaFuture,
          rateBp,
          applicable: true,
        },
      );
    }
    case 'R20': {
      const p = resolveParams(code, params) as RuleParams<'R20'>;
      const strip = fullMonths(i).map((month) => {
        const r = b.activity.find((r) => r.month === month);
        const repayment =
          p.exemptDebtPriority &&
          (r?.extraRepaymentCents ?? 0) > 0 &&
          r?.loans.some((l) => l.balanceCents > 0 && l.rateBp > b.debtPriorityRateBp) === true;
        return {
          month,
          fulfilled: r?.bought === true || r?.deposited === true || repayment,
          repayment,
        };
      });
      const months = strip.filter((r) => r.fulfilled).length;
      const note =
        'Unvollständige Trade- oder Einzahlungshistorie kann einen falschen Status erzeugen.';
      return result(
        meets(months, p.okMonths, p.warnMonths),
        `${months} von 12 Monaten`,
        'Sparplan und fehlende Monate prüfen; Käufe oder Einzahlungen vollständig erfassen.',
        { strip, note },
      );
    }
    case 'R21': {
      const p = resolveParams(code, params) as RuleParams<'R21'>;
      const value = sum(
        b.positions.filter((r) => r.leverageFactor > 10),
        (r) => r.valueCents,
      );
      const debit = sum(
        b.platformBalances.filter((r) => r.balanceCents < -p.ignoreBelowCents),
        (r) => -r.balanceCents,
      );
      const leverageBp = ratioBp(value, b.investmentValueCents),
        debitBp = debit > 0 ? Math.max(1, ratioBp(debit, b.investmentValueCents)) : 0;
      const leverage = over(leverageBp, p.leverageMaxBp, p.leverageBadOverBp);
      const debt: RuleStatus =
        debitBp > p.debitBadOverBp
          ? 'bad'
          : debitBp >= p.debitWarnFromBp && debit > 0
            ? 'warn'
            : 'ok';
      const severity = { ok: 0, warn: 1, bad: 2 };
      const exposure = sum(
        b.positions.filter((r) => r.leverageFactor > 10),
        (r) => mulDivRound(r.valueCents, r.leverageFactor - 10, 10),
      );
      const equity = b.investmentValueCents - debit;
      return result(
        severity[leverage] >= severity[debt] ? leverage : debt,
        `Hebel ${pc(leverageBp)} · Plattform-Minus ${pc(debitBp)}`,
        'Hebelpositionen nicht weiter aufstocken und negative Verrechnungskonten ausgleichen.',
        {
          leverageBp,
          debitBp,
          debitCents: debit,
          exposureBp: equity > 0 ? ratioBp(exposure, equity) : null,
          note: 'R09 prüft nur Kreditkonten; Depot-Verrechnungskonten werden hier geprüft.',
        },
      );
    }
    case 'R22': {
      const p = resolveParams(code, params) as RuleParams<'R22'>;
      const rows = funds(b, p.excludeLeveraged);
      const known = rows.filter((r) => r.terBp > 0);
      const knownValue = sum(known, (r) => r.valueCents);
      if (knownValue <= 0) return null;
      // Weight known TER only: unknown TER is never assumed to be free.
      const weighted = known.reduce((n, r) => n + BigInt(r.valueCents) * BigInt(r.terBp), 0n);
      const costBp = Number((weighted + BigInt(knownValue) / 2n) / BigInt(knownValue));
      const unknownCount = new Set(rows.filter((r) => r.terBp === 0).map((r) => r.securityId)).size;
      const feesBp =
        b.tradingFeesCents !== null &&
        b.averagePortfolioCents !== null &&
        b.averagePortfolioCents > 0
          ? ratioBp(b.tradingFeesCents, b.averagePortfolioCents)
          : null;
      const leveraged = b.positions.filter(
        (r) => (r.kind === 'etf' || r.kind === 'fund') && r.leverageFactor > 10,
      );
      return result(
        over(costBp, p.maxBp, p.badOverBp),
        `${pc(costBp)} · Handel ${feesBp === null ? 'nicht bewertbar' : pc(feesBp)}`,
        'TER prüfen und bei neuen Einzahlungen günstigere Fonds derselben Anlageklasse wählen.',
        {
          costBp,
          unknownCount,
          unknownValueCents: sum(rows, (r) => (r.terBp === 0 ? r.valueCents : 0)),
          feesBp,
          tradingFeesCents: b.tradingFeesCents,
          averagePortfolioCents: b.averagePortfolioCents,
          leveraged,
          note: `TER fehlt bei ${unknownCount} Wertpapieren. Gewichtung nur bekannter TER; Handelskosten nur Anzeige. Hebelfonds ${p.excludeLeveraged ? 'separat' : 'einbezogen'}.`,
        },
      );
    }
    default:
      return null;
  }
}
