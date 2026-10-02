import {
  DEFAULT_QUOTE_SCALE,
  MIN_QUOTE_SCALE_VERSION,
  ValueError,
  decimalToMicro,
  parseSafeInt,
  ppDay,
  quoteToMicro,
} from './convert';
import { ReferenceError_, createResolver, type Resolver } from './refs';
import {
  DEFAULT_MAX_BYTES,
  child,
  childrenNamed,
  decodeXml,
  pathOf,
  parseXml,
  type XmlNode,
} from './xml';

/**
 * Model builder (`docs/migration/pp-export.md`): the XML tree becomes plain typed rows. Problems
 * never contain values from the file, only codes, element names and element paths. A broken
 * entity is skipped with a problem; the rest of the file is still read.
 */

export const ACCOUNT_TX_TYPES = [
  'DEPOSIT',
  'REMOVAL',
  'INTEREST',
  'INTEREST_CHARGE',
  'DIVIDENDS',
  'FEES',
  'FEES_REFUND',
  'TAXES',
  'TAX_REFUND',
  'BUY',
  'SELL',
  'TRANSFER_IN',
  'TRANSFER_OUT',
] as const;
export const PORTFOLIO_TX_TYPES = [
  'BUY',
  'SELL',
  'DELIVERY_INBOUND',
  'DELIVERY_OUTBOUND',
  'TRANSFER_IN',
  'TRANSFER_OUT',
] as const;
export type AccountTxType = (typeof ACCOUNT_TX_TYPES)[number];
export type PortfolioTxType = (typeof PORTFOLIO_TX_TYPES)[number];

export interface PpProblem {
  code: string;
  /** Path of the first element concerned, e.g. `client/accounts/account[2]/transactions`. */
  path: string;
  message: string;
  /** Number of occurrences when equal problems were merged (unknown elements). */
  count: number;
}

export interface PpForex {
  currency: string;
  amountCents: number;
  /** Units of the transaction currency per 1 unit of the forex currency, micro. */
  rateMicro: number;
}
export interface PpUnit {
  type: 'FEE' | 'TAX' | 'GROSS_VALUE';
  amountCents: number;
  forex: PpForex | null;
}

export type CrossKind = 'buysell' | 'account-transfer' | 'portfolio-transfer';
export interface PpCrossEntry {
  kind: CrossKind;
  /** Uuid of the paired transaction on the other side (null when it is missing or unreadable). */
  peerUuid: string | null;
}

export interface PpTransaction<T extends string> {
  uuid: string;
  path: string;
  owner: 'account' | 'portfolio';
  ownerUuid: string;
  /** Booking day `YYYY-MM-DD` (the time of day is dropped). */
  date: string;
  currency: string;
  type: T;
  /** PP's amount: the net cash amount, fees and taxes included for buys, deducted for sells. */
  amountCents: number;
  sharesE8: number;
  securityUuid: string | null;
  note: string | null;
  source: string | null;
  units: PpUnit[];
  feeCents: number;
  taxCents: number;
  /** Gross value in the transaction currency (before fees and taxes), see `grossValueCents`. */
  grossCents: number;
  crossEntry: PpCrossEntry | null;
}

export interface PpPrice {
  date: string;
  priceMicro: number;
}
export interface PpSecurityEvent {
  date: string;
  type: string;
  details: string | null;
}
export interface PpSecurity {
  uuid: string;
  path: string;
  name: string;
  currency: string;
  isin: string | null;
  tickerSymbol: string | null;
  wkn: string | null;
  onlineId: string | null;
  feed: string | null;
  feedUrl: string | null;
  /** Feed properties (`<property type="FEED" name=…>`), e.g. `COINGECKOCOINID`. */
  feedProperties: Record<string, string>;
  isRetired: boolean;
  prices: PpPrice[];
  latest: PpPrice | null;
  events: PpSecurityEvent[];
}
export interface PpAccount {
  uuid: string;
  path: string;
  name: string;
  currency: string;
  isRetired: boolean;
  note: string | null;
  transactions: PpTransaction<AccountTxType>[];
}
export interface PpPortfolio {
  uuid: string;
  path: string;
  name: string;
  isRetired: boolean;
  referenceAccountUuid: string | null;
  transactions: PpTransaction<PortfolioTxType>[];
}
export interface PpAssignment {
  vehicle: 'security' | 'account';
  uuid: string;
  /** Weight in basis points of the classification (10 000 = 100 %). */
  weightBp: number;
  rank: number;
}
export interface PpClassification {
  id: string;
  name: string;
  parentId: string | null;
  /** Weight of this classification within its parent, basis points (null for roots). */
  weightBp: number | null;
  rank: number | null;
  assignments: PpAssignment[];
}
export interface PpTaxonomy {
  id: string;
  name: string;
  /** Root first, then depth-first in file order. */
  classifications: PpClassification[];
}

