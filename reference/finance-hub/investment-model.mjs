import {resolveBrokerHoldings,applyBrokerSummaryRows} from './broker-holdings.mjs';
/**
 * Securities valuation, deliberately NOT a personal performance / total-return model.
 *
 * All valueEURcents / cost / gain / valueChange.amount values are EUR cents.
 * Prices and periodChange.amount are in the security's original currency.
 * periodChange.percent and valueChange.percent are percentage points (10 = 10%).
 * valueChange includes purchases, sales and deliveries; it is NOT an investment return.
 * Missing quotes, FX, or uncertain quantities produce null, never an invented zero.
 * knownValueEURcents is a partial subtotal and must be labelled as such by the UI.
 *
 * investmentOverview(data, {asOf, range, portfolioId, from, to}) ->
 * {asOf, from, range, portfolioId, series, active, closed, watchlist, coverage, valueChange}.
 * series points: {date, valueEURcents, knownValueEURcents, complete, missingSecurityIds}.
 * Summary rows: {securityId, security, id, name, ticker, isin, currency, status, shares,
 * positions, valueEURcents, knownValueEURcents, cost, gain, costKnown, price, priceDate,
 * ageDays, periodChange, quoteSeries, warnings}. Positions have portfolioId/name,
 * portfolioName, shares, valueEURcents, cost, gain, costKnown, quantityKnown.
 * coverage: {activeSecurities, valuedSecurities, missingQuoteSecurityIds,
 * missingFxSecurityIds, uncertainQuantitySecurityIds, oldestQuoteDate, latestQuoteDate,
 * valueEURcents, knownValueEURcents, complete, issues}.
 *
 * securityDetail(data, securityId, options) -> summary plus {asOf, from, range,
 * portfolioId, valueSeries, trades, dividends, dividendsPortfolioAttribution}.
 * Trades/dividends include ALL history through asOf, newest first, independent of range.
 * Cash rows do not contain portfolioId, so dividends are for the whole security and
 * explicitly marked 'all-security'; they must not be presented as filtered-depot income.
 * quoteSeries: [{date, price, sourceDate, carried}]; boundaries carry the latest
 * available earlier quote. No future quote is backfilled. Daily valueSeries includes
 * weekends using the latest actually available quote. YTD starts on prior 31 December.
 *
 * Cost is the remaining moving-average acquisition amount recorded in EUR. Inbound
 * transfers have unknown basis because the source format lacks transfer linkage;
 * their cost/gain remain null until the position is closed. Gain is unrealised only.
 * Optional trade.dateTime preserves PP's ISO date/time (minute precision is valid).
 * Same-day incoming/outgoing groups for one security/depot require valid dateTime on
 * every trade. Otherwise their remaining cost is unknown: an arbitrary array order
 * must not create a seemingly known cost by closing and reopening within that day.
 * A known zero quantity at that day's end permits a fresh basis on a later day.
 * There is no fabricated FX, realised profit, TTWROR, IRR, or dividend-adjusted return.
 */

const SCALE = 100_000_000;
const SIGNS = {BUY: 1, DELIVERY_INBOUND: 1, TRANSFER_IN: 1, SELL: -1, DELIVERY_OUTBOUND: -1, TRANSFER_OUT: -1};
const RANGES = new Set(['1M', '3M', '6M', 'YTD', '1Y', '3Y', 'ALL', 'CUSTOM']);
const byDate = (a, b) => a.date.localeCompare(b.date) || ((a._time ?? Infinity) - (b._time ?? Infinity)) || (a._order ?? 0) - (b._order ?? 0);
const isoToday = () => new Intl.DateTimeFormat('en-CA', {timeZone: 'Europe/Vienna'}).format(new Date());
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + 'T12:00:00Z')) && new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) === value;
const addDay = date => new Date(Date.parse(date + 'T12:00:00Z') + 864e5).toISOString().slice(0, 10);
const age = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
const number = value => (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')) && Number.isFinite(Number(value)) ? Number(value) : null;
const cents = value => Number.isFinite(value) && Number.isSafeInteger(Math.round(value)) ? Math.round(value) : null;
const sum = values => values.reduce((total, value) => total + value, 0);

function tradeTimestamp(trade) {
  // PP exports local ISO times. Interpret offset-free values consistently, independent
  // of the computer's timezone; explicit ISO offsets still sort by the actual instant.
  const value = trade.dateTime;
  if (typeof value !== 'string' || value.slice(0, 10) !== trade.date || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,9})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)?$/.test(value)) return null;
  const timestamp = Date.parse(/(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : value + 'Z');
  return Number.isFinite(timestamp) ? timestamp : null;
}

