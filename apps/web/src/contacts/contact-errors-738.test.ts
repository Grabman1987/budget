import { expect, it } from 'vitest';
import { ApiError } from '../api/http';
import { errorText } from '../ledger/labels';

const GUARD = 'Undo the related contact settlement before changing its receipt or allocated outlay';

it('explains the exact existing protected contact-edit refusal in German', () => {
  expect(errorText(new ApiError(422, 'invariant', GUARD))).toBe(
    'Diese Buchung ist bereits einer Rückzahlung zugeordnet. Mache zuerst die zugehörige Rückzahlung rückgängig, bevor du Betrag oder Zuordnung änderst.',
  );
});

it('keeps other codes, statuses and unknown technical invariant details on their existing sanitized path', () => {
  expect(errorText(new ApiError(422, 'invariant', 'Summe stimmt nicht'))).toBe(
    'Summe stimmt nicht',
  );
  expect(errorText(new ApiError(422, 'invariant', 'Some internal server detail'))).toBe(
    'Die Eingabe verletzt eine Regel des Kassenbuchs.',
  );
  expect(errorText(new ApiError(409, 'invariant', GUARD))).toBe(
    'Die Eingabe verletzt eine Regel des Kassenbuchs.',
  );
  expect(errorText(new ApiError(422, 'invalid', GUARD))).toBe('Die Eingabe ist ungültig.');
  expect(errorText(new ApiError(422, 'invariant', `${GUARD}: synthetic-extra-id`))).toBe(
    'Die Eingabe verletzt eine Regel des Kassenbuchs.',
  );
});
