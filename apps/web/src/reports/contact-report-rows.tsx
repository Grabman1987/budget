import type { ContactMovement, OpenContactOutlay } from '@budget/domain';
import { Button, maskMoneyText, useAmountPrivacy } from '@budget/ui';
import { useRef, useState } from 'react';
import {
  ContactBookingSource,
  ContactMovementTable,
  type ContactSourceOpening,
} from '../contacts/contact-movement-table';
import { currentStretchStart } from '../contacts/contact-statement-rows';
import { ContactGiftDialog } from '../contacts/contacts-page';
import { AppLink } from '../shell/app-link';
import { eur } from '../ledger/format';
import type { ContactReportStatement } from './contact-api';
import { ContactBalanceChart } from './contact-chart';

const PAGE_SIZE = 20;

/** Read-only report projection of the shared statement; allocations stay in contact detail. */
export function ContactReportRows({
  statement,
  ready,
}: {
  statement: ContactReportStatement;
  ready: boolean;
}) {
  useAmountPrivacy();
  const [page, setPage] = useState(0);
  const [opening, setOpening] = useState<ContactSourceOpening | null>(null);
  const generation = useRef(0);
  const root = useRef<HTMLDivElement>(null);
  const [giftOutlay, setGiftOutlay] = useState<OpenContactOutlay | null>(null);
  const open = statement.outlays.filter((outlay) => outlay.remainingCents > 0);
  const openIds = new Set(open.map((outlay) => outlay.splitId));
  // Everything since the balance was last zero stays in the main table; older rows are history.
  const stretchStart = currentStretchStart(statement.movements, openIds);
  const current = statement.movements.slice(stretchStart);
  const past = statement.movements.slice(0, stretchStart);
  const lastPage = Math.max(0, Math.ceil(past.length / PAGE_SIZE) - 1);
  const currentPage = Math.min(page, lastPage);
  const settledOutlays = statement.outlays.filter((outlay) => outlay.remainingCents === 0);
  const freeCredit = (statement.credits ?? [])
    .filter((credit) => credit.categoryId === null && credit.remainingCents > 0)
    .reduce((sum, credit) => sum + credit.remainingCents, 0);
  const creditHref = `/konten/kontakte/${encodeURIComponent(statement.contact.id)}`;
  const onOpen = (movement: ContactMovement) =>
    setOpening({ movement, generation: ++generation.current });
  return (
    <div className="r4-contact-rows" ref={root}>
      {ready && (
        <>
          {current.length > 0 ? (
            <ContactMovementTable
              register
              statement={statement}
              movements={current}
              title={`Offen von ${maskMoneyText(statement.contact.name)}`}
              caption={`Offene Forderungen von ${maskMoneyText(statement.contact.name)}`}
              totalCents={open.reduce((sum, outlay) => sum + outlay.remainingCents, 0)}
              creditCents={freeCredit}
              creditHref={creditHref}
              onOpen={onOpen}
              onGift={setGiftOutlay}
            />
          ) : (
            <p>Keine offenen Auslagen.</p>
          )}
          {freeCredit > 0 && current.length === 0 && (
            <p className="r4-contact-credit">
              Guthaben von {maskMoneyText(statement.contact.name)}: {eur(freeCredit)}
              {' · '}
              <AppLink to={creditHref}>Guthaben ändern</AppLink>
            </p>
          )}
          {statement.movements.length > 0 && (
            <ContactBalanceChart statement={statement} height={120} />
          )}
          <details
            className="contacts-closed-history r8-body-disclosure"
            data-r8-detail="contact-history"
          >
            <summary>
              Vergangene Buchungen · beglichen{' '}
              {eur(settledOutlays.reduce((sum, outlay) => sum - outlay.amountCents, 0))}
            </summary>
            {past.length > 0 ? (
              <>
                <ContactMovementTable
                  register
                  statement={statement}
                  movements={past.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)}
                  title="Vergangene Buchungen"
                  heading={false}
                  caption="Vergangene Kontaktbuchungen"
                  onOpen={onOpen}
                  onGift={setGiftOutlay}
                />
                <nav
                  aria-label="Vergangene Kontaktbuchungen blättern"
                  className="contact-section-tools"
                >
                  <Button
                    variant="ghost"
                    disabled={currentPage === 0}
                    onClick={() => setPage(currentPage - 1)}
                  >
                    Zurück
                  </Button>
                  <span>
                    Seite {currentPage + 1} von {lastPage + 1}
                  </span>
                  <Button
                    variant="ghost"
                    disabled={currentPage === lastPage}
                    onClick={() => setPage(currentPage + 1)}
                  >
                    Weiter
                  </Button>
                </nav>
              </>
            ) : (
              <p>Keine vergangenen Buchungen.</p>
            )}
          </details>
        </>
      )}
      {giftOutlay && (
        <ContactGiftDialog
          statement={statement}
          outlay={giftOutlay}
          ready={ready}
          onClose={() => setGiftOutlay(null)}
          onOpenSource={() => {
            onOpen(giftOutlay);
            setGiftOutlay(null);
          }}
        />
      )}
      <ContactBookingSource
        opening={opening}
        onClose={() => {
          const splitId = opening?.movement.splitId;
          setOpening(null);
          requestAnimationFrame(() => {
            const source = [
              ...(root.current?.querySelectorAll<HTMLButtonElement>('[data-contact-source]') ?? []),
            ].find((element) => element.dataset['contactSource'] === splitId);
            source?.focus({ preventScroll: true });
          });
        }}
      />
    </div>
  );
}