function flagAmbiguousOrder(trades) {
  const groups = new Map();
  for (const trade of trades) {
    const key = JSON.stringify([trade.date, trade.portfolioId, trade.securityId]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(trade);
  }
  for (const group of groups.values()) {
    if (!group.some(t => SIGNS[t.type] === 1 && number(t.shares) > 0) || !group.some(t => SIGNS[t.type] === -1 && number(t.shares) > 0) || group.every(t => t._time !== null)) continue;
    for (const trade of group) trade._ambiguousOrder = true;
    group[0]._reportAmbiguity = true;
    group.at(-1)._lastOfDayGroup = true;
  }
}

function subtractMonths(date, months) {
  const d = new Date(date + 'T12:00:00Z'), day = d.getUTCDate();
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - months);
  d.setUTCDate(Math.min(day, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()));
  return d.toISOString().slice(0, 10);
}

export function investmentPeriod(options = {}) {
  const range = options.range ?? '1Y', asOf = range === 'CUSTOM' ? options.to : options.asOf ?? isoToday();
  if (!validDate(asOf)) throw new TypeError(range === 'CUSTOM' ? 'to must be an ISO calendar date' : 'asOf must be an ISO calendar date');
  if (!RANGES.has(range)) throw new TypeError('Unsupported investment range');
  if (range === 'CUSTOM') {
    if (asOf > isoToday()) throw new RangeError('Investment range cannot end in the future');
    if (!validDate(options.from)) throw new TypeError('from must be an ISO calendar date');
    if (options.from > asOf) throw new RangeError('Investment range start must be on or before end');
    return {asOf, range, from: options.from, portfolioId: options.portfolioId || ''};
  }
  return {asOf, range, portfolioId: options.portfolioId || ''};
}

const optionsFor = investmentPeriod;

function quotesFor(security, asOf) {
  const unique = new Map();
  for (const quote of security.quotes || []) {
    if (!Array.isArray(quote)) continue;
    const [date, rawPrice] = quote, price = number(rawPrice);
    if (validDate(date) && date <= asOf && price !== null && price >= 0) unique.set(date, price);
  }
  return [...unique].sort(([a], [b]) => a.localeCompare(b)).map(([date, price]) => ({date, price}));
}

function quoteAt(quotes, date) {
  let low = 0, high = quotes.length - 1, found = null;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (quotes[mid].date <= date) {found = quotes[mid]; low = mid + 1;} else high = mid - 1;
  }
  return found;
}

function chartQuotes(quotes, from, asOf) {
  const result = [], start = quoteAt(quotes, from), end = quoteAt(quotes, asOf);
  if (start) result.push({date: from, price: start.price, sourceDate: start.date, carried: start.date !== from});
  for (const quote of quotes) if (quote.date > from && quote.date <= asOf) result.push({...quote, sourceDate: quote.date, carried: false});
  if (end && result.at(-1)?.date !== asOf) result.push({date: asOf, price: end.price, sourceDate: end.date, carried: end.date !== asOf});
  return result;
}

function change(start, end) {
  if (start === null || end === null) return {amount: null, percent: null};
  return {amount: end - start, percent: start > 0 ? (end / start - 1) * 100 : null};
}

