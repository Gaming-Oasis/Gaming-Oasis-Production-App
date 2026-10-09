# Rocket League overlay PSD map

Sources:

- `assets/rocket-league/NEL Scoreboard.psd`
- `assets/rocket-league/Post Match Team.psd` (post-match team totals)
- SEL/NEL HUD reference `header_top.png` (1920 × 300 strip)
- Freddymac active-player assets `1_active` / `3_active` / `4_active` (1920 × 300)

The browser overlay keeps the PSD/header geometry and tints color regions with CSS masks so league primary/secondary, team colors, and Team Info logo backgrounds update live.

Colors: see **Browser overlays color scheme** in [`GAMING-OASIS-TOOL-BRAND-GUIDE.md`](./GAMING-OASIS-TOOL-BRAND-GUIDE.md).

| Browser layer | Asset / source | Native bounds (within 1920 × 300 strip) |
| --- | --- | --- |
| Secondary fill | Solid `#171717` plate via `secondary-mask.png` | Rectangular score boxes only |
| Sponsor box | Solid `#171717` plate (same token as score / player plates) | Bottom-right `380 × 164`, bottom-aligned with active player plate chrome (native y 201) |
| Logo fills | `logo-one-mask.png` / `logo-two-mask.png` | 97–238 / 832–971 × 99–234 |
| Name fills | CSS `--team-one` / `--team-two` | 238–707 / 971–1441 × 99–234 |
| Primary fill | `primary-mask.png` | Frame / top bar / end cap (above fills) |
| Header text | `overlay.header` (`--header-text`) | 110, 54, 1090, 99 |
| Team stacks | name + series pills | 238 / 971 × 99–234 |
| Team standings | text (`standing`, `--team-*-text`) | Upper-right of each name plate; `top 8` / `right 14` within stack |
| Series pills | `readableText(teamColor)` → `#FFFFFF` / `#171717` | Under each team name; count = `winsNeeded` |
| Score labels/values | text (`--score-text`) | 707 / 1440 × 99–234 |
| Clock | text in end-cap | `.clockSlot` 1562 × 146, 275 × 95 |
| Overtime pill | `overtime-pill.png` (179 × 45) | Centered above clock slot; 8px gap; only when `game.isOT` |

Layer order: secondary / logo bg / name fills → primary border → logos → text, standings & pills (highest).

On the fixed 1920 × 1080 canvas, the strip is scaled to **1000 × 156.25** and pinned to the **upper left** `(0, 0)` — matching the SEL/NEL HUD (`width: 1000px` on the 1920 × 300 asset). Internal layer coordinates stay in native 1920 × 300 space.

## Active player card

Sources in `public/rocket-league-overlay/nel/`:

- `active-border-fill.png` — dark plate fill from `1_active` (blue chrome removed); solid `#171717`
- `active-border-mask.png` — tintable blue chrome mask, filled with `--league-primary`
- `active-background.png` (3_active) — decorative plate accents (also used for scoreboard score panels)
- `active-stat-labels.png` (4_active — Goals / Shots / Saves / Assist)

On the 1920 × 1080 canvas the strip is scaled to **970 × 151.5625** and pinned at **top 930**, with slot `left` offset so plate chrome (native x 108) aligns with scoreboard chrome (native x 89 @ 1000 scale). Native coordinates stay in 1920 × 300 space.

Layout notes:

- Name plate tint from `targetPlayer.team` (live TeamNum 0=Blue / 1=Orange) via `resolveRocketLeagueLiveTeamColor` → Left/Right Match color after `flipSides` (Left is always Blue, Right always Orange; default Blue→teamOne/home, Orange→teamTwo/away; swapped Blue→teamTwo/away, Orange→teamOne/home) at native `117, 119, 350 × 75` (CSS layer above `active-border-fill.png` so the team color stays visible); name text uses `readableText` (`#FFFFFF` or `#171717`) against that fill
- Boost bar across the full plate interior (`1661 × 12` at `117, 182`), fill `#fefe13` (not team-tinted)
- Stat values right-aligned in the gaps immediately left of each icon group in `active-stat-labels.png` (icon left edges ≈ `556 / 885 / 1202 / 1550`), vertically aligned to the label band `y 131–169`

