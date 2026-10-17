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

The workflow still needs its first remote Linux run. Its verification job must pass independently of the separate dependency audit, which is expected to fail on the already documented high findings. No remote/clean-runner success is claimed yet.

The first GitHub attempt ([38994716270](https://github.com/federinho21/control-finanzas/actions/runs/38994716270)) rejected the workflow before starting any job: `runner.temp` is unavailable in job-level `env`. This was a workflow-definition error, NOT the expected dependency-audit failure or a finance-test failure. Temporary-directory setup now writes the runner's `RUNNER_TEMP` to `GITHUB_ENV` in a normal step, and policy coverage rejects that unsupported job-level context. The strengthened policy failed before the correction and all four tests passed afterward. Remote verification is still pending.
