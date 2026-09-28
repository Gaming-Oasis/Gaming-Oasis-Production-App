# League overlay artwork

The files in `assets/league-of-legends` are the supplied originals. Their SHA-256 hashes and extracted layer rectangles are recorded in `lib/league-overlay-layout.json`. Pick/Ban and Scoreboard read these coordinates directly. Pick slots apply the equal-spacing adjustment described below; other artwork keeps its source placement.

## Placement

| Artwork | Source canvas | Browser treatment |
| --- | --- | --- |
| PickBan Overlay.psd | 1920 × 1080 | Preserve source dimensions and internal card offsets, with evenly spaced pick slots on each side. |
| Score Overlay.psd | 1225 × 713 | Scale the entire scene uniformly by 1920/1225; preserve the top-bar position and upper-left timers. Clip at the 1080-pixel broadcast canvas. |
| scoreboard icons.ai | Vector source | Use the icons' rasterization from their placed PSD layers, preserving the supplied silhouette and padding. |

The browser canvas scales proportionally to smaller sources. A wider viewport centers the complete 16:9 scene horizontally. Empty canvas space stays transparent.

At the operator's request, the five pick slots on each side now have uniform 7-pixel gaps. Portraits remain 153 × 274, with 7-pixel outer margins and a 320-pixel center opening. Each complete card moves together, preserving the name strip, role plate, and role icon alignment. The center match information, sponsor, and bans keep their existing positions. The extracted manifest retains the original PSD coordinates for provenance.

Series indicators use rounded CSS pills with outlined empty states and solid filled states, matching Rocket League. Bo3 and Bo5 retain their separate source geometries; Bo1 uses the first Bo3 marker on each side. The scoreboard retains four dragon slots per side.

