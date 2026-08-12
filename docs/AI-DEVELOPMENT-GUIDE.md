# AI Development Guide for Gaming Oasis Tools

Attach this guide, `AGENTS.md`, and `docs/GAMING-OASIS-TOOL-BRAND-GUIDE.md` when an AI system creates or changes a Gaming Oasis tool.

## Read first

1. Read `AGENTS.md` for repository rules.
2. Read `docs/GAMING-OASIS-TOOL-BRAND-GUIDE.md` for the interface system.
3. Inspect the current Gaming Oasis website and League Hub tokens before adding a new visual pattern.
4. Preserve existing data contracts, operator workflows, and local launch behavior.

## Required product qualities

- **Efficient:** common work should require few clicks and little scrolling.
- **Predictable:** navigation, labels, actions, and status stay in consistent places.
- **Matte:** flat charcoal backgrounds, clear borders, restrained radius, no decorative effects.
- **Branded:** official assets, restrained Oxanium use, and the exact Gaming Oasis tokens.
- **Operational:** status text reflects the actual state of files, APIs, and exports.
- **Local-first:** tools must be simple to start and safe to operate on a production workstation.

## Interface decision rules

- Prefer a labeled field over an icon-only control.
- Prefer a compact table or structured list over a gallery of cards.
- Prefer one clear status sentence over several badges.
- Prefer borders and spacing over shadows and background effects.
- Prefer an existing component pattern over a new visual variation.
- Only add a metric when it helps an operator make a decision.
- Only add motion when it communicates progress, success, or failure.

## Brand implementation checklist

- [ ] Master palette values match the brand guide exactly.
- [ ] Operational copy uses the system UI font; Oxanium is limited to approved brand and product labels.
- [ ] Official Gaming Oasis logo files are used without modification.
- [ ] Primary actions use brand gold and dark contrast text.
- [ ] Panels are matte, bordered, and use no unnecessary glow or gradient.
- [ ] Body text and labels use the defined foreground and muted colors.
- [ ] Focus, hover, disabled, success, and error states are visible.
- [ ] Mobile behavior keeps core operator actions reachable.

## Production-tool checklist

- [ ] Welcome, General Info, Sponsors, Settings, and enabled optional modules remain reachable.
- [ ] General Info, Sponsors, and Draw Show sidebar visibility can be toggled independently and defaults to visible.
- [ ] Sidebar visibility does not remove workspace data or change JSON output.
- [ ] Each Draw Show pool supports pasting a copied Excel column without changing its legacy `Pij` key mapping.
- [ ] League Hub match lookup uses the fixed public endpoint and requires only a match ID.
- [ ] League Hub/source team data remains separate from manual overrides.
- [ ] Each team can select either Hub placement (for example, `3rd`) or standing record (for example, `0-1`) for the legacy standing output.
- [ ] Match 2 can be copied completely into Match 1 without dropping synced values, selected colors, logo backgrounds, or manual overrides.
- [ ] Team name, standing, logo, color, and logo-background overrides resolve into a visible final output.
- [ ] Synced logo previews automatically choose a white or black contrast background and allow either option to be forced manually.
- [ ] Synced logo images retain transparency; only the preview container receives the selected white or black background.
- [ ] A team name longer than the legacy 13-character limit visibly marks its override field as required until the final value is valid.
- [ ] League Hub team names retain their full source label while production output uses the short school-and-squad form (for example, `KU A`).
- [ ] Home, away, and backup color selection plus color similarity comparison remain available.
- [ ] Every edit continues to update all six JSON files through the local writer.
- [ ] Legacy filenames and field shapes remain unchanged unless explicitly approved.
- [ ] Manual JSON export remains available as a recovery path.
- [ ] Reset actions require confirmation.
- [ ] The local launcher starts both the UI and live JSON writer.

## Validation before handoff

1. Build the application.
2. Run the repository tests.
3. Verify the complete six-file JSON package is written after repeated edits.
4. Check that feature-flagged navigation cannot expose a disabled workspace.
5. Review copy for direct, operator-focused language and accidental placeholder text.
6. Confirm no new brand colors, logo treatments, or decorative UI patterns were invented.
