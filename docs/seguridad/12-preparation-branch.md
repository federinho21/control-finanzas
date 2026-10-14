# Preparation branch and Netlify connection checkpoint

## Authorized scope

Fede authorized uploading the reviewed changes to a preparation branch, WITHOUT changing `main`, and requested Netlify MCP access first. OAuth connection is now verified. The agent queried only the selected finance site and did not create another Netlify project.

- Repository: `https://github.com/federinho21/control-finanzas`
- Branch: `prepare/firebase-netlify`
- Application/source commit: `8ccac02`
- Netlify project: `control-finazas`
- Site ID: `9c49b0cd-ab24-41f0-b5cc-c1bcdeca698f`
- Selected HTTPS URL: `https://control-finazas.netlify.app`

Publication confirmed: the source commit `8ccac02` and initial documentation commit `cf3449b` were pushed to `origin/prepare/firebase-netlify`. Remote-ref verification showed `main` still at `f9eae2d7a79f6759e327e990d0894d81de739b7f`. The application working tree was clean after publication. No pull request or production merge was created by the agent.

The selected URL returned 404 during the read-only connection check. No production deploy or merge was requested in this checkpoint. Pushing this branch may trigger branch/preview automation if enabled in Netlify; it does not change the Git `main` branch. Actual branch deployment behavior must be checked before configuring live credentials.

## Publication contents and checks

The application commit includes the already-implemented Firebase ownership/session migration, private agents/documents, migration tools, dependency fixes and Netlify adapter configuration. These mutually dependent changes were saved as one coherent source/test snapshot rather than reconstructing unsafe intermediate states. Documentation is a separate commit.

Included changes are enumerated in modules 1–11. Existing SQLite/D1 files are retained for historical export only; runtime routes do not import them. `apphosting.yaml` is historical; Netlify is the selected target.

Excluded: `.env`, generated `dist`/`.output`/`.netlify`, `node_modules`, `.data`, database files, real service-account keys, Android installation artifacts and OpenCode OAuth credentials. Android configuration is outside this repository; it was not uploaded here.

Before the source commit:

- 95 added/modified staged files were checked for matches against local server secrets, private-key/token patterns and forbidden/generated/data paths; no matches found. The three intended legacy file deletions were also included.
- Staged whitespace check passed.
- Backend auth: 11 tests passed.
- Real Firestore emulator integration: 27 tests passed, with SQLite mtime unchanged.
- Netlify compatibility: 5 tests passed.
- Compiled Netlify handler: 15 checks passed; no live Firebase calls.
- Finance and web typechecks passed. The preceding Netlify/Node builds and browser acceptance results are recorded in module 11.

This is preparation-branch verification, NOT a production security approval. Tests that need real Google/Gemini/Storage/IAM or Linux Netlify runtime were not silently counted as passed.

## Preview runtime checkpoint

Draft PR: https://github.com/federinho21/control-finanzas/pull/1. Netlify successfully built commit `4c7f109` as deploy `6aceb3a516f9052d20533b92` in context `deploy-preview`, with a Node 24 streaming server Function and no production publication (`published_at: null`). Preview URL: https://deploy-preview-1--control-finazas.netlify.app.

HTTP verification found 502 responses, including `/login` and `/api/auth/me`, despite the successful build. The cold-start error was `ERR_REQUIRE_ESM`: `jwks-rsa@4.1.0` requires `jose@6.2.12`. Local reproduction on Node 24 with `--no-experimental-require-module` failed identically; a no-network assertion importing Firebase Auth with `--experimental-require-module` passed.

AWS Lambda disables this feature by default and documents a `NODE_OPTIONS` override: https://docs.aws.amazon.com/lambda/latest/dg/lambda-nodejs.html#nodejs-experimental-features. The override is experimental and affects AWS support/SLA eligibility; it is NOT a production sign-off. Review bundling compatibility or an upstream stable resolution before production.

