# Búsqueda de comercios para FK Trace

Endpoint nuevo: `POST /api/mobile/merchant-search`, exclusivo para Firebase ID tokens (`Authorization: Bearer ...`), verificados con revocación por Firebase Admin. No usa cookies ni toma el UID del body; la excepción del middleware no permite otros métodos/rutas. JSON estricto `{query: string}` de 3–120 caracteres, límite de cuerpo de 1 KiB. No acepta ni transmite importes, notas o datos de gastos.

## Activación pendiente

- Despliegue **Node** con la configuración Firebase Admin del mismo proyecto/identidad de Android. El adaptador Cloudflare no sirve para Firebase Admin.
- `LOGO_DEV_SECRET_KEY` verificada contra Logo.dev y configurada como secreto en Netlify el 21-10-2026, **solo** para la rama de confianza `prepare/firebase-netlify`, scopes `builds/functions/runtime`; lectura de metadatos confirma el contexto exacto y `is_secret=true`. No se imprimió ni se guardó en Git. Nunca `NUXT_PUBLIC_*` ni APK. Sin secreto responde `disabled`, sin petición al proveedor ni consumo de cuota.
- Android necesita la URL HTTPS exacta `/api/mobile/merchant-search` y su clave **publicable** `pk_...`; ver `MERCHANTS.md` en `C:\Users\Fede\WalletPaymentTracker` para datos, imágenes, configuración y pruebas.
- Las reglas nuevas de catálogo/logos se publicaron con autorización desde Android el 21-10-2026, solo `firestore:rules` en `wallet-payment-tracker-fede`, y se releían correctamente tras el despliegue. **No desplegar las reglas web completas para activar este endpoint**: contienen otro contrato de pagos y deniegan las nuevas rutas privadas del catálogo. Este endpoint usa Admin, no necesita abrir permisos de cuotas a los clientes.
- En Community comercial: publicar el enlace `Logos provided by Logo.dev` añadido a `/login`, y registrar/verificar esa URL pública en el dashboard de Logo.dev. Personal y planes pagados no lo exigen.

## Proveedor y límites

`GET https://api.logo.dev/v2/search?q=...&method=typeahead&limit=5` con secreto Bearer; timeout de 4 segundos, sin redirecciones, JSON máximo 64 KiB. Se validan nombres/dominios y se descartan URLs de imágenes arbitrarias; Android construye únicamente URLs del CDN oficial. No hay asignación del primer resultado.

Metadatos reutilizados 15 minutos en memoria y aislados por usuario (256 entradas máximo); HTTP siempre `no-store`. Cuotas atómicas en Firestore: 20/min por usuario en `users/{uid}/internal/logoSearchLimit` y 100/min para esta integración en `systemLogoDev/search`. También hay bloqueo compartido temporal ante 429/401/402 del proveedor. No se registra el nombre consultado ni el secreto. Las cuotas mensuales/CDN, los créditos de búsqueda y el uso de otras apps de la cuenta siguen sujetos al plan de Logo.dev; revisar el dashboard antes de activar.

Documentación vigente consultada: [búsqueda v2](https://www.logo.dev/docs/api-reference/search/search-brands), [claves](https://www.logo.dev/docs/platform/api-keys), [límites](https://www.logo.dev/docs/platform/rate-limits), [caché](https://www.logo.dev/docs/platform/caching), [self-hosting](https://www.logo.dev/docs/platform/self-hosting), [atribución](https://www.logo.dev/docs/platform/attribution).

## Verificación local

- `npm run test:merchants`: 4 pruebas, sin claves ni peticiones reales; prioridad de configuración desactivada, candidatos ambiguos conservados, caché aislada, errores/cuota, tokens falsos, cookies insuficientes y campos de gastos rechazados.
- `npm run typecheck:finance`: correcto.
- `npm run build:test` y `npm run test:merchants:build`: correctos; endpoint compilado rechaza acceso anónimo/con cookies, `/login` público contiene la atribución.
- `npm run test:merchants:quota`: prueba de cuota concurrente de usuario/cuenta y bloqueo compartido, con datos sintéticos en un emulador independiente (Java 21+). Se separa de las regresiones del lector para publicar únicamente la integración de logos. Las pruebas de comerciantes, cuota y smoke compilado se añadieron al CI sin debilitar otros controles.
- Proveedor verificado con una búsqueda real de prueba vía MCP OAuth y otra mediante la clave secreta local (sin datos de gastos); clave publicable configurada en el APK Android. La clave secreta ya está guardada en el entorno privado de la rama: su propagación efectiva requiere publicar/reconstruir y verificar el endpoint. Las reglas de catálogo Android ya están publicadas; el endpoint/atribución están pendientes de esa verificación.

Preparación de publicación autorizada: usar PR 1 y su hostname `deploy-preview-1--control-finazas.netlify.app`, sin fusionar `main` ni publicar producción. La cuenta de servicio Firebase existente y sus permisos se reutilizan sin cambios; no se genera otra clave. Los cambios del lector FK Trace permanecen locales y fuera de esta publicación.

Rollback del proveedor: retirar únicamente el valor de `LOGO_DEV_SECRET_KEY` de esa rama y reconstruir su vista previa. La app mantiene catálogo, logos manuales e iniciales; no se borran comercios ni gastos. No restaurar un despliegue sobre la URL de producción como atajo para revertir una vista previa.
