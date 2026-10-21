# Control Finanzas — recapitulación y continuidad

**Corte: 20 de octubre de 2026, Costa Rica.** Esta es la entrada de estado actual; los documentos 01–21 conservan el historial de cada incremento. Sus cifras, instrucciones de hosting y pendientes corresponden a su fecha y no reemplazan este corte.

## 1. Objetivo y alcance acordado

Controlar las finanzas de Fede desde la web, conservar las capturas de Android y separar estrictamente los datos de cada usuario. La plantilla inicial de Rocks/Sprints/Tasks evolucionó a cuentas/objetivos, períodos, movimientos y cuotas, manteniendo contratos de IDs y fechas donde corresponde.

**La primera versión prioriza finanzas, no Gemini.** Fede indicó dejar Gemini fuera de esta versión: no invertir ahora en latencia ni exigir aceptación de modelos para una entrega solo financiera. Esto NO significa que la IA esté desactivada: páginas, rutas y dependencias siguen presentes. Su exclusión efectiva es una tarea de lanzamiento pendiente. PDFs/RAG siguen sin decisión de inclusión o exclusión; no asumir que Fede ya autorizó retirarlos.

No hay autorización para fusionar `main`, lanzar producción, habilitar facturación, migrar registros reales o aceptar riesgos de seguridad. La rama de preparación y sus previews sí fueron autorizadas.

## 2. Ubicación y versiones de trabajo

