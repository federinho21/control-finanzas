# Module 1 — Backend authentication

Date: 2026-10-12.

## Scope and outcome

Implemented only the backend session foundation. No finance route, frontend, Android source, D1 schema, Firestore record, Firebase rule or remote project setting was changed. No deployment was performed.

The implementation targets Node/Nitro and the future Firebase App Hosting deployment. Cloudflare deployment scripts remain historical; they are not a supported target for this module. The Admin adapter refuses an explicitly configured Cloudflare target.

## File-by-file changes

| File | Change |
| --- | --- |
| `server/firebase/admin.ts` | Lazy, named Firebase Admin app with application default credentials; mandatory project ID; rejects production Auth emulator |
| `server/utils/auth-service.ts` | Testable session service, requireUser, exact Origin validation, bounded JSON body, rate limit and cookie handling |
| `server/utils/auth.ts` | Production wiring; exports requireUser, requireAuthOrigin, createAuthSession and deleteAuthSession |
| `server/api/auth/session.post.ts` | ID-token exchange for server-owned session cookie |
| `server/api/auth/session.delete.ts` | Session logout/revocation |
| `server/api/auth/me.get.ts` | Returns only verified UID, optional name/email |
| `tests/auth.test.ts` | Ten tests over real H3 HTTP requests with a fake Firebase verifier; also tests Admin configuration guards |
| `tests/auth-build.smoke.ts` | Four checks against compiled Nitro, using an isolated temporary working directory |
| `tests/tsconfig.auth.json` | Strict, module-scoped TypeScript check |
| `package.json`, `package-lock.json` | Firebase Admin dependency; tsx/TypeScript test dependencies; test scripts |

The npm installation normalized a substantial portion of the existing lockfile. No intentional broad dependency upgrade or automatic audit fix was applied. Existing LangChain/optional Stagehand peer requirements conflict with Zod 4, so installation required `--legacy-peer-deps`.

## Session contract

### POST /api/auth/session

Headers:

```text
Origin: <exact AUTH_ORIGIN>
Content-Type: application/json
```

Body:

```json
{ "idToken": "fresh Firebase Google ID token" }
```

Only `idToken` is allowed. Client UID/sessionId fields are rejected. The token is verified by Firebase Admin with revocation checking; the sign-in provider must be Google and authentication must be no more than five minutes old. The verified UID is the only identity used.

Success:

```json
{ "user": { "uid": "verified-uid", "email": "optional", "name": "optional" } }
```

The cookie is never returned in JSON. Production cookie:

```text
__Host-finanzas-session=<signed session>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=432000
```

Lifetime is five days. No Domain attribute. Local development uses `finanzas_session`, still HttpOnly/SameSite=Lax, without Secure so HTTP localhost works. The service never stores passwords or uses localStorage.

### GET /api/auth/me

Requires the cookie and calls `verifySessionCookie(cookie, true)`. Returns the same safe user shape. Missing, expired, revoked or forged cookies return a generic 401. Verification failures clear the invalid cookie. All auth responses use `Cache-Control: no-store` and `Vary: Cookie`.

### DELETE /api/auth/session

Requires the exact Origin and a valid session. Revokes refresh tokens for the verified UID and deletes the local cookie. **This signs out all Firebase sessions/devices for that user**, including linked Android sessions when they next refresh. This is an intentional conservative policy, not per-device logout. An already absent/invalid session returns 401 and still clears the local cookie; the future frontend should treat this as signed out.

If revocation fails, returns 503 and clears the browser cookie. A stolen cookie might remain valid until Firebase revocation succeeds or it expires; the response must not be treated as proof of successful global revocation.

## Input, CSRF and rate-limit protections

