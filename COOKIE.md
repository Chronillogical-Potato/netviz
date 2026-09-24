# Cookie offline policy — netviz

Fleet fork of ShadowArcanist/netviz for Chronillogical-Potato / Cookie Monster.

## Hard policy

- No Google Fonts / jsDelivr at runtime.
- Fonts live in `public/fonts/` (Vite serves as `/fonts/...`).
- See `public/MANIFEST.json` + `public/fonts.sha256` (fleet pointer: `/workspace/cookie-viz-assets/MANIFEST.json`).

## Fonts

| File | Family | Use |
|------|--------|-----|
| `FiraCodeNerdFontPropo-Retina.ttf` | `Fira Code Nerd Font Propo` | GUI / body (replaces Inter) |
| `FiraCodeNerdFontMono-Retina.ttf` | `Fira Code Nerd Font Mono` | mono / grid |
| `GeistPixel-Line.otf` | `Geist Pixel Line` | titles/headers only — own structural container (`.cookie-title` / `header.cookie-title-block`) |

`index.html` embeds `@font-face`; `src/index.css` body stack uses Propo.

## Build note

HTML/CSS font patch is the deliverable. Full `vite` production build may be skipped if deps are heavy — run when convenient on a maintainer machine; offline font policy does not require a successful build to land.
