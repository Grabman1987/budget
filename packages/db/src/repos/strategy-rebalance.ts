import { createHash } from 'node:crypto';
import { asc, like, sql } from 'drizzle-orm';
import { STRATEGY_CATEGORIES, todayInVienna, type StrategyCategory } from '@budget/domain';
import { z } from 'zod';
import { account, appSetting, auditLog, trade } from '../schema';
import { exposuresAsOf } from './asset-exposure';
import { assertTradeSettlementInvariants } from './invariants';
import { type AuditContext, withGroup } from './audit';
import { createEntity, getEntity, updateEntity } from './entities';
import { BookingInvariantError, ConflictError } from './errors';
import { portfolioStrategyView, type PortfolioStrategyView, type StrategyEvidence } from './portfolio-strategy';
import { runInTransaction, type Executor } from './types';

const PREFIX = 'portfolio_rebalance.';
const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const tokenSchema = z.uuid();
const revisionSchema = z.string().regex(/^[a-f0-9]{64}$/);
const categorySchema = z.enum(STRATEGY_CATEGORIES);
const actionSchema = z.enum(['create', 'link', 'unlink', 'close', 'reopen']);
const stateSchema = z.enum(['reviewing', 'partial', 'completed', 'cancelled', 'partial_closed']);
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const eventKey = (month: string) => `${PREFIX}${month}`;
const money = z.int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER);
const proposalSchema = z.strictObject({
  asOf: z.iso.datetime(), effectiveDate: z.iso.date(),
  trigger: z.enum(['regime_changed', 'quarter_end']),
  decisionFingerprint: revisionSchema, decisionRevision: revisionSchema,
  configurationRevision: revisionSchema, valuationRevision: revisionSchema,
  classes: z.strictObject({ global: z.string().min(1), gold: z.string().min(1), nasdaq2x: z.string().min(1), eurBonds: z.string().min(1) }),
  accountIds: z.array(z.string().min(1)).max(500), securityIds: z.array(z.string().min(1)).max(2000),
  totalCents: money.nonnegative(), cashCents: money,
  rows: z.array(z.strictObject({ category: categorySchema, currentCents: money,
    targetCents: money, buyCents: money.nonnegative(), sellCents: money.nonnegative() })).length(4),
});
const tradeFactsSchema = z.strictObject({
  id: z.string().min(1), accountId: z.string().min(1), securityId: z.string().min(1),
  date: z.iso.date(), kind: z.enum(['buy', 'sell']), unitsE8: money,
  amountCents: money.nonnegative(), feeCents: money.nonnegative(), taxCents: money.nonnegative(),
  bookingId: z.string().nullable(), currency: z.string().min(3).max(3), auditRevision: revisionSchema,
});
const linkSchema = z.strictObject({ category: categorySchema, trade: tradeFactsSchema });
const requestSchema = z.strictObject({ id: tokenSchema, action: actionSchema, intent: revisionSchema, groupId: tokenSchema });
const eventSchema = z.strictObject({ version: z.literal(1), month: monthSchema,
  proposal: proposalSchema, state: stateSchema,
  links: z.array(linkSchema).max(500), requests: z.array(requestSchema).max(1000),
});
type Event = z.infer<typeof eventSchema>;
type Action = z.infer<typeof actionSchema>;
type TradeFacts = z.infer<typeof tradeFactsSchema>;

