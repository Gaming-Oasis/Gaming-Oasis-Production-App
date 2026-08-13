# Gaming Oasis Production OS - Agent Instructions

## Required references

Before changing this product, read:

- `docs/GAMING-OASIS-TOOL-BRAND-GUIDE.md`
- `docs/AI-DEVELOPMENT-GUIDE.md`
- `README.md`

The live human brand source is https://gamingoasis.gg/brand. The local Gaming Oasis website and League Hub repositories are reference implementations when available.

## Non-negotiable product rules

- This is a production operator tool. Optimize for speed, clarity, and reliability.
- Use the exact Gaming Oasis tokens and official assets. Do not invent colors or logo treatments.
- Overlay plate navy is `#0E1520` (score panels, player card, sponsor boxes, map-widget bases). Do not use `#191919` or other invented near-blacks for those fills.
- Keep the UI matte, flat, compact, and structured. Avoid gradients, glows, glass effects, oversized hero sections, decorative charts, and excessive pills.
- Use the system UI font for operational copy. Limit Oxanium to brand lockups and restrained product labels.
- Draw Show stays behind `drawShowEnabled` and defaults to disabled.
- API keys stay in local application state and never enter exported files.
- Preserve the legacy JSON filenames and field shapes.
- Every data change must continue to write the complete six-file package to `JSONs` through the live local writer.
- Keep manual export as a recovery path.
- Keep the application easy to run through `Run Gaming Oasis Production OS.bat` and `npm run dev`.

## Change discipline

- Reuse existing layout and control patterns before introducing a new one.
- Use direct operator language and visible text labels.
- Do not add speculative features or dependencies.
- Preserve accessibility, responsive behavior, local persistence, and status feedback.
- Run `npm test` before handoff.
