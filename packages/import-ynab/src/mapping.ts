import {
  addMonths,
  budgetMonths,
  lastDayOfMonth,
  monthsBetween,
  type BudgetInput,
} from '@budget/domain';
import { z } from 'zod';
import {
  READY_TO_ASSIGN,
  shortHash,
  stripNote,
  type Problem,
  type RawBooking,
  type RawCategory,
  type RawModel,
  type RawSplit,
  type SystemPayee,
} from './model';
import { ynabMonths } from './ynab-budget';

/**
 * The owner-made mapping document and the target layer (`docs/migration/ynab-export.md`
 * §Restructure, §Mapping decisions). The document is JSON, validated here, kept outside the repo.
 */

// Mirrors packages/db/src/schema (this package stays pure and does not import the database).
export const ACCOUNT_TYPES = [
  'checking',
  'cash',
  'savings',
  'credit_card',
  'loan',
  'brokerage',
  'crypto',
  'p2p',
  'receivable',
  'other_asset',
  'other_liability',
] as const;
/**
 * Investment accounts. Their YNAB value adjustments are imported as balance adjustments, so the
 * balances equal YNAB's until holdings come from Portfolio Performance (Gate 3).
 */
export const INVESTMENT_TYPES: readonly string[] = ['brokerage', 'crypto', 'p2p'];
export const CATEGORY_KINDS = [
  'fixed',
  'periodic',
  'variable',
  'project',
  'saving',
  'invest',
  'debt',
  'advance',
  'card_payment',
  'income',
] as const;
export const DROP = 'drop';

const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'YYYY-MM');
const day = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, 'YYYY-MM-DD');
const text = z.string().min(1);

const targetAccount = z.object({
  id: text,
  name: text,
  type: z.enum(ACCOUNT_TYPES),
  onBudget: z.boolean(),
  closedAt: day.nullable().default(null),
  /**
   * Balance changes YNAB shows but does not export (the interest YNAB adds to a loan account):
   * imported as balance adjustments so the balance equals YNAB's.
   */
  adjustments: z
    .array(z.object({ date: day, amountCents: z.number().int(), memo: text }))
    .default([]),
});
const targetCategory = z.object({
  name: text,
  group: text,
  kind: z.enum(CATEGORY_KINDS),
  class: z.enum(['need', 'want', 'future']).nullable().default(null),
  hidden: z.boolean().default(false),
  /** Target account id of the card, for `card_payment`. */
  cardAccount: text.nullable().default(null),
});
const rule = z.object({
  id: text,
  /** Applies from this month; without it from the document's `rulesFrom`. */
  from: month.optional(),
  match: z
    .object({
      account: text,
      payee: text,
      /** Substring, case-insensitive. */
      memo: text,
      /** YNAB category key `Group: Category`. */
      category: text,
      minCents: z.number().int(),
      maxCents: z.number().int(),
      dateFrom: day,
      dateTo: day,
    })
    .partial()
    .refine((m) => Object.keys(m).length > 0, 'A rule needs at least one condition'),
  set: z
    .object({
      /** Target category id, or `null` for "Zu verteilen". */
      category: text.nullable(),
      contact: text,
      project: text,
      incomeType: text,
      /** New payee name; on a balance adjustment it makes the row an ordinary booking. */
      payee: text,
    })
    .partial(),
});

const rhythm = z.enum(['monthly', 'quarterly', 'semiannual', 'yearly']);
const dateShift = z.enum(['none', 'before', 'after']);
/**
 * A recurring payment the export has no scheduled row for (the salary): account, amount and
 * direction come from the latest booked row of `payee` (on `account`, if given).
 */
const recurringPayment = z.object({
  name: text.optional(),
  payee: text,
  account: text.optional(),
  incomeType: text.optional(),
  /** Target category id. */
  category: text.optional(),
  rhythm: rhythm.default('monthly'),
  dueDay: z.number().int().min(1).max(31),
  dueMonth: z.number().int().min(1).max(12).optional(),
  dateShift: dateShift.default('none'),
});

