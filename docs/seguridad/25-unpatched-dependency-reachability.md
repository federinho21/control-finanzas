# Unpatched dependencies — reachability assessment

## Decision summary

**No exposed application path to either advisory was identified in the inspected source and local Netlify artifact. Both advisories remain valid, unpatched build/development risks, not false positives or approved exceptions.** Native audit remains **11 high, 0 critical, 0 moderate, 0 low**. Do not weaken audit or branch protection on the strength of this report.

This work answers Fede's request to investigate the remaining roots and present safe alternatives. It changes no application code, dependencies, authentication, rate limits, hosting permissions or production settings. The outcome is evidence and a release decision boundary, not permission to merge.

## Assessment boundary

- Source HEAD: `625e60de9b3c779e02ce70b85be4688eb15de326`, preparation branch. Parallel uncommitted FK Trace repository/tests/docs and a merchant-search test were preserved and not adopted into this assessment's commits.
- Package lock SHA-256: `e3d4529953367d3f88b9b59d31127600fddd0ece8f78a9324f554d417f85d822`.
- Installed tools: Node 24.18.0, npm 11.16.0; Nitro 2.13.4, Nuxt 4.5.2, listhen 1.10.1, braces 3.0.3, node-forge 1.4.0.
- A **new local Netlify build** used empty test credential fixtures. It includes the local working tree, not an assertion that the deployed preview or a clean remote SHA has this exact artifact. No live Firebase account, bank record or model was used.
- Additional parallel login/middleware/mobile-merchant work appeared after the artifact was built. Those changes, new mobile routes and their environment example were not reviewed or committed by this investigation. This assessment must not be stretched to cover their next build or authentication behavior without revalidation.
- No graphify graph was present; tracing used the installed source, lockfile graph, instrumented execution and generated artifact rather than an inferred architecture graph.

## Trust boundaries

| Boundary | Inputs and observed use | Conclusion |
| --- | --- | --- |
| Remote web caller → finance/auth/document APIs | Request bodies, headers, IDs and upload bytes; the application does not import globby, micromatch, braces, listhen or node-forge. Financial writes go through validated owner-scoped repositories; documents use their private storage path, not the build source tree. | No route from those request values to the two affected APIs was identified. This is not a complete security review of all web handlers. |
| Repository/config/modules → compilation | Nitro scan directories, server asset patterns and ignore lists enter globby/fast-glob/micromatch/braces. | The vulnerable library is genuinely used during compilation. Repository/config/module writers are a relevant trust boundary; a malicious build input can still affect availability. |
| Developer CLI/options/certificate files → local HTTP(S) listener | listhen receives local hostname/HTTPS/key/cert/PFX options. Forge generates/signs or parses local certificates. | Build/development scope; do not infer that every developer server is private or every certificate input is trusted. |
| Production TLS and Firebase session verification | Netlify uses the generated Request handler, not the listhen development listener. Firebase Admin verifies JWTs through jsonwebtoken/jws/jwa and Node crypto. | No use of forge's vulnerable signature verifier was found in those inspected authentication paths. No real login acceptance was repeated here. |

CI's repository permissions are read-only and its workflow references no production secrets. The existing Netlify preview environment is separate; its remote secret/domain configuration was not re-audited in this investigation. Do not run development servers publicly or feed unreviewed repositories/configuration to a credentialed build as a workaround.

## Root 1 — braces

Advisory: [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), recursive AST walking without depth guards, affecting versions through 3.0.3. Registry latest remains 3.0.3 and the advisory lists no first patched version.

Installed dependency edges:

```text
Nuxt → @nuxt/nitro-server → nitropack → globby → fast-glob → micromatch → braces
```

Exact inspected source (paths below relative to `node_modules/`):

- `nitropack/dist/core/index.mjs:952–964`: `scanFiles`/`scanDir` use globby with the framework's scan pattern and configured ignore list.
- `nitropack/dist/rollup/index.mjs:1473–1489`: production `serverAssets` expands configured `asset.pattern || "**/*"` at build time.
- `fast-glob/out/utils/pattern.js:130–137`: `expandBraceExpansion` invokes `micromatch.braces` with expansion enabled.
- `micromatch/index.js:451–456`: the braces parser is called when the supplied pattern contains braces, unless explicitly disabled.
- `braces/lib/compile.js:7–50` and `braces/lib/expand.js:36–100`: recursive walkers implement the affected behavior. An expansion-count limit is **not** a general AST-depth mitigation.

