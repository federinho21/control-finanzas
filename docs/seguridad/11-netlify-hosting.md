# Hosting decision — Netlify Functions with Firebase Auth/Firestore

Fede chose Netlify instead of Firebase App Hosting. Firebase project, Android identity and payment storage remain unchanged. No Netlify site, deployment, Git commit/push, Firebase rule/IAM change or paid resource was created in this step.

## Implemented

- `netlify.toml`: build `npm run build:netlify`, publish `dist`, Node 24, Nitro `netlify` preset. Installation scripts are disabled with `NPM_FLAGS`; dev build tools remain installed. Do not select the Edge/Deno or static-only presets: the authenticated server uses Firebase Admin and Node.
- `nuxt.config.ts`: supports Netlify Node Functions while retaining the Node-server target for local tests. Unsupported Cloudflare/Netlify Edge environments fail clearly. `apphosting.yaml` is retained as historical configuration, not the selected deployment path.
- `server/firebase/admin.ts`: supports `FIREBASE_SERVICE_ACCOUNT_JSON` as a SERVER-ONLY secret for non-Google hosting; ADC remains the fallback for existing local/Google environments. JSON size, required fields, private-key parse and exact project match are checked; malformed credentials produce a generic error without key material. No real service-account key was generated or stored.
- `server/utils/request-input.ts`: bounded input now handles both genuine Node IncomingMessages and the Fetch adapter's request stream. Auth session and finance input parsers reuse it; their validation and 20 KB limits are preserved.
- `server/api/chat.post.ts`: returns a ReadableStream via H3 instead of direct Node response writes. Status frames arrive before completion in the Fetch adapter; result/error and one terminal `done` preserve their order. Canceled readers are not written to.
- `.gitignore`: excludes `.netlify` artifacts. `dist` was already excluded.
- Added `build:netlify`, `test:netlify`, `test:netlify:build`, and isolated `build:test` scripts. The test build uses `tests/fixtures/build.env`, not the user's real `.env`, preventing browser tests from attempting live Google login.

Files: the configuration/utilities above, `tests/netlify-compat.test.ts`, `tests/netlify-build.smoke.ts`, `tests/fixtures/build.env`, `tests/tsconfig.finance.json`, `package.json`, and module documentation. No new dependency was needed.

## Verification

Initial Fetch-adapter tests reproduced broken request parsing and the unsupported credential setup. After the fixes:

- 5 Netlify compatibility tests passed: bounded JSON, early SSE delivery, malformed/cross-project credentials, dummy valid certificate and secure Google-session exchange with CSRF/UID-injection checks.
- 15 checks passed against the actual compiled `.netlify/functions-internal/server/server.mjs` handler. Anonymous/private routes fail closed; input/Origin validation and public icon routing work. No Firebase network calls or SQLite writes occur in this smoke test.
- 27 real-emulator finance/agent/document isolation tests and 11 backend auth tests passed.
- 15 Node compiled checks and 8 Playwright regressions passed after the isolated Node build.
- Auth, finance and web typechecks passed. Both Netlify and Node test builds passed.

```powershell
npm run test:netlify
npm run test:auth
npm run test:finance
npm run typecheck:auth
npm run typecheck:finance
npm run typecheck:auth:web
npm run build:netlify
npm run test:netlify:build
npm run build:test
npm run test:auth:build
npm run test:auth:browser
```

Build logs: `C:\Users\Fede\AppData\Local\Temp\opencode\finanzas-netlify-build.log` and `finanzas-netlify-node-regression-build.log` in that same directory. Local builds used the installed Windows Node; Linux/Node 24 installation and a real Netlify deployment remain unverified.

## Netlify site setup (requires a selected site and reviewed source publication)

