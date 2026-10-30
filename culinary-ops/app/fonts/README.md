# Bundled fonts

The workspace and printed culinary packets use these checked-in WOFF2 assets
through `next/font/local`. Builds must not fetch Google Fonts: its occasional
extensionless font URLs trigger the Next.js 16.2.7 parser failure reported in
[vercel/next.js#99114](https://github.com/vercel/next.js/issues/99114).

These are the Latin subsets used by the application, downloaded from Google
Fonts on October 29, 2026. The existing CSS variable names, font families,
weight ranges, and normal/italic selections are retained.

| Family | Weights | Styles | License |
| --- | --- | --- | --- |
| Playfair Display | 400–700 | Normal, italic | [OFL](playfair-display-OFL.txt) |
| Inter | 100–900 | Normal | [OFL](inter-OFL.txt) |
| IBM Plex Mono | 400, 500, 600 | Normal | [OFL](ibm-plex-mono-OFL.txt) |
| Cormorant Garamond | 400–700 | Normal, italic | [OFL](cormorant-garamond-OFL.txt) |
| JetBrains Mono | 400–600 | Normal | [OFL](jetbrains-mono-OFL.txt) |

`sources.json` records each stylesheet URL, asset URL, SHA-256 hash, and license
source. When updating a font, replace its asset and provenance entry together,
retain the license, and verify `npm run build` without network access. The nine
font assets total approximately 258 KiB.
