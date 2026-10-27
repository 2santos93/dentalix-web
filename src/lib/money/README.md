# Copias de referencia de la API (DX-350)

Tres ficheros JSON de la web son copias byte a byte de ficheros que posee la
API. La fuente es siempre la API; no se editan aquí.

| Copia en la web | Fuente en la API |
|---|---|
| `src/lib/money/iso4217-zero-decimal.json` | `prisma/reference/iso4217-zero-decimal.json` |
| `src/lib/locations/iana-zone-names.json` | `prisma/reference/iana-zone-names.json` |
| `src/lib/format/regional-format.cases.json` | `src/shared/format/regional-format.cases.json` |

`scripts/check-api-reference-sync.mjs` los compara (`scripts/e2e-ci.sh sync`,
paso «Referencias compartidas con la API» de `.github/workflows/e2e.yml`) y la
E2E falla si divergen. Para actualizar: cambia la API y copia el fichero aquí.