export interface PpModel {
  version: number;
  baseCurrency: string;
  securities: PpSecurity[];
  accounts: PpAccount[];
  portfolios: PpPortfolio[];
  taxonomies: PpTaxonomy[];
  problems: PpProblem[];
}

export interface ParseOptions {
  maxBytes?: number;
  /** Quote scale of files older than `MIN_QUOTE_SCALE_VERSION` (default 1e8). */
  quoteScale?: bigint;
}

/** Fatal: the file is not a PP client file this parser can read. */
export class PpFormatError extends Error {
  constructor(
    readonly code: 'root' | 'version',
    message: string,
  ) {
    super(message);
    this.name = 'PpFormatError';
  }
}

/** Newest client version checked against a real file; newer files are read with a problem. */
export const MAX_TESTED_VERSION = 70;

// Element names PP writes that this parser knowingly ignores (no problem entry).
const SECURITY_ELEMENTS = new Set([
  'uuid',
  'onlineId',
  'name',
  'currencyCode',
  'targetCurrencyCode',
  'note',
  'isin',
  'tickerSymbol',
  'wkn',
  'calendar',
  'feed',
  'feedURL',
  'prices',
  'latestFeed',
  'latestFeedURL',
  'latest',
  'attributes',
  'events',
  'properties',
  'property',
  'isRetired',
  'updatedAt',
]);
const ACCOUNT_ELEMENTS = new Set([
  'uuid',
  'name',
  'currencyCode',
  'note',
  'isRetired',
  'transactions',
  'attributes',
  'updatedAt',
]);
const PORTFOLIO_ELEMENTS = new Set([
  'uuid',
  'name',
  'note',
  'isRetired',
  'referenceAccount',
  'transactions',
  'attributes',
  'updatedAt',
]);
const TX_ELEMENTS = new Set([
  'uuid',
  'date',
  'currencyCode',
  'amount',
  'security',
  'crossEntry',
  'shares',
  'note',
  'source',
  'units',
  'updatedAt',
  'type',
  'exDate',
]);
const UNIT_ELEMENTS = new Set(['amount', 'forex', 'exchangeRate']);
const CLASSIFICATION_ELEMENTS = new Set([
  'id',
  'name',
  'color',
  'parent',
  'children',
  'assignments',
  'weight',
  'rank',
  'data',
  'description',
]);
const TAXONOMY_ELEMENTS = new Set(['id', 'name', 'root', 'dimensions', 'source']);

const textOf = (node: XmlNode, name: string): string | null => {
  const c = child(node, name);
  return c ? c.text : null;
};
const trimmed = (node: XmlNode, name: string): string | null => {
  const t = textOf(node, name)?.trim();
  return t === undefined || t === '' ? null : t;
};

class Builder {
  readonly problems: PpProblem[] = [];
  private readonly merged = new Map<string, PpProblem>();
  readonly resolver: Resolver;
  readonly quoteScale: bigint;

  constructor(
    readonly root: XmlNode,
    quoteScale: bigint,
  ) {
    this.resolver = createResolver(root);
    this.quoteScale = quoteScale;
  }

  problem(code: string, node: XmlNode, message: string): void {
    this.problems.push({ code, path: pathOf(node), message, count: 1 });
  }

  /** Equal problems are merged per `key` and counted; the path is the first occurrence's. */
  mergedProblem(key: string, code: string, node: XmlNode, message: string): void {
    const existing = this.merged.get(key);
    if (existing) existing.count += 1;
    else {
      const p: PpProblem = { code, path: pathOf(node), message, count: 1 };
      this.merged.set(key, p);
      this.problems.push(p);
    }
  }

