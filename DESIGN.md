---
name: Dentalix
description: Ficha clínica — International Typographic system for a multi-tenant dental SaaS (UX System v2, 2026-10-30)
colors:
  primary: "#0E7490"
  primary-fg: "#FFFFFF"
  primary-hover: "#06637C"
  primary-text: "#06637C"
  primary-subtle: "#E5F6FC"
  primary-subtle-text: "#10556A"
  primary-border: "#B2D8E7"
  canvas: "#F7F9FC"
  surface: "#FFFFFF"
  surface-sunken: "#F1F5F8"
  surface-active: "#E8EDF3"
  border-subtle: "#E5E9EE"
  border: "#D8DFE6"
  border-input: "#838D98"
  ink: "#151C26"
  muted: "#5B6472"
  faint: "#6D7582"
  success: "#287C42"
  success-subtle: "#E5F9E8"
  success-text: "#1C5F31"
  warning: "#EFA831"
  warning-subtle: "#FEF3DD"
  warning-text: "#834B14"
  danger: "#C52C2A"
  danger-fg: "#FFFFFF"
  danger-subtle: "#FEEEEE"
  danger-text: "#A92321"
  info: "#2D6AC1"
  info-subtle: "#ECF3FE"
  info-text: "#1A52A1"
typography:
  display:
    fontFamily: "Inter (var(--font-sans))"
    fontSize: "1.5rem (1.75rem ≥ lg)"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.022em"
  title:
    fontFamily: "Inter"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: "-0.011em"
  body:
    fontFamily: "Inter"
    fontSize: "0.875rem (0.9375rem on pointer: coarse)"
    fontWeight: 400
    lineHeight: 1.43
  label:
    fontFamily: "Inter"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.385
  caption:
    fontFamily: "Inter"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.333
  data:
    fontFamily: "Inter"
    fontWeight: 500
    fontFeature: "tabular-nums"
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
  pill: "9999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "6": "24px"
  "8": "32px"
  "12": "48px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-fg}"
    hover: "{colors.primary-hover}"
    rounded: "{rounded.md}"
    height: "40px (44px touch)"
  button-secondary:
    backgroundColor: "{colors.surface}"
    border: "{colors.border}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "40px (44px touch)"
  input:
    backgroundColor: "{colors.surface}"
    border: "{colors.border-input}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "40px (44px touch, 16px text)"
  card:
    backgroundColor: "{colors.surface}"
    border: "{colors.border}"
    rounded: "{rounded.lg}"
    padding: "16px mobile / 24px sm+"
---

# Design System: Dentalix

<!--
DIRECTION CONTRACT (Operate · white-label · multi-device)
THESIS: Dentalix is a clinical record, not a "dashboard app." It refuses the
  sidebar-of-icon-cards-and-hero-metric look; authority comes from a strict grid,
  a precise type scale, tabular data, and hairline structure — never from chrome.
OWN-WORLD: Cool paper canvas + graphite ink + a single tokenized clinical accent
  (teal-blue by default, tenant-overridable). Hairline dividers, flat surfaces,
  tabular numerals everywhere numbers live. Recognizable with all content removed
  by its grid discipline and type rhythm, not by a color.
STORY: A clinician/receptionist scans a dense record instantly, trusts it
  (states, roles, immutability are legible), and acts with a single obvious
  primary action per view.
FIRST VIEWPORT: App shell = quiet left rail (md+) / bottom-safe on mobile; a
  precise page header (title + one support line); content as record-like
  sections and tables. The one primary action sits with the controls it works
  beside — in the filter bar on lists, in the header on records.
FORM: International Typographic clinical record (grounded direction A, user-pinned).
-->

## Overview

**Creative North Star: "The Clinical Record"**

Dentalix is a working medical document rendered for the screen. Its authority is
typographic and structural: a disciplined grid, an exact type scale, tabular
numerals, and hairline rules do the work that gradients, glass, and decorative
cards do in a generic dashboard. The interface recedes so the patient, the tooth,
the appointment, and the number stay in front.

Because the product is **white-label**, identity cannot live in a brand color: any
tenant may override the accent. So identity lives in the *system* — spacing rhythm,
type hierarchy, hairline structure, restrained flat surfaces — which stays cohesive
under any accent hue. The palette is a cool clinical paper with graphite ink and a
single tokenized accent used sparingly (primary actions, active state, focus).

Density is comfortable-but-efficient: enough air to scan, enough compression to see
a whole record. It is genuinely multi-device — mobile-first stacks that expand into
denser desktop grids, never a desktop layout crammed onto a phone.

**Key Characteristics:**
- Typographic authority over ornament; hairlines over shadows.
- One tokenized accent, used on ≤10% of any screen.
- Tabular numerals for every quantity, date, tooth number, and money value.
- Flat by default; elevation only for true overlays.
- Mobile-first, content-first; one clear primary action per view.

## Colors

A cool clinical paper base with graphite ink, one tokenized accent and four fixed
semantic hues. Authored in OKLCH (perceptually even lightness, so tenant colors
derive predictably) and shipped as hex. Source of truth: `src/styles/tokens.css`.
Every text pair is ≥ 4.5:1 and every control boundary ≥ 3:1, light and dark.

### Surfaces and lines
| Token | Light | Dark | Use |
|---|---|---|---|
| `canvas` | `#F7F9FC` | `#0B0F14` | app background |
| `surface` | `#FFFFFF` | `#13171F` | cards, panels, rows, inputs |
| `surface-sunken` | `#F1F5F8` | `#0E1219` | table header, hovered row, quiet fill |
| `surface-active` | `#E8EDF3` | `#1D232C` | selected row, pressed, neutral chip |
| `border-subtle` | `#E5E9EE` | `#1F252D` | rules inside tables and lists |
| `border` | `#D8DFE6` | `#292F39` | structure: cards, sections, secondary buttons |
| `border-input` | `#838D98` | `#676F7C` | control boundary (3.36 / 3.54 : 1) |

In dark mode surfaces **rise in lightness** instead of casting shadows.

