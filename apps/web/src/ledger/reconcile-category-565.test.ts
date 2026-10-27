// @vitest-environment jsdom
import { beforeEach, expect, it } from 'vitest';
import {
  defaultCorrectionCategoryLabel,
  readCorrectionCategory,
  rememberCorrectionCategory,
} from './reconcile-category';

beforeEach(() => localStorage.clear());

it('labels canonical null truthfully for cash, tracking and cards without changing budget policy', () => {
  expect(defaultCorrectionCategoryLabel({ onBudget: true, type: 'checking' })).toBe('Zu verteilen');
  expect(defaultCorrectionCategoryLabel({ onBudget: true, type: 'cash' })).toBe('Zu verteilen');
  expect(defaultCorrectionCategoryLabel({ onBudget: false, type: 'checking' })).toBe(
    'Ohne Kategorie',
  );
  expect(defaultCorrectionCategoryLabel({ onBudget: true, type: 'credit_card' })).toBe(
    'Ohne Kategorie',
  );
});

it('remembers the explicit choice only for its account, including the contextual null choice', () => {
  expect(readCorrectionCategory('a')).toBe('');
  rememberCorrectionCategory('a', 'essen');
  expect(readCorrectionCategory('a')).toBe('essen');
  expect(readCorrectionCategory('b')).toBe('');
  rememberCorrectionCategory('a', '');
  expect(readCorrectionCategory('a')).toBe('');
});
