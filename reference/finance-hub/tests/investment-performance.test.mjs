import test from 'node:test';
import assert from 'node:assert/strict';
import {
  continuousValueSeries,
  dailyValuations,
  performancePeriod,
  performanceSummary,
  periodTimeWeightedReturn,
  timeWeightedReturn,
  tradingDaysBetween,
} from '../investment-performance.mjs';
import {investmentOverview} from '../investment-model.mjs';

const ASOF = '2026-09-11';
const day = (from, offset) => new Date(Date.parse(from + 'T12:00Z') + offset * 864e5).toISOString().slice(0, 10);
const series = (from, count) => Array.from({length: count}, (_, index) => day(from, index));
const DAYS = series('2026-09-01', 11);

/** One security, one depot, one purchase on the first day; quotes are given per day. */
function book({prices = DAYS.map(date => [date, '100']), trades, cashTransactions = []} = {}) {
  return {
    securities: [{id: 's', name: 'Testwertpapier', currency: 'EUR', isin: 'IE00B4L5Y983', quotes: prices}],
    portfolios: [{id: 'p', name: 'Testdepot'}],
    trades: trades ?? [{id: 't1', portfolioId: 'p', securityId: 's', date: '2026-09-01', type: 'BUY', shares: '1', amount: 10000, currency: 'EUR'}],
    cashTransactions,
  };
}
const valuationsFor = (data, options = {}) => dailyValuations(data, {range: 'ALL', asOf: ASOF, securityId: 's', ...options});
const german = value => typeof value === 'string' && value.length > 5 && /[a-zäöüß]/.test(value);

test('gehaltene Position mit unveränderten Kursen ergibt 0 % TTWROR', () => {
  const valuations = valuationsFor(book());
  assert.equal(valuations.points.length, 11);
  assert.equal(valuations.quality, 'verified');
  assert.equal(valuations.points[0].valueEURcents, 10000);
  assert.equal(valuations.days.valued, 11);
  const result = periodTimeWeightedReturn(valuations);
  assert.equal(result.status, 'complete');
  assert.equal(Math.round(result.percent * 1e6) / 1e6, 0);
});

test('10 % Kursanstieg ohne Geldflüsse ergibt 10 % TTWROR', () => {
  const prices = DAYS.map((date, index) => [date, index === DAYS.length - 1 ? '110' : '100']);
  const result = periodTimeWeightedReturn(valuationsFor(book({prices})));
  assert.ok(Math.abs(result.percent - 10) < 1e-9, `erwartet 10 %, erhalten ${result.percent}`);
});

test('Einzahlung verändert die TTWROR nicht, aber die geldgewichtete Rendite', () => {
  const prices = DAYS.map((date, index) => [date, index === DAYS.length - 1 ? '110' : '100']);
  const without = performanceSummary(book({prices}), {range: 'ALL', asOf: ASOF, securityIds: ['s']}).securities[0];
  const withDeposit = performanceSummary(book({
    prices,
    trades: [
      {id: 't1', portfolioId: 'p', securityId: 's', date: '2026-09-01', type: 'BUY', shares: '1', amount: 10000, currency: 'EUR'},
      {id: 't2', portfolioId: 'p', securityId: 's', date: '2026-09-05', type: 'BUY', shares: '1', amount: 10000, currency: 'EUR'},
    ],
  }), {range: 'ALL', asOf: ASOF, securityIds: ['s']}).securities[0];
  assert.ok(Math.abs(withDeposit.ttwror.percent - without.ttwror.percent) < 1e-9);
  assert.notEqual(withDeposit.xirr.percent, without.xirr.percent);
  assert.ok(Number.isFinite(withDeposit.xirr.percent));
});

