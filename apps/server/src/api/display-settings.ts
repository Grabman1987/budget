import {
  accountReminderDays,
  appSetting,
  createEntity,
  getEntity,
  updateEntity,
  type Db,
} from '@budget/db';
import {
  ACCOUNT_REMINDER_SETTING,
  DEFAULT_FUTURE_PREVIEW_DAYS,
  validFuturePreviewDays,
} from '@budget/domain';
import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { z } from 'zod';
import { ACTOR, readBody } from './http';

const KEY = 'display.future_preview_days';
const bodySchema = z
  .strictObject({
    futurePreviewDays: z.int().min(0).max(365).optional(),
    accountReminderDays: z.int().min(1).max(365).optional(),
  })
  .refine((body) => Object.keys(body).length > 0);
export function displaySettingsRoutes(db: Db): Hono {
  const app = new Hono();
  app.get('/', (c) => {
    const stored = getEntity(db, appSetting, KEY)?.value;
    const days = stored === undefined ? DEFAULT_FUTURE_PREVIEW_DAYS : Number(stored);
    return c.json({
      accountReminderDays: accountReminderDays(db),
      futurePreviewDays: validFuturePreviewDays(days) ? days : DEFAULT_FUTURE_PREVIEW_DAYS,
    });
  });
  app.patch('/', async (c) => {
    const body = await readBody(c, bodySchema);
    const ctx = { actor: ACTOR, groupId: randomUUID() };
    db.transaction((tx) => {
      for (const [key, days] of [
        [KEY, body.futurePreviewDays],
        [ACCOUNT_REMINDER_SETTING, body.accountReminderDays],
      ] as const) {
        if (days === undefined) continue;
        const current = getEntity(tx, appSetting, key);
        const value = String(days);
        if (!current) createEntity(tx, appSetting, { id: key, value }, ctx);
        else if (current.value !== value) updateEntity(tx, appSetting, key, { value }, ctx);
      }
    });
    return c.json({ ...body, groupId: ctx.groupId });
  });
  return app;
}