export const mappingSchema = z
  .object({
    version: z.literal(1),
    startMonth: month.default('2023-10'),
    rulesFrom: month.nullable().default(null),
    /** YNAB account name → target account, or `skip` (only for accounts closed before the start). */
    accounts: z.record(z.string(), z.union([z.literal('skip'), targetAccount])),
    /** Target categories by id. */
    targets: z.record(z.string(), targetCategory),
    /** YNAB category key → target id (n:1 allowed) or `drop`. */
    categories: z.record(z.string(), text),
    rules: z.array(rule).default([]),
    /** YNAB payee → new name and/or contact. */
    payees: z.record(z.string(), z.object({ name: text, contact: text }).partial()).default({}),
    names: z
      .object({ stripNotes: z.boolean().default(false), stripEmoji: z.boolean().default(false) })
      .prefault({}),
    expectedPayments: z
      .object({
        /** Bracket notes of category names: monthly targets, and the rhythm of scheduled rows. */
        fromNotes: z.boolean().default(true),
        /** YNAB's scheduled rows (dated after the "as of" day) become expected payments. */
        fromScheduled: z.boolean().default(true),
        recurring: z.array(recurringPayment).default([]),
      })
      .prefault({}),
  })
  .superRefine((m, ctx) => {
    const accountIds = new Set<string>();
    for (const [name, a] of Object.entries(m.accounts)) {
      if (a === 'skip') continue;
      if (accountIds.has(a.id))
        ctx.addIssue({ code: 'custom', path: ['accounts', name], message: 'Duplicate account id' });
      accountIds.add(a.id);
    }
    // Every on-budget credit card has exactly one card_payment target, and only those do.
    const cards = new Map<string, number>();
    for (const a of Object.values(m.accounts))
      if (a !== 'skip' && a.type === 'credit_card' && a.onBudget) cards.set(a.id, 0);
    for (const [id, t] of Object.entries(m.targets)) {
      if (id === DROP)
        ctx.addIssue({ code: 'custom', path: ['targets', id], message: '"drop" is reserved' });
      const card = t.cardAccount === null ? undefined : cards.get(t.cardAccount);
      if (t.kind === 'card_payment' && t.cardAccount !== null && card !== undefined)
        cards.set(t.cardAccount, card + 1);
      else if (t.kind === 'card_payment' || t.cardAccount !== null)
        ctx.addIssue({
          code: 'custom',
          path: ['targets', id],
          message: 'card_payment needs an on-budget credit card',
        });
    }
    for (const [name, a] of Object.entries(m.accounts))
      if (a !== 'skip' && cards.has(a.id) && cards.get(a.id) !== 1)
        ctx.addIssue({
          code: 'custom',
          path: ['accounts', name],
          message: 'An on-budget credit card needs exactly one card_payment target',
        });
    for (const [key, id] of Object.entries(m.categories))
      if (id !== DROP && !m.targets[id])
        ctx.addIssue({ code: 'custom', path: ['categories', key], message: 'Unknown target' });
    m.expectedPayments.recurring.forEach((r, i) => {
      if (r.category && !m.targets[r.category])
        ctx.addIssue({
          code: 'custom',
          path: ['expectedPayments', 'recurring', i],
          message: 'Unknown target',
        });
    });
    m.rules.forEach((r, i) => {
      const target = r.set.category;
      if (target && !m.targets[target])
        ctx.addIssue({ code: 'custom', path: ['rules', i], message: 'Unknown target' });
      if (!r.from && !m.rulesFrom)
        ctx.addIssue({ code: 'custom', path: ['rules', i], message: 'No from and no rulesFrom' });
    });
  });

export type Mapping = z.output<typeof mappingSchema>;
export type MappingInput = z.input<typeof mappingSchema>;

export interface TargetAccount {
  id: string;
  ynabName: string;
  name: string;
  type: (typeof ACCOUNT_TYPES)[number];
  onBudget: boolean;
  closedAt: string | null;
  /**
   * The day before the start for accounts opened earlier (their opening balance is the start's
   * cash, not income of the start month), else the first row's day.
   */
  openingDate: string;
  /** Σ register rows before the start. */
  openingBalanceCents: number;
  /** Declared in the mapping (YNAB shows them, the export lacks them); also bookings. */
  adjustments: { date: string; amountCents: number; memo: string }[];
}

export interface TargetCategory {
  id: string;
  name: string;
  group: string;
  kind: (typeof CATEGORY_KINDS)[number];
  class: 'need' | 'want' | 'future' | null;
  hidden: boolean;
  cardAccountId: string | null;
  /** YNAB categories that flow in. */
  sources: string[];
}

export interface TargetSplit {
  /** The split line's own payee (a split can have several). */
  payee: string;
  amountCents: number;
  categoryId: string | null;
  memo: string;
  transferId: string | null;
  transferAccountId: string | null;
  contact: string | null;
  project: string | null;
  incomeType: string | null;
  /** Rule that changed this split, if any. */
  ruleId: string | null;
}

