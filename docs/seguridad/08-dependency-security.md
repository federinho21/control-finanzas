# Dependency security — unused Community removal and Vue SSR fix

## Scope and authorization

Fede authorized removing `@langchain/community` after reviewing the consequences. The dependency no longer had application imports after module 6 switched PDF extraction to the existing `pdf-parse` package. Gemini, LangGraph, text splitting, embeddings and document repositories keep their own packages unchanged.

Changes:

- `package.json`: remove Community; raise Vue's minimum to `^3.5.42`; add `test:security:dependencies`.
- `package-lock.json`: regenerate using npm, removing the unused Community tree and updating the Vue package family to 3.5.42. No hand-edited lockfile or major-version overrides.
- `tests/dependency-security.test.ts`: regression coverage for unsafe SSR attribute names and normal attribute value escaping.
- This document and the security module index record results and remaining release blockers.

## Root causes and evidence

Updating Vue initially failed because Community's optional Stagehand peer resolution conflicted with the project's Zod 4. Removing the unused dependency made the normal install succeed; no `--force` or `--legacy-peer-deps` was used.

Installed Vue 3.5.41's `ssrRenderAttrs` emitted a carriage-return-bearing attribute name as HTML. A browser can reinterpret it as multiple attributes, including an event handler. The new test failed before the update and passes with Vue 3.5.42, whose SSR renderer rejects that name. Ordinary untrusted values remain escaped. This proves the vulnerable library behavior was installed, not that the app had an exploitable data path supplying attacker-controlled attribute names.

Official sources:

- https://github.com/advisories/GHSA-g2v6-rqmx-r4w6 — affected versions, attack conditions and patched 3.5.42.
- https://github.com/vuejs/core/releases/tag/v3.5.42 — reviewed patch release; no major migration needed.

## Installation

```powershell
npm install --ignore-scripts --no-audit
npm install vue@3.5.42 --ignore-scripts --no-audit
npm run test:security:dependencies
```

Install scripts were disabled. The existing reviewed Nuxt build was run separately. No new dependency was added, and no unrelated forced downgrade was accepted. npm's proposed Nuxt 3.7.4/Firebase 9.14.0 downgrades are not compatible remediation for this Nuxt 4/Firebase project.

To reproduce the lockfile in a fresh environment, use `npm ci --ignore-scripts`, then separately run reviewed preparation/build commands. A fresh immutable reinstall and registry signature verification were not performed in this change; the current installation was regenerated in place.

## Verification

- Dependency regression: 2 passing tests; the unsafe-name test failed against the previous Vue installation.
- Real Firestore emulator: 27 passing integration tests, including approval replay, owner isolation, document linking and RAG lifecycle; SQLite mtime unchanged.
- Web session lifecycle: 13 passing tests.
- Finance and web typechecks passed; Node Nuxt build passed.
- Installed Gemini/Core/LangGraph/PDF package versions are unchanged; Community is absent.
- Rebuilt-artifact checks: 15 compiled auth/page/API/asset checks and 8 Playwright browser regressions passed.
- Backend auth: 11 tests; migration: 4 tests; finance model: 5 tests passed. Together with the suites above, 85 checks passed.

Build log: `C:\Users\Fede\AppData\Local\Temp\opencode\finanzas-security-vue-build.log`.

## Audit and remaining release gates

Production dependency audit before: **78 findings — 1 low, 43 moderate, 30 high, 4 critical**.

After: **72 findings — 1 low, 41 moderate, 27 high, 3 critical**. Removing the unused tree also removed the reported Handlebars critical finding. Vulnerability counts are package-level audit results, not a count of proven application exploits.
Subsequent [shell-quote remediation](09-shell-quote-security.md) reduced this further to **71 findings / 2 critical**; its document supersedes the shell-quote deferral below.

| Remaining group | Reachability / disposition | Review date |
| --- | --- | --- |
| Critical `simple-git` and `@simple-git/argv-parser` | Pulled through Nuxt DevTools. No application agent/API imports; development/tooling exposure still matters. Defer here because the audit proposes an incompatible framework downgrade; review a supported DevTools upgrade or documented compatible patch, without silently disabling its security checks. | 2026-10-14, before release |
| Critical `shell-quote` | Pulled through DevTools → launch-editor. Review a same-major patched transitive update and its editor-launch behavior separately. Not cleared merely because no app endpoint imports it. | 2026-10-14, before release |
| Other high/moderate runtime or frontend packages | Firebase/gRPC, Nuxt/Nitro serialization, UI/editor, Markdown, LangSmith and HTTP client trees still require path-specific triage. Installed does not mean reachable, but absent proof does not grant release approval. Do not bulk-upgrade or mark them ignored. | 2026-10-14, before release |
| PDF extraction / upload limits | This audit does not prove parser safety; real PDFs, stress behavior and process isolation remain pending acceptance. | Before release |

No data migration, deployment, Firebase rule/IAM changes, commits or pushes were performed. Live Google/Gemini/Storage acceptance is still pending. This limited change is not a production security sign-off.
