import { describe, expect, it } from 'vitest';
import { parseTradeConfirmation, tradeProposalFromConfirmation } from '../index';

// Synthetic extractor output modelled on the layout only: invented issuer, names, ids, ISIN
// (valid check digit), depot and settlement account numbers and amounts.
const SHA = 'b'.repeat(64);
const ISIN = 'IE00SYNTH008';
const IBAN = 'DE00000000000000001234';

type Parts = {
  title: string;
  header: string[];
  sentence: string;
  row: string;
  positionTotal: string;
  costs?: string[];
  booking?: string | undefined;
};
const text = (o: Parts) =>
  [
    'Beispiel Broker AG Musterweg 1 00000 Beispielstadt',
    ...o.header,
    o.title,
    'ÜBERSICHT',
    o.sentence,
    'POSITION ANZAHL DURCHSCHNITTSKURS BETRAG',
    o.row,
    `ISIN: ${ISIN}`,
    `GESAMT ${o.positionTotal}`,
    ...(o.costs ? ['ABRECHNUNG', 'POSITION BETRAG', ...o.costs] : []),
    'BUCHUNG',
    'VERRECHNUNGSKONTO WERTSTELLUNG BETRAG',
    ...(o.booking ? [o.booking] : []),
    'Diese Abrechnung wird maschinell erstellt und daher nicht unterschrieben.',
  ].join('\n');
const savings = (overrides: Partial<Parts> = {}) =>
  text({
    title: 'WERTPAPIERABRECHNUNG SPARPLAN',
    header: ['DATUM 09.11.2026', 'AUSFÜHRUNG 1a2b-3c4d', 'SPARPLAN 9f8e-7d6c', 'DEPOT 0123456789'],
    sentence: 'Sparplanausführung am 09.11.2026 an der Beispiel Exchange.',
    row: 'Synthetic Index Fund (Acc) 0,339443 Stk. 294,60 EUR 100,00 EUR',
    positionTotal: '100,00 EUR',
    booking: `${IBAN} 2026-11-11 -100,00 EUR`,
    ...overrides,
  });
const order = (kind: 'Kauf' | 'Verkauf', overrides: Partial<Parts>) =>
  text({
    title: 'WERTPAPIERABRECHNUNG',
    header: ['DATUM 09.11.2026', 'AUSFÜHRUNG 5e6f-7a8b', 'ORDER 1c2d-3e4f', 'DEPOT 0123456789'],
    sentence: `Market-Order ${kind} am 09.11.2026, um 10:15 Uhr an der Beispiel Exchange.`,
    row: 'Synthetic Index Fund (Acc) 2 Stk. 250,00 EUR 500,00 EUR',
    positionTotal: '500,00 EUR',
    ...overrides,
  });
const proposal = (source: string) =>
  tradeProposalFromConfirmation(parseTradeConfirmation(source, SHA));

