import { createHash } from 'node:crypto';
import { and, asc, desc, eq, isNull, like, lte, sql } from 'drizzle-orm';
import {
  calculateStrategyTrend, type StrategyTrendInput, type StrategyTrendResult,
} from '@budget/domain';
import {
  STRATEGY_CATEGORIES, STRATEGY_TARGETS, nextStrategyContribution, strategyConfigurationSchema,
  strategyContribution, strategyMonthlySignal, strategyMonthSchedule, strategyRebalance,
  type StrategyConfiguration, type StrategyMonthCalendar, type StrategyPosition, type StrategyRoute,
} from '@budget/domain';
import { pickPrice, pickTradePrice, todayInVienna, ratioBp, type PriceChoice } from '@budget/domain';
import { z } from 'zod';
import { account, appSetting, assetClass, price, trade } from '../schema';
import { allocationInputsAsOf, allocationUniverse } from './allocation-inputs';
import { exposuresAsOf } from './asset-exposure';
import { type AuditContext, withGroup } from './audit';
import { createEntity, getEntity, updateEntity } from './entities';
import { ConflictError } from './errors';
import { fxRateOnOrBefore } from './prices';
import { runInTransaction, type Executor } from './types';
import { currentValuationSources } from './portfolio';

const CONFIG = 'portfolio_trend_strategy.v1';
const DECISION = 'portfolio_trend_decision.';
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const policyKey = (config: StrategyConfiguration) => hash({ version: 1, classes: config.classes, targets: STRATEGY_TARGETS });
const sum = (values: readonly number[]) => {
  const result = values.reduce((total, value) => {
    if (!Number.isSafeInteger(value)) throw new RangeError('Unsafe strategy valuation');
    return total + BigInt(value);
  }, 0n);
  if (result > BigInt(Number.MAX_SAFE_INTEGER) || result < BigInt(Number.MIN_SAFE_INTEGER))
    throw new RangeError('Strategy valuation exceeds safe integer range');
  return Number(result);
};
function configurationRevision(db: Executor, value: string | null): string {
  const events = db.get<{ count: number }>(sql`SELECT COUNT(*) AS count FROM audit_log WHERE entity_type='app_setting' AND entity_id=${CONFIG}`)!.count;
  return hash({ value, events });
}
function decisionRevision(db: Executor, month: string): string {
  const id = `${DECISION}${month}`;
  const value = getEntity(db, appSetting, id)?.value ?? null;
  const events = decisionAuditCount(db, month);
  return hash({ value, events });
}
function decisionAuditCount(db: Executor, month: string): number {
  const id = `${DECISION}${month}`;
  return db.get<{ count: number }>(sql`SELECT COUNT(*) AS count FROM audit_log WHERE entity_type='app_setting' AND entity_id=${id}`)!.count;
}
export function strategyConfiguration(db: Executor) {
  const value = getEntity(db, appSetting, CONFIG)?.value ?? null;
  return { config: value === null ? null : strategyConfigurationSchema.parse(JSON.parse(value)),
    revision: configurationRevision(db, value) };
}
function assertConfiguration(db: Executor, config: StrategyConfiguration, today: string) {
  const classes = db.select().from(assetClass).where(and(isNull(assetClass.deletedAt), eq(assetClass.isGroup, false))).all();
  if (Object.values(config.classes).some((id) => !classes.some((row) => row.id === id)))
    throw new RangeError('Bitte vier vorhandene aktive Anlageklassen auswählen.');
  const instruments = allocationUniverse(db).securities;
  const exposures = exposuresAsOf(db, today);
  for (const route of config.routes) {
    const instrument = instruments.find((row) => row.id === route.securityId), exposure = exposures.get(route.securityId);
    const weights = exposure?.weights.filter((weight) => weight.weightBp > 0) ?? [];
    if (!instrument || !exposure?.complete || weights.length !== 1 ||
      weights[0]!.assetClassId !== config.classes[route.category] || weights[0]!.weightBp !== 10000)
      throw new RangeError('Kaufprodukte brauchen eine vollständige bestehende Zuordnung zur gewählten Anlageklasse.');
    if (instrument.leverageFactor !== (route.category === 'nasdaq2x' ? 20 : 10) ||
      (route.category === 'nasdaq2x' && !route.daily2xNasdaqConfirmed))
      throw new RangeError('Das Nasdaq-Produkt muss ausdrücklich täglich 2× abbilden; die übrigen Kaufprodukte müssen ungehebelt sein.');
  }
}
/** Settings only. No target, savings schedule, price, trade or booking is changed. */
export function saveStrategyConfiguration(db: Executor, input: {
  config: StrategyConfiguration; revision: string;
}, today: string, ctx: AuditContext) {
  return runInTransaction(db, (tx) => {
    const current = strategyConfiguration(tx), config = strategyConfigurationSchema.parse(input.config);
    if (current.revision !== input.revision) throw new ConflictError('Die Strategieeinstellungen haben sich geändert. Bitte neu laden.');
    if (config.enabled) assertConfiguration(tx, config, today);
    const value = JSON.stringify(config), grouped = withGroup(ctx);
    if (getEntity(tx, appSetting, CONFIG)?.value === value)
      return { ...current, groupId: grouped.groupId, changedCount: 0 };
    if (current.config) updateEntity(tx, appSetting, CONFIG, { value }, grouped);
    else createEntity(tx, appSetting, { id: CONFIG, value }, grouped);
    return { ...strategyConfiguration(tx), groupId: grouped.groupId, changedCount: 1 };
  });
}

