// Scales the synthetic sample DB (npm run db:seed) up to the production size so that server timings
// are comparable: ~7k bookings, ~3.9k trades, a long inbox. No real data is involved.
// Usage: DATABASE_PATH=data/perf.sqlite npx tsx scripts/perf/scale.ts
import { openDatabase } from '@budget/db';

const { sqlite } = openDatabase(process.env['DATABASE_PATH']!);
sqlite.transaction(() => {
  // ~2.8k more bookings (with their splits) on the following day of an existing plain booking.
  sqlite.exec(`
    insert into booking (id, account_id, date, amount_cents, payee_id, memo, status, flag, currency, source, import_key)
      select 'pf-' || id, account_id, date(date, '+1 day'), amount_cents, payee_id, memo, status, flag, currency, source, null
      from booking where transfer_id is null and rowid % 4 < 3 and date <= '2026-09-16';
    insert into booking_split (id, booking_id, category_id, amount_cents, memo, contact_id, income_type_id, sort_order)
      select 'pf-' || s.id, 'pf-' || s.booking_id, s.category_id, s.amount_cents, s.memo, s.contact_id, s.income_type_id, s.sort_order
      from booking_split s join booking b on b.id = s.booking_id
      where b.transfer_id is null and b.rowid % 4 < 3 and b.date <= '2026-09-16' and s.transfer_id is null;
  `);
  // Trades x18 on shifted days (same relative order, so no position goes negative).
  for (let k = 1; k <= 17; k++)
    sqlite.exec(`
      insert into trade (id, security_id, account_id, date, kind, units_e8, amount_cents, fee_cents, tax_cents)
        select 'pf${k}-' || id, security_id, account_id, date(date, '+${k} day'), kind, units_e8, amount_cents, fee_cents, tax_cents
        from trade where id not like 'pf%' and date <= '2026-08-31';`);
  // A long inbox: 3000 resolved, 150 open.
  const ins = sqlite.prepare(
    `insert into inbox_item (id, kind, title, detail, created_at, resolved_at, resolution) values (?, 'other', ?, 'synthetisch', ?, ?, ?)`,
  );
  for (let i = 0; i < 3150; i++) {
    const created = `2026-0${1 + (i % 9)}-1${i % 9}T10:00:00.000Z`;
    const open = i < 150;
    ins.run(
      `pf-inbox-${i}`,
      `Eintrag ${i}`,
      created,
      open ? null : created,
      open ? null : 'erledigt',
    );
  }
})();
for (const t of ['booking', 'booking_split', 'trade', 'inbox_item'])
  console.log(t, (sqlite.prepare(`select count(*) c from ${t}`).get() as { c: number }).c);
