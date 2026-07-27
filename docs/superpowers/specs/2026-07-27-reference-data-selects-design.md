# Selects de datos de referencia: Moneda, País y Ciudad

**Fecha:** 2026-07-27
**Repos:** `dentalix-api` (NestJS + Prisma), `dentalix-web` (Next.js 16)

## Problema

1. **Bug activo (moneda).** El campo "Moneda" del formulario de abono
   (`treatment-plans-tab.tsx`) y el filtro "Moneda" del dashboard son `<input>`
   de texto libre de 3 caracteres. Al escribir un código que no es ISO 4217
   válido, `Intl.NumberFormat(..., { style: 'currency', currency })` lanza
   `RangeError` **durante el render** (se llama en la lista de abonos y en las
   tarjetas de saldo), lo que tumba toda la pestaña. "Apenas lo edito, explota."
2. **Datos sin estructura.** La moneda vive como `String` suelto en
   `TreatmentPlan.currency` y `Payment.currency`. No hay tabla maestra de
   monedas, ni de países, ni de ciudades. El paciente solo tiene `address` de
   texto libre; no hay país ni ciudad.

## Objetivo

Reemplazar entradas de texto libre por selects poblados desde la base de datos:

- **Moneda** → `<select>` mostrando **nombre + símbolo**, valor = código ISO.
- **País** → `<select>`.
- **Ciudad** → combobox con búsqueda, en cascada País → Ciudad.

Y blindar el formateo de moneda para que ningún código inválido (incluidos
datos viejos) vuelva a tumbar el render.

## Decisiones tomadas

- **Fuente de monedas:** nueva tabla `Currency` sembrada para coincidir con las
  monedas que soporta el proveedor de exchange (OpenExchangeRates, base USD) +
  COP. La tabla también actúa como whitelist de validación.
- **País/Ciudad:** viven en el **Paciente**, junto a `address` (no la
  reemplazan). Se agregan `countryCode` + `cityId` (ambos opcionales).
- **Dataset de ciudades:** amplio —
  `dr5hn/countries-states-cities-database` (países + ciudades; su `state_name`
  se guarda como `City.region` informativo).
- **UI de ciudad:** combobox con búsqueda. País es `<select>` nativo; ciudad es
  un input que consulta `GET /cities?countryCode&q` (el dataset amplio hace
  inviable un `<select>` con todas las ciudades de un país).
- **Backend:** un solo módulo DDD `reference` con 3 controllers (currencies,
  countries, cities).
- **Moneda al crear plan:** se agrega `CurrencySelect` a "Nuevo plan"
  (hoy todo plan nace en USD sin opción), para que el flujo de abonos/saldo
  multi-moneda tenga sentido de punta a punta.

## Modelo de datos (Prisma, `dentalix-api`)

Tres tablas de referencia **globales**, con la misma excepción documentada que
`ExchangeRateSnapshot`: sin `tenantId`, sin RLS, sin `deletedAt`.

```prisma
model Currency {
  code   String @id   // ISO 4217, p.ej. "USD"
  name   String       // "Dólar estadounidense"
  symbol String       // "$"
  @@map("currencies")
}

model Country {
  code   String @id   // ISO 3166-1 alpha-2, p.ej. "CO"
  name   String       // "Colombia"
  cities City[]
  @@map("countries")
}

model City {
  id          Int     @id      // id del dataset (seed idempotente y estable)
  countryCode String
  name        String
  region      String?          // estado/departamento (informativo)
  country     Country @relation(fields: [countryCode], references: [code])
  @@index([countryCode, name])
  @@map("cities")
}
```

**Patient** (nuevas columnas, ambas opcionales; `address` se conserva):

```prisma
  countryCode String?
  cityId      Int?
  country     Country? @relation(fields: [countryCode], references: [code])
  city        City?    @relation(fields: [cityId], references: [id])
```

Regla de validación: si viene `cityId`, la ciudad debe existir y su
`countryCode` debe coincidir con el `countryCode` enviado (chequeo en el
use-case de crear/editar paciente). Si viene `cityId` sin `countryCode` → 400.

Migraciones: solo esquema. Los datos entran por el seed (abajo).

## Endpoints (módulo `reference`, prefijo global `api/v1`)

Todos con `JwtAuthGuard` únicamente (datos de referencia globales, sin gating
por tenant/rol — mismo criterio que el módulo `exchange`). Layout DDD del
proyecto: `presentation/` (controllers + DTOs), `application/` (use-cases),
`domain/` (puertos), `infrastructure/` (repos Prisma). Use-cases delgados de
solo lectura.

| Método | Ruta | Respuesta | Notas |
|---|---|---|---|
| GET | `/currencies` | `[{ code, name, symbol }]` | Lista completa (pequeña). |
| GET | `/countries` | `[{ code, name }]` | Lista completa (~200). |
| GET | `/cities?countryCode=CO&q=bog&limit=20` | `[{ id, name, region }]` | `countryCode` obligatorio; `q` filtra por nombre (ILIKE, mín. 1 char); `limit` default 20, máx 50. Orden por nombre. |

DTOs de respuesta anotados con `@ApiProperty` para que aparezcan en el
`schema.d.ts` generado por `openapi-typescript`.