test('fehlende Tageskurse werden fortgeschrieben, markiert und ab dem achten Tag geschätzt', () => {
  const prices = [[DAYS[0], '100'], [DAYS.at(-1), '110']];
  const valuations = valuationsFor(book({prices}));
  assert.equal(valuations.days.total, 11);
  assert.equal(valuations.days.carriedForward, 9);
  assert.equal(valuations.days.estimated, 2);
  assert.equal(valuations.quality, 'estimated');
  assert.ok(german(valuations.reason));
  assert.equal(valuations.points[5].carriedForwardDays, 5);
  assert.equal(valuations.points[5].quality, 'verified');
  assert.equal(valuations.points[9].quality, 'estimated');
  // The strict consumer refuses estimated days; the producer opts in deliberately.
  assert.equal(timeWeightedReturn(valuations.points).rate, null);
  assert.ok(Math.abs(timeWeightedReturn(valuations.points, {acceptEstimated: true}).percent - 10) < 1e-9);
  const result = periodTimeWeightedReturn(valuations);
  assert.equal(result.quality, 'estimated');
  assert.ok(Math.abs(result.percent - 10) < 1e-9);
  assert.ok(german(result.reason));
});

test('ein längerer Kursausfall macht die Fortschreibung zur Schätzung, erfindet aber keinen Kurs', () => {
  const strict = valuationsFor(book({prices: [[DAYS[0], '100'], [DAYS.at(-1), '110']]}), {maxCarryForwardDays: 0});
  assert.equal(strict.days.estimated, 9);
  assert.equal(strict.quality, 'estimated');
  const tolerant = valuationsFor(book({prices: [[DAYS[0], '100'], [DAYS.at(-1), '110']]}), {maxCarryForwardDays: 30});
  assert.equal(tolerant.days.estimated, 0);
  assert.equal(tolerant.quality, 'verified');
  assert.equal(tolerant.days.carriedForward, 9);
});

test('Zuflüsse zählen zum Tagesbeginn, Abflüsse zum Tagesende; eine Buchung nach Börsenschluss dreht das', () => {
  const buy = valuationsFor(book({
    trades: [
      {id: 't1', portfolioId: 'p', securityId: 's', date: '2026-09-01', type: 'BUY', shares: '1', amount: 10000, currency: 'EUR'},
      {id: 't2', portfolioId: 'p', securityId: 's', date: '2026-09-05', type: 'BUY', shares: '1', amount: 10000, currency: 'EUR'},
    ],
  }));
  assert.equal(buy.points[4].externalFlowEURcents, 10000);
  assert.equal(buy.points[4].flowTiming, 'start');
  const sell = valuationsFor(book({
    trades: [
      {id: 't1', portfolioId: 'p', securityId: 's', date: '2026-09-01', type: 'BUY', shares: '2', amount: 20000, currency: 'EUR'},
      {id: 't2', portfolioId: 'p', securityId: 's', date: '2026-09-05', type: 'SELL', shares: '1', amount: 10000, currency: 'EUR'},
    ],
  }));
  assert.equal(sell.points[4].externalFlowEURcents, -10000);
  assert.equal(sell.points[4].flowTiming, 'end');
  const late = valuationsFor(book({
    trades: [
      {id: 't1', portfolioId: 'p', securityId: 's', date: '2026-09-01', type: 'BUY', shares: '10', amount: 100000, currency: 'EUR'},
      {id: 't2', portfolioId: 'p', securityId: 's', date: '2026-09-05', type: 'BUY', shares: '1', amount: 10000, currency: 'EUR', dateTime: '2026-09-05T18:30'},
    ],
  }));
  assert.equal(late.points[4].flowClockHint, 'after-close');
  assert.equal(late.points[4].flowTiming, 'end');
  // A purchase that dwarfs the prior position must never be measured against the rest.
  const dominant = valuationsFor(book({
    trades: [
      {id: 't1', portfolioId: 'p', securityId: 's', date: '2026-09-01', type: 'BUY', shares: '0.01', amount: 100, currency: 'EUR'},
      {id: 't2', portfolioId: 'p', securityId: 's', date: '2026-09-05', type: 'BUY', shares: '10', amount: 100000, currency: 'EUR', dateTime: '2026-09-05T18:30'},
    ],
  }));
  assert.equal(dominant.points[4].flowTiming, 'start');
});

