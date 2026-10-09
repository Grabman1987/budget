import { describe, expect, it } from 'vitest';
import {
  RULE_FIELDS,
  RULE_GUIDANCE,
  ruleGroup,
  fieldError,
  fieldText,
  fieldValue,
  formatBp,
  parseBp,
  stageRange,
  thresholdText,
} from './rules-model';
import { RULE_CODES } from '@budget/domain';
import type { RuleRow } from './api';

describe('rule overview', () => {
  const rule = (status: 'ok' | 'warn' | 'bad' | null, enabled = true) =>
    ({ enabled, latest: status ? { status } : null }) as RuleRow;

  it('keeps violations first, warnings and missing data open, and disabled rules separate', () => {
    expect(ruleGroup(rule('bad'))).toBe('violated');
    expect(ruleGroup(rule('ok'))).toBe('met');
    expect(ruleGroup(rule('warn'))).toBe('pending');
    expect(ruleGroup(rule(null))).toBe('pending');
    for (const status of ['ok', 'warn', 'bad', null] as const)
      expect(ruleGroup(rule(status, false))).toBe('disabled');
    expect(ruleGroup(rule('bad'), false)).toBe('disabled');
    expect(ruleGroup(rule('ok', false), true)).toBe('met');
  });

  it('gives every registered rule a short explanation and an existing correction destination', () => {
    expect(Object.keys(RULE_GUIDANCE)).toEqual(RULE_CODES);
    for (const code of RULE_CODES) {
      expect(RULE_GUIDANCE[code].explanation.length).toBeGreaterThan(20);
      expect(RULE_GUIDANCE[code].to).toMatch(/^\/(plan|konten|vermoegen|einstellungen)\//);
      expect(RULE_GUIDANCE[code].label.length).toBeGreaterThan(5);
    }
  });
});

describe('basis points as percent text', () => {
  it('formats and parses without floats', () => {
    expect(formatBp(5000)).toBe('50');
    expect(formatBp(1250)).toBe('12,5');
    expect(formatBp(1205)).toBe('12,05');
    expect(formatBp(0)).toBe('0');
    expect(parseBp('12,5')).toBe(1250);
    expect(parseBp('12.05')).toBe(1205);
    expect(parseBp('0,29')).toBe(29);
    expect(parseBp('50')).toBe(5000);
    expect(parseBp('1,234')).toBeNull();
    expect(parseBp('abc')).toBeNull();
    expect(parseBp('')).toBeNull();
    expect(parseBp('-5')).toBeNull();
  });
});

describe('threshold summaries (defaults match the prototype)', () => {
  it('R13 names the smaller standard band and stored override precedence', () => {
    expect(thresholdText('R13', {})).toBe(
      'Standardband: der kleinere Wert aus ±5 Prozentpunkten und ±25 % des Sollgewichts. Gespeicherte individuelle Bänder haben Vorrang.',
    );
    expect(thresholdText('R13', { maxBandBp: 0, relativeBandPct: 10 })).toContain(
      '±0 Prozentpunkten und ±10 %',
    );
  });
  it('R01 R02 R03 R07 R08', () => {
    expect(thresholdText('R01', { needMaxBp: 5000, wantMaxBp: 3000, futureMinBp: 2000 })).toBe(
      'Bedarf ≤ 50 %, Wunsch ≤ 30 %, Zukunft ≥ 20 %',
    );
    expect(thresholdText('R02', { minMonths: 3, targetMonths: 6 })).toBe('min. 3, Ziel 6 Monate');
    expect(thresholdText('R03', { targetDays: 30 })).toBe('Geldalter ≥ 30 Tage');
    expect(thresholdText('R07', { minCents: 0, horizonDays: 35 })).toBe(
      'Tiefpunkt ≥ 0 € in 35 Tagen',
    );
    expect(thresholdText('R08', { maxBp: 3000 })).toBe('≤ 30 % des Nettoeinkommens');
  });
  it('R04 R09 R10 R11 R12 R14 R15 R16', () => {
    expect(thresholdText('R04', { withinDays: 3 })).toBe('Zukunft binnen 3 Tagen nach Gehalt');
    expect(thresholdText('R04', { withinDays: 0 })).toBe('Zukunft am Gehaltstag zuerst');
    expect(thresholdText('R09', { rateBp: 500 })).toBe('über 5 % Zins: tilgen');
    expect(thresholdText('R10', { maxBp: 5500 })).toBe('≤ 55 %');
    expect(thresholdText('R11', { toleranceBp: 0 })).toBe('Ausgaben ≤ Einkommen, 12 M');
    expect(thresholdText('R12', { enjoyBp: 1000 })).toBe('10 % Genuss, Rest nach Wasserfall');
    expect(thresholdText('R14', { singleBp: 1000, platformBp: 2000 })).toBe(
      'Einzeltitel ≤ 10 %, Plattform ≤ 20 %',
    );
    expect(thresholdText('R15', { limitBp: 1000 })).toBe('≤ 10 %');
    expect(thresholdText('R16', { multiple: 25 })).toBe('Investiert ÷ 25 Jahresausgaben');
  });
});

describe('stage ranges', () => {
  it('come from the stage model', () => {
    expect(stageRange(1)).toBe('bis 10.000 €');
    expect(stageRange(2)).toBe('10.000 bis 100.000 €');
    expect(stageRange(3)).toBe('100.000 bis 1 Mio. €');
  });
});

describe('field validation', () => {
  const minMonths = RULE_FIELDS['R02']![0]!;
  const need = RULE_FIELDS['R01']![0]!;
  it('checks counts and percentages', () => {
    expect(fieldError(minMonths, '2')).toBeNull();
    expect(fieldError(minMonths, '2,5')).toMatch(/ganze Zahl/);
    expect(fieldError(minMonths, '5000')).toMatch(/Zwischen 0 und 1200/);
    expect(fieldError(need, '12,5')).toBeNull();
    expect(fieldError(need, '1001')).toMatch(/Zwischen/);
  });
  it('round-trips values', () => {
    expect(fieldText(need, 5000)).toBe('50');
    expect(fieldValue(need, '12,5')).toBe(1250);
    expect(fieldValue(minMonths, '2')).toBe(2);
  });
});

it('book-rule fields round-trip strict booleans, counts and small TER percentages', () => {
  const employer = RULE_FIELDS['R17']!.find((f) => f.key === 'includeEmployerPension')!;
  expect(fieldText(employer, true)).toBe('true');
  expect(fieldValue(employer, 'false')).toBe(false);
  expect(fieldError(employer, 'yes')).not.toBeNull();
  const months = RULE_FIELDS['R20']!.find((f) => f.key === 'okMonths')!;
  expect(fieldError(months, '13')).not.toBeNull();
  const cost = RULE_FIELDS['R22']!.find((f) => f.key === 'maxBp')!;
  expect(fieldValue(cost, '0,31')).toBe(31);
  expect(fieldText(cost, 30)).toBe('0,3');
});
