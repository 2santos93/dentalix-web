# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Audiencia primaria — personal de clínicas y consultorios odontológicos de LATAM** (español
primario; también inglés y portugués/Brasil). Un mismo usuario puede pertenecer a varias
clínicas. Cuatro roles, siempre **por clínica** (`ClinicMembership`), con permisos distintos:

- **ADMIN** — rol máximo dentro de la clínica (confirmado 2026-08-07).
- **DENTIST** — odontólogo/a.
- **ASSISTANT** — asistente.
- **RECEPTION** — recepción.

> El rol **OWNER fue eliminado de forma definitiva**; ADMIN ocupa su lugar. No reintroducirlo.

**Superadmin de plataforma** (`User.isPlatformAdmin`): el operador de Dentalix, transversal a
todos los tenants. **No** es un `ClinicRole` — se otorga solo por migración, ningún endpoint lo
concede. Vive en el apex, no dentro de una clínica.

**Audiencia secundaria — prospectos** que llegan al apex (`dentalix.app`) y ven la landing de
marketing antes de existir como usuarios.

No hay un único escenario dominante: el equipo completo lo usa en **múltiples dispositivos por
igual** (móvil, tablet y escritorio) — el dentista junto al sillón, recepción en el mostrador,
el/la ADMIN revisando métricas. El diseño debe ser genuinamente responsive de móvil a escritorio,
sin optimizar para un solo dispositivo.

## Product Purpose

SaaS de gestión odontológica multi-clínica y **multi-sede**. Centraliza el núcleo clínico y
operativo de un consultorio: pacientes, historia clínica estructurada, odontograma interactivo,
agenda de citas, planes de tratamiento, **planes de pago con cuotas**, pagos multi-moneda,
consentimientos, catálogo de procedimientos, inventario/insumos, personal e invitaciones, y un
dashboard del doctor. El éxito es que una clínica opere su día a día (agendar, atender, registrar
clínica, cobrar, ver cuánto vendió) sin fricción y sin perder trazabilidad médico-legal.

## Positioning

SaaS **multi-tenant white-label**: cada clínica es un tenant aislado con su propio subdominio y
branding (color + logo). Diferenciadores del producto:

- **Odontograma interactivo** como proyección de eventos inmutables por diente (historial diente
  por diente), en notación FDI/ISO-3950.
- **Enfoque LATAM** (es/pt/en previstos desde el día 1).
- **Multi-moneda con tasas históricas por fecha**: cada pago congela la tasa vigente en su fecha,
  para totales históricamente exactos.
- **Multi-sede con ficha de paciente centralizada** (ver Operating Context), que es lo que la
  competencia LATAM ofrece y el punto de comparación del análisis de mercado.

## Operating Context

- **Multi-sede — una clínica con N sedes, ficha centralizada** (decisión del owner, 2026-08-01;
  confirmada 2026-08-07). No es "clínicas independientes agrupadas":
  - El **paciente pertenece a la clínica, no a la sede**: se atiende en cualquiera y su historia
    es una sola. `Patient`, `MedicalHistoryVersion`, `ToothRecord` y `DentalCatalogItem` **no**
    llevan sede.
  - Lo que sí es **por sede** son las operaciones: `Appointment`, `Payment`, `InventoryItem` e
    `InventoryMovement`.
  - **El aislamiento sigue siendo por tenant.** La sede es una dimensión de filtrado DENTRO del
    tenant, no un nivel de seguridad; el RLS (`app.current_tenant`) es la frontera dura. Los
    subdominios son por clínica, no por sede.
  - La **sede activa** vive en `localStorage` (`dentalix.activeLocationId`) porque el cliente HTTP
    la necesita en cada request; `null` = **"Todas las sedes"** → no se manda la cabecera y el
    backend devuelve la vista consolidada.
  - Pendiente (no confirmado como hecho): sede en `ClinicalEntry` (fase 4) y asignación de
    personal a sedes en `ClinicMembership` (fase 5).
- **El host decide qué producto se ve.** En un host de tenant (`clinica.dentalix.app`) la raíz
  redirige a `/login` y `/admin` devuelve 404. En el apex (`dentalix.app`) la raíz muestra la
  landing de marketing y `/admin` es el área de plataforma.
- Uso multi-dispositivo simultáneo dentro de una misma clínica; sesiones cortas y frecuentes
  (agendar una cita, registrar una evolución) y sesiones de lectura (dashboard, historia).
- Navegación por secciones: Dashboard, Pacientes (lista + detalle con **cuatro** tabs: Datos ·
  Historia clínica · Odontograma · Plan de tratamiento), Agenda, Personal, Inventario, Catálogo,
  Ajustes (Mi perfil · Horarios por sede). Los pagos viven dentro del tab de plan de tratamiento
  (`payment-plan-section`), no en un tab propio. El recibo de caja numerado por sede (DX-136,
  `payments/payment-receipt-dialog`; vista imprimible `/print/payments/[id]/receipt` en A4 o
  tirilla de 80 mm) se abre desde el plan, el estado de cuenta y la caja.
- Datos sensibles de salud: la historia clínica es documento médico-legal; hay auditoría de
  accesos e inmutabilidad (una corrección es una entrada nueva, no una edición).

