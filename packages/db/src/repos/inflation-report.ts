import { asc, isNull } from 'drizzle-orm';
import { category, categoryGroup } from '../schema';
import { inflationBasketSettings } from './inflation-basket';
import {
  addMonths,
  cpiPriceLevels,
  coicopLabel,
  COICOP_CLASSES,
  type CoicopShare,
  implicitContractRhythm,
  inflationCategoryIncluded,
  contractBinding,
  derivePriceHistory,
  useTrailingMean,
  trailingPriceLevels,
  contractPrices,
  monthlyEquivalent,
  personalInflation,
  categoryInflationExplorer,
  toEurCents,
  versionOn,
  type ContractVersion,
  type Rhythm,
  type InflationItem,
  type PersonalInflation,
} from '@budget/domain';
import { contractSources } from './contracts-report';
import { matchedCharges } from './contract-history';
import { overviewData } from './report-ledger';
import { cpiMonths, currentCpiSeries } from './cpi';
import { fxRateOnOrBefore } from './prices';
import { reportTables } from './report-tables';
import { reportMonths, spendCategories, tableSpendByMonth } from './spending-report';
import type { Executor } from './types';

/**
 * Persönliche Inflation (2.4). The basket holds the fixed-cost categories whose price the ledger
 * knows: expected payments and recurring charges, valued monthly in EUR. Owner-selected variable
 * categories can use public CPI price relatives with household spending weights. The comparison is the
 * Statistik Austria consumer price index (VPI, open data) as far as the market run has stored it;
 * without a stored series the report shows its own index alone.
 */

export interface InflationReport extends PersonalInflation {
  explorer: ReturnType<typeof categoryInflationExplorer>;
  hasOverrides: boolean;
  basketSettings: Array<{
    id: string;
    name: string;
    groupName: string;
    groupId: string;
    class: string;
    inclusion: 'always' | 'never' | null;
    trailingMean: boolean | null;
    method: 'cpi' | null;
    coicop: CoicopShare[];
    excludedPayeeIds: Array<string | null>;
    included: boolean;
    reason: string;
    automaticReason: string;
    payees: Array<{
      id: string | null;
      name: string;
      included: boolean;
      contracts: string[];
      rhythm: Rhythm | null;
    }>;
  }>;
  /** Consumption categories (Bedarf, Wunsch) that are not in the basket. */
  excludedCategories: number;
  excluded: Array<{ id: string; name: string; reason: string }>;
  /** A reference index (VPI) is stored. */
  referenceAvailable: boolean;
  /** The stored consumer price series: its key, source, last read and newest month. */
  reference: { series: string; source: string; fetchedAt: string | null; lastMonth: string } | null;
  /**
   * Why there is no own index: fewer than 13 closed months, or no fixed contract with a price
   * version and spending in the first twelve months (`null` when the index exists).
   */
  insufficientReason: 'months' | 'basket' | 'cpi' | null;
  /** Contracts without a stored price history, priced from their matched bookings instead. */
  derivedContracts: { id: string; name: string; source: 'bookings'; prices: ContractVersion[] }[];
  /** The stored consumer price index alone: its 12-month change in the newest month, when stored. */
  referenceLatest: { month: string; changeBp: number } | null;
}

/** 12-month change of the newest stored month, basis points; `null` without the month a year before. */
function latestChange(months: Record<string, number>): InflationReport['referenceLatest'] {
  const latest = Object.keys(months).sort().at(-1);
  if (!latest) return null;
  const before = months[`${Number(latest.slice(0, 4)) - 1}${latest.slice(4)}`];
  const now = months[latest] as number;
  return before && before > 0
    ? { month: latest, changeBp: Math.round((now / before - 1) * 10_000) }
    : null;
}

