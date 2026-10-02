import { addMonths } from '@budget/domain';
import { ynabExport, YNAB_AS_OF, YNAB_FILE_NAMES } from '@budget/fixtures/ynab';
import { describe, expect, it } from 'vitest';
import {
  applyMapping,
  buildModel,
  exportAsOf,
  identityMapping,
  mappingSchema,
  parsePlan,
  parseRegister,
  READY_TO_ASSIGN,
  reconcile,
  stripNote,
  type Mapping,
  type MappingInput,
} from './index';

const files = ynabExport(1);
const raw = buildModel(parseRegister(files.register), parsePlan(files.plan), {
  asOf: exportAsOf(YNAB_FILE_NAMES.register),
});
const run = (mapping: Mapping) => {
  const { target, problems } = applyMapping(raw, mapping);
  return { target, problems, report: reconcile(raw, target, { today: YNAB_AS_OF }) };
};
/** The identity mapping, changed as a JSON document would be, then validated. */
const mapped = (change: (m: MappingInput) => void, start?: string): Mapping => {
  const m: MappingInput = structuredClone(identityMapping(raw, start));
  change(m);
  return mappingSchema.parse(m);
};
const key = (name: string) => {
  const found = raw.categories.find(
    (c) => stripNote(c.name).trim() === name || c.name.trim() === name,
  );
  if (!found) throw new Error(name);
  return found.key;
};

