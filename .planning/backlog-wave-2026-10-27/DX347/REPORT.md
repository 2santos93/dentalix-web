# DX347 · Barra lateral con scrollbar clásico

Base `a02b70df36e5b57e7a018f50c337118230d0690b`. El carril colapsado reduce su padding horizontal a 2 px, conserva la barra visible y da 44 px útiles al enlace con una barra clásica de 15 px. Se añade margen de scroll para mantener el foco visible y se colocan los contadores dentro del área útil. El enlace expandido mantiene una altura mínima de 40 px. El contador de anamnesis usa texto `ink` para corregir el contraste detectado por axe en claro.

## Verificación

- `scripts/e2e-ci.sh all e2e/settings-index.spec.ts`, build de producción: 11/11, 0 saltados, 0 flaky. API y DB aisladas de QA; Chromium macOS, barra clásica simulada con CSS de 15 px, no Windows nativo.
- `npx tsc --noEmit` y `npx eslint src/components/layouts/app-shell.tsx e2e/settings-index.spec.ts`: exit 0. Build de producción exit 0. Suite Jest previa: 346 suites / 3135 tests, exit 0; el cambio posterior de producto se limita al color del contador.
- Axe del sidebar expandido y colapsado, barra nativa y clásica, claro y oscuro: cero violaciones, sin excluir el contador. Ajustes y menú a 390/1440 en ambos temas también pasan axe y teclado.
- Barra clásica, carril: ancho exterior 64 px, scrollbar 15 px, enlace x=2..46 (44 px), foco con contorno de 1 px y offset 1 px dentro de nav x=0..48; badge x=19.016..46, y=427..443. Último enlace y=607..647, nav y=64..655, scrollTop=37, scroll del documento=0. En expandido: enlace x=12..212, badge x=176.406..200, scrollTop=67, documento=0. Claro y oscuro comparten geometría.
- Se midieron `auto`, `stable` y `thin`: stable conserva barra de 15 px; thin en esta simulación produce una barra overlay de 0 px, por lo que no acredita conservar espacio con una barra clásica. No se cambian preferencias del sistema.

## Historial y límites

Las pruebas iniciales detectaron pérdida de anchura y recorte del foco/badge antes del ajuste. Un intento final falló en dos casos porque la aserción esperaba exactamente una incidencia histórica de contraste ya corregida; su log y trazas se conservaron en `/tmp/dx347-failure-preserved-20261027`. Se sustituyó por una exigencia de cero incidencias, sin exclusiones, y se repitió la suite completa. Las capturas y logs de QA están conservados fuera del repositorio en `/tmp/dx347-evidence-20261027`; las mediciones JSON finales están junto a este informe. No se han probado barras nativas de Windows/Linux.
