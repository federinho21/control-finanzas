# Module 5 — Private agents and durable approvals

## Implemented

- `/api/chat` authenticates the secure cookie and checks Origin before parsing or calling AI. Strict JSON rejects client UID injection, missing/invalid UUID conversations and oversized messages/bodies. Conversation IDs identify approvals, never authenticate users.
- Verified UID travels through LangGraph, supervisor, planner, data, knowledge, judge and retrospective. Reads use owner-scoped repositories; no reachable SQL/D1 tools remain. Android SHA payment IDs retain lowercase instead of being uppercased.
- `users/{uid}/pendingActions/{uuid}` replaces process-local Maps. Owner, conversation, kind, expiry and state are checked transactionally. Approvals create finance records and mark consumption in the same transaction. Concurrent retries return the original result rather than duplicating writes.
- Proposals expire after one hour; configured `purgeAt` TTL removes approval records after one day. App-level expiry applies even before asynchronous TTL deletion. Edits use optimistic version checks and keep the approval ID.
- Edited plan/task fields are schema-validated; anchors come from the stored task proposal. Money uses integer minor units. Boundary, ownership, reserved-ID and atomic-size checks run before writes.
- Destruction confirmation and status pickers have durable, entity-bound approvals. Account deletion reserves deleted movement IDs and never deletes top-level Android payments. Imported payments remain read-only. Period status stays derived from movements.
- Preview cancellation now cancels the server approval, not just the browser state. `cancel_plan` and `cancel_tasks` use the same authenticated SSE endpoint.
- SSE preserves status → result/error → optional warnings → exactly one terminal `done`. Private provider errors are not returned. Chat quotas use Firestore: 20 requests/minute/UID across instances.

## Files changed

New: `server/repositories/agent.ts`, `server/utils/request-input.ts`.

Updated: `server/repositories/finance.ts` (protected shared transaction helpers), `server/agents/{graph,supervisor,planner,strategy-planner,data-agent,state-store,knowledge,judge,retrospective}.ts`, `server/api/chat.post.ts`, `server/middleware/legacy-security.ts`, `app/{composables/useChat.ts,pages/preview.vue}`, `firestore.indexes.json`, `tests/finance.integration.test.ts`.

Removed: unsafe global `server/agents/tools/sql-tools.ts` and `guardrails.ts`; their reachable functionality now runs through scoped repositories. SQLite/D1 schema/driver files remain available for historical export, not HTTP execution.

## Verification

Run from `base-agent/`:

```powershell
npm run test:finance
npm run typecheck:finance
npm run typecheck:auth:web
npm run test:auth
```

The real Firestore emulator suite has 27 passing tests, including two-user ownership, wrong conversation/kind, replay, cancellation/expiry, malformed edits, status replay, document linking and SSE success/error order. Deliberately inverting the conversation-ownership condition caused four failures, including a wrong-session approval regression; the condition was restored and all 27 passed again. SQLite mtime is asserted unchanged.

Two-user live acceptance: sign in as A and create a proposal; submit its action ID and A's conversation from B, then submit from another A conversation. Neither may create records. Replay a valid A approval and verify one set of records. Run these checks only after Google linking and configuration are completed.

## Remaining limits

Live Gemini calls were not made. Query context is bounded; AI prose is not accounting truth. Account deletion is rejected if its cascade would exceed 450 estimated writes. Existing auth/general finance rate limits remain per-instance; chat/upload limits are distributed. Remote indexes and TTL policies must be enabled before release. Broad web typecheck now passes after correcting Nuxt UI select slots and assignment-only button handlers; no suppressions were added.
