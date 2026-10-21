import { describe, expect, it } from 'vitest';
import {
  parseCardDocument,
  planCardRows,
  type CardBookingCandidate,
  type CardParseContext,
} from './statement-automation';

// Fixed columns model synthetic extractor output, not real statements or account identifiers.
const SHA = 'a'.repeat(64),
  TOKEN = 'c'.repeat(64),
  OTHER = 'd'.repeat(64);
const columns = (cells: readonly (readonly [number, string])[]) => {
  let line = '';
  for (const [at, text] of cells) {
    if (line.length > at) throw new Error('Synthetic columns overlap');
    line = line.padEnd(at) + text;
  }
  return line;
};
const context = (): CardParseContext => ({
  accountId: 'synthetic-card',
  currency: 'EUR',
  mappingKey: 'synthetic-mapping',
  mappedCardAccounts: { [TOKEN]: 'synthetic-card' },
  cardIdentity: (raw) => ({ fingerprint: raw === '2222' ? OTHER : TOKEN, hint: '****1111' }),
  previous: {
    intakeId: 'synthetic-previous',
    sha256: 'b'.repeat(64),
    revision: 'previous-revision',
    accountId: 'synthetic-card',
    mappingKey: 'synthetic-mapping',
    currency: 'EUR',
    cardTokens: [TOKEN],
    issueDate: '2030-12-04',
    payableCents: 10000,
  },
});
const consumerHeader = columns([
  [0, 'Karte'],
  [10, 'Umsatz'],
  [20, 'Buchung'],
  [30, 'Buchungstext'],
  [65, 'Branche'],
  [80, 'Betrag'],
  [95, 'Kurs'],
  [110, 'EUR Betrag'],
]);
const consumerRow = (description: string, amount: string, date = '30.12.', card = '1111') =>
  columns([
    [0, card],
    [10, date],
    [20, date],
    [30, description],
    [110, amount],
  ]);
const consumer = () =>
  [
    'Datum 04.01.2031',
    'Datum nächste Umsatznachricht 04.02.2031',
    'Wird eingezogen am 12.01.2031',
    'Saldo 70,00-',
    consumerHeader,
    consumerRow('Zahlung', '100,00+', '10.12.'),
    consumerRow('Synthetic merchant', '70,00-'),
  ].join('\n');
const companyHeader = columns([
  [0, 'Datum'],
  [12, 'Bezogen von'],
  [36, 'Produkt'],
  [52, 'Menge'],
  [64, 'Einheit'],
  [74, 'Preis pro'],
  [88, 'Rabatt pro'],
  [104, 'Total Netto'],
  [122, 'MwSt'],
  [136, 'MwSt'],
  [150, 'Total Brutto in'],
]);
const companyContinuation = columns([
  [104, 'Netto in EUR'],
  [122, 'Satz %'],
  [136, 'Betrag'],
  [150, 'EUR'],
]);
const companyPurchase = columns([
  [0, '30.12.2030'],
  [12, 'Synthetic station'],
  [36, 'Diesel'],
  [52, '50,000'],
  [64, 'Liter'],
  [74, '1,500000'],
  [88, '0,020000'],
  [104, '74,00'],
  [122, '20,00%'],
  [136, '14,80'],
  [150, '88,80'],
]);
const companyTotal = (label: string) =>
  columns([
    [0, label],
    [104, '74,00'],
    [136, '14,80'],
    [150, '88,80'],
  ]);
const company = () =>
  [
    'Rechnungsnummer SYNTHETIC-741',
    'Rechnungsdatum 04.01.2031',
    'Einzugsdatum 12.01.2031',
    'Kartennummer: 1111',
    companyHeader,
    companyContinuation,
    companyPurchase,
    companyTotal('Gesamt Kartensumme'),
    companyTotal('Gesamt Firmensumme'),
  ].join('\n');
const parseCompany = () => parseCardDocument(company(), SHA, { ...context(), previous: null });
const candidate = (patch: Partial<CardBookingCandidate> = {}): CardBookingCandidate => ({
  id: 'existing-expense',
  revision: 'booking-revision',
  accountId: 'synthetic-card',
  currency: 'EUR',
  date: '2030-12-30',
  amountCents: -8880,
  counterpartyKey: 'synthetic station diesel',
  rebateConsumed: false,
  creditCategoryIds: [],
  singleExpenseCategoryId: 'fuel',
  singleExpenseSplitId: 'existing-split',
  singleExpenseSplitRevision: 'split-revision',
  ...patch,
});

