import { sampleLedger } from '../ledger/build';
import type { SampleLedger } from '../ledger/types';

/**
 * Synthetic Portfolio Performance file (`docs/migration/pp-export.md`): the sample ledger's
 * securities, prices, opening holdings and trades written in PP's XStream shape, including the
 * way XStream writes an object graph as a tree (first use in full, later uses as `reference`
 * attributes with relative paths). All names, ISINs and figures are invented. The output is
 * deterministic and byte-stable (no clock, no randomness).
 *
 * Mapping: ledger investment account -> portfolio plus a synthetic reference (settlement)
 * account; opening holding -> DELIVERY_INBOUND; ledger buy -> BUY pair (portfolio transaction +
 * cash transaction in one `buysell` cross entry); price -> `<price t v/>` with v = micro x 100.
 * `extras` adds every other transaction kind so a parser sees the whole vocabulary.
 */

export const PP_FILE_NAME = 'sample-portfolio.xml';
export const PP_CLIENT_VERSION = 70;
const UPDATED_AT = '2026-09-30T00:00:00Z';

/** Deterministic UUID-shaped id from a kind and a ledger id (FNV-1a, four lanes). */
export function ppUuid(kind: string, id: string): string {
  const input = `${kind}:${id}`;
  const lanes: number[] = [];
  for (let lane = 0; lane < 4; lane++) {
    let h = (0x811c9dc5 ^ (lane * 0x9e3779b1)) >>> 0;
    for (let i = 0; i < input.length; i++) {
      h ^= input.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    lanes.push(h);
  }
  const hex = lanes.map((h) => h.toString(16).padStart(8, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

// ---- object graph (what XStream would serialise) -------------------------------------------

interface Sec {
  uuid: string;
  name: string;
  isin: string | null;
  ticker: string | null;
  prices: { day: string; micro: number }[];
  classId: string | null;
}
interface Unit {
  type: 'FEE' | 'TAX' | 'GROSS_VALUE';
  cents: number;
  forex?: { currency: string; cents: number; rate: string };
}
interface Acct {
  uuid: string;
  name: string;
  txs: Tx[];
}
interface Pf {
  uuid: string;
  name: string;
  reference: Acct;
  txs: Tx[];
}
interface Tx {
  uuid: string;
  owner: Acct | Pf;
  day: string;
  type: string;
  cents: number;
  sharesE8: number;
  sec: Sec | null;
  note?: string;
  units: Unit[];
  entry: Entry | null;
}
type Entry =
  | { kind: 'buysell'; pfTx: Tx; acTx: Tx; pf: Pf; ac: Acct }
  | { kind: 'account-transfer'; from: Tx; to: Tx; accFrom: Acct; accTo: Acct }
  | { kind: 'portfolio-transfer'; from: Tx; to: Tx; pfFrom: Pf; pfTo: Pf };
interface Cls {
  id: string;
  name: string;
  color: string;
  parent: Cls | null;
  children: Cls[];
  secs: Sec[];
  weight: number;
}

// ---- XStream-style writer ----------------------------------------------------------------

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

class Writer {
  private readonly lines: string[] = [];
  private readonly stack: { seg: string; counts: Map<string, number> }[] = [];
  private readonly seen = new Map<object, string[]>();

  private segment(name: string): string {
    const top = this.stack[this.stack.length - 1];
    if (!top) return name;
    const n = (top.counts.get(name) ?? 0) + 1;
    top.counts.set(name, n);
    return n > 1 ? `${name}[${n}]` : name;
  }
  private pad = () => '  '.repeat(this.stack.length);
  private attrText = (attrs: Record<string, string>) =>
    Object.entries(attrs)
      .map(([k, v]) => ` ${k}="${esc(v)}"`)
      .join('');

  /** Relative XStream path from the element about to be written (`seg`) to `target`. */
  private relative(seg: string, target: string[]): string {
    const here = [...this.stack.map((f) => f.seg), seg];
    let c = 0;
    while (c < here.length - 1 && c < target.length && here[c] === target[c]) c += 1;
    return [...Array(here.length - c).fill('..'), ...target.slice(c)].join('/');
  }

  /** Writes `<name>` with `body`, or an empty reference element when `obj` was written before. */
  object(name: string, obj: object, attrs: Record<string, string>, body: () => void): void {
    const seg = this.segment(name);
    const known = this.seen.get(obj);
    if (known) {
      this.lines.push(
        `${this.pad()}<${name}${this.attrText(attrs)} reference="${this.relative(seg, known)}"/>`,
      );
      return;
    }
    this.seen.set(obj, [...this.stack.map((f) => f.seg), seg]);
    this.lines.push(`${this.pad()}<${name}${this.attrText(attrs)}>`);
    this.stack.push({ seg, counts: new Map() });
    body();
    this.stack.pop();
    this.lines.push(`${this.pad()}</${name}>`);
  }
  /** A plain container element (written once, never referenced). */
  group(name: string, body: () => void, attrs: Record<string, string> = {}): void {
    this.object(name, {}, attrs, body);
  }
  leaf(name: string, text: string | number): void {
    this.segment(name);
    this.lines.push(`${this.pad()}<${name}>${esc(String(text))}</${name}>`);
  }
  empty(name: string, attrs: Record<string, string> = {}): void {
    this.segment(name);
    this.lines.push(`${this.pad()}<${name}${this.attrText(attrs)}/>`);
  }
  toString(): string {
    return `${this.lines.join('\n')}\n`;
  }
}

const stamp = (day: string) => `${day}T00:00`;
const v100 = (micro: number) => String(micro * 100);

function writeUnits(w: Writer, units: Unit[]): void {
  if (units.length === 0) return;
  w.group('units', () => {
    for (const u of units)
      w.group(
        'unit',
        () => {
          w.empty('amount', { currency: 'EUR', amount: String(u.cents) });
          if (u.forex) {
            w.empty('forex', { currency: u.forex.currency, amount: String(u.forex.cents) });
            w.leaf('exchangeRate', u.forex.rate);
          }
        },
        { type: u.type },
      );
  });
}

function writeTx(w: Writer, tx: Tx, element: string): void {
  w.object(element, tx, {}, () => {
    w.leaf('uuid', tx.uuid);
    w.leaf('date', stamp(tx.day));
    w.leaf('currencyCode', 'EUR');
    w.leaf('amount', tx.cents);
    if (tx.sec) writeSecurityRef(w, tx.sec);
    if (tx.entry) writeEntry(w, tx.entry);
    w.leaf('shares', tx.sharesE8);
    if (tx.note) w.leaf('note', tx.note);
    writeUnits(w, tx.units);
    w.leaf('updatedAt', UPDATED_AT);
    w.leaf('type', tx.type);
  });
}

function writeSecurityRef(w: Writer, sec: Sec): void {
  w.object('security', sec, {}, () => {
    throw new Error('Securities are written before any transaction');
  });
}

function writeEntry(w: Writer, e: Entry): void {
  w.object('crossEntry', e, { class: e.kind }, () => {
    if (e.kind === 'buysell') {
      writePortfolio(w, e.pf);
      writeTx(w, e.pfTx, 'portfolioTransaction');
      writeAccount(w, e.ac, 'account');
      writeTx(w, e.acTx, 'accountTransaction');
    } else if (e.kind === 'account-transfer') {
      writeAccount(w, e.accFrom, 'accountFrom');
      writeTx(w, e.from, 'transactionFrom');
      writeAccount(w, e.accTo, 'accountTo');
      writeTx(w, e.to, 'transactionTo');
    } else {
      writePortfolio(w, e.pfFrom, 'portfolioFrom');
      writeTx(w, e.from, 'transactionFrom');
      writePortfolio(w, e.pfTo, 'portfolioTo');
      writeTx(w, e.to, 'transactionTo');
    }
  });
}

function writeAccount(w: Writer, a: Acct, element = 'account'): void {
  w.object(element, a, {}, () => {
    w.leaf('uuid', a.uuid);
    w.leaf('name', a.name);
    w.leaf('currencyCode', 'EUR');
    w.leaf('isRetired', 'false');
    if (a.txs.length === 0) w.empty('transactions');
    else w.group('transactions', () => a.txs.forEach((t) => writeTx(w, t, 'account-transaction')));
    w.group('attributes', () => w.empty('map'));
    w.leaf('updatedAt', UPDATED_AT);
  });
}

function writePortfolio(w: Writer, p: Pf, element = 'portfolio'): void {
  w.object(element, p, {}, () => {
    w.leaf('uuid', p.uuid);
    w.leaf('name', p.name);
    w.leaf('isRetired', 'false');
    // First use of the settlement account may be here: XStream then writes it in full.
    writeAccount(w, p.reference, 'referenceAccount');
    if (p.txs.length === 0) w.empty('transactions');
    else
      w.group('transactions', () => p.txs.forEach((t) => writeTx(w, t, 'portfolio-transaction')));
    w.group('attributes', () => w.empty('map'));
    w.leaf('updatedAt', UPDATED_AT);
  });
}
function writeSecurity(w: Writer, s: Sec): void {
  w.object('security', s, {}, () => {
    w.leaf('uuid', s.uuid);
    w.leaf('name', s.name);
    w.leaf('currencyCode', 'EUR');
    if (s.isin) w.leaf('isin', s.isin);
    if (s.ticker) w.leaf('tickerSymbol', s.ticker);
    w.leaf('feed', 'MANUAL');
    w.group('prices', () => {
      for (const p of s.prices) w.empty('price', { t: p.day, v: v100(p.micro) });
    });
    w.group('attributes', () => w.empty('map'));
    w.empty('events');
    w.leaf('isRetired', 'false');
    w.leaf('updatedAt', UPDATED_AT);
  });
}

function writeClassification(w: Writer, c: Cls, element: string): void {
  w.object(element, c, {}, () => {
    w.leaf('id', c.id);
    w.leaf('name', c.name);
    w.leaf('color', c.color);
    if (c.parent) {
      w.object('parent', c.parent, {}, () => {
        throw new Error('Parents are written before their children');
      });
    }
    if (c.children.length === 0) w.empty('children');
    else
      w.group('children', () =>
        c.children.forEach((k) => writeClassification(w, k, 'classification')),
      );
    if (c.secs.length === 0) w.empty('assignments');
    else
      w.group('assignments', () => {
        c.secs.forEach((s, rank) =>
          w.group('assignment', () => {
            w.object('investmentVehicle', s, { class: 'security' }, () => {
              throw new Error('Securities are written first');
            });
            w.leaf('weight', 10000);
            w.leaf('rank', rank);
          }),
        );
      });
    w.leaf('weight', c.weight);
    w.leaf('rank', 0);
  });
}

// ---- building the graph from the sample ledger ---------------------------------------------

export interface PpExportOptions {
  /** Add sells, deliveries, transfers, dividends with forex, interest, fees and taxes. */
  extras?: boolean;
}

export function ppExport(
  ledger: SampleLedger = sampleLedger(),
  options: PpExportOptions = {},
): string {
  const secById = new Map<string, Sec>();
  const securities: Sec[] = ledger.securities.map((s, i) => {
    const sec: Sec = {
      uuid: ppUuid('security', s.id as string),
      name: s.name,
      // Invented ISIN-shaped ids, unique per security.
      isin:
        s.kind === 'p2p'
          ? null
          : `XS${String(1000000000 + i * 7919).padStart(10, '0')}`.slice(0, 12),
      ticker: s.symbol ?? null,
      prices: ledger.prices
        .filter((p) => p.securityId === s.id)
        .map((p) => ({ day: p.date, micro: p.priceMicro }))
        .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0)),
      classId: s.assetClassId ?? null,
    };
    secById.set(s.id as string, sec);
    return sec;
  });

  const portfolios: Pf[] = [];
  const accounts: Acct[] = [];
  const pfById = new Map<string, Pf>();
  const investmentIds = [
    ...new Set([
      ...ledger.trades.map((t) => t.accountId),
      ...ledger.holdings.map((h) => h.accountId),
    ]),
  ].sort();
  for (const id of investmentIds) {
    const acc = ledger.accounts.find((a) => a.id === id);
    if (!acc) throw new Error(`Unknown account ${id}`);
    const reference: Acct = {
      uuid: ppUuid('account', id),
      name: `Verrechnung ${acc.name}`,
      txs: [],
    };
    const pf: Pf = { uuid: ppUuid('portfolio', id), name: acc.name, reference, txs: [] };
    accounts.push(reference);
    portfolios.push(pf);
    pfById.set(id, pf);
  }

  let seq = 0;
  const uuidFor = (kind: string) => ppUuid(kind, String(seq++));
  const addPortfolioTx = (
    pf: Pf,
    day: string,
    type: string,
    sec: Sec,
    cents: number,
    sharesE8: number,
    units: Unit[] = [],
    note?: string,
    uuid?: string,
  ): Tx => {
    const tx: Tx = {
      uuid: uuid ?? uuidFor('ptx'),
      owner: pf,
      day,
      type,
      cents,
      sharesE8,
      sec,
      units,
      entry: null,
      ...(note ? { note } : {}),
    };
    pf.txs.push(tx);
    return tx;
  };
  const addAccountTx = (
    a: Acct,
    day: string,
    type: string,
    cents: number,
    sec: Sec | null = null,
    units: Unit[] = [],
    note?: string,
  ): Tx => {
    const tx: Tx = {
      uuid: uuidFor('atx'),
      owner: a,
      day,
      type,
      cents,
      sharesE8: 0,
      sec,
      units,
      entry: null,
      ...(note ? { note } : {}),
    };
    a.txs.push(tx);
    return tx;
  };
  const pair = (pfTx: Tx, acTx: Tx, pf: Pf): void => {
    const e: Entry = { kind: 'buysell', pfTx, acTx, pf, ac: pf.reference };
    pfTx.entry = e;
    acTx.entry = e;
  };

  // Opening holdings first, then the buys in date order (ties: ledger order).
  for (const h of ledger.holdings) {
    const pf = pfById.get(h.accountId) as Pf;
    const sec = secById.get(h.securityId) as Sec;
    addPortfolioTx(pf, h.asOf, 'DELIVERY_INBOUND', sec, h.costBasisCents ?? 0, h.unitsE8);
  }
  const buys = ledger.trades
    .map((t, i) => ({ t, i }))
    .sort((a, b) => (a.t.date < b.t.date ? -1 : a.t.date > b.t.date ? 1 : a.i - b.i));
  for (const { t } of buys) {
    const pf = pfById.get(t.accountId) as Pf;
    const sec = secById.get(t.securityId) as Sec;
    const fee = t.feeCents ?? 0;
    const tax = t.taxCents ?? 0;
    const units: Unit[] = [];
    if (fee > 0) units.push({ type: 'FEE', cents: fee });
    if (tax > 0) units.push({ type: 'TAX', cents: tax });
    if (t.kind === 'buy') {
      // A purchase pays the gross value plus fees and taxes.
      const total = t.amountCents + fee + tax;
      const p = addPortfolioTx(pf, t.date, 'BUY', sec, total, t.unitsE8 ?? 0, units);
      pair(p, addAccountTx(pf.reference, t.date, 'BUY', total, sec, units), pf);
    } else if (t.kind === 'sell') {
      // A sale and a dividend pay out the gross value minus fees and taxes.
      const net = t.amountCents - fee - tax;
      const p = addPortfolioTx(pf, t.date, 'SELL', sec, net, Math.abs(t.unitsE8 ?? 0), units);
      pair(p, addAccountTx(pf.reference, t.date, 'SELL', net, sec, units), pf);
    } else if (t.kind === 'dividend') {
      addAccountTx(pf.reference, t.date, 'DIVIDENDS', t.amountCents - fee - tax, sec, units);
    } else throw new Error(`Trade kind ${t.kind} is not exported`);
  }

  if (options.extras) addExtras({ portfolios, securities, addPortfolioTx, addAccountTx, pair });

  // Taxonomy: the ledger's asset classes as one flat level below a root.
  const root: Cls = {
    id: ppUuid('class', 'root'),
    name: 'Anlageklassen',
    color: '#6c6c6c',
    parent: null,
    children: [],
    secs: [],
    weight: 10000,
  };
  for (const ac of ledger.assetClasses) {
    root.children.push({
      id: ppUuid('class', ac.id as string),
      name: ac.name,
      color: '#8a8a8a',
      parent: root,
      children: [],
      secs: securities.filter((s) => s.classId === ac.id),
      weight: 0,
    });
  }

  const w = new Writer();
  w.group('client', () => {
    w.leaf('version', PP_CLIENT_VERSION);
    w.leaf('baseCurrency', 'EUR');
    w.group('securities', () => securities.forEach((s) => writeSecurity(w, s)));
    w.group('accounts', () => accounts.forEach((a) => writeAccount(w, a)));
    w.group('portfolios', () => portfolios.forEach((p) => writePortfolio(w, p)));
    w.empty('plans');
    w.group('taxonomies', () =>
      w.group('taxonomy', () => {
        w.leaf('id', ppUuid('taxonomy', 'assets'));
        w.leaf('name', 'Anlageklassen');
        writeClassification(w, root, 'root');
      }),
    );
    w.group('properties', () => w.empty('map'));
  });
  return w.toString();
}

interface ExtrasCtx {
  portfolios: Pf[];
  securities: Sec[];
  addPortfolioTx: (
    pf: Pf,
    day: string,
    type: string,
    sec: Sec,
    cents: number,
    sharesE8: number,
    units?: Unit[],
    note?: string,
  ) => Tx;
  addAccountTx: (
    a: Acct,
    day: string,
    type: string,
    cents: number,
    sec?: Sec | null,
    units?: Unit[],
    note?: string,
  ) => Tx;
  pair: (pfTx: Tx, acTx: Tx, pf: Pf) => void;
}

/** One of every other transaction kind, all invented. Dates lie after the ledger's buys. */
function addExtras(c: ExtrasCtx): void {
  const [pf1, pf2] = c.portfolios;
  const sec = c.securities.find((s) => s.isin !== null);
  if (!pf1 || !pf2 || !sec) throw new Error('Extras need two portfolios and a listed security');
  const ref1 = pf1.reference;
  const ref2 = pf2.reference;

  c.addAccountTx(ref1, '2026-09-01', 'DEPOSIT', 500000, null, [], 'Einzahlung');
  c.addAccountTx(ref1, '2026-09-02', 'REMOVAL', 12000);
  c.addAccountTx(ref1, '2026-09-03', 'INTEREST', 340);
  c.addAccountTx(ref1, '2026-09-04', 'INTEREST_CHARGE', 120);
  c.addAccountTx(ref1, '2026-09-05', 'FEES', 500);
  c.addAccountTx(ref1, '2026-09-06', 'FEES_REFUND', 500);
  c.addAccountTx(ref1, '2026-09-07', 'TAXES', 700);
  c.addAccountTx(ref1, '2026-09-08', 'TAX_REFUND', 700);

  // Sell with fee and tax (proceeds = amount after both).
  const sell = c.addPortfolioTx(pf1, '2026-09-10', 'SELL', sec, 99000, 1_00000000, [
    { type: 'FEE', cents: 500 },
    { type: 'TAX', cents: 1500 },
  ]);
  c.pair(sell, c.addAccountTx(ref1, '2026-09-10', 'SELL', 99000, sec, sell.units), pf1);

  // Delivery out, then a portfolio transfer between the two portfolios.
  c.addPortfolioTx(pf1, '2026-09-11', 'DELIVERY_OUTBOUND', sec, 40000, 50000000);
  const out = c.addPortfolioTx(pf1, '2026-09-12', 'TRANSFER_OUT', sec, 80000, 1_00000000);
  const inn = c.addPortfolioTx(pf2, '2026-09-12', 'TRANSFER_IN', sec, 80000, 1_00000000);
  const pfT: Entry = { kind: 'portfolio-transfer', from: out, to: inn, pfFrom: pf1, pfTo: pf2 };
  out.entry = pfT;
  inn.entry = pfT;

  // Account transfer between the reference accounts.
  const accOut = c.addAccountTx(ref1, '2026-09-13', 'TRANSFER_OUT', 25000);
  const accIn = c.addAccountTx(ref2, '2026-09-13', 'TRANSFER_IN', 25000);
  const acT: Entry = {
    kind: 'account-transfer',
    from: accOut,
    to: accIn,
    accFrom: ref1,
    accTo: ref2,
  };
  accOut.entry = acT;
  accIn.entry = acT;

  // Dividend in a foreign currency: amount 8,50 EUR after 1,50 EUR tax, gross 10,00 EUR = 10,87 USD.
  c.addAccountTx(ref1, '2026-09-14', 'DIVIDENDS', 850, sec, [
    { type: 'TAX', cents: 150 },
    { type: 'GROSS_VALUE', cents: 1000, forex: { currency: 'USD', cents: 1087, rate: '0.92' } },
  ]);
}