The observed build patterns came from the reviewed tool/config graph. User-provided file names are not automatically proof of user-controlled glob expressions: the application does not send uploaded names or chat text into this build API. Still, the small patterns observed in one build are not a permanent limit; a later module/config change can introduce deeper patterns. Source review is required when that graph changes.

## Root 2 — node-forge

Advisory: [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv), incomplete nested DigestAlgorithm validation during RSA PKCS#1 v1.5 signature verification. Registry latest remains 1.4.0 and the advisory lists no first patched version.

Installed direct consumers of forge: **listhen only**. Listhen is required by the Nuxt CLI and Nitro core/development tooling; no Firebase library in this lockfile declares forge as a dependency.

- `listhen/dist/shared/listhen.tqe5I1Rl.mjs:294–362`: `resolveCertificate` selects explicit PEM, local PFX parsing, or generated certificates.
- The same file, `422–460`, parses the signing certificate and calls `cert.sign` with a private key. Signing is not the public-key verification operation named in this advisory.
- The same file, `527–586`, defaults to HTTP (`https:false`) and resolves certificate material only for the HTTPS listener. Host/public options and environment still affect exposure; this report does not attest the operator's current listening interfaces.
- `nitropack/dist/core/index.mjs:2707–2708`: listhen is called by `NitroDevServer.listen`.
- `node-forge/lib/rsa.js:1142–1227`: public-key `verify` selects the affected PKCS#1 verification scheme. Those checks were not found among listhen's own explicit operations. PFX parsing can have other risks and was not declared universally safe.
- Application [Firebase Admin factory](../../server/firebase/admin.ts) uses `firebase-admin/auth`. Installed `firebase-admin/lib/utils/jwt.js:23–24,253–258` delegates signature verification to jsonwebtoken; `jwa/index.js:172–178` uses Node `crypto.createVerify`. This is source evidence, not a claim that every crypto path in every dependency has been exhaustively reviewed.
- `nitropack/dist/presets/netlify/runtime/netlify.mjs:8–27` exports a Request/Response handler; the generated function declares `nodeBundler:"none"` and does not start listhen to terminate incoming TLS.

## Dynamic check — bounded observations, not a proof of non-reachability

A temporary CJS preloader observed package loading, braces calls/pattern size/depth and forge public-key/certificate-chain verification calls. It logs **only counters**, not raw patterns, filenames, environment secrets, certificates or tokens. The hook lives outside the repository and was removed from `NODE_OPTIONS` after each command.

Positive controls using Node ESM imports confirmed that both package monitors work, a small synthetic brace pattern is seen, and deliberately invoked public-key/chain verification increments the corresponding counters. The synthetic public key uses tiny public-only values; no exploit, real signature, live credential or private financial input was involved.

| Run | Observed Node processes | braces loaded / root calls | Largest pattern / brace nesting | forge loaded | Public-key verify / chain verify |
| --- | --- | --- | --- | --- | --- |
| New Netlify compilation | 4 | In 1 process / 11 root calls | 47 UTF-16 characters / 1 level | In 1 process | 0 / 0 |
| Compiled route smoke suite | 4 | 0 / 0 | No patterns observed | 0 | 0 / 0 |

The 11 root calls also trigger `create`, `expand` and `parse` internally: those counters are not 33 additional input patterns. Nesting counts literal brace characters, not parsed AST depth; escaped braces may overcount. The 15 compiled smoke checks passed with missing credentials failing closed and no real Firebase calls or SQLite writes.

Limits: the hooks observe the exercised CJS package entrypoints; they cannot establish absence of arbitrary inlined code, all branches or all future inputs. Cold-start child probes in the existing smoke test deliberately clear `NODE_OPTIONS`; they pass normally but are not claimed as instrumented child coverage. No private-PFX/dev-HTTPS acceptance, live login, production traffic or actual deployed Netlify ZIP was exercised.

## Fresh artifact examination

The real-path traversal examined **2,221 unique files**, including **189 package manifests, 1,637 code files and 50 JSON source maps**. No external symlink was skipped. It found:

- No package named braces or node-forge and no declared runtime dependency on either root.
- No named direct import/require of either root in the inspected code.
- No source-map path naming either root.
- No match for selected recognizable braces-expansion or forge-PKCS1 error strings. The scanner first asserted those strings exist in the installed affected sources, so this was not a comparison against imaginary signatures.

