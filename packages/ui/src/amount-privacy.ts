import { formatEuro as domainEuro, type Cents, type FormatEuroOptions } from '@budget/domain';
import { useSyncExternalStore } from 'react';

export const AMOUNT_PRIVACY_KEY = 'budget-amounts-hidden';
export const HIDDEN_AMOUNT = '•••';
const listeners = new Set<() => void>();
let hidden = false;

export const amountsHidden = () => hidden;
export function setAmountsHidden(value: boolean) {
  hidden = value;
  try {
    localStorage.setItem(AMOUNT_PRIVACY_KEY, value ? '1' : '0');
  } catch {
    /* Device storage may be blocked. */
  }
  listeners.forEach((listener) => listener());
}
export function initAmountPrivacy() {
  try {
    hidden = localStorage.getItem(AMOUNT_PRIVACY_KEY) === '1';
  } catch {
    hidden = false;
  }
}
function changed(event: StorageEvent) {
  if (event.key === AMOUNT_PRIVACY_KEY) {
    hidden = event.newValue === '1';
    listeners.forEach((next) => next());
  }
}
function subscribe(listener: () => void) {
  if (listeners.size === 0) window.addEventListener('storage', changed);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener('storage', changed);
  };
}
/** Display components subscribe without changing their financial data or draft state. */
export function useAmountPrivacy() {
  return useSyncExternalStore(subscribe, amountsHidden, () => false);
}
export const privateAmount = (text: string) => (hidden ? HIDDEN_AMOUNT : text);
export function maskMoneyText(text: string): string {
  if (!hidden) return text;
  return text.replace(
    /[+−-]?\d[\d.,\s]*(?:Mio\.\s*)?(€|EUR|USD|GBP|CHF|JPY|CAD|AUD)(?![A-Z])/g,
    `${HIDDEN_AMOUNT} $1`,
  );
}
/** Presentation only; domain formatting and editable draft values remain deterministic. */
export const formatPrivateEuro = (value: Cents, options?: FormatEuroOptions) =>
  hidden ? `${HIDDEN_AMOUNT} €` : domainEuro(value, options);