export interface TargetBooking {
  id: string;
  /** Register line; 0 for a balance adjustment declared in the mapping. */
  line: number;
  /** Set for bookings that are not register rows (declared adjustments). */
  importKey?: string;
  accountId: string;
  date: string;
  payee: string;
  systemPayee: SystemPayee | null;
  contact: string | null;
  flag: string;
  status: 'pending' | 'confirmed' | 'reconciled';
  memo: string;
  amountCents: number;
  splits: TargetSplit[];
  /** Always false: scheduled rows become expected payments, not bookings. */
  scheduled: boolean;
}

/**
 * How the rhythm of an expected payment was chosen (see `expectedFromScheduled`):
 * `note_yearly` / `note_monthly` from the bracket note of the row's YNAB category, `recurring`
 * from bookings of the same payee in at least two of the three months before, `once` otherwise,
 * `mapping` for a declared recurring payment.
 */
export type CadenceBasis = 'note_yearly' | 'note_monthly' | 'recurring' | 'once' | 'mapping';

/** An expected payment (Erwartet) from a scheduled YNAB row or the mapping. */
export interface ExpectedPayment {
  /** Raw booking id of the scheduled row, or `recurring:<i>`. */
  source: string;
  name: string;
  kind: 'outflow' | 'inflow';
  accountId: string;
  /** Positive cents; the kind gives the sign. */
  amountCents: number;
  categoryId: string | null;
  incomeType: string | null;
  /** Payee name (mapped); `null` for transfers. */
  payee: string | null;
  contact: string | null;
  rhythm: 'monthly' | 'quarterly' | 'semiannual' | 'yearly';
  /** 1–31 (31 = last day of the month). */
  dueDay: number;
  dueMonth: number | null;
  dateShift: 'none' | 'before' | 'after';
  /** First due day; also the start of the first amount version. */
  startDate: string;
  /** Equal to `startDate` for a one-time payment. */
  endDate: string | null;
  note: string | null;
  basis: CadenceBasis;
}

/** Assigned in the app minus the sum of the sources' Assigned, where the importer changed it. */
export interface AssignedShift {
  month: string;
  categoryId: string;
  cents: number;
}

/** From a bracketed note without a schedule (`[€ 350,-]`): a monthly target. */
export interface TargetProposal {
  categoryId: string;
  amountCents: number | null;
  source: string;
}

export interface MovedAmount {
  ruleId: string;
  month: string;
  fromCategory: string | null;
  toCategory: string | null;
  cents: number;
}

export interface TargetModel {
  startMonth: string;
  months: string[];
  accounts: TargetAccount[];
  categories: TargetCategory[];
  bookings: TargetBooking[];
  assigned: Record<string, Record<string, number>>;
  /** Available per target category at the end of the month before the start. */
  openingCarry: Record<string, number>;
  contacts: string[];
  expectedPayments: ExpectedPayment[];
  targets: TargetProposal[];
  moved: MovedAmount[];
  /** See `balanceEnvelopes`. */
  shifts: AssignedShift[];
}

/** The mapping that keeps everything as in YNAB (accounts by the proposals). */
export function identityMapping(raw: RawModel, startMonth = raw.months[0] ?? '2023-10'): Mapping {
  const accounts: Mapping['accounts'] = {};
  raw.accounts.forEach((a, i) => {
    accounts[a.name] = {
      id: `acc-${i + 1}`,
      name: a.name,
      type: a.proposal.type,
      onBudget: a.proposal.onBudget,
      closedAt: a.proposal.closedAt,
      adjustments: [],
    };
  });
  const cardId = (name: string | null) => {
    const a = name === null ? undefined : accounts[name];
    return a && a !== 'skip' ? a.id : null;
  };
  const targets: Mapping['targets'] = {};
  const categories: Mapping['categories'] = {};
  for (const c of raw.categories) {
    const card = cardId(c.cardAccount);
    targets[c.key] = {
      name: c.name,
      group: c.group,
      kind: card ? 'card_payment' : 'variable',
      class: null,
      hidden: c.hidden,
      cardAccount: card,
    };
    categories[c.key] = c.key;
  }
  return mappingSchema.parse({ version: 1, startMonth, accounts, targets, categories });
}

const STATUS = { Uncleared: 'pending', Cleared: 'confirmed', Reconciled: 'reconciled' } as const;
const EMOJI = /\p{Extended_Pictographic}️?\s*/gu;

/**
 * The target model from the raw layer and a validated mapping: accounts from the start month
 * with their opening balances, bookings from the start on (rules applied), assignments, and the
 * opening Available per target category. Problems are collected, not thrown.
 */
