import { expect, it } from 'vitest';
import { checkStatementPurchases, type StatementPurchaseInput } from './statement-purchase-check';
const row = (
  id: string,
  amountCents = -1234,
  date = '2031-01-02',
  description = 'Synthetic shop',
) => ({ id, date, description, amountCents });
const statement = (
  lines: StatementPurchaseInput['lines'] = [row('line')],
  printedTotalCents = 1234,
): StatementPurchaseInput => ({
  period: { from: '2030-12-20', to: '2031-01-19' },
  printedTotalCents,
  lines,
});
it('matches exact cents and produces identical results on a second check without mutation', () => {
  const input = statement(),
    bookings = [row('booking')];
  const before = JSON.stringify([input, bookings]);
  const result = checkStatementPurchases(input, bookings);
  expect(result.sumMatches).toBe(true);
  expect(result.bookedPurchaseCents).toBe(1234);
  expect(result.matched.map((m) => [m.line.id, m.booking.id])).toEqual([['line', 'booking']]);
  expect(checkStatementPurchases(input, bookings)).toEqual(result);
  expect(JSON.stringify([input, bookings])).toBe(before);
});
it('reports one missing purchase with a literal 1234-cent shortfall', () => {
  const result = checkStatementPurchases(statement(), []);
  expect(result.differenceCents).toBe(-1234);
  expect(result.statementOnly).toEqual([{ line: row('line'), ambiguous: false }]);
});
it('keeps a duplicate booking visible and does not guess its match', () => {
  const result = checkStatementPurchases(statement(), [row('a'), row('b')]);
  expect(result.differenceCents).toBe(1234);
  expect(result.matched).toEqual([]);
  expect(result.bookingOnly.map((b) => b.id)).toEqual(['a', 'b']);
  expect(result.statementOnly[0]?.ambiguous).toBe(true);
});
it('subtracts a partial refund from the cycle purchase sum', () => {
  const lines = [row('purchase'), row('refund', 234)];
  const result = checkStatementPurchases(statement(lines, 1000), [row('a'), row('b', 234)]);
  expect(result.bookedPurchaseCents).toBe(1000);
  expect(result.sumMatches).toBe(true);
  expect(result.matched).toHaveLength(2);
});
it('compares a foreign-currency purchase using its booked EUR cents', () => {
  const result = checkStatementPurchases(statement([row('USD purchase / EUR column', -923)], 923), [
    row('EUR booking', -923),
  ]);
  expect(result.sumMatches).toBe(true);
  expect(result.matched).toHaveLength(1);
});
it('includes both boundaries across month and year end and excludes newer purchases', () => {
  const result = checkStatementPurchases(statement(null, 300), [
    row('a', -100, '2030-12-20'),
    row('b', -200, '2031-01-19'),
    row('old', -400, '2030-12-19'),
    row('new', -800, '2031-01-20'),
  ]);
  expect(result.bookedPurchaseCents).toBe(300);
  expect(result.sumMatches).toBe(true);
  expect(result.linesAvailable).toBe(false);
});
it('leaves an ambiguous same-day same-amount pair open even when descriptions differ', () => {
  const result = checkStatementPurchases(
    statement([row('a'), row('b', -1234, '2031-01-02', 'Other shop')], 2468),
    [row('x'), row('y', -1234, '2031-01-02', 'Other shop')],
  );
  expect(result.sumMatches).toBe(true);
  expect(result.matched).toEqual([]);
  expect(result.statementOnly).toHaveLength(2);
  expect(result.bookingOnly).toHaveLength(2);
});
it('never matches one purchase to two statement lines', () => {
  const result = checkStatementPurchases(statement([row('a'), row('b')], 2468), [row('x')]);
  expect(result.matched).toEqual([]);
  expect(result.statementOnly.every((l) => l.ambiguous)).toBe(true);
});
it('reports a unique description/date amount difference to the cent', () => {
  const result = checkStatementPurchases(statement(), [row('x', -1235)]);
  expect(result.amountDifferences[0]?.differenceCents).toBe(-1);
  expect(result.differenceCents).toBe(1);
  expect(result.bookingOnly).toEqual([]);
});
it('does not infer an unstated cycle or an unknown printed total', () => {
  expect(
    checkStatementPurchases({ ...statement(), period: null }, [row('x')]).sumMatches,
  ).toBeNull();
  expect(
    checkStatementPurchases({ ...statement(), printedTotalCents: null }, [row('x')]).sumMatches,
  ).toBeNull();
});
it('rejects unsafe cents and aggregate overflow', () => {
  expect(() => checkStatementPurchases(statement(), [row('x', 1.5)])).toThrow();
  expect(() =>
    checkStatementPurchases(statement(), [row('x', -Number.MAX_SAFE_INTEGER), row('y', -1)]),
  ).toThrow();
});
it('never calls a purchase missing when the cycle is unstated, even with readable positions', () => {
  const result = checkStatementPurchases({ ...statement(), period: null }, [row('exists')]);
  expect(result.sumMatches).toBeNull();
  expect(result.matched).toEqual([]);
  expect(result.statementOnly).toEqual([]);
  expect(result.bookingOnly).toEqual([]);
});
it('retains known positions during incomplete extraction without claiming complete line coverage', () => {
  const result = checkStatementPurchases({ ...statement(), linesComplete: false }, [row('exists')]);
  expect(result.matched).toHaveLength(1);
  expect(result.linesAvailable).toBe(false);
});
it('keeps undated and out-of-cycle statement rows unresolved instead of recommending capture', () => {
  for (const date of [null, '2030-12-19']) {
    const result = checkStatementPurchases(statement([{ ...row('line'), date }]), [row('exists')]);
    expect(result.statementOnly).toEqual([{ line: { ...row('line'), date }, ambiguous: true }]);
    expect(result.matched).toEqual([]);
  }
});
