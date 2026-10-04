import type { assignmentSuggestions } from '@budget/db';
import { Button, useToast } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { request } from '../api/http';
import { useBudgetWrite } from '../budget/use-category-writes';
import { errorText } from '../ledger/labels';
import { lookupsQuery, payeesQuery, accountsQuery } from '../ledger/queries';
import { AssignmentEditor } from './rule-editor';
import { bookingAssignmentQuery, learnAssignment } from './api';
import type { AssignmentRuleInput } from '@budget/domain';

export function AssignmentSummary({
  rule,
}: {
  rule: ReturnType<typeof assignmentSuggestions>[number];
}) {
  const lookups = useQuery(lookupsQuery()),
    payees = useQuery(payeesQuery()),
    accounts = useQuery(accountsQuery());
  const category = (id: string | null) =>
    lookups.data?.categories.find((c) => c.id === id)?.name ?? 'Ohne Kategorie / Zu verteilen';
  const a = rule.actions;
  return (
    <div className="assignment-review">
      <strong>{rule.name}</strong>
      {a.payeeId !== undefined && (
        <span>
          Empfänger: {payees.data?.payees.find((p) => p.id === a.payeeId)?.name ?? 'entfernen'}
        </span>
      )}
      {a.categoryId !== undefined && <span>Kategorie: {category(a.categoryId)}</span>}
      {a.splits?.map((s, i) => (
        <span key={i}>
          Split: {category(s.categoryId)} · {s.weightBp / 100} %
        </span>
      ))}
      {a.transferAccountId && (
        <span>
          Umbuchung:{' '}
          {accounts.data?.accounts.find((v) => v.id === a.transferAccountId)?.name ??
            'Gegenkonto nicht verfügbar'}
        </span>
      )}
      {a.memo !== undefined && <span>Notiz: {a.memo || 'entfernen'}</span>}
      {a.flag !== undefined && (
        <span>
          Markierung:{' '}
          {a.flag === null
            ? 'entfernen'
            : (
                {
                  red: 'Rot',
                  orange: 'Orange',
                  yellow: 'Gelb',
                  green: 'Grün',
                  blue: 'Blau',
                  purple: 'Violett',
                } as const
              )[a.flag]}
        </span>
      )}
      {rule.unavailable && <p role="alert">{rule.unavailable}</p>}
    </div>
  );
}

export function BookingAssignmentReview({
  id,
  onApplied,
}: {
  id: string;
  onApplied?: ((canLearn: boolean) => void) | undefined;
}) {
  const query = useQuery(bookingAssignmentQuery(id));
  const [rejected, setRejected] = useState(false),
    [busy, setBusy] = useState(false);
  const write = useBudgetWrite();
  const rule = query.data?.suggestions[0];
  if (!rule || rejected) return null;
  return (
    <section className="assignment-review" aria-label="Zuordnungsvorschlag">
      <AssignmentSummary rule={rule} />
      <Button
        disabled={busy || !!rule.unavailable}
        onClick={() => {
          setBusy(true);
          void write(
            () =>
              request<{ groupId: string }>(
                'POST',
                '/api/assignment-rules/bookings/' + encodeURIComponent(id) + '/apply',
                { ruleId: rule.id, revision: rule.revision },
              ),
            () => 'Zuordnungsvorschlag übernommen.',
          )
            .then((r) => {
              if (r)
                onApplied?.(
                  !rule.actions.transferAccountId &&
                    !!(rule.actions.categoryId || rule.actions.splits),
                );
            })
            .finally(() => setBusy(false));
        }}
      >
        Vorschlag übernehmen
      </Button>
      <Button variant="ghost" onClick={() => setRejected(true)}>
        Vorschlag ablehnen
      </Button>
    </section>
  );
}

export function AssignmentLearnOffer({ bookingId }: { bookingId: string }) {
  const [draft, setDraft] = useState<AssignmentRuleInput | null>(null),
    [busy, setBusy] = useState(false);
  const toast = useToast();
  return (
    <>
      <Button
        variant="ghost"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void learnAssignment(bookingId)
            .then(
              (r) => setDraft(r.draft),
              (e: unknown) => toast.show({ message: errorText(e) }),
            )
            .finally(() => setBusy(false));
        }}
      >
        Regel daraus erstellen
      </Button>
      {draft && <AssignmentEditor initial={draft} onClose={() => setDraft(null)} />}
    </>
  );
}
