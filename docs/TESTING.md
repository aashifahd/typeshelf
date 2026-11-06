# Testing Typeshelf

## What runs automatically

Every push to `main` and every pull request runs on GitHub's Windows machines:

| Check | What it covers |
| --- | --- |
| Typecheck | Main process, preload, window and tests |
| Unit tests (`npm test`) | Family grouping, filters, search ranking, provider file selection, version comparison, links; parsing every font on the machine; extracting a face from a TTC |
| Live API test | The real Google Fonts Developer API: catalogue fields, variable and static downloads |
| Licence check | Every shipped package has a GPL-compatible licence and `THIRD_PARTY_NOTICES.md` is current |
| Installer build | `Typeshelf-Setup-<version>.exe`, downloadable from the run's page |
| End-to-end tests (`npm run test:e2e`) | The real app, driven by Playwright (list below) |

End-to-end tests launch the built app with a temporary data folder, so a developer's own Typeshelf data isn't touched:

- **Library:**
  - The app starts and lists installed fonts.
  - Search narrows the list and puts name matches first.
  - Every tab of a family's detail view renders.
  - Favourites work, with no errors in the window.
- **Activation:**
  - Adding a folder finds its fonts.
  - Activating writes the Windows registry entry and deactivating removes it.
  - Session activations are gone after quitting.
  - Removing a folder keeps the files.
- **Settings:** the theme choice survives a restart.
- **Google Fonts:**
  - A family installs from the catalogue.
  - An out-of-date family updates itself shortly after launch.
  - Rollback restores the old version and pauses updates.
  - Uninstalling works (CI only).
- **Uninstaller:** `--deactivate-all-fonts` turns off every Typeshelf font (CI only, because it would also turn off a developer's own fonts).

Run them locally with `npm run test:e2e`. They briefly activate the bundled test font (Silkscreen, OFL) on your PC and always clean up.

## Manual checklist (each release candidate)

Use the installer from the CI run, on your own PC first.

**Install**
- [ ] SmartScreen shows "Windows protected your PC" (until signed); **More info → Run anyway** works.
- [ ] The installer asks for no admin rights, lets you choose the folder, and shows "Made by CenoDigital" on the last page. The link opens cenodigital.com.
- [ ] The app starts from the last page, the Start menu and the desktop shortcut.

**First run**
- [ ] The window opens without a blank flash; the font list fills within a few seconds.
- [ ] Light, dark and "Match Windows" themes all look right; the title bar buttons match the theme.

**Everyday use**
- [ ] Activate a font, then use it in Word or Photoshop without restarting them.
- [ ] Restart Windows: permanent fonts are still active, session fonts are gone.
- [ ] Install a Google font and a Fontshare font; both appear under Library folders and can be activated.
- [ ] Type tester: variable sliders move smoothly, OpenType features toggle, waterfall view is readable.
- [ ] Glyphs: search by name, character and `U+` code; copy works.
- [ ] Collections: create, add and remove families, turn a whole collection on and off.
- [ ] Compare up to 6 families.
- [ ] Library health lists duplicates you know exist.

**Background behaviour**
- [ ] Closing the window keeps Typeshelf in the tray; the tray menu works; Quit really quits.
- [ ] "Launch at login" starts it hidden in the tray after signing out and in.
- [ ] Settings → About: Subscribe, Report, Log folder, Source code and Work with us each open the right place.

**Uninstall**
- [ ] Apps → Installed apps → Typeshelf → Uninstall asks whether to turn off Typeshelf's fonts.
- [ ] **Yes**: the fonts are gone from Word's font list. **No**: they keep working.

**App updates** (once releases are published in week 5)
- [ ] Install version N, publish N+1, and check that "Check for app updates" finds it and installs on quit, keeping activations.

## Clean-machine matrix

Windows 11 Home has no Windows Sandbox, so use [VirtualBox](https://www.virtualbox.org/) (free) with Windows ISOs from microsoft.com. An unactivated copy is fine for testing. Take a snapshot after setting up Windows so each run starts clean.

| Machine | Why |
| --- | --- |
| Windows 10 22H2, standard (non-admin) account | Oldest supported version; proves no admin rights are needed |
| Windows 11 24H2 or later | Current Windows |
| Username with Sinhala or Tamil letters (e.g. `ශ්‍රී`) | Non-English paths in `%APPDATA%` |
| Documents/Desktop redirected to OneDrive | Folders that sync or go offline |
| A library of 10,000+ fonts | Add the [google/fonts](https://github.com/google/fonts) repository download as a folder; check scan time and memory |
| No network, then a proxy | Offline catalogue cache, friendly errors |
| Display scaling 150% and 200% | Layout and title bar |

On each machine, run the **Install**, **Everyday use** and **Uninstall** sections above.

## Beta (weeks 3–4)

- **Who:** 20–50 designers and developers from CenoDigital's network, a mix of heavy font users and people new to font managers.
- **How they get it:**
  - The repository is private until launch, so share the CI installer through a Google Drive link.
  - Testers can't open GitHub issues on a private repository, so collect feedback through a short form instead.
  - The form should ask: what you tried, what broke, Windows version, and the `main.log` file from Settings → About → Log folder.
- **Length:** two weeks, with a reminder halfway through.
- **What to ask them to try:** the "Everyday use" section above, on their real font library.
- **Ready for public release when:**
  - No open crash or data-loss bugs.
  - No font is ever left stuck active or inactive.
  - Every tester could install, activate and uninstall without help.
  - The end-to-end tests pass on the release commit.