### Text
- **Ink** `#151C26` / `#EEF0F4` — primary text and headings (17:1).
- **Muted** `#5B6472` / `#A2AAB6` — secondary text, labels, meta (≥ 5.1:1 on every surface incl. active).
- **Faint** `#6D7582` / `#89919D` — placeholders and tertiary meta only (4.65:1).

### Accent — the tenant's color
Default **Clinical Teal** `#0E7490` (oklch .52 .094 223): 5.36:1 with white, and
the only mid-chroma hue ≥ 70° away from danger, warning and success, so it never
reads as a status. The accent is a **family**, not one value:
`primary` (fill) · `primary-fg` (ink on fill) · `primary-hover` · `primary-text`
(links, active nav label, focus ring) · `primary-subtle` (selected bg) ·
`primary-subtle-text` · `primary-border`.

**The White-Label Rule.** A clinic picks one color; `src/lib/color/accent.ts`
derives the whole family for light and dark on the server, keeping the exact hex
when it passes 4.5:1 (with white, or with ink for light brands) and otherwise
shifting OKLCH lightness only. The root layout injects it. Components never
hardcode a hue and never put text in `primary` on a surface — text uses
`primary-text`.

**Choosing it (DX-019).** Ajustes › Datos de la clínica edits the color with a live
preview of the derived family in both themes, because contrast is never at risk: only the
exact hex may change. It warns (`lib/color/brand-color.ts`, never blocks) when white text
misses AA on the chosen color, saying whether buttons get a darker tone or dark text, and
when its OKLCH hue is < 30° from danger, warning or success (chroma ≥ .04). When the server
can't resolve the clinic (`*.localhost`, some custom domains) `BrandingProvider` fetches the
brand in the browser; after saving it swaps the brand in place, without a reload.

**The One Accent Rule.** The accent marks the primary action, the active item,
selection and focus — ≤ 10% of any screen. If a screen reads as "the teal
screen", pull back to ink and neutrals.

**The Status Rule.** The accent is never a status. Statuses use the fixed
semantic tones below, so a red or orange clinic can never make "Confirmada"
look like an alarm.

### Semantic (fixed, never tenant)
| Tone | Solid | Subtle bg | Text on subtle | Meaning |
|---|---|---|---|---|
| `success` | `#287C42` | `#E5F9E8` | `#1C5F31` | done, paid, attended |
| `warning` | `#EFA831` (ink on it) | `#FEF3DD` | `#834B14` | pending, partial, due soon, waiting |
| `danger` | `#C52C2A` | `#FEEEEE` | `#A92321` | no-show, overdue, rejected, clinical alert, destructive |
| `info` | `#2D6AC1` | `#ECF3FE` | `#1A52A1` | confirmed, in chair, in progress |
| `neutral` | — | `surface-active` | `ink` | draft, scheduled, cancelled, voided |

Chips and callouts use **subtle bg + `-text`**; solid fills are for the single
most urgent state or a destructive confirmation. Never white on amber.

## Typography

**Inter** (variable, optical-size axis) is the single UI family: largest
x-height of the candidates measured (7.6px at 14px), text forms at UI sizes and
display forms on headings from one file, 147 languages, slashed zero for IDs.
`cv05` is on globally so I / l / 1 never collide in names, IDs and doses.
Mono is the system stack, for code-like values only.

### Hierarchy (roles, not sizes)
- **Display** `.t-display` — 24/30 (28/36 ≥ lg), 600, -0.022em. Page titles and the patient name.
- **Title** `.t-title` — 16/24, 600, -0.011em. Section and card headers.
- **Body** — 14/20 desktop, **15/22 on touch** (`pointer: coarse`). Default UI copy and table cells.
- **Label** `.t-label` — 13/18, 500. Form labels, column headers.
- **Caption** `.t-caption` / `.t-overline` — 12/16, 500, muted. Meta, timestamps, group headings (sentence case, never all caps).
- **Data** `.t-data` / `.tnum` — tabular numerals; `.t-id` adds slashed zero for documents, record numbers, lots.

Fields render text at **16px on touch** so iOS never zooms on focus. Weights in
routine use: 400, 500, 600. Spanish runs ~25% longer than English: no
fixed-width buttons, and labels must survive +30%.

**The Tabular Rule.** Every quantity, date, money value, and FDI tooth number uses
tabular numerals so columns align and figures never jitter between states.
Tables get it automatically.

## Layout

Mobile-first. Base spacing is a 4/8px scale (`4 8 12 16 24 32 48`). The app shell is a
persistent left rail from `md` up (collapses to a compact top bar + bottom-safe actions
on mobile); content sits in a centered column, `max-width` ~72rem, with generous gutters.
Sections and tables read like a record: a labeled header, hairline-separated rows,
comfortable row height (44px touch target min). More space above a heading than below it.
Page header pattern: the header is IDENTITY — title (Display) left, one support line
under it capped at a prose measure (~68ch), and a scope marker when the screen's data
is clinic-wide. Nothing else.

The primary action sits with the controls it is used beside, not over the title:
- **Lists** (patients, catalog, inventory, staff, agenda): in the filter bar, right
  aligned, same row as search and filters. It stretches to the bar's width on mobile
  and closes the block — find first, then create.
- **Records and forms** (patient record, staff member, profile): in the header's action
  slot, aligned to the title's first line, because there is no filter bar to belong to.

Vertical rhythm on a list page is deliberately uneven: 32px between the header and the
rest — the page's largest interval — then 12px inside the bar → count → table → pagination
block, which reads as one gesture. Lists render through `DataList` (see Components → Tables):
a real table from `sm` up, compact two-line cards on phones.

## Elevation & Depth

**Flat by default.** Surfaces sit on the paper with a 1px border, not a shadow. Depth
appears only for true overlays and transient state.

### Shadow Vocabulary
- **Overlay** (`--shadow-overlay`): dialogs, sheets, dropdowns, popovers, toasts — the only things that float.
- **Hover-lift** (`box-shadow: 0 1px 2px rgb(15 23 42 / 0.06)`): the only rest-state shadow, for interactive cards on hover.