Preview data comes from the Rocket League **Debug** tab:

1. Enable debug (`debugActivePlayerEnabled`)
2. Select a scenario (`debugActivePlayerScenario`)

Scenario ids: `skyljn3`, `long-name`, `team-two`, `high-stats`, `empty-boost`, `full-boost`. When debug is off, live fields come from the **Rocket League Game Data API** (Stats API) via the local JSON writer.

## Live Game Data API

Official August 2026 Game Data API (`MatchStatsExporter_TA`). Docs: https://www.rocketleague.com/developer/stats-api

Enable before launching Rocket League by editing `TAGame\Config\TAStatsAPI.ini` or `DefaultStatsAPI.ini`:

```ini
[TAGame.MatchStatsExporter_TA]
PacketSendRate=30
Port=49123
WebPort=49124
```

The writer connects to TCP `127.0.0.1:49123` first (brace-delimited JSON; `Data` is often a stringified JSON blob), then falls back to WebSocket `ws://127.0.0.1:49124`. Override with `ROCKET_LEAGUE_STATS_WS_URL`, `ROCKET_LEAGUE_STATS_TCP_HOST`, and `ROCKET_LEAGUE_STATS_TCP_PORT` if needed.

The workspace **Live data** monitor expands these INI steps inline while the API is disconnected and offers a **Retry connection** action (`POST /api/live-data/refresh`) that drops the current socket and reconnects immediately instead of waiting out reconnect backoff.

### Broadcast setup commands (outbound)

When **Auto broadcast camera** is enabled (default), the writer sends Stats API commands on the same socket:

| When | Commands |
| --- | --- |
| Lobby (`MatchCreated`) | `ChangePOV` `{ Perspective: "Camera_Director" }` only (native UI still visible) |
| Countdown start (`MatchInitialized` / `CountdownBegin`, or `hasGame` rising edge; `RoundStarted` fallback) | `SetHUDVisibility` `{ bVisible: false }` + Director cam (retried once after ~1.5s). Full hide — Stats API has no partial H-key mode |
| Match end (`MatchEnded` / `MatchDestroyed`) | `SetHUDVisibility` `{ bVisible: true }` |
| Operator **Admin control** → **Pause match** / **Resume match** | `SetMatchPaused` `{ bPaused: true/false }` via `POST /api/rocket-league/match-paused`. Waits briefly for `MatchPaused` / `MatchUnpaused`. Usually requires this RL client to be **match admin/host**, not spectator-only. |

Requires the RL client to be **spectating**. Manual fallback remains: press **9**, then **H** twice.

Live fields merged into the overlay package when Debug is off (identity graphics stay on Match 1 / Team Info / league colors — never from the Game Data API):

- Scoreboard clock (`TimeSeconds`), overtime pill above the clock when `bOvertime` / `game.isOT`, in-game scores
- Active player card from spectated target (`Boost` is spectator-scoped)
- Corner activities from `StatfeedEvent` / `GoalScored` (suppressed while `bReplay` / `game.isReplay` — rail clears when replay starts)
- Replay indicator from `bReplay` → `game.isReplay` (fixed stage chip left of activities, vertically aligned with the scoreboard clock; Debug **Replay** toggle previews it)
- Replay scorer info card (`replayCard`): center-stage Goal Replay plate (not in the activity rail). Scorer + optional assister + match totals (`Goals` / `Assists` / `Saves` / `Shots` / `Score`) + ball speed MPH from `GoalScored.GoalSpeed` (UU/s → MPH when raw ≥ 250). Shown while `isReplay` is true and cleared shortly after replay ends. Team color + logo via `resolveRocketLeagueLiveTeamColor` / side teams + `StableLogo`.
- Goal/Assist rail toasts fire once from the first `GoalScored`; they are cleared when replay starts, and a duplicate `GoalScored` during/after replay (or through the next `RoundStarted`) does not re-toast the same goal.

