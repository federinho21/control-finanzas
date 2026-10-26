# Module 4 — Authenticated Firestore finance APIs

Date: 2026-10-13.

## Outcome

The thirteen existing finance endpoint methods now use authenticated Firebase identity and a Firestore repository. Reads filter by UID; mutations validate ownership and run through the data-agent entry point. SQLite/D1 data and Android's existing payments are retained. No remote data, rule, index, provider or deployment was modified.

The migration deliberately stops insecure compatibility fallback: **chat, uploads and document deletion respond 503 to authenticated users until their own migration modules are finished**. Anonymous callers receive 401. Unknown API paths default to the same closed gate; encoded paths/trailing or repeated slashes cannot bypass it. Existing auth endpoints and the actual Nuxt Icon read endpoint remain available.

This is a locally verified increment, not production acceptance or completion of modules 5–7.

## Persistence paths and Android compatibility

```text
payments/{sourceId}                    Existing Android captures: read-only to these web APIs
users/{uid}/payments/{T-XXXX}          New manual/cuota movements
users/{uid}/rocks/{R-XXXX}             Accounts
users/{uid}/sprints/{S-XXXX}           Periods
users/{uid}/cuotas/{U-XXXX}            Subscriptions
users/{uid}/internal/finance          Default-account pointer
users/{uid}/internal/quota-{U-XXXX}    Reserved subscription IDs
users/{uid}/periodKeys/{key}          Unique account/period pointer
users/{uid}/cuotaPayments/{key}        One payment marker per subscription/period
users/{uid}/hiddenPayments/{id}       Owner-specific removal markers
```

Every private record includes `userId`; nested path ownership is checked as well as that field. Legacy Android reads are always queried with `userId == verified uid`. The API does not copy raw source records on each refresh or change Android's write path. New Android payments appear on the existing web refresh/navigation flow, not via a new live subscription.

Source and nested records are merged by document ID so an overlapping migration copy is not counted twice. Source ID, amount, merchant/counterparty, direction and timestamp map to the current Task contract. Source bank email/SMS text, phone numbers and card references are not returned by finance APIs; Firestore field projections exclude raw text/phone/card fields from source reads.

Imported transactions are completed and have no artificial budget account/period IDs. Manual and cuota movements require owned account/period anchors. R/S/T/U IDs keep their four-character format; Android SHA IDs remain unchanged. Generated collisions fail without overwriting data; subscription IDs and deleted movement IDs are reserved against reuse.

### Removal behavior

Removing an imported movement creates a user-scoped hidden marker, **not deletion of the Android source**. Removing a manual nested movement deletes that web record and also reserves its ID. A nested/source duplicate cannot reappear from the original after removal. API returns `sourceRetained` so the UI distinguishes removal from actual source erasure. This is not an implementation of a privacy/account-erasure request.

Deleting a subscription leaves historical paid movements intact. Paying the same subscription twice concurrently in the same period produces one movement, through a transactional period marker. A deleted paid movement is not automatically recreated by re-paying that already-recorded period.

## File-by-file changes

Paths relative to `base-agent/`:

| File | Change |
| --- | --- |
| `server/firebase/admin.ts` | Shared lazy Admin app, Firestore access and production emulator refusal |
| `server/utils/auth-service.ts` | Frozen verified identity cached only in a WeakMap for that HTTP event, avoiding duplicate verification between middleware/handler |
| `server/repositories/finance-model.ts` | Strict schemas, decimal-to-integer money, period boundaries, source mapping, summaries and derived period status |
| `server/repositories/finance.ts` | UID-scoped reads, projections, transactional writes, ID reservations, payment markers, removal markers and report limits |
| `server/utils/finance-handlers.ts` | Central requireUser/Origin/input/limit/error handling for all finance methods |
| `server/agents/data-agent.ts` | New runFinanceOperation entry point; legacy SQL tools and document DB imports deferred until legacy operations are actually invoked |
| `server/middleware/legacy-security.ts` | Normalized-path API gate; authenticates private APIs; blocks unconverted/unknown endpoints; narrowly exempts auth and static icons |
| `server/plugins/cleanup.ts` | **Removed:** startup/shutdown must not destroy old provisional documents while D1 is retained as backup |
| `server/api/dashboard.get.ts`, `resumen.get.ts` | Authenticated owner-only summaries |
| `server/api/rocks.get.ts`, `sprints.get.ts`, `tasks.get.ts`, `cuotas.get.ts` | Authenticated owner-only lists |
| `server/api/movimientos.post.ts`, `cuotas.post.ts` | Validated financial creation through data-agent |
| `server/api/tasks/[id].patch.ts`, `[id].delete.ts` | Owned status/removal transactions and derived period status |
| `server/api/cuotas/[id].patch.ts`, `[id].delete.ts` | Owned idempotent payment/deletion |
| `server/api/sprints/[id].patch.ts` | Keeps existing authenticated 405 policy: period status is derived, not manually editable |
| `shared/utils/date.ts` | Shared Costa Rica date helper |
| `app/composables/useResumen.ts`, `FinancePanel.vue`, `pages/dashboard.vue` | Excluded-data warning, matching CR month selection and report contract |
| `app/components/finanzas/MovimientoTable.vue` | Accurate source-retained notice and labelled removal buttons |
| `firestore.rules` | Preserve top-level Android ownership rules; bound capture fields; deny direct browser access to new private paths |
| `firestore.indexes.json`, `firebase.json` | Local rule/index configuration; no deployment performed |
| `tests/finance-model.test.ts` | Five money/date/input/mapping checks |
| `tests/finance.integration.test.ts`, `firestore-emulator.ts`, `tsconfig.finance.json` | Nineteen real storage/rule/API integration tests and finance-core typecheck |
| `tests/auth.test.ts`, `auth-build.smoke.ts` | Per-request auth-cache regression, production Firestore-emulator guard, private API and public icon checks |
| `package.json` | Test/typecheck scripts only; no dependency installation was needed for this module |

