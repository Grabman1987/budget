# #604/#740 exact-optional corrections — independent bounded source CLEAR

The actual DB typecheck recorded TS2322 for class widening and TS2379 for explicit undefined optional properties. Reviewed the supplied diff, actual callers/helpers and the complete current two files against HEAD a25ffd011d491d3ee5d16b0e626ffe6c1ba50790. Exact reconstruction checks confirm only the declared three lines differ; static git diff lists only these two files. No reviewer runtime.

- goal-lifecycle.ts: removing the indexed optional-property assertion leaves the same nullable(r,'class') invocation. nullable returns only string|null and preserves its existing rejection of missing/malformed source data. The former type assertion added undefined only to the static type; it was erased at runtime. No class value, category policy, rounding or budget projection changes.
- statement-receipt-links.ts: when q/offset/attachedOffset is undefined, the corresponding option key is omitted instead of explicitly undefined. bookingRows reads q by truthiness and offsets by ??0, never by key-presence checks. Thus absent and undefined retain the same search/default offset; explicit empty string and0 remain supplied and keep their original behavior. All account/currency/managed-ID/limit/CAS/transaction and returned cursor logic is unchanged. No type/interface/tsconfig relaxation or validation removal.

SOURCE CLEAR for this exact bounded type repair. Tests, financial formulas, API shape and default behavior are unchanged. Root owns commit/propagation and finite retry; no successful typecheck or other runtime result is inferred.

Exact file SHA256 pairs:
{
  "packages/db/src/repos/goal-lifecycle.ts": {
    "before": "b0078f78fbb8dfe33fbdf92261bcfa92549c8a1e4864e7ffbe50a55db9e92116",
    "after": "1e74aec7be50497a032b584c82722885c99468be433018a5468be7584c6fddd5"
  },
  "packages/db/src/repos/statement-receipt-links.ts": {
    "before": "961bbd3c0d25ffcd901af58a1b5ecc01b1a78f27f1fb94a061f7307e276b1a85",
    "after": "a3e99ab43e8afd1c336d21f87399fffea744d733ad26ad0f300108b2ffb54db5"
  }
}