function parseEvent(value: string, month: string): Event {
  const event = eventSchema.parse(JSON.parse(value));
  if (event.month !== month || event.proposal.effectiveDate.slice(0, 7) !== month ||
    new Set(event.links.map((link) => link.trade.id)).size !== event.links.length ||
    new Set(event.requests.map((request) => request.id)).size !== event.requests.length ||
    new Set(event.proposal.rows.map((row) => row.category)).size !== STRATEGY_CATEGORIES.length)
    throw new RangeError('Inconsistent retained strategy rebalance event');
  return event;
}
function auditCount(db: Executor, entityType: string, id: string): number {
  return db.get<{ n: number }>(sql`SELECT COUNT(*) AS n FROM audit_log WHERE entity_type=${entityType} AND entity_id=${id}`)!.n;
}
function revision(db: Executor, month: string): string {
  const id = eventKey(month);
  return hash({ value: getEntity(db, appSetting, id)?.value ?? null, events: auditCount(db, 'app_setting', id) });
}
function decisionAuditRevision(db: Executor, month: string): string {
  const id = `portfolio_trend_decision.${month}`;
  return hash({ value: getEntity(db, appSetting, id)?.value ?? null, events: auditCount(db, 'app_setting', id) });
}
function tradeAuditRevision(db: Executor, id: string): string {
  return hash({ id, events: auditCount(db, 'trade', id) });
}
function tradeFacts(db: Executor, id: string): TradeFacts | null {
  const row = getEntity(db, trade, id);
  const owner = row && getEntity(db, account, row.accountId, { includeDeleted: true });
  if (!row || !owner || (row.kind !== 'buy' && row.kind !== 'sell')) return null;
  try { assertTradeSettlementInvariants(db, row.bookingId ? [row.bookingId] : [], [id]); }
  catch (error) {
    if (error instanceof BookingInvariantError) return null;
    throw error;
  }
  return { id, accountId: row.accountId, securityId: row.securityId, date: row.date,
    kind: row.kind, unitsE8: row.unitsE8, amountCents: row.amountCents,
    feeCents: row.feeCents, taxCents: row.taxCents, bookingId: row.bookingId,
    currency: owner.currency,
    auditRevision: tradeAuditRevision(db, id) };
}
/** Server-reviewed economic facts; the token fences edits and Undo/redo before first attribution. */
export function strategyRebalanceTradeFacts(db: Executor, id: string) {
  return runInTransaction(db, (tx) => {
    const facts = tradeFacts(tx, id);
    if (!facts) throw new ConflictError('Der Handel fehlt oder seine Buchung ist nicht mehr konsistent.');
    const owner = getEntity(tx, account, facts.accountId, { includeDeleted: true });
    return { trade: facts, accountName: owner?.name ?? facts.accountId, revision: hash(facts) };
  });
}
function eventIds(db: Executor): string[] {
  const historical = db.all<{ id: string }>(sql`SELECT DISTINCT entity_id AS id FROM audit_log
    WHERE entity_type='app_setting' AND entity_id LIKE ${`${PREFIX}%`} LIMIT 501`);
  const live = db.select({ id: appSetting.id }).from(appSetting).where(like(appSetting.id, `${PREFIX}%`)).all();
  const ids = [...new Set([...historical.map((row) => row.id), ...live.map((row) => row.id)])].sort();
  if (ids.length > 500 || ids.some((id) => !/^portfolio_rebalance\.\d{4}-(0[1-9]|1[0-2])$/.test(id)))
    throw new RangeError('Strategy rebalance history is too large or inconsistent');
  return ids;
}
function liveEvents(db: Executor): Map<string, Event> {
  const events = new Map<string, Event>();
  for (const id of eventIds(db)) {
    const row = getEntity(db, appSetting, id);
    if (row) events.set(id.slice(PREFIX.length), parseEvent(row.value, id.slice(PREFIX.length)));
  }
  return events;
}
function linkOwners(events: Map<string, Event>): Map<string, string[]> {
  const owners = new Map<string, string[]>();
  for (const [month, event] of events) for (const link of event.links)
    owners.set(link.trade.id, [...(owners.get(link.trade.id) ?? []), month]);
  return owners;
}
function conflicts(db: Executor, event: Event, owners: Map<string, string[]>): string[] {
  const reasons: string[] = [];
  for (const link of event.links) {
    if ((owners.get(link.trade.id)?.length ?? 0) !== 1) reasons.push(`duplicate:${link.trade.id}`);
    const live = tradeFacts(db, link.trade.id);
    if (!live || hash(live) !== hash(link.trade)) reasons.push(`trade_changed:${link.trade.id}`);
  }
  return reasons;
}
function sourceRevision(view: PortfolioStrategyView, decisionRevision: string): string {
  return hash({ config: view.config, configurationRevision: view.revision,
    decisionRevision, binding: view.binding?.fingerprint,
    universe: view.metadata.universe,
    exposures: view.metadata.securities.map((row) => ({ id: row.id, exposure: row.exposure })),
    valuation: view.valuation, rebalance: view.rebalance });
}
function proposalFromView(db: Executor, view: PortfolioStrategyView) {
  if (!view.binding || !view.config || !view.rebalance?.due || !view.rebalance.trigger)
    throw new ConflictError('Ein vollständiger aktueller Rebalancing-Vorschlag fehlt. Bitte neu laden.');
  const month = view.binding.month;
  return proposalSchema.parse({ asOf: view.asOf, effectiveDate: view.rebalance.effectiveDate,
    trigger: view.rebalance.trigger, decisionFingerprint: view.binding.fingerprint,
    decisionRevision: decisionAuditRevision(db, month), configurationRevision: view.revision,
    valuationRevision: sourceRevision(view, decisionAuditRevision(db, month)),
    classes: view.config.classes, accountIds: view.metadata.universe.accountIds,
    securityIds: view.metadata.universe.securityIds,
    totalCents: view.rebalance.totalCents, cashCents: view.rebalance.cashCents,
    rows: view.rebalance.rows });
}

