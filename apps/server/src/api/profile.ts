import { getProfile, ProfileValidationError, saveProfile, type Db } from '@budget/db';
import {
  PROFILE_HOUSEHOLD_MAX,
  PROFILE_INITIALS_MAX,
  PROFILE_NAME_MAX,
  REGIONS,
} from '@budget/domain';
import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { z } from 'zod';
import { ACTOR, ApiError, defined, readBody } from './http';

const regionCodes = REGIONS.map((r) => r.code) as [string, ...string[]];

/** All fields optional; an empty string / `null` clears a value. */
const profileBody = z.strictObject({
  name: z.string().max(PROFILE_NAME_MAX).optional(),
  initials: z
    .string()
    .max(PROFILE_INITIALS_MAX * 2)
    .optional(),
  birthDate: z.string().max(10).optional(),
  household: z.int().min(1).max(PROFILE_HOUSEHOLD_MAX).nullable().optional(),
  region: z.enum(regionCodes).nullable().optional(),
});

/** Einstellungen › Profil: owner name, initials, birth date, household and region (app_setting). */
export function profileRoutes(db: Db, today: () => string): Hono {
  const app = new Hono();
  app.get('/', (c) => c.json(getProfile(db)));
  app.patch('/', async (c) => {
    const body = await readBody(c, profileBody);
    if (Object.keys(body).length === 0)
      throw new ApiError(400, 'invalid', 'Mindestens ein Feld angeben.');
    const ctx = { actor: ACTOR, groupId: randomUUID() };
    try {
      const profile = saveProfile(db, defined(body), ctx, today());
      return c.json({ ...profile, groupId: ctx.groupId });
    } catch (e) {
      if (e instanceof ProfileValidationError)
        throw new ApiError(422, 'invalid_profile', e.message, { field: e.field });
      throw e;
    }
  });
  return app;
}
