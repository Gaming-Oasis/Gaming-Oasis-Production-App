# Rocket League overlay PSD map

Sources:

- `assets/rocket-league/NEL Scoreboard.psd`
- SEL/NEL HUD reference `header_top.png` (1920 × 300 strip)
- Freddymac active-player assets `1_active` / `3_active` / `4_active` (1920 × 300)

The browser overlay keeps the PSD/header geometry and tints color regions with CSS masks so league primary/secondary, team colors, and Team Info logo backgrounds update live.

| Browser layer | Asset / source | Native bounds (within 1920 × 300 strip) |
| --- | --- | --- |
| Secondary fill | Solid `#0E1520` overlay navy via `secondary-mask.png` | Rectangular score boxes only |
| Sponsor box | Solid `#0E1520` overlay navy (same token as score / player plates) | Bottom-right `380 × 164`, bottom-aligned with active player slot |
| Logo fills | `logo-one-mask.png` / `logo-two-mask.png` | 97–238 / 832–971 × 99–234 |
| Name fills | CSS `--team-one` / `--team-two` | 238–707 / 971–1441 × 99–234 |
| Primary fill | `primary-mask.png` | Frame / top bar / end cap (above fills) |
| Header text | `overlay.header` (`--header-text`) | 110, 54, 1090, 99 |
| Team stacks | name + series pills | 238 / 971 × 99–234 |
| Series pills | CSS `--league-secondary` | Under each team name; count = `winsNeeded` |
| Score labels/values | text (`--score-text`) | 707 / 1440 × 99–234 |

Layer order: secondary / logo bg / name fills → primary border → logos → text & pills (highest).

On the fixed 1920 × 1080 canvas, the strip is scaled to **1000 × 156.25** and pinned to the **upper left** `(0, 0)` — matching the SEL/NEL HUD (`width: 1000px` on the 1920 × 300 asset). Internal layer coordinates stay in native 1920 × 300 space.

## Active player card

Sources in `public/rocket-league-overlay/nel/`:

- `active-border-fill.png` — dark plate fill from `1_active` (blue chrome removed)
- `active-border-mask.png` — tintable blue chrome mask, filled with `--league-primary`
- `active-background.png` (3_active) — navy decorative plate (also used for scoreboard score panels)
- `active-stat-labels.png` (4_active — Goals / Shots / Saves / Assist)

On the 1920 × 1080 canvas the strip is scaled to **970 × 151.5625** and pinned at **`(0, 930)`** (SEL selected-player geometry). Native coordinates stay in 1920 × 300 space.

Layout notes:

- Name plate tint from `targetPlayer.team` → Match 1 `teamOne` / `teamTwo` color at native `117, 119, 350 × 75`
- Boost bar across the full plate interior (`1661 × 12` at `117, 182`)
- Stat values right-aligned in the gaps immediately left of each icon group in `active-stat-labels.png` (icon left edges ≈ `556 / 885 / 1202 / 1550`), vertically aligned to the label band `y 131–169`

Preview data comes from the Rocket League **Debug** tab:

1. Enable debug (`debugActivePlayerEnabled`)
2. Select a scenario (`debugActivePlayerScenario`)

Scenario ids: `skyljn3`, `long-name`, `team-two`, `high-stats`, `empty-boost`, `full-boost`. When debug is off, `targetPlayer` stays `null`. Live SOS feed is not wired yet.

Regenerate scoreboard masks with:

```bash
python scripts/export-rl-scoreboard-layers.py
```