Team names, logos, logo backgrounds, team colors, league chrome, series pills, header, and sponsors are operator-tool only.

## VS matchup overlay (`/overlays/rocket-league/vs`)

Dedicated OBS browser source for the full-frame **VS** matchup. It polls Match 1 Rocket League overlay state (`/api/overlays/rocket-league`) — not gated by live `hasGame`.

The live scoreboard route (`/overlays/rocket-league`) still shows this same scene automatically when the feed reports no active match (`hasGame` false): before the first live state, after a winner (`bHasWinner` / podium / `MatchEnded` / `MatchDestroyed`), and on the next-match / empty-lobby screen (`MatchCreated` or `UpdateState` with no players) until the **3-2-1 countdown** (`MatchInitialized` / `CountdownBegin`). `RoundStarted` (kickoff) is only a fallback if those countdown events are missed. Clear in-game evidence (running clock under 5:00, a score, ball movement, or replay) also dismisses VS. Once countdown has started, a blank `Players[]` UpdateState must not bring VS back. Gameplay ↔ Stats / VS uses a **500ms opacity crossfade** (`.sceneLayerEntering` / `.sceneLayerExiting`) in both directions, including manual scene changes. The outgoing gameplay clock, player, replay, and activity data remain visible until its fade finishes. Reduced-motion preferences skip scene animations and remove the outgoing scene immediately.

| Element | Notes |
| --- | --- |
| Diagonal wedges | Clip-path corner-to-corner **top-left → bottom-right**. Each wedge holds a full-stage logo bleed + 50% team-color wash. |
| Logo bleed | Plate under wash; logos sit **above** the wash (`z-index: 2`). Same ~75% stage hitbox; anchors share VS midline (`top: 50%`): left **25%**, right **75%**. |
| Color wash | Team-color **gradient** via `--lobby-vs-wash` (soft near VS → stronger at outer corner). Left fades to bottom-left; right to top-right. |
| Seam | `#171717` strip (~10px) rotated with `atan(-1920 / 1080)` on that same diagonal |
| Corner clusters | Name + standing + series pills — left bottom-left, right top-right (`readableText` / `seriesPillColor`) |
| Center mark | Compact `#171717` plate, white **VS**, Orbitron 800 |
| Sponsor box | Same `380×164` plate and bottom height as in-game; **horizontally centered** (`.sponsorCard`) |

Shared markup/styles live under `app/overlays/vs/` (`VsMatchupStage`). VALORANT uses the same graphic at `/overlays/valorant/vs` (always-on dedicated feed only).

Operator: Browser overlay tab → **VS matchup URL** (Copy / Open). Debug: turn **Has game** off to preview lobby VS on the live scoreboard overlay.

## Upper-right (activities + replay badge)

| Element | Notes |
| --- | --- |
| Activity rail (`.upperRightRail`) | `top/right: 16px`, width `220px` — activity toasts only |
| Replay badge (`.replayIndicator`) | Separate absolute stage chip — **not** inside `.upperRightRail`. `right: 276px` (16 + 220 + **40px gap**). Plate sized to match clock’s **on-stage** type: `width/height/padding` = native `360×80` / `10 30 10 26` × `(1000/1920)` → ≈ **187.5×41.67px**, padding ≈ **5.21 / 15.63 / 5.21 / 13.54**. Vertical: badge center matches rendered `.clockValue` optical center (scaled clockSlot mid Y + `translateY(-0.03em)` at 60px × scale) — `top: calc(... - (80px * 1000 / 1920) / 2)` ≈ **79.01px**. Plate `#171717`, Orbitron `calc(60px * 1000 / 1920)` ≈ **31.25px** (clock stays **60px** in native scoreboard space), `4px` right accent (league secondary); enter 300ms / exit 260ms with restrained opacity breathe. |
| Goal Replay card (`.replayScorerSlot` + `.replayScorerCard`) | Center stage, **outside** `.upperRightRail`. Slot: `top: 75%; left: 50%; transform: translate(-50%, -50%)` (card geometric center at lower-half midpoint / y≈810). Card `560×156` plate `#171717`, left team-accent bar, logo tile + team-color name band, header `Goal Replay`, optional `SPEED ## MPH` from `ballSpeedMph`, G/A/SV/SH/SCR row. Enter/exit on the inner card only (`translateY`) so slot centering stays intact. Clears active player (~top 930): bottom edge ≈ 888. |