1. Prefer a NEW site to avoid overwriting Fede's existing projects. Confirm its site URL/ID before linking or deploying. There is no Netlify CLI/token/site association available in this session yet.
2. The current Git repository root is `base-agent` itself. For that repository, leave the Netlify base directory blank; `netlify.toml` is at its root. Only use base directory `base-agent` if importing a parent monorepo that actually contains that folder.
3. Publish directory `dist`, build command `npm run build:netlify`, Node 24. Keep `netlify.toml`; Nitro generates the SSR function and routing. Do not add an SPA `/* → /index.html` rewrite that bypasses the server. Do not deploy only a drag-and-dropped static `dist` folder: the API/SSR Functions must be included.
4. The original setup checkpoint had only local, uncommitted changes. Fede subsequently authorized the [preparation branch publication](12-preparation-branch.md), not a production merge. Select that reviewed revision for staging; do not trigger production rollout from the legacy revision or assume `main` contains these changes.
5. Set environment variables below using Netlify's UI. Do NOT paste private keys/tokens in chat or commit them to Git. Limit secrets to the Functions scope and trusted deploy contexts; do not expose production credentials to untrusted previews.
6. Add the exact selected hostname to Firebase Auth authorized domains and set its exact HTTPS origin. Never wildcard all `netlify.app` sites. Preview origins require deliberate per-context setup, not Origin-check removal.
7. Deploy and test a protected staging site first. Confirm Google login uses the already-linked original UID, Android source payments appear once, A/B isolation holds, private responses are uncached, and SSE finishes with one `done`. No SQL/D1 import is necessary just to read existing Android payments; independent historical SQL data still needs reconciliation.

### Environment variables

| Variable | Value / scope |
| --- | --- |
| `FIREBASE_PROJECT_ID` | `wallet-payment-tracker-fede`; Functions |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Full JSON credential for a dedicated least-privilege service account in this project; secret, Functions only |
| `AUTH_ORIGIN` | Exact `https://SELECTED-SITE.netlify.app` or selected custom domain; Functions |
| `NUXT_GEMINI_API_KEY` | Existing Gemini API key; secret, Functions only |
| `NUXT_PUBLIC_FIREBASE_API_KEY` | Public Web SDK key from the registered Web app; Builds/Functions |
| `NUXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `wallet-payment-tracker-fede.firebaseapp.com`; Builds/Functions |
| `NUXT_PUBLIC_FIREBASE_PROJECT_ID` | `wallet-payment-tracker-fede`; Builds/Functions |
| `NUXT_PUBLIC_FIREBASE_APP_ID` | `1:92220264352:web:3af5754f5d313900bedec5`; Builds/Functions |
| `FIREBASE_STORAGE_BUCKET` | Actual private bucket only IF retaining Firebase Storage; Functions |

The server account needs the required Firestore operations and Firebase Auth user/session-cookie/revocation permissions; bucket permissions only if that storage path is retained. Use dedicated/custom minimum roles rather than Owner/Editor. IAM and real token exchange have not been verified. Firebase MCP login credentials are not supplied to Netlify and are not a substitute for server credentials.

Do not set server secrets with `NUXT_PUBLIC_` prefixes or put them in `netlify.toml`. This file's environment section contains only build settings. Rotating a key requires updating the secret and redeploying; if a key is exposed, revoke/rotate it immediately.

## Costs, documents and runtime limits

- Netlify hosting does NOT require the Firebase Blaze plan. Firebase Auth/Firestore may remain on Spark within their applicable quotas. Netlify Functions and Gemini have their own usage limits/costs; free hosting is not an unlimited-service promise.
- Existing upload implementation still stores originals/extracted text in Firebase Cloud Storage. Moving hosting does NOT remove Storage's Blaze requirement. Storage remains a separate decision: keep it with deliberate Firebase billing, or authorize migration to another private object store (for example Netlify Blobs). No replacement was silently introduced and no uploaded source data was removed. Do not advertise working uploads without that decision and live acceptance.
- Official Netlify streaming Functions have a **60-second execution limit** and 20 MB response limit. Existing individual model timeouts do not prove the whole graph, embeddings, transactions or a multi-chunk upload completes inside 60 seconds. Real Gemini/RAG/upload duration and bounded cancellation remain staging release gates; moving slow work to jobs is a separate change if needed. Stream cancellation stops delivery, not a promise that an already-started atomic approval write was canceled; replay remains protected by durable approvals.
- Serverless instances do not share the existing general/auth in-memory rate limits. Chat/upload Firestore quotas are shared, but distributed auth/general limiting remains a hardening gate.
- The last recorded dependency audit is still **71 findings, 2 critical**. The Netlify switch did not remediate the DevTools tree or other reachable high findings. No security sign-off or production rollout is implied.

Official references:

- https://docs.netlify.com/build/frameworks/framework-setup-guides/nuxt/
- https://nitro.build/deploy/providers/netlify
- https://docs.netlify.com/build/functions/api/ (Fetch handlers, streaming and limits)
- https://docs.netlify.com/build/configure-builds/manage-dependencies/ (Node 24 and install settings)