describe('trade form proposal from a broker trade confirmation (#1099)', () => {
  it('offers every field of a verified savings plan execution', () => {
    expect(proposal(savings())).toEqual({
      reference: 'wpa:1a2b-3c4d',
      source: 'savings_plan',
      kind: 'buy',
      instrument: { name: 'Synthetic Index Fund (Acc)', isin: ISIN },
      date: '2026-11-09',
      unitsE8: 33_944_300,
      amountCents: 10_000,
      feeCents: 0,
      taxCents: 0,
      currency: 'EUR',
      settlementHint: '1234',
      open: [],
      unchecked: false,
    });
  });

  it('sums the printed fee of a buy as a positive deduction', () => {
    const result = proposal(
      order('Kauf', {
        costs: ['Fremdkostenzuschlag -1,00 EUR', 'GESAMT -501,00 EUR'],
        booking: `${IBAN} 2026-11-11 -501,00 EUR`,
      }),
    );
    expect(result).toMatchObject({
      source: 'buy',
      kind: 'buy',
      unitsE8: 200_000_000,
      amountCents: 50_000,
      feeCents: 100,
      taxCents: 0,
      open: [],
    });
  });

  it('reads fee and withheld tax of a sale', () => {
    const result = proposal(
      order('Verkauf', {
        costs: [
          'Fremdkostenzuschlag -1,00 EUR',
          'Kapitalertragsteuer -12,50 EUR',
          'GESAMT 486,50 EUR',
        ],
        booking: `${IBAN} 2026-11-11 486,50 EUR`,
      }),
    );
    expect(result).toMatchObject({
      kind: 'sell',
      amountCents: 50_000,
      feeCents: 100,
      taxCents: 1250,
      open: [],
    });
  });

  it('leaves quantity and amount empty when quantity × price contradicts the amount', () => {
    const result = proposal(
      savings({ row: 'Synthetic Index Fund (Acc) 0,539443 Stk. 294,60 EUR 100,00 EUR' }),
    );
    expect(result.unitsE8).toBeNull();
    expect(result.amountCents).toBeNull();
    expect(result.open).toEqual(['units', 'amount']);
    // What the contradiction does not touch is still offered.
    expect(result).toMatchObject({ kind: 'buy', date: '2026-11-09', feeCents: 0, taxCents: 0 });
  });

  it('leaves units and money empty when the trade type cannot be read', () => {
    const result = proposal(
      order('Verkauf', { sentence: 'Market-Order Verkauf, Zeitpunkt nicht gedruckt.' }),
    );
    expect(result.kind).toBeNull();
    expect(result.unitsE8).toBeNull();
    expect(result.amountCents).toBeNull();
    expect(result.open).toEqual(['kind', 'date', 'units', 'amount', 'fee', 'tax']);
  });

  it('leaves the costs empty for an unknown cost line, never a guess of zero', () => {
    const result = proposal(
      order('Kauf', {
        costs: ['Sonderposten -1,00 EUR', 'GESAMT -501,00 EUR'],
        booking: `${IBAN} 2026-11-11 -501,00 EUR`,
      }),
    );
    expect(result.open).toEqual(['fee', 'tax']);
    expect(result).toMatchObject({ amountCents: 50_000, feeCents: null, taxCents: null });
  });

  it('leaves all money empty when the booked amount contradicts position and costs', () => {
    const result = proposal(savings({ booking: `${IBAN} 2026-11-11 -101,00 EUR` }));
    expect(result.open).toEqual(['amount', 'fee', 'tax']);
    expect(result.unitsE8).toBe(33_944_300);
  });

  it('leaves the costs empty without a readable booking row', () => {
    const result = proposal(savings({ booking: undefined }));
    expect(result.open).toEqual(['fee', 'tax']);
    expect(result.amountCents).toBe(10_000);
  });

  it('keeps printed values of a low-price row and marks them as not cross-checked', () => {
    const result = proposal(
      savings({
        row: 'Synthetic Index Fund (Acc) 9,560229 Stk. 5,23 EUR 50,00 EUR',
        positionTotal: '50,00 EUR',
        booking: `${IBAN} 2026-11-11 -50,00 EUR`,
      }),
    );
    expect(result).toMatchObject({
      unitsE8: 956_022_900,
      amountCents: 5000,
      open: [],
      unchecked: true,
    });
  });

  it('falls back to the file hash as reference when the execution id is not read', () => {
    const result = proposal(
      savings({ header: ['DATUM 09.11.2026', 'SPARPLAN 9f8e-7d6c', 'DEPOT 0123456789'] }),
    );
    expect(result.reference).toBe(`wpa-sha256:${SHA}`);
    // A missing header id does not make the trade figures unreliable.
    expect(result.open).toEqual([]);
  });

  it('offers nothing for another layout or for a reason it does not know', () => {
    const all = ['kind', 'instrument', 'date', 'units', 'amount', 'fee', 'tax'];
    expect(proposal('Synthetic letter without any table').open).toEqual(all);
    const read = parseTradeConfirmation(savings(), SHA);
    const future = tradeProposalFromConfirmation({ ...read, reasons: ['synthetic_new_reason'] });
    expect(future.open).toEqual(all);
    expect(future.unitsE8).toBeNull();
  });
});
