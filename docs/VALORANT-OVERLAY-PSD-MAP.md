# VALORANT overlay PSD map

Source: `assets/valorant/Valorant Game Overlay Master.psd`

The browser overlay uses the PSD's rendered alpha edges as masks so the live shapes match the master at native 1920 × 1080 resolution.

Colors: see **Browser overlays color scheme** in [`GAMING-OASIS-TOOL-BRAND-GUIDE.md`](./GAMING-OASIS-TOOL-BRAND-GUIDE.md). Map-widget bases and the decider slot use plate `#171717`; team / league colors stay live from Match 1.

| Browser layer | PSD layer | Native bounds |
| --- | --- | --- |
| Center rail | Layer 2 copy | 0, 0, 1920, 39 |
| Left team panel | Layer 3 | 0, 0, 409, 49 |
| Right team panel | Layer 3 copy | 1511, 0, 1920, 49 |
| Left series score | Layer 8 | 744, 0, 845, 28 |
| Right series score | Layer 7 | 1075, 0, 1176, 28 |
| Left logo box | Layer 5 | 0, 0, 50, 49 |
| Right logo box | Layer 5 copy | 1870, 0, 1920, 49 |

Text placement follows the PSD text bounds. Team standings are the only added text layer and occupy the unused inner corner of each team panel.
