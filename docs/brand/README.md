# App icon (POMO-83)

Motif: the day path («Tagesweg») — rounds as stations on the way to the day's goal (gold dot). No tomato and no timer ring (trademark report POMO-33).

| Source | Output in `public/icons/` |
| --- | --- |
| `icon.svg` (rounded plate) | `icon-192.png`, `icon-512.png`, `favicon.svg` (copy), `favicon-32.png` |
| `icon-full.svg` (square, iOS rounds it) | `apple-touch-icon.png` (180) |
| `icon-maskable.svg` (motif in the 80 % safe zone) | `maskable-512.png` |

Rendered with headless Chrome (`--screenshot`, transparent background). After editing `icon.svg`, regenerate `icon-full.svg` (rx 0) and `icon-maskable.svg` (motif scaled 0.8 around the centre) and re-render all PNGs.
