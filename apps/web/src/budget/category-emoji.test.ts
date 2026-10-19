import { describe, expect, it } from 'vitest';
import { categoryEmoji, FALLBACK_CATEGORY_EMOJI } from './category-emoji';

describe('categoryEmoji', () => {
  it('draws a stethoscope for Gesundheit', () => {
    expect(categoryEmoji('Gesundheit')).toBe('🩺');
    expect(categoryEmoji('Arzt und Apotheke')).toBe('🩺');
  });

  it.each([
    ['Lebensmittel', '🛒'],
    ['Miete', '🏠'],
    ['Strom', '💡'],
    ['Handy', '📱'],
    ['Auto', '🚗'],
    ['Öffis', '🚆'],
    ['Versicherungen', '🛡'],
    ['Urlaub', '✈'],
    ['Restaurant', '🍽'],
    ['Haushalt', FALLBACK_CATEGORY_EMOJI],
    ['Business', FALLBACK_CATEGORY_EMOJI],
  ])('matches %s', (name, emoji) => {
    expect(categoryEmoji(name)).toBe(emoji);
  });

  it('keeps an explicit icon over the name', () => {
    expect(categoryEmoji('Gesundheit', '🍕')).toBe('🍕');
  });

  it('falls back for unknown names and blank icons', () => {
    expect(categoryEmoji('Xyzzy')).toBe(FALLBACK_CATEGORY_EMOJI);
    expect(categoryEmoji('Gesundheit', '  ')).toBe('🩺');
    expect(categoryEmoji('Xyzzy', null)).toBe(FALLBACK_CATEGORY_EMOJI);
  });
});
