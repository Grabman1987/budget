import { describe, expect, it } from 'vitest';
import {
  acceptsTradeConfirmation,
  isinCheckDigitValid,
  parseTradeConfirmation,
  tradeValueConsistent,
} from '../index';

// Synthetic extractor output modelled on the layout only: invented issuer, names, ids, ISINs
// (valid check digits), depot and settlement account numbers and amounts.
const SHA = 'a'.repeat(64);
const ISIN = 'IE00SYNTH008';
const IBAN = 'DE00000000000000001234';

const doc = (o: {
  title: string;
  header: string[];
  sentence: string;
  row: string;
  isin?: string;
  positionTotal: string;
  costs?: string[];
  booking: string;
}) =>
  [
    'Beispiel Broker AG Musterweg 1 00000 Beispielstadt',
    'Erika Muster',
    'Musterstraße 2',
    ...o.header,
    o.title,
    'ÜBERSICHT',
    o.sentence,
    'Der Kontrahent der Transaktion ist Beispiel Handelshaus GmbH.',
    'POSITION ANZAHL DURCHSCHNITTSKURS BETRAG',
    o.row,
    `ISIN: ${o.isin ?? ISIN}`,
    `GESAMT ${o.positionTotal}`,
    ...(o.costs ? ['ABRECHNUNG', 'POSITION BETRAG', ...o.costs] : []),
    'BUCHUNG',
    'VERRECHNUNGSKONTO WERTSTELLUNG BETRAG',
    o.booking,
    'Die Wertpapiere werden in Ihrem Depot verwahrt.',
    'Dieses Dokument wurde maschinell erstellt und wird nicht unterschrieben.',
    'Sofern keine Umsatzsteuer ausgewiesen ist, handelt es sich um eine steuerfreie Leistung.',
  ].join('\n');

const savingsPlan = (overrides: Partial<Parameters<typeof doc>[0]> = {}) =>
  doc({
    title: 'WERTPAPIERABRECHNUNG SPARPLAN',
    header: ['DATUM 09.11.2026', 'AUSFÜHRUNG 1a2b-3c4d', 'SPARPLAN 9f8e-7d6c', 'DEPOT 0123456789'],
    sentence: 'Sparplanausführung am 09.11.2026 an der Beispiel Exchange.',
    row: 'Synthetic World Equity UCITS ETF (Acc) 0,339443 Stk. 294,60 EUR 100,00 EUR',
    positionTotal: '100,00 EUR',
    booking: `${IBAN} 2026-11-11 -100,00 EUR`,
    ...overrides,
  });

