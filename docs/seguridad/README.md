# Security and Firebase migration modules

Work is deliberately incremental. Fede authorized the remaining modules together with "HAZ LOS MODULOS FALTANTES". No production deployment or data migration is implied by implementing them.

| Number | Scope | Status |
| --- | --- | --- |
| 1 | Backend authentication: Firebase Admin, secure sessions, requireUser | Implemented; automated checks passed; Fede accepted Google login on preview; two-user staging acceptance pending |
| 2 | Link Android anonymous identity to Google, preserving UID | 23 unit tests and APK build passed; Fede installed the update; remote Auth confirms Google linked to the original UID; fresh capture acceptance pending |
| 3 | Web Google login, session hydration, logout and state reset | Implemented; 13 unit + 12 browser tests passed; web typecheck passed; Fede accepted preview login; full staging acceptance pending |
| 4 | UID-scoped Firestore repositories and private finance APIs | Implemented; 35 emulator integration + 7 model tests passed; Fede accepted preview movement/dashboard/manual-write flows; keyed manual retries tested locally; two-user acceptance pending |
| 5 | Trusted UID through LangGraph, tools and durable approvals | Implemented; emulator/SSE tests and synthetic approval/replay checks passed; latest live classifier latency remains a blocker; explicit read-only reports bypass Gemini |
| 6 | Private uploads, document lifecycle and isolated RAG | Implemented; owner isolation and lifecycle tests passed; real Storage/PDF/Google acceptance pending |
| 7 | Idempotent migration, cross-user acceptance tests and hosting deployment | Migration tools implemented; Netlify preview deployed and accepted for core single-user flows; production migration/deployment NOT executed |

Details and verification evidence: [Module 1](01-backend-auth.md).
Android linking implementation and pending acceptance: [Module 2](02-android-google-link.md).
Web authentication implementation and verification: [Module 3](03-web-google-auth.md).
Firestore finance APIs, compatibility and operational limits: [Module 4](04-firestore-finance-api.md).

Remaining-module details: [Module 5](05-private-agents.md), [Module 6](06-private-documents.md), [Module 7](07-migration-app-hosting.md).
Dependency security follow-up: [unused Community removal and Vue SSR fix](08-dependency-security.md).
Further remediation: [shell-quote fix and remaining DevTools blockers](09-shell-quote-security.md).
Real Firebase inspection and local setup: [project readiness and Android linking checkpoint](10-firebase-readiness.md). Web registration/OAuth clients already exist remotely; local configuration was refreshed. Google linking is confirmed on the original Android UID. Billing, ADC/IAM and Web/Storage acceptance remain pending.
Selected hosting: [Netlify Functions + Firebase Auth/Firestore](11-netlify-hosting.md), superseding App Hosting. Blaze is not required for this hosting choice; document storage is still a separate unresolved requirement.
Authorized source-publication checkpoint: [preparation branch and verified Netlify connection](12-preparation-branch.md). `main` is not the publication target.
Chat answer quality and first corrective slice: [FAQ evaluation and safe monthly totals](13-chat-answer-quality.md).
Conversational registration: [UID/session-bound movement confirmation, cancellation and replay](14-conversational-movements.md).
Dependency follow-up: [DevTools removal of vulnerable Git tooling and Nano ID patches](15-devtools-nanoid-security.md).
Runtime follow-up: [HTTP/serialization/Markdown patches and frozen-install/signature verification](16-runtime-dependency-security.md).
Manual forms: [Costa Rica dates, accessible fields and recoverable submission errors](17-manual-form-safety.md).
Manual retry protection: [owner-scoped idempotency keys, atomic receipts and explicit reload limits](18-manual-create-idempotency.md).
Automated verification: [secret-free GitHub CI, clean Linux acceptance and the still-failing security audit](19-ci-quality-gates.md). The verification job passed; audit findings remain visible.
Main protection: [required app-bound CI checks, admin enforcement and unchanged main SHA](20-main-branch-protection.md). Installed after Fede requested it; the failed audit now blocks normal merging, including for administrators.
Finance-first release: [Gemini deprioritized, Nuxt UI remediation and remaining dependency root triage](21-dependency-triage-finance-release.md). Latest local audit: 19 findings, including 15 high; no exception or audit suppression.

**Release gate:** finance, chat, upload and document deletion authenticate and use UID-scoped Firestore. Reachable agent code no longer imports SQLite/D1. Android Google linking and single-user preview login/core finances are verified. Production still requires real two-user acceptance, fresh Android capture, a private document-storage decision and PDF/RAG acceptance, production credential/rules/index/TTL review, backup/migration decisions, runtime/monitoring/rollback evidence, acceptable live Gemini latency and dependency risk closure. Preview IAM/index configuration is not production approval. Latest production-graph audit: **20 findings (0 critical, 15 high, 4 moderate, 1 low)**; full install audit including development packages: **23 (0 critical, 15 high, 8 moderate)**. See the dependency report for reachability and unpatched roots. This is NOT a production release approval.
