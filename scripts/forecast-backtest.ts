import { forecastBacktest, openReadonlyDatabase } from '@budget/db';
import { todayInVienna } from '@budget/domain';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';

const [flag, file, count = '6', ...extra] = process.argv.slice(2);
if (flag !== '--database' || !file || !/^(?:[1-9]|1\d|2[0-4])$/.test(count) || extra.length)
  throw new Error('Usage: npx tsx scripts/forecast-backtest.ts --database <ledger.sqlite> [1-24]');

function outsidePrivate(path: string): string {
  if (path.split(/[\\/]/).some((part) => part.toLowerCase() === 'private'))
    throw new Error('Private folders are not supported by this command.');
  return path;
}

const opened = openReadonlyDatabase(outsidePrivate(realpathSync(outsidePrivate(resolve(file)))));
try {
  opened.sqlite.pragma('query_only = ON');
  console.log(JSON.stringify(forecastBacktest(opened.db, todayInVienna(), Number(count)), null, 2));
} finally {
  opened.close();
}
