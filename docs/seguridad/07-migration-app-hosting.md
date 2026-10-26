# Module 7 — Non-destructive migration and App Hosting preparation

Hosting decision superseded: Fede selected [Netlify Functions](11-netlify-hosting.md). The migration contract below remains relevant; App Hosting setup is historical, not the current deployment procedure.

## Status

Operator tools, local tests and hosting configuration are implemented. No production snapshot, import, rule deployment, Firebase app registration, billing change, IAM grant, DNS change or App Hosting rollout was executed. No commits or pushes were made.

## Files

New: `scripts/migration-model.ts`, `scripts/migrate-firestore.ts`, `tests/migration.test.ts`, `apphosting.yaml`.

Updated: `nuxt.config.ts` (explicit Node preset; Cloudflare target fails closed), `package.json` (migration/cleanup/test commands), `firebase.json`, `firestore.indexes.json`, `tests/tsconfig.finance.json`, `tests/finance.integration.test.ts`, and module documentation. Existing D1 scripts are retained for export/history; they are NOT supported Firebase deployment commands.

## Migration contract

- Input is an explicitly chosen SQLite backup opened read-only, or a JSON snapshot with `rocks`, `sprints`, `tasks`, `cuotas`, `documents`, `document_chunks` arrays using the original SQLite column names. No automatic read of the active database and no automatic UID inference.
- Supply the reviewed destination UID. Legacy SQL contains no trustworthy owner, so the operator must establish who owns the snapshot. For mixed-owner data, split and verify owner snapshots first; never assign the whole dataset to the first signed-in user.
- Dry-run is offline by default and prints counts plus a deterministic UID/content hash. Optional `--export` writes the raw snapshot with exclusive creation; it never replaces an existing backup.
- IDs, historical dates, valid statuses and money are preserved. Inputs, duplicate IDs and account/period relationships are validated. Source `created_at` must be ISO UTC; malformed data aborts, not silently skipped or rounded.
- Documents preserve extracted text in Storage and existing 3072-dimensional chunks in private Firestore. SQL never stored original PDF bytes; migration does not fabricate them (`originalAvailable: false`). Unlinked/empty-index legacy documents are archived, retained and excluded from RAG. Incompatible dimensions or oversized documents abort pending operator reconciliation/reindexing on a separate copy.
- Applying requires explicit project, real ADC, a Google-linked enabled destination user, reviewed hash and bucket when documents exist. Existing unequal destination data or reserved/Android-overlapping payment IDs abort. Objects use create-only generation preconditions. Records use create-only transactions; exact reruns produce no duplicates.
- Migration is resumable, NOT globally atomic. A failure can leave already-created records/objects. Keep the app in maintenance during apply/verify; rerun unchanged snapshots to complete. Modified destination records deliberately conflict rather than being overwritten.
- Android top-level `payments` are not copied, edited or deleted. Web reads them by authenticated UID. Independent SQL/Android IDs representing the same expense need semantic reconciliation before cutover; ID checks cannot detect that automatically.

## Commands (examples; not executed against production)

Stop legacy web writes and take a verified full SQLite backup, including WAL consistency, or use SQLite's backup API. Keep encrypted copies and checksums outside the repository. For D1, use a reviewed read-only export:

```powershell
npx wrangler d1 export control-finanzas-db --remote --output C:\secure-backups\finance-d1.sql
```

Restore the trusted SQL export into a NEW offline SQLite file with the SQLite CLI; never restore into the active DB. The migration tool accepts the restored SQLite backup, not arbitrary SQL execution. Reconcile this D1 source with local SQLite; do not import both blindly.

```powershell
npm run migrate:firestore -- --sqlite C:\secure-backups\finance-backup.db --uid OWNER_UID --export C:\secure-backups\finance-snapshot.json
npm run migrate:firestore -- --snapshot C:\secure-backups\finance-snapshot.json --uid OWNER_UID
# Review counts, ownership, documents, duplicates, backup and printed hash first.
npm run migrate:firestore -- --snapshot C:\secure-backups\finance-snapshot.json --uid OWNER_UID --project wallet-payment-tracker-fede --bucket BUCKET --apply --confirm-hash REVIEWED_HASH
npm run migrate:firestore -- --snapshot C:\secure-backups\finance-snapshot.json --uid OWNER_UID --project wallet-payment-tracker-fede --bucket BUCKET --verify
```

Operator tools intentionally refuse emulator environment variables; emulator tests invoke the same model/transaction functions directly with the fixture-owned database. Verification fails on missing/conflicting records or objects. It checks imported fields, not all unrelated application records. Save output, source checksums and pre-cutover totals securely.

