import { describe, expect, it } from 'vitest';
import * as api from './verdicts';
import type { VerdictFacts, VerdictCandidate } from './verdicts';
const facts = (extra: Partial<VerdictFacts> = {}): VerdictFacts => ({
  reportId: 'synthetic-report',
  period: '2025-09',
  metric: { label: 'Sparbetrag', value: 112000, unit: 'money', better: 'higher' },
  ...extra,
});
const candidates = (extra: Partial<VerdictFacts>) => {
  expect(api.detectVerdictFacts).toBeTypeOf('function');
  return api.detectVerdictFacts(facts(extra));
};
const sentence = (f = facts(), options = {}) => {
  expect(api.reportVerdict).toBeTypeOf('function');
  return api.reportVerdict(f, options);
};
describe('report verdicts', () => {
  it('renders every template with every synthetic placeholder, short and fully resolved', () => {
    expect(api.VERDICT_TEMPLATES).toBeDefined();
    expect(api.VERDICT_TEMPLATES.length).toBeGreaterThanOrEqual(200);
    expect(new Set(api.VERDICT_TEMPLATES.map((t) => t.text)).size).toBe(
      api.VERDICT_TEMPLATES.length,
    );
    const sample: VerdictCandidate = {
      type: 'summary',
      strength: 0,
      label: 'Sparbetrag',
      value: 112000,
      unit: 'money',
      n: 3,
      rank: 3,
      threshold: 2000,
      reference: 'Vormonat',
      scope: 'seit Aufzeichnungsbeginn',
      category: 'Wohnen',
      equivalent: 2.4,
      equivalentUnit: 'Monatsbeträgen',
    };
    for (const template of api.VERDICT_TEMPLATES) {
      for (const hidden of [false, true]) {
        const text = api.renderVerdictTemplate(template, sample, facts(), hidden);
        expect(text, template.id).not.toMatch(/\{|undefined|NaN|[−-]0(?:,0+)?(?:\s|$)/);
        expect(text.length, template.id).toBeLessThanOrEqual(140);
        if (hidden) expect(text, template.id).not.toMatch(/\d/);
      }
    }
    expect(
      api.renderVerdictTemplate(api.VERDICT_TEMPLATES[0]!, sample, facts()),
    ).toMatchInlineSnapshot(
      '"September: Sparbetrag 1.120 € ist der drittbeste Monat seit Aufzeichnungsbeginn."',
    );
  });
  it('is deterministic, changes wording next month and excludes the previous template', () => {
    const a = sentence();
    expect(sentence()).toEqual(a);
    const b = sentence(facts({ period: '2025-10' }));
    expect(b.templateId).not.toBe(a.templateId);
    expect(sentence(facts(), { previousTemplateId: a.templateId }).templateId).not.toBe(
      a.templateId,
    );
    for (let month = 1; month < 12; month++) {
      const a = sentence(facts({ period: `2025-${String(month).padStart(2, '0')}` }));
      const b = sentence(facts({ period: `2025-${String(month + 1).padStart(2, '0')}` }));
      expect(a.templateId).not.toBe(b.templateId);
    }
  });
  it('ranks strict records and keeps incomplete, tied or gapped histories honest', () => {
    const history = [10000, 20000, 112000].map((value, i) => ({ month: `2025-0${i + 7}`, value }));
    expect(
      candidates({ history, historyScope: 'all' }).find((f) => f.type === 'record-high'),
    ).toMatchObject({ rank: 1, scope: 'seit Aufzeichnungsbeginn' });
    expect(
      candidates({ history, historyScope: 'window' }).find((f) => f.type === 'record-high')?.scope,
    ).toBe('in 3 Monaten');
    expect(candidates({ history, partial: true }).some((f) => f.type.startsWith('record'))).toBe(
      false,
    );
    expect(
      candidates({ history: [history[0]!, history[2]!] }).some(
        (f) => f.type.startsWith('record') || f.type.startsWith('streak'),
      ),
    ).toBe(false);
    expect(
      candidates({ history: history.map((h) => ({ ...h, value: 112000 })) }).some((f) =>
        f.type.startsWith('record'),
      ),
    ).toBe(false);
  });
  it('detects savings, budget and wealth streaks, plan comparisons and first clean month', () => {
    const months = ['2025-07', '2025-08', '2025-09'];
    expect(
      candidates({
        savingsRates: months.map((month) => ({ month, value: 2200 })),
        savingsTargetBp: 2000,
      }).map((f) => f.type),
    ).toContain('streak-savings');
    expect(
      candidates({ budgetMargins: months.map((month) => ({ month, value: 1000 })) }).map(
        (f) => f.type,
      ),
    ).toContain('streak-budget');
    expect(
      candidates({ wealthChanges: months.map((month) => ({ month, value: 1000 })) }).map(
        (f) => f.type,
      ),
    ).toContain('streak-wealth');
    expect(
      candidates({
        budgetMargins: [
          { month: '2025-08', value: -1 },
          { month: '2025-09', value: 0 },
        ],
        historyScope: 'all',
      }).map((f) => f.type),
    ).toContain('milestone');
    expect(
      candidates({ comparisons: [{ reference: 'Plan', value: 120000 }] }).find(
        (f) => f.type === 'comparison-down',
      )?.value,
    ).toBe(8000);
  });
  it('detects round wealth, emergency reach, debt reduction, rules and own effort', () => {
    expect(
      candidates({ netWorth: { previousCents: 9900000, currentCents: 10100000 } }).find(
        (f) => f.type === 'threshold-wealth',
      )?.value,
    ).toBe(10000000);
    expect(
      candidates({ emergency: { previousMonths: 2.9, months: 3.1 } }).find(
        (f) => f.type === 'threshold-emergency',
      )?.n,
    ).toBe(3);
    expect(
      candidates({ debt: { previousCents: 500000, currentCents: 400000 } }).find(
        (f) => f.type === 'debt-down',
      )?.value,
    ).toBe(100000);
    expect(
      candidates({ rules: { bad: 2, warn: 1, ok: 3 } }).find((f) => f.type === 'rule-bad')?.n,
    ).toBe(2);
    expect(sentence(facts({ marketCents: -50000, ownCents: 100000 })).fact.type).toBe('effort');
    expect(candidates({ marketCents: -50000, ownCents: 10000 }).map((f) => f.type)).toContain(
      'market-down',
    );
  });
  it('uses only supplied own category equivalents and category streaks', () => {
    expect(
      candidates({
        equivalents: [{ category: 'Wohnen', costCents: 56000, unit: 'Monatsbeträgen' }],
      }).find((f) => f.type === 'equivalent')?.equivalent,
    ).toBe(2);
    expect(
      candidates({
        equivalents: [{ category: 'Wohnen', costCents: 0, unit: 'Monatsbeträgen' }],
      }).some((f) => f.type === 'equivalent'),
    ).toBe(false);
    expect(
      candidates({
        categoryStreaks: [
          {
            category: 'Wohnen',
            margins: ['2025-07', '2025-08', '2025-09'].map((month) => ({ month, value: 0 })),
          },
        ],
      }).map((f) => f.type),
    ).toContain('category-streak');
  });
  it('handles negative, zero, unsafe, unavailable, partial and estimated values without false cheer', () => {
    for (const value of [0, -0, -1, -100000, Number.NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      const result = sentence(
        facts({ metric: { label: 'Sparbetrag', value, unit: 'money', better: 'higher' } }),
      );
      expect(result.text).not.toMatch(/NaN|undefined|[−-]0(?:,0+)?(?:\s|$)/);
      expect(result.text.length).toBeLessThanOrEqual(140);
      if (value < 0) expect(result.fact.type).toBe('negative');
    }
    expect(sentence(facts({ unavailable: true })).fact.type).toBe('unavailable');
    expect(sentence(facts({ partial: true })).text).toMatch(/laufend|bisher/);
    expect(sentence(facts({ estimated: true })).text).toMatch(/vorläufig|≈/);
    const percent = sentence(
      facts({ metric: { label: 'Sparquote', value: 1234, unit: 'percent', better: 'higher' } }),
    );
    expect(percent.text).toContain('12,3 %');
    expect(sentence(facts(), { hidden: true }).text).toContain('•••');
    expect(sentence(facts(), { hidden: true }).text).not.toMatch(/1120|1.120/);
  });
  it('distinguishes multi-month totals from monthly figures and preserves the template in privacy mode', () => {
    const total = sentence(facts({ period: '2025-01..2025-09' }));
    expect(total.text).not.toMatch(/Zeitraum:|^[a-zäöü]/);
    expect(total.text).toMatch(/^[A-ZÄÖÜ0-9]/);
    const large = facts({
      metric: {
        label: 'Synthetischer langer Summenwert',
        value: Number.MAX_SAFE_INTEGER,
        unit: 'money',
      },
    });
    expect(sentence(large).text.length).toBeLessThanOrEqual(140);
    expect(sentence(large).templateId).toBe(sentence(large, { hidden: true }).templateId);
  });
  it('expresses rate comparisons as percentage points, not relative percent changes', () => {
    const result = sentence(
      facts({
        metric: { label: 'Sparquote', value: 2200, unit: 'percent' },
        comparisons: [{ reference: 'Vormonat', value: 2000 }],
      }),
    );
    expect(result.text).toContain('2,0 Pp');
  });
  it('keeps singular rules and one-month reserves grammatical', () => {
    const render = (id: string, n: number) =>
      api.renderVerdictTemplate(
        api.VERDICT_TEMPLATES.find((t) => t.id === id)!,
        { type: 'rule-ok', strength: 50, n },
        facts(),
      );
    expect(render('rule-ok-1', 1)).toBe('September: Der Finanz-Check bestätigt 1 erfüllte Regel.');
    expect(render('threshold-emergency-2', 1)).toBe(
      'September: Mit dem Notgroschen ist Bedarf für mindestens 1 Monat gedeckt.',
    );
    expect(render('threshold-emergency-3', 3)).toBe(
      'September: Dein Notgroschen reicht für 3 Monate – eine neue Schwelle ist erreicht.',
    );
  });
  it('declines own-category equivalents for one or several monthly amounts', () => {
    const render = (id: string, equivalent: number) =>
      api.renderVerdictTemplate(
        api.VERDICT_TEMPLATES.find((t) => t.id === id)!,
        {
          type: 'equivalent',
          strength: 40,
          label: 'Sparbetrag',
          value: 112000,
          equivalent,
          equivalentUnit: 'Monatsbeträgen',
          category: 'Wohnen',
        },
        facts(),
      );
    expect(render('equivalent-1', 1)).toContain('entspricht 1,0 Monatsbetrag für Wohnen');
    expect(render('equivalent-1', 2.4)).toContain('entspricht 2,4 Monatsbeträgen für Wohnen');
    expect(render('equivalent-2', 2.4)).toContain('2,4 Monatsbeträge für Wohnen');
  });
  it('never repeats across adjacent months even when large values change the eligible templates', () => {
    for (const value of [1, 10000, 100000000, Number.MAX_SAFE_INTEGER]) {
      const metric = {
        label: 'Synthetischer langer Summenwert',
        value,
        unit: 'money' as const,
        better: 'higher' as const,
      };
      const a = sentence(
        facts({
          metric,
          history: [
            { month: '2025-07', value: 0 },
            { month: '2025-08', value: 0 },
            { month: '2025-09', value },
          ],
          historyScope: 'all',
        }),
      );
      const b = sentence(
        facts({
          period: '2025-10',
          metric: { ...metric, value: 10000 },
          history: [
            { month: '2025-08', value: 0 },
            { month: '2025-09', value: 0 },
            { month: '2025-10', value: 10000 },
          ],
          historyScope: 'all',
        }),
      );
      expect(a.templateId).not.toBe(b.templateId);
      expect(sentence(facts({ metric }), { hidden: true }).templateId).toBe(
        sentence(facts({ metric })).templateId,
      );
    }
  });
  it('keeps selection stable for every month despite long record values and privacy', () => {
    const record = (month: number, value: number) =>
      facts({
        period: `2025-${String(month).padStart(2, '0')}`,
        metric: {
          label: 'Synthetischer sehr langer Summenwert',
          value,
          unit: 'money',
          better: 'higher',
        },
        historyScope: 'all',
        history: Array.from({ length: 3 }, (_, i) => ({
          month: `2025-${String(month - 2 + i).padStart(2, '0')}`,
          value: i === 2 ? value : 0,
        })),
      });
    for (let month = 3; month < 12; month++) {
      for (const value of [1, 10000, Number.MAX_SAFE_INTEGER]) {
        const current = sentence(record(month, value));
        expect(sentence(record(month, value), { hidden: true }).templateId).toBe(
          current.templateId,
        );
        expect(sentence(record(month + 1, 1)).templateId).not.toBe(current.templateId);
      }
    }
  });
  it('detects a recent record even when an older month was stronger', () => {
    const history = Array.from({ length: 16 }, (_, i) => ({
      month: `${2024 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`,
      value: i < 4 ? 200000 : i === 15 ? 112000 : 10000,
    }));
    expect(candidates({ period: '2025-04', history, historyScope: 'all' })).toContainEqual(
      expect.objectContaining({ type: 'record-high', rank: 1, scope: 'in 12 Monaten' }),
    );
  });

  it('keeps every template free of banned phrasing, in one voice and a content tone', () => {
    for (const t of api.VERDICT_TEMPLATES) {
      expect(t.text, t.id).not.toMatch(
        /beim Wert|dem Vergleich|Vergleichswert|\buns\b|\bunser|darf kurz staunen|Rückenwind muss/,
      );
    }
    const humour = api.VERDICT_TEMPLATES.filter((t) => t.tone === 'trocken-humorvoll');
    expect(humour.length).toBeGreaterThan(0);
    expect(humour.length).toBeLessThan(api.VERDICT_TEMPLATES.length / 8);
    expect(
      api.VERDICT_TEMPLATES.filter((t) => /^(?:record-low|negative|rule-bad)/.test(t.type)).every(
        (t) => t.tone !== 'trocken-humorvoll',
      ),
    ).toBe(true);
  });
  it('names a top-three rank by its real rank and never claims a peak for rank two or three', () => {
    const history = [20000, 112000, 90000].map((value, i) => ({ month: `2025-0${i + 7}`, value }));
    const result = sentence(
      facts({
        metric: { label: 'Sparbetrag', value: 90000, unit: 'money', better: 'higher' },
        history,
        historyScope: 'all',
      }),
    );
    expect(result.fact).toMatchObject({ type: 'record-high', rank: 2 });
    for (const t of api.VERDICT_TEMPLATES.filter((t) => t.type === 'record-high'))
      expect(t.text, t.id).not.toMatch(/Spitzenmonat|Spitzenplatz|neuen/);
    expect(result.text).not.toMatch(/Spitze/);
  });
  it('words lower-is-better records as spending news, not as a weak month', () => {
    const lower = { label: 'Konsum', unit: 'money' as const, better: 'lower' as const };
    const months = ['2025-07', '2025-08', '2025-09'];
    const best = candidates({
      metric: { ...lower, value: 50000 },
      history: months.map((month, i) => ({ month, value: [90000, 80000, 50000][i]! })),
    }).find((f) => f.type === 'record-high')!;
    expect(best).toMatchObject({ better: 'lower', rank: 1 });
    const worst = candidates({
      metric: { ...lower, value: 95000 },
      history: months.map((month, i) => ({ month, value: [60000, 70000, 95000][i]! })),
    }).find((f) => f.type === 'record-low')!;
    const render = (id: string, c: VerdictCandidate) =>
      api.renderVerdictTemplate(
        api.VERDICT_TEMPLATES.find((t) => t.id === id)!,
        c,
        facts(),
      );
    expect(render('record-low-1', worst)).toContain('der teuerste Monat');
    expect(render('record-low-1', { ...worst, better: 'higher' })).toContain(
      'der schwächste Monat',
    );
    expect(render('record-high-7', best)).toContain('sparsamsten Monaten');
    expect(render('record-high-7', { ...best, better: 'higher' })).toContain('stärksten Monaten');
  });
  it('writes comparisons with the figure, the difference and the reference', () => {
    const result = sentence(
      facts({
        metric: { label: 'Konsum', value: 90000, unit: 'money', better: 'lower' },
        comparisons: [{ reference: 'Vormonat', value: 80000 }],
      }),
    );
    expect(result.fact).toMatchObject({ type: 'comparison-up', current: 90000, value: 10000 });
    expect(result.text).toMatch(/900 €.*100 €|100 €.*900 €/);
    expect(result.text).toContain('Vormonat');
  });
  it('appends details the winning sentence does not name and skips the ones it does', () => {
    const f = facts({
      details: [
        { label: 'Gespart', value: 112000, skipFor: ['summary'] },
        { label: 'Markt', value: -34000 },
      ],
    });
    expect(sentence(f).text).toMatch(/ · Markt −340 €$/);
    expect(sentence(f).text).not.toContain('Gespart');
    const other = sentence({ ...f, marketCents: 50000 });
    expect(other.text).toContain('· Gespart +1.120 € · Markt −340 €');
    expect(sentence(f, { hidden: true }).text).toContain('· Markt ••• €');
    expect(sentence(f, { hidden: true }).templateId).toBe(sentence(f).templateId);
  });
  it('keeps round wealth marks readable in privacy mode and the period free of "undefined"', () => {
    const crossing = facts({ netWorth: { previousCents: 9900000, currentCents: 10100000 } });
    expect(sentence(crossing, { hidden: true }).text).toContain('100.000 €');
    expect(sentence(facts({ period: '2025-09-01..2025-09-30' })).text).not.toMatch(/undefined/);
  });
  it('falls back to the shortest template of the winning type when none fits the length', () => {
    const long = facts({
      metric: {
        label: 'Ein sehr langer Synthetischer Kennzahlname',
        value: 112000,
        unit: 'money',
        better: 'higher',
      },
      details: [
        { label: 'Eine zweite sehr lange Bezeichnung', value: 999999999 },
        { label: 'Noch eine lange Bezeichnung hier', value: -999999999 },
        { label: 'Und noch eine weitere lange', value: 999999999 },
      ],
    });
    const result = sentence(long);
    expect(result.fact.type).toBe('summary');
    expect(result.templateId).toMatch(/^summary-/);
  });
});
