import { describe, expect, it } from 'vitest';
import { decimalToMicro, quoteToMicro, ValueError } from './convert';
import { parsePp } from './model';

describe('#511 lossless PP quote input', () => {
  it('keeps exact, custom-scale, zero and maximum-safe outputs without restricting raw BigInt text', () => {
    expect(quoteToMicro('123456700')).toBe(1_234_567);
    expect(quoteToMicro('515685000')).toBe(5_156_850);
    expect(quoteToMicro('12345', 10_000n)).toBe(1_234_500);
    expect(quoteToMicro('0')).toBe(0);
    expect(quoteToMicro('900719925474099100')).toBe(9_007_199_254_740_991);
  });

  it.each(['50', '49', '123456789'])('rejects individually unrepresentable quote %s', (raw) => {
    expect(() => quoteToMicro(raw)).toThrow(ValueError);
  });

  it('requires exact divisibility for an explicitly selected legacy scale too', () => {
    expect(quoteToMicro('3', 3n)).toBe(1_000_000);
    expect(() => quoteToMicro('1', 3n)).toThrow(ValueError);
  });

  it('rejects an exactly divisible target beyond MAX_SAFE rather than rejecting large raw text', () => {
    expect(() => quoteToMicro('900719925474099200')).toThrow(ValueError);
  });

  it('leaves the separately approved decimal FX rounding contract unchanged', () => {
    expect(decimalToMicro('0.1234565')).toBe(123_457);
    expect(decimalToMicro('0.1234564')).toBe(123_456);
    expect(decimalToMicro('0.92')).toBe(920_000);
  });

  it('skips only invalid individual quotes through the real sanitized PP model boundary', () => {
    const document = `<client><version>70</version><baseCurrency>EUR</baseCurrency>
      <securities>
        <security><uuid>synthetic-precision</uuid><name>Synthetic precision</name>
          <currencyCode>EUR</currencyCode><isRetired>false</isRetired>
          <prices>
            <price t="2026-09-01" v="123456700"/>
            <price t="2026-09-02" v="123456789"/>
            <price t="2026-09-03" v="50"/>
            <price t="2026-09-04" v="49"/>
          </prices><latest t="2026-09-05" v="50"/>
        </security>
        <security><uuid>synthetic-untouched</uuid><name>Synthetic untouched</name>
          <currencyCode>EUR</currencyCode><isRetired>false</isRetired>
          <prices><price t="2026-09-01" v="100000000"/></prices>
        </security>
      </securities><accounts/><portfolios/><taxonomies/>
    </client>`;
    const model = parsePp(new TextEncoder().encode(document));
    expect(model.securities).toHaveLength(2);
    expect(model.securities[0]?.prices).toEqual([{ date: '2026-09-01', priceMicro: 1_234_567 }]);
    expect(model.securities[0]?.latest).toBeNull();
    expect(model.securities[1]?.prices).toEqual([{ date: '2026-09-01', priceMicro: 1_000_000 }]);
    const precisionProblems = model.problems.filter((problem) => problem.code === 'price-invalid');
    expect(precisionProblems.reduce((count, problem) => count + problem.count, 0)).toBe(4);
    const output = JSON.stringify(precisionProblems);
    expect(output).not.toContain('123456789');
    expect(output).not.toContain('Synthetic precision');
  });
});
