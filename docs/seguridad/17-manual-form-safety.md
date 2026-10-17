# Manual financial form safety

## Small UI correction

The movement form initialized its date from UTC. At 02:00 UTC on October 15, Costa Rica is still October 14; the old default selected the following local day. The form now reuses the existing shared `costaRicaDate()` helper, matching the finance panel and report calendar. No date parser or server business rule changed.

Both native movement/cuota forms now:

- Declare `method="post"` instead of relying on the browser's default GET before hydration. Normal hydrated submissions still use the existing JSON POST/API/auth/CSRF boundary; this is not a new native form endpoint.
- Give every field an explicit Spanish accessible name, retaining the existing Nuxt UI components and layout.
- Require a minimum positive amount of 0.01 in browser validation. Server exact-money validation remains authoritative.
- Catch failed requests, preserve input and announce a generic alert. Fields clear only after the existing API call succeeds. The alert does not claim that no write occurred: it advises checking records before retrying, since a lost response can follow a successful commit.

The new finance-page browser test also exposed an invalid `lucide:cash` icon. Replaced its only caller with the installed `lucide:banknote` icon; warnings were fixed rather than ignored.

## Evidence and limits

A new isolated mobile Playwright test first failed on the missing POST attribute. It now verifies the Costa Rica date at the UTC-day boundary, accessible input/select names, rejected zero amount without an HTTP request, exact movement/cuota POST payloads, one request per attempted submission, retained values after synthetic 422 failures, visible alerts, and clearing only after success. Layout checks cover 320, 390, 768, 1024 and 1440 pixel widths. Only expected browser transport messages for the deliberately returned 422 are excluded; other console/page errors still fail the test.

All ten browser tests passed; the focused form test passed again after adding the wider layout checks. Web typecheck, Node/Netlify builds and compiled Netlify smoke checks passed. Screenshot `movement-form-error-mobile.png` was inspected from the isolated browser output. No Chrome DevTools MCP is configured, so real-browser evidence comes from Playwright/Edge, not a daily browser profile. No real login or financial record was used.

This initial form slice did not add automatic retries or manual-write idempotency. The existing shared API adapter already disables HTTP retries. The subsequent [manual-create retry contract](18-manual-create-idempotency.md) now protects unchanged keyed retries within the mounted form, but not reloads, remounts, edited intents or legacy unkeyed callers. Durable chat confirmations retain their separate replay semantics. No hydration-disabled authenticated form submission or screen-reader hardware session was performed. Production acceptance must retain these distinctions.

Evidence under the approved temp root: `finanzas-form-safety-node-build.log`, `finanzas-form-safety-netlify-build.log`, and `finanzas-web-test-results`.
