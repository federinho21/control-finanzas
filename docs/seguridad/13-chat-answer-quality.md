# Chat answer quality — first corrective slice

## Reproduced behavior

With Fede's approval, ran 15 questions through the real LangGraph workflow and live Gemini `gemini-3.1-flash-lite`, using ONLY synthetic users/payments in the local Firestore emulator. Baseline: income CRC 1,000, expenses CRC 300, balance CRC 700, four owned movements and one foreign sentinel payment. Source fixtures remained unchanged; no foreign sentinel appeared in responses. This was not a production browser/authentication test.

Confirmed issues: relative months were rejected; monthly answers mixed English/Spanish and always repeated all totals; category/advice questions were sent to document search; recent movements and natural-language registration demanded internal IDs; cuota listing did not identify paid/pending state; classifier failure could generate an unsolicited budget proposal. Greeting/thanks worked; explicit-month totals were numerically correct; requested budgets remained proposals with approval. No claim of broad security sign-off follows from these examples.

## Implemented scope

- Classifier failure ALWAYS asks for clarification and ends. Message length no longer permits fallback budget generation.
- Monthly totals resolve explicit `YYYY-MM`, `este mes`/`this month`, and `mes pasado`/`mes anterior`/`last month` using the existing Costa Rica date. Previous January crosses the year boundary. Invalid, day-specific and ambiguous multi-month requests ask for clarification rather than silently selecting a period.
- Spanish answers address Fede, give the requested income/expense/withdrawal/balance metric, preserve full totals for summaries/multi-metric questions, and disclose excluded records.
- Monthly totals do not pretend to answer category/store breakdowns; unsupported breakdown questions explicitly direct the user to the dashboard.
- Existing verified UID, repository ownership filters, approval rules and SSE events remain unchanged. No remote financial writes or resource configuration are part of this slice.

## Verification

`npm run test:chat:behavior`: six regression tests cover safe fallback, relative dates/year boundaries, invalid/ambiguous periods, accent handling, exact totals, multi-metric answers, exclusions and unsupported category breakdowns. The initial regression run failed before the behavior changes. No tests were removed/skipped.

Live repeat: 16 synthetic questions, including the previous-month case. Current/previous month and explicit income/balance queries now return the expected periods and values without proposals. The category probe exposed an overly broad total-only answer during development; a subsequent deterministic guard and regression prevent that misrepresentation. The read/foreign-record probe returned not found instead of generating a budget in this sample. This is stochastic acceptance evidence, not a guaranteed latency/intent result.

After the category guard, four focused live graph checks returned the expected current-month expense, previous-month expense, balance and explicit category limitation in 926–1,457 ms, without proposals or source-record changes.

Also passed: 27 emulator integration tests, finance typecheck, Netlify build and 15 compiled route checks plus plain-Node cold-start/Firestore checks. Build log: `C:\Users\Fede\AppData\Local\Temp\opencode\finanzas-chat-read-slice1-build.log`. Synthetic FAQ evidence stays in the approved temp directory, not production storage.

## Remaining capabilities

Category breakdowns, recent movement listings, properly filtered pending cuotas, balance-aware spending guidance, conversational registration with confirmation, consistent Spanish for all other paths, and follow-up conversation context remain separate slices. Do not advertise these as corrected by monthly-total handling. Dependency security, real two-user acceptance, PDFs/Storage and runtime limits remain production launch gates.