/** Read-only event projection. Historical actuals remain visible when the current proposal is unavailable. */
export function strategyRebalanceLifecycle(db: Executor, view: PortfolioStrategyView) {
  const events = liveEvents(db), owners = linkOwners(events);
  const rows = eventIds(db).map((id) => {
    const month = id.slice(PREFIX.length), event = events.get(month);
    if (!event) return { month, revision: revision(db, month), status: 'withdrawn' as const,
      state: null, proposal: null, links: [], conflicts: [], proposalCurrent: false };
    const problems = conflicts(db, event, owners);
    const current = view.binding?.month === month && view.rebalance?.due &&
      sourceRevision(view, decisionAuditRevision(db, month)) === event.proposal.valuationRevision;
    return { month, revision: revision(db, month), status: problems.length ? 'needs_reconciliation' as const : event.state,
      state: event.state, proposal: event.proposal, links: event.links, conflicts: problems,
      proposalCurrent: !!current };
  });
  const dueMonth = view.binding && view.rebalance?.due ? view.binding.month : null;
  return { events: rows, candidate: dueMonth ? { month: dueMonth, revision: revision(db, dueMonth),
    decisionRevision: decisionAuditRevision(db, dueMonth),
    proposalRevision: sourceRevision(view, decisionAuditRevision(db, dueMonth)),
    previouslyReviewed: eventIds(db).includes(eventKey(dueMonth)) } : null };
}
export function portfolioStrategyWithRebalanceView(db: Executor, asOf: string, evidence: StrategyEvidence) {
  return runInTransaction(db, (tx) => {
    const view = portfolioStrategyView(tx, asOf, evidence);
    return { ...view, rebalanceLifecycle: strategyRebalanceLifecycle(tx, view) };
  });
}
export type PortfolioStrategyWithRebalanceView = ReturnType<typeof portfolioStrategyWithRebalanceView>;

function priorRequest(db: Executor, month: string, requestId: string) {
  const rows = db.select({ after: auditLog.afterJson }).from(auditLog)
    .where(sql`${auditLog.entityType}='app_setting' AND ${auditLog.entityId}=${eventKey(month)}`)
    .orderBy(asc(sql`rowid`)).limit(1001).all();
  if (rows.length > 1000) throw new RangeError('Strategy rebalance request history is too large');
  for (const row of rows) {
    if (!row.after) continue;
    const snapshot = JSON.parse(row.after) as { value?: unknown };
    if (typeof snapshot.value !== 'string') continue;
    const event = parseEvent(snapshot.value, month);
    const request = event.requests.find((entry) => entry.id === requestId);
    if (request) return request;
  }
  return null;
}
function begin(db: Executor, month: string, expectedRevision: string,
  requestId: string, action: Action, details: unknown, event: Event | null) {
  const intent = hash({ month, action, details }), prior = priorRequest(db, month, requestId);
  if (prior) {
    if (prior.intent !== intent || prior.action !== action)
      throw new ConflictError('Diese Anfragekennung wurde mit anderen Angaben verwendet.');
    const live = event?.requests.find((entry) => entry.id === requestId);
    if (!live) throw new ConflictError('Diese Anfrage wurde bereits zurückgenommen. Bitte neu prüfen.');
    return { duplicate: true as const, groupId: live.groupId, intent };
  }
  if (revision(db, month) !== expectedRevision)
    throw new ConflictError('Das Rebalancing-Ereignis wurde inzwischen geändert. Bitte neu laden.');
  return { duplicate: false as const, groupId: null, intent };
}
function write(db: Executor, event: Event, action: Action, requestId: string,
  intent: string, ctx: AuditContext, existed: boolean) {
  const grouped = withGroup(ctx);
  const next = eventSchema.parse({ ...event,
    requests: [...event.requests, { id: requestId, action, intent, groupId: grouped.groupId }] });
  const id = eventKey(event.month), value = JSON.stringify(next);
  if (existed) updateEntity(db, appSetting, id, { value }, grouped);
  else createEntity(db, appSetting, { id, value }, grouped);
  return { groupId: grouped.groupId, changedCount: 1, revision: revision(db, event.month) };
}

