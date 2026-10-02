import { explorerReport, periodComparisonReport, yearReportRead, type Db } from '@budget/db';
import {
  COMPARE_MODES,
  EXPLORER_CLASSES,
  EXPLORER_COLS,
  EXPLORER_DIMS,
  EXPLORER_MEASURES,
  EXPLORER_PERIODS,
  overviewRefMonth,
  type CompareMode,
  type ExplorerQuery,
} from '@budget/domain';
import { Hono } from 'hono';
import { z } from 'zod';
import { readQuery } from './http';

const ids = <T extends ReadonlyArray<{ id: string }>>(list: T) =>
  list.map((x) => x.id) as [T[number]['id'], ...T[number]['id'][]];

const yearQuery = z.object({ year: z.coerce.number().int().min(1990).max(2100).optional() });
const compareQuery = z.object({ mode: z.enum(ids(COMPARE_MODES)).default('vj') });
const explorerQuery = z.object({
  dim: z.enum(ids(EXPLORER_DIMS)),
  cls: z.enum(ids(EXPLORER_CLASSES)),
  cols: z.enum(ids(EXPLORER_COLS)),
  period: z.enum(EXPLORER_PERIODS),
  meas: z.enum(ids(EXPLORER_MEASURES)),
});

/**
 * Überblick reports (`/api/overview`): `year` (5.1 Jahresreport), `compare` (5.5 Zeitraumvergleich)
 * and `explorer` (5.3 pivot). All read the same classified splits (`overviewData`) and only the
 * full months before today.
 */
export function overviewReportRoutes(db: Db, today: () => string): Hono {
  const app = new Hono();

  app.get('/year', (c) => {
    const { year } = readQuery(c, yearQuery);
    const day = today();
    return c.json(yearReportRead(db, year ?? Number(overviewRefMonth(day).slice(0, 4)), day));
  });

  app.get('/compare', (c) => {
    const { mode } = readQuery(c, compareQuery);
    return c.json(periodComparisonReport(db, mode as CompareMode, today()));
  });

  app.get('/explorer', (c) => {
    const query = readQuery(c, explorerQuery) as ExplorerQuery;
    return c.json(explorerReport(db, query, today()));
  });

  return app;
}