function prepare(data, options, onlySecurityId) {
  const securityMap = new Map((data.securities || []).map(s => [s.id, {...s}]));
  const portfolios = new Map((data.portfolios || []).map(p => [p.id, p]));
  const allTrades = (data.trades || []).map((trade, order) => ({...trade, _order: order, _time: tradeTimestamp(trade)})).filter(t => validDate(t.date) && t.date <= options.asOf);
  const tradedGlobally = new Set(allTrades.map(t => t.securityId));
  const selected = allTrades.filter(t => (!options.portfolioId || t.portfolioId === options.portfolioId) && (!onlySecurityId || t.securityId === onlySecurityId)).sort(byDate);
  flagAmbiguousOrder(selected);
  for (const trade of selected) if (!securityMap.has(trade.securityId)) securityMap.set(trade.securityId, {id: trade.securityId, name: 'Unbekanntes Wertpapier', currency: null, quotes: []});
  const selectedIds = new Set(selected.map(t => t.securityId));
  const securities = [...securityMap.values()].filter(s => onlySecurityId ? s.id === onlySecurityId : !options.portfolioId || selectedIds.has(s.id) || !tradedGlobally.has(s.id));
  const quotes = new Map(securities.map(s => [s.id, quotesFor(s, options.asOf)]));
  let from;
  if (options.range === 'ALL') from = selected[0]?.date || [...quotes.values()].flatMap(q => q.length ? [q[0].date] : []).sort()[0] || options.asOf;
  else if (options.range === 'YTD') from = `${Number(options.asOf.slice(0, 4)) - 1}-12-31`;
  else if (options.range === 'CUSTOM') from = options.from;
  else from = subtractMonths(options.asOf, {'1M': 1, '3M': 3, '6M': 6, '1Y': 12, '3Y': 36}[options.range]);
  return {securities, portfolios, selected, quotes, from};
}

function applyTrade(positions, trade, issues) {
  const key = JSON.stringify([trade.portfolioId, trade.securityId]);
  const position = positions.get(key) || {portfolioId: trade.portfolioId, securityId: trade.securityId, units: 0, cost: 0, costKnown: true, quantityKnown: true};
  if (trade._ambiguousOrder) position.costKnown = false;
  if (trade._reportAmbiguity) issues.push({tradeId: trade.id, securityId: trade.securityId, portfolioId: trade.portfolioId, date: trade.date, code: 'ambiguous-trade-order'});
  const quantity = number(trade.shares), units = quantity === null ? null : Math.round(quantity * SCALE);
  if (!Object.hasOwn(SIGNS, trade.type) || units === null || units < 0 || !Number.isSafeInteger(units)) {
    position.quantityKnown = false; position.costKnown = false;
    issues.push({tradeId: trade.id, securityId: trade.securityId, date: trade.date, code: 'unsupported-or-invalid-trade'});
    positions.set(key, position); return;
  }
  if (units === 0) {positions.set(key, position); return;}
  const priorUnits = position.units, nextUnits = priorUnits + units * SIGNS[trade.type];
  if (!Number.isSafeInteger(nextUnits)) {
    position.quantityKnown = false; position.costKnown = false;
    issues.push({tradeId: trade.id, securityId: trade.securityId, date: trade.date, code: 'quantity-out-of-range'});
    positions.set(key, position); return;
  }
  if (SIGNS[trade.type] > 0) {
    if (priorUnits === 0 && position.quantityKnown && !trade._ambiguousOrder) {position.cost = 0; position.costKnown = true;}
    const amount = number(trade.amount);
    const knownAddition = trade.currency === 'EUR' && Number.isSafeInteger(amount) && amount >= 0 && trade.type !== 'TRANSFER_IN' && !(trade.type === 'DELIVERY_INBOUND' && amount === 0);
    if (priorUnits < 0 || !knownAddition) position.costKnown = false;
    if (knownAddition) position.cost += amount;
  } else {
    if (priorUnits > 0 && nextUnits >= 0) position.cost *= nextUnits / priorUnits;
    else position.costKnown = false;
  }
  position.units = nextUnits;
  if (nextUnits === 0 && position.quantityKnown) {position.cost = 0; position.costKnown = !trade._ambiguousOrder || !!trade._lastOfDayGroup;}
  positions.set(key, position);
}

function valuation(position, security, quote) {
  if (!position.quantityKnown) return null;
  if (position.units === 0) return 0;
  if (!quote || security?.currency !== 'EUR') return null;
  return cents(position.units / SCALE * quote.price * 100);
}

