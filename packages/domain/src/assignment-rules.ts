import { z } from 'zod';

/** Derive a percent template from confirmed, same-direction category splits. */
export function learnAssignmentSplits(
  splits: readonly { categoryId: string; amountCents: number }[],
) {
  const total = splits.reduce((n, s) => n + BigInt(Math.abs(s.amountCents)), 0n);
  if (!total) throw new RangeError('Eine Split-Vorlage benötigt einen Betrag.');
  const rows = splits.map((s, i) => ({
    categoryId: s.categoryId,
    i,
    weightBp: Number((BigInt(Math.abs(s.amountCents)) * 10000n) / total),
    remainder: (BigInt(Math.abs(s.amountCents)) * 10000n) % total,
  }));
  const missing = 10000 - rows.reduce((n, s) => n + s.weightBp, 0);
  [...rows]
    .sort((a, b) => (a.remainder === b.remainder ? a.i - b.i : a.remainder > b.remainder ? -1 : 1))
    .slice(0, missing)
    .forEach((s) => s.weightBp++);
  if (rows.some((s) => s.weightBp < 1))
    throw new RangeError('Split-Anteile unter 0,01 % bitte in einer neuen Regel selbst festlegen.');
  return rows.map(({ categoryId, weightBp }) => ({ categoryId, weightBp }));
}

const identifier = z.string().min(1).max(100);
const money = z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER);

/** Deliberately bounded regex dialect: no groups, backreferences or stacked repetition. */
export function safeBankRegex(pattern: string): boolean {
  if (!pattern || pattern.length > 200) return false;
  let inClass = false,
    repetitions = 0,
    alternation = false;
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]!;
    if (c === '\\') {
      if (++i >= pattern.length || /[0-9kp]/i.test(pattern[i]!)) return false;
      continue;
    }
    if (c === '[') inClass = true;
    if (c === ']') inClass = false;
    if (inClass) continue;
    if (c === '|') alternation = true;
    if ('(){}'.includes(c)) return false;
    if ('*+?'.includes(c) && ++repetitions > 1) return false;
  }
  if (repetitions && (!pattern.startsWith('^') || alternation)) return false;
  try {
    new RegExp(pattern, 'iu');
    return true;
  } catch {
    return false;
  }
}

export const assignmentConditionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('counterparty'), text: z.string().min(1).max(4096) }).strict(),
  z.object({ type: z.literal('payee'), payeeId: identifier }).strict(),
  z.object({ type: z.literal('contains'), text: z.string().trim().min(1).max(200) }).strict(),
  z
    .object({
      type: z.literal('regex'),
      pattern: z
        .string()
        .refine(
          safeBankRegex,
          'Ungültiges Muster: keine Gruppen; Wiederholung nur mit ^ am Anfang und ohne |.',
        ),
    })
    .strict(),
  z
    .object({ type: z.literal('amount'), minCents: money.optional(), maxCents: money.optional() })
    .strict()
    .refine(
      (v) =>
        (v.minCents !== undefined || v.maxCents !== undefined) &&
        (v.minCents === undefined || v.maxCents === undefined || v.minCents <= v.maxCents),
      'Betragsbereich prüfen.',
    ),
  z.object({ type: z.literal('account'), accountId: identifier }).strict(),
  z.object({ type: z.literal('direction'), direction: z.enum(['inflow', 'outflow']) }).strict(),
]);
export const assignmentMatchSchema = z
  .object({
    mode: z.enum(['all', 'any']),
    conditions: z.array(assignmentConditionSchema).min(1).max(12),
  })
  .strict();
export const assignmentActionsSchema = z
  .object({
    payeeId: identifier.nullable().optional(),
    categoryId: identifier.nullable().optional(),
    incomeTypeId: identifier.nullable().optional(),
    accountId: identifier.optional(),
    splits: z
      .array(
        z.object({ categoryId: identifier, weightBp: z.number().int().min(1).max(10000) }).strict(),
      )
      .min(2)
      .max(20)
      .optional(),
    memo: z.string().max(4096).optional(),
    flag: z.enum(['red', 'orange', 'yellow', 'green', 'blue', 'purple']).nullable().optional(),
    transferAccountId: identifier.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Mindestens eine Aktion wählen.')
  .refine(
    (v) => !v.incomeTypeId || (!v.splits && !v.transferAccountId),
    'Einnahmeart nicht mit Split-Vorlage oder Umbuchung kombinieren.',
  )
  .refine(
    (v) =>
      !v.splits ||
      (v.categoryId === undefined &&
        !v.transferAccountId &&
        v.splits.reduce((n, s) => n + s.weightBp, 0) === 10000),
    'Split-Anteile müssen 100 % ergeben; Kategorie und Umbuchung separat wählen.',
  )
  .refine(
    (v) => !v.transferAccountId || v.payeeId == null,
    'Umbuchungen haben ein Gegenkonto statt eines Empfängers.',
  );
export const assignmentRuleSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    match: assignmentMatchSchema,
    actions: assignmentActionsSchema,
    enabled: z.boolean().default(true),
    automatic: z.boolean().default(false),
  })
  .strict();
