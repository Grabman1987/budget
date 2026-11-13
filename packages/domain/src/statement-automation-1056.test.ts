import { describe, expect, it } from 'vitest';
import { parseCardDocument, planCardRows, type CardParseContext } from './statement-automation';

// Invented merchants and amounts. The column geometry models extractor output in which the
// single-spaced header does not line up with the data rows (rows start left/right of the
// header words), with foreign-currency, fee and final-amount columns and a page break.
const SHA = 'e'.repeat(64),
  TOKEN = 'c'.repeat(64);
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
  cardIdentity: () => ({ fingerprint: TOKEN, hint: '****1111' }),
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
const header = () => [
  columns([
    [96, 'Fremd-'],
    [103, 'Spesen-'],
    [111, 'EUR'],
  ]),
  columns([
    [72, 'Fremd-'],
    [84, 'Ref.-'],
  ]),
  '   Karte Umsatz Buchung Buchungstext   Branche      Ortsangabe  Betrag      Kurs        EUR Betrag Bearbeit- Spesen-',
  columns([
    [72, 'währung'],
    [84, 'Kurs*'],
    [107, 'Endbetrag'],
  ]),
  columns([
    [96, 'anteil'],
    [104, 'anteil'],
  ]),
];
// card, date, booked, description, branch, location, foreign block, final amount.
const row = (
  card: string,
  date: string,
  description: string,
  branch: string,
  location: string,
  final: string,
  foreign?: string,
) =>
  columns([
    [4, card],
    [6, date],
    [12, date],
    [18, description],
    ...(branch ? ([[37, branch]] as const) : []),
    ...(location ? ([[50, location]] as const) : []),
    ...(foreign ? ([[66, foreign]] as const) : []),
    [118 - final.length, final],
  ]);
const statement = (saldo = '368,68-') =>
  [
    'Synthetic Card Service',
    '     Kartenkonto                                            4000 12XX XXXX 1111',
    '     Kartentyp                                              Synthetic Classic',
    '     Datum                                                  04.01.2031',
    '     Datum n ä chste Umsatznachricht                        04.02.2031',
    '     Wird eingezogen am                                     12.01.2031',
    `     Saldo                                                  ${saldo}`,
    '  Synthetic notice text without figures.',
    ...header(),
    row('', '10.12', 'Zahlung erhalten', '', '', '100,00 +'),
    row('1', '12.12', 'Synthetic Bakery', 'Lebensm.', 'Musterort', '12,40 -'),
    row(
      '1',
      '14.12',
      'Synthetic Hotel',
      'Hotel',
      'example.test',
      '74,84 -',
      '80,00 USD 1,085000     73,73 - 1,11 -',
    ),
    row('1', '18.12', 'Synthetic Webshop', 'Versand', '0123456789', '234,56 -'),
    columns([[18, 'order synthetic']]),
    '  10560_1/2_000001',
    row('1', '22.12', 'Gutschrift Shop', 'Versand', 'example.test', '20,00 +'),
    ...header(),
    row('1', '02.01', 'Synthetic Fuel', 'Tankst.', 'Musterort', '45,00 -'),
    row('1', '02.01', 'Synthetic Bonus', 'Diverses', 'example.test/ab', '3,50 +'),
    row(
      '1',
      '03.01',
      'Synthetic Museum',
      'Kultur',
      'example.test',
      '25,38 -',
      '25,00 EUR 1,000000     25,00 - 0,38 -',
    ),
    columns([[108, '__________']]),
    columns([[109, '368,68 -']]),
    '   *) Synthetic footnote about reference rates (+) / (-).',
    '   **) Synthetic second footnote.',
  ].join('\n');