## App Hosting setup

1. Link the EXISTING Android anonymous installation to Google, preserving UID `MOjsiAMSkAZGtBwqzvvpJELHrjj2`. Register SHA fingerprints and refresh Android OAuth configuration first. Do not clear Android storage or sign out before linking.
2. Register/configure the Web Firebase app and Google authorized domains. Confirm billing/region and provision a private Storage bucket and an App Hosting backend with root directory `base-agent`. These are human-approved remote steps.
3. `apphosting.yaml` uses explicit build/run commands for the Nuxt Node artifact, 1 CPU, 1 GiB memory, max two instances and concurrency 20. Official custom-command overrides opt out of framework adapters. Verify the generated Node artifact in staging before release; do not use the retained Cloudflare scripts.
4. Set these backend environment variables in the Firebase console: `FIREBASE_PROJECT_ID`, `FIREBASE_STORAGE_BUCKET`, exact HTTPS `AUTH_ORIGIN`, and `NUXT_PUBLIC_FIREBASE_API_KEY`, `NUXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NUXT_PUBLIC_FIREBASE_PROJECT_ID`, `NUXT_PUBLIC_FIREBASE_APP_ID`. Public Web values are configuration, not Admin credentials. Public values must be available at build/runtime as needed.
5. Create the Secret Manager secret `gemini-api-key` and grant only this backend access. The YAML exposes it as runtime `NUXT_GEMINI_API_KEY`. Use ADC/runtime identity, never a downloaded service-account JSON in Git. Scope Firestore, Storage and Auth permissions to required operations; IAM remains unverified.
6. Review live Android compatibility before publishing the proposed rules. Deploy explicitly with the Firebase CLI only after approval:

```powershell
firebase deploy --only firestore:rules,firestore:indexes,storage --project wallet-payment-tracker-fede
```

7. Wait for all composite indexes and TTL policies to become ready. Confirm private Storage has no public IAM and anonymous direct requests are denied. App Hosting rollout is a separate console/CLI operation after release gates pass; no automatic rollout command is provided here.

Official configuration reference: https://firebase.google.com/docs/app-hosting/configure (custom build/run scripts, secrets, environment precedence and resources).

## Local verification and live acceptance

```powershell
npm run test:migration
npm run test:finance:model
npm run test:finance
npm run test:auth
npm run test:auth:web
npm run typecheck:finance
npm run typecheck:auth:web
npm run build
npm run test:auth:build
npm run test:auth:browser
```

Evidence: 27 real-emulator integration tests, 5 finance model tests, 11 backend auth tests, 13 web lifecycle tests, 15 compiled auth/page/API/asset checks and 8 Playwright browser regressions passed. Four migration unit tests cover deterministic hashing, preserved history/money, unsafe inputs, broken relationships and document compatibility. The emulator tests prove rerun idempotency and destination-edit conflicts. Finance and web typechecks and the Node Nuxt build pass. Build log: `C:\Users\Fede\AppData\Local\Temp\opencode\finanzas-modules567-release-build.log`. Live Google/Gemini/Storage, genuine authenticated SSR, remote indexes/TTL and App Hosting resource behavior remain unverified.

For A/B staging acceptance, create distinct accounts, movements, cuotas, proposals and documents. Repeat list/query/update/delete/approval/search operations using the other user's IDs and conversations; expect no exposure or writes. Confirm direct nested Firestore and all direct Storage access are denied, original Android capture still works, logout clears both tabs, and real SSE terminates once. Compare original/new monthly totals and excluded records before changing traffic.

## Rollback and release blockers

Keep the previous source, backups and hosting revision. If acceptance fails, stop new web writes and route traffic to a safe maintenance page; do not reactivate unauthenticated legacy chat or blindly restore SQL over new records. Reconcile post-cutover writes before reverting application traffic. This tool has no destructive automatic down migration; retain created data and review any cleanup separately.

Module-completion `npm audit --omit=dev`: **78 findings: 1 low, 43 moderate, 30 high, 4 critical**. The [dependency follow-up](08-dependency-security.md) subsequently reduced this to **72 findings, 3 critical** by removing unused Community and patching Vue SSR. No forced upgrades or suppressions were applied. Triage reachable runtime/build issues, especially upload parsing and Nuxt/LangChain dependencies, before production. General/auth rate limiting remains per Node instance; PDF parsing is in-process; deployment, backup restore, mixed-source reconciliation and live two-user acceptance remain release gates.
