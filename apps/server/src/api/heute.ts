import { currentValuationSources, heute, heuteSection, planningAccuracyReport, readMonthCloseReminders, type Db } from '@budget/db';
import { Hono } from 'hono';
import { z } from 'zod';
import { readQuery } from './http';
import { month } from './schemas';

const heuteQuery = z.object({
  period: z.enum(['month', 'payday']).default('month'),
  month: month.optional(),
});

/**
 * Heute and R07 share a period-bound balance forecast with fourteen days of actual history.
 * Pace/envelopes follow `month`; lead, net worth and next steps always refer to today.
 */
export function heuteRoutes(db: Db, today: () => string): Hono {
  const app = new Hono();
  // Section routes inherit the same session guard, request memo and read-cache policy.
  app.get('/sections/:section', (c) => {
    const section = z.enum(['overview', 'pace', 'wealth', 'tasks', 'upcoming', 'bookings', 'pinned', 'accuracy'])
      .parse(c.req.param('section'));
    const { period, month: shown } = readQuery(c, heuteQuery);
    const day = today();
    const query = { today: day, period, ...(shown && { month: shown }) };
    if (section === 'accuracy') return c.json(db.transaction((tx) => ({
      stand: { today: day, month: shown ?? day.slice(0, 7) },
      summary: planningAccuracyReport(tx, shown ?? day.slice(0, 7), day).summary,
    })));
    return c.json(db.transaction((tx) => {
      if (section === 'wealth') {
        const data = heuteSection(tx, query, section);
        return { ...data, valuationSources: currentValuationSources(tx, day).sources };
      }
      if (section === 'tasks') {
        const data = heuteSection(tx, query, section);
        return { ...data, attention: { ...data.attention,
          quoteReview: currentValuationSources(tx, day).quoteReview,
          monthCloseTasks: readMonthCloseReminders(tx, day),
        } };
      }
      return heuteSection(tx, query, section);
    }));
  });
  // Keep the existing aggregate contract for detail pages and other consumers.
  app.get('/', (c) => {
    const { period, month: shown } = readQuery(c, heuteQuery);
    const day = today();
    const data = heute(db, { today: day, period, ...(shown && { month: shown }) });
    const provenance = currentValuationSources(db, day);
    return c.json({
      ...data,
      valuationSources: provenance.sources,
      attention: { ...data.attention, quoteReview: provenance.quoteReview, monthCloseTasks: readMonthCloseReminders(db, day) },
      planningAccuracy: planningAccuracyReport(db, data.pace.month, day).summary,
    });
  });
  return app;
}
