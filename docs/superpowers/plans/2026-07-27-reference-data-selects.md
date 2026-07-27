# Reference-Data Selects (Moneda, País, Ciudad) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace free-text currency/country/city inputs with selects backed by DB reference tables (Currency with name+symbol; Country + City with a país→ciudad cascade), and harden currency formatting so no invalid code can crash the render.

**Architecture:** Backend adds three GLOBAL reference tables (no tenantId / no RLS, exactly like `ExchangeRateSnapshot`) and a single DDD `reference` module exposing read-only list endpoints guarded by `JwtAuthGuard` only. A Prisma seed populates currencies (curated) and countries/cities (broad dataset via the `country-state-city` npm package). `Patient` gains optional `countryCode` + `cityId`. Frontend adds `src/lib/reference/*` fetchers, a `CurrencySelect`, a `CityCombobox`, and a shared crash-safe currency formatter, then rewires the abono form, dashboard filter, new-plan form, and patient form.

**Tech Stack:** Backend — NestJS (DDD: presentation/application/domain/infrastructure), Prisma 6 + Postgres, class-validator, `@nestjs/swagger`, Jest + ts-jest + supertest. Frontend — Next.js 16, React 19, TypeScript, Jest + Testing Library, `openapi-typescript` codegen.

## Global Constraints