/** Advance trades and quote cursors once; do not recalculate trade history per day. */
function timeline(prepared, asOf) {
  const positions = new Map(), issues = [], series = [], quoteCursors = new Map(), currentQuotes = new Map();
  const securities = new Map(prepared.securities.map(s => [s.id, s]));
  let tradeCursor = 0;
  for (let date = prepared.from; date <= asOf; date = addDay(date)) {
    while (tradeCursor < prepared.selected.length && prepared.selected[tradeCursor].date <= date) applyTrade(positions, prepared.selected[tradeCursor++], issues);
    for (const [id, quotes] of prepared.quotes) {
      let cursor = quoteCursors.get(id) ?? 0;
      while (cursor < quotes.length && quotes[cursor].date <= date) currentQuotes.set(id, quotes[cursor++]);
      quoteCursors.set(id, cursor);
    }
    let knownValueEURcents = 0;
    const missing = new Set();
    for (const position of positions.values()) {
      const value = valuation(position, securities.get(position.securityId), currentQuotes.get(position.securityId));
      if (value === null) missing.add(position.securityId); else knownValueEURcents += value;
    }
    const complete = missing.size === 0;
    series.push({date, valueEURcents: complete ? knownValueEURcents : null, knownValueEURcents, complete, missingSecurityIds: [...missing].sort()});
  }
  return {positions, issues, series};
}

function summaryFor(security, prepared, history, options) {
  const quotes = prepared.quotes.get(security.id) || [], quote = quoteAt(quotes, options.asOf), startQuote = quoteAt(quotes, prepared.from);
  const states = [...history.positions.values()].filter(p => p.securityId === security.id);
  const positions = states.filter(p => p.units !== 0 || !p.quantityKnown).map(p => {
    const valueEURcents = valuation(p, security, quote), cost = p.costKnown && p.quantityKnown ? cents(p.cost) : null;
    const portfolioName = prepared.portfolios.get(p.portfolioId)?.name || 'Unbekanntes Depot';
    return {portfolioId: p.portfolioId, name: portfolioName, portfolioName, shares: p.units / SCALE, valueEURcents, cost, gain: valueEURcents !== null && cost !== null ? valueEURcents - cost : null, costKnown: cost !== null, quantityKnown: p.quantityKnown};
  }).sort((a, b) => a.portfolioName.localeCompare(b.portfolioName));
  const hasTrade = prepared.selected.some(t => t.securityId === security.id);
  const status = positions.length ? 'active' : hasTrade ? 'closed' : 'watchlist';
  const complete = positions.every(p => p.valueEURcents !== null), costKnown = positions.every(p => p.costKnown);
  const knownValueEURcents = sum(positions.map(p => p.valueEURcents ?? 0)), valueEURcents = complete ? knownValueEURcents : null, cost = costKnown ? sum(positions.map(p => p.cost)) : null;
  const warnings = [];
  if (positions.length && !quote) warnings.push('missing-quote');
  if (positions.length && security.currency !== 'EUR') warnings.push('missing-fx');
  if (positions.some(p => !p.quantityKnown)) warnings.push('uncertain-quantity');
  if (positions.some(p => p.shares < 0)) warnings.push('negative-position');
  if (!costKnown) warnings.push('unknown-cost-basis');
  if (!costKnown && history.issues.some(issue => issue.securityId === security.id && issue.code === 'ambiguous-trade-order')) warnings.push('ambiguous-trade-order');
  return {
    securityId: security.id, security, id: security.id, name: security.name, ticker: security.ticker ?? null, isin: security.isin ?? null, currency: security.currency ?? null,
    status, shares: sum(positions.map(p => p.shares)), positions, valueEURcents, knownValueEURcents, cost, gain: valueEURcents !== null && cost !== null ? valueEURcents - cost : null, costKnown,
    price: quote?.price ?? null, priceDate: quote?.date ?? null, ageDays: quote ? age(quote.date, options.asOf) : null,
    periodChange: {...change(startQuote?.price ?? null, quote?.price ?? null), fromDate: startQuote?.date ?? null, toDate: quote?.date ?? null},
    quoteSeries: chartQuotes(quotes, prepared.from, options.asOf), warnings,
  };
}

