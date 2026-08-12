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

Functional success and error colors may be used for system state. Do not use brand gold to imply an error.

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
