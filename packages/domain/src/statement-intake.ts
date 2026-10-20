import { z } from 'zod';

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const date = new Date(v + 'T00:00:00Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === v;
  });
export const statementFactsSchema = z
  .object({
    reference: z.string().trim().min(1).max(128).nullable(),
    issueDate: day.nullable(),
    periodFrom: day.nullable(),
    periodTo: day.nullable(),
    payableCents: z.number().int().safe().nullable(),
    currency: z
      .enum(['EUR', 'USD', 'CHF', 'GBP', 'CZK', 'HUF', 'PLN', 'SEK', 'NOK', 'DKK'])
      .nullable(),
    debitDate: day.nullable(),
    accountHint: z
      .string()
      .regex(/^\*{4}\d{4}$/)
      .nullable(),
  })
  .strict()
  .refine((f) => !f.periodFrom || !f.periodTo || f.periodFrom <= f.periodTo);
export type StatementFacts = z.infer<typeof statementFactsSchema>;
export type StatementField<T> = {
  value: T | null;
  candidates: T[];
  origin: 'printed' | 'owner' | 'unavailable';
  evidence: { page: null; line: number | null; label: string | null };
};
export type StatementFields = {
  [K in keyof StatementFacts]: StatementField<NonNullable<StatementFacts[K]>>;
};
export type StatementProposal = {
  schemaVersion: 1;
  parserVersion: 1;
  sha256: string;
  extraction: 'parsed' | 'manual_required' | 'password_required' | 'unreadable_or_limit';
  fields: StatementFields;
  warnings: string[];
  relatedIntakeIds: string[];
  draft?: StatementFacts;
};
export type StatementIntakeView = {
  id: string;
  accountId: string;
  receiptId: string;
  sha256: string;
  status: 'pending' | 'reviewed' | 'rejected';
  revision: string;
  proposal: StatementProposal;
  reviewed: { fields: StatementFields } | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};
export type StatementCas = { revision: string; sha256: string; accountId: string };
export type StatementReply = {
  intake: StatementIntakeView;
  groupId: string | null;
  duplicate?: boolean;
};
const evidence = z
  .object({
    page: z.null(),
    line: z.number().int().positive().nullable(),
    label: z
      .enum([
        'reference',
        'issue_date',
        'period',
        'debit_date',
        'card_hint',
        'company_gross',
        'currency',
        'payable',
      ])
      .nullable(),
  })
  .strict();
const fieldSchema = <T extends z.ZodType>(value: T) =>
  z
    .object({
      value: value.nullable(),
      candidates: z.array(value).max(4),
      origin: z.enum(['printed', 'owner', 'unavailable']),
      evidence,
    })
    .strict();
export const statementFieldsSchema = z
  .object({
    reference: fieldSchema(z.string().min(1).max(128)),
    issueDate: fieldSchema(day),
    periodFrom: fieldSchema(day),
    periodTo: fieldSchema(day),
    payableCents: fieldSchema(z.number().int().safe()),
    currency: fieldSchema(statementFactsSchema.shape.currency.unwrap()),
    debitDate: fieldSchema(day),
    accountHint: fieldSchema(z.string().regex(/^\*{4}\d{4}$/)),
  })
  .strict();
export const statementProposalSchema = z
  .object({
    schemaVersion: z.literal(1),
    parserVersion: z.literal(1),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    extraction: z.enum(['parsed', 'manual_required', 'password_required', 'unreadable_or_limit']),
    fields: statementFieldsSchema,
    warnings: z
      .array(
        z.enum([
          'parsed',
          'manual_required',
          'password_required',
          'unreadable_or_limit',
          'no_supported_text',
          'ambiguous_company_gross',
          'debit_date_required',
          'possible_amendment',
          ...(
            [
              'reference',
              'issueDate',
              'periodFrom',
              'periodTo',
              'payableCents',
              'currency',
              'debitDate',
              'accountHint',
            ] as const
          ).map((k) => `ambiguous_${k}` as const),
        ]),
      )
      .max(16),
    relatedIntakeIds: z.array(z.string().uuid()).max(8),
    draft: statementFactsSchema.optional(),
  })
  .strict();
