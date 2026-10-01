import { describe, expect, it } from 'vitest';
import { decimalToMicro, divRound, parseSafeInt, ppDay, quoteToMicro, ValueError } from './convert';
import { PpFormatError, buildModel, grossValueCents, parsePp } from './model';
import { parseXml, XmlError } from './xml';

const bytes = (s: string) => new TextEncoder().encode(s);

const SEC = `<securities>
    <security><uuid>s-1</uuid><name>Alpha</name><currencyCode>EUR</currencyCode>
      <prices><price t="2024-01-02" v="515685000"/><price t="2024-01-03" v="0"/><price t="2024-01-02" v="600000000"/><price t="bad" v="1"/></prices>
      <latest t="2024-01-03" v="520000000"/><isRetired>false</isRetired></security>
    <security><uuid>s-2</uuid><name>Beta</name><mystery>1</mystery><mystery>2</mystery></security>
  </securities>`;

// One cash account with a BUY whose portfolio is written inline in the cross entry (first use),
// everything else by reference, exactly like PP.
const DOC = (extra = '', version = '70') => `<client>
  <version>${version}</version><baseCurrency>EUR</baseCurrency>
  ${SEC}
  <accounts>
    <account><uuid>a-1</uuid><name>Cash</name><currencyCode>EUR</currencyCode><isRetired>false</isRetired>
      <transactions>
        <account-transaction><uuid>t-dep</uuid><date>2024-01-02T00:00</date><currencyCode>EUR</currencyCode>
          <amount>100000</amount><shares>0</shares><type>DEPOSIT</type></account-transaction>
        <account-transaction><uuid>t-abuy</uuid><date>2024-01-03T00:00</date><currencyCode>EUR</currencyCode>
          <amount>10150</amount>
          <security reference="../../../../../securities/security"/>
          <crossEntry class="buysell">
            <portfolio><uuid>p-1</uuid><name>Depot</name><isRetired>false</isRetired>
              <referenceAccount reference="../../../../.."/>
              <transactions>
                <portfolio-transaction><uuid>t-pbuy</uuid><date>2024-01-03T00:00</date><currencyCode>EUR</currencyCode>
                  <amount>10150</amount>
                  <security reference="../../../../../../../../../securities/security"/>
                  <crossEntry class="buysell" reference="../../../.."/>
                  <shares>200000000</shares>
                  <units><unit type="FEE"><amount currency="EUR" amount="100"/></unit><unit type="TAX"><amount currency="EUR" amount="50"/></unit></units>
                  <type>BUY</type></portfolio-transaction>
              </transactions>
            </portfolio>
            <portfolioTransaction reference="../portfolio/transactions/portfolio-transaction"/>
            <account reference="../../../.."/>
            <accountTransaction reference="../.."/>
          </crossEntry>
          <shares>0</shares>
          <units><unit type="FEE"><amount currency="EUR" amount="100"/></unit><unit type="TAX"><amount currency="EUR" amount="50"/></unit></units>
          <type>BUY</type></account-transaction>
        ${extra}
      </transactions></account>
  </accounts>
  <portfolios><portfolio reference="../../accounts/account/transactions/account-transaction[2]/crossEntry/portfolio"/></portfolios>
  <taxonomies><taxonomy><id>x-1</id><name>Classes</name><root><id>c-0</id><name>Root</name><children>
    <classification><id>c-1</id><name>Stocks</name><parent reference="../../.."/><children/>
      <assignments><assignment><investmentVehicle class="security" reference="../../../../../../../../securities/security"/><weight>10000</weight><rank>3</rank></assignment></assignments>
      <weight>6000</weight><rank>1</rank></classification></children><assignments/></root></taxonomy></taxonomies>
</client>`;

const model = (xml: string) => parsePp(bytes(xml));

