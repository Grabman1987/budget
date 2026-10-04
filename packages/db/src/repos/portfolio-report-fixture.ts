import type { OpenedDatabase } from '../client';

/** 31.12.2025 holdings, month-end prices and trades of the synthetic portfolio of the report tests. */
export const REPORT_TODAY = '2026-09-17';
const MONTH_ENDS = [
  '2026-01-31',
  '2026-02-28',
  '2026-03-31',
  '2026-04-30',
  '2026-05-31',
  '2026-06-30',
  '2026-07-31',
  '2026-08-31',
  '2026-09-17',
];
const E8 = 100_000_000;

/**
 * Synthetic portfolio for the portfolio report read models (4.1, 4.2, 4.5):
 * two depots (broker A: an ETF and a dividend stock; platform B: a coin), two asset classes with a
 * Soll of 70/30 from 2026-01-01 and 60/40 from 2026-06-01, regions on the ETF, monthly savings buys
 * with an order fee, a dividend and an interest payment with the broker's tax and fee, a sale with
 * the broker's tax, and a standalone fee and tax booking. No real names or amounts.
 */
export function reportPortfolioFixture(opened: OpenedDatabase) {
  const price = (id: string, step: number, base: number) =>
    MONTH_ENDS.map(
      (date, i) =>
        `('${id}', '${date}', ${Math.round(base * (1 + step * i + 0.015 * Math.sin(i * 1.7)) * 1e6)}, 'EUR', 'yfinance')`,
    ).join(',');
  const buys = MONTH_ENDS.slice(0, 8)
    .map((date, i) => {
      const unitsEtf = 2 * E8 + i * 10_000_000;
      return `('buy-etf-${i}', 'etf', 'depot-a', '${date}', 'buy', ${unitsEtf}, ${20_000 + i * 100}, 100, 0, 'k-etf-${i}'),
      ('buy-coin-${i}', 'coin', 'depot-b', '${date}', 'buy', ${E8 / 100}, 5000, 0, 0, 'k-coin-${i}')`;
    })
    .join(',');
  opened.sqlite.exec(`
    INSERT INTO institution (id, name, kind) VALUES
      ('broker-a', 'Broker A', 'broker'), ('platform-b', 'Plattform B', 'platform');
    INSERT INTO account (id, name, type, role, on_budget, institution_id, opening_date, sort_order) VALUES
      ('depot-a', 'Depot A', 'brokerage', 'investment', 0, 'broker-a', '2025-12-31', 10),
      ('depot-b', 'Krypto B', 'crypto', 'investment', 0, 'platform-b', '2025-12-31', 11);
    INSERT INTO asset_class (id, name, sort_order) VALUES ('world', 'Aktien Welt', 1), ('spec', 'Spekulativ', 2);
    INSERT INTO asset_class_target (id, asset_class_id, valid_from, target_share_bp, band_bp) VALUES
      ('t1w', 'world', '2026-01-01', 7000, 500), ('t1s', 'spec', '2026-01-01', 3000, 500),
      ('t2w', 'world', '2026-06-01', 6000, 500), ('t2s', 'spec', '2026-06-01', 4000, 500);
    INSERT INTO security (id, name, kind, currency, ter_bp, asset_class_id, institution_id, regions_json) VALUES
      ('etf', 'ETF Welt', 'etf', 'EUR', 20, 'world', 'broker-a', '{"USA":0.6,"Europa":0.3,"Asien":0.1}'),
      ('div', 'Dividendenaktie', 'stock', 'EUR', 0, 'spec', 'broker-a', '{"Europa":1}'),
      ('coin', 'Coin', 'crypto', 'EUR', 0, 'spec', 'platform-b', NULL);
    INSERT INTO price (security_id, date, price_micro, currency, source) VALUES
      ('etf', '2025-12-31', 100000000, 'EUR', 'yfinance'),
      ('div', '2025-12-31', 50000000, 'EUR', 'yfinance'),
      ('coin', '2025-12-31', 30000000, 'EUR', 'yfinance'),
      ${price('etf', 0.012, 100)},
      ${price('div', 0.004, 50)},
      ${price('coin', 0.03, 30)};
    INSERT INTO holding (id, security_id, account_id, as_of, units_e8, cost_basis_cents) VALUES
      ('h-etf', 'etf', 'depot-a', '2025-12-31', ${40 * E8}, 360000),
      ('h-div', 'div', 'depot-a', '2025-12-31', ${20 * E8}, 90000),
      ('h-coin', 'coin', 'depot-b', '2025-12-31', ${10 * E8}, 20000);
    INSERT INTO trade (id, security_id, account_id, date, kind, units_e8, amount_cents, fee_cents, tax_cents, import_key) VALUES
      ${buys},
      ('div-1', 'div', 'depot-a', '2026-06-10', 'dividend', 0, 1800, 25, 495, 'k-div-1'),
      ('int-1', 'coin', 'depot-b', '2026-07-05', 'interest', 0, 1000, 0, 275, 'k-int-1'),
      ('sell-1', 'div', 'depot-a', '2026-08-10', 'sell', ${-5 * E8}, 26000, 100, 400, 'k-sell-1'),
      ('fee-1', 'etf', 'depot-a', '2026-04-02', 'fee', 0, 120, 0, 0, 'k-fee-1'),
      ('tax-1', 'etf', 'depot-a', '2026-04-30', 'tax', 0, 80, 0, 0, 'k-tax-1');
    INSERT INTO security_exposure_version (id, security_id, valid_from, complete, source)
      SELECT 'fixture:' || id, id, '2025-12-31', 1, 'synthetic_fixture' FROM security;
    INSERT INTO security_asset_exposure (id, version_id, security_id, asset_class_id, valid_from, weight_bp, source)
      SELECT 'fixture:' || id, 'fixture:' || id, id, asset_class_id, '2025-12-31', 10000, 'synthetic_fixture' FROM security;`);
}
