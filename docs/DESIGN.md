# Design System

## Visual Identity

Modern SaaS light theme — clean, professional, built for banking/fintech use cases.

---

## Color Palette

### Core

| Token              | Value     | Usage                     |
| ------------------ | --------- | ------------------------- |
| `--bg`             | `#F7F6F3` | Page background (warm beige) |
| `--surface`        | `#FFFFFF` | Cards, panels, modals     |
| `--header-bg`      | `#0D0D0D` | Top navigation bar        |
| `--text-primary`   | `#111111` | Headings, body text       |
| `--text-secondary` | `#5C5C5C` | Labels, metadata          |
| `--text-tertiary`  | `#999999` | Placeholders, hints       |

### Semantic

| Token        | Value     | Usage                         |
| ------------ | --------- | ----------------------------- |
| `--accent`   | `#0D3B66` | Primary actions, links (navy) |
| `--success`  | `#1B7A4E` | Low risk, positive growth     |
| `--warning`  | `#A16207` | Medium risk, caution          |
| `--danger`   | `#B42318` | High risk, price decline      |

Each semantic color has a `-light` variant for subtle backgrounds (e.g. `--success-light: #EEFBF4`).

### Borders & Dividers

| Token           | Value                    |
| --------------- | ------------------------ |
| `--border`      | `#E5E2DC` (warm gray)    |
| `--border-light`| `#F0EDE8` (subtle)       |

---

## Typography

| Property     | Value                                              |
| ------------ | -------------------------------------------------- |
| Display font | Plus Jakarta Sans, Outfit                          |
| Body font    | Outfit, -apple-system, BlinkMacSystemFont, Segoe UI |
| Font weight  | 400 (body), 500 (labels), 600 (headings), 700 (display) |

### Type Scale

| Token   | Size      | Usage              |
| ------- | --------- | ------------------ |
| `--xs`  | 0.68rem   | Badges, fine print |
| `--sm`  | 0.75rem   | Captions, metadata |
| `--base`| 0.85rem   | Body text          |
| `--md`  | 0.95rem   | Subheadings        |
| `--lg`  | 1.15rem   | Section titles     |
| `--xl`  | 1.5rem    | Page titles        |

---

## Spacing & Layout

| Property      | Values                        |
| ------------- | ----------------------------- |
| Border radius | 4px (sm), 6px (md), 10px (lg) |
| Padding       | 12–32px (contextual)          |
| Gap           | 8–20px between elements       |
| Shadows       | Subtle `0 1px 2px`, Medium `0 2px 8px`, Large `0 8px 24px` |
| Transitions   | 0.15s ease (hover states)     |

### Page Layouts

- **Dashboard** — Full-width header → KPI bar (5-col grid) → Filter bar → Card list
- **Property Detail** — Map (65% left) + Sidebar (35% right) → Tabbed content below

### Responsive Breakpoints

- `1024px` — Stacks map/sidebar vertically, adjusts KPI grid
- `640px` — Single-column layout, compact cards

---

## Component Library

### KPI Cards
Five stat cards in a horizontal grid. Each shows a value, label, and optional sub-text. Minimal borders, light surface background.

### Property Cards
Horizontal layout: thumbnail (Street View or placeholder) → risk badge + price + growth % + location + specs + sentiment bar. Click navigates to detail page.

### Risk Score Gauge
Horizontal progress bar (0–100). Color-coded zones:
- **Low risk** (≥70): green
- **Medium risk** (40–69): orange
- **High risk** (<40): red

### Prediction Chart
Recharts `ComposedChart` with:
- 36-month historical price line
- 12-month forecast (dashed line)
- Sentiment bar overlay
- "Today" reference line dividing past/future

### Loan Assessment Panel
Decision banner (Recommend / Due Diligence / Decline) + metric cards (LTV, DSCR, collateral coverage) + amortization table + override controls.

### Map
Leaflet with CartoDB light tiles:
- **Overview mode** — Region-colored circles sized by property count
- **Detail mode** — Property marker + amenity markers with category-colored icons and toggle pills

### Filter Bar
Inline controls: region dropdown, price range inputs (min/max), risk level dropdown, full-text search. Resets with a single button.

### Modals
Centered overlay with backdrop blur. Used for Google API key input with localStorage persistence.

---

## Iconography & Visual Language

- No icon library — uses Unicode/emoji sparingly for category labels
- Color-coded badges for risk levels and sentiment
- Subtle hover lift effects on interactive cards
- Fade-slide-in animation on page load
