---
name: Dentalix
description: Ficha clínica — International Typographic system for a multi-tenant dental SaaS
colors:
  primary: "#0E7490"
  primary-fg: "#FFFFFF"
  accent: "#0E7490"
  bg: "#F7F9FC"
  surface: "#FFFFFF"
  surface-2: "#F1F5F9"
  ink: "#0F172A"
  muted: "#64748B"
  border: "#E2E8F0"
  hairline: "#EEF2F7"
  success: "#15803D"
  warning: "#B45309"
  danger: "#BE123C"
typography:
  display:
    fontFamily: "var(--font-sans)"
    fontSize: "clamp(1.5rem, 1.1rem + 1.6vw, 2rem)"
    fontWeight: 640
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  title:
    fontFamily: "var(--font-sans)"
    fontSize: "1.125rem"
    fontWeight: 620
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  body:
    fontFamily: "var(--font-sans)"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "0"
  label:
    fontFamily: "var(--font-sans)"
    fontSize: "0.75rem"
    fontWeight: 560
    lineHeight: 1.2
    letterSpacing: "0.02em"
  data:
    fontFamily: "var(--font-sans)"
    fontSize: "0.9375rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0"
    fontFeature: "'tnum' 1, 'cv01' 1"
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
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-fg}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "40px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "40px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "40px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "24px"
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
  precise page header (title + one primary action); content as record-like
  sections and tables. Primary action top-right on desktop, thumb-reachable on mobile.
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

A cool clinical paper base with graphite ink and one tokenized accent. Neutrals are
blue-tinted slates so the whole system reads clinical rather than warm.

### Primary
- **Clinical Teal-Blue** (`#0E7490`, tenant-overridable): the single accent. Primary
  buttons, active nav, links, focus rings, selected state. Never more than ~10% of a
  screen. AA with white text. A tenant's `--color-primary` overrides it at runtime;
  everything else stays cohesive.

### Neutral
- **Graphite Ink** (`#0F172A`): primary text and headings.
- **Slate Muted** (`#64748B`): secondary text, labels, meta (AA on paper/surface).
- **Cool Paper** (`#F7F9FC`): the app canvas.
- **Surface** (`#FFFFFF`): cards, panels, rows.
- **Surface-2** (`#F1F5F9`): insets, table headers, hovered rows, quiet fills.
- **Border** (`#E2E8F0`): standard 1px dividers and control strokes.
- **Hairline** (`#EEF2F7`): the lightest rule, for in-table and in-list separation.

### Semantic
- **Success** (`#15803D`), **Warning** (`#B45309`), **Danger** (`#BE123C`): status
  only. On light chips, use a tint of the hue as background with the dark hue as text;
  reserve solid danger for destructive confirmation, never as decoration.

**The One Accent Rule.** The accent is tokenized and rare. If a screen reads as
"the teal screen," it is overusing it — pull back to ink + neutrals and let the
accent mark only the primary action, the active item, and focus.

**The White-Label Rule.** Never hardcode the accent hue in a component. Every accent
use resolves `var(--color-primary)`. Secondary text on any colored surface is tinted
from ink/hue, never pure gray on color.

## Typography

**UI / Display Font:** the app sans (`--font-sans`; workhorse UI face + system stack).
**Data:** same family with tabular numerals (`font-feature-settings: 'tnum'`).

**Character:** one family, earning hierarchy through size, weight, and tracking rather
than through a second display face — the register a clinical document wants.

### Hierarchy
- **Display** (640, `clamp(1.5rem, 1.1rem + 1.6vw, 2rem)`, 1.1, -0.02em): page titles only.
- **Title** (620, 1.125rem, 1.3, -0.01em): section and card headers.
- **Body** (400, 0.9375rem, 1.55): default text; measure 65–75ch in prose.
- **Data** (500, 0.9375rem, tabular): numbers, dates, tooth numbers, money, IDs.
- **Label** (560, 0.75rem, 0.02em): field labels, table headers, chips, meta.

**The Tabular Rule.** Every quantity, date, money value, and FDI tooth number uses
tabular numerals so columns align and figures never jitter between states.

## Layout

Mobile-first. Base spacing is a 4/8px scale (`4 8 12 16 24 32 48`). The app shell is a
persistent left rail from `md` up (collapses to a compact top bar + bottom-safe actions
on mobile); content sits in a centered column, `max-width` ~72rem, with generous gutters.
Sections and tables read like a record: a labeled header, hairline-separated rows,
comfortable row height (44px touch target min). More space above a heading than below it.
Page header pattern: title (Display) left, one primary action right (moves to a
thumb-reachable position on mobile). Tables collapse to stacked labeled cards below `sm`.

## Elevation & Depth

**Flat by default.** Surfaces sit on the paper with a 1px border, not a shadow. Depth
appears only for true overlays and transient state.

### Shadow Vocabulary
- **Overlay** (`box-shadow: 0 8px 28px -8px rgb(15 23 42 / 0.18)`): dialogs, dropdowns, popovers.
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
- **Shape:** 8px radius, 40px height (36px `sm`, 44px touch on mobile primary), medium weight.
- **Primary:** solid `var(--color-primary)` + primary-fg text; the one accent-colored element per view.
- **Secondary:** surface bg + 1px border + ink text.
- **Ghost:** transparent + ink/muted text; hover fills with surface-2.
- **Hover/Focus:** subtle bg shift; focus-visible = 2px accent ring with 2px offset. Never remove focus.
- **Destructive:** danger only inside confirmation, not as a default row action.

### Inputs / Fields
- **Style:** surface bg, 1px border, 8px radius, 40px height, ink text, muted placeholder (≥4.5:1).
- **Focus:** border → accent + 2px accent ring (no glow).
- **Error:** danger border + a message that names the problem and the fix.
- **Disabled:** reduced opacity, no pointer.

### Cards / Containers
- **Corner:** 12px. **Background:** surface. **Border:** 1px border token. **Shadow:** none at rest.
- **Padding:** 24px (16px on mobile). No nested cards; use hairline sections inside instead.

### Chips / Badges
- **Style:** pill, label type, tinted semantic bg + dark hue text (success/warning/danger),
  or surface-2 + muted for neutral. Status like `●completado / ○planeado` reads at a glance.

### Tables
- **Header:** surface-2, label type, muted. **Rows:** hairline separators, 44px min height,
  hover = surface-2. **Numbers:** right-aligned, tabular. Collapse to stacked labeled cards below `sm`.

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