test('ein Depot ohne Kapital zwischen Verkauf und Neukauf bleibt renditeneutral statt ungültig', () => {
  const prices = DAYS.map((date, index) => [date, index >= 7 ? '110' : '100']);
  const valuations = valuationsFor(book({
    prices,
    trades: [
      {id: 't1', portfolioId: 'p', securityId: 's', date: '2026-09-01', type: 'BUY', shares: '1', amount: 10000, currency: 'EUR'},
      {id: 't2', portfolioId: 'p', securityId: 's', date: '2026-09-03', type: 'SELL', shares: '1', amount: 10000, currency: 'EUR'},
      {id: 't3', portfolioId: 'p', securityId: 's', date: '2026-09-08', type: 'BUY', shares: '1', amount: 11000, currency: 'EUR'},
    ],
  }));
  assert.equal(valuations.quality, 'verified');
  assert.equal(valuations.points[4].valueEURcents, 0);
  assert.equal(valuations.points[7].flowTiming, 'start');
  const result = periodTimeWeightedReturn(valuations);
  assert.equal(result.status, 'complete');
  assert.ok(Math.abs(result.percent) < 1e-6, `erwartet 0 %, erhalten ${result.percent}`);
});

test('ohne gespeicherten Kurs gilt der eigene Handelspreis als geschätzter Kurs und wird benannt (CALC-14)', () => {
  const valuations = valuationsFor(book({prices: []}));
  assert.equal(valuations.quality, 'estimated');
  assert.equal(valuations.days.open, 0);
  assert.equal(valuations.days.tradePriced, 11);
  assert.deepEqual(valuations.tradePricedSecurityIds, ['s']);
  assert.ok(valuations.points.every(point => point.valueEURcents === 10000 && point.quality === 'estimated'));
  assert.deepEqual(valuations.points[3].tradePricedIds, ['s']);
  assert.match(valuations.reason, /Kurs aus Handelspreis \(1 Papier\)/);
  assert.ok(valuations.missing.some(text => text.includes('Handelspreis') && text.includes('Testwertpapier')));
  const result = periodTimeWeightedReturn(valuations);
  assert.equal(result.status, 'complete');
  assert.equal(result.quality, 'estimated');
  assert.ok(Math.abs(result.percent) < 1e-9);
  // Ein späterer echter Kurs löst den Handelspreis ab; ab dann ist der Tag belastbar.
  const later = valuationsFor(book({prices: [[DAYS[5], '120']]}));
  assert.equal(later.points[4].quality, 'estimated');
  assert.equal(later.points[5].quality, 'verified');
  assert.equal(later.points[5].valueEURcents, 12000);
  assert.deepEqual(later.points[5].tradePricedIds, []);
  const summary = performanceSummary(book({prices: [[DAYS[5], '120']]}), {range: 'ALL', asOf: ASOF, securityIds: ['s']});
  assert.deepEqual(summary.securities[0].tradePricedSecurityIds, ['s']);
  assert.equal(summary.securities[0].capital, true);
});

test('ohne jeden belegten Preis bleibt die Tagesreihe offen und nennt das Wertpapier', () => {
  const valuations = valuationsFor(book({prices: [], trades: [{id: 't1', portfolioId: 'p', securityId: 's', date: '2026-09-01', type: 'DELIVERY_INBOUND', shares: '1', amount: 0, currency: 'EUR'}]}));
  assert.equal(valuations.quality, 'open');
  assert.equal(valuations.days.tradePriced, 0);
  assert.ok(german(valuations.reason));
  assert.ok(valuations.missing.some(text => text.includes('Ohne gespeicherten Kurs') && text.includes('Testwertpapier')));
  const result = periodTimeWeightedReturn(valuations);
  assert.equal(result.percent, null);
  assert.equal(result.rate, null);
  assert.ok(german(result.reason));
});