describe('trade confirmation reader (#1057)', () => {
  it('reads a savings plan execution', () => {
    const text = savingsPlan();
    expect(acceptsTradeConfirmation(text)).toBe(true);
    expect(parseTradeConfirmation(text, SHA)).toEqual({
      parserVersion: 1,
      sha256: SHA,
      kind: 'savings_plan',
      documentDate: '2026-11-09',
      executionDate: '2026-11-09',
      executionTime: null,
      executionId: '1a2b-3c4d',
      planId: '9f8e-7d6c',
      orderId: null,
      depotHint: '6789',
      venue: 'Beispiel Exchange',
      instrument: { name: 'Synthetic World Equity UCITS ETF (Acc)', isin: ISIN },
      quantity: '0.339443',
      unitsE8: 33_944_300,
      price: { value: '294.60', currency: 'EUR' },
      amountCents: 10_000,
      costs: [],
      totalCents: 10_000,
      booking: { accountHint: '1234', valueDate: '2026-11-11', signedCents: -10_000 },
      currency: 'EUR',
      verified: true,
      reasons: [],
    });
  });

  it('reads a round-up execution without a plan id', () => {
    const parsed = parseTradeConfirmation(
      doc({
        title: 'WERTPAPIERABRECHNUNG',
        header: ['DATUM 03.11.2026', 'AUSFÜHRUNG 5e6f-7a8b', 'DEPOT 0123456789'],
        sentence: 'Ausführung von Round up am 03.11.2026 an der Beispiel Exchange.',
        row: 'Synthetic Bond Fund 0,012345 Stk. 99,64 EUR 1,23 EUR',
        isin: 'IE00SYNTH016',
        positionTotal: '1,23 EUR',
        booking: `${IBAN} 2026-11-05 -1,23 EUR`,
      }),
      SHA,
    );
    expect(parsed).toMatchObject({
      kind: 'round_up',
      planId: null,
      executionId: '5e6f-7a8b',
      quantity: '0.012345',
      unitsE8: 1_234_500,
      price: { value: '99.64', currency: 'EUR' },
      amountCents: 123,
      totalCents: 123,
      booking: { accountHint: '1234', valueDate: '2026-11-05', signedCents: -123 },
      verified: true,
      reasons: [],
    });
  });

  it('reads a buy order with a cost line', () => {
    const parsed = parseTradeConfirmation(
      doc({
        title: 'WERTPAPIERABRECHNUNG',
        header: ['DATUM 02.11.2026', 'AUSFÜHRUNG 0a0b-1c1d', 'ORDER 2e2f-3a3b', 'DEPOT 0123456789'],
        sentence: 'Market-Order Kauf am 02.11.2026, um 10:15 Uhr an der Beispiel Exchange.',
        row: 'Synthetic Industrials AG 5 Stk. 200,00 EUR 1.000,00 EUR',
        isin: 'LU00SYNTH024',
        positionTotal: '1.000,00 EUR',
        costs: ['Fremdkostenzuschlag -1,00 EUR', 'GESAMT -1.001,00 EUR'],
        booking: `${IBAN} 2026-11-04 -1.001,00 EUR`,
      }),
      SHA,
    );
    expect(parsed).toMatchObject({
      kind: 'buy',
      executionTime: '10:15',
      orderId: '2e2f-3a3b',
      planId: null,
      quantity: '5',
      unitsE8: 500_000_000,
      amountCents: 100_000,
      costs: [{ label: 'Fremdkostenzuschlag', kind: 'fee', cents: -100 }],
      totalCents: 100_100,
      booking: { accountHint: '1234', valueDate: '2026-11-04', signedCents: -100_100 },
      verified: true,
      reasons: [],
    });
  });

  it('reads a sell order with fee and tax and a positive booking', () => {
    const parsed = parseTradeConfirmation(
      doc({
        title: 'WERTPAPIERABRECHNUNG',
        header: ['DATUM 06.11.2026', 'AUSFÜHRUNG 4c4d-5e5f', 'DEPOT 0123456789'],
        sentence: 'Market-Order Verkauf am 06.11.2026, um 15:42 Uhr an der Beispiel Exchange.',
        row: 'Synthetic Industrials AG 10 Stk. 52,35 EUR 523,50 EUR',
        isin: 'LU00SYNTH024',
        positionTotal: '523,50 EUR',
        costs: [
          'Fremdkostenzuschlag -1,00 EUR',
          'Kapitalertragsteuer -12,34 EUR',
          'GESAMT 510,16 EUR',
        ],
        booking: `${IBAN} 2026-11-10 510,16 EUR`,
      }),
      SHA,
    );
    expect(parsed).toMatchObject({
      kind: 'sell',
      quantity: '10',
      unitsE8: 1_000_000_000,
      amountCents: 52_350,
      costs: [
        { label: 'Fremdkostenzuschlag', kind: 'fee', cents: -100 },
        { label: 'Kapitalertragsteuer', kind: 'tax', cents: -1_234 },
      ],
      totalCents: 51_016,
      booking: { accountHint: '1234', valueDate: '2026-11-10', signedCents: 51_016 },
      verified: true,
      reasons: [],
    });
  });

  it('reads labels and values split across lines with irregular spacing', () => {
    const text = savingsPlan({
      header: [
        'DATUM',
        '09.11.2026',
        'AUSFÜHRUNG',
        '1a2b-3c4d',
        'SPARPLAN   9f8e-7d6c',
        'DEPOT',
        '0123456789',
      ],
      row: 'Synthetic World Equity UCITS ETF (Acc)\n0,339443  Stk.\n294,60 EUR\t100,00 EUR',
      booking: `${IBAN}\n2026-11-11\n-100,00 EUR`,
    });
    expect(parseTradeConfirmation(text, SHA)).toMatchObject({
      kind: 'savings_plan',
      documentDate: '2026-11-09',
      planId: '9f8e-7d6c',
      depotHint: '6789',
      quantity: '0.339443',
      amountCents: 10_000,
      booking: { accountHint: '1234', valueDate: '2026-11-11', signedCents: -10_000 },
      verified: true,
      reasons: [],
    });
  });

  it('flags a wrong ISIN check digit without repairing it', () => {
    const parsed = parseTradeConfirmation(savingsPlan({ isin: 'IE00SYNTH009' }), SHA);
    expect(parsed.instrument).toEqual({
      name: 'Synthetic World Equity UCITS ETF (Acc)',
      isin: 'IE00SYNTH009',
    });
    expect(parsed.verified).toBe(false);
    expect(parsed.reasons).toEqual(['isin_check_digit_invalid']);
  });

  it('flags a booking that does not match the total', () => {
    const parsed = parseTradeConfirmation(
      savingsPlan({ booking: `${IBAN} 2026-11-11 -99,00 EUR` }),
      SHA,
    );
    expect(parsed.verified).toBe(false);
    expect(parsed.reasons).toEqual(['booking_total_mismatch']);
    expect(parsed.totalCents).toBe(10_000);
    expect(parsed.booking?.signedCents).toBe(-9_900);
  });

  it('flags a position total and a quantity × price that do not match the amount', () => {
    const parsed = parseTradeConfirmation(
      savingsPlan({
        row: 'Synthetic World Equity UCITS ETF (Acc) 0,339443 Stk. 290,00 EUR 100,00 EUR',
        positionTotal: '101,00 EUR',
      }),
      SHA,
    );
    expect(parsed.verified).toBe(false);
    expect(parsed.reasons).toEqual(['quantity_price_amount_mismatch', 'position_total_mismatch']);
  });

  it('flags an unknown cost line and an extra position row', () => {
    const parsed = parseTradeConfirmation(
      savingsPlan({
        row: 'Synthetic World Equity UCITS ETF (Acc) 0,339443 Stk. 294,60 EUR 100,00 EUR\nSynthetic Extra 1 Stk. 1,00 EUR 1,00 EUR',
        costs: ['Sonderentgelt -1,00 EUR', 'GESAMT -101,00 EUR'],
        booking: `${IBAN} 2026-11-11 -101,00 EUR`,
      }),
      SHA,
    );
    expect(parsed.verified).toBe(false);
    expect(parsed.reasons).toEqual([
      'unrecognized_position_row',
      'position_total_mismatch',
      'unknown_cost_line',
    ]);
    expect(parsed.instrument).toBeNull();
  });

  it('does not accept a document of another kind', () => {
    const receipt = [
      'Beispiel Markt',
      'Datum 09.11.2026',
      'Brot 2,50 EUR',
      'GESAMT 2,50 EUR',
      'Zahlung Karte',
    ].join('\n');
    expect(acceptsTradeConfirmation(receipt)).toBe(false);
    expect(parseTradeConfirmation(receipt, SHA)).toMatchObject({
      kind: null,
      verified: false,
      reasons: ['layout_unavailable'],
    });
  });

  it('refuses an over-long text before reading it', () => {
    const text = savingsPlan() + '\n' + 'x'.repeat(20_000);
    expect(acceptsTradeConfirmation(text)).toBe(false);
    expect(parseTradeConfirmation(text, SHA)).toMatchObject({
      kind: null,
      instrument: null,
      verified: false,
      reasons: ['text_too_long'],
    });
  });

  it('checks ISIN digits and value tolerance with exact arithmetic', () => {
    expect(isinCheckDigitValid('IE00SYNTH008')).toBe(true);
    expect(isinCheckDigitValid('IE00SYNTH009')).toBe(false);
    expect(tradeValueConsistent('0.339443', '294.60', 10_000)).toBe(true);
    expect(tradeValueConsistent('0.339443', '294.60', 10_002)).toBe(false);
    // 100 units at a price printed to the cent: rounding allows up to 50 cents.
    expect(tradeValueConsistent('100', '10.00', 100_049)).toBe(true);
    expect(tradeValueConsistent('100', '10.00', 100_051)).toBe(false);
  });
});