DTOs de paciente: `CreatePatientDto` / `UpdatePatientDto` ganan
`countryCode?: string` y `cityId?: number` (con `@ApiProperty`), y el DTO de
respuesta del paciente los expone.

## Validación de moneda (defensa en profundidad)

`RecordPaymentDto.currency` y la `currency` de crear/editar plan se validan
contra la tabla `Currency` (código desconocido → 400). El bug real se ataca en
el front (select), pero esto cierra la puerta a datos inválidos desde la API.

## Seed (`dentalix-api`)

- Añadir `prisma/seed.ts` y configurar `"prisma": { "seed": "ts-node -r tsconfig-paths/register prisma/seed.ts" }` en `package.json`. Ejecutable con `npx prisma db seed`. **Idempotente** (`createMany({ skipDuplicates: true })` / `upsert`).
- **Currencies:** arreglo curado inline (USD, COP, EUR, MXN, ARS, PEN, CLP,
  BRL, … las soportadas por OpenExchangeRates + COP) con `name` y `symbol`.
- **Countries + Cities:** JSON del dataset bajo `prisma/data/` (recortado a los
  campos usados: country code/name; city id/name/countryCode/region). Inserción
  en lotes (~5k) con `skipDuplicates`.
- Documentar el paso `npx prisma db seed` en el README y correrlo tras
  `migrate deploy` en local.

## Frontend (`dentalix-web`)

### Fetchers (`src/lib/reference/`)
`currencies-api.ts`, `countries-api.ts`, `cities-api.ts` — funciones async sobre
`apiFetch`, tipos desde `components['schemas'][...]` del `schema.d.ts`
regenerado. Mismo patrón que los `*-api.ts` existentes; sin librería de hooks.

### `CurrencySelect` (componente reutilizable)
`<select>` nativo (coherente con la convención de controles nativos del
proyecto). Opción = `${name} (${symbol})`, `value = code`. Carga la lista una
vez. Consumidores:
- Formulario de abono (`treatment-plans-tab.tsx`) — reemplaza el `<Input>` de
  texto libre. Default = moneda del plan.
- Filtro del dashboard (`dashboard-view.tsx`) — reemplaza el `<Input>`.
- Formulario "Nuevo plan" — nuevo campo Moneda (default USD).

### Blindaje del formateo
`formatCurrency` / `formatCurrencyIn` (y el equivalente en `payment-receipt.tsx`
y `dashboard-view.tsx`) envuelven `Intl.NumberFormat` en try/catch; ante código
inválido, fallback a `` `${code} ${amount.toFixed(2)}` ``. Garantiza que ni
datos viejos con código raro tumben el render. Se extrae a un helper compartido
(`src/lib/format/currency.ts`) para no duplicar.

### Patient form — País + Ciudad
- **País:** `<select>` nativo poblado desde `/countries`.
- **Ciudad:** `CityCombobox` — input de búsqueda con listbox async
  (`/cities?countryCode&q`, debounce ~250 ms), accesible (roles
  `combobox`/`listbox`/`option`, navegación con teclado). Deshabilitado hasta
  elegir país; se limpia al cambiar de país. Guarda `cityId` (y muestra el
  nombre elegido).
- Se agregan `countryCode` y `cityId` al `CreatePatientInput` / update.
- `address` permanece como campo de calle/detalle.

## Tests

**Backend (e2e/int):**
- `GET /currencies`, `/countries` devuelven listas sembradas.
- `GET /cities` exige `countryCode`, filtra por `q`, respeta `limit` (tope 50).
- Crear/editar paciente con `countryCode` + `cityId` válidos; rechaza (400) si
  la ciudad no pertenece al país o si viene `cityId` sin `countryCode`.
- Validación de moneda: abono/plan con código fuera de `Currency` → 400.
- Fixture mínimo de referencia sembrado para el entorno de test.

**Frontend (Testing Library):**
- `CurrencySelect` renderiza opciones `Nombre (símbolo)` y envía el `code`
  (abono, dashboard, nuevo plan).
- `formatCurrency`/`formatCurrencyIn`: con código inválido no lanzan; devuelven
  el fallback.
- Patient form: ciudad deshabilitada hasta elegir país; cambiar país limpia la
  ciudad; escribir en ciudad dispara el fetcher (mock) y seleccionar guarda
  `cityId`.

## Notas de despliegue / compatibilidad

- `TreatmentPlan.currency` / `Payment.currency` siguen siendo `String`; el
  select solo restringe lo nuevo, y el fallback de formateo cubre lo viejo. No
  hay backfill.
- `Patient.countryCode` / `cityId` son nullable → sin migración de datos.
- Requiere regenerar `schema.d.ts` (`npm run codegen`) tras exponer los nuevos
  DTOs/endpoints.

## Fuera de alcance

- Estados/departamentos como nivel navegable (el dataset los trae, pero solo se
  guardan como `City.region` informativo).
- Edición administrativa de monedas/países/ciudades desde la UI (son datos de
  referencia sembrados).
- Conversión/tasas de cambio (ya existe el módulo `exchange`; aquí solo se
  alinea la whitelist de monedas).
