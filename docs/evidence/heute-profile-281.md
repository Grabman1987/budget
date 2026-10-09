# Heute profile 281 — local synthetic results

**Status:** Both profile runs completed successfully on 2026-10-09: 20/20 handler samples and 20/20 browser samples, with ten cold and ten warm samples in each layer. This records a local synthetic profile; it does not close #281 or support an infrastructure change.

## Run identity and gates

The run used local source HEAD `51d45e96ecf5aca78a3c3b68489b9bd3b927e698`, with three dirty entries at measurement time; the manifest captured hashes for 120 production-bundle files. The handler and browser harness SHA-256 values were `26efbb46947689f1672ef2642b2280914527e61acfc522c8b0796f37a4802e89` and `ab88a30a3be8a0cb81d8254f70165e1b78bef9545e4e51a9db8c034522319a85`. The local source included the full-checked #226 parent stack. That parent had a separate rules screenshot CI issue and was not yet merged at measurement time. The #280 Live410 prerequisite was fulfilled. The subsequent rules snapshot/documentation follow-up preserved both measured harness hashes and all 120 production-bundle hashes. Independent final source/raw-data review found no concrete issue. On the frozen #281 tree above parent `6a4fa7ff1b45ee1257bbec9dbeac67d9de25c2b7`, the final Windows `npm run check -- -- --maxWorkers=1` passed typecheck, lint, formatting and 380 test files / 3,508 tests (Vitest 1,073.98 seconds); all 2,128 recorded file hashes remained unchanged. PR/CI and integration/deployment remain pending.

Both runs used separate prepared, normalized synthetic database copies outside the repository and Dropbox. The copies had matching file SHA-256 `95463ea333b106904ef30748c947ff0b55c977b67f92d6e2888855968a13cbc7`. Each copy was fingerprinted before and after its measurement. The handler fingerprint included all SQLite user tables; the browser fingerprint excluded the five authentication tables and reported their counts separately. The empty audit log and synthetic seed-marker gates passed. The browser authenticated through the existing synthetic passkey bootstrap before samples, refreshed only its prepared session timestamps before each server start, and removed its temporary session state after the run. Repository-path guard records rejected an in-repository database selection with zero timed samples.

All 20 handler responses and all 20 browser Heute responses were HTTP 200, 24,122 UTF-8 bytes, with SHA-256 `042d70244bc811f69611e7fa7641dd20c1c97e80968fcb9084d16dc1e4f1c717`. Cold/warm payload hashes matched within and across both layers. The browser recorded 180 API requests, all GET/200, including the required Heute-derived requests. Every warm handler sample passed `api.warm() === 2`; every warm browser server reported exactly two successful models. Both finance fingerprints stayed unchanged, and temporary browser session state was removed.

## Reproduction

Set `$handlerDb` and `$browserDb` to the existing prepared synthetic copies used for this profile, outside the checkout and Dropbox. The profile fixes payday and today to `2026-09-17`; it does not prepare, migrate, seed, scale, or modify financial data.

```powershell
npx tsx scripts/perf/heute-cold-warm.ts --database $handlerDb --profile
npx tsx scripts/perf/heute-browser-cold-warm.ts --database $browserDb --profile
```

The environment was Windows x64, Node v24.12.0 and Chromium 141.0.7390.37, on the local Core i5-1135G7 / 8.4 GB host recorded with the #280 baseline. The run manifest records harness hashes and bundle count; the raw files below contain no database filesystem path, session identifier, cookie, response body, HTML, or bundle path.

## Handler results

Handler timing covers `app.request()` plus reading `response.text()`. CPU is the Node process's `process.cpuUsage()` delta around that request/body-read window, with user and system microseconds kept separate. This process-wide CPU counter can exceed wall time when work runs across cores; it is not a Fly utilization measurement. Warm samples report zero user and system microseconds, which is not proof that the request consumed no CPU: the counters can resolve to zero for such short windows. The warm requests still observed one prepared statement and one `get()`.

| Metric                             |                   Cold, n=10 |                     Warm, n=10 |
| ---------------------------------- | ---------------------------: | -----------------------------: |
| Handler request wall time          | 478.949 ms (395.540–658.033) |         1.325 ms (0.998–2.607) |
| Process CPU user                   | 539,500 µs (453,000–844,000) |                     0 µs (0–0) |
| Process CPU system                 |         16,000 µs (0–78,000) |                     0 µs (0–0) |
| Setup wall time, outside request   |      5.851 ms (4.099–10.703) |         5.694 ms (4.287–7.386) |
| Warm-up wall time, outside request |                         0 ms | 947.307 ms (810.804–1,057.190) |

Instrumented SQLite counters are per request. `prepare` includes statement preparation; the other rows count observed statement method calls and accumulated method elapsed time. The Drizzle `.values()` route is implemented with `stmt.raw().all()` in this stack and is included under `all`. This selected route called `iterate()` zero times, so the run did not exercise the lazy iterator branch. These are selective wrapper counters, not a total SQLite VM-operation count.