export type AssignmentRuleInput = z.infer<typeof assignmentRuleSchema>;
export type AssignmentActions = z.infer<typeof assignmentActionsSchema>;
export type AssignmentMatch = z.infer<typeof assignmentMatchSchema>;
export type AssignmentCondition = z.infer<typeof assignmentConditionSchema>;
/** Both provider text fields participate in raw-text conditions without cleanup. */
export function bankAssignmentText(rawPayee: string | null, rawMemo: string): string {
  return [rawPayee, rawMemo].filter(Boolean).join('\n').slice(0, 4096);
}

export interface AssignmentRow {
  accountId: string;
  amountCents: number;
  payeeId: string | null;
  rawText: string;
  counterparty?: string;
  source?: string;
}

export function matchesAssignment(match: AssignmentMatch, row: AssignmentRow): boolean {
  const test = (condition: AssignmentCondition): boolean => {
    switch (condition.type) {
      case 'counterparty':
        return (
          !!row.counterparty && bankAliasKey(row.counterparty) === bankAliasKey(condition.text)
        );
      case 'payee':
        return row.payeeId === condition.payeeId;
      case 'contains':
        return row.rawText
          .toLocaleLowerCase('de-AT')
          .includes(condition.text.toLocaleLowerCase('de-AT'));
      case 'regex':
        return (
          safeBankRegex(condition.pattern) &&
          new RegExp(condition.pattern, 'iu').test(row.rawText.slice(0, 4096))
        );
      case 'amount':
        return (
          (condition.minCents === undefined || row.amountCents >= condition.minCents) &&
          (condition.maxCents === undefined || row.amountCents <= condition.maxCents)
        );
      case 'account':
        return row.accountId === condition.accountId;
      case 'direction':
        return condition.direction === 'inflow' ? row.amountCents > 0 : row.amountCents < 0;
    }
  };
  return match.mode === 'all' ? match.conditions.every(test) : match.conditions.some(test);
}

/** Largest remainder on absolute cents; stable order resolves ties, sign is applied last. */
export function assignmentSplits(
  amountCents: number,
  template: NonNullable<AssignmentActions['splits']>,
) {
  if (!Number.isSafeInteger(amountCents) || template.reduce((n, s) => n + s.weightBp, 0) !== 10000)
    throw new RangeError('Ungültige Split-Vorlage.');
  const total = BigInt(Math.abs(amountCents));
  const rows = template.map((s, i) => ({
    ...s,
    i,
    cents: (total * BigInt(s.weightBp)) / 10000n,
    remainder: (total * BigInt(s.weightBp)) % 10000n,
  }));
  const missing = Number(total - rows.reduce((n, s) => n + s.cents, 0n));
  [...rows]
    .sort((a, b) => Number(b.remainder - a.remainder) || a.i - b.i)
    .slice(0, missing)
    .forEach((s) => s.cents++);
  return rows.map((s) => ({
    categoryId: s.categoryId,
    amountCents: Number(s.cents) * Math.sign(amountCents),
  }));
}

export const payeeCleanupSchema = z
  .object({
    useMemo: z.boolean().default(false),
    stripSepa: z.boolean().default(true),
    stripCards: z.boolean().default(true),
    stripDates: z.boolean().default(true),
    stripReferences: z.boolean().default(true),
    prefixes: z.array(z.string().trim().min(1).max(80)).max(12).default([]),
  })
  .strict();
export type PayeeCleanup = z.infer<typeof payeeCleanupSchema>;
export const DEFAULT_PAYEE_CLEANUP = payeeCleanupSchema.parse({});
export const bankAliasKey = (raw: string) =>
  raw.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('de-AT');

/** Raw bank text is retained separately. Cleanup affects only the proposed recipient label. */
export function cleanBankPayee(
  rawPayee: string | null,
  memo: string,
  options: PayeeCleanup = DEFAULT_PAYEE_CLEANUP,
): string {
  let text = (options.useMemo ? memo : rawPayee || memo).normalize('NFKC').slice(0, 4096);
  if (options.stripSepa)
    text = text.replace(/^\s*SEPA[-\s]*(?:Lastschrift|Überweisung|Gutschrift)\s*[:\-/]?\s*/iu, '');
  for (const prefix of options.prefixes)
    if (text.trimStart().toLocaleLowerCase('de-AT').startsWith(prefix.toLocaleLowerCase('de-AT')))
      text = text.trimStart().slice(prefix.length);
  if (options.stripCards)
    text = text
      .replace(/\b(?:Karte|Card|Kartennr\.?)[\s:]*[\d*xX•-]{4,30}\b/giu, ' ')
      .replace(/\b\d{4}(?:[ -]?\d{4}){3}\b/gu, ' ')
      .replace(/[*xX•]{4,}\s*\d{4}\b/gu, ' ');
  if (options.stripDates)
    text = text.replace(
      /\b(?:\d{4}-\d{2}-\d{2}|\d{2}[./]\d{2}(?:[./]\d{2,4})?)(?:\s+\d{2}:\d{2}(?::\d{2})?)?\b/gu,
      ' ',
    );
  if (options.stripReferences)
    text = text.replace(
      /\b(?:Referenz|Ref\.?|EREF|MREF|CRED|End[- ]to[- ]End|Mandat(?:sreferenz)?|Transaktions[- ]?ID)\s*[:+]?\s*[\p{L}\d/-]+/giu,
      ' ',
    );
  return text
    .replace(/\s+/gu, ' ')
    .replace(/^[\s·:/-]+|[\s·:/-]+$/gu, '')
    .trim();
}
