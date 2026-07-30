# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Personal de clínicas y consultorios odontológicos de LATAM (español primario; también
inglés y portugués/Brasil). Un mismo usuario puede pertenecer a varias clínicas. Roles con
permisos distintos: **OWNER** (dueño/a), **DENTIST** (odontólogo/a), **ASSISTANT** (asistente),
**RECEPTION** (recepción), **ADMIN**. No hay un único escenario dominante: el equipo completo lo
usa en **múltiples dispositivos por igual** (móvil, tablet y escritorio) — el dentista junto al
sillón, recepción en el mostrador, el dueño revisando métricas. El diseño debe ser genuinamente
responsive de móvil a escritorio, sin optimizar para un solo dispositivo.

## Product Purpose

SaaS de gestión odontológica multi-clínica. Centraliza el núcleo clínico y operativo de un
consultorio: pacientes, historia clínica, odontograma interactivo, agenda de citas,
consentimientos, inventario/insumos, ventas/pagos multi-moneda y un dashboard del doctor.
El éxito es que una clínica opere su día a día (agendar, atender, registrar clínica, cobrar,
ver cuánto vendió) sin fricción y sin perder trazabilidad médico-legal.

## Positioning

SaaS **multi-tenant white-label**: cada clínica (o grupo) es un tenant aislado con su propio
subdominio y branding (color + logo). Diferenciadores del producto: **odontograma interactivo**
como proyección de eventos inmutables por diente (historial diente por diente), enfoque LATAM
(es/pt/en desde el día 1) y **multi-moneda con tasas históricas por fecha** (cada pago congela la
tasa vigente en su fecha, para totales históricamente exactos).

## Operating Context

- Uso multi-dispositivo simultáneo dentro de una misma clínica; sesiones cortas y frecuentes
  (agendar una cita, registrar una evolución) y sesiones de lectura (dashboard, historia).
- Navegación por secciones: Dashboard, Pacientes (lista + detalle con tabs: Datos · Historia
  clínica · Odontograma · Citas · Consentimientos · Pagos), Agenda, Personal, y Mi perfil.
- Datos sensibles de salud: la historia clínica es documento médico-legal; hay auditoría de
  accesos e inmutabilidad (una corrección es una entrada nueva, no una edición).

## Capabilities and Constraints

- **Stack front:** Next.js (App Router), Tailwind v4 con design tokens (CSS variables en
  `src/styles/tokens.css` expuestas vía `@theme inline`), TypeScript strict, next-themes (modo
  claro/oscuro), estado de sesión con Zustand, cliente HTTP tipado contra la API REST/OpenAPI.
  **No usa TanStack Query**: los datos se cargan con `useState`/`useEffect` en componentes-vista
  que reciben el `token`.
- **Atomic design** ya establecido y a preservar como organización: `components/ui` (atoms),
  `components/molecules`, `components/organisms`, `components/templates`.
- **White-label (restricción dura, confirmada):** cada tenant sobreescribe el color primario en
  runtime (SSR según host). El sistema visual debe verse cohesivo y correcto con **cualquier**
  color primario de cliente → identidad basada en una **base neutra clínica + acento tokenizado**,
  nunca dependiente de un tono de marca fijo.
- **i18n:** es / en / pt desde el día 1 (hoy el copy está en español como constantes, i18n-ready).
  El layout no puede romperse con textos más largos.
- **Accesibilidad:** objetivo WCAG AA (contraste, navegación por teclado, ARIA), incluida la
  interacción del odontograma.
- Notación dental FDI/ISO-3950 en el odontograma (permanentes 11–48, temporales 51–85; 5 caras
  por diente). Impresión de recibo de pago con CSS de print dedicado (preservar).

## Brand Commitments

- Nombre del producto: **Dentalix**. Marca de nivel producto; la marca visible por pantalla puede
  ser la del tenant (white-label: logo + color propios).
- Restricción de identidad vinculante: la estética debe leerse **clínica, seria y confiable**
  (salud), y **funcionar bajo white-label** (ver Constraints). No hay una paleta de marca fija
  impuesta más allá de eso — se decide en el nuevo mundo visual.

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

## Accessibility & Inclusion

Objetivo WCAG 2.1 AA: contraste suficiente en claro y oscuro y con cualquier primario de tenant,
navegación completa por teclado (incluida la selección de dientes/caras del odontograma),
roles/labels ARIA en menús, formularios y tablas, y layouts que toleran es/en/pt.
