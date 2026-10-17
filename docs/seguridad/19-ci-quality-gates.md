# Secret-free CI quality gates

## Scope and contract

Automate the existing local checks for pushes to `prepare/firebase-netlify`/`main` and pull requests targeting `main`. This is verification only: no deployment, merge, production credentials, billing, IAM/rules/index changes or data migration. The PR remains a draft.

- GitHub-hosted Ubuntu jobs with read-only repository permissions, checkout credential persistence disabled and actions pinned to official commit SHAs. No `pull_request_target`, secret references or deployment tokens.
- Frozen npm installation with lifecycle scripts disabled. Pin Node 24.18.0 and verify its bundled npm 11.16.0. The only explicitly approved root lifecycle command is the existing `postinstall` (`nuxt prepare`), run with the empty build fixture. No blanket rebuild/native-install approval.
- Verification: the three existing scoped typechecks; auth/web-session/model/migration/chat/dependency/Netlify adapter tests; real Firestore emulator integration; isolated browser tests; Node/Netlify builds and compiled smoke checks. No new lint/coverage threshold is invented; an ESLint command is not configured in this repo.
- Java 21 and the official Firestore emulator 1.22.0 JAR, downloaded over HTTPS and verified against its official SHA-256 before execution. The test helper always uses a synthetic demo project and loopback ports. No Firebase deployment CLI is needed.
- Playwright installs Chromium explicitly for Linux; `TMPDIR` points at the runner's isolated temporary directory. Existing browser tests keep zero retries and synthetic HTTP/auth fixtures.
- A separate audit job runs the native production-graph audit at high severity. It is expected to fail while the current high advisories remain; no skipped audit, `continue-on-error`, forced fix or severity waiver is added. Its JSON evidence is uploaded even on failure.
- Bounded job timeouts and seven-day synthetic test/audit artifacts. Concurrency cancels superseded runs, not individual checks within the selected run.
- Workflow policy assertions protect these boundaries against accidental regression. They are not a sandbox against someone intentionally editing both policy and tests.

Branch protection/required-check settings are NOT changed. A visible failing job alone does not mechanically prevent a repository administrator from merging. Production launch still requires separate approval and the unresolved live-provider, two-user, Android, private-document and operational checks.

Official bootstrap sources: [Node release index](https://nodejs.org/dist/index.json), [Firebase emulator download metadata](https://github.com/firebase/firebase-tools/blob/master/src/emulator/downloadableEmulatorInfo.json), and the official actions/checkout, setup-node, setup-java and upload-artifact tag references. The emulator digest matches the existing locally tested JAR.

## Verification status

Local policy tests first failed because no workflow existed. After adding it, a further assertion reproduced the stale `node_modules/.cache/nuxt/.nuxt` paths used by two typecheck configs. Those references now use the public `.nuxt` directory produced by a fresh `nuxt prepare`, preserving the same includes, strictness and assertions. This avoids quietly checking stale local type declarations or failing on a clean runner.

Passed locally: all four workflow-policy tests, the three existing typechecks, 35 real-emulator finance tests, 19 chat tests, 6 Netlify adapter tests and 4 migration tests. Explicit Nuxt preparation also succeeded with `NPM_CONFIG_IGNORE_SCRIPTS=true` and empty credential fixtures. Existing tests were not removed, skipped or suppressed. Node/npm release metadata and the emulator's official SHA-256 were checked against the installed versions/artifact.

The verification job must pass independently of the separate dependency audit, which is expected to fail on the already documented high findings. The remote attempts and their distinct outcomes are recorded below.

The first GitHub attempt ([38994716270](https://github.com/federinho21/control-finanzas/actions/runs/38994716270)) rejected the workflow before starting any job: `runner.temp` is unavailable in job-level `env`. This was a workflow-definition error, NOT the expected dependency-audit failure or a finance-test failure. Temporary-directory setup now writes the runner's `RUNNER_TEMP` to `GITHUB_ENV` in a normal step, and policy coverage rejects that unsupported job-level context. The strengthened policy failed before the correction and all four tests passed afterward. Remote verification is still pending.

The next clean Linux run ([38994815539](https://github.com/federinho21/control-finanzas/actions/runs/38994815539)) passed install, emulator verification, all scoped typechecks, unit/integration suites, Node build/smoke checks and all browser tests. Netlify compilation itself passed, but its Firestore-init smoke check assumed a Windows-generated internal chunk path (`chunks/_/nitro.mjs`); Linux generated `chunks/nitro/nitro.mjs`. The smoke test now locates the single compiled factory definition under the generated chunks, imports that real file and retains the original plain-Node/SDK initialization and route assertions. The local compiled smoke test and finance typecheck passed after this correction; a fresh Linux pass is not yet claimed.

The separate native audit failed as intended and uploaded its JSON evidence: 20 findings (0 critical, 15 high, 4 moderate, 1 low). It did not prevent the verification job from reaching the final compiled-runtime check. Logs/evidence: `finanzas-ci-first-run-status.json`, `finanzas-ci-verify-failure.log` and `finanzas-ci-audit-38994815539/dependency-audit.json` under the approved temp root. No finding or assertion was suppressed to conceal either failure.

## Verified remote checkpoint

[Run 38995218765](https://github.com/federinho21/control-finanzas/actions/runs/38995218765), commit `6dfdd7c`, completed the entire clean Linux **verify job successfully in 3.4 minutes**: frozen script-disabled install, policy checks, verified emulator, all three scoped typechecks, all existing unit/integration suites, Chromium browser acceptance, Node build/smoke and Netlify build/cold-start/Firestore-init/route checks. The runtime check was repaired, not removed.

The independent **dependency-audit job failed**, so the overall workflow is correctly red. It still reports 20 findings, including 15 high and zero critical; this is not a production release approval or a claim that every check is green. Post-action cache cleanup may be skipped by GitHub after failure, but no tests or audit command are conditionally waived. Superseded duplicate push/PR runs are canceled by concurrency; the selected run executes the full pipeline.

The final concurrency namespace also includes the PR head repository, so an identically named branch in another fork cannot cancel the trusted preparation branch's run. Policy coverage checks that namespace and confirms checksum verification precedes emulator integration. GitHub branch protection/required checks, live Gemini latency, real two-user acceptance, PDF/storage, operational and production decisions remain separate open gates. The existing Netlify preview integration is independent of CI; this workflow neither deploys nor grants its jobs preview/production credentials.

Evidence under the approved temp root: `finanzas-ci-corrected-run-status.json` and `finanzas-ci-corrected-run-watch.log`; the public run URL preserves the exact tested revision. Existing dependency install/signature evidence is not recharacterized as proof that outstanding advisories are fixed.

The web typecheck now explicitly includes `FinancePanel`, `MovimientoForm` and `CuotaForm`, rather than relying solely on its previous auth/login scope. A policy assertion reproduced their omission, then passed after adding them; the expanded local web typecheck passed without suppressions or weaker compiler options. CI retains the same browser/integration acceptance in addition to this stronger static scope.