**The Flat-By-Default Rule.** A card at rest has a border, not a shadow. Shadows are a
response to state (hover, focus) or a signal of layering (overlay), never decoration.

## Shapes

Restrained radii: **6px** (sm — chips, inputs' inner elements), **8px** (md — buttons,
inputs, small cards), **12px** (lg — cards and panels), pill for status chips and avatars.
1px borders in the border/hairline tokens; no colored `border-left` accents thicker than
1px. Corners are consistent within a component family; no mixed radii on one element.

## Components

### Buttons
- **Shape:** 8px radius, medium weight; 40px (`sm` 32px, `lg` 44px), and **44px on touch** for every size (`pointer: coarse`).
- **Touch sizing:** the 44px comes from the primitive (`pointer-coarse:h-11` / `size-11`, `sm` and `icon-sm` included); fine-pointer desktop keeps `sm` at 32px. To make a button 44px on a narrow window too, add `max-sm:min-h-11` (and `max-sm:min-w-11` for an icon), never `max-sm:h-11`/`max-sm:size-11`: Tailwind emits `pointer-coarse:` after `max-sm:`, so a fixed phone height loses to the primitive's on a real phone. `src/architecture/touch-target-guard.test.ts` enforces it. `e2e/touch-targets.spec.ts` (Playwright project `touch`: `hasTouch` + `isMobile`, 390px) measures the real targets.
- **Primary** (`default`): `primary` fill + `primary-fg`, hover `primary-hover`. One per view.
- **Secondary:** surface + 1px `border` + ink; hover `surface-sunken` with `border-input`.
- **Outline / Ghost:** transparent; hover `surface-sunken`.
- **Destructive:** solid `danger` + `danger-fg`, only inside a confirmation. **Destructive-ghost**
  (`danger-text`, hover `danger-subtle`) is the row/menu form.
- **Link:** `primary-text`, underline on hover.
- **Focus:** 2px `primary-text` outline, 2px offset — the one focus ring of the product. Never removed.

### Inputs / Fields
Built on `fieldClass` + `controlHeight` (`src/lib/ui/field-class.ts`) — the single recipe.
- **Style:** surface bg, 1px **`border-input`** (≥ 3:1, so a field is findable), 8px radius,
  40px (44px touch, 16px text), ink text, `faint` placeholder. Hover: border → `muted`.
- **Focus:** border → `primary-text` + a 3px `primary/20` halo. No offset ring.
- **Error:** `aria-invalid` → danger border (+ danger halo on focus) and an `InlineError`
  that names the problem and the fix.
- **Disabled:** `surface-sunken` fill, `border`, muted text — never opacity alone.

### Form Controls
Every control a person fills in comes from `src/components/ui/`. They are real native
elements, restyled, never re-implemented: the OS picker on phones, the keyboard behaviour
people already know, and `selectOption`/`check()` in e2e all keep working.
- **`NativeSelect`** — `<select>` on `fieldClass` with a drawn chevron; `size="sm"` (32px)
  for dense toolbars, 44px on touch either way. `className` lays out the wrapper. Long or
  dynamic lists (patients, catalog) are a combobox, not a select.
- **`Textarea`** — `fieldClass`, 80px minimum, resizes vertically; `autoGrow` for notes and
  reasons that should grow with the text.
- **`Checkbox`** — 16px box (20px on touch), 4px radius, `border-input` boundary; checked =
  accent fill + check, `indeterminate` = dash. `label` + `description` make the whole row the
  target (44px on touch); the name is the label, the description is the description.
- **`RadioGroup`** + **`RadioOption`** / **`RadioCard`** — a `fieldset role="radiogroup"`
  with a `legend`. Cards (the 12 h / 24 h choice) are for options that need a line of
  explanation: selected = `primary-border` + `primary-subtle`. The group's hint and error
  reach every option.
- **`Switch`** — `<input type="checkbox" role="switch">`, 36×20 track, for settings that
  apply at once. Off is a solid `border-input` track you can see; on is the accent. A choice
  that waits for a Save button is a `Checkbox`.

All of them plug into the error ladder the same way (rung 4): `NativeSelect` and `Textarea`
sit inside `FormField` with `id`, `aria-invalid` and `aria-describedby={fieldErrorId(id)}`;
`Checkbox` and `RadioGroup` take `error` and render the same `InlineError` with the same id.

**The Raw Control Rule.** No `<select>`, `<textarea>`, `type="checkbox"` or `type="radio"`
outside `src/components/ui/`. A jest guard (`form-controls-guard.test.ts`) enforces it as a
ratchet: `form-controls-allowlist.json` freezes the files that still had raw controls when
the primitives landed (246 in 118 files). A new file with one, or a listed file with one
more, fails CI; so does a listed count that has dropped without the list dropping with it.
Each migration wave shrinks the list in the same commit. The goal is `{}`.

### Money Fields
Every amount a person types goes through `<MoneyInput>` (`src/components/shared/money-input.tsx`)
and is read with `parseMoneyInput(text, currency)` (`src/lib/format/money.ts`). No screen
parses an amount its own way: no component (or page) calls `Number(…)`/`parseFloat(…)`/
`parseInt(…)` on a money field's text, keeps a `parseAmount`-style parser of its own, or
renders a money field as `type="number"` — a jest guard (`money-guard.test.ts`) fails CI
if one does.

**The Amount Rule.** The same keystrokes mean the same amount everywhere, on a Spanish or
an English keyboard:
- The **last** separator (`.` or `,`) followed by 1–2 digits is the decimal: `150.50` and
  `150,50` are both 150,50.
- Thousands use `.`, `,` or a space, always in groups of 3 and with one separator:
  `150.000`, `1,500.25`, `1 500 000,25`.
- Anything else (`1.50.0`, `1.500,000`, a trailing separator) is **ambiguous**: the form
  does not submit and the field says why, in Spanish, next to it (rung 4, `InlineError`
  via `FormField`, with `aria-invalid` + `aria-describedby`). Asking beats storing 100×.