  /** Unknown elements are merged per (context, name) and counted. */
  unknownElements(node: XmlNode, known: Set<string>, context: string): void {
    for (const c of node.children) {
      if (known.has(c.name)) continue;
      this.mergedProblem(
        `unknown/${context}/${c.name}`,
        'unknown-element',
        c,
        `Unknown element <${c.name}> in <${context}> ignored`,
      );
    }
  }

  /** Resolves a possibly-referenced element; unresolved references become a problem. */
  resolve(node: XmlNode): XmlNode | null {
    try {
      return this.resolver.resolve(node);
    } catch (e) {
      if (e instanceof ReferenceError_) {
        this.problem(
          e.code === 'loop' ? 'reference-loop' : 'reference-unresolved',
          node,
          e.message.replace(/"[^"]*"/, '"…"'),
        );
        return null;
      }
      throw e;
    }
  }

  uuidOfRef(node: XmlNode | undefined): string | null {
    if (!node) return null;
    const target = this.resolve(node);
    return target ? trimmed(target, 'uuid') : null;
  }
}

function currencyOf(b: Builder, node: XmlNode, fallback: string): string {
  const c = trimmed(node, 'currencyCode');
  if (c === null) return fallback;
  if (!/^[A-Z]{3}$/.test(c)) b.problem('currency', node, 'Invalid currency code');
  return c;
}

function readSecurity(b: Builder, node: XmlNode, baseCurrency: string): PpSecurity | null {
  const uuid = trimmed(node, 'uuid');
  if (uuid === null) {
    b.problem('missing-uuid', node, 'Security without uuid skipped');
    return null;
  }
  b.unknownElements(node, SECURITY_ELEMENTS, 'security');
  const prices: PpPrice[] = [];
  const seen = new Set<string>();
  const pricesNode = child(node, 'prices');
  for (const p of pricesNode ? childrenNamed(pricesNode, 'price') : []) {
    try {
      const date = ppDay(p.attrs.t);
      const priceMicro = quoteToMicro(p.attrs.v, b.quoteScale);
      if (priceMicro <= 0) {
        b.mergedProblem(`price-zero/${uuid}`, 'price-zero', p, 'Prices that round to zero skipped');
        continue;
      }
      if (seen.has(date)) {
        b.mergedProblem(
          `price-dup/${uuid}`,
          'price-duplicate',
          p,
          'Second prices for the same day skipped',
        );
        continue;
      }
      seen.add(date);
      prices.push({ date, priceMicro });
    } catch (e) {
      if (!(e instanceof ValueError)) throw e;
      b.mergedProblem(
        `price-invalid/${uuid}/${e.code}`,
        'price-invalid',
        p,
        `Prices skipped (${e.code})`,
      );
    }
  }
  let latest: PpPrice | null = null;
  const latestNode = child(node, 'latest');
  if (latestNode) {
    try {
      latest = {
        date: ppDay(latestNode.attrs.t),
        priceMicro: quoteToMicro(latestNode.attrs.v, b.quoteScale),
      };
      if (latest.priceMicro <= 0) latest = null;
    } catch (e) {
      if (!(e instanceof ValueError)) throw e;
      b.problem('price-invalid', latestNode, `Latest price skipped (${e.code})`);
    }
  }
  const events: PpSecurityEvent[] = [];
  const eventsNode = child(node, 'events');
  for (const ev of eventsNode ? eventsNode.children : []) {
    try {
      events.push({
        date: ppDay(textOf(ev, 'date') ?? undefined),
        type: trimmed(ev, 'type') ?? 'UNKNOWN',
        details: trimmed(ev, 'details'),
      });
    } catch (e) {
      if (!(e instanceof ValueError)) throw e;
      b.problem('event-invalid', ev, `Security event skipped (${e.code})`);
    }
  }
  return {
    uuid,
    path: pathOf(node),
    name: trimmed(node, 'name') ?? '',
    currency: currencyOf(b, node, baseCurrency),
    isin: trimmed(node, 'isin'),
    tickerSymbol: trimmed(node, 'tickerSymbol'),
    wkn: trimmed(node, 'wkn'),
    onlineId: trimmed(node, 'onlineId'),
    feed: trimmed(node, 'feed'),
    feedUrl: trimmed(node, 'feedURL'),
    feedProperties: Object.fromEntries(
      childrenNamed(node, 'property').flatMap((p) =>
        p.attrs.type === 'FEED' && p.attrs.name ? [[p.attrs.name, p.text.trim()]] : [],
      ),
    ),
    isRetired: trimmed(node, 'isRetired') === 'true',
    prices,
    latest,
    events,
  };
}