describe('round trip on the synthetic export', () => {
  it('parses without problems: 14 accounts, 45 categories, 58 months', () => {
    expect(raw.problems).toEqual([]);
    expect([raw.accounts.length, raw.categories.length, raw.months.length]).toEqual([14, 45, 58]);
    expect(raw.bookings.some((b) => b.splits.length === 3)).toBe(true);
    expect(
      raw.bookings.flatMap((b) => b.splits).filter((s) => s.transferAccount && !s.transferId),
    ).toEqual([]);
  });

  it('identity mapping from the first month: 0 difference everywhere', () => {
    const { target, problems, report } = run(identityMapping(raw));
    expect(problems).toEqual([]);
    expect(report.differences).toEqual([]);
    // Nothing to re-derive: every envelope is YNAB's already.
    expect(target.shifts).toEqual([]);
    expect(report.checked).toMatchObject({
      // Activity of the two card envelopes is covered by their Available.
      activity: 43 * 58,
      available: 45 * 58,
      to_be_assigned: 58,
      total: 58,
    });
    expect(report.checked.balance).toBeGreaterThan(12 * 58);
    // The sample has months with credit and with cash overspending.
    expect(report.budget.filter((m) => m.creditOverspentCents > 0).length).toBeGreaterThan(5);
    expect(report.budget.filter((m) => m.uncoveredCents > 0).length).toBeGreaterThan(5);
  });

  it('card cases (May 2024): funded card spending, credit and cash overspending per category', () => {
    const may = run(identityMapping(raw)).report.budget.find((m) => m.month === '2024-05');
    const split = (n: string) => {
      const e = may?.envelopes[key(n)];
      return [e?.fundedCardCents, e?.creditOverspentCents, e?.cashOverspentCents];
    };
    expect(split('Elektronik')).toEqual([10000, 5000, 0]);
    expect(split('Möbel')).toEqual([0, 0, 5000]);
    // Card first (real export): the card spending explains the overspending before the cash.
    expect(split('Kultur')).toEqual([7000, 5000, 0]);
    expect(split('Bücher')).toEqual([2000, 5000, 0]);
    expect(split('Geschenke')).toEqual([15000, 0, 0]);
  });

  it('start month 2023-10 (the default): opening balances, skipped account, 0 difference', () => {
    const mapping = mapped((m) => {
      delete m.startMonth;
      m.accounts['Altes Sparbuch'] = 'skip';
    });
    expect(mapping.startMonth).toBe('2023-10');
    const { target, problems, report } = run(mapping);
    expect(problems).toEqual([]);
    expect(report.differences).toEqual([]);
    expect(target.months[0]).toBe('2023-10');
    expect(target.accounts.map((a) => a.ynabName)).not.toContain('Altes Sparbuch');
    for (const a of target.accounts) {
      const before = raw.bookings.filter((b) => b.account === a.ynabName && b.date < '2023-10-01');
      expect(a.openingBalanceCents, a.ynabName).toBe(before.reduce((s, b) => s + b.amountCents, 0));
    }
    // Opening Available is September's, overspending reset to 0.
    const sep = raw.plan['2023-09'] ?? {};
    for (const [k, c] of Object.entries(sep))
      expect(target.openingCarry[k] ?? 0).toBe(Math.max(0, c.availableCents));
    expect(target.bookings.every((b) => b.date >= '2023-10-01')).toBe(true);
  });

  it('only accounts closed before the start can be skipped', () => {
    const { problems } = run(mapped((m) => (m.accounts['Altes Girokonto'] = 'skip'), '2023-10'));
    expect(problems.map((p) => p.code)).toContain('mapping.account_skip');
  });

  it('n:1 merge of categories keeps Activity and Available exact', () => {
    const mapping = mapped((m) => {
      m.targets['ruecklagen'] = { name: 'Rücklagen', group: '📈 Zukunft', kind: 'saving' };
      m.categories[key('Notgroschen')] = 'ruecklagen';
      m.categories[key('Neues Auto')] = 'ruecklagen';
      delete m.targets[key('Notgroschen')];
      delete m.targets[key('Neues Auto')];
    }, '2023-10');
    const { target, report } = run(mapping);
    expect(target.categories.find((c) => c.id === 'ruecklagen')?.sources).toHaveLength(2);
    expect(report.differences).toEqual([]);
  });

  it('merging an overspent category keeps every envelope and Zu verteilen: assigned absorbs it', () => {
    // YNAB resets each category's overspending on its own and splits it into cash and credit per
    // category; a merged envelope nets first. May 2024: Möbel −50 € cash, Kultur −50 € credit
    // (card first); merged: −100 €, all of it credit (120 € on the card). The card envelope holds
    // that change of the credit overspending, and June's assigned amount of the card envelope
    // makes up for it, so Zu verteilen stays YNAB's in every month.
    const mapping = mapped((m) => {
      m.categories[key('Möbel')] = key('Kultur');
      delete m.targets[key('Möbel')];
    }, '2024-01');
    const { target, report } = run(mapping);
    expect(report.differences).toEqual([]);
    expect(report.checked.to_be_assigned).toBe(target.months.length);
    expect(report.creditShift).toEqual([{ month: '2024-05', cents: 5000 }]);
    expect(target.shifts).toEqual([
      { month: '2024-06', categoryId: key('Kreditkarte Blau'), cents: 5000 },
    ]);
  });

  it('a dropped category with money is a difference of Zu verteilen (YNAB keeps the money)', () => {
    const drop = mapped((m) => {
      m.categories[key('Alte Kategorie')] = 'drop';
      delete m.targets[key('Alte Kategorie')];
    }, '2023-10');
    const { report } = run(drop);
    const kept = raw.plan['2023-10']?.[key('Alte Kategorie')]?.availableCents;
    expect(kept).toBe(5000);
    expect(
      new Set(report.differences.map((d) => [d.check, d.actualCents - d.expectedCents].join())),
    ).toEqual(new Set(['to_be_assigned,5000']));
    const base = run(identityMapping(raw, '2023-10')).report.budget;
    expect(report.budget[0]!.toBeAssignedCents - base[0]!.toBeAssignedCents).toBe(5000);
  });

  it('rules from rules_from and from their own month move the assigned money along', () => {
    const mapping = mapped((m) => {
      m.rulesFrom = '2026-01';
      m.rules = [
        {
          id: 'rundfunk',
          match: { payee: 'Rundfunkbeitrag' },
          set: { category: key('Internet') },
        },
        {
          id: 'altkonto',
          from: '2025-01',
          match: { account: 'Altes Girokonto', memo: 'kontoführung' },
          set: { category: null, project: 'Altkonto' },
        },
      ];
    }, '2023-10');
    const { target, report } = run(mapping);
    expect(report.differences).toEqual([]);
    // The assigned money moves with the bookings: every envelope keeps YNAB's Available, so the
    // card spending is funded as in YNAB.
    expect(report.creditShift).toEqual([]);
    const byRule = (id: string) => report.moved.filter((x) => x.ruleId === id);
    // Twice a year, February and August.
    expect(byRule('rundfunk').map((x) => [x.month, x.cents])).toEqual([
      ['2026-02', -6000],
      ['2026-08', -6000],
    ]);
    expect(byRule('altkonto').map((x) => x.month)).toEqual([
      '2025-01',
      '2025-02',
      '2025-03',
      '2025-04',
      '2025-05',
      '2025-06',
    ]);
    expect(
      target.bookings.flatMap((b) => b.splits).filter((s) => s.project === 'Altkonto'),
    ).toHaveLength(6);
    const [fee] = byRule('rundfunk');
    expect(target.shifts.filter((x) => x.month === '2026-02')).toEqual(
      expect.arrayContaining([
        { month: '2026-02', categoryId: fee?.fromCategory, cents: -6000 },
        { month: '2026-02', categoryId: key('Internet'), cents: 6000 },
      ]),
    );
    // Every check in every month, Zu verteilen included.
    const months = target.months.length;
    expect(report.checked.total).toBe(months);
    expect(report.checked.to_be_assigned).toBe(months);
    expect(report.checked.available).toBe(45 * months);
  });

  it('name cleanup, monthly targets from notes and payee contacts', () => {
    const mapping = mapped((m) => {
      m.names = { stripNotes: true, stripEmoji: true };
      m.payees = { Vermieter: { name: 'Hausverwaltung', contact: 'Kontakt B' } };
    }, '2023-10');
    const { target } = run(mapping);
    const names = new Set(target.categories.map((c) => c.name));
    expect(names).toContain('Strom');
    expect(names).toContain('Lebensmittel');
    expect(target.categories.map((c) => c.group)).toContain('Freizeit');
    // The scheduled rent: name and contact of the mapped payee, monthly by the category's note.
    expect(target.expectedPayments[0]).toMatchObject({
      name: 'Hausverwaltung',
      payee: 'Hausverwaltung',
      contact: 'Kontakt B',
      rhythm: 'monthly',
      dueDay: 1,
      basis: 'note_monthly',
    });
    expect(target.targets.map((t) => [stripNote(t.source), t.amountCents])).toEqual([
      ['🎉 Freizeit: Urlaub', 15000],
      ['📈 Zukunft: Notgroschen', 10000],
    ]);
    expect(target.contacts).toEqual(['Kontakt B']);
    const rent = target.bookings.filter((b) => b.payee === 'Hausverwaltung');
    expect(rent.length).toBeGreaterThan(30);
    expect(rent.every((b) => b.contact === 'Kontakt B')).toBe(true);
  });
});