export function applyMapping(
  raw: RawModel,
  mapping: Mapping,
): { target: TargetModel; problems: Problem[] } {
  const problems: Problem[] = [];
  const problem = (
    code: string,
    message: string,
    lines: number[] = [],
    subject?: Problem['subject'],
  ) => problems.push({ severity: 'error', code, message, lines, ...(subject && { subject }) });
  const about = (kind: 'account' | 'category', index: number, name: string) => ({
    kind,
    index,
    hash: shortHash(name),
  });
  const { startMonth } = mapping;
  const startDay = `${startMonth}-01`;
  const dayBefore = lastDayOfMonth(addMonths(startMonth, -1));
  const last = raw.months[raw.months.length - 1];
  if (!last || startMonth < (raw.months[0] as string) || startMonth > last)
    problem('mapping.start_month', 'Start month outside the plan months');

  // Accounts.
  const accounts: TargetAccount[] = [];
  const accountId = new Map<string, string>();
  const opening = new Map<string, number>();
  const later = new Set<string>();
  for (const b of raw.bookings)
    if (b.date < startDay) opening.set(b.account, (opening.get(b.account) ?? 0) + b.amountCents);
    else later.add(b.account);
  raw.accounts.forEach((a, index) => {
    const m = mapping.accounts[a.name];
    if (!m) {
      problem(
        'mapping.account_missing',
        'YNAB account without mapping',
        [],
        about('account', index, a.name),
      );
      return;
    }
    if (m === 'skip') {
      if (later.has(a.name) || (opening.get(a.name) ?? 0) !== 0)
        problem(
          'mapping.account_skip',
          'Only accounts closed before the start can be skipped',
          [],
          about('account', index, a.name),
        );
      return;
    }
    accountId.set(a.name, m.id);
    accounts.push({
      id: m.id,
      ynabName: a.name,
      name: m.name,
      type: m.type,
      onBudget: m.onBudget,
      closedAt: m.closedAt,
      openingDate: a.firstDate >= startDay ? a.firstDate : dayBefore,
      openingBalanceCents: opening.get(a.name) ?? 0,
      adjustments: m.adjustments,
    });
  });

  // Target categories.
  const clean = (name: string) => {
    let out = mapping.names.stripNotes ? stripNote(name) : name;
    if (mapping.names.stripEmoji) out = out.replace(EMOJI, '').trim();
    return out;
  };
  const categories: TargetCategory[] = Object.entries(mapping.targets).map(([id, t]) => ({
    id,
    name: clean(t.name),
    group: clean(t.group),
    kind: t.kind,
    class: t.class,
    hidden: t.hidden,
    cardAccountId: t.cardAccount,
    sources: [],
  }));
  const byId = new Map(categories.map((c) => [c.id, c]));
  const targetOf = new Map<string, string | null>();
  raw.categories.forEach((c, index) => {
    const id = mapping.categories[c.key];
    if (id === undefined) {
      problem(
        'mapping.category_missing',
        'YNAB category without mapping',
        [],
        about('category', index, c.key),
      );
      return;
    }
    targetOf.set(c.key, id === DROP ? null : id);
    if (id !== DROP) byId.get(id)?.sources.push(c.key);
  });
  const target = (key: string | null): string | null =>
    key === null || key === READY_TO_ASSIGN ? null : (targetOf.get(key) ?? null);

  // Bookings from the start on. Scheduled rows (after the "as of" day) are mapped the same way but
  // become expected payments, not bookings.
  const moved = new Map<string, MovedAmount>();
  const contacts = new Set<string>();
  const bookings: TargetBooking[] = [];
  const scheduled: { raw: RawBooking; booking: TargetBooking }[] = [];
  // Splits the ledger would refuse at the write (`assertSplitRefs`), collected per rule/category.
  const refused = { contact: new Map<string, number[]>(), card: new Map<string, number[]>() };
  const refuse = (map: Map<string, number[]>, key: string, line: number) =>
    map.set(key, [...(map.get(key) ?? []), line]);
  for (const b of raw.bookings) {
    const id = accountId.get(b.account);
    if (b.date < startDay || !id) continue;
    const account = accounts.find((a) => a.id === id) as TargetAccount;
    const payee = mapping.payees[b.payee];
    let renamed: string | null = null;
    const splits = b.splits.map((s) => {
      const split: TargetSplit = {
        payee: mapping.payees[s.payee]?.name ?? s.payee,
        amountCents: s.amountCents,
        categoryId: target(s.categoryKey),
        memo: s.memo,
        transferId: s.transferId,
        transferAccountId:
          s.transferAccount === null ? null : (accountId.get(s.transferAccount) ?? null),
        contact: null,
        project: null,
        incomeType: null,
        ruleId: null,
      };
      if (s.transferAccount !== null && split.transferAccountId === null)
        problem('mapping.transfer_skipped', 'Transfer to a skipped account', [s.line]);
      // Rules re-categorise spending and income, never transfer legs. On a tracking account only
      // a rule naming the account applies, and it cannot set a category.
      if (s.transferAccount === null) {
        const rule = applyRule(mapping, b.account, b.date, s, split, {
          moved: b.scheduled ? new Map() : moved,
          tracking: !account.onBudget,
        });
        if (rule?.set.payee && b.splits.length === 1) renamed = split.payee = rule.set.payee;
      }
      if (split.contact) contacts.add(split.contact);
      const kind = split.categoryId === null ? null : byId.get(split.categoryId)?.kind;
      if (split.contact !== null && kind !== 'advance')
        refuse(refused.contact, split.ruleId ?? '', s.line);
      if (kind === 'card_payment') refuse(refused.card, split.categoryId as string, s.line);
      return split;
    });
    const booking: TargetBooking = {
      id: b.id,
      line: b.line,
      accountId: id,
      date: b.date,
      payee: renamed ?? payee?.name ?? b.payee,
      systemPayee: renamed === null ? b.systemPayee : null,
      contact: payee?.contact ?? null,
      flag: b.flag,
      status: STATUS[b.cleared],
      memo: b.memo,
      amountCents: b.amountCents,
      splits,
      scheduled: false,
    };
    if (b.scheduled) {
      scheduled.push({ raw: b, booking });
      continue;
    }
    if (payee?.contact) contacts.add(payee.contact);
    bookings.push(booking);
  }
  for (const [rule, lines] of refused.contact)
    problem(
      'mapping.contact_category',
      `Rule ${rule}: a contact share needs a target category of kind advance`,
      lines,
    );
  for (const [id, lines] of refused.card)
    problem(
      'mapping.card_payment_bookings',
      `Category ${id}: a card payment envelope takes no bookings`,
      lines,
    );
  // Balance changes YNAB shows but does not export (declared in the mapping).
  for (const a of accounts)
    a.adjustments.forEach((adj, i) => {
      if (adj.date < a.openingDate || (raw.asOf !== null && adj.date > raw.asOf))
        problem('mapping.adjustment_date', `Account ${a.id}: adjustment outside the account`);
      bookings.push({
        id: `adj:${a.id}:${i}`,
        line: 0,
        importKey: `mapping:${a.id}:${adj.date}:${adj.amountCents}:${i}`,
        accountId: a.id,
        date: adj.date,
        payee: '',
        systemPayee: 'manual_adjustment',
        contact: null,
        flag: '',
        status: 'confirmed',
        memo: adj.memo,
        amountCents: adj.amountCents,
        splits: [
          {
            payee: '',
            amountCents: adj.amountCents,
            categoryId: null,
            memo: adj.memo,
            transferId: null,
            transferAccountId: null,
            contact: null,
            project: null,
            incomeType: null,
            ruleId: null,
          },
        ],
        scheduled: false,
      });
    });

  // Assignments and the opening Available (carry rule of the month before: max(0, available)).
  const months = last ? monthsBetween(startMonth, last) : [];
  const assigned: TargetModel['assigned'] = {};
  for (const m of months)
    for (const [key, cell] of Object.entries(raw.plan[m] ?? {})) {
      const id = target(key);
      if (id === null || cell.assignedCents === 0) continue;
      const row = (assigned[m] ??= {});
      row[id] = (row[id] ?? 0) + cell.assignedCents;
    }
  const openingCarry: Record<string, number> = {};
  for (const [key, cell] of Object.entries(raw.plan[addMonths(startMonth, -1)] ?? {})) {
    const id = target(key);
    if (id !== null) openingCarry[id] = (openingCarry[id] ?? 0) + Math.max(0, cell.availableCents);
  }

  const notes = new Map(raw.categories.map((c) => [c.key, c.note]));
  const targets: TargetProposal[] = [];
  if (mapping.expectedPayments.fromNotes)
    for (const c of raw.categories) {
      const id = target(c.key);
      if (!c.note || id === null || c.note.schedule) continue;
      targets.push({ categoryId: id, amountCents: c.note.amountCents, source: c.key });
    }
  const expectedPayments = [
    ...(mapping.expectedPayments.fromScheduled
      ? expectedFromScheduled(raw, scheduled, {
          notes: mapping.expectedPayments.fromNotes ? notes : new Map(),
          accountName: (id) => accounts.find((a) => a.id === id)?.name ?? id,
        })
      : []),
    ...recurringPayments(raw, mapping, accountId, (key) => target(key), problem),
  ];

  const model: TargetModel = {
    startMonth,
    months,
    accounts,
    categories,
    bookings,
    assigned,
    openingCarry,
    contacts: [
      ...new Set([
        ...contacts,
        ...expectedPayments.flatMap((e) => (e.contact === null ? [] : [e.contact])),
      ]),
    ].sort(),
    expectedPayments,
    targets,
    moved: [...moved.values()],
    shifts: [],
  };
  if (problems.length === 0) model.shifts = balanceEnvelopes(raw, model);
  return { target: model, problems };
}

