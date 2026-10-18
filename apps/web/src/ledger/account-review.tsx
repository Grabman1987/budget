import { Button } from '@budget/ui';
import { lastDayOfMonth, monthOf } from '@budget/domain';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { SettingsFormDialog } from '../pages/settings-form-dialog';
import { canReconcile } from './labels';
import { ManualValue } from './manual-value';
import { ReconcilePanel } from './reconcile-panel';
import { useRegisterToday } from './upcoming-register';
import type { AccountRow } from './types';
import { shortDay } from './format';

/** Shared owner-check actions and dialogs for cash, manual-value and depot headers. */
export function AccountReview({
  account,
  compact = false,
}: {
  account: AccountRow;
  compact?: boolean;
}) {
  const search = useSearch({ strict: false }) as { pruefen?: 'reconcile' | 'value' };
  const navigate = useNavigate();
  const month = monthOf(useRegisterToday());
  const manual = account.type === 'p2p' || account.type === 'other_asset';
  const [checking, setChecking] = useState(false);
  const [updatingValue, setUpdatingValue] = useState(false);
  const badgeLabel = account.lastReconciledOn
    ? `Geprüft ${shortDay(account.lastReconciledOn)}`
    : 'Nie geprüft – jetzt prüfen';
  const closeCheck = () => {
    setChecking(false);
    setUpdatingValue(false);
    if (search.pruefen)
      void navigate({ to: '.', search: { ...search, pruefen: undefined }, replace: true } as never);
  };
  return (
    <>
      {canReconcile(account) && (
        <Button
          variant="ghost"
          className={compact ? 'kacct-review-badge' : undefined}
          aria-label={compact ? `${badgeLabel} · Kontostand prüfen` : undefined}
          data-testid={compact ? 'account-review-badge' : undefined}
          onClick={() => setChecking(true)}
        >
          <CheckCircle2 size={16} strokeWidth={1.75} aria-hidden="true" />
          {compact ? badgeLabel : 'Kontostand prüfen'}
        </Button>
      )}
      {manual && !account.closedAt && (
        <Button variant="ghost" onClick={() => setUpdatingValue(true)}>
          Wert aktualisieren
        </Button>
      )}
      <ReconcilePanel
        account={account}
        open={!account.closedAt && !manual && (checking || search.pruefen === 'reconcile')}
        onClose={closeCheck}
      />
      {manual && (
        <SettingsFormDialog
          open={!account.closedAt && (updatingValue || search.pruefen === 'value')}
          onClose={closeCheck}
          title={`Wert aktualisieren · ${account.name}`}
        >
          <ManualValue
            accountId={account.id}
            end={lastDayOfMonth(month)}
            openingDate={account.openingDate}
            lastReconciledOn={account.lastReconciledOn}
            valueCents={account.manualValueCents ?? account.balanceCents}
            currency={account.currency}
            blockedReason={
              account.hasHoldings
                ? 'Dieses Konto wird über seine Produkte bewertet.'
                : account.closedAt
                  ? 'Dieses Konto ist geschlossen.'
                  : undefined
            }
            onDone={closeCheck}
          />
        </SettingsFormDialog>
      )}
    </>
  );
}
