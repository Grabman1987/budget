/** Presentation gate only; the existing confirmation endpoint revalidates every write. */
export function bankRowMissing(row: {
  ready: boolean;
  account: boolean;
  payee: boolean;
  category: boolean;
  transfer?: boolean;
  knownRule?: boolean;
  blocked?: string | undefined;
}): { cell: 'source' | 'payee' | 'category' | 'suggestion'; reason: string } | undefined {
  if (!row.ready) return { cell: 'suggestion', reason: 'Vorschläge werden geprüft.' };
  if (row.blocked) return { cell: 'suggestion', reason: row.blocked };
  if (!row.account) return { cell: 'source', reason: 'Konto fehlt.' };
  if (row.transfer || row.knownRule) return;
  if (!row.payee) return { cell: 'payee', reason: 'Empfänger fehlt.' };
  if (!row.category) return { cell: 'category', reason: 'Kategorie fehlt.' };
}