describe('export facts from the first real import', () => {
  it('rows after the export date are expected payments, not bookings', () => {
    expect(exportAsOf(YNAB_FILE_NAMES.plan)).toBe('2026-09-29');
    expect(exportAsOf('Register.tsv')).toBeNull();
    expect(raw.bookings.filter((b) => b.scheduled)).toHaveLength(6);
    const { target, report } = run(identityMapping(raw));
    expect(target.bookings.filter((b) => b.date > YNAB_AS_OF)).toEqual([]);
    expect(report.differences).toEqual([]);
    // The rent once (monthly by its note), the five monthly kindergarten rows as one payment.
    expect(
      target.expectedPayments.map((e) => [
        e.name,
        e.kind,
        e.amountCents,
        e.rhythm,
        e.dueDay,
        e.startDate,
        e.basis,
      ]),
    ).toEqual([
      ['Vermieter', 'outflow', 108961, 'monthly', 1, '2026-10-01', 'note_monthly'],
      ['Kindergarten', 'outflow', 25000, 'monthly', 5, '2026-10-05', 'recurring'],
    ]);
  });

  it('account proposals: paid-off loan, closed accounts, platforms, trimmed names', () => {
    const p = Object.fromEntries(raw.accounts.map((a) => [a.name, a.proposal]));
    expect(p['Autokredit']).toEqual({
      onBudget: false,
      creditCard: false,
      type: 'loan',
      closedAt: '2023-08-15',
    });
    expect(p['Altes Sparbuch']?.closedAt).toBe('2023-03-15');
    expect(p['Altes Girokonto']?.closedAt).toBe('2025-06-30');
    expect(p['Kreditkarte Grün']?.closedAt).toBe('2025-06-05');
    expect(p['Girokonto']?.closedAt).toBeNull();
    for (const platform of ['Depot', 'Krypto', 'Forderung Kontakt A'])
      expect(p[platform]?.type, platform).toBe('other_asset');
    // Exported with a trailing space in the account column, without in the transfer payees.
    expect(p['Online-Wallet']).toMatchObject({ onBudget: true, type: 'checking' });
  });

  it('a hidden category the register shows under its original group is one category', () => {
    const old = raw.categories.filter((c) => c.name === 'Alte Kategorie');
    expect(old.map((c) => [c.key, c.originalGroup])).toEqual([
      ['Hidden Categories: Alte Kategorie', '🔧 Periodisch'],
    ]);
  });

  it('split lines keep their own payee', () => {
    const { target } = run(identityMapping(raw));
    const split = target.bookings.find((b) => b.payee === 'Blumenladen' && b.splits.length === 2);
    expect(split?.splits.map((s) => s.payee)).toEqual(['Blumenladen', 'Restaurant']);
  });

  it("the start month's income is income only, not the opening balances", () => {
    const { report } = run(identityMapping(raw, '2023-10'));
    const inflows = raw.bookings
      .filter((b) => b.date.startsWith('2023-10'))
      .flatMap((b) => b.splits)
      .filter((s) => s.categoryKey === READY_TO_ASSIGN)
      .reduce((a, s) => a + s.amountCents, 0);
    expect(report.budget[0]?.incomeCents).toBe(inflows);
  });

  it('rules never touch transfer legs or tracking accounts', () => {
    const mapping = mapped((m) => {
      m.rulesFrom = '2024-01';
      m.rules = [
        { id: 'legs', match: { payee: 'Transfer : Tagesgeld' }, set: { category: key('Urlaub') } },
        { id: 'depot', match: { account: 'Depot' }, set: { category: key('Urlaub') } },
      ];
    }, '2023-10');
    const { report } = run(mapping);
    expect(report.moved).toEqual([]);
    expect(report.differences).toEqual([]);
  });

  it("YNAB's Ready to Assign comes from the export, not from the mapping", () => {
    const identity = run(identityMapping(raw, '2023-10')).report.budget;
    const moved = mapped((m) => {
      const a = m.accounts['Tagesgeld'] as { onBudget: boolean; type: string };
      a.onBudget = false;
      a.type = 'other_asset';
    }, '2023-10');
    const zv = run(moved).report.differences.filter((d) => d.check === 'to_be_assigned');
    expect(zv.length).toBeGreaterThan(0);
    for (const d of zv)
      expect(d.expectedCents).toBe(identity.find((m) => m.month === d.month)?.toBeAssignedCents);
  });
});

