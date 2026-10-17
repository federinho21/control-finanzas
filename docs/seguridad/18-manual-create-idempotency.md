# Manual-create retry safety

## Contract and scope

Protect manual movement and cuota creation when a write commits but its HTTP response is lost. No financial migration, new endpoint, external service, IAM/rules/index deployment or production publication is authorized by this change.

- Existing JSON bodies and `{ id }` responses stay unchanged. `POST /api/movimientos` and `POST /api/cuotas` accept an optional `Idempotency-Key` UUID header. A supplied malformed key is rejected before writes. Requests without a key preserve their old behavior and are not retry-safe.
- The authenticated cookie supplies the UID. A key is scoped to that UID AND operation; it is not authentication, an account ID or an approval token.
- The first valid request creates the financial record, any required anchors and a receipt in ONE Firestore transaction. Concurrent retries wait through normal transaction conflict handling and return the same ID. A failure before commit leaves no receipt or financial write.
- Receipts live in the existing private `users/{uid}/internal` collection, with an operation-prefixed key, owner, operation, canonical-request SHA-256 fingerprint, original ID and creation time. No raw financial description/body is copied into the receipt.
- Same key + equivalent validated data returns the original ID, even after the created record is later deleted. It never recreates deleted data. Same key + different canonical data returns 409. Equivalent money/trimmed labels normalize at the existing input boundary. An omitted movement date stays omitted in the fingerprint, so replay does not become a new intent at midnight.
- Receipts do not expire automatically. No TTL or cleanup is added: deleting a receipt would make a late retry unsafe. Account-wide deletion/retention design remains separate.
- Each native form generates one key per submitted body and retains it through errors. Success clears it; a changed body is a distinct intent and gets a new key. It is held only for the mounted component lifetime, not in local/session storage. Reloading, navigating away or editing after an ambiguous failure may therefore create a distinct record; users must still review records in those cases. There are no automatic HTTP retries.
- Separate new submissions with identical fields remain separate valid financial records. No amount/date-based deduplication is added. Chat approval atomicity/replay semantics and Android top-level payments are unchanged.

## Acceptance plan

1. Emulator repository/API checks: concurrent same-key retries create one exact-amount record; different data conflicts without mutation; same key remains isolated across owners and operations; malformed keys and invalid/forged bodies cannot write; a failed transaction leaves no receipt; deleted records do not reappear; old no-key clients still work.
2. Isolated browser checks: a lost/rejected response keeps the same key and body for retry; success and edits start a new intent; movement/cuota methods and authenticated API behavior remain intact. Only synthetic auth/data are used.
3. Existing finance/model/chat/auth/browser/Netlify tests, typechecks and builds must continue passing. Record actual evidence below before publishing to the preparation branch/preview. No production release is implied.

## Verification status

Repository slice: the new tests first reproduced four movements from four concurrent retries and a missing receipt. The shared atomic receipt path then passed all 34 emulator integration tests and the finance typecheck, including owner/operation isolation, canonical payload comparison, rollback, corrupted receipt rejection and deletion replay.

HTTP slice: the first header integration test still reproduced three records because the old handler discarded the key. Both endpoints now validate and pass it through the data-node command to the repository. All 35 emulator integration tests, finance typecheck and 5 Netlify compatibility tests passed, including malformed headers, payload conflict, forged owner/body rejection, auth/CSRF denial and unchanged no-key clients. Browser wiring and deployment are pending; the new browser tests currently reproduce missing keys against the preceding frontend artifact.

UI slice: both forms now submit the header, retain the key/body after failed responses and clear them only after success. The browser fixture simulates committing a synthetic record and losing its response; the unchanged retry returns the same synthetic ID with one fixture record. A new submission after success and an explicitly edited body receive distinct keys. Movement and cuota 422 retries also preserve their respective keys. All 11 isolated browser tests passed against the rebuilt frontend; no real account/session or financial record was used. Error copy explains the edit/reload limitation instead of claiming all retries are safe.

Final local checks: 35 emulator integration tests, 11 backend auth tests, 13 web-session tests, 19 chat tests, 7 model tests, 5 Netlify adapter tests, finance/web typechecks, Node/Netlify builds and 15 compiled route/startup checks passed. A mutation temporarily removing the payload fingerprint comparison was caught by the changed-body rejection test; the original condition was restored and all three focused manual-create integration tests passed again. No mutation remains in the diff.

The native production-graph audit was rerun on October 16, 2026: still 20 findings (0 critical, 15 high, 4 moderate, 1 low). No dependency or audit threshold changed. Gemini latency, real two-user acceptance, PDF/Storage decisions and other documented production gates remain unresolved; this local verification is not production approval.

Local evidence under the approved OpenCode temp root: `finanzas-manual-idempotency-red.log`, `finanzas-manual-idempotency-repository-green.log`, `finanzas-manual-idempotency-http-red.log`, `finanzas-manual-idempotency-http-green.log`, `finanzas-manual-idempotency-mutation.log`, `finanzas-manual-idempotency-restored-green.log`, `finanzas-manual-idempotency-node-build.log`, `finanzas-manual-idempotency-netlify-build.log`, `finanzas-audit-20261016.json`. Authenticated preview acceptance is still pending; only the preparation branch/preview may be published without separate production approval.