/**
 * Gross value before fees and taxes in the transaction currency. A purchase paid `amount` including
 * fees and taxes, a sale or a dividend received `amount` after them.
 */
export function grossValueCents(
  type: string,
  amountCents: number,
  feeCents: number,
  taxCents: number,
): number {
  switch (type) {
    case 'BUY':
    case 'DELIVERY_INBOUND':
      return amountCents - feeCents - taxCents;
    case 'SELL':
    case 'DELIVERY_OUTBOUND':
    case 'DIVIDENDS':
      return amountCents + feeCents + taxCents;
    default:
      return amountCents;
  }
}

function readUnits(b: Builder, node: XmlNode): PpUnit[] {
  const unitsNode = child(node, 'units');
  const out: PpUnit[] = [];
  for (const u of unitsNode ? unitsNode.children : []) {
    if (u.name !== 'unit') {
      b.unknownElements(unitsNode as XmlNode, new Set(['unit']), 'units');
      continue;
    }
    const type = u.attrs.type;
    if (type !== 'FEE' && type !== 'TAX' && type !== 'GROSS_VALUE') {
      b.problem('unit-type', u, 'Unknown unit type ignored');
      continue;
    }
    b.unknownElements(u, UNIT_ELEMENTS, 'unit');
    const amountNode = child(u, 'amount');
    const amountCents = parseSafeInt(amountNode?.attrs.amount);
    let forex: PpForex | null = null;
    const forexNode = child(u, 'forex');
    if (forexNode) {
      forex = {
        currency: forexNode.attrs.currency ?? '',
        amountCents: parseSafeInt(forexNode.attrs.amount),
        rateMicro: decimalToMicro(textOf(u, 'exchangeRate') ?? undefined),
      };
    }
    out.push({ type, amountCents, forex });
  }
  return out;
}

function readTransaction<T extends string>(
  b: Builder,
  node: XmlNode,
  owner: 'account' | 'portfolio',
  ownerUuid: string,
  types: readonly T[],
  fallbackCurrency: string,
): PpTransaction<T> | null {
  const uuid = trimmed(node, 'uuid');
  if (uuid === null) {
    b.problem('missing-uuid', node, 'Transaction without uuid skipped');
    return null;
  }
  const type = trimmed(node, 'type');
  if (type === null || !(types as readonly string[]).includes(type)) {
    b.problem('unknown-type', node, `Unknown ${owner} transaction type, transaction skipped`);
    return null;
  }
  b.unknownElements(node, TX_ELEMENTS, `${owner}-transaction`);
  try {
    const units = readUnits(b, node);
    const feeCents = units.filter((u) => u.type === 'FEE').reduce((a, u) => a + u.amountCents, 0);
    const taxCents = units.filter((u) => u.type === 'TAX').reduce((a, u) => a + u.amountCents, 0);
    const amountCents = parseSafeInt(textOf(node, 'amount') ?? undefined);
    const sharesText = textOf(node, 'shares');
    const sharesE8 = sharesText === null ? 0 : parseSafeInt(sharesText);
    const grossCents = grossValueCents(type, amountCents, feeCents, taxCents);
    const gv = units.find((u) => u.type === 'GROSS_VALUE');
    if (gv && gv.amountCents !== grossCents)
      b.problem('gross-mismatch', node, 'GROSS_VALUE unit differs from amount, fees and taxes');
    if (amountCents < 0 || grossCents < 0 || feeCents < 0 || taxCents < 0) {
      b.problem('negative-amount', node, 'Negative amount, transaction skipped');
      return null;
    }
    const secNode = child(node, 'security');
    const securityUuid = secNode ? b.uuidOfRef(secNode) : null;
    return {
      uuid,
      path: pathOf(node),
      owner,
      ownerUuid,
      date: ppDay(textOf(node, 'date') ?? undefined),
      currency: currencyOf(b, node, fallbackCurrency),
      type: type as T,
      amountCents,
      sharesE8,
      securityUuid,
      note: trimmed(node, 'note'),
      source: trimmed(node, 'source'),
      units,
      feeCents,
      taxCents,
      grossCents,
      crossEntry: readCrossEntry(b, node, uuid, owner),
    };
  } catch (e) {
    if (!(e instanceof ValueError)) throw e;
    b.problem('transaction-invalid', node, `Transaction skipped (${e.code})`);
    return null;
  }
}