Netlify acknowledged upserts of the four public Firebase SDK variables and `FIREBASE_PROJECT_ID`, scoped to `deploy-preview` only. It also acknowledged preview Functions variables `NODE_OPTIONS=--experimental-require-module` and `AUTH_ORIGIN=https://deploy-preview-1--control-finazas.netlify.app`. No private credentials or Gemini keys were supplied. The environment reader still returned an empty list, so acknowledgement alone does not prove runtime propagation. A rebuild and real HTTP verification remain required. This Origin is specific to PR 1; other previews require deliberate configuration.

## Remaining release gates

The preview rebuilt at commit `4413ca4` but still returned the same 502. The experimental environment workaround did not resolve the deployed failure. The replacement fix bundles `firebase-admin`, `jwks-rsa` and `jose` through Nitro, with CommonJS default-export interop set to `preferred` (needed by the bundled debug shim). No dependency downgrade is used. The compiled smoke test now starts a separate plain Node process with `--no-experimental-require-module` and an empty `NODE_OPTIONS`: `tsx` alone masked the failure. This regression failed before the bundling fix and passed afterward, along with all 15 compiled route checks. Remote verification of this replacement remains necessary.

Remote follow-up: commit `1c1011f`, deploy `6aceb816bfdf1c5de04adbdf`, resolved the cold-start failure. `/login` and icons returned 200; private APIs returned 401; requesting `/dashboard` displayed the login page. Public Firebase runtime configuration was still empty. Direct CLI/API inspection confirmed that the MCP acknowledgements had not persisted environment variables. Granular Functions-only scope returned Forbidden; all scopes succeeded. The four public SDK fields, `FIREBASE_PROJECT_ID` and the exact PR-1 `AUTH_ORIGIN` were then created through the CLI API with all scopes but ONLY `deploy-preview` context. Responses confirmed their keys/scopes/context. No `NODE_OPTIONS` workaround or private credentials were present. CLI OAuth was authorized and the ignored `.netlify/state.json` links only the selected site. Rebuild to pick up these public variables before testing Google login; Firebase authorized-domain and server credential setup remain pending.

## Authorized session identity setup

Fede explicitly authorized adding the preview hostname and subsequently creating a dedicated service account and configuring its IAM permissions/credential. Firebase now includes `deploy-preview-1--control-finazas.netlify.app` in authorized domains, preserving both existing Firebase hostnames. Preview deploy `6acec0b99a8d41e5602c7bcc` returned 200 for login with the correct public Firebase project/app configuration and 401 for anonymous `/api/auth/me`.

Created service account `cf-netlify-preview@wallet-payment-tracker-fede.iam.gserviceaccount.com` and custom role `projects/wallet-payment-tracker-fede/roles/cfNetlifySessions`, containing ONLY `firebaseauth.users.get`, `firebaseauth.users.update` and `firebaseauth.users.createSession`. The role supports user lookup/revocation and session creation; it cannot administer IAM, billing, Storage or Firestore. IAM changes used the existing policy etag and preserved prior bindings; read-back assertions verified the new grant and preservation. An initial IAM propagation delay returned "service account does not exist"; rerunning the same idempotent setup succeeded before any key was generated.

One RSA-2048 service-account key was generated in memory and sent directly over HTTPS to Netlify as secret `FIREBASE_SERVICE_ACCOUNT_JSON`. No private key/token was printed, written to disk or committed. The stored JSON contains only the fields consumed by the existing certificate initializer, under 3 KB. Netlify's plan requires the secret scopes `builds`, `functions`, `runtime`; post-processing is excluded. The value is restricted to branch context `prepare/firebase-netlify`, NOT all deploy previews or production. Keep that branch trusted; build code in it can access the secret. API metadata read-back verified the secret marker and exact branch context. A rebuild and Fede's real Google login are still required to verify runtime propagation and UID preservation.

Firestore permissions remain deliberately absent: successful Google session creation does not imply financial API access. Grant database access only as a separately reviewed step. Firebase Admin bypasses Firestore rules, so the UID-scoped repository validation remains the data-isolation boundary. No database migration, data writes, production publication, paid resource or billing change occurred in this setup.

Rollback: remove the dedicated role binding and revoke the dedicated account's user-managed key via Google IAM; remove its Netlify secret and rebuild the preview. Do not revoke the pre-existing Firebase Admin SDK account's keys. Server key rotation and production identity are separate release gates.