describe('synthetic issued-card extraction', () => {
  it('uses the prior issued boundary across New Year and reconciles signed payment plus expense', () => {
    const doc = parseCardDocument(consumer(), SHA, context());
    expect(doc.reasons).toEqual([]);
    expect(doc.totalsVerified).toBe(true);
    expect(doc.identity).toMatchObject({
      kind: 'issued_date',
      issueDate: '2031-01-04',
      reference: null,
    });
    expect(doc.summary.fields.payableCents.value).toBe(7000);
    expect(doc.rows.map((r) => [r.kind, r.amountCents, r.bookingDate])).toEqual([
      ['payment', 10000, '2030-12-10'],
      ['purchase', -7000, '2030-12-30'],
    ]);
    expect(doc.rows.every((r) => r.dateOrigin === 'statement_boundaries')).toBe(true);
    expect(planCardRows(doc, [], [])[0]).toMatchObject({
      kind: 'pending',
      reason: 'settlement_match_required',
    });
  });

  it('retains a wrapped description but rejects a disguised numeric continuation', () => {
    const wrapped = consumer() + '\n' + columns([[30, 'second description line']]);
    const doc = parseCardDocument(wrapped, SHA, context());
    expect(doc.reasons).toEqual([]);
    expect(doc.rows[1]!.description).toBe('Synthetic merchant second description line');
    const bad = parseCardDocument(
      wrapped +
        '\n' +
        columns([
          [30, 'hidden charge'],
          [110, '10,00-'],
        ]),
      SHA,
      context(),
    );
    expect(bad.reasons).toContain('unrecognized_table_row');
    expect(planCardRows(bad, [], []).every((a) => a.kind === 'pending')).toBe(true);
  });

  it.each([
    ['missing previous', { ...context(), previous: null }, 'previous_source_required'],
    [
      'changed previous mapping',
      { ...context(), previous: { ...context().previous!, mappingKey: 'changed' } },
      'previous_source_changed',
    ],
    [
      'changed previous card',
      { ...context(), previous: { ...context().previous!, cardTokens: [OTHER] } },
      'previous_card_mismatch',
    ],
    ['unmapped card', { ...context(), mappedCardAccounts: {} }, 'card_mapping_required'],
  ] as const)('keeps %s unresolved', (_label, ctx, reason) => {
    const doc = parseCardDocument(consumer(), SHA, ctx);
    expect(doc.reasons).toContain(reason);
    expect(planCardRows(doc, [], []).every((a) => a.kind === 'pending')).toBe(true);
  });

  it.each([
    ['70,00-', '70,00', 'row_amount_or_fee_unavailable'],
    ['70,00-', '70,000-', 'row_amount_or_fee_unavailable'],
    ['30.12.', '31.02.', 'row_year_unavailable'],
    ['EUR Betrag', 'USD Betrag', 'statement_currency_unavailable'],
  ])('does not infer a safe row from %s → %s', (from, to, reason) => {
    // Replace the last occurrence: the transaction, not the summary's same amount.
    const text = consumer(),
      at = text.lastIndexOf(from);
    const doc = parseCardDocument(
      text.slice(0, at) + to + text.slice(at + from.length),
      SHA,
      context(),
    );
    expect(doc.reasons).toContain(reason);
    expect(planCardRows(doc, [], []).every((a) => a.kind === 'pending')).toBe(true);
  });

  it('keeps cash withdrawals unresolved while preserving the amount column', () => {
    const text = consumer().replace(
      consumerRow('Synthetic merchant', '70,00-'),
      consumerRow('Bargeldbehebung', '70,00-'),
    );
    const doc = parseCardDocument(text, SHA, context());
    expect(doc.reasons).toContain('row_kind_unavailable');
    expect(doc.rows[1]!.amountCents).toBe(-7000);
    expect(planCardRows(doc, [], []).every((a) => a.kind === 'pending')).toBe(true);
  });

  it('rejects closing mismatches, additional cards and financial rows outside a closed table', () => {
    expect(
      parseCardDocument(consumer().replace('Saldo 70,00-', 'Saldo 71,00-'), SHA, context()).reasons,
    ).toContain('closing_total_unverified');
    const extraCard = consumer().replace('1111      30.12.', '2222      30.12.');
    expect(parseCardDocument(extraCard, SHA, context()).reasons).toContain('card_mapping_required');
    const closed = consumer() + '\nSeite 1 von 1\n' + consumerRow('Hidden merchant', '1,00-');
    expect(parseCardDocument(closed, SHA, context()).reasons).toContain(
      'transaction_outside_table',
    );
  });
});