test('Wochenenden zählen nicht als Handelstage ohne Kurs; ein Depot ohne Kapital wird als solches markiert (CALC-14/15)', () => {
  // 2026-09-01 ist ein Dienstag: Kurse nur am 1. und 11. → 9 fortgeschriebene Tage, davon 2 am Wochenende (5./6.).
  const valuations = valuationsFor(book({prices: [[DAYS[0], '100'], [DAYS.at(-1), '110']]}));
  assert.equal(valuations.days.carriedForward, 9);
  assert.equal(valuations.days.tradingDaysWithoutQuote, 7);
  assert.match(valuations.reason, /7 Handelstage ohne eigenen Kurs/);
  const chart = continuousValueSeries(investmentOverview(book({prices: [[DAYS[0], '100'], [DAYS.at(-1), '110']]}), {range: 'ALL', asOf: ASOF}).series, valuations);
  assert.equal(chart.days.tradingDaysWithoutQuote, 7);
  const data = book();
  data.portfolios.push({id: 'leer', name: 'Leeres Depot'});
  const summary = performanceSummary(data, {range: 'ALL', asOf: ASOF, securityIds: []});
  assert.deepEqual(summary.portfolios.map(depot => [depot.name, depot.capital]), [['Testdepot', true], ['Leeres Depot', false]]);
});

test('leere oder unbekannte Datenbestände liefern null mit deutschem Grund statt NaN', () => {
  const empty = dailyValuations({}, {range: 'ALL', asOf: ASOF});
  assert.deepEqual(empty.points, []);
  assert.equal(empty.quality, 'open');
  assert.ok(german(empty.reason));
  assert.equal(periodTimeWeightedReturn(empty).percent, null);
  assert.equal(periodTimeWeightedReturn(null).percent, null);
  assert.ok(german(periodTimeWeightedReturn(null).reason));
  const summary = performanceSummary(undefined, {range: 'ALL', asOf: ASOF});
  assert.equal(summary.total.ttwror.percent, null);
  assert.equal(summary.total.xirr.percent, null);
  assert.equal(summary.total.quality, 'open');
  assert.ok(german(summary.total.ttwror.reason));
  assert.deepEqual(summary.portfolios, []);
  assert.deepEqual(summary.securities, []);
  const single = valuationsFor(book({prices: [[DAYS[0], '100']], trades: [{id: 't1', portfolioId: 'p', securityId: 's', date: ASOF, type: 'BUY', shares: '1', amount: 10000, currency: 'EUR'}]}));
  assert.equal(single.points.length, 1);
  assert.equal(single.quality, 'open');
  assert.equal(periodTimeWeightedReturn(single).percent, null);
});

test('performanceSummary liefert alle Ebenen mit endlichen Beträgen und Qualitätsangabe', () => {
  const prices = DAYS.map((date, index) => [date, index === DAYS.length - 1 ? '110' : '100']);
  const data = book({prices, cashTransactions: [{id: 'c1', accountId: 'a', securityId: 's', date: '2026-09-04', type: 'DIVIDENDS', amount: 200, currency: 'EUR'}, {id: 'c2', accountId: 'a', securityId: 's', date: '2026-09-06', type: 'FEES', amount: 50, currency: 'EUR'}]});
  const summary = performanceSummary(data, {range: 'ALL', asOf: ASOF});
  assert.equal(summary.asOf, ASOF);
  assert.equal(summary.portfolios.length, 1);
  assert.equal(summary.securities.length, 1);
  for (const level of [summary.total, ...summary.portfolios, ...summary.securities]) {
    for (const key of ['marketValue', 'costBasis', 'realized', 'unrealized', 'income', 'fees']) {
      assert.ok(level[key] === null || Number.isSafeInteger(level[key]), `${level.level}.${key} ist ${level[key]}`);
    }
    for (const rate of [level.ttwror, level.xirr]) {
      assert.ok(rate.percent === null || Number.isFinite(rate.percent));
      assert.ok(rate.rate === null || Number.isFinite(rate.rate));
    }
    assert.ok(['verified', 'estimated', 'open'].includes(level.quality));
    assert.ok(Array.isArray(level.missing));
  }
  assert.equal(summary.total.marketValue, 11000);
  assert.equal(summary.total.costBasis, 10000);
  assert.equal(summary.total.unrealized, 1000);
  assert.equal(summary.total.income, 200);
  assert.equal(summary.total.fees, 50);
  // Income stays inside the perimeter, so it lifts the time-weighted return above the pure quote move.
  assert.ok(summary.total.ttwror.percent > 10);
  assert.equal(summary.securities[0].name, 'Testwertpapier');
  assert.equal(summary.portfolios[0].name, 'Testdepot');
});