## Read-only Firestore acceptance step

Fede reported successful real Google login and asked to continue with payment access. The existing Google account remains linked to Android UID `MOjsiAMSkAZGtBwqzvvpJELHrjj2` according to Firebase Auth; the browser session UID itself has not been independently inspected. A read-only aggregation of top-level `payments` filtered by that UID returned 19 source records. This count is not a promise of 19 displayed movements: the web intentionally excludes unparsed/unsupported-currency records and respects owner hide markers.

Granted the existing dedicated preview identity a separate custom role `projects/wallet-payment-tracker-fede/roles/cfFirestorePreviewRead`: ONLY `datastore.databases.get`, `datastore.databases.getMetadata`, `datastore.entities.get`, `datastore.entities.list`. These permit queries/read transactions, not document creates/updates/deletes, imports/exports, index administration or IAM changes. Policy etag and read-back assertions preserved previous grants; no new key was generated. This project-level IAM role is not a per-user document filter: Firebase Admin bypasses rules, so the server's verified UID and owner-filtered repository queries remain mandatory isolation controls.

The role and bindings were verified administratively. A read-only attempt to obtain a short-lived impersonation token for independently testing this service identity was unavailable; no API or impersonation privilege was enabled to bypass that limitation. The count above used the existing operator login, NOT the deployed service account. Real financial reads from Fede's browser, two-user acceptance and indexes remain pending. IAM propagation may take time; reload the signed-in preview. No Firestore content, Android payment, rule/index configuration or production deployment was changed. Financial writes/chat quota writes/uploads remain unavailable with this read-only identity.

Rollback for this step: remove only the `cfFirestorePreviewRead` binding for `cf-netlify-preview`, leaving the existing session role and all unrelated principals untouched.

## Financial-read runtime fix

Fede reported empty movements after login. Netlify request logs showed 503 for `/api/tasks`, `/api/rocks`, `/api/sprints`, `/api/cuotas` and `/api/dashboard`, not successful empty results. A projection-only source diagnostic found all 19 owner records parsed in CRC with numeric timestamps in October 2026 (4 incoming, 6 outgoing, 7 purchases, 2 legacy-direction records); no raw notifications or amounts were printed.

The bundled Firebase Admin Firestore initializer left `require('@google-cloud/firestore')` inside a try/catch in an ESM chunk. The dependency was present, but initialization threw `ReferenceError: require is not defined`, wrapped as `firestore/missing-dependencies`. A new plain-Node compiled-client regression using a generated dummy certificate reproduced the failure WITHOUT contacting Firebase. Setting Nitro `commonJS.ignoreTryCatch=false` converts that require through the bundler rather than ignoring it. The regression then passed, with the existing 15 compiled route checks, 5 Netlify compatibility tests and finance typecheck. No dependency, permission, data migration or ownership-filter change is part of this fix. Real authenticated financial HTTP reads still require verification from Fede's session after the preview rebuild.

## Monthly-summary index readiness

Fede subsequently confirmed all movements appear. Post-fix Netlify logs show 200 for `/api/tasks` and `/api/dashboard`; the October monthly summary still returned 503. Operator read-only reproduction confirmed Android's timestamp-filtered query returns 19 rows, while the nested manual-payments query fails with `FAILED_PRECONDITION` (missing index). The real-emulator isolation suite (27 tests) and finance-model suite (5 tests) passed again; emulator success does not validate production composite-index availability.

After explicit approval to create ONLY the missing index, created `projects/wallet-payment-tracker-fede/databases/(default)/collectionGroups/payments/indexes/CICAgJiUpoMK`, collection scope, fields `userId ASCENDING`, `deadline DESCENDING`. The existing Android `userId/timestamp` index was READY and was not modified. The new definition already exists in `firestore.indexes.json`; no whole-config deploy, rule/TTL publication, source-data modification or billing change was performed. Creation initially reported INITIALIZING; require READY and retry the same real query before declaring the summary working. Do not delete the Android index when reconciling deployment configuration.

