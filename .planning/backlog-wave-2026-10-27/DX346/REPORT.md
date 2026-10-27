# DX346 — Badge de éxito accesible

## Resultado

El Badge `success` conserva el relleno `bg-success/15` y utiliza un nuevo token semántico `--color-success-text`: `#166534` en claro y el mismo `#4ADE80` anterior en oscuro. El fondo, el primario personalizado del tenant, las otras variantes, las etiquetas y las reglas de negocio permanecen intactos. El documento imprimible de caja restablece también el nuevo token a claro para evitar heredar el texto del tema oscuro.

Base web: `5f5eade5a111d1a921730d1ebeb22c5af40c9aaf`. Rama: `loop/DX-346-contrast-20261027`. Freeze: el commit que contiene este informe; consultar `git rev-parse HEAD` (SHA exacto también en task-1-report.md de la coordinación). Sin push ni cambios en ClickUp por el autor.

## Diff

- `src/styles/tokens.css`: token de texto separado del color de éxito usado como relleno.
- `src/app/globals.css`: exposición a Tailwind v4 y restablecimiento en el informe de caja en papel.
- `src/components/ui/badge.tsx`: la variante success usa el nuevo texto.
- `e2e/payment-allocations.spec.ts`: se elimina success de la exclusión histórica de contraste; warning/danger se conservan documentados.
- `e2e/success-badge-contrast.spec.ts`: clínica propia creada por UI/API reales, turno abierto, ítem realizado y abono que lo cubre. QA de caja/plan/estado de cuenta abierto en «Ver por ítem» en 390 y 1440 px, claro/oscuro. Sin comprobaciones que solo repliquen clases.

## RED → GREEN

Antes de editar producción, la nueva E2E terminó roja por contraste de Abierta/Realizado/Efectivo en claro. La primera iteración del arnés encontró además una animación de carga infinita al intentar terminar animaciones; se limitó la terminación a las finitas y se repitió RED completo con 24 mediciones. Evidencia válida completa en `before/` y `checks/red.log`.

La medición lee `getComputedStyle` del navegador (incluido `color-mix` generado por Tailwind), convierte cada capa a sRGB mediante canvas y compone alfa sobre todos los ancestros antes de calcular luminancia WCAG. Guarda CSS original, capas, RGB resultante y ratio. Rechaza opacidades de grupo o fondos con imágenes para no dar una cifra falsa. La cuantización de canvas puede diferir unas centésimas del cálculo interno de axe; ambos verifican las mismas superficies reales.

| Texto / superficie | Claro RED | Claro GREEN | Oscuro RED / GREEN |
|---|---:|---:|---:|
| Abierta · Turnos de caja | 4,095:1 | 5,822:1 | 7,134:1 |
| Realizado · Plan y estado de cuenta | 4,095:1 | 5,822:1 | 7,134:1 |
| Efectivo · Movimientos del estado de cuenta | 4,095:1 | 5,822:1 | 7,134:1 |
| Cubierto · Plan y Ver por ítem | 4,512:1 | 4,512:1 | 7,351:1 |

Mismos valores a 390 y 1440 px. «Cubierto» usa Badge muted; cumplía AA y no se modifica. CSS claro de éxito pasa de `rgb(21,128,61)` a `rgb(22,101,52)` sobre el mismo fondo compuesto aproximado `#dcece2`. Los JSON conservan cifras sin redondear.

GREEN primero en dev (1 E2E), después en build de producción. `after/` contiene 12 capturas y 12 informes axe sin infracciones, más 24 mediciones. `dx051/` contiene otros 24 informes axe sin infracciones: plan, Ver por ítem y modal de imputación normal/400/409/sin tasa, para cada tamaño y tema. Se inspeccionaron capturas móvil de caja y escritorio del estado de cuenta; jerarquía y presentación conservadas. Sin scroll horizontal en la matriz nueva.

## Verificación

Todos los comandos terminaron con código 0 salvo RED intencionado:

- `npx tsc --noEmit`.
- `npm run lint`.
- `npm test -- --runInBand src/components/cash-sessions src/components/account-statement src/components/treatment-plans/item-paid-cell.test.tsx src/lib/payments/payment-allocations-api.test.ts src/components/payments/use-payment-allocations.test.ts`: 20 suites, 123 tests.
- `npm test -- --runInBand src/lib/branding.test.ts`: 1 suite, 4 tests.
- `scripts/e2e-ci.sh web`: Next 16.4.2 build y start correctos con API propia. Compilación, TypeScript y rutas terminadas.
- `scripts/e2e-ci.sh test e2e/success-badge-contrast.spec.ts e2e/cash-shifts.spec.ts e2e/payment-allocations.spec.ts`: 9/9 E2E, sin saltos ni fallos y guardia CSP activa. Incluye 409/403 de caja, cierres/arqueo/informe PDF A4, reapertura/ajuste ADMIN, imputación manual/automática/anulación y recepción.
- `git diff --check`.

Entorno para reproducir scripts: `API_DIR=../dentalix-api-wave20261027-webqa PG_PORT=55521 E2E_DB_NAME=dentalix_dx346_20261027 E2E_API_PORT=3216 E2E_WEB_PORT=3146 E2E_NPM_CI=0`. Artefactos seleccionados mediante DX346_QA_DIR / DX051_QA_DIR. npm ci separado en ambos checkouts; no se comparte node_modules.

## Límites y recursos

QA Chromium, no auditoría integral WCAG de toda la aplicación ni ejecución de toda la suite. No se alteran otros contrastes o exclusiones históricas warning/danger. La matriz nueva no encontró infracciones; las exclusiones conservadas tampoco ocultaron nodos de estas 36 auditorías (todos los JSON son arrays vacíos). No se modifica API, esquema, negocio, dependencias ni primario/branding. Los 4 tests existentes de branding pasan; no se varió el primario de la clínica en la matriz visual.

npm ci informó vulnerabilidades heredadas de los locks: web 1 alta; API 3 moderadas y 3 altas. Sin actualizar dependencias fuera de alcance. No se atribuyen al cambio.

Retenidos para revisión: contenedor Docker `dx346-db-20261027` en `127.0.0.1:55521`, BD nueva `dentalix_dx346_20261027`; API checkout `dentalix-api-wave20261027-webqa` base `e4068c56` en :3216; web de esta rama en :3146, modo producción. PID/logs/env privados en `.e2e/`, excluidos de Git. No se tocaron bases/procesos originales, G1, main o demos externas. Solo la demo de la BD nueva recibe las acciones del spec histórico de caja y su guardia de limpieza pasa. No se incluyen tokens, cookies, trazas de autenticación, env ni buzones; las capturas usan datos sintéticos.

## Modern Web Guidance

Se consultó la guía `color`: separé texto y relleno para cumplir «Maintain 4.5:1 for normal text» sin cambiar el fondo tintado existente. La guía Next local `node_modules/next/dist/docs/01-app/01-getting-started/11-css.md` confirma Tailwind v4 y CSS global para tokens. Aplicadas también las pautas de a11y-debugging, Impeccable, depuración sistemática, TDD y verificación antes de completar.
