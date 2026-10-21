# Búsqueda de comercios para FK Trace

Endpoint nuevo: `POST /api/mobile/merchant-search`, exclusivo para Firebase ID tokens (`Authorization: Bearer ...`), verificados con revocación por Firebase Admin. No usa cookies ni toma el UID del body; la excepción del middleware no permite otros métodos/rutas. JSON estricto `{query: string}` de 3–120 caracteres, límite de cuerpo de 1 KiB. No acepta ni transmite importes, notas o datos de gastos.

## Activación y alcance

- Despliegue **Node** con la configuración Firebase Admin del mismo proyecto/identidad de Android. El adaptador Cloudflare no sirve para Firebase Admin.
- `LOGO_DEV_SECRET_KEY` verificada contra Logo.dev y configurada como secreto en Netlify el 21-10-2026, **solo** para la rama de confianza `prepare/firebase-netlify`, scopes `builds/functions/runtime`; lectura de metadatos confirma el contexto exacto y `is_secret=true`. No se imprimió ni se guardó en Git. Nunca `NUXT_PUBLIC_*` ni APK. Sin secreto responde `disabled`, sin petición al proveedor ni consumo de cuota.
- Android ya tiene la URL HTTPS exacta `https://deploy-preview-1--control-finazas.netlify.app/api/mobile/merchant-search` y su clave **publicable** `pk_...`; ver `MERCHANTS.md` en `C:\Users\Fede\WalletPaymentTracker` para datos, imágenes, configuración y pruebas.
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
- Proveedor verificado con búsquedas reales vía MCP, clave secreta local y finalmente **SDK nativo Android contra el endpoint desplegado**, sin datos de gastos. El test opt-in `MerchantLiveSearchTest` verificó sesión existente sin cambio de UID, sugerencias válidas y carga/decodificación del PNG del proveedor; no persistió gastos ni comercios. Tras las pruebas se reabrió la app y se confirmó el listener activo.

Publicación autorizada y verificada: código de API `43c21f1`, despliegue `6ad91081ad98b9a0672d6b11` en PR 1, `ready`, contexto `deploy-preview`, `published_at=null`. `/login` público devuelve 200 e incluye atribución; POST sin sesión devuelve 401 y `Cache-Control: no-store`. La aceptación nativa autenticada confirma la propagación efectiva del secreto. No se fusionó `main` ni se publicó producción; `main` sigue en `f9eae2d7a79f6759e327e990d0894d81de739b7f`. La cuenta de servicio Firebase y sus permisos existentes se reutilizaron sin cambios. Los cambios del lector permanecen locales y fuera de esta publicación.

Al añadir la cuota al CI, convertir el paso financiero en un bloque hizo fallar su comprobación de orden. Se mantuvo el paso original y se añadió otro independiente; la prueba de política ahora exige también que la cuota se ejecute después de verificar el emulador. Los 5 tests de política pasan sin eliminar aserciones ni relajar la auditoría. La deuda de dependencias de la web conserva su gate separado; esta vista previa no es una aprobación de producción.

Rollback del proveedor: retirar únicamente el valor de `LOGO_DEV_SECRET_KEY` de esa rama y reconstruir su vista previa. La app mantiene catálogo, logos manuales e iniciales; no se borran comercios ni gastos. No restaurar un despliegue sobre la URL de producción como atajo para revertir una vista previa.