describe('parsePp on a small PP document', () => {
  const m = model(DOC());

  it('reads the header, securities and prices with integer conversions', () => {
    expect(m.version).toBe(70);
    expect(m.baseCurrency).toBe('EUR');
    expect(m.securities.map((s) => s.name)).toEqual(['Alpha', 'Beta']);
    const alpha = m.securities[0];
    // 515685000 / 1e8 = 5,15685 -> 5156850 micro; the zero, the duplicate day and the bad row are skipped.
    expect(alpha?.prices).toEqual([{ date: '2024-01-02', priceMicro: 5156850 }]);
    expect(alpha?.latest).toEqual({ date: '2024-01-03', priceMicro: 5200000 });
  });

  it('resolves references: security, reference account, portfolio, paired transactions', () => {
    expect(m.accounts).toHaveLength(1);
    expect(m.portfolios).toHaveLength(1);
    const pf = m.portfolios[0];
    expect(pf?.name).toBe('Depot');
    expect(pf?.referenceAccountUuid).toBe('a-1');
    const pbuy = pf?.transactions[0];
    const abuy = m.accounts[0]?.transactions[1];
    expect(pbuy?.securityUuid).toBe('s-1');
    expect(pbuy?.crossEntry).toEqual({ kind: 'buysell', peerUuid: 't-abuy' });
    expect(abuy?.crossEntry).toEqual({ kind: 'buysell', peerUuid: 't-pbuy' });
    expect(abuy?.securityUuid).toBe('s-1');
  });

  it('derives fees, taxes and the gross value from units', () => {
    const pbuy = m.portfolios[0]?.transactions[0];
    expect(pbuy).toMatchObject({
      amountCents: 10150,
      feeCents: 100,
      taxCents: 50,
      grossCents: 10000,
      sharesE8: 200000000,
      date: '2024-01-03',
    });
    expect(grossValueCents('SELL', 9000, 100, 50)).toBe(9150);
    expect(grossValueCents('DIVIDENDS', 850, 0, 150)).toBe(1000);
    expect(grossValueCents('DEPOSIT', 500, 0, 0)).toBe(500);
  });

  it('reads taxonomies with weights in basis points', () => {
    const c = m.taxonomies[0]?.classifications;
    expect(c?.map((x) => [x.id, x.parentId, x.weightBp])).toEqual([
      ['c-0', null, null],
      ['c-1', 'c-0', 6000],
    ]);
    expect(c?.[1]?.assignments).toEqual([
      { vehicle: 'security', uuid: 's-1', weightBp: 10000, rank: 3 },
    ]);
  });

  it('tolerates unknown elements with one merged problem entry and a path', () => {
    const p = m.problems.find((x) => x.code === 'unknown-element');
    expect(p).toMatchObject({ path: 'client/securities/security[2]/mystery', count: 2 });
    expect(m.problems.filter((x) => x.code === 'unknown-element')).toHaveLength(1);
  });

  it('merges skipped price rows per security instead of one problem per row', () => {
    const codes = m.problems.map((p) => `${p.code}:${p.count}`);
    expect(codes).toContain('price-zero:1');
    expect(codes).toContain('price-duplicate:1');
    expect(codes).toContain('price-invalid:1');
  });

  it('has no other problems', () => {
    expect(
      m.problems.map((p) => p.code).filter((c) => !/^(unknown-element|price-)/.test(c)),
    ).toEqual([]);
  });
});

