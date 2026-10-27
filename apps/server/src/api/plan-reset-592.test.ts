import { createTestDatabase } from '@budget/db';
import { quickAssignPlan } from '@budget/domain';
import { Hono } from 'hono';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createApp, type AuthGate } from '../app';

const auth: AuthGate = { originGuard: async (_c, next) => next(),
  requireSession: async (_c, next) => next(), requireStepUp: async (_c, next) => next(), routes: new Hono() };
let opened: ReturnType<typeof createTestDatabase>;
let app: ReturnType<typeof createApp>;
beforeEach(() => {
  opened = createTestDatabase();
  app = createApp({ webDir: '.', auth, ledger: { db: opened.db, today: () => '2026-10-15' } });
});
afterEach(() => opened.close());
interface Answer {
  account: { id: string }; group: { id: string }; category: { id: string }; groupId: string; missingCents: number; changedCount: number; coveredCents: number;
  summary: { toBeAssignedCents: number; envelopes: (Parameters<typeof quickAssignPlan>[0][number] & { availableCents: number })[] };
}
async function send(method: string, path: string, body?: unknown): Promise<Answer> {
  const response = await app.request(`/api${path}`, { method,
    ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) });
  expect(response.ok, await response.clone().text()).toBe(true);
  return response.json() as Promise<Answer>;
}
it.each([
  { opening: 700, assignments: [1200, -500], selected: [0, 1], beforeTba: 0, after: [0, 0], missing: 0, delta: -700 },
  { opening: 0, assignments: [300, -500], selected: [1], beforeTba: 200, after: [300, -300], missing: 300, delta: 200 },
])('reset uses the same guarded assignment/one Undo transaction: $delta cents', async (fixture) => {
  await send('POST', '/accounts', { name: 'Synthetic cash', type: 'checking', openingDate: '2026-10-01', openingBalanceCents: fixture.opening });
  const { group } = await send('POST', '/categories/groups', { name: 'Synthetic reset' });
  const ids: string[] = [];
  for (const name of ['Synthetic positive', 'Synthetic negative']) {
    const { category } = await send('POST', '/categories', { name, groupId: group.id, kind: 'variable', class: 'need', stage: 2 });
    ids.push(category.id);
  }
  await send('PUT', '/budget/2026-10/assigned', { items: ids.map((categoryId, i) => ({ categoryId, assignedCents: fixture.assignments[i] })) });
  const read = async () => (await send('GET', '/budget/2026-10')).summary;
  expect((await read()).toBeAssignedCents).toBe(fixture.beforeTba);
  const result = await send('POST', '/budget/2026-10/quick-assign', { mode: 'reset', categoryIds: fixture.selected.map((i) => ids[i]) });
  expect(result.missingCents).toBe(fixture.missing);
  const changed = await read();
  const values = ids.map((id) => changed.envelopes.find((r) => r.categoryId === id)!.assignedCents);
  expect(values).toEqual(fixture.after);
  expect(values.reduce((sum, value, i) => sum + value - fixture.assignments[i]!, 0)).toBe(fixture.delta);
  expect(changed.toBeAssignedCents).toBe(0);
  await send('POST', '/undo', { groupId: result.groupId });
  const restored = await read();
  expect(ids.map((id) => restored.envelopes.find((r) => r.categoryId === id)!.assignedCents)).toEqual(fixture.assignments);
  expect(restored.toBeAssignedCents).toBe(fixture.beforeTba);
});