export function inflationReport(db: Executor, today: string): InflationReport {
  const categories = spendCategories(db);
  const spend = tableSpendByMonth(reportTables(db, { today }), categories);
  // The index starts with the first month that has spending: an opening-balance month before it
  // holds no prices and would leave the basket empty.
  const months = reportMonths(db, today).available;
  const first = months.findIndex((m) => Object.values(spend[m] ?? {}).some((v) => v !== 0));
  const available = first < 0 ? months : months.slice(first);
  const derivedContracts: InflationReport['derivedContracts'] = [];
  const ledger = overviewData(db);
  const categoryRows = db.select().from(category).where(isNull(category.deletedAt)).all();
  const settings = new Map(categoryRows.map((c) => [c.id, c.inflationTrailingMean]));
  const groupIds = new Map(categoryRows.map((c) => [c.id, c.groupId]));
  const groupOrder = new Map(
    db
      .select()
      .from(categoryGroup)
      .orderBy(asc(categoryGroup.sortOrder), asc(categoryGroup.name))
      .all()
      .map((g, i) => [g.id, i]),
  );
  const ownerSettings = inflationBasketSettings(db);
  const eligible = (c: { id: string; class: string | null; kind?: string | null }) =>
    inflationCategoryIncluded(c, ownerSettings.get(c.id)?.inclusion);
  const countsPayee = (categoryId: string, payeeId: string | null) =>
    !ownerSettings.get(categoryId)?.excludedPayeeIds.includes(payeeId);
  const charged = new Map<
    string,
    { bookingId: string; date: string; amountCents: number; payeeId: string | null; name: string }[]
  >();
  for (const split of ledger.splits) {
    if (split.kind !== 'spend' || !split.categoryId || split.date > today) continue;
    const own = charged.get(split.categoryId) ?? [];
    const existing = own.find((r) => r.bookingId === split.bookingId);
    if (existing) existing.amountCents -= split.amountCents;
    else
      own.push({
        bookingId: split.bookingId,
        date: split.date,
        amountCents: -split.amountCents,
        payeeId: split.payeeId,
        name: split.payeeName ?? 'Ohne Empfänger',
      });
    charged.set(split.categoryId, own);
  }
  const allCharged = new Map([...charged].map(([id, rows]) => [id, [...rows]]));
  for (const [id, rows] of charged)
    charged.set(
      id,
      rows.filter((r) => countsPayee(id, r.payeeId)),
    );
  const sources = contractSources(db);
  const fixed = sources
    .filter(
      (s) =>
        s.categoryId !== null &&
        countsPayee(s.categoryId, s.payeeId ?? null) &&
        contractBinding({ ...s, categoryKind: 'fixed' }) !== null,
    )
    .map((s) => {
      const charges = matchedCharges(db, s.id, s.versions[0]?.currency ?? 'EUR').filter(
        (c) =>
          c.date <= today &&
          (charged.get(s.categoryId!) ?? []).some((r) => r.bookingId === c.bookingId),
      );
      const { versions, source } = contractPrices(s.versions, charges, s.rhythm);
      if (source === 'bookings')
        derivedContracts.push({ id: s.id, name: s.name, source, prices: [...versions] });
      const lastCharge = charges
        .filter((c) => c.amountCents < 0)
        .map((c) => c.date)
        .sort()
        .at(-1);
      // A quarterly/yearly gap is not a cancellation before its next billing period.
      const cycle = { weekly: 1, monthly: 1, quarterly: 3, semiannual: 6, yearly: 12 }[s.rhythm];
      const ended = lastCharge && addMonths(lastCharge.slice(0, 7), cycle) <= available.at(-1)!;
      return {
        ...s,
        versions,
        derived: source === 'bookings',
        charges,
        endDate: source === 'bookings' && ended ? lastCharge! : s.endDate,
      };
    });
  for (const c of categories) {
    const own = charged.get(c.id) ?? [];
    for (const payeeId of new Set(own.map((r) => r.payeeId))) {
      if (payeeId === null) continue;
      if (fixed.some((s) => s.categoryId === c.id && s.payeeId === payeeId)) continue;
      const charges = own.filter((r) => r.payeeId === payeeId);
      const rhythm = implicitContractRhythm(charges);
      if (!rhythm) continue;
      const versions = derivePriceHistory(charges, rhythm).map((v) => ({ ...v, currency: 'EUR' }));
      const lastCharge: string = charges
        .filter((r) => r.amountCents < 0)
        .map((r) => r.date)
        .sort()
        .at(-1)!;
      const id = `implicit:${c.id}:${payeeId ?? 'none'}`;
      const name = charges[0]!.name;
      derivedContracts.push({ id, name, source: 'bookings', prices: versions });
      fixed.push({
        id,
        name,
        categoryId: c.id,
        payeeId,
        categoryName: c.name,
        groupName: c.groupName ?? 'Ohne Gruppe',
        categoryKind: c.kind ?? 'fixed',
        categoryStage: null,
        class: c.class,
        rhythm,
        startDate: versions[0]?.validFrom ?? null,
        endDate:
          addMonths(
            lastCharge.slice(0, 7),
            { weekly: 1, monthly: 1, quarterly: 3, semiannual: 6, yearly: 12 }[rhythm],
          ) <= available.at(-1)!
            ? lastCharge
            : null,
        versions,
        derived: true,
        charges,
      });
    }
  }
  const cache = new Map<string, number | null>();
  const rateOn = (currency: string, day: string) => {
    const key = `${currency}|${day}`;
    if (!cache.has(key)) cache.set(key, fxRateOnOrBefore(db, currency, day)?.rateMicro ?? null);
    return cache.get(key) ?? null;
  };
  const items: InflationItem[] = [];
  const subindices = Object.fromEntries(
    COICOP_CLASSES.map((c) => [c.code, cpiMonths(db, `vpi:${c.code}`).months]),
  );
  for (const category of categories) {
    const categoryId = category.id;
    const allCharges = charged.get(categoryId) ?? [];
    const owner = ownerSettings.get(categoryId);
    if (owner?.method === 'cpi' && eligible(category)) {
      items.push({
        id: categoryId,
        categoryId,
        categoryName: category.name,
        name: category.name,
        class: category.class,
        source: 'cpi',
        coicopLabel: coicopLabel(owner.coicop),
        level: cpiPriceLevels(available, owner.coicop, subindices),
        spend: Object.fromEntries(
          available.map((m) => [
            m,
            allCharges
              .filter((r) => r.date.startsWith(m))
              .reduce((sum, r) => sum - r.amountCents, 0),
          ]),
        ),
      });
    }
    if (useTrailingMean(allCharges, settings.get(categoryId) ?? null)) {
      items.push({
        id: categoryId,
        categoryId,
        categoryName: category.name,
        name: category.name,
        class: category.class,
        source: 'trailing',
        level: trailingPriceLevels(available, allCharges),
        spend: Object.fromEntries(
          available.map((m) => [
            m,
            allCharges.filter((r) => r.date.startsWith(m)).reduce((a, r) => a - r.amountCents, 0),
          ]),
        ),
      });
      continue;
    }
    for (const p of fixed.filter((p) => p.categoryId === categoryId)) {
      const level: Record<string, number | null> = {};
      for (const month of available) {
        const day = `${month}-15`;
        const v =
          (!p.derived && p.startDate && p.startDate.slice(0, 7) > month) ||
          (p.endDate && p.endDate.slice(0, 7) < month)
            ? undefined
            : versionOn(p.versions, `${month}-31`);
        const rate = v && v.currency !== 'EUR' ? rateOn(v.currency, day) : null;
        level[month] =
          v && (v.currency === 'EUR' || rate !== null)
            ? monthlyEquivalent(
                p.rhythm,
                v.currency === 'EUR' ? v.amountCents : toEurCents(v.amountCents, rate!),
                p.intervalWeeks,
              )
            : null;
      }
      items.push({
        id: p.id,
        name: p.name,
        categoryId,
        categoryName: category.name,
        rhythm: p.rhythm,
        class: category.class,
        source: p.derived ? 'bookings' : 'stored',
        level,
        spend: Object.fromEntries(
          available.map((m) => [
            m,
            allCharges
              .filter(
                (r) => p.charges.some((c) => c.bookingId === r.bookingId) && r.date.startsWith(m),
              )
              .reduce((a, r) => a - r.amountCents, 0),
          ]),
        ),
      });
    }
  }
  const series = currentCpiSeries(db);
  const stored = series ? cpiMonths(db, series) : null;
  const explorer = categoryInflationExplorer({
    available: months,
    categories: categories.map((c) => ({
      id: c.id,
      name: c.name,
      coicop: ownerSettings.get(c.id)?.coicop ?? [],
    })),
    // Regular grocery/fuel bookings are not proof of a contract price. Keep the existing
    // headline inference, but let variable explorer categories expose their booking average.
    items: items.filter(
      (i) =>
        !(
          i.id.startsWith('implicit:') &&
          categories.find((c) => c.id === i.categoryId)?.kind === 'variable'
        ),
    ),
    reference: stored?.months ?? null,
    subindices,
    observations: Object.fromEntries(
      categories.map((c) => [
        c.id,
        months.map((month) => {
          const rows = (charged.get(c.id) ?? []).filter((r) => r.date.startsWith(month));
          return {
            month,
            cents: rows.reduce((sum, r) => sum - r.amountCents, 0),
            count: rows.filter((r) => r.amountCents < 0).length,
          };
        }),
      ]),
    ),
  });
  // Construct once, then select the headline basket using the unchanged owner rules.
  const basketItems = items.filter((i) => {
    const c = categories.find((c) => c.id === i.categoryId)!;
    return (
      eligible(c) &&
      (ownerSettings.get(c.id)?.method === 'cpi' ? i.source === 'cpi' : i.source !== 'cpi')
    );
  });
  // Never freeze a missing published CPI price or silently drop a selected category's weight.
  const cpiItems = basketItems.filter(
    (i) => i.source === 'cpi' && Object.values(i.spend).some((v) => v > 0),
  );
  const firstCommon = available.findIndex((m) => cpiItems.every((i) => (i.level[m] ?? 0) > 0));
  const common = firstCommon < 0 ? [] : available.slice(firstCommon);
  const firstGap = common.findIndex((m) => cpiItems.some((i) => (i.level[m] ?? 0) <= 0));
  const indexMonths = firstGap < 0 ? common : common.slice(0, firstGap);
  const firstPrice = Math.max(
    0,
    indexMonths.findIndex((m) => basketItems.some((i) => (i.level[m] ?? 0) > 0)),
  );
  const base = indexMonths.slice(firstPrice, firstPrice + 12);
  const baseConsumptionCents = categories
    .filter((c) => c.class !== 'future')
    .reduce((a, c) => a + base.reduce((s, m) => s + (spend[m]?.[c.id] ?? 0), 0), 0);
  const result = personalInflation({
    available: indexMonths,
    items: basketItems,
    baseConsumptionCents,
    reference: stored?.months ?? null,
  });
  const inBasket = new Set(result.contributions.map((c) => c.id));
  const basketSettings: InflationReport['basketSettings'] = categories.map((c) => {
    const setting = ownerSettings.get(c.id);
    const automaticReason =
      c.class !== 'need'
        ? 'Wunsch und Zukunft nur mit „Immer“'
        : c.kind !== 'fixed' && c.kind !== 'periodic'
          ? 'Variable Kategorie: Menge und Preis nicht trennbar'
          : 'Bedarf mit regelmäßigen Vertragspreisen oder 12-Monats-Mittel';
    const included = basketItems.some(
      (i) =>
        i.categoryId === c.id &&
        Object.values(i.level).some((v) => (v ?? 0) > 0) &&
        Object.values(i.spend).some((v) => v > 0),
    );
    const reason =
      setting?.inclusion === 'never'
        ? 'In den Einstellungen ausgeschlossen'
        : !eligible(c)
          ? automaticReason
          : !included
            ? setting?.method === 'cpi'
              ? 'Keine VPI-Teilindexwerte oder Ausgaben nach Empfänger-Auswahl'
              : 'Kein regelmäßiger Preis mit ausreichender Buchungshistorie nach Empfänger-Auswahl'
            : setting?.inclusion === 'always'
              ? 'In den Einstellungen aufgenommen'
              : automaticReason;
    const rows = allCharged.get(c.id) ?? [];
    const contracts = sources.filter((s) => s.categoryId === c.id);
    const payeeIds = new Set([
      ...rows.map((r) => r.payeeId),
      ...contracts.map((s) => s.payeeId ?? null),
    ]);
    return {
      id: c.id,
      name: c.name,
      groupName: c.groupName ?? 'Ohne Gruppe',
      groupId: groupIds.get(c.id)!,
      class: c.class,
      inclusion: setting?.inclusion ?? null,
      trailingMean: settings.get(c.id) ?? null,
      method: setting?.method ?? null,
      coicop: setting?.coicop ?? [],
      included,
      reason,
      automaticReason,
      excludedPayeeIds: setting?.excludedPayeeIds ?? [],
      payees: [...payeeIds].map((id) => ({
        id,
        name:
          rows.find((r) => r.payeeId === id)?.name ??
          contracts.find((s) => (s.payeeId ?? null) === id)?.name ??
          'Ohne Empfänger',
        included: countsPayee(c.id, id),
        contracts: contracts.filter((s) => (s.payeeId ?? null) === id).map((s) => s.name),
        rhythm:
          contracts.find((s) => (s.payeeId ?? null) === id)?.rhythm ??
          implicitContractRhythm(rows.filter((r) => r.payeeId === id)),
      })),
    };
  });
  basketSettings.sort(
    (a, b) => (groupOrder.get(a.groupId) ?? 0) - (groupOrder.get(b.groupId) ?? 0),
  );
  const excluded = basketSettings
    .filter((c) => !inBasket.has(c.id))
    .map((c) => ({ id: c.id, name: c.name, reason: c.reason }));
  return {
    ...result,
    explorer,
    basketSettings,
    hasOverrides: categories.some(
      (c) =>
        settings.get(c.id) != null ||
        ownerSettings.get(c.id)?.method === 'cpi' ||
        ownerSettings.get(c.id)?.inclusion != null ||
        (ownerSettings.get(c.id)?.excludedPayeeIds.length ?? 0) > 0,
    ),
    excludedCategories: excluded.length,
    excluded,
    referenceAvailable: stored !== null,
    derivedContracts: derivedContracts.filter((p) => basketItems.some((i) => i.id === p.id)),
    insufficientReason:
      result.status === 'ok'
        ? null
        : cpiItems.length && indexMonths.length < 13
          ? 'cpi'
          : available.length < 13
            ? 'months'
            : 'basket',
    referenceLatest: stored ? latestChange(stored.months) : null,
    reference:
      series && stored
        ? {
            series,
            source: stored.source ?? 'statistik_austria',
            fetchedAt: stored.fetchedAt,
            lastMonth: Object.keys(stored.months).sort().at(-1) as string,
          }
        : null,
  };
}
