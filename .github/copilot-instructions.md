Project baseline for all Copilot interactions in this repository.

Tech stack
- Nuxt 4 + Vue 3 + Nitro
- LangGraph + Google Gemini
- Drizzle ORM + SQLite

Repository layout
- app/: frontend UI, pages, and composables
- server/: API routes, agents, database, and utilities
- shared/: cross-layer TypeScript types

Import aliases
- ~ points to app/
- ~~ points to repository root

Domain conventions
- Rock IDs use format R-XXXX
- Sprint IDs use format S-XXXX
- Task IDs use format T-XXXX

Quality conventions
- Keep all code, comments, prompts, and documentation in English
- Prefer minimal, focused diffs that preserve existing behavior unless change is requested
- Validate request boundaries in API handlers
- Preserve current SSE and agent action-approval flows

Agent workflow
- Use orchestrator for multi-step or cross-layer implementation tasks
- Use specialist subagents for architecture, backend, frontend, AI, database, and QA

## Recent Feature Additions

### Finance Domain + Liquid Glass Frontend
- The app has been adapted from Rocks/Sprints/Tasks planning to a **personal finance controller** (movimientos, cuotas fijas, resumen mensual).
- Frontend: Liquid Glass design system (glassmorphism + aurora gradients). Use `builder-fe-glass` for UI styling work. Glass panel utility: `glass-panel` in `app/assets/css/main.css`.
- Financial color semantics: ingresos=emerald, gastos=rose, retiros=amber, balance=cyan/rose, brand=violet.
- IDs: R-XXXX (cuenta), S-XXXX (período), T-XXXX (movimiento), U-XXXX (cuota).

### Executive Dashboard (`/dashboard`)
- Page: `app/pages/dashboard.vue` — fetches `/api/dashboard` and shows KPI cards, task progress, rocks completion bars, and sprints overview
- API: `server/api/dashboard.get.ts` — returns rocks with completion %, sprints with task breakdown, headcount (unique owners excluding "TBD"), and task counts by status

### LLM-as-a-Judge
- Agent: `server/agents/judge.ts` — `judgeTaskCompletion(taskId)` — runs after any `update_task_status` to "completed"; cross-references RAG documents to detect inconsistencies
- Graph: `judgeNode` in `graph.ts` fires conditionally after `dataNode` when operation is `update_task_status` with status `completed`
- Chat: emits SSE event `type: 'judge'`; shown in chat as amber bubble with `i-lucide-alert-triangle` icon

### Guardrail Rejection Visible in UI
- Graph: `guardrailError` field in `AgentState` propagated from `dataNode`
- Chat: emits SSE event `type: 'guardrail'`; shown as red bubble with `i-lucide-shield-alert` icon
- Types: `ChatRole` in `shared/types/chat.ts` includes `'judge'` and `'guardrail'`

### Sprint Retrospective Agent
- Agent: `server/agents/retrospective.ts` — `generateRetrospective(sprintId)` — queries tasks for a sprint and generates a structured LLM summary
- Trigger: user asks for "retro", "retrospective", "sprint review" with a Sprint ID (S-XXXX)
- Supervisor: `'generate_retrospective'` operation, `'retro'` route in `RouteName`
- Graph: `retroNode` in `graph.ts` routes from supervisor