export function investmentOverview(data, inputOptions = {}) {
  const options = optionsFor(inputOptions), prepared = prepare(data, options), history = timeline(prepared, options.asOf);
  const brokerResult=resolveBrokerHoldings(data,inputOptions.brokerHoldingsSnapshots,options.asOf);
  const rows = applyBrokerSummaryRows(prepared.securities.map(s => summaryFor(s, prepared, history, options)),brokerResult,options.portfolioId);
  const historyReconciliationOpen=rows.some(s=>s.currentSource);
  const active = rows.filter(s => s.status === 'active').sort((a, b) => (b.valueEURcents ?? -Infinity) - (a.valueEURcents ?? -Infinity) || a.name.localeCompare(b.name));
  const closed = rows.filter(s => s.status === 'closed').sort((a, b) => a.name.localeCompare(b.name));
  const watchlist = rows.filter(s => s.status === 'watchlist').sort((a, b) => a.name.localeCompare(b.name));
  const endpoint = history.series.at(-1), dates = active.map(s => s.priceDate).filter(Boolean).sort();
  const coverage = {
    activeSecurities: active.length, valuedSecurities: active.filter(s => s.valueEURcents !== null).length,
    missingQuoteSecurityIds: active.filter(s => s.warnings.includes('missing-quote')).map(s => s.id),
    missingFxSecurityIds: active.filter(s => s.warnings.includes('missing-fx')).map(s => s.id),
    uncertainQuantitySecurityIds: active.filter(s => s.warnings.includes('uncertain-quantity')).map(s => s.id),
    oldestQuoteDate: dates[0] ?? null, latestQuoteDate: dates.at(-1) ?? null,
    valueEURcents: endpoint.valueEURcents, knownValueEURcents: endpoint.knownValueEURcents, complete: endpoint.complete&&!historyReconciliationOpen, issues: history.issues,
  };
  const currentValuation={valueEURcents:active.every(s=>s.valueEURcents!==null)?sum(active.map(s=>s.valueEURcents)):null,knownValueEURcents:sum(active.map(s=>s.knownValueEURcents)),asOf:options.asOf};
  return {...options, from: prepared.from, series: history.series, active, closed, watchlist, coverage,currentValuation,historyReconciliationOpen,brokerSnapshotStatus:{applied:brokerResult.snapshot?'cryptoPlatform':null,issues:brokerResult.issues,sourceAsOf:brokerResult.snapshot?.asOf||brokerResult.sourceAsOf}, valueChange: {...(historyReconciliationOpen?{amount:null,percent:null}:change(history.series[0].valueEURcents, endpoint.valueEURcents)), fromDate: prepared.from, toDate: options.asOf, includesCashFlows: true, isReturn: false}};
}

export function securityDetail(data, securityId, inputOptions = {}) {
  const options = optionsFor(inputOptions), prepared = prepare(data, options, securityId), security = prepared.securities.find(s => s.id === securityId);
  if (!security) return null;
  const history = timeline(prepared, options.asOf), brokerResult=resolveBrokerHoldings(data,inputOptions.brokerHoldingsSnapshots,options.asOf);
  const summary = applyBrokerSummaryRows([summaryFor(security, prepared, history, options)],brokerResult,options.portfolioId)[0];
  const withoutInternalOrder = ({_order, _time, _ambiguousOrder, _reportAmbiguity, _lastOfDayGroup, ...row}) => row;
  const trades = [...prepared.selected].sort((a, b) => -byDate(a, b)).map(withoutInternalOrder);
  const dividends = (data.cashTransactions || []).filter(t => t.securityId === securityId && t.type === 'DIVIDENDS' && validDate(t.date) && t.date <= options.asOf).map(t => ({...t})).sort((a, b) => b.date.localeCompare(a.date));
  return {...summary, ...options, from: prepared.from, valueSeries: history.series, trades, dividends, dividendsPortfolioAttribution: 'all-security'};
}