| SQLite method |    Cold calls |                 Cold elapsed | Warm calls |           Warm elapsed |
| ------------- | ------------: | ---------------------------: | ---------: | ---------------------: |
| `prepare`     | 667 (667–667) |    28.788 ms (23.512–35.004) |    1 (1–1) | 0.047 ms (0.031–0.080) |
| `get`         | 389 (389–389) |    19.607 ms (15.169–21.971) |    1 (1–1) | 0.047 ms (0.033–0.075) |
| `all`         | 278 (278–278) | 197.029 ms (166.424–218.176) |    0 (0–0) |             0 ms (0–0) |
| `run`         |       0 (0–0) |                   0 ms (0–0) |    0 (0–0) |             0 ms (0–0) |
| `iterate`     |       0 (0–0) |                   0 ms (0–0) |    0 (0–0) |             0 ms (0–0) |

Direct `exec`, `pragma`, transaction-control internals, and operations bypassing these statement methods are not counted. SQL elapsed time overlaps process CPU and request wall time; it is not subtracted from either. Instrumentation itself adds overhead, so the difference from the uninstrumented #280 wall baseline is descriptive only.

The handler's all-table logical fingerprint was `0e2823c27d2d5ed91eb1541d2ec1491f41d076aad0f3e90abc7c3b24056181fb` before and after the samples, across 77 non-internal tables. The browser's non-auth logical fingerprint was `8d421100aefc6f12d1ba0e7bf93554b9b62af813a3f35b55dd5f41b5232ad682` before auth preparation, after preparation, and after samples. Its distinct value is expected because auth tables are excluded from that hash.

## Browser results

The browser wall-time endpoint is the existing current-navigation full-content gate: the payday page rendered its required current Heute response and derived requests, expanded content, loaded fonts, passed two animation frames, settled API bodies, and showed no Heute busy or alert state. `fullContentMs` was recorded before the end-of-interval CDP read. The `.heute` HTML was measured in the page only to obtain element count and UTF-8 byte length; its contents were not emitted.

| Metric                               |                         Cold, n=10 |                         Warm, n=10 |
| ------------------------------------ | ---------------------------------: | ---------------------------------: |
| Navigation to full content           | 1,743.903 ms (1,610.295–2,119.809) | 1,086.219 ms (1,052.977–2,257.393) |
| Browser-observed Heute response      |     836.748 ms (734.442–1,055.340) |       211.829 ms (133.811–465.163) |
| Navigation to DOMContentLoaded       |       498.480 ms (479.660–617.375) |     490.274 ms (472.789–1,130.108) |
| Renderer `ScriptDuration` delta      |       219.998 ms (170.914–232.561) |       228.202 ms (212.325–285.075) |
| Renderer `LayoutDuration` delta      |         87.927 ms (68.942–132.642) |        130.606 ms (99.447–188.916) |
| Renderer `RecalcStyleDuration` delta |          11.761 ms (10.219–25.405) |          13.527 ms (11.274–28.883) |
| Renderer `TaskDuration` delta        |       397.546 ms (315.513–526.941) |       405.202 ms (358.517–709.827) |
| `.heute` elements                    |                      579 (579–579) |                      579 (579–579) |
| `.heute` serialized outerHTML size   |       37,708 bytes (37,708–37,708) |       37,708 bytes (37,708–37,708) |

CDP used Chromium `Performance` with `timeDomain: threadTicks`; every required metric was present, finite and nonnegative. The counters cover the renderer main thread during the sampled interval. `TaskDuration` includes main-thread task work and overlaps script, layout and style work; do not add these durations together. They are not a complete paint, compositor, display, or React-component profile. Browser API timings overlap as well, so neither their sum nor wall time minus a CPU-like metric represents rendering time.

## Comparison and limitations

The uninstrumented #280 local baseline had a 439.734 ms cold / 1.107 ms warm payday handler median and 1,719.514 ms cold / 1,324.264 ms warm browser full-content median. The new handler wall figures are higher cold and close warm; browser cold is similar and warm is lower. This comparison is affected by sample order, machine load, instrumentation overhead, and source-stack differences, so it isolates no cause. The new counters are one local diagnostic profile, not production latency or a service-level estimate.

There is no correlated Fly CPU, memory, storage, or network pressure signal in this evidence, so it supports no scaling or hosting recommendation. That is not a #281 completion gate: the full check and independent review passed; PR/CI and integration/deployment remain. Any future hosting recommendation should require a measured bottleneck with a correlated infrastructure signal.

## Raw records

Each JSON Lines file contains 23 UTF-8 records with LF endings and no BOM: one sanitized metadata record, twenty raw sample records, and two cold/warm summaries. Sample API records retain request method/status/timing/bytes/hash and safe request endpoints; they contain no body data. The summaries were checked against raw samples for exact `n`, and min/max and median differences within 0.000500001 units of the rounded summary precision. All recorded numeric metrics were finite and nonnegative.

- [Handler raw JSONL](heute-profile-281/handler-raw.jsonl), SHA-256 `b1e4a6c571026cc1818ae35624f640045453d2b0459814e33e71bf74912bf5aa`.
- [Browser raw JSONL](heute-profile-281/browser-raw.jsonl), SHA-256 `d0faeb7751bb6740b3b69ad90b67989b52cc2cbc5eef0c03fcc905f9dcae53e7`.
