# Finance-only release: AI exclusion

## Scope and acceptance

Fede authorized continuing with the finance-only release. This change disables model calls in application code even when an old Gemini key remains configured. It does not delete documents, vectors, approvals, financial records, dependencies or remote credentials. Re-enabling AI requires a reviewed code change, not a client request or environment toggle.

- Keep authenticated manual finance APIs and narrowly recognized deterministic monthly/category chat queries working.
- Unknown chat messages and explicit AI retrospective actions must return an honest Spanish explanation before pending-plan lookup, model initialization or model traffic.
- Keep existing owner/session-bound approval and cancellation actions. Do not run the AI judge after a successful financial status change.
- Refuse document uploads after authentication/origin checks but before quota, parsing, database or Storage writes: current ingestion requires AI embeddings. This temporary dependency block is **not** a decision to remove PDFs/RAG from the release.
- Fence the shared Gemini-key access point so all existing model and embedding consumers fail closed, including a cached embedding client.
- Label the chat as limited queries, stop advertising AI generation and disable attachments accessibly. Keep financial navigation and existing approval UI.
- Prove the exclusions with focused tests, existing financial/emulator suites, browser tests and compiled Node/Netlify checks. Do not weaken CI or dependency auditing.

Trust boundaries: authenticated chat/action JSON, upload bytes, stored owner data and external Gemini calls. Abuse cases include stale keys enabling AI, explicit retrospective actions bypassing text classification, repeated embeddings using a cached client, uploads creating partial files before refusal and a successful financial write reported as failed by a disabled post-write judge.

Real two-user/Android acceptance, PDF/storage scope, production backups and the existing unpatched dependency blockers remain separate open gates. Local tests use synthetic data only; no production deployment or credential change is part of this slice.

## Implementation and boundaries

`shared/finance-release.ts` holds the code-fixed `AI_ENABLED = false` policy and the chat explanation. `server/utils/ai-policy.ts` refuses AI with HTTP 503 and a Spanish `data.message`. The existing shared Gemini-key getter calls this guard before reading runtime configuration; every application model constructor and embedding invocation found by the source search uses that getter. Repeated embedding calls also pass through it before returning the cached client. This is an application policy, not an outbound firewall or a claim that dependencies contain no AI code.

The supervisor retains the narrow read-only shortcut and deterministic approval/cancellation/status actions, declines explicit retrospectives, then returns the disabled explanation for other text **before** pending-plan lookup. Existing authenticated financial APIs remain unchanged. The graph's post-write judge edge is disabled so a committed status change is not followed by an unavailable model call. No fake successful AI verdict is returned.

`POST /api/upload` still checks authentication and same-origin requests, then refuses before quota/body parsing/repository creation/Storage access. Its current ingestion path always requires embeddings. The owner-checked provisional-document deletion endpoint stays available; no existing data is removed by enabling this policy. PDFs/RAG remain pending a product/storage decision, rather than being silently deleted from scope. Document repository tests still exercise the retained ingestion/search behavior with synthetic injected vectors.

Desktop/mobile navigation now says “Consultas”. The chat explains the limited query syntax and routes manual registration to Finanzas. Its welcome preserves Fede's name, Costa Rica date/time and “¿En qué te puedo ayudar hoy?”. Attachments are disabled with an accessible name and explanation; changing client HTML cannot bypass the server guard. Existing approvals/previews remain reachable and owner/session-bound.

No environment switch was added. A leftover `GEMINI_API_KEY` or `NUXT_GEMINI_API_KEY` is insufficient to enable model calls. Removing/rotating remote keys or changing Netlify configuration is not part of this work. A future AI reactivation needs a reviewed implementation and new privacy/security/storage acceptance, not simply flipping a production variable.

## Verification evidence

- RED: new key-access test failed because runtime configuration was still read; unsupported chat failed at pending-plan Firebase lookup. GREEN after adding the application policy.
- RED: the new browser case could not find the finance-only heading in the previous compiled app.
- Focused regressions cover a stale synthetic runtime key, repeated embeddings, disabled model-dependent text/retrospective actions, retained approval/cancellation routing, authenticated upload refusal with 401/403 precedence, and the actual graph through the Fetch/SSE adapter with exactly one terminal `done`.
- A new mandatory `tests/finance-only.integration.test.ts`, included by `npm run test:finance` and the strict finance typecheck, uses a synthetic local emulator. The real graph returns A's exact CRC 0.30 total/category without B's values, completes a movement without entering the judge node, approves a stored draft and replays it without another movement. No external Fetch destination was attempted in that run. This is not real two-user acceptance or exhaustive network instrumentation.
- Local CI-policy/auth/web-session/model/migration/dependency-security/financial/emulator/backup suites and all three scoped typechecks passed. The native production audit still reports **11 high, 0 critical/moderate/low**. No lockfile, dependency, audit threshold or branch-protection change.

- Mutation check: removing the `AI_ENABLED` condition from the post-write judge edge failed the new emulator test at its no-judge assertion. The condition was restored and the test passed again.
- Compiled Node check: the actual exported Gemini getter returns the AI-disabled 503, before runtime-key access. A shared compiled-boundary smoke assertion now runs in both existing build-check commands. It failed on the old Netlify artifact (which only complained about a missing key), demonstrating that it distinguishes policy exclusion from absent configuration.
- The first updated full browser run passed 12/13 cases; the identity-switch test still searched for the renamed “IA” navigation link. Its locator was updated to “Consultas”, preserving all identity-isolation assertions. The final full run passed **13/13**, with no retries/skips. The new finance-only UI test checks visible limits, a disabled named attachment control, no upload request, no console errors and no horizontal overflow at 320/768/1024/1440 widths. The mobile screenshot was inspected.
- Fresh local Node and Netlify builds passed, including the actual compiled Gemini-key refusal and the existing fifteen route checks per target. Final focused tests/types passed after restoring the judge mutation and formatting the upload factory. No production request, live identity acceptance or review of the remote deployed ZIP is claimed.
- Chrome DevTools MCP is not configured in this session; verification uses the repository's isolated Playwright/Edge browser, screenshots and console/network assertions instead. No personal browser profile or live Firebase session was used.

Local evidence under `C:\Users\Fede\AppData\Local\Temp\opencode\`: `finanzas-ai-off-regressions.log`, `finanzas-ai-off-final-focused.log`, `finanzas-ai-off-judge-mutation.log`, `finanzas-ai-off-build-node-final.log`, `finanzas-ai-off-build-netlify.log`, `finanzas-ai-off-audit.json`, and browser results under `finanzas-web-test-results/`. The first Node build hit the harness's 180-second timeout during compilation; a background build completed successfully without dependency/config changes or warning suppression. Existing build dependency warnings are not presented as resolved.

Clean remote CI evidence must be recorded separately before declaring the published slice verified. Local builds include the preserved parallel FK Trace/login/mobile/merchant working tree; only clean CI on the exact committed SHA isolates the new policy from those changes. The older dependency reachability assessment must not be extended to a new artifact without revalidation.
