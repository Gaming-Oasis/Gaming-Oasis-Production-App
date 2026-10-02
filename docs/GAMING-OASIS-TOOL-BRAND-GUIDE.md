# Gaming Oasis Tool Brand Guide

This guide defines the shared visual language for Gaming Oasis internal tools, operator consoles, portals, and production applications. The human-facing source of truth is [gamingoasis.gg/brand](https://gamingoasis.gg/brand).

## Brand context

- Gaming Oasis is the parent brand.
- League Hub and Event Solutions use the master Gaming Oasis palette.
- SEL and NEL colors are reserved for conference-specific content.
- The default product tagline is **Play more, Live more.** Do not force it into operational screens where it adds no value.

## Core tokens

| Token | Value | Use |
| --- | --- | --- |
| `--background` | `#1A1A1A` | Application shell, navigation, and page background |
| `--foreground` | `#FFFFFF` | Primary text |
| `--muted` | `#999999` | Supporting text, labels, and placeholders |
| `--surface` | `#2D2D2D` | Cards, panels, and grouped controls |
| `--surface-elevated` | `#353535` | Hover and raised control states |
| `--border` | `#404040` | Dividers and component boundaries |
| `--brand` | `#F6AC18` | Primary actions, active state, and key status emphasis |
| `--brand-contrast` | `#252525` | Text on brand-gold controls |
| `--brand-purple` | `#47213F` | Reserved brand depth; use sparingly in tools |
| `--accent-orange` | `#C7564B` | Warm secondary accent |
| `--accent-purple` | `#713060` | Cool secondary accent |
| Overlay plate | `#171717` | Browser-overlay plates: score panels, active player card fills, sponsor boxes, VALORANT map-widget bases, and matching dense fills in the operator tool |

Functional success and error colors may be used for system state. Do not use brand gold to imply an error.

## Browser overlays color scheme

Applies to `/overlays/rocket-league`, `/overlays/rocket-league/vs`, `/overlays/rocket-league/stats`, `/overlays/valorant`, `/overlays/valorant/vs`, and the League Pick/Ban, Scoreboard, and VS routes under `/overlays/league-of-legends` (browser sources for OBS). Operator chrome uses the core tokens above; overlays use this tighter fixed set plus live Match 1 / league colors.

### Fixed colors

| Color | Role |
| --- | --- |
| `#171717` | Plate fill — score panels, RL active-player card body (`active-border-fill.png` + CSS plates), sponsor boxes, series pills (default), VALORANT map-widget bases and decider slot, and readable contrast text when white fails on a light fill |
| `#FFFFFF` | Primary overlay text; series pills when `readableText` picks white on the team fill |
| `#fefe13` | Rocket League boost bar fill only |
| `#713060` | League active Baron icon and buff-tab accent (approved Accent Purple); tab plate remains `#171717` |

League follows the Rocket League stats palette: flat `#171717` backgrounds, `rgb(23 23 23 / 0.8)` translucent plates, white objective icons, and live league-primary outer trim. Source icon silhouettes and placement are retained through alpha masks; fixed source purple, cyan, gold, and background texture are not rendered. Its source typography includes Oxanium ExtraBold (800) for scoreboard statistics and Oxanium Regular (400) for champion names.

### Live colors (from production data)

| Source | Role |
| --- | --- |
| League primary / secondary | Scoreboard chrome, header, RL active-player border tint, sponsor gradient, post-match stats outer border (primary) and VS/score/result accents (secondary), VALORANT rail / map accents |
| Team one / team two colors | Name fills, RL active name plate, score accents, series context, post-match stats name plates / victory bars / vertical dividers |

Text on live fills picks `#FFFFFF` or `#171717` from shared `readableText` in `lib/readable-text.mjs` (white-biased: prefer white unless the fill is clearly light). Logo and other image plates use the same module (`resolveImagePlate` / `detectImagePlate` / `preferredImagePlate`) and only resolve to white or overlay navy `#171717` (legacy pure black maps to navy), favoring white unless the artwork is clearly light. Do not fall back to team color behind logos. Do not hard-code team or league colors into overlay CSS except as short-lived fallbacks when preview data is missing. The Rocket League lobby **VS** screen (when `!hasGame` and `lobbyScene` is `vs`) uses the same plate, text, and logo helpers on a diagonal team split with a `#171717` VS chip. When `lobbyScene` is `stats`, the lobby shows the post-match team totals board instead (`/overlays/rocket-league/stats`); Stats on the main Scoreboard link always uses the diagonal team background. The **VS screen background** toggle controls only the dedicated Stats link, which can use that background or stay fully transparent for OBS.

### Mix / shadow helpers only

These are not plate fills. Use only inside `color-mix`, gradients, or text shadows:

- `#121212`, `#111111` — darken live colors in VALORANT panel gradients
- Translucent black / white (`rgb(0 0 0 / …)`, `rgb(255 255 255 / …)`) — shadows and soft overlays

### Do not use on overlay plates

| Color | Why |
| --- | --- |
| `#0E1520` | Retired overlay navy — replaced by `#171717` |
| `#191919` | Invented near-black |
| `#222222` | Operator-tool surface only; not an overlay plate (including VALORANT map decider) |

When regenerating RL plate PNGs or CSS solid fills, keep opaque plate pixels at `#171717`.

## Typography

- Use the native system UI font for forms, navigation, tables, and operational copy. This matches the League Hub and keeps working screens calm and readable.
- Reserve **Oxanium** for the official brand lockup, short product labels, and approved marketing surfaces.
- Supported Oxanium weights: 400, 500, 600, and 700.
- Product page title: 25-32px, semibold.
- Panel title: 14-18px, semibold.
- Body: 12-14px, regular.
- Field label and metadata: 9-11px, medium.
- Avoid wide tracking and excessive uppercase text in operator interfaces.

## Product interface principles

Gaming Oasis tools are working surfaces, not marketing pages.

1. Start with the operator's task and the information they must verify.
2. Use a flat charcoal shell and matte surfaces. Keep depth to borders and small changes in surface color.
3. Use gold for the primary action, active navigation item, and small points of emphasis.
4. Prefer compact sections, visible labels, direct status text, and predictable placement.
5. Keep one primary action per view when possible.
6. Use an 8px panel radius and a 5-6px control radius.
7. Keep motion limited to useful state changes. Respect reduced-motion preferences.

## Avoid generated-looking UI

- No glowing orbs, glass panels, neon halos, oversized hero copy, decorative charts, or floating cards.
- No gradients in operator tools unless a specific approved brand asset requires one.
- No arbitrary cyan, green, or violet accents in master-brand screens.
- No excessive pills, badges, icons, or status dots where plain text is clearer.
- No invented metrics or generic dashboard copy.
- No decorative illustrations in forms or settings screens.
- Do not use shadows as the main way to separate content.

## Components

### Buttons

- Primary: gold fill, dark text, 38-42px high.
- Secondary: surface fill, border, white text.
- Destructive: transparent or surface fill with a restrained error border and label.
- Button labels should be direct verbs: `Export JSON package`, `Test connection`, `Sync from hub`.

### Forms

- Inputs use a dark matte fill and one-pixel border.
- Labels stay visible above the input.
- Placeholder copy is an example, not an instruction substitute.
- Focus uses the brand-gold outline or border.
- Group fields by production task, not by data type.

### Navigation

- Persistent desktop navigation uses flat `#1A1A1A` chrome.
- Active items use a matte surface plus a small gold indicator.
- Keep labels short and consistent across tools.

### Status

- Always pair color with text.
- State labels should describe the real system: `JSON live`, `Saving JSON`, `Writer offline`.
- Avoid animation for healthy background processes.

## Official assets

- Light wordmark: `/public/gaming-oasis-logo-light.png`
- Square mark: `/public/gaming-oasis-favicon.png`
- Oxanium font files: `/public/oxanium-400.ttf` through `/public/oxanium-700.ttf`
- Optional branded background: `/public/gaming-oasis-background-plain.png`

Use transparent logos on dark surfaces. Never add a matte box, glow, distortion, or replacement typography to the official mark.

## Accessibility baseline

- Maintain WCAG AA text contrast.
- Every interactive control must be keyboard reachable.
- Use a visible gold focus indicator.
- Do not communicate state through color alone.
- Maintain at least 38px control height for frequently used desktop actions and comfortable touch targets on mobile.
