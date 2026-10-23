# Card scheduled-payment source addendum

HIGH CLEAR for the bounded source delta frozen at `1c24002185441d24ebd60ee37357bb53f6ed0f9a82e365c5e5169507ff3a7985`; all three immutable copies match their declared hashes.

Service is byte-exact to reviewed result-links freeze `8a335454c686f28ff42b7b9c2486a68c2f62bb1be6164fbd9d36ef97a5a5e3d1`. API accepts the same required nullable finite none/existing-UUID configuration as the domain/DB. UI sends that field, uses existing authorized expected-payment and settlement-state queries, filters actual outflows by the configured funding account and source currency, and requires an explicit selection rather than defaulting to none. A saved unavailable identity remains visible without being relabelled or silently remapped. Existing captured-CAS draft/save/reload/busy protections are preserved.

The concrete due-date occurrence, funding account, currency and unconsumed identity are checked again by the statement-local DB planner. UI selection is configuration, not trusted financial proof. This closes the missing required DTO/API/UI seam identified during parallel DB development. Previous result-link and API/service source reviews carry. No runtime, tests, formatter, browser or private-source access; final whole-DB/migration and coherent-batch validation remain pending.
