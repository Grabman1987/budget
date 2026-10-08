import { describe, expect, it } from 'vitest';
import { matchesSearch } from './search';

describe('fuzzy search', () => {
  it('matches ordered abbreviations, German case and native negative amounts literally', () => {
    expect(matchesSearch('Vermögen · Portfolio', ' vrmgn prtf ')).toBe(true);
    expect(matchesSearch('Übung März', 'übg märz')).toBe(true);
    expect(matchesSearch('−1.234,56', '-1234,56')).toBe(true);
    expect(matchesSearch('Muster %_\\', '%_\\')).toBe(true);
    expect(matchesSearch('1.10 Einnahmen und Ausgaben', '1.10 ein')).toBe(true);
    expect(matchesSearch('Muster', '')).toBe(true);
    expect(matchesSearch('Muster', 'retsum')).toBe(false);
    expect(matchesSearch('Muster', '.*')).toBe(false);
  });
});
