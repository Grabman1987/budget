import { daysBetween, type TradeConfirmationIntake, type TradeProposalField } from '@budget/domain';
import { useQuery } from '@tanstack/react-query';
import { longDay } from '../ledger/format';
import { unitsText } from '../wealth/portfolio-format';
import { savingsProposalsQuery } from '../wealth/savings-api';
import { sourceMoney } from '../wealth/trade-api';
import { TradePanel } from '../wealth/trade-panel';

const UNREAD = 'nicht sicher gelesen';
const SOURCE: Record<NonNullable<TradeConfirmationIntake['proposal']['source']>, string> = {
  savings_plan: 'Kauf (Sparplanausführung)',
  round_up: 'Kauf (Round up)',
  buy: 'Kauf',
  sell: 'Verkauf',
};

/**
 * What the reader took from a broker trade confirmation, before anything is saved. Fields the
 * reader could not confirm are shown as not read; the trade form leaves them empty.
 */
export function TradeConfirmationSummary({ intake }: { intake: TradeConfirmationIntake }) {
  const { proposal, duplicate } = intake;
  if (duplicate)
    return (
      <p role="alert" className="document-upload-next">
        Diese Abrechnung ist bereits als Handel vom {longDay(duplicate.date)} erfasst. Es wird
        nichts doppelt angelegt.
      </p>
    );
  const open = (field: TradeProposalField) => proposal.open.includes(field);
  const money = (field: TradeProposalField, cents: number | null) =>
    open(field) || cents === null || !proposal.currency
      ? UNREAD
      : sourceMoney(cents, proposal.currency);
  const rows: [string, string][] = [
    ['Handelsart', open('kind') || !proposal.source ? UNREAD : SOURCE[proposal.source]],
    [
      'Instrument',
      proposal.instrument
        ? `${proposal.instrument.name} · ISIN ${proposal.instrument.isin}${
            intake.securityId ? '' : ' (in der App nicht eindeutig angelegt)'
          }`
        : UNREAD,
    ],
    ['Handelsdatum', proposal.date ? longDay(proposal.date) : UNREAD],
    ['Stück', proposal.unitsE8 === null ? UNREAD : unitsText(proposal.unitsE8)],
    ['Bruttobetrag', money('amount', proposal.amountCents)],
    ['Gebühren', money('fee', proposal.feeCents)],
    ['Einbehaltene Steuer', money('tax', proposal.taxCents)],
  ];
  return (
    <section className="document-proposal" aria-label="Gelesene Angaben">
      <p className="document-proposal-note">
        Aus der Abrechnung gelesen. Nichts davon ist gespeichert; „Weiter“ öffnet den Handel als
        Vorschlag.
      </p>
      <dl className="document-proposal-values">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Same window as the savings confirmation: three days around the planned execution day. */
const PLAN_WINDOW_DAYS = 3;

/**
 * Opens the existing trade form with the read values. A savings plan execution whose planned
 * month is still open is confirmed against that plan, so the month counts as executed; every
 * other confirmation becomes a plain trade. Nothing is written before the owner confirms.
 */
export function TradeConfirmationHandoff({
  intake,
  onClose,
}: {
  intake: TradeConfirmationIntake;
  onClose: () => void;
}) {
  const { proposal } = intake;
  const planned =
    proposal.source === 'savings_plan' && proposal.kind === 'buy' && !!intake.securityId;
  const plans = useQuery({ ...savingsProposalsQuery(), enabled: planned });
  if (planned && plans.isPending) return <p role="status">Sparpläne werden geprüft …</p>;
  const matches =
    planned && proposal.date
      ? (plans.data?.proposals ?? []).filter(
          (row) =>
            row.securityId === intake.securityId &&
            row.currency === proposal.currency &&
            Math.abs(daysBetween(row.date, proposal.date!)) <= PLAN_WINDOW_DAYS,
        )
      : [];
  const plan = matches.length === 1 ? matches[0] : undefined;
  const note = !planned
    ? undefined
    : plans.isError
      ? 'Die offenen Sparplanausführungen konnten nicht geladen werden. Der Handel wird ohne Zuordnung zum Sparplan erfasst.'
      : plan
        ? undefined
        : 'Keine eindeutig passende offene Sparplanausführung gefunden. Der Handel wird ohne Zuordnung zum Sparplan erfasst.';
  return (
    <TradePanel
      id="neu"
      proposal={plan}
      prefill={intake}
      prefillNote={note}
      onClose={onClose}
      onSaved={onClose}
    />
  );
}