/** Explicitly freeze the current advisory proposal. GET never creates an event. */
export function reviewStrategyRebalance(db: Executor, input: { month: string; revision: string;
  decisionRevision: string; proposalRevision: string; requestId: string }, asOf: string, ctx: AuditContext) {
  return runInTransaction(db, (tx) => {
    const month = monthSchema.parse(input.month), stored = getEntity(tx, appSetting, eventKey(month));
    const existing = stored ? parseEvent(stored.value, month) : null;
    const started = begin(tx, month, input.revision, input.requestId, 'create', { month }, existing);
    if (started.duplicate) return { groupId: started.groupId!, changedCount: 0, revision: revision(tx, month) };
    if (existing) throw new ConflictError('Dieses Monatsereignis wurde bereits geprüft.');
    const view = portfolioStrategyView(tx, asOf);
    if (view.binding?.month !== month || decisionAuditRevision(tx, month) !== input.decisionRevision)
      throw new ConflictError('Die verbindliche Monatsentscheidung hat sich geändert. Bitte neu laden.');
    if (sourceRevision(view, decisionAuditRevision(tx, month)) !== input.proposalRevision)
      throw new ConflictError('Die angezeigten Rebalancing-Beträge oder ihre Quellen haben sich geändert. Bitte neu prüfen.');
    const proposal = proposalFromView(tx, view);
    const event = eventSchema.parse({ version: 1, month, proposal, state: 'reviewing', links: [], requests: [] });
    return write(tx, event, 'create', input.requestId, started.intent, ctx, false);
  });
}

/** Attribution only: actual buy/sell and cash booking were already recorded by the ordinary trade writer. */
export function linkStrategyRebalanceTrade(db: Executor, input: { month: string; revision: string;
  requestId: string; tradeId: string; tradeRevision: string; category: StrategyCategory }, asOf: string, ctx: AuditContext) {
  return runInTransaction(db, (tx) => {
    const month = monthSchema.parse(input.month), stored = getEntity(tx, appSetting, eventKey(month));
    const event = stored ? parseEvent(stored.value, month) : null;
    const started = begin(tx, month, input.revision, input.requestId, 'link',
      { tradeId: input.tradeId, category: input.category }, event);
    if (started.duplicate) return { groupId: started.groupId!, changedCount: 0, revision: revision(tx, month) };
    if (!event || event.state === 'cancelled' || event.state === 'completed' || event.state === 'partial_closed')
      throw new ConflictError('Dieses Rebalancing ist nicht für weitere Zuordnungen offen.');
    const facts = tradeFacts(tx, input.tradeId), accountRow = facts && getEntity(tx, account, facts.accountId);
    if (!facts || hash(facts) !== input.tradeRevision)
      throw new ConflictError('Der geprüfte Handel hat sich geändert. Bitte die tatsächlichen Angaben neu prüfen.');
    if (!facts || !accountRow || accountRow.role !== 'investment' ||
      getEntity(tx, trade, input.tradeId)?.savingsPlanId ||
      !event.proposal.accountIds.includes(facts.accountId) || !event.proposal.securityIds.includes(facts.securityId) ||
      facts.date < event.proposal.effectiveDate ||
      facts.date > todayInVienna(new Date(asOf)))
      throw new ConflictError('Der Handel ist nicht als ausgeführter Bestandteil dieses Portfolios belegbar.');
    const exposure = exposuresAsOf(tx, facts.date).get(facts.securityId);
    const classId = event.proposal.classes[input.category];
    if (!exposure?.complete || exposure.weights.length !== 1 ||
      exposure.weights[0]?.assetClassId !== classId || exposure.weights[0]?.weightBp !== 10000)
      throw new ConflictError('Für dieses Produkt fehlt eine eindeutige historische Strategiekategorie.');
    const events = liveEvents(tx), owners = linkOwners(events);
    if ((owners.get(facts.id)?.length ?? 0) > 0 || conflicts(tx, event, owners).length)
      throw new ConflictError('Der Handel ist bereits zugeordnet oder das Ereignis muss zuerst abgeglichen werden.');
    const next = eventSchema.parse({ ...event, state: 'partial',
      links: [...event.links, { category: input.category, trade: facts }] });
    return write(tx, next, 'link', input.requestId, started.intent, ctx, true);
  });
}

