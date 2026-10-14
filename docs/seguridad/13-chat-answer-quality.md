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

Properly filtered pending cuotas, balance-aware spending guidance, conversational registration with confirmation, consistent Spanish for all other paths, and follow-up conversation context remain separate slices. Dependency security, real two-user acceptance, PDFs/Storage and runtime limits remain production launch gates.

## Second corrective slice — categories and recent movements

Added internal classifier/data operations `category_report` and `recent_movements`. Existing graph forwarding and UID-scoped `loadMovements` are reused; no new public endpoint, schema migration, IAM permission, index or dependency is needed.

- Categories use only recorded expenses, sum integer minor units, rank descending with deterministic ties, and default to the current Costa Rica month. Income/withdrawals do not enter expense category totals. Display is capped at 20 categories with an explicit truncation notice.
- Recent movements default to five across eligible recorded history, accept an explicit/current/previous month and a classifier-extracted integer limit (including requests using number words). The backend validates 1–20 independently. Date/creation time determines order; the response states actual displayed/available counts and period.
- Unsupported/ambiguous periods ask for clarification. Exclusions remain disclosed; stored merchant/category text is escaped as plain Markdown content to avoid injected links/images. Merchant-specific and movement-type-only list filters are not implemented; the classifier is instructed to clarify those requests rather than invent filtering.
- The legacy monthly formatter's explicit category limitation remains as a safe response if the model incorrectly chooses the totals-only operation.

The data handler additionally refuses known type/category/store-filtered recent-list requests and income/withdrawal category reports if the classifier selects these operations anyway; it does not present unfiltered records or expense-only totals as filtered answers. Emulator assertions cover these guards.

Verification: 10 behavior tests and 28 emulator integration tests passed, including a new real-repository test proving no foreign data with an injected payload UID, exact category arithmetic, recent count/order, invalid-limit rejection and unchanged payment fixtures. Finance typecheck passed. Seven live Gemini + local-emulator questions returned the expected category ranking (CRC 150/100/50), recent counts (five requested/four available, two requested), explicit month, rejection of a 100-item request, previous-month emptiness and the existing balance. No proposals or foreign sentinel were exposed; all source fixtures stayed unchanged. These synthetic responses took 877–3,281 ms.

The first local build reached Nitro completion but exceeded its 300-second command limit during packaging. A retry with a 600-second limit succeeded; all 15 compiled route checks and the plain-Node cold-start/Firestore initialization regressions passed. Retry log: `C:\Users\Fede\AppData\Local\Temp\opencode\finanzas-chat-read-slice2-build-retry.log`. Authenticated preview behavior still requires Fede's browser acceptance after the branch deploy. No financial records were changed in the real Firebase project.

After adding the unsupported-filter guards, the final build, 28 integration tests, compiled smoke checks and typecheck passed again. Final build log: `C:\Users\Fede\AppData\Local\Temp\opencode\finanzas-chat-read-slice2-build-final.log`.
