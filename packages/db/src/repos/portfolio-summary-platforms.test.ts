import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { account, assetClass, holding, institution, price, security } from '../schema';
import { portfolioSummary } from './portfolio-summary';
import { loadFacts, ruleInputs } from './rule-inputs';
import { seedBasics } from './test-helpers';

const E8 = 100_000_000;
const DAY = '2026-02-01';
let opened: OpenedDatabase;

function addInstitution(id: string, name: string) {
  opened.db.insert(institution).values({ id, name, kind: 'broker' }).run();
}

function addBrokerAccount(id: string, institutionId: string | null) {
  opened.db
    .insert(account)
    .values({
      id,
      name: id,
      type: 'brokerage',
      role: 'investment',
      onBudget: false,
      institutionId,
      currency: 'EUR',
      openingDate: '2023-10-01',
    })
    .run();
}

function addSecurity(
  id: string,
  kind: 'etf' | 'crypto' | 'p2p',
  issuerId: string | null,
  classId: string,
) {
  opened.db
    .insert(security)
    .values({ id, name: id, kind, currency: 'EUR', institutionId: issuerId, assetClassId: classId })
    .run();
}

function addHoldings(securityId: string, accounts: string[]) {
  opened.db
    .insert(price)
    .values({
      securityId,
      date: DAY,
      priceMicro: 100_000_000,
      currency: 'EUR',
      source: 'manual',
    })
    .run();
  for (const accountId of accounts) {
    opened.db
      .insert(holding)
      .values({
        id: `${securityId}-${accountId}`,
        securityId,
        accountId,
        asOf: DAY,
        unitsE8: E8,
        costBasisCents: 10_000,
      })
      .run();
  }
}

beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
  opened.db.insert(assetClass).values({ id: 'world', name: 'World equities' }).run();
  addInstitution('issuer', 'Security issuer');
  addInstitution('broker-a', 'Broker A');
  addInstitution('broker-b', 'Broker B');
  addBrokerAccount('account-a', 'broker-a');
  addBrokerAccount('account-b', 'broker-b');
  addBrokerAccount('account-unassigned', null);
});

afterEach(() => opened.close());

describe('account ownership in portfolio platforms and risk', () => {
  it('splits one ETF across broker shares while keeping one security and one class total', () => {
    addSecurity('shared-etf', 'etf', 'issuer', 'world');
    addHoldings('shared-etf', ['account-a', 'account-b']);

    const summary = portfolioSummary(opened.db, { today: DAY });
    const line = summary.positions[0];
    expect(line).toMatchObject({
      securityId: 'shared-etf',
      institutionId: 'issuer',
      valueCents: 20_000,
      unitsE8: 2 * E8,
      accounts: [
        { accountId: 'account-a', institutionId: 'broker-a', valueCents: 10_000 },
        { accountId: 'account-b', institutionId: 'broker-b', valueCents: 10_000 },
      ],
    });
    expect(summary.classes).toMatchObject([{ assetClassId: 'world', valueCents: 20_000 }]);
    expect(summary.platforms).toEqual([
      { institutionId: 'broker-a', name: 'Broker A', valueCents: 10_000, shareBp: 5_000 },
      { institutionId: 'broker-b', name: 'Broker B', valueCents: 10_000, shareBp: 5_000 },
    ]);
    expect(summary.cluster.platforms).toEqual([]);
    expect(summary.cluster.singles).toEqual([]);
  });

  it('uses the account institution for R14 crypto platform concentration and keeps one title', () => {
    addSecurity('shared-crypto', 'crypto', 'issuer', 'world');
    addHoldings('shared-crypto', ['account-a', 'account-b']);

    const summary = portfolioSummary(opened.db, { today: DAY });
    expect(summary.cluster.totalCents).toBe(20_000);
    expect(summary.cluster.singles).toEqual([
      { id: 'shared-crypto', valueCents: 20_000, shareBp: 10_000, breach: true },
    ]);
    expect(summary.cluster.platforms).toEqual([
      { id: 'broker-a', valueCents: 10_000, shareBp: 5_000, breach: true },
      { id: 'broker-b', valueCents: 10_000, shareBp: 5_000, breach: true },
    ]);
    expect(summary.proposals.filter((proposal) => proposal.code === 'r14_platform')).toHaveLength(
      2,
    );
  });

  it('keeps the existing 20 percent P2P platform limit for account-level holdings', () => {
    addSecurity('shared-p2p', 'p2p', 'issuer', 'world');
    addHoldings('shared-p2p', ['account-a', 'account-b']);

    const summary = portfolioSummary(opened.db, { today: DAY });
    expect(summary.cluster.platforms).toEqual([
      { id: 'broker-a', valueCents: 10_000, shareBp: 5_000, breach: true },
      { id: 'broker-b', valueCents: 10_000, shareBp: 5_000, breach: true },
    ]);
    expect(summary.cluster.limits.platformBp).toBe(2_000);
  });

  it('keeps an unassigned account separate from the security issuer', () => {
    addSecurity('unassigned-etf', 'etf', 'issuer', 'world');
    addHoldings('unassigned-etf', ['account-unassigned']);

    const summary = portfolioSummary(opened.db, { today: DAY });
    expect(summary.positions[0]).toMatchObject({
      institutionId: 'issuer',
      accounts: [{ accountId: 'account-unassigned', institutionId: null, valueCents: 10_000 }],
    });
    expect(summary.platforms).toEqual([
      { institutionId: null, name: 'Ohne Plattform', valueCents: 10_000, shareBp: 10_000 },
    ]);
  });

  it('supplies account institutions to rule inputs instead of issuer institutions', () => {
    addSecurity('rules-crypto', 'crypto', 'issuer', 'world');
    addHoldings('rules-crypto', ['account-a', 'account-b']);

    const facts = loadFacts(opened.db, DAY);
    const inputs = ruleInputs(opened.db, DAY, facts);
    expect(inputs.positions).toEqual([
      expect.objectContaining({
        id: 'account-a:rules-crypto',
        securityId: 'rules-crypto',
        valueCents: 10_000,
        platform: 'broker-a',
      }),
      expect.objectContaining({
        id: 'account-b:rules-crypto',
        securityId: 'rules-crypto',
        valueCents: 10_000,
        platform: 'broker-b',
      }),
    ]);
  });

  it('keeps an unassigned rule-input position unassigned when the security has an issuer', () => {
    addSecurity('rules-unassigned-etf', 'etf', 'issuer', 'world');
    addHoldings('rules-unassigned-etf', ['account-unassigned']);

    const facts = loadFacts(opened.db, DAY);
    const inputs = ruleInputs(opened.db, DAY, facts);
    expect(inputs.positions).toContainEqual(
      expect.objectContaining({
        id: 'account-unassigned:rules-unassigned-etf',
        securityId: 'rules-unassigned-etf',
        valueCents: 10_000,
        platform: null,
      }),
    );
  });
});
