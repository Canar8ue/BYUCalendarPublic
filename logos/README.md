# BYU Calendar — logo options

Generated September 15, 2026 from the app palette (ink #202124, blue #1a73e8, green #188038, purple #7627bb, orange #e8710a, teal #00796b, plus pale counterparts) and type system (Archivo display / Roboto UI / Roboto Mono labels). All text in SVGs is converted to outlines, so the files render identically without the fonts installed. Fonts are OFL-licensed (Google Fonts); copies live in `source/fonts/`.

Open **index.html** in a browser to review everything with a light/dark preview toggle.

| Family | What it is |
| --- | --- |
| A · Y-tile | **01** Y-tile — blue · **02** Y-tile — green · **03** Y-tile — purple · **04** Y-tile — orange · **05** Y-tile — teal · **06** Y-tile — solid blue · **07** Y-tile — mono · **08** Y-tile — dark mode |
| B · Y-date | **09** Y-date — blue · **10** Y-date — orange · **11** Y-date — green |
| C · Lettermark | **12** BC lettermark · **13** BYU lettermark |
| D · Event-dot Y | **14** Event-dot Y · **15** Event-dot Y — on card |
| E · One-calendar stack | **16** One-calendar stack |
| F · Wordmark | **17** Wordmark — two-tone · **18** Wordmark — dark mode · **19** Wordmark — caps + period · **20** Wordmark — terminal · **21** Wordmark — stacked |
| G · Lockup | **22** Horizontal lockup · **23** Horizontal lockup — dark · **24** Stacked lockup · **25** Stacked lockup — story mark · **26** Mono lockup |
| H · Emblem | **27** Badge emblem |
| I · Banner | **28** OG banner — product · **29** OG banner — centered · **30** Social header · **66** OG — Y left + stacked · **67** OG — centered (LIVE) · **68** OG — hollow Y left |
| J · Favicon | **31** Favicon — blue · **32** Favicon — blue + rings · **33** Favicon — ink · **34** Favicon — light · **35** Favicon — outline · **36** favicon.ico (multi-size) |
| K · App icon | **37** App icon — calendar card · **38** App icon — maskable · **39** App icon — light · **40** App icon — Apple touch |
| M · Big-Y glyph | **46** Big Y — ink field · **47** Big Y — blue field · **48** Big Y — orange field · **49** Big Y — teal field · **50** Big Y — hollow outline · **51** Big Y — split tone · **52** Big Y — gradient · **65** Big Y — blue fill |
| N · Constructed Y | **53** Capsule Y · **54** Event-bar Y · **55** Binder-ring Y · **56** Notification Y · **57** Grid Y |
| O · Playful Y | **58** Sticker Y · **59** Squiggle Y · **60** Tri-color capsule Y |
| P · Big-Y lockup | **61** Lockup — capsule Y + mono · **62** Lockup — “the unofficial one” · **63** Circle badge Y · **64** Lockup — capsule Y horizontal |
| L · 3D (Blender) | **41** 3D Y-tile — tilted · **42** 3D Y-tile — app icon · **43** 3D — one-calendar stack · **44** 3D wordmark · **45** 3D — event-cube Y |

## Folder map

- `svg/` — vector masters (transparent backgrounds unless noted)
- `png/marks` — 512 + 128 px exports of each mark
- `png/wordmarks`, `png/lockups` — 1600 px wide exports
- `png/emblem`, `png/banners` — badge, 1200×630 OG banners, 1500×500 header
- `favicons/` — 16/32/48 px PNGs per design + `favicon.ico` (16/32/48 multi-size)
- `app-icons/` — 180/192/512 app icons incl. maskable + Apple touch
- `3d/` — Blender 5.2 renders (Cycles, transparent film)
- `source/` — the generator scripts and fonts that produce everything here (reproducible)

## Regenerating

```powershell
# from source/ — needs the two npm packages from the original scratch install
npm install sharp opentype.js   # in this folder
node generate-logos.mjs         # writes ../svg + ../manifest.json
node rasterize-logos.mjs        # writes ../png, ../favicons, ../app-icons, favicon.ico
# 3D renders
blender -b -P blender-logos.py -- --scene=tiletilt   # tiletilt | appicon | stack | wordmark | cubey
```

Numbers are stable: telling me "I like 01, 22, and 44" maps directly to file names.