Low-level Firestore operations follow the same role as the existing SQL tools; all production REST writes enter through `runFinanceOperation()` in `data-agent.ts`. No finance REST route directly calls the old SQL tools or reads the D1 connection.

## Security and data integrity

- UID comes only from requireUser's verified cookie, not sessionId/body/query/record fields.
- Authentication is checked in middleware and handlers; verified identity is reused only within that same request and is immutable. It is never reused across users/requests.
- Strict Zod schemas reject extra owner fields, malformed months, invalid calendar dates, traversal IDs, bad enum/type values and excessive monetary precision.
- JSON input is bounded to 20,000 bytes while streaming, with JSON Content-Type required.
- Mutations require the exact configured Origin, using module 1's protection. Responses are no-store/Vary: Cookie.
- Foreign and missing IDs both return 404. Completed movements cannot change status. Paused subscriptions cannot generate payments.
- Transactional account/period/payment creation validates all reads before writes; failures cannot leave partial parents/movements.
- Subscription payment markers prevent races/replays; period status is recalculated on insertion/update/removal. Previous-period subscriptions count as pending again.
- Money is stored/aggregated in integer hundredths; CRC display fields retain the old contracts. No dependency or currency conversion service was added.
- Reports include **CRC only**. Unparsed/invalid/non-CRC source records are retained but excluded and reported as `excludedMovements`; UI displays a warning instead of silently mixing USD with CRC. Monthly queries cannot assign records with missing timestamps to a month.
- Source monthly timestamps and new movement dates use Costa Rica boundaries. Current UTC-6 timestamp ranges are intended for modern data; use historical timezone offsets before importing pre-1993 bank history.
- Unknown DB/service errors become a generic 503, not SDK details/secret/project stack traces. ID collision yields 409 rather than overwrite.

## Operational limits

- A query/report is capped at 5,000 records (including owner-specific hidden-marker queries). Beyond that, it fails with 413 instead of silently truncating totals. Pagination/aggregate documents remain future work before increasing supported history.
- Private finance methods allow 120 requests/minute per verified UID per Node instance, with a bounded expiring map. This is **not distributed limiting** and does not limit direct Android Firestore ingestion. Infrastructure/App Check/quota/billing controls are required before public release.
- Dashboard global totals still scan this user's bounded history; there is no global multi-user scan. Reads incur Firestore costs. Do not advertise this implementation as unlimited-history/high-scale aggregation.
- The legacy agent/RAG code is retained but unavailable over HTTP. The gate must be changed only when those routes/tools are fully migrated; simply opening it reintroduces global D1 exposure and split-storage writes.
- The old deploy scripts still target Cloudflare, which is not the supported Firebase Admin runtime. Do not use them for this increment.

## Indexes, rules and configuration

No SQL/D1 migration is executed or required here. Existing D1 tables/data remain unchanged and will be copied only by the later approved importer.

The local indexes declare collection-scoped `payments` indexes:

```text
userId ASC + timestamp DESC    Existing Android query / legacy monthly source query
userId ASC + deadline DESC     Nested monthly movement query
```

The first preserves the Android app's existing index; the second is additive. The emulator does not enforce production composite-index readiness, so production acceptance must explicitly verify both indexes are ready. Missing-index errors are sanitized to 503.

The new local rules preserve reads/deletes by the source owner, prevent owner reassignment, validate parsed/timestamp/amount and bound merchant/counterparty/category/institution/direction/type/raw-text fields on create/update. `rawText` is limited to 100,000 characters. Existing records remain readable; an old oversized/malformed capture may fail a subsequent update under the new rules. Test Android notifications/Gmail samples before deploying them.

