# Module 3 — Web Google login and session lifecycle

Date: 2026-10-12.

## Outcome

Implemented Google login UI, server-cookie session recovery, protected Nuxt routes, desktop/mobile logout, cross-tab logout notification, private-state reset and cancellation of stale requests/streams. Reuses module 1's endpoints without changing their authentication policy.

**Local functional tests pass; production acceptance is still pending.** Genuine Google login requires Firebase web configuration and completion of Android account linking. Broader Vue type checking and dependency audit are not clean. The legacy finance APIs and LangGraph are still unprotected/global until modules 4–6. A frontend route guard is not backend authorization.

No Firebase application/provider/rule was registered or changed remotely. No D1 or Firestore data was migrated or deleted, and nothing was deployed. Module 4 has not started.

## File-by-file changes

All paths are relative to `base-agent/`:

| File | Change |
| --- | --- |
| `app/utils/web-session.ts` | Testable cookie-session lifecycle; restoration/login/logout, request cancellation, generation checks and generic errors |
| `app/plugins/firebase.client.ts` | Lazy Firebase Web initialization; Google account chooser; in-memory persistence; temporary ID token; SDK sign-out in finally |
| `app/plugins/auth.ts` | Per-Nuxt-app/per-SSR-request session wiring; cookie-aware fetch; resets private state and dashboard cache; cross-tab notifications without tokens/UIDs |
| `app/composables/useAuth.ts` | Reactive user/status and lifecycle methods |
| `app/composables/useApi.ts` | Local-only API helper; forwards SSR cookie, includes browser credentials, disables retries, rejects stale replies and handles 401 |
| `app/middleware/auth.global.ts` | Validates session before private pages; unauthenticated redirects; no-store/Vary: Cookie headers on SSR responses |
| `app/pages/login.vue` | Accessible Google login, Android-linking acknowledgement, generic failure/retry controls |
| `app/app.vue` | Hides private page/navigation without identity; remounts page on UID change; immediate router state prevents logout navigation deadlock |
| `app/components/AppSidebar.vue`, `MobileNav.vue` | Accessible logout controls |
| `app/composables/useBacklog.ts`, `useResumen.ts` | Cookie-aware requests and version checks before storing replies |
| `app/composables/useChat.ts` | Cookie-aware abortable SSE; refuses old-session events and mutations; preserves event order and terminal behavior |
| `app/components/chat/ChatInput.vue` | Upload through session-aware helper; ignores old-session completion/error callbacks |
| `app/components/finanzas/MovimientoForm.vue`, `CuotaForm.vue`, `MovimientoTable.vue` | Session-aware requests; no successful-delete notification on failed requests; uses existing Nuxt UI toast helper |
| `app/pages/dashboard.vue` | Session-aware async data with an explicit resettable cache key |
| `app/pages/preview.vue` | Session-aware document deletion and stale-session checks before navigation/approval completion |
| `nuxt.config.ts` | Public Firebase client config placeholders; no server credentials under public config |
| `package.json`, `package-lock.json` | Firebase Web SDK; Playwright/vue-tsc verification dependencies and scripts |
| `tests/web-session.test.ts` | Thirteen session-lifecycle tests |
| `tests/auth-browser.spec.ts`, `playwright.config.ts` | Eight isolated Edge/Chromium UI tests with simulated API responses |
| `tests/start-test-server.ts` | Shared compiled-server fixture with temporary empty DB and disabled remote credentials |
| `tests/auth-build.smoke.ts` | Reuses fixture; adds private SSR redirect/cache-header check |
| `tests/tsconfig.auth.json`, `tsconfig.web.json` | Core strict check and broader Vue integration check; no suppressions or ignored errors |

`usePlanPreview.ts` did not need restructuring: its existing keys are reset centrally, together with chat, backlog, summary and pending-query state. No repository/storage abstraction was added in this module.

## Authentication contract