function readCrossEntry(
  b: Builder,
  node: XmlNode,
  ownUuid: string,
  owner: 'account' | 'portfolio',
): PpCrossEntry | null {
  const ce = child(node, 'crossEntry');
  if (!ce) return null;
  const entry = b.resolve(ce);
  if (!entry) return { kind: 'buysell', peerUuid: null };
  const cls = entry.attrs.class ?? ce.attrs.class;
  if (cls === 'buysell') {
    const peer = b.uuidOfRef(
      child(entry, owner === 'account' ? 'portfolioTransaction' : 'accountTransaction'),
    );
    return { kind: 'buysell', peerUuid: peer };
  }
  if (cls === 'account-transfer' || cls === 'portfolio-transfer') {
    const from = b.uuidOfRef(child(entry, 'transactionFrom'));
    const to = b.uuidOfRef(child(entry, 'transactionTo'));
    const peer = from === ownUuid ? to : from;
    return { kind: cls, peerUuid: peer };
  }
  b.problem('unknown-cross-entry', ce, 'Unknown crossEntry class, pairing skipped');
  return null;
}

function readAccount(b: Builder, node: XmlNode, baseCurrency: string): PpAccount | null {
  const uuid = trimmed(node, 'uuid');
  if (uuid === null) {
    b.problem('missing-uuid', node, 'Account without uuid skipped');
    return null;
  }
  b.unknownElements(node, ACCOUNT_ELEMENTS, 'account');
  const currency = currencyOf(b, node, baseCurrency);
  const transactions: PpAccount['transactions'] = [];
  const txs = child(node, 'transactions');
  for (const t of txs ? txs.children : []) {
    if (t.name !== 'account-transaction') {
      b.unknownElements(txs as XmlNode, new Set(['account-transaction']), 'transactions');
      continue;
    }
    const target = b.resolve(t);
    const tx = target && readTransaction(b, target, 'account', uuid, ACCOUNT_TX_TYPES, currency);
    if (tx) transactions.push(tx);
  }
  return {
    uuid,
    path: pathOf(node),
    name: trimmed(node, 'name') ?? '',
    currency,
    isRetired: trimmed(node, 'isRetired') === 'true',
    note: trimmed(node, 'note'),
    transactions,
  };
}

function readPortfolio(b: Builder, node: XmlNode, baseCurrency: string): PpPortfolio | null {
  const uuid = trimmed(node, 'uuid');
  if (uuid === null) {
    b.problem('missing-uuid', node, 'Portfolio without uuid skipped');
    return null;
  }
  b.unknownElements(node, PORTFOLIO_ELEMENTS, 'portfolio');
  const refNode = child(node, 'referenceAccount');
  const transactions: PpPortfolio['transactions'] = [];
  const txs = child(node, 'transactions');
  for (const t of txs ? txs.children : []) {
    if (t.name !== 'portfolio-transaction') {
      b.unknownElements(txs as XmlNode, new Set(['portfolio-transaction']), 'transactions');
      continue;
    }
    const target = b.resolve(t);
    const tx =
      target && readTransaction(b, target, 'portfolio', uuid, PORTFOLIO_TX_TYPES, baseCurrency);
    if (tx) transactions.push(tx);
  }
  return {
    uuid,
    path: pathOf(node),
    name: trimmed(node, 'name') ?? '',
    isRetired: trimmed(node, 'isRetired') === 'true',
    referenceAccountUuid: refNode ? b.uuidOfRef(refNode) : null,
    transactions,
  };
}

