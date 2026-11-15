import { classifyRiskProfile } from '@budget/domain';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { LEVEL_TEXT } from '../pages/risk-profile-section';
import { profileQuery } from '../shell/use-profile';

/**
 * Quiet, read-only reminder of the stored risk profile (#812). It only displays the existing
 * classification; it never changes allocation targets, savings plans or any computed figure.
 * Unknown stays "nicht erfasst". Renders nothing while loading or when the profile is unavailable.
 */
export function PortfolioRiskContext() {
  const query = useQuery(profileQuery());
  if (!query.data?.risk) return null;
  const result = classifyRiskProfile(query.data.risk);
  const text = (level: keyof typeof LEVEL_TEXT) =>
    level === 'unknown' ? 'nicht erfasst' : LEVEL_TEXT[level];
  return (
    <p className="vnote portfolio-risk-context" data-testid="portfolio-risk-context">
      Risikobereitschaft: {text(result.tolerance.level)} · Risikotragfähigkeit:{' '}
      {text(result.capacity.level)}. Nur zur Einordnung, Zielverteilungen bleiben unverändert.{' '}
      <Link to="/einstellungen/profil">Im Profil ansehen</Link>
    </p>
  );
}