/** The first matching rule whose month has come changes the split and records the move. */
function applyRule(
  mapping: Mapping,
  account: string,
  date: string,
  s: RawSplit,
  split: TargetSplit,
  options: { moved: Map<string, MovedAmount>; tracking: boolean },
): Mapping['rules'][number] | null {
  const month = date.slice(0, 7);
  const rule = mapping.rules.find((r) => {
    const from = r.from ?? mapping.rulesFrom;
    const m = r.match;
    return (
      from !== null &&
      month >= from &&
      (!options.tracking || (m.account !== undefined && r.set.category === undefined)) &&
      (m.account === undefined || m.account === account) &&
      (m.payee === undefined || m.payee === s.payee) &&
      (m.memo === undefined || s.memo.toLowerCase().includes(m.memo.toLowerCase())) &&
      (m.category === undefined || m.category === s.categoryKey) &&
      (m.minCents === undefined || s.amountCents >= m.minCents) &&
      (m.maxCents === undefined || s.amountCents <= m.maxCents) &&
      (m.dateFrom === undefined || date >= m.dateFrom) &&
      (m.dateTo === undefined || date <= m.dateTo)
    );
  });
  if (!rule) return null;
  split.ruleId = rule.id;
  split.contact = rule.set.contact ?? null;
  split.project = rule.set.project ?? null;
  split.incomeType = rule.set.incomeType ?? null;
  if (rule.set.category === undefined || rule.set.category === split.categoryId) return rule;
  const key = `${rule.id}|${month}|${split.categoryId}|${rule.set.category}`;
  const entry = options.moved.get(key) ?? {
    ruleId: rule.id,
    month,
    fromCategory: split.categoryId,
    toCategory: rule.set.category,
    cents: 0,
  };
  entry.cents += s.amountCents;
  options.moved.set(key, entry);
  split.categoryId = rule.set.category;
  return rule;
}

