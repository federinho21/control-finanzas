# Conversational movement registration with explicit approval

## Contract and scope

Fede authorized improving the preview through production readiness, including conversational movement registration. Example: `Registra un gasto de 25 colones por almuerzo en Comida hoy.`

The classifier extracts a single CRC draft. Strict `movementDraft` validation requires type, description, category, positive exact-decimal amount, currency and an explicit resolved date no later than the current Costa Rica date. Unknown owner/account/period/approval fields are rejected. Canonical amounts remain major-unit strings across repeated validation; only the existing movement writer converts to integer minor units. Known USD/dollar/euro registration wording is clarified before model/database access and checked again in the data operation. This is not a general currency-conversion feature.

The data node persists only a provisional `movement` action under `users/{verifiedUid}/pendingActions/{actionId}`, bound to the verified UID, UUID session and kind, with the existing expiry policy. It returns a plain-text/escaped Markdown review of type, amount, description, category and date, plus `actionRequest.type=approve_movement`. No financial account/period/payment is created at proposal time. Ambiguous or incomplete input asks for clarification; partial conversational draft editing/history is not implemented. Cancel and submit a complete new request to correct a draft.

## Additive API/UI contract

- `POST /api/chat` accepts `approve_movement` and `cancel_movement` actions with an action UUID. Payload overrides are rejected; the displayed stored draft is the only source of approved values.
- These actions bypass Gemini and require the same authenticated UID/session as the proposal. Typed chat text such as `sí` is not an approval action.
- The existing chat action renderer displays **Confirmar movimiento** and **Cancelar movimiento**. No separate preview page or new public endpoint is added.
- A successful result adds optional `resolvedActionId`; the client removes that action's buttons ONLY after server acknowledgement. Transient errors preserve the buttons for a safe retry.
- Existing result/status/error/guardrail semantics and the single terminal SSE `done` remain unchanged. Plan/task approval contracts are unchanged.

## Atomic persistence and replay

The existing manual movement writer is shared as a protected transaction helper, retaining ownership, default anchors, date boundaries, generated-ID collision/hidden-ID checks, period status updates and amount conversion. `approveMovement` reads/validates the stored draft, queues the exact movement/default anchors and marks its action consumed in ONE Firestore transaction. Concurrent/retried approvals return the original stored result. A failure after writes are queued rolls back payment, anchors and consumption together. Expired/canceled/corrupt/wrong-kind/foreign-session or foreign-UID approvals cannot create a movement. Cancel changes only pending action metadata. Android's top-level `payments` is never written by this flow.

New records use existing manual movement semantics (`status=pending`, `origin=manual`). Registration is not verification that a bank charge settled. Approval idempotency applies to one action ID; submitting the same text as a NEW draft creates a distinct intent and may create another movement if separately confirmed. A network timeout does not prove failure; retry the original confirmation instead of creating a new draft.

## Runtime/error handling

The classifier keeps its six-second budget, now uses an abort signal and zero SDK retries rather than leaving an invocation/timer running after `Promise.race`. Output is bounded to 1,000 tokens. Only allowlisted error kinds and numeric HTTP status are logged, never prompts, tokens, stacks or model output. Provider timeout/429/5xx produces an explicit temporary-unavailability clarification and no financial write. Initial live probes sometimes returned clarification instead of a draft; availability/latency is not guaranteed by a successful sample.

## Verification

- 7 finance-model tests: exact minor units, idempotent canonical draft parsing, currency/date/amount/authority rejection and currency wording.
- 32 real-emulator integration tests: no payment before confirmation, four concurrent approvals produce one exact CRC 25.00 movement, UID/session/kind checks, cancellation/expiry/corruption, rejected HTTP overrides, unchanged source payments, atomic failure rollback and retry, and one terminal `done`.
- 17 chat behavior tests, 11 backend auth tests and 5 Fetch/Netlify compatibility tests passed.
- 9 Playwright tests passed against an isolated Node build, including mobile confirmation/cancel, no horizontal overflow, stable action/session payload, buttons removed on success and retained on transient error. Screenshots are in the approved temp test-output directory; no daily browser profile or real credentials were used.
- Live Gemini + local emulator + HTTP/auth fixture exercised full proposal/approval/replay/cancel, another user/session rejection and incomplete/unsupported-currency input. The approved fixture produced one CRC 25.00 movement; cancellation/invalid input produced none. No real Firebase financial record was modified. Synthetic identity fixtures are not real Google acceptance.
- Finance/web typechecks and Node/Netlify builds passed; compiled Netlify route/cold-start/Firestore checks passed. Static fresh-context review found no actionable contract violations; Fede continued with the existing review and tests, without an external-model review.

Evidence: `C:\Users\Fede\AppData\Local\Temp\opencode\finanzas-movement-flow-results.json`, `finanzas-movement-confirmation-netlify-build.log`, `finanzas-movement-confirmation-node-final-build.log`. Real authenticated preview acceptance still requires Fede's session.

## Deployment/rollback boundaries

No migration, new index, IAM/billing change, production merge or production publication is needed. Keep the branch trusted because its existing server secrets have build/function access. Provisional action expiry is checked by the server; remote TTL cleanup remains a separate, not-yet-deployed policy. Rolling back code does not delete previously confirmed financial records. Existing pending proposals may become unusable on an older revision; do not auto-approve them or delete Android data to compensate.
