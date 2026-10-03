import { defaultParams, RULE_DEFS, isRuleCode } from '@budget/domain';
import {
  CATS,
  MONTHS_LONG,
  SALARY,
  LAST_FULL,
  r2,
  referenceModel,
  type RefCategory,
} from '../reference/model';
import { monthEnd } from './cashflow';
import { INCOME_TYPES } from '@budget/db/schema';
import { ACC, CARD_PAYEES, catId, payeeId } from './master-data';
import type { SampleLedger } from './types';
import { cents, isoDate, pad2 } from './util';

type Planning = Pick<
  SampleLedger,
  | 'envelopeMonths'
  | 'expectedPayments'
  | 'expectedPaymentVersions'
  | 'savingsGoals'
  | 'plannedEvents'
  | 'fxRates'
  | 'rules'
  | 'ruleResults'
  | 'inboxItems'
  | 'payslips'
  | 'payslipLines'
>;

const CARD_SUBSCRIPTIONS = new Set(['streaming', 'ki1', 'ki2', 'cloud']);

/** Envelopes (plan per month), expected payments with versions, goals, events, rules, inbox, payslips, FX. */
export function buildPlanning(): Planning {
  const ref = referenceModel();

  // ---------- Envelope months: the prototype's plan as assigned amounts ----------
  // Periodic costs are saved as twelfths every month (not in their due month), and a special
  // payment's shares for investing and savings are assigned in the month it arrives (R12).
  // `fundByR03` (build.ts) then keeps every month funded by money that arrived before it.
  const envelopeMonths: Planning['envelopeMonths'] = [];
  for (const m of ref.months) {
    const row = ref.plan[m.k] as Record<string, number>;
    const spent = ref.spend[m.k] as Record<string, number>;
    const windfall = ((ref.income[m.k] as Record<string, number>)['Sonderzahlung'] ?? 0) > 0;
    for (const c of CATS) {
      const planned = row[c.id] as number;
      const assigned =
        c.kind === 'periodic'
          ? ref.periodicYear(c, m.y) / 12
          : windfall && c.transfer
            ? Math.max(planned, spent[c.id] as number)
            : planned;
      envelopeMonths.push({
        categoryId: catId(c.id),
        month: m.key,
        assignedCents: cents(assigned),
      });
    }
  }

  // ---------- Expected payments (versioned) ----------
  const expectedPayments: Planning['expectedPayments'] = [];
  const versions: Planning['expectedPaymentVersions'] = [];
  const addVersions = (
    epId: string,
    list: Array<{ from: string; amountCents: number; currency?: string }>,
  ) =>
    list.forEach((v, i) =>
      versions.push({
        id: `${epId}-v${i + 1}`,
        expectedPaymentId: epId,
        validFrom: v.from,
        amountCents: v.amountCents,
        currency: v.currency ?? 'EUR',
      }),
    );

  for (const c of CATS) {
    if (c.kind === 'fix') {
      const id = `ep-${c.id}`;
      expectedPayments.push({
        id,
        name: c.name,
        kind: 'outflow',
        accountId: CARD_SUBSCRIPTIONS.has(c.id)
          ? ACC.karte
          : c.id === 'kreditrate'
            ? ACC.giro
            : ACC.giro,
        payeeId: payeeId(c.payee as string),
        categoryId: catId(c.id),
        // The ETF plan is booked as one transfer per product account (depot 99 %, crypto 1 %):
        // the tolerance lets the depot leg count as the plan's payment.
        ...(c.id === 'investieren' ? { amountToleranceCents: 10_000 } : {}),
        rhythm: 'monthly',
        dueDay: c.due ?? 1,
        startDate: (c.price ?? c.usd)?.[0]?.[0]
          ? `${(c.price ?? c.usd)?.[0]?.[0]}-01`
          : '2023-10-01',
      });
      if (c.usd)
        addVersions(
          id,
          c.usd.map(([from, usd]) => ({
            from: `${from}-01`,
            amountCents: cents(usd),
            currency: 'USD',
          })),
        );
      else
        addVersions(
          id,
          (c.price ?? []).map(([from, amount]) => ({
            from: `${from}-01`,
            amountCents: cents(amount),
          })),
        );
    } else if (c.kind === 'periodic') {
      const events = c.events as Array<[number, number, number?]>;
      const months = [...new Set(events.map((e) => e[0]))];
      for (const month0 of months) {
        const id = `ep-${c.id}-${pad2(month0 + 1)}`;
        expectedPayments.push({
          id,
          name: months.length > 1 ? `${c.name} (${MONTHS_LONG[month0]})` : c.name,
          kind: 'outflow',
          accountId: CARD_PAYEES.has(c.payee as string) ? ACC.karte : ACC.giro,
          payeeId: payeeId(c.payee as string),
          categoryId: catId(c.id),
          rhythm: 'yearly',
          dueDay: 12,
          dueMonth: month0 + 1,
          startDate: '2023-10-01',
        });
        const own = events.filter((e) => e[0] === month0);
        const base = own.find((e) => e[2] === undefined);
        const list: Array<{ from: string; amountCents: number }> = [];
        if (base) list.push({ from: '2023-10-01', amountCents: cents(base[1]) });
        own
          .filter((e) => e[2] !== undefined)
          .forEach((e) => list.push({ from: `${e[2]}-01-01`, amountCents: cents(e[1]) }));
        addVersions(id, list);
      }
    }
  }
  // Special payments (Jun and Nov): the net amount follows the salary level.
  for (const month0 of [5, 10]) {
    const id = `ep-sonderzahlung-${pad2(month0 + 1)}`;
    expectedPayments.push({
      id,
      name: `Sonderzahlung (${MONTHS_LONG[month0]})`,
      kind: 'inflow',
      accountId: ACC.giro,
      payeeId: payeeId('Arbeitgeber'),
      incomeTypeId: INCOME_TYPES.special.id,
      rhythm: 'yearly',
      dueDay: 15,
      dueMonth: month0 + 1,
      startDate: '2023-10-01',
    });
    addVersions(
      id,
      SALARY.map((s) => ({ from: `${s.from}-01`, amountCents: cents(r2(s.gross * 0.772)) })),
    );
  }
  expectedPayments.push({
    id: 'ep-gehalt',
    name: 'Gehalt',
    kind: 'inflow',
    accountId: ACC.giro,
    payeeId: payeeId('Arbeitgeber'),
    incomeTypeId: INCOME_TYPES.salary.id,
    rhythm: 'monthly',
    // Payday is the last business day of the month (weekend and Austrian holidays skipped).
    dueDay: 31,
    dateShift: 'before',
    startDate: '2023-10-01',
  });
  addVersions(
    'ep-gehalt',
    SALARY.map((s) => ({ from: `${s.from}-01`, amountCents: cents(s.net) })),
  );
  expectedPayments.push({
    id: 'ep-beitrag',
    name: 'Beitrag zum Haushalt',
    kind: 'inflow',
    accountId: ACC.giro,
    payeeId: payeeId('Kontakt M. Muster'),
    incomeTypeId: INCOME_TYPES.contribution.id,
    rhythm: 'monthly',
    dueDay: 1,
    startDate: '2023-10-01',
  });
  addVersions('ep-beitrag', [
    { from: '2023-10-01', amountCents: 75000 },
    { from: '2025-01-01', amountCents: 80000 },
  ]);

  // ---------- Savings goals and planned events (from the prototype's sample plans) ----------
  const goal = (
    id: string,
    name: string,
    catName: string,
    target: number,
    due: [number, number],
  ) => ({
    id,
    name,
    targetCents: cents(target),
    targetDate: isoDate(due[0], due[1], 31),
    categoryId: catId((CATS.find((c) => c.name === catName) as RefCategory).id),
  });
  const savingsGoals: Planning['savingsGoals'] = [
    goal('goal-urlaub', 'Urlaub Sommer 2027', 'Reisen', 3000, [2027, 6]),
    goal('goal-fahrrad', 'Neues Fahrrad', 'Anschaffungen', 1200, [2027, 3]),
    goal('goal-weihnachten', 'Weihnachten 2026', 'Weihnachten', 800, [2026, 11]),
    goal('goal-kfz', 'Kfz-Service 2027', 'Kfz-Service', 580, [2027, 2]),
    goal('goal-hhvers', 'Haushaltsversicherung 2027', 'Haushaltsversicherung', 486, [2027, 0]),
  ];
  const plannedEvents: Planning['plannedEvents'] = [
    {
      id: 'ev-kinderzimmer',
      name: 'Kinderzimmer einrichten',
      date: '2026-12-05',
      amountCents: -250000,
      accountId: ACC.giro,
    },
    {
      id: 'ev-kinderwagen',
      name: 'Kinderwagen',
      date: '2027-01-10',
      amountCents: -90000,
      accountId: ACC.giro,
    },
    {
      id: 'ev-papamonat',
      name: 'Papamonat: kein Gehalt',
      date: '2027-02-28',
      amountCents: -381200,
      accountId: ACC.giro,
    },
    {
      id: 'ev-bonus',
      name: 'Familienzeitbonus (Schätzung)',
      date: '2027-03-10',
      amountCents: 160000,
      accountId: ACC.giro,
    },
  ];

  // ---------- FX: the rate of the booking day of the USD subscriptions ----------
  const fxRates: Planning['fxRates'] = [];
  for (const m of ref.months) {
    for (const day of [8, 14]) {
      fxRates.push({
        date: isoDate(m.y, m.m, day),
        currency: 'USD',
        rateMicro: Math.round(ref.fx[m.k]! * 1e6),
        source: 'ecb',
      });
    }
  }

  // ---------- Rules from RULE_CODES ----------
  const al = ref.alloc(Array.from({ length: 12 }, (_, i) => LAST_FULL - 11 + i));
  const pc = (['need', 'want', 'future'] as const).map((cl) =>
    Math.round((al[cl] / al.income) * 100),
  );
  const rest = 100 - pc[0]! - pc[1]! - pc[2]!;
  const r01 = `${pc.join(' / ')} % · ${rest < 0 ? `aus Guthaben −${-rest}` : `übrig ${rest}`} %`;
  const RULES: Array<[string, string, string, string, string]> = [
    ['R01', '50/30/20', r01, 'Ziel 50 / 30 / 20', 'ooowwoooowww'],
    ['R02', 'Notgroschen', '2,4 Monate', 'min. 3, Ziel 6 Monate', 'bbbbbbbbbbbb'],
    ['R03', 'Vom Vormonat leben', 'Geldalter 18 Tage', 'Ziel ≥ 30 Tage', 'wwwwwwwwwwww'],
    ['R04', 'Pay yourself first', 'am Gehaltstag gefüllt', 'Zukunft zuerst', 'oooooooooooo'],
    ['R05', 'Sinking Funds', '6 von 6 gedeckt', 'alle bei Fälligkeit', 'oooowooooooo'],
    ['R06', 'Kreditkarte', 'Saldo gedeckt', 'immer gedeckt', 'oooooooooooo'],
    ['R07', 'Dispo', 'Tiefpunkt 612 €', '≥ 0 € in 90 Tagen', 'oooooooooooo'],
    ['R08', 'Schuldenquote', '10,8 %', '≤ 30 %', 'oooooooooooo'],
    ['R09', 'Tilgungsreihenfolge', 'Sondertilgung aktiv', 'Zins > 5 %: tilgen', 'wwwwwwwwoooo'],
    ['R10', 'Fixkostenquote', '37,7 %', '≤ 55 %', 'oooooooooooo'],
    [
      'R11',
      'Lifestyle-Inflation',
      'Ausgaben +3,1 % · Einkommen +1,9 %',
      'Ausgaben ≤ Einkommen',
      'oooooowwoooo',
    ],
    ['R12', 'Windfall', 'Sonderzahlung verteilt', '10 % Genuss', 'oooooooooooo'],
    ['R13', 'Asset Allocation', 'Schwellenländer −4,0 Pp', '≤ 5 Pp Abweichung', 'ooooooowwwww'],
    ['R14', 'Klumpenrisiko', 'größte Position 4,5 %', 'Einzeltitel ≤ 10 %', 'oooooooooooo'],
    ['R15', 'Spekulativer Anteil', '14,2 %', '≤ 10 %', 'wwwwbbbbbbbb'],
    ['R16', 'Freiheitszahl', '8,9 %', 'Fortschritt steigt', 'oooooooooooo'],
  ];
  const statusOf = { o: 'ok', w: 'warn', b: 'bad' } as const;
  // R12 Windfall as data: of every special payment 50 % go to the ETF plan and 20 % to the emergency fund.
  const params: Record<string, object> = {
    R12: { windfallShares: { investieren: 0.5, notgroschen: 0.2 } },
  };
  const rules: Planning['rules'] = RULES.map(([code, name, , goal]) => ({
    id: `rule-${code.toLowerCase()}`,
    code,
    name,
    goal,
    stage: RULE_DEFS.find((d) => d.code === code)?.stage,
    action: RULE_DEFS.find((d) => d.code === code)?.action,
    sortOrder: RULE_DEFS.findIndex((d) => d.code === code) + 1,
    paramsJson: JSON.stringify({
      ...(isRuleCode(code) ? defaultParams(code) : {}),
      ...params[code],
    }),
  }));
  const ruleResults: Planning['ruleResults'] = [];
  for (const [code, , value, , hist] of RULES) {
    [...hist].forEach((ch, i) => {
      const k = 24 + i;
      ruleResults.push({
        id: `rr-${code.toLowerCase()}-${pad2(i + 1)}`,
        ruleId: `rule-${code.toLowerCase()}`,
        asOf: monthEnd(ref.months[k] as (typeof ref.months)[number]),
        status: statusOf[ch as 'o' | 'w' | 'b'],
        ...(i === 11 ? { valueText: value } : {}),
        actionNeeded: false,
      });
    });
  }

  const inboxItems: Planning['inboxItems'] = [
    {
      id: 'inbox-treibstoff',
      kind: 'overspent',
      title: 'Treibstoff ist überzogen',
      detail: '12,40 € überzogen: aus „Zu verteilen“ decken',
      refType: 'category',
      refId: catId('treibstoff'),
      urgent: true,
    },
    {
      id: 'inbox-unkategorisiert',
      kind: 'uncategorized',
      title: '4 Buchungen ohne Kategorie',
      detail: 'Vorschläge vorhanden, ein Klick je Buchung',
    },
    {
      id: 'inbox-p2p',
      kind: 'stale_value',
      title: 'P2P-Wert veraltet',
      detail: 'zuletzt aktualisiert vor 34 Tagen',
      refType: 'security',
      refId: 'sec-p2p',
    },
  ];

  // ---------- Payslips: gross − deductions = net, in cents ----------
  const payslips: Planning['payslips'] = [];
  const payslipLines: Planning['payslipLines'] = [];
  const line = (
    payslipId: string,
    section: 'earning' | 'deduction',
    label: string,
    amount: number,
    order: number,
  ) =>
    payslipLines.push({
      id: `${payslipId}-l${order}`,
      payslipId,
      section,
      label,
      amountCents: amount,
      sortOrder: order,
    });
  for (const row of ref.payroll) {
    const m = ref.months[row.k] as (typeof ref.months)[number];
    const regularId = `ps-${m.key}`;
    const grossC = cents(row.gross);
    const svC = cents(row.sv);
    const netC = cents(row.net);
    payslips.push({
      id: regularId,
      month: m.key,
      kind: 'regular',
      grossCents: grossC,
      netCents: netC,
    });
    line(regularId, 'earning', 'Bruttobezug', grossC, 1);
    line(regularId, 'deduction', 'Sozialversicherung', svC, 2);
    line(regularId, 'deduction', 'Lohnsteuer', grossC - svC - netC, 3);
    if (row.special) {
      const id = `ps-${m.key}-sz`;
      const sg = cents(row.special.gross);
      const ssv = cents(row.special.sv);
      const slst = cents(row.special.lst);
      const snet = cents(row.special.net);
      payslips.push({ id, month: m.key, kind: 'special', grossCents: sg, netCents: snet });
      line(id, 'earning', 'Sonderzahlung brutto', sg, 1);
      line(id, 'deduction', 'Sozialversicherung', ssv, 2);
      line(id, 'deduction', 'Lohnsteuer (6 %)', slst, 3);
      // The prototype's special-payment lines do not add up exactly; the remainder is shown, not hidden.
      const remainder = sg - ssv - slst - snet;
      if (remainder !== 0) line(id, 'deduction', 'Sonstige Abzüge', remainder, 4);
    }
  }

  return {
    envelopeMonths,
    expectedPayments,
    expectedPaymentVersions: versions,
    savingsGoals,
    plannedEvents,
    fxRates,
    rules,
    ruleResults,
    inboxItems,
    payslips,
    payslipLines,
  };
}
