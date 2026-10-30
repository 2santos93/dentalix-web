# Copias de referencia de la API (DX-350, DX-312, DX-329)

Cinco ficheros JSON de la web son copias byte a byte de ficheros que posee la
API. La fuente es siempre la API; no se editan aquí.

| Copia en la web | Fuente en la API |
|---|---|
| `src/lib/money/iso4217-zero-decimal.json` | `prisma/reference/iso4217-zero-decimal.json` |
| `src/lib/locations/iana-zone-names.json` | `prisma/reference/iana-zone-names.json` |
| `src/lib/format/regional-format.cases.json` | `src/shared/format/regional-format.cases.json` |
| `src/lib/locations/iso3166-countries.json` | `prisma/reference/iso3166-countries.json` |
| `src/lib/locations/phone-regions-list.json` | `prisma/reference/phone-regions-list.json` |

`scripts/check-api-reference-sync.mjs` los compara (`scripts/e2e-ci.sh sync`,
paso «Referencias compartidas con la API» de `.github/workflows/e2e.yml`) y la
E2E falla si divergen. Para actualizar: cambia la API y copia el fichero aquí.

Licencias de la lista de países (`iso3166-countries.json`): los códigos salen de
`country-state-city` (GPL-3.0); son hechos de la norma ISO 3166-1 y no se copia
código del paquete. Los nombres son de CLDR (Unicode License v3).

Licencias de la lista de regiones de numeración (`phone-regions-list.json`): las
regiones y los indicativos salen de `libphonenumber-js` (MIT), sobre los
metadatos de libphonenumber (Apache-2.0). Los nombres son de CLDR (Unicode
License v3). La web no instala la librería: solo usa esta copia para elegir y
nombrar la región.