Debug override still drives the same fields for graphics preview without the game (Debug **Replay** synthesizes a sample scorer card from the target player when none is set, including sample ball speed). Full roster totals for the post-match stats board are snapshotted into `matchTeamStats` on the winner rising edge (see below).

## Post-match team stats (`/overlays/rocket-league/stats`)

Source: `assets/rocket-league/Post Match Team.psd` (1920 × 1080 Aftermatch panel).

Dedicated OBS browser source for the **team totals** board. It polls Match 1 Rocket League overlay state (`/api/overlays/rocket-league`).

The live scoreboard route (`/overlays/rocket-league`) can show this same graphic in the lobby (`!hasGame`) when the operator toggle **Lobby scene: Post-match stats** sets `lobbyScene` to `"stats"` (default remains `"vs"`).

Geometry is exported from the PSD into `public/rocket-league-overlay/post-match/`. `chrome.png` contains the exact static result bodies and stat rows. Separate PSD-derived masks own the league border, result accents, name plates, dividers, and BO series box. The browser stage only swaps **live text** and **tint colors** onto those layers — layout boxes stay native PSD coordinates.

| Element | Notes |
| --- | --- |
| Outer frame | Isolated `border-mask.png` tinted `--league-primary`; canvas background is transparent unless **Stats scene: team background** is enabled |
| Team background | Optional VS-style diagonal split: logo bleeds, team-color wash, `#171717` seam, then a heavy `#171717` dim layer before the stats graphic |
| Result pill bodies | `result-body-mask.png` tinted overlay navy `#171717` |
| VS / game score / VICTORY\|LOSS text | Orbitron at PSD text bboxes; standardized white |
| Result pill top bars + name plates + vertical dividers | Masks tinted `--team-one` / `--team-two`; name text via `readableText` |
| Static chrome | `chrome.png` rendered directly from the PSD stat-row layers |
| Center BO chip | `series-box-mask.png` tinted overlay navy `#171717`; `BO n` comes from `bestOf`, and series score comes from left/right `seriesScore` |
| Stat rows | PSD chrome + Oxanium Bold labels/values at PSD bboxes (Goals, Assists, Shots, Saves, Demos, Ball Touches) from `matchTeamStats` |

`matchTeamStats` is built from Stats API `Players[]` (`Goals`, `Assists`, `Shots`, `Saves`, `Demos`, `Touches`) on the first populated winner update for each completed game. The snapshot stays visible through post-match, the next lobby, countdown, and live play until the next completed game's totals replace it. If the winner update has no players, the previous snapshot stays visible until that game's populated winner update arrives. Later departures and duplicate updates cannot change captured totals. Both the dedicated Stats URL and Stats on the main Scoreboard URL use this snapshot.

Game completion is tracked separately from the post-match scene latch, so `MatchEnded`, `PodiumStart`, or `MatchDestroyed` arriving before the winner update cannot reuse the previous game's result ID. Each game receives a distinct ID for stats capture and live result proposal/auto-acceptance, including consecutive games with identical scores. Debug with **Has game** off (or **Has winner** on) synthesizes sample totals for preview.

Operator: Browser overlay tab → **Post-match stats URL** (Copy / Open), the lobby scene toggle, and **Stats scene: team background**.

Regenerate overlay assets with:

```bash
python scripts/export-rl-scoreboard-layers.py
python scripts/export-rl-post-match-layers.py
```
