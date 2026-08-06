# 💠 Control de Finanzas con Asistente IA

Aplicación de **control de finanzas personales** con asistente conversacional impulsado por IA. Gestiona movimientos (ingresos/gastos/retiros), cuotas fijas y presupuestos mensuales con un dashboard de KPIs.

**🌐 Producción (Cloudflare Workers):** https://control-finanzas.agente-deportivo.workers.dev

---

## ✨ Funcionalidades

- **🤖 Asistente IA** (`gemini-3.6-flash`): conversa en español, genera presupuestos, registra movimientos y cuotas, y responde preguntas sobre tus finanzas.
- **📊 Dashboard financiero**: ingresos, gastos, retiros y balance del mes + distribución por categoría.
- **🔁 Cuotas fijas**: suscripciones mensuales/anuales con marcado de pago (genera el gasto automáticamente).
- **📄 RAG**: sube facturas, extractos bancarios o presupuestos (.txt/.md/.pdf) y pregunta sobre su contenido.
- **💎 UI Liquid Glass**: tema oscuro con paneles de cristal, fondos aurora y animaciones.
- **📱 Responsive**: navegación móvil inferior + vista desktop con sidebar.

## 🛠 Tech Stack

| Capa | Tecnología |
|---|---|
| Frontend | Nuxt 4, Vue 3, Nuxt UI v4, Tailwind CSS v4, Chart.js |
| Backend | Nitro (Nuxt server), H3, SSE streaming |
| AI Orchestration | LangGraph (StateGraph) |
| Modelos | Google Gemini `gemini-3.6-flash` + `gemini-embedding-001` |
| Base de datos | SQLite local (better-sqlite3) · **Cloudflare D1** en producción |

## 🚀 Setup local

```bash
npm install
# crear .env con: GEMINI_API_KEY=tu_key
npm run dev   # http://localhost:3000
```

> En Windows con caracteres corruptos en logs: `chcp 65001` antes de arrancar.

## ☁️ Deploy a Cloudflare Workers

```bash
npm run build:cf      # build con preset cloudflare_module + driver D1
npx wrangler d1 create control-finanzas-db   # crear la DB (una vez)
npx wrangler d1 migrations apply control-finanzas-db --remote
npx wrangler secret put GEMINI_API_KEY       # guardar la API key
npx wrangler deploy                          # desplegar
```

## 🗂 Estructura

```
app/          # Frontend: páginas, componentes, composables
server/
  agents/     # LangGraph: supervisor, strategy-planner, planner, data-agent, RAG, judge, retro
  api/        # Rutas Nitro (chat SSE, movimientos, cuotas, resumen, dashboard)
  db/         # Drizzle schema + conexión SQLite/D1
shared/       # Tipos TypeScript cross-layer
migrations/   # Migraciones D1
```

## 🔖 Convenciones

- IDs: `R-XXXX` (cuenta), `S-XXXX` (período), `T-XXXX` (movimiento), `U-XXXX` (cuota).
- El asistente se dirige al usuario como **Fede** y muestra fecha/hora de Costa Rica.
