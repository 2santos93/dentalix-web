# DX344 · corrección de revisión, ronda 1

La confirmación anterior sobrevivía a respuestas diferentes y reaparecía al volver el mismo conjunto. Ahora se invalida al resolver un conjunto bloqueante distinto o vacío, y al resolver la ausencia de medicamentos. Durante el debounce, carga o error se conserva; un recheck idéntico mantiene confirmación, motivo, controles y foco. La emisión sigue bloqueada mientras la comprobación está pendiente.

TDD: las dos nuevas regresiones A→B→A y A→vacío→A fallaron antes del cambio porque la casilla seguía marcada; después pasan. El test existente comprueba conservación, foco y bloqueo pendiente. No hay cambios en API, reglas clínicas ni impresión.

Verificación posterior al fix: modal 24/24; suite acotada 7 suites / 48 pruebas; TypeScript, lint y build exit 0; Playwright real Chromium 1 passed (5,7 s), con axe en 390/1440 claro/oscuro. Los 46 Jest y la ejecución browser descritos en task-4-report son anteriores al fix. La ejecución posterior usa API QA e4068c56, DB dx344_20261027_test sobre PG compartido :55521, API :3218 y web :3148; los servicios propios fueron detenidos, sin parar PG ni resetear otras bases. Solo Chromium, sin lector de pantalla manual. Capturas anteriores restauradas tras el rerun; no se versionan datos privados.
