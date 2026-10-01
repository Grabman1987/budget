import { ACC } from './master-data';
import type { SampleLedger } from './types';

/**
 * Opt-in contacts scenario: Auslagen paid for contacts, one repayment, one subscription passed
 * through at 100 % and the monthly contribution of the housemate. It is NOT part of the parity
 * ledger (`sampleLedger()`): Auslagen move cash and would change every figure that is compared
 * with the prototype. Tests and the e2e "contacts" server add it with `withContactsScenario`.
 *
 * With "today" 17.09.2026 the contacts end up like this:
 * - Kontakt L. Beispiel: Auslagen of 132,27 €, repaid 50,00 €, open 82,27 € over four items;
 *   the video subscription (12,99 € on the 20th) is passed through at 100 %.
 * - Kontakt M. Muster: one Auslage of 27,50 €; the contribution of 800,00 € on the 1st is expected
 *   (the payee of "Beitrag zum Haushalt" is this contact).
 */

export const SCENARIO = {
  contactLena: 'con-lena',
  contactMuster: 'con-muster',
  group: 'grp-auslagen',
  category: 'cat-auslagen',
  subscription: 'ep-abo-lena',
} as const;

interface Share {
  key: string;
  date: string;
  accountId: string;
  /** Cash flow: negative = Auslage, positive = repayment. */
  amountCents: number;
  contactId: string;
  memo: string;
}

const SHARES: Share[] = [
  {
    key: 'abo-jun',
    date: '2026-06-20',
    accountId: ACC.karte,
    amountCents: -1299,
    contactId: SCENARIO.contactLena,
    memo: 'Video-Abo Juni',
  },
  {
    key: 'baumarkt',
    date: '2026-07-12',
    accountId: ACC.giro,
    amountCents: -5490,
    contactId: SCENARIO.contactLena,
    memo: 'Baumarkt Einkauf',
  },
  {
    key: 'abo-jul',
    date: '2026-07-20',
    accountId: ACC.karte,
    amountCents: -1299,
    contactId: SCENARIO.contactLena,
    memo: 'Video-Abo Juli',
  },
  {
    key: 'essen',
    date: '2026-08-09',
    accountId: ACC.giro,
    amountCents: -3840,
    contactId: SCENARIO.contactLena,
    memo: 'Essen Geburtstag',
  },
  {
    key: 'abo-aug',
    date: '2026-08-20',
    accountId: ACC.karte,
    amountCents: -1299,
    contactId: SCENARIO.contactLena,
    memo: 'Video-Abo August',
  },
  {
    key: 'rueckzahlung',
    date: '2026-08-28',
    accountId: ACC.giro,
    amountCents: 5000,
    contactId: SCENARIO.contactLena,
    memo: 'Rückzahlung',
  },
  {
    key: 'getraenke',
    date: '2026-09-04',
    accountId: ACC.giro,
    amountCents: -2750,
    contactId: SCENARIO.contactMuster,
    memo: 'Getränke Feier',
  },
];

/** The sample ledger plus the contacts scenario (a new object; the input is not changed). */
export function withContactsScenario(ledger: SampleLedger): SampleLedger {
  return {
    ...ledger,
    contacts: [
      ...ledger.contacts,
      { id: SCENARIO.contactLena, name: 'Kontakt L. Beispiel', note: 'Teilt Abos und Einkäufe' },
    ],
    categoryGroups: [
      ...ledger.categoryGroups,
      { id: SCENARIO.group, name: 'Auslagen', sortOrder: 90 },
    ],
    categories: [
      ...ledger.categories,
      {
        id: SCENARIO.category,
        name: 'Auslagen',
        groupId: SCENARIO.group,
        class: null,
        kind: 'advance',
        stage: 2,
        sortOrder: 900,
      },
    ],
    bookings: [
      ...ledger.bookings,
      ...SHARES.map((s) => ({
        id: `bk-contact-${s.key}`,
        accountId: s.accountId,
        date: s.date,
        amountCents: s.amountCents,
        memo: s.memo,
        status: 'confirmed' as const,
        source: 'manual' as const,
        importKey: `sample-contact-${s.key}`,
      })),
    ],
    splits: [
      ...ledger.splits,
      ...SHARES.map((s) => ({
        id: `bk-contact-${s.key}-s1`,
        bookingId: `bk-contact-${s.key}`,
        categoryId: SCENARIO.category,
        amountCents: s.amountCents,
        contactId: s.contactId,
        sortOrder: 0,
      })),
    ],
    expectedPayments: [
      ...ledger.expectedPayments,
      {
        id: SCENARIO.subscription,
        name: 'Video-Abo (Kontakt)',
        kind: 'outflow',
        accountId: ACC.karte,
        contactId: SCENARIO.contactLena,
        categoryId: SCENARIO.category,
        contactShareBp: 10_000,
        rhythm: 'monthly',
        dueDay: 20,
        startDate: '2026-06-01',
      },
    ],
    expectedPaymentVersions: [
      ...ledger.expectedPaymentVersions,
      {
        id: `${SCENARIO.subscription}-v1`,
        expectedPaymentId: SCENARIO.subscription,
        validFrom: '2026-06-01',
        amountCents: 1299,
        currency: 'EUR',
      },
    ],
  };
}