test('performanceSummary trennt Depots und begrenzt den Perimeter auf das gewählte Depot', () => {
  const data = book({
    trades: [
      {id: 't1', portfolioId: 'p', securityId: 's', date: '2026-09-01', type: 'BUY', shares: '1', amount: 10000, currency: 'EUR'},
      {id: 't2', portfolioId: 'q', securityId: 's', date: '2026-09-01', type: 'BUY', shares: '3', amount: 30000, currency: 'EUR'},
    ],
  });
  data.portfolios.push({id: 'q', name: 'Zweitdepot'});
  const all = performanceSummary(data, {range: 'ALL', asOf: ASOF});
  assert.equal(all.total.marketValue, 40000);
  assert.deepEqual(all.portfolios.map(depot => depot.marketValue), [10000, 30000]);
  const single = performanceSummary(data, {range: 'ALL', asOf: ASOF, portfolioId: 'q'});
  assert.equal(single.total.marketValue, 30000);
  assert.equal(single.portfolios.length, 1);
  // A dividend without a portfolio cannot be split across two depots and is left out with a note.
  const withDividend = structuredClone(data);
  withDividend.cashTransactions.push({id: 'c1', accountId: 'a', securityId: 's', date: '2026-09-04', type: 'DIVIDENDS', amount: 300, currency: 'EUR'});
  const split = performanceSummary(withDividend, {range: 'ALL', asOf: ASOF, portfolioId: 'q'});
  assert.equal(split.total.income, 0);
  assert.ok(split.total.missing.some(text => text.includes('zuordenbar')));
  assert.equal(performanceSummary(withDividend, {range: 'ALL', asOf: ASOF}).total.income, 300);
});

test('performancePeriod bildet die Zeiträume der Depotansicht ab', () => {
  assert.deepEqual(performancePeriod({range: 'ALL', asOf: '2026-09-23'}), {range: 'ALL', from: null, to: '2026-09-23'});
  assert.deepEqual(performancePeriod({range: 'YTD', asOf: '2026-09-23'}), {range: 'YTD', from: '2025-12-31', to: '2026-09-23'});
  assert.deepEqual(performancePeriod({range: '1M', asOf: '2026-09-23'}), {range: '1M', from: '2026-08-23', to: '2026-09-23'});
  assert.deepEqual(performancePeriod({range: '3M', asOf: '2026-03-31'}), {range: '3M', from: '2025-12-31', to: '2026-03-31'});
  assert.deepEqual(performancePeriod({range: '1Y', asOf: '2026-09-23'}), {range: '1Y', from: '2025-09-23', to: '2026-09-23'});
  assert.deepEqual(performancePeriod({range: '3Y', asOf: '2026-09-23'}), {range: '3Y', from: '2023-09-23', to: '2026-09-23'});
  assert.deepEqual(performancePeriod({range: 'CUSTOM', from: '2026-01-02', to: '2026-02-02'}), {range: 'CUSTOM', from: '2026-01-02', to: '2026-02-02'});
  assert.throws(() => performancePeriod({range: 'CUSTOM', from: '2026-02-30', to: '2026-03-01'}), /Kalenderdatum/);
  assert.throws(() => performancePeriod({range: 'CUSTOM', from: '2026-03-02', to: '2026-03-01'}), /vor dem Ende/);
  assert.throws(() => performancePeriod({range: '7M', asOf: '2026-09-23'}), /Anlagezeitraum/);
  assert.throws(() => performancePeriod({asOf: '2026-13-01'}), /Zeitraumende/);
});

