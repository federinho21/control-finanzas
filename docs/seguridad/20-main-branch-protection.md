# Main branch protection — required CI checks

## Authorized scope

Fede requested installation and continued after being told that protecting `main` would block merges while tests or the security audit fail. This change installs that GitHub repository setting only. It does not authorize merging the draft PR, production deployment, billing, financial writes or migration.

Fresh inspection found `main` unprotected (protection API 404) and no repository/inherited rulesets. No existing branch protection, reviewer requirement or collaborator restriction was replaced.

## Installed policy

Desired request body: [`.github/main-branch-protection.json`](../../.github/main-branch-protection.json).

- Required status checks: `verify` and `dependency-audit`, both bound to the genuine GitHub Actions App ID **15368**, confirmed from actual check runs. A same-named result from another app is not sufficient.
- `strict=true`: the branch must be current with its base before merging.
- `enforce_admins=true`: administrators do not automatically bypass the required checks.
- Force pushes and branch deletion are disabled.
- No required-reviewer count, collaborator/role change, push allowlist, bypass allowance, merge queue or unrelated repository rule is added.

The policy was applied specifically to `federinho21/control-finanzas`, branch `main`, using the authenticated GitHub API. The first request included both legacy `contexts` and app-bound `checks`; GitHub rejected that mutually ambiguous shape with 422 and a follow-up GET still returned 404. Removing the redundant legacy field preserved both app-bound requirements and allowed the request. Regression coverage now rejects that incompatible mixed shape. No failed request was treated as a successful installation.

This JSON file is an auditable desired configuration, not an automatic GitHub deployment feature. CI jobs remain read-only and do not apply administrative settings. Renaming a required job needs a coordinated policy/API change; the local policy test checks that both job names still exist.

## Read-back verification

After the successful PUT, independent GET requests verified:

- `main.protected=true`, both expected checks and their App IDs, strict status checks and administrator enforcement.
- Force pushes/deletion disabled; no new review requirement.
- Main SHA unchanged: `f9eae2d7a79f6759e327e990d0894d81de739b7f` before and after.
- PR #1 remains **OPEN**, **draft**, targeting `main`; its observed merge state is **BLOCKED**, with `verify=SUCCESS` and `dependency-audit=FAILURE` at inspection.

All five local CI-policy tests passed. The new test first failed without the manifest, then caught the incompatible mixed fields before their correction. Verification used configuration/state reads and assertions; no merge, force push, branch deletion or rejected-write probe was attempted against `main`. No application runtime or financial schema changed.

Local snapshots under the approved OpenCode temp root: `finanzas-main-before-protection.json`, `finanzas-main-protection-before.json`, `finanzas-main-rulesets-before.json`, `finanzas-main-protection-after-rejected-request.json`, `finanzas-main-protection-applied.json`, `finanzas-main-protection-readback.json`, `finanzas-main-after-protection.json`, `finanzas-pr-after-protection.json`. These contain repository metadata, not authentication tokens.

## Remaining limitations

The existing high dependency findings intentionally keep the audit gate red. No exception or weaker threshold was introduced. Passing CI later is necessary but not sufficient for production approval: live Gemini, real two-user/Android/PDF acceptance, private storage and operational gates remain open. Administrators can still deliberately edit repository policy; this is enforcement of the current rule, not an immutable lock or a substitute for human approval. The existing preview integration remains separate and is not stopped by a red production merge gate.

Official API contract: [GitHub protected branches](https://docs.github.com/en/rest/branches/branch-protection#update-branch-protection).
