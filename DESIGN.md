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
block, which reads as one gesture. Tables collapse to stacked labeled cards below `sm`.

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

### Cards / Containers
- **Corner:** 12px. **Background:** surface. **Border:** 1px `border`. **Shadow:** none at rest — ever.
- **Padding:** 16px on phones, 24px from `sm`. No nested cards; use `border-subtle` sections inside.

### Chips / Badges
- **Style:** pill, label type, tinted semantic bg + dark hue text (success/warning/danger),
  or surface-2 + muted for neutral. Status like `●completado / ○planeado` reads at a glance.

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
- **Header:** surface-2, label type, muted. **Rows:** hairline separators, 44px min height,
  hover = surface-2. **Numbers:** right-aligned, tabular. Collapse to stacked labeled cards below `sm`.
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
- **Left rail (md+):** surface, hairline right border; items = icon + label, 8px radius; active =
  accent-tinted bg + accent text + ink weight; hover = surface-2. Wordmark top; user menu bottom.
- **Mobile:** compact top bar with wordmark + user menu; primary section nav as a horizontal
  scrollable row or bottom bar; primary actions stay thumb-reachable.

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