- Up to 2 decimals in **every** currency, COP and CLP included: the API and the database
  store every amount with cents (`Decimal(…, 2)`), so a COP price or balance with cents
  that pre-fills a field saves untouched. The server stays the authority on amounts.
- An amount pasted as the app paints it (`1.500.000,50 US$`, `150.000,00 COP`, `150,50 €`,
  Intl's hard spaces included) reads the same; another currency's code does not.
- Above the API's cap (9.999.999.999,99) the field says so instead of sending it.
- Text input with `inputMode="decimal"`, never `type="number"` (it silently drops a
  Spanish keyboard's comma).

**The Preview Rule.** Under every amount field the interpreted value reads
«Se guardará: 150,50 US$», formatted with `formatCurrency`. It is an `aria-live="polite"`
line the input points at with `aria-describedby`, and it updates once the person stops
typing (500 ms), so a screen reader announces it once — not per keystroke. While the form
shows that field's error, the preview stays silent so the message is not read twice.
A filter (e.g. Cartera's minimum balance) uses the same parser but no preview: nothing
is saved.

### Money (display)
Every amount on screen, on paper (receipts, statements, prints) and in a user-facing CSV is
painted by ONE helper: `formatCurrency` (`src/lib/format/currency.ts`) or, where the sede is
known, `moneyWithCode`/`sedeMoney` (`src/lib/format/sede-number.ts`). No screen builds an
`Intl.NumberFormat({ style: 'currency' })` of its own.

**The Code Rule (DX-378).** An amount carries the ISO 4217 **code** of its currency
(«450,00 USD», «VES 1.234,50»), never a CLDR symbol: in a multi-currency product «$» or
«US$» do not mean the same in every country. Decimals follow DX-340 (2, or 0 for a
currency without minor units when the amount is whole); separators follow the locale.

**The Currency Text Rule (DX-517).** A clinic may say how it writes a currency it uses
(Ajustes › Monedas, ADMIN only, audited): a map ISO code → text of 1–8 characters on one
line («VES» → «Bs.»). When a currency has a text, that text takes the **code's place, in the
position and with the spacing the locale gives the code** — «Bs. 1.234,50» in `es-VE`,
«1.234,50 Bs.» in `de-DE` (`moneyWithCurrencyText`, `src/lib/format/currency-text.ts`).
Without a text, nothing changes: the code, exactly as before.
- The map arrives with the clinic's branding (root layout) and is set in the browser before
  any child paints (`CurrencyTextsSync`), so the ~170 call sites never thread it. It is never
  set on the server (module state is shared by every clinic's requests). When the server
  cannot resolve the clinic (custom domain, `*.localhost`) the tab paints with its last
  copy and asks the branding from the browser; a different map remounts the tree once.
- A receipt **freezes** the map in its snapshot when issued; it is painted (screen, print,
  email) with the frozen map, never today's: reprinting an old receipt never changes it.
- The API formats the same way (`fmt.money(amount, currency, texts)`): the receipt email
  and the reminder say exactly what the screen says. Web and API share golden vectors
  (`currency-text.cases.json`, byte-for-byte copy checked in CI).
- No country's symbol lives in code or in a default: the map starts empty.
- A pasted amount written with the clinic's text («Bs. 1.234,50») reads like the code.

### Dates and times
No native `<input type="date">`, `type="time"` or `type="datetime-local"`: the browser paints
them in ITS language, not the clinic's — a Spanish receptionist on an English Chrome sees
`mm/dd/yyyy` and 04/05 changes month. In a clinical record that is a patient-safety bug. Use
the primitives in `src/components/ui` (react-aria segmented fields); a jest guard
(`src/architecture/native-date-input-guard.test.ts`) fails CI on a new native one, and its
allowlist of not-yet-migrated files only shrinks.

- **Which one:** a date the person already knows (birth date, a document's issue date) →
  `DateField`, typed only, no calendar. Birth date adds `showAge` («26 años» next to it) as
  instant verification. A date to schedule or filter → `DatePicker` (typed segments + calendar
  button; popover on desktop, bottom sheet under 640px). A period → `DateRangePicker` («Desde –
  Hasta» in one field, range calendar, optional `presets`: Hoy · Últimos 7 días · Este mes · Mes
  anterior). A clock time → `TimeField` (12/24 h from the sede).
- **ISO in, ISO out:** `value` is `'YYYY-MM-DD'` (`'HH:mm'` for time; `{ from, to }` for a
  range) or `null`, `onChange` returns the same. Only **complete** dates leave the field: while
  the year is being typed (`2`, `20`, `202`) it emits `null`, never `0002-10-05`; the segments
  keep what was typed. A parent that passes a new `onChange` on every render changes nothing
  inside the field (stable internal callbacks).
- **Enter submits:** Enter in any segment submits the enclosing `<form>` (`requestSubmit()`),
  like a native input. No screen adds its own handler for it. `name` (`startName`/`endName`) renders a hidden
  input with the ISO value so `<form>`/`FormData` keep working. `min`/`max` are ISO too.
- **Locale from the clinic, never the browser:** `SedeDateLocaleProvider` (in the app shell)
  feeds the active sede's `locale`, `hourCycle` and time zone to every field: segment order
  (`dd/mm/aaaa` in Spanish), first weekday, and which day is «today». Without a provider the
  fields fall back to `es`, never to the browser's language.
- **Labels:** inside `FormField`, pass `id={htmlFor}`; the field names itself with
  `aria-labelledby={fieldLabelId(id)}`. Outside one, pass `label`. Invalid state with
  `isInvalid` or `aria-invalid` (danger border, like every field).
- **Inside a dialog or sheet:** the calendar lives in its own (react-aria) portal, so it is
  marked `data-nested-layer`, takes pointer events back (`pointer-events: auto`) and, while
  open, pauses the Radix focus trap underneath (a Radix `FocusScope` of the same version as
  `react-dialog`, pinned in package.json). A click or focus inside it is not «outside» the
  dialog, and Escape closes the calendar only; a second Escape closes the dialog.
- **Look:** the segment group is a `fieldClass` field (border-input, accent focus halo, danger
  when invalid, 44px on touch). Calendar cells 40px (44px coarse), today = accent ring,
  selected = solid accent, outside-month muted.
- **E2E:** segments have no `.fill()`. Use `fillDate` / `fillDateRange` / `fillTime` from
  `e2e/support/dates.ts`; they type per segment, so any locale order works.

### Cards / Containers
- **Corner:** 12px. **Background:** surface. **Border:** 1px `border`. **Shadow:** none at rest — ever.
- **Padding:** 16px on phones, 24px from `sm`. No nested cards; use `border-subtle` sections inside.

### Dialogs and form modals
- **`FormModal`** (create / edit a thing) is a centered modal from `sm` up and, **below 640px, a
  full-screen sheet**: no corners, the form scrolls, the footer stays pinned to the bottom with
  the primary full width on top of Cancel. `fullScreenOnMobile={false}` keeps a short form
  floating. Any other `DialogContent` opts in with `fullScreenOnMobile` (e.g. signing a consent
  on the phone) — never with copied `max-sm:` classes.
- **Validation is ours:** the form is `noValidate`, so a native `required` on a `RadioGroup` or
  `Checkbox` never pre-empts the form's own rung-4 errors. Text fields with `required` keep the
  browser check as a safety net until the screen validates them itself and passes
  `ownValidation`.
- `Checkbox` keeps the same DOM with or without `error`/`description`: focusing the field with
  the error before or after painting it is the same.

### Status tones (one vocabulary)
Every domain status gets its tone and label from ONE map, `src/lib/status/tones.ts`,
typed with the API enums (a new backend status breaks `tsc` until it is placed here).
Screens never pick a status color. Five tones, fixed, never the tenant accent:

| Tone | Means | Examples |
|---|---|---|
| `success` | done and fine | Completada, Pagada, Realizado, Vigente, Verificado, Emitida |
| `warning` | needs an action or a wait | Pendiente, Parcial, En espera, Listo para cobrar, Presentado, Reabierta |
| `danger` | went wrong or expired | No asistió, Vencida, Rechazado, Incumplido, Con errores, Correo: Falló |
| `info` | in progress, acknowledged | Confirmada, En sillón, Aceptado, Abierta, Importando |
| `neutral` | nothing yet, or closed without judgment | Agendada, Borrador, Cancelada, Anulado, Inactivo |

- One word, one tone, everywhere: «Anulado» is neutral (an immutable record withdrawn,
  not an error); «Pendiente» and «Parcial» are warning; «Vencido» is danger.
- Rejected ≠ cancelled: the patient said no (danger) vs. the plan was withdrawn (neutral).
- Payment methods are categories, not statuses: neutral chip, no dot.
- Labels are adjectives in sentence case and reuse the copy the UI already showed.
- A chip whose text carries detail («Enviado 12 oct 10:30») passes its own text; the
  tone still comes from the map.

### Chips / Badges
- **`StatusBadge kind status`** for any domain status: pill, tinted bg + same-hue text,
  leading dot so color is never the only cue. `Badge variant` (`neutral | info | success |
  warning | danger`) for non-status flags («Saldo vencido», «Adelantar si hay hueco»).
- `primary` badges mark brand/selection only («Actual», «Tú»), never a status.
- Counters on buttons are neutral (surface-active + ink), not accent.

### Segmented control
`SegmentedControl`: pick ONE of 2–5 sibling views (Mes/Semana/Día, the cash period,
dentition). Sunken track, selected segment on surface with ink — never a solid accent.
`radio` semantics by default (radiogroup, one tab stop, arrows select); `toggle`
(`aria-pressed` buttons) where e2e already finds them as buttons; `activation="manual"`
when choosing opens a confirmation. `size sm | md`, `fullWidthOnMobile`. Sections with
their own content use Tabs, not this. Track 40px (`sm` 32px) as a *minimum*, never a fixed
height; on touch every segment is **44px** (either size) and the track grows to hold it, so a
modal's `touchTargets` never clips a segment.

### Wizard
`Wizard steps current onStepChange` (`ui/wizard.tsx`): from `sm`, one row of step buttons with one-line labels on a shared underline (`aria-current="step"`); below `sm`, «Paso 2 de 5 · Antecedentes» + a thin `progressbar` — labels never hyphenate. `optional: true` adds «(opcional)»; a wizard whose later steps are optional offers its final action (e.g. «Crear paciente») from step 1, in a bottom action bar that sticks on phones.

### Tabs
`Tabs`/`TabsList`/`TabsTrigger`/`TabsContent` (Radix), or `TabBar` when the page renders
the panels itself (URL-synced tabs: caja, gastos, reportes, horarios, patient record).
Underline in ink on the active tab, muted labels otherwise. Manual activation: arrows
move focus, Enter/click select (panels fetch on mount). When tabs overflow, the strip
scrolls sideways with faded edges — a clipped tab must never look like the last one —
and the active tab is always scrolled into view.

### Callout
`Callout tone title icon action`: something the user must know or do on THIS screen
(rate missing, late cancellation, chart shown at a past date). Tinted bg of the tone,
ink text, tone icon. `warning`/`danger` default to `role="status"`; pass `role="alert"`
only when it appears in response to an action. Not for load/save failures — those use
the error ladder below.

### Description list
`DescriptionList` (`columns 1–3`, `layout stacked | inline`) + `DescriptionItem`
(`numeric` → tabular, `wide`). Label `t-overline`, value ink. Replaces every local
`Field`/`Fact`/`Row`/`Detail` helper; paper documents keep their print CSS.

### Section header
`SectionHeader title description actions as`: the heading of a block inside a page
(`t-title`), with its actions on the right (below on mobile). `PageHeader` is the page's.

### Avatar
`Avatar initials src size` with `initials()` from `lib/format/initials`. Neutral circle
(surface-active + ink), photo when available. Never the accent: a row of brand-tinted
circles spends the accent budget on decoration.

### Tooltip and Popover
`Tooltip content`: a short label for icon-only controls, shown on hover AND keyboard
focus (`title=` does neither on touch/keyboard). Never the only accessible name.
`Popover`: anchored interactive layer (filters, pickers). Both float: surface + border +
`shadow-overlay`.

### Error States
Severity follows what a user can still do, not how bad the failure sounds. The
test for picking a rung: when the error state is truthy, what disappears from
the screen? Four rungs, one component each, in `src/components/errors/`:

1. **Section** (`SectionError`) — the section has nothing to show. Fills the
   content's own slot with `EmptyState`'s geometry (12px radius, `px-6 py-16`)
   but a solid border instead of dashed, so "empty" and "broken" read as one
   system. Icon in a `danger/10` chip, title in `ink`, primary retry button.
   `role="alert"`.
2. **Field** (`FieldError`) — a control failed to load its own options; the
   rest of the section still works. Replaces the control in place, matching
   its height, so nothing shifts and nothing sits broken wearing a normal
   face. `danger/40` border, `danger/5` fill, icon-button retry. `role="status"`
   — polite, not alert. Not for the result of an action, and not for a
   component that early-returns leaving nothing behind — that's rung 1,
   however small the section.
3. **Background** (`notifyError()`) — a background refresh or a row action
   failed and the content on screen is still correct. Toast with a retry
   action; never touches layout, never leaves a permanent red mark.
4. **Form** (`InlineError`) — validation or a failed submit. A line with an
   icon next to the control that caused it, `role="alert"`.

**The Rung Test.** No height class passed to a `FieldError` (nothing to
match), a label over four words (it's carrying section-level weight), or
softening a pre-existing `role="alert"` to `"status"` — each is a tell that
rung 2 was picked for what is really a section failure.

**The Way-Out Rule.** No error surface exists without a retry — a
`SectionError` button, a `FieldError` icon-button, or a toast action.
"Intenta de nuevo." drops from the copy only when the surface already carries
one of these; `InlineError` has none, so it keeps the phrase. A toast's retry
must never close over stale component state — reuse an existing reload
mechanism (a functional state updater has a stable identity) rather than a
ref kept in sync by hand (`react-hooks/refs` rejects assigning one during
render). Exception: a closure is fine when what it captures *is* the
operation, not ambient state — `onRetry: () => handleStatusChange(id, status)`
closes over `id`/`status`, the retry's own arguments, so there's nothing to
go stale. The test: can the captured value change before the retry fires
without the retry being wrong? If yes, it's ambient state and needs the
reload-mechanism treatment; if the value *is* what's being retried, close
over it directly. A modal that stays open on failure makes its own toast
inert underneath it; close the dialog on failure too. And a toast that carries
an action does not expire — it is reporting something that was left undone, so
letting it lapse leaves the divergence with nobody informed. The close button
is the way out.

**A failed retry stays on its own rung.** When a rung-1 retry fails again, ask
the Rung Test once more: nothing new disappeared, the section still has nothing
to show — so it is still rung 1. The surface stays with the new message; it does
not sprout a rung-3 toast beside itself, because rung 3's precondition (content
on screen and still correct) does not hold. In practice: wire a rung-1 retry to
the reload key that re-runs the load, not to the background-refresh function
that shares its fetch — those two look interchangeable and are not.

### Tables
- **Header:** `t-label`, muted, **sentence case** — never `uppercase` + tracking (no per-column
  override to undo it). **Rows:** hairline separators, 44px min height,
  hover = surface-2. **Numbers:** right-aligned, tabular.
- **Lists use `DataList`** (`components/ui/data-list.tsx`): one column declaration, rendered as a
  real `<table>` from `sm` (640px) up and as a `<ul>` of compact cards on phones — two markups
  chosen by `matchMedia`, only one mounted (no duplicate DOM; without `matchMedia` — server,
  jsdom — the table renders). Each column declares its phone role with `mobile`:
  - `primary` — line 1, left, ink 15px/600 (one per list; defaults to the first column); it
    wraps to **two lines** before an ellipsis (`line-clamp-2 break-words`), so titles that share a
    prefix or long file names stay distinguishable;
  - `trailing` — line 1, right: the key value (amount, time, age; tabular) or the status badge;
  - `meta` (default) — line 2, muted 13px, values joined with « · », blanks skipped (return
    `null` from `mobileCell`, never «—»); it wraps, never truncates (documents and phones must
    stay readable);
  - `hidden` — off the card (it lives on the record). **Never hide money.**
  With `getRowHref`/`onRowClick` the whole card is the tap target (≥56px) with a trailing
  chevron, and on desktop the primary cell's link is stretched over the row (one link per row
  for screen readers). Row actions go in `rowActions` → the `RowActions` «⋯» menu, outside the
  card's link (44px on touch); an item's `onSelect` runs once the menu has handed focus back to
  the «⋯», so a Dialog it opens returns focus to that row when it closes — no timers in screens; never a labelled «ACCIONES» row or column of buttons. `leading` puts an avatar or
  icon before the primary cell; `showFrom` drops low-value columns on a narrow tablet.
- **Comparison tables** (read down a column: caja del día, reportes, perio) opt out with
  `phone="scroll"`: the table stays a table on phones, scrolls sideways inside its frame with
  the first column sticky. A bare `Table` keeps the legacy stacked labelled cards below `sm`
  (`stack={false}` turns that off); new lists don't use it.
- **Exception — rows with a muted support line** (the `/settings` index, DX-282): hover = bg
  (Cool Paper), not surface-2. Muted on surface-2 is 4.34:1 and fails AA for body text; on bg
  it is 4.51:1. Rows whose secondary text is muted use bg on hover; rows of ink only keep surface-2.
- **Wider than its slot** (six columns on a tablet in portrait, where the rail already takes
  240px): the table scrolls sideways *inside its own frame* — the page itself never scrolls
  horizontally. A frame that scrolls must say so: when it actually overflows it becomes a
  focusable, named region, so the last columns are reachable without a mouse, and it carries
  edge shadows on the sides that still hide content (`.scroll-x-shadows` — pure CSS, no
  scroll listener). A table that fits gets neither: no stray region, no dead tab stop.

### Navigation (App Shell)
Source of truth: `src/components/layouts/nav-config.ts` (groups, role gating, bottom-bar
picks) and `app-shell.tsx`. Every entry's `roles` copies the API's `@Roles(...)` for the
screen it opens; a group with no visible entries disappears.

- **Information architecture.** Grouped by moment of work, not flat:
  (no heading) Dashboard · Agenda · Pacientes — *Atención*: Pendiente de cerrar, Presupuestos,
  Anamnesis (the visible label is short; the accessible name and `title` stay «Anamnesis por
  revisar»; both queues carry their count) — *Finanzas*: Caja, Cartera, Gastos, Descuentos,
  Reportes — *Clínica*: Catálogo, Inventario — *Administración*: Personal, Ajustes. New
  sections join a group; they never become a sixth flat item.
- **The 900px budget.** ADMIN's sidebar holds **15 entries** and fits a 1440×900 window with
  no scroll (expanded ~5px to spare, rail ~3px; `e2e/sidebar-scrollbars.spec.ts` guards it).
  A new entry must *replace* one, never just be appended; the rail's 44px targets cannot
  shrink. Precedent (M2, DX-439): «Pendiente de cerrar» joined *Atención* and **Auditoría
  moved into Ajustes** (since B6 under «Herramientas y registros», next to «Accesos de soporte»): it already lived
  at `/settings/auditoria`, it is a monthly ADMIN-only check, not daily work, and the ⌘K
  palette still finds it by typing. Its page carries «← Ajustes» like every settings screen.
  The next candidate to fold is a low-frequency admin screen, never a daily queue.
- **Brand.** The shell shows the **clinic's** brand (white-label): its logo, or an initials
  tile (`primary-subtle` + `primary-subtle-text`) + name. «Dentalix» appears only when the
  tenant has no name (the `Logo` SVG monogram, never an emoji). Public pages and paper use
  `ClinicBrand` / `ClinicLogo` (`components/brand/clinic-brand.tsx`), never a hand-copied `<img>`.
- **Desktop (≥1024px): grouped sidebar**, 240px, surface + right border, collapsible to a 64px
  icon rail (preference remembered in `localStorage`). Group headings are `t-overline`
  (muted, no tracking caps), 16px above each group; in the rail, a `border-subtle` rule
  replaces the heading (a 1px rule, no margin: the rail's 44px targets stack edge to edge). Items:
  icon 16px + label, 32px min height (so ADMIN's 15 entries, 4 headings, header and footer fit a
  900px-high window without scrolling), 6px radius, **never wrap**
  (`whitespace-nowrap`, truncate). Active = `primary-subtle` bg + `primary-subtle-text`;
  hover = `surface-sunken`. Header: brand + collapse control, then a search trigger showing
  the shortcut (⌘K / Ctrl K). Footer: sede switcher above the account card; the role under the
  name is `muted`, never the accent.
- **Tablet (768–1023px):** the same sidebar, as the icon rail by default (names in
  `aria-label` + `title`); it can be expanded for the moment without changing the desktop
  preference.
- **Phone (<768px):**
  - *Top app bar* (56px + `env(safe-area-inset-top)`): clinic brand left (it gets the width),
    sede switcher as a 44px pill — map-pin + short label («Norte», «Todas», max ~6.5rem) over an
    invisible native select, accessible name «Sede: {full name}» — search button (opens the
    palette), account avatar. It
    does **not** repeat the page title — the page's H1 is the title.
  - *Bottom tab bar* (56px row inside a container padded with `env(safe-area-inset-bottom)`):
    four role-based destinations + «Más», icon 20px + label always visible. ADMIN: Inicio,
    Agenda, Pacientes, Caja. RECEPTION: Agenda, Pacientes, Presupuestos, Caja. Clinical roles:
    Agenda, Pacientes, then Presupuestos → Anamnesis → Inventario → the next entry they can see.
    Active tab = `primary-text` icon + label + a 2px indicator on top; «Más» takes the active
    look when the current section lives in the sheet. The bar sits in the shell's flex column
    (last row of a `100dvh` shell), so it never covers content and pages need no bottom
    padding; it hides while the virtual keyboard is open (`visualViewport` heuristic).
    Tabs are destinations, never actions (no centre «+»).
  - *«Más» sheet*: bottom sheet, 75dvh, drag-handle look, grouped 48px rows (icon + label +
    count) with the sections not in the bar, then *Cuenta*: Mi perfil, Tema oscuro (switch),
    Cerrar sesión. The Android back button closes it (a history entry is pushed on open).
- **Command palette** (⌘K / Ctrl+K anywhere; the sidebar trigger; the phone search button):
  one input + grouped listbox — *Pacientes* (name or document, 200ms debounce, ≥2 chars),
  *Ir a* (sections the role can open; settings screens while typing), *Acciones* (Nueva cita,
  Nuevo paciente). Combobox/listbox ARIA with `aria-activedescendant`; arrows, Ctrl+Home/End,
  Enter. Accent-insensitive matching. Full-screen on phones.
- **System chrome:** `viewport-fit=cover` and a `theme-color` per scheme set to the canvas
  token (light `#F7F9FC`, dark `#0B0F14`) — never the accent.

### Settings pages
Every screen under `/settings` uses ONE template, `src/components/settings/` (B6). The
index (`settings-sections.ts`) is the complete map — *Tu cuenta* (Mi perfil) · Clínica y
sedes · Agenda · Cobro · Historia clínica · Datos y seguridad · *Herramientas y registros*
(Importar pacientes, Implantes, Accesos de soporte, Auditoría: tools and logs, not
policies) — and each entry's label is **exactly** its page's title.

- **Frame** (`app/(app)/settings/layout.tsx` → `SettingsShell`): from `xl` (≥1280px) a
  persistent **sub-navigation** (220px, sticky, own scroll, `border-subtle` rule) lists the
  same groups as plain links (caption headings, no icons, active = `primary-subtle` +
  `primary-subtle-text`, `aria-current="page"`); its «Ajustes» heading links to the index.
  Below `xl`, and on the index itself, there is no sub-nav: the index is the entry and each
  page carries «‹ Ajustes». Nothing to adopt — the layout wraps every settings route.
- **`SettingsPage`** `title description scope width actions back`: «‹ Ajustes» (hidden at
  `xl`, where the sub-nav replaces it; a `back` to another page — a sede's sheet back to
  «Sedes» — always shows), Display title, ONE support line (≤68ch, ≤2 lines, no second
  paragraph), and the **scope line** (`scope="clinic"` «Aplica a toda la clínica» ·
  `"sede"` «Por sede» · a node: «Editando: Sede Norte», status chips). Content column
  **720px, left-aligned**; `width="wide"` only for real tables (≥5 columns) and logs. Never
  centered. Sections are 40px apart.
- **`SettingsSection`** `title description actions as`: `SectionHeader` + one help line;
  no icons, no eyebrows. Its region is named by its title.
- **`SettingRows` + `SettingRow`** `label description value action children isDefault
  inline`: the one row for a policy value — one bordered card per section, hairline rows,
  label + muted help left; right, the control (Switch, a short field) **or** the current
  value in `t-data` + a secondary «Cambiar» that opens a dialog. `isDefault` → neutral
  «Por defecto» chip. On phones the control drops under the text, except `inline` (a Switch).
- **Saving — one model per page.** A form's only Save is **`SaveBar`**
  (`save-bar.tsx`): «Cambios sin guardar · Descartar · Guardar», rendered at the END of the
  form, `sticky bottom-3` in the scrolling area (so it rides the viewport's foot while the
  form is dirty and rests in place at the end), and **absent when nothing changed** — never
  a permanently visible disabled Save, never a Save per field or per row. Pair it with
  **`useSettingsDraft(saved)`** → `{ draft, setDraft, update, dirty, discard, commit }`
  (dirty = draft ≠ saved; a reload of `saved` only replaces an untouched draft; dirty
  pages warn on unload). `form="<id>"` makes Guardar submit the form (validation stays in
  `onSubmit`); `error` shows the save failure (rung 4) inside the bar; give the button a
  `saveAriaLabel` when a page has more than one form. Values edited in a dialog («Cambiar»,
  versioned policies) keep the dialog's own Save and need no bar.
- **Per sede:** a setting that is per sede is reached through its sede, not through a
  second sede `<select>`: `/settings/sedes` is the list, `/settings/sedes/[id]` the sede's
  sheet (data + regional config, registration, cancellation policy, calendar). Pages that
  edit «the active sede» say which one («Editando: Sede Norte») and follow the global
  switcher.
- **Weeks** start where the sede's locale starts them (`weekOrder(locale)` in
  `components/locations/week-order.ts`; Monday when the locale has no region).
- **A sede's regional config — two recorded decisions (D2, 2026-10-31):**
  - *Currency suggested from the country, on creation only.* The product never decides by
    country (DX-312 R3, G1 R2), with ONE named exception: `lib/locations/country-regional.ts`
    (+ its generated JSON) PROPOSES currency, zones and format when a sede is created or
    registered — a visible, editable suggestion labelled «Sugerido por el país». It never fills
    or replaces a saved value (editing shows what is stored; only an empty field is suggested),
    and nothing else may look a country up: in `src/architecture/no-location-fallbacks.test.ts`
    `COUNTRY_RULE_EXCEPTIONS` holds that module and the frozen legacy prescription layout (R12),
    nothing more.
  - *Changing a sede's time zone re-counts its days; nothing stored is rewritten.* Instants
    are stored in UTC and each movement's civil day (caja, reports, «hoy») is derived with the
    sede's CURRENT zone. We deliberately do NOT freeze each movement's day at write time (no
    API migration): the common reason to change a zone is that it was wrong, and then
    re-counting the history in the right zone is the fix, not a side effect. Appointments
    keep their exact instant. The edit form says so BEFORE saving («Qué cambia al guardar» →
    «…la caja y los informes contarán los días con esa zona, también los de lo ya
    registrado»), a sede with history needs an explicit confirmation (409
    `LOCATION_REGIONAL_CHANGE_UNCONFIRMED`), and an open cash session blocks the change.
    Civil dates typed by people (`invoiceDate`, birth dates) are already civil and never move.
- **Lists** in settings follow Tables (`DataList`, row → edit, `RowActions` «⋯»;
  Desactivar = reversible, Eliminar = irreversible with consequences). Empty list: no
  «0 items» count, the primary lives inside the `EmptyState`.

### Odontogram (signature)
- FDI-numbered tooth map on a paper field; teeth are precise vector marks, 5 selectable surfaces
  each, colored only from the catalog/semantic tokens. Selection uses the accent; keyboard-navigable.
  The tooth timeline reads as a dated clinical list, not a decorated card stack.

## Do's and Don'ts

### Do:
- **Do** resolve every accent from `var(--color-primary)` so any tenant color stays cohesive.
- **Do** use tabular numerals for all data (dates, money, tooth numbers, counts).
- **Do** keep one clear primary action per view and put it within thumb reach on mobile.
- **Do** separate with hairlines and space; prefer a labeled section over another card.
- **Do** design mobile-first, then expand into denser desktop grids.
- **Do** keep AA contrast in light, dark, and under any tenant accent.

### Don't:
- **Don't** build the page as same-size icon+heading+text cards, or nest cards.
- **Don't** use the hero-metric template (big number / small label / accent) as structure.
- **Don't** let the accent cover more than ~10% of a screen, or hardcode its hue.
- **Don't** use shadows as decoration; surfaces are flat at rest.
- **Don't** use gradient text, glass, or colored `border-left` > 1px.
- **Don't** put a tracked uppercase eyebrow over every section.
