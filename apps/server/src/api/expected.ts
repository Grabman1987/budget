import {
  addExpectedVersion,
  createExpectedPayment,
  deleteExpectedPayment,
  linkOccurrence,
  listExpectedPayments,
  listExpectedVersions,
  markOccurrenceMissed,
  matchOccurrences,
  monthIncome,
  refreshOccurrences,
  readPaymentsPreview,
  restoreExpectedPayment,
  skipOccurrence,
  unlinkOccurrence,
  unskipOccurrence,
  updateExpectedPayment,
  upcoming,
  type Db,
  type ExpectedPaymentInput,
  type ExpectedPaymentPatch,
  type VersionInput,
} from '@budget/db';
import { monthOf } from '@budget/domain';
import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { ACTOR, ApiError, defined, readBody, readQuery } from './http';
import {
  expectedCreate,
  expectedIncomeQuery,
  expectedLinkBody,
  expectedListQuery,
  expectedOccurrencesQuery,
  expectedPatch,
  expectedSkipBody,
  expectedVersionCreate,
} from './schemas';

/** Expected payments (Erwartete Zahlungen): payments, versions, occurrences, matching. */
export function expectedRoutes(db: Db, today: () => string): Hono {
  const app = new Hono();
  const audit = () => ({ actor: ACTOR, groupId: randomUUID() });
  // The worker (P4) calls this as well; `system` marks the automatic runs in the change log.
  const system = () => ({ actor: 'system', groupId: randomUUID() });

  app.get('/', (c) => {
    const { deleted } = readQuery(c, expectedListQuery);
    return c.json({
      payments: listExpectedPayments(db, today(), { includeDeleted: deleted === '1' }),
    });
  });

  app.post('/', async (c) => {
    const { amountCents, amountMaxCents, currency, validFrom, ...fields } = await readBody(
      c,
      expectedCreate,
    );
    const version: VersionInput = defined({
      validFrom: validFrom ?? fields.startDate ?? `${monthOf(today())}-01`,
      amountCents,
      amountMaxCents,
      currency,
    });
    const result = createExpectedPayment(
      db,
      defined<ExpectedPaymentInput>(fields),
      version,
      audit(),
      today(),
    );
    return c.json(result, 201);
  });

  // Fixed paths before `/:id`.
  app.get('/year-preview', (c) => c.json(readPaymentsPreview(db, today())));
  app.get('/occurrences', (c) => {
    const { from, to, kind, includeSkipped } = readQuery(c, expectedOccurrencesQuery);
    if (to < from) throw new ApiError(400, 'invalid', '`to` must not be before `from`');
    return c.json({
      occurrences: upcoming(
        db,
        from,
        to,
        defined({ kind, includeSkipped: includeSkipped === '1' }),
      ),
    });
  });

  app.post('/occurrences/:id/link', async (c) => {
    const { bookingId } = await readBody(c, expectedLinkBody);
    return c.json(linkOccurrence(db, c.req.param('id'), bookingId, audit()));
  });
  app.post('/occurrences/:id/unlink', (c) =>
    c.json(unlinkOccurrence(db, c.req.param('id'), audit())),
  );
  app.post('/occurrences/:id/missed', (c) =>
    c.json(markOccurrenceMissed(db, c.req.param('id'), audit())),
  );
  // Bring a skipped (gestrichen) occurrence back into the plan.
  app.post('/occurrences/:id/unskip', (c) =>
    c.json(unskipOccurrence(db, c.req.param('id'), audit(), today())),
  );

  app.get('/income', (c) => c.json(monthIncome(db, readQuery(c, expectedIncomeQuery).month)));

  app.post('/refresh', (c) => {
    const ctx = system();
    const now = today();
    const refresh = refreshOccurrences(db, now, ctx);
    const match = matchOccurrences(db, now, ctx);
    return c.json({ refresh, match, groupId: ctx.groupId });
  });

  app.patch('/:id', async (c) => {
    const patch = await readBody(c, expectedPatch);
    return c.json(
      updateExpectedPayment(
        db,
        c.req.param('id'),
        defined<ExpectedPaymentPatch>(patch),
        audit(),
        today(),
      ),
    );
  });
  app.delete('/:id', (c) => c.json(deleteExpectedPayment(db, c.req.param('id'), audit(), today())));
  app.post('/:id/restore', (c) =>
    c.json(restoreExpectedPayment(db, c.req.param('id'), audit(), today())),
  );

  // Skip one occurrence in the plan without touching the rule (also one not materialised yet).
  app.post('/:id/skip', async (c) => {
    const { dueDate } = await readBody(c, expectedSkipBody);
    return c.json(skipOccurrence(db, c.req.param('id'), dueDate, audit(), today()));
  });

  app.get('/:id/versions', (c) =>
    c.json({ versions: listExpectedVersions(db, c.req.param('id')) }),
  );
  app.post('/:id/versions', async (c) => {
    const input = await readBody(c, expectedVersionCreate);
    const result = addExpectedVersion(
      db,
      c.req.param('id'),
      defined<VersionInput>(input),
      audit(),
      today(),
    );
    return c.json(result, 201);
  });

  return app;
}
