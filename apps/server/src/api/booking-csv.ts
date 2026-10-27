import {
  booking,
  bookingSplit,
  incomeType,
  openDatabase,
  queryBookings,
  sqliteOf,
  type BookingQuery,
  type Db,
} from '@budget/db';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { chmodSync, mkdtempSync, rmSync } from 'node:fs';
import { open, type FileHandle } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setImmediate } from 'node:timers/promises';
import { admitExport } from './export-admission';
import { ApiError } from './http';

type Cell = string | number | null | undefined;
const HEADER = [
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
] as const;
const MAX_BOOKINGS = 100_000;
const MAX_BYTES = 64 * 1024 * 1024;
const MAX_MS = 30_000;

// Same native units, column order and spreadsheet protection as the full bookings.csv.
const line = (cells: readonly Cell[]) =>
  cells
    .map((value) => {
      if (typeof value === 'number') {
        if (!Number.isSafeInteger(value))
          throw new ApiError(422, 'csv_unavailable', 'Ein Betrag ist nicht sicher darstellbar.');
        return String(value);
      }
      let text = value ?? '';
      if (/^[\p{White_Space}\p{Cc}]*[=+\-@]/u.test(text)) text = `'${text}`;
      return `"${text.replaceAll('"', '""')}"`;
    })
    .join(';') + '\r\n';

