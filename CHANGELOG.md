# Changelog

All notable changes to Typeshelf are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-11-06

First public release.

### Font library
- Indexes Windows fonts, your installed fonts and any folders you add (TTF, OTF, TTC, OTC, WOFF, WOFF2) in the background, with a cache so later starts are almost instant.
- Activate and deactivate fonts for your Windows account without admin rights, permanently or until Typeshelf quits.
- Live reload: when an active font file changes in a watched folder, apps see the new version straight away.
- Search ranks families whose name matches before ones that only match on designer or PostScript names.
- Filters by category, variable fonts, monospace and language support, including Sinhala and Tamil.
- Favourites, colour-coded collections and side-by-side comparison.
- Library health: duplicate and conflicting fonts, unreadable files, disk usage.

### Google Fonts and Fontshare
- Browse and install from both catalogues, variable or static.
- Installed families update themselves in the background, with validation before the swap, automatic rollback on failure and one-click manual rollback.
- Uses the official Google Fonts Developer API.

### Font details
- Type tester with variable-axis sliders, OpenType features, tracking, line height and a waterfall view.
- Glyph browser with search and copy, font info, and an `@font-face` CSS generator.

### App
- Updates itself from GitHub Releases, with **Restart to update** in Settings → About.
- Tray icon, launch at login, light and dark themes.
- Uninstalling asks whether to turn off the fonts Typeshelf activated. Files that another app still has open are deleted the next time Typeshelf starts.
- Settings → About: report a problem on GitHub, open the log folder, newsletter sign-up.
