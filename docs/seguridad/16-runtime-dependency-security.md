# Dependency security — HTTP, serialization and Markdown

## Scope

Patched existing dependencies within declared ranges, without lifecycle scripts, overrides, direct additions or framework/Firebase major changes:

```powershell
npm update undici devalue markdown-it linkify-it --ignore-scripts --no-audit
```

Resolved versions: `undici` 8.10.0 → 8.12.1, `devalue` 5.9.0 → 5.9.4, `markdown-it` 14.1.1 → 14.3.2, `linkify-it` 5.0.0 → 5.0.2. `package.json` is unchanged. Undici still requires Node >=22.19.0; this requirement was already present before this patch.

Reachability: Nuxt consumes HTTP/serialization dependencies; the chat renderer directly consumes MarkdownIt. Chat keeps `html: false`, `linkify: false`, `typographer: false`, so vulnerable automatic linkification is disabled at the application layer, but the parser dependency is patched anyway. No new sanitizer or custom HTTP layer was added. This update does not patch the separate Undici bundled inside the Node executable; runtime security updates remain a launch responsibility.

Official sources: [Undici security release 8.10.2](https://github.com/nodejs/undici/releases/tag/v8.10.2), [devalue changelog](https://github.com/sveltejs/devalue/blob/main/CHANGELOG.md), [MarkdownIt changelog](https://github.com/markdown-it/markdown-it/blob/master/CHANGELOG.md). Relevant reports cover HTTP cache/cookie isolation and TLS options; serialization of pooled buffers, malformed object keys and sparse arrays; and pathological linkification input.

## Regression evidence

A small synthetic pooled-Buffer regression failed against devalue 5.9.0: a three-byte view revived with a **65,536-byte backing buffer**, exposing bytes outside the view to the receiver. The same assertion passes after the patch: both visible data and backing buffer are three bytes. No real credentials or user data were used in the reproduction. This demonstrates dependency behavior, not evidence that a finance route previously leaked pooled data.

Added lockfile assertions for the reviewed security floors and chat Markdown behavior checks for escaped HTML, rejected executable links, disabled automatic links and unchanged CRC text. Existing Vue SSR/shell quoting/Git-chain/Nano ID guards remain active. All eight dependency tests passed.

Also passed: 32 emulator integration tests, 13 web-session tests, 5 Netlify compatibility tests, 9 Playwright browser tests, finance/web typechecks, isolated Node build, Netlify build and 15 compiled route/startup checks. Browser tests use synthetic auth/SSE fixtures; they do not replace real Google/two-user acceptance.

## Reproducibility and supply-chain check

Copied ONLY `package.json`, `package-lock.json` and the dependency test into the approved temporary directory `finanzas-frozen-runtime-20261014`. `npm ci --ignore-scripts --no-audit` succeeded there, and all eight dependency tests also passed from that fresh install. Lifecycle scripts (including native module builds and root `nuxt prepare`) were intentionally NOT executed; this is a frozen dependency/test verification, not a full clean-room app build.

`npm audit signatures` succeeded on the fresh installation: **1,075 packages with verified registry signatures**, **335 with verified attestations**. Signatures attest registry integrity, not absence of vulnerabilities or malicious behavior. No project `.env`, keys or private records were copied.

## Remaining launch gate

The native production-graph audit now reports **63 findings: 0 critical, 22 high, 40 moderate, 1 low**, down from the preceding 67. The app is NOT cleared for production. Firebase browser Firestore still pins an old gRPC dependency; do not apply audit's proposed Firebase 9 downgrade. Other editor/build/glob dependencies and trust-boundary reachability still need review. Re-evaluate before the next security slice and before production approval.

No rules/indexes, IAM, billing, production deployment or finance migration changed. Local evidence: `finanzas-audit-after-runtime-patches.json`, `finanzas-runtime-security-node-build.log`, `finanzas-runtime-security-netlify-build.log`, `finanzas-frozen-runtime-install.log`, `finanzas-runtime-registry-signatures.log` under the approved OpenCode temp root.
