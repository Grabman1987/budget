import { addMonths, lastDayOfMonth, monthsBetween, type BudgetInput } from '@budget/domain';
import { z } from 'zod';
import {
  READY_TO_ASSIGN,
  shortHash,
  stripNote,
  type NoteSchedule,
  type Problem,
  type RawModel,
  type RawSplit,
  type SystemPayee,
} from './model';

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
/** Investment accounts: only cash flows are imported, YNAB's value adjustments are dropped (Gate 3). */
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
    })
    .partial(),
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
    expectedPayments: z.object({ fromNotes: z.boolean().default(true) }).prefault({}),
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
  line: number;
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
  /** Dated after the export's "as of" day: pending, outside the budget and the checks. */
  scheduled: boolean;
}

/** From a bracketed note with a schedule; the owner confirms each (P3). */
export interface ExpectedPayment {
  categoryId: string;
  /** `null` when the note has `??`. */
  amountCents: number | null;
  schedule: NoteSchedule;
  source: string;
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

  // Bookings from the start on.
  const moved = new Map<string, MovedAmount>();
  const contacts = new Set<string>();
  const bookings: TargetBooking[] = [];
  for (const b of raw.bookings) {
    const id = accountId.get(b.account);
    if (b.date < startDay || !id) continue;
    const account = accounts.find((a) => a.id === id) as TargetAccount;
    if (INVESTMENT_TYPES.includes(account.type) && b.systemPayee?.endsWith('adjustment')) continue;
    const payee = mapping.payees[b.payee];
    if (payee?.contact) contacts.add(payee.contact);
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
      // Rules re-categorise spending and income, never transfer legs or tracking accounts.
      if (s.transferAccount === null && account.onBudget)
        applyRule(mapping, b.account, b.date, s, split, moved);
      if (split.contact) contacts.add(split.contact);
      return split;
    });
    bookings.push({
      id: b.id,
      line: b.line,
      accountId: id,
      date: b.date,
      payee: payee?.name ?? b.payee,
      systemPayee: b.systemPayee,
      contact: payee?.contact ?? null,
      flag: b.flag,
      status: b.scheduled ? 'pending' : STATUS[b.cleared],
      memo: b.memo,
      amountCents: b.amountCents,
      splits,
      scheduled: b.scheduled,
    });
  }

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

  const expectedPayments: ExpectedPayment[] = [];
  const targets: TargetProposal[] = [];
  if (mapping.expectedPayments.fromNotes)
    for (const c of raw.categories) {
      const id = target(c.key);
      if (!c.note || id === null) continue;
      const { amountCents, schedule } = c.note;
      if (schedule) expectedPayments.push({ categoryId: id, amountCents, schedule, source: c.key });
      else targets.push({ categoryId: id, amountCents, source: c.key });
    }

  return {
    target: {
      startMonth,
      months,
      accounts,
      categories,
      bookings,
      assigned,
      openingCarry,
      contacts: [...contacts].sort(),
      expectedPayments,
      targets,
      moved: [...moved.values()],
    },
    problems,
  };
}

/** The first matching rule whose month has come changes the split and records the move. */
function applyRule(
  mapping: Mapping,
  account: string,
  date: string,
  s: RawSplit,
  split: TargetSplit,
  moved: Map<string, MovedAmount>,
): void {
  const month = date.slice(0, 7);
  const rule = mapping.rules.find((r) => {
    const from = r.from ?? mapping.rulesFrom;
    const m = r.match;
    return (
      from !== null &&
      month >= from &&
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
  if (!rule) return;
  split.ruleId = rule.id;
  split.contact = rule.set.contact ?? null;
  split.project = rule.set.project ?? null;
  split.incomeType = rule.set.incomeType ?? null;
  if (rule.set.category === undefined || rule.set.category === split.categoryId) return;
  const key = `${rule.id}|${month}|${split.categoryId}|${rule.set.category}`;
  const entry = moved.get(key) ?? {
    ruleId: rule.id,
    month,
    fromCategory: split.categoryId,
    toCategory: rule.set.category,
    cents: 0,
  };
  entry.cents += s.amountCents;
  moved.set(key, entry);
  split.categoryId = rule.set.category;
}

/** The target model as input of the domain's `budgetMonths`. */
export function budgetInputOf(target: TargetModel): BudgetInput {
  return {
    accounts: target.accounts,
    categories: target.categories,
    // Scheduled bookings are not in YNAB's plan yet.
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