function readTaxonomy(b: Builder, node: XmlNode): PpTaxonomy | null {
  const id = trimmed(node, 'id');
  const rootNode = child(node, 'root');
  if (id === null || !rootNode) {
    b.problem('taxonomy-invalid', node, 'Taxonomy without id or root skipped');
    return null;
  }
  b.unknownElements(node, TAXONOMY_ELEMENTS, 'taxonomy');
  const classifications: PpClassification[] = [];
  const walk = (n: XmlNode, parentId: string | null): void => {
    const cid = trimmed(n, 'id');
    if (cid === null) {
      b.problem('classification-invalid', n, 'Classification without id skipped');
      return;
    }
    b.unknownElements(n, CLASSIFICATION_ELEMENTS, 'classification');
    const assignments: PpAssignment[] = [];
    const as = child(n, 'assignments');
    for (const a of as ? as.children : []) {
      try {
        const vehicleNode = child(a, 'investmentVehicle');
        const vehicle = vehicleNode?.attrs.class;
        const uuid = b.uuidOfRef(vehicleNode);
        if ((vehicle !== 'security' && vehicle !== 'account') || uuid === null) {
          b.problem('assignment-invalid', a, 'Assignment skipped');
          continue;
        }
        assignments.push({
          vehicle,
          uuid,
          weightBp: parseSafeInt(textOf(a, 'weight') ?? undefined),
          rank: parseSafeInt(textOf(a, 'rank') ?? '0'),
        });
      } catch (e) {
        if (!(e instanceof ValueError)) throw e;
        b.problem('assignment-invalid', a, `Assignment skipped (${e.code})`);
      }
    }
    let weightBp: number | null = null;
    let rank: number | null = null;
    try {
      const w = textOf(n, 'weight');
      weightBp = w === null ? null : parseSafeInt(w);
      const r = textOf(n, 'rank');
      rank = r === null ? null : parseSafeInt(r);
    } catch (e) {
      if (!(e instanceof ValueError)) throw e;
      b.problem('classification-invalid', n, `Classification weight ignored (${e.code})`);
    }
    classifications.push({
      id: cid,
      name: trimmed(n, 'name') ?? '',
      parentId,
      weightBp,
      rank,
      assignments,
    });
    const kids = child(n, 'children');
    for (const k of kids ? kids.children : []) {
      const target = b.resolve(k);
      if (target) walk(target, cid);
    }
  };
  walk(rootNode, null);
  return { id, name: trimmed(node, 'name') ?? '', classifications };
}

function dedupe<T extends { uuid: string }>(
  b: Builder,
  items: T[],
  nodes: (T | null)[],
  kind: string,
  at: XmlNode,
): void {
  const seen = new Set<string>();
  for (const item of nodes) {
    if (!item) continue;
    if (seen.has(item.uuid)) {
      b.problem('duplicate-uuid', at, `Duplicate ${kind} uuid skipped`);
      continue;
    }
    seen.add(item.uuid);
    items.push(item);
  }
}

