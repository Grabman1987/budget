import { expect, it } from 'vitest';
import { contactReviewNote } from './contacts-page';

it('names flagged contacts and their balance, or stays silent', () => {
  expect(contactReviewNote(undefined)).toBeNull();
  expect(contactReviewNote({ reviewCount: 0, reviewBalanceCents: 0 })).toBeNull();
  expect(contactReviewNote({ reviewCount: 1, reviewBalanceCents: 40_000 })).toMatch(
    /^1 Kontakt mit unklarer Verrechnung · Saldo .*400,00.* nicht in den Summen enthalten$/,
  );
  expect(contactReviewNote({ reviewCount: 2, reviewBalanceCents: -500 })).toMatch(/^2 Kontakte /);
});