describe('issued-card rows whose columns do not line up with the header (#1056)', () => {
  it('reads every row by token order and verifies the closing total', () => {
    const doc = parseCardDocument(statement(), SHA, context());
    expect(doc.layout).toBe('issued_card');
    expect(doc.summary.fields.payableCents.value).toBe(36868);
    expect(
      doc.rows.map((r) => [
        r.line,
        r.kind,
        r.cardHint,
        r.transactionDate,
        r.bookingDate,
        r.description,
        r.currency,
        r.amountCents,
      ]),
    ).toEqual([
      [14, 'payment', 'Karte', '2030-12-10', '2030-12-10', 'Zahlung erhalten', 'EUR', 10000],
      [15, 'purchase', '****1111', '2030-12-12', '2030-12-12', 'Synthetic Bakery', 'EUR', -1240],
      [16, 'purchase', '****1111', '2030-12-14', '2030-12-14', 'Synthetic Hotel', 'EUR', -7484],
      [
        17,
        'purchase',
        '****1111',
        '2030-12-18',
        '2030-12-18',
        'Synthetic Webshop order synthetic',
        'EUR',
        -23456,
      ],
      [20, 'refund', '****1111', '2030-12-22', '2030-12-22', 'Gutschrift Shop', 'EUR', 2000],
      [26, 'purchase', '****1111', '2031-01-02', '2031-01-02', 'Synthetic Fuel', 'EUR', -4500],
      [27, 'credit', '****1111', '2031-01-02', '2031-01-02', 'Synthetic Bonus', 'EUR', 350],
      [28, 'purchase', '****1111', '2031-01-03', '2031-01-03', 'Synthetic Museum', 'EUR', -2538],
    ]);
    // -100,00 previous + 100,00 - 12,40 - 74,84 - 234,56 + 20,00 - 45,00 + 3,50 - 25,38 = -368,68.
    expect(doc.totalsVerified).toBe(true);
    // The payment row prints no card index: it is an account-level payment, not an unmapped card.
    expect(doc.rows[0]).toMatchObject({ cardToken: '', accountId: 'synthetic-card' });
    expect(doc.rows.every((r) => r.dateOrigin === 'statement_boundaries')).toBe(true);
    expect(doc.summary.fields.accountHint.value).toBe('****1111');
    expect(doc.reasons).toEqual([]);
    const actions = planCardRows(doc, [], []);
    expect(actions[0]).toMatchObject({ kind: 'pending', reason: 'settlement_match_required' });
    expect(actions[6]).toMatchObject({ kind: 'pending', reason: 'credit_review_required' });
  });

  it('keeps the closing total unverified when the summary balance disagrees', () => {
    const doc = parseCardDocument(statement('368,69-'), SHA, context());
    expect(doc.rows).toHaveLength(8);
    expect(doc.totalsVerified).toBe(false);
    expect(doc.reasons).toContain('closing_total_unverified');
  });

  it('flags a printed table total that differs from the parsed rows', () => {
    const doc = parseCardDocument(statement().replace('368,68 -', '368,67 -'), SHA, context());
    expect(doc.rows).toHaveLength(8);
    expect(doc.reasons).toContain('table_total_unverified');
    expect(planCardRows(doc, [], []).every((a) => a.kind === 'pending')).toBe(true);
  });

  it.each([
    ['an inconsistent fee column', '73,73 - 1,11 -', '73,73 - 1,12 -'],
    ['a missing final sign', '25,38 -', '25,38'],
    ['an extra amount in the text', 'Synthetic Bakery', 'Synthetic Bakery 5,00 -'],
    ['a malformed foreign rate', '1,085000', '1.085,0x'],
  ])('rejects a row with %s instead of guessing', (_label, from, to) => {
    const doc = parseCardDocument(statement().replace(from, to), SHA, context());
    expect(doc.rows).toHaveLength(7);
    expect(doc.reasons).toContain('row_amount_or_fee_unavailable');
    expect(planCardRows(doc, [], []).every((a) => a.kind === 'pending')).toBe(true);
  });

  it('never turns an unknown undated line or a printed figure outside the table into a row', () => {
    const hidden = statement().replace(
      '  10560_1/2_000001',
      columns([
        [2, 'Synthetic carry'],
        [110, '9,00 -'],
      ]),
    );
    const doc = parseCardDocument(hidden, SHA, context());
    expect(doc.rows).toHaveLength(8);
    expect(doc.reasons).toContain('unrecognized_table_row');
    const after = parseCardDocument(
      statement() + '\n' + row('1', '03.01', 'Synthetic Late', 'Kultur', 'Musterort', '1,00 -'),
      SHA,
      context(),
    );
    expect(after.reasons).toContain('transaction_outside_table');
    expect(after.rows).toHaveLength(8);
  });

  it('derives row years from the printed issue date alone when no previous statement exists', () => {
    const doc = parseCardDocument(statement(), SHA, { ...context(), previous: null });
    expect(doc.rows.map((r) => [r.transactionDate, r.dateOrigin])).toEqual([
      ['2030-12-10', 'issue_date'],
      ['2030-12-12', 'issue_date'],
      ['2030-12-14', 'issue_date'],
      ['2030-12-18', 'issue_date'],
      ['2030-12-22', 'issue_date'],
      ['2031-01-02', 'issue_date'],
      ['2031-01-02', 'issue_date'],
      ['2031-01-03', 'issue_date'],
    ]);
    expect(doc.totalsVerified).toBe(false);
    expect(doc.reasons).toEqual(['previous_source_required', 'closing_total_unverified']);
    expect(planCardRows(doc, [], []).every((a) => a.kind === 'pending')).toBe(true);
    // 03.11. is 62 days before 04.01.2031; 02.11. is 63 days and stays without a year.
    const edge = (date: string) =>
      parseCardDocument(statement().replaceAll('12.12', date), SHA, {
        ...context(),
        previous: null,
      });
    expect(edge('03.11').rows[1]!.bookingDate).toBe('2030-11-03');
    expect(edge('03.11').reasons).not.toContain('row_year_unavailable');
    expect(edge('02.11').rows[1]!.bookingDate).toBeNull();
    expect(edge('02.11').reasons).toContain('row_year_unavailable');
  });

  it('keeps a positive row without card index or payment wording unresolved', () => {
    const doc = parseCardDocument(
      statement().replace('Zahlung erhalten', 'Synthetic credit'),
      SHA,
      context(),
    );
    expect(doc.rows[0]!.kind).toBe('unknown');
    expect(doc.reasons).toContain('row_kind_unavailable');
    expect(doc.reasons).toContain('card_mapping_required');
  });
});
