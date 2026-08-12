# Rocket League overlay PSD map

Sources:

- `assets/rocket-league/NEL Scoreboard.psd`
- SEL/NEL HUD reference `header_top.png` (1920 × 300 strip)

The browser overlay keeps the PSD/header geometry and tints color regions with CSS masks so league primary/secondary, team colors, and Team Info logo backgrounds update live.

| Browser layer | Asset / source | Native bounds (within 1920 × 300 strip) |
| --- | --- | --- |
| Secondary fill | `public/rocket-league-overlay/nel/secondary-mask.png` | Rectangular score boxes only |
| Logo fills | `logo-one-mask.png` / `logo-two-mask.png` | 97–238 / 832–971 × 99–234 |
| Name fills | CSS `--team-one` / `--team-two` | 238–707 / 971–1441 × 99–234 |
| Primary fill | `primary-mask.png` | Frame / top bar / end cap (above fills) |
| Header text | `overlay.header` (`--header-text`) | 110, 54, 1090, 99 |
| Team stacks | name + series pills | 238 / 971 × 99–234 |
| Series pills | CSS `--league-secondary` | Under each team name; count = `winsNeeded` |
| Score labels/values | text (`--score-text`) | 707 / 1440 × 99–234 |

Layer order: secondary / logo bg / name fills → primary border → logos → text & pills (highest).

On the fixed 1920 × 1080 canvas, the strip is scaled to **1000 × 156.25** and pinned to the **upper left** `(0, 0)` — matching the SEL/NEL HUD (`width: 1000px` on the 1920 × 300 asset). Internal layer coordinates stay in native 1920 × 300 space.

Regenerate masks with:

```bash
python scripts/export-rl-scoreboard-layers.py
```
