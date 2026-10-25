import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import {
  statementSettlementActionSchema,
  statementCandidateQuerySchema,
  type StatementSettlementState,
} from '@budget/domain';
import {
  assertStatementCas,
  getReceipt,
  performStatementAction,
  replayStatementAction,
  statementSettlementState,
  statementSettlementCandidates,
  type Db,
} from '@budget/db';
import { readStatementSource } from '../statements/service';
import { ACTOR, ApiError, readBody, readQuery } from './http';

export function statementSettlementRoutes(db: Db, receiptsDir: string) {
  const api = new Hono();
  api.use('*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    await next();
  });
  api.use(
    '*',
    bodyLimit({
      maxSize: 65536,
      onError: (c) => c.text('Request body too large (limit 64 KB).', 413),
    }),
  );
  api.get('/', (c) =>
    c.json(
      statementSettlementState(
        db,
        readQuery(c, z.object({ cardAccountId: z.string().uuid() }).strict()).cardAccountId,
      ) satisfies StatementSettlementState,
    ),
  );
  api.get('/candidates', (c) =>
    c.json(statementSettlementCandidates(db, readQuery(c, statementCandidateQuerySchema))),
  );
  api.post('/actions', async (c) => {
    const body = await readBody(c, statementSettlementActionSchema);
    // Saved receipts win before current eligibility, CAS and asynchronous source I/O.
    const replay = replayStatementAction(db, body);
    if (replay) return c.json(replay, 201);
    if ('source' in body) {
      const intake = assertStatementCas(db, body.source.intakeId, body.source),
        receipt = getReceipt(db, intake.receiptId);
      if (receipt.sha256 !== body.source.sha256)
        throw new ApiError(409, 'conflict', 'Abrechnungsquelle stimmt nicht überein.');
      try {
        await readStatementSource(receiptsDir, intake.sha256, receipt.sizeBytes);
      } catch {
        throw new ApiError(409, 'conflict', 'Abrechnungsquelle fehlt oder ist beschädigt.');
      }
    }
    // Recheck source/config/original CAS and replay after the await, in the transaction.
    return c.json(performStatementAction(db, body, { actor: ACTOR }), 201);
  });
  return api;
}
