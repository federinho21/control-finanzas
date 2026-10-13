# Preparation branch and Netlify connection checkpoint

## Authorized scope

Fede authorized uploading the reviewed changes to a preparation branch, WITHOUT changing `main`, and requested Netlify MCP access first. OAuth connection is now verified. The agent queried only the selected finance site and did not create another Netlify project.

- Repository: `https://github.com/federinho21/control-finanzas`
- Branch: `prepare/firebase-netlify`
- Application/source commit: `8ccac02`
- Netlify project: `control-finazas`
- Site ID: `9c49b0cd-ab24-41f0-b5cc-c1bcdeca698f`
- Selected HTTPS URL: `https://control-finazas.netlify.app`

The selected URL returned 404 during the read-only connection check. No production deploy or merge was requested in this checkpoint. Pushing this branch may trigger branch/preview automation if enabled in Netlify; it does not change the Git `main` branch. Actual branch deployment behavior must be checked before configuring live credentials.

## Publication contents and checks

The application commit includes the already-implemented Firebase ownership/session migration, private agents/documents, migration tools, dependency fixes and Netlify adapter configuration. These mutually dependent changes were saved as one coherent source/test snapshot rather than reconstructing unsafe intermediate states. Documentation is a separate commit.

Included changes are enumerated in modules 1–11. Existing SQLite/D1 files are retained for historical export only; runtime routes do not import them. `apphosting.yaml` is historical; Netlify is the selected target.

Excluded: `.env`, generated `dist`/`.output`/`.netlify`, `node_modules`, `.data`, database files, real service-account keys, Android installation artifacts and OpenCode OAuth credentials. Android configuration is outside this repository; it was not uploaded here.

Before the source commit:

- 95 added/modified staged files were checked for matches against local server secrets, private-key/token patterns and forbidden/generated/data paths; no matches found. The three intended legacy file deletions were also included.
- Staged whitespace check passed.
- Backend auth: 11 tests passed.
- Real Firestore emulator integration: 27 tests passed, with SQLite mtime unchanged.
- Netlify compatibility: 5 tests passed.
- Compiled Netlify handler: 15 checks passed; no live Firebase calls.
- Finance and web typechecks passed. The preceding Netlify/Node builds and browser acceptance results are recorded in module 11.

This is preparation-branch verification, NOT a production security approval. Tests that need real Google/Gemini/Storage/IAM or Linux Netlify runtime were not silently counted as passed.

## Still pending

- Confirm source publication succeeded and select this branch for protected staging/preview without replacing production `main`.
- Server Firebase credentials and verified least-privilege IAM; do not paste private keys in chat.
- Netlify variables, exact Origin and Firebase authorized domains per trusted deploy context.
- Private document-storage decision; changing hosting does not remove Firebase Storage's billing requirement.
- Remote indexes/TTL and rule review; preserve the Android app's source configuration/data.
- Whole-request runtime/cancellation and live two-user acceptance.
- Last dependency audit: 71 findings, including 2 critical DevTools findings; remediation/security sign-off remain required before production.

Earlier module statements that no commits/pushes occurred describe those earlier checkpoints, not this newly authorized preparation publication.