- **Two repos.** Backend: `/Users/ncaicedo/Desktop/dentalix/dentalix-api`. Frontend: `/Users/ncaicedo/Desktop/dentalix/dentalix-web`. Every path below is relative to one of these — each task names which.
- **Backend imports are RELATIVE.** `tsconfig.json` defines NO `paths` aliases. Never use `@/` in `dentalix-api`. Frontend DOES use `@/` (maps to `src/`).
- **Global reference tables:** `Currency`, `Country`, `City` carry NO `tenantId`, NO `deletedAt`, and get NO RLS in their migration — identical to `exchange_rate_snapshots`. Their repos use `PrismaService` directly (NOT `runWithTenant`).
- **Reference endpoints:** guarded by `JwtAuthGuard` ONLY (no `RolesGuard`, no `@Roles`, no `TenantContextInterceptor`) — same as `ExchangeController`. Any authenticated clinic user may read them.
- **DTO convention:** request DTOs validate with class-validator; response DTOs exist purely for `@ApiProperty` Swagger docs (so `openapi-typescript` generates their type). Update DTOs are hand-written all-optional classes, never `PartialType`.
- **Migration convention:** hand-authored dir `YYYYMMDDHHMMSS_snake_description`. Author SQL by hand (mirror existing files). Do NOT run `prisma migrate dev` (it would try to recreate partial unique indexes Prisma can't model). Apply with `npx prisma migrate deploy`. After any schema change run `npx prisma generate`.
- **Currency codes are ISO 4217 uppercase.** The `Currency` table is the whitelist. Existing `TreatmentPlan.currency` / `Payment.currency` stay `String` (no backfill); the frontend fallback formatter covers legacy values.
- **DB / run:** Postgres runs via `docker compose up -d db` (host port 5442). Backend `npm run start:dev` (:3000, prefix `/api/v1`, docs at `/docs`, openapi at `/docs-json`). Frontend `npm run dev` (:3001). Tenant travels by host — log in via a subdomain (e.g. `prueba.localhost:3001`).
- **Frontend codegen:** `npm run codegen` regenerates `src/lib/api/schema.d.ts` from `http://localhost:3000/docs-json` — requires the backend running with the new endpoints. Run it before writing or typing frontend fetchers that consume the new DTOs.
- **Commits:** work on branch `feat/reference-data-selects` (already created). One commit per task step-group. End commit messages with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Copy is Spanish (es-first), as `const copy = {...}` objects** — match the existing components.

---

## File Structure

**Backend (`dentalix-api`)**
- `prisma/schema.prisma` — MODIFY: add `Currency`, `Country`, `City` models; add `countryCode`/`cityId` to `Patient`.
- `prisma/migrations/20260727120000_add_reference_currency_country_city/migration.sql` — CREATE.
- `prisma/seed.ts` — CREATE: idempotent seed (currencies curated; countries/cities from `country-state-city`).
- `package.json` — MODIFY: add `"prisma": { "seed": "ts-node prisma/seed.ts" }`; add `country-state-city` devDependency.
- `src/modules/reference/reference.module.ts` — CREATE.
- `src/modules/reference/domain/entities/{currency,country,city}.entity.ts` — CREATE.
- `src/modules/reference/domain/ports/reference-repository.port.ts` — CREATE (one port, three read methods).
- `src/modules/reference/infrastructure/repositories/prisma-reference.repository.ts` — CREATE.
- `src/modules/reference/application/use-cases/{list-currencies,list-countries,search-cities}.use-case.ts` — CREATE.
- `src/modules/reference/presentation/reference.controller.ts` — CREATE (3 GET routes).
- `src/modules/reference/presentation/dto/{currency,country,city}.dto.ts` + `search-cities-query.dto.ts` — CREATE.
- `src/app.module.ts` — MODIFY: import `ReferenceModule`.
- `src/modules/patients/**` — MODIFY: DTOs, use-cases, repo, entity for `countryCode`/`cityId` + city-belongs-to-country validation.
- `src/modules/patients/domain/ports/reference-lookup.port.ts` — CREATE (tiny port so the patient use-case can verify a city without depending on the reference module's internals).
- `src/modules/treatment-plans/**` + `src/modules/payments/**` — MODIFY: currency whitelist validation; add `currency` to plan create/update.
- `test/reference.e2e-spec.ts`, `test/patients-location.e2e-spec.ts`, `test/reference-seed.int-spec.ts` — CREATE.

**Frontend (`dentalix-web`)**
- `src/lib/api/schema.d.ts` — REGENERATE via codegen.
- `src/lib/reference/{currencies,countries,cities}-api.ts` (+ `.test.ts`) — CREATE.
- `src/lib/format/currency.ts` (+ `.test.ts`) — CREATE (crash-safe formatter).
- `src/components/molecules/currency-select.tsx` (+ `.test.tsx`) — CREATE.
- `src/components/molecules/city-combobox.tsx` (+ `.test.tsx`) — CREATE.
- `src/components/treatment-plans/treatment-plans-tab.tsx` — MODIFY: use `CurrencySelect` (abono + new-plan) + shared formatter.
- `src/components/dashboard/dashboard-view.tsx` — MODIFY: use `CurrencySelect` + shared formatter.
- `src/components/treatment-plans/payment-receipt.tsx` — MODIFY: use shared formatter.
- `src/components/patients/patient-form.tsx` — MODIFY: add Country select + `CityCombobox`, send `countryCode`/`cityId`.

---

# PHASE A — Backend

## Task 1: Reference tables + Patient columns (schema + migration)

**Files:**
- Modify: `dentalix-api/prisma/schema.prisma`
- Create: `dentalix-api/prisma/migrations/20260727120000_add_reference_currency_country_city/migration.sql`
- Test: `dentalix-api/test/reference-seed.int-spec.ts` (first assertion only; extended in Task 2)

**Interfaces:**
- Produces: Prisma models `Currency { code, name, symbol }`, `Country { code, name, cities }`, `City { id, countryCode, name, region?, country }`; `Patient.countryCode?: string`, `Patient.cityId?: number`. Prisma client accessors `prisma.currency`, `prisma.country`, `prisma.city`.

- [ ] **Step 1: Add the models to `schema.prisma`** (after `ExchangeRateSnapshot`, before `enum TenantDomainStatus`):

```prisma
// Catálogos de referencia GLOBALES (moneda/país/ciudad). Misma excepción que
// ExchangeRateSnapshot: sin tenantId, sin RLS, sin deletedAt. Currency es
// además la whitelist de códigos ISO 4217 aceptados en planes/abonos.
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
  id          Int     @id @default(autoincrement())
  countryCode String
  name        String
  region      String?          // estado/departamento (informativo)
  country     Country @relation(fields: [countryCode], references: [code])
  @@index([countryCode, name])
  @@map("cities")
}
```

- [ ] **Step 2: Add columns + relations to `Patient`** — inside `model Patient`, add these fields next to `address`, and the relations next to the existing relation block:

```prisma
  countryCode String?
  cityId      Int?
```
and in the relations section of `Patient`:
```prisma
  country Country? @relation(fields: [countryCode], references: [code])
  city    City?    @relation(fields: [cityId], references: [id])
```
Then add the back-relations to `Country` and `City` models (Prisma requires both sides):
```prisma
// in model Country: add
  patients Patient[]
// in model City: add
  patients Patient[]
```

- [ ] **Step 3: Write the migration SQL** at `prisma/migrations/20260727120000_add_reference_currency_country_city/migration.sql`:

```sql
-- Catálogos de referencia GLOBALES: moneda, país, ciudad. Igual que
-- exchange_rate_snapshots, NO son de dominio (no pertenecen a un tenant): sin
-- tenantId, sin deletedAt, y SIN Row Level Security -- no hay nada que aislar
-- por tenant. La tasa/lista es la misma para todas las clínicas.

-- CreateTable
CREATE TABLE "currencies" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    CONSTRAINT "currencies_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "countries" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    CONSTRAINT "countries_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "cities" (
    "id" SERIAL NOT NULL,
    "countryCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "region" TEXT,
    CONSTRAINT "cities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cities_countryCode_name_idx" ON "cities"("countryCode", "name");

-- AddForeignKey
ALTER TABLE "cities" ADD CONSTRAINT "cities_countryCode_fkey" FOREIGN KEY ("countryCode") REFERENCES "countries"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: ubicación estructurada del paciente (opcional). Convive con el
-- campo libre "address". Ambas columnas nullable => sin backfill.
ALTER TABLE "patients" ADD COLUMN "countryCode" TEXT;
ALTER TABLE "patients" ADD COLUMN "cityId" INTEGER;

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_countryCode_fkey" FOREIGN KEY ("countryCode") REFERENCES "countries"("code") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "patients" ADD CONSTRAINT "patients_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Grants: no se requiere GRANT explícito. Corre con el rol owner "dentalix"
-- (via DIRECT_URL), y ALTER DEFAULT PRIVILEGES ya otorga DML al rol de la app
-- (dentalix_app) sobre toda tabla nueva -- igual que las migraciones previas.
```

- [ ] **Step 4: Apply migration + regenerate client**

Run (from `dentalix-api`):
```bash
docker compose up -d db
npx prisma migrate deploy
npx prisma generate
```
Expected: "Applying migration `20260727120000_add_reference_currency_country_city`" then "All migrations have been applied", and "Generated Prisma Client".

- [ ] **Step 5: Write a smoke int-spec** at `test/reference-seed.int-spec.ts`:

```ts
import { PrismaClient } from '@prisma/client';

const raw = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL } },
});

describe('reference tables', () => {
  afterAll(async () => {
    await raw.$disconnect();
  });

  it('can insert and read a currency, country and city with the FK', async () => {
    await raw.currency.upsert({
      where: { code: 'TST' },
      update: {},
      create: { code: 'TST', name: 'Test Coin', symbol: '¤' },
    });
    await raw.country.upsert({
      where: { code: 'ZZ' },
      update: {},
      create: { code: 'ZZ', name: 'Testland' },
    });
    const city = await raw.city.create({
      data: { countryCode: 'ZZ', name: 'Testville', region: 'Test Region' },
    });

    const found = await raw.city.findUnique({
      where: { id: city.id },
      include: { country: true },
    });
    expect(found?.country.name).toBe('Testland');

    await raw.city.delete({ where: { id: city.id } });
    await raw.country.delete({ where: { code: 'ZZ' } });
    await raw.currency.delete({ where: { code: 'TST' } });
  });
});
```

- [ ] **Step 6: Set up the test DB and run the int-spec**

Run (from `dentalix-api`):
```bash
docker compose up -d db_test
npm run db:test:setup
npm run test:int -- reference-seed
```
Expected: PASS (1 test). `db:test:setup` applies the new migration to the test DB.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260727120000_add_reference_currency_country_city test/reference-seed.int-spec.ts
git commit -m "feat(api): reference tables currency/country/city + patient location columns

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Seed (currencies curated + countries/cities dataset)

**Files:**
- Create: `dentalix-api/prisma/seed.ts`
- Modify: `dentalix-api/package.json` (add `prisma.seed` config + `country-state-city` devDep)
- Test: extend `dentalix-api/test/reference-seed.int-spec.ts`

**Interfaces:**
- Consumes: `prisma.currency/country/city` from Task 1.
- Produces: `npx prisma db seed` populates `currencies` (curated whitelist incl. USD + COP), `countries` (all from dataset), `cities` (all from dataset). Idempotent: currencies/countries upserted; cities skipped when already populated (so `City.id` FKs stay stable).

- [ ] **Step 1: Add the dataset dependency + seed config**

Run (from `dentalix-api`):
```bash
npm install --save-dev country-state-city
```
Then edit `package.json` to add a top-level key (sibling of `scripts`):
```json
  "prisma": {
    "seed": "ts-node prisma/seed.ts"
  },
```

- [ ] **Step 2: Write `prisma/seed.ts`**

```ts
import { PrismaClient } from '@prisma/client';
import { Country, State, City } from 'country-state-city';

// Corre con el rol owner (DIRECT_URL): estas tablas son globales, sin RLS.
const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL } },
});

// Whitelist curada de monedas (ISO 4217). Cubre el contexto LATAM + majors;
// alineada con lo que soporta el proveedor de exchange (base USD) e incluye COP.
const CURRENCIES: { code: string; name: string; symbol: string }[] = [
  { code: 'USD', name: 'Dólar estadounidense', symbol: '$' },
  { code: 'COP', name: 'Peso colombiano', symbol: '$' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'MXN', name: 'Peso mexicano', symbol: '$' },
  { code: 'ARS', name: 'Peso argentino', symbol: '$' },
  { code: 'PEN', name: 'Sol peruano', symbol: 'S/' },
  { code: 'CLP', name: 'Peso chileno', symbol: '$' },
  { code: 'BRL', name: 'Real brasileño', symbol: 'R$' },
  { code: 'GBP', name: 'Libra esterlina', symbol: '£' },
  { code: 'CAD', name: 'Dólar canadiense', symbol: '$' },
];

async function seedCurrencies(): Promise<void> {
  for (const c of CURRENCIES) {
    await prisma.currency.upsert({
      where: { code: c.code },
      update: { name: c.name, symbol: c.symbol },
      create: c,
    });
  }
  console.log(`Seeded ${CURRENCIES.length} currencies`);
}

async function seedCountries(): Promise<void> {
  const countries = Country.getAllCountries();
  for (const c of countries) {
    await prisma.country.upsert({
      where: { code: c.isoCode },
      update: { name: c.name },
      create: { code: c.isoCode, name: c.name },
    });
  }
  console.log(`Seeded ${countries.length} countries`);
}

async function seedCities(): Promise<void> {
  // Idempotencia + estabilidad de FKs: si ya hay ciudades, no re-sembrar
  // (los ids autoincrement no deben cambiar bajo pacientes que los referencian).
  const existing = await prisma.city.count();
  if (existing > 0) {
    console.log(`Cities already seeded (${existing}); skipping`);
    return;
  }
  const countries = Country.getAllCountries();
  let total = 0;
  for (const country of countries) {
    // Mapa stateCode -> nombre para poblar `region` (informativo).
    const stateName = new Map(
      State.getStatesOfCountry(country.isoCode).map((s) => [s.isoCode, s.name]),
    );
    const cities = City.getCitiesOfCountry(country.isoCode) ?? [];
    if (cities.length === 0) continue;
    const data = cities.map((city) => ({
      countryCode: country.isoCode,
      name: city.name,
      region: city.stateCode ? (stateName.get(city.stateCode) ?? null) : null,
    }));
    // Lotes para no exceder límites de parámetros.
    for (let i = 0; i < data.length; i += 5000) {
      const batch = data.slice(i, i + 5000);
      await prisma.city.createMany({ data: batch });
      total += batch.length;
    }
  }
  console.log(`Seeded ${total} cities`);
}

async function main(): Promise<void> {
  await seedCurrencies();
  await seedCountries();
  await seedCities();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
```

- [ ] **Step 3: Run the seed against the dev DB**

Run (from `dentalix-api`):
```bash
npx prisma db seed
```
Expected: logs "Seeded 10 currencies", "Seeded N countries", "Seeded M cities" (N ~250, M in the hundreds of thousands). Re-running prints "Cities already seeded (…); skipping" and re-upserts currencies/countries without error (idempotent).

- [ ] **Step 4: Extend the int-spec to assert the seed populated known rows**

Add to `test/reference-seed.int-spec.ts`:
```ts
describe('reference seed', () => {
  const seedRaw = new PrismaClient({
    datasources: { db: { url: process.env.DIRECT_URL } },
  });
  afterAll(async () => {
    await seedRaw.$disconnect();
  });

  it('has USD and COP currencies with a symbol', async () => {
    const usd = await seedRaw.currency.findUnique({ where: { code: 'USD' } });
    const cop = await seedRaw.currency.findUnique({ where: { code: 'COP' } });
    expect(usd?.symbol).toBe('$');
    expect(cop?.name).toMatch(/colombiano/i);
  });

  it('has Colombia and at least one Colombian city', async () => {
    const co = await seedRaw.country.findUnique({ where: { code: 'CO' } });
    expect(co?.name).toBe('Colombia');
    const cities = await seedRaw.city.count({ where: { countryCode: 'CO' } });
    expect(cities).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 5: Seed the test DB and run**

Run (from `dentalix-api`):
```bash
DATABASE_URL=$(grep '^DATABASE_URL' .env.test | cut -d= -f2- | tr -d '"') DIRECT_URL=$(grep '^DIRECT_URL' .env.test | cut -d= -f2- | tr -d '"') npx prisma db seed
npm run test:int -- reference-seed
```
Expected: PASS (3 tests). (The seed run points at the test DB via its env so the assertions find rows.)

- [ ] **Step 6: Document the seed step in the README**

Add to `dentalix-api/README.md`, in the local-setup section, right after the `prisma migrate deploy` step:
```markdown
4. Sembrar datos de referencia (monedas, países, ciudades):
   ```bash
   npx prisma db seed
   ```
   Idempotente: las ciudades solo se siembran una vez (los ids son estables).
```

- [ ] **Step 7: Commit**

```bash
git add prisma/seed.ts package.json package-lock.json README.md test/reference-seed.int-spec.ts
git commit -m "feat(api): seed currencies (curated) + countries/cities dataset

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `reference` module — `GET /currencies`

**Files:**
- Create: `dentalix-api/src/modules/reference/domain/entities/currency.entity.ts`, `country.entity.ts`, `city.entity.ts`
- Create: `dentalix-api/src/modules/reference/domain/ports/reference-repository.port.ts`
- Create: `dentalix-api/src/modules/reference/infrastructure/repositories/prisma-reference.repository.ts`
- Create: `dentalix-api/src/modules/reference/application/use-cases/list-currencies.use-case.ts`
- Create: `dentalix-api/src/modules/reference/presentation/dto/currency.dto.ts`
- Create: `dentalix-api/src/modules/reference/presentation/reference.controller.ts`
- Create: `dentalix-api/src/modules/reference/reference.module.ts`
- Modify: `dentalix-api/src/app.module.ts`
- Test: `dentalix-api/test/reference.e2e-spec.ts`

**Interfaces:**
- Produces:
  - Entities `Currency { code: string; name: string; symbol: string }`, `Country { code: string; name: string }`, `City { id: number; name: string; region: string | null }`.
  - Port `REFERENCE_REPOSITORY = Symbol(...)`, `interface ReferenceRepository { listCurrencies(): Promise<Currency[]>; listCountries(): Promise<Country[]>; searchCities(countryCode: string, q: string | undefined, limit: number): Promise<City[]> }`.
  - `GET /api/v1/currencies` → `CurrencyDto[]`.

- [ ] **Step 1: Write the entities**

`src/modules/reference/domain/entities/currency.entity.ts`:
```ts
export interface Currency {
  code: string;
  name: string;
  symbol: string;
}
```
`src/modules/reference/domain/entities/country.entity.ts`:
```ts
export interface Country {
  code: string;
  name: string;
}
```
`src/modules/reference/domain/entities/city.entity.ts`:
```ts
export interface City {
  id: number;
  name: string;
  region: string | null;
}
```

- [ ] **Step 2: Write the port** at `src/modules/reference/domain/ports/reference-repository.port.ts`:

```ts
import { Currency } from '../entities/currency.entity';
import { Country } from '../entities/country.entity';
import { City } from '../entities/city.entity';

export const REFERENCE_REPOSITORY = Symbol('REFERENCE_REPOSITORY');

export interface ReferenceRepository {
  listCurrencies(): Promise<Currency[]>;
  listCountries(): Promise<Country[]>;
  searchCities(
    countryCode: string,
    q: string | undefined,
    limit: number,
  ): Promise<City[]>;
}
```

- [ ] **Step 3: Write the Prisma repo** at `src/modules/reference/infrastructure/repositories/prisma-reference.repository.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { ReferenceRepository } from '../../domain/ports/reference-repository.port';
import { Currency } from '../../domain/entities/currency.entity';
import { Country } from '../../domain/entities/country.entity';
import { City } from '../../domain/entities/city.entity';

@Injectable()
export class PrismaReferenceRepository implements ReferenceRepository {
  constructor(private readonly prisma: PrismaService) {}

  listCurrencies(): Promise<Currency[]> {
    return this.prisma.currency.findMany({ orderBy: { code: 'asc' } });
  }

  listCountries(): Promise<Country[]> {
    return this.prisma.country.findMany({
      orderBy: { name: 'asc' },
      select: { code: true, name: true },
    });
  }

  async searchCities(
    countryCode: string,
    q: string | undefined,
    limit: number,
  ): Promise<City[]> {
    const where: Prisma.CityWhereInput = { countryCode };
    if (q && q.trim() !== '') {
      where.name = { contains: q.trim(), mode: 'insensitive' };
    }
    return this.prisma.city.findMany({
      where,
      orderBy: { name: 'asc' },
      take: limit,
      select: { id: true, name: true, region: true },
    });
  }
}
```

- [ ] **Step 4: Write the use-case** at `src/modules/reference/application/use-cases/list-currencies.use-case.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common';
import { REFERENCE_REPOSITORY } from '../../domain/ports/reference-repository.port';
import type { ReferenceRepository } from '../../domain/ports/reference-repository.port';
import { Currency } from '../../domain/entities/currency.entity';

@Injectable()
export class ListCurrenciesUseCase {
  constructor(
    @Inject(REFERENCE_REPOSITORY)
    private readonly repo: ReferenceRepository,
  ) {}

  execute(): Promise<Currency[]> {
    return this.repo.listCurrencies();
  }
}
```

- [ ] **Step 5: Write the response DTO** at `src/modules/reference/presentation/dto/currency.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';

export class CurrencyDto {
  @ApiProperty({ example: 'USD' })
  code!: string;

  @ApiProperty({ example: 'Dólar estadounidense' })
  name!: string;

  @ApiProperty({ example: '$' })
  symbol!: string;
}
```

- [ ] **Step 6: Write the controller** at `src/modules/reference/presentation/reference.controller.ts`:

```ts
import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ListCurrenciesUseCase } from '../application/use-cases/list-currencies.use-case';
import { CurrencyDto } from './dto/currency.dto';
import { Currency } from '../domain/entities/currency.entity';
import { JwtAuthGuard } from '../../auth/presentation/guards/jwt-auth.guard';

@ApiTags('reference')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class ReferenceController {
  constructor(private readonly listCurrencies: ListCurrenciesUseCase) {}

  @Get('currencies')
  @ApiOkResponse({ type: [CurrencyDto] })
  currencies(): Promise<Currency[]> {
    return this.listCurrencies.execute();
  }
}
```

- [ ] **Step 7: Write the module** at `src/modules/reference/reference.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { REFERENCE_REPOSITORY } from './domain/ports/reference-repository.port';
import { PrismaReferenceRepository } from './infrastructure/repositories/prisma-reference.repository';
import { ListCurrenciesUseCase } from './application/use-cases/list-currencies.use-case';
import { ReferenceController } from './presentation/reference.controller';
import { TokenService } from '../../shared/crypto/token.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [ReferenceController],
  providers: [
    ListCurrenciesUseCase,
    TokenService,
    { provide: REFERENCE_REPOSITORY, useClass: PrismaReferenceRepository },
  ],
})
export class ReferenceModule {}
```

- [ ] **Step 8: Register in `app.module.ts`** — add the import and list it in `imports`:

```ts
import { ReferenceModule } from './modules/reference/reference.module';
```
and add `ReferenceModule,` to the `imports: [...]` array (next to `ExchangeModule`).

- [ ] **Step 9: Write the e2e test** at `test/reference.e2e-spec.ts`:

```ts
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { hostFor } from './support/tenant-host';

const raw = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL } },
});
const PASSWORD = 'Sup3rSecret!';

async function registerAndLogin(app: INestApplication<App>) {
  const sub = 'refclinic';
  await request(app.getHttpServer())
    .post('/api/v1/auth/register')
    .send({
      clinicName: 'Ref Clinic',
      subdomain: sub,
      email: 'owner@ref.com',
      password: PASSWORD,
      fullName: 'Dr. Ref',
    })
    .expect(201);
  const login = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .set('X-Tenant-Host', hostFor(sub))
    .send({ email: 'owner@ref.com', password: PASSWORD })
    .expect(201);
  return { token: (login.body as { accessToken: string }).accessToken, sub };
}

describe('reference endpoints (e2e)', () => {
  let app: INestApplication<App>;
  let token: string;
  let sub: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    await raw.clinicMembership.deleteMany();
    await raw.user.deleteMany();
    await raw.tenantDomain.deleteMany();
    await raw.tenant.deleteMany();

    ({ token, sub } = await registerAndLogin(app));
  });

  afterAll(async () => {
    await app.close();
    await raw.$disconnect();
  });

  it('401 without a token', async () => {
    await request(app.getHttpServer()).get('/api/v1/currencies').expect(401);
  });

  it('GET /currencies returns the seeded list incl. USD', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/currencies')
      .set('X-Tenant-Host', hostFor(sub))
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const body = res.body as { code: string; symbol: string }[];
    expect(body.some((c) => c.code === 'USD' && c.symbol === '$')).toBe(true);
  });
});
```

- [ ] **Step 10: Run the e2e test**

Run (from `dentalix-api`, requires test DB seeded from Task 2 Step 5):
```bash
npm run test:e2e -- reference
```
Expected: PASS (2 tests).

- [ ] **Step 11: Commit**

```bash
git add src/modules/reference src/app.module.ts test/reference.e2e-spec.ts
git commit -m "feat(api): reference module + GET /currencies

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: `GET /countries`

**Files:**
- Create: `dentalix-api/src/modules/reference/application/use-cases/list-countries.use-case.ts`
- Create: `dentalix-api/src/modules/reference/presentation/dto/country.dto.ts`
- Modify: `dentalix-api/src/modules/reference/presentation/reference.controller.ts`, `reference.module.ts`
- Test: extend `dentalix-api/test/reference.e2e-spec.ts`

**Interfaces:**
- Consumes: `ReferenceRepository.listCountries()` (Task 3).
- Produces: `GET /api/v1/countries` → `CountryDto[]` (`{ code, name }`).

- [ ] **Step 1: Write the use-case** at `src/modules/reference/application/use-cases/list-countries.use-case.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common';
import { REFERENCE_REPOSITORY } from '../../domain/ports/reference-repository.port';
import type { ReferenceRepository } from '../../domain/ports/reference-repository.port';
import { Country } from '../../domain/entities/country.entity';

@Injectable()
export class ListCountriesUseCase {
  constructor(
    @Inject(REFERENCE_REPOSITORY)
    private readonly repo: ReferenceRepository,
  ) {}

  execute(): Promise<Country[]> {
    return this.repo.listCountries();
  }
}
```

- [ ] **Step 2: Write the DTO** at `src/modules/reference/presentation/dto/country.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';

export class CountryDto {
  @ApiProperty({ example: 'CO' })
  code!: string;

  @ApiProperty({ example: 'Colombia' })
  name!: string;
}
```

- [ ] **Step 3: Add the route to the controller** — add the import, constructor param, and route:

```ts
// imports
import { ListCountriesUseCase } from '../application/use-cases/list-countries.use-case';
import { CountryDto } from './dto/country.dto';
import { Country } from '../domain/entities/country.entity';
```
```ts
// constructor — add param
    private readonly listCountries: ListCountriesUseCase,
```
```ts
  @Get('countries')
  @ApiOkResponse({ type: [CountryDto] })
  countries(): Promise<Country[]> {
    return this.listCountries.execute();
  }
```

- [ ] **Step 4: Register the use-case** in `reference.module.ts` — add `ListCountriesUseCase` to the `providers` array and its import.

- [ ] **Step 5: Add the e2e assertion** to `test/reference.e2e-spec.ts`:

```ts
  it('GET /countries returns the seeded list incl. Colombia', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/countries')
      .set('X-Tenant-Host', hostFor(sub))
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const body = res.body as { code: string; name: string }[];
    expect(body.some((c) => c.code === 'CO' && c.name === 'Colombia')).toBe(true);
  });
```

- [ ] **Step 6: Run**

```bash
npm run test:e2e -- reference
```
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add src/modules/reference test/reference.e2e-spec.ts
git commit -m "feat(api): GET /countries

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: `GET /cities` (filtered + capped)

**Files:**
- Create: `dentalix-api/src/modules/reference/application/use-cases/search-cities.use-case.ts`
- Create: `dentalix-api/src/modules/reference/presentation/dto/city.dto.ts`, `search-cities-query.dto.ts`
- Modify: `reference.controller.ts`, `reference.module.ts`
- Test: extend `dentalix-api/test/reference.e2e-spec.ts`

**Interfaces:**
- Consumes: `ReferenceRepository.searchCities(countryCode, q, limit)` (Task 3).
- Produces: `GET /api/v1/cities?countryCode=CO&q=bog&limit=20` → `CityDto[]` (`{ id, name, region }`). `countryCode` required (400 if missing); `limit` default 20, clamped to max 50.

- [ ] **Step 1: Write the query DTO** at `src/modules/reference/presentation/dto/search-cities-query.dto.ts`:

```ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class SearchCitiesQueryDto {
  @ApiProperty({ example: 'CO', description: 'ISO 3166-1 alpha-2 country code' })
  @IsString()
  @Length(2, 2)
  countryCode!: string;

  @ApiPropertyOptional({ description: 'Case-insensitive name filter' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
```

- [ ] **Step 2: Write the response DTO** at `src/modules/reference/presentation/dto/city.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';

export class CityDto {
  @ApiProperty({ example: 12345 })
  id!: number;

  @ApiProperty({ example: 'Bogotá' })
  name!: string;

  @ApiProperty({ type: String, nullable: true, example: 'Bogota D.C.' })
  region!: string | null;
}
```

- [ ] **Step 3: Write the use-case** at `src/modules/reference/application/use-cases/search-cities.use-case.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common';
import { REFERENCE_REPOSITORY } from '../../domain/ports/reference-repository.port';
import type { ReferenceRepository } from '../../domain/ports/reference-repository.port';
import { City } from '../../domain/entities/city.entity';

export interface SearchCitiesInput {
  countryCode: string;
  q?: string;
  limit?: number;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

@Injectable()
export class SearchCitiesUseCase {
  constructor(
    @Inject(REFERENCE_REPOSITORY)
    private readonly repo: ReferenceRepository,
  ) {}

  execute(input: SearchCitiesInput): Promise<City[]> {
    const limit = Math.min(input.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    return this.repo.searchCities(input.countryCode.toUpperCase(), input.q, limit);
  }
}
```

- [ ] **Step 4: Add the route to the controller**:

```ts
// imports
import { Query } from '@nestjs/common';
import { SearchCitiesUseCase } from '../application/use-cases/search-cities.use-case';
import { SearchCitiesQueryDto } from './dto/search-cities-query.dto';
import { CityDto } from './dto/city.dto';
import { City } from '../domain/entities/city.entity';
```
```ts
// constructor — add param
    private readonly searchCities: SearchCitiesUseCase,
```
```ts
  @Get('cities')
  @ApiOkResponse({ type: [CityDto] })
  cities(@Query() query: SearchCitiesQueryDto): Promise<City[]> {
    return this.searchCities.execute({
      countryCode: query.countryCode,
      q: query.q,
      limit: query.limit,
    });
  }
```
(Note: `Query` may already be imported from `@nestjs/common`; merge, don't duplicate.)

- [ ] **Step 5: Register the use-case** in `reference.module.ts` (add `SearchCitiesUseCase` to `providers` + import).

- [ ] **Step 6: Add e2e assertions** to `test/reference.e2e-spec.ts`:

```ts
  it('GET /cities requires countryCode (400 without it)', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/cities')
      .set('X-Tenant-Host', hostFor(sub))
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('GET /cities filters by countryCode + q and caps at 50', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/cities?countryCode=CO&q=bog&limit=100')
      .set('X-Tenant-Host', hostFor(sub))
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const body = res.body as { id: number; name: string }[];
    expect(body.length).toBeLessThanOrEqual(50);
    expect(body.some((c) => /bog/i.test(c.name))).toBe(true);
  });
```

- [ ] **Step 7: Run**

```bash
npm run test:e2e -- reference
```
Expected: PASS (5 tests).

- [ ] **Step 8: Commit**

```bash
git add src/modules/reference test/reference.e2e-spec.ts
git commit -m "feat(api): GET /cities (filtered by countryCode+q, capped)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Patient `countryCode` + `cityId` end-to-end (with validation)

**Files:**
- Create: `dentalix-api/src/modules/patients/domain/ports/reference-lookup.port.ts`
- Create: `dentalix-api/src/modules/patients/infrastructure/adapters/prisma-reference-lookup.adapter.ts`
- Modify: `create-patient.dto.ts`, `update-patient.dto.ts`, `patient.dto.ts`, `patient.entity.ts`, `patient-repository.port.ts`, `prisma-patient.repository.ts`, `create-patient.use-case.ts`, `update-patient.use-case.ts`, `patients.controller.ts`, `patients.module.ts`
- Test: `dentalix-api/test/patients-location.e2e-spec.ts`

**Interfaces:**
- Consumes: `prisma.country`/`prisma.city` (Task 1).
- Produces: `Patient.countryCode: string | null`, `Patient.cityId: number | null` on the entity and `PatientDto`; `CreatePatientDto`/`UpdatePatientDto` accept `countryCode?: string`, `cityId?: number`; use-cases reject a `cityId` whose city's `countryCode` ≠ the supplied `countryCode`, or a `cityId` with no `countryCode` (400). Port `REFERENCE_LOOKUP = Symbol(...)`, `interface ReferenceLookup { cityBelongsToCountry(cityId: number, countryCode: string): Promise<boolean> }`.

- [ ] **Step 1: Write the lookup port** at `src/modules/patients/domain/ports/reference-lookup.port.ts`:

```ts
export const REFERENCE_LOOKUP = Symbol('REFERENCE_LOOKUP');

export interface ReferenceLookup {
  /** True iff a city with `cityId` exists AND its countryCode === `countryCode`. */
  cityBelongsToCountry(cityId: number, countryCode: string): Promise<boolean>;
}
```

- [ ] **Step 2: Write the adapter** at `src/modules/patients/infrastructure/adapters/prisma-reference-lookup.adapter.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { ReferenceLookup } from '../../domain/ports/reference-lookup.port';

@Injectable()
export class PrismaReferenceLookup implements ReferenceLookup {
  constructor(private readonly prisma: PrismaService) {}

  async cityBelongsToCountry(
    cityId: number,
    countryCode: string,
  ): Promise<boolean> {
    const city = await this.prisma.city.findUnique({
      where: { id: cityId },
      select: { countryCode: true },
    });
    return city?.countryCode === countryCode;
  }
}
```

- [ ] **Step 3: Extend the DTOs** — add to `create-patient.dto.ts` (after `address`):

```ts
  @ApiPropertyOptional({ example: 'CO', description: 'ISO 3166-1 alpha-2' })
  @IsOptional()
  @IsString()
  countryCode?: string;

  @ApiPropertyOptional({ example: 12345, description: 'City id from GET /cities' })
  @IsOptional()
  @IsInt()
  cityId?: number;
```
Add `IsInt` to the `class-validator` import. Add the identical two fields to `update-patient.dto.ts` (all `@IsOptional()` already fits).

- [ ] **Step 4: Extend the response DTO** — add to `patient.dto.ts` (after `address`):

```ts
  @ApiProperty({ type: String, nullable: true })
  countryCode!: string | null;

  @ApiProperty({ type: Number, nullable: true })
  cityId!: number | null;
```

- [ ] **Step 5: Extend the entity + repo types + mapper** — in `patient.entity.ts` add `countryCode: string | null;` and `cityId: number | null;`. In `patient-repository.port.ts`, add `countryCode?: string; cityId?: number;` to `CreatePatientRepoInput` and `UpdatePatientRepoInput`. In `prisma-patient.repository.ts`: add to `mapToEntity`:
```ts
    countryCode: patient.countryCode,
    cityId: patient.cityId,
```
and to the `create` `data: {...}` and the `update` data:
```ts
    countryCode: input.countryCode,
    cityId: input.cityId,
```

- [ ] **Step 6: Add validation to the create use-case** — modify `create-patient.use-case.ts`. Add fields to `CreatePatientInput` (`countryCode?: string; cityId?: number;`), inject the lookup, and validate:

```ts
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
// ...existing imports...
import { REFERENCE_LOOKUP } from '../../domain/ports/reference-lookup.port';
import type { ReferenceLookup } from '../../domain/ports/reference-lookup.port';
```
```ts
  constructor(
    @Inject(PATIENT_REPOSITORY) private readonly repo: PatientRepository,
    @Inject(REFERENCE_LOOKUP) private readonly reference: ReferenceLookup,
  ) {}
```
Inside `execute`, before `return this.repo.create(...)`:
```ts
    if (input.cityId !== undefined) {
      if (!input.countryCode) {
        throw new BadRequestException('countryCode is required when cityId is set');
      }
      const ok = await this.reference.cityBelongsToCountry(
        input.cityId,
        input.countryCode,
      );
      if (!ok) {
        throw new BadRequestException('cityId does not belong to countryCode');
      }
    }
```
and pass `countryCode: input.countryCode, cityId: input.cityId` in the `this.repo.create({...})` object.

- [ ] **Step 7: Add the same validation to `update-patient.use-case.ts`** — mirror Step 6 (inject `REFERENCE_LOOKUP`, add the same `cityId`/`countryCode` guard block reading from the update input, pass the two fields through to `repo.update`). Note: on update, only validate when `cityId !== undefined`.

- [ ] **Step 8: Pass the new fields through the controller** — `patients.controller.ts`. The controller already spreads `...dto`, so `countryCode`/`cityId` flow to the use-case automatically. No change needed unless the use-case `execute` signature is positional — verify `create` still does `this.createPatient.execute({ ...dto, birthDate: ..., createdById: ... })`. Leave as is.

- [ ] **Step 9: Wire the adapter in the module** — `patients.module.ts`, add to `providers`:
```ts
import { REFERENCE_LOOKUP } from './domain/ports/reference-lookup.port';
import { PrismaReferenceLookup } from './infrastructure/adapters/prisma-reference-lookup.adapter';
```
```ts
    { provide: REFERENCE_LOOKUP, useClass: PrismaReferenceLookup },
```

- [ ] **Step 10: Regenerate the client is NOT needed** (no schema change here). Write the e2e test at `test/patients-location.e2e-spec.ts`:

```ts
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { hostFor } from './support/tenant-host';

const raw = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL } },
});
const PASSWORD = 'Sup3rSecret!';

describe('patient location (e2e)', () => {
  let app: INestApplication<App>;
  let token: string;
  const sub = 'locclinic';
  let coCityId: number;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    await raw.patient.deleteMany();
    await raw.clinicMembership.deleteMany();
    await raw.user.deleteMany();
    await raw.tenantDomain.deleteMany();
    await raw.tenant.deleteMany();

    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ clinicName: 'Loc', subdomain: sub, email: 'o@loc.com', password: PASSWORD, fullName: 'Dr' })
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('X-Tenant-Host', hostFor(sub))
      .send({ email: 'o@loc.com', password: PASSWORD })
      .expect(201);
    token = (login.body as { accessToken: string }).accessToken;

    const co = await raw.city.findFirst({ where: { countryCode: 'CO' }, select: { id: true } });
    coCityId = co!.id;
  });

  afterAll(async () => {
    await app.close();
    await raw.$disconnect();
  });

  it('creates a patient with a valid country + city', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/patients')
      .set('X-Tenant-Host', hostFor(sub))
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'Ana', lastName: 'G', docType: 'CC', sex: 'F', countryCode: 'CO', cityId: coCityId })
      .expect(201);
    const body = res.body as { countryCode: string; cityId: number };
    expect(body.countryCode).toBe('CO');
    expect(body.cityId).toBe(coCityId);
  });

  it('rejects a city that does not belong to the country', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/patients')
      .set('X-Tenant-Host', hostFor(sub))
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'B', lastName: 'B', docType: 'CC', sex: 'M', countryCode: 'US', cityId: coCityId })
      .expect(400);
  });

  it('rejects cityId without countryCode', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/patients')
      .set('X-Tenant-Host', hostFor(sub))
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'C', lastName: 'C', docType: 'CC', sex: 'M', cityId: coCityId })
      .expect(400);
  });
});
```

- [ ] **Step 11: Run**

```bash
npm run test:e2e -- patients-location
```
Expected: PASS (3 tests).

- [ ] **Step 12: Commit**

```bash
git add src/modules/patients test/patients-location.e2e-spec.ts
git commit -m "feat(api): patient countryCode + cityId with city-belongs-to-country validation

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Currency whitelist + plan currency selection

**Files:**
- Modify: `dentalix-api/src/modules/treatment-plans/presentation/dto/create-treatment-plan.dto.ts`, `update-treatment-plan.dto.ts`
- Modify: treatment-plan create/update use-cases + repo (thread `currency`)
- Create: `dentalix-api/src/modules/treatment-plans/domain/ports/currency-whitelist.port.ts` + a prisma adapter (or reuse `ReferenceLookup` shape)
- Modify: `record-payment.use-case.ts` (validate currency against whitelist)
- Test: extend `dentalix-api/test/payments.e2e-spec.ts` (or a new `treatment-plan-currency.e2e-spec.ts`)

**Interfaces:**
- Produces: `CreateTreatmentPlanDto.currency?: string`; unknown currency codes (not in `currencies`) → 400 on plan create/update and on record-payment. Port `CURRENCY_WHITELIST = Symbol(...)`, `interface CurrencyWhitelist { has(code: string): Promise<boolean> }`.

- [ ] **Step 1: Write the whitelist port** at `src/modules/treatment-plans/domain/ports/currency-whitelist.port.ts`:

```ts
export const CURRENCY_WHITELIST = Symbol('CURRENCY_WHITELIST');

export interface CurrencyWhitelist {
  has(code: string): Promise<boolean>;
}
```

- [ ] **Step 2: Write the adapter** at `src/modules/treatment-plans/infrastructure/adapters/prisma-currency-whitelist.adapter.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { CurrencyWhitelist } from '../../domain/ports/currency-whitelist.port';

@Injectable()
export class PrismaCurrencyWhitelist implements CurrencyWhitelist {
  constructor(private readonly prisma: PrismaService) {}

  async has(code: string): Promise<boolean> {
    const found = await this.prisma.currency.findUnique({
      where: { code: code.toUpperCase() },
      select: { code: true },
    });
    return found !== null;
  }
}
```

- [ ] **Step 3: Add `currency` to `create-treatment-plan.dto.ts`**:

```ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CreateTreatmentPlanDto {
  @ApiPropertyOptional({ example: 'USD', description: 'ISO 4217 (default USD)' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
```
Add the same `currency?` field to `update-treatment-plan.dto.ts`.

- [ ] **Step 4: Thread + validate `currency` in the create-treatment-plan use-case** — add `currency?: string` to its input interface, inject `CURRENCY_WHITELIST`, and before persisting:

```ts
    const currency = (input.currency ?? 'USD').toUpperCase();
    if (!(await this.whitelist.has(currency))) {
      throw new BadRequestException(`Unknown currency: ${currency}`);
    }
```
Pass `currency` to the repo create `data`. (Import `BadRequestException`, `Inject`, `CURRENCY_WHITELIST` + `type CurrencyWhitelist`.) Do the equivalent in the update use-case, but only validate when `currency !== undefined`.

- [ ] **Step 5: Validate currency in `record-payment.use-case.ts`** — inject `CURRENCY_WHITELIST` and after normalizing `currency`:

```ts
    if (!(await this.whitelist.has(currency))) {
      throw new BadRequestException(`Unknown currency: ${currency}`);
    }
```
Register the adapter provider in `payments.module.ts` and `treatment-plans.module.ts` (`{ provide: CURRENCY_WHITELIST, useClass: PrismaCurrencyWhitelist }`).

- [ ] **Step 6: Write the e2e test** at `test/treatment-plan-currency.e2e-spec.ts` — register+login (reuse the pattern from Task 3 Step 9), create a patient, then:

```ts
  it('creates a plan with an allowed currency and rejects an unknown one', async () => {
    const ok = await request(app.getHttpServer())
      .post(`/api/v1/patients/${patientId}/treatment-plans`)
      .set('X-Tenant-Host', hostFor(sub))
      .set('Authorization', `Bearer ${token}`)
      .send({ currency: 'COP' })
      .expect(201);
    expect((ok.body as { currency: string }).currency).toBe('COP');

    await request(app.getHttpServer())
      .post(`/api/v1/patients/${patientId}/treatment-plans`)
      .set('X-Tenant-Host', hostFor(sub))
      .set('Authorization', `Bearer ${token}`)
      .send({ currency: 'XXX' })
      .expect(400);
  });
```
(Include full `beforeAll`/imports mirroring Task 3 Step 9; create `patientId` via `POST /patients`.)

- [ ] **Step 7: Run**

```bash
npm run test:e2e -- treatment-plan-currency
```
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/modules/treatment-plans src/modules/payments test/treatment-plan-currency.e2e-spec.ts
git commit -m "feat(api): currency whitelist validation + plan currency selection

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

# PHASE B — Frontend

> Before starting Phase B: ensure the backend is running with Phase A merged (`npm run start:dev` in `dentalix-api`, DB seeded), so codegen sees the new endpoints.

## Task 8: Regenerate schema + reference fetchers

**Files:**
- Regenerate: `dentalix-web/src/lib/api/schema.d.ts`
- Create: `dentalix-web/src/lib/reference/currencies-api.ts`, `countries-api.ts`, `cities-api.ts`
- Test: `dentalix-web/src/lib/reference/reference-api.test.ts`

**Interfaces:**
- Produces:
  - `type Currency = components['schemas']['CurrencyDto']` (`{ code, name, symbol }`); `listCurrencies(token): Promise<Currency[]>`.
  - `type Country = components['schemas']['CountryDto']`; `listCountries(token): Promise<Country[]>`.
  - `type City = components['schemas']['CityDto']` (`{ id, name, region }`); `searchCities(token, { countryCode, q?, limit? }): Promise<City[]>`.

- [ ] **Step 1: Regenerate the OpenAPI types**

Run (from `dentalix-web`, backend must be up):
```bash
npm run codegen
```
Expected: `src/lib/api/schema.d.ts` now contains `CurrencyDto`, `CountryDto`, `CityDto` and paths `/api/v1/currencies`, `/api/v1/countries`, `/api/v1/cities`.

- [ ] **Step 2: Write `src/lib/reference/currencies-api.ts`**:

```ts
import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

export type Currency = components['schemas']['CurrencyDto'];

/** `GET /currencies` — full ISO 4217 whitelist with name + symbol. */
export async function listCurrencies(token: string): Promise<Currency[]> {
  return apiFetch<Currency[]>('/currencies', { token });
}
```

- [ ] **Step 3: Write `src/lib/reference/countries-api.ts`**:

```ts
import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

export type Country = components['schemas']['CountryDto'];

/** `GET /countries` — full list, sorted by name. */
export async function listCountries(token: string): Promise<Country[]> {
  return apiFetch<Country[]>('/countries', { token });
}
```

- [ ] **Step 4: Write `src/lib/reference/cities-api.ts`**:

```ts
import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

export type City = components['schemas']['CityDto'];

export interface SearchCitiesParams {
  countryCode: string;
  q?: string;
  limit?: number;
}

/** `GET /cities?countryCode&q&limit` — capped, name-filtered list for a country. */
export async function searchCities(
  token: string,
  params: SearchCitiesParams,
): Promise<City[]> {
  const search = new URLSearchParams();
  search.set('countryCode', params.countryCode);
  if (params.q) search.set('q', params.q);
  if (params.limit !== undefined) search.set('limit', String(params.limit));
  return apiFetch<City[]>(`/cities?${search.toString()}`, { token });
}
```

- [ ] **Step 5: Write the fetcher tests** at `src/lib/reference/reference-api.test.ts` (mirror `staff-api.test.ts`'s mock-of-client pattern):

```ts
import { apiFetch } from '@/lib/api/client';
import { listCurrencies } from './currencies-api';
import { listCountries } from './countries-api';
import { searchCities } from './cities-api';

jest.mock('../api/client', () => ({ apiFetch: jest.fn() }));
const mockedApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

describe('reference fetchers', () => {
  beforeEach(() => mockedApiFetch.mockReset().mockResolvedValue([] as never));

  it('listCurrencies calls GET /currencies with the token', async () => {
    await listCurrencies('tok');
    expect(mockedApiFetch).toHaveBeenCalledWith('/currencies', { token: 'tok' });
  });

  it('listCountries calls GET /countries with the token', async () => {
    await listCountries('tok');
    expect(mockedApiFetch).toHaveBeenCalledWith('/countries', { token: 'tok' });
  });

  it('searchCities builds the querystring (countryCode required, q + limit optional)', async () => {
    await searchCities('tok', { countryCode: 'CO', q: 'bog', limit: 10 });
    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/cities?countryCode=CO&q=bog&limit=10',
      { token: 'tok' },
    );
  });

  it('searchCities omits q and limit when absent', async () => {
    await searchCities('tok', { countryCode: 'CO' });
    expect(mockedApiFetch).toHaveBeenCalledWith('/cities?countryCode=CO', { token: 'tok' });
  });
});
```

- [ ] **Step 6: Run**

```bash
npm test -- reference-api
```
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add src/lib/api/schema.d.ts src/lib/reference
git commit -m "feat(web): reference fetchers (currencies/countries/cities) + codegen

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: Crash-safe currency formatter

**Files:**
- Create: `dentalix-web/src/lib/format/currency.ts`, `src/lib/format/currency.test.ts`
- Modify: `treatment-plans-tab.tsx`, `dashboard-view.tsx`, `payment-receipt.tsx` (use the shared helper)

**Interfaces:**
- Produces: `formatCurrency(amount: number, currency: string, locale?: string): string` — never throws; on an invalid ISO code falls back to `` `${code} ${amount.toFixed(2)}` ``.

- [ ] **Step 1: Write the failing test** at `src/lib/format/currency.test.ts`:

```ts
import { formatCurrency } from './currency';

describe('formatCurrency', () => {
  it('formats a valid ISO code', () => {
    expect(formatCurrency(1234.5, 'USD')).toMatch(/1[.,]234/);
  });

  it('does not throw on an invalid code and falls back to "CODE amount"', () => {
    expect(() => formatCurrency(10, 'NOPE')).not.toThrow();
    expect(formatCurrency(10, 'NOPE')).toBe('NOPE 10.00');
  });

  it('does not throw on an empty code', () => {
    expect(() => formatCurrency(10, '')).not.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -- format/currency
```
Expected: FAIL ("Cannot find module './currency'").

- [ ] **Step 3: Implement** `src/lib/format/currency.ts`:

```ts
/**
 * Crash-safe currency formatter. `Intl.NumberFormat({ style:'currency' })`
 * throws a RangeError on an invalid/unknown ISO 4217 code — which, when called
 * during render, tears down the whole subtree. This never throws: on any
 * failure it falls back to `` `${currency} ${amount}` ``. Use this everywhere
 * instead of constructing `Intl.NumberFormat` inline.
 */
export function formatCurrency(
  amount: number,
  currency: string,
  locale = 'es',
): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm test -- format/currency
```
Expected: PASS (3 tests).

- [ ] **Step 5: Replace inline formatters in `treatment-plans-tab.tsx`** — delete the local `currencyFormatter`/`formatCurrency`/`formatCurrencyIn` (lines ~210-224) and import the shared one:
```ts
import { formatCurrency } from '@/lib/format/currency';
```
Replace `formatCurrency(item.price)` → `formatCurrency(item.price, planDetail?.currency ?? 'USD')`; `formatCurrency(planDetail.total ?? 0)` → `formatCurrency(planDetail.total ?? 0, planDetail.currency)`; and every `formatCurrencyIn(x, cur)` → `formatCurrency(x, cur)`.

- [ ] **Step 6: Replace inline formatter in `dashboard-view.tsx`** — delete the local `currencyFormatter` (lines ~86-88), import the shared helper, and replace `currencyFormatter(incomes.currency).format(incomes.totalConverted)` → `formatCurrency(incomes.totalConverted, incomes.currency)` and `currencyFormatter(cur).format(amount)` → `formatCurrency(amount, cur)`.

- [ ] **Step 7: Replace inline formatter in `payment-receipt.tsx`** — swap its local `formatCurrencyIn` for the shared `formatCurrency(amount, currency)`.

- [ ] **Step 8: Run the affected component tests**

```bash
npm test -- treatment-plans-tab dashboard-view payment-receipt
```
Expected: PASS (existing tests still green — the formatter output for valid codes is unchanged).

- [ ] **Step 9: Commit**

```bash
git add src/lib/format src/components/treatment-plans/treatment-plans-tab.tsx src/components/dashboard/dashboard-view.tsx src/components/treatment-plans/payment-receipt.tsx
git commit -m "fix(web): crash-safe shared currency formatter (no RangeError on bad code)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: `CurrencySelect` component

**Files:**
- Create: `dentalix-web/src/components/molecules/currency-select.tsx`, `currency-select.test.tsx`

**Interfaces:**
- Consumes: `listCurrencies` (Task 8).
- Produces: `CurrencySelect({ id, token, value, onChange, disabled? })` — a native `<select>` whose options are `` `${name} (${symbol})` `` and whose values are ISO `code`. Fetches currencies once on mount; while loading shows the current `value` as the only option so the control is never empty.

- [ ] **Step 1: Write the failing test** at `src/components/molecules/currency-select.test.tsx`:

```ts
import { render, screen, waitFor } from '@testing-library/react';
import { CurrencySelect } from './currency-select';
import { listCurrencies } from '@/lib/reference/currencies-api';

jest.mock('../../lib/reference/currencies-api', () => ({ listCurrencies: jest.fn() }));
const mocked = listCurrencies as jest.MockedFunction<typeof listCurrencies>;

describe('CurrencySelect', () => {
  beforeEach(() => {
    mocked.mockReset().mockResolvedValue([
      { code: 'USD', name: 'Dólar estadounidense', symbol: '$' },
      { code: 'COP', name: 'Peso colombiano', symbol: '$' },
    ]);
  });

  it('renders fetched currencies as "name (symbol)" options with code values', async () => {
    render(<CurrencySelect id="cur" token="tok" value="USD" onChange={() => {}} />);
    await waitFor(() => expect(mocked).toHaveBeenCalledWith('tok'));
    const select = (await screen.findByLabelText(/moneda/i, { selector: 'select' }).catch(() => null)) as HTMLSelectElement | null;
    // The component is label-less on its own; query by role instead.
    const el = screen.getByRole('combobox') as HTMLSelectElement;
    await waitFor(() => {
      const opts = Array.from(el.options).map((o) => `${o.value}:${o.textContent}`);
      expect(opts).toEqual(expect.arrayContaining([
        'USD:Dólar estadounidense ($)',
        'COP:Peso colombiano ($)',
      ]));
    });
  });
});
```
(Note: the `findByLabelText` line is defensive and swallowed; the real assertion uses `getByRole('combobox')`.)

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -- currency-select
```
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** `src/components/molecules/currency-select.tsx`:

```tsx
'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { listCurrencies, type Currency } from '@/lib/reference/currencies-api';
import { cn } from '@/lib/utils';

// Same native-control fieldClass convention as patient-form.tsx / treatment-plans-tab.tsx.
const fieldClass =
  'flex h-10 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-50';

interface CurrencySelectProps {
  id: string;
  token: string;
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
  className?: string;
}

export function CurrencySelect({ id, token, value, onChange, disabled, className }: CurrencySelectProps) {
  const [currencies, setCurrencies] = useState<Currency[]>([]);

  useEffect(() => {
    let cancelled = false;
    listCurrencies(token)
      .then((data) => {
        if (!cancelled) setCurrencies(data);
      })
      .catch(() => {
        /* fail soft — keep the current value selectable below */
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Until the list loads (or if it fails), keep `value` selectable so the
  // control is never empty and never loses the current selection.
  const options = currencies.length > 0 ? currencies : [{ code: value, name: value, symbol: '' }];

  return (
    <select
      id={id}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={cn(fieldClass, className)}
    >
      {options.map((c) => (
        <option key={c.code} value={c.code}>
          {c.symbol ? `${c.name} (${c.symbol})` : c.name}
        </option>
      ))}
    </select>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm test -- currency-select
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/molecules/currency-select.tsx src/components/molecules/currency-select.test.tsx
git commit -m "feat(web): CurrencySelect molecule (options show name + symbol)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 11: Wire `CurrencySelect` into abono form, dashboard, new-plan

**Files:**
- Modify: `dentalix-web/src/components/treatment-plans/treatment-plans-tab.tsx`, `treatment-plans-tab.test.tsx`
- Modify: `dentalix-web/src/components/dashboard/dashboard-view.tsx`, `dashboard-view.test.tsx`

**Interfaces:**
- Consumes: `CurrencySelect` (Task 10).

- [ ] **Step 1: Replace the abono currency `<Input>`** in `treatment-plans-tab.tsx` (the `tp-payment-currency` FormField, lines ~1356-1364) with:

```tsx
<FormField htmlFor="tp-payment-currency" label={copy.paymentCurrencyLabel}>
  <CurrencySelect
    id="tp-payment-currency"
    token={token}
    value={paymentCurrency || (planDetail?.currency ?? 'USD')}
    onChange={setPaymentCurrency}
  />
</FormField>
```
Add `import { CurrencySelect } from '@/components/molecules/currency-select';`.

- [ ] **Step 2: Add a currency select to the "Nuevo plan" flow** — the current `handleCreatePlan` calls `createPlan(token, patientId, {})`. Add a `newPlanCurrency` state (default `'USD'`) and a small `CurrencySelect` next to the "Nuevo plan" button, then pass `{ currency: newPlanCurrency }`:

```tsx
const [newPlanCurrency, setNewPlanCurrency] = useState('USD');
```
In the plans `CardHeader`, wrap the button with the select:
```tsx
<div className="flex items-center gap-2">
  <CurrencySelect id="tp-new-plan-currency" token={token} value={newPlanCurrency} onChange={setNewPlanCurrency} className="w-44" />
  <Button type="button" onClick={handleCreatePlan} disabled={creatingPlan}>
    {creatingPlan ? copy.creatingPlan : copy.newPlan}
  </Button>
</div>
```
And in `handleCreatePlan`: `const created = await createPlan(token, patientId, { currency: newPlanCurrency });`.

- [ ] **Step 3: Update `treatment-plans-tab.test.tsx`** — add the currencies mock so the new selects render:
```ts
jest.mock('../../lib/reference/currencies-api', () => ({ listCurrencies: jest.fn() }));
```
In the test setup, `(listCurrencies as jest.Mock).mockResolvedValue([{ code:'USD', name:'Dólar', symbol:'$' }, { code:'COP', name:'Peso', symbol:'$' }])`. Fix any existing test that typed into the old free-text currency input to instead `selectOptions` the currency `<select>` (query `screen.getByLabelText(/moneda/i)`).

- [ ] **Step 4: Replace the dashboard currency `<Input>`** in `dashboard-view.tsx` (the `dashboard-currency` FormField) with:

```tsx
<FormField htmlFor="dashboard-currency" label={copy.currencyLabel} className="w-44">
  <CurrencySelect id="dashboard-currency" token={token} value={currency} onChange={setCurrency} />
</FormField>
```
Add the import. Remove the now-unused `copy.currencyPlaceholder`.

- [ ] **Step 5: Update `dashboard-view.test.tsx`** — add the `listCurrencies` mock (as in Step 3). Fix any test asserting on the free-text currency input to use the select.

- [ ] **Step 6: Run**

```bash
npm test -- treatment-plans-tab dashboard-view
```
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/treatment-plans/treatment-plans-tab.tsx src/components/treatment-plans/treatment-plans-tab.test.tsx src/components/dashboard/dashboard-view.tsx src/components/dashboard/dashboard-view.test.tsx
git commit -m "feat(web): use CurrencySelect in abono form, new-plan, dashboard filter

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 12: `CityCombobox` component

**Files:**
- Create: `dentalix-web/src/components/molecules/city-combobox.tsx`, `city-combobox.test.tsx`

**Interfaces:**
- Consumes: `searchCities` (Task 8).
- Produces: `CityCombobox({ id, token, countryCode, value, onChange, disabled? })` where `value: { id: number; name: string } | null`. Debounced (~250 ms) query to `searchCities({ countryCode, q })`; renders an input + a `listbox` of results; picking an option calls `onChange({ id, name })`. Disabled when `!countryCode`.

- [ ] **Step 1: Write the failing test** at `src/components/molecules/city-combobox.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CityCombobox } from './city-combobox';
import { searchCities } from '@/lib/reference/cities-api';

jest.mock('../../lib/reference/cities-api', () => ({ searchCities: jest.fn() }));
const mocked = searchCities as jest.MockedFunction<typeof searchCities>;

describe('CityCombobox', () => {
  beforeEach(() => {
    mocked.mockReset().mockResolvedValue([
      { id: 1, name: 'Bogotá', region: 'Bogota D.C.' },
      { id: 2, name: 'Bogotá Chico', region: 'Bogota D.C.' },
    ]);
  });

  it('is disabled without a countryCode', () => {
    render(<CityCombobox id="city" token="tok" countryCode={null} value={null} onChange={() => {}} />);
    expect(screen.getByRole('combobox')).toBeDisabled();
  });

  it('queries and lets the user pick a city', async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    render(<CityCombobox id="city" token="tok" countryCode="CO" value={null} onChange={onChange} />);
    await user.type(screen.getByRole('combobox'), 'bog');
    await waitFor(() => expect(mocked).toHaveBeenCalledWith('tok', { countryCode: 'CO', q: 'bog' }));
    const option = await screen.findByText('Bogotá');
    await user.click(option);
    expect(onChange).toHaveBeenCalledWith({ id: 1, name: 'Bogotá' });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -- city-combobox
```
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** `src/components/molecules/city-combobox.tsx`:

```tsx
'use client';
import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { searchCities, type City } from '@/lib/reference/cities-api';
import { cn } from '@/lib/utils';

const fieldClass =
  'flex h-10 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-50';

export interface CitySelection {
  id: number;
  name: string;
}

interface CityComboboxProps {
  id: string;
  token: string;
  countryCode: string | null;
  value: CitySelection | null;
  onChange: (city: CitySelection | null) => void;
  disabled?: boolean;
}

export function CityCombobox({ id, token, countryCode, value, onChange, disabled }: CityComboboxProps) {
  const [text, setText] = useState(value?.name ?? '');
  const [results, setResults] = useState<City[]>([]);
  const [open, setOpen] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // When the country changes, clear any prior city selection + text.
  const [prevCountry, setPrevCountry] = useState(countryCode);
  if (countryCode !== prevCountry) {
    setPrevCountry(countryCode);
    setText('');
    setResults([]);
    setOpen(false);
    if (value !== null) onChange(null);
  }

  useEffect(() => {
    if (!countryCode || text.trim() === '') {
      setResults([]);
      return;
    }
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      searchCities(token, { countryCode, q: text.trim() })
        .then((data) => {
          setResults(data);
          setOpen(true);
        })
        .catch(() => setResults([]));
    }, 250);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [token, countryCode, text]);

  function pick(city: City) {
    onChange({ id: city.id, name: city.name });
    setText(city.name);
    setOpen(false);
  }

  return (
    <div className="relative">
      <input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-listbox`}
        autoComplete="off"
        disabled={disabled || !countryCode}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (value !== null) onChange(null);
        }}
        className={fieldClass}
      />
      {open && results.length > 0 && (
        <ul
          id={`${id}-listbox`}
          role="listbox"
          className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-border bg-surface py-1 shadow-md"
        >
          {results.map((city) => (
            <li key={city.id} role="option" aria-selected={value?.id === city.id}>
              <button
                type="button"
                onClick={() => pick(city)}
                className={cn('block w-full px-3 py-2 text-left text-sm text-ink hover:bg-muted/10')}
              >
                {city.name}
                {city.region ? <span className="text-muted"> — {city.region}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm test -- city-combobox
```
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/molecules/city-combobox.tsx src/components/molecules/city-combobox.test.tsx
git commit -m "feat(web): CityCombobox molecule (debounced país-scoped city search)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 13: Wire Country select + `CityCombobox` into the patient form

**Files:**
- Modify: `dentalix-web/src/components/patients/patient-form.tsx`, `patient-form.test.tsx`

**Interfaces:**
- Consumes: `listCountries` (Task 8), `CityCombobox` + `CitySelection` (Task 12); `CreatePatientInput` now carries `countryCode?`/`cityId?` (from regenerated schema, Task 8).

- [ ] **Step 1: Add country + city state and fetch countries** — in `patient-form.tsx`, add imports:
```ts
import { listCountries, type Country } from '@/lib/reference/countries-api';
import { CityCombobox, type CitySelection } from '@/components/molecules/city-combobox';
```
Add state:
```ts
const [countries, setCountries] = useState<Country[]>([]);
const [countryCode, setCountryCode] = useState('');
const [city, setCity] = useState<CitySelection | null>(null);
```
Add a fetch effect:
```ts
useEffect(() => {
  let cancelled = false;
  listCountries(token)
    .then((data) => { if (!cancelled) setCountries(data); })
    .catch(() => { /* fail soft — country select just stays empty */ });
  return () => { cancelled = true; };
}, [token]);
```
Add labels to `copy`: `countryLabel: 'País'`, `cityLabel: 'Ciudad'`.

- [ ] **Step 2: Include the fields in the submit payload** — in `handleSubmit`'s `input` object, add:
```ts
...(countryCode ? { countryCode } : {}),
...(city ? { cityId: city.id } : {}),
```

- [ ] **Step 3: Render the country `<select>` + `CityCombobox`** — add a grid row after the address field:

```tsx
<div className="grid gap-5 sm:grid-cols-2">
  <FormField htmlFor="patient-country" label={copy.countryLabel}>
    <select
      id="patient-country"
      name="countryCode"
      value={countryCode}
      onChange={(e) => { setCountryCode(e.target.value); setCity(null); }}
      className={cn(fieldClass, 'h-10')}
    >
      <option value="">—</option>
      {countries.map((c) => (
        <option key={c.code} value={c.code}>{c.name}</option>
      ))}
    </select>
  </FormField>
  <FormField htmlFor="patient-city" label={copy.cityLabel}>
    <CityCombobox
      id="patient-city"
      token={token}
      countryCode={countryCode || null}
      value={city}
      onChange={setCity}
    />
  </FormField>
</div>
```

- [ ] **Step 4: Update `patient-form.test.tsx`** — add mocks for the new fetchers:
```ts
jest.mock('../../lib/reference/countries-api', () => ({ listCountries: jest.fn() }));
jest.mock('../../lib/reference/cities-api', () => ({ searchCities: jest.fn() }));
```
In `beforeEach`, `(listCountries as jest.Mock).mockResolvedValue([{ code:'CO', name:'Colombia' }])` and `(searchCities as jest.Mock).mockResolvedValue([{ id: 1, name: 'Bogotá', region: null }])`. Add a test:
```ts
it('renders País select and Ciudad combobox; city is disabled until a country is chosen', async () => {
  render(<PatientForm token="tok" />);
  const country = await screen.findByLabelText(/país/i);
  expect(screen.getByLabelText(/ciudad/i)).toBeDisabled();
  await userEvent.selectOptions(country, 'CO');
  expect(screen.getByLabelText(/ciudad/i)).not.toBeDisabled();
});
```

- [ ] **Step 5: Run**

```bash
npm test -- patient-form
```
Expected: PASS.

- [ ] **Step 6: Full frontend test + lint sweep**

```bash
npm test
npm run lint
```
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/components/patients/patient-form.tsx src/components/patients/patient-form.test.tsx
git commit -m "feat(web): patient form País select + Ciudad combobox

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification (after all tasks)

- [ ] Backend: `cd dentalix-api && npm run lint && npm run test && npm run test:int && npm run test:e2e` — all green (test DB migrated + seeded).
- [ ] Frontend: `cd dentalix-web && npm run lint && npm test` — all green.
- [ ] Manual smoke: start both, log in at `prueba.localhost:3001`, open a patient → create plan (pick COP) → register abono (currency is a select showing name+symbol) → confirm no crash when switching currencies; create a new patient → pick País → search Ciudad → save.
```
```

## Notes for the implementer

- **`country-state-city` data shape** (verify at implementation time via its types): `Country.getAllCountries()` → `{ isoCode, name, ... }`; `State.getStatesOfCountry(iso)` → `{ isoCode, name, ... }`; `City.getCitiesOfCountry(iso)` → `{ name, countryCode, stateCode, ... }`. If the package's method names differ in the installed version, adjust the seed accordingly (the contract the seed needs: a list of countries with iso2+name, and per-country cities with name + optional state code).
- **Seeding is slow** (hundreds of thousands of cities). Run it once locally and once against the test DB; CI should run `prisma migrate deploy` + `prisma db seed` before e2e.
- **Testing Library + native `<select>`:** use `userEvent.selectOptions`, and query the currency select via its label (the abono/dashboard FormField labels are "Moneda").
