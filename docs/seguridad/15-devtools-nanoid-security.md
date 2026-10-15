# Dependency security — DevTools and Nano ID

## Minimal remediation

Updated the existing npm lockfile within declared ranges, with installation scripts disabled:

```powershell
npm update @nuxt/devtools @nuxt/devtools-kit @nuxt/devtools-wizard nanoid --ignore-scripts --no-audit
```

- Nuxt DevTools/kit/wizard: 3.4.1 → 3.4.3. Upstream removed `simple-git`; npm removed it, `@simple-git/argv-parser`, `@simple-git/args-pathspec` and their two unused helpers. No Git wrapper, override or new direct dependency was added.
- Nano ID: application 5.1.9 → 5.1.16; PostCSS dependency 3.3.17 → 3.3.20. Existing ID usage is unchanged.
- DevTools' existing package-manager-detector resolves to 1.9.0. No framework downgrade or forced audit fix was used; `package.json` is unchanged.

Official release notes: [DevTools 3.4.3](https://github.com/nuxt/devtools/releases/tag/v3.4.3), [3.4.1…3.4.3 diff](https://github.com/nuxt/devtools/compare/v3.4.1...v3.4.3). Relevant advisories: [unsafe editor detection](https://github.com/advisories/GHSA-v5rq-49vh-5v5c), [Git trailer configuration](https://github.com/advisories/GHSA-x6jw-m9v5-85vh), [Nano ID zero size](https://github.com/advisories/GHSA-2v37-7h3g-55p8) and [negative size](https://github.com/advisories/GHSA-28wg-ghj8-5hjv).

The Git vulnerabilities affected a development-tool chain, not a finance API accepting Git commands. Removing the chain is preferable to forcing an incompatible Git-wrapper major version. Nano ID is used by the app, although current fixed-size/default calls do not expose the reported custom-size path. Lockfile regression coverage prevents the removed Git packages and affected Nano ID branches returning silently; it failed before the update and passed afterward. It does not execute exploit payloads or Git commands.

## Verification and remaining gates

`npm audit --omit=dev --json` changed from **71 findings (2 critical, 27 high, 41 moderate, 1 low)** to **67 (0 critical, 25 high, 41 moderate, 1 low)**. Counts include transitive/metavulnerability reports and are not proof of runtime exploitability. The graph still contains high findings in HTTP, markdown, editor/build and Firebase-related dependencies. Do not automatically downgrade Firebase to the old major suggested by audit.

Passed after this update: 5 dependency regressions, 32 emulator finance integration tests, 17 chat tests, 11 backend auth tests, 9 browser tests, both finance/web typechecks, isolated Node build, Netlify build and 15 compiled Netlify checks. Browser tests cover confirmation/cancellation/retry as well as login/session cleanup. No Firebase production writes, rules, IAM, billing or migrations were changed.

A clean frozen install and registry-signature verification were not run for this slice. Existing CI install-script policy and remaining reachable high findings still need launch review. Re-evaluate outstanding advisories before the next preview security update and before any production release; production remains blocked.

Local reports: `C:\Users\Fede\AppData\Local\Temp\opencode\finanzas-audit-after-devtools.json`, `finanzas-security-node-build.log`, `finanzas-security-netlify-build.log`.