describe('mapping document', () => {
  const base = identityMapping(raw);
  const issues = (change: (m: MappingInput) => void) => {
    const m: MappingInput = structuredClone(base);
    change(m);
    const result = mappingSchema.safeParse(m);
    return result.success ? [] : result.error.issues.map((i) => [i.path.join('.'), i.message]);
  };

  it('validates targets, card accounts, rules and months', () => {
    expect(issues(() => {})).toEqual([]);
    expect(issues((m) => (m.categories['x: y'] = 'nowhere'))).toEqual([
      ['categories.x: y', 'Unknown target'],
    ]);
    expect(issues((m) => (m.targets['drop'] = { name: 'x', group: 'y', kind: 'fixed' }))).toEqual([
      ['targets.drop', '"drop" is reserved'],
    ]);
    expect(
      issues((m) => (m.targets['k'] = { name: 'k', group: 'g', kind: 'card_payment' })),
    ).toEqual([['targets.k', 'card_payment needs an on-budget credit card']]);
    // Every on-budget card has exactly one card_payment target.
    const blue = key('Kreditkarte Blau');
    const card = (m: MappingInput) => (m.targets[blue] as { cardAccount: string }).cardAccount;
    expect(
      issues(
        (m) =>
          (m.targets['second'] = {
            name: 'x',
            group: 'y',
            kind: 'card_payment',
            cardAccount: card(m),
          }),
      ),
    ).toEqual([
      [
        'accounts.Kreditkarte Blau',
        'An on-budget credit card needs exactly one card_payment target',
      ],
    ]);
    expect(issues((m) => (m.targets[blue] = { name: 'x', group: 'y', kind: 'variable' }))).toEqual([
      [
        'accounts.Kreditkarte Blau',
        'An on-budget credit card needs exactly one card_payment target',
      ],
    ]);
    expect(
      issues((m) => {
        const a = m.accounts['Kreditkarte Blau'] as { onBudget: boolean };
        a.onBudget = false;
      }),
    ).toEqual([[`targets.${blue}`, 'card_payment needs an on-budget credit card']]);
    expect(issues((m) => (m.rules = [{ id: 'r', match: { payee: 'x' }, set: {} }]))).toEqual([
      ['rules.0', 'No from and no rulesFrom'],
    ]);
    expect(issues((m) => (m.rules = [{ id: 'r', from: '2024-01', match: {}, set: {} }]))).toEqual([
      ['rules.0.match', 'A rule needs at least one condition'],
    ]);
    expect(issues((m) => (m.startMonth = '2023-13'))).toEqual([['startMonth', 'YYYY-MM']]);
  });

  it('reports YNAB accounts and categories the mapping leaves out, and a start outside the plan', () => {
    const m: MappingInput = structuredClone(base);
    delete m.accounts['Bargeld'];
    delete m.categories[key('Tanken')];
    m.startMonth = addMonths(raw.months[raw.months.length - 1] as string, 1);
    const { problems } = applyMapping(raw, mappingSchema.parse(m));
    expect(problems.map((p) => p.code)).toEqual([
      'mapping.start_month',
      'mapping.account_missing',
      'mapping.category_missing',
    ]);
    // Named by index and hash, never by name.
    expect(problems[1]?.subject).toEqual({
      kind: 'account',
      index: 2,
      hash: expect.stringMatching(/^[0-9a-f]{8}$/),
    });
    expect(problems[2]?.subject).toMatchObject({
      kind: 'category',
      index: raw.categories.findIndex((c) => c.key === key('Tanken')),
    });
    expect(JSON.stringify(problems)).not.toMatch(/Bargeld|Tanken/);
  });

  it('reports splits the ledger would refuse: contact shares outside advance, card envelopes', () => {
    // A rule that only sets a contact leaves the split in its (non-advance) category.
    const contactOnly = mapped((m) => {
      m.rulesFrom = '2026-01';
      m.rules = [{ id: 'share', match: { payee: 'Rundfunkbeitrag' }, set: { contact: 'K' } }];
    }, '2023-10');
    const refused = applyMapping(raw, contactOnly).problems;
    expect(refused.map((p) => [p.code, p.severity, p.lines.length])).toEqual([
      ['mapping.contact_category', 'error', 2],
    ]);
    expect(refused[0]?.message).not.toMatch(/Rundfunk/);
    // The same rule into an advance category is fine.
    const advance = mapped((m) => {
      m.rulesFrom = '2026-01';
      (m.targets[key('Internet')] as { kind: string }).kind = 'advance';
      m.rules = [
        {
          id: 'share',
          match: { payee: 'Rundfunkbeitrag' },
          set: { category: key('Internet'), contact: 'K' },
        },
      ];
    }, '2023-10');
    expect(applyMapping(raw, advance).problems).toEqual([]);
    // A spending category mapped onto a card payment envelope.
    const card = Object.entries(contactOnly.targets).find(([, t]) => t.kind === 'card_payment');
    const onCard = mapped((m) => {
      m.categories[key('Tanken')] = card?.[0] as string;
    }, '2023-10');
    expect(applyMapping(raw, onCard).problems.map((p) => p.code)).toEqual([
      'mapping.card_payment_bookings',
    ]);
  });
});