/** Resolve an attribution conflict without deleting or editing the actual trade. */
export function unlinkStrategyRebalanceTrade(db: Executor, input: { month: string; revision: string;
  requestId: string; tradeId: string }, ctx: AuditContext) {
  return runInTransaction(db, (tx) => {
    const month = monthSchema.parse(input.month), stored = getEntity(tx, appSetting, eventKey(month));
    const event = stored ? parseEvent(stored.value, month) : null;
    const started = begin(tx, month, input.revision, input.requestId, 'unlink', { tradeId: input.tradeId }, event);
    if (started.duplicate) return { groupId: started.groupId!, changedCount: 0, revision: revision(tx, month) };
    if (!event?.links.some((link) => link.trade.id === input.tradeId))
      throw new ConflictError('Diese Zuordnung besteht nicht mehr.');
    const links = event.links.filter((link) => link.trade.id !== input.tradeId);
    const next = eventSchema.parse({ ...event, links, state: links.length ? 'partial' : 'reviewing' });
    return write(tx, next, 'unlink', input.requestId, started.intent, ctx, true);
  });
}

export function closeStrategyRebalance(db: Executor, input: { month: string; revision: string;
  requestId: string; outcome: 'completed' | 'cancelled' | 'partial_closed' | 'reopen' }, ctx: AuditContext) {
  return runInTransaction(db, (tx) => {
    const month = monthSchema.parse(input.month), stored = getEntity(tx, appSetting, eventKey(month));
    const event = stored ? parseEvent(stored.value, month) : null;
    const action = input.outcome === 'reopen' ? 'reopen' : 'close';
    const started = begin(tx, month, input.revision, input.requestId, action, { outcome: input.outcome }, event);
    if (started.duplicate) return { groupId: started.groupId!, changedCount: 0, revision: revision(tx, month) };
    if (!event) throw new ConflictError('Das Rebalancing-Ereignis fehlt.');
    const owners = linkOwners(liveEvents(tx));
    if (conflicts(tx, event, owners).length)
      throw new ConflictError('Zuerst widersprüchliche Handelszuordnungen abgleichen.');
    if (input.outcome === 'reopen') {
      if (event.state === 'reviewing' || event.state === 'partial')
        throw new ConflictError('Das Rebalancing ist bereits offen.');
    } else if ((input.outcome === 'cancelled' && event.links.length > 0) ||
      (input.outcome !== 'cancelled' && event.links.length === 0) ||
      event.state === 'completed' || event.state === 'cancelled' || event.state === 'partial_closed')
      throw new ConflictError('Dieser Abschluss passt nicht zu den geprüften Ausführungen.');
    const state = input.outcome === 'reopen' ? event.links.length ? 'partial' : 'reviewing' : input.outcome;
    return write(tx, eventSchema.parse({ ...event, state }), action, input.requestId, started.intent, ctx, true);
  });
}
