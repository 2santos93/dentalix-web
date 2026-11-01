# Copias de referencia de la API (DX-350, DX-312, DX-329, DX-340)

Seis ficheros JSON de la web son copias byte a byte de ficheros que posee la
API. La fuente es siempre la API; no se editan aquí.

| Copia en la web | Fuente en la API |
|---|---|
| `src/lib/money/cldr-format-digits-zero.json` | `prisma/reference/cldr-format-digits-zero.json` |
| `src/lib/money/rounding-vectors.json` | `src/shared/money/rounding-vectors.json` |
| `src/lib/locations/iana-zone-names.json` | `prisma/reference/iana-zone-names.json` |
| `src/lib/format/regional-format.cases.json` | `src/shared/format/regional-format.cases.json` |
| `src/lib/locations/iso3166-countries.json` | `prisma/reference/iso3166-countries.json` |
| `src/lib/locations/phone-regions-list.json` | `prisma/reference/phone-regions-list.json` |

`scripts/check-api-reference-sync.mjs` los compara (`scripts/e2e-ci.sh sync`,
paso «Referencias compartidas con la API» de `.github/workflows/e2e.yml`) y la
E2E falla si divergen. Para actualizar: cambia la API y copia el fichero aquí.

Decimales de las monedas (DX-340, README de la API «Redondeo de importes»):

- **Formato** (`cldr-format-digits-zero.json`): dígitos de formato de CLDR 47,
  fijados por versión. Solo para pintar (`formatCurrency`, `moneyWithCode`,
  `regional-format`): una moneda de la lista con importe entero va sin
  decimales. Se queda como copia porque el formato corre sin red (SSR,
  pantallas offline) y no debe depender del `Intl` del host.
- **Redondeo por línea**: NO hay lista en la web. El descuento en bloque usa
  `roundingDigits` de la moneda del plan, que llega en el contrato
  (`GET /treatment-plans/:id` → `currencyDigits`; también `GET /currencies`).
  Helper: `line-rounding.ts`, espejo de `src/shared/money/line-rounding.ts`.
- **Vectores** (`rounding-vectors.json`): los mismos casos que la API (RSD,
  JPY, EUR y COP con 123,45 × 7,5 %, límites del descuento y total de
  líneas); `line-rounding.test.ts` los comprueba aquí.

Licencias de la lista de países (`iso3166-countries.json`): los códigos salen de
`country-state-city` (GPL-3.0); son hechos de la norma ISO 3166-1 y no se copia
código del paquete. Los nombres son de CLDR (Unicode License v3).

Licencias de la lista de regiones de numeración (`phone-regions-list.json`): las
regiones y los indicativos salen de `libphonenumber-js` (MIT), sobre los
metadatos de libphonenumber (Apache-2.0). Los nombres son de CLDR (Unicode
License v3). La web no instala la librería: solo usa esta copia para elegir y
nombrar la región.
