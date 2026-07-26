# Quarterly Rocks AI Assistant

An AI-powered planning assistant for managing Quarterly Rocks, Sprints, and Tasks. Built with Nuxt 4, LangGraph, Google Gemini 2.5 Flash, and SQLite.

## Prerequisites

- Node.js 20+
- A [Google Gemini API key](https://aistudio.google.com/app/apikey)

## Local Setup

**1. Install dependencies**

```bash
npm install
```

**2. Create the environment file**

Create a `.env` file in the project root:

```
GEMINI_API_KEY=your_google_gemini_api_key_here
```

The database (`hackathon.db`) is created automatically in `.data/` on first run — no migration step needed.

**3. Start the development server**

```bash
npm run dev
```

The app will be available at [http://localhost:3000](http://localhost:3000).

> **Windows terminal encoding:** if log symbols appear as garbled characters, run `chcp 65001` in your terminal before starting the server.

## Production Build Preview

To test the production build locally before deploying:

**1. Build the app**

```bash
npm run build
```

**2. Preview the production build**

```bash
npm run preview
```

This starts a local server (usually at [http://localhost:3000](http://localhost:3000)) running the optimized production output. Use this to validate the app behaves correctly before publishing to any hosting platform.

> The `.env` file is still required for the production preview — make sure `GEMINI_API_KEY` is set.

## App Pages

| Route | Description |
|---|---|
| `/` | Main view: backlog sidebar + AI chat |
| `/preview` | Plan preview and edit before approval |
| `/dashboard` | Executive KPI dashboard |

## Key Features

### Chat Agent
Type any planning intent in the chat input on the home page. Examples:

- `"Create a Q3 growth plan for our SaaS product"` — generates a full Rock + Sprints + Tasks plan
- `"Break sprint S-XXXX into tasks for rock R-XXXX"` — generates tasks for a specific sprint
- `"Mark T-XXXX as completed"` — updates a task status
- `"What's the status of R-XXXX?"` — queries a rock's details
- `"Generate a retrospective for S-XXXX"` — creates a sprint retrospective summary
- Ask questions about uploaded documents using RAG

### Plan Preview (`/preview`)
When the agent generates a full plan, it opens automatically in preview mode:
1. Edit the rock name, description, and deadline
2. Edit sprint names and dates
3. Add or remove sprints using the buttons at the bottom
4. Add, remove, or edit tasks within each sprint (description, owner, deadline, priority, include toggle)
5. Click **Approve Plan** to persist everything to the database

You can also modify the plan via chat before approving: while the preview is open, type something like `"Add a sprint for QA testing"` and the agent will update the plan in the preview.

### Document Upload
Upload PDFs or text documents using the upload button in the chat sidebar. Uploaded documents are chunked, embedded, and stored for RAG queries.

### Executive Dashboard (`/dashboard`)
View KPI cards, task status distribution, sprint status distribution, and rock completion progress charts.

## Tech Stack

- **Frontend:** Nuxt 4 + Vue 3 + Nuxt UI v4
- **AI:** LangGraph + Google Gemini 2.5 Flash
- **Database:** Drizzle ORM + SQLite (better-sqlite3)
- **Logging:** pino + pino-pretty (dev)
- **Charts:** Chart.js + vue-chartjs

## Project Structure

```
app/          # Frontend pages, components, composables
server/
  agents/     # LangGraph graph, supervisor, data-agent, planner, RAG, judge, retrospective
  api/        # Nitro API routes (chat SSE, dashboard, upload, documents)
  db/         # Drizzle schema and SQLite connection
  utils/      # Logger, chunker, pdf-parser
shared/       # Cross-layer TypeScript types
```