New `users/{uid}/...` paths deny all direct browser writes/reads. Firebase Admin bypasses those rules, so repository ownership checks remain mandatory. Android continues to access only its top-level owned captures.

**Commands for later manual deployment, not executed in this module:**

```powershell
firebase deploy --only firestore:indexes --project wallet-payment-tracker-fede
firebase deploy --only firestore:rules --project wallet-payment-tracker-fede
```

Review these local rules against the project/shared Android configuration before deploying; do not accidentally replace unrelated rules/indexes added by another application.

Reuse the configuration documented in modules 1/3: `FIREBASE_PROJECT_ID`, exact `AUTH_ORIGIN`, Firebase public web config and managed/default server credentials. Server service identity requires Authentication session permissions and Firestore access (for example appropriate least-privilege datastore permissions). No private key is published or committed. App Hosting/Storage billing and IAM setup remain module 7/user-approved work; no billing was enabled here.

## Local verification

```powershell
npm run test:finance:model
npm run test:finance
npm run typecheck:finance
npm run test:auth
npm run typecheck:auth
npm run build
npm run test:auth:build
npm run test:auth:browser
```

Finance integration prerequisites: an official cached Firestore emulator JAR in the Firebase CLI emulator cache and a compatible Java installation. This environment used cached emulator **1.22.0**. If absent, install/download through Firebase CLI before testing; the suite fails rather than skipping storage checks. It starts its own loopback ports, temporary directory and strict `demo-control-finanzas` project. Dummy credentials and unsigned rule-test tokens exist only inside that demo emulator; production code has no fake-auth mode.

Windows teardown terminates only the process tree whose PID the fixture spawned. Earlier fixture attempts exposed a Java launcher/child-pipe shutdown problem; it was fixed instead of using process.exit/forced test success. It does not kill arbitrary Java processes or delete broad directories.

Final results:

- Model tests: **5 passed**.
- API/storage/rules integration: **19 passed**, zero failures/skips; actual Firestore emulator transactions used.
- Backend session regression: **11 passed**, including same-request cache isolation.
- Finance-core and auth-core strict TypeScript: **passed**.
- Node Nuxt/Nitro production build: **passed**, with existing build warnings.
- Compiled route checks: **15 passed**, including private APIs refusing anonymous requests and the real `lucide.json` icon endpoint staying public.
- Browser regression: **8 passed**, no unexpected console errors/warnings. These browser fixtures simulate authenticated API replies; their SSE checks do **not** mean the real paused chat is available.
- SQLite `.data/hackathon.db` modification time stayed unchanged in the integration suite; no SQLite/D1 import/read/write is used by the new finance flow.
- Broader Vue check still reports existing app-config/click-handler/legacy-agent/graph type errors. No thresholds, skips, suppressions or type casts were added to hide them. It is not a clean project-wide quality gate.
- Previous dependency audit findings remain a release blocker; no blanket upgrade/audit fix was performed. Server Admin Firestore now runs at runtime, so review its actual gRPC/transport dependency path before launch.

Saved build log: `C:/Users/Fede/AppData/Local/Temp/opencode/finanzas-module4-build.log`. Test data/artifacts remain in disposable `finanzas-firestore-test-*`, `finanzas-auth-test-*` and `finanzas-web-test-results` directories under the approved temporary folder.

## Two-user verification demonstrated

- A and B each see only their own imported/manual data in lists/dashboard/summary.
- B cannot PATCH/DELETE A's movement/quote or create a movement anchored to A's account.
- Supplying userId/invalid IDs/extra fields fails before writes.
- Same document ID under two different user paths is independent.
- A malformed nested row claiming another owner is not listed or writable.
- Source/nested duplicates count once and remain hidden after removal without deleting source data.
- Concurrent payments create one expense; paused/foreign-account payments cannot cause writes.
- Direct unauthenticated browser writes to private paths are denied; emulated owner Android captures pass rules while ownership/oversized/negative-amount violations fail.
- Encoded/double-encoded/trailing/repeated-slash legacy routes and future unknown APIs cannot bypass the migration gate.

Real Google cookie verification, current-device linking, remote index readiness, live Android capture under the new rules and all historical D1 data reconciliation remain manual/next-module acceptance tasks. Nothing in these emulator results certifies production migration.

## Next step

Stop at this module checkpoint. Module **5** must propagate trusted UID through chat/LangGraph/tools and make approvals durable/owner-bound before re-enabling `/api/chat`. Module **6** migrates uploads/RAG/document lifecycle; module **7** handles reviewed data import and hosting cutover. No remote destructive operations are authorized by finishing this checkpoint.