- Strict Zod schema, maximum token length 16,000 characters.
- JSON body limit 20,000 bytes, enforced during stream consumption as well as Content-Length checks.
- Origin must equal a configured server-owned origin, not a client Host or forwarded header.
- Missing/foreign Origin and cross-site Fetch Metadata are rejected for mutations, including login CSRF.
- No permissive CORS headers are added.
- Ten session mutations per minute per socket address, per Node instance; forwarded IP headers are deliberately not trusted.
- Rate-limit map expires entries and has a 10,000-key bound.
- This in-memory limiter is **not distributed**. Behind a proxy it may group callers by proxy address. Production needs an infrastructure/distributed limiter before release; do not claim global brute-force protection.
- Verification/provider errors are not exposed to clients or logged with tokens.

## Local configuration

Set these in the local `.env` without committing credentials:

```dotenv
FIREBASE_PROJECT_ID=wallet-payment-tracker-fede
AUTH_ORIGIN=http://localhost:3000
GOOGLE_APPLICATION_CREDENTIALS=C:/path/outside/repository/service-account.json
```

`AUTH_ORIGIN` is the exact scheme/host/port, with no trailing slash. `localhost` and `127.0.0.1` are different origins. Use least-privilege service credentials with the Firebase Authentication permissions necessary to create/revoke sessions. A Firebase CLI login alone does not configure Node application default credentials.

On future App Hosting, use the managed runtime service identity and appropriate IAM permissions, rather than committing/exporting private keys. Set the actual HTTPS `AUTH_ORIGIN` and `FIREBASE_PROJECT_ID`; leave `FIREBASE_AUTH_EMULATOR_HOST` unset in production.

No session-signing secret is needed: Firebase signs and verifies these cookies. GEMINI_API_KEY remains unchanged. Firebase web configuration and Google login UI belong to module 3. Account linking must be completed first to avoid accidentally using a new UID with none of the existing payments.

## Verification performed

```powershell
npm run test:auth
npm run typecheck:auth
npm run build
npm run test:auth:build
```

Results:

- Auth tests: **10 passed, 0 failed**.
- Strict TypeScript for this module: **passed**; not a full-project typecheck.
- Production Node Nuxt/Nitro build: **passed**. Initial 120-second build timed out; rerun with a longer timeout completed. Nuxt reports sourcemap/deprecation/performance warnings.
- Compiled-route smoke checks: **4 passed** (me without cookie = 401; foreign-origin login = 403; correctly formed login with deliberately missing Firebase config = 503; logout without cookie = 401).
- Smoke test used `C:/Users/Fede/AppData/Local/Temp/opencode/finanzas-auth-smoke-jkdyx4`, leaving only disposable test data there. It never opened the project's `.data/hackathon.db`.

Covered: cookie flags, strict payloads, recent Google sign-in requirement, missing/forged/expired/revoked credentials, client UID/session spoofing, distinct verified users, CSRF, oversized streaming requests, local limiter, environment guards and logout revocation.

The existing startup cleanup plugin deletes provisional documents, so do not run production preview against the real project database just to test this module. The smoke script intentionally starts Nitro from a separate temporary working directory.

## What is NOT yet verified or solved

- Automated token verification uses a fake provider: genuine Google sign-in, live Firebase signature verification and live session revocation are **not yet tested**.
- No frontend login exists yet. Do not paste production tokens into documentation, logs or terminal history.
- Existing finance APIs, chat and RAG do not call requireUser yet and remain unsafe.
- Two-user financial data isolation is not implemented/tested yet; this module only establishes trusted identity.
- Android anonymous account linking, Firestore migration and Cloudflare-to-App-Hosting cutover remain untouched.
- npm reports **42 dependency vulnerabilities: 13 moderate, 23 high, 6 critical**. This is the installation report, not a completed exploitability analysis. No `npm audit fix --force` was run.
- No D1 migration, remote rule deployment or data mutation is needed for module 1.

## Handoff

Local acceptance checks passed; real Google end-to-end acceptance must be completed after modules 2–3. Work stops here for Fede's review. The next proposed module is **2: link Android's anonymous account to Google while preserving its UID**. Do not proceed automatically.