## Capabilities and Constraints

- **Stack front:** Next.js 16 (App Router) + React 19, Tailwind v4 con design tokens (CSS
  variables en `src/styles/tokens.css` expuestas vía `@theme inline`), TypeScript strict,
  next-themes (modo claro/oscuro), primitivas Radix (dialog, select, tabs, label, separator,
  slot), `class-variance-authority` + `tailwind-merge`, iconos `lucide-react`, toasts con
  `sonner`, estado de sesión con Zustand.
- **Cliente HTTP tipado por contrato:** `src/lib/api/schema.d.ts` se genera con
  `openapi-typescript` desde el OpenAPI de la API (`npm run codegen`). **No usa TanStack Query**:
  los datos se cargan con `useState`/`useEffect` en componentes-vista que reciben el `token`.
- **Organización a preservar:** atomic design (`components/ui` atoms, `molecules`, `organisms`,
  `templates`) conviviendo con carpetas por dominio (`patients`, `odontogram`, `appointments`,
  `clinical`, `treatment-plans`, `inventory`, `catalog`, `locations`, `staff`, `platform`,
  `marketing`, `errors`, `profile`, `theme`).
- **White-label (restricción dura, confirmada):** cada tenant sobreescribe el color primario en
  runtime (SSR según host). El sistema visual debe verse cohesivo y correcto con **cualquier**
  color primario de cliente → identidad basada en una **base neutra clínica + acento tokenizado**,
  nunca dependiente de un tono de marca fijo.
- **i18n:** es / en / pt previstos desde el día 1. **Estado real hoy:** el copy está en español
  como constantes por componente, i18n-ready, sin librería de i18n ni cambio de idioma en UI. El
  layout no puede romperse con textos más largos.
- **Accesibilidad:** objetivo WCAG AA (contraste, navegación por teclado, ARIA), incluida la
  interacción del odontograma.
- Notación dental FDI/ISO-3950 en el odontograma (permanentes 11–48, temporales 51–85; 5 caras
  por diente). Impresión de recibo de pago con CSS de print dedicado (preservar).
- **Pruebas:** Jest + Testing Library por componente (co-locadas como `*.test.tsx`) y Playwright
  para e2e. Dev server en el puerto 3001; la API en el 3000.

## Brand Commitments

- Nombre del producto: **Dentalix**. Marca de nivel producto; la marca visible por pantalla puede
  ser la del tenant (white-label: logo + color propios).
- Restricción de identidad vinculante: la estética debe leerse **clínica, seria y confiable**
  (salud), y **funcionar bajo white-label** (ver Constraints). No hay una paleta de marca fija
  impuesta más allá de eso.

## Evidence on Hand

- **Código en producción de las capacidades listadas.** API (`dentalix-api`) con módulos
  `appointments, auth, clinical-entries, dashboard, dental-catalog, domains, exchange, inventory,
  invitations, location-schedule, locations, me, medical-history, odontogram, patients,
  payment-plans, payments, platform, public-branding, reference, staff, treatment-plans`.
- **Especificaciones y planes** en el repo de docs (`docs/specs/`, `docs/plans/`), incluido el
  análisis de mercado `docs/research/2026-07-30-gap-analysis-mercado.md`.
- **Capturas de pantalla reales** de agenda, odontograma, multi-sede, sidebar, plataforma y
  planes de pago en `~/Desktop/dentalix/*.png`.
- **Tenant demo** para verificación en local (`demo.localhost:3001`).
- **Ausencias que el trabajo futuro NO debe fabricar:** no hay testimonios, logos de clientes,
  casos de estudio, prensa, benchmarks, precios ni planes publicados. La landing actual no hace
  ninguna de esas afirmaciones y no debe empezar a hacerlas sin contenido real.

## Product Principles

1. **Multi-dispositivo real, no "responsive a la fuerza":** cada superficie debe ser excelente en
   móvil, tablet y escritorio; mobile-first como método, no como degradación.
2. **Claridad clínica antes que decoración:** es una herramienta de trabajo con datos sensibles;
   escanabilidad, jerarquía y consistencia mandan sobre la expresión.
3. **Cohesión sistémica:** todo sale de tokens y del sistema atómico; nada suelto ni ad-hoc.
4. **White-label por diseño:** la identidad vive en estructura, tipografía, espaciado y detalle —
   no en un color fijo — para tolerar el primario de cualquier clínica.
5. **Trazabilidad y confianza:** estados, permisos por rol e inmutabilidad médico-legal deben
   sentirse en la UI (nunca sugerir que algo se borró/editó cuando el modelo es append-only).
6. **La ficha es de la clínica; la operación es de la sede.** Toda superficie debe dejar claro si
   lo que se ve es consolidado o filtrado por sede, sin obligar al usuario a adivinarlo.

## Accessibility & Inclusion

Objetivo WCAG 2.1 AA: contraste suficiente en claro y oscuro y con cualquier primario de tenant,
navegación completa por teclado (incluida la selección de dientes/caras del odontograma),
roles/labels ARIA en menús, formularios y tablas, y layouts que toleran es/en/pt.