/**
 * Expected payments from YNAB's scheduled rows: every row dated after the export's "as of" day is
 * the next occurrence of a scheduled transaction. One expected payment per scheduled transaction;
 * of a transfer pair only the outflow leg. Rows of the same account, counterpart, amount and
 * categories on the same day of later months are later occurrences of one monthly transaction (an
 * export can hold several): the first one counts. Rhythm
 * (`CadenceBasis`): a yearly bracket note of the row's YNAB category (`am 16.02.`; two dates six
 * months apart: half-yearly) makes it yearly, a monthly note (`am 01.`, `30./31.`, `am ?`) monthly,
 * else bookings of the same payee (or transfer partner) on the account in at least two of the
 * three months before the "as of" month, or one with the same amount, make it monthly; otherwise
 * it is a one-time payment. The
 * due day (and month) is the row's: YNAB's schedule, not the note, says when it is booked.
 */
export function expectedFromScheduled(
  raw: RawModel,
  rows: ReadonlyArray<{ raw: RawBooking; booking: TargetBooking }>,
  options: {
    notes: ReadonlyMap<string, RawCategory['note']>;
    accountName: (id: string) => string;
  },
): ExpectedPayment[] {
  const asOfMonth = (raw.asOf ?? '9999-12-31').slice(0, 7);
  const before = [1, 2, 3].map((n) => addMonths(asOfMonth, -n));
  const counterpart = (b: RawBooking) =>
    b.splits.length === 1 && b.splits[0]?.transferAccount
      ? `>${b.splits[0].transferAccount}`
      : b.payee;
  const seen = new Map<string, Set<string>>();
  const amounts = new Set<string>();
  for (const b of raw.bookings) {
    if (b.scheduled) continue;
    const month = b.date.slice(0, 7);
    if (!before.includes(month)) continue;
    const key = `${b.account}|${counterpart(b)}`;
    seen.set(key, (seen.get(key) ?? new Set()).add(month));
    amounts.add(`${key}|${b.amountCents}`);
  }
  const out: ExpectedPayment[] = [];
  const series = new Map<string, ExpectedPayment>();
  const sorted = [...rows].sort((x, y) => x.raw.date.localeCompare(y.raw.date));
  for (const { raw: r, booking: b } of sorted) {
    const transfer = b.splits.length === 1 ? (b.splits[0]?.transferAccountId ?? null) : null;
    // A transfer pair is one scheduled transaction: keep the outflow leg.
    if (transfer !== null && b.amountCents > 0) continue;
    if (b.amountCents === 0) continue;
    const same = [
      r.account,
      counterpart(r),
      r.amountCents,
      r.date.slice(8),
      ...r.splits.map((s) => s.categoryKey),
    ].join('|');
    const first = series.get(same);
    if (first) {
      if (first.basis === 'once') {
        first.basis = 'recurring';
        first.endDate = null;
      }
      continue;
    }
    const day = Number(b.date.slice(8, 10));
    const month = Number(b.date.slice(5, 7));
    const categories = [...new Set(b.splits.map((s) => s.categoryId))];
    const keys = [...new Set(r.splits.map((s) => s.categoryKey))];
    const schedule = keys.length === 1 ? options.notes.get(keys[0] as string)?.schedule : null;
    let rhythm: ExpectedPayment['rhythm'] = 'monthly';
    let dueMonth: number | null = null;
    let basis: CadenceBasis;
    if (schedule?.kind === 'yearly') {
      basis = 'note_yearly';
      const [first, second] = schedule.dates;
      const half =
        schedule.dates.length === 2 &&
        first?.day === second?.day &&
        Math.abs((first?.month ?? 0) - (second?.month ?? 0)) === 6;
      rhythm = half ? 'semiannual' : 'yearly';
      dueMonth = half ? Math.min(first?.month ?? 12, second?.month ?? 12) : month;
    } else if (schedule) basis = 'note_monthly';
    else if (
      (seen.get(`${r.account}|${counterpart(r)}`)?.size ?? 0) >= 2 ||
      amounts.has(`${r.account}|${counterpart(r)}|${r.amountCents}`)
    )
      basis = 'recurring';
    else basis = 'once';
    const incomeType = b.splits.length === 1 ? (b.splits[0]?.incomeType ?? null) : null;
    const payment: ExpectedPayment = {
      source: b.id,
      name:
        transfer !== null
          ? `Umbuchung an ${options.accountName(transfer)}`
          : b.payee.trim() || 'Erwartete Zahlung',
      kind: b.amountCents < 0 ? 'outflow' : 'inflow',
      accountId: b.accountId,
      amountCents: Math.abs(b.amountCents),
      categoryId: incomeType === null && categories.length === 1 ? (categories[0] ?? null) : null,
      incomeType,
      payee: transfer !== null || b.systemPayee !== null ? null : b.payee.trim() || null,
      contact: b.contact,
      rhythm,
      dueDay: day,
      dueMonth,
      dateShift: 'none',
      startDate: b.date,
      endDate: basis === 'once' ? b.date : null,
      note: b.memo.trim() || null,
      basis,
    };
    series.set(same, payment);
    out.push(payment);
  }
  return out;
}

