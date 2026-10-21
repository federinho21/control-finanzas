# Recovery readiness — synthetic export/restore rehearsal

## Contract and current status

Fede asked to continue with the remaining launch work after dependency reachability analysis. This slice adds a **local/CI recovery rehearsal**, not a production backup service. No live Firestore/Auth/Storage operation, export of real records, billing change, IAM grant, database creation, traffic switch or migration is authorized or performed.

Acceptance for this slice:

- Export synthetic Firestore data using the actual emulator export API, stop the source process, and import the resulting metadata into a fresh emulator.
- Preserve exact document IDs, nested data under missing parent documents, financial values, owners, account/period links, timestamps and document/chunk metadata.
- Preserve hiding/deletion markers, manual-create receipts and cuota period markers so recovery does not silently permit tested replays to create duplicate money movements.
- Prove that a write after the checkpoint is absent from the restored checkpoint, rather than pretending this is point-in-time recovery or reconciliation.
- Keep the rehearsal demo-project/loopback-only and mandatory in the existing secret-free CI. Do not soften the native audit or replace real two-user/Android acceptance with synthetic identities.

**Production backup and restore readiness remains OPEN.** A working emulator rehearsal does not establish production RPO/RTO, managed-backup availability, permissions, costs, account recovery or object-file recovery.

## Implementation

- `tests/backup-restore.integration.test.ts`: uses the installed Java emulator, the real finance repository and synthetic fixtures. Two users share an idempotency key while remaining isolated. No real Google account, model, cookie or payment is involved.
- `tests/firestore-emulator.ts`: an optional seed-metadata argument adds the official JAR's `--seed_from_export` option. Existing no-argument callers retain an empty emulator. Missing paths, directories and wrong-extension inputs are rejected before launching Java; this is path/file validation, **not** a complete corrupt-export validator.
- `package.json`: `npm run test:backup` runs the rehearsal. No dependency or lockfile change is needed.
- `tests/tsconfig.finance.json`: includes the new test in the existing strict typecheck.
- `.github/workflows/quality.yml` and `tests/ci-policy.test.ts`: run and require `test:backup` after the existing finance suite. Same read-only permissions, pinned/checksummed emulator, no deploy or secret step.

The export request uses the endpoint/body from the official Firebase CLI implementation (`hubExport.ts`):

```text
POST http://127.0.0.1:{owned-test-port}/emulator/v1/projects/demo-control-finanzas:export
database: projects/demo-control-finanzas/databases/(default)
export_directory: a new directory below this test emulator's owned temp directory
export_name: firestore_export
```

The destination reads the generated `firestore_export/firestore_export.overall_export_metadata`. No JSON application importer, production restore command or general-purpose backup API was added. The helper still fixes the demo project, loopback host, random ports and existing rule file.

The SDK clients use explicit generated synthetic credentials and a fixed universe domain, plus the owned loopback endpoint/emulator setting. An initial version without explicit credentials triggered an SDK metadata lookup warning; it was corrected rather than suppressing the warning or relying on ambient ADC. No real Firebase financial write occurred. Original emulator environment state is restored during cleanup; emulator shutdown still runs if client cleanup fails. Export files contain only synthetic data and remain in the approved temporary directory.

## What the rehearsal checks

1. Seed top-level Android-compatible source payments for A/B; create private movements for both owners, a paid cuota, a subsequently deleted movement, a hidden source payment, receipts, TTL timestamp fields and a synthetic 3072-dimensional chunk.
2. Recursively enumerate all documents/subcollections, including subcollections whose parent document does not exist. Save this exact in-memory expected snapshot and repository monthly summaries.
3. Export, then create a later movement. Stop the original emulator and start a new emulator seeded only from the export.
4. Compare every restored document/path/value and the A/B summaries. Expected synthetic expense totals are CRC 1.65 and CRC 7.30; no float-based recomputation is used to decide correctness.
5. Reuse the original creation keys: A and B get their respective original IDs; changed data with A's key is rejected with 409. Cuota creation also returns its original ID; repaying the paid cuota creates no extra expense.
6. Replay the deleted movement's key: it returns the old ID but does not resurrect that record. The hidden Android source still exists, while its hide marker keeps it out of totals.
7. A different owner cannot delete A's restored movement (404). Anonymous direct access to the restored private Firestore path remains denied (403) under the rule file loaded for the new emulator.

Rules are loaded from the repository for the destination; the test does **not** establish that rule files were contained in the data export. Similarly, preserving a `purgeAt` Timestamp field does not recreate a TTL policy. The chunk fixture exercises metadata/vector preservation, not a live RAG query or Storage object recovery.

## Local verification

The first rehearsal failed with an empty recovered snapshot because the helper ignored the seed argument. Adding the real import option made the comparison pass. The CI-policy assertion separately failed when the new command was not in the workflow, then passed after wiring it. Missing/non-file seed validation is also covered.

The expanded rehearsal passed, including exact snapshot equality after all replay/denial checks. All three scoped typechecks and the existing CI-policy, auth, web-session, model, migration, chat, dependency-security, adapter and finance integration suites passed locally. A mutation removing the actual seed flag was caught by the recovered-snapshot assertion; the flag was restored and both backup tests passed again. Review also made the foreign-owner denial target explicitly absent from B's private IDs, rather than assuming generated IDs are globally unique across owners. Synthetic data remains outside Git; no broad temp-directory deletion is performed. No full app rebuild/browser rerun is claimed locally for this test-only change; the final clean Linux CI must verify the committed tree independently of the preserved parallel work.