test('ein begrenzter Zeitraum bewertet nur seine eigenen Tage', () => {
  const prices = DAYS.map((date, index) => [date, index >= 5 ? '110' : '100']);
  const window = dailyValuations(book({prices}), {from: '2026-09-06', to: ASOF, securityId: 's'});
  assert.equal(window.from, '2026-09-06');
  assert.equal(window.to, ASOF);
  assert.equal(window.points.length, 6);
  assert.equal(Math.round(periodTimeWeightedReturn(window).percent * 1e6) / 1e6, 0);
  const full = dailyValuations(book({prices}), {from: '2026-09-01', to: ASOF, securityId: 's'});
  assert.ok(Math.abs(periodTimeWeightedReturn(full).percent - 10) < 1e-9);
});

/** Zwei Wertpapiere: eines mit Kurslücken, eines ganz ohne Kurs. */
function portfolio() {
  return {
    securities: [
      {id: 's', name: 'Testwertpapier', currency: 'EUR', quotes: [[DAYS[0], '100'], [DAYS.at(-1), '110']]},
      {id: 'x', name: 'Wertpapier ohne Kurs', currency: 'EUR', quotes: []},
    ],
    portfolios: [{id: 'p', name: 'Testdepot'}],
    trades: [
      {id: 't1', portfolioId: 'p', securityId: 's', date: DAYS[0], type: 'BUY', shares: '1', amount: 10000, currency: 'EUR'},
      {id: 't2', portfolioId: 'p', securityId: 'x', date: DAYS[3], type: 'BUY', shares: '1', amount: 5000, currency: 'EUR'},
      {id: 't3', portfolioId: 'p', securityId: 'x', date: DAYS[6], type: 'SELL', shares: '1', amount: 5200, currency: 'EUR'},
    ],
    cashTransactions: [],
  };
}
const seriesFor = data => {
  const options = {range: 'ALL', asOf: ASOF};
  return continuousValueSeries(investmentOverview(data, options).series, dailyValuations(data, options));
};

test('die Depotkurve bleibt lückenlos: fehlende Tageskurse werden fortgeschrieben und markiert', () => {
  const data = portfolio();
  data.securities.splice(1, 1);
  data.trades.splice(1, 2);
  const model = investmentOverview(data, {range: 'ALL', asOf: ASOF}).series;
  assert.equal(model.length, 11);
  const result = seriesFor(data);
  assert.equal(result.continuous, true);
  assert.equal(result.days.open, 0);
  assert.ok(result.points.every(point => Number.isSafeInteger(point.valueEURcents)));
  // Neun Tage ohne eigenen Kurs, zwei davon über die Sieben-Tage-Grenze hinaus.
  assert.equal(result.days.carriedForward, 9);
  assert.equal(result.days.estimated, 2);
  assert.equal(result.days.partial, 0);
  assert.deepEqual(result.missingSecurityIds, []);
  assert.equal(result.points[5].carriedForward, true);
  assert.equal(result.points[5].quality, 'verified');
  assert.equal(result.points[9].quality, 'estimated');
  assert.equal(result.points[0].quality, 'verified');
  assert.equal(result.first.date, DAYS[0]);
  assert.equal(result.last.date, DAYS.at(-1));
});

test('ein Wertpapier ohne jeden Kurs lässt den Rest des Depots weiterlaufen und wird benannt', () => {
  const result = seriesFor(portfolio());
  assert.equal(result.continuous, true);
  assert.equal(result.days.open, 0);
  assert.deepEqual(result.missingSecurityIds, ['x']);
  const partial = result.points.filter(point => point.partial);
  assert.deepEqual(partial.map(point => point.date), [DAYS[3], DAYS[4], DAYS[5]]);
  for (const point of partial) {
    assert.equal(point.complete, false);
    assert.equal(point.quality, 'estimated'); // gestrichelt gezeichnet
    assert.deepEqual(point.missingSecurityIds, ['x']);
    assert.equal(point.valueEURcents, 10000); // bekannter Rest des Depots, keine Null
  }
  assert.equal(result.points.filter(point => point.quality === 'estimated').length >= partial.length, true);
});