describe('parsePp robustness', () => {
  it('skips an unknown transaction type with a problem and keeps the rest', () => {
    const m = model(
      DOC(
        `<account-transaction><uuid>t-x</uuid><date>2024-01-04T00:00</date><currencyCode>EUR</currencyCode><amount>1</amount><type>WARP</type></account-transaction>`,
      ),
    );
    expect(m.accounts[0]?.transactions.map((t) => t.uuid)).toEqual(['t-dep', 't-abuy']);
    expect(m.problems).toContainEqual(
      expect.objectContaining({
        code: 'unknown-type',
        path: 'client/accounts/account/transactions/account-transaction[3]',
      }),
    );
  });

  it('skips a transaction with a broken amount or date', () => {
    const m = model(
      DOC(
        `<account-transaction><uuid>t-1</uuid><date>2024-02-30T00:00</date><currencyCode>EUR</currencyCode><amount>1</amount><type>DEPOSIT</type></account-transaction>
         <account-transaction><uuid>t-2</uuid><date>2024-02-01T00:00</date><currencyCode>EUR</currencyCode><amount>1.5</amount><type>DEPOSIT</type></account-transaction>`,
      ),
    );
    expect(m.accounts[0]?.transactions).toHaveLength(2);
    expect(m.problems.filter((p) => p.code === 'transaction-invalid')).toHaveLength(2);
  });

  it('reports an unresolved reference with its path and without the reference text', () => {
    const m = model(
      DOC(
        `<account-transaction><uuid>t-3</uuid><date>2024-02-01T00:00</date><currencyCode>EUR</currencyCode><amount>1</amount>
           <security reference="../../../../../securities/security[9]"/><type>DIVIDENDS</type></account-transaction>`,
      ),
    );
    const p = m.problems.find((x) => x.code === 'reference-unresolved');
    expect(p?.path).toMatch(/account-transaction\[3\]\/security$/);
    expect(p?.message).not.toContain('security[9]');
    // The transaction is kept, without a security.
    expect(m.accounts[0]?.transactions[2]?.securityUuid).toBeNull();
  });

  it('flags a cross entry whose partner does not point back', () => {
    const m = model(DOC().replace('<crossEntry class="buysell" reference="../../../.."/>', ''));
    expect(m.problems.map((p) => p.code)).toContain('peer-mismatch');
  });

  it('flags a transaction of an unknown security', () => {
    const m = model(
      DOC().replace('<security reference="../../../../../securities/security"/>', ''),
    );
    expect(m.problems.find((p) => p.code === 'unknown-security')).toBeUndefined();
    const x = model(
      DOC(
        `<account-transaction><uuid>t-4</uuid><date>2024-02-01T00:00</date><currencyCode>EUR</currencyCode><amount>1</amount>
           <security><uuid>ghost</uuid></security><type>DIVIDENDS</type></account-transaction>`,
      ),
    );
    expect(x.problems.map((p) => p.code)).toContain('unknown-security');
  });

  it('reads forex units with an exchange rate as micro', () => {
    const m = model(
      DOC(
        `<account-transaction><uuid>t-5</uuid><date>2024-02-01T00:00</date><currencyCode>EUR</currencyCode><amount>850</amount>
           <units><unit type="TAX"><amount currency="EUR" amount="150"/></unit>
             <unit type="GROSS_VALUE"><amount currency="EUR" amount="1000"/><forex currency="USD" amount="1087"/><exchangeRate>0.92</exchangeRate></unit></units>
           <type>DIVIDENDS</type></account-transaction>`,
      ),
    );
    const t = m.accounts[0]?.transactions[2];
    expect(t?.grossCents).toBe(1000);
    expect(t?.units[1]).toEqual({
      type: 'GROSS_VALUE',
      amountCents: 1000,
      forex: { currency: 'USD', amountCents: 1087, rateMicro: 920000 },
    });
    expect(m.problems.map((p) => p.code)).not.toContain('gross-mismatch');
  });

  it('refuses files that are not PP files or too old', () => {
    expect(() => model('<other/>')).toThrow(PpFormatError);
    expect(() => model('<client><baseCurrency>EUR</baseCurrency></client>')).toThrow(/version/);
    expect(() => model(DOC('', '12'))).toThrow(/quoteScale/);
    expect(() => parsePp(bytes(DOC('', '12')), { quoteScale: 10_000n })).not.toThrow();
  });

  it('notes a newer client version but reads the file', () => {
    expect(model(DOC('', '99')).problems.map((p) => p.code)).toContain('newer-version');
  });

  it('throws XmlError on broken XML and on a DOCTYPE (XXE)', () => {
    expect(() => model('<client><version>70</version>')).toThrow(XmlError);
    const xxe = `<!DOCTYPE client [<!ENTITY x SYSTEM "file:///etc/hostname">]><client><version>70</version><baseCurrency>&x;</baseCurrency></client>`;
    expect(() => model(xxe)).toThrow(/DOCTYPE/);
  });

  it('enforces the size limit', () => {
    expect(() => parsePp(bytes(DOC()), { maxBytes: 100 })).toThrow(/larger than/);
  });

  it('problems carry element names and paths, never values from the file', () => {
    const secret = 'Zx-Secret-Name';
    const m = model(
      DOC(
        `<account-transaction><uuid>${secret}</uuid><date>${secret}</date><currencyCode>EUR</currencyCode><amount>${secret}</amount><type>DEPOSIT</type></account-transaction>
         <mystery-${'x'}>${secret}</mystery-x>`,
      ),
    );
    expect(m.problems.length).toBeGreaterThan(0);
    expect(JSON.stringify(m.problems)).not.toContain(secret);
  });

  it('buildModel works on an already parsed tree', () => {
    expect(buildModel(parseXml(DOC())).securities).toHaveLength(2);
  });
});

describe('value conversion (no floats)', () => {
  it('converts quotes to micro, half up', () => {
    expect(quoteToMicro('515685000')).toBe(5156850);
    expect(quoteToMicro('50')).toBe(1); // 0,0000005 rounds up to 1 micro
    expect(quoteToMicro('49')).toBe(0);
    expect(quoteToMicro('12345', 10_000n)).toBe(1234500);
    expect(quoteToMicro('900719925474099100')).toBe(9007199254740991);
    expect(() => quoteToMicro('9007199254740991000')).toThrow(/range/);
  });
  it('parses decimals to micro, half up', () => {
    expect(decimalToMicro('0.92')).toBe(920000);
    expect(decimalToMicro('1')).toBe(1000000);
    expect(decimalToMicro('0.1234565')).toBe(123457);
    expect(decimalToMicro('0.1234564')).toBe(123456);
    expect(() => decimalToMicro('1e3')).toThrow(ValueError);
  });
  it('parses strict integers and days', () => {
    expect(parseSafeInt(' -12 ')).toBe(-12);
    expect(() => parseSafeInt('1.0')).toThrow(ValueError);
    expect(() => parseSafeInt('99999999999999999999')).toThrow(/range/);
    expect(ppDay('2024-02-29T10:00:00.123')).toBe('2024-02-29');
    expect(() => ppDay('2023-02-29')).toThrow(ValueError);
    expect(() => ppDay('29.02.2024')).toThrow(ValueError);
  });
  it('rounds half away from zero', () => {
    expect(divRound(5n, 2n)).toBe(3n);
    expect(divRound(-5n, 2n)).toBe(-3n);
    expect(divRound(4n, 3n)).toBe(1n);
  });
});
