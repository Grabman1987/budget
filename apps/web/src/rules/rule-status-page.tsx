import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate, useParams, useRouter, useSearch } from '@tanstack/react-router';
import { useEffect } from 'react';
import { EINSTELLUNGEN_REGELWERK } from '../nav/pages';
import { PageFrame } from '../pages/placeholder-page';
import { ErrorNote, LoadingNote } from '../ledger/states';
import { AppLink } from '../shell/app-link';
import { RulePanel } from './rule-panel';
import { RuleStatusContent } from './rule-status-content';
import { rulesQuery, RULES_KEY } from './use-rule-writes';
import { evaluateRules } from './api';
import { RULE_FIELDS } from './rules-model';

export function RuleStatusPage() {
  const { code } = useParams({ strict: false }) as { code: string };
  const { bearbeiten, monat } = useSearch({ strict: false }) as {
    bearbeiten?: boolean;
    monat?: string;
  };
  const state = useLocation({ select: (location) => location.state });
  const router = useRouter();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const query = useQuery(rulesQuery());
  useEffect(() => {
    void evaluateRules()
      .then(() => qc.invalidateQueries({ queryKey: RULES_KEY }))
      .catch(() => undefined);
  }, [qc]);
  const rule = query.data?.rules.find((r) => r.code === code);
  const title = rule ? `${rule.code} ${rule.name}` : 'Regel';
  const close = () => {
    if (!bearbeiten) return;
    if (state.panelOpenedInApp) router.history.back();
    else
      void navigate({
        to: '/einstellungen/regelwerk/$code',
        params: { code },
        search: { monat },
        replace: true,
        state: { ruleDetailOpenedInApp: state.ruleDetailOpenedInApp === true },
      });
  };
  return (
    <PageFrame meta={EINSTELLUNGEN_REGELWERK} title={title}>
      <div className="kview rw">
        <nav aria-label="Brotkrumen">
          <AppLink to="/einstellungen">Einstellungen</AppLink>
          {' › '}
          <AppLink to="/einstellungen/regelwerk" search={{ monat }}>
            Regelwerk
          </AppLink>
          {' › '}
          <span aria-current="page">{title}</span>
        </nav>
        <AppLink
          className="btn btn-ghost"
          to="/einstellungen/regelwerk"
          search={{ monat }}
          onClick={(event) => {
            if (
              state.ruleDetailOpenedInApp &&
              !event.ctrlKey &&
              !event.metaKey &&
              !event.shiftKey &&
              !event.altKey
            ) {
              event.preventDefault();
              router.history.back();
            }
          }}
        >
          Zurück zum Regelwerk
        </AppLink>
        {query.isPending && <LoadingNote what="Regel" />}
        {query.isError && (
          <ErrorNote what="Regel" error={query.error} onRetry={() => void query.refetch()} />
        )}
        {query.data && !query.isError && !rule && <p>Diese Regel ist nicht verfügbar.</p>}
        {rule && !query.isError && (
          <>
            <RuleStatusContent rule={rule} />
            {(RULE_FIELDS[rule.code] ?? []).length > 0 && (
              <AppLink
                className="btn btn-ghost"
                to={`/einstellungen/regelwerk/${code}`}
                search={{ monat, bearbeiten: true }}
                state={{
                  ruleDetailOpenedInApp: state.ruleDetailOpenedInApp === true,
                  panelOpenedInApp: true,
                }}
              >
                Schwellen bearbeiten
              </AppLink>
            )}
          </>
        )}
      </div>
      <RulePanel rule={bearbeiten && !query.isError ? (rule ?? null) : null} onClose={close} />
    </PageFrame>
  );
}