test('ohne jede Bewertung bleibt der Tag leer statt null und die Reihe meldet die Lücke', () => {
  const data = portfolio();
  data.securities = [{id: 'x', name: 'Wertpapier ohne Kurs', currency: 'EUR', quotes: []}];
  data.trades = [{id: 't2', portfolioId: 'p', securityId: 'x', date: DAYS[0], type: 'BUY', shares: '1', amount: 5000, currency: 'EUR'}];
  const result = seriesFor(data);
  assert.equal(result.continuous, false);
  assert.equal(result.days.open, result.days.total);
  assert.equal(result.days.partial, 0);
  assert.ok(result.points.every(point => point.valueEURcents === null && point.quality === 'open'));
  assert.deepEqual(result.missingSecurityIds, ['x']);
  assert.equal(result.first, null);
  assert.equal(result.last, null);
  assert.deepEqual(continuousValueSeries().points, []);
  assert.equal(continuousValueSeries().continuous, false);
});

test('Handelstage seit dem letzten Kurs: Wochenende ist keine Lücke', () => {
  assert.equal(tradingDaysBetween('2026-09-04', '2026-09-04'), 0);
  assert.equal(tradingDaysBetween('2026-09-04', '2026-09-06'), 0); // Freitag → Sonntag
  assert.equal(tradingDaysBetween('2026-09-04', '2026-09-08'), 2); // Freitag → Dienstag
  assert.equal(tradingDaysBetween('2026-09-04', '2026-09-11'), 5);
  assert.equal(tradingDaysBetween('2026-09-18', '2026-09-27'), 5); // 18.09. (Fr) bis 27.09. (So)
  assert.equal(tradingDaysBetween('2026-09-05', '2026-09-07'), 1); // Samstagskurs → Montag
  assert.equal(tradingDaysBetween('2026-09-08', '2026-09-04'), 0);
  assert.equal(tradingDaysBetween(null, '2026-09-04'), 0);
});

test('Depotkurve zählt die Kurslücke je Punkt in Handelstagen', () => {
  // Kurse bis Freitag, 04.09.2026; Stichtag Sonntag bzw. Dienstag danach.
  const data = book({prices: [['2026-09-01', '100'], ['2026-09-04', '101']]});
  const at = asOf => {
    const options = {range: 'ALL', asOf, securityId: 's'};
    return continuousValueSeries(investmentOverview(data, options).series, dailyValuations(data, options));
  };
  const sunday = at('2026-09-06').last;
  assert.equal(sunday.date, '2026-09-06');
  assert.equal(sunday.carriedForwardDays, 2);
  assert.equal(sunday.tradingDaysSinceQuote, 0); // keine Lückennotiz
  const tuesday = at('2026-09-08');
  assert.equal(tuesday.last.date, '2026-09-08');
  assert.equal(tuesday.last.carriedForwardDays, 4);
  assert.equal(tuesday.last.tradingDaysSinceQuote, 2); // „2 Handelstage ohne eigenen Kurs“
  assert.equal(tuesday.days.tradingDaysWithoutQuote, 4); // Mi 02.09., Do 03.09., Mo 07.09., Di 08.09.
  assert.equal(tuesday.points.find(point => point.date === '2026-09-07').tradingDaysSinceQuote, 1);
});

test('fehlender Anteil ohne je gespeicherten Kurs wird in Handelstagen gezählt', () => {
  const result = seriesFor(portfolio());
  // DAYS[3..5] = Fr 04.09., Sa 05.09., So 06.09.: drei Kalendertage, ein Handelstag.
  assert.equal(result.days.partial, 3);
  assert.equal(result.days.partialTradingDays, 1);
  assert.equal(result.days.openTradingDays, 0);
});
