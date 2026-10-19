import { eur } from '../ledger/format';

export type ContactTone = 'plus' | 'minus' | 'zero';

export interface ContactBalanceWords {
  tone: ContactTone;
  /** The direction in words; colour is only the second channel. */
  words: string;
  /** Unsigned amount (the words carry the direction); masked under privacy mode. */
  amount: string;
}

/**
 * Receivable balance of a contact in words. Positive: the contact owes the user (plus, teal);
 * negative: the user owes the contact (minus, orange); zero: settled. Never a minus sign.
 */
export function contactBalanceWords(balanceCents: number): ContactBalanceWords {
  if (balanceCents > 0) return { tone: 'plus', words: 'Schuldet dir', amount: eur(balanceCents) };
  if (balanceCents < 0)
    return { tone: 'minus', words: 'Du schuldest', amount: eur(Math.abs(balanceCents)) };
  return { tone: 'zero', words: 'Ausgeglichen', amount: eur(0) };
}

/** One line for lists and labels: "Schuldet dir 45,00 €", "Du schuldest 12,00 €", "Ausgeglichen". */
export function contactBalanceLine(balanceCents: number): string {
  const { tone, words, amount } = contactBalanceWords(balanceCents);
  return tone === 'zero' ? words : `${words} ${amount}`;
}

/**
 * History amount in the receivable view: an Auslage raises what the contact owes (+), a
 * Rückzahlung or Ausgleich lowers it (−). Ledger movements carry the account's sign.
 */
export const receivableDelta = (movementCents: number): number => -movementCents;