it.each([300, 900])('existing cover caps a %s-cent deficit at 700 source cents and Undo restores both', async (overspent) => {
  const { account } = await send('POST', '/accounts', { name: 'Synthetic cover cash', type: 'checking', openingDate: '2026-10-01', openingBalanceCents: 10000 });
  const { group } = await send('POST', '/categories/groups', { name: 'Synthetic cover' });
  const ids: string[] = [];
  for (const name of ['Synthetic source', 'Synthetic target', 'Synthetic reserve']) {
    const { category } = await send('POST', '/categories', { name, groupId: group.id, kind: 'variable', class: 'need', stage: 2 });
    ids.push(category.id);
  }
  await send('PUT', '/budget/2026-10/assigned', { items: [
    { categoryId: ids[0], assignedCents: 700 }, { categoryId: ids[2], assignedCents: 9300 },
  ] });
  await send('POST', '/bookings', { type: 'booking', accountId: account.id, date: '2026-10-03', categoryId: ids[1], amountCents: -overspent });
  const result = await send('POST', '/budget/2026-10/cover', { categoryId: ids[1], fromId: ids[0] });
  expect(result.coveredCents).toBe(overspent === 300 ? 300 : 700);
  const after = (await send('GET', '/budget/2026-10')).summary;
  expect(after.envelopes.find((r) => r.categoryId === ids[0])!.assignedCents).toBe(overspent === 300 ? 400 : 0);
  expect(after.envelopes.find((r) => r.categoryId === ids[1])!.assignedCents).toBe(overspent === 300 ? 300 : 700);
  expect(after.envelopes.find((r) => r.categoryId === ids[1])!.availableCents).toBe(overspent === 300 ? 0 : -200);
  expect(after.toBeAssignedCents).toBe(0);
  await send('POST', '/undo', { groupId: result.groupId });
  const restored = (await send('GET', '/budget/2026-10')).summary;
  expect(restored.envelopes.find((r) => r.categoryId === ids[0])!.assignedCents).toBe(700);
  expect(restored.envelopes.find((r) => r.categoryId === ids[1])!.assignedCents).toBe(0);
  expect(restored.envelopes.find((r) => r.categoryId === ids[1])!.availableCents).toBe(-overspent);
  expect(restored.toBeAssignedCents).toBe(0);
});

it.each([
  ['last-month', -400, 0], ['average', -400, 0], ['target', 500, 100],
  ['empty', 0, 0], ['reset', -400, 0],
] as const)('%s projected cents equal the actual API assignment change and one Undo', async (mode, delta, missing) => {
  await send('POST', '/accounts', { name: 'Synthetic money', type: 'checking', openingDate: '2026-10-01', openingBalanceCents: 900 });
  const { group } = await send('POST', '/categories/groups', { name: 'Synthetic five actions' });
  const { category } = await send('POST', '/categories', { name: 'Synthetic target', groupId: group.id, kind: 'variable', class: 'need', stage: 2 });
  await send('PUT', `/categories/${category.id}/target`, { validFrom: '2026-10', target: { kind: 'monthly', amountCents: 1000 } });
  await send('PUT', '/budget/2026-10/assigned', { items: [{ categoryId: category.id, assignedCents: 400 }] });
  const before = (await send('GET', '/budget/2026-10')).summary;
  expect(before.toBeAssignedCents).toBe(500);
  const preview = quickAssignPlan(before.envelopes.filter((r) => r.categoryId === category.id), mode, before.toBeAssignedCents);
  expect(preview.items.reduce((sum, item) => sum + item.assignedCents - 400, 0)).toBe(delta);
  expect(preview.missingCents).toBe(missing);
  const result = await send('POST', '/budget/2026-10/quick-assign', { mode, categoryIds: [category.id] });
  expect(result.missingCents).toBe(missing);
  const after = (await send('GET', '/budget/2026-10')).summary;
  expect(after.envelopes.find((r) => r.categoryId === category.id)!.assignedCents).toBe(400 + delta);
  expect(after.toBeAssignedCents).toBe(500 - delta);
  if (delta !== 0) {
    await send('POST', '/undo', { groupId: result.groupId });
    const restored = (await send('GET', '/budget/2026-10')).summary;
    expect(restored.envelopes.find((r) => r.categoryId === category.id)!.assignedCents).toBe(400);
    expect(restored.toBeAssignedCents).toBe(500);
  } else expect(result.changedCount).toBe(0);
});