Text uses locally bundled Oxanium Regular and ExtraBold, matching the PSD typefaces. Visible glyph bounds align to the artwork's text positions, and longer values shrink within reserved space. The font's OFL license ships alongside it; the font comes from the official [Google Fonts Oxanium source](https://github.com/google/fonts/tree/main/ofl/oxanium).

The draft uses a flat `#171717` background. Decorative source texture and diagonal trim remain in the extracted assets but are not rendered. Each role and objective icon uses its placed PSD alpha silhouette, preserving fractional edge coverage while rendering in white or the shared readable contrast color.

## Live content

Draft rules offer **Tournament** (split bans and picks), **Standard** (ten bans followed by 1-2-2-2-2-1 picks), and **Global fearless** (tournament order with series history restrictions). Standard's simultaneous online bans are recorded sequentially in the operator tool; opposing teams may record the same ban. Reset an active draft before changing formats. The legacy persisted `standard` key still denotes Tournament; `online` denotes the new Standard option, preserving older saved drafts.

Sample champions, logos, scores, sponsor text, and gray preview backgrounds are excluded. The geometry stays fixed while live Match 1 branding and champion selections replace samples. Plates use the required `#171717`; name, role, timer, and lower-scoreboard translucent plates use the Rocket League stats screen's 80% charcoal treatment. Shared contrast helpers can choose a white logo plate for legibility.

The Scoreboard places team logos in 62 × 62 square fields attached to its outer left and right ends, spanning both rows. Each logo uses a 6-pixel inset, proportional containment, stable image loading, and the shared white/charcoal logo-background resolver. Team-color fills extend through the former inset logo slots. The sample center league logo is replaced with a compact `VS`, while the game clock remains centered beneath the kill scores. These logo placements intentionally extend the source geometry.

Header, game number, and team names occupy the source's open center area. The sponsor carousel occupies its original 316 × 64 rectangle at (802, 1009). Counts appear beside their source icons. The far-corner slots (named inhibitor in the original extraction) show Void Grubs; the second icons show Baron, and the inner icons show Dragons. Grubs and Baron use operator-entered counts; Dragons use four fixed elemental-type dropdowns per team, with unavailable API choices greyed out. Each selection updates its source slot and the count. Recording the fourth dragon automatically emphasizes that slot with a 20 × 20 diamond frame and the selected Soul icon, replacing the separate Soul marker. The frame stays centerlined in the 21-pixel lower row, mirrors with its team, and shifts four pixels outward to clear the adjacent icon. The first three captured dragon icons remain visible. The numeric dragon count is omitted from the scoreboard. Soul state and type derive from the fourth recorded dragon; obsolete saved toggle values are ignored. Setting the fourth slot to Not taken clears Soul, and editing its type updates the Soul icon. Empty slots preserve the other selections and do not contribute to the count. Elemental icons are centered in 17 × 17 slots for readability, and the same symbols appear next to the operator's dragon selectors. Kills and Towers offer Manual / API. The center clock offers Disabled / API. Gold offers Disabled / API with API greyed out, so no gold icon or value is displayed. Hide Scoreboard and Hide Countdowns both default to enabled; the sponsor remains independently controlled. Revealed respawn timers and stale API values use em dashes, while manual counts remain visible through outages. These live additions are intentional differences from the static sample artwork.

Active Elder replaces the former Soul tab: an 82 × 23 charcoal tab below the owning team's dragon group with an Elder icon, 2:30 countdown, and team-color top accent. Its top edge joins the scoreboard at source y=90 and the lower corners are chamfered. It disappears at zero or when the operator switches Elder off. Existing Soul settings do not activate Elder; the two states remain independent.

Active Baron uses a matching 82 × 23 tab at source y=90, centered below its team's Baron icon and count. The tab has the same charcoal plate and chamfered lower corners as Elder, with the approved Accent Purple `#713060` on the Baron icons and top accent. Its white countdown starts at 3:00 and disappears at zero. Both buffs persist an expiry to keep elapsed time consistent through reloads, API outages, and side swaps. Their activation is separate from manual objective counts and the upper-left respawn timer visibility control. Baron and Elder may run simultaneously.

The sponsor area uses the same treatment as the other overlays: a `#171717` matte card, three-pixel live league-color accent, white 16-pixel bold uppercase labels, and proportional logo containment. It keeps the Pick/Ban artwork's original 316 × 64 center position and the shared rotation/retry behavior. Draft logos that resolve to a dark plate reuse the existing dark background for a continuous matte plate; logos needing a white contrast plate retain it.

## Regeneration and checks

Run `python scripts/export-league-overlay-layers.py` with Pillow and psd-tools available in a development environment. These are asset-extraction tools, not application runtime dependencies. This regenerates the layout manifest and source masks without altering the originals.

`tests/league-overlay-layout.test.mjs` independently reads the PSD binary layer records and checks the manifest rectangles against them. It also checks source hashes and every series mask's native dimensions. Run `npm run check` for these checks plus the complete application suite.

The source-alignment comparison used temporary sample assets extracted from the originals, then measured the rendered element bounds at 1920 × 1080 and 1280 × 720. Before the requested equal-spacing adjustment, Pick/Ban matched at native resolution with no coordinate error; the largest scaled-coordinate difference across both scenes was below 0.001 pixel (browser floating-point rounding). Pick slots now use the uniform spacing specified above. These are geometry checks, not a claim that dynamic branding and browser font rasterization are pixel-identical to the Photoshop preview.

Dragon symbols are bundled locally as `public/league-of-legends-overlay/dragon-{type}.png` from [Riot game scoreboard assets distributed by CommunityDragon](https://raw.communitydragon.org/latest/game/assets/ux/scoreboard/) (retrieved 2026-09-27). Cloud, Mountain, Infernal, Ocean, Hextech, Chemtech, and Elder use the corresponding `_{type}drake.png` source. The original 64 × 64 files are unchanged; an SVG luminance mask renders their symbols in the shared white icon treatment. Elder remains excluded from elemental selections and Soul types. No runtime network lookup is needed.
