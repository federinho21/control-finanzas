# Dependency triage for the finance-first release

## Release scope

Fede explicitly deprioritized Gemini for this version. Do not spend release-readiness work on live-model latency or require live Gemini acceptance for a finance-only release. This dependency slice does not disable the existing AI pages/endpoints or remove their dependencies; that remains explicit release-scope work, not something a passing finance test proves.

No production deployment, merge, billing, data migration or security exception is authorized by this checkpoint. Main's required audit remains unchanged.

## First compatible remediation

Updated the existing `@nuxt/ui` dependency from locked 4.7.0 to 4.12.0 within major 4, with npm-generated lockfile changes and lifecycle scripts disabled. The official [4.8.1 patch notes](https://github.com/nuxt/ui/releases/tag/v4.8.1) identify the POST-before-hydration fix; [4.12.0 notes](https://github.com/nuxt/ui/releases/tag/v4.12.0) describe subsequent UI changes. The lockfile also updates the UI's related color-mode, icon, positioning and Tailwind dependencies; no new application feature or optional chart dependency was added.

The advisory [GHSA-gj2h-2fpw-fhv9](https://github.com/advisories/GHSA-gj2h-2fpw-fhv9) affects UForm/UAuthForm defaulting to browser GET before hydration. Application finance forms already use explicit POST and Google login does not ask for a password. This removes the vulnerable library version rather than relying only on those application mitigations. Regression tests first failed on the old version/template; the version floor and installed template's top-level POST binding now pass. The template check is a source-contract assertion, not a new runtime UForm SSR test.

Fresh native `npm audit --omit=dev` evidence changed from **20 to 19 findings**: **15 high, 3 moderate, 1 low, 0 critical**. The high count did not improve and no risk was accepted. Audit totals include dependency-chain propagation, not 15 independent root exploits.

## Remaining roots and priority

| Root | Actual dependency path / exposure evidence | Next action |
| --- | --- | --- |
| `braces@3.0.3`, high | Nitro build tooling → globby → fast-glob → micromatch. Official [advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) concerns deeply nested untrusted patterns. Registry latest is still 3.0.3; advisory has no first patched version. | Check supported upstream replacement/removal and build-input boundaries. Do not invent a nonexistent patched version or override with an incompatible glob engine. |
| `node-forge@1.4.0`, high | Nuxt CLI/Nitro → listhen. Official [advisory](https://github.com/advisories/GHSA-86w9-cpqp-85rv) concerns RSA PKCS#1 signature verification. Registry latest is still 1.4.0; no first patched version listed. | Inspect how development TLS uses it and whether an upstream update removes the dependency. Not evidence of a broken Firebase session verifier: those paths were not shown to use forge. |
| Browser Firestore's `@grpc/grpc-js@1.9.16`, high | The broad `firebase` package installs Firestore even though application browser source imports only `firebase/app` and `firebase/auth`. The current Firebase 13.0.0 / Firestore 4.18.0 registry metadata still pins gRPC `~1.9.0`. [Certificate-context advisory](https://github.com/advisories/GHSA-m9gg-hp2v-232j) and [error-disclosure advisory](https://github.com/advisories/GHSA-f596-whhp-79r4) concern running gRPC servers. | Verify Auth-only dependency options against supported Firebase APIs and inspect browser/server artifacts. Do not downgrade Firebase to the ancient major suggested by native audit or force gRPC outside the SDK range without compatibility evidence. |
| Nested `uuid@10`, moderate | LangGraph / checkpoint packages, still present despite Gemini being deprioritized. [Advisory](https://github.com/advisories/GHSA-w5hq-g745-h8pq) concerns v3/v5/v6 caller-supplied output buffers. | Review a supported agent-library update or exclude optional AI from the release artifact; no unchecked major override. |
| `esbuild@0.27.7`, low | Build/development server. Windows dev-server arbitrary-file-read [advisory](https://github.com/advisories/GHSA-g7r4-m6w7-qqqr). | Move through a compatible parent update; do not expose development servers as production. |

Official GitHub advisory API descriptions and current npm registry metadata were rechecked, not inferred solely from audit's `fixAvailable` suggestion.

## Compiled artifact checkpoint

The freshly built `.netlify/functions-internal/server/package.json` declares **gRPC 1.14.6** for the Admin Firestore path, and does not declare `braces`, `node-forge`, `esbuild` or browser `@firebase/firestore`. It does declare LangGraph/checkpoint. This is useful packaging evidence, **not a full transitive/bundled-code reachability proof** and not permission to waive the audit. Source maps, nested packages and bundling must be accounted for before a release risk decision. No runtime gRPC server path was identified in application code.

## Verification

Passed locally after the update: 5 CI-policy, 11 dependency-security, 11 backend auth, 13 web-session, 7 finance-model, 4 migration, 19 chat behavior, 6 Fetch-adapter and 35 real-emulator integration tests; all three scoped typechecks; fresh Node build and 15 compiled checks; all 12 browser tests; fresh Netlify build and 15 compiled checks. Synthetic provider interception does not invoke live Gemini. Tests used synthetic data, not Fede's financial records.

The first Node build command exceeded its 120-second tool budget; rerunning with a larger command budget completed and the fresh compiled/browser checks passed. No application/provider deadline was enlarged. Existing bundler warnings remain; this is not a warning-free-build claim.

Fresh `npm audit signatures` passed: **1,068 verified registry signatures and 341 verified attestations**. This validates available registry provenance, not freedom from vulnerabilities.

Evidence under the approved temp root: `finanzas-security-priority-audit.json`, `finanzas-security-priority-paths.log`, `finanzas-security-ui-audit.json`, `finanzas-security-ui-node-build.log`, `finanzas-security-ui-netlify-build.log`, `finanzas-security-ui-signatures.log`. No fresh clean-install or remote-CI success is claimed here yet. Existing launch gates for real two-user/Android acceptance, private documents, backups and operations remain open.