/** Declared recurring payments: account, amount and direction of the latest booked row. */
function recurringPayments(
  raw: RawModel,
  mapping: Mapping,
  accountId: ReadonlyMap<string, string>,
  target: (key: string | null) => string | null,
  problem: (code: string, message: string) => void,
): ExpectedPayment[] {
  return mapping.expectedPayments.recurring.flatMap((p, i) => {
    const latest = raw.bookings
      .filter(
        (b) =>
          !b.scheduled &&
          b.payee === p.payee &&
          (p.account === undefined || b.account === p.account) &&
          accountId.has(b.account),
      )
      .reduce<RawBooking | null>((a, b) => (a === null || b.date >= a.date ? b : a), null);
    if (!latest || latest.amountCents === 0) {
      problem('mapping.recurring_payment', `Recurring payment ${i + 1}: no booked row found`);
      return [];
    }
    const key = latest.splits.length === 1 ? (latest.splits[0]?.categoryKey ?? null) : null;
    const categoryId = p.incomeType ? null : (p.category ?? target(key));
    const name = mapping.payees[p.payee]?.name ?? p.payee;
    return [
      {
        source: `recurring:${i}`,
        name: p.name ?? name,
        kind: latest.amountCents < 0 ? 'outflow' : 'inflow',
        accountId: accountId.get(latest.account) as string,
        amountCents: Math.abs(latest.amountCents),
        categoryId,
        incomeType: p.incomeType ?? null,
        payee: name,
        contact: mapping.payees[p.payee]?.contact ?? null,
        rhythm: p.rhythm,
        dueDay: p.dueDay,
        dueMonth: p.dueMonth ?? null,
        dateShift: p.dateShift,
        // From the month after the latest row: that one is booked already.
        startDate: `${addMonths(latest.date.slice(0, 7), 1)}-01`,
        endDate: null,
        note: null,
        basis: 'mapping' as const,
      },
    ];
  });
}

