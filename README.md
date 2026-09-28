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
- **League of Legends** — Bo1/Bo3/Bo5 series control, manual standard/global-fearless champion select, local spectator-client status, a ten-player live board, and staged winner-only game results
- **Sponsors** — ten saved sponsor slots with independent rotation toggles. Remote logo URLs are fetched on this workstation so vMix browser sources can display them.
- **Draw show** — Rocket League and VALORANT Tier 1/Tier 2 pool grids with Excel paste support
- **Settings** — sidebar visibility controls for General Info, Rocket League, VALORANT, Sponsors, and Draw Show

## JSON output

The export package preserves the filenames and array shapes used by the previous tool:

- `FinalOutput.json`
- `sponsors.json` — each `logo` is a local PNG, JPG, GIF, or BMP path with forward slashes so a vMix title image field can open it. Google Drive view links, such as `https://drive.google.com/uc?export=view&id=...`, are downloaded to that file.
- `RLT1DS.json`
- `RLT2DS.json`
- `VALT1DS.json`
- `VALT2DS.json`

While the local app is running, the first output-relevant edit activates live output and subsequent production edits rewrite all six files in the project’s `JSONs` folder after a short debounce. A brand-new untouched workspace only checks writer health, so opening the tool cannot replace existing show files with defaults. Writes use a validated, recoverable six-file transaction with bounded retries. The interface shows **JSON live** only after the writer acknowledges the current revision and warns the operator if the local writer is unavailable.

One browser or profile owns the production writer lease at a time. Other copies follow the saved draft in read-only standby and can explicitly take control, preventing stale workspaces from racing JSON generations.

Rocket League and VALORANT result scores are staged separately: edited rows are marked **Unsaved** and do not change their live graphics fields until the operator selects **Update results**. Entered results require both scores and a clear winner; incomplete or tied rows disable the update action. League of Legends follows the same staged-save workflow with a single winner choice per game. Only saved League winners advance the current game, series score and global-fearless history. Other show setup fields continue to update automatically.

**Export JSON package** remains available for manual recovery copies. On browsers that support folder access it writes the six legacy files plus `VALORANT MAP DATA.json` directly to a selected folder; other browsers download the same seven files in one ZIP archive. The bottom-left **Reset local data** action requires confirmation in a modal before clearing the workstation draft.

`FinalOutput.json` includes the legacy Rocket League overlay fields (`rlscore1` through `rlscore7`, `rlheader`, `rlformat#`, `rlroundnumber`, `rlseriesscore1`, and `rlseriesscore2`) alongside the shared show and match data. `regionallogo` comes from Match 1's resolved league logo in Team Info, with an optional **Podcast indicator logo** in General Info under **Podcast Run of Show**; if both are empty, it falls back to the Gaming Oasis favicon.

The same file includes VALORANT scoreboard, team, result, pick/ban, map-card, next-map, winner-logo, and widget fields expected by the existing graphics.

League of Legends uses dedicated live overlay state and adds lolscore1 through lolscore5 to FinalOutput.json. Saved Team 1 wins export as 1 - 0, Team 2 wins as 0 - 1, and unsaved or out-of-format games remain blank. Side flips do not change this order. Its only browser sources are **Pick/Ban** at `/overlays/league-of-legends/draft`, **Scoreboard** at `/overlays/league-of-legends/live`, and **VS** at `/overlays/league-of-legends/vs`. The Pick/Ban and Scoreboard layouts follow the supplied PSD/Illustrator artwork. See [League artwork alignment](docs/LEAGUE-OVERLAY-ARTWORK.md) for source geometry, extraction, and verification. The ten-player inspection table remains in Debug.

Pick/Ban role cards assign Top, Jungle, Mid, Bottom, and Support to fixed champion pick slots. Drag a role onto another pick to swap assignments, or select a role and its destination using clicks, touch, or keyboard. Champions remain in selection order in both the tool and overlay. Assignments stay within a team, survive reloads, and reset with a new draft. In fearless mode, the top strip rotates through pages of 20 confirmed champions every 15 seconds. The sponsor toggle controls the central Pick/Ban sponsor area, the bottom-left Scoreboard sponsor box, and the VS carousel. The Scoreboard box stays anchored to the viewport corner, including ultrawide sources, to cover the spectator controls.

