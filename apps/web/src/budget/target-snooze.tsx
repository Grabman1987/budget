import { Button, FormDialog, useAmountPrivacy } from '@budget/ui';
import { useState } from 'react';
import { request } from '../api/http';
import { monthLabel } from '../nav/month';
import { useBudgetWrite } from './use-category-writes';

/** A month-specific confirmation changes only the audited target exemption. */
export function TargetSnooze({ month, categoryId, snoozed, weekly = false, disabled = false }: {
  month: string; categoryId: string; snoozed: boolean; weekly?: boolean; disabled?: boolean;
}) {
  useAmountPrivacy();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const write = useBudgetWrite();
  const targetName = weekly ? 'Wochenziel' : 'Monatsziel';
  const apply = async () => {
    if (busy || disabled) return;
    setBusy(true);
    try {
      if (await write(() => request<{ groupId: string }>('POST', `/api/budget/${month}/target-snoozes`, {
        categoryId, snoozed: !snoozed,
      }), () => snoozed ? `${targetName} wieder aktiviert.` : `${targetName} für diesen Monat ausgesetzt.`)) setOpen(false);
    } finally { setBusy(false); }
  };
  return <>
    <Button variant="ghost" disabled={disabled} onClick={() => setOpen(true)}>
      {snoozed ? `${targetName} diesen Monat wieder aktivieren` : `${targetName} diesen Monat aussetzen`}
    </Button>
    {open && <FormDialog open title={snoozed ? `${targetName} wieder aktivieren` : `${targetName} aussetzen`}
      onClose={() => setOpen(false)} beforeClose={() => !busy}>
      <div className="kform">
        <p>Nur {monthLabel(month)}: {snoozed ? 'Der reguläre Zielbedarf gilt wieder.' : 'Der Zielbedarf wird für diesen Monat ausgenommen.'}
          {' '}Zuweisung, Übertrag, Aktivität und verfügbares Geld bleiben erhalten. Andere Monate und Zielversionen ändern sich nicht.</p>
        <div className="panel-actions">
          <Button disabled={busy || disabled} onClick={() => void apply()}>Übernehmen</Button>
          <Button variant="ghost" disabled={busy} onClick={() => setOpen(false)}>Abbrechen</Button>
        </div>
      </div>
    </FormDialog>}
  </>;
}
