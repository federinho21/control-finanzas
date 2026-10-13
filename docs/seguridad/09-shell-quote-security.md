# Dependency security — shell-quote

## Change

Updated the existing transitive `shell-quote` dependency from 1.10.0 to 1.12.0 inside launch-editor → Nuxt DevTools. npm changed one package; no direct dependency, override, framework downgrade or application source change was introduced. Installation scripts were disabled.

Files changed: `package-lock.json`, `tests/dependency-security.test.ts`, this document and the security index. Existing Vue SSR regression tests remain intact.

```powershell
npm update shell-quote --ignore-scripts --no-audit
npm run test:security:dependencies
```

## Evidence and compatibility

The advisory describes `quote()` accepting a line terminator in a string following a comment token, allowing later text to escape the comment when executed by a POSIX shell. Added a regression test using the exact shell-quote installation resolved from launch-editor, not an independently added package. It tests LF, CR, U+2028 and U+2029; no quoted payload is executed. The test failed with 1.10.0 and passes after the update.

A second test checks normal paths, spaces, apostrophes, shell metacharacters and empty arguments survive a quote/parse round trip. This is library compatibility coverage, not a claim that POSIX quoting is a PowerShell/cmd.exe sanitizer or that launching every editor was tested.

Reviewed changelog: 1.11.0 introduced the security rejection; 1.12.0 adds parser support for additional shell syntax. Both stay inside the caller's declared `^1.8.4` range. The package has no installation hooks that were needed for this change.

Sources:

- https://github.com/advisories/GHSA-pqg4-j6r4-53mv
- https://github.com/ljharb/shell-quote/blob/main/CHANGELOG.md

## Verification

After the update:

- 4 dependency security tests passed.
- 27 real Firestore emulator integration tests passed, including agent approvals and document/RAG isolation.
- 15 compiled auth/page/API checks and 8 Playwright browser regressions passed against the rebuilt artifact.
- Web typecheck and Node Nuxt build passed.

Build log: `C:\Users\Fede\AppData\Local\Temp\opencode\finanzas-security-shell-quote-build.log`.

Production audit changed from **72 findings / 3 critical** to **71 findings / 2 critical**: 1 low, 41 moderate, 27 high, 2 critical. No audit suppression was added. Fresh immutable installation, real editor launching and live Google/Gemini/Storage were not tested.

## Why the remaining critical findings are not overridden

Remaining installed chain:

```text
nuxt 4.5.2
  @nuxt/devtools 3.4.1
    simple-git 3.36.0
      @simple-git/argv-parser 1.1.1
```

Registry metadata shows stable DevTools 3.4.2 still declares `simple-git: ^3.36.0`. Patched simple-git 4.0.2 includes argv-parser 2.0.1, but the v4 changelog explicitly removes its default export. The installed DevTools module uses `import Git from 'simple-git'` (`node_modules/@nuxt/devtools/dist/chunks/module-main.mjs`, line 16). Forcing v4 into that caller would break its import; a passing audit count would not make that a safe fix. No major override or node_modules patch was applied.

Next work requires a compatible upstream DevTools/framework release, or an explicitly reviewed integration change. Merely disabling the DevTools UI would not remove these installed vulnerable dependencies or justify clearing the release gate. The audit's suggested Nuxt 3.7.4 downgrade is not an acceptable migration strategy.

Source: https://github.com/steveukx/git-js/blob/main/simple-git/CHANGELOG.md (4.0.0 breaking import changes; 4.0.2 security fix).

Review date: **2026-10-14, before release**. Restrict development servers to trusted/local access pending remediation; the two critical findings and remaining runtime/build advisories still block production security sign-off.

No commits, pushes, remote data migration, rule/IAM changes or deployment were performed.