describe('synthetic company-card extraction and conservative planning', () => {
  it('proves printed net/VAT/gross totals and a 120-cent rebate on unchanged 9000-cent gross', () => {
    const doc = parseCompany();
    expect(doc.reasons).toEqual([]);
    expect(doc.totalsVerified).toBe(true);
    expect(doc.summary.fields.payableCents.value).toBe(8880);
    expect(doc.rows).toHaveLength(1);
    expect(doc.rows[0]).toMatchObject({
      amountCents: -8880,
      transactionDate: '2030-12-30',
      bookingDate: '2030-12-30',
      dateOrigin: 'printed',
      rebate: { originalGrossCents: 9000, chargedGrossCents: 8880, creditCents: 120 },
    });
    const gross = candidate({ amountCents: -9000 }),
      before = JSON.stringify(gross);
    expect(planCardRows(doc, [gross], [])).toMatchObject([
      {
        kind: 'rebate',
        creditCents: 120,
        creditDate: '2030-12-30',
        booking: { amountCents: -9000 },
      },
    ]);
    expect(JSON.stringify(gross)).toBe(before);
  });

  it('links an already-net booking without another credit; a new net expense requires one automatic category', () => {
    const doc = parseCompany(),
      assignment = {
        rowKey: doc.rows[0]!.key,
        categoryId: 'fuel',
        ruleId: 'rule',
        ruleRevision: 'r1',
      };
    expect(planCardRows(doc, [candidate()], [])).toMatchObject([{ kind: 'link' }]);
    expect(planCardRows(doc, [], [assignment])).toMatchObject([
      { kind: 'create', row: { amountCents: -8880 } },
    ]);
    for (const choices of [[], [assignment, { ...assignment, ruleId: 'other' }]])
      expect(planCardRows(doc, [], choices)).toMatchObject([
        { kind: 'pending', reason: 'automatic_category_required' },
      ]);
  });

  it.each([
    [
      'missing card subtotal',
      (text: string) => text.replace(companyTotal('Gesamt Kartensumme') + '\n', ''),
      'card_subtotal_required',
    ],
    [
      'bad card subtotal',
      (text: string) =>
        text.replace(
          companyTotal('Gesamt Kartensumme'),
          companyTotal('Gesamt Kartensumme').replace('88,80', '88,81'),
        ),
      'card_subtotal_unverified',
    ],
    [
      'bad row VAT',
      (text: string) => text.replace(companyPurchase, companyPurchase.replace('14,80', '14,81')),
      'row_totals_unavailable',
    ],
    [
      'missing company total',
      (text: string) => text.replace(companyTotal('Gesamt Firmensumme'), ''),
      'company_subtotal_required',
    ],
    [
      'row after final total',
      (text: string) => text + '\n' + companyPurchase,
      'transaction_outside_table',
    ],
  ] as const)('refuses %s without manufacturing a posting', (_label, change, reason) => {
    const doc = parseCardDocument(change(company()), SHA, { ...context(), previous: null });
    expect(doc.reasons).toContain(reason);
    expect(
      planCardRows(doc, [candidate({ amountCents: -9000 })], []).every((a) => a.kind === 'pending'),
    ).toBe(true);
  });

  it('requires the same exact economic match and refuses duplicate, partial and consumed originals', () => {
    const doc = parseCompany();
    const scenarios: [CardBookingCandidate[], string][] = [
      [[candidate(), candidate({ id: 'duplicate' })], 'multiple_existing_matches'],
      [[candidate({ singleExpenseSplitId: null })], 'whole_expense_match_required'],
      [
        [candidate({ amountCents: -9000, rebateConsumed: true })],
        'original_credit_already_consumed',
      ],
      [
        [
          candidate({ amountCents: -9000 }),
          candidate({
            id: 'credit',
            amountCents: 120,
            date: '2030-12-31',
            creditCategoryIds: ['fuel'],
          }),
        ],
        'existing_credit_requires_review',
      ],
      [
        [candidate({ counterpartyKey: 'another merchant' })],
        'plausible_existing_movement_requires_review',
      ],
    ];
    for (const [candidates, reason] of scenarios)
      expect(planCardRows(doc, candidates, [])).toMatchObject([{ kind: 'pending', reason }]);
    const duplicated = {
      ...doc,
      rows: [doc.rows[0]!, { ...doc.rows[0]!, key: 'other-source-row' }],
    };
    expect(
      planCardRows(duplicated, [candidate()], []).map((a) =>
        a.kind === 'pending' ? a.reason : a.kind,
      ),
    ).toEqual(['rows_compete_for_existing_booking', 'rows_compete_for_existing_booking']);
  });

  it('never treats an unproven discount formula as an independent credit', () => {
    const doc = parseCardDocument(company().replace('0,020000', '0,030000'), SHA, {
      ...context(),
      previous: null,
    });
    expect(doc.totalsVerified).toBe(true);
    expect(doc.rows[0]!.rebate).toBeNull();
    expect(planCardRows(doc, [candidate({ amountCents: -9000 })], [])).toMatchObject([
      { kind: 'pending', reason: 'plausible_existing_movement_requires_review' },
    ]);
  });
});
