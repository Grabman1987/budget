import type { OpenedDatabase } from '../client';

/** Two observed days, constant EUR holdings and one unheld USD benchmark; synthetic only. */
export function benchmarkQuoteFixture(opened: OpenedDatabase, availableFx: boolean) {
  opened.sqlite.exec(`
    INSERT INTO account (id,name,type,role,on_budget,opening_date)
      VALUES ('synthetic-depot','Synthetic depot','brokerage','investment',0,'2026-03-02');
    INSERT INTO security (id,name,kind,currency) VALUES
      ('held','Synthetic holding','etf','EUR'), ('benchmark','Synthetic benchmark','etf','USD');
    INSERT INTO holding (id,security_id,account_id,as_of,units_e8,cost_basis_cents)
      VALUES ('opening','held','synthetic-depot','2026-03-02',100000000,10000);
    INSERT INTO price (security_id,date,price_micro,currency,source) VALUES
      ('held','2026-03-02',100000000,'EUR','manual'), ('held','2026-03-03',100000000,'EUR','manual'),
      ('benchmark','2026-03-02',100000000,'USD','manual'), ('benchmark','2026-03-03',110000000,'USD','manual');
    INSERT INTO app_setting (id,value) VALUES ('portfolio.benchmark_security_id','benchmark');
  `);
  if (availableFx)
    opened.sqlite.exec(`INSERT INTO fx_rate (currency,date,rate_micro) VALUES
      ('USD','2026-03-02',2000000),('USD','2026-03-03',1000000);`);
}
