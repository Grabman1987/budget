import { Button, useAmountPrivacy } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { eur } from '../ledger/format';
import { ErrorNote, LoadingNote } from '../ledger/states';
import { monthLabel } from '../nav/month';
import { payrollQuery } from './payroll-projects-api';
import { PayslipPanel, PayslipUploadDialog } from './payslip-panel';

/** The income page owns upload/review; report pages remain analytical destinations. */
export function IncomePayslips({ month }: { month: string }) {
  useAmountPrivacy();
  const query = useQuery(payrollQuery(month));
  const [editing, setEditing] = useState<string | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const restoreFocus = useRef(false);
  const data = query.data;
  const slips = data?.captured.filter((slip) => slip.month === month) ?? [];
  const selected = data?.captured.find((slip) => slip.id === editing);
  const close = () => {
    restoreFocus.current = true;
    setEditing(null);
  };
  useEffect(() => {
    if (editing === null && restoreFocus.current) {
      restoreFocus.current = false;
      if (opener.current?.isConnected) opener.current.focus({ preventScroll: true });
    }
  }, [editing]);
  return (
    <section className="income-payslips" aria-labelledby="income-payslips-title">
      <div className="income-payslips-head">
        <h2 id="income-payslips-title">Gehaltszettel · {monthLabel(month)}</h2>
        <Button
          variant="ghost"
          onClick={(event) => {
            opener.current = event.currentTarget;
            setEditing('upload');
          }}
        >
          Gehaltszettel hochladen
        </Button>
      </div>
      {query.isPending && <LoadingNote what="Gehaltszettel" />}
      {query.isError && (
        <ErrorNote what="Gehaltszettel" error={query.error} onRetry={() => void query.refetch()} />
      )}
      {data && !slips.length && <p>Für diesen Monat sind keine Gehaltszettel erfasst.</p>}
      {slips.length > 0 && (
        <ul className="income-payslips-list">
          {slips.map((slip) => (
            <li key={slip.id}>
              <span>
                {slip.kind === 'regular'
                  ? 'Laufendes Gehalt'
                  : slip.specialType === 'salary13'
                    ? '13. Gehalt'
                    : slip.specialType === 'salary14'
                      ? '14. Gehalt'
                      : 'Sonderzahlung'}
              </span>
              <strong className="income-payslip-amount">{eur(slip.netCents)}</strong>
              <Button
                variant="ghost"
                onClick={(event) => {
                  opener.current = event.currentTarget;
                  setEditing(slip.id);
                }}
              >
                Gehaltszettel öffnen
              </Button>
            </li>
          ))}
        </ul>
      )}
      <p className="panel-sub">
        Offene oder nicht eindeutige PDF-Angaben bleiben unter Prüfen verfügbar.
      </p>
      {editing === 'upload' && <PayslipUploadDialog onClose={close} />}
      {selected && data && (
        <PayslipPanel
          key={selected.id}
          initial={selected}
          month={month}
          candidates={data.candidates}
          onClose={close}
        />
      )}
    </section>
  );
}
