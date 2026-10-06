import { describe, expect, it } from 'vitest';
import {
  assignmentActionsSchema,
  assignmentMatchSchema,
  assignmentSplits,
  bankAliasKey,
  bankAssignmentText,
  learnAssignmentSplits,
  cleanBankPayee,
  DEFAULT_PAYEE_CLEANUP,
  matchesAssignment,
  safeBankRegex,
} from './assignment-rules';

describe('bank recipient cleanup', () => {
  it('strips noise, keeps merchant text and collapses whitespace', () => {
    expect(
      cleanBankPayee(
        null,
        'SEPA-Lastschrift:   Shop A   Karte ****0123 02.10.2026 14:30 Ref: SYN-42',
      ),
    ).toBe('Shop A');
    expect(cleanBankPayee('Shop A', 'Different memo')).toBe('Shop A');
    expect(bankAssignmentText('Shop A', 'Ref: SYN')).toBe('Shop A\nRef: SYN');
    expect(bankAssignmentText(null, 'Ref: SYN')).toBe('Ref: SYN');
    expect(
      cleanBankPayee('Shop A', 'Terminal Shop B 2026-10-02', {
        ...DEFAULT_PAYEE_CLEANUP,
        useMemo: true,
        prefixes: ['Terminal'],
      }),
    ).toBe('Shop B');
    expect(
      cleanBankPayee(null, 'Shop A 02.10.2026', { ...DEFAULT_PAYEE_CLEANUP, stripDates: false }),
    ).toBe('Shop A 02.10.2026');
    expect(bankAliasKey('  SHOP   Ａ ')).toBe('shop a');
  });
});
describe('assignment conditions and integer split templates', () => {
  it('matches normalized counterparties exactly and keeps directions separate', () => {
    const match = assignmentMatchSchema.parse({
      mode: 'all',
      conditions: [
        { type: 'counterparty', text: 'shop a' },
        { type: 'direction', direction: 'outflow' },
      ],
    });
    const row = {
      accountId: 'giro',
      payeeId: null,
      amountCents: -2307,
      rawText: 'Shop AB',
      counterparty: '  SHOP   Ａ ',
    };
    expect(matchesAssignment(match, row)).toBe(true);
    expect(matchesAssignment(match, { ...row, counterparty: 'Shop AB' })).toBe(false);
    expect(matchesAssignment(match, { ...row, amountCents: 2307 })).toBe(false);
    expect(matchesAssignment(match, { ...row, amountCents: 0 })).toBe(false);
    expect(matchesAssignment(match, { ...row, counterparty: '' })).toBe(false);
  });
  const row = {
    payeeId: 'p1',
    accountId: 'giro',
    amountCents: -1201,
    rawText: 'SEPA Shop A REF: SYN',
  };
  it('uses all/any, signed inclusive amount bounds, raw contains/regex and direction', () => {
    const match = assignmentMatchSchema.parse({
      mode: 'all',
      conditions: [
        { type: 'payee', payeeId: 'p1' },
        { type: 'account', accountId: 'giro' },
        { type: 'direction', direction: 'outflow' },
        { type: 'amount', minCents: -1201, maxCents: -1201 },
        { type: 'contains', text: 'shop a' },
        { type: 'regex', pattern: '^SEPA.*SYN$' },
      ],
    });
    expect(matchesAssignment(match, row)).toBe(true);
    expect(matchesAssignment(match, { ...row, amountCents: -1200 })).toBe(false);
    expect(matchesAssignment({ ...match, mode: 'any' }, { ...row, payeeId: null })).toBe(true);
    expect(
      matchesAssignment(
        { mode: 'all', conditions: [{ type: 'direction', direction: 'inflow' }] },
        { ...row, amountCents: 0 },
      ),
    ).toBe(false);
    expect(
      assignmentMatchSchema.safeParse({
        mode: 'all',
        conditions: [{ type: 'amount', minCents: 2, maxCents: 1 }],
      }).success,
    ).toBe(false);
  });
  it('rejects invalid and expensive patterns rather than blocking on bank text', () => {
    for (const pattern of [
      '(a+)+$',
      'a*a*',
      'a+Z$',
      '^a|.*Z$',
      '(?=a)',
      '\\1',
      '[',
      '',
      'x'.repeat(201),
    ])
      expect(safeBankRegex(pattern)).toBe(false);
    expect(safeBankRegex('^Shop [AB].*$')).toBe(true);
  });
  it('rounds one cent once with stable ties and preserves negative and safe-limit totals', () => {
    const template = [
      { categoryId: 'a', weightBp: 5000 },
      { categoryId: 'b', weightBp: 5000 },
    ];
    expect(
      learnAssignmentSplits([
        { categoryId: 'a', amountCents: -601 },
        { categoryId: 'b', amountCents: -600 },
      ]),
    ).toEqual([
      { categoryId: 'a', weightBp: 5004 },
      { categoryId: 'b', weightBp: 4996 },
    ]);
    expect(assignmentSplits(-1201, template)).toEqual([
      { categoryId: 'a', amountCents: -601 },
      { categoryId: 'b', amountCents: -600 },
    ]);
    expect(assignmentSplits(1, template)).toEqual([
      { categoryId: 'a', amountCents: 1 },
      { categoryId: 'b', amountCents: 0 },
    ]);
    expect(assignmentSplits(Number.MAX_SAFE_INTEGER, template).map((s) => s.amountCents)).toEqual([
      4503599627370496, 4503599627370495,
    ]);
    expect(
      assignmentActionsSchema.safeParse({
        splits: [
          { categoryId: 'a', weightBp: 5000 },
          { categoryId: 'b', weightBp: 4999 },
        ],
      }).success,
    ).toBe(false);
    expect(assignmentActionsSchema.safeParse({ splits: template, categoryId: 'a' }).success).toBe(
      false,
    );
  });
});