- Raíz actual: `C:\Users\Fede\Desktop\Proyectos\WEB DE CONTROL DE FINANZAS`.
- Repositorio Git: `base-agent/`; la carpeta padre no es un repositorio.
- Repositorio remoto: https://github.com/federinho21/control-finanzas.
- Rama: `prepare/firebase-netlify`. HEAD local y cabecera remota de la PR consultados: `3d8b36f92f68a5079302e16c7c62006c641cafc1`.
- [PR #1](https://github.com/federinho21/control-finanzas/pull/1): abierta, en borrador, destino `main`, estado de fusión `BLOCKED`, verificado de nuevo en este corte.
- Preview autorizado: https://deploy-preview-1--control-finazas.netlify.app. No se comprobó su versión activa ni su disponibilidad en esta recapitulación.
- Firebase existente: `wallet-payment-tracker-fede`. No crear otro proyecto ni cambiar el propietario de registros para resolver problemas de acceso.
- `finanzas.html` y la documentación de Rocks/Sprints/SQLite son referencias de origen, no la arquitectura desplegable actual.

## 3. Arquitectura actual

| Capa | Implementación |
| --- | --- |
| Web | Nuxt 4, Vue 3, Nuxt UI v4, Tailwind v4 y Chart.js |
| Servidor | Nitro/H3 sobre Node; Netlify Functions, no Edge/Deno ni sitio estático puro |
| Identidad | Firebase Authentication, Google y cookie de sesión verificada por Firebase Admin |
| Persistencia financiera | Firestore con repositorios aislados por UID; SQLite/D1 se conservan como legado, no como fallback de APIs privadas |
| Escrituras | Las APIs financieras entran por `runFinanceOperation` en `data-agent.ts`; los repositorios realizan las transacciones y verifican propiedad |
| IA existente | LangGraph, clasificación/chat `gemini-3.1-flash-lite`, embeddings `gemini-embedding-001`; no prioritaria para esta versión |
| Documentos existentes | Metadatos/chunks privados en Firestore y objetos en Storage; hosting privado definitivo y aceptación real pendientes |

La identidad viene de la sesión verificada, **nunca** del `userId` enviado por el navegador ni de `sessionId`. Firebase Admin puede omitir las reglas de Firestore: la comprobación de propietario en los repositorios sigue siendo indispensable.

## 4. Qué tenemos implementado

### Finanzas y conservación de Android

- Dashboard, resumen mensual, movimientos y cuotas sobre Firestore, con validación de entradas y respuestas privadas sin caché.
- Importes en unidades menores enteras; fechas y límites mensuales de Costa Rica. Los reportes actuales agregan CRC: registros inválidos o de otras monedas se conservan y se informa su exclusión, sin conversión inventada.
- Lectura de las capturas existentes en `payments/{id}`, filtradas por el UID autenticado. Las escrituras web van a `users/{uid}/...`.
- Borrar una captura importada desde la web crea un marcador de ocultación para ese propietario; no borra la fuente de Android. Los pagos históricos de cuotas tampoco se borran al eliminar una cuota.
- Google se vinculó al UID anónimo original de Android. Fede aceptó en preview login, visibilidad de movimientos originales, totales/dashboard y flujos manuales básicos. Falta comprobar una captura nueva de Android.

### Autenticación y aislamiento

- Cookie HttpOnly, protección de Origin/CSRF en mutaciones, validación de sesión y errores genéricos.
- Restablecimiento de estado privado al cambiar de usuario o cerrar sesión, también entre pestañas; límites de cuerpo y validación estricta de IDs/campos.
- Tests de aislamiento A/B, IDOR, reglas, rechazo de propietarios falsificados y operaciones no autenticadas. Son evidencia automatizada, no sustituyen aceptación real con dos usuarios.

### Integridad y reintentos

- Creación/pago y sus anclajes se confirman mediante transacciones; pruebas de concurrencia, rollback y replay.
- Creaciones manuales admiten `Idempotency-Key` UUID opcional. Mismo propietario, operación, clave y datos canónicos devuelven el ID original; cambios de datos con la misma clave fallan con 409.
- La clave de los formularios se conserva solo mientras están montados y sin cambios. Recargar, salir o editar después de una respuesta ambigua puede representar un nuevo envío. Clientes sin clave no tienen esa protección. Los recibos no tienen TTL automático.
- Los formularios respetan la sección ingreso/gasto/retiro, permiten selección explícita y conservan los datos ante errores.

### IA y documentos conservados

- Agentes, consultas financieras determinísticas, SSE ordenado con un único `done`, aprobaciones durables vinculadas a propietario/sesión y confirmación/cancelación de movimientos están implementados.
- Ingesta privada, validación de archivos, ciclo de vida y aislamiento RAG tienen pruebas con embeddings/adaptadores sintéticos. **No** hay aceptación completa real de PDF/Storage/RAG.
- Despriorizar Gemini no borra estos datos, no permite abrir endpoints inseguros y no exime de revisar las dependencias que todavía se empaquetan.

### Publicación y controles

- Preview en Netlify, credencial dedicada a preview, dominios e índices específicos configurados en incrementos previos. No equivalen a configuración ni aprobación de producción.
- GitHub Actions ejecuta instalación congelada sin scripts de dependencias, chequeos de tipos, tests, emulador verificado, navegador y compilaciones Node/Netlify. Sin secretos de producción ni paso de despliegue.
- `main` exige `verify` y `dependency-audit` de GitHub Actions (App ID 15368), rama actualizada y cumplimiento también para administradores. Se consultó nuevamente la configuración; no se modificó.
- El último [run remoto verificado](https://github.com/federinho21/control-finanzas/actions/runs/38998389108), sobre `3d8b36f`, tiene `verify=success` y `dependency-audit=failure`. Su auditoría es histórica, no una medición del inventario local de hoy.

## 5. Cambio local pendiente: gRPC

Antes de la recapitulación ya había cuatro archivos modificados, que se preservaron:

| Archivo | Trabajo pendiente de commit/publicación |
| --- | --- |
| `package.json` | Override acotado: `@firebase/firestore` usa `@grpc/grpc-js` 1.14.6 |
| `package-lock.json` | Resolución generada por npm; elimina la copia vulnerable 1.9.16 y una copia deduplicada de Unhead |
| `tests/dependency-security.test.ts` | Piso de versión y regresión de fuga de errores de servidor gRPC |
| `tests/finance.integration.test.ts` | Compatibilidad del SDK Node de Firebase: lecturas, escrituras, consultas, suscripciones, transacciones y rechazos de acceso ajeno |

El override sigue dentro de la versión mayor 1 de gRPC, pero está **fuera del `~1.9.0` declarado por ese componente de Firebase**. No presentarlo como una actualización respaldada explícitamente por Firebase. Se conservó tras reproducir la fuga con la versión vieja y validar la corregida y la compatibilidad con el emulador. Revisarlo en cada actualización de Firebase y retirarlo cuando el SDK ya resuelva una versión segura. El comportamiento real de producción no se ha validado para este cambio.

Antes del traslado de carpeta pasaron instalación congelada sin scripts, firmas de registro, tipos, suites locales, builds Node/Netlify y navegador con este cambio. Después del traslado se verificaron nuevamente **12 pruebas de dependencias, 5 de política CI, 36 de integración con emulador y los tres chequeos de tipos**. `npm ls @grpc/grpc-js --all` confirma 1.14.6 en las ramas Firebase/Admin. No se repitieron hoy los builds/navegador ni una nueva instalación congelada. No hay CI remoto todavía sobre este parche no confirmado.

## 6. Auditoría actual y trabajo prioritario

**Auditoría nueva, 20/10/2026:** `npm audit --omit=dev --json` → **18 avisos: 0 críticos, 14 altos, 3 moderados y 1 bajo**. Terminó con código 1 por los avisos, no por un fallo de descarga. Evidencia: `C:\Users\Fede\AppData\Local\Temp\opencode\finanzas-recap-20261020-audit.json`.

La cifra anterior de **15/11 altos** era válida para el análisis anterior del parche gRPC; aparecieron nuevos avisos para el mismo inventario. Los 18 avisos incluyen propagación por dependencias y no representan 18 vulnerabilidades independientes. Que las pruebas pasen no significa que la auditoría esté resuelta.

| Orden | Causa y situación | Próxima acción / condición de cierre |
| --- | --- | --- |
| 0 | Parche gRPC local, sin commit | Revisar y guardar por separado el cambio existente; publicar solo preparación y obtener CI sobre ese SHA. No mezclarlo con otras actualizaciones. |
| 1 | `markdown-it` 14.3.2, **alto**. Nuevos avisos de denegación de servicio por HTML y referencias multilínea. Se usa en `ChatMessage.vue` con `html:false`; eso mitiga la rama HTML, no prueba que la otra quede mitigada. | Revisar y probar **14.3.3**, que existe en el registro y es la corrección publicada dentro de major 14. Añadir regresión acotada para referencias y mantener escape de HTML/enlaces. No subir a 15 solo porque sea latest. |
| 2 | `launch-editor` 2.14.1 y Vite 8.2.0, **altos**. Nuevos avisos Windows: expansión `%`, interpretación de flags y comprobación de existencia. Las pruebas previas de shell-quote no cubren estas causas nuevas. | Revisar parche `launch-editor` 2.14.2 y la rama corregida Vite **8.2.4** frente al rango del padre. No ejecutar payloads ni abrir el editor durante pruebas; usar regresiones inertes/interceptadas. Verificar servidor de desarrollo y artefacto final. |
| 3 | `braces` 3.0.3 y `node-forge` 1.4.0, **altos**, aún sin versión corregida publicada al consultar el registro | Rastrear cada cadena/build y el código empaquetado, buscar eliminación/reemplazo soportado en los padres y documentar límites. La ausencia en el manifiesto Netlify no demuestra ausencia en paquetes anidados o código inline. No simular una corrección ni aprobar una excepción. |
| 4 | `uuid` 10 anidado, **moderado**, en LangGraph/checkpoint | Evaluar actualización soportada o exclusión efectiva de IA para este lanzamiento. No hacer override de major sin pruebas. No exige llamadas a Gemini. |
| 5 | `esbuild` 0.27.7, **bajo**, servidor de desarrollo Windows | Actualizar mediante padre compatible a una versión corregida; revisar 0.28.2 disponible. No exponer servidores de desarrollo como producción. |

Referencias nuevas: [Markdown HTML](https://github.com/advisories/GHSA-vfgh-jcmw-g37q), [Markdown referencias](https://github.com/advisories/GHSA-gfr2-rv44-r23c), [launch-editor/Vite](https://github.com/advisories/GHSA-698v-4r3x-3vcv), [flags](https://github.com/advisories/GHSA-r825-w8mm-5pxw), [existencia Windows](https://github.com/advisories/GHSA-587h-7wmj-h5pm). Metadatos oficiales de npm y las versiones corregidas publicadas se consultaron para preparar el plan; **no se instalaron esos parches en esta recapitulación**.

## 7. Condiciones que faltan para producción

1. Cerrar los avisos importantes, completar revisión de alcance real y pasar los controles obligatorios, sin bajar umbrales ni omitir pruebas.
2. Excluir efectivamente IA de esta versión, sin borrar datos ni romper contratos de finanzas. Decidir con Fede si PDFs/RAG se excluyen también; si entran, resolver Storage privado y aceptación real.
3. Aceptación real con dos usuarios y una nueva captura Android; verificar totales, creación, reintentos, eliminación y cambios de sesión. No usar registros reales para pruebas automatizadas.
4. Revisar credenciales y mínimo privilegio de producción, origen/dominio, reglas, índices y límites. Los permisos IAM de Firestore son amplios; no delegar aislamiento a ellos.
5. Cerrar controles operativos: límites distribuidos de autenticación/API general (los actuales son por instancia), cuotas/costes, logs/alertas sin datos sensibles y evidencia de runtime/rollback.
6. Comprobar backup y restauración, conservación/exportación y retención. Decidir si hay histórico SQLite/D1 que realmente deba migrarse, sin duplicar capturas Android. No migrar implícitamente.
7. Obtener aprobación explícita para fusionar y lanzar, después de los controles. Volver a una revisión anterior no revierte por sí solo las escrituras nuevas; la reversión de datos requiere reconciliación.

Límites vigentes que hay que comunicar: reportes acotados a 5.000 registros, no historial ilimitado; recibos de reintento sin expiración; cuotas compartidas de chat/upload no resuelven los límites generales por instancia; RAG no representa búsqueda exhaustiva a gran escala.

## 8. Guía de reanudación

Trabajar desde `base-agent/`, no desde la raíz padre. Leer primero este documento y revisar `git status --short`/`git diff`: no descartar los cuatro archivos pendientes. Auditar otra vez al comenzar la próxima corrección: el registro de avisos cambia incluso sin tocar el lockfile.

Para cada slice: prueba roja o reproducción segura → cambio mínimo y revisión del lockfile → prueba focalizada → tipos/suites afectadas → build/compatibilidad cuando corresponda → auditoría nativa → commit atómico → solo rama de preparación → evidencia del SHA exacto en GitHub. Una auditoría en rojo sigue siendo un bloqueo aunque `verify` esté verde.

```powershell
npm run test:security:dependencies
npm run test:ci
npm run typecheck:auth
npm run typecheck:finance
npm run typecheck:auth:web
npm run test:finance
```

Antes de dar por verificado el próximo parche de dependencias, completar también las suites existentes de auth, web, modelo, migración, chat y adaptador; `build:test` + smoke/navegador; `build:netlify` + smoke compilado. Revisar firmas y una instalación congelada con scripts desactivados. Usar `npm run postinstall -- --dotenv tests/fixtures/build.env` para preparar explícitamente Nuxt cuando haga falta; no habilitar scripts globalmente. No usar `npm audit fix --force`, los scripts legacy Cloudflare, despliegues genéricos Firebase ni secretos en consola/Git.

## 9. Mapa del historial

- Identidad, Android y web: [01](01-backend-auth.md), [02](02-android-google-link.md), [03](03-web-google-auth.md).
- Finanzas, agentes, documentos y migración: [04](04-firestore-finance-api.md), [05](05-private-agents.md), [06](06-private-documents.md), [07](07-migration-app-hosting.md).
- Dependencias anteriores: [08](08-dependency-security.md), [09](09-shell-quote-security.md), [15](15-devtools-nanoid-security.md), [16](16-runtime-dependency-security.md), [21](21-dependency-triage-finance-release.md).
- Infraestructura y publicación: [10](10-firebase-readiness.md), [11](11-netlify-hosting.md), [12](12-preparation-branch.md), [19](19-ci-quality-gates.md), [20](20-main-branch-protection.md).
- Experiencia y corrección financiera: [13](13-chat-answer-quality.md), [14](14-conversational-movements.md), [17](17-manual-form-safety.md), [18](18-manual-create-idempotency.md).

Este corte actualiza documentación y contexto de reanudación, **no** es aprobación de producción ni publicación de los cambios locales.