export const emptyStatementFacts = (): StatementFacts => ({
  reference: null,
  issueDate: null,
  periodFrom: null,
  periodTo: null,
  payableCents: null,
  currency: null,
  debitDate: null,
  accountHint: null,
});
const keys = Object.keys(emptyStatementFacts()) as (keyof StatementFacts)[];
const field = <T>(): StatementField<T> => ({
  value: null,
  candidates: [],
  origin: 'unavailable',
  evidence: { page: null, line: null, label: null },
});
export function unavailableStatement(
  sha256: string,
  extraction: StatementProposal['extraction'],
): StatementProposal {
  return {
    schemaVersion: 1,
    parserVersion: 1,
    sha256,
    extraction,
    fields: Object.fromEntries(keys.map((k) => [k, field()])) as StatementFields,
    warnings: [extraction],
    relatedIntakeIds: [],
  };
}
/** Flattened extractor lines only: page provenance is deliberately unavailable. */
export function parseStatementText(text: string, sha256: string): StatementProposal {
  const p = unavailableStatement(sha256, 'manual_required');
  p.warnings = [];
  if (!text.trim() || text.length > 200000) {
    p.warnings = ['no_supported_text'];
    return p;
  }
  // Match finite extractor aliases without rewriting preserved column positions.
  const lines = text.split(/\r?\n/);
  const netLabel = /\b(?:Total|Toial)\s+Net(?:to|o)\b/i;
  const grossLabel = /\b(?:Total|Toial)\s+Brut(?:to|o)\b/i;
  const add = <K extends keyof StatementFacts>(
    key: K,
    value: NonNullable<StatementFacts[K]>,
    line: number,
    label: string,
  ) => {
    const f = p.fields[key] as StatementField<NonNullable<StatementFacts[K]>>;
    if (!f.candidates.includes(value) && f.candidates.length < 4) f.candidates.push(value);
    f.value = f.candidates.length === 1 ? f.candidates[0]! : null;
    f.origin = f.value === null ? 'unavailable' : 'printed';
    f.evidence = { page: null, line: line + 1, label };
  };
  const iso = (s: string) => {
    const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(s);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : s;
  };
  const dates = (s: string) =>
    s
      .match(/\b(?:\d{2}\.\d{2}\.\d{4}|\d{4}-\d{2}-\d{2})\b/g)
      ?.map(iso)
      .filter((d) => day.safeParse(d).success) ?? [];
  const money = (s: string) => {
    const terms = [...s.matchAll(/[-−]?\d[\d.,]*/g)];
    if (
      terms.some(
        (t) =>
          !/^[-−]?(?:\d+|\d{1,3}(?:\.\d{3})+),\d{2}$/.test(t[0]) ||
          /[\p{L}\d.,+−-]/u.test(s[t.index - 1] ?? ''),
      )
    )
      return [];
    return terms.map((term) => {
      const plain = term[0].replace(/\./g, '').replace('−', '-');
      const [a, b] = plain.split(',');
      const sign = a!.startsWith('-') ? -1n : 1n;
      const n = BigInt(a!) * 100n + sign * BigInt(b!);
      return {
        value: Number.isSafeInteger(Number(n)) ? Number(n) : null,
        start: term.index,
        end: term.index + term[0].length,
      };
    });
  };
  let company = false;
  lines.forEach((l, i) => {
    const ref = /\b(?:Rechnungsnummer|Rechnungtnummer|Abrechnungsnummer)\s*:?\s*(\S.{0,127})/i.exec(
      l,
    );
    if (ref) add('reference', ref[1]!.trim().slice(0, 128), i, 'reference');
    if (/\b(?:Rechnungsdatum|Rechnungtdaium|Ausstellungsdatum)\b/i.test(l))
      for (const d of dates(l)) add('issueDate', d, i, 'issue_date');
    if (/\b(?:Abrechnungszeitraum|Abrechnungtzeiiraum)\b/i.test(l)) {
      const ds = dates(l);
      if (ds.length === 2) {
        add('periodFrom', ds[0]!, i, 'period');
        add('periodTo', ds[1]!, i, 'period');
      }
    }
    if (/\b(?:Einzugsdatum|Abbuchungsdatum)\b/i.test(l))
      for (const d of dates(l)) add('debitDate', d, i, 'debit_date');
    if (/\b(?:Kartensumme|Kartennummer)\b/i.test(l))
      for (const h of l.matchAll(/\*{4}(\d{4})\b/g))
        add('accountHint', `****${h[1]}`, i, 'card_hint');
    if (/\bGesamt\s+Firmensumme\b/i.test(l)) {
      company = true;
      const headerIndex = lines.findLastIndex(
        (x, j) => j < i && netLabel.test(x) && /\b(?:MwSt|MwSi)\b/i.test(x) && grossLabel.test(x),
      );
      const header = lines[headerIndex];
      const continuation = lines[headerIndex + 1];
      const vatLabels = [...(header?.matchAll(/\b(?:MwSt|MwSi)\b/gi) ?? [])];
      const vals = money(l),
        net = header?.search(netLabel),
        vat = vatLabels[0]?.index,
        gross = header?.search(grossLabel);
      const rate = /\b(?:Satz|Saiz)\s*%/i.exec(continuation ?? '');
      const vatAmount = /\b(?:Betrag|Beirag)\b/i.exec(continuation ?? '');
      const continuationNet = /\bNet(?:to|o)\s+in\s+EUR\b/i.exec(continuation ?? '');
      const grossCurrency = [...(continuation ?? '').matchAll(/\bEUR\b/g)].find(
        (m) => m.index >= gross!,
      );
      const inlineHeader =
        vatLabels.length === 1 &&
        /\b(?:MwSt|MwSi)\s+(?:Betrag|Beirag)\b/i.test(header ?? '') &&
        /\bin\s+EUR\b/i.test(header?.slice(gross) ?? '');
      const wrappedHeader =
        vatLabels.length === 2 &&
        rate &&
        vatAmount &&
        continuationNet &&
        grossCurrency &&
        /\bin\s*$/i.test(header ?? '') &&
        continuationNet.index + continuationNet[0].length > net! &&
        continuationNet.index + continuationNet[0].length <= vat! &&
        rate.index + rate[0].length > vat! &&
        rate.index < vatLabels[1]!.index &&
        rate.index + rate[0].length <= vatAmount.index &&
        vatAmount.index >= Math.ceil((vat! + vatLabels[1]!.index) / 2) &&
        vatAmount.index + vatAmount[0].length > vatLabels[1]!.index &&
        vatAmount.index < gross!;
      const currencyText = inlineHeader
        ? header!
        : wrappedHeader
          ? header! + ' ' + continuation
          : '';
      const currencyLine = inlineHeader ? headerIndex : headerIndex + 1;
      const conflictingCurrency = (l.match(/\b[A-Z]{3}\b/g) ?? []).some((c) => c !== 'EUR');
      if (conflictingCurrency) {
        p.warnings.push('ambiguous_currency');
        if (/\bEUR\b/.test(currencyText)) add('currency', 'EUR', currencyLine, 'currency');
        for (const c of l.match(/\b[A-Z]{3}\b/g) ?? [])
          if (statementFactsSchema.shape.currency.safeParse(c).success)
            add('currency', c as NonNullable<StatementFacts['currency']>, i, 'currency');
      }
      // Only the explicitly printed third gross column, never a computed subtotal.
      if (
        header &&
        (inlineHeader || wrappedHeader) &&
        net! < vat! &&
        vat! < gross! &&
        JSON.stringify([...new Set(currencyText.match(/\b[A-Z]{3}\b/g) ?? [])]) === '["EUR"]' &&
        !conflictingCurrency &&
        vals.length === 3 &&
        vals[2]?.value !== null &&
        vals[0]!.start >= net! &&
        vals[0]!.end <= vat! &&
        vals[1]!.start >= vat! &&
        (!wrappedHeader || vals[1]!.start >= Math.ceil((vat! + vatLabels[1]!.index) / 2)) &&
        vals[1]!.end <= gross! &&
        vals[2]!.start >= gross!
      ) {
        add('payableCents', vals[2]!.value!, i, 'company_gross');
        add('currency', 'EUR', currencyLine, 'currency');
      } else p.warnings.push('ambiguous_company_gross');
    }
  });
  if (!company)
    lines.forEach((l, i) => {
      if (/\bAbrechnungsbetrag\b/i.test(l)) {
        const vals = money(l),
          currencies = [...new Set(l.match(/\b[A-Z]{3}\b/g) ?? [])];
        for (const currency of currencies)
          if (statementFactsSchema.shape.currency.safeParse(currency).success)
            add('currency', currency as NonNullable<StatementFacts['currency']>, i, 'currency');
        if (currencies.some((c) => !statementFactsSchema.shape.currency.safeParse(c).success)) {
          p.fields.currency.value = null;
          p.fields.currency.origin = 'unavailable';
          p.warnings.push('ambiguous_currency');
        }
        for (const n of vals) if (n.value !== null) add('payableCents', n.value, i, 'payable');
      }
    });
  if (company && p.warnings.includes('ambiguous_company_gross')) {
    p.fields.payableCents.value = null;
    p.fields.payableCents.origin = 'unavailable';
  }
  if (p.warnings.includes('ambiguous_currency')) {
    p.fields.currency.value = null;
    p.fields.currency.origin = 'unavailable';
  }
  for (const k of keys) if (p.fields[k].candidates.length > 1) p.warnings.push('ambiguous_' + k);
  if (p.fields.debitDate.value === null) p.warnings.push('debit_date_required');
  p.warnings = [...new Set(p.warnings)].slice(0, 16);
  p.extraction =
    p.fields.payableCents.value !== null && p.fields.currency.value !== null
      ? 'parsed'
      : 'manual_required';
  return p;
}
export function reviewStatement(
  proposal: StatementProposal,
  raw: unknown,
  complete: boolean,
): { fields: StatementFields } {
  const facts = statementFactsSchema.parse(raw);
  if (
    complete &&
    ((!facts.reference && !(facts.periodFrom && facts.periodTo)) ||
      !facts.issueDate ||
      facts.payableCents === null ||
      !facts.currency ||
      !facts.debitDate)
  )
    throw new Error('Bitte die Abrechnungsdaten einschließlich Einzugsdatum vervollständigen.');
  const fields = Object.fromEntries(
    keys.map((k) => {
      const source = proposal.fields[k],
        value = facts[k];
      return [
        k,
        {
          ...source,
          value,
          origin: value === null ? 'unavailable' : value === source.value ? 'printed' : 'owner',
        },
      ];
    }),
  ) as StatementFields;
  return { fields };
}
