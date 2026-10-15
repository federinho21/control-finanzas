# Security and Firebase migration modules

Work is deliberately incremental. Fede authorized the remaining modules together with "HAZ LOS MODULOS FALTANTES". No production deployment or data migration is implied by implementing them.

| Number | Scope | Status |
| --- | --- | --- |
| 1 | Backend authentication: Firebase Admin, secure sessions, requireUser | Implemented; local automated checks passed; real Google integration pending |
| 2 | Link Android anonymous identity to Google, preserving UID | 23 unit tests and APK build passed; Fede installed the update; remote Auth confirms Google linked to the original UID; fresh capture acceptance pending |
| 3 | Web Google login, session hydration, logout and state reset | Implemented; 13 unit + 8 browser tests passed; web typecheck now passes; live Google acceptance pending |
| 4 | UID-scoped Firestore repositories and private finance APIs | Implemented; 19 emulator integration + 5 model tests passed; local build passed; remote acceptance pending |
| 5 | Trusted UID through LangGraph, tools and durable approvals | Implemented; emulator and SSE tests passed; live Gemini acceptance pending |
| 6 | Private uploads, document lifecycle and isolated RAG | Implemented; owner isolation and lifecycle tests passed; real Storage/PDF/Google acceptance pending |
| 7 | Idempotent migration, cross-user acceptance tests and hosting deployment | Migration tools implemented; hosting target changed to Netlify Functions and tested locally; remote migration/deployment NOT executed |

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

**Release gate:** finance, chat, upload and document deletion authenticate and use UID-scoped Firestore. Reachable agent code no longer imports SQLite/D1. Android Google linking is verified; real Web login, private document-storage decision, server credentials/IAM, remote rules/indexes/TTL readiness, migration, Netlify acceptance/runtime limits and dependency remediation remain pending. Latest production dependency audit: 71 findings (1 low, 41 moderate, 27 high, 2 critical). This is NOT a production release approval.
