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

The initial native production-graph audit reported **63 findings: 0 critical, 22 high, 40 moderate, 1 low**, down from the preceding 67. The build/editor follow-up below reduced this further. The app is NOT cleared for production. Firebase browser Firestore still pins an old gRPC dependency; do not apply audit's proposed Firebase 9 downgrade. Other editor/build/glob dependencies and trust-boundary reachability still need review. Re-evaluate before the next security slice and before production approval.

No rules/indexes, IAM, billing, production deployment or finance migration changed. Local evidence: `finanzas-audit-after-runtime-patches.json`, `finanzas-runtime-security-node-build.log`, `finanzas-runtime-security-netlify-build.log`, `finanzas-frozen-runtime-install.log`, `finanzas-runtime-registry-signatures.log` under the approved OpenCode temp root.

## Build/editor follow-up

`npm update source-map-js svgo prosemirror-view brace-expansion --ignore-scripts --no-audit` changed nine existing package installations, still without manifest changes or overrides:

- source-map-js 1.2.1 → 1.2.2, used by the Vue/CSS compilation chain; patches indexed source-map offset denial of service.
- SVGO 4.0.2 → 4.1.0, through CSS minification; patches opt-in `removeScripts` namespace/URL/foreignObject bypasses. This project does not accept user SVG uploads or treat SVGO as its sanitizer. [Upstream advisory](https://github.com/advisories/GHSA-4vpr-x523-8j87).
- prosemirror-view 1.41.8 → 1.42.6 through Nuxt UI/Tiptap; patches pasted-content XSS. No new rich-text editor was added. [Advisory](https://github.com/advisories/GHSA-c8x8-7fp4-3x9w).
- All affected brace-expansion copies updated to 2.1.7 or 5.0.12, maintaining each parent's major range; patches nested-pattern/expansion denial of service. [Advisory](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr).

The expanded lockfile gate failed against an old nested brace-expansion installation and passed after updating all copies. Eight dependency tests, both typechecks, all nine browser tests, Node/Netlify builds and 15 compiled Netlify checks passed after this follow-up. No financial persistence code changed. A fresh frozen install/signature verification was performed for the preceding runtime revision, not repeated for this later lockfile.

Audit after this follow-up: **59 findings: 0 critical, 18 high, 40 moderate, 1 low**. Local evidence: `finanzas-audit-after-build-patches.json`, `finanzas-build-security-node-build.log`, `finanzas-build-security-netlify-build.log`. Remaining highs include known-unpatched braces/node-forge, old Firebase browser gRPC, Tiptap core, LangSmith and Seroval; their presence is not waived by patching build tools.

## Editor/agent follow-up

Updated existing Tiptap packages together from 3.22.4 to 3.32.0, Seroval 1.6.2 → 1.6.9 and LangSmith 0.5.23 → 0.10.13, within their existing parent dependency/peer ranges. Tiptap's associated ProseMirror/linkifyjs dependencies followed their declared ranges; one `prosemirror-inputrules` installation was added and LangSmith's old nested UUID was removed. No manifest, direct dependency, forced install or override was added.

The first grouped `npm update` left old core/pm packages beside new exact-version peers; `npm ls` and security tests rejected that inconsistent state. It was not published. Refreshing ONLY the Tiptap lockfile subtree with `npm install --package-lock-only --ignore-scripts --no-audit`, then synchronizing installation with `npm install --ignore-scripts --no-audit`, resolved the entire group to 3.32.0. Final `npm ls @tiptap/core @tiptap/pm @tiptap/vue-3 seroval langsmith --all` passed, with no invalid peers. No unrelated lockfile subtree was discarded.

New synthetic regression: an own `__proto__` key passed through `mergeAttributes` previously produced inherited `onclick`; the patched dependency rejects that inheritance while preserving normal titles. No browser event or executable payload is run by the test. [Tiptap advisory](https://github.com/advisories/GHSA-cp6q-959q-f8rh). Seroval patches unchecked typed-array allocation ([advisory](https://github.com/advisories/GHSA-jp82-f5mq-hwhp)); LangSmith adds the public prompt-pull trust boundary ([advisory](https://github.com/advisories/GHSA-3644-q5cj-c5c7)). Application source does not directly use UEditor, Seroval deserialization or LangSmith prompt pulls, and tracing credentials/enabling flags were absent in the local probe environment. Those unused paths were not activated to test the upgrade.

Passed: 10 dependency tests (including synthetic Gemini-provider invocation with network interception), 32 emulator integration tests, 17 chat tests, 11 auth tests, 5 Netlify compatibility tests, 9 browser tests, both typechecks, Node/Netlify builds and 15 compiled Netlify route checks. A second clean `npm ci --ignore-scripts --no-audit` under `finanzas-frozen-editor-20261014` succeeded and the nine dependency tests available at that point passed there. Registry verification succeeded: 1,075 verified signatures and 337 attestations. The subsequently added provider-interception test passed in the project installation; it was not part of that nine-test fresh-install run.

### Live-provider limitation remains unresolved

Two live full-chat/emulator probes with the upgraded graph failed their expected-proposal assertion because the classifier returned its safe six-second timeout response. They did not create a movement. Separate synthetic model probes with a diagnostic 30-second signal returned valid responses with the patched stack, but observed 21.8s, 68.2s and 31.3s elapsed times; the intended signal was not a demonstrated end-to-end ceiling in this diagnostic. Previous-stack calls in those same diagnostics returned in 0.45–0.77s. This correlation is NOT proof the LangSmith update caused the provider delay, nor evidence the availability issue is fixed.

A fetch-timing probe attributed 31.299s of the 31.334s patched invocation to the Google HTTP request. With intercepted synthetic responses, patched/previous calls took 26ms/4ms and emitted identical request-body hashes. This establishes request-shape compatibility and excludes large local serialization overhead in that sample; it does not explain live latency or compare provider routing, connection setup or scheduling reliably. Do not label the latest full live registration test as passed, reuse an older success report as fresh evidence, or widen the application deadline merely to hide this result. Production still needs live latency/availability acceptance.

Current audit: **22 findings: 0 critical, 15 high, 6 moderate, 1 low**. Most of the large count reduction is removal of Tiptap transitive/meta findings, not proof that all financial routes are safe. Known-unpatched braces/node-forge and Firebase's pinned browser gRPC remain, with framework/build metavulnerabilities. No production waiver is implied.

Evidence: `finanzas-audit-after-editor-agent.json`, `finanzas-editor-final-tree.log`, `finanzas-editor-security-node-build.log`, `finanzas-editor-security-netlify-build.log`, `finanzas-frozen-editor-install.log`, `finanzas-editor-registry-signatures.log`, `finanzas-editor-agent-live-smoke.log`, `finanzas-editor-agent-live-second-sample.log`, `finanzas-langsmith-compat-results.log`, `finanzas-langsmith-compat-sequential.log`, `finanzas-langsmith-compat-network.log`, `finanzas-langsmith-compat-fake.log` under the approved temp root. All probes used synthetic text/data; Firebase production records were untouched.