/**
 * Keep every envelope as YNAB has it (owner decision 02.10.2026): rules move bookings between
 * categories and n:1 merges join categories with different carries, both of which would change
 * Available and, through overspending, "Zu verteilen". So the assigned amounts are re-derived,
 * month by month, such that
 * - every target category's Available equals the sum of its sources' Available in Plan.tsv (a
 *   target without sources: 0, i.e. what a rule moves in is assigned along with it), and
 * - a card payment envelope additionally holds the card spending that the app funds and YNAB
 *   left as credit overspending (or the other way round): YNAB's credit overspending of the card
 *   minus the app's. A rule that moves card spending changes how much of it is funded.
 * Then Zu verteilen = cash − Σ Available − credit overspending equals YNAB's Ready to Assign in
 * every month. Activity is independent of assigned amounts (card envelopes: of their own), so
 * one pass for the spending categories and one for the card envelopes suffice. Returns the
 * changes against the sum of the sources' Assigned.
 */
export function balanceEnvelopes(raw: RawModel, target: TargetModel): AssignedShift[] {
  if (target.months.length === 0) return [];
  const ynab = new Map(ynabMonths(raw).map((m) => [m.month, m]));
  const original = new Map<string, number>();
  for (const [month, row] of Object.entries(target.assigned))
    for (const [id, cents] of Object.entries(row)) original.set(`${month}|${id}`, cents);
  const onBudget = new Set(target.accounts.filter((a) => a.onBudget).map((a) => a.id));
  const cardOf = new Map(
    target.categories
      .filter((c) => c.kind === 'card_payment' && c.cardAccountId && onBudget.has(c.cardAccountId))
      .map((c) => [c.id, target.accounts.find((a) => a.id === c.cardAccountId) as TargetAccount]),
  );
  const sources = (c: TargetCategory, month: string) =>
    c.sources.reduce((a, key) => a + (raw.plan[month]?.[key]?.availableCents ?? 0), 0);
  const solve = (cards: boolean) => {
    const budget = budgetMonths(budgetInputOf(target));
    for (const c of target.categories) {
      const card = cardOf.get(c.id);
      if ((card !== undefined) !== cards) continue;
      let previous = 0;
      target.months.forEach((month, i) => {
        const b = budget[i] as ReturnType<typeof budgetMonths>[number];
        const credit = card
          ? (ynab.get(month)?.creditByCard[card.ynabName] ?? 0) -
            (b.cards[card.id]?.cardDebtGrowthCents ?? 0)
          : 0;
        const goal = sources(c, month) + credit;
        const carry = i === 0 ? (target.openingCarry[c.id] ?? 0) : Math.max(0, previous);
        const cents = goal - carry - (b.envelopes[c.id]?.activityCents ?? 0);
        const row = (target.assigned[month] ??= {});
        if (cents === 0) delete row[c.id];
        else row[c.id] = cents;
        previous = goal;
      });
    }
  };
  solve(false);
  solve(true);
  const shifts: AssignedShift[] = [];
  for (const month of target.months)
    for (const c of target.categories) {
      const cents = (target.assigned[month]?.[c.id] ?? 0) - (original.get(`${month}|${c.id}`) ?? 0);
      if (cents !== 0) shifts.push({ month, categoryId: c.id, cents });
    }
  return shifts;
}

/** The target model as input of the domain's `budgetMonths`. */
export function budgetInputOf(target: TargetModel): BudgetInput {
  return {
    accounts: target.accounts,
    categories: target.categories,
    splits: target.bookings
      .filter((b) => !b.scheduled)
      .flatMap((b) =>
        b.splits.map((s) => ({
          accountId: b.accountId,
          date: b.date,
          amountCents: s.amountCents,
          categoryId: s.categoryId,
          transferAccountId: s.transferAccountId,
        })),
      ),
    months: target.months,
    assigned: target.assigned,
    openingCarry: target.openingCarry,
    cardRule: 'ynab',
  };
}