/** Evidence is accepted from a server-verified provider adapter only, never an HTTP request body. */
export type StrategyEvidence = { status: 'unavailable'; reason: string } | {
  status: 'verified'; verifiedIndex: 'nasdaq-100-usd-price-index';
  input: StrategyTrendInput;
  months: readonly StrategyMonthCalendar[];
  executionCalendar?: Parameters<typeof nextStrategyContribution>[1];
};
export const MISSING_STRATEGY_EVIDENCE: StrategyEvidence = { status: 'unavailable', reason: 'trusted_provider_unconfigured' };
const decisionSchema = z.strictObject({
  version: z.literal(1), month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  trend: z.enum(['strong', 'mixed', 'weak']), signalDate: z.iso.date(), effectiveDate: z.iso.date(),
  knownAt: z.iso.datetime(), calendarSourceId: z.string().min(1), calendarId: z.string().min(1), sourceId: z.string().min(1),
  indexId: z.string().min(1), policyKey: z.string().regex(/^[a-f0-9]{64}$/),
  latestCloseUnits: z.int().positive(), unitsPerPoint: z.int().positive(),
  currentSum: z.string().regex(/^\d+$/), pastSum: z.string().regex(/^\d+$/),
  sessions: z.array(z.strictObject({ date: z.iso.date(), completedAt: z.iso.datetime() })).length(220),
  closes: z.array(z.strictObject({ sessionDate: z.iso.date(), closedAt: z.iso.datetime(), observedAt: z.iso.datetime(),
    sourceId: z.string().min(1), indexId: z.string().min(1), closeUnits: z.int().positive() })).length(220),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
});
export type StrategyDecision = z.infer<typeof decisionSchema>;
function decisionFingerprint(decision: Omit<StrategyDecision, 'knownAt' | 'sessions' | 'closes' | 'fingerprint'>) {
  // Fixed key order keeps the persisted facts independent of a JSON object's input order.
  return hash({ version: decision.version, month: decision.month, trend: decision.trend,
    signalDate: decision.signalDate, effectiveDate: decision.effectiveDate,
    calendarSourceId: decision.calendarSourceId, calendarId: decision.calendarId,
    sourceId: decision.sourceId, indexId: decision.indexId, policyKey: decision.policyKey,
    latestCloseUnits: decision.latestCloseUnits, unitsPerPoint: decision.unitsPerPoint,
    currentSum: decision.currentSum, pastSum: decision.pastSum });
}
export function strategyDecisions(db: Executor, asOf: string) {
  return db.select().from(appSetting).where(like(appSetting.id, `${DECISION}%`)).orderBy(asc(appSetting.id)).all()
    .map((row) => {
      const decision = decisionSchema.parse(JSON.parse(row.value));
      if (row.id !== `${DECISION}${decision.month}` || decision.signalDate.slice(0, 7) !== decision.month ||
        decision.effectiveDate.slice(0, 7) !== decision.month || decision.signalDate >= decision.effectiveDate ||
        decision.fingerprint !== decisionFingerprint(decision))
        throw new RangeError('Inconsistent retained strategy decision');
      const replay = calculateStrategyTrend({ asOf: decision.knownAt, latestCompletedSession: decision.signalDate,
        calendar: { id: decision.calendarId, verifiedComplete: true, sessions: decision.sessions },
        source: { sourceId: decision.sourceId, indexId: decision.indexId, kind: 'price-index', currency: 'USD', leverage: 1, unitsPerPoint: decision.unitsPerPoint },
        closes: decision.closes });
      if (replay.status !== 'available' || replay.trend !== decision.trend || replay.latestClose.closeUnits !== decision.latestCloseUnits ||
        replay.currentSma.sumCloseUnits.toString() !== decision.currentSum || replay.pastSma.sumCloseUnits.toString() !== decision.pastSum)
        throw new RangeError('Retained strategy signal does not reproduce');
      return decision;
    }).filter((decision) => decision.knownAt <= asOf);
}
function assertEvidence(evidence: Extract<StrategyEvidence, { status: 'verified' }>, asOf: string) {
  if (evidence.verifiedIndex !== 'nasdaq-100-usd-price-index' || evidence.input.asOf !== asOf)
    throw new RangeError('Strategy evidence has an incompatible index or as-of boundary');
}
/** Append-only explicit internal decision ceremony; GET previews never call this writer. */
export function recordStrategyMonthlyDecision(db: Executor, evidence: Extract<StrategyEvidence, { status: 'verified' }>,
  month: string, asOf: string, revision: string, expectedDecisionRevision: string, ctx: AuditContext,
) {
  assertEvidence(evidence, asOf);
  const calendar = evidence.months.find((entry) => entry.month === month);
  if (!calendar) throw new RangeError('A verified complete US month calendar is missing');
  const monthly = strategyMonthlySignal(evidence.input, calendar);
  if (monthly.signal.status !== 'available' || asOf.slice(0, 10) < monthly.signalDate || asOf.slice(0, 10) > monthly.effectiveDate)
    throw new RangeError('The binding decision cannot be established in this evidence window');
  const signal = monthly.signal;
  return runInTransaction(db, (tx) => {
    const settings = strategyConfiguration(tx), config = settings.config;
    if (settings.revision !== revision) throw new ConflictError('Die Strategieeinstellungen haben sich geändert. Bitte neu laden.');
    if (!config?.enabled) throw new ConflictError('Die Strategie ist nicht ausdrücklich aktiviert.');
    assertConfiguration(tx, config, asOf.slice(0, 10));
    const facts = { version: 1 as const, month, trend: signal.trend, signalDate: monthly.signalDate,
      effectiveDate: monthly.effectiveDate, calendarSourceId: monthly.sourceId, calendarId: monthly.calendarId, sourceId: signal.source.sourceId,
      indexId: signal.source.indexId, policyKey: policyKey(config), latestCloseUnits: signal.latestClose.closeUnits,
      unitsPerPoint: signal.source.unitsPerPoint, currentSum: signal.currentSma.sumCloseUnits.toString(),
      pastSum: signal.pastSma.sumCloseUnits.toString() };
    const fingerprint = decisionFingerprint(facts), id = `${DECISION}${month}`, stored = getEntity(tx, appSetting, id), grouped = withGroup(ctx);
    if (stored) {
      const existing = decisionSchema.parse(JSON.parse(stored.value));
      if (existing.fingerprint !== fingerprint) throw new ConflictError('Die verbindliche Monatsentscheidung besteht bereits und wird nicht überschrieben.');
      return { decision: existing, groupId: grouped.groupId, changedCount: 0 };
    }
    if (decisionRevision(tx, month) !== expectedDecisionRevision)
      throw new ConflictError('Die Monatsentscheidung wurde inzwischen geändert oder zurückgenommen. Bitte neu laden.');
    const sessions = evidence.input.calendar.sessions.filter((session) => session.date <= monthly.signalDate).slice(-220);
    const closes = sessions.map((session) => evidence.input.closes.find((close) => close.sessionDate === session.date)!);
    const decision = decisionSchema.parse({ ...facts, fingerprint, knownAt: asOf, sessions, closes });
    createEntity(tx, appSetting, { id, value: JSON.stringify(decision) }, grouped);
    return { decision, groupId: grouped.groupId, changedCount: 1 };
  });
}
/** One-shot automatic path: an undone month remains permanently ineligible for automatic recreation. */
export function recordAutomaticStrategyMonthlyDecision(db: Executor,
  evidence: Extract<StrategyEvidence, { status: 'verified' }>, month: string, asOf: string,
  ctx: AuditContext,
) {
  return runInTransaction(db, (tx) => {
    const id = `${DECISION}${month}`;
    // Both gates share the writer transaction. An Undo deletes the setting but retains its audit history.
    if (getEntity(tx, appSetting, id) || decisionAuditCount(tx, month) !== 0)
      return { status: 'already_seen' as const };
    const settings = strategyConfiguration(tx);
    if (!settings.config?.enabled) return { status: 'disabled' as const };
    const result = recordStrategyMonthlyDecision(tx, evidence, month, asOf, settings.revision,
      decisionRevision(tx, month), ctx);
    return { status: 'recorded' as const, ...result };
  });
}
function jsonSignal(signal: StrategyTrendResult) {
  return signal.status === 'unavailable' ? signal : { ...signal,
    currentSma: { ...signal.currentSma, sumCloseUnits: signal.currentSma.sumCloseUnits.toString() },
    pastSma: { ...signal.pastSma, sumCloseUnits: signal.pastSma.sumCloseUnits.toString() } };
}
function routeQuote(db: Executor, id: string, asOf: string): StrategyRoute['quote'] {
  const row = db.select().from(price).where(and(eq(price.securityId, id), lte(price.date, asOf))).orderBy(desc(price.date)).limit(1).get();
  let choice: PriceChoice | undefined = row ? pickPrice([row], asOf, false) : undefined;
  if (!choice) {
    const trades = db.select({ date: trade.date, kind: trade.kind, unitsE8: trade.unitsE8,
      amountCents: trade.amountCents, feeCents: trade.feeCents, taxCents: trade.taxCents, currency: account.currency }).from(trade)
      .innerJoin(account, eq(account.id, trade.accountId))
      .where(and(eq(trade.securityId, id), isNull(trade.deletedAt), lte(trade.date, asOf)))
      .orderBy(asc(trade.date), asc(trade.createdAt), asc(trade.id)).all();
    choice = pickTradePrice(trades, asOf);
  }
  if (!choice || choice.quality !== 'exact' || choice.price.date > asOf) return null;
  const fxRateMicro = choice.price.currency === 'EUR' ? 1000000 : fxRateOnOrBefore(db, choice.price.currency, asOf)?.rateMicro;
  return fxRateMicro ? { choice, fxRateMicro } : null;
}