Commands from `base-agent/`:

```powershell
npm run test:backup
npm run test:finance
npm run test:ci
npm run typecheck:finance
```

Local evidence under `C:\Users\Fede\AppData\Local\Temp\opencode\`: `finanzas-restore-drill-red.log`, `finanzas-restore-ci-red.log`, `finanzas-restore-final-checks.log`, `finanzas-restore-mutation.log`, `finanzas-restore-restored-green.log`, `finanzas-restore-reviewed-green.log`, `finanzas-restore-audit.json`. The native audit still reports eleven high findings from the existing two unpatched roots; no new dependency or audit exception was introduced. Record remote run/SHA evidence in the PR. No test is skipped or retried to conceal a failure.

Parallel FK Trace/login/mobile/merchant work is not part of this slice. Its additions to the same package script list and scoped typecheck were preserved in the working tree; only the backup command/include are to be staged for this commit. Local checks may see that parallel content, so clean CI on the exact committed revision is the independent acceptance evidence.

## Production decision — requires explicit approval

Official [scheduled backup documentation](https://firebase.google.com/docs/firestore/backups) states that this feature requires **Blaze** and charges for retained backup storage and restoration. [Managed export/import](https://firebase.google.com/docs/firestore/manage-data/export-import) likewise requires billing/Blaze and a suitable Cloud Storage bucket. Netlify hosting itself does not remove these requirements. The current remote billing state was not rechecked; no activation or cost commitment was made here.

Before selecting/enabling a production solution, Fede must approve the method and budget, acceptable data-loss window (**RPO**), recovery window (**RTO**), frequency/retention, backup operator/access policy and restore destination. No arbitrary thresholds are declared accepted. Default recommendation for evaluation is a native managed backup restored to a **new isolated database**, not an unreviewed restore over `(default)`. A free bespoke export is not presented as an equivalent already-built solution.

The synthetic source has no concurrent writes during its export. An ordinary managed export is **not** an exact snapshot at export-start time and may include writes made during the operation; do not equate this quiescent rehearsal with production consistency. Managed imports overwrite matching document IDs while leaving unrelated destination documents present, which is another reason not to import over a live database. Review the selected native-backup/PITR/export semantics explicitly.

Native Firestore backups include data/index configurations but **not TTL policies**. Firestore data also does not back up Firebase Auth identities/provider links, Storage object bytes, Netlify secrets, source/rules or account-level IAM. Keep a reviewed recovery inventory for each; preserve original UIDs and Android ownership, rather than assigning restored records to a new user's UID. Real backup material needs encrypted storage, limited access, retention/deletion ownership and a trustworthy integrity record, never Git or chat.

## Recovery runbook — not an executed production procedure

1. **Declare and contain:** identify the incident/checkpoint and authorize recovery. Stop or isolate web and Android writers before any cutover; document writes since the checkpoint. Disable approval/payment execution until consistency is verified. No automatic source wipe or down-migration.
2. **Preserve evidence:** retain the affected database and relevant logs securely. Choose a completed, identified backup with known project/database/time and retention; verify access and integrity. Decide separately how Auth, objects and config are recovered.
3. **Restore in isolation:** use the reviewed method into a new database with no application traffic. Keep the current source untouched. Record operation IDs/status and elapsed time; do not assume a queued operation succeeded.
4. **Verify before access:** compare document counts/IDs, owner fields, integer amounts, dates, monthly totals/excluded records, account/period references, cuota markers, hidden/deleted IDs, receipts and document links. Recheck rules, exact database selection, indexes, IAM and TTL policies. Existing tests target `(default)`; they do not prove the app is ready to switch to an arbitrary database ID.
5. **Reconcile the gap:** replay keys/payments written after the checkpoint may not exist in the backup. Compare source Android captures and post-checkpoint activity before enabling retries or payments; restoring an old checkpoint cannot recover future writes automatically. Do not blindly union transactions or discard receipts.
6. **Human staging acceptance:** test with two real users, an Android capture, auth/logout/identity continuity, denial of cross-owner reads/writes and relevant document/object operations. Confirm monitoring and costs. The emulator's mock owners are not that acceptance.
7. **Approved cutover and fallback:** deploy/switch only after explicit approval, then monitor totals/errors. Reverting hosting code is not a reversal of financial writes; preserve and reconcile new writes before any fallback. Record measured RPO/RTO and close the incident only after evidence review.

Still unverified: a real managed backup, its schedule/retention/billing/IAM, corrupt/missing-object recovery, production index restoration, Auth/Storage recovery, actual duration/capacity, PITR and cross-database application configuration. These are separate release gates, not success claims from this rehearsal.

Official local semantics: [Firestore emulator import/export](https://firebase.google.com/docs/emulator-suite/connect_firestore#import_and_export_data), [Firebase CLI export implementation](https://github.com/firebase/firebase-tools/blob/master/src/emulator/hubExport.ts), and the installed emulator 1.22.0 `--help` output. The local admin export endpoint/JAR flag are test tooling, not a new production integration.

Next release slice: [finance-only AI exclusion](27-finance-only-ai-exclusion.md). The real backup and two-user/Android acceptance gates remain open.