/** Builds the model from a parsed `<client>` tree. */
export function buildModel(root: XmlNode, options: ParseOptions = {}): PpModel {
  if (root.name !== 'client') throw new PpFormatError('root', 'Root element is not <client>');
  let version: number;
  try {
    version = parseSafeInt(textOf(root, 'version') ?? undefined);
  } catch {
    throw new PpFormatError('version', 'Missing or invalid client version');
  }
  if (version < MIN_QUOTE_SCALE_VERSION && options.quoteScale === undefined)
    throw new PpFormatError(
      'version',
      `Client version ${version} is older than ${MIN_QUOTE_SCALE_VERSION}; pass an explicit quoteScale`,
    );
  const b = new Builder(root, options.quoteScale ?? DEFAULT_QUOTE_SCALE);
  if (version > MAX_TESTED_VERSION)
    b.problem(
      'newer-version',
      root,
      `Client version is newer than the tested ${MAX_TESTED_VERSION}`,
    );
  const baseCurrency = trimmed(root, 'baseCurrency') ?? 'EUR';

  const securities: PpSecurity[] = [];
  const secNode = child(root, 'securities');
  dedupe(
    b,
    securities,
    (secNode ? childrenNamed(secNode, 'security') : []).map((s) => {
      const t = b.resolve(s);
      return t ? readSecurity(b, t, baseCurrency) : null;
    }),
    'security',
    secNode ?? root,
  );

  const accounts: PpAccount[] = [];
  const accNode = child(root, 'accounts');
  dedupe(
    b,
    accounts,
    (accNode ? childrenNamed(accNode, 'account') : []).map((a) => {
      const t = b.resolve(a);
      return t ? readAccount(b, t, baseCurrency) : null;
    }),
    'account',
    accNode ?? root,
  );

  const portfolios: PpPortfolio[] = [];
  const pfNode = child(root, 'portfolios');
  dedupe(
    b,
    portfolios,
    (pfNode ? childrenNamed(pfNode, 'portfolio') : []).map((p) => {
      const t = b.resolve(p);
      return t ? readPortfolio(b, t, baseCurrency) : null;
    }),
    'portfolio',
    pfNode ?? root,
  );

  const taxonomies: PpTaxonomy[] = [];
  const taxNode = child(root, 'taxonomies');
  for (const t of taxNode ? childrenNamed(taxNode, 'taxonomy') : []) {
    const target = b.resolve(t);
    const tax = target && readTaxonomy(b, target);
    if (tax) taxonomies.push(tax);
  }

  checkConsistency(b, { securities, accounts, portfolios, taxonomies });
  return {
    version,
    baseCurrency,
    securities,
    accounts,
    portfolios,
    taxonomies,
    problems: b.problems,
  };
}

/** Cross-entity checks: known securities and accounts, reciprocal pairing, duplicate uuids. */
function checkConsistency(
  b: Builder,
  m: Pick<PpModel, 'securities' | 'accounts' | 'portfolios' | 'taxonomies'>,
): void {
  const securityUuids = new Set(m.securities.map((s) => s.uuid));
  const accountUuids = new Set(m.accounts.map((a) => a.uuid));
  const all = new Map<string, PpTransaction<string>>();
  const txs: PpTransaction<string>[] = [
    ...m.accounts.flatMap((a) => a.transactions),
    ...m.portfolios.flatMap((p) => p.transactions),
  ];
  for (const t of txs) {
    if (all.has(t.uuid))
      b.problems.push({
        code: 'duplicate-uuid',
        path: t.path,
        message: 'Duplicate transaction uuid',
        count: 1,
      });
    all.set(t.uuid, t);
  }
  const push = (code: string, path: string, message: string) =>
    b.problems.push({ code, path, message, count: 1 });
  for (const t of txs) {
    if (t.securityUuid !== null && !securityUuids.has(t.securityUuid))
      push('unknown-security', t.path, 'Transaction refers to a security that is not in the file');
    const peer = t.crossEntry?.peerUuid ? all.get(t.crossEntry.peerUuid) : undefined;
    if (t.crossEntry && !peer) push('missing-peer', t.path, 'Paired transaction is missing');
    else if (peer && peer.crossEntry?.peerUuid !== t.uuid)
      push('peer-mismatch', t.path, 'Paired transaction does not point back');
  }
  for (const p of m.portfolios)
    if (p.referenceAccountUuid !== null && !accountUuids.has(p.referenceAccountUuid))
      push('unknown-account', p.path, 'Reference account is not in the file');
  m.taxonomies.forEach((tax, ti) => {
    for (const c of tax.classifications)
      for (const a of c.assignments) {
        const known =
          a.vehicle === 'security' ? securityUuids.has(a.uuid) : accountUuids.has(a.uuid);
        if (!known)
          push(
            'unknown-vehicle',
            `client/taxonomies/taxonomy[${ti + 1}]`,
            'Assignment refers to an unknown vehicle',
          );
      }
  });
}

/** Decodes, parses and builds: the one call for a file's bytes. */
export function parsePp(bytes: Uint8Array, options: ParseOptions = {}): PpModel {
  const text = decodeXml(bytes, options.maxBytes ?? DEFAULT_MAX_BYTES);
  return buildModel(parseXml(text), options);
}