export function portfolioStrategyView(db: Executor, asOf: string, evidence: StrategyEvidence = MISSING_STRATEGY_EVIDENCE) {
  return runInTransaction(db, (tx) => {
    if (new Date(asOf).toISOString() !== asOf) throw new RangeError('Invalid strategy as-of timestamp');
    const today = todayInVienna(new Date(asOf)), settings = strategyConfiguration(tx), config = settings.config;
    const input = allocationInputsAsOf(tx, today), universe = allocationUniverse(tx), exposures = exposuresAsOf(tx, today);
    const classes = tx.select({ id: assetClass.id, name: assetClass.name }).from(assetClass)
      .where(and(isNull(assetClass.deletedAt), eq(assetClass.isGroup, false))).all();
    const securities = universe.securities.map((row) => ({ id: row.id, name: row.name, leverageFactor: row.leverageFactor,
      exposure: exposures.get(row.id) ?? null }));
    const diagnostics: string[] = [];
    const positions: StrategyPosition[] = [], cash: number[] = [];
    for (const position of input.positions) {
      const acct = universe.accounts.find((row) => row.id === position.accountId);
      if (position.id === `cash:${position.accountId}` && position.securityId === position.id && acct &&
        ['checking', 'cash', 'savings', 'brokerage', 'crypto'].includes(acct.type)) { cash.push(position.valueCents); continue; }
      const category = config && STRATEGY_CATEGORIES.find((key) => config.classes[key] === position.assetClass);
      if (!category || !position.securityId || position.valueCents < 0 || !exposures.get(position.securityId)?.complete) { diagnostics.push(`unmapped:${position.id}`); continue; }
      const security = universe.securities.find((row) => row.id === position.securityId);
      if (!security || security.leverageFactor !== (category === 'nasdaq2x' ? 20 : 10)) diagnostics.push(`incompatible:${position.id}`);
      positions.push({ category, securityId: position.securityId, valueCents: position.valueCents });
    }
    if (input.valueCents !== null && input.valueCents < 0) diagnostics.push('negative_portfolio');
    if (input.quality.valuationQuality !== 'exact') diagnostics.push('valuation_incomplete_or_provisional');
    if (!config) diagnostics.push('configuration_missing');
    else {
      try { assertConfiguration(tx, config, today); } catch (error) {
        if (!(error instanceof RangeError)) throw error;
        diagnostics.push('configuration_no_longer_matches_exposure');
      }
      if (!config.enabled) diagnostics.push('strategy_disabled');
      if (config.contributionCents === null) diagnostics.push('contribution_missing');
    }
    const decisions = strategyDecisions(tx, asOf);
    const valid = config ? decisions.filter((decision) => decision.policyKey === policyKey(config) && decision.effectiveDate <= today) : [];
    const binding = valid.at(-1) ?? null;
    if (!binding) diagnostics.push('binding_decision_unavailable');
    if (evidence.status === 'verified') assertEvidence(evidence, asOf);
    const signal = evidence.status === 'verified' ? jsonSignal(calculateStrategyTrend(evidence.input)) : evidence;
    const calendars = evidence.status === 'verified' ? evidence.months.map(strategyMonthSchedule) : [];
    const nextDecision = calendars.filter((calendar) => calendar.effectiveDate > today ||
      (calendar.effectiveDate === today && !valid.some((decision) => decision.month === calendar.month))).sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate))[0] ?? null;
    const monthCalendar = evidence.status === 'verified' ? evidence.months.find((entry) => entry.month === today.slice(0, 7)) : undefined;
    const candidate = evidence.status === 'verified' && monthCalendar ? strategyMonthlySignal(evidence.input, monthCalendar) : null;
    const monthlyCandidate = candidate ? { ...candidate, decisionRevision: decisionRevision(tx, monthCalendar!.month), signal: jsonSignal(candidate.signal),
      canRecord: candidate.signal.status === 'available' && today >= candidate.signalDate && today <= candidate.effectiveDate } : null;
    const next = nextStrategyContribution(today, evidence.status === 'verified' ? evidence.executionCalendar : undefined);
    const provisional = next.provisional || !nextDecision || nextDecision.effectiveDate <= (next.executionDate ?? next.nominalDate);
    const cashCents = input.unavailable.some((row) => !row.securityId) ? null : sum(cash);
    if (cashCents === null) diagnostics.push('cash_unavailable');
    const classifiedComplete = !!config && input.quality.valuationQuality === 'exact' &&
      !diagnostics.some((reason) => reason.startsWith('unmapped:') || reason.startsWith('incompatible:'));
    const categoryValues = STRATEGY_CATEGORIES.map((category) => {
      const heldIds = new Set(positions.filter((position) => position.category === category).map((position) => position.securityId));
      for (const missing of input.unavailable) if (missing.securityId &&
        exposures.get(missing.securityId)?.weights.some((weight) => weight.weightBp > 0 && weight.assetClassId === config?.classes[category]))
        heldIds.add(missing.securityId);
      const holdings = [...heldIds].map((securityId) => ({ securityId,
        valueCents: classifiedComplete ? sum(positions.filter((position) => position.category === category && position.securityId === securityId).map((position) => position.valueCents)) : null }));
      const valueCents = classifiedComplete ? sum(holdings.map((holding) => holding.valueCents!)) : null;
      return { category, valueCents, holdings, weightBp: valueCents !== null && input.valueCents !== null && input.valueCents > 0
        ? ratioBp(valueCents, input.valueCents) : null };
    });
    const valuationSources = currentValuationSources(tx, today).sources.filter((source) => input.universe.accountIds.includes(source.accountId)
      && (source.securityId === null || input.universe.securityIds.includes(source.securityId)));
    if (classifiedComplete && cashCents !== null && input.valueCents !== null &&
      sum([...positions.map((position) => position.valueCents), cashCents]) !== input.valueCents)
      diagnostics.push('scope_value_mismatch');
    const contribution = config && binding && cashCents !== null && diagnostics.length === 0 ? strategyContribution({ trend: binding.trend, positions,
      cashCents, contributionCents: config.contributionCents!, includeFreeCash: config.includeFreeCash,
      routes: config.routes.map((route) => ({ ...route, quote: routeQuote(tx, route.securityId, today) })) }) : null;
    const previous = valid.at(-2);
    const rebalance = binding && config?.enabled && cashCents !== null && classifiedComplete && input.valueCents !== null && input.valueCents >= 0 && !diagnostics.includes('scope_value_mismatch') ? strategyRebalance({ current: binding.trend,
      previous: previous?.trend ?? null, effectiveDate: binding.effectiveDate, positions, cashCents }) : null;
    return { asOf, today, ...settings, metadata: { classes, securities, universe: input.universe },
      valuation: { valueCents: input.valueCents, cashCents, classificationComplete: classifiedComplete, categoryValues, sources: valuationSources, quality: input.quality, unavailable: input.unavailable, positions },
      binding, dailyPreview: signal, monthlyCandidate, nextDecision, nextContribution: { ...next, provisional },
      diagnostics, contribution, rebalance, decisions: decisions.slice(-12),
      provider: evidence.status === 'verified' ? { source: evidence.input.source, calendarId: evidence.input.calendar.id } : null };
  });
}
export type PortfolioStrategyView = ReturnType<typeof portfolioStrategyView>;