Follow-up verification: the new index reached READY. An initial query immediately after the state transition still failed; retrying the actual repository-shaped nested monthly query succeeded with 0 manual records (expected: existing records are in Android's top-level collection). Android's October owner query had independently succeeded with 19 records. This resolves the reproduced index prerequisite, but the live `/api/resumen` response and displayed totals must still be confirmed in Fede's browser. No credential or document content was printed during the query checks.

## Preview document-write enablement

Fede confirmed the displayed monthly totals are correct, then authorized continuing to enable/test web writes. Before the grant, the real-emulator isolation suite (27 tests) and compiled Netlify smoke checks (15 routes plus plain-Node cold start/Firestore initialization) passed again. Tests covered owned manual creation, concurrent cuota payment idempotency, cross-user mutation rejection and preservation of imported Android records.

Added a separate custom role `projects/wallet-payment-tracker-fede/roles/cfFirestorePreviewWrite` with ONLY `datastore.entities.create`, `datastore.entities.update`, `datastore.entities.delete`, bound to the existing dedicated preview service account. Used policy etag, verified the exact role permissions and preserved all earlier bindings. No extra key, administrative/billing/storage permission or financial record was created by the operator. No production merge/deploy or rules/TTL publication occurred.

The previous read-only restriction is now superseded for this identity. The credential remains restricted to the trusted preparation branch, but IAM document permissions apply project-wide, not only to a UID or the `users` collection. Runtime repository ownership checks enforce user isolation; top-level Android captures remain a read-only source in application code. The UI's deletion of an imported payment writes an owner hide marker, never deletes the Android source; imported completed status cannot be modified.

Live create/update/delete and cuota payment acceptance are still pending Fede's browser session. A manually created test movement changes totals until removed; creating the first one may also persist the default account/period even after deleting that movement. Avoid using an Android source payment for destructive acceptance. Chat is not signed off by this permission grant: its Firestore quota writes are now permitted, but model key/runtime, approval indexes and live acceptance remain separate gates. Storage/PDF upload is still unresolved.

Rollback: remove only the preview identity's `cfFirestorePreviewWrite` binding to return to read-only, preserving its session/read roles. Previously created documents are not rolled back automatically.

## Gemini preview configuration

Fede confirmed manual movement create/delete works in the live preview, then requested continuation to the assistant. The existing local Gemini API key successfully listed models and included the configured `gemini-3.6-flash`. Two minimal SDK requests using that exact model, without financial data, failed with 503 `Service Unavailable` / high demand (the second returned in 696 ms). Model listing is not generation acceptance. No model substitution or automatic retry policy was introduced.

Stored the existing key directly in Netlify as secret `NUXT_GEMINI_API_KEY`, branch context ONLY `prepare/firebase-netlify`, scopes `builds`, `functions`, `runtime` (not post-processing). API metadata verified the secret flag and branch restriction. No secret was printed or committed; no user financial content was sent during the smoke tests. A preview rebuild must load this runtime value. Real authenticated SSE, financial answers and approvals remain pending; live generation is blocked by the observed provider availability error, not a claim of successful chat acceptance. Keep production contexts without this preview secret and keep the branch trusted.

Rollback: remove the branch-specific Gemini secret and rebuild the preview. This does not revoke the user's original local key or undo prior Gemini usage. Gemini quota/cost and Netlify's 60-second streaming limit remain launch gates.

- Source publication is confirmed; select this branch for protected staging/preview without replacing production `main`.
- Server Firebase credentials and verified least-privilege IAM; do not paste private keys in chat.
- Netlify variables, exact Origin and Firebase authorized domains per trusted deploy context.
- Private document-storage decision; changing hosting does not remove Firebase Storage's billing requirement.
- Remote indexes/TTL and rule review; preserve the Android app's source configuration/data.
- Whole-request runtime/cancellation and live two-user acceptance.
- Last dependency audit: 71 findings, including 2 critical DevTools findings; remediation/security sign-off remain required before production.

Earlier module statements that no commits/pushes occurred describe those earlier checkpoints, not this newly authorized preparation publication.
