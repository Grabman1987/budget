import type { Period } from '@budget/domain';
import { AppLink } from '../shell/app-link';

export const PORTFOLIO_REGISTERS = [
  { key: 'overview', label: 'Übersicht', path: '/vermoegen/portfolio' },
  { key: 'positions', label: 'Positionen', path: '/vermoegen/portfolio/positionen' },
  { key: 'allocation', label: 'Allokation', path: '/vermoegen/portfolio/allokation' },
  { key: 'savings', label: 'Sparpläne', path: '/vermoegen/portfolio/sparplaene' },
  { key: 'metrics', label: 'Kennzahlen', path: '/vermoegen/portfolio/kennzahlen' },
] as const;
export type PortfolioRegister = (typeof PORTFOLIO_REGISTERS)[number]['key'];
export function portfolioRegisterPath(key: PortfolioRegister) {
  return PORTFOLIO_REGISTERS.find((entry) => entry.key === key)!.path;
}

/** Real routes: reload/back work independently of the selected register. */
export function PortfolioRegisters({ current, period }: { current: PortfolioRegister; period: Period }) {
  return <nav className="portfolio-registers" aria-label="Portfolio-Register">
    {PORTFOLIO_REGISTERS.map((entry) => <AppLink key={entry.key} to={entry.path}
      search={{ zeitraum: period }} aria-current={entry.key === current ? 'page' : undefined}>
      {entry.label}
    </AppLink>)}
  </nav>;
}