/** One complete filtered history snapshot. No download headers until the bounded file is ready. */
export async function filteredBookingCsv(
  db: Db,
  query: BookingQuery,
  today: string,
  signal: AbortSignal,
): Promise<Response> {
  const release = admitExport(db);
  if (!release)
    return Response.json(
      {
        error: 'export_busy',
        message: 'Ein Export läuft bereits. Bitte warte, bis er abgeschlossen ist.',
      },
      { status: 429, headers: { 'Cache-Control': 'no-store' } },
    );
  const started = performance.now();
  let directory: string | undefined;
  let snapshot: ReturnType<typeof openDatabase> | undefined;
  let file: FileHandle | undefined;
  let finished = false;
  let transferred = false;
  let source: ReturnType<typeof createReadStream> | undefined;
  const finish = () => {
    if (finished) return;
    finished = true;
    signal.removeEventListener('abort', abort);
    source?.destroy();
    try {
      snapshot?.close();
    } finally {
      snapshot = undefined;
      try {
        if (directory) rmSync(directory, { recursive: true, force: true });
      } finally {
        release();
      }
    }
  };
  const abort = () => {
    source?.destroy();
    finish();
  };
  const check = () => {
    if (signal.aborted)
      throw new ApiError(422, 'export_cancelled', 'Der Export wurde abgebrochen.');
    if (performance.now() - started > MAX_MS)
      throw new ApiError(
        422,
        'export_limit',
        'Der Export ist zu groß. Bitte grenze den Filter weiter ein.',
      );
  };
  try {
    check();
    directory = mkdtempSync(join(tmpdir(), 'budget-booking-csv-'));
    chmodSync(directory, 0o700);
    const snapshotPath = join(directory, 'snapshot.sqlite');
    await sqliteOf(db).backup(snapshotPath, {
      progress: () => {
        check();
        return 100;
      },
    });
    check();
    chmodSync(snapshotPath, 0o600);
    snapshot = openDatabase(snapshotPath);
    snapshot.sqlite.pragma('query_only = ON');
    const reader = snapshot.db;
    const names = new Map(
      reader
        .select()
        .from(incomeType)
        .all()
        .map((r) => [r.id, r.name] as const),
    );
    const csvPath = join(directory, 'bookings.csv');
    file = await open(csvPath, 'wx', 0o600);
    let size = 0;
    const append = async (text: string) => {
      check();
      size += Buffer.byteLength(text, 'utf8');
      if (size > MAX_BYTES)
        throw new ApiError(
          422,
          'export_limit',
          'Der Export ist zu groß. Bitte grenze den Filter weiter ein.',
        );
      await file!.writeFile(text, 'utf8');
    };
    await append(`\uFEFF${line(HEADER)}`);
    let cursor: string | undefined;
    let count = 0;
    do {
      check();
      const page = queryBookings(
        reader,
        { ...query, nativeSummary: false, ...(cursor ? { cursor } : {}), limit: 200 },
        today,
      );
      if (page.total > MAX_BOOKINGS || count + page.items.length > MAX_BOOKINGS)
        throw new ApiError(
          422,
          'export_limit',
          'Höchstens 100.000 Buchungen exportieren. Bitte grenze den Filter weiter ein.',
        );
      count += page.items.length;
      const ids = page.items.map((b) => b.id);
      const whole = new Map(
        ids.length
          ? reader
              .select({ id: booking.id, transferId: booking.transferId })
              .from(booking)
              .where(inArray(booking.id, ids))
              .all()
              .map((r) => [r.id, r.transferId] as const)
          : [],
      );
      const transferIds = [
        ...new Set(
          page.items.flatMap((b) =>
            [whole.get(b.id), ...b.splits.map((s) => s.transferId)].filter(
              (id): id is string => !!id,
            ),
          ),
        ),
      ];
      const legs = transferIds.length
        ? [
            ...reader
              .select({
                transferId: booking.transferId,
                bookingId: booking.id,
                accountId: booking.accountId,
              })
              .from(booking)
              .where(and(isNull(booking.deletedAt), inArray(booking.transferId, transferIds)))
              .all(),
            ...reader
              .select({
                transferId: bookingSplit.transferId,
                bookingId: booking.id,
                accountId: booking.accountId,
              })
              .from(bookingSplit)
              .innerJoin(booking, eq(booking.id, bookingSplit.bookingId))
              .where(and(isNull(booking.deletedAt), inArray(bookingSplit.transferId, transferIds)))
              .all(),
          ]
        : [];
      let text = '';
      let pageBytes = 0;
      for (const b of page.items) {
        const splits = b.splits.length ? b.splits : [null];
        for (const [index, split] of splits.entries()) {
          const transferId = split?.transferId ?? whole.get(b.id) ?? null;
          const counterpart = transferId
            ? (legs.find((r) => r.transferId === transferId && r.bookingId !== b.id)?.accountId ??
              (transferId === whole.get(b.id) ? b.transferAccountId : null))
            : null;
          check();
          const row = line([
            b.id,
            index + 1,
            b.accountId,
            b.accountName,
            b.date,
            b.status,
            b.amountCents,
            split?.amountCents ?? b.amountCents,
            b.currency,
            b.originalAmountCents,
            b.originalCurrency,
            b.payeeName,
            split?.categoryId,
            split?.categoryName,
            split?.incomeTypeId ? names.get(split.incomeTypeId) : null,
            transferId,
            counterpart,
            split?.memo ?? b.memo,
            b.flag,
            split?.id,
            split?.contactId,
            split?.incomeTypeId,
            b.payeeId,
            b.projectId,
            b.source,
            b.memo,
            b.fxRateMicro,
            b.fxFeeCents,
          ]);
          // Bound even a page with many very long splits before accumulating its buffer.
          pageBytes += Buffer.byteLength(row, 'utf8');
          if (size + pageBytes > MAX_BYTES)
            throw new ApiError(
              422,
              'export_limit',
              'Der Export ist zu groß. Bitte grenze den Filter weiter ein.',
            );
          text += row;
        }
      }
      await append(text);
      cursor = page.nextCursor ?? undefined;
      await setImmediate(); // Let disconnects and other sessions progress between immutable pages.
    } while (cursor);
    check();
    await file.close();
    file = undefined;
    snapshot.close();
    snapshot = undefined;
    source = createReadStream(csvPath);
    source.once('error', finish);
    source.once('close', finish);
    signal.addEventListener('abort', abort, { once: true });
    check();
    const iterator = source[Symbol.asyncIterator]();
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const next = await iterator.next();
          if (cancelled) return;
          if (next.done) {
            finish();
            controller.close();
          } else controller.enqueue(next.value);
        } catch (error) {
          finish();
          if (!cancelled) controller.error(error);
        }
      },
      async cancel() {
        cancelled = true;
        source?.destroy();
        try {
          await iterator.return?.();
        } finally {
          finish();
        }
      },
    });
    transferred = true;
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="budget-bookings-${today}.csv"`,
        'Content-Length': String(size),
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } finally {
    if (!transferred) {
      try {
        await file?.close();
      } finally {
        finish();
      }
    }
  }
}
