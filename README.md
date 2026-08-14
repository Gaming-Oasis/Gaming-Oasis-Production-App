# Gaming Oasis Production OS

Brand and AI-development references:

- [Gaming Oasis Tool Brand Guide](docs/GAMING-OASIS-TOOL-BRAND-GUIDE.md)
- [AI Development Guide](docs/AI-DEVELOPMENT-GUIDE.md)
- [Repository Agent Instructions](AGENTS.md)

A ground-up rebuild of the Gaming Oasis vMix production control tool. This first version focuses on fast operator setup, public League Hub match lookup, local draft persistence, and legacy-compatible JSON output.

## Included workspaces

- **Welcome** — show-readiness overview and shortcuts
- **General info** — event name, talent, stream copy, and an eight-segment run of show
- **Team Info** — two public League Hub match lookups with manual team overrides, color comparison, and complete Match 2-to-Match 1 copying
- **Rocket League** — seven staged game-score inputs with an explicit JSON update, scoreboard header, series format, and automatic round and series totals
- **VALORANT** — five staged map-result inputs with an explicit JSON update, flip-side and ban-swap controls, plus Bo3/Bo5 picks, bans, and starting sides
- **Sponsors** — ten saved sponsor slots with independent rotation toggles
- **Draw show** — Rocket League and VALORANT Tier 1/Tier 2 pool grids with Excel paste support
- **Settings** — regional logo and sidebar visibility controls for Rocket League, VALORANT, Sponsors, and Draw Show; General Info remains always available

## JSON output

The export package preserves the filenames and array shapes used by the previous tool:

- `FinalOutput.json`
- `sponsors.json`
- `RLT1DS.json`
- `RLT2DS.json`
- `VALT1DS.json`
- `VALT2DS.json`

While the local app is running, every edit automatically rewrites all six files in the project’s `JSONs` folder after a short debounce. The interface shows **JSON live** when the files on disk are current and warns the operator if the local writer is unavailable.

Rocket League and VALORANT result scores are staged separately: edited rows are marked **Unsaved** and do not change their live graphics fields until the operator selects **Update results**. Entered results require both scores and a clear winner; incomplete or tied rows disable the update action. Other show setup fields continue to update automatically.

**Export JSON package** remains available for manual copies. On browsers that support folder access it writes all six files directly to a selected folder; other browsers download them individually. The bottom-left **Reset local data** action requires confirmation in a modal before clearing the workstation draft.

`FinalOutput.json` includes the legacy Rocket League overlay fields (`rlscore1` through `rlscore7`, `rlheader`, `rlformat#`, `rlroundnumber`, `rlseriesscore1`, and `rlseriesscore2`) alongside the shared show and match data.

The same file includes VALORANT scoreboard, team, result, pick/ban, map-card, next-map, winner-logo, and widget fields expected by the existing graphics.

The dedicated **VAL Live info** section shows the current saved map number and name, each team's series wins, and each team's selected starting side for that map. Team order follows the live flip-side setting. The **Picks / bans** tab identifies Ban Team A and Ban Team B and provides the Ban swap control to reverse those assignments.

## League Hub contract

Operators enter only a match ID. The local writer requests the fixed public endpoint:

```text
GET https://hub.gamingoasis.gg/api/public/matches/:matchId
```

No production credentials or configurable API settings are required. The response's `match.team1` and `match.team2` provide team identity, seed, and home/away colors, `standings` provides placement and record, and `league` plus `event` populate per-match League info. Each match stores Hub source league name, logo (`league.logo` or `league.logoUrl`), primary/secondary colors, and event name separately from manual overrides. Resolved league colors become each team's Backup 1/2 swatches. Match 1's resolved event name updates General Info / `FinalOutput.eventname`, and Match 1's resolved league colors feed the Rocket League and VALORANT overlays. Each team can output its standing record (the default when available), placement (such as `3rd`), or stage seed (such as `#2`).

The local writer proxies the match response and Hub-hosted logo previews because the production interface runs on localhost while the public League Hub endpoints are hosted at `hub.gamingoasis.gg`. Exported JSON keeps the original public logo URL.

Logo previews retain the source image's transparency, inspect its visible colors, and automatically place it over a white or navy (`#171717`) background for contrast. Operators can force either background from the team override controls.

Synced team names are converted to their short production form before output. For example, `#1 KU Rocket League A - Keiser University` becomes `KU A`; the full Hub name remains visible as source information. Final names are limited to the legacy 13-character graphics field, and an over-limit override field is highlighted red until corrected.

## Local development

For production staff, double-click **`Run Gaming Oasis Production OS.bat`**. It installs anything missing, starts the local app, and opens the browser automatically.

For development:

```text
npm install
npm run dev
```

The app runs at `http://localhost:3000` by default. Production drafts and sidebar preferences are saved only in that browser profile on the workstation.

## Brand system

The interface uses the official Gaming Oasis master-brand system: Oxanium, Brand Gold (`#F6AC18`), Brand Purple (`#47213F`), Accent Orange (`#C7564B`), charcoal surfaces, overlay plate fill (`#171717`) for browser-overlay plates, the official wordmark/favicon, and the official chromatic background. Browser overlay fixed vs live colors are documented under **Browser overlays color scheme** in the [brand guide](docs/GAMING-OASIS-TOOL-BRAND-GUIDE.md). All brand assets and font files are stored locally so the tool retains its intended appearance without an internet connection.

## Validation

```text
npm test
```
