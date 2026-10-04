import { appSetting, createEntity, getEntity, updateEntity, type Db } from '@budget/db';
import { DEFAULT_FUTURE_PREVIEW_DAYS, validFuturePreviewDays } from '@budget/domain';
import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { z } from 'zod';
import { ACTOR, readBody } from './http';

const KEY = 'display.future_preview_days';
const bodySchema = z.strictObject({ futurePreviewDays: z.int().min(0).max(365) });
export function displaySettingsRoutes(db: Db): Hono {
  const app = new Hono();
  app.get('/', (c) => {
    const stored = getEntity(db, appSetting, KEY)?.value;
    const days = stored === undefined ? DEFAULT_FUTURE_PREVIEW_DAYS : Number(stored);
    return c.json({
      futurePreviewDays: validFuturePreviewDays(days) ? days : DEFAULT_FUTURE_PREVIEW_DAYS,
    });
  });
  app.patch('/', async (c) => {
    const body = await readBody(c, bodySchema);
    const ctx = { actor: ACTOR, groupId: randomUUID() };
    const current = getEntity(db, appSetting, KEY);
    const value = String(body.futurePreviewDays);
    if (!current) createEntity(db, appSetting, { id: KEY, value }, ctx);
    else if (current.value !== value) updateEntity(db, appSetting, KEY, { value }, ctx);
    return c.json({ ...body, groupId: ctx.groupId });
  });
  return app;
}
