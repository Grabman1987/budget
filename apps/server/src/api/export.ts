import {
  accountSummaries,
  holdingValuationExportAsOf,
  positionCostDetailsAsOf,
  queryBookings,
  sqliteOf,
  type Db,
} from '@budget/db';
import { and, asc, desc, eq, inArray, isNull, lte } from 'drizzle-orm';
import { chmodSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import yazl from 'yazl';
import { admitExport } from './export-admission';
import {
  account,
  assetClass,
  assetClassTarget,
  booking,
  bookingSplit,
  fxRate,
  holding,
  incomeType,
  institution,
  openDatabase,
  price,
  security,
  savingsPlan,
  trade,
  valuation,
} from '@budget/db';
import { Hono, type MiddlewareHandler } from 'hono';

type Cell = string | number | boolean | null | undefined;
type CsvRows = AsyncIterable<readonly Cell[]> | Iterable<readonly Cell[]>;

const csvText = (value: Cell): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? '1' : '0';
  const text = String(value);
  return /^[\p{White_Space}\p{Cc}]*[=+\-@]/u.test(text) ? `'${text}` : text;
};

const csvLine = (row: readonly Cell[]): string =>
  `${row
    .map((value) => {
      const text = csvText(value);
      return typeof value === 'number' || typeof value === 'boolean'
        ? text
        : `"${text.replaceAll('"', '""')}"`;
    })
    .join(';')}\r\n`;

async function* csv(header: readonly string[], rows: CsvRows): AsyncGenerator<string> {
  yield `\uFEFF${csvLine(header)}`;
  for await (const row of rows) yield csvLine(row);
}

const nullable = (n: number | null | undefined): number | null => n ?? null;

function bookingRows(db: Db): AsyncIterable<readonly Cell[]> {
  const incomeTypes = new Map(
    db
      .select()
      .from(incomeType)
      .all()
      .map((x) => [x.id, x.name]),
  );
  return (async function* () {
    let cursor: string | undefined;
    const splitIndex = new Map<string, number>();
    do {
      const page = queryBookings(db, {
        sort: 'date',
        direction: 'asc',
        limit: 200,
        ...(cursor ? { cursor } : {}),
      });
      const wholeTransferIds = new Map(
        page.items.length
          ? db
              .select({ id: booking.id, transferId: booking.transferId })
              .from(booking)
              .where(
                inArray(
                  booking.id,
                  page.items.map((item) => item.id),
                ),
              )
              .all()
              .map(({ id, transferId }) => [id, transferId] as const)
          : [],
      );
      const transferIds = [
        ...new Set(
          page.items.flatMap((item) =>
            [wholeTransferIds.get(item.id), ...item.splits.map((split) => split.transferId)].filter(
              (id): id is string => id !== null && id !== undefined,
            ),
          ),
        ),
      ];
      const legs = new Map<string, Array<{ bookingId: string; accountId: string }>>();
      if (transferIds.length) {
        const wholeLegs = db
          .select({
            transferId: booking.transferId,
            bookingId: booking.id,
            accountId: booking.accountId,
          })
          .from(booking)
          .where(and(isNull(booking.deletedAt), inArray(booking.transferId, transferIds)))
          .all();
        const splitLegs = db
          .select({
            transferId: bookingSplit.transferId,
            bookingId: booking.id,
            accountId: booking.accountId,
          })
          .from(bookingSplit)
          .innerJoin(booking, eq(booking.id, bookingSplit.bookingId))
          .where(and(isNull(booking.deletedAt), inArray(bookingSplit.transferId, transferIds)))
          .all();
        for (const leg of [...wholeLegs, ...splitLegs]) {
          if (!leg.transferId) continue;
          legs.set(leg.transferId, [...(legs.get(leg.transferId) ?? []), leg]);
        }
      }
      for (const item of page.items) {
        const splits = item.splits.length ? item.splits : [null];
        const wholeTransferId = wholeTransferIds.get(item.id) ?? null;
        for (const split of splits) {
          const index = (splitIndex.get(item.id) ?? 0) + 1;
          splitIndex.set(item.id, index);
          const transferId = split ? (split.transferId ?? wholeTransferId) : wholeTransferId;
          const counterAccountId = transferId
            ? (legs.get(transferId)?.find((leg) => leg.bookingId !== item.id)?.accountId ??
              (transferId === wholeTransferId ? item.transferAccountId : null))
            : null;
          yield [
            item.id,
            index,
            item.accountId,
            item.accountName,
            item.date,
            item.status,
            item.amountCents,
            split?.amountCents ?? item.amountCents,
            item.currency,
            item.originalAmountCents,
            item.originalCurrency,
            item.payeeName,
            split?.categoryId,
            split?.categoryName,
            split?.incomeTypeId ? incomeTypes.get(split.incomeTypeId) : null,
            transferId,
            counterAccountId,
            split?.memo ?? item.memo,
            item.flag,
            split?.id,
            split?.contactId,
            split?.incomeTypeId,
            item.payeeId,
            item.projectId,
            item.source,
            item.memo,
            item.fxRateMicro,
            item.fxFeeCents,
          ];
        }
      }
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
  })();
}

function exportEntries(
  db: Db,
  asOf: string,
): Array<{ name: string; header: string[]; rows: CsvRows }> {
  const accounts = accountSummaries(db, asOf);
  const institutions = new Map(
    db
      .select({ id: institution.id, name: institution.name })
      .from(institution)
      .all()
      .map((x) => [x.id, x.name]),
  );
  const liveAccountIds = new Set(accounts.map((x) => x.id));
  const accountCurrency = new Map(accounts.map((x) => [x.id, x.currency]));
  const securityRows = db
    .select({ security, assetClassName: assetClass.name, institutionName: institution.name })
    .from(security)
    .leftJoin(assetClass, eq(security.assetClassId, assetClass.id))
    .leftJoin(institution, eq(security.institutionId, institution.id))
    .where(isNull(security.deletedAt))
    .orderBy(asc(security.id))
    .all();
  const classes = db
    .select()
    .from(assetClass)
    .where(isNull(assetClass.deletedAt))
    .orderBy(asc(assetClass.sortOrder), asc(assetClass.id))
    .all();
  const securityNames = new Map(securityRows.map(({ security: s }) => [s.id, s.name]));
  const securityMetadata = new Map(
    securityRows.map(({ security: s, assetClassName }) => [
      s.id,
      { kind: s.kind, isin: s.isin, symbol: s.symbol, assetClassName },
    ]),
  );
  const holdings = holdingValuationExportAsOf(db, asOf);
  const positionCosts = new Map(
    positionCostDetailsAsOf(db, asOf, holdings).map((detail) => [
      `${detail.accountId}\0${detail.securityId}`,
      detail,
    ]),
  );
  const valued = holdings.values;
  const positionRows = [
    ...valued
      .filter((h) => liveAccountIds.has(h.accountId))
      .map((h) => {
        const meta = securityMetadata.get(h.securityId);
        const cost = positionCosts.get(`${h.accountId}\0${h.securityId}`);
        const line = db
          .select()
          .from(price)
          .where(and(eq(price.securityId, h.securityId), lte(price.date, asOf)))
          .orderBy(desc(price.date))
          .limit(1)
          .get();
        return [
          h.accountId,
          h.securityId,
          securityNames.get(h.securityId),
          meta?.kind,
          meta?.isin,
          meta?.symbol,
          meta?.assetClassName,
          h.unitsE8,
          line!.date,
          h.priceMicro,
          h.priceCurrency,
          h.valueCents,
          cost?.costCents ?? null,
          cost?.gainCents ?? null,
          accountCurrency.get(h.accountId),
          'market_price_fx_converted_to_eur',
          cost?.missingFxCurrency ?? '',
          cost?.basisStatus ?? 'undocumented',
        ];
      }),
    ...holdings.missingPricePositions
      .filter((h) => liveAccountIds.has(h.accountId))
      .map((h) => {
        const meta = securityMetadata.get(h.securityId);
        const cost = positionCosts.get(`${h.accountId}\0${h.securityId}`);
        return [
          h.accountId,
          h.securityId,
          securityNames.get(h.securityId),
          meta?.kind,
          meta?.isin,
          meta?.symbol,
          meta?.assetClassName,
          h.unitsE8,
          null,
          null,
          null,
          null,
          cost?.costCents ?? null,
          null,
          accountCurrency.get(h.accountId),
          'missing_price',
          cost?.missingFxCurrency ?? '',
          cost?.basisStatus ?? 'undocumented',
        ];
      }),
    ...holdings.missingFxPositions
      .filter((h) => liveAccountIds.has(h.accountId))
      .map((h) => {
        const meta = securityMetadata.get(h.securityId);
        const cost = positionCosts.get(`${h.accountId}\0${h.securityId}`);
        return [
          h.accountId,
          h.securityId,
          securityNames.get(h.securityId),
          meta?.kind,
          meta?.isin,
          meta?.symbol,
          meta?.assetClassName,
          h.unitsE8,
          h.priceDate || null,
          h.priceMicro,
          h.priceCurrency,
          null,
          cost?.costCents ?? null,
          null,
          accountCurrency.get(h.accountId),
          'missing_fx',
          [...new Set([h.priceCurrency, cost?.missingFxCurrency].filter(Boolean))].sort().join('|'),
          cost?.basisStatus ?? 'undocumented',
        ];
      }),
  ].sort(
    (a, b) => String(a[0]).localeCompare(String(b[0])) || String(a[1]).localeCompare(String(b[1])),
  );

  const pricesRows = (async function* (): AsyncGenerator<readonly Cell[]> {
    const query = sqliteOf(db).prepare(`
      SELECT p.security_id AS securityId, p.date AS date, p.price_micro AS priceMicro,
             p.currency AS currency, p.source AS source
      FROM price p JOIN security s ON s.id = p.security_id
      WHERE s.deleted_at IS NULL ORDER BY p.security_id, p.date
    `);
    for (const row of query.iterate() as Iterable<{
      securityId: string;
      date: string;
      priceMicro: number;
      currency: string;
      source: string;
    }>)
      yield [row.securityId, row.date, row.priceMicro, row.currency, row.source];
  })();

  const tradesRows = db
    .select({
      trade,
      accountName: account.name,
      securityName: security.name,
      currency: account.currency,
    })
    .from(trade)
    .innerJoin(account, eq(trade.accountId, account.id))
    .innerJoin(security, eq(trade.securityId, security.id))
    .where(and(isNull(trade.deletedAt), isNull(account.deletedAt), isNull(security.deletedAt)))
    .orderBy(asc(trade.date), asc(trade.id))
    .all();
  const holdingRows = db
    .select({
      holding,
      accountName: account.name,
      securityName: security.name,
      currency: account.currency,
    })
    .from(holding)
    .innerJoin(account, eq(holding.accountId, account.id))
    .innerJoin(security, eq(holding.securityId, security.id))
    .where(and(isNull(holding.deletedAt), isNull(account.deletedAt), isNull(security.deletedAt)))
    .orderBy(asc(holding.accountId), asc(holding.securityId), asc(holding.asOf))
    .all();
  const valuationRows = db
    .select({ valuation, accountName: account.name })
    .from(valuation)
    .innerJoin(account, eq(valuation.accountId, account.id))
    .where(and(isNull(valuation.deletedAt), isNull(account.deletedAt)))
    .orderBy(asc(valuation.accountId), asc(valuation.date))
    .all();
  const fxRows = db.select().from(fxRate).orderBy(asc(fxRate.currency), asc(fxRate.date)).all();
  const savingsPlanRows = db
    .select({ savingsPlan, accountCurrency: account.currency })
    .from(savingsPlan)
    .innerJoin(account, eq(savingsPlan.accountId, account.id))
    .innerJoin(security, eq(savingsPlan.securityId, security.id))
    .where(
      and(isNull(savingsPlan.deletedAt), isNull(account.deletedAt), isNull(security.deletedAt)),
    )
    .orderBy(asc(savingsPlan.securityId), asc(savingsPlan.accountId), asc(savingsPlan.validFrom))
    .all();

  return [
    {
      name: 'accounts.csv',
      header: [
        'account_id',
        'name',
        'type',
        'role',
        'on_budget',
        'currency',
        'institution_name',
        'opening_date',
        'opening_balance_cents',
        'balance_as_of_cents',
        'cleared_as_of_cents',
        'uncleared_as_of_cents',
        'scheduled_cents',
        'credit_limit_cents',
        'overdraft_limit_cents',
        'interest_rate_bp',
        'term_end',
        'monthly_fee_cents',
        'closed_at',
        'as_of',
        'contact_id',
        'note',
      ],
      rows: accounts.map((a) => [
        a.id,
        a.name,
        a.type,
        a.role,
        a.onBudget,
        a.currency,
        a.institutionId ? institutions.get(a.institutionId) : null,
        a.openingDate,
        a.openingBalanceCents,
        a.balanceCents,
        a.clearedCents,
        a.unclearedCents,
        a.scheduledCents,
        nullable(a.creditLimitCents),
        nullable(a.overdraftLimitCents),
        nullable(a.interestRateBp),
        a.termEnd,
        a.monthlyFeeCents,
        a.closedAt,
        asOf,
        a.contactId,
        a.note,
      ]),
    },
    {
      name: 'bookings.csv',
      header: [
        'booking_id',
        'split_index',
        'account_id',
        'account_name',
        'date',
        'status',
        'booking_amount_cents',
        'split_amount_cents',
        'currency',
        'original_amount_cents',
        'original_currency',
        'payee',
        'category_id',
        'category_name',
        'income_type',
        'transfer_id',
        'counter_account_id',
        'memo',
        'flag',
        'split_id',
        'contact_id',
        'income_type_id',
        'payee_id',
        'project_id',
        'source',
        'booking_memo',
        'fx_rate_micro',
        'fx_fee_cents',
      ],
      rows: bookingRows(db),
    },
    {
      name: 'securities.csv',
      header: [
        'security_id',
        'name',
        'kind',
        'symbol',
        'isin',
        'currency',
        'ter_bp',
        'asset_class',
        'institution_name',
        'benchmark',
        'regions_json',
        'fallback_quote_id',
        'quote_exchange',
        'quote_url',
        'coingecko_id',
        'prices_enabled',
        'quote_adjusted',
      ],
      rows: securityRows.map(({ security: s, assetClassName, institutionName }) => [
        s.id,
        s.name,
        s.kind,
        s.symbol,
        s.isin,
        s.currency,
        s.terBp,
        assetClassName,
        institutionName,
        s.benchmark,
        s.regionsJson,
        s.fallbackQuoteId,
        s.quoteExchange,
        s.quoteUrl,
        s.coingeckoId,
        s.pricesEnabled,
        s.quoteAdjusted,
      ]),
    },
    {
      name: 'positions.csv',
      header: [
        'account_id',
        'security_id',
        'name',
        'kind',
        'isin',
        'symbol',
        'asset_class',
        'units_e8',
        'price_date',
        'price_micro',
        'price_currency',
        'value_eur_cents',
        'cost_eur_cents',
        'gain_eur_cents',
        'account_currency',
        'valuation_basis',
        'missing_fx_currencies',
        'cost_basis_status',
      ],
      rows: positionRows,
    },
    {
      name: 'trades.csv',
      header: [
        'trade_id',
        'date',
        'account_id',
        'security_id',
        'kind',
        'units_e8',
        'amount_cents',
        'fee_cents',
        'tax_cents',
        'account_currency',
        'note',
        'booking_id',
      ],
      rows: tradesRows.map(({ trade: t, currency }) => [
        t.id,
        t.date,
        t.accountId,
        t.securityId,
        t.kind,
        t.unitsE8,
        t.amountCents,
        t.feeCents,
        t.taxCents,
        currency,
        t.note,
        t.bookingId,
      ]),
    },
    {
      name: 'prices.csv',
      header: ['security_id', 'date', 'price_micro', 'currency', 'source'],
      rows: pricesRows,
    },
    {
      name: 'holdings.csv',
      header: [
        'holding_id',
        'account_id',
        'security_id',
        'as_of',
        'units_e8',
        'cost_basis_cents',
        'account_currency',
      ],
      rows: holdingRows.map(({ holding: h, currency }) => [
        h.id,
        h.accountId,
        h.securityId,
        h.asOf,
        h.unitsE8,
        h.costBasisCents,
        currency,
      ]),
    },
    {
      name: 'valuations.csv',
      header: ['account_id', 'date', 'value_cents', 'currency', 'source', 'note'],
      rows: valuationRows.map(({ valuation: v }) => [
        v.accountId,
        v.date,
        v.valueCents,
        accountCurrency.get(v.accountId),
        v.source,
        v.note,
      ]),
    },
    {
      name: 'fx_rates.csv',
      header: ['date', 'currency', 'rate_micro', 'source'],
      rows: fxRows.map((rate) => [rate.date, rate.currency, rate.rateMicro, rate.source]),
    },
    {
      name: 'savings_plans.csv',
      header: [
        'savings_plan_id',
        'security_id',
        'account_id',
        'source_account_id',
        'amount_cents',
        'currency',
        'day_of_month',
        'valid_from',
        'valid_to',
        'note',
      ],
      rows: savingsPlanRows.map(({ savingsPlan: plan, accountCurrency: currency }) => [
        plan.id,
        plan.securityId,
        plan.accountId,
        plan.sourceAccountId,
        plan.amountCents,
        currency,
        plan.dayOfMonth,
        plan.validFrom,
        plan.validTo,
        plan.note,
      ]),
    },
    {
      name: 'asset_classes.csv',
      header: ['asset_class_id', 'name', 'sort_order'],
      rows: classes.map((x) => [x.id, x.name, x.sortOrder]),
    },
    {
      name: 'asset_class_targets.csv',
      header: ['asset_class_id', 'valid_from', 'target_share_bp', 'band_bp'],
      rows: db
        .select()
        .from(assetClassTarget)
        .innerJoin(assetClass, eq(assetClassTarget.assetClassId, assetClass.id))
        .where(and(isNull(assetClass.deletedAt), isNull(assetClassTarget.deletedAt)))
        .orderBy(asc(assetClassTarget.assetClassId), asc(assetClassTarget.validFrom))
        .all()
        .map(({ asset_class_target: t }) => [
          t.assetClassId,
          t.validFrom,
          t.targetShareBp,
          t.bandBp,
        ]),
    },
  ];
}

export function exportRoutes(db: Db, today: () => string, stepUp: MiddlewareHandler): Hono {
  const api = new Hono();
  api.get('/csv.zip', stepUp, async (c) => {
    const releaseSlot = admitExport(db);
    if (!releaseSlot)
      return c.json(
        {
          error: 'export_busy',
          message: 'Ein Export läuft bereits. Bitte warte, bis er abgeschlossen ist.',
        },
        429,
      );
    try {
      const asOf = today();
      // Read every CSV from one SQLite backup so concurrent writes cannot mix ledger versions.
      const tempDir = mkdtempSync(join(tmpdir(), 'budget-export-'));
      const snapshotPath = join(tempDir, 'snapshot.sqlite');
      let snapshot: ReturnType<typeof openDatabase> | undefined;
      let released = false;
      let cleanup: Promise<void> | undefined;
      let backupDone = false;
      let requestAborted = false;
      const outputRef: { stream?: Readable } = {};
      const sources = new Set<Readable>();
      const requestSignal = c.req.raw.signal;
      const onRequestAbort = () => {
        requestAborted = true;
        if (backupDone) {
          outputRef.stream?.destroy();
          void finish();
        }
      };
      requestSignal.addEventListener('abort', onRequestAbort, { once: true });
      const release = (): Promise<void> => {
        if (cleanup) return cleanup;
        released = true;
        const active = [...sources];
        const closed = active.map((source) =>
          source.closed
            ? Promise.resolve()
            : new Promise<void>((resolve) => source.once('close', resolve)),
        );
        for (const source of active) source.destroy();
        cleanup = Promise.all(closed).then(() => {
          try {
            snapshot?.close();
          } catch {
            // Always remove the private snapshot, even if a driver reports a close error on abort.
          } finally {
            rmSync(tempDir, { recursive: true, force: true });
          }
        });
        return cleanup;
      };
      const finish = async () => {
        try {
          await release();
        } finally {
          requestSignal.removeEventListener('abort', onRequestAbort);
          releaseSlot();
        }
      };
      try {
        chmodSync(tempDir, 0o700);
        await sqliteOf(db).backup(snapshotPath, {
          progress: () => {
            if (requestSignal.aborted) throw new Error('Export request was cancelled');
            return 100;
          },
        });
        backupDone = true;
        if (requestAborted || requestSignal.aborted) {
          await finish();
          return c.body(null, 503);
        }
        chmodSync(snapshotPath, 0o600);
        snapshot = openDatabase(snapshotPath);
        snapshot.sqlite.pragma('query_only = ON');
      } catch (error) {
        backupDone = true;
        await finish();
        throw error;
      }
      const zip = new yazl.ZipFile();
      const output = zip.outputStream as Readable;
      outputRef.stream = output;
      zip.on('error', (error) => {
        outputRef.stream?.destroy(error);
        void release();
      });
      try {
        for (const entry of exportEntries(snapshot.db, asOf)) {
          zip.addReadStreamLazy(entry.name, (done) => {
            if (released) return done(new Error('Export stream was cancelled'), Readable.from([]));
            const source = Readable.from(csv(entry.header, entry.rows));
            sources.add(source);
            source.once('close', () => sources.delete(source));
            source.once('error', (error) => {
              outputRef.stream?.destroy(error);
              void release();
            });
            done(null, source);
          });
        }
      } catch (error) {
        await finish();
        throw error;
      }
      zip.end();
      output.once('end', () => void release());
      output.once('close', () => void release());
      output.once('error', () => void finish());
      if (requestAborted || requestSignal.aborted) {
        output.destroy();
        await finish();
        return c.body(null, 503);
      }
      c.header('Content-Type', 'application/zip');
      c.header('Content-Disposition', `attachment; filename="budget-export-${asOf}.zip"`);
      c.header('Cache-Control', 'no-store');
      c.header('X-Content-Type-Options', 'nosniff');
      const nodeIterator = output[Symbol.asyncIterator]();
      let cancelled = false;
      const stream = new ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            const next = await nodeIterator.next();
            if (cancelled) return;
            if (next.done) {
              await finish();
              controller.close();
            } else controller.enqueue(next.value);
          } catch (error) {
            await finish();
            if (!cancelled) controller.error(error);
          }
        },
        async cancel() {
          cancelled = true;
          output.destroy();
          try {
            await nodeIterator.return?.();
          } catch {
            // Cancellation already closed the response stream.
          }
          await finish();
        },
      });
      return c.body(stream);
    } catch (error) {
      releaseSlot();
      throw error;
    }
  });
  return api;
}