Artifact fingerprint: **`f216ecec777a64b841e35598ce64a56f9328e5a882063ba8e1d0d78a9387a55a`**. The digest combines sorted visited relative paths and each file's SHA-256. Shared real paths are visited once. It identifies the artifact examined, not a claim that future builds or Netlify's deployed artifact are identical.

Names/strings/source maps can disappear or change during bundling. These independent negative checks plus source tracing strengthen the assessment but do **not** prove that all semantically equivalent code is absent.

## Supported alternatives examined

1. **Published patched roots or supported parent removal:** none identified. Current registry metadata still has listhen 1.10.1 → forge 1.4.0, micromatch 4.0.8 → braces 3.0.3, and even Nitro 2.13.5 → listhen/globby. Updating to those published parents alone does not remove both roots. The earlier Nuxt/CLI upgrade trial also did not lower the count and was discarded; no retry of that migration was made here.
2. **Disable brace expansion or replace forge with Node crypto by alias:** not an equivalent library/API replacement. This can break route/asset discovery or certificate tooling while leaving the audit finding present. Not implemented or recommended as a quick release fix.
3. **Move to another Nitro/server-builder major or a maintained patched fork:** possible engineering projects, not established compatible fixes for this app. Require an explicit migration specification, dependency/license review, source-pinned patch provenance, regression tests and a separate release evaluation. Do not falsify a package version to make audit green; a private fix may still need an explicit advisory disposition.
4. **Wait for upstream while closing other launch gates:** preserves the existing security contract and current stack. Recheck October 27, 2026 or sooner on a patch publication; keep development loopback-only and builds restricted to reviewed inputs. This is the default unless Fede explicitly chooses another path.
5. **Human-approved, narrow temporary exception:** an option to evaluate if the launch cannot wait, not an exception granted by this report. It would have to name only these two GHSA IDs, an owner, expiry/review date, approved versions, exact Linux/deployed artifact evidence and compensating controls. New vulnerabilities must still block; native audit results must remain visible; package contents and build-input assumptions need enforcement. No generic high-severity downgrade, administrator bypass or automatic merge. The current mandatory audit therefore remains blocking until a separately approved policy is actually designed and reviewed.

## Recommendation and open gates

Keep the current block and work through two-user/Android acceptance, backups/restore, operations and explicit finance-only UI/API scope in parallel. **Do not declare the site production-ready based on build-tool reachability alone.** The evidence makes a later scoped human risk decision possible; it is not that decision. If the deadline requires release before upstream patches, first obtain explicit approval to design/review the narrowly scoped exception and validate the exact deploy artifact. Otherwise, retain the upstream blockers and scheduled review.

The actual deployed preview version, production settings, distributed auth/API rate limiting and remaining functional acceptance were not revalidated here. No secret, IAM, rule, index, billing, financial record, merge requirement or audit command changed.

## Evidence and continuation

Approved temp root: `C:\Users\Fede\AppData\Local\Temp\opencode\`.

- `finanzas-reachability-audit.json`: fresh audit, still eleven propagated high findings.
- `finanzas-reachability-netlify-build.log`: new successful credential-free instrumented build.
- `finanzas-reachability-d56d478adb834942972b03a10e6b2498/`: process counter JSON, including positive controls; no raw pattern/certificate/token capture.
- `finanzas-reachability-artifact.json`: inventory, matches and digest.
- `finanzas-dependency-reachability.cjs`: temporary observer; SHA-256 `53aa7cee85ebf151b83cf64183216c7db316ce1d166e9100f9c7c3c682d0095d`.
- `finanzas-artifact-reachability.cjs`: temporary scanner; SHA-256 `0f7372e0a49bf5488f78830b7e80c4fb2a862001f688186f4f29d61e93aea301`.

The temporary tools are local evidence, not installed application code or automatic CI gates. Archive them with the evidence if a formal exception review is opened; without them and the referenced artifact, counters/digest alone are not a fully reproducible independent audit. Any new dependency graph, build configuration or release artifact needs a fresh assessment. Prior reduction and clean Linux CI evidence remain in [checkpoint 24](24-dependency-reduction-checkpoint.md); general release gates remain in [the recap](22-recapitulacion-y-plan-de-continuidad.md).

Operational follow-up: [synthetic recovery rehearsal and the still-open production backup decision](26-backup-restore-rehearsal.md). It does not change either advisory's status or grant an audit exception.