All three game workspaces provide a dedicated VS matchup URL under **Browser overlay**. The **VS screen background** option places the team-split treatment behind Rocket League post-match Stats and League Pick/Ban. Those composed scenes use the same 80% matte transparency layer between the team artwork and the scene components for readability. VALORANT does not currently place it behind another scene. The dedicated VS URLs continue to show the complete, undimmed matchup screen.

The VALORANT **Live match indicators** show the current saved map number and name, each team's series wins, and each team's selected starting side for that map. Team order follows the live flip-side setting. The **Pick / ban** tab identifies Ban Team A and Ban Team B and provides the Ban swap control to reverse those assignments.

## League Hub contract

Operators enter only a match ID. The local writer requests the fixed public endpoint:

```text
GET https://hub.gamingoasis.gg/api/public/matches/:matchId
```

No production credentials or configurable API settings are required. The response's `match.team1` and `match.team2` provide team identity, seed, and home/away colors, `standings` provides placement and record, and `league` plus `event` populate per-match League info. Each match stores Hub source league name, logo (`league.logo` or `league.logoUrl`), primary/secondary colors, and event name separately from manual overrides. Resolved league colors become each team's Backup 1/2 swatches. Match 1's resolved event name updates General Info / `FinalOutput.eventname`, and Match 1's resolved league colors feed the Rocket League and VALORANT overlays. Each team can output its standing record (the default when available), placement (such as `3rd`), or stage seed (such as `#2`).

The local writer proxies the match response and Hub-hosted logo previews because the production interface runs on localhost while the public League Hub endpoints are hosted at `hub.gamingoasis.gg`. Exported JSON keeps the original public logo URL.

## League of Legends live data

The local writer reads Riot's documented Game Client API from the League client on the same Windows PC. It normalizes the complete `/liveclientdata/allgamedata` snapshot for the dedicated League overlay payload without memory reading or a Riot API key. This includes active-player abilities, champion stats, current gold, and full runes; ten-player identity, champion, role, level, death/respawn state, skin ID, K/D/A, CS, vision score, runes, summoner spells, and complete item properties; event details; and game/map metadata. Active-player gold applies only to that one player and is never presented as team or ten-player gold. Each complete event snapshot replaces the prior history, so new games and replay seeks cannot inherit old objectives or a finished-game state. Tower last hits by minions credit the team opposing the destroyed tower.

Under **League of Legends → Overlay controls → Scoreboard controls**, **Hide Scoreboard** and **Hide Countdowns** both start enabled. The sponsor and VS background toggles are in the same Overlay controls tab. Source links remain under Browser overlay. Kills and Towers offer **Manual / API**, defaulting to API. Grubs and Baron use manual counts, while Dragons use four fixed type dropdowns per team; their API choices are greyed out because the spectator feed does not reliably supply those objectives. From each outer edge inward, the bottom row shows Grubs, Baron, then Dragons. Each dropdown offers Not taken, Cloud, Mountain, Infernal, Ocean, Hextech, or Chemtech. Clearing a slot preserves the other slot positions; only taken slots contribute to the count. Recording a fourth dragon automatically activates Dragon Soul using that dragon’s type. The fourth selector is labeled Dragon 4 · Soul; no separate Soul toggle or type selector is needed. Each type has its own icon in the controls and on the scoreboard. Active Soul emphasizes the fourth dragon slot with a larger diamond frame and the selected Soul icon. The first three captured dragon icons remain visible; the separate SOUL label and numeric dragon count are omitted. Setting the fourth slot to Not taken clears Soul; selecting its type activates Soul again. Existing saved four-dragon teams automatically gain the Soul styling. Older saved counts appear as Unspecified until their types are chosen. **Game clock** offers **Disabled / API**, defaulting to API. **Gold** offers **Disabled / API**, with API greyed out and gold hidden because team totals are unavailable. No manual gold input or estimated team total is used. Revealing the objective countdowns displays em dashes until their timers are available.

Each team also has a **Baron active** toggle beside its manual Baron count. Activating it starts a **3:00** countdown, turns the Baron icon purple, and adds a small countdown tab below that team's Baron statistic. The timer follows real elapsed time, persists through refreshes and side swaps, and continues without an API connection. It switches off and the tab disappears at zero; operators can switch it off early. Activating the other team's Baron transfers the active buff. The toggle does not change either team's Baron kill count. **Hide Countdowns** controls the separate upper-left respawn boxes; the active buff tab appears whenever the scoreboard is shown and Baron is active.