1. Login explicitly warns that Google must first be linked to the Android anonymous user. Its acknowledgement prevents accidental clicks, but **does not prove server-side that Android linking happened**.
2. Firebase Google popup returns a temporary ID token. Firebase uses `inMemoryPersistence`; the module never writes tokens/passwords to localStorage/sessionStorage or Nuxt state.
3. Firebase Web SDK is signed out after token retrieval. This clears the temporary browser SDK session, not the server session or Android account.
4. Token is sent only to `POST /api/auth/session`. Cookie identity is then rechecked through `GET /api/auth/me` before private UI is enabled.
5. SSR uses `useRequestFetch` to forward the cookie to the internal auth endpoint. Browser reload also rechecks the cookie rather than trusting serialized UI state.
6. Route middleware revalidates on navigation. A private API/chat 401 clears state and returns to `/login`; a 403 is not treated as an expired session.
7. Logout immediately clears private state and aborts pending frontend requests; it then calls `DELETE /api/auth/session`. Module 1 revokes **all Firebase sessions for that user**, including linked Android sessions on refresh.
8. Network/503 logout failure leaves the UI signed out with an explicit retry requirement. JavaScript cannot remove an HttpOnly cookie; **a reload may restore a still-valid cookie if server logout never completed**. Do not report global revocation as successful in this case.

The chat `sessionId` remains a fresh conversation identifier, not an authentication credential. No client-selected UID is sent to determine ownership.

## Private-state safety

Reset includes accounts, periods, movements, cuotas, monthly summary, chat history/session/pending flags, pending chat query, preview/action/document IDs and the dashboard async-data cache. Page-local editable fields disappear when the page is unmounted/remounted for a different UID.

Empty/null defaults are assigned instead of making mounted arrays undefined, avoiding crashes in existing component watchers during logout. Session generations prevent late HTTP results, uploaded-file callbacks or SSE events from restoring the previous user's data. Abort cancels the **client request**; it does not roll back a backend operation already in progress.

BroadcastChannel sends only `logout-started`, `signed-out` or `session-changed`. Other tabs erase their own caches and recheck the server cookie as appropriate; no token or UID is broadcast. Browsers without BroadcastChannel still recheck on navigation/401 but do not receive immediate cross-tab notifications. Concurrent login in multiple tabs is not an account-switching workflow; use one tab for login and do not assume client cancellation serializes server cookie writes.

## Firebase configuration required for real acceptance

Complete module 2's Android link **before the first real web Google sign-in**, or Firebase may create another UID and future linking can collide.

In the same Firebase project:

1. Register a Web app in Project settings (not done automatically here).
2. Use that Web app's public configuration values in local `.env`:

   ```dotenv
   NUXT_PUBLIC_FIREBASE_API_KEY=<web-api-key>
   NUXT_PUBLIC_FIREBASE_AUTH_DOMAIN=<project-auth-domain>
   NUXT_PUBLIC_FIREBASE_PROJECT_ID=wallet-payment-tracker-fede
   NUXT_PUBLIC_FIREBASE_APP_ID=<web-app-id>
   FIREBASE_PROJECT_ID=wallet-payment-tracker-fede
   AUTH_ORIGIN=http://localhost:3000
   GOOGLE_APPLICATION_CREDENTIALS=C:/outside-the-repository/service-account.json
   ```

3. Enable Google Auth and authorize the exact development hostname (`localhost`) under Firebase Authentication authorized domains. Newly created Firebase projects may not include localhost automatically.
4. Keep AUTH_ORIGIN equal to the actual scheme/hostname/port, without trailing slash. Restart Nuxt after local config changes. If Nuxt chooses port 3001, update the origin accordingly.
5. Run `npm run dev` and visit `/login`. Public Firebase configuration is not a service-account secret; never put admin credentials/private keys in `NUXT_PUBLIC_*`.

Future App Hosting uses an HTTPS AUTH_ORIGIN and managed Admin credentials with the necessary Authentication IAM permissions. Existing Cloudflare build/deploy scripts are not the supported Firebase Admin target; this module does not perform that hosting cutover.

## Verification evidence

Commands:

```powershell
npm run test:auth
npm run test:auth:web
npm run typecheck:auth
npm run build
npm run test:auth:build
npm run test:auth:browser
npm run typecheck:auth:web
npm audit --omit=dev
```

Results:

- Backend auth tests: **10 passed** (module 1 regression).
- Web session unit tests: **13 passed**.
- Browser tests: **8 passed** using installed Microsoft Edge headless with Playwright's isolated profiles, not Fede's browser/account.
- Compiled Nitro auth/page checks: **5 passed**, including unauthenticated SSR redirect and no-store/Vary headers.
- Strict core auth/lifecycle TypeScript: **passed**.
- Production Node Nuxt/Nitro build: **passed**, with existing sourcemap/deprecation/performance warnings.
- `git diff --check`: **passed**; Git reports Windows line-ending normalization warnings.
- Broader `vue-tsc`: **failed**, not suppressed. Nuxt-generated declarations pull existing components/backend types into this check. Remaining errors are in unchanged `app/app.config.ts` (invalid UI slot), `BacklogPanel.vue`/`FinancePanel.vue` (click handlers return strings), `server/agents/data-agent.ts` (possibly undefined update), `graph.ts` (movement type inference) and `server/api/movimientos.post.ts` (possibly undefined date component). No errors remain reported in new module-3 auth files. This is a release blocker, not a clean full-project typecheck.
- `npm audit --omit=dev`: **failed**, latest report totals **78 findings: 1 low, 43 moderate, 26 high, 8 critical**. This snapshot differs from the earlier installation report; neither is a complete reachability assessment.

Browser coverage: unauthenticated deep links issue no private data requests; mobile login has no horizontal overflow and has labelled controls; missing SDK config has a recoverable error; simulated cookie recheck enables the UI; SSE result/judge/guardrail order survives; logout erases chat; switching identity removes old chat/dashboard data; failed logout blocks login and is retryable; chat 401 clears the conversation; logout clears another tab; mobile logout works.

Browser fixtures deliberately hydrate an anonymous login first, then simulate a cookie recheck. Returning different server/client identities during hydration caused an artificial mismatch in an earlier fixture and was corrected rather than suppressing hydration diagnostics. Local icon endpoints are allowed; external requests are blocked. Only expected mocked 401/network failures and explicitly blocked external resources are excluded from console-error assertions. Final scenarios have no unexpected console warnings/errors or uncaught page exceptions.

The tests **do not verify a genuine Google popup/token, an authenticated SSR response, real Firebase cookie issuance, Android UID linking or multi-user backend data isolation**. Unit providers and browser API responses are simulated. No auth bypass/test provider was added to production code.

## Saved artifacts

- Build log: `C:/Users/Fede/AppData/Local/Temp/opencode/finanzas-module3-build.log`.
- Browser artifacts: `C:/Users/Fede/AppData/Local/Temp/opencode/finanzas-web-test-results/`.
- Mobile screenshot: `auth-browser-unauthenticat-c20ec--mobile-login-is-accessible/login-mobile.png` within that artifact directory; inspected visually.
- Compiled tests start Nitro in new `finanzas-auth-test-*` temporary folders with empty SQLite DBs. They never start the legacy cleanup plugin against the project's real `.data/hackathon.db`.

## Dependency audit handoff

No forced downgrade/audit fix was applied. New Firebase SDK import paths are only `firebase/app` and `firebase/auth`; its audited client Firestore/gRPC subtree is not imported by this module. That does not clear the dependency finding or approve future Firestore usage. Existing SSR Vue/devalue and Markdown/LangChain/build-tool findings need targeted reachability review and upgrades before deployment. The login page does not use UAuthForm/UForm (the SSR credential-GET advisory), and has no password form.

Defer the broad dependency remediation to a separately approved security maintenance slice; review **before the next deployment, no later than 2026-10-19**. No release is authorized while the critical/high findings, broader typecheck and backend isolation remain unresolved.

## Handoff

Module 3 implementation and local functional checks are saved. Real Google acceptance remains gated on configuration and Android linking; the broader quality gates above remain open. Stop here for Fede's review. Do not start module 4 automatically.