**Elder Dragon active** replaces the former Soul dropdown tab with an Elder icon and **2:30** countdown below the dragon group. Its duration follows [Riot's 150-second Elder buff](https://www.leagueoflegends.com/en-au/news/game-updates/patch-9-24b-notes/). Like Baron, it starts on manual activation, persists across refreshes, follows side swaps, continues offline, and disappears at zero or when switched off. Elder can coexist with Baron and is independent of Soul ownership and elemental dragon counts. Old Soul settings never activate Elder automatically. The active Elder tab is separate from the upper-left respawn boxes controlled by Hide Countdowns.

Manual counts persist with the draft, follow their Match 1 team when sides flip, and remain visible without an API connection. Advancing to another game, resetting the series, or clearing manual counts also clears active Baron and Elder timers while retaining source and visibility settings. Brief client or writer interruptions hold the last valid API statistics for up to ten seconds; stale API values then become em dashes while static branding and manual counts stay visible. The live-data inspector continues to show the API feed separately from these on-air controls. Every control edit follows the complete six-file JSON writer path.

League debug mode provides full live, completed-game, and stale-connection fixtures using that same normalized contract so new broadcast graphics can be developed without a running spectator client.

Champion portraits, square champion icons, and item artwork come from Riot Data Dragon through an allowlisted local cache. If Riot or the network is unavailable, the last cached assets remain usable and the overlays fall back to text placeholders for uncached artwork.

Logo previews retain the source image's transparency, inspect its visible colors, and automatically place it over a white or navy (`#171717`) background for contrast. Operators can force either background from the team override controls.

Synced team names are converted to their short production form before output. For example, `#1 KU Rocket League A - Keiser University` becomes `KU A`; the full Hub name remains visible as source information. Final names are limited to the legacy 13-character graphics field, and an over-limit override field is highlighted red until corrected.

## Local development

For production staff, double-click **`Run Gaming Oasis Production OS.bat`**. The launcher verifies Node.js 22.13 or newer, npm, the lockfile-backed dependency set, and both local service ports. On relaunch it stops the previous tool server process tree only when the writer identity, workspace path, and saved runner PID agree, then starts a fresh instance. It never kills an unknown process using those ports. It performs a clean dependency install when the lockfile changes, builds the app, waits for the identified web and writer services to become healthy, and only then opens the browser. Keep the CMD window open while using the tool; it pauses after the server exits so messages remain visible.

For development:

```text
npm install
npm run dev
```

The app runs at `http://localhost:3000` by default. Production drafts and sidebar preferences are saved only in that browser profile on the workstation.

## Windows distribution

Every push to `main` runs the full test and production-build gate in GitHub Actions, then updates the **Latest main build** GitHub release. The release contains:

- `Gaming-Oasis-Production-OS-Setup.exe` — per-user Windows installer with its own verified Node.js runtime, desktop shortcut, and Start-menu shortcut. Operators do not need to install Node.js or npm.
- `Gaming-Oasis-Production-OS-Portable.zip` — the same self-contained application for operators who prefer to extract and run it directly.
- `Gaming-Oasis-Production-OS-SHA256SUMS.txt` — SHA-256 checksums for both packages.

Installing a newer build over an existing installation preserves the live `JSONs` directory. The uninstaller also offers to preserve production JSON and downloaded sponsor assets. The installer is not code-signed, so Windows may identify the publisher as unknown until a signing certificate is added to the release workflow.

## Brand system

The interface uses the official Gaming Oasis master-brand system: Oxanium, Brand Gold (`#F6AC18`), Brand Purple (`#47213F`), Accent Orange (`#C7564B`), charcoal surfaces, overlay plate fill (`#171717`) for browser-overlay plates, the official wordmark/favicon, and the official chromatic background. Browser overlay fixed vs live colors are documented under **Browser overlays color scheme** in the [brand guide](docs/GAMING-OASIS-TOOL-BRAND-GUIDE.md). All brand assets and font files are stored locally so the tool retains its intended appearance without an internet connection.

## Validation

```text
npm test
```

For the full local quality gate, including lint and TypeScript checks, run `npm run check`. Dependency audits are available as `npm run audit:prod` and `npm run audit:toolchain`.
